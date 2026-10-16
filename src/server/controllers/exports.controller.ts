/**
 * Descargas CSV (extras RF44–RF46, RF51, DT13, P31): clientes y detalle de corrida, con las
 * mismas consultas y filtros que las pantallas. Se arman acá para que cada una quede en la
 * auditoría (archivo, filas y filtros; nunca datos de clientes).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'

import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common'

import { today } from '../../shared/dates.ts'
import { outcomeLabel } from '../../shared/outcomes.ts'
import type { AuditLog } from '../../cobrix/audit.ts'
import { csvDate, toCsv, type CsvCell } from '../../cobrix/export/csv.ts'
import { listCustomers } from '../../cobrix/queries/customers.ts'
import { ApiError, sendCsv, urlOf } from '../http.ts'
import { AUDIT, DB } from '../tokens.ts'
import { customerFilters } from './customers.controller.ts'
import { findRun } from './runs.controller.ts'

const PERSON_TYPE = { natural: 'Natural', juridica: 'Jurídica' } as const

@Controller('api')
export class ExportsController {
	private readonly db: DatabaseSync
	private readonly audit: AuditLog

	constructor(@Inject(DB) db: DatabaseSync, @Inject(AUDIT) audit: AuditLog) {
		this.db = db
		this.audit = audit
	}

	@Get('clientes.csv')
	customers(@Req() req: IncomingMessage, @Res() res: ServerResponse): void {
		const filters = customerFilters(urlOf(req))
		const workingDate = today()
		const customers = listCustomers(this.db, { ...filters, today: workingDate })
		const file = `clientes-${workingDate}.csv`
		const rows = customers.map((customer): CsvCell[] => [
			customer.name,
			customer.document,
			PERSON_TYPE[customer.personType],
			customer.contracts,
			customer.openInvoices,
			customer.paidInvoices,
			{ cents: customer.debtCents },
			customer.oldestDueDate === null ? 'Sin facturas abiertas' : csvDate(customer.oldestDueDate),
		])
		sendCsv(res, file, toCsv(
			['Nombre', 'Documento', 'Tipo', 'Contratos', 'Facturas abiertas', 'Facturas pagadas', 'Deuda (USD)', 'Vencimiento más antiguo'],
			rows,
		))
		this.audit.record('operador', 'export.csv', { file, rows: rows.length, filters: { q: filters.query, orden: filters.sort, tramo: filters.bucket } })
	}

	@Get('corridas/:id.csv')
	run(@Param('id') id: string, @Req() req: IncomingMessage, @Res() res: ServerResponse): void {
		const run = findRun(this.db, id)
		const outcome = urlOf(req).searchParams.get('resultado') ?? ''
		if (outcome !== '' && outcomeLabel(run.kind, outcome, run.simulation) === undefined) {
			throw new ApiError(400, 'validation', 'Ese resultado no existe en este tipo de corrida.')
		}
		const file = `corrida-${run.id}.csv`
		const rows = run.rows
			.filter(row => outcome === '' || row.outcome === outcome)
			.map((row): CsvCell[] => [
				row.contractNumber,
				row.installmentId,
				row.customerName,
				outcomeLabel(run.kind, row.outcome, run.simulation) ?? row.outcome,
				row.reason,
				row.amountCents === null ? null : { cents: row.amountCents },
			])
		sendCsv(res, file, toCsv(['Contrato', 'Cuota', 'Cliente', 'Resultado', 'Motivo', 'Monto (USD)'], rows))
		this.audit.record('operador', 'export.csv', { file, rows: rows.length, filters: { resultado: outcome === '' ? null : outcome } })
	}
}
