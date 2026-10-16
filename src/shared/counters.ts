/**
 * Los contadores de cada corrida (spec §5.5) y cómo se leen; los usan el resumen de una línea y
 * el panel. En una simulación se leen en condicional («Se importarían»).
 */

import { usd } from './format.ts'

export const IMPORT_COUNTERS = [
	'contractsRead',
	'invoicesNew',
	'amountNewCents',
	'customersNew',
	'customersUpdated',
	'alreadyImported',
	'excludedByStatus',
	'excludedByDocType',
	'outsideWindow',
	'excludedByMax',
	'residual',
	'blockedByCap',
	'contractsCurrency',
	'contractsIdentification',
	'contractsInconsistent',
	'lookupsFailed',
	'contractsNoDebt',
	'unreadableListItems',
] as const
export type ImportCounter = (typeof IMPORT_COUNTERS)[number]

/** Los que el resumen muestra siempre (spec §5.5); los demás, solo si no son 0. */
export const IMPORT_SUMMARY: readonly ImportCounter[] = ['contractsRead', 'invoicesNew', 'customersNew', 'excludedByStatus']

export const PAID_COUNTERS = [
	'invoicesChecked',
	'markedPaid',
	'stillOpen',
	'partial',
	'underReview',
	'noEvidence',
	'lookupsFailed',
	'contractsReread',
] as const
export type PaidCounter = (typeof PAID_COUNTERS)[number]

export const PAID_SUMMARY: readonly PaidCounter[] = ['invoicesChecked', 'markedPaid', 'partial', 'stillOpen']

const LABELS: Readonly<Record<string, string>> = {
	contractsRead: 'Contratos leídos',
	invoicesNew: 'Importadas',
	amountNewCents: 'Monto nuevo',
	customersNew: 'Clientes creados',
	customersUpdated: 'Clientes actualizados',
	alreadyImported: 'Ya importadas',
	excludedByStatus: 'Excluidas por estado',
	excludedByDocType: 'Excluidas por tipo de documento',
	outsideWindow: 'Fuera de la ventana',
	excludedByMax: 'Excluidas por máximo de cuotas',
	residual: 'Saldo residual',
	blockedByCap: 'Frenadas por tope',
	contractsCurrency: 'Contratos fuera por moneda',
	contractsIdentification: 'Contratos sin identificación válida',
	contractsInconsistent: 'Contratos con respuesta inconsistente',
	lookupsFailed: 'Consultas fallidas',
	contractsNoDebt: 'Contratos sin deuda',
	unreadableListItems: 'Contratos ilegibles en la lista',
	invoicesChecked: 'Facturas consultadas',
	markedPaid: 'Marcadas pagadas',
	stillOpen: 'Siguen pendientes',
	partial: 'Abono parcial',
	underReview: 'En revisión',
	noEvidence: 'Sin evidencia',
	contractsReread: 'Contratos releídos',
}

const SIMULATED: Readonly<Record<string, string>> = {
	invoicesNew: 'Se importarían',
	amountNewCents: 'Monto que se importaría',
	customersNew: 'Clientes que se crearían',
	customersUpdated: 'Clientes que se actualizarían',
	markedPaid: 'Se marcarían pagadas',
}

export function counterLabel(key: string, simulation: boolean): string {
	return (simulation ? SIMULATED[key] : undefined) ?? LABELS[key] ?? key
}

export function counterValue(key: string, value: number): string {
	return key.endsWith('Cents') ? usd(value) : String(value)
}

/** `Contratos leídos: 27 · Importadas: 42 · Clientes creados: 20 · Excluidas por estado: 9 · …` */
export function runSummary(counters: Readonly<Record<string, number>>, main: readonly string[], all: readonly string[], simulation: boolean): string {
	const shown = [...main, ...all.filter(key => !main.includes(key) && !key.endsWith('Cents') && (counters[key] ?? 0) !== 0)]
	return shown.map(key => `${counterLabel(key, simulation)}: ${counterValue(key, counters[key] ?? 0)}`).join(' · ')
}
