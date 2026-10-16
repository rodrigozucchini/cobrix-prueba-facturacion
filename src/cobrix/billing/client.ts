/**
 * Único lugar que habla con el administrador (plan §5.2). Token en memoria, login nuevo 5 min
 * antes de que venza (no hay refresh token), un reintento ante 401, ninguno ante credenciales
 * malas, y tiempo límite por llamada. Solo /api/v1, nunca /__sim/*. Devuelve el cuerpo como
 * `unknown` (decide readers.ts); los errores nunca llevan la contraseña ni el token.
 */

export type BillingErrorKind =
	| 'network'
	| 'timeout'
	| 'credentials_rejected'
	| 'unauthorized'
	| 'http_status'
	| 'invalid_json'
	| 'invalid_response'

export class BillingError extends Error {
	readonly kind: BillingErrorKind
	readonly status: number | undefined

	constructor(kind: BillingErrorKind, message: string, status?: number) {
		super(message)
		this.name = 'BillingError'
		this.kind = kind
		this.status = status
	}
}

export interface BillingClient {
	/** Solo el login (P13): si falla, se cae la corrida; un contrato que falla, no. */
	connect(): Promise<void>
	/** lista_ids_contratos, sin `estado` (con cualquier valor trae solo los activos) ni páginas. */
	listContractIds(): Promise<unknown>
	getContract(contractId: number): Promise<unknown>
	/** pago_informacion en modo CUOTA, siempre con fechas (sin ellas la API usa un rango viejo fijo). */
	getLedger(contractId: number, from: string, to: string): Promise<unknown>
}

export interface BillingClientOptions {
	readonly baseUrl: string
	readonly user: string
	readonly password: string
	/** Reemplazable en las pruebas. */
	readonly fetch?: typeof globalThis.fetch
	/** Reloj real: el token vence por la hora real, no por la fecha fija de la prueba. */
	readonly now?: () => Date
	readonly timeoutMs?: number
}

const RENEW_BEFORE_MS = 5 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 15_000

/** CL17: con o sin /api/v1 y barras finales → la base sola. */
export function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/+$/, '').replace(/\/api\/v1$/i, '').replace(/\/+$/, '')
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** El mensaje del propio administrador, de `{ detail: { mensaje } }`. */
function apiMessage(body: unknown): string | undefined {
	if (!isRecord(body) || !isRecord(body.detail)) return undefined
	const message = body.detail.mensaje
	return typeof message === 'string' && message.trim() !== '' ? message.trim() : undefined
}

export function createBillingClient(options: BillingClientOptions): BillingClient {
	const base = `${normalizeBaseUrl(options.baseUrl)}/api/v1`
	const fetchFn = options.fetch ?? globalThis.fetch
	const now = options.now ?? (() => new Date())
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
	let token: { value: string; expiresAt: number } | undefined

	async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
		let response: Response
		try {
			response = await fetchFn(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) })
		} catch (error) {
			if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
				throw new BillingError('timeout', `El administrador tardó más de ${Math.round(timeoutMs / 100) / 10} s en responder. Intenta de nuevo en un rato.`)
			}
			throw new BillingError('network', 'No se pudo conectar con el administrador en esa dirección. Revisa la URL y que el administrador esté encendido.')
		}
		const text = await response.text()
		try {
			return { status: response.status, body: text === '' ? undefined : (JSON.parse(text) as unknown) }
		} catch {
			throw new BillingError('invalid_json', `El administrador respondió algo que no es JSON (código ${response.status}): no se puede leer.`, response.status)
		}
	}

	async function login(): Promise<string> {
		const { status, body } = await call('/usuario/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ user_name: options.user, password: options.password }),
		})
		if (status === 400 || status === 401 || status === 403) {
			const said = apiMessage(body)
			throw new BillingError('credentials_rejected', `El administrador rechazó el usuario o la contraseña.${said ? ` (Dijo: «${said}»)` : ''}`, status)
		}
		if (status < 200 || status >= 300) {
			throw new BillingError('http_status', `El administrador respondió con un error inesperado al iniciar sesión (código ${status}).`, status)
		}
		if (!isRecord(body) || typeof body.access_token !== 'string' || body.access_token === '') {
			throw new BillingError('invalid_response', 'El inicio de sesión no devolvió un permiso de acceso: no se puede seguir.')
		}
		// El vencimiento llega en UTC sin zona. Si no se puede leer, el token se usa una vez y la
		// siguiente llamada hace login: nunca se adivina cuánto dura.
		const expires = typeof body.access_token_expires_in === 'string' ? Date.parse(`${body.access_token_expires_in}Z`) : Number.NaN
		token = { value: body.access_token, expiresAt: Number.isNaN(expires) ? 0 : expires }
		return token.value
	}

	async function validToken(): Promise<string> {
		if (token && token.expiresAt - now().getTime() > RENEW_BEFORE_MS) return token.value
		return login()
	}

	async function get(path: string): Promise<unknown> {
		for (let attempt = 0; attempt < 2; attempt++) {
			const current = await validToken()
			if (token && token.expiresAt === 0) token = undefined
			const { status, body } = await call(path, { headers: { authorization: `Bearer ${current}` } })
			if (status === 401) {
				token = undefined
				continue
			}
			if (status < 200 || status >= 300) {
				const said = apiMessage(body)
				throw new BillingError('http_status', `El administrador respondió con un error inesperado (código ${status}).${said ? ` (Dijo: «${said}»)` : ''}`, status)
			}
			return body
		}
		throw new BillingError('unauthorized', 'El administrador rechazó el permiso de acceso aunque se volvió a iniciar sesión. Revisa el usuario en Configuración o consulta al ISP.', 401)
	}

	return {
		connect: async () => {
			await validToken()
		},
		listContractIds: () => get('/isp/lista_ids_contratos'),
		getContract: contractId => get(`/isp/contrato/individual?id_contrato=${contractId}`),
		getLedger: (contractId, from, to) =>
			get(`/isp/pago_informacion?id_contrato=${contractId}&tipo_busqueda=CUOTA&fecha_inicio=${from}&fecha_fin=${to}`),
	}
}
