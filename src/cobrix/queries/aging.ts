/**
 * Antigüedad de la deuda (extras RF42, RF43, RN39–RN41, CL27, P24, P25): las facturas abiertas
 * por días desde el vencimiento, en 4 tramos definidos solo acá. El Resumen y el filtro de
 * Clientes leen estos mismos rangos. La fecha de trabajo llega como parámetro, nunca `date('now')`.
 */

import type { DatabaseSync } from 'node:sqlite'

import { AGING_BUCKET_KEYS, type AgingBucket, type AgingBucketKey } from '../../shared/api-types.ts'

/** Días inclusive. `from: null`: las que todavía no vencen también van en el primero (P25). */
const RANGES: Readonly<Record<AgingBucketKey, { readonly from: number | null; readonly to: number | null }>> = {
	'0-30': { from: null, to: 30 },
	'31-60': { from: 31, to: 60 },
	'61-90': { from: 61, to: 90 },
	'90+': { from: 91, to: null },
}

/** RN39: días de atraso de la factura `i`, con la fecha de trabajo en `:today`. */
const DAYS = 'CAST(julianday(:today) - julianday(i.due_date) AS INTEGER)'

/** El rango del tramo como condición SQL sobre `i` (usa `:today`). */
export function bucketCondition(key: AgingBucketKey): string {
	const { from, to } = RANGES[key]
	return [from === null ? null : `${DAYS} >= ${from}`, to === null ? null : `${DAYS} <= ${to}`].filter(Boolean).join(' AND ')
}

const BUCKET_CASE = `CASE ${AGING_BUCKET_KEYS.map(key => `WHEN ${bucketCondition(key)} THEN '${key}'`).join(' ')} END`

export function readAging(db: DatabaseSync, today: string): AgingBucket[] {
	const rows = db.prepare(
		`SELECT ${BUCKET_CASE} AS bucket, COUNT(*) AS n, SUM(i.balance_cents) AS cents
		 FROM invoices i WHERE i.status = 'open' GROUP BY bucket`,
	).all({ today }) as Array<Record<string, unknown>>
	const found = new Map(rows.map(row => [row.bucket, row]))
	return AGING_BUCKET_KEYS.map(key => {
		const row = found.get(key)
		return { key, count: Number(row?.n ?? 0), amountCents: Number(row?.cents ?? 0) }
	})
}
