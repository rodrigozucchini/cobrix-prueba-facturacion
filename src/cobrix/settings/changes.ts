/** Qué cambió al guardar la configuración, para la auditoría (extras RN45). La contraseña nunca: solo que cambió. */

import type { CompanyInput, ProviderInput, Settings } from '../../shared/api-types.ts'

export const PASSWORD_CHANGED = '(cambiada)'

export function settingsChanges(before: Settings, company?: CompanyInput, provider?: ProviderInput): Record<string, unknown> {
	const changed: Record<string, unknown> = {}
	if (company) {
		for (const key of ['name', 'rif', 'email'] as const) {
			if (before.company[key] !== company[key]) changed[`company.${key}`] = company[key]
		}
	}
	if (provider) {
		const { apiPassword, ...rest } = provider
		for (const [key, value] of Object.entries(rest)) {
			const previous = before.provider[key as keyof typeof rest]
			if (JSON.stringify(previous) !== JSON.stringify(value)) changed[key] = value
		}
		if (apiPassword !== '') changed.apiPassword = PASSWORD_CHANGED
	}
	return changed
}
