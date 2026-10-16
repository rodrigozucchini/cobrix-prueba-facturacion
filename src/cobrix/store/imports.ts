/**
 * Lo que la importación lee y escribe en la base: qué cuotas ya tienen factura (RN19), qué
 * clientes existen, y las escrituras de una corrida real, en una transacción (DT3).
 */

import type { DatabaseSync } from 'node:sqlite'

import type { ContractStatus } from '../../shared/api-types.ts'
import type { Row } from './rows.ts'

/** `deuda_id` de las cuotas que ya tienen factura (RN19). */
export function importedExternalIds(db: DatabaseSync): Set<string> {
	const rows = db.prepare('SELECT external_id FROM invoices').all() as Row[]
	return new Set(rows.map(row => String(row.external_id)))
}

export function existingCustomerKeys(db: DatabaseSync): Set<string> {
	const rows = db.prepare('SELECT customer_key FROM customers').all() as Row[]
	return new Set(rows.map(row => String(row.customer_key)))
}

export interface ContractWrite {
	readonly number: number
	readonly customerKey: string | null
	readonly holderName: string
	readonly status: ContractStatus
	readonly plan: string | null
	readonly priceCents: number
	readonly branch: string | null
}

/** RF13: todo contrato leído se guarda o actualiza, aunque no se importe ninguna cuota. */
export function upsertContract(db: DatabaseSync, contract: ContractWrite, now: string): void {
	db.prepare(
		`INSERT INTO contracts (number, customer_key, holder_name, status, plan, price_cents, branch, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT (number) DO UPDATE SET
			customer_key = excluded.customer_key, holder_name = excluded.holder_name, status = excluded.status,
			plan = excluded.plan, price_cents = excluded.price_cents, branch = excluded.branch, updated_at = excluded.updated_at`,
	).run(contract.number, contract.customerKey, contract.holderName, contract.status, contract.plan, contract.priceCents, contract.branch, now)
}

export interface CustomerWrite {
	readonly key: string
	readonly document: string
	readonly name: string
	readonly personType: 'natural' | 'juridica'
	readonly email: string | null
	readonly phone: string | null
}

export function insertCustomer(db: DatabaseSync, customer: CustomerWrite, origin: string, runId: number, now: string): void {
	db.prepare(
		`INSERT INTO customers (customer_key, document, name, person_type, email, phone, origin, created_at, created_run_id, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(customer.key, customer.document, customer.name, customer.personType, customer.email, customer.phone, origin, now, runId, now)
}

/** RN6: los datos del último contrato leído del titular. */
export function updateCustomer(db: DatabaseSync, customer: CustomerWrite, now: string): void {
	db.prepare('UPDATE customers SET document = ?, name = ?, person_type = ?, email = ?, phone = ?, updated_at = ? WHERE customer_key = ?')
		.run(customer.document, customer.name, customer.personType, customer.email, customer.phone, now, customer.key)
}

export interface InvoiceWrite {
	readonly externalId: string
	readonly contractNumber: number
	readonly customerKey: string
	readonly period: string
	readonly dueDate: string
	readonly cutDate: string
	readonly amountCents: number
}

/** RN21, RN22: total = saldo = saldo de la cuota; el número sale del id. */
export function insertInvoice(db: DatabaseSync, invoice: InvoiceWrite, runId: number): number {
	const result = db.prepare(
		`INSERT INTO invoices (external_id, contract_number, customer_key, period, due_date, cut_date, total_cents, balance_cents, status, created_run_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
	).run(invoice.externalId, invoice.contractNumber, invoice.customerKey, invoice.period, invoice.dueDate, invoice.cutDate, invoice.amountCents, invoice.amountCents, runId)
	return Number(result.lastInsertRowid)
}

export function insertEvent(db: DatabaseSync, event: {
	customerKey: string
	kind: 'customer_created' | 'invoice_imported' | 'invoice_paid'
	invoiceId: number | null
	runId: number
	at: string
	detail: Readonly<Record<string, unknown>>
}): void {
	db.prepare('INSERT INTO events (customer_key, kind, invoice_id, run_id, at, detail) VALUES (?, ?, ?, ?, ?, ?)')
		.run(event.customerKey, event.kind, event.invoiceId, event.runId, event.at, JSON.stringify(event.detail))
}

/** RN22: `CBX-000001`. */
export const invoiceNumber = (id: number): string => `CBX-${String(id).padStart(6, '0')}`

// ---------------------------------------------------------------- «Actualizar pagadas»

export interface OpenInvoiceRow {
	readonly id: number
	readonly externalId: string
	readonly contractNumber: number
	readonly customerKey: string
	readonly customerName: string
	readonly period: string
	readonly balanceCents: number
}

/** RN32: solo se revisan las abiertas, por contrato y periodo. */
export function openInvoices(db: DatabaseSync): OpenInvoiceRow[] {
	const rows = db.prepare(
		`SELECT i.id, i.external_id, i.contract_number, i.customer_key, c.name AS customer_name, i.period, i.balance_cents
		 FROM invoices i JOIN customers c ON c.customer_key = i.customer_key
		 WHERE i.status = 'open'
		 ORDER BY i.contract_number, i.period, i.id`,
	).all() as Row[]
	return rows.map(row => ({
		id: Number(row.id),
		externalId: String(row.external_id),
		contractNumber: Number(row.contract_number),
		customerKey: String(row.customer_key),
		customerName: String(row.customer_name),
		period: String(row.period),
		balanceCents: Number(row.balance_cents),
	}))
}

/** RN24: pagada en el ISP, en 0, con la factura del administrador que la pagó. */
export function markInvoicePaid(db: DatabaseSync, invoiceId: number, paid: { paidAt: string; paidRef: string }, runId: number): void {
	db.prepare(`UPDATE invoices SET status = 'paid', balance_cents = 0, paid_at = ?, paid_ref = ?, paid_run_id = ? WHERE id = ? AND status = 'open'`)
		.run(paid.paidAt, paid.paidRef, runId, invoiceId)
}
