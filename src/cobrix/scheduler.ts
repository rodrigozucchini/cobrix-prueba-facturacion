/**
 * Corrida automática (RF6, RN37, D22, D23, DT9, CL20, P37, P38). Cada 30 s mira el reloj real de
 * Caracas: si está activa, es la hora y hoy no corrió, lanza «Importar» y después «Actualizar
 * pagadas», aunque la primera falle. Si el servidor estaba apagado, no se recupera. Una que no
 * puede iniciarse queda fallida con su motivo, así no se reintenta cada 30 s.
 */

import type { DatabaseSync } from 'node:sqlite'

import type { RunKind } from '../shared/api-types.ts'
import { caracasClock } from '../shared/dates.ts'
import type { AuditLog } from './audit.ts'
import { EngineError, type RunEngine } from './runs/engine.ts'
import { recordFailedRun } from './store/runs.ts'
import { readSettings } from './store/settings.ts'

export interface Scheduler {
	/** Una revisión; las pruebas la llaman con su propio reloj. */
	tick(): Promise<void>
	stop(): void
}

export interface SchedulerDeps {
	readonly db: DatabaseSync
	readonly engine: RunEngine
	readonly audit: AuditLog
	/** Reloj real; reemplazable en las pruebas. */
	readonly now: () => Date
	/** `null`: sin temporizador, solo `tick()` (pruebas). */
	readonly everyMs: number | null
}

const KINDS: readonly RunKind[] = ['import', 'paid']

function failureReason(error: EngineError): string {
	if (error.code === 'run_in_progress') return 'No se pudo correr: ya había una corrida en curso.'
	return `No se pudo correr: ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`
}

/** DT9: hubo una importación automática ese día en Caracas, terminara bien o no. */
function ranOn(db: DatabaseSync, date: string): boolean {
	const rows = db.prepare(`SELECT started_at FROM runs WHERE origin = 'auto' AND kind = 'import' ORDER BY id DESC LIMIT 5`).all() as Array<Record<string, unknown>>
	return rows.some(row => typeof row.started_at === 'string' && caracasClock(new Date(row.started_at)).date === date)
}

export function startScheduler(deps: SchedulerDeps): Scheduler {
	let busy: Promise<void> | null = null

	async function run(): Promise<void> {
		const { provider } = readSettings(deps.db)
		if (!provider.autoEnabled || provider.autoHour === null) return
		const instant = deps.now()
		const clock = caracasClock(instant)
		if (clock.hour !== provider.autoHour || ranOn(deps.db, clock.date)) return

		// D23: las dos, en orden, aunque falle la importación.
		for (const kind of KINDS) {
			try {
				await deps.engine.start(kind, { simulation: false, origin: 'auto' }).finished
			} catch (error) {
				if (!(error instanceof EngineError)) throw error
				const message = failureReason(error)
				const runId = recordFailedRun(deps.db, { kind, origin: 'auto', at: deps.now().toISOString(), error: message })
				deps.audit.record('sistema', 'run.finished', { runId, kind, simulation: false, origin: 'auto', status: 'failed', error: message })
			}
		}
	}

	// Una revisión en curso no se pisa con la siguiente.
	const tick = (): Promise<void> => {
		busy ??= run()
			.catch(error => { console.error('[cobrix] la corrida automática falló', error) })
			.finally(() => { busy = null })
		return busy
	}

	const timer = deps.everyMs === null ? null : setInterval(() => void tick(), deps.everyMs)
	timer?.unref()
	if (deps.everyMs !== null) void tick()
	return { tick, stop: () => { if (timer) clearInterval(timer) } }
}
