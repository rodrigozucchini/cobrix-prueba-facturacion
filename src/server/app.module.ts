/**
 * El módulo Nest de la API (DT1): sus controladores y lo que reciben. Los valores se crean
 * afuera, así main.ts y las pruebas arman exactamente el mismo módulo.
 */

import type { DatabaseSync } from 'node:sqlite'

import { Module, type DynamicModule } from '@nestjs/common'

import type { AuditLog } from '../cobrix/audit.ts'
import type { RunEngine } from '../cobrix/runs/engine.ts'
import { CustomersController } from './controllers/customers.controller.ts'
import { ExportsController } from './controllers/exports.controller.ts'
import { RunsController } from './controllers/runs.controller.ts'
import { SettingsController } from './controllers/settings.controller.ts'
import { SummaryController } from './controllers/summary.controller.ts'
import { AUDIT, DB, ENGINE, NOW } from './tokens.ts'

export interface CobrixModuleValues {
	readonly db: DatabaseSync
	readonly audit: AuditLog
	readonly now: () => string
	readonly engine: RunEngine
}

@Module({})
export class CobrixModule {
	static with(values: CobrixModuleValues): DynamicModule {
		return {
			module: CobrixModule,
			// ExportsController primero: `corridas/:id.csv` va antes que `corridas/:id`.
			controllers: [ExportsController, SettingsController, RunsController, CustomersController, SummaryController],
			providers: [
				{ provide: DB, useValue: values.db },
				{ provide: AUDIT, useValue: values.audit },
				{ provide: NOW, useValue: values.now },
				{ provide: ENGINE, useValue: values.engine },
			],
		}
	}
}
