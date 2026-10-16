/** Cómo se leen montos, fechas y periodos (RF39), igual en los motivos del backend y en el panel. */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const money = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Centavos → `USD 1.235,00`. */
export function usd(cents: number): string {
	return `USD ${money.format(cents / 100)}`
}

/** Centavos → `1.235,00`, para columnas que ya dicen la moneda. */
export function amount(cents: number): string {
	return money.format(cents / 100)
}

export function monthName(month: number): string {
	return MONTHS[month - 1] ?? '?'
}

/** `2026-10-13` → `13 oct 2026` (RF39). Las fechas civiles no tienen zona: se muestran tal cual. */
export function civilDate(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
	if (!match) return value
	return `${Number(match[3])} ${monthName(Number(match[2]))} ${match[1]}`
}

/** `2026-08` → `ago 2026`. */
export function period(value: string): string {
	const match = /^(\d{4})-(\d{2})$/.exec(value)
	if (!match) return value
	return `${monthName(Number(match[2]))} ${match[1]}`
}
