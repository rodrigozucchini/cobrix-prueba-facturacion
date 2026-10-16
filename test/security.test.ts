/**
 * The basic security of Cobrix (D53–D55): the provider's password encrypted in the database,
 * writes that only the panel can make, and the security headers on every answer.
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { openDatabase } from '../src/cobrix/store/db.ts'
import { readProviderPassword, readSettings, saveProvider } from '../src/cobrix/store/settings.ts'
import type { ErrorBody, ProviderInput, RunListItem } from '../src/shared/api-types.ts'
import { JSON_HEADERS, startSandbox, type Sandbox } from './helpers/sandbox.ts'

const NOW = '2026-10-13T10:00:00.000Z'
const PROVIDER: ProviderInput = {
	name: 'Administrador de facturas', apiUrl: 'http://127.0.0.1:4310', apiUser: 'cobrix', apiPassword: 'cobrix-sandbox',
	importStates: ['ACTIVO', 'CORTADO'], windowMonths: null, maxRecent: null, graceDays: 0, capInvoices: 500,
	capAmountCents: 5_000_000, excludedDocTypes: [], autoEnabled: false, autoHour: null,
}
const stored = (db: ReturnType<typeof openDatabase>) =>
	String((db.prepare('SELECT api_password FROM providers WHERE id = 1').get() as Record<string, unknown>).api_password)

describe('D53: la contraseña del proveedor se guarda cifrada', () => {
	it('en la base no está en claro, y Cobrix la recupera para conectarse', () => {
		const db = openDatabase(':memory:')
		saveProvider(db, PROVIDER, NOW)
		assert.equal(stored(db).includes('cobrix-sandbox'), false)
		assert.equal(readProviderPassword(db), 'cobrix-sandbox')
		assert.equal(readSettings(db).provider.hasPassword, true)
	})

	it('cifrar dos veces la misma contraseña da textos distintos', () => {
		const db = openDatabase(':memory:')
		saveProvider(db, PROVIDER, NOW)
		const first = stored(db)
		saveProvider(db, PROVIDER, NOW)
		assert.notEqual(stored(db), first)
	})

	it('con otra clave, o guardada en claro antes de cifrar, no se usa y el panel la pide de nuevo', () => {
		const one = openDatabase(':memory:')
		saveProvider(one, PROVIDER, NOW)
		const other = openDatabase(':memory:')
		for (const value of [stored(one), 'cobrix-sandbox']) {
			other.prepare('UPDATE providers SET api_password = ? WHERE id = 1').run(value)
			assert.equal(readProviderPassword(other), '')
			assert.equal(readSettings(other).provider.hasPassword, false)
		}
	})

	it('la clave va en un archivo junto a la base, fuera de ella, y sirve al volver a abrirla', () => {
		const dir = mkdtempSync(join(tmpdir(), 'cobrix-clave-'))
		try {
			const path = join(dir, 'cobrix.sqlite')
			const db = openDatabase(path)
			saveProvider(db, PROVIDER, NOW)
			db.close()
			assert.ok(existsSync(`${path}.key`))
			const again = openDatabase(path)
			assert.equal(readProviderPassword(again), 'cobrix-sandbox')
			again.close()
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})

describe('D54, D55: solo el panel escribe, y las respuestas llevan las cabeceras de seguridad', () => {
	let sandbox: Sandbox

	before(async () => { sandbox = await startSandbox() })
	after(() => sandbox.close())

	const runs = async () => (await sandbox.get<RunListItem[]>('/api/corridas')).body.length

	it('D54: una escritura que no es JSON responde 415 y no hace nada', async () => {
		const response = await fetch(`${sandbox.base}/api/corridas`, { method: 'POST', body: JSON.stringify({ tipo: 'importacion', simulacion: false }) })
		assert.equal(response.status, 415)
		assert.equal((await response.json() as ErrorBody).error.code, 'json_required')
		assert.equal(await runs(), 0)
	})

	it('D54: una escritura desde otro sitio responde 403 y no hace nada', async () => {
		const response = await fetch(`${sandbox.base}/api/corridas`, {
			method: 'POST', headers: { ...JSON_HEADERS, origin: 'http://otro-sitio.example' }, body: JSON.stringify({ tipo: 'importacion', simulacion: false }),
		})
		assert.equal(response.status, 403)
		assert.match((await response.json() as ErrorBody).error.message, /Solo el panel de Cobrix/)
		assert.equal(await runs(), 0)
	})

	it('D54: desde el propio panel, la escritura pasa', async () => {
		const response = await fetch(`${sandbox.base}/api/configuracion`, {
			method: 'PUT', headers: { ...JSON_HEADERS, origin: sandbox.base }, body: JSON.stringify({ company: { name: 'ISP de Prueba', rif: 'J-00000000-0', email: 'cobranza@example.com' } }),
		})
		assert.equal(response.status, 200)
	})

	it('una ruta de la API que no existe responde 404, y una que existe con otro método, 405', async () => {
		const missing = await fetch(`${sandbox.base}/api/nada`)
		assert.equal(missing.status, 404)
		assert.equal((await missing.json() as ErrorBody).error.code, 'not_found')
		const wrongMethod = await fetch(`${sandbox.base}/api/resumen`, { method: 'DELETE' })
		assert.equal(wrongMethod.status, 405)
		assert.equal((await wrongMethod.json() as ErrorBody).error.code, 'method_not_allowed')
	})

	it('un pedido de más de 1 MB responde 413', async () => {
		const response = await fetch(`${sandbox.base}/api/configuracion`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ company: { name: 'x'.repeat(1_100_000) } }) })
		assert.equal(response.status, 413)
	})

	it('D55: la API y el panel responden con nosniff, sin referrer y sin poder ir en un iframe', async () => {
		for (const path of ['/api/resumen', '/']) {
			const response = await fetch(`${sandbox.base}${path}`)
			assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
			assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
			assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
		}
	})
})
