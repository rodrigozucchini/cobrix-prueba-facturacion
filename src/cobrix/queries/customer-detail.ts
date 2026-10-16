/**
 * El expediente (RF27–RF30): datos, los mismos totales que la tabla (P19), los contratos, las
 * facturas (vencimiento más nuevo primero) y el historial con la corrida de cada evento.
 */

import type { DatabaseSync } from 'node:sqlite'

import {
	CONTRACT_STATUSES,
	type CustomerContract,
	type CustomerDetail,
	type CustomerEvent,
	type CustomerEventKind,
	type CustomerInvoice,
	type InvoiceStatus,
} from '../../shared/api-types.ts'
import { invoiceNumber } from '../store/imports.ts'
import { jsonRecord, nullableNum, nullableStr, num, oneOf, str, type Row } from '../store/rows.ts'
import { lastRealRun } from './attention.ts'
import { customerTotals } from './customers.ts'

/** Un campo de texto del `detail` del evento, o `null`. */
function detailText(row: Row, key: string): string | null {
	const value = jsonRecord(str(row, 'detail'))[key]
	return typeof value === 'string' ? value : null
}

const INVOICE_STATUSES: readonly InvoiceStatus[] = ['open', 'paid']
const EVENT_KINDS: readonly CustomerEventKind[] = ['customer_created', 'invoice_imported', 'invoice_paid']

export function readCustomerDetail(db: DatabaseSync, key: string): CustomerDetail | undefined {
	const customer = db.prepare('SELECT * FROM customers WHERE customer_key = ?').get(key) as Row | undefined
	const totals = customerTotals(db, key)
	if (!customer || !totals) return undefined

	const contracts = (db.prepare('SELECT * FROM contracts WHERE customer_key = ? ORDER BY number').all(key) as Row[]).map((row): CustomerContract => ({
		number: num(row, 'number'),
		status: oneOf(row, 'status', CONTRACT_STATUSES),
		plan: nullableStr(row, 'plan'),
		priceCents: num(row, 'price_cents'),
		branch: nullableStr(row, 'branch'),
	}))

	// D57: con un abono parcial en la última actualización, la factura dice cuánto queda en el ISP.
	const invoices = (db.prepare(
		`SELECT i.*, (SELECT json_extract(r.detail, '$.adminBalanceCents') FROM run_rows r
			WHERE r.run_id = ${lastRealRun('paid')} AND r.installment_id = i.external_id AND r.outcome = 'partial' AND i.status = 'open') AS partial_balance_cents
		 FROM invoices i WHERE i.customer_key = ? ORDER BY i.due_date DESC, i.id DESC`,
	).all(key) as Row[]).map((row): CustomerInvoice => ({
		id: num(row, 'id'),
		number: invoiceNumber(num(row, 'id')),
		installmentId: str(row, 'external_id'),
		contractNumber: num(row, 'contract_number'),
		period: str(row, 'period'),
		dueDate: str(row, 'due_date'),
		cutDate: str(row, 'cut_date'),
		totalCents: num(row, 'total_cents'),
		balanceCents: num(row, 'balance_cents'),
		status: oneOf(row, 'status', INVOICE_STATUSES),
		paidAt: nullableStr(row, 'paid_at'),
		paidRef: nullableStr(row, 'paid_ref'),
		partialBalanceCents: nullableNum(row, 'partial_balance_cents'),
	}))

	const events = (db.prepare(
		`SELECT e.*, i.external_id, i.period FROM events e LEFT JOIN invoices i ON i.id = e.invoice_id
		 WHERE e.customer_key = ? ORDER BY e.at DESC, e.id DESC`,
	).all(key) as Row[]).map((row): CustomerEvent => {
		const invoiceId = row.invoice_id === null ? null : num(row, 'invoice_id')
		return {
			id: num(row, 'id'),
			kind: oneOf(row, 'kind', EVENT_KINDS),
			at: str(row, 'at'),
			runId: num(row, 'run_id'),
			invoiceNumber: invoiceId === null ? null : invoiceNumber(invoiceId),
			installmentId: nullableStr(row, 'external_id'),
			period: nullableStr(row, 'period'),
			adminInvoice: detailText(row, 'adminInvoice'),
			adminDate: detailText(row, 'adminDate'),
		}
	})

	return {
		customer: {
			key: str(customer, 'customer_key'),
			document: str(customer, 'document'),
			name: str(customer, 'name'),
			personType: totals.personType,
			email: nullableStr(customer, 'email'),
			phone: nullableStr(customer, 'phone'),
			origin: str(customer, 'origin'),
			createdAt: str(customer, 'created_at'),
		},
		totals,
		contracts,
		invoices,
		events,
	}
}
