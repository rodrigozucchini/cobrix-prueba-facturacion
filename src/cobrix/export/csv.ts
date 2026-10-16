/**
 * CSV para Excel en español (extras RF46, RN42, D44, R7): BOM UTF-8, `;` entre columnas, `\r\n`,
 * coma decimal sin separador de miles (P29) y `dd/mm/aaaa`. Lo que podría romper columnas va
 * entre comillas, con las internas dobladas (CL30). Funciones puras.
 */

/** Texto, entero, vacío o monto en centavos. El monto sale `95,00` y sin comillas: Excel lo lee como número. */
export type CsvCell = string | number | null | { readonly cents: number }

const BOM = '\uFEFF'
const NEEDS_QUOTES = /[;",\r\n]/

function cell(value: CsvCell): string {
	if (value === null) return ''
	if (typeof value === 'object') return csvAmount(value.cents)
	const text = String(value)
	return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** CL29: sin filas, solo los encabezados. */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): string {
	return BOM + [headers, ...rows].map(row => `${row.map(cell).join(';')}\r\n`).join('')
}

/** Centavos → `1235,00`. */
export function csvAmount(cents: number): string {
	const sign = cents < 0 ? '-' : ''
	const abs = Math.abs(cents)
	return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** `2026-10-13` → `13/10/2026`. */
export function csvDate(date: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
	return match ? `${match[3]}/${match[2]}/${match[1]}` : date
}
