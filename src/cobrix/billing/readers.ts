/**
 * Lectores estrictos de las respuestas del administrador (plan §5.2): `unknown` → datos tipados
 * o un ReadError que dice qué falló. Nada se adivina: el mismo valor escrito distinto se acepta
 * ("900101" por 900101); lo raro o contradictorio se informa (RN8, RN38). `success` y `errors`
 * nunca deciden (D34, CL24): se devuelven como datos técnicos y avisos.
 */

import { fail, ok, type Result } from '../result.ts'

export interface ReadError {
	readonly message: string
}

export interface Technical {
	/** D34: la API dijo `success: false` pero mandó datos válidos. */
	readonly successFalseWithData: boolean
}

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** La API trae hasta 6 decimales; Cobrix usa centavos (D20: menos de un centavo es 0). */
const toCents = (value: number): number => Math.round(value * 100)

/** Entero positivo, o texto con solo dígitos: el mismo valor escrito distinto. */
function readPositiveInteger(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : undefined
	if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) {
		const parsed = Number(value.trim())
		return parsed > 0 ? parsed : undefined
	}
	return undefined
}

/** Id de cuota: dígitos como texto o entero (P3). `"0"` queda `"0"`. */
function readInstallmentId(value: unknown): string | undefined {
	if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim().replace(/^0+(?=\d)/, '')
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return String(value)
	return undefined
}

/** `"25.000000"` o `25` → centavos. */
function readPrice(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return toCents(value)
	if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) return toCents(Number(value.trim()))
	return undefined
}

const optionalText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

function envelopeMeta(body: Row): { warnings: string[]; successFalse: boolean } {
	const warnings = Array.isArray(body.errors)
		? body.errors
			.map(item => (isRecord(item) && typeof item.message === 'string' ? item.message.trim() : ''))
			.filter(message => message !== '')
		: []
	return { warnings, successFalse: body.success === false }
}

// ---------------------------------------------------------------- lista_ids_contratos

export interface ContractList {
	readonly ids: readonly number[]
	/** RN38: lo que no es un número de contrato, tal como vino. */
	readonly unreadable: readonly unknown[]
	readonly warnings: readonly string[]
	readonly technical: Technical
}

export function readContractList(body: unknown): Result<ContractList, ReadError> {
	if (!isRecord(body) || !Array.isArray(body.data)) {
		return fail({ message: 'La lista de contratos no vino como una lista: no se puede leer.' })
	}
	const data: unknown[] = body.data
	const pagination = isRecord(body.pagination) ? body.pagination : undefined
	const total = pagination && typeof pagination.total === 'number' ? pagination.total : data.length
	const pages = pagination && typeof pagination.total_pages === 'number' ? pagination.total_pages : 1
	if (total !== data.length || pages > 1) {
		return fail({ message: `La lista de contratos vino incompleta (llegaron ${data.length} de ${total}).` })
	}

	const ids: number[] = []
	const unreadable: unknown[] = []
	for (const item of data) {
		const id = readPositiveInteger(item)
		if (id === undefined) unreadable.push(item)
		else if (!ids.includes(id)) ids.push(id)
	}
	const meta = envelopeMeta(body)
	return ok({ ids, unreadable, warnings: meta.warnings, technical: { successFalseWithData: meta.successFalse && ids.length > 0 } })
}

// ---------------------------------------------------------------- contrato/individual

export interface ContractInfo {
	readonly number: number
	/** Tal como vino; lo normaliza el clasificador (RN1, RN2). */
	readonly identification: string
	readonly holderName: string
	/** Tal como vino; el clasificador decide si se conoce (RN9). */
	readonly status: string
	readonly currency: string
	readonly priceCents: number
	readonly plan: string | null
	readonly branch: string | null
	/** En minúsculas (RN6). */
	readonly email: string | null
	readonly phone: string | null
}

export interface Installment {
	/** `deuda_id`, dígitos como texto. */
	readonly id: string
	/** `deuda` en centavos; 0 si es saldo residual (decide el clasificador, RN16). */
	readonly amountCents: number
	/** `YYYY-MM`. */
	readonly period: string
	/** Primer día del periodo (RN15). */
	readonly dueDate: string
	/** `detalle_deuda` tal como vino, para mostrarlo. */
	readonly detail: string
}

export type ContractRead =
	| { readonly kind: 'no_debt'; readonly contract: ContractInfo }
	| { readonly kind: 'installments'; readonly contract: ContractInfo; readonly installments: readonly Installment[] }

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `["PLAN15MB25 - 2026 Agosto"]` → `2026-08` (RN15). Solo los doce nombres de mes usuales (P4). */
export function readPeriod(detail: unknown): { period: string; text: string } | undefined {
	if (!Array.isArray(detail) || detail.length !== 1 || typeof detail[0] !== 'string') return undefined
	const text = detail[0]
	const last = text.split(' - ').at(-1)?.trim() ?? ''
	const match = /^(\d{4})\s+(\p{L}+)$/u.exec(last)
	if (!match) return undefined
	const month = MONTHS.indexOf((match[2] ?? '').toLowerCase())
	if (month < 0) return undefined
	return { period: `${match[1]}-${String(month + 1).padStart(2, '0')}`, text }
}

interface RowFields {
	readonly contractId: number | undefined
	readonly identification: string | undefined
	readonly holderName: string | undefined
	readonly status: string | undefined
	readonly currency: string | undefined
	readonly priceCents: number | undefined
}

function rowFields(row: Row): RowFields {
	const identification = row.identificacion_contrato
	return {
		contractId: readPositiveInteger(row.contrato_id),
		// Sin identificación es identificación inválida (RN2), no una contradicción.
		identification: identification === null || identification === undefined ? '' : typeof identification === 'string' ? identification : undefined,
		holderName: optionalText(row.nombre_contrato) ?? undefined,
		status: optionalText(row.estado) ?? undefined,
		currency: optionalText(row.moneda_sigla) ?? undefined,
		priceCents: readPrice(row.precio_servicio),
	}
}

const REQUIRED: ReadonlyArray<[keyof RowFields, string]> = [
	['contractId', 'el número de contrato'],
	['identification', 'la identificación del titular'],
	['holderName', 'el nombre del titular'],
	['status', 'el estado del contrato'],
	['currency', 'la moneda'],
	['priceCents', 'el precio del plan'],
]

export function readContractRows(body: unknown, requestedId: number, currentPeriod: string): Result<ContractRead, ReadError> {
	const inconsistent = (reason: string) => fail({ message: `Respuesta inconsistente del contrato ${requestedId}: ${reason}.` })
	if (!Array.isArray(body)) return inconsistent('la respuesta no es una lista de cuotas')
	if (body.length === 0) return inconsistent('vino vacía')

	const rows: Row[] = []
	for (const item of body) {
		if (!isRecord(item)) return inconsistent('una fila no se puede leer')
		rows.push(item)
	}
	const fields = rows.map(rowFields)
	for (const field of fields) {
		for (const [key, label] of REQUIRED) {
			if (field[key] === undefined) return inconsistent(`falta ${label} o no se puede leer`)
		}
		if (field.contractId !== requestedId) return inconsistent(`trae filas de otro contrato (${String(field.contractId)})`)
	}
	const first = fields[0]
	if (!first) return inconsistent('vino vacía')
	const mismatch: Array<[keyof RowFields, string]> = [['status', 'estado'], ['identification', 'titular'], ['currency', 'moneda'], ['priceCents', 'precio del plan']]
	for (const [key, label] of mismatch) {
		if (fields.some(field => field[key] !== first[key])) return inconsistent(`sus filas no coinciden en el ${label}`)
	}

	const head = rows[0] ?? {}
	const contract: ContractInfo = {
		number: requestedId,
		identification: first.identification ?? '',
		holderName: first.holderName ?? '',
		status: first.status ?? '',
		currency: first.currency ?? '',
		priceCents: first.priceCents ?? 0,
		plan: optionalText(head.nombre_plan),
		branch: optionalText(head.sigla_sucursal),
		email: optionalText(head.email)?.toLowerCase() ?? null,
		phone: optionalText(head.telefono),
	}

	const ids = rows.map(row => readInstallmentId(row.deuda_id))
	if (ids.some(id => id === undefined)) return inconsistent('falta el número de cuota (deuda_id) o no se puede leer')
	if (ids.includes('0')) {
		if (rows.length > 1) return inconsistent('trae la fila «sin deuda» mezclada con cuotas')
		return ok({ kind: 'no_debt', contract })
	}

	const installments: Installment[] = []
	for (const [index, row] of rows.entries()) {
		const id = ids[index] ?? ''
		if (installments.some(installment => installment.id === id)) return inconsistent(`trae dos veces la cuota ${id}`)
		if (typeof row.deuda !== 'number' || !Number.isFinite(row.deuda)) return inconsistent(`falta el monto de la cuota ${id} o no se puede leer`)
		if (row.deuda < 0) return inconsistent(`la cuota ${id} tiene un monto negativo`)
		const period = readPeriod(row.detalle_deuda)
		if (!period) return inconsistent(`no se puede leer el periodo de la cuota ${id} («${JSON.stringify(row.detalle_deuda)}»)`)
		if (period.period > currentPeriod) return inconsistent(`la cuota ${id} es de un periodo posterior al mes actual (${period.period})`)
		installments.push({ id, amountCents: toCents(row.deuda), period: period.period, dueDate: `${period.period}-01`, detail: period.text })
	}
	return ok({ kind: 'installments', contract, installments })
}

// ---------------------------------------------------------------- pago_informacion

export interface LedgerRow {
	/** `detalle_pago.id_cuota` como texto, para compararlo con `deuda_id`. */
	readonly installmentId: string
	readonly contractId: number
	readonly period: string
	readonly balanceCents: number
	readonly paidCents: number
	/** 0 = la cuota no tiene cobro. */
	readonly invoiceId: number
	readonly invoiceNumber: string | null
	readonly issuedAt: string | null
}

export interface Ledger {
	readonly rows: readonly LedgerRow[]
	/** Filas con un campo obligatorio mal: su factura queda «En revisión», nunca pagada. */
	readonly unreadable: ReadonlyArray<{ readonly installmentId: string | null; readonly reason: string }>
	readonly warnings: readonly string[]
	readonly technical: Technical
}

const nonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function readLedgerRow(item: unknown): Result<LedgerRow, { installmentId: string | null; reason: string }> {
	if (!isRecord(item) || !isRecord(item.detalle_pago)) return fail({ installmentId: null, reason: 'la fila no tiene detalle de pago' })
	const detail = item.detalle_pago
	const installmentId = readInstallmentId(detail.id_cuota) ?? null
	const bad = (reason: string) => fail({ installmentId, reason })
	if (installmentId === null) return bad('falta el número de cuota')
	const contractId = readPositiveInteger(item.id_contrato)
	if (contractId === undefined) return bad('falta el número de contrato')
	if (typeof detail.periodo_cuota !== 'string' || !/^\d{4}-\d{2}$/.test(detail.periodo_cuota)) return bad('falta el periodo de la cuota')
	if (!nonNegative(detail.saldo_cuota)) return bad('falta el saldo de la cuota o no se puede leer')
	if (!nonNegative(detail.valor_pago)) return bad('falta el monto pagado o no se puede leer')
	const invoiceId = item.id_factura
	if (typeof invoiceId !== 'number' || !Number.isInteger(invoiceId) || invoiceId < 0) return bad('falta el número de factura del administrador')
	let invoiceNumber: string | null = null
	let issuedAt: string | null = null
	if (invoiceId !== 0) {
		invoiceNumber = optionalText(item.num_factura)
		if (invoiceNumber === null) return bad('falta el número visible de la factura del administrador')
		if (typeof item.fecha_emision !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.fecha_emision)) return bad('falta la fecha de la factura del administrador')
		issuedAt = item.fecha_emision
	}
	return ok({
		installmentId,
		contractId,
		period: detail.periodo_cuota,
		balanceCents: toCents(detail.saldo_cuota),
		paidCents: toCents(detail.valor_pago),
		invoiceId,
		invoiceNumber,
		issuedAt,
	})
}

export function readLedgerRows(body: unknown, contractId: number): Result<Ledger, ReadError> {
	if (!isRecord(body) || !Array.isArray(body.data)) {
		return fail({ message: `El libro de cuotas del contrato ${contractId} no vino como una lista: no se puede leer.` })
	}
	const data: unknown[] = body.data
	const rows: LedgerRow[] = []
	const unreadable: Array<{ installmentId: string | null; reason: string }> = []
	for (const item of data) {
		const result = readLedgerRow(item)
		if (result.ok) rows.push(result.value)
		else unreadable.push(result.error)
	}
	const meta = envelopeMeta(body)
	return ok({ rows, unreadable, warnings: meta.warnings, technical: { successFalseWithData: meta.successFalse && rows.length > 0 } })
}
