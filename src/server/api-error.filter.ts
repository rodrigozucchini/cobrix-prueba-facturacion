/**
 * Todo error de la API sale con la misma forma (plan §5.1): `{ error: { code, message } }`.
 * ApiError tal cual; ruta inexistente, 404 (o 405 si existe con otro método); lo demás, 500 con
 * el detalle solo en la consola.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import { Catch, NotFoundException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'

import { ApiError, routeNotFound, sendError, urlOf } from './http.ts'

/** Los métodos que responde una ruta, según lo que registró Nest (vacío si ninguno). */
export type MethodsOf = (path: string) => string[]

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
	private readonly methodsOf: MethodsOf

	constructor(methodsOf: MethodsOf) {
		this.methodsOf = methodsOf
	}

	catch(exception: unknown, host: ArgumentsHost): void {
		const http = host.switchToHttp()
		const req = http.getRequest<IncomingMessage>()
		const res = http.getResponse<ServerResponse>()
		if (res.headersSent) return
		if (exception instanceof ApiError) return sendError(res, exception)
		if (exception instanceof NotFoundException) {
			const path = urlOf(req).pathname.replace(/\/+$/, '')
			const methods = this.methodsOf(path)
			return sendError(res, methods.length === 0
				? routeNotFound()
				: new ApiError(405, 'method_not_allowed', `La ruta ${path} no acepta ${req.method ?? 'ese método'}.`))
		}
		console.error('[cobrix] error inesperado en', req.method, req.url, exception)
		sendError(res, new ApiError(500, 'internal', 'Algo falló en el servidor de Cobrix. Revisa la consola del servidor e intenta de nuevo.'))
	}
}
