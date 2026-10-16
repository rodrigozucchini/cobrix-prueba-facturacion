/** Antes de las rutas de Nest: cabeceras de seguridad (D55), el panel fuera de /api y el control de CSRF (D54). */

import type { IncomingMessage, ServerResponse } from 'node:http'

import { ApiError, sendError, urlOf } from './http.ts'
import { servePanel } from './static.ts'

type Next = (error?: unknown) => void
export type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void

/** D55: sin sniffing, sin iframes, sin referrer, y el panel solo carga sus propios archivos. */
export const securityHeaders: Middleware = (_req, res, next) => {
	res.setHeader('x-content-type-options', 'nosniff')
	res.setHeader('referrer-policy', 'no-referrer')
	res.setHeader('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
	next()
}

const isApi = (req: IncomingMessage): boolean => {
	const { pathname } = urlOf(req)
	return pathname === '/api' || pathname.startsWith('/api/')
}

/** Fuera de /api responde el panel (solo GET y HEAD); /api sigue a las rutas, sin caché. */
export function panelOrApi(panelDir: string): Middleware {
	return (req, res, next) => {
		if (isApi(req)) {
			res.setHeader('cache-control', 'no-store')
			return next()
		}
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405).end()
			return
		}
		servePanel(req, res, panelDir)
	}
}

/**
 * D54 (CSRF): una escritura tiene que ser JSON (otra página no puede mandarlo sin que el
 * navegador pregunte antes) y, si trae `Origin`, tiene que ser este servidor.
 */
export const sameSiteWrites: Middleware = (req, res, next) => {
	if (req.method !== 'POST' && req.method !== 'PUT') return next()
	const origin = req.headers.origin
	if (origin !== undefined && URL.parse(origin)?.host !== req.headers.host) {
		return sendError(res, new ApiError(403, 'cross_origin', 'Solo el panel de Cobrix puede hacer cambios.'))
	}
	if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
		return sendError(res, new ApiError(415, 'json_required', 'El pedido tiene que ser JSON (Content-Type: application/json).'))
	}
	next()
}
