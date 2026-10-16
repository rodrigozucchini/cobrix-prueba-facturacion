/** Detalle de corrida (RF19, RF22, CA28, CL15): qué pasó con cada cuota y por qué, con filtro por resultado en la URL. */

import { useQuery } from '@tanstack/react-query'
import { AlertCircleIcon, ArrowLeftIcon, DownloadIcon, InfoIcon } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import type { ImportOutcome, PaidOutcome, RunDetail, RunRow } from '../../shared/api-types.ts'
import { counterLabel, counterValue, IMPORT_COUNTERS, PAID_COUNTERS } from '../../shared/counters.ts'
import { PageHeader } from '@/components/page-header.tsx'
import { EmptyState, ErrorState } from '@/components/query-states.tsx'
import { RunConfirmButton, useStartRun } from '@/components/run-actions.tsx'
import { RunKindCell } from '@/components/runs-table.tsx'
import { StatusBadge } from '@/components/status-badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx'
import { ApiRequestError } from '@/lib/api.ts'
import { dateTime, duration, period, usd } from '@/lib/format.ts'
import { fetchRun, RUN_KIND_LABEL, runQuery } from '@/lib/queries.ts'
import { importOutcome, paidOutcome, RUN_STATUS, SIMULATION, type StatusInfo } from '@/lib/status.ts'

const IMPORT_HIGHLIGHTS = ['contractsRead', 'invoicesNew', 'amountNewCents', 'customersNew', 'alreadyImported', 'excludedByStatus'] as const
const PAID_HIGHLIGHTS = ['invoicesChecked', 'markedPaid', 'partial', 'stillOpen', 'noEvidence', 'underReview'] as const

const isImportOutcome = (outcome: ImportOutcome | PaidOutcome, run: RunDetail): outcome is ImportOutcome => run.kind === 'import'

function outcomeStatus(row: RunRow, run: RunDetail): StatusInfo {
	return isImportOutcome(row.outcome, run) ? importOutcome(row.outcome, run.simulation) : paidOutcome(row.outcome as PaidOutcome, run.simulation)
}

function DetailSkeleton() {
	return (
		<div className="grid gap-5" aria-busy="true" aria-label="Cargando la corrida">
			<Skeleton className="h-8 w-64" />
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
			<Skeleton className="h-64" />
		</div>
	)
}

export function CorridaScreen() {
	const id = Number(useParams().id)
	const [search, setSearch] = useSearchParams()
	const filter = search.get('resultado') ?? 'todos'
	const query = useQuery({
		queryKey: runQuery(id),
		queryFn: () => fetchRun(id),
		enabled: Number.isInteger(id),
		retry: (count, error) => !(error instanceof ApiRequestError && error.status === 404) && count < 1,
		refetchInterval: current => (current.state.data?.status === 'running' ? 1000 : false),
	})
	const start = useStartRun()
	const navigate = useNavigate()
	const back = <Link to="/sincronizacion" className="inline-flex items-center gap-1 text-primary"><ArrowLeftIcon className="size-4" aria-hidden />Sincronización</Link>

	if (!Number.isInteger(id) || (query.error instanceof ApiRequestError && query.error.status === 404)) {
		return (
			<>
				<PageHeader back={back} title="No encontramos esa corrida" description="Puede que se hayan borrado los datos de Cobrix, o que el enlace esté mal." />
				<Button asChild variant="outline"><Link to="/sincronizacion">Ver todas las corridas</Link></Button>
			</>
		)
	}
	if (query.isPending) return <><PageHeader back={back} title="Detalle de corrida" /><DetailSkeleton /></>
	if (query.isError) return <><PageHeader back={back} title="Detalle de corrida" /><ErrorState error={query.error} onRetry={() => void query.refetch()} /></>

	const run = query.data
	const counts = new Map<string, number>()
	for (const row of run.rows) counts.set(row.outcome, (counts.get(row.outcome) ?? 0) + 1)
	const rows = filter === 'todos' ? run.rows : run.rows.filter(row => row.outcome === filter)
	const setFilter = (value: string) => setSearch(value === 'todos' ? {} : { resultado: value }, { replace: true })
	const counters = run.kind === 'import' ? IMPORT_COUNTERS : PAID_COUNTERS
	const highlights = run.kind === 'import' ? IMPORT_HIGHLIGHTS : PAID_HIGHLIGHTS

	return (
		<>
			<PageHeader
				back={back}
				title={`${RUN_KIND_LABEL[run.kind]} #${run.id}`}
				description={
					<span className="flex flex-wrap items-center gap-2">
						<span>{dateTime(run.startedAt)}</span>
						<StatusBadge status={RUN_STATUS[run.status]} />
						{run.durationMs !== null && <span>· {duration(run.durationMs)}</span>}
						{run.simulation && <StatusBadge status={SIMULATION} />}
						{run.origin === 'auto' && <RunKindCell run={{ ...run, simulation: false }} />}
					</span>
				}
			/>

			{run.simulation && run.status !== 'failed' && (
				<div className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-info/30 bg-info-bg px-3 py-2 text-sm text-info-fg">
					<p className="flex items-center gap-2">
						<InfoIcon className="size-4 shrink-0" aria-hidden />Esto es lo que pasaría: es una simulación y no se guardó nada.
					</p>
					{/* D59: después de revisar la simulación, la corrida real con su confirmación. */}
					{run.status === 'completed' && (
						<div className="ml-auto">
							<RunConfirmButton
								kind={run.kind}
								disabled={start.isPending}
								onConfirm={() => start.mutate(
									{ tipo: run.kind === 'import' ? 'importacion' : 'pagadas', simulacion: false },
									{ onSuccess: started => void navigate(`/sincronizacion/corridas/${started.id}`) },
								)}
							/>
						</div>
					)}
				</div>
			)}
			{run.status === 'failed' && (
				<div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
					<AlertCircleIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
					<p><strong>La corrida falló y no cambió nada.</strong> {run.error}</p>
				</div>
			)}
			{run.status === 'running' && <p className="mb-5 text-sm text-muted-foreground" aria-live="polite">La corrida está en curso: esta pantalla se actualiza sola.</p>}

			{run.status === 'completed' && (
				<>
					<div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
						{highlights.map(key => (
							<Card key={key} className="flex flex-col justify-between p-4">
								<p className="text-xs text-muted-foreground">{counterLabel(key, run.simulation)}</p>
								<p className={`tabular mt-1 font-semibold whitespace-nowrap ${key.endsWith('Cents') ? 'text-base sm:text-lg xl:text-base' : 'text-xl sm:text-2xl'}`}>{counterValue(key, run.counters[key] ?? 0)}</p>
							</Card>
						))}
					</div>

					{run.warnings.length > 0 && (
						<div className="mb-5 rounded-lg border border-warning/40 bg-warning-bg p-4 text-sm text-warning-fg">
							<p className="font-medium">El administrador informó:</p>
							<ul className="mt-1 list-disc pl-5">{run.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
						</div>
					)}

					<div className="grid gap-5">
						<Card>
							<CardHeader><CardTitle>Contadores</CardTitle></CardHeader>
							<CardContent>
								<dl className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
									{counters.map(key => (
										<div key={key} className={`flex items-baseline justify-between gap-4 border-b border-dashed py-1.5 text-sm ${(run.counters[key] ?? 0) === 0 ? 'text-muted-foreground' : ''}`}>
											<dt>{counterLabel(key, run.simulation)}</dt>
											<dd className="tabular font-medium whitespace-nowrap">{counterValue(key, run.counters[key] ?? 0)}</dd>
										</div>
									))}
								</dl>
							</CardContent>
						</Card>

						<Card className="min-w-0">
							<CardHeader>
								<CardTitle>Detalle</CardTitle>
								<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
									<Select value={filter} onValueChange={setFilter}>
										<SelectTrigger className="w-full sm:w-72" aria-label="Filtrar por resultado"><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="todos">Todos los resultados ({run.rows.length})</SelectItem>
											{[...counts.entries()].map(([outcome, total]) => (
												<SelectItem key={outcome} value={outcome}>
													{outcomeStatus({ outcome } as RunRow, run).label} ({total})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{/* Extras RF45: las filas con el filtro aplicado. */}
									<Button asChild variant="outline">
										<a href={`/api/corridas/${run.id}.csv${filter === 'todos' ? '' : `?${new URLSearchParams({ resultado: filter }).toString()}`}`} download>
											<DownloadIcon aria-hidden />Exportar CSV
										</a>
									</Button>
								</div>
							</CardHeader>
							{rows.length === 0 ? (
								<EmptyState title="No hay filas con ese resultado" description="Elige otro resultado en el filtro." />
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Contrato</TableHead>
											<TableHead>Cuota</TableHead>
											<TableHead>Cliente</TableHead>
											<TableHead>Periodo</TableHead>
											<TableHead>Resultado</TableHead>
											<TableHead>Motivo</TableHead>
											<TableHead className="text-right">Monto</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{rows.map((row, index) => (
											<TableRow key={`${row.contractNumber}-${row.installmentId}-${index}`}>
												<TableCell className="font-mono text-xs">{row.contractNumber ?? '—'}</TableCell>
												<TableCell className="font-mono text-xs">{row.installmentId ?? '—'}</TableCell>
												<TableCell className="whitespace-nowrap">
													{row.customerExists && row.customerKey && !run.simulation
														? <Link className="text-primary hover:underline" to={`/clientes/${encodeURIComponent(row.customerKey)}`}>{row.customerName}</Link>
														: (row.customerName ?? '—')}
												</TableCell>
												<TableCell className="whitespace-nowrap">{row.period ? period(row.period) : '—'}</TableCell>
												<TableCell><StatusBadge status={outcomeStatus(row, run)} /></TableCell>
												<TableCell className="min-w-64 text-muted-foreground">{row.reason}</TableCell>
												<TableCell className="tabular text-right whitespace-nowrap">{row.amountCents === null ? '—' : usd(row.amountCents)}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</Card>
					</div>
				</>
			)}
		</>
	)
}
