/**
 * «Actualizar pagadas» (RF14–RF16, spec §5.3): cada factura abierta contra el libro de cuotas de
 * su contrato; el contrato se relee solo si una cuota no está en el libro (RN29, P14). No escribe:
 * `apply` marca las pagadas en la transacción del motor. Sin facturas abiertas, termina sin
 * consultar (CL26). Si falla el login, falla la corrida (P13, RN33); un contrato, solo lo suyo (RN31).
 */

import type { DatabaseSync } from 'node:sqlite'

import type { PaidOutcome } from '../../shared/api-types.ts'
import { PAID_COUNTERS, PAID_SUMMARY, runSummary, type PaidCounter } from '../../shared/counters.ts'
import { lastDayOfPeriod } from '../../shared/dates.ts'
import { BillingError, type BillingClient } from '../billing/client.ts'
import { readContractRows, readLedgerRows, type Ledger } from '../billing/readers.ts'
import { classifyInvoice, type ContractEvidence, type PaidDecision } from '../rules/paid.ts'
import { insertEvent, invoiceNumber, markInvoicePaid, openInvoices, type OpenInvoiceRow } from '../store/imports.ts'
import { RunFailure, runFailureFrom, type RunOutcome } from './import-run.ts'

const NO_OPEN = 'No hay facturas abiertas para revisar. Importa primero desde el administrador.'

const COUNTER_OF: Readonly<Record<PaidOutcome, PaidCounter>> = {
	marked_paid: 'markedPaid',
	still_open: 'stillOpen',
	partial: 'partial',
	under_review: 'underReview',
	no_evidence: 'noEvidence',
	lookup_failed: 'lookupsFailed',
}

export async function runPaid(input: {
	readonly client: BillingClient
	readonly db: DatabaseSync
	readonly currentPeriod: string
	readonly simulation: boolean
}): Promise<RunOutcome> {
	const { client, db, currentPeriod, simulation } = input
	const counters = Object.fromEntries(PAID_COUNTERS.map(key => [key, 0])) as Record<PaidCounter, number>
	const warnings: string[] = []
	const technical: Record<string, number> = { successFalseWithData: 0 }

	const open = openInvoices(db)
	if (open.length === 0) {
		return { rows: [], counters, warnings, technical, summary: NO_OPEN, apply: () => {} }
	}

	try {
		await client.connect()
	} catch (error) {
		if (error instanceof BillingError) throw runFailureFrom(error)
		throw error
	}

	const byContract = new Map<number, OpenInvoiceRow[]>()
	for (const invoice of open) byContract.set(invoice.contractNumber, [...(byContract.get(invoice.contractNumber) ?? []), invoice])

	const decided: Array<{ invoice: OpenInvoiceRow; decision: PaidDecision }> = []
	const to = lastDayOfPeriod(currentPeriod)
	for (const [contractNumber, invoices] of byContract) {
		const from = `${invoices.map(invoice => invoice.period).sort()[0] ?? currentPeriod}-01`
		let ledger: Ledger
		try {
			const read = readLedgerRows(await client.getLedger(contractNumber, from, to), contractNumber)
			if (!read.ok) throw new RunFailureForContract(read.error.message)
			ledger = read.value
		} catch (error) {
			if (!(error instanceof BillingError) && !(error instanceof RunFailureForContract)) throw error
			const reason = `No se pudo consultar el libro de cuotas: ${error.message}`
			for (const invoice of invoices) decided.push({ invoice, decision: { outcome: 'lookup_failed', reason, paidAt: null, paidRef: null, adminBalanceCents: null } })
			continue
		}
		warnings.push(...ledger.warnings)
		if (ledger.technical.successFalseWithData) technical.successFalseWithData = (technical.successFalseWithData ?? 0) + 1

		const rowsOf = (invoice: OpenInvoiceRow) => ledger.rows.filter(row => row.installmentId === invoice.externalId)
		const unreadableOf = (invoice: OpenInvoiceRow) => ledger.unreadable.find(item => item.installmentId === invoice.externalId)?.reason ?? null

		// RN29, P14: el contrato se relee una vez, solo si alguna cuota no está en el libro.
		let contract: ((invoice: OpenInvoiceRow) => ContractEvidence) | undefined
		if (invoices.some(invoice => rowsOf(invoice).length === 0 && unreadableOf(invoice) === null)) {
			counters.contractsReread += 1
			try {
				const read = readContractRows(await client.getContract(contractNumber), contractNumber, currentPeriod)
				if (!read.ok) {
					const reason = read.error.message
					contract = () => ({ kind: 'unreadable', reason })
				} else {
					const pending = new Map(read.value.kind === 'installments' ? read.value.installments.map(item => [item.id, item.amountCents]) : [])
					contract = invoice => {
						const balance = pending.get(invoice.externalId)
						return balance === undefined ? { kind: 'not_listed' } : { kind: 'pending', balanceCents: balance }
					}
				}
			} catch (error) {
				if (!(error instanceof BillingError)) throw error
				const reason = error.message
				contract = () => ({ kind: 'failed', reason })
			}
		}

		for (const invoice of invoices) {
			const ledgerRows = rowsOf(invoice)
			const unreadable = unreadableOf(invoice)
			decided.push({
				invoice,
				decision: classifyInvoice(
					{ externalId: invoice.externalId, contractNumber, balanceCents: invoice.balanceCents },
					ledgerRows.length === 0 && unreadable === null && contract ? { ledgerRows, unreadable, contract: contract(invoice) } : { ledgerRows, unreadable },
				),
			})
		}
	}

	const rows = decided.map(({ invoice, decision }) => {
		counters.invoicesChecked += 1
		counters[COUNTER_OF[decision.outcome]] += 1
		return {
			contractNumber: invoice.contractNumber,
			installmentId: invoice.externalId,
			customerKey: invoice.customerKey,
			customerName: invoice.customerName,
			period: invoice.period,
			outcome: decision.outcome,
			reason: decision.outcome === 'marked_paid' && simulation ? decision.reason.replace(/^Pagada/, 'Se marcaría pagada') : decision.reason,
			// P18: el monto de la fila es siempre el de Cobrix; el del administrador es la evidencia.
			amountCents: invoice.balanceCents,
			detail: {
				invoiceNumber: invoiceNumber(invoice.id),
				adminInvoice: decision.paidRef,
				adminDate: decision.paidAt,
				adminBalanceCents: decision.adminBalanceCents,
			},
		}
	})

	const main = PAID_SUMMARY
	const summary = runSummary(counters, main, PAID_COUNTERS, simulation)

	const apply = (runId: number, now: string) => {
		for (const { invoice, decision } of decided) {
			if (decision.outcome !== 'marked_paid' || decision.paidAt === null || decision.paidRef === null) continue
			markInvoicePaid(db, invoice.id, { paidAt: decision.paidAt, paidRef: decision.paidRef }, runId)
			insertEvent(db, {
				customerKey: invoice.customerKey,
				kind: 'invoice_paid',
				invoiceId: invoice.id,
				runId,
				at: now,
				detail: { invoiceNumber: invoiceNumber(invoice.id), installmentId: invoice.externalId, adminInvoice: decision.paidRef, adminDate: decision.paidAt },
			})
		}
	}

	return { rows, counters, warnings, technical, summary, apply }
}

/** Un libro que no se pudo leer: solo afecta a las facturas de ese contrato (RN31). */
class RunFailureForContract extends Error {}

export { RunFailure }
