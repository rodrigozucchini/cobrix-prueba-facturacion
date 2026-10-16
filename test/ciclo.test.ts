/**
 * The full cycle against the simulated invoice manager, with the exact numbers of the assignment
 * (ENUNCIADO §5) and of the spec's acceptance criteria. Import: CA7–CA18. Payments: CA19–CA25.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { after, before, describe, it } from 'node:test'

import { createAuditLog } from '../src/cobrix/audit.ts'
import type { BillingClient } from '../src/cobrix/billing/client.ts'
import { openDatabase } from '../src/cobrix/store/db.ts'
import { readRunDetail } from '../src/cobrix/store/runs.ts'
import { saveProvider } from '../src/cobrix/store/settings.ts'
import { createCobrixApp } from '../src/server/app.ts'
import type { RunDetail } from '../src/shared/api-types.ts'
import { startSandbox, type Sandbox } from './helpers/sandbox.ts'

type Row = Record<string, unknown>

const count = (db: DatabaseSync, sql: string, ...params: Array<string | number>) => Number((db.prepare(sql).get(...params) as Row).n)
const rowsOf = (detail: RunDetail, name: string) => detail.rows.filter(row => row.customerName === name)

describe('ciclo: importación desde Cobrix vacío', () => {
	let env: Sandbox
	let simulated: RunDetail
	let imported: RunDetail
	let again: RunDetail

	before(async () => {
		env = await startSandbox()
		simulated = await env.run(true)
		imported = await env.run(false)
		again = await env.run(false)
	})
	after(() => env.close())

	it('CA7: simular dice 42 cuotas, 20 clientes y USD 1.235,00, y no crea nada', () => {
		assert.equal(simulated.status, 'completed')
		assert.equal(simulated.simulation, true)
		assert.equal(simulated.counters.invoicesNew, 42)
		assert.equal(simulated.counters.customersNew, 20)
		assert.equal(simulated.counters.amountNewCents, 123_500)
		assert.match(simulated.summary ?? '', /Se importarían: 42/)
		assert.equal(simulated.rows.filter(row => row.outcome === 'imported').length, 42)
	})

	it('CA8: importar crea 20 clientes y 42 facturas abiertas por USD 1.235,00, de CBX-000001 a CBX-000042', () => {
		assert.equal(imported.status, 'completed')
		assert.equal(count(env.db, 'SELECT COUNT(*) AS n FROM customers'), 20)
		assert.equal(count(env.db, "SELECT COUNT(*) AS n FROM invoices WHERE status = 'open'"), 42)
		assert.equal(count(env.db, 'SELECT SUM(balance_cents) AS n FROM invoices'), 123_500)
		const ids = (env.db.prepare('SELECT id FROM invoices ORDER BY id').all() as Row[]).map(row => Number(row.id))
		assert.deepEqual([ids[0], ids.at(-1), ids.length], [1, 42, 42])
		assert.ok(imported.rows.some(row => row.reason === 'Factura CBX-000001 creada.'))
		assert.match(imported.summary ?? '', /^Contratos leídos: 27 · Importadas: 42 · Clientes creados: 20 · Excluidas por estado: 9/)
	})

	it('CA9: 27 contratos leídos, 9 excluidas por estado, JORGE por moneda, SOFIA residual y LAURA sin deuda', () => {
		assert.equal(imported.counters.contractsRead, 27)
		assert.equal(imported.counters.excludedByStatus, 9)
		assert.equal(imported.counters.contractsCurrency, 1)
		assert.equal(imported.counters.residual, 1)
		assert.equal(imported.counters.contractsNoDebt, 1)
		assert.ok(rowsOf(imported, 'JORGE CASTILLO').every(row => row.outcome === 'currency_incoherent'))
		assert.deepEqual(rowsOf(imported, 'SOFIA TORRES').map(row => row.outcome).sort(), ['imported', 'residual'])
		assert.deepEqual(rowsOf(imported, 'LAURA MENDEZ').map(row => row.outcome), ['no_debt'])
	})

	it('CA10: importar otra vez crea 0 facturas y muestra 42 «Ya importada»', () => {
		assert.equal(again.counters.invoicesNew, 0)
		assert.equal(again.counters.alreadyImported, 42)
		assert.equal(count(env.db, 'SELECT COUNT(*) AS n FROM invoices'), 42)
	})

	it('CA11: LUIS GOMEZ es 1 cliente con 2 contratos y 5 facturas abiertas por USD 115,00, la más vieja del 1 jul 2026', () => {
		assert.equal(count(env.db, "SELECT COUNT(*) AS n FROM customers WHERE name = 'LUIS GOMEZ'"), 1)
		assert.equal(count(env.db, "SELECT COUNT(*) AS n FROM contracts WHERE customer_key = 'V9876543'"), 2)
		assert.equal(count(env.db, "SELECT COUNT(*) AS n FROM invoices WHERE customer_key = 'V9876543' AND status = 'open'"), 5)
		assert.equal(count(env.db, "SELECT SUM(balance_cents) AS n FROM invoices WHERE customer_key = 'V9876543'"), 11_500)
		assert.equal((env.db.prepare("SELECT MIN(due_date) AS d FROM invoices WHERE customer_key = 'V9876543'").get() as Row).d, '2026-07-01')
	})

	it('CA12: ELENA RUIZ tiene ID 9000123 y documento 09000123; EL FARO, ID J401234567 y es jurídica', () => {
		assert.deepEqual({ ...(env.db.prepare("SELECT document, person_type FROM customers WHERE customer_key = '9000123'").get() as Row) }, { document: '09000123', person_type: 'natural' })
		assert.deepEqual({ ...(env.db.prepare("SELECT document, person_type FROM customers WHERE customer_key = 'J401234567'").get() as Row) }, { document: 'J-40123456-7', person_type: 'juridica' })
	})

	it('CA13: no aparecen como clientes CARLOS, ROSA, PEDRO, ANDRES, LAURA ni JORGE', () => {
		for (const name of ['CARLOS ROJAS', 'ROSA DIAZ', 'PEDRO LEON', 'ANDRES VARGAS', 'LAURA MENDEZ', 'JORGE CASTILLO']) {
			assert.equal(count(env.db, 'SELECT COUNT(*) AS n FROM customers WHERE name = ?', name), 0, name)
		}
	})

	it('RF13, D26: se guardan los 27 contratos leídos, aunque no se haya importado ninguna de sus cuotas', () => {
		assert.equal(count(env.db, 'SELECT COUNT(*) AS n FROM contracts'), 27)
		assert.equal(count(env.db, "SELECT COUNT(*) AS n FROM contracts WHERE holder_name = 'CARLOS ROJAS' AND status = 'CORTESIA'"), 1)
	})

	it('RN6: el correo se guarda en minúsculas; cada cliente y factura nueva deja su evento', () => {
		assert.equal((env.db.prepare("SELECT email FROM customers WHERE customer_key = 'V9876543'").get() as Row).email, 'luis.gomez@example.com')
		assert.equal(count(env.db, "SELECT COUNT(*) AS n FROM events WHERE kind = 'customer_created'"), 20)
		assert.equal(count(env.db, "SELECT COUNT(*) AS n FROM events WHERE kind = 'invoice_imported'"), 42)
	})
})

describe('ciclo: reglas de importación configuradas (simulaciones)', () => {
	it('CA14: con ventana de 3 meses, MIGUEL ANGEL SOTO tiene 4 que se importarían y 4 fuera de la ventana', async () => {
		const env = await startSandbox({ windowMonths: 3 })
		try {
			const miguel = rowsOf(await env.run(true), 'MIGUEL ANGEL SOTO')
			assert.equal(miguel.filter(row => row.outcome === 'imported').length, 4)
			assert.equal(miguel.filter(row => row.outcome === 'outside_window').length, 4)
		} finally {
			await env.close()
		}
	})

	it('CA15: con máximo 2, MIGUEL ANGEL SOTO tiene septiembre y octubre, y 6 excluidas por máximo', async () => {
		const env = await startSandbox({ maxRecent: 2 })
		try {
			const miguel = rowsOf(await env.run(true), 'MIGUEL ANGEL SOTO')
			assert.deepEqual(miguel.filter(row => row.outcome === 'imported').map(row => row.period), ['2026-09', '2026-10'])
			assert.equal(miguel.filter(row => row.outcome === 'excluded_max').length, 6)
		} finally {
			await env.close()
		}
	})

	it('CA16: excluyendo J, las 2 cuotas de COMERCIAL EL FARO quedan excluidas por tipo de documento', async () => {
		const env = await startSandbox({ excludedDocTypes: ['J'] })
		try {
			const faro = rowsOf(await env.run(true), 'COMERCIAL EL FARO, C.A.')
			assert.deepEqual(faro.map(row => row.outcome), ['excluded_doc_type', 'excluded_doc_type'])
		} finally {
			await env.close()
		}
	})

	it('CA17: con tope de 10 facturas, 10 se importarían y 32 quedan frenadas', async () => {
		const env = await startSandbox({ capInvoices: 10 })
		try {
			const detail = await env.run(true)
			assert.equal(detail.counters.invoicesNew, 10)
			assert.equal(detail.counters.blockedByCap, 32)
		} finally {
			await env.close()
		}
	})

	it('CA18: con 5 días de gracia, una factura de agosto 2026 vence el 1 ago y corta el 6 ago', async () => {
		const env = await startSandbox({ graceDays: 5 })
		try {
			await env.run(false)
			const august = env.db.prepare("SELECT due_date, cut_date FROM invoices WHERE period = '2026-08' LIMIT 1").get() as Row
			assert.deepEqual({ ...august }, { due_date: '2026-08-01', cut_date: '2026-08-06' })
		} finally {
			await env.close()
		}
	})
})

describe('ciclo: pagos en la caja del ISP y «Actualizar pagadas»', () => {
	let env: Sandbox
	let simulated: RunDetail
	let updated: RunDetail
	let repeated: RunDetail
	let reimported: RunDetail
	let invoicesBeforeUpdate: string
	let invoicesAfterSimulation: string

	before(async () => {
		env = await startSandbox()
		await env.run(false)
		await env.payAsInAssignment()
		invoicesBeforeUpdate = JSON.stringify(env.db.prepare('SELECT * FROM invoices ORDER BY id').all())
		simulated = await env.run(true, 'paid')
		invoicesAfterSimulation = JSON.stringify(env.db.prepare('SELECT * FROM invoices ORDER BY id').all())
		updated = await env.run(false, 'paid')
		repeated = await env.run(false, 'paid')
		reimported = await env.run(false, 'import')
	})
	after(() => env.close())

	const invoicesOf = (name: string) => env.db.prepare(
		'SELECT i.period, i.status, i.balance_cents, i.paid_at, i.paid_ref FROM invoices i JOIN customers c ON c.customer_key = i.customer_key WHERE c.name = ? ORDER BY i.contract_number, i.period',
	).all(name) as Row[]

	it('CA19: simular dice que se marcarían 8 pagadas, y no cambia ninguna factura', () => {
		assert.equal(simulated.status, 'completed')
		assert.equal(simulated.counters.markedPaid, 8)
		assert.match(simulated.summary ?? '', /Se marcarían pagadas: 8/)
		assert.ok(simulated.rows.some(row => row.reason.startsWith('Se marcaría pagada')))
		assert.equal(invoicesAfterSimulation, invoicesBeforeUpdate)
	})

	it('CA20: marca pagadas las 3 de ANA, 1 de LUIS (julio, 900103), las 2 de EL FARO y las 2 más viejas de MIGUEL: 8, con su factura del administrador', () => {
		assert.equal(updated.counters.markedPaid, 8)
		assert.equal(updated.counters.invoicesChecked, 42)
		assert.ok(invoicesOf('ANA PEREZ').every(row => row.status === 'paid'))
		const luis = invoicesOf('LUIS GOMEZ').filter(row => row.status === 'paid')
		assert.deepEqual(luis.map(row => row.period), ['2026-07'])
		assert.ok(invoicesOf('COMERCIAL EL FARO, C.A.').every(row => row.status === 'paid'))
		assert.deepEqual(invoicesOf('MIGUEL ANGEL SOTO').filter(row => row.status === 'paid').map(row => row.period), ['2026-03', '2026-04'])
		for (const row of env.db.prepare("SELECT paid_at, paid_ref, balance_cents FROM invoices WHERE status = 'paid'").all() as Row[]) {
			assert.equal(row.paid_at, '2026-10-13')
			assert.match(String(row.paid_ref), /^0088\d{5}$/)
			assert.equal(row.balance_cents, 0)
		}
		assert.equal(Number((env.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'invoice_paid'").get() as Row).n), 8)
	})

	it('CA21: 1 abono parcial, la cuota de agosto de LUIS: el ISP dice USD 15,00 y Cobrix tiene USD 20,00; sigue abierta por USD 20,00', () => {
		assert.equal(updated.counters.partial, 1)
		const partial = updated.rows.find(row => row.outcome === 'partial')
		assert.equal(partial?.customerName, 'LUIS GOMEZ')
		assert.equal(partial?.period, '2026-08')
		assert.match(partial?.reason ?? '', /USD 15,00.*USD 20,00/)
		const august = invoicesOf('LUIS GOMEZ').find(row => row.period === '2026-08')
		assert.deepEqual([august?.status, august?.balance_cents], ['open', 2000])
	})

	it('CA22: las facturas de ELENA RUIZ siguen abiertas', () => {
		assert.ok(invoicesOf('ELENA RUIZ').every(row => row.status === 'open'))
	})

	it('CA23: resultado final, 8 pagadas y 34 abiertas por USD 955,00; ninguna sin evidencia ni en revisión', () => {
		assert.equal(Number((env.db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE status = 'paid'").get() as Row).n), 8)
		assert.equal(Number((env.db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE status = 'open'").get() as Row).n), 34)
		assert.equal(Number((env.db.prepare("SELECT SUM(balance_cents) AS n FROM invoices WHERE status = 'open'").get() as Row).n), 95_500)
		assert.equal(updated.counters.noEvidence, 0)
		assert.equal(updated.counters.underReview, 0)
		assert.equal(updated.counters.stillOpen, 33)
		assert.match(updated.summary ?? '', /^Facturas consultadas: 42 · Marcadas pagadas: 8 · Abono parcial: 1 · Siguen pendientes: 33/)
	})

	it('CA24: repetir la actualización marca 0 y no cambia los totales', () => {
		assert.equal(repeated.counters.markedPaid, 0)
		assert.equal(repeated.counters.invoicesChecked, 34)
		assert.equal(Number((env.db.prepare("SELECT SUM(balance_cents) AS n FROM invoices WHERE status = 'open'").get() as Row).n), 95_500)
	})

	it('CA25: importar después de los pagos crea 0 facturas y muestra 34 «Ya importada»', () => {
		assert.equal(reimported.counters.invoicesNew, 0)
		assert.equal(reimported.counters.alreadyImported, 34)
	})
})

describe('ciclo: «Actualizar pagadas» sin facturas abiertas', () => {
	it('CL26: termina completada con 0 consultadas, sin conectarse al administrador', async () => {
		const calls: string[] = []
		const spy: BillingClient = {
			connect: async () => { calls.push('connect') },
			listContractIds: async () => { calls.push('list'); return {} },
			getContract: async () => { calls.push('contract'); return [] },
			getLedger: async () => { calls.push('ledger'); return {} },
		}
		const db = openDatabase(':memory:')
		saveProvider(db, {
			name: 'Administrador de facturas', apiUrl: 'http://127.0.0.1:9', apiUser: 'cobrix', apiPassword: 'x', importStates: ['ACTIVO'],
			windowMonths: null, maxRecent: null, graceDays: 0, capInvoices: 500, capAmountCents: 5_000_000, excludedDocTypes: [], autoEnabled: false, autoHour: null,
		}, '2026-10-13T10:00:00.000Z')
		const dir = mkdtempSync(join(tmpdir(), 'cobrix-cl26-'))
		const app = createCobrixApp({ db, panelDir: '/nonexistent', audit: createAuditLog({ dir: join(dir, 'logs') }), clientFor: () => spy })
		const { run, finished } = app.engine.start('paid', { simulation: false, origin: 'manual' })
		await finished
		const detail = readRunDetail(db, run.id)
		assert.equal(detail?.status, 'completed')
		assert.equal(detail?.counters.invoicesChecked, 0)
		assert.equal(detail?.summary, 'No hay facturas abiertas para revisar. Importa primero desde el administrador.')
		assert.deepEqual(calls, [])
	})
})

