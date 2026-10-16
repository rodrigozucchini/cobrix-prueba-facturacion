/**
 * Strict readers of the invoice manager's answers (RN6, RN8–RN10, RN15, RN38, CL6, CL7, CL23–CL25,
 * D34). Answers arrive as `unknown`; what is odd or contradictory is never guessed.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readContractList, readContractRows, readLedgerRows } from '../src/cobrix/billing/readers.ts'

const CURRENT = '2026-10'

// ---------------------------------------------------------------- fixtures

const envelope = (data: unknown, extra: Record<string, unknown> = {}) => ({
	success: true,
	message: 'Lista de ids de contratos',
	pagination: { page: 1, per_page: Array.isArray(data) ? data.length : 0, total: Array.isArray(data) ? data.length : 0, total_pages: 1 },
	errors: [{ id: 0, message: '', code: '', uuid_code: '' }],
	data,
	...extra,
})

const row = (fields: Record<string, unknown> = {}) => ({
	contrato_id: 900101,
	identificacion_contrato: 'V-12345678',
	nombre_contrato: 'ANA PEREZ',
	telefono: '04121000000',
	email: 'ANA.PEREZ@EXAMPLE.COM',
	estado: 'ACTIVO',
	deuda: 20,
	deuda_id: '7000008',
	precio_servicio: '25.000000',
	nombre_plan: 'PLAN15MB25',
	sigla_sucursal: 'VLN',
	detalle_deuda: ['PLAN15MB25 - 2026 Agosto'],
	moneda_sigla: 'USD',
	fecha_corte_prox: '2026-11-04', // ignored
	...fields,
})

const ledgerRow = (fields: Record<string, unknown> = {}, detail: Record<string, unknown> = {}) => ({
	id_factura: 8800007,
	num_factura: '008800007',
	fecha_emision: '2026-08-06',
	id_contrato: 900101,
	detalle_pago: { id_cuota: 7000008, periodo_cuota: '2026-08', tarifa: 25, valor_pago: 5, saldo_cuota: 20, descuento: 0, ...detail },
	...fields,
})

const error = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }) => {
	assert.ok(!result.ok, 'debería ser un error')
	return result.error.message
}
const value = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
	assert.ok(result.ok, result.ok ? '' : result.error.message)
	return result.value
}

// ---------------------------------------------------------------- contract list

describe('lector de la lista de contratos', () => {
	it('lee los números de contrato de data', () => {
		assert.deepEqual(value(readContractList(envelope([900101, 900102, 900103]))).ids, [900101, 900102, 900103])
	})

	it('RN33: si no es una lista, la corrida no puede seguir', () => {
		assert.match(error(readContractList({ success: true })), /lista de contratos/)
		assert.match(error(readContractList({ data: 'no' })), /lista de contratos/)
		assert.match(error(readContractList('<html>')), /lista de contratos/)
	})

	it('CL23: la lista incompleta no se procesa', () => {
		const partial = envelope([900101, 900102], { pagination: { page: 1, per_page: 2, total: 27, total_pages: 14 } })
		assert.match(error(readContractList(partial)), /incompleta \(llegaron 2 de 27\)/)
	})

	it('RN38: un número escrito como texto se acepta; lo ilegible queda aparte, tal cual', () => {
		const list = value(readContractList(envelope([900101, '900102', ' 900103 ', 'abc', null, -5, 900101.5])))
		assert.deepEqual(list.ids, [900101, 900102, 900103])
		assert.deepEqual(list.unreadable, ['abc', null, -5, 900101.5])
	})

	it('CL6: un número repetido se procesa una vez', () => {
		assert.deepEqual(value(readContractList(envelope([900101, 900101, '900101']))).ids, [900101])
	})

	it('CL5: una lista vacía es válida', () => {
		assert.deepEqual(value(readContractList(envelope([]))).ids, [])
	})

	it('CL24, D34: success y errors se registran pero no deciden', () => {
		const list = value(readContractList(envelope([900101], {
			success: false,
			errors: [{ id: 0, message: '', code: '', uuid_code: '' }, { id: 1, message: 'Sucursal 3 no disponible', code: 'X', uuid_code: '' }],
		})))
		assert.deepEqual(list.ids, [900101])
		assert.deepEqual(list.warnings, ['Sucursal 3 no disponible'])
		assert.equal(list.technical.successFalseWithData, true)
		const normal = value(readContractList(envelope([900101])))
		assert.deepEqual(normal.warnings, [])
		assert.equal(normal.technical.successFalseWithData, false)
	})
})

// ---------------------------------------------------------------- contract rows

describe('lector de las cuotas de un contrato', () => {
	it('lee el contrato y sus cuotas con los 13 campos del plan', () => {
		const read = value(readContractRows([row(), row({ deuda: 25, deuda_id: '7000009', detalle_deuda: ['PLAN15MB25 - 2026 Septiembre'] })], 900101, CURRENT))
		assert.equal(read.kind, 'installments')
		assert.deepEqual(read.contract, {
			number: 900101,
			identification: 'V-12345678',
			holderName: 'ANA PEREZ',
			status: 'ACTIVO',
			currency: 'USD',
			priceCents: 2500,
			plan: 'PLAN15MB25',
			branch: 'VLN',
			email: 'ana.perez@example.com',
			phone: '04121000000',
		})
		if (read.kind !== 'installments') return
		assert.deepEqual(read.installments, [
			{ id: '7000008', amountCents: 2000, period: '2026-08', dueDate: '2026-08-01', detail: 'PLAN15MB25 - 2026 Agosto' },
			{ id: '7000009', amountCents: 2500, period: '2026-09', dueDate: '2026-09-01', detail: 'PLAN15MB25 - 2026 Septiembre' },
		])
	})

	it('RN10: una sola fila con deuda_id "0" es «sin deuda»', () => {
		const read = value(readContractRows([row({ deuda_id: '0', deuda: 0, detalle_deuda: [] })], 900101, CURRENT))
		assert.equal(read.kind, 'no_debt')
	})

	it('RN15: el periodo sale de lo que sigue al último « - », con el mes en español', () => {
		const read = value(readContractRows([row({ detalle_deuda: ['PLAN - 30MB - 2026 julio'] })], 900101, CURRENT))
		assert.equal(read.kind === 'installments' && read.installments[0]?.period, '2026-07')
	})

	it('RN16: un saldo menor a un centavo se lee como 0 (lo decide el clasificador)', () => {
		const read = value(readContractRows([row({ deuda: 0.001317 })], 900101, CURRENT))
		assert.equal(read.kind === 'installments' && read.installments[0]?.amountCents, 0)
	})

	it('estado desconocido pasa tal cual: lo decide el clasificador (RN9)', () => {
		const read = value(readContractRows([row({ estado: 'SUSPENDIDO' })], 900101, CURRENT))
		assert.equal(read.contract.status, 'SUSPENDIDO')
	})

	it('P3: deuda_id como número es el mismo identificador', () => {
		const read = value(readContractRows([row({ deuda_id: 7000008 })], 900101, CURRENT))
		assert.equal(read.kind === 'installments' && read.installments[0]?.id, '7000008')
	})

	it('RN6: opcionales que faltan quedan vacíos sin frenar el contrato', () => {
		const read = value(readContractRows([row({ email: undefined, telefono: '', nombre_plan: null, sigla_sucursal: undefined })], 900101, CURRENT))
		assert.deepEqual([read.contract.email, read.contract.phone, read.contract.plan, read.contract.branch], [null, null, null, null])
	})

	it('RN8: lo que se contradice deja el contrato fuera, diciendo qué', () => {
		const cases: Array<[string, unknown, RegExp]> = [
			['lista vacía', [], /vino vacía/],
			['no es lista', { data: [] }, /no es una lista/],
			['otro contrato', [row(), row({ contrato_id: 900102, deuda_id: '7000009' })], /otro contrato/],
			['cuota repetida', [row(), row()], /dos veces la cuota 7000008/],
			['sin deuda mezclado', [row(), row({ deuda_id: '0', deuda: 0 })], /«sin deuda» mezclada/],
			['estado distinto', [row(), row({ deuda_id: '7000009', estado: 'CORTADO' })], /no coinciden.*estado/],
			['titular distinto', [row(), row({ deuda_id: '7000009', identificacion_contrato: 'V-1' })], /no coinciden.*titular/],
			['moneda distinta', [row(), row({ deuda_id: '7000009', moneda_sigla: 'VES' })], /no coinciden.*moneda/],
			['precio distinto', [row(), row({ deuda_id: '7000009', precio_servicio: '30.000000' })], /no coinciden.*precio/],
			['monto negativo', [row({ deuda: -1 })], /monto negativo/],
			['periodo futuro', [row({ detalle_deuda: ['PLAN - 2026 Noviembre'] })], /posterior al mes actual/],
			['detalle ilegible', [row({ detalle_deuda: ['PLAN - 2026 Setiembre'] })], /no se puede leer el periodo/],
			['detalle con dos textos', [row({ detalle_deuda: ['a - 2026 Agosto', 'b'] })], /no se puede leer el periodo/],
			['falta el estado', [row({ estado: undefined })], /falta.*estado/],
			['falta la moneda', [row({ moneda_sigla: undefined })], /falta.*moneda/],
			['precio ilegible', [row({ precio_servicio: 'veinte' })], /falta.*precio/],
			['falta la deuda', [row({ deuda: undefined })], /falta.*monto/],
			['falta el número de cuota', [row({ deuda_id: undefined })], /falta.*cuota/],
		]
		for (const [name, body, expected] of cases) {
			assert.match(error(readContractRows(body, 900101, CURRENT)), expected, name)
		}
	})
})

// ---------------------------------------------------------------- ledger

describe('lector del libro de cuotas', () => {
	it('lee las 8 cosas que importan de cada fila', () => {
		const ledger = value(readLedgerRows(envelope([ledgerRow()]), 900101))
		assert.deepEqual(ledger.rows, [{
			installmentId: '7000008',
			contractId: 900101,
			period: '2026-08',
			balanceCents: 2000,
			paidCents: 500,
			invoiceId: 8800007,
			invoiceNumber: '008800007',
			issuedAt: '2026-08-06',
		}])
	})

	it('id_factura 0 es una cuota sin cobro: sin número ni fecha de factura', () => {
		const ledger = value(readLedgerRows(envelope([ledgerRow({ id_factura: 0, num_factura: '', fecha_emision: '2026-10-31' }, { valor_pago: 0, saldo_cuota: 25 })]), 900101))
		assert.deepEqual([ledger.rows[0]?.invoiceId, ledger.rows[0]?.invoiceNumber, ledger.rows[0]?.issuedAt], [0, null, null])
	})

	it('D20: un saldo menor a un centavo se lee como 0', () => {
		const ledger = value(readLedgerRows(envelope([ledgerRow({}, { saldo_cuota: 0.001317 })]), 900101))
		assert.equal(ledger.rows[0]?.balanceCents, 0)
	})

	it('las filas de otro contrato se leen igual: el clasificador las marca «En revisión» (RN28)', () => {
		const ledger = value(readLedgerRows(envelope([ledgerRow({ id_contrato: 900102 })]), 900101))
		assert.equal(ledger.rows[0]?.contractId, 900102)
	})

	it('una fila con un dato obligatorio mal no frena el resto: queda aparte con su cuota', () => {
		const ledger = value(readLedgerRows(envelope([ledgerRow(), ledgerRow({}, { id_cuota: 7000009, saldo_cuota: 'veinte' }), { basura: true }]), 900101))
		assert.equal(ledger.rows.length, 1)
		assert.deepEqual(ledger.unreadable.map(item => item.installmentId), ['7000009', null])
		assert.match(ledger.unreadable[0]?.reason ?? '', /saldo/)
	})

	it('CL7, D34: success false con datos se registra y no decide', () => {
		const ledger = value(readLedgerRows(envelope([ledgerRow()], { success: false }), 900101))
		assert.equal(ledger.rows.length, 1)
		assert.equal(ledger.technical.successFalseWithData, true)
	})

	it('si no es una lista, no se puede leer', () => {
		assert.match(error(readLedgerRows({ success: false }, 900101)), /libro de cuotas/)
	})
})
