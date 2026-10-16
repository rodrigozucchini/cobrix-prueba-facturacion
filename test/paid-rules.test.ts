/**
 * Payment rules (RN24–RN31, D12, D20, D21): an open Cobrix invoice is marked paid only with full
 * evidence in the installments ledger; anything less keeps it open and says why.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LedgerRow } from '../src/cobrix/billing/readers.ts'
import { classifyInvoice, type OpenInvoice } from '../src/cobrix/rules/paid.ts'

const invoice: OpenInvoice = { externalId: '7000032', contractNumber: 900103, balanceCents: 2000 }

const row = (fields: Partial<LedgerRow> = {}): LedgerRow => ({
	installmentId: '7000032',
	contractId: 900103,
	period: '2026-08',
	balanceCents: 0,
	paidCents: 2000,
	invoiceId: 8800119,
	invoiceNumber: '008800119',
	issuedAt: '2026-10-13',
	...fields,
})

const decide = (rows: LedgerRow[], extra: Partial<Parameters<typeof classifyInvoice>[1]> = {}) =>
	classifyInvoice(invoice, { ledgerRows: rows, unreadable: null, ...extra })

describe('reglas de pagos', () => {
	it('RN24, D12: saldo 0 con algo pagado y filas que coinciden → pagada, con la factura del administrador más reciente', () => {
		const decision = decide([
			row({ invoiceId: 8800007, invoiceNumber: '008800007', issuedAt: '2026-08-06' }),
			row({ invoiceId: 8800119, invoiceNumber: '008800119', issuedAt: '2026-10-13' }),
		])
		assert.equal(decision.outcome, 'marked_paid')
		assert.equal(decision.paidAt, '2026-10-13')
		assert.equal(decision.paidRef, '008800119')
		assert.match(decision.reason, /008800119/)
		assert.match(decision.reason, /del 13 oct 2026\.$/, 'CA41: la fecha del motivo, legible')
	})

	it('D12: si dos facturas del administrador tienen la misma fecha, gana la de número mayor', () => {
		const decision = decide([row({ invoiceId: 8800120, invoiceNumber: '008800120' }), row({ invoiceId: 8800119, invoiceNumber: '008800119' })])
		assert.equal(decision.paidRef, '008800120')
	})

	it('D20: un saldo de menos de un centavo cuenta como 0', () => {
		assert.equal(decide([row({ balanceCents: 0 })]).outcome, 'marked_paid')
	})

	it('RN25: saldo menor que el de Cobrix → abono parcial; la factura sigue abierta (LUIS GOMEZ)', () => {
		const decision = decide([row({ balanceCents: 1500, paidCents: 500, invoiceNumber: '008800119' })])
		assert.equal(decision.outcome, 'partial')
		assert.equal(decision.adminBalanceCents, 1500)
		assert.match(decision.reason, /USD 15,00/)
		assert.match(decision.reason, /USD 20,00/)
		assert.equal(decision.paidAt, null)
	})

	it('RN26, CL9: saldo igual al de Cobrix → sigue pendiente (ELENA RUIZ, pago anulado)', () => {
		const decision = decide([row({ balanceCents: 2000, paidCents: 0 })])
		assert.equal(decision.outcome, 'still_open')
	})

	it('RN27, D21: saldo 0 sin nada pagado es una exoneración, no un pago', () => {
		const decision = decide([row({ balanceCents: 0, paidCents: 0, invoiceId: 0, invoiceNumber: null, issuedAt: null })])
		assert.equal(decision.outcome, 'under_review')
		assert.match(decision.reason, /exonerada/)
	})

	it('RN28: filas que no coinciden entre sí → en revisión, diciendo en qué', () => {
		const decision = decide([row(), row({ invoiceId: 8800200, balanceCents: 500 })])
		assert.equal(decision.outcome, 'under_review')
		assert.match(decision.reason, /no coinciden/)
	})

	it('RN28: una fila de otro contrato → en revisión', () => {
		const decision = decide([row({ contractId: 900104 })])
		assert.equal(decision.outcome, 'under_review')
		assert.match(decision.reason, /otro contrato/)
	})

	it('RN28: saldo del libro mayor que el de Cobrix → en revisión', () => {
		const decision = decide([row({ balanceCents: 2500, paidCents: 0 })])
		assert.equal(decision.outcome, 'under_review')
		assert.match(decision.reason, /mayor/)
	})

	it('plan 5.2: una fila de esta cuota que no se pudo leer → en revisión, nunca pagada', () => {
		const decision = decide([row()], { unreadable: 'falta el saldo de la cuota' })
		assert.equal(decision.outcome, 'under_review')
		assert.match(decision.reason, /falta el saldo/)
	})

	it('pagada sin ninguna factura del administrador que la respalde → en revisión', () => {
		const decision = decide([row({ invoiceId: 0, invoiceNumber: null, issuedAt: null })])
		assert.equal(decision.outcome, 'under_review')
	})

	it('RN29: si no está en el libro pero el contrato la lista pendiente, se compara su saldo', () => {
		assert.equal(decide([], { contract: { kind: 'pending', balanceCents: 2000 } }).outcome, 'still_open')
		const partial = decide([], { contract: { kind: 'pending', balanceCents: 1500 } })
		assert.equal(partial.outcome, 'partial')
		assert.equal(partial.adminBalanceCents, 1500)
		assert.equal(decide([], { contract: { kind: 'pending', balanceCents: 2500 } }).outcome, 'under_review')
	})

	it('RN30: si no está ni en el libro ni pendiente en el contrato → sin evidencia, nunca pagada', () => {
		const decision = decide([], { contract: { kind: 'not_listed' } })
		assert.equal(decision.outcome, 'no_evidence')
		assert.equal(decision.paidAt, null)
	})

	it('P15: si el contrato releído se contradice, la factura queda en revisión con el motivo', () => {
		const decision = decide([], { contract: { kind: 'unreadable', reason: 'trae dos veces la cuota 7000032' } })
		assert.equal(decision.outcome, 'under_review')
		assert.match(decision.reason, /dos veces/)
	})

	it('RN31: si no se pudo consultar el contrato, consulta fallida y sigue abierta', () => {
		const decision = decide([], { contract: { kind: 'failed', reason: 'tiempo agotado' } })
		assert.equal(decision.outcome, 'lookup_failed')
		assert.match(decision.reason, /tiempo agotado/)
	})
})
