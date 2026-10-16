/**
 * The audit log (extras/punto-diferencial RF50–RF54): one JSON line per action, in a daily file
 * outside the database, append only, never secrets, and never stops the action it records. Then
 * end to end over HTTP, as the panel uses it (CA52–CA54).
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, it, type TestContext } from 'node:test'

import { createAuditLog } from '../src/cobrix/audit.ts'
import { openDatabase } from '../src/cobrix/store/db.ts'
import { createCobrixApp } from '../src/server/app.ts'
import type { ProviderInput, RunListItem } from '../src/shared/api-types.ts'
import { JSON_HEADERS, startSandbox, type Sandbox } from './helpers/sandbox.ts'

const lines = (file: string) => readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)

describe('registro de auditoría', () => {
	let base: string

	beforeEach(() => {
		base = mkdtempSync(join(tmpdir(), 'cobrix-audit-'))
	})
	afterEach(() => rmSync(base, { recursive: true, force: true }))

	it('RN44: una línea JSON por acción, con momento, autor, acción y datos', () => {
		const dir = join(base, 'logs')
		const audit = createAuditLog({ dir, now: () => new Date('2026-10-13T14:41:03.000Z') })
		audit.record('operador', 'run.finished', { runId: 2, status: 'completed', summary: 'Importadas: 42 · Clientes creados: 20' })
		const [entry] = lines(join(dir, 'cobrix-2026-10-13.log'))
		assert.deepEqual(entry, {
			at: '2026-10-13T14:41:03.000Z',
			actor: 'operador',
			action: 'run.finished',
			runId: 2,
			status: 'completed',
			summary: 'Importadas: 42 · Clientes creados: 20',
		})
	})

	it('RF50: solo agrega líneas; lo anterior sigue ahí', () => {
		const dir = join(base, 'logs')
		const audit = createAuditLog({ dir, now: () => new Date('2026-10-13T14:00:00.000Z') })
		audit.record('operador', 'run.started', { runId: 1 })
		audit.record('sistema', 'run.started', { runId: 2 })
		const entries = lines(join(dir, 'cobrix-2026-10-13.log'))
		assert.equal(entries.length, 2)
		assert.equal(entries[0]?.runId, 1)
		assert.equal(entries[1]?.actor, 'sistema')
	})

	it('CL31: crea la carpeta si no existe', () => {
		const dir = join(base, 'a', 'b', 'logs')
		createAuditLog({ dir, now: () => new Date('2026-10-13T14:00:00.000Z') }).record('operador', 'connection.tested', { ok: true })
		assert.deepEqual(readdirSync(dir), ['cobrix-2026-10-13.log'])
	})

	it('CL32, DT17: el archivo cambia con el día real de Caracas', () => {
		const dir = join(base, 'logs')
		let now = new Date('2026-10-14T03:59:00.000Z') // 23:59 del 13 en Caracas
		const audit = createAuditLog({ dir, now: () => now })
		audit.record('operador', 'export.csv', { file: 'clientes.csv' })
		now = new Date('2026-10-14T04:01:00.000Z') // 00:01 del 14 en Caracas
		audit.record('operador', 'export.csv', { file: 'clientes.csv' })
		assert.deepEqual(readdirSync(dir).sort(), ['cobrix-2026-10-13.log', 'cobrix-2026-10-14.log'])
	})

	it('RN44: los datos no pueden pisar el momento, el autor ni la acción', () => {
		const dir = join(base, 'logs')
		const audit = createAuditLog({ dir, now: () => new Date('2026-10-13T14:00:00.000Z') })
		audit.record('operador', 'export.csv', { action: 'otra', actor: 'sistema', at: 'ayer', file: 'clientes-2026-10-13.csv' })
		const [entry] = lines(join(dir, 'cobrix-2026-10-13.log'))
		assert.equal(entry?.action, 'export.csv')
		assert.equal(entry?.actor, 'operador')
		assert.equal(entry?.at, '2026-10-13T14:00:00.000Z')
		assert.equal(entry?.file, 'clientes-2026-10-13.csv')
	})

	it('RF54: si no se puede escribir, la acción sigue y avisa en la consola', (t: TestContext) => {
		const blocked = join(base, 'no-es-carpeta')
		writeFileSync(blocked, 'un archivo donde debería ir la carpeta')
		const errors = t.mock.method(console, 'error', () => {})
		const audit = createAuditLog({ dir: join(blocked, 'logs'), now: () => new Date('2026-10-13T14:00:00.000Z') })
		assert.doesNotThrow(() => audit.record('operador', 'settings.saved', { changed: {} }))
		assert.equal(errors.mock.callCount(), 1)
		assert.match(String(errors.mock.calls[0]?.arguments[0]), /auditoría/)
	})
})

describe('auditoría de punta a punta, por HTTP', () => {
	let sandbox: Sandbox
	let actions: string[]
	/** Every line before the last action, and every line at the end. */
	let earlier: Array<Record<string, unknown>>
	let all: Array<Record<string, unknown>>

	const call = (method: string, path: string, body?: unknown) =>
		fetch(`${sandbox.base}${path}`, { method, ...(body === undefined ? {} : { headers: JSON_HEADERS, body: JSON.stringify(body) }) })
	const runToEnd = async (tipo: 'importacion' | 'pagadas') => {
		const run = await (await call('POST', '/api/corridas', { tipo, simulacion: false })).json() as RunListItem
		for (let i = 0; i < 200; i++) {
			if ((await sandbox.get<RunListItem>(`/api/corridas/${run.id}`)).body.status !== 'running') return
			await new Promise(resolve => setTimeout(resolve, 20))
		}
		assert.fail('la corrida no terminó')
	}

	before(async () => {
		sandbox = await startSandbox()
		const provider: ProviderInput = {
			name: 'Administrador de facturas', apiUrl: sandbox.billingUrl, apiUser: 'cobrix', apiPassword: 'cobrix-sandbox',
			importStates: ['ACTIVO', 'CORTADO'], windowMonths: null, maxRecent: null, graceDays: 0, capInvoices: 500,
			capAmountCents: 5_000_000, excludedDocTypes: [], autoEnabled: false, autoHour: null,
		}
		assert.equal((await call('PUT', '/api/configuracion', { company: { name: 'ISP de Prueba, C.A.', rif: 'J-12345678-9', email: 'cobranza@isp.example' }, provider })).status, 200)
		assert.equal((await call('POST', '/api/configuracion/probar-conexion', { apiUrl: sandbox.billingUrl, apiUser: 'cobrix', apiPassword: 'cobrix-sandbox' })).status, 200)
		await runToEnd('importacion')
		await sandbox.payAsInAssignment()
		await runToEnd('pagadas')
		assert.equal((await call('GET', '/api/clientes.csv')).status, 200)
		assert.equal((await call('GET', '/api/corridas/1.csv')).status, 200)
		earlier = sandbox.auditLines()
		assert.equal((await call('GET', '/api/clientes/V9876543/estado-de-cuenta')).status, 200)
		all = sandbox.auditLines()
		actions = all.map(line => String(line.action))
	})
	after(() => sandbox.close())

	it('CA52, RF51: quedan todas las acciones, en el orden en que pasaron', () => {
		assert.deepEqual([...new Set(actions)], ['settings.saved', 'connection.tested', 'run.started', 'run.finished', 'export.csv', 'statement.generated'])
		assert.deepEqual(all.filter(line => line.action === 'run.finished').map(line => [line.kind, line.status]), [['import', 'completed'], ['paid', 'completed']])
	})

	it('CA52, RN44: cada acción agrega su línea y las anteriores siguen igual', () => {
		assert.deepEqual(all.slice(0, earlier.length), earlier)
		assert.equal(all.length, earlier.length + 1)
		assert.equal(all.at(-1)?.action, 'statement.generated')
	})

	it('CA53, RF52: la contraseña cobrix-sandbox no aparece en ninguna línea', () => {
		assert.ok(all.length >= 9)
		assert.doesNotMatch(JSON.stringify(all), /cobrix-sandbox/)
	})

	it('CA54, RF53: con otra carpeta de auditoría, las líneas nuevas van a la carpeta nueva y la vieja queda igual', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'cobrix-audit-dir-'))
		const db = openDatabase(':memory:')
		const company = { company: { name: 'ISP de Prueba, C.A.', rif: 'J-12345678-9', email: 'cobranza@isp.example' } }
		const save = async (auditDir: string) => {
			const app = createCobrixApp({ db, panelDir: '/nonexistent', audit: createAuditLog({ dir: auditDir }) })
			const base = `http://127.0.0.1:${await app.listen(0)}`
			try {
				assert.equal((await fetch(`${base}/api/configuracion`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(company) })).status, 200)
			} finally {
				await app.close()
			}
		}
		const read = (auditDir: string) => readdirSync(auditDir).flatMap(file => lines(join(auditDir, file)))
		try {
			await save(join(dir, 'logs-a'))
			const first = read(join(dir, 'logs-a'))
			await save(join(dir, 'logs-b'))
			assert.deepEqual(read(join(dir, 'logs-a')), first, 'la carpeta vieja no cambia')
			assert.deepEqual(read(join(dir, 'logs-b')).map(line => line.action), ['settings.saved'])
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})
