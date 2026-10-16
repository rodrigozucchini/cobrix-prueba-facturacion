/**
 * The sandbox the cycle tests run on (P26): a fresh simulated administrator in a temporary
 * folder, an empty Cobrix configured with the sandbox credentials and listening on a free port,
 * the payments of the assignment (ENUNCIADO §5) and a helper to run to the end. Not a test file:
 * `npm test` only picks up `*.test.ts`.
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import { seedBillingApi } from '../../src/billing-api/seed.ts'
import { createBillingApiServer } from '../../src/billing-api/server.ts'
import { createAuditLog } from '../../src/cobrix/audit.ts'
import { openDatabase } from '../../src/cobrix/store/db.ts'
import { readRunDetail } from '../../src/cobrix/store/runs.ts'
import { saveProvider } from '../../src/cobrix/store/settings.ts'
import { createCobrixApp, type CobrixApp } from '../../src/server/app.ts'
import type { ProviderInput, RunDetail } from '../../src/shared/api-types.ts'

process.env.SANDBOX_TODAY = '2026-10-13'

/** Writes to Cobrix's API are JSON (D54). */
export const JSON_HEADERS = { 'content-type': 'application/json' }

export interface Sandbox {
	readonly db: DatabaseSync
	readonly app: CobrixApp
	/** Cobrix's API: `${base}/api/resumen`. */
	readonly base: string
	/** The simulated administrator, for `/__sim/*`. */
	readonly billingUrl: string
	/** Runs to the end through the engine and returns its detail. */
	run(simulation: boolean, kind?: 'import' | 'paid'): Promise<RunDetail>
	/** GET on Cobrix's API, with its status and JSON body. */
	get<T>(path: string): Promise<{ status: number; body: T }>
	/** Every line written to the audit log so far. */
	auditLines(): Array<Record<string, unknown>>
	/** The payments of the assignment in the administrator's till, with ELENA's voided. */
	payAsInAssignment(): Promise<void>
	close(): Promise<void>
}

/** `rules: null` leaves Cobrix without a provider; `extra` replaces parts of the app (tests). */
export async function startSandbox(
	rules: Partial<ProviderInput> | null = {},
	extra: Partial<Parameters<typeof createCobrixApp>[0]> = {},
): Promise<Sandbox> {
	const dir = mkdtempSync(join(tmpdir(), 'cobrix-prueba-'))
	seedBillingApi(join(dir, 'billing.sqlite'))
	const billing = createBillingApiServer(join(dir, 'billing.sqlite'))
	const billingUrl = `http://127.0.0.1:${await billing.listen(0)}`
	const db = openDatabase(':memory:')
	if (rules) {
		saveProvider(db, {
			name: 'Administrador de facturas', apiUrl: billingUrl, apiUser: 'cobrix', apiPassword: 'cobrix-sandbox',
			importStates: ['ACTIVO', 'CORTADO'], windowMonths: null, maxRecent: null, graceDays: 0, capInvoices: 500,
			capAmountCents: 5_000_000, excludedDocTypes: [], autoEnabled: false, autoHour: null, ...rules,
		}, '2026-10-13T10:00:00.000Z')
	}
	const app = createCobrixApp({ db, panelDir: '/nonexistent', audit: createAuditLog({ dir: join(dir, 'logs') }), ...extra })
	const base = `http://127.0.0.1:${await app.listen(0)}`

	const sim = async (path: string, body: unknown) =>
		(await fetch(`${billingUrl}/__sim/${path}`, { method: 'POST', body: JSON.stringify(body) })).json() as Promise<Record<string, unknown>>

	return {
		db,
		app,
		base,
		billingUrl,
		async run(simulation, kind = 'import') {
			const { run, finished } = app.engine.start(kind, { simulation, origin: 'manual' })
			await finished
			const detail = readRunDetail(db, run.id)
			assert.ok(detail)
			return detail
		},
		async get<T>(path: string) {
			const response = await fetch(`${base}${path}`)
			return { status: response.status, body: await response.json() as T }
		},
		auditLines() {
			const logs = join(dir, 'logs')
			if (!existsSync(logs)) return []
			return readdirSync(logs).flatMap(file => readFileSync(join(logs, file), 'utf8').trim().split('\n')).map(line => JSON.parse(line) as Record<string, unknown>)
		},
		async payAsInAssignment() {
			await sim('pagar', { id_contrato: 900101 })
			await sim('pagar', { id_contrato: 900103, monto: 25 })
			await sim('pagar', { id_contrato: 900104 })
			await sim('pagar', { id_contrato: 900114, monto: 70 })
			const elena = await sim('pagar', { id_contrato: 900113 })
			await sim('anular', { id_factura: elena.id_factura })
		},
		async close() {
			await app.close()
			await billing.close()
			rmSync(dir, { recursive: true, force: true })
		},
	}
}
