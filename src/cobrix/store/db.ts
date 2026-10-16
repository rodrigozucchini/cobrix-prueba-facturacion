/**
 * Abre la base de Cobrix: FK activas, el esquema de specs/data-model.md, las filas iniciales (D4)
 * y la clave de la contraseña (D53). También la única ayuda de transacciones.
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { COBRIX_SCHEMA } from './schema.ts'
import { loadKey } from './secret.ts'

/** D4: los valores de la captura de referencia. */
export const PROVIDER_DEFAULTS = {
	name: 'Administrador de facturas',
	importStates: ['ACTIVO', 'CORTADO'],
	graceDays: 0,
	capInvoices: 500,
	capAmountCents: 5_000_000,
} as const

export function openDatabase(path: string): DatabaseSync {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
	const db = new DatabaseSync(path)
	db.exec('PRAGMA foreign_keys = ON')
	db.exec('PRAGMA busy_timeout = 5000')
	if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
	db.exec(COBRIX_SCHEMA)
	loadKey(db, path)
	db.prepare('INSERT OR IGNORE INTO settings (id) VALUES (1)').run()
	db.prepare(
		`INSERT OR IGNORE INTO providers
			(id, name, import_states, window_months, max_recent, grace_days, cap_invoices, cap_amount_cents, excluded_doc_types, auto_enabled, auto_hour)
		 VALUES (1, ?, ?, NULL, NULL, ?, ?, ?, '[]', 0, NULL)`,
	).run(
		PROVIDER_DEFAULTS.name,
		JSON.stringify(PROVIDER_DEFAULTS.importStates),
		PROVIDER_DEFAULTS.graceDays,
		PROVIDER_DEFAULTS.capInvoices,
		PROVIDER_DEFAULTS.capAmountCents,
	)
	return db
}

/** Corre `fn` entre BEGIN y COMMIT; si algo falla, se deshace todo (RN34). */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
	db.exec('BEGIN IMMEDIATE')
	try {
		const result = fn()
		db.exec('COMMIT')
		return result
	} catch (error) {
		db.exec('ROLLBACK')
		throw error
	}
}
