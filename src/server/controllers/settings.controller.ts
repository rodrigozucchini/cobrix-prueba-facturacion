/**
 * GET y PUT /api/configuracion (RF1–RF8). Si un campo está mal no se guarda nada y la respuesta
 * dice cuál y por qué (RF7). Cada guardado va a la auditoría, sin la contraseña (extras RN45, RF52).
 */

import type { IncomingMessage } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'

import { Controller, Get, HttpCode, Inject, Post, Put, Req } from '@nestjs/common'

import type { CompanyInput, ConnectionTestResult, ProviderInput, Settings } from '../../shared/api-types.ts'
import type { AuditLog } from '../../cobrix/audit.ts'
import { BillingError, createBillingClient, normalizeBaseUrl } from '../../cobrix/billing/client.ts'
import { readContractList } from '../../cobrix/billing/readers.ts'
import { settingsChanges } from '../../cobrix/settings/changes.ts'
import { validateCompany, validateConnectionTest, validateProvider, type FieldErrors } from '../../cobrix/settings/validate.ts'
import { transaction } from '../../cobrix/store/db.ts'
import { readProviderPassword, readSettings, saveCompany, saveProvider } from '../../cobrix/store/settings.ts'
import { ApiError, readJson } from '../http.ts'
import { AUDIT, DB, NOW } from '../tokens.ts'

@Controller('api/configuracion')
export class SettingsController {
	private readonly db: DatabaseSync
	private readonly audit: AuditLog
	private readonly now: () => string

	constructor(@Inject(DB) db: DatabaseSync, @Inject(AUDIT) audit: AuditLog, @Inject(NOW) now: () => string) {
		this.db = db
		this.audit = audit
		this.now = now
	}

	@Get()
	read(): Settings {
		return readSettings(this.db)
	}

	@Put()
	async save(@Req() req: IncomingMessage): Promise<Settings> {
		const body = await readJson(req)
		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			throw new ApiError(400, 'validation', 'El pedido tiene que traer los datos de la empresa o del proveedor.')
		}
		const raw = body as Record<string, unknown>
		if (raw.company === undefined && raw.provider === undefined) {
			throw new ApiError(400, 'validation', 'El pedido tiene que traer los datos de la empresa o del proveedor.')
		}

		const errors: FieldErrors = {}
		let company: CompanyInput | undefined
		let provider: ProviderInput | undefined
		if (raw.company !== undefined) {
			const result = validateCompany(raw.company)
			if (result.ok) company = result.value
			else Object.assign(errors, result.error)
		}
		if (raw.provider !== undefined) {
			const result = validateProvider(raw.provider, readSettings(this.db).provider.hasPassword)
			if (result.ok) provider = result.value
			else Object.assign(errors, result.error)
		}
		if (Object.keys(errors).length > 0) {
			throw new ApiError(400, 'validation', 'Hay campos con errores. Corrígelos y vuelve a guardar.', errors)
		}

		const before = readSettings(this.db)
		const now = this.now()
		transaction(this.db, () => {
			if (company) saveCompany(this.db, company, now)
			if (provider) saveProvider(this.db, provider, now)
		})
		this.audit.record('operador', 'settings.saved', { changed: settingsChanges(before, company, provider) })
		return readSettings(this.db)
	}

	/**
	 * «Probar conexión» (RF4, D24): login con lo del formulario (o la contraseña guardada) y cuenta
	 * los contratos. No guarda nada; queda en la auditoría sin usuario ni contraseña (T075).
	 */
	@Post('probar-conexion')
	@HttpCode(200)
	async testConnection(@Req() req: IncomingMessage): Promise<ConnectionTestResult> {
		const settings = readSettings(this.db)
		const input = validateConnectionTest(await readJson(req), settings.provider.hasPassword)
		if (!input.ok) throw new ApiError(400, 'validation', 'Completa la URL, el usuario y la contraseña para probar la conexión.', input.error)

		const { apiUrl, apiUser, apiPassword } = input.value
		const client = createBillingClient({ baseUrl: apiUrl, user: apiUser, password: apiPassword === '' ? readProviderPassword(this.db) : apiPassword })
		let result: ConnectionTestResult
		try {
			const list = readContractList(await client.listContractIds())
			result = list.ok
				? { ok: true, contracts: list.value.ids.length, unreadable: list.value.unreadable.length }
				: { ok: false, message: list.error.message }
		} catch (error) {
			if (!(error instanceof BillingError)) throw error
			result = { ok: false, message: error.message }
		}
		this.audit.record('operador', 'connection.tested', { ...result, apiUrl: normalizeBaseUrl(apiUrl) })
		return result
	}
}
