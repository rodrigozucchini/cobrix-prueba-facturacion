/** El único lugar del panel que llama a /api, con los tipos de src/shared/api-types.ts. Los errores traen el mensaje del servidor. */

import type { ErrorBody } from '../../shared/api-types.ts'

export class ApiRequestError extends Error {
	readonly status: number
	readonly code: string
	readonly fields: Readonly<Record<string, string>>

	constructor(status: number, code: string, message: string, fields: Readonly<Record<string, string>> = {}) {
		super(message)
		this.status = status
		this.code = code
		this.fields = fields
	}
}

const isErrorBody = (value: unknown): value is ErrorBody =>
	typeof value === 'object' && value !== null && 'error' in value
	&& typeof (value as { error: unknown }).error === 'object' && (value as { error: unknown }).error !== null
	&& typeof (value as ErrorBody).error.message === 'string'

const UNREACHABLE = 'No se pudo conectar con el servidor de Cobrix. Revisa que esté corriendo e intenta de nuevo.'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	let response: Response
	try {
		response = await fetch(path, {
			method,
			headers: body === undefined ? undefined : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		})
	} catch {
		throw new ApiRequestError(0, 'network', UNREACHABLE)
	}
	const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
	if (!response.ok) {
		if (isErrorBody(payload)) {
			throw new ApiRequestError(response.status, payload.error.code, payload.error.message, payload.error.fields)
		}
		// CA39: un proxy delante (Vite, nginx) responde 502–504 si Cobrix está caído.
		if (response.status >= 502 && response.status <= 504) throw new ApiRequestError(response.status, 'network', UNREACHABLE)
		throw new ApiRequestError(response.status, 'unexpected', `El servidor respondió con un error (${response.status}). Intenta de nuevo.`)
	}
	return payload as T
}

export const api = {
	get: <T>(path: string): Promise<T> => request<T>('GET', path),
	post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
	put: <T>(path: string, body: unknown): Promise<T> => request<T>('PUT', path, body),
	delete: <T>(path: string): Promise<T> => request<T>('DELETE', path),
}
