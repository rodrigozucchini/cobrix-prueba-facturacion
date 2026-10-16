/**
 * Import rules (RN9–RN21, D5–D7, D17, CL19, CL21): what happens to each installment of a contract,
 * in the order of the spec, and the caps across the whole run. Pure functions, no server.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ContractInfo, ContractRead, Installment } from '../src/cobrix/billing/readers.ts'
import { applyCaps, classifyContract, type Candidate, type ImportRules } from '../src/cobrix/rules/import.ts'

const CURRENT = '2026-10'

const DEFAULT_RULES: ImportRules = {
	importStates: ['ACTIVO', 'CORTADO'],
	windowMonths: null,
	maxRecent: null,
	excludedDocTypes: [],
}

const contract = (fields: Partial<ContractInfo> = {}): ContractInfo => ({
	number: 900101,
	identification: 'V-12345678',
	holderName: 'ANA PEREZ',
	status: 'ACTIVO',
	currency: 'USD',
	priceCents: 2500,
	plan: 'PLAN15MB25',
	branch: 'VLN',
	email: null,
	phone: null,
	...fields,
})

let nextId = 7_000_000
const cuota = (period: string, amountCents = 2500): Installment => ({
	id: String(++nextId),
	amountCents,
	period,
	dueDate: `${period}-01`,
	detail: `PLAN - ${period}`,
})

const read = (fields: Partial<ContractInfo>, installments: Installment[]): ContractRead => ({ kind: 'installments', contract: contract(fields), installments })

const classify = (value: ContractRead, rules: Partial<ImportRules> = {}, imported: string[] = []) =>
	classifyContract(value, { ...DEFAULT_RULES, ...rules }, { currentPeriod: CURRENT, imported: new Set(imported) })

const outcomes = (decision: ReturnType<typeof classify>) => decision.rows.map(row => row.outcome)
const periods = (candidates: readonly Candidate[]) => candidates.map(candidate => candidate.installment.period)

const MARCH_TO_OCTOBER = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

describe('reglas de importación por contrato', () => {
	it('RN9: un estado desconocido deja el contrato fuera, en una sola fila', () => {
		const decision = classify(read({ status: 'SUSPENDIDO' }, [cuota('2026-09'), cuota('2026-10')]))
		assert.deepEqual(outcomes(decision), ['unknown_status'])
		assert.equal(decision.rows[0]?.installment, null)
		assert.match(decision.rows[0]?.reason ?? '', /SUSPENDIDO/)
		assert.deepEqual(decision.candidates, [])
	})

	it('RN10: sin deuda es una sola fila del contrato', () => {
		const decision = classify({ kind: 'no_debt', contract: contract({ holderName: 'LAURA MENDEZ' }) })
		assert.deepEqual(outcomes(decision), ['no_debt'])
		assert.deepEqual(decision.candidates, [])
	})

	it('RN2: una cédula inválida deja el contrato fuera con el motivo, en una sola fila', () => {
		const decision = classify(read({ identification: 'V-000123' }, [cuota('2026-09'), cuota('2026-10')]))
		assert.deepEqual(outcomes(decision), ['invalid_identification'])
		assert.match(decision.rows[0]?.reason ?? '', /menos de 6 dígitos/)
		assert.match(decision.rows[0]?.reason ?? '', /V-000123/)
	})

	it('RN12: un estado no importable excluye cada cuota (CARLOS ROJAS, cortesía)', () => {
		const decision = classify(read({ status: 'CORTESIA', holderName: 'CARLOS ROJAS' }, [cuota('2026-08'), cuota('2026-09'), cuota('2026-10')]))
		assert.deepEqual(outcomes(decision), ['excluded_status', 'excluded_status', 'excluded_status'])
		assert.match(decision.rows[0]?.reason ?? '', /CORTESIA/)
		assert.deepEqual(decision.candidates, [])
	})

	it('RN13: la letra excluida deja fuera cada cuota; sin letra nunca se excluye', () => {
		const faro = classify(read({ identification: 'J-40123456-7' }, [cuota('2026-09'), cuota('2026-10')]), { excludedDocTypes: ['J'] })
		assert.deepEqual(outcomes(faro), ['excluded_doc_type', 'excluded_doc_type'])
		const elena = classify(read({ identification: '09000123' }, [cuota('2026-09'), cuota('2026-10')]), { excludedDocTypes: ['V'] })
		assert.equal(elena.candidates.length, 2)
	})

	it('RN14: otra moneda deja el contrato fuera', () => {
		const decision = classify(read({ currency: 'VES' }, [cuota('2026-10')]))
		assert.deepEqual(outcomes(decision), ['currency_not_usd'])
	})

	it('RN14, D17: cuotas de menos del 1 % del plan son moneda incoherente (JORGE CASTILLO)', () => {
		const decision = classify(read({ priceCents: 2000, holderName: 'JORGE CASTILLO' }, [cuota('2026-09', 5), cuota('2026-10', 5)]))
		assert.deepEqual(outcomes(decision), ['currency_incoherent', 'currency_incoherent'])
		assert.match(decision.rows[0]?.reason ?? '', /USD 0,05/)
		assert.match(decision.rows[0]?.reason ?? '', /USD 20,00/)
	})

	it('RN14: una cuota residual no cuenta para la moneda incoherente', () => {
		const decision = classify(read({ priceCents: 2500 }, [cuota('2026-09', 0), cuota('2026-10', 2500)]))
		assert.deepEqual(outcomes(decision), ['residual'])
		assert.equal(decision.candidates.length, 1)
	})
})

describe('reglas de importación por cuota', () => {
	it('RN16: un saldo menor a un centavo no se importa (SOFIA TORRES)', () => {
		const decision = classify(read({}, [cuota('2026-09', 0), cuota('2026-10')]))
		assert.deepEqual(outcomes(decision), ['residual'])
		assert.deepEqual(periods(decision.candidates), ['2026-10'])
	})

	it('RN17, D5: con ventana de 3 meses entra desde julio inclusive (MIGUEL ANGEL SOTO)', () => {
		const decision = classify(read({}, MARCH_TO_OCTOBER.map(period => cuota(period, 3500))), { windowMonths: 3 })
		assert.equal(outcomes(decision).filter(outcome => outcome === 'outside_window').length, 4)
		assert.deepEqual(periods(decision.candidates), ['2026-07', '2026-08', '2026-09', '2026-10'])
		assert.match(decision.rows[0]?.reason ?? '', /jul 2026/)
	})

	it('RN18: con máximo 2 se conservan las más recientes (MIGUEL ANGEL SOTO)', () => {
		const decision = classify(read({}, MARCH_TO_OCTOBER.map(period => cuota(period, 3500))), { maxRecent: 2 })
		assert.equal(outcomes(decision).filter(outcome => outcome === 'excluded_max').length, 6)
		assert.deepEqual(periods(decision.candidates), ['2026-09', '2026-10'])
	})

	it('D7: el máximo se aplica después de la ventana', () => {
		const decision = classify(read({}, MARCH_TO_OCTOBER.map(period => cuota(period, 3500))), { windowMonths: 3, maxRecent: 2 })
		assert.equal(outcomes(decision).filter(outcome => outcome === 'outside_window').length, 4)
		assert.equal(outcomes(decision).filter(outcome => outcome === 'excluded_max').length, 2)
		assert.deepEqual(periods(decision.candidates), ['2026-09', '2026-10'])
	})

	it('RN19: una cuota que ya tiene factura es «Ya importada»', () => {
		const first = cuota('2026-09')
		const decision = classify(read({}, [first, cuota('2026-10')]), {}, [first.id])
		assert.deepEqual(outcomes(decision), ['already_imported'])
		assert.deepEqual(periods(decision.candidates), ['2026-10'])
	})

	it('CL21: el orden en que llegan las cuotas no cambia el resultado', () => {
		const ordered = MARCH_TO_OCTOBER.map(period => cuota(period, 3500))
		const shuffled = [ordered[5], ordered[0], ordered[7], ordered[2], ordered[1], ordered[6], ordered[4], ordered[3]].filter((item): item is Installment => item !== undefined)
		const decision = classify(read({}, shuffled), { maxRecent: 2 })
		assert.deepEqual(periods(decision.candidates), ['2026-09', '2026-10'])
	})

	it('la identificación de cada candidata ya va normalizada', () => {
		const decision = classify(read({ identification: '09000123' }, [cuota('2026-10')]))
		assert.equal(decision.candidates[0]?.identification.key, '9000123')
	})
})

describe('topes por corrida', () => {
	const candidate = (number: number, period: string, amountCents: number): Candidate => {
		const decision = classify(read({ number }, [cuota(period, amountCents)]))
		const found = decision.candidates[0]
		assert.ok(found)
		return found
	}

	it('RN20, D6: por contrato y periodo; desde la primera que pasa el tope, esa y todas las siguientes quedan frenadas', () => {
		const result = applyCaps([candidate(900103, '2026-10', 2000), candidate(900101, '2026-09', 2000), candidate(900101, '2026-08', 2000), candidate(900102, '2026-10', 3500)], { invoices: 2, amountCents: 5_000_000 })
		assert.deepEqual(result.imported.map(c => `${c.contract.number}/${c.installment.period}`), ['900101/2026-08', '900101/2026-09'])
		assert.deepEqual(result.blocked.map(c => `${c.contract.number}/${c.installment.period}`), ['900102/2026-10', '900103/2026-10'])
	})

	it('RN20: con el tope de monto, frena aunque una cuota siguiente más chica entraría', () => {
		const result = applyCaps([candidate(900101, '2026-08', 2000), candidate(900102, '2026-08', 5000), candidate(900103, '2026-08', 1000)], { invoices: 500, amountCents: 6000 })
		assert.deepEqual(result.imported.map(c => c.installment.amountCents), [2000])
		assert.deepEqual(result.blocked.map(c => c.installment.amountCents), [5000, 1000])
	})

	it('CL19: si el tope de monto es menor que la primera cuota, no se importa ninguna', () => {
		const result = applyCaps([candidate(900101, '2026-08', 2000), candidate(900102, '2026-08', 1000)], { invoices: 500, amountCents: 1500 })
		assert.equal(result.imported.length, 0)
		assert.equal(result.blocked.length, 2)
	})
})
