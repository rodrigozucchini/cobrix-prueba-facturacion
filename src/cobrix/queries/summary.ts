/**
 * El Resumen (RF31, RF33, extras RF42, D56). Lo que hay por cobrar suma los saldos abiertos, igual
 * que la deuda de la tabla de clientes (D16), así los dos dan lo mismo (CA23).
 */

import type { DatabaseSync } from 'node:sqlite'

import type { Summary } from '../../shared/api-types.ts'
import { listRuns } from '../store/runs.ts'
import { readSettings } from '../store/settings.ts'
import { readAging } from './aging.ts'
import { readAttention } from './attention.ts'

const count = (db: DatabaseSync, sql: string): number => {
	const value = (db.prepare(sql).get() as Record<string, unknown> | undefined)?.n
	if (typeof value !== 'number') throw new Error('resumen: el total no es número')
	return value
}

/** `today`: la fecha de trabajo (D35), para los tramos. */
export function readSummary(db: DatabaseSync, today: string): Summary {
	const { provider } = readSettings(db)
	const configured = provider.apiUrl !== '' && provider.apiUser !== '' && provider.hasPassword
	return {
		totals: {
			customers: count(db, 'SELECT COUNT(*) AS n FROM customers'),
			contracts: count(db, 'SELECT COUNT(*) AS n FROM contracts'),
			openInvoices: count(db, `SELECT COUNT(*) AS n FROM invoices WHERE status = 'open'`),
			paidInvoices: count(db, `SELECT COUNT(*) AS n FROM invoices WHERE status = 'paid'`),
			openAmountCents: count(db, `SELECT COALESCE(SUM(balance_cents), 0) AS n FROM invoices WHERE status = 'open'`),
		},
		provider: configured
			? { name: provider.name, apiUrl: provider.apiUrl, importStates: provider.importStates, windowMonths: provider.windowMonths, maxRecent: provider.maxRecent }
			: null,
		auto: { enabled: provider.autoEnabled, hour: provider.autoHour },
		recentRuns: listRuns(db, 5),
		aging: readAging(db, today),
		attention: readAttention(db),
	}
}
