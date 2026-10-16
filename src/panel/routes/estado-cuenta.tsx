/**
 * Estado de cuenta (extras RF47–RF49, CL33, P34, P35): una hoja para imprimir o guardar en PDF,
 * fuera del marco del panel. Sin datos de la empresa no se genera. Cada pedido queda auditado,
 * así que se pide una sola vez.
 */

import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, ArrowLeftIcon, PrinterIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import type { StatementResponse } from '../../shared/api-types.ts'
import { ErrorState } from '@/components/query-states.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { ApiRequestError } from '@/lib/api.ts'
import { date, period, usd } from '@/lib/format.ts'
import { fetchStatement, PERSON_TYPE_LABEL, statementQuery } from '@/lib/queries.ts'

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="flex gap-3 py-0.5">
			<dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words">{children}</dd>
		</div>
	)
}

function Sheet({ statement }: { readonly statement: StatementResponse }) {
	const { company, customer, invoices } = statement
	const issued = date(statement.issuedOn)
	return (
		<article className="statement-sheet mx-auto w-full max-w-[210mm] rounded-lg border bg-card p-4 text-sm shadow-card sm:p-10">
			<header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="text-lg font-semibold">{company.name}</p>
					<p className="text-muted-foreground">RIF {company.rif}</p>
					<p className="text-muted-foreground">{company.email}</p>
				</div>
				<div className="sm:text-right">
					<h1 className="text-xl font-semibold tracking-tight">Estado de cuenta</h1>
					<p className="text-muted-foreground">Emitido el {issued}</p>
				</div>
			</header>

			<section className="border-b py-5" aria-labelledby="statement-customer">
				<h2 id="statement-customer" className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cliente</h2>
				<dl className="grid gap-x-8 sm:grid-cols-2">
					<Field label="Nombre"><span className="font-medium">{customer.name}</span></Field>
					<Field label="Documento"><span className="font-mono text-xs">{customer.document}</span></Field>
					<Field label="Tipo">{PERSON_TYPE_LABEL[customer.personType]}</Field>
					<Field label="Correo">{customer.email ?? '—'}</Field>
					<Field label="Teléfono">{customer.phone ?? '—'}</Field>
				</dl>
			</section>

			<section className="py-5" aria-labelledby="statement-invoices">
				<h2 id="statement-invoices" className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Facturas abiertas</h2>
				{invoices.length === 0 ? (
					<p className="rounded-md border border-dashed p-4 text-center font-medium">Sin facturas abiertas al {issued}.</p>
				) : (
					<>
						<table className="w-full border-collapse text-xs sm:text-sm">
							<thead>
								<tr className="border-b text-left text-xs text-muted-foreground">
									<th className="py-2 pr-2 font-medium sm:pr-3">Factura</th>
									<th className="py-2 pr-2 font-medium sm:pr-3">Periodo</th>
									<th className="py-2 pr-2 font-medium sm:pr-3">Vencimiento</th>
									<th className="py-2 pr-2 font-medium sm:pr-3">Corte</th>
									<th className="py-2 text-right font-medium">Saldo</th>
								</tr>
							</thead>
							<tbody>
								{invoices.map(invoice => (
									<tr key={invoice.number} className="border-b border-dashed">
										<td className="py-2 pr-2 font-mono text-[0.7rem] whitespace-nowrap sm:pr-3 sm:text-xs">{invoice.number}</td>
										<td className="py-2 pr-2 sm:pr-3">{period(invoice.period)}</td>
										<td className="py-2 pr-2 sm:pr-3">{date(invoice.dueDate)}</td>
										<td className="py-2 pr-2 sm:pr-3">{date(invoice.cutDate)}</td>
										<td className="tabular py-2 text-right whitespace-nowrap">{usd(invoice.balanceCents)}</td>
									</tr>
								))}
							</tbody>
						</table>
						<p className="flex items-baseline justify-between gap-4 pt-3 font-semibold">
							<span>Total adeudado</span>
							<span className="tabular text-base whitespace-nowrap">{usd(statement.totalCents)}</span>
						</p>
					</>
				)}
			</section>

			<footer className="border-t pt-3 text-xs text-muted-foreground">Montos en dólares estadounidenses (USD). Generado con Cobrix.</footer>
		</article>
	)
}

export function EstadoCuentaScreen() {
	const key = useParams().id ?? ''
	const query = useQuery({
		queryKey: statementQuery(key),
		queryFn: () => fetchStatement(key),
		// P35: cada pedido queda en la auditoría.
		retry: false,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	})
	const statement = query.data
	useEffect(() => {
		// También el nombre que sugiere el navegador para el PDF.
		document.title = statement ? `Estado de cuenta - ${statement.customer.name} - ${statement.issuedOn}` : 'Estado de cuenta · Cobrix'
	}, [statement])

	const error = query.error instanceof ApiRequestError ? query.error : null
	const back = `/clientes/${encodeURIComponent(key)}`

	return (
		<div className="statement-page min-h-dvh bg-background px-4 py-6 sm:py-10">
			<div className="print-hidden mx-auto mb-5 flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3">
				<Link to={back} className="inline-flex items-center gap-1 text-sm text-primary"><ArrowLeftIcon className="size-4" aria-hidden />Volver al expediente</Link>
				{statement && <Button onClick={() => window.print()}><PrinterIcon aria-hidden />Imprimir / Guardar PDF</Button>}
			</div>

			{query.isPending && (
				<div className="mx-auto grid w-full max-w-[210mm] gap-4 rounded-lg border bg-card p-10" aria-busy="true" aria-label="Cargando el estado de cuenta">
					<Skeleton className="h-16" /><Skeleton className="h-24" /><Skeleton className="h-40" />
				</div>
			)}
			{error?.code === 'company_incomplete' && (
				<div role="alert" className="mx-auto flex w-full max-w-[210mm] flex-col items-start gap-3 rounded-lg border border-warning/40 bg-warning-bg p-4 text-warning-fg sm:flex-row sm:items-center">
					<AlertTriangleIcon className="size-5 shrink-0" aria-hidden />
					<p className="flex-1 text-sm">{error.message}</p>
					<Button asChild size="sm" variant="outline"><Link to="/configuracion">Ir a Configuración</Link></Button>
				</div>
			)}
			{error?.status === 404 && (
				<div className="mx-auto w-full max-w-[210mm]">
					<h1 className="text-xl font-semibold">No encontramos ese cliente</h1>
					<p className="mt-1 mb-4 text-sm text-muted-foreground">Puede que se hayan borrado los datos de Cobrix, o que el enlace esté mal.</p>
					<Button asChild variant="outline"><Link to="/clientes">Ver todos los clientes</Link></Button>
				</div>
			)}
			{query.isError && error?.code !== 'company_incomplete' && error?.status !== 404 && (
				<div className="mx-auto w-full max-w-[210mm]"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>
			)}
			{statement && <Sheet statement={statement} />}
		</div>
	)
}
