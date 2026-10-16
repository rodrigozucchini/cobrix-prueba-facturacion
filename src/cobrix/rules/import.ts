/**
 * Reglas de importación (spec §5.2), funciones puras: qué pasa con cada cuota, en el orden de la
 * spec, y los topes de toda la corrida. Lo que es del contrato (estado desconocido, sin deuda,
 * identificación inválida) da una fila por contrato (P7); lo demás, una por cuota. Las que pasan
 * todo son candidatas, y applyCaps decide cuáles se importan.
 */

import { CONTRACT_STATUSES, type ContractStatus, type DocType, type ImportOutcome, type ImportWindow } from '../../shared/api-types.ts'
import { addMonths } from '../../shared/dates.ts'
import { period as periodLabel, usd } from '../../shared/format.ts'
import type { ContractInfo, ContractRead, Installment } from '../billing/readers.ts'
import { normalizeIdentification, type Identification } from './identification.ts'

export interface ImportRules {
	readonly importStates: readonly ContractStatus[]
	readonly windowMonths: ImportWindow | null
	readonly maxRecent: number | null
	readonly excludedDocTypes: readonly DocType[]
}

export interface ImportContext {
	/** `YYYY-MM` de la fecha de trabajo. */
	readonly currentPeriod: string
	/** `deuda_id` de las cuotas que ya tienen factura en Cobrix (RN19). */
	readonly imported: ReadonlySet<string>
}

export interface DecisionRow {
	readonly outcome: ImportOutcome
	/** `null` si la fila es de todo el contrato. */
	readonly installment: Installment | null
	/** Para el operador. */
	readonly reason: string
}

export interface Candidate {
	readonly contract: ContractInfo
	readonly identification: Identification
	readonly installment: Installment
}

export interface ContractDecision {
	readonly contract: ContractInfo
	/** `null` si la identificación no es válida. */
	readonly identification: Identification | null
	/** Estado conocido, o `null` si no es uno de los seis (RN9). */
	readonly status: ContractStatus | null
	readonly rows: readonly DecisionRow[]
	readonly candidates: readonly Candidate[]
}

const byPeriod = (a: Installment, b: Installment) => a.period.localeCompare(b.period) || a.id.localeCompare(b.id)

function list(items: readonly string[]): string {
	if (items.length <= 1) return items.join('')
	return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}

export function classifyContract(read: ContractRead, rules: ImportRules, context: ImportContext): ContractDecision {
	const { contract } = read
	const status = CONTRACT_STATUSES.find(known => known === contract.status) ?? null
	const identification = normalizeIdentification(contract.identification)
	const decided = (rows: DecisionRow[]): ContractDecision => ({
		contract,
		identification: identification.ok ? identification.value : null,
		status,
		rows,
		candidates: [],
	})
	const whole = (outcome: ImportOutcome, reason: string) => decided([{ outcome, installment: null, reason }])

	// RN9: un estado desconocido nunca se adivina.
	if (status === null) {
		return whole('unknown_status', `El contrato está en un estado que Cobrix no conoce («${contract.status}»): no se adivina qué significa. Revísalo en el administrador del ISP.`)
	}
	// RN10
	if (read.kind === 'no_debt') return whole('no_debt', 'El contrato no debe nada.')
	// RN2, RN11
	if (!identification.ok) {
		return whole('invalid_identification', `${identification.error.message} («${contract.identification}»). Revísala a mano en el administrador del ISP.`)
	}

	const installments = [...read.installments].sort(byPeriod)
	const each = (outcome: ImportOutcome, reason: string) => decided(installments.map(installment => ({ outcome, installment, reason })))

	// RN12
	if (!rules.importStates.includes(status)) {
		return each('excluded_status', `Contrato en estado ${status}: los estados que se importan son ${list([...rules.importStates])}.`)
	}
	// RN13: una identificación sin letra nunca se excluye por tipo.
	const letter = identification.value.letter
	if (letter !== null && rules.excludedDocTypes.includes(letter)) {
		return each('excluded_doc_type', `El titular tiene documento tipo ${letter}, que está excluido en Configuración.`)
	}
	// RN14, D17: las cuotas residuales no cuentan para la coherencia.
	if (contract.currency !== 'USD') {
		return each('currency_not_usd', `El contrato está en ${contract.currency}: solo se importan contratos en USD.`)
	}
	const tooLow = installments.find(installment => installment.amountCents > 0 && installment.amountCents * 100 < contract.priceCents)
	if (tooLow) {
		return each('currency_incoherent', `Moneda incoherente: cuotas de ${usd(tooLow.amountCents)} frente a un plan de ${usd(contract.priceCents)} (menos del 1 %).`)
	}

	const rows: DecisionRow[] = []
	let remaining: Installment[] = []
	// RN16
	for (const installment of installments) {
		if (installment.amountCents === 0) rows.push({ outcome: 'residual', installment, reason: 'Saldo residual de menos de un centavo: no se cobra.' })
		else remaining.push(installment)
	}
	// RN17, D5: desde el mes actual menos N, inclusive.
	if (rules.windowMonths !== null) {
		const from = addMonths(context.currentPeriod, -rules.windowMonths)
		const reason = `Fuera de la ventana de ${rules.windowMonths} meses: se importa desde ${periodLabel(from)}.`
		for (const installment of remaining.filter(item => item.period < from)) rows.push({ outcome: 'outside_window', installment, reason })
		remaining = remaining.filter(item => item.period >= from)
	}
	// RN18, D7: después de la ventana; se quedan las más recientes.
	if (rules.maxRecent !== null && remaining.length > rules.maxRecent) {
		const cut = remaining.length - rules.maxRecent
		const reason = `Se conservan las ${rules.maxRecent} cuotas más recientes del contrato.`
		for (const installment of remaining.slice(0, cut)) rows.push({ outcome: 'excluded_max', installment, reason })
		remaining = remaining.slice(cut)
	}
	// RN19
	const candidates: Candidate[] = []
	for (const installment of remaining) {
		if (context.imported.has(installment.id)) rows.push({ outcome: 'already_imported', installment, reason: 'La cuota ya tiene su factura en Cobrix.' })
		else candidates.push({ contract, identification: identification.value, installment })
	}
	return { contract, identification: identification.value, status, rows, candidates }
}

/**
 * RN20, D6, CL19: por contrato y periodo; desde la primera que pasaría un tope, esa y todas las
 * siguientes quedan frenadas, aunque una más chica entrara.
 */
export function applyCaps(candidates: readonly Candidate[], caps: { readonly invoices: number; readonly amountCents: number }): { imported: Candidate[]; blocked: Candidate[] } {
	const ordered = [...candidates].sort((a, b) => a.contract.number - b.contract.number || byPeriod(a.installment, b.installment))
	const imported: Candidate[] = []
	const blocked: Candidate[] = []
	let amount = 0
	for (const candidate of ordered) {
		const fits = imported.length + 1 <= caps.invoices && amount + candidate.installment.amountCents <= caps.amountCents
		if (blocked.length === 0 && fits) {
			imported.push(candidate)
			amount += candidate.installment.amountCents
		} else {
			blocked.push(candidate)
		}
	}
	return { imported, blocked }
}
