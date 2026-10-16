/** Resumen (RF31–RF33, RF35, CA23, extras RF42, RF43): la pantalla de inicio. Cada tramo abre Clientes filtrado. */

import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, ArrowRightIcon, CheckCircle2Icon, SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import type { AttentionItem, Summary } from '../../shared/api-types.ts'
import { PageHeader } from '@/components/page-header.tsx'
import { EmptyState, ErrorState } from '@/components/query-states.tsx'
import { RunConfirmButton, useFinishedRunToasts, useStartRun } from '@/components/run-actions.tsx'
import { RunsTable } from '@/components/runs-table.tsx'
import { StatusBadge } from '@/components/status-badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { usd } from '@/lib/format.ts'
import { AGING_LABEL, fetchSummary, SUMMARY_QUERY } from '@/lib/queries.ts'
import { CONTRACT_STATUS, IMPORT_OUTCOME, PAID_OUTCOME, RUN_STATUS } from '@/lib/status.ts'

function Total({ label, value, className = '' }: { readonly label: string; readonly value: string; readonly className?: string }) {
	return (
		<Card className={`flex flex-col justify-between p-4 ${className}`}>
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="tabular mt-1 text-xl font-semibold whitespace-nowrap sm:text-2xl lg:text-xl 2xl:text-2xl">{value}</p>
		</Card>
	)
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-4 border-b border-dashed py-1.5 text-sm last:border-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 text-right break-all">{children}</dd>
		</div>
	)
}

function AgingBlock({ summary }: { readonly summary: Summary }) {
	return (
		<Card>
			<CardHeader>
				<div>
					<CardTitle>Antigüedad de la deuda</CardTitle>
					<p className="mt-1 text-sm text-muted-foreground">Días desde el vencimiento hasta hoy, sobre las facturas abiertas. Toca un tramo para ver a esos clientes.</p>
				</div>
			</CardHeader>
			<CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{summary.aging.map(bucket => {
					const label = AGING_LABEL[bucket.key]
					return (
						<Link
							key={bucket.key}
							to={`/clientes?${new URLSearchParams({ tramo: bucket.key }).toString()}`}
							className="group rounded-lg border bg-card p-4 shadow-card transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
							aria-label={`${label}: ${usd(bucket.amountCents)} en ${bucket.count} ${bucket.count === 1 ? 'factura' : 'facturas'}. Ver clientes`}
						>
							<p className="flex items-center justify-between text-xs text-muted-foreground">
								{label.charAt(0).toUpperCase() + label.slice(1)}
								<ArrowRightIcon className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
							</p>
							<p className="tabular mt-1 text-lg font-semibold whitespace-nowrap sm:text-xl">{usd(bucket.amountCents)}</p>
							<p className="tabular text-xs text-muted-foreground">{bucket.count === 1 ? '1 factura' : `${bucket.count} facturas`}</p>
						</Link>
					)
				})}
			</CardContent>
		</Card>
	)
}

const RUN_NAME = { import: 'Importación', paid: 'Actualización de pagadas' } as const

function attentionStatus(item: AttentionItem) {
	if (item.kind === 'import') return item.outcome === null ? RUN_STATUS.failed : IMPORT_OUTCOME[item.outcome]
	return item.outcome === null ? RUN_STATUS.failed : PAID_OUTCOME[item.outcome]
}

/** D56: lo que tiene que revisar una persona; cada línea abre su corrida filtrada. */
function AttentionBlock({ summary }: { readonly summary: Summary }) {
	if (!summary.recentRuns.some(run => !run.simulation)) return null
	return (
		<Card>
			<CardHeader>
				<div>
					<CardTitle>Requiere atención</CardTitle>
					<p className="mt-1 text-sm text-muted-foreground">Lo que dejaron la última importación y la última actualización de pagadas para que lo revise una persona.</p>
				</div>
			</CardHeader>
			<CardContent>
				{summary.attention.length === 0 ? (
					<p className="flex items-center gap-2 text-sm text-success-fg">
						<CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
						Nada para revisar: las últimas corridas no dejaron casos dudosos.
					</p>
				) : (
					<ul className="divide-y">
						{summary.attention.map(item => {
							const to = `/sincronizacion/corridas/${item.runId}${item.outcome === null ? '' : `?${new URLSearchParams({ resultado: item.outcome }).toString()}`}`
							return (
								<li key={`${item.kind}-${item.outcome ?? 'failed'}`}>
									<Link to={to} className="group flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
										<StatusBadge status={attentionStatus(item)} />
										<span>
											{item.outcome === null
												? `La última ${RUN_NAME[item.kind].toLowerCase()} falló`
												: `${item.count} ${item.count === 1 ? 'caso' : 'casos'}`}
											<span className="text-muted-foreground"> · {RUN_NAME[item.kind]} #{item.runId}</span>
										</span>
										<ArrowRightIcon className="ml-auto size-4 text-muted-foreground group-hover:text-primary" aria-hidden />
									</Link>
								</li>
							)
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	)
}

function ProviderBlock({ summary }: { readonly summary: Summary }) {
	const { provider, auto } = summary
	return (
		<Card>
			<CardHeader>
				<CardTitle>Proveedor</CardTitle>
				<Button asChild variant="link" size="sm" className="h-auto p-0">
					<Link to="/configuracion"><SettingsIcon aria-hidden />Editar configuración</Link>
				</Button>
			</CardHeader>
			<CardContent>
				{provider ? (
					<dl>
						<Field label="Nombre">{provider.name}</Field>
						<Field label="URL"><span className="font-mono text-xs">{provider.apiUrl}</span></Field>
						<Field label="Estados que se importan">{provider.importStates.map(status => CONTRACT_STATUS[status].label).join(', ')}</Field>
						<Field label="Ventana">{provider.windowMonths === null ? 'Sin ventana' : `${provider.windowMonths} meses`}</Field>
						<Field label="Máximo de cuotas por contrato">{provider.maxRecent === null ? 'Todas' : `Las ${provider.maxRecent} más recientes`}</Field>
						<Field label="Corrida automática">{auto.enabled && auto.hour !== null ? `Activa, todos los días a las ${String(auto.hour).padStart(2, '0')}:00` : 'Desactivada'}</Field>
					</dl>
				) : (
					<div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-warning/40 bg-warning-bg p-4 text-warning-fg">
						<p className="flex items-start gap-2 text-sm">
							<AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
							Configura el proveedor: falta la URL, el usuario o la contraseña del administrador de facturas. Sin eso no se puede importar ni actualizar las pagadas.
						</p>
						<Button asChild size="sm" variant="outline"><Link to="/configuracion">Ir a Configuración</Link></Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function SummarySkeleton() {
	return (
		<div className="grid gap-5" aria-busy="true" aria-label="Cargando el resumen">
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}</div>
			<Skeleton className="h-56" />
			<Skeleton className="h-48" />
		</div>
	)
}

export function ResumenScreen() {
	const query = useQuery({
		queryKey: SUMMARY_QUERY,
		queryFn: fetchSummary,
		// RF22: mientras algo corre, consulta cada segundo.
		refetchInterval: current => (current.state.data?.recentRuns.some(run => run.status === 'running') ? 1000 : false),
	})
	useFinishedRunToasts(query.data?.recentRuns)
	const start = useStartRun()

	const summary = query.data
	const busy = summary?.recentRuns.some(run => run.status === 'running') ?? false
	const disabled = !summary?.provider || busy || start.isPending

	return (
		<>
			<PageHeader
				title="Resumen"
				description="Lo que hay por cobrar en Cobrix y cómo va la sincronización con el administrador de facturas."
				actions={
					<>
						<RunConfirmButton kind="import" disabled={disabled} onConfirm={() => start.mutate({ tipo: 'importacion', simulacion: false })} />
						<RunConfirmButton kind="paid" disabled={disabled} onConfirm={() => start.mutate({ tipo: 'pagadas', simulacion: false })} />
					</>
				}
			/>

			{query.isPending && <SummarySkeleton />}
			{query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
			{summary && (
				<div className="grid gap-5">
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
						<Total label="Clientes" value={String(summary.totals.customers)} />
						<Total label="Contratos" value={String(summary.totals.contracts)} />
						<Total label="Facturas abiertas" value={String(summary.totals.openInvoices)} />
						<Total label="Facturas pagadas" value={String(summary.totals.paidInvoices)} />
						<Total label="Por cobrar" value={usd(summary.totals.openAmountCents)} className="col-span-2 sm:col-span-1" />
					</div>

					<AttentionBlock summary={summary} />
					<AgingBlock summary={summary} />
					<ProviderBlock summary={summary} />

					<Card className="min-w-0">
						<CardHeader>
							<CardTitle>Últimas corridas</CardTitle>
							<Button asChild variant="link" size="sm" className="h-auto p-0">
								<Link to="/sincronizacion">Ver todas<ArrowRightIcon aria-hidden /></Link>
							</Button>
						</CardHeader>
						{summary.recentRuns.length === 0 ? (
							<EmptyState
								title="Todavía no hay corridas"
								description="Empieza en Sincronización con «Simular importación» para ver qué se traería del administrador, sin crear nada."
								action={<Button asChild variant="outline"><Link to="/sincronizacion">Ir a Sincronización</Link></Button>}
							/>
						) : (
							<RunsTable runs={summary.recentRuns} />
						)}
					</Card>
				</div>
			)}
		</>
	)
}
