/** Fechas civiles (`YYYY-MM-DD`, `YYYY-MM`) en America/Caracas. «Hoy» se puede fijar con SANDBOX_TODAY. */

const TIME_ZONE = 'America/Caracas'

export function today(): string {
	const pinned = process.env.SANDBOX_TODAY
	if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date())
}

/** Reloj real de Caracas (D22), nunca SANDBOX_TODAY: lo usa la corrida automática; las reglas usan `today()`. */
export function caracasClock(instant: Date): { readonly date: string; readonly hour: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(instant)
	const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
	return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) }
}

export function currentPeriod(): string {
	return today().slice(0, 7)
}

/** `2026-10` + 3 → `2027-01`. */
export function addMonths(period: string, months: number): string {
	const [year, month] = period.split('-').map(Number) as [number, number]
	const index = year * 12 + (month - 1) + months
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export function addCivilDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() + days)
	return value.toISOString().slice(0, 10)
}

export function lastDayOfPeriod(period: string): string {
	return addCivilDays(`${addMonths(period, 1)}-01`, -1)
}

const MONTHS_ES = [
	'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
	'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** `2026-08` → `2026 Agosto`, como el administrador nombra una cuota. */
export function periodLabel(period: string): string {
	const [year, month] = period.split('-').map(Number) as [number, number]
	return `${year} ${MONTHS_ES[month - 1]}`
}
