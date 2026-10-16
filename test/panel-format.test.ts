/**
 * The panel's small logic, without a browser: how money and dates look (RF39) and that every
 * state has its text, tone and icon (RF38).
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { amount, date, dateTime, period, usd } from '../src/panel/lib/format.ts'
import {
	CONTRACT_STATUS,
	IMPORT_OUTCOME,
	importOutcome,
	INVOICE_STATUS,
	PAID_OUTCOME,
	paidOutcome,
	RUN_STATUS,
	type StatusInfo,
} from '../src/panel/lib/status.ts'
import { CONTRACT_STATUSES, IMPORT_OUTCOMES, PAID_OUTCOMES } from '../src/shared/api-types.ts'

/** Intl may use non-breaking spaces in «a. m.»: compare with plain spaces. */
const plain = (text: string) => text.replace(/\s/gu, ' ')

describe('formato del panel', () => {
	it('RF39: montos con moneda, separador de miles y coma decimal', () => {
		assert.equal(usd(123_500), 'USD 1.235,00')
		assert.equal(usd(95_500), 'USD 955,00')
		assert.equal(usd(0), 'USD 0,00')
		assert.equal(usd(5_000_000), 'USD 50.000,00')
		assert.equal(amount(9_500), '95,00')
	})

	it('RF39: fechas legibles, sin el punto que agrega Intl', () => {
		assert.equal(date('2026-10-13'), '13 oct 2026')
		assert.equal(date('2026-08-01'), '1 ago 2026')
		assert.equal(period('2026-08'), 'ago 2026')
	})

	it('RF39: los momentos se muestran en hora de Caracas', () => {
		assert.equal(plain(dateTime('2026-10-13T07:41:00.000Z')), '13 oct 2026, 3:41 a. m.')
		// 02:00 UTC del 14 son las 22:00 del 13 en Caracas.
		assert.equal(plain(dateTime('2026-10-14T02:00:00.000Z')), '13 oct 2026, 10:00 p. m.')
	})
})

describe('mapa de estados', () => {
	const complete = (info: StatusInfo, name: string) => {
		assert.ok(info.label.length > 0, `${name} sin texto`)
		assert.ok(['success', 'info', 'warning', 'danger', 'neutral'].includes(info.tone), `${name} sin tono`)
		assert.ok(info.icon.length > 0, `${name} sin ícono`)
	}

	it('RF38: cada estado y cada resultado tiene texto, tono e ícono', () => {
		for (const status of CONTRACT_STATUSES) complete(CONTRACT_STATUS[status], status)
		for (const outcome of IMPORT_OUTCOMES) complete(IMPORT_OUTCOME[outcome], outcome)
		for (const outcome of PAID_OUTCOMES) complete(PAID_OUTCOME[outcome], outcome)
		for (const status of ['open', 'paid'] as const) complete(INVOICE_STATUS[status], status)
		for (const status of ['running', 'completed', 'failed'] as const) complete(RUN_STATUS[status], status)
	})

	it('en una simulación, lo que se crearía se lee en condicional', () => {
		assert.equal(importOutcome('imported', true).label, 'Se importaría')
		assert.equal(importOutcome('imported', false).label, 'Importada')
		assert.equal(paidOutcome('marked_paid', true).label, 'Se marcaría pagada')
		assert.equal(importOutcome('excluded_status', true).label, 'Excluida por estado')
	})

	it('RN2, RN38: lo que pide revisar a mano se ve como advertencia', () => {
		for (const outcome of ['invalid_identification', 'unreadable_list_item', 'inconsistent_response', 'unknown_status'] as const) {
			assert.equal(IMPORT_OUTCOME[outcome].tone, 'warning', outcome)
		}
		assert.equal(PAID_OUTCOME.partial.tone, 'warning')
		assert.equal(PAID_OUTCOME.no_evidence.tone, 'warning')
	})
})
