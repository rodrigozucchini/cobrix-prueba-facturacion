/** Clientes por HTTP (RF23–RF30, DT7, CL15, extras RF43, RF47–RF49): búsqueda, orden, tramo y estado de cuenta. */

import type { IncomingMessage } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'

import { Controller, Get, Inject, Param, Req } from '@nestjs/common'

import { AGING_BUCKET_KEYS, CUSTOMER_SORTS, type AgingBucketKey, type CustomerDetail, type CustomerListItem, type CustomerSort, type StatementResponse } from '../../shared/api-types.ts'
import { today } from '../../shared/dates.ts'
import type { AuditLog } from '../../cobrix/audit.ts'
import { readCustomerDetail } from '../../cobrix/queries/customer-detail.ts'
import { readStatement } from '../../cobrix/queries/statement.ts'
import { listCustomers } from '../../cobrix/queries/customers.ts'
import { ApiError, urlOf } from '../http.ts'
import { AUDIT, DB } from '../tokens.ts'

/** `?q=&orden=&tramo=` de la tabla, validados; el CSV usa los mismos (extras RF44). */
export function customerFilters(url: URL): { readonly query: string; readonly sort: CustomerSort; readonly bucket: AgingBucketKey | null } {
	const requested = url.searchParams.get('orden') ?? 'vencimiento'
	const sort = CUSTOMER_SORTS.find(candidate => candidate === requested)
	if (!sort) throw new ApiError(400, 'validation', 'El orden tiene que ser «vencimiento», «deuda» o «nombre».')
	const requestedBucket = url.searchParams.get('tramo')
	const bucket = requestedBucket === null || requestedBucket === '' ? null : AGING_BUCKET_KEYS.find(candidate => candidate === requestedBucket)
	if (bucket === undefined) throw new ApiError(400, 'validation', 'El tramo tiene que ser «0-30», «31-60», «61-90» o «90+».')
	return { query: url.searchParams.get('q') ?? '', sort, bucket }
}

const CUSTOMER_NOT_FOUND = 'No encontramos ese cliente. Puede que se hayan borrado los datos de Cobrix.'

@Controller('api/clientes')
export class CustomersController {
	private readonly db: DatabaseSync
	private readonly audit: AuditLog

	constructor(@Inject(DB) db: DatabaseSync, @Inject(AUDIT) audit: AuditLog) {
		this.db = db
		this.audit = audit
	}

	@Get()
	list(@Req() req: IncomingMessage): CustomerListItem[] {
		return listCustomers(this.db, { ...customerFilters(urlOf(req)), today: today() })
	}

	@Get(':id')
	detail(@Param('id') id: string): CustomerDetail {
		const detail = readCustomerDetail(this.db, id)
		if (!detail) throw new ApiError(404, 'not_found', CUSTOMER_NOT_FOUND)
		return detail
	}

	// Extras RF47–RF49, RF51: solo lee; cada uno queda en la auditoría, sin los datos del cliente.
	@Get(':id/estado-de-cuenta')
	statement(@Param('id') id: string): StatementResponse {
		const result = readStatement(this.db, id, today())
		if (result.kind === 'not_found') throw new ApiError(404, 'not_found', CUSTOMER_NOT_FOUND)
		if (result.kind === 'company_incomplete') {
			throw new ApiError(409, 'company_incomplete', 'Completa los datos de la empresa en Configuración para generar estados de cuenta.')
		}
		const { statement } = result
		this.audit.record('operador', 'statement.generated', { customer: statement.customer.key, openInvoices: statement.invoices.length, totalCents: statement.totalCents })
		return statement
	}
}
