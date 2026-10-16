/**
 * La importación (RF9–RF13, spec §5.2): login y lista, leer y clasificar cada contrato, topes, y
 * filas, contadores y escrituras. No escribe: devuelve un `apply` que el motor corre en una
 * transacción si no es simulación (DT3, RN35). Un contrato con problemas queda en su fila y la
 * corrida sigue (RN7, RN8); si falla la lista, falla la corrida (RN33).
 */

import type { DatabaseSync } from 'node:sqlite'

import type { ImportOutcome } from '../../shared/api-types.ts'
import { IMPORT_COUNTERS, IMPORT_SUMMARY, runSummary, type ImportCounter } from '../../shared/counters.ts'
import { addCivilDays } from '../../shared/dates.ts'
import { usd } from '../../shared/format.ts'
import { BillingError, type BillingClient } from '../billing/client.ts'
import { readContractList, readContractRows } from '../billing/readers.ts'
import { applyCaps, classifyContract, type Candidate, type ContractDecision, type ImportRules } from '../rules/import.ts'
import {
	existingCustomerKeys,
	importedExternalIds,
	insertCustomer,
	insertEvent,
	insertInvoice,
	invoiceNumber,
	updateCustomer,
	upsertContract,
	type CustomerWrite,
} from '../store/imports.ts'
import type { RunRowInput } from '../store/runs.ts'

/** Un problema que frena toda la corrida (RN33). */
export class RunFailure extends Error {}

/**
 * El error del administrador, contado por la corrida: como se ve desde Sincronización, si
 * rechazó las credenciales dice dónde corregirlas.
 */
export function runFailureFrom(error: BillingError): RunFailure {
	return new RunFailure(error.kind === 'credentials_rejected' ? `${error.message} Revísalos en Configuración.` : error.message)
}

export interface ImportSettings extends ImportRules {
	readonly providerName: string
	readonly graceDays: number
	readonly capInvoices: number
	readonly capAmountCents: number
}

export interface RunOutcome {
	readonly rows: RunRowInput[]
	readonly counters: Record<string, number>
	readonly warnings: string[]
	readonly technical: Record<string, number>
	readonly summary: string
	/** Las escrituras de una corrida real; el motor las corre en la transacción de cierre. */
	readonly apply: (runId: number, now: string) => void
}

const customerOf = (decision: ContractDecision): CustomerWrite | null =>
	decision.identification
		? {
			key: decision.identification.key,
			document: decision.identification.document,
			name: decision.contract.holderName,
			personType: decision.identification.personType,
			email: decision.contract.email,
			phone: decision.contract.phone,
		}
		: null

export async function runImport(input: {
	readonly client: BillingClient
	readonly db: DatabaseSync
	readonly settings: ImportSettings
	readonly currentPeriod: string
	readonly simulation: boolean
}): Promise<RunOutcome> {
	const { client, db, settings, currentPeriod, simulation } = input
	const counters = Object.fromEntries(IMPORT_COUNTERS.map(key => [key, 0])) as Record<ImportCounter, number>
	const add = (key: ImportCounter, amount = 1) => {
		counters[key] += amount
	}
	const rows: RunRowInput[] = []
	const warnings: string[] = []
	const technical: Record<string, number> = { successFalseWithData: 0 }

	// 1. Login y lista (RN33): si algo falla acá, se frena la corrida.
	let listBody: unknown
	try {
		listBody = await client.listContractIds()
	} catch (error) {
		if (error instanceof BillingError) throw runFailureFrom(error)
		throw error
	}
	const list = readContractList(listBody)
	if (!list.ok) throw new RunFailure(list.error.message)
	warnings.push(...list.value.warnings)
	if (list.value.technical.successFalseWithData) technical.successFalseWithData = (technical.successFalseWithData ?? 0) + 1

	// 2. RN38: lo ilegible de la lista queda a la vista para que lo revise una persona.
	for (const raw of list.value.unreadable) {
		add('unreadableListItems')
		rows.push({
			contractNumber: null, installmentId: null, customerKey: null, customerName: null, period: null, amountCents: null,
			outcome: 'unreadable_list_item',
			reason: `No se pudo leer este contrato en la lista del administrador («${JSON.stringify(raw)}»). Revísalo a mano en el administrador del ISP.`,
			detail: { raw },
		})
	}

	// 3. Cada contrato, por número.
	const imported = importedExternalIds(db)
	const decisions: ContractDecision[] = []
	for (const id of [...list.value.ids].sort((a, b) => a - b)) {
		add('contractsRead')
		let body: unknown
		try {
			body = await client.getContract(id)
		} catch (error) {
			if (!(error instanceof BillingError)) throw error
			add('lookupsFailed')
			rows.push({ contractNumber: id, installmentId: null, customerKey: null, customerName: null, period: null, amountCents: null, outcome: 'lookup_failed', reason: `No se pudo consultar el contrato: ${error.message}` })
			continue
		}
		const read = readContractRows(body, id, currentPeriod)
		if (!read.ok) {
			add('contractsInconsistent')
			rows.push({ contractNumber: id, installmentId: null, customerKey: null, customerName: null, period: null, amountCents: null, outcome: 'inconsistent_response', reason: read.error.message })
			continue
		}
		decisions.push(classifyContract(read.value, settings, { currentPeriod, imported }))
	}

	// 4. Topes de toda la corrida (RN20).
	const caps = applyCaps(decisions.flatMap(decision => decision.candidates), { invoices: settings.capInvoices, amountCents: settings.capAmountCents })

	// 5. Filas y contadores.
	const counted = new Set<string>()
	const rowFor = (decision: ContractDecision, outcome: ImportOutcome, reason: string, installment: Candidate['installment'] | null): RunRowInput => ({
		contractNumber: decision.contract.number,
		installmentId: installment?.id ?? null,
		customerKey: decision.identification?.key ?? null,
		customerName: decision.contract.holderName,
		period: installment?.period ?? null,
		outcome,
		reason,
		amountCents: installment?.amountCents ?? null,
		detail: installment ? { detail: installment.detail } : { identification: decision.contract.identification },
	})
	const COUNTER_OF: Partial<Record<ImportOutcome, ImportCounter>> = {
		already_imported: 'alreadyImported', excluded_status: 'excludedByStatus', excluded_doc_type: 'excludedByDocType',
		outside_window: 'outsideWindow', excluded_max: 'excludedByMax', residual: 'residual',
	}
	const PER_CONTRACT: Partial<Record<ImportOutcome, ImportCounter>> = {
		currency_not_usd: 'contractsCurrency', currency_incoherent: 'contractsCurrency', invalid_identification: 'contractsIdentification',
		unknown_status: 'contractsInconsistent', no_debt: 'contractsNoDebt',
	}
	for (const decision of decisions) {
		for (const row of decision.rows) {
			rows.push(rowFor(decision, row.outcome, row.reason, row.installment))
			const perInstallment = COUNTER_OF[row.outcome]
			if (perInstallment) add(perInstallment)
			const perContract = PER_CONTRACT[row.outcome]
			if (perContract && !counted.has(`${perContract}:${decision.contract.number}`)) {
				counted.add(`${perContract}:${decision.contract.number}`)
				add(perContract)
			}
		}
	}
	const decisionOf = (candidate: Candidate) => decisions.find(decision => decision.contract.number === candidate.contract.number)
	const blockedReason = `Frenada: la corrida llegó a su tope de ${settings.capInvoices} facturas o ${usd(settings.capAmountCents)} (Configuración).`
	for (const candidate of caps.blocked) {
		const decision = decisionOf(candidate)
		if (decision) rows.push(rowFor(decision, 'blocked_by_cap', blockedReason, candidate.installment))
		add('blockedByCap')
	}
	const existing = existingCustomerKeys(db)
	const newCustomers = new Set<string>()
	for (const candidate of caps.imported) {
		add('invoicesNew')
		add('amountNewCents', candidate.installment.amountCents)
		if (!existing.has(candidate.identification.key)) newCustomers.add(candidate.identification.key)
	}
	counters.customersNew = newCustomers.size
	// RN6: los clientes que ya existen se actualizan con el contrato leído.
	const updatedCustomers = new Set(decisions.flatMap(decision => (decision.identification && existing.has(decision.identification.key) ? [decision.identification.key] : [])))
	counters.customersUpdated = updatedCustomers.size

	// Las importadas van en orden de contrato con las demás; el número de factura lo pone apply.
	const importedRows = new Map<string, RunRowInput>()
	for (const candidate of caps.imported) {
		const decision = decisionOf(candidate)
		if (!decision) continue
		const row = rowFor(decision, 'imported', simulation ? 'Se crearía la factura.' : 'Factura creada.', candidate.installment)
		importedRows.set(candidate.installment.id, row)
		rows.push(row)
	}
	rows.sort((a, b) => (a.contractNumber ?? Number.MAX_SAFE_INTEGER) - (b.contractNumber ?? Number.MAX_SAFE_INTEGER) || (a.period ?? '').localeCompare(b.period ?? ''))

	const main = simulation ? IMPORT_SUMMARY.filter(key => key !== 'customersNew') : IMPORT_SUMMARY
	const summary = runSummary(counters, main, IMPORT_COUNTERS, simulation)

	const apply = (runId: number, now: string) => {
		// Contratos (RF13, D26, P8): todos los leídos con estado conocido.
		for (const decision of decisions) {
			if (decision.status === null) continue
			upsertContract(db, {
				number: decision.contract.number, customerKey: decision.identification?.key ?? null,
				holderName: decision.contract.holderName, status: decision.status, plan: decision.contract.plan,
				priceCents: decision.contract.priceCents, branch: decision.contract.branch,
			}, now)
		}
		// Clientes (RN4–RN6): datos del último contrato leído de cada titular.
		const lastData = new Map<string, CustomerWrite>()
		for (const decision of decisions) {
			const customer = customerOf(decision)
			if (customer) lastData.set(customer.key, customer)
		}
		for (const key of newCustomers) {
			const customer = lastData.get(key)
			if (!customer) continue
			insertCustomer(db, customer, settings.providerName, runId, now)
			const first = caps.imported.find(candidate => candidate.identification.key === key)
			insertEvent(db, { customerKey: key, kind: 'customer_created', invoiceId: null, runId, at: now, detail: { contractNumber: first?.contract.number ?? null } })
		}
		for (const key of updatedCustomers) {
			const customer = lastData.get(key)
			if (customer) updateCustomer(db, customer, now)
		}
		// Facturas (RN21, RN22, RN15: corte = vencimiento + días de gracia).
		for (const candidate of caps.imported) {
			const { installment } = candidate
			const invoiceId = insertInvoice(db, {
				externalId: installment.id, contractNumber: candidate.contract.number,
				customerKey: candidate.identification.key, period: installment.period, dueDate: installment.dueDate,
				cutDate: addCivilDays(installment.dueDate, settings.graceDays), amountCents: installment.amountCents,
			}, runId)
			const number = invoiceNumber(invoiceId)
			insertEvent(db, {
				customerKey: candidate.identification.key, kind: 'invoice_imported', invoiceId, runId, at: now,
				detail: { invoiceNumber: number, installmentId: installment.id, period: installment.period, detail: installment.detail },
			})
			const row = importedRows.get(installment.id)
			if (row) Object.assign(row, { reason: `Factura ${number} creada.`, detail: { ...row.detail, invoiceNumber: number } })
		}
	}

	return { rows, counters, warnings, technical, summary, apply }
}
