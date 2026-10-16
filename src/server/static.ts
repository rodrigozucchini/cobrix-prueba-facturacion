/**
 * Sirve el panel compilado (dist/panel). Lo que no es un archivo devuelve index.html para React
 * Router: 200 en sus pantallas, 404 en lo demás. Nunca sirve nada fuera de esa carpeta.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

import { isPanelRoute } from '../shared/panel-routes.ts'

const TYPES: Readonly<Record<string, string>> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.map': 'application/json; charset=utf-8',
}

const NOT_BUILT = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Cobrix</title>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>El panel todavía no está compilado</h1>
<p>Corre <code>npm start</code> (compila y levanta todo) o <code>npm run build</code>.
Para desarrollar con recarga automática: <code>npm run dev:api</code> y <code>npm run dev</code>.</p></body></html>`

export function servePanel(req: IncomingMessage, res: ServerResponse, panelDir: string): void {
	const root = resolve(panelDir)
	const index = join(root, 'index.html')
	if (!existsSync(index)) {
		res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' })
		res.end(NOT_BUILT)
		return
	}
	const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://cobrix.local').pathname)
	const candidate = resolve(root, `.${normalize(pathname)}`)
	const insideRoot = candidate === root || candidate.startsWith(root + sep)
	const file = insideRoot && existsSync(candidate) && statSync(candidate).isFile() ? candidate : index
	const body = readFileSync(file)
	const status = file === index && !isPanelRoute(pathname) ? 404 : 200
	res.writeHead(status, {
		'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
		'content-length': body.length,
		// Los archivos con hash no cambian; index.html siempre se pide de nuevo.
		'cache-control': file === index ? 'no-cache' : 'public, max-age=31536000, immutable',
	})
	res.end(req.method === 'HEAD' ? undefined : body)
}
