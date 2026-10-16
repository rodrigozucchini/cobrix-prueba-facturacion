/**
 * Reglas de pagos (spec §5.3), función pura: qué pasa con una factura abierta según el libro de
 * cuotas o, si no está ahí, según su contrato. Solo la evidencia completa la marca pagada (RN24);
 * lo demás la deja abierta y dice por qué.
 */

import type { PaidOutcome } from '../../shared/api-types.ts'
import { civilDate, usd } from '../../shared/format.ts'
import type { LedgerRow } from '../billing/readers.ts'

export interface OpenInvoice {
	/** `deuda_id` de su cuota. */
	readonly externalId: string
	readonly contractNumber: number
	readonly balanceCents: number
}

/** Lo que dice el contrato cuando la cuota no está en el libro (RN29). */
export type ContractEvidence =
	| { readonly kind: 'pending'; readonly balanceCents: number }
	| { readonly kind: 'not_listed' }
	| { readonly kind: 'unreadable'; readonly reason: string }
	| { readonly kind: 'failed'; readonly reason: string }

export interface PaidEvidence {
	/** Solo las filas del libro de ESTA cuota (CL8). */
	readonly ledgerRows: readonly LedgerRow[]
	/** Por qué no se pudo leer una fila de esta cuota, si pasó. */
	readonly unreadable: string | null
	/** Solo cuando la cuota no está en el libro. */
	readonly contract?: ContractEvidence
}

export interface PaidDecision {
	readonly outcome: PaidOutcome
	/** Para el operador. */
	readonly reason: string
	readonly paidAt: string | null
	readonly paidRef: string | null
	/** Lo que el administrador dice que se debe, si lo dice. */
	readonly adminBalanceCents: number | null
}

const decision = (outcome: PaidOutcome, reason: string, extra: Partial<PaidDecision> = {}): PaidDecision =>
	({ outcome, reason, paidAt: null, paidRef: null, adminBalanceCents: null, ...extra })

/** RN25, RN26, RN28: un saldo abierto contra el de Cobrix. */
function compareBalance(admin: number, cobrix: number, source: string): PaidDecision {
	if (admin < cobrix) {
		return decision('partial', `Abono parcial: ${source} dice que se deben ${usd(admin)} y Cobrix tiene ${usd(cobrix)}. No se aplica: solo se marcan pagadas las cuotas saldadas.`, { adminBalanceCents: admin })
	}
	if (admin === cobrix) return decision('still_open', `Sigue pendiente: ${source} dice que se deben ${usd(admin)}.`, { adminBalanceCents: admin })
	return decision('under_review', `En revisión: ${source} dice que se deben ${usd(admin)}, un saldo mayor que los ${usd(cobrix)} de Cobrix. Revísalo en el administrador del ISP.`, { adminBalanceCents: admin })
}

export function classifyInvoice(invoice: OpenInvoice, evidence: PaidEvidence): PaidDecision {
	if (evidence.unreadable !== null) {
		return decision('under_review', `En revisión: una fila del libro de cuotas no se pudo leer (${evidence.unreadable}). Nunca se marca pagada con un dato dudoso.`)
	}

	const rows = evidence.ledgerRows
	if (rows.length > 0) {
		if (rows.some(row => row.contractId !== invoice.contractNumber)) {
			return decision('under_review', 'En revisión: el libro trae filas de esta cuota en otro contrato.')
		}
		const shape = (row: LedgerRow) => `${row.contractId}|${row.period}|${row.balanceCents}|${row.paidCents}`
		if (new Set(rows.map(shape)).size > 1) {
			return decision('under_review', 'En revisión: las filas del libro de esta cuota no coinciden entre sí (periodo, saldo o monto pagado).')
		}
		const first = rows[0]
		if (!first) return decision('no_evidence', 'Sin evidencia en el libro de cuotas.')

		if (first.balanceCents === 0 && first.paidCents > 0) {
			// RN24, D12: la factura más reciente del administrador que tocó la cuota.
			const latest = rows
				.filter(row => row.invoiceId !== 0 && row.invoiceNumber !== null && row.issuedAt !== null)
				.sort((a, b) => (a.issuedAt ?? '').localeCompare(b.issuedAt ?? '') || a.invoiceId - b.invoiceId)
				.at(-1)
			if (!latest || latest.invoiceNumber === null || latest.issuedAt === null) {
				return decision('under_review', 'En revisión: el libro dice que está saldada, pero no trae la factura del administrador que la pagó.')
			}
			return decision('marked_paid', `Pagada con la factura del administrador ${latest.invoiceNumber} del ${civilDate(latest.issuedAt)}.`, {
				paidAt: latest.issuedAt,
				paidRef: latest.invoiceNumber,
				adminBalanceCents: 0,
			})
		}
		if (first.balanceCents === 0) {
			return decision('under_review', 'En revisión: exonerada en el administrador (saldo 0 sin nada pagado). Una exoneración no es un pago.', { adminBalanceCents: 0 })
		}
		return compareBalance(first.balanceCents, invoice.balanceCents, 'el administrador')
	}

	// RN29–RN31: no está en el libro.
	const contract = evidence.contract
	if (!contract || contract.kind === 'not_listed') {
		return decision('no_evidence', 'Sin evidencia: la cuota no aparece en el libro ni como pendiente en el contrato. Nunca se marca pagada sin evidencia.')
	}
	if (contract.kind === 'failed') return decision('lookup_failed', `No se pudo consultar el contrato: ${contract.reason}`)
	if (contract.kind === 'unreadable') return decision('under_review', `En revisión: ${contract.reason}`)
	return compareBalance(contract.balanceCents, invoice.balanceCents, 'el contrato (la cuota todavía no figura en el libro)')
}
