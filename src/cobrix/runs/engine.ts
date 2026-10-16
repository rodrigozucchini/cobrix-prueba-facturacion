/**
 * Motor de corridas (RF17, RF20–RF22, RN33–RN36, DT2, DT3, DT12). `start` la crea en curso,
 * responde enseguida y trabaja en segundo plano. Una a la vez: lo impide el índice único (RN36).
 * Una corrida real aplica todo en UNA transacción; una simulación solo guarda la corrida y sus
 * filas. Si algo falla, queda fallida con el motivo y sin nada a medias. Inicio y fin van a la
 * auditoría (T076).
 */

import type { DatabaseSync } from 'node:sqlite'

import type { RunKind, RunListItem, RunOrigin } from '../../shared/api-types.ts'
import type { AuditLog } from '../audit.ts'
import { createBillingClient, type BillingClient } from '../billing/client.ts'
import { transaction } from '../store/db.ts'
import { completeRun, createRun, failRun, insertRunRows, readRun } from '../store/runs.ts'
import { readProviderPassword, readSettings } from '../store/settings.ts'
import { runImport, RunFailure, type RunOutcome } from './import-run.ts'
import { runPaid } from './paid-run.ts'

export interface ProviderConnection {
	readonly baseUrl: string
	readonly user: string
	readonly password: string
}

export type EngineErrorCode = 'run_in_progress' | 'provider_not_configured' | 'not_available'

export class EngineError extends Error {
	readonly code: EngineErrorCode

	constructor(code: EngineErrorCode, message: string) {
		super(message)
		this.code = code
	}
}

export interface RunEngineDeps {
	readonly db: DatabaseSync
	readonly audit: AuditLog
	/** Momento real, para las marcas de tiempo (D35). */
	readonly now: () => string
	/** Periodo de trabajo `YYYY-MM` para las reglas (respeta SANDBOX_TODAY). */
	readonly currentPeriod: () => string
	/** Reemplazable en las pruebas (P11). */
	readonly clientFor?: (connection: ProviderConnection) => BillingClient
}

export interface RunEngine {
	start(kind: RunKind, options: { readonly simulation: boolean; readonly origin: RunOrigin }): { run: RunListItem; finished: Promise<void> }
}

const KIND_LABEL: Readonly<Record<RunKind, string>> = { import: 'importación', paid: 'actualización de pagadas' }

export function createRunEngine(deps: RunEngineDeps): RunEngine {
	const clientFor = deps.clientFor ?? (connection => createBillingClient(connection))

	async function execute(kind: RunKind, simulation: boolean, client: BillingClient): Promise<RunOutcome> {
		const settings = readSettings(deps.db)
		if (kind === 'paid') return runPaid({ client, db: deps.db, currentPeriod: deps.currentPeriod(), simulation })
		return runImport({
			client,
			db: deps.db,
			currentPeriod: deps.currentPeriod(),
			simulation,
			settings: {
				providerName: settings.provider.name,
				importStates: settings.provider.importStates,
				windowMonths: settings.provider.windowMonths,
				maxRecent: settings.provider.maxRecent,
				excludedDocTypes: settings.provider.excludedDocTypes,
				graceDays: settings.provider.graceDays,
				capInvoices: settings.provider.capInvoices,
				capAmountCents: settings.provider.capAmountCents,
			},
		})
	}

	return {
		start(kind, { simulation, origin }) {
			const { provider } = readSettings(deps.db)
			const password = readProviderPassword(deps.db)
			if (provider.apiUrl === '' || provider.apiUser === '' || password === '') {
				throw new EngineError('provider_not_configured', 'Falta configurar el administrador de facturas: carga la URL, el usuario y la contraseña en Configuración.')
			}

			let runId: number
			try {
				runId = createRun(deps.db, { kind, simulation, origin, startedAt: deps.now() })
			} catch (error) {
				// RN36: el índice único rechaza una segunda corrida en curso, de este proceso o de otro.
				if (error instanceof Error && /UNIQUE/.test(error.message)) throw new EngineError('run_in_progress', 'Ya hay una corrida en curso. Espera a que termine e intenta de nuevo.')
				throw error
			}
			const actor = origin === 'auto' ? 'sistema' : 'operador'
			deps.audit.record(actor, 'run.started', { runId, kind, simulation, origin })
			const client = clientFor({ baseUrl: provider.apiUrl, user: provider.apiUser, password })

			const finished = (async () => {
				try {
					const outcome = await execute(kind, simulation, client)
					transaction(deps.db, () => {
						const now = deps.now()
						if (!simulation) outcome.apply(runId, now)
						insertRunRows(deps.db, runId, outcome.rows)
						completeRun(deps.db, runId, { finishedAt: now, summary: outcome.summary, counters: outcome.counters, warnings: outcome.warnings, technical: outcome.technical })
					})
					deps.audit.record(actor, 'run.finished', { runId, kind, simulation, status: 'completed', summary: outcome.summary })
				} catch (error) {
					const message = error instanceof RunFailure
						? error.message
						: `La ${KIND_LABEL[kind]} falló por un error inesperado. Revisa la consola del servidor e intenta de nuevo.`
					if (!(error instanceof RunFailure)) console.error(`[cobrix] la corrida ${runId} falló`, error)
					failRun(deps.db, runId, deps.now(), message)
					deps.audit.record(actor, 'run.finished', { runId, kind, simulation, status: 'failed', error: message })
				}
			})()

			const run = readRun(deps.db, runId)
			if (!run) throw new Error('la corrida recién creada no se encuentra')
			return { run, finished }
		},
	}
}
