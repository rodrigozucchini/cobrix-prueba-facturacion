/**
 * Account statement (extras RF47–RF49, RF51, RN43, CA49–CA51): the company letterhead, the
 * customer, the working date, only the open invoices and a total equal to the customer's debt.
 * Without the company it is not generated; generating it changes nothing and is audited.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import type { CustomerListItem, ErrorBody, StatementResponse } from '../src/shared/api-types.ts'
import { JSON_HEADERS, startSandbox, type Sandbox } from './helpers/sandbox.ts'

const COMPANY = { name: 'ISP de Prueba, C.A.', rif: 'J-12345678-9', email: 'cobranza@isp.example' }

describe('estado de cuenta, después del ciclo de pagos', () => {
	let sandbox: Sandbox
	const statement = (key: string) => sandbox.get<StatementResponse & ErrorBody>(`/api/clientes/${encodeURIComponent(key)}/estado-de-cuenta`)
	const generated = () => sandbox.auditLines().filter(line => line.action === 'statement.generated')

	before(async () => {
		sandbox = await startSandbox()
		await sandbox.run(false)
		await sandbox.payAsInAssignment()
		await sandbox.run(false, 'paid')
	})
	after(() => sandbox.close())

	it('CA50, RF48: sin los datos de la empresa no se genera: 409 company_incomplete con el aviso, y no queda registrado', async () => {
		const { status, body } = await statement('V9876543')
		assert.equal(status, 409)
		assert.equal(body.error.code, 'company_incomplete')
		assert.equal(body.error.message, 'Completa los datos de la empresa en Configuración para generar estados de cuenta.')
		assert.equal(generated().length, 0)
	})

	it('un cliente que no existe responde 404, aunque falte la empresa', async () => {
		const { status, body } = await statement('V1')
		assert.equal(status, 404)
		assert.equal(body.error.code, 'not_found')
	})

	describe('con la empresa cargada', () => {
		before(async () => {
			const response = await fetch(`${sandbox.base}/api/configuracion`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ company: COMPANY }) })
			assert.equal(response.status, 200)
		})

		it('CA49, RN43: LUIS GOMEZ tiene el membrete, sus datos, la fecha 2026-10-13, 4 facturas abiertas de la más vieja a la más nueva y USD 95,00, igual que su deuda', async () => {
			const { status, body } = await statement('V9876543')
			assert.equal(status, 200)
			assert.deepEqual(body.company, { name: COMPANY.name, rif: 'J-12345678-9', email: COMPANY.email })
			assert.equal(body.customer.name, 'LUIS GOMEZ')
			assert.equal(body.customer.document, 'V-9876543')
			assert.equal(body.customer.email, 'luis.gomez@example.com')
			assert.equal(body.issuedOn, '2026-10-13')
			assert.equal(body.invoices.length, 4)
			const dues = body.invoices.map(invoice => invoice.dueDate)
			assert.deepEqual(dues, [...dues].sort(), 'del vencimiento más viejo al más nuevo (P33)')
			assert.equal(dues[0], '2026-08-01', 'julio ya está pagada: no aparece')
			for (const invoice of body.invoices) assert.match(invoice.number, /^CBX-\d{6}$/)
			assert.equal(body.totalCents, 9500)
			assert.equal(body.totalCents, body.invoices.reduce((sum, invoice) => sum + invoice.balanceCents, 0))
			const [luis] = (await sandbox.get<CustomerListItem[]>('/api/clientes?q=V9876543')).body
			assert.equal(body.totalCents, luis?.debtCents)
		})

		it('CA51, RF49: ANA PEREZ no tiene facturas abiertas: se genera igual, con 0 facturas y total 0', async () => {
			const { status, body } = await statement('V12345678')
			assert.equal(status, 200)
			assert.equal(body.customer.name, 'ANA PEREZ')
			assert.deepEqual(body.invoices, [])
			assert.equal(body.totalCents, 0)
		})

		it('RF51: cada emisión deja statement.generated con el ID de cliente, la cantidad y el total, sin nombre ni correo', async () => {
			const before = generated().length
			await statement('V9876543')
			const [line, ...rest] = generated().slice(before)
			assert.equal(rest.length, 0)
			const { at: _at, ...entry } = line ?? {}
			assert.deepEqual(entry, { actor: 'operador', action: 'statement.generated', customer: 'V9876543', openInvoices: 4, totalCents: 9500 })
			assert.doesNotMatch(JSON.stringify(line), /LUIS|example\.com/)
		})

		it('RN43: generarlo no cambia nada en Cobrix', async () => {
			const snapshot = () => JSON.stringify(['customers', 'contracts', 'invoices', 'events', 'runs'].map(table => sandbox.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()))
			const beforeStatement = snapshot()
			await statement('V9876543')
			assert.equal(snapshot(), beforeStatement)
		})
	})
})
