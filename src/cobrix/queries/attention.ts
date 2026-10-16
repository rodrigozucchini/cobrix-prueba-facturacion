/**
 * «Requiere atención» (D56): lo que tiene que revisar una persona, de la última corrida real de
 * cada tipo. Las simulaciones no cuentan. Cada caso lleva a esa corrida, filtrada.
 */

import type { DatabaseSync } from 'node:sqlite'

import type { AttentionItem, ImportOutcome, PaidOutcome, RunKind } from '../../shared/api-types.ts'
import { num, str, type Row } from '../store/rows.ts'

/** El id de la última corrida real terminada de ese tipo (SQL, para subconsultas). */
export const lastRealRun = (kind: RunKind) =>
	`(SELECT MAX(id) FROM runs WHERE kind = '${kind}' AND simulation = 0 AND status != 'running')`

/** Los resultados que revisa una persona (avisos y fallas del detalle), en este orden. */
const IMPORT_CHECK: readonly ImportOutcome[] = ['lookup_failed', 'inconsistent_response', 'unreadable_list_item', 'unknown_status', 'invalid_identification', 'blocked_by_cap']
const PAID_CHECK: readonly PaidOutcome[] = ['lookup_failed', 'under_review', 'no_evidence', 'partial']

/** La última corrida real de ese tipo: fallida, o cuántas filas de cada resultado revisar. */
function lastRun<T extends string>(db: DatabaseSync, kind: RunKind, check: readonly T[]) {
	const run = db.prepare(`SELECT id, status FROM runs WHERE id = ${lastRealRun(kind)}`).get() as Row | undefined
	if (!run) return []
	const runId = num(run, 'id')
	if (str(run, 'status') === 'failed') return [{ runId, outcome: null, count: 0 }]
	const counts = new Map((db.prepare('SELECT outcome, COUNT(*) AS n FROM run_rows WHERE run_id = ? GROUP BY outcome').all(runId) as Row[])
		.map(row => [str(row, 'outcome'), num(row, 'n')]))
	return check.flatMap(outcome => {
		const count = counts.get(outcome) ?? 0
		return count > 0 ? [{ runId, outcome, count }] : []
	})
}

export function readAttention(db: DatabaseSync): AttentionItem[] {
	return [
		...lastRun(db, 'import', IMPORT_CHECK).map(item => ({ kind: 'import' as const, ...item })),
		...lastRun(db, 'paid', PAID_CHECK).map(item => ({ kind: 'paid' as const, ...item })),
	]
}
