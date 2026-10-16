/**
 * Debt aging (extras RF42, RF43, RN39–RN41, CL27, CL28): days from the due date to the working
 * date, over open invoices only, always in the same 4 buckets. First with invoices built by hand
 * (the examples of RN39 and the edges), then against the simulated administrator (CA44–CA46).
 */

import assert from 'node:assert/strict'
import type { DatabaseSync } from 'node:sqlite'
import { after, before, describe, it } from 'node:test'

import { readAging } from '../src/cobrix/queries/aging.ts'
import { listCustomers } from '../src/cobrix/queries/customers.ts'
import { openDatabase } from '../src/cobrix/store/db.ts'
import { insertCustomer, insertInvoice, markInvoicePaid, upsertContract } from '../src/cobrix/store/imports.ts'
import { createRun } from '../src/cobrix/store/runs.ts'
import type { AgingBucket, CustomerListItem, ErrorBody, Summary } from '../src/shared/api-types.ts'
import { startSandbox, type Sandbox } from './helpers/sandbox.ts'

const TODAY = '2026-10-13'
const NOW = '2026-10-13T10:00:00.000Z'

/** A Cobrix database with customers and open invoices built by hand. */
function dbWith(customers: Record<string, ReadonlyArray<{ due: string; cents: number; paid?: boolean }>>): DatabaseSync {
	const db = openDatabase(':memory:')
	const runId = createRun(db, { kind: 'import', simulation: false, origin: 'manual', startedAt: NOW })
	let contract = 900000
	let installment = 7000000
	for (const [name, invoices] of Object.entries(customers)) {
		contract += 1
		const key = `V${contract}`
		insertCustomer(db, { key, document: key, name, personType: 'natural', email: null, phone: null }, 'Administrador de facturas', runId, NOW)
		upsertContract(db, { number: contract, customerKey: key, holderName: name, status: 'ACTIVO', plan: null, priceCents: 2000, branch: null }, NOW)
		for (const invoice of invoices) {
			installment += 1
			const id = insertInvoice(db, {
				externalId: String(installment), contractNumber: contract, customerKey: key,
				period: invoice.due.slice(0, 7), dueDate: invoice.due, cutDate: invoice.due, amountCents: invoice.cents,
			}, runId)
			if (invoice.paid) markInvoicePaid(db, id, { paidAt: TODAY, paidRef: '008800001' }, runId)
		}
	}
	return db
}

const pairs = (aging: readonly AgingBucket[]) => aging.map(bucket => `${bucket.key}: ${bucket.count} / ${bucket.amountCents}`)

/** The bucket a single open invoice due on that date falls in. */
function bucketOf(due: string): string | undefined {
	return readAging(dbWith({ ANA: [{ due, cents: 100 }] }), TODAY).find(bucket => bucket.count === 1)?.key
}

describe('antigüedad de la deuda: reglas', () => {
	it('RN39, RN40: con los ejemplos de la spec (12, 42, 73, 104 y 165 días), cada factura cae en su tramo', () => {
		const db = dbWith({
			'LUIS GOMEZ': [
				{ due: '2026-10-01', cents: 1000 },
				{ due: '2026-09-01', cents: 2000 },
				{ due: '2026-08-01', cents: 3000 },
				{ due: '2026-07-01', cents: 4000 },
				{ due: '2026-05-01', cents: 5000 },
			],
		})
		assert.deepEqual(pairs(readAging(db, TODAY)), ['0-30: 1 / 1000', '31-60: 1 / 2000', '61-90: 1 / 3000', '90+: 2 / 9000'])
	})

	it('RN40: los bordes: 30 y 31, 60 y 61, 90 y 91 días', () => {
		assert.equal(bucketOf('2026-09-13'), '0-30')
		assert.equal(bucketOf('2026-09-12'), '31-60')
		assert.equal(bucketOf('2026-08-14'), '31-60')
		assert.equal(bucketOf('2026-08-13'), '61-90')
		assert.equal(bucketOf('2026-07-15'), '61-90')
		assert.equal(bucketOf('2026-07-14'), '90+')
		assert.equal(bucketOf(TODAY), '0-30')
	})

	it('P25: una factura que todavía no venció cuenta en 0–30', () => {
		assert.equal(bucketOf('2026-10-20'), '0-30')
	})

	it('RN40, D16: las pagadas no cuentan', () => {
		const db = dbWith({ ANA: [{ due: '2026-05-01', cents: 2000, paid: true }, { due: '2026-10-01', cents: 2500 }] })
		assert.deepEqual(pairs(readAging(db, TODAY)), ['0-30: 1 / 2500', '31-60: 0 / 0', '61-90: 0 / 0', '90+: 0 / 0'])
	})

	it('CL27: sin facturas abiertas, los 4 tramos en 0 y en orden', () => {
		assert.deepEqual(pairs(readAging(dbWith({}), TODAY)), ['0-30: 0 / 0', '31-60: 0 / 0', '61-90: 0 / 0', '90+: 0 / 0'])
	})

	it('RN41, CL28: el filtro deja a quien tiene al menos una factura abierta en el tramo; un cliente puede estar en varios', () => {
		const db = dbWith({
			MIGUEL: [{ due: '2026-05-01', cents: 3500 }, { due: '2026-10-01', cents: 3500 }],
			ELENA: [{ due: '2026-09-01', cents: 2500 }],
			ANA: [{ due: '2026-05-01', cents: 2000, paid: true }],
		})
		const names = (bucket: Parameters<typeof listCustomers>[1]['bucket']) =>
			listCustomers(db, { query: '', sort: 'vencimiento', bucket, today: TODAY }).map(customer => customer.name)
		assert.deepEqual(names('90+'), ['MIGUEL'], 'ANA tiene una pagada de más de 90 días: no cuenta')
		assert.deepEqual(names('0-30'), ['MIGUEL'])
		assert.deepEqual(names('31-60'), ['ELENA'])
		assert.deepEqual(names('61-90'), [])
		assert.deepEqual(names(null), ['MIGUEL', 'ELENA', 'ANA'])
	})
})

describe('antigüedad de la deuda contra la API simulada', () => {
	let sandbox: Sandbox
	let imported: readonly AgingBucket[]
	let afterCycle: readonly AgingBucket[]
	let openAfterCycle: number

	before(async () => {
		sandbox = await startSandbox()
		await sandbox.run(false)
		imported = (await sandbox.get<Summary>('/api/resumen')).body.aging
		await sandbox.payAsInAssignment()
		await sandbox.run(false, 'paid')
		const summary = (await sandbox.get<Summary>('/api/resumen')).body
		afterCycle = summary.aging
		openAfterCycle = summary.totals.openAmountCents
	})
	after(() => sandbox.close())

	const total = (aging: readonly AgingBucket[]) => aging.reduce((sum, bucket) => sum + bucket.amountCents, 0)
	const names = async (query: string) => (await sandbox.get<CustomerListItem[]>(`/api/clientes${query}`)).body.map(customer => customer.name)

	it('CA44: recién importado, 21/USD 615 · 9/USD 270 · 6/USD 155 · 6/USD 195, que suman USD 1.235,00', () => {
		assert.deepEqual(pairs(imported), ['0-30: 21 / 61500', '31-60: 9 / 27000', '61-90: 6 / 15500', '90+: 6 / 19500'])
		assert.equal(total(imported), 123_500)
	})

	it('CA45: después del ciclo, 19/USD 530 · 7/USD 185 · 5/USD 135 · 3/USD 105, que suman el monto por cobrar', () => {
		assert.deepEqual(pairs(afterCycle), ['0-30: 19 / 53000', '31-60: 7 / 18500', '61-90: 5 / 13500', '90+: 3 / 10500'])
		assert.equal(total(afterCycle), openAfterCycle)
		assert.equal(openAfterCycle, 95_500)
	})

	it('CA46, RN41: «más de 90 días» da solo a MIGUEL ANGEL SOTO; sin filtro vuelven los 20', async () => {
		assert.deepEqual(await names('?tramo=90%2B'), ['MIGUEL ANGEL SOTO'])
		assert.equal((await names('')).length, 20)
		assert.deepEqual(await names('?tramo=90%2B&q=luis'), [], 'el filtro se combina con la búsqueda')
	})

	it('RF43: un tramo desconocido responde 400', async () => {
		const { status, body } = await sandbox.get<ErrorBody>('/api/clientes?tramo=120')
		assert.equal(status, 400)
		assert.equal(body.error.code, 'validation')
	})
})
