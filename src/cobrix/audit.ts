/**
 * Auditoría (extras RF50–RF54, D48–D52): una línea JSON por acción, en un archivo por día fuera
 * de la base (COBRIX_AUDIT_DIR, por defecto logs/), así sobrevive a una base dañada. Solo agrega
 * líneas y nunca recibe secretos (RF52). Si no puede escribir, avisa en la consola y la acción
 * sigue (RF54).
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** `operador` desde el panel, `sistema` en la corrida automática (D50: no hay usuarios). */
export type AuditActor = 'operador' | 'sistema'

export type AuditAction =
	| 'settings.saved'
	| 'connection.tested'
	| 'run.started'
	| 'run.finished'
	| 'export.csv'
	| 'statement.generated'

export interface AuditEntry {
	/** Momento real, ISO en UTC (D35). */
	readonly at: string
	readonly actor: AuditActor
	readonly action: AuditAction
	readonly [key: string]: unknown
}

export interface AuditLog {
	record(actor: AuditActor, action: AuditAction, data?: Readonly<Record<string, unknown>>): void
}

const caracasDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' })

export function createAuditLog(options: { readonly dir: string; readonly now?: () => Date }): AuditLog {
	const now = options.now ?? (() => new Date())
	return {
		record(actor, action, data = {}) {
			try {
				const instant = now()
				const { at: _at, actor: _actor, action: _action, ...rest } = data
				const entry: AuditEntry = { at: instant.toISOString(), actor, action, ...rest }
				if (!existsSync(options.dir)) mkdirSync(options.dir, { recursive: true })
				// DT17: el archivo lleva la fecha real de Caracas de esta escritura, no la del arranque.
				const file = join(options.dir, `cobrix-${caracasDate.format(instant)}.log`)
				appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8')
			} catch (error) {
				console.error(`[auditoría] no se pudo registrar «${action}»: ${error instanceof Error ? error.message : String(error)}`)
			}
		},
	}
}
