/**
 * El único lugar que decide cómo se ve cada estado: texto, tono e ícono (skill ui-ux §2). Los
 * íconos son nombres, así este archivo no usa React y node:test lo puede probar.
 */

import type {
	ContractStatus,
	ImportOutcome,
	InvoiceStatus,
	PaidOutcome,
	RunStatus,
} from '../../shared/api-types.ts'
import { IMPORT_OUTCOME_LABEL, PAID_OUTCOME_LABEL, SIMULATED_IMPORTED, SIMULATED_PAID } from '../../shared/outcomes.ts'

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'
export type StatusIcon = 'check' | 'clock' | 'alert' | 'cross' | 'minus' | 'loader' | 'flask' | 'eye' | 'ban'

export interface StatusInfo {
	readonly label: string
	readonly tone: Tone
	readonly icon: StatusIcon
}

const s = (label: string, tone: Tone, icon: StatusIcon): StatusInfo => ({ label, tone, icon })

export const CONTRACT_STATUS: Readonly<Record<ContractStatus, StatusInfo>> = {
	ACTIVO: s('Activo', 'success', 'check'),
	CORTADO: s('Cortado', 'danger', 'ban'),
	CORTESIA: s('Cortesía', 'info', 'minus'),
	RETIRADO: s('Retirado', 'neutral', 'minus'),
	RECHAZADO: s('Rechazado', 'neutral', 'minus'),
	ANULADO: s('Anulado', 'neutral', 'minus'),
}

export const INVOICE_STATUS: Readonly<Record<InvoiceStatus, StatusInfo>> = {
	open: s('Abierta', 'info', 'clock'),
	paid: s('Pagada', 'success', 'check'),
}

export const RUN_STATUS: Readonly<Record<RunStatus, StatusInfo>> = {
	running: s('En curso', 'warning', 'loader'),
	completed: s('Completada', 'success', 'check'),
	failed: s('Fallida', 'danger', 'cross'),
}

export const SIMULATION: StatusInfo = s('Simulación', 'info', 'flask')

/** Resultados de importación: lo que revisa una persona es aviso (RN2, RN8, RN38); las exclusiones, neutras. */
export const IMPORT_OUTCOME: Readonly<Record<ImportOutcome, StatusInfo>> = {
	imported: s(IMPORT_OUTCOME_LABEL.imported, 'success', 'check'),
	already_imported: s(IMPORT_OUTCOME_LABEL.already_imported, 'neutral', 'minus'),
	excluded_status: s(IMPORT_OUTCOME_LABEL.excluded_status, 'neutral', 'minus'),
	excluded_doc_type: s(IMPORT_OUTCOME_LABEL.excluded_doc_type, 'neutral', 'minus'),
	outside_window: s(IMPORT_OUTCOME_LABEL.outside_window, 'neutral', 'minus'),
	excluded_max: s(IMPORT_OUTCOME_LABEL.excluded_max, 'neutral', 'minus'),
	residual: s(IMPORT_OUTCOME_LABEL.residual, 'neutral', 'minus'),
	blocked_by_cap: s(IMPORT_OUTCOME_LABEL.blocked_by_cap, 'warning', 'alert'),
	currency_not_usd: s(IMPORT_OUTCOME_LABEL.currency_not_usd, 'neutral', 'minus'),
	currency_incoherent: s(IMPORT_OUTCOME_LABEL.currency_incoherent, 'neutral', 'minus'),
	invalid_identification: s(IMPORT_OUTCOME_LABEL.invalid_identification, 'warning', 'eye'),
	unknown_status: s(IMPORT_OUTCOME_LABEL.unknown_status, 'warning', 'eye'),
	inconsistent_response: s(IMPORT_OUTCOME_LABEL.inconsistent_response, 'warning', 'eye'),
	lookup_failed: s(IMPORT_OUTCOME_LABEL.lookup_failed, 'danger', 'cross'),
	no_debt: s(IMPORT_OUTCOME_LABEL.no_debt, 'neutral', 'minus'),
	unreadable_list_item: s(IMPORT_OUTCOME_LABEL.unreadable_list_item, 'warning', 'eye'),
}

export const PAID_OUTCOME: Readonly<Record<PaidOutcome, StatusInfo>> = {
	marked_paid: s(PAID_OUTCOME_LABEL.marked_paid, 'success', 'check'),
	still_open: s(PAID_OUTCOME_LABEL.still_open, 'info', 'clock'),
	partial: s(PAID_OUTCOME_LABEL.partial, 'warning', 'alert'),
	under_review: s(PAID_OUTCOME_LABEL.under_review, 'warning', 'eye'),
	no_evidence: s(PAID_OUTCOME_LABEL.no_evidence, 'warning', 'alert'),
	lookup_failed: s(PAID_OUTCOME_LABEL.lookup_failed, 'danger', 'cross'),
}

/** En una simulación no se escribió nada: el éxito se lee en condicional. */
export function importOutcome(outcome: ImportOutcome, simulation: boolean): StatusInfo {
	if (simulation && outcome === 'imported') return s(SIMULATED_IMPORTED, 'info', 'flask')
	return IMPORT_OUTCOME[outcome]
}

export function paidOutcome(outcome: PaidOutcome, simulation: boolean): StatusInfo {
	if (simulation && outcome === 'marked_paid') return s(SIMULATED_PAID, 'info', 'flask')
	return PAID_OUTCOME[outcome]
}
