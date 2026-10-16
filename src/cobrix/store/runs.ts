/** Corridas y sus filas en la base (data-model.md): crear, cerrar, listar y leer. */

import type { DatabaseSync } from 'node:sqlite'

import {
	IMPORT_OUTCOMES,
	PAID_OUTCOMES,
	type ImportOutcome,
	type PaidOutcome,
	type RunDetail,
	type RunKind,
	type RunListItem,
	type RunOrigin,
	type RunRow,
	type RunStatus,
} from '../../shared/api-types.ts'
import { jsonRecord, nullableNum, nullableStr, num, oneOf, str, type Row } from './rows.ts'

const INTERRUPTED = 'Se interrumpió porque el servidor se reinició. No quedó nada a medias: vuelve a correrla.'

/**
 * DT12: una corrida en curso al arrancar quedó cortada por un reinicio. No aplicó nada (todo va
 * en una transacción al final), así que se cierra fallida. Devuelve cuántas cerró.
 */
export function failInterruptedRuns(db: DatabaseSync, now: string): number {
	const result = db.prepare(
		`UPDATE runs SET status = 'failed', finished_at = ?, error = ?, summary = ? WHERE status = 'running'`,
	).run(now, INTERRUPTED, INTERRUPTED)
	return Number(result.changes)
}

export function createRun(db: DatabaseSync, input: { kind: RunKind; simulation: boolean; origin: RunOrigin; startedAt: string }): number {
	const result = db.prepare(
		`INSERT INTO runs (kind, simulation, origin, status, started_at) VALUES (?, ?, ?, 'running', ?)`,
	).run(input.kind, input.simulation ? 1 : 0, input.origin, input.startedAt)
	return Number(result.lastInsertRowid)
}

/** Una corrida que ni pudo iniciarse (P37). Nace fallida, así no ocupa el lugar de «en curso». */
export function recordFailedRun(db: DatabaseSync, input: { kind: RunKind; origin: RunOrigin; at: string; error: string }): number {
	const result = db.prepare(
		`INSERT INTO runs (kind, simulation, origin, status, started_at, finished_at, error, summary) VALUES (?, 0, ?, 'failed', ?, ?, ?, ?)`,
	).run(input.kind, input.origin, input.at, input.at, input.error, input.error)
	return Number(result.lastInsertRowid)
}

export interface RunRowInput {
	readonly contractNumber: number | null
	readonly installmentId: string | null
	readonly customerKey: string | null
	readonly customerName: string | null
	readonly period: string | null
	readonly outcome: ImportOutcome | PaidOutcome
	readonly reason: string
	readonly amountCents: number | null
	readonly detail?: Readonly<Record<string, unknown>>
}

export function insertRunRows(db: DatabaseSync, runId: number, rows: readonly RunRowInput[]): void {
	const insert = db.prepare(
		`INSERT INTO run_rows (run_id, contract_number, installment_id, customer_key, customer_name, period, outcome, reason, amount_cents, detail)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
	for (const row of rows) {
		insert.run(runId, row.contractNumber, row.installmentId, row.customerKey, row.customerName, row.period, row.outcome, row.reason, row.amountCents, JSON.stringify(row.detail ?? {}))
	}
}

export function completeRun(db: DatabaseSync, runId: number, result: {
	finishedAt: string
	summary: string
	counters: Readonly<Record<string, number>>
	warnings: readonly string[]
	technical: Readonly<Record<string, number>>
}): void {
	db.prepare(
		`UPDATE runs SET status = 'completed', finished_at = ?, summary = ?, counters = ?, warnings = ?, technical = ? WHERE id = ?`,
	).run(result.finishedAt, result.summary, JSON.stringify(result.counters), JSON.stringify(result.warnings), JSON.stringify(result.technical), runId)
}

export function failRun(db: DatabaseSync, runId: number, finishedAt: string, error: string): void {
	db.prepare(`UPDATE runs SET status = 'failed', finished_at = ?, error = ?, summary = ? WHERE id = ?`).run(finishedAt, error, error, runId)
}

// ---------------------------------------------------------------- lectura

const KINDS: readonly RunKind[] = ['import', 'paid']
const STATUSES: readonly RunStatus[] = ['running', 'completed', 'failed']
const ORIGINS: readonly RunOrigin[] = ['manual', 'auto']

function toListItem(row: Row): RunListItem {
	const startedAt = str(row, 'started_at')
	const finishedAt = nullableStr(row, 'finished_at')
	return {
		id: num(row, 'id'),
		kind: oneOf(row, 'kind', KINDS),
		simulation: num(row, 'simulation') === 1,
		origin: oneOf(row, 'origin', ORIGINS),
		status: oneOf(row, 'status', STATUSES),
		startedAt,
		finishedAt,
		durationMs: finishedAt === null ? null : Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
		summary: nullableStr(row, 'summary'),
		error: nullableStr(row, 'error'),
	}
}

export function listRuns(db: DatabaseSync, limit?: number): RunListItem[] {
	const rows = db.prepare(`SELECT * FROM runs ORDER BY id DESC${limit ? ' LIMIT ?' : ''}`).all(...(limit ? [limit] : [])) as Row[]
	return rows.map(toListItem)
}

export function readRun(db: DatabaseSync, runId: number): RunListItem | undefined {
	const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as Row | undefined
	return row ? toListItem(row) : undefined
}

const OUTCOMES: ReadonlyArray<ImportOutcome | PaidOutcome> = [...IMPORT_OUTCOMES, ...PAID_OUTCOMES]

export function readRunDetail(db: DatabaseSync, runId: number): RunDetail | undefined {
	const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as Row | undefined
	if (!row) return undefined
	const counters: Record<string, number> = {}
	for (const [key, value] of Object.entries(jsonRecord(str(row, 'counters')))) if (typeof value === 'number') counters[key] = value
	const warningsRaw: unknown = JSON.parse(str(row, 'warnings'))
	const warnings = Array.isArray(warningsRaw) ? warningsRaw.filter((item): item is string => typeof item === 'string') : []
	const rows = (db.prepare(
		`SELECT r.*, EXISTS (SELECT 1 FROM customers c WHERE c.customer_key = r.customer_key) AS customer_exists
		 FROM run_rows r WHERE r.run_id = ? ORDER BY r.id`,
	).all(runId) as Row[]).map((item): RunRow => ({
		contractNumber: nullableNum(item, 'contract_number'),
		installmentId: nullableStr(item, 'installment_id'),
		customerKey: nullableStr(item, 'customer_key'),
		customerName: nullableStr(item, 'customer_name'),
		customerExists: num(item, 'customer_exists') === 1,
		period: nullableStr(item, 'period'),
		outcome: oneOf(item, 'outcome', OUTCOMES),
		reason: str(item, 'reason'),
		amountCents: nullableNum(item, 'amount_cents'),
		detail: jsonRecord(str(item, 'detail')),
	}))
	return { ...toListItem(row), counters, warnings, rows }
}
