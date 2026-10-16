/**
 * Lectura de filas de la base. `node:sqlite` da `unknown`, y un valor que no coincide con el
 * esquema es un error: estas ayudas lanzan en vez de adivinar.
 */

export type Row = Record<string, unknown>

export const str = (row: Row, key: string): string => {
	const value = row[key]
	if (typeof value !== 'string') throw new Error(`base de Cobrix: ${key} no es texto`)
	return value
}

export const num = (row: Row, key: string): number => {
	const value = row[key]
	if (typeof value !== 'number') throw new Error(`base de Cobrix: ${key} no es número`)
	return value
}

export const nullableStr = (row: Row, key: string): string | null => (row[key] === null ? null : str(row, key))

export const nullableNum = (row: Row, key: string): number | null => (row[key] === null ? null : num(row, key))

/** El valor de `key`, si es uno de `allowed`. */
export function oneOf<T extends string>(row: Row, key: string, allowed: readonly T[]): T {
	const found = allowed.find(candidate => candidate === row[key])
	if (found === undefined) throw new Error(`base de Cobrix: ${key} tiene un valor desconocido`)
	return found
}

/** Una columna JSON con un objeto; cualquier otra cosa se lee como `{}`. */
export function jsonRecord(text: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(text)
	return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}
