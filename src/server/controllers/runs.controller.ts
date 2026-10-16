/** Corridas por HTTP (RF17–RF19, RF21, RF41, CL1, CL13, CL15). Iniciar responde 202 enseguida y sigue en segundo plano (DT2). */

import type { IncomingMessage } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'

import { Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common'

import type { RunDetail, RunKind, RunListItem } from '../../shared/api-types.ts'
import { EngineError, type RunEngine } from '../../cobrix/runs/engine.ts'
import { listRuns, readRunDetail } from '../../cobrix/store/runs.ts'
import { ApiError, readJson, routeNotFound } from '../http.ts'
import { DB, ENGINE } from '../tokens.ts'

const KINDS: Readonly<Record<string, RunKind>> = { importacion: 'import', pagadas: 'paid' }

/** La corrida del número de la ruta, o el error de que no existe (CL15). */
export function findRun(db: DatabaseSync, id: string): RunDetail {
	if (!/^\d+$/.test(id)) throw routeNotFound()
	const detail = readRunDetail(db, Number(id))
	if (!detail) throw new ApiError(404, 'not_found', 'No encontramos esa corrida. Puede que se hayan borrado los datos de Cobrix.')
	return detail
}

@Controller('api/corridas')
export class RunsController {
	private readonly db: DatabaseSync
	private readonly engine: RunEngine

	constructor(@Inject(DB) db: DatabaseSync, @Inject(ENGINE) engine: RunEngine) {
		this.db = db
		this.engine = engine
	}

	@Post()
	@HttpCode(202)
	async start(@Req() req: IncomingMessage): Promise<RunListItem> {
		const body = await readJson(req)
		const raw = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
		const kind = typeof raw.tipo === 'string' ? KINDS[raw.tipo] : undefined
		if (!kind || typeof raw.simulacion !== 'boolean') {
			throw new ApiError(400, 'validation', 'Indica el tipo de corrida («importacion» o «pagadas») y si es una simulación.')
		}
		try {
			return this.engine.start(kind, { simulation: raw.simulacion, origin: 'manual' }).run
		} catch (error) {
			if (!(error instanceof EngineError)) throw error
			throw new ApiError(error.code === 'not_available' ? 400 : 409, error.code, error.message)
		}
	}

	@Get()
	list(): RunListItem[] {
		return listRuns(this.db)
	}

	@Get(':id')
	detail(@Param('id') id: string): RunDetail {
		return findRun(this.db, id)
	}
}
