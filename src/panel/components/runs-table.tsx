/** El historial de corridas (RF18), en Sincronización y Resumen. Cada fila abre su detalle con clic o Enter. */

import { Link, useNavigate } from 'react-router'

import type { RunListItem } from '../../shared/api-types.ts'
import { StatusBadge } from '@/components/status-badge.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx'
import { dateTime } from '@/lib/format.ts'
import { RUN_KIND_LABEL } from '@/lib/queries.ts'
import { RUN_STATUS, SIMULATION } from '@/lib/status.ts'

export function RunKindCell({ run }: { readonly run: RunListItem }) {
	return (
		<span className="flex flex-wrap items-center gap-1.5">
			{RUN_KIND_LABEL[run.kind]}
			{run.simulation && <StatusBadge status={SIMULATION} />}
			{run.origin === 'auto' && <Badge tone="neutral">Automática</Badge>}
		</span>
	)
}

export function RunsTable({ runs }: { readonly runs: readonly RunListItem[] }) {
	const navigate = useNavigate()
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-12">#</TableHead>
					<TableHead>Tipo</TableHead>
					<TableHead>Inicio</TableHead>
					<TableHead>Estado</TableHead>
					<TableHead>Resultado</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{runs.map(run => (
					<TableRow
						key={run.id}
						tabIndex={0}
						className="cursor-pointer"
						onClick={() => void navigate(`/sincronizacion/corridas/${run.id}`)}
						onKeyDown={event => { if (event.key === 'Enter') void navigate(`/sincronizacion/corridas/${run.id}`) }}
					>
						<TableCell className="font-mono text-primary"><Link to={`/sincronizacion/corridas/${run.id}`} onClick={event => event.stopPropagation()}>{run.id}</Link></TableCell>
						<TableCell><RunKindCell run={run} /></TableCell>
						<TableCell className="whitespace-nowrap">{dateTime(run.startedAt)}</TableCell>
						<TableCell><StatusBadge status={RUN_STATUS[run.status]} /></TableCell>
						<TableCell className="min-w-64 text-muted-foreground">{run.status === 'running' ? 'Corriendo…' : run.summary}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}
