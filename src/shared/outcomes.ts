/**
 * El nombre de cada resultado (P28), igual en el panel y en el CSV. El tono y el ícono los pone
 * src/panel/lib/status.ts. En una simulación, el éxito se lee en condicional.
 */

import type { ImportOutcome, PaidOutcome, RunKind } from './api-types.ts'

export const IMPORT_OUTCOME_LABEL: Readonly<Record<ImportOutcome, string>> = {
	imported: 'Importada',
	already_imported: 'Ya importada',
	excluded_status: 'Excluida por estado',
	excluded_doc_type: 'Excluida por tipo de documento',
	outside_window: 'Fuera de la ventana',
	excluded_max: 'Excluida por máximo de cuotas',
	residual: 'Saldo residual',
	blocked_by_cap: 'Frenada por tope',
	currency_not_usd: 'Moneda distinta de USD',
	currency_incoherent: 'Moneda incoherente',
	invalid_identification: 'Sin identificación válida',
	unknown_status: 'Estado desconocido',
	inconsistent_response: 'Respuesta inconsistente',
	lookup_failed: 'Consulta fallida',
	no_debt: 'Sin deuda',
	unreadable_list_item: 'Contrato ilegible en la lista',
}

export const PAID_OUTCOME_LABEL: Readonly<Record<PaidOutcome, string>> = {
	marked_paid: 'Marcada pagada',
	still_open: 'Sigue pendiente',
	partial: 'Abono parcial',
	under_review: 'En revisión',
	no_evidence: 'Sin evidencia',
	lookup_failed: 'Consulta fallida',
}

export const SIMULATED_IMPORTED = 'Se importaría'
export const SIMULATED_PAID = 'Se marcaría pagada'

/** El nombre del resultado de una fila; `undefined` si no es de ese tipo de corrida. */
export function outcomeLabel(kind: RunKind, outcome: string, simulation: boolean): string | undefined {
	if (kind === 'import') {
		const found = Object.entries(IMPORT_OUTCOME_LABEL).find(([key]) => key === outcome)
		if (!found) return undefined
		return simulation && outcome === 'imported' ? SIMULATED_IMPORTED : found[1]
	}
	const found = Object.entries(PAID_OUTCOME_LABEL).find(([key]) => key === outcome)
	if (!found) return undefined
	return simulation && outcome === 'marked_paid' ? SIMULATED_PAID : found[1]
}
