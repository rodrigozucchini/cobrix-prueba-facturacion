/**
 * Levanta el entorno. Sin argumento, todo en un proceso (`npm start`): el administrador simulado
 * (4310), Cobrix en NestJS con su API y el panel (4300) y la corrida automática. Con `isp` o
 * `cobrix`, solo esa parte. La fecha queda fija en 2026-10-13, la de los criterios del enunciado
 * (se cambia con SANDBOX_TODAY).
 */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.SANDBOX_TODAY ??= '2026-10-13'

const { DEFAULT_BILLING_API_DB, seedBillingApi } = await import('./billing-api/seed.ts')
const { createBillingApiServer } = await import('./billing-api/server.ts')
const { createAuditLog } = await import('./cobrix/audit.ts')
const { startScheduler } = await import('./cobrix/scheduler.ts')
const { openDatabase } = await import('./cobrix/store/db.ts')
const { failInterruptedRuns } = await import('./cobrix/store/runs.ts')
const { createCobrixApp } = await import('./server/app.ts')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const billingApiDb = process.env.BILLING_API_DB ?? DEFAULT_BILLING_API_DB
const cobrixDb = process.env.COBRIX_DB ?? resolve(root, 'data/cobrix.sqlite')
const panelDir = resolve(root, 'dist/panel')
const auditDir = process.env.COBRIX_AUDIT_DIR ?? resolve(root, 'logs')
const appPort = Number(process.env.PORT ?? 4300)
const billingApiPort = Number(process.env.BILLING_API_PORT ?? 4310)
const host = process.env.HOST ?? '127.0.0.1'

const only = process.argv[2]
if (only !== undefined && only !== 'isp' && only !== 'cobrix') {
	console.error(`No conozco «${only}». Usa \`isp\` (solo el administrador simulado), \`cobrix\` (solo Cobrix) o nada (todo).`)
	process.exit(1)
}
const closers: Array<() => Promise<void> | void> = []
console.log(`Fecha de la prueba:       ${process.env.SANDBOX_TODAY}`)

if (only !== 'cobrix') {
	if (!existsSync(billingApiDb)) seedBillingApi(billingApiDb)
	const billingApi = createBillingApiServer(billingApiDb)
	await billingApi.listen(billingApiPort, host)
	closers.push(() => billingApi.close())
	console.log(`API del administrador:    http://${host}:${billingApiPort}/api/v1`)
	console.log(`Swagger:                  http://${host}:${billingApiPort}/docs`)
}

if (only !== 'isp') {
	const db = openDatabase(cobrixDb)
	const interrupted = failInterruptedRuns(db, new Date().toISOString())
	const audit = createAuditLog({ dir: auditDir })
	const app = createCobrixApp({ db, panelDir, audit })
	await app.listen(appPort, host)
	// RF6, RN37: cada 30 s, con el reloj real de Caracas (D22).
	const scheduler = startScheduler({ db, engine: app.engine, audit, now: () => new Date(), everyMs: 30_000 })
	closers.unshift(() => scheduler.stop(), () => app.close())
	closers.push(() => db.close())

	console.log(`Panel de Cobrix:          http://${host}:${appPort}`)
	console.log(`Base de Cobrix:           ${cobrixDb}`)
	console.log(`Registro de auditoría:    ${auditDir}`)
	if (!existsSync(resolve(panelDir, 'index.html'))) {
		console.log('Aviso: el panel no está compilado. Corre `npm start` (compila solo) o `npm run build`.')
	}
	if (interrupted > 0) console.log(`Aviso: ${interrupted} corrida(s) interrumpida(s) por el reinicio quedaron como fallidas.`)
}

/** En orden: el programador, los servidores y al final la base. */
const shutdown = (): void => {
	void (async () => {
		for (const close of closers) await Promise.resolve(close()).catch(() => {})
		process.exit(0)
	})()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
