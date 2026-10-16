/**
 * Estado de cuenta (extras RF47–RF49, RN43, D45–D47): membrete, cliente, fecha de trabajo, solo
 * las facturas abiertas (la más vieja primero, P33) y el total, que es la misma deuda de la tabla
 * (P19). Solo lee.
 */

import type { DatabaseSync } from 'node:sqlite'

import type { StatementResponse } from '../../shared/api-types.ts'
import { invoiceNumber } from '../store/imports.ts'
import { readSettings } from '../store/settings.ts'
import { readCustomerDetail } from './customer-detail.ts'

export type StatementResult =
	| { readonly kind: 'ok'; readonly statement: StatementResponse }
	| { readonly kind: 'not_found' }
	/** RF48, P32: el membrete necesita nombre, RIF y correo de la empresa. */
	| { readonly kind: 'company_incomplete' }

export function readStatement(db: DatabaseSync, key: string, today: string): StatementResult {
	const detail = readCustomerDetail(db, key)
	if (!detail) return { kind: 'not_found' }
	const { company } = readSettings(db)
	if (company.name === '' || company.rif === '' || company.email === '') return { kind: 'company_incomplete' }

	const { customer } = detail
	const invoices = detail.invoices
		.filter(invoice => invoice.status === 'open')
		.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
		.map(invoice => ({
			number: invoiceNumber(invoice.id),
			period: invoice.period,
			dueDate: invoice.dueDate,
			cutDate: invoice.cutDate,
			balanceCents: invoice.balanceCents,
		}))
	return {
		kind: 'ok',
		statement: {
			company: { name: company.name, rif: company.rif, email: company.email },
			customer: { key: customer.key, document: customer.document, name: customer.name, personType: customer.personType, email: customer.email, phone: customer.phone },
			issuedOn: today,
			invoices,
			totalCents: detail.totals.debtCents,
		},
	}
}
