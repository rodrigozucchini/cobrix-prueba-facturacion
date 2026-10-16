/**
 * Ayudas HTTP de la API: leer el cuerpo JSON como `unknown` (con nuestro límite y mensajes),
 * responder JSON o CSV, y la forma de error de todas las rutas (plan §5.1).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { ErrorBody } from '../shared/api-types.ts'

const MAX_BODY_BYTES = 1_000_000

/** Un error esperado: la ruta lo lanza y se responde tal cual. */
export class ApiError extends Error {
	readonly status: number
	readonly code: string
	readonly fields: Readonly<Record<string, string>> | undefined

	constructor(status: number, code: string, message: string, fields?: Readonly<Record<string, string>>) {
		super(message)
		this.status = status
		this.code = code
		this.fields = fields
	}
}

/** La URL del pedido, para leer la query igual en todas las rutas. */
export function urlOf(req: IncomingMessage): URL {
	return new URL(req.url ?? '/', 'http://cobrix.local')
}

/** Una ruta de /api que no existe. */
export function routeNotFound(): ApiError {
	return new ApiError(404, 'not_found', 'Esa ruta de la API no existe.')
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let size = 0
	for await (const chunk of req) {
		const buffer = chunk as Buffer
		size += buffer.length
		if (size > MAX_BODY_BYTES) throw new ApiError(413, 'body_too_large', 'El pedido es demasiado grande.')
		chunks.push(buffer)
	}
	if (chunks.length === 0) return undefined
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
	} catch {
		throw new ApiError(400, 'invalid_json', 'El pedido no es un JSON válido.')
	}
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body)
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(payload),
		'cache-control': 'no-store',
	})
	res.end(payload)
}

/** Una descarga (extras RF46): el navegador la guarda con ese nombre. */
export function sendCsv(res: ServerResponse, filename: string, text: string): void {
	res.writeHead(200, {
		'content-type': 'text/csv; charset=utf-8',
		'content-length': Buffer.byteLength(text),
		'content-disposition': `attachment; filename="${filename}"`,
		'cache-control': 'no-store',
	})
	res.end(text)
}

export function sendError(res: ServerResponse, error: ApiError): void {
	const body: ErrorBody = {
		error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) },
	}
	sendJson(res, error.status, body)
}
