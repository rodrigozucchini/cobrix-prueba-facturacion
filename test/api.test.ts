/**
 * The Cobrix JSON API over HTTP, as the panel uses it.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import type { BillingClient } from '../src/cobrix/billing/client.ts'
import type { ConnectionTestResult, CustomerDetail, CustomerListItem, ErrorBody, ProviderInput, RunDetail, RunListItem, Settings, Summary } from '../src/shared/api-types.ts'
import { JSON_HEADERS, startSandbox, type Sandbox } from './helpers/sandbox.ts'

const NOW = '2026-10-13T10:00:00.000Z'

const VALID_PROVIDER: ProviderInput = {
	name: 'Administrador de facturas',
	apiUrl: 'http://127.0.0.1:4310',
	apiUser: 'cobrix',
	apiPassword: 'cobrix-sandbox',
	importStates: ['ACTIVO', 'CORTADO'],
	windowMonths: null,
	maxRecent: null,
	graceDays: 0,
	capInvoices: 500,
	capAmountCents: 5_000_000,
	excludedDocTypes: [],
	autoEnabled: false,
	autoHour: null,
}

describe('API de configuración', () => {
	let sandbox: Sandbox
	let base: string

	before(async () => {
		sandbox = await startSandbox(null, { now: () => NOW })
		base = sandbox.base
	})
	after(() => sandbox.close())

	const put = async (body: unknown) => {
		const response = await fetch(`${base}/api/configuracion`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) })
		return { status: response.status, body: await response.json() as unknown }
	}
	const fieldsOf = (body: unknown) => (body as ErrorBody).error.fields ?? {}

	it('D4: sin configurar, devuelve los valores por defecto y sin contraseña', async () => {
		const settings = await (await fetch(`${base}/api/configuracion`)).json() as Settings
		assert.equal(settings.provider.hasPassword, false)
		assert.deepEqual(settings.provider.importStates, ['ACTIVO', 'CORTADO'])
		assert.equal(settings.provider.capInvoices, 500)
		assert.equal(settings.companyUpdatedAt, null)
	})

	it('RF33, CA35: sin proveedor configurado, el resumen trae el proveedor en null y los totales en 0', async () => {
		const summary = await (await fetch(`${base}/api/resumen`)).json() as Summary
		assert.equal(summary.provider, null)
		assert.deepEqual(summary.totals, { customers: 0, contracts: 0, openInvoices: 0, paidInvoices: 0, openAmountCents: 0 })
		assert.deepEqual(summary.recentRuns, [])
	})

	it('CA43: la empresa sin nombre, con RIF «hola» o correo «cobranza» no se guarda y cada campo dice qué está mal', async () => {
		const { status, body } = await put({ company: { name: '', rif: 'hola', email: 'cobranza' } })
		assert.equal(status, 400)
		assert.equal((body as ErrorBody).error.code, 'validation')
		const fields = fieldsOf(body)
		assert.match(fields['company.name'] ?? '', /obligatorio/)
		assert.match(fields['company.rif'] ?? '', /J-12345678-9/)
		assert.match(fields['company.email'] ?? '', /cobranza@empresa\.com/)
		const settings = await (await fetch(`${base}/api/configuracion`)).json() as Settings
		assert.equal(settings.company.name, '')
	})

	it('CA43, CA1: con datos válidos se guarda, el RIF queda normalizado y se registra la última modificación', async () => {
		const { status, body } = await put({ company: { name: 'ISP de Prueba', rif: 'j000000000', email: 'cobranza@example.com' } })
		assert.equal(status, 200)
		const settings = body as Settings
		assert.equal(settings.company.rif, 'J-00000000-0')
		assert.equal(settings.companyUpdatedAt, NOW)
	})

	it('CA5: días de gracia 61, máximo 0, tope de facturas 0 o 2,5, tope de monto 0 o tope vacío no se guardan', async () => {
		const { status, body } = await put({
			provider: { ...VALID_PROVIDER, graceDays: 61, maxRecent: 0, capInvoices: 2.5, capAmountCents: 0 },
		})
		assert.equal(status, 400)
		const fields = fieldsOf(body)
		assert.match(fields['provider.graceDays'] ?? '', /0 a 60/)
		assert.match(fields['provider.maxRecent'] ?? '', /1 a 60/)
		assert.match(fields['provider.capInvoices'] ?? '', /entero de 1 o más/)
		assert.match(fields['provider.capAmountCents'] ?? '', /mayor que USD 0/)
		const empty = await put({ provider: { ...VALID_PROVIDER, capInvoices: null } })
		assert.equal(empty.status, 400)
		assert.ok(fieldsOf(empty.body)['provider.capInvoices'])
	})

	it('CA6: sin ningún estado de contrato no se guarda y pide elegir al menos uno', async () => {
		const { status, body } = await put({ provider: { ...VALID_PROVIDER, importStates: [] } })
		assert.equal(status, 400)
		assert.match(fieldsOf(body)['provider.importStates'] ?? '', /al menos un estado/)
	})

	it('RF2: la URL tiene que empezar con http:// o https://', async () => {
		const { status, body } = await put({ provider: { ...VALID_PROVIDER, apiUrl: '127.0.0.1:4310' } })
		assert.equal(status, 400)
		assert.match(fieldsOf(body)['provider.apiUrl'] ?? '', /http:\/\//)
	})

	it('RF3: la primera vez la contraseña es obligatoria', async () => {
		const { status, body } = await put({ provider: { ...VALID_PROVIDER, apiPassword: '' } })
		assert.equal(status, 400)
		assert.match(fieldsOf(body)['provider.apiPassword'] ?? '', /obligatoria/)
	})

	it('CA2: la contraseña guardada nunca vuelve, y guardar otro cambio sin escribirla la conserva', async () => {
		const saved = await put({ provider: VALID_PROVIDER })
		assert.equal(saved.status, 200)
		assert.equal(JSON.stringify(saved.body).includes('cobrix-sandbox'), false)
		assert.equal((saved.body as Settings).provider.hasPassword, true)

		const changed = await put({ provider: { ...VALID_PROVIDER, apiPassword: '', graceDays: 5 } })
		assert.equal(changed.status, 200)
		const settings = changed.body as Settings
		assert.equal(settings.provider.graceDays, 5)
		assert.equal(settings.provider.hasPassword, true)
		const raw = await (await fetch(`${base}/api/configuracion`)).text()
		assert.equal(raw.includes('cobrix-sandbox'), false)
	})

	it('RF6: con la corrida automática activa hace falta la hora', async () => {
		const { status, body } = await put({ provider: { ...VALID_PROVIDER, apiPassword: '', autoEnabled: true, autoHour: null } })
		assert.equal(status, 400)
		assert.match(fieldsOf(body)['provider.autoHour'] ?? '', /hora/)
	})

	const auditLines = () => sandbox.auditLines()

	it('RN45: guardar la configuración queda en la auditoría con los campos que cambiaron', () => {
		const saves = auditLines().filter(entry => entry.action === 'settings.saved')
		assert.ok(saves.length >= 3, 'cada guardado válido deja una línea')
		const company = saves.find(entry => JSON.stringify(entry.changed).includes('company.rif'))
		assert.deepEqual(company?.changed, { 'company.name': 'ISP de Prueba', 'company.rif': 'J-00000000-0', 'company.email': 'cobranza@example.com' })
		assert.equal(company?.actor, 'operador')
		const grace = saves.find(entry => JSON.stringify(entry.changed).includes('graceDays'))
		assert.deepEqual(grace?.changed, { graceDays: 5 })
	})

	it('RF52, CA53: la contraseña nunca llega a la auditoría; solo que cambió', () => {
		const firstProviderSave = auditLines().find(entry => JSON.stringify(entry.changed).includes('apiPassword'))
		assert.equal((firstProviderSave?.changed as Record<string, unknown>).apiPassword, '(cambiada)')
		assert.equal(JSON.stringify(auditLines()).includes('cobrix-sandbox'), false)
	})

	it('un guardado rechazado por validación no queda en la auditoría como guardado', async () => {
		const before = auditLines().length
		await put({ company: { name: '', rif: 'x', email: 'y' } })
		assert.equal(auditLines().length, before)
	})

	it('un pedido sin JSON válido responde 400 con el formato de error', async () => {
		const response = await fetch(`${base}/api/configuracion`, { method: 'PUT', headers: JSON_HEADERS, body: '{no es json' })
		assert.equal(response.status, 400)
		assert.equal(((await response.json()) as ErrorBody).error.code, 'invalid_json')
	})
})

describe('Probar conexión', () => {
	let sandbox: Sandbox
	let billingUrl: string
	let base: string

	before(async () => {
		sandbox = await startSandbox(null)
		billingUrl = sandbox.billingUrl
		base = sandbox.base
	})
	after(() => sandbox.close())

	const probe = async (body: unknown) => {
		const response = await fetch(`${base}/api/configuracion/probar-conexion`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
		return { status: response.status, body: await response.json() as unknown }
	}
	const tested = () => sandbox.auditLines().filter(entry => entry.action === 'connection.tested')

	it('CA3: con cobrix / cobrix-sandbox dice que la conexión es correcta y que hay 27 contratos', async () => {
		const { status, body } = await probe({ apiUrl: `${billingUrl}/api/v1/`, apiUser: 'cobrix', apiPassword: 'cobrix-sandbox' })
		assert.equal(status, 200)
		assert.deepEqual(body, { ok: true, contracts: 27, unreadable: 0 })
	})

	it('CA4: con una contraseña incorrecta dice que el administrador rechazó las credenciales', async () => {
		const { status, body } = await probe({ apiUrl: billingUrl, apiUser: 'cobrix', apiPassword: 'otra' })
		assert.equal(status, 200)
		const result = body as ConnectionTestResult
		assert.equal(result.ok, false)
		assert.match(result.ok ? '' : result.message, /rechazó el usuario o la contraseña/)
		assert.doesNotMatch(result.ok ? '' : result.message, /en Configuración/, 'ya está en Configuración: no lo manda a otro lado')
	})

	it('RN7: una dirección donde no hay nada dice que no se pudo conectar', async () => {
		const { body } = await probe({ apiUrl: 'http://127.0.0.1:9', apiUser: 'cobrix', apiPassword: 'cobrix-sandbox' })
		const result = body as ConnectionTestResult
		assert.match(result.ok ? '' : result.message, /No se pudo conectar con el administrador/)
	})

	it('D24: sin contraseña escrita usa la guardada; si no hay ninguna, la pide', async () => {
		const missing = await probe({ apiUrl: billingUrl, apiUser: 'cobrix', apiPassword: '' })
		assert.equal(missing.status, 400)
		assert.match((missing.body as ErrorBody).error.fields?.['provider.apiPassword'] ?? '', /contraseña/)
		const saved = await fetch(`${base}/api/configuracion`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ provider: { ...VALID_PROVIDER, apiUrl: billingUrl } }) })
		assert.equal(saved.status, 200)
		const withStored = await probe({ apiUrl: billingUrl, apiUser: 'cobrix', apiPassword: '' })
		assert.deepEqual(withStored.body, { ok: true, contracts: 27, unreadable: 0 })
	})

	it('RF4: sin URL o sin usuario responde 400 con los campos', async () => {
		const { status, body } = await probe({ apiUrl: 'isp', apiUser: '', apiPassword: 'x' })
		assert.equal(status, 400)
		const fields = (body as ErrorBody).error.fields ?? {}
		assert.ok(fields['provider.apiUrl'])
		assert.ok(fields['provider.apiUser'])
	})

	it('T075: cada prueba queda en la auditoría con su resultado y la URL, sin usuario ni contraseña', () => {
		const entries = tested()
		assert.ok(entries.some(entry => entry.ok === true && entry.contracts === 27))
		assert.ok(entries.some(entry => entry.ok === false && /rechazó/.test(String(entry.message))))
		const ok = entries.find(entry => entry.ok === true)
		assert.equal(ok?.apiUrl, billingUrl)
		assert.equal(JSON.stringify(sandbox.auditLines()).includes('cobrix-sandbox'), false)
		assert.equal(JSON.stringify(entries).includes('"apiUser"'), false)
	})
})

describe('API de corridas', () => {
	/** A Sandbox (configured unless `rules` is null) with the helpers of the runs API. */
	async function appWith(rules: Partial<ProviderInput> | null, extra: Parameters<typeof startSandbox>[1] = {}) {
		const sandbox = await startSandbox(rules, extra)
		const { base } = sandbox
		const start = (body: unknown) => fetch(`${base}/api/corridas`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
		const waitFor = async (id: number): Promise<RunDetail> => {
			for (let i = 0; i < 200; i++) {
				const detail = (await sandbox.get<RunDetail>(`/api/corridas/${id}`)).body
				if (detail.status !== 'running') return detail
				await new Promise(resolve => setTimeout(resolve, 20))
			}
			assert.fail('la corrida no terminó')
		}
		return { app: sandbox, base, db: sandbox.db, start, waitFor, auditLines: () => sandbox.auditLines() }
	}

	it('CA26: con una contraseña incorrecta guardada, «Importar» termina fallida, explica qué hacer y no crea clientes', async () => {
		const { app, base, start, waitFor, db } = await appWith({ apiPassword: 'incorrecta' })
		try {
			const response = await start({ tipo: 'importacion', simulacion: false })
			assert.equal(response.status, 202)
			const run = await response.json() as RunListItem
			assert.equal(run.status, 'running')
			const detail = await waitFor(run.id)
			assert.equal(detail.status, 'failed')
			assert.match(detail.error ?? '', /rechazó el usuario o la contraseña\..* Revísalos en Configuración\.$/)
			assert.equal(detail.summary, detail.error)
			assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM customers').get() as Record<string, unknown>).n), 0)
			const list = await (await fetch(`${base}/api/corridas`)).json() as RunListItem[]
			assert.equal(list[0]?.status, 'failed')
		} finally {
			await app.close()
		}
	})

	it('CA29, CL13: con una corrida en curso, otra no se inicia (409) y se avisa por qué', async () => {
		let release = () => {}
		const gate = new Promise<void>(resolve => { release = resolve })
		const slow: BillingClient = {
			connect: async () => {},
			listContractIds: async () => { await gate; return { data: [], pagination: { total: 0, total_pages: 1 } } },
			getContract: async () => [],
			getLedger: async () => ({ data: [] }),
		}
		const { app, start, waitFor } = await appWith({}, { clientFor: () => slow })
		try {
			const first = await start({ tipo: 'importacion', simulacion: true })
			assert.equal(first.status, 202)
			const second = await start({ tipo: 'importacion', simulacion: false })
			assert.equal(second.status, 409)
			const body = await second.json() as ErrorBody
			assert.equal(body.error.code, 'run_in_progress')
			assert.match(body.error.message, /Ya hay una corrida en curso/)
			release()
			const done = await waitFor((await first.json() as RunListItem).id)
			assert.equal(done.status, 'completed')
			assert.equal((await start({ tipo: 'importacion', simulacion: true })).status, 202)
		} finally {
			release()
			await app.close()
		}
	})

	it('CL1, RF41: sin proveedor configurado no se inicia y dice qué falta', async () => {
		const { app, start } = await appWith(null)
		try {
			const response = await start({ tipo: 'importacion', simulacion: true })
			assert.equal(response.status, 409)
			const body = await response.json() as ErrorBody
			assert.equal(body.error.code, 'provider_not_configured')
			assert.match(body.error.message, /Configuración/)
		} finally {
			await app.close()
		}
	})

	it('CL15: una corrida que no existe responde 404', async () => {
		const { app, base } = await appWith(null)
		try {
			const response = await fetch(`${base}/api/corridas/999`)
			assert.equal(response.status, 404)
			assert.match(((await response.json()) as ErrorBody).error.message, /No encontramos esa corrida/)
		} finally {
			await app.close()
		}
	})

	it('un tipo de corrida inválido o sin «simulacion» responde 400', async () => {
		const { app, start } = await appWith({})
		try {
			assert.equal((await start({ tipo: 'otra', simulacion: true })).status, 400)
			assert.equal((await start({ tipo: 'importacion' })).status, 400)
		} finally {
			await app.close()
		}
	})

	it('T076: cada corrida deja run.started y run.finished en la auditoría', async () => {
		const { app, start, waitFor, auditLines } = await appWith({})
		try {
			const run = await (await start({ tipo: 'importacion', simulacion: true })).json() as RunListItem
			await waitFor(run.id)
			const entries = auditLines().filter(entry => entry.runId === run.id)
			assert.deepEqual(entries.map(entry => entry.action), ['run.started', 'run.finished'])
			assert.equal(entries[1]?.status, 'completed')
			assert.match(String(entries[1]?.summary), /Se importarían: 42/)
			assert.equal(entries[0]?.actor, 'operador')
		} finally {
			await app.close()
		}
	})
})

describe('API de clientes y resumen, después del ciclo de pagos', () => {
	let sandbox: Sandbox
	const get = <T>(path: string) => sandbox.get<T>(path)
	const customers = async (query = '') => (await get<CustomerListItem[]>(`/api/clientes${query}`)).body
	const names = (list: readonly CustomerListItem[]) => list.map(customer => customer.name)

	before(async () => {
		sandbox = await startSandbox()
		await sandbox.run(false)
		await sandbox.payAsInAssignment()
		await sandbox.run(false, 'paid')
	})
	after(() => sandbox.close())

	it('CA31: «gomez», «9876543» y «V-9876543» encuentran a LUIS GOMEZ; «elena» y «09000123», a ELENA RUIZ', async () => {
		for (const query of ['gomez', 'GÓMEZ', '9876543', 'V-9876543', 'v.9.876.543', '98765']) {
			assert.deepEqual(names(await customers(`?q=${encodeURIComponent(query)}`)), ['LUIS GOMEZ'], query)
		}
		for (const query of ['elena', 'Elena  Ruiz', '09000123', '9000123']) {
			assert.deepEqual(names(await customers(`?q=${encodeURIComponent(query)}`)), ['ELENA RUIZ'], query)
		}
		assert.deepEqual(await customers('?q=nadie'), [])
		assert.deepEqual(await customers('?q=E-9876543'), [], 'con otra letra no es la misma persona')
	})

	it('RF23: LUIS GOMEZ debe USD 95,00, su vencimiento más antiguo es el 1 ago 2026 y tiene 2 contratos', async () => {
		const [luis] = await customers('?q=9876543')
		assert.deepEqual(luis, {
			key: 'V9876543', document: luis?.document, name: 'LUIS GOMEZ', personType: 'natural',
			contracts: 2, openInvoices: 4, paidInvoices: 1, debtCents: 9500, oldestDueDate: '2026-08-01', partialInvoices: 1,
		})
	})

	it('CA32, D28, D29: por deuda el primero es el que más debe; ANA PEREZ y COMERCIAL EL FARO, C.A. van al final con USD 0,00', async () => {
		const byDebt = await customers('?orden=deuda')
		const top = byDebt[0]
		assert.ok(top)
		assert.equal(top.debtCents, Math.max(...byDebt.map(customer => customer.debtCents)))

		const byDefault = await customers()
		assert.equal(byDefault.length, 20)
		const last = byDefault.slice(-2)
		assert.deepEqual(names(last).sort(), ['ANA PEREZ', 'COMERCIAL EL FARO, C.A.'])
		for (const customer of last) {
			assert.equal(customer.debtCents, 0)
			assert.equal(customer.oldestDueDate, null)
		}
		const dues = byDefault.slice(0, -2).map(customer => customer.oldestDueDate ?? '')
		assert.deepEqual(dues, [...dues].sort(), 'el vencimiento más antiguo primero')
		assert.deepEqual(names((await customers('?orden=deuda')).slice(-2)).sort(), names(last).sort())
		assert.deepEqual(names((await customers('?orden=nombre')).slice(-2)).sort(), names(last).sort())
	})

	it('D56: «Requiere atención» trae el abono parcial de la última actualización, que lleva a esa corrida filtrada', async () => {
		const summary = (await get<Summary>('/api/resumen')).body
		const paidRun = summary.recentRuns.find(run => run.kind === 'paid')
		assert.deepEqual(summary.attention, [{ kind: 'paid', runId: paidRun?.id, outcome: 'partial', count: 1 }])
	})

	it('D57: en el expediente, la factura con abono parcial dice cuánto queda en el ISP; las demás, nada', async () => {
		const { body } = await get<CustomerDetail>('/api/clientes/V9876543')
		const partial = body.invoices.filter(invoice => invoice.partialBalanceCents !== null)
		assert.deepEqual(partial.map(invoice => [invoice.period, invoice.balanceCents, invoice.partialBalanceCents]), [['2026-08', 2000, 1500]])
		assert.equal((await customers()).filter(customer => customer.partialInvoices > 0).length, 1)
	})

	it('CA33: el expediente de LUIS GOMEZ trae sus 2 contratos, sus facturas de la más nueva a la más vieja y su historial', async () => {
		const { status, body } = await get<CustomerDetail>('/api/clientes/V9876543')
		assert.equal(status, 200)
		assert.equal(body.customer.name, 'LUIS GOMEZ')
		assert.equal(body.customer.personType, 'natural')
		assert.deepEqual(body.totals, (await customers('?q=V9876543'))[0], 'los mismos totales que la tabla (P19)')

		assert.deepEqual(body.contracts.map(contract => contract.status), ['ACTIVO', 'CORTADO'])
		for (const contract of body.contracts) {
			assert.ok(contract.plan && contract.branch && contract.priceCents > 0, `contrato ${contract.number} con plan, precio y sucursal`)
		}

		assert.equal(body.invoices.length, 5)
		const dues = body.invoices.map(invoice => invoice.dueDate)
		assert.deepEqual(dues, [...dues].sort().reverse())
		const july = body.invoices.find(invoice => invoice.period === '2026-07')
		assert.equal(july?.status, 'paid')
		assert.equal(july?.balanceCents, 0)
		assert.ok(july?.paidAt && july.paidRef)
		const august = body.invoices.find(invoice => invoice.contractNumber === 900103 && invoice.period === '2026-08')
		assert.equal(august?.status, 'open', 'el abono parcial no la marca pagada')
		assert.match(august?.number ?? '', /^CBX-\d{6}$/)

		const kinds = body.events.map(event => event.kind)
		assert.equal(kinds[0], 'invoice_paid', 'lo más reciente primero')
		assert.equal(kinds.at(-1), 'customer_created')
		assert.equal(kinds.filter(kind => kind === 'invoice_imported').length, 5)
		const paid = body.events[0]
		assert.equal(paid?.adminInvoice, july?.paidRef)
		assert.equal(paid?.adminDate, july?.paidAt)
		assert.equal(paid?.invoiceNumber, july?.number)
		for (const event of body.events) {
			const run = await get<RunDetail>(`/api/corridas/${event.runId}`)
			assert.equal(run.body.kind, event.kind === 'invoice_paid' ? 'paid' : 'import')
		}
	})

	it('CL15: un cliente que no existe responde 404 con el mensaje para el operador', async () => {
		const { status, body } = await get<ErrorBody>('/api/clientes/V1')
		assert.equal(status, 404)
		assert.equal(body.error.code, 'not_found')
		assert.match(body.error.message, /No encontramos ese cliente/)
	})

	it('CA34, CA23: el resumen da 20 clientes, 27 contratos, 34 abiertas por USD 955,00 y 8 pagadas, igual que la suma de la tabla', async () => {
		const { status, body } = await get<Summary>('/api/resumen')
		assert.equal(status, 200)
		assert.deepEqual(body.totals, { customers: 20, contracts: 27, openInvoices: 34, paidInvoices: 8, openAmountCents: 95_500 })
		const table = await customers()
		assert.equal(table.reduce((sum, customer) => sum + customer.debtCents, 0), body.totals.openAmountCents)
		assert.equal(table.reduce((sum, customer) => sum + customer.openInvoices, 0), body.totals.openInvoices)
		assert.equal(table.reduce((sum, customer) => sum + customer.paidInvoices, 0), body.totals.paidInvoices)

		assert.equal(body.provider?.name, 'Administrador de facturas')
		assert.deepEqual(body.provider?.importStates, ['ACTIVO', 'CORTADO'])
		assert.deepEqual(body.auto, { enabled: false, hour: null })
		assert.deepEqual(body.recentRuns.map(run => run.kind), ['paid', 'import'], 'las últimas corridas, la más reciente primero')
	})

	it('RF25: un orden desconocido responde 400', async () => {
		const { status, body } = await get<ErrorBody>('/api/clientes?orden=monto')
		assert.equal(status, 400)
		assert.equal(body.error.code, 'validation')
	})
})

describe('Requiere atención, sin corridas reales', () => {
	it('D56: una simulación no cuenta, y una corrida real fallida aparece como fallida', async () => {
		const sandbox = await startSandbox()
		try {
			await sandbox.run(true)
			assert.deepEqual((await sandbox.get<Summary>('/api/resumen')).body.attention, [])
			sandbox.db.prepare(`INSERT INTO runs (kind, simulation, origin, status, started_at, finished_at, error) VALUES ('import', 0, 'manual', 'failed', ?, ?, 'x')`)
				.run('2026-10-13T12:00:00.000Z', '2026-10-13T12:00:01.000Z')
			const attention = (await sandbox.get<Summary>('/api/resumen')).body.attention
			assert.deepEqual(attention.map(item => [item.kind, item.outcome]), [['import', null]])
		} finally {
			await sandbox.close()
		}
	})
})
