/**
 * The automatic run (RF6, RN37, D22, D23, DT9, CL20, P37, P38): at the configured hour of the
 * real Caracas clock, once a day, «Importar» and then «Actualizar pagadas», the second even if the
 * first failed. One that cannot start stays in the history as failed, with its reason. With a
 * test clock and a fake administrator client: nothing here talks to the network.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { describe, it } from 'node:test'

import { createAuditLog, type AuditLog } from '../src/cobrix/audit.ts'
import { BillingError, type BillingClient } from '../src/cobrix/billing/client.ts'
import { createRunEngine, type RunEngine } from '../src/cobrix/runs/engine.ts'
import { startScheduler } from '../src/cobrix/scheduler.ts'
import { openDatabase } from '../src/cobrix/store/db.ts'
import { listRuns } from '../src/cobrix/store/runs.ts'
import { saveProvider } from '../src/cobrix/store/settings.ts'
import type { ProviderInput } from '../src/shared/api-types.ts'

process.env.SANDBOX_TODAY = '2026-10-13'

const PROVIDER: ProviderInput = {
	name: 'Administrador de facturas', apiUrl: 'http://127.0.0.1:9', apiUser: 'cobrix', apiPassword: 'cobrix-sandbox',
	importStates: ['ACTIVO', 'CORTADO'], windowMonths: null, maxRecent: null, graceDays: 0, capInvoices: 500,
	capAmountCents: 5_000_000, excludedDocTypes: [], autoEnabled: true, autoHour: 10,
}

/** An administrator with no contracts: an import completes reading 0. */
const emptyClient: BillingClient = {
	connect: async () => {},
	listContractIds: async () => ({ data: [], pagination: { total: 0, total_pages: 1 } }),
	getContract: async () => [],
	getLedger: async () => ({ data: [] }),
}

interface Setup {
	readonly db: DatabaseSync
	readonly engine: RunEngine
	readonly audit: AuditLog
	readonly logsDir: string
	/** Moves the test clock. */
	at(iso: string): void
	tick(): Promise<void>
	/** `kind/origin/status` of every run, oldest first. */
	runs(): string[]
}

function setup(provider: Partial<ProviderInput> = {}, client: BillingClient = emptyClient): Setup {
	const db = openDatabase(':memory:')
	saveProvider(db, { ...PROVIDER, ...provider }, '2026-10-13T10:00:00.000Z')
	const logsDir = join(mkdtempSync(join(tmpdir(), 'cobrix-scheduler-')), 'logs')
	const audit = createAuditLog({ dir: logsDir })
	let clock = new Date('2026-10-15T00:00:00Z')
	const engine = createRunEngine({ db, audit, now: () => clock.toISOString(), currentPeriod: () => '2026-10', clientFor: () => client })
	const scheduler = startScheduler({ db, engine, audit, now: () => clock, everyMs: null })
	return {
		db,
		engine,
		audit,
		logsDir,
		at(iso) { clock = new Date(iso) },
		tick: () => scheduler.tick(),
		runs: () => listRuns(db).reverse().map(run => `${run.kind}/${run.origin}/${run.status}`),
	}
}

describe('corrida automática', () => {
	it('RF6: desactivada no corre, aunque sea la hora', async () => {
		const s = setup({ autoEnabled: false, autoHour: 10 })
		s.at('2026-10-15T14:00:00Z')
		await s.tick()
		assert.deepEqual(s.runs(), [])
	})

	it('RN37, D22: a la hora configurada de Caracas (UTC−4) corre «Importar» y después «Actualizar pagadas», reales y automáticas', async () => {
		const s = setup()
		s.at('2026-10-15T10:00:00Z') // 06:00 en Caracas: todavía no
		await s.tick()
		assert.deepEqual(s.runs(), [])
		s.at('2026-10-15T14:00:00Z') // 10:00 en Caracas
		await s.tick()
		assert.deepEqual(s.runs(), ['import/auto/completed', 'paid/auto/completed'])
		assert.ok(listRuns(s.db).every(run => !run.simulation))
	})

	it('P38: dentro de la hora configurada también corre (10:40 con la hora 10)', async () => {
		const s = setup()
		s.at('2026-10-15T14:40:00Z')
		await s.tick()
		assert.deepEqual(s.runs(), ['import/auto/completed', 'paid/auto/completed'])
	})

	it('RN37, DT9: corre una sola vez por día; al día siguiente, otra vez', async () => {
		const s = setup()
		s.at('2026-10-15T14:00:00Z')
		await s.tick()
		s.at('2026-10-15T14:30:00Z')
		await s.tick()
		assert.equal(s.runs().length, 2, 'en la misma hora no repite')
		s.at('2026-10-16T14:00:00Z')
		await s.tick()
		assert.equal(s.runs().length, 4, 'al día siguiente vuelve a correr, aunque SANDBOX_TODAY siga fijo')
	})

	it('RN37: si el servidor estaba apagado a esa hora, no se recupera después', async () => {
		const s = setup()
		s.at('2026-10-15T15:05:00Z') // 11:05 en Caracas
		await s.tick()
		assert.deepEqual(s.runs(), [])
	})

	it('D23: si la importación falla, «Actualizar pagadas» corre igual', async () => {
		const failing: BillingClient = {
			...emptyClient,
			listContractIds: async () => { throw new BillingError('credentials_rejected', 'El administrador rechazó el usuario o la contraseña.') },
		}
		const s = setup({}, failing)
		s.at('2026-10-15T14:00:00Z')
		await s.tick()
		assert.deepEqual(s.runs(), ['import/auto/failed', 'paid/auto/completed'])
		s.at('2026-10-15T14:00:30Z')
		await s.tick()
		assert.equal(s.runs().length, 2, 'una importación fallida también cuenta como «ya corrió hoy»')
	})

	it('CL20: con una corrida manual en curso, las dos automáticas quedan fallidas con el motivo, y no se reintentan', async () => {
		let release = () => {}
		const gate = new Promise<void>(resolve => { release = resolve })
		const slow: BillingClient = { ...emptyClient, listContractIds: async () => { await gate; return { data: [], pagination: { total: 0, total_pages: 1 } } } }
		const s = setup({}, slow)
		const manual = s.engine.start('import', { simulation: true, origin: 'manual' })
		s.at('2026-10-15T14:00:00Z')
		await s.tick()
		const auto = listRuns(s.db).filter(run => run.origin === 'auto').reverse()
		assert.deepEqual(auto.map(run => `${run.kind}/${run.status}`), ['import/failed', 'paid/failed'])
		for (const run of auto) assert.equal(run.error, 'No se pudo correr: ya había una corrida en curso.')
		release()
		await manual.finished
		s.at('2026-10-15T14:00:30Z')
		await s.tick()
		assert.equal(listRuns(s.db).filter(run => run.origin === 'auto').length, 2)
	})

	it('P37: sin la contraseña del administrador, las dos automáticas quedan fallidas diciendo qué falta', async () => {
		const s = setup({ apiPassword: '' })
		s.at('2026-10-15T14:00:00Z')
		await s.tick()
		const auto = listRuns(s.db).reverse()
		assert.deepEqual(auto.map(run => `${run.kind}/${run.status}`), ['import/failed', 'paid/failed'])
		assert.match(auto[0]?.error ?? '', /^No se pudo correr: falta configurar el administrador de facturas/)
	})

	it('RF51: las que no pudieron iniciarse quedan en la auditoría como run.finished fallidas, con actor sistema', async () => {
		const s = setup({ apiPassword: '' })
		s.at('2026-10-15T14:00:00Z')
		await s.tick()
		const { readdirSync, readFileSync } = await import('node:fs')
		const lines = readdirSync(s.logsDir).flatMap(file => readFileSync(join(s.logsDir, file), 'utf8').trim().split('\n')).map(line => JSON.parse(line) as Record<string, unknown>)
		assert.deepEqual(lines.map(line => [line.actor, line.action, line.kind, line.status, line.origin]), [
			['sistema', 'run.finished', 'import', 'failed', 'auto'],
			['sistema', 'run.finished', 'paid', 'failed', 'auto'],
		])
	})

	it('dos ticks a la vez no se superponen', async () => {
		const s = setup()
		s.at('2026-10-15T14:00:00Z')
		await Promise.all([s.tick(), s.tick()])
		assert.deepEqual(s.runs(), ['import/auto/completed', 'paid/auto/completed'])
	})
})
