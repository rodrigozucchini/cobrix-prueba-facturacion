/** El Resumen por HTTP (RF31–RF33). */

import type { DatabaseSync } from 'node:sqlite'

import { Controller, Get, Inject } from '@nestjs/common'

import type { Summary } from '../../shared/api-types.ts'
import { today } from '../../shared/dates.ts'
import { readSummary } from '../../cobrix/queries/summary.ts'
import { DB } from '../tokens.ts'

@Controller('api/resumen')
export class SummaryController {
	private readonly db: DatabaseSync

	constructor(@Inject(DB) db: DatabaseSync) {
		this.db = db
	}

	@Get()
	read(): Summary {
		return readSummary(this.db, today())
	}
}
