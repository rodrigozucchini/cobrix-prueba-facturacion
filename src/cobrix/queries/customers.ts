/**
 * La tabla de clientes (RF23–RF25, D28, D29, DT7): totales con SQL, búsqueda y orden acá. La
 * búsqueda ignora mayúsculas y acentos, y lee el documento con la regla de RN1 (P20). El filtro
 * por tramo (extras RN41) deja a quien tenga al menos una factura abierta en ese tramo.
 */

import type { DatabaseSync } from 'node:sqlite'

import type { AgingBucketKey, CustomerListItem, CustomerSort, PersonType } from '../../shared/api-types.ts'
import { compactIdentification } from '../rules/identification.ts'
import { num, str, type Row } from '../store/rows.ts'
import { bucketCondition } from './aging.ts'
import { lastRealRun } from './attention.ts'

const PERSON_TYPES: readonly PersonType[] = ['natural', 'juridica']

const TOTALS_SQL = `
	SELECT c.customer_key, c.document, c.name, c.person_type,
		(SELECT COUNT(*) FROM contracts k WHERE k.customer_key = c.customer_key) AS contracts,
		(SELECT COUNT(*) FROM invoices i WHERE i.customer_key = c.customer_key AND i.status = 'open') AS open_invoices,
		(SELECT COUNT(*) FROM invoices i WHERE i.customer_key = c.customer_key AND i.status = 'paid') AS paid_invoices,
		(SELECT COALESCE(SUM(i.balance_cents), 0) FROM invoices i WHERE i.customer_key = c.customer_key AND i.status = 'open') AS debt_cents,
		(SELECT MIN(i.due_date) FROM invoices i WHERE i.customer_key = c.customer_key AND i.status = 'open') AS oldest_due_date,
		(SELECT COUNT(*) FROM run_rows r JOIN invoices i ON i.external_id = r.installment_id
		 WHERE r.run_id = ${lastRealRun('paid')} AND r.outcome = 'partial' AND i.status = 'open' AND i.customer_key = c.customer_key) AS partial_invoices
	FROM customers c`

function toItem(row: Row): CustomerListItem {
	const personType = PERSON_TYPES.find(type => type === row.person_type)
	if (!personType) throw new Error('clientes: person_type desconocido')
	return {
		key: str(row, 'customer_key'),
		document: str(row, 'document'),
		name: str(row, 'name'),
		personType,
		contracts: num(row, 'contracts'),
		openInvoices: num(row, 'open_invoices'),
		paidInvoices: num(row, 'paid_invoices'),
		debtCents: num(row, 'debt_cents'),
		oldestDueDate: row.oldest_due_date === null ? null : str(row, 'oldest_due_date'),
		partialInvoices: num(row, 'partial_invoices'),
	}
}

/** La fila de un cliente, igual que en la tabla (P19). */
export function customerTotals(db: DatabaseSync, key: string): CustomerListItem | undefined {
	const row = db.prepare(`${TOTALS_SQL} WHERE c.customer_key = ?`).get(key) as Row | undefined
	return row ? toItem(row) : undefined
}

/** `Gómez  Pérez` → `gomez perez`. */
const plain = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** RF24: nombre sin mayúsculas ni acentos; documento con o sin letra, separadores o ceros. */
export function matchesSearch(customer: Pick<CustomerListItem, 'key' | 'name'>, query: string): boolean {
	const wanted = plain(query)
	if (wanted === '') return true
	if (plain(customer.name).includes(wanted)) return true
	const typed = compactIdentification(query)
	const own = compactIdentification(customer.key)
	if (!typed || !own || typed.digits === '') return false
	return (typed.letter === '' || typed.letter === own.letter) && own.digits.includes(typed.digits)
}

const byName = (a: CustomerListItem, b: CustomerListItem) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })

const ORDER: Readonly<Record<CustomerSort, (a: CustomerListItem, b: CustomerListItem) => number>> = {
	vencimiento: (a, b) => (a.oldestDueDate ?? '').localeCompare(b.oldestDueDate ?? ''),
	deuda: (a, b) => b.debtCents - a.debtCents,
	nombre: () => 0,
}

/** RF25, D28: los que no tienen facturas abiertas, siempre al final; empates por nombre. */
export function listCustomers(db: DatabaseSync, input: {
	readonly query: string
	readonly sort: CustomerSort
	/** `null`: todos. */
	readonly bucket: AgingBucketKey | null
	/** Fecha de trabajo (D35), para el tramo. */
	readonly today: string
}): CustomerListItem[] {
	const rows = (input.bucket === null
		? db.prepare(TOTALS_SQL).all()
		: db.prepare(
			`${TOTALS_SQL} WHERE EXISTS (SELECT 1 FROM invoices i WHERE i.customer_key = c.customer_key AND i.status = 'open' AND ${bucketCondition(input.bucket)})`,
		).all({ today: input.today })) as Row[]
	return rows
		.map(toItem)
		.filter(customer => matchesSearch(customer, input.query))
		.sort((a, b) => Number(a.oldestDueDate === null) - Number(b.oldestDueDate === null) || ORDER[input.sort](a, b) || byName(a, b))
}
