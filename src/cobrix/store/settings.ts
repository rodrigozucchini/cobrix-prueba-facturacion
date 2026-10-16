/** Lee y guarda la empresa y el proveedor. La contraseña solo sale de acá para el login del cliente HTTP. */

import type { DatabaseSync } from 'node:sqlite'

import {
	CONTRACT_STATUSES,
	DOC_TYPES,
	IMPORT_WINDOWS,
	type CompanyInput,
	type ContractStatus,
	type DocType,
	type ProviderInput,
	type Settings,
} from '../../shared/api-types.ts'
import { nullableNum, nullableStr, num, str, type Row } from './rows.ts'
import { seal, unseal } from './secret.ts'

function jsonList<T extends string>(row: Row, key: string, allowed: readonly T[]): T[] {
	const parsed: unknown = JSON.parse(str(row, key))
	if (!Array.isArray(parsed)) throw new Error(`configuración: ${key} no es una lista`)
	return parsed.map(item => {
		const found = allowed.find(candidate => candidate === item)
		if (found === undefined) throw new Error(`configuración: ${key} tiene un valor desconocido`)
		return found
	})
}

export function readSettings(db: DatabaseSync): Settings {
	const company = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Row | undefined
	const provider = db.prepare('SELECT * FROM providers WHERE id = 1').get() as Row | undefined
	if (!company || !provider) throw new Error('configuración: faltan las filas iniciales')
	const windowMonths = nullableNum(provider, 'window_months')
	return {
		company: { name: str(company, 'company_name'), rif: str(company, 'company_rif'), email: str(company, 'company_email') },
		companyUpdatedAt: nullableStr(company, 'updated_at'),
		provider: {
			name: str(provider, 'name'),
			apiUrl: str(provider, 'api_url'),
			apiUser: str(provider, 'api_user'),
			hasPassword: readProviderPassword(db) !== '',
			importStates: jsonList<ContractStatus>(provider, 'import_states', CONTRACT_STATUSES),
			windowMonths: windowMonths === null ? null : (IMPORT_WINDOWS.find(months => months === windowMonths) ?? null),
			maxRecent: nullableNum(provider, 'max_recent'),
			graceDays: num(provider, 'grace_days'),
			capInvoices: num(provider, 'cap_invoices'),
			capAmountCents: num(provider, 'cap_amount_cents'),
			excludedDocTypes: jsonList<DocType>(provider, 'excluded_doc_types', DOC_TYPES),
			autoEnabled: num(provider, 'auto_enabled') === 1,
			autoHour: nullableNum(provider, 'auto_hour'),
		},
		providerUpdatedAt: nullableStr(provider, 'updated_at'),
	}
}

/** Solo para el login. Nunca va al panel (RF3). */
export function readProviderPassword(db: DatabaseSync): string {
	const row = db.prepare('SELECT api_password FROM providers WHERE id = 1').get() as Row | undefined
	return row ? unseal(db, str(row, 'api_password')) : ''
}

export function saveCompany(db: DatabaseSync, input: CompanyInput, now: string): void {
	db.prepare('UPDATE settings SET company_name = ?, company_rif = ?, company_email = ?, updated_at = ? WHERE id = 1')
		.run(input.name, input.rif, input.email, now)
}

/** Vacía conserva la guardada (RF3); una nueva se guarda cifrada (D53). */
export function saveProvider(db: DatabaseSync, input: ProviderInput, now: string): void {
	db.prepare(
		`UPDATE providers SET
			name = ?, api_url = ?, api_user = ?,
			api_password = CASE WHEN ? = '' THEN api_password ELSE ? END,
			import_states = ?, window_months = ?, max_recent = ?, grace_days = ?, cap_invoices = ?, cap_amount_cents = ?,
			excluded_doc_types = ?, auto_enabled = ?, auto_hour = ?, updated_at = ?
		 WHERE id = 1`,
	).run(
		input.name, input.apiUrl, input.apiUser,
		input.apiPassword, seal(db, input.apiPassword),
		JSON.stringify(input.importStates), input.windowMonths, input.maxRecent, input.graceDays, input.capInvoices, input.capAmountCents,
		JSON.stringify(input.excludedDocTypes), input.autoEnabled ? 1 : 0, input.autoHour, now,
	)
}
