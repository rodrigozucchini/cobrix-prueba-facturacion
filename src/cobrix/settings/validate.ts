/**
 * Lectura estricta de la configuración (RF1, RF2, RF5, RF6, RF7, D36): `unknown` → datos, o un
 * mensaje por campo que dice qué está mal y qué se acepta. Funciones puras.
 */

import {
	CONTRACT_STATUSES,
	DOC_TYPES,
	IMPORT_WINDOWS,
	type CompanyInput,
	type ConnectionTestInput,
	type ContractStatus,
	type DocType,
	type ImportWindow,
	type ProviderInput,
} from '../../shared/api-types.ts'
import { fail, ok, type Result } from '../result.ts'

/** Campo → mensaje. */
export type FieldErrors = Record<string, string>

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value.trim() : undefined)

function integerIn(value: unknown, min: number, max: number): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined
}

function listOf<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
	if (!Array.isArray(value)) return undefined
	const items: T[] = []
	for (const item of value) {
		const found = allowed.find(candidate => candidate === item)
		if (found === undefined) return undefined
		if (!items.includes(found)) items.push(found)
	}
	return items
}

const RIF = /^([VEJGP])-?(\d{8})-?(\d)$/
const EMAIL = /^[^\s@]+@[^\s@]+$/

/** `j123456789` o `J-12345678-9` → `J-12345678-9` (RF1). */
export function normalizeRif(raw: string): string | undefined {
	const match = RIF.exec(raw.trim().toUpperCase())
	return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
}

export function validateCompany(raw: unknown): Result<CompanyInput, FieldErrors> {
	if (!isRecord(raw)) return fail({ company: 'Faltan los datos de la empresa.' })
	const errors: FieldErrors = {}
	const name = text(raw.name)
	if (!name) errors['company.name'] = 'El nombre es obligatorio.'
	const rif = normalizeRif(text(raw.rif) ?? '')
	if (!rif) errors['company.rif'] = 'El RIF debe tener una letra (V, E, J, G o P) y 9 dígitos, por ejemplo J-12345678-9.'
	const email = text(raw.email)
	if (!email || !EMAIL.test(email)) errors['company.email'] = 'Escribe un correo válido, por ejemplo cobranza@empresa.com.'
	if (Object.keys(errors).length > 0 || !name || !rif || !email) return fail(errors)
	return ok({ name, rif, email })
}

function validUrl(raw: string): boolean {
	if (!/^https?:\/\//i.test(raw)) return false
	try {
		new URL(raw)
		return true
	} catch {
		return false
	}
}

/** `hasStoredPassword`: la contraseña vacía conserva la guardada (RF3), pero la primera vez es obligatoria. */
export function validateProvider(raw: unknown, hasStoredPassword: boolean): Result<ProviderInput, FieldErrors> {
	if (!isRecord(raw)) return fail({ provider: 'Faltan los datos del proveedor.' })
	const errors: FieldErrors = {}
	const p = (field: string, message: string) => {
		errors[`provider.${field}`] = message
	}

	const name = text(raw.name)
	if (!name) p('name', 'El nombre visible es obligatorio.')
	const apiUrl = text(raw.apiUrl)
	if (!apiUrl || !validUrl(apiUrl)) p('apiUrl', 'Escribe la dirección completa de la API, que empiece con http:// o https://. Por ejemplo, http://127.0.0.1:4310.')
	const apiUser = text(raw.apiUser)
	if (!apiUser) p('apiUser', 'El usuario es obligatorio.')
	const apiPassword = typeof raw.apiPassword === 'string' ? raw.apiPassword : undefined
	if (apiPassword === undefined) p('apiPassword', 'La contraseña tiene que ser un texto.')
	else if (apiPassword === '' && !hasStoredPassword) p('apiPassword', 'La contraseña es obligatoria la primera vez.')

	const importStates = listOf<ContractStatus>(raw.importStates, CONTRACT_STATUSES)
	if (!importStates || importStates.length === 0) p('importStates', 'Elige al menos un estado de contrato para importar.')

	let windowMonths: ImportWindow | null | undefined
	if (raw.windowMonths === null) windowMonths = null
	else windowMonths = IMPORT_WINDOWS.find(months => months === raw.windowMonths)
	if (windowMonths === undefined) p('windowMonths', 'La ventana debe ser 3, 6, 9 o 12 meses, o sin ventana.')

	const maxRecent = raw.maxRecent === null ? null : integerIn(raw.maxRecent, 1, 60)
	if (maxRecent === undefined) p('maxRecent', 'Debe ser un número entero de 1 a 60, o vacío para todas.')

	const graceDays = integerIn(raw.graceDays, 0, 60)
	if (graceDays === undefined) p('graceDays', 'Debe ser un número entero de 0 a 60.')

	const capInvoices = integerIn(raw.capInvoices, 1, Number.MAX_SAFE_INTEGER)
	if (capInvoices === undefined) p('capInvoices', 'Debe ser un número entero de 1 o más.')

	const capAmountCents = integerIn(raw.capAmountCents, 1, Number.MAX_SAFE_INTEGER)
	if (capAmountCents === undefined) p('capAmountCents', 'Debe ser un monto mayor que USD 0, con hasta 2 decimales.')

	const excludedDocTypes = listOf<DocType>(raw.excludedDocTypes, DOC_TYPES)
	if (!excludedDocTypes) p('excludedDocTypes', 'Los tipos de documento válidos son V, E, J, G y P.')

	const autoEnabled = typeof raw.autoEnabled === 'boolean' ? raw.autoEnabled : undefined
	if (autoEnabled === undefined) p('autoEnabled', 'Indica si la corrida automática está activa.')

	const autoHour = raw.autoHour === null ? null : integerIn(raw.autoHour, 0, 23)
	if (autoHour === undefined) p('autoHour', 'La hora debe ser de 0 a 23.')
	else if (autoEnabled === true && autoHour === null) p('autoHour', 'Elige la hora de la corrida automática.')

	if (
		Object.keys(errors).length > 0
		|| !name || !apiUrl || !apiUser || apiPassword === undefined || !importStates || windowMonths === undefined
		|| maxRecent === undefined || graceDays === undefined || capInvoices === undefined || capAmountCents === undefined
		|| !excludedDocTypes || autoEnabled === undefined || autoHour === undefined
	) {
		return fail(errors)
	}
	return ok({
		name, apiUrl, apiUser, apiPassword, importStates, windowMonths, maxRecent, graceDays,
		capInvoices, capAmountCents, excludedDocTypes, autoEnabled, autoHour,
	})
}

/** «Probar conexión» (RF4, D24): URL, usuario y contraseña, con las reglas de guardar. Vacía usa la guardada. */
export function validateConnectionTest(raw: unknown, hasStoredPassword: boolean): Result<ConnectionTestInput, FieldErrors> {
	if (!isRecord(raw)) return fail({ provider: 'Faltan la URL, el usuario y la contraseña.' })
	const errors: FieldErrors = {}
	const apiUrl = text(raw.apiUrl)
	if (!apiUrl || !validUrl(apiUrl)) errors['provider.apiUrl'] = 'Escribe la dirección completa de la API, que empiece con http:// o https://. Por ejemplo, http://127.0.0.1:4310.'
	const apiUser = text(raw.apiUser)
	if (!apiUser) errors['provider.apiUser'] = 'El usuario es obligatorio.'
	const apiPassword = typeof raw.apiPassword === 'string' ? raw.apiPassword : ''
	if (apiPassword === '' && !hasStoredPassword) errors['provider.apiPassword'] = 'Escribe la contraseña para probar la conexión.'
	if (Object.keys(errors).length > 0 || !apiUrl || !apiUser) return fail(errors)
	return ok({ apiUrl, apiUser, apiPassword })
}
