/**
 * Cómo muestra el panel montos y fechas (RF39, D35), con horas de Caracas. No toca el navegador,
 * así lo prueba node:test (test/panel-format.test.ts); por eso tampoco usa el alias `@/`.
 */

import { civilDate } from '../../shared/format.ts'

export { amount, period, usd } from '../../shared/format.ts'

const TIME_ZONE = 'America/Caracas'

const time = new Intl.DateTimeFormat('es-VE', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' })
const caracasDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** `2026-10-13` → `13 oct 2026`. */
export const date = civilDate

/** Momento ISO → `13 oct 2026, 3:41 a. m.`, en Caracas. */
export function dateTime(iso: string): string {
	const instant = new Date(iso)
	if (Number.isNaN(instant.getTime())) return iso
	return `${date(caracasDay.format(instant))}, ${time.format(instant)}`
}

/** Milisegundos → `0,1 s` o `2 min 5 s`. */
export function duration(ms: number): string {
	if (ms < 100) return 'menos de 0,1 s'
	if (ms < 60_000) return `${(ms / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 })} s`
	const minutes = Math.floor(ms / 60_000)
	return `${minutes} min ${Math.round((ms % 60_000) / 1000)} s`
}
