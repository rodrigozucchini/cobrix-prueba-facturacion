/** Lo que comparten los dos bloques de Configuración: guardar, los errores por campo y «Última modificación». */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { Settings, SettingsInput } from '../../../shared/api-types.ts'
import type { FieldErrors } from '../../../cobrix/settings/validate.ts'
import { api, ApiRequestError } from '@/lib/api.ts'
import { dateTime } from '@/lib/format.ts'
import { SETTINGS_QUERY } from '@/lib/queries.ts'

/** Saca el prefijo `company.` / `provider.` que usa la API. */
export function blockErrors(errors: FieldErrors, prefix: string): FieldErrors {
	return Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith(`${prefix}.`)).map(([key, value]) => [key.slice(prefix.length + 1), value]))
}

export const lastSaved = (iso: string | null) => (iso ? `Última modificación: ${dateTime(iso)}` : 'Todavía no se guardó')

export function useSaveSettings(onFieldErrors: (errors: FieldErrors) => void, successMessage: string, onSaved: (settings: Settings) => void) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: SettingsInput) => api.put<Settings>('/api/configuracion', body),
		onSuccess: settings => {
			queryClient.setQueryData(SETTINGS_QUERY, settings)
			onSaved(settings)
			toast.success(successMessage)
		},
		onError: error => {
			if (error instanceof ApiRequestError) onFieldErrors(error.fields)
			toast.error(error instanceof Error ? error.message : 'No se pudo guardar.')
		},
	})
}

export interface BlockProps {
	readonly settings: Settings
}
