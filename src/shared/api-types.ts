/**
 * El contrato de la API JSON (plan §5.1): un tipo por pedido y respuesta. El backend responde con
 * estas formas y el panel las importa, así un cambio rompe el typecheck de los dos lados.
 */

// ---------------------------------------------------------------- listas cerradas

export const CONTRACT_STATUSES = ['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'] as const
export type ContractStatus = (typeof CONTRACT_STATUSES)[number]

export const DOC_TYPES = ['V', 'E', 'J', 'G', 'P'] as const
export type DocType = (typeof DOC_TYPES)[number]

/** Ventana de importación en meses (RF5); `null` = sin ventana. */
export const IMPORT_WINDOWS = [3, 6, 9, 12] as const
export type ImportWindow = (typeof IMPORT_WINDOWS)[number]

// ---------------------------------------------------------------- errores

export interface ErrorBody {
	readonly error: {
		readonly code: string
		/** Qué pasó y cómo seguir. */
		readonly message: string
		/** Campo → mensaje, para los formularios (`400 validation`). */
		readonly fields?: Readonly<Record<string, string>>
	}
}

// ---------------------------------------------------------------- configuración (RF1–RF8)

export interface CompanySettings {
	readonly name: string
	/** Se guarda como `J-12345678-9`. */
	readonly rif: string
	readonly email: string
}

export interface ProviderSettings {
	readonly name: string
	readonly apiUrl: string
	readonly apiUser: string
	/** La contraseña nunca sale del servidor (RF3): solo si hay una. */
	readonly hasPassword: boolean
	readonly importStates: readonly ContractStatus[]
	readonly windowMonths: ImportWindow | null
	/** 1 a 60; `null` = todas. */
	readonly maxRecent: number | null
	/** 0 a 60. */
	readonly graceDays: number
	readonly capInvoices: number
	readonly capAmountCents: number
	readonly excludedDocTypes: readonly DocType[]
	readonly autoEnabled: boolean
	/** 0 a 23, hora de Caracas; `null` si está apagada y sin hora. */
	readonly autoHour: number | null
}

export interface Settings {
	readonly company: CompanySettings
	/** Momento ISO del último guardado; `null` si nunca. */
	readonly companyUpdatedAt: string | null
	readonly provider: ProviderSettings
	readonly providerUpdatedAt: string | null
}

export interface CompanyInput {
	readonly name: string
	readonly rif: string
	readonly email: string
}

export interface ProviderInput extends Omit<ProviderSettings, 'hasPassword'> {
	/** Vacía conserva la guardada (RF3). */
	readonly apiPassword: string
}

/** `PUT /api/configuracion`: cada bloque se guarda por su cuenta. */
export interface SettingsInput {
	readonly company?: CompanyInput
	readonly provider?: ProviderInput
}

// ---------------------------------------------------------------- resultados (plan §5.3)

export type RunKind = 'import' | 'paid'
export type RunStatus = 'running' | 'completed' | 'failed'
export type RunOrigin = 'manual' | 'auto'
export type InvoiceStatus = 'open' | 'paid'

/** Qué pasó con cada cuota (o contrato ilegible) en una importación. */
export const IMPORT_OUTCOMES = [
	'imported', 'already_imported', 'excluded_status', 'excluded_doc_type', 'outside_window', 'excluded_max',
	'residual', 'blocked_by_cap', 'currency_not_usd', 'currency_incoherent', 'invalid_identification',
	'unknown_status', 'inconsistent_response', 'lookup_failed', 'no_debt', 'unreadable_list_item',
] as const
export type ImportOutcome = (typeof IMPORT_OUTCOMES)[number]

/** Qué pasó con cada factura abierta en «Actualizar pagadas». */
export const PAID_OUTCOMES = ['marked_paid', 'still_open', 'partial', 'under_review', 'no_evidence', 'lookup_failed'] as const
export type PaidOutcome = (typeof PAID_OUTCOMES)[number]

// ---------------------------------------------------------------- probar conexión (RF4)

/** `POST /api/configuracion/probar-conexion`: lo del formulario, guardado o no (D24). */
export interface ConnectionTestInput {
	readonly apiUrl: string
	readonly apiUser: string
	/** Vacía usa la guardada. */
	readonly apiPassword: string
}

export type ConnectionTestResult =
	| { readonly ok: true; readonly contracts: number; readonly unreadable: number }
	| { readonly ok: false; readonly message: string }

// ---------------------------------------------------------------- corridas (T035)

/** `POST /api/corridas`. */
export interface StartRunInput {
	readonly tipo: 'importacion' | 'pagadas'
	readonly simulacion: boolean
}

export interface RunListItem {
	/** También el número que se ve en «Importación #2». */
	readonly id: number
	readonly kind: RunKind
	readonly simulation: boolean
	readonly origin: RunOrigin
	readonly status: RunStatus
	readonly startedAt: string
	readonly finishedAt: string | null
	readonly durationMs: number | null
	/** Una línea (spec §5.5); en una fallida, el error. */
	readonly summary: string | null
	readonly error: string | null
}

export interface RunRow {
	readonly contractNumber: number | null
	readonly installmentId: string | null
	readonly customerKey: string | null
	readonly customerName: string | null
	/** Si el cliente existe hoy en Cobrix, para enlazar al expediente. */
	readonly customerExists: boolean
	readonly period: string | null
	readonly outcome: ImportOutcome | PaidOutcome
	readonly reason: string
	readonly amountCents: number | null
	readonly detail: Readonly<Record<string, unknown>>
}

export interface RunDetail extends RunListItem {
	readonly counters: Readonly<Record<string, number>>
	/** Mensajes que mandó el administrador en `errors` (CL24). */
	readonly warnings: readonly string[]
	readonly rows: readonly RunRow[]
}

// ---------------------------------------------------------------- clientes (T050, T051)

export type PersonType = 'natural' | 'juridica'

/** `GET /api/clientes?orden=`: cada columna ordena en un solo sentido (P21). */
export const CUSTOMER_SORTS = ['vencimiento', 'deuda', 'nombre'] as const
export type CustomerSort = (typeof CUSTOMER_SORTS)[number]

export interface CustomerListItem {
	/** ID de cliente (RN4): `V9876543`. */
	readonly key: string
	/** Como lo escribió el administrador: `V-9876543`. */
	readonly document: string
	readonly name: string
	readonly personType: PersonType
	/** Todos los contratos del titular que guarda Cobrix (RF13). */
	readonly contracts: number
	readonly openInvoices: number
	readonly paidInvoices: number
	/** Suma de los saldos abiertos (D16). */
	readonly debtCents: number
	/** Vencimiento más antiguo de las abiertas; `null` = «Sin facturas abiertas» (D29). */
	readonly oldestDueDate: string | null
	/** Facturas abiertas con abono parcial en la última actualización (D57). */
	readonly partialInvoices: number
}

export interface CustomerContract {
	readonly number: number
	readonly status: ContractStatus
	readonly plan: string | null
	readonly priceCents: number
	readonly branch: string | null
}

export interface CustomerInvoice {
	readonly id: number
	/** `CBX-000001`. */
	readonly number: string
	/** El `deuda_id` de la cuota. */
	readonly installmentId: string
	readonly contractNumber: number
	readonly period: string
	readonly dueDate: string
	readonly cutDate: string
	readonly totalCents: number
	readonly balanceCents: number
	readonly status: InvoiceStatus
	readonly paidAt: string | null
	/** Número de la factura del administrador que la pagó. */
	readonly paidRef: string | null
	/** D57: lo que el ISP dice que todavía se debe, si la última actualización vio un abono parcial. */
	readonly partialBalanceCents: number | null
}

export type CustomerEventKind = 'customer_created' | 'invoice_imported' | 'invoice_paid'

export interface CustomerEvent {
	readonly id: number
	readonly kind: CustomerEventKind
	readonly at: string
	readonly runId: number
	readonly invoiceNumber: string | null
	readonly installmentId: string | null
	readonly period: string | null
	/** En `invoice_paid`: la factura del administrador y su fecha. */
	readonly adminInvoice: string | null
	readonly adminDate: string | null
}

export interface CustomerDetail {
	readonly customer: {
		readonly key: string
		readonly document: string
		readonly name: string
		readonly personType: PersonType
		readonly email: string | null
		readonly phone: string | null
		readonly origin: string
		readonly createdAt: string
	}
	/** La misma fila que en la tabla (P19). */
	readonly totals: CustomerListItem
	readonly contracts: readonly CustomerContract[]
	/** Vencimiento más nuevo primero (RF29). */
	readonly invoices: readonly CustomerInvoice[]
	/** Lo más reciente primero (RF30). */
	readonly events: readonly CustomerEvent[]
}

// ---------------------------------------------------------------- estado de cuenta (extras T100)

/** `GET /api/clientes/:id/estado-de-cuenta` (extras RF47, RN43). Errores: `404` y `409 company_incomplete` sin datos de la empresa (RF48, P32). */
export interface StatementResponse {
	readonly company: { readonly name: string; readonly rif: string; readonly email: string }
	readonly customer: {
		readonly key: string
		readonly document: string
		readonly name: string
		readonly personType: PersonType
		readonly email: string | null
		readonly phone: string | null
	}
	/** Fecha de trabajo (D35). */
	readonly issuedOn: string
	/** Solo las abiertas, la más vieja primero (P33). */
	readonly invoices: ReadonlyArray<{
		readonly number: string
		readonly period: string
		readonly dueDate: string
		readonly cutDate: string
		readonly balanceCents: number
	}>
	/** = la deuda del cliente en la tabla (RN43). */
	readonly totalCents: number
}

// ---------------------------------------------------------------- antigüedad (extras T082)

/** Días desde el vencimiento (extras RN39, RN40); `?tramo=` en Clientes. */
export const AGING_BUCKET_KEYS = ['0-30', '31-60', '61-90', '90+'] as const
export type AgingBucketKey = (typeof AGING_BUCKET_KEYS)[number]

export interface AgingBucket {
	readonly key: AgingBucketKey
	/** Facturas abiertas del tramo. */
	readonly count: number
	/** Suma de sus saldos en Cobrix (D16). */
	readonly amountCents: number
}

// ---------------------------------------------------------------- resumen (T052)

export interface Summary {
	readonly totals: {
		readonly customers: number
		readonly contracts: number
		readonly openInvoices: number
		readonly paidInvoices: number
		/** Suma de los saldos abiertos = suma de la columna «Deuda» (RF31). */
		readonly openAmountCents: number
	}
	/** `null` mientras falte la URL, el usuario o la contraseña (RF33). */
	readonly provider: {
		readonly name: string
		readonly apiUrl: string
		readonly importStates: readonly ContractStatus[]
		readonly windowMonths: ImportWindow | null
		readonly maxRecent: number | null
	} | null
	readonly auto: { readonly enabled: boolean; readonly hour: number | null }
	readonly recentRuns: readonly RunListItem[]
	/** Siempre los 4 tramos, en orden; suman `openAmountCents` (extras RF42). */
	readonly aging: readonly AgingBucket[]
	/** D56: lo que tiene que revisar una persona; vacío si no hay nada. */
	readonly attention: readonly AttentionItem[]
}

/** D56: un tipo de caso de la última corrida real, o que esa corrida falló (`outcome: null`). */
export type AttentionItem =
	| { readonly kind: 'import'; readonly runId: number; readonly outcome: ImportOutcome | null; readonly count: number }
	| { readonly kind: 'paid'; readonly runId: number; readonly outcome: PaidOutcome | null; readonly count: number }
