/**
 * Arma el servidor de Cobrix en NestJS (DT1): la API en /api y el panel compilado en lo demás.
 * main.ts y las pruebas usan esta misma función.
 */

import 'reflect-metadata'

import type { Server } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'

import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'

import type { AuditLog } from '../cobrix/audit.ts'
import { createRunEngine, type ProviderConnection, type RunEngine } from '../cobrix/runs/engine.ts'
import type { BillingClient } from '../cobrix/billing/client.ts'
import { currentPeriod } from '../shared/dates.ts'
import { ApiErrorFilter } from './api-error.filter.ts'
import { CobrixModule } from './app.module.ts'
import { panelOrApi, sameSiteWrites, securityHeaders } from './middleware.ts'

export interface CobrixAppDeps {
	readonly db: DatabaseSync
	readonly panelDir: string
	/** Auditoría fuera de la base (extras D48). */
	readonly audit: AuditLog
	/** Momento real (D35); reemplazable en las pruebas. */
	readonly now?: () => string
	/** Reemplazable en las pruebas (P11). */
	readonly clientFor?: (connection: ProviderConnection) => BillingClient
}

export interface CobrixApp {
	readonly engine: RunEngine
	/** Empieza a escuchar (con 0, un puerto libre) y devuelve el puerto. */
	listen(port: number, host?: string): Promise<number>
	close(): Promise<void>
}

/** Las capas del router de Express; solo lo que necesita el 405. */
interface RouterLayer {
	readonly route?: { readonly methods: Readonly<Record<string, boolean>> }
	match(path: string): boolean
}

export function createCobrixApp(deps: CobrixAppDeps): CobrixApp {
	const now = deps.now ?? (() => new Date().toISOString())
	const engine = createRunEngine({
		db: deps.db,
		audit: deps.audit,
		now,
		currentPeriod,
		...(deps.clientFor ? { clientFor: deps.clientFor } : {}),
	})

	const app = (async () => {
		// Sin el body parser de Nest: readJson pone nuestro límite y nuestros mensajes.
		const nest = await NestFactory.create<NestExpressApplication>(CobrixModule.with({ db: deps.db, audit: deps.audit, now, engine }), {
			bodyParser: false,
			logger: ['error', 'warn'],
		})
		nest.disable('x-powered-by')
		nest.set('etag', false)
		nest.use(securityHeaders)
		nest.use(panelOrApi(deps.panelDir))
		nest.use(sameSiteWrites)
		const express = nest.getHttpAdapter().getInstance() as { router: { stack: RouterLayer[] } }
		nest.useGlobalFilters(new ApiErrorFilter(path => express.router.stack
			.filter(layer => layer.route !== undefined && layer.match(path))
			.flatMap(layer => Object.keys(layer.route?.methods ?? {}))))
		return nest
	})()

	return {
		engine,
		async listen(port, host = '127.0.0.1') {
			const nest = await app
			await nest.listen(port, host)
			const address = (nest.getHttpServer() as Server).address()
			return typeof address === 'object' && address ? address.port : port
		},
		close: async () => (await app).close(),
	}
}
