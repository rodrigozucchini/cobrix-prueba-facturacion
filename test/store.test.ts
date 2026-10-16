/**
 * The database protects itself: coherent invoices, no duplicate installments, nothing deleted
 * while something else uses it, and a single run in progress (specs/data-model.md). A run cut by
 * a restart is closed as failed at startup (RF34).
 */

import assert from 'node:assert/strict'
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, it } from 'node:test'

import { openDatabase, transaction } from '../src/cobrix/store/db.ts'
import { failInterruptedRuns } from '../src/cobrix/store/runs.ts'

const NOW = '2026-10-13T10:00:00.000Z'

function seedRun(db: DatabaseSync, status = 'completed'): number {
	const result = db.prepare(
		`INSERT INTO runs (kind, simulation, origin, status, started_at) VALUES ('import', 0, 'manual', ?, ?)`,
	).run(status, NOW)
	return Number(result.lastInsertRowid)
}

function seedCustomerAndContract(db: DatabaseSync, runId: number): void {
	db.prepare(
		`INSERT INTO customers (customer_key, document, name, person_type, origin, created_at, created_run_id, updated_at)
		 VALUES ('V9876543', 'V-9876543', 'LUIS GOMEZ', 'natural', 'Administrador de facturas', ?, ?, ?)`,
	).run(NOW, runId, NOW)
	db.prepare(
		`INSERT INTO contracts (number, customer_key, holder_name, status, plan, price_cents, branch, updated_at)
		 VALUES (900103, 'V9876543', 'LUIS GOMEZ', 'CORTADO', 'PLAN3MB20', 2000, 'CCS', ?)`,
	).run(NOW)
}

const insertInvoice = (db: DatabaseSync, runId: number, fields: Partial<Record<string, string | number | null>> = {}) => {
	const row = {
		external_id: '7000031', status: 'open', total_cents: 2000, balance_cents: 2000, paid_at: null, paid_ref: null, paid_run_id: null,
		...fields,
	}
	return db.prepare(
		`INSERT INTO invoices (external_id, contract_number, customer_key, period, due_date, cut_date,
			total_cents, balance_cents, status, paid_at, paid_ref, created_run_id, paid_run_id)
		 VALUES (?, 900103, 'V9876543', '2026-07', '2026-07-01', '2026-07-01', ?, ?, ?, ?, ?, ?, ?)`,
	).run(row.external_id, row.total_cents, row.balance_cents, row.status, row.paid_at, row.paid_ref, runId, row.paid_run_id)
}

describe('base de datos de Cobrix', () => {
	let db: DatabaseSync
	let runId: number

	beforeEach(() => {
		db = openDatabase(':memory:')
		runId = seedRun(db)
		seedCustomerAndContract(db, runId)
	})

	it('D4: arranca con la empresa vacía y el proveedor con los valores por defecto', () => {
		const provider = db.prepare('SELECT * FROM providers WHERE id = 1').get() as Record<string, unknown>
		assert.equal(provider.import_states, '["ACTIVO","CORTADO"]')
		assert.equal(provider.window_months, null)
		assert.equal(provider.max_recent, null)
		assert.equal(provider.grace_days, 0)
		assert.equal(provider.cap_invoices, 500)
		assert.equal(provider.cap_amount_cents, 5_000_000)
		assert.equal(provider.auto_enabled, 0)
		assert.deepEqual({ ...(db.prepare('SELECT company_name, company_rif FROM settings').get() as object) }, { company_name: '', company_rif: '' })
	})

	it('D16: una factura abierta guarda todo su saldo y una pagada queda en 0 con su pago', () => {
		insertInvoice(db, runId)
		assert.throws(() => insertInvoice(db, runId, { external_id: '7000032', balance_cents: 1500 }), /CHECK/)
		assert.throws(() => insertInvoice(db, runId, { external_id: '7000033', status: 'paid', balance_cents: 0 }), /CHECK/)
		insertInvoice(db, runId, { external_id: '7000034', status: 'paid', balance_cents: 0, paid_at: '2026-10-13', paid_ref: '008800119', paid_run_id: runId })
	})

	it('RN19: el mismo deuda_id no se guarda dos veces', () => {
		insertInvoice(db, runId)
		assert.throws(() => insertInvoice(db, runId), /UNIQUE/)
	})

	it('D38: no se puede borrar algo que otro dato usa', () => {
		insertInvoice(db, runId)
		assert.throws(() => db.prepare("DELETE FROM customers WHERE customer_key = 'V9876543'").run(), /FOREIGN KEY/)
		assert.throws(() => db.prepare('DELETE FROM contracts WHERE number = 900103').run(), /FOREIGN KEY/)
		assert.throws(() => db.prepare('DELETE FROM runs').run(), /FOREIGN KEY/)
	})

	it('RF34, CA36: al arrancar, una corrida que quedó en curso por un corte pasa a fallida, con el motivo; las demás no cambian', () => {
		const interrupted = seedRun(db, 'running')
		const count = failInterruptedRuns(db, '2026-10-13T11:00:00.000Z')
		assert.equal(count, 1)
		const row = db.prepare('SELECT status, finished_at, error FROM runs WHERE id = ?').get(interrupted) as Record<string, unknown>
		assert.equal(row.status, 'failed')
		assert.equal(row.finished_at, '2026-10-13T11:00:00.000Z')
		assert.match(String(row.error), /^Se interrumpió porque el servidor se reinició\. No quedó nada a medias/)
		assert.equal((db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as Record<string, unknown>).status, 'completed')
		assert.equal(failInterruptedRuns(db, '2026-10-13T12:00:00.000Z'), 0, 'la segunda vez no hay nada que cerrar')
	})

	it('RN36: nunca hay dos corridas en curso', () => {
		seedRun(db, 'running')
		assert.throws(() => seedRun(db, 'running'), /UNIQUE/)
	})

	it('RN34: una transacción que falla no deja nada a medias', () => {
		assert.throws(() => transaction(db, () => {
			insertInvoice(db, runId)
			insertInvoice(db, runId)
		}))
		assert.equal((db.prepare('SELECT COUNT(*) AS n FROM invoices').get() as { n: number }).n, 0)
	})

	it('los rangos de la configuración del proveedor se respetan en la base', () => {
		assert.throws(() => db.prepare('UPDATE providers SET grace_days = 61').run(), /CHECK/)
		assert.throws(() => db.prepare('UPDATE providers SET window_months = 4').run(), /CHECK/)
		assert.throws(() => db.prepare('UPDATE providers SET max_recent = 0').run(), /CHECK/)
		assert.throws(() => db.prepare("UPDATE providers SET import_states = '[]'").run(), /CHECK/)
		assert.throws(() => db.prepare('UPDATE providers SET auto_enabled = 1, auto_hour = NULL').run(), /CHECK/)
	})
})
