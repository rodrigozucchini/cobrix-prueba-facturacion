/** Sincronización (RF18, RF21, RF22, RF35, RF37, RF41, P10, P12): las dos corridas con su simulación, y el historial. */

import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, DownloadCloudIcon, FlaskConicalIcon, RefreshCwIcon } from 'lucide-react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/page-header.tsx'
import { EmptyState, ErrorState } from '@/components/query-states.tsx'
import { RunConfirmButton, useFinishedRunToasts, useStartRun } from '@/components/run-actions.tsx'
import { RunsTable } from '@/components/runs-table.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { fetchRuns, fetchSettings, providerConfigured, RUNS_QUERY, SETTINGS_QUERY } from '@/lib/queries.ts'

export function SincronizacionScreen() {
	const settings = useQuery({ queryKey: SETTINGS_QUERY, queryFn: fetchSettings })
	const runs = useQuery({
		queryKey: RUNS_QUERY,
		queryFn: fetchRuns,
		// RF22: mientras algo corre, consulta cada segundo.
		refetchInterval: query => (query.state.data?.some(run => run.status === 'running') ? 1000 : false),
	})
	useFinishedRunToasts(runs.data)
	const start = useStartRun()

	const configured = providerConfigured(settings.data)
	const busy = runs.data?.some(run => run.status === 'running') ?? false
	const disabled = !configured || busy || start.isPending

	return (
		<>
			<PageHeader
				title="Sincronización"
				description="La importación lee cada contrato del administrador y crea una factura abierta por cuota pendiente que cumpla las reglas. La actualización de pagadas revisa qué facturas el ISP ya cobró."
			/>

			{settings.data && !configured && (
				<div role="alert" className="mb-5 flex flex-col items-start gap-3 rounded-lg border border-warning/40 bg-warning-bg p-4 text-warning-fg sm:flex-row sm:items-center">
					<AlertTriangleIcon className="size-5 shrink-0" aria-hidden />
					<p className="flex-1 text-sm">Para correr una sincronización, primero carga la URL, el usuario y la contraseña del administrador de facturas.</p>
					<Button asChild size="sm" variant="outline"><Link to="/configuracion">Ir a Configuración</Link></Button>
				</div>
			)}

			<div className="mb-5 grid gap-5 md:grid-cols-2">
				<Card>
					<CardHeader><CardTitle className="flex items-center gap-2"><DownloadCloudIcon className="size-4" aria-hidden />Importar cuotas</CardTitle></CardHeader>
					<CardContent className="grid gap-4">
						<p className="text-sm text-muted-foreground">Recorre todos los contratos del administrador y aplica los estados, la ventana, el máximo de cuotas y los topes de Configuración.</p>
						<div className="flex flex-wrap gap-2">
							<Button variant="outline" disabled={disabled} onClick={() => start.mutate({ tipo: 'importacion', simulacion: true })}>
								<FlaskConicalIcon aria-hidden />Simular importación
							</Button>
							<RunConfirmButton kind="import" disabled={disabled} onConfirm={() => start.mutate({ tipo: 'importacion', simulacion: false })} />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2"><RefreshCwIcon className="size-4" aria-hidden />Actualizar facturas pagadas</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<p className="text-sm text-muted-foreground">Revisa cada factura abierta contra el libro de cuotas del administrador y marca pagadas las que el ISP ya cobró por completo.</p>
						<div className="flex flex-wrap gap-2">
							<Button variant="outline" disabled={disabled} onClick={() => start.mutate({ tipo: 'pagadas', simulacion: true })}>
								<FlaskConicalIcon aria-hidden />Simular actualización
							</Button>
							<RunConfirmButton kind="paid" disabled={disabled} onConfirm={() => start.mutate({ tipo: 'pagadas', simulacion: false })} />
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader><CardTitle>Corridas</CardTitle></CardHeader>
				{runs.isPending && (
					<CardContent className="grid gap-3" aria-busy="true" aria-label="Cargando las corridas">
						{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-full" />)}
					</CardContent>
				)}
				{runs.isError && <CardContent><ErrorState error={runs.error} onRetry={() => void runs.refetch()} /></CardContent>}
				{runs.data && runs.data.length === 0 && (
					<EmptyState title="Todavía no hay corridas" description="Empieza con «Simular importación» para ver qué se traería del administrador, sin crear nada." />
				)}
				{runs.data && runs.data.length > 0 && <RunsTable runs={runs.data} />}
			</Card>
		</>
	)
}
