/**
 * The invoice manager client (RN7, CL2, CL4, CL17, D31, D32): login and token, a new login
 * before it expires (there is no refresh token), one retry on 401, no retry on bad credentials,
 * time limit, and errors that never carry the password. Uses a fake fetch: no server.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BillingError, createBillingClient, normalizeBaseUrl } from '../src/cobrix/billing/client.ts'

const PASSWORD = 'secreto-123'

interface Call {
	readonly method: string
	readonly url: string
	readonly body: string | undefined
	readonly authorization: string | undefined
}

/** A fake fetch: answers with `reply(call, index)` and records every call. */
function fakeFetch(reply: (call: Call, index: number) => Response | Promise<Response>) {
	const calls: Call[] = []
	const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const headers = new Headers(init?.headers)
		const call: Call = {
			method: init?.method ?? 'GET',
			url: String(input),
			body: typeof init?.body === 'string' ? init.body : undefined,
			authorization: headers.get('authorization') ?? undefined,
		}
		calls.push(call)
		return reply(call, calls.length - 1)
	}
	return { fetch: fetch as typeof globalThis.fetch, calls }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const loginOk = (token: string, expires = '2026-10-13T12:00:00') => json(200, { usuario: 'cobrix', access_token: token, access_token_expires_in: expires })
const isLogin = (call: Call) => call.url.endsWith('/usuario/login')

const client = (fetch: typeof globalThis.fetch, extra: { now?: () => Date; timeoutMs?: number; baseUrl?: string } = {}) =>
	createBillingClient({ baseUrl: extra.baseUrl ?? 'http://isp.local:4310', user: 'cobrix', password: PASSWORD, fetch, ...extra })

async function rejection(promise: Promise<unknown>): Promise<BillingError> {
	try {
		await promise
	} catch (error) {
		assert.ok(error instanceof BillingError, `se esperaba BillingError y llegó ${String(error)}`)
		assert.equal(error.message.includes(PASSWORD), false, 'el mensaje no puede traer la contraseña')
		return error
	}
	assert.fail('debería haber fallado')
}

describe('cliente del administrador', () => {
	it('CL17: la URL funciona con o sin /api/v1 y con barras al final', () => {
		for (const url of ['http://isp.local:4310', 'http://isp.local:4310/', 'http://isp.local:4310/api/v1', 'http://isp.local:4310/api/v1/', '  http://isp.local:4310//  ']) {
			assert.equal(normalizeBaseUrl(url), 'http://isp.local:4310', url)
		}
	})

	it('D32: inicia sesión con user_name y usa el token en cada consulta; un solo login mientras sirve', async () => {
		const { fetch, calls } = fakeFetch(call => (isLogin(call) ? loginOk('t1') : json(200, { data: [] })))
		const billing = client(fetch, { now: () => new Date('2026-10-13T10:00:00Z') })
		await billing.listContractIds()
		await billing.getContract(900101)
		assert.equal(calls.filter(isLogin).length, 1)
		assert.deepEqual(JSON.parse(calls[0]?.body ?? '{}'), { user_name: 'cobrix', password: PASSWORD })
		assert.equal(calls[1]?.authorization, 'Bearer t1')
		assert.equal(calls[2]?.url, 'http://isp.local:4310/api/v1/isp/contrato/individual?id_contrato=900101')
	})

	it('CL22: la lista se pide sin estado ni paginación; el libro, con CUOTA y fechas', async () => {
		const { fetch, calls } = fakeFetch(call => (isLogin(call) ? loginOk('t1') : json(200, { data: [] })))
		const billing = client(fetch, { now: () => new Date('2026-10-13T10:00:00Z') })
		await billing.listContractIds()
		await billing.getLedger(900101, '2026-08-01', '2026-10-31')
		assert.equal(calls[1]?.url, 'http://isp.local:4310/api/v1/isp/lista_ids_contratos')
		assert.equal(calls[2]?.url, 'http://isp.local:4310/api/v1/isp/pago_informacion?id_contrato=900101&tipo_busqueda=CUOTA&fecha_inicio=2026-08-01&fecha_fin=2026-10-31')
	})

	it('D31: sin refresh token, hace un login nuevo 5 minutos antes de que venza', async () => {
		let now = new Date('2026-10-13T11:50:00Z') // vence a las 12:00 UTC (llega sin zona)
		let logins = 0
		const { fetch } = fakeFetch(call => (isLogin(call) ? loginOk(`t${++logins}`) : json(200, { data: [] })))
		const billing = client(fetch, { now: () => now })
		await billing.listContractIds()
		now = new Date('2026-10-13T11:54:00Z') // quedan 6 minutos: sirve
		await billing.listContractIds()
		assert.equal(logins, 1)
		now = new Date('2026-10-13T11:56:00Z') // quedan 4 minutos: login nuevo
		await billing.listContractIds()
		assert.equal(logins, 2)
	})

	it('CL4: ante un 401 hace un login nuevo y repite la consulta una sola vez', async () => {
		let queries = 0
		const { fetch, calls } = fakeFetch(call => {
			if (isLogin(call)) return loginOk(`t${calls.filter(isLogin).length}`)
			queries++
			return queries === 1 ? json(401, { detail: { mensaje: 'Token invalido' } }) : json(200, { data: [900101] })
		})
		const body = await client(fetch, { now: () => new Date('2026-10-13T10:00:00Z') }).listContractIds()
		assert.deepEqual(body, { data: [900101] })
		assert.equal(calls.filter(isLogin).length, 2)
		assert.equal(calls.at(-1)?.authorization, 'Bearer t2')
	})

	it('CL4: si el 401 se repite después del login nuevo, falla sin insistir', async () => {
		const { fetch, calls } = fakeFetch(call => (isLogin(call) ? loginOk('t') : json(401, {})))
		const error = await rejection(client(fetch, { now: () => new Date('2026-10-13T10:00:00Z') }).listContractIds())
		assert.equal(error.kind, 'unauthorized')
		assert.equal(calls.length, 4)
	})

	it('RN33: credenciales malas (400 en el login) fallan sin reintentar y con el mensaje del administrador', async () => {
		const { fetch, calls } = fakeFetch(() => json(400, { detail: { type: 'password', mensaje: 'Contraseña Incorrecta' } }))
		const error = await rejection(client(fetch).listContractIds())
		assert.equal(error.kind, 'credentials_rejected')
		assert.match(error.message, /rechazó el usuario o la contraseña/)
		assert.match(error.message, /Contraseña Incorrecta/)
		assert.equal(calls.length, 1)
	})

	it('CL2: si el administrador no responde a tiempo, falla con un mensaje claro', async () => {
		const { fetch } = fakeFetch((_call, _index) => new Promise<Response>(() => {}))
		const slow: typeof globalThis.fetch = async (input, init) => {
			void fetch(input, init)
			return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
		}
		const error = await rejection(client(slow, { timeoutMs: 30 }).listContractIds())
		assert.equal(error.kind, 'timeout')
		assert.match(error.message, /tardó más de/)
	})

	it('RN7: sin conexión, falla con un mensaje que dice qué revisar', async () => {
		const down: typeof globalThis.fetch = async () => {
			throw new TypeError('fetch failed')
		}
		const error = await rejection(client(down).getContract(900101))
		assert.equal(error.kind, 'network')
		assert.match(error.message, /No se pudo conectar con el administrador/)
	})

	it('RN7: un código inesperado o un JSON roto son errores con tipo', async () => {
		const server = fakeFetch(call => (isLogin(call) ? loginOk('t') : json(500, { title: 'Internal Server Error' })))
		assert.equal((await rejection(client(server.fetch, { now: () => new Date('2026-10-13T10:00:00Z') }).getContract(1))).kind, 'http_status')
		const broken = fakeFetch(call => (isLogin(call) ? loginOk('t') : new Response('<html>', { status: 200 })))
		assert.equal((await rejection(client(broken.fetch, { now: () => new Date('2026-10-13T10:00:00Z') }).getContract(1))).kind, 'invalid_json')
	})

	it('P13: connect() solo inicia sesión; las consultas siguientes reusan el token', async () => {
		const { fetch, calls } = fakeFetch(call => (isLogin(call) ? loginOk('t1') : json(200, { data: [] })))
		const billing = client(fetch, { now: () => new Date('2026-10-13T10:00:00Z') })
		await billing.connect()
		assert.equal(calls.length, 1)
		await billing.getLedger(900101, '2026-08-01', '2026-10-31')
		assert.equal(calls.filter(isLogin).length, 1)
		const rejected = fakeFetch(() => json(400, { detail: { mensaje: 'Contraseña Incorrecta' } }))
		assert.equal((await rejection(client(rejected.fetch).connect())).kind, 'credentials_rejected')
	})

	it('un login que no trae token no se usa a ciegas', async () => {
		const { fetch } = fakeFetch(() => json(200, { usuario: 'cobrix' }))
		assert.equal((await rejection(client(fetch).listContractIds())).kind, 'invalid_response')
	})
})
