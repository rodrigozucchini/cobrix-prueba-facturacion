/** Las consultas del panel: sus claves (para refrescar justo lo que cambió) y qué pide cada una. */

import type { AgingBucketKey, CustomerDetail, CustomerListItem, CustomerSort, PersonType, RunDetail, RunListItem, Settings, StatementResponse, Summary } from '../../shared/api-types.ts'
import { api } from './api.ts'

export const SETTINGS_QUERY = ['configuracion'] as const
export const RUNS_QUERY = ['corridas'] as const
export const runQuery = (id: number) => ['corridas', id] as const
export const CUSTOMERS_QUERY = ['clientes'] as const
export const customersQuery = (q: string, sort: CustomerSort, bucket: AgingBucketKey | null) => ['clientes', 'lista', q, sort, bucket] as const
export const customerQuery = (key: string) => ['clientes', key] as const
export const SUMMARY_QUERY = ['resumen'] as const
export const statementQuery = (key: string) => ['estado-de-cuenta', key] as const

export const fetchSettings = () => api.get<Settings>('/api/configuracion')
export const fetchRuns = () => api.get<RunListItem[]>('/api/corridas')
export const fetchRun = (id: number) => api.get<RunDetail>(`/api/corridas/${id}`)
export const fetchCustomers = (q: string, sort: CustomerSort, bucket: AgingBucketKey | null) =>
	api.get<CustomerListItem[]>(`/api/clientes?${new URLSearchParams({ q, orden: sort, ...(bucket ? { tramo: bucket } : {}) }).toString()}`)
export const fetchCustomer = (key: string) => api.get<CustomerDetail>(`/api/clientes/${encodeURIComponent(key)}`)
export const fetchSummary = () => api.get<Summary>('/api/resumen')
export const fetchStatement = (key: string) => api.get<StatementResponse>(`/api/clientes/${encodeURIComponent(key)}/estado-de-cuenta`)

/** RF41: las corridas necesitan URL, usuario y contraseña guardados. */
export const providerConfigured = (settings: Settings | undefined): boolean =>
	Boolean(settings && settings.provider.apiUrl !== '' && settings.provider.apiUser !== '' && settings.provider.hasPassword)

export const RUN_KIND_LABEL = { import: 'Importación', paid: 'Actualización de pagadas' } as const

export const PERSON_TYPE_LABEL: Readonly<Record<PersonType, string>> = { natural: 'Natural', juridica: 'Jurídica' }

/** Extras RF42: «Tramo: más de 90 días», «con deuda de 0 a 30 días». */
export const AGING_LABEL: Readonly<Record<AgingBucketKey, string>> = {
	'0-30': '0 a 30 días',
	'31-60': '31 a 60 días',
	'61-90': '61 a 90 días',
	'90+': 'más de 90 días',
}
