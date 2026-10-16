/**
 * Identificación del titular (RN1–RN3, D18, D37). El ID de cliente es la forma normalizada:
 * letra opcional (V, E, J, G, P) y 6 a 12 dígitos, sin separadores ni ceros a la izquierda. El
 * documento se guarda como vino. Lo demás no se adivina: vuelve con su motivo (RN2).
 */

import { DOC_TYPES, type DocType } from '../../shared/api-types.ts'
import { fail, ok, type Result } from '../result.ts'

export interface Identification {
	/** ID de cliente: `V9876543`, `9000123`, `J401234567`. */
	readonly key: string
	/** Como lo escribió el administrador, sin espacios: `V-9876543`. */
	readonly document: string
	readonly letter: DocType | null
	readonly personType: 'natural' | 'juridica'
}

export interface IdentificationError {
	readonly message: string
}

const SEPARATORS = /[-.\s]/g

/**
 * RN1 sin validar: `V-009.876.543` → `{ letter: 'V', digits: '9876543' }`, o `null`. También la
 * usa la búsqueda de clientes (RF24).
 */
export function compactIdentification(text: string): { readonly letter: string; readonly digits: string } | null {
	const match = /^([A-Z]?)(\d+)$/.exec(text.trim().replace(SEPARATORS, '').toUpperCase())
	if (!match) return null
	return { letter: match[1] ?? '', digits: (match[2] ?? '').replace(/^0+/, '') }
}

export function normalizeIdentification(raw: unknown): Result<Identification, IdentificationError> {
	if (raw === null || raw === undefined) return fail({ message: 'La identificación está vacía' })
	if (typeof raw !== 'string') return fail({ message: 'La identificación no es un texto' })
	const document = raw.trim()
	if (document === '') return fail({ message: 'La identificación está vacía' })

	const compact = compactIdentification(document)
	if (!compact) return fail({ message: 'Tiene caracteres que no son una letra y números' })

	const letter = compact.letter === '' ? null : DOC_TYPES.find(type => type === compact.letter)
	if (letter === undefined) return fail({ message: 'Empieza con una letra que no es V, E, J, G ni P' })

	const digits = compact.digits
	if (digits.length < 6) return fail({ message: 'La cédula tiene menos de 6 dígitos' })
	if (digits.length > 12) return fail({ message: 'Tiene más de 12 dígitos' })

	return ok({
		key: `${letter ?? ''}${digits}`,
		document,
		letter,
		personType: letter === 'J' || letter === 'G' ? 'juridica' : 'natural',
	})
}
