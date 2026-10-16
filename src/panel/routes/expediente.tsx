/** Expediente (RF27–RF30, CL15, extras RF47): todo lo que Cobrix sabe de un cliente, con los mismos totales que la tabla (P19). */

import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, FileTextIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import type { CustomerDetail, CustomerEvent } from '../../shared/api-types.ts'
import { PageHeader } from '@/components/page-header.tsx'
import { EmptyState, ErrorState } from '@/components/query-states.tsx'
import { StatusBadge } from '@/components/status-badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx'
import { ApiRequestError } from '@/lib/api.ts'
import { date, dateTime, period, usd } from '@/lib/format.ts'
import { customerQuery, fetchCustomer, PERSON_TYPE_LABEL } from '@/lib/queries.ts'
import { CONTRACT_STATUS, INVOICE_STATUS, PAID_OUTCOME } from '@/lib/status.ts'
import type { FromClientes } from '@/routes/clientes.tsx'

function eventText(event: CustomerEvent): ReactNode {
	if (event.kind === 'customer_created') return 'Cliente creado'
	const invoice = <span className="font-mono text-xs">{event.invoiceNumber}</span>
	if (event.kind === 'invoice_imported') {
		return <>Factura {invoice} importada{event.period && ` (${period(event.period)}, cuota ${event.installmentId ?? '—'})`}</>
	}
	return (
		<>
			Factura {invoice} pagada en el ISP
			{event.adminInvoice && <> con la factura del administrador <span className="font-mono text-xs">{event.adminInvoice}</span></>}
			{event.adminDate && ` del ${date(event.adminDate)}`}
		</>
	)
}

function Total({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<Card className="flex flex-col justify-between p-4">
			<p className="text-xs text-muted-foreground">{label}</p>
			<div className="tabular mt-1 text-xl font-semibold sm:text-2xl">{children}</div>
		</Card>
	)
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-4 border-b border-dashed py-1.5 text-sm last:border-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 text-right break-words">{children}</dd>
		</div>
	)
}

const dash = (value: string | null) => value ?? <span className="text-muted-foreground">—</span>

function Detail({ detail }: { readonly detail: CustomerDetail }) {
	const { customer, totals } = detail
	return (
		<div className="grid gap-5">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Total label="Deuda">
					{usd(totals.debtCents)}
					{totals.openInvoices === 0 && <p className="mt-1 text-xs font-normal text-muted-foreground">Sin facturas abiertas</p>}
				</Total>
				<Total label="Facturas abiertas">{totals.openInvoices}</Total>
				<Total label="Facturas pagadas">{totals.paidInvoices}</Total>
				<Total label="Contratos">{totals.contracts}</Total>
			</div>

			<div className="grid gap-5 md:grid-cols-2">
				<Card>
					<CardHeader><CardTitle>Datos del cliente</CardTitle></CardHeader>
					<CardContent>
						<dl>
							<Field label="ID de cliente"><span className="font-mono text-xs">{customer.key}</span></Field>
							<Field label="Documento"><span className="font-mono text-xs">{customer.document}</span></Field>
							<Field label="Tipo">{PERSON_TYPE_LABEL[customer.personType]}</Field>
							<Field label="Correo">{dash(customer.email)}</Field>
							<Field label="Teléfono">{dash(customer.phone)}</Field>
							<Field label="Origen">{customer.origin}</Field>
							<Field label="En Cobrix desde">{dateTime(customer.createdAt)}</Field>
						</dl>
					</CardContent>
				</Card>

				<Card className="min-w-0">
					<CardHeader><CardTitle>Contratos en el administrador</CardTitle></CardHeader>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Contrato</TableHead>
								<TableHead>Estado</TableHead>
								<TableHead>Plan</TableHead>
								<TableHead className="text-right">Precio</TableHead>
								<TableHead>Sucursal</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{detail.contracts.map(contract => (
								<TableRow key={contract.number}>
									<TableCell className="font-mono text-xs">{contract.number}</TableCell>
									<TableCell><StatusBadge status={CONTRACT_STATUS[contract.status]} /></TableCell>
									<TableCell className="whitespace-nowrap">{dash(contract.plan)}</TableCell>
									<TableCell className="tabular text-right whitespace-nowrap">{usd(contract.priceCents)}</TableCell>
									<TableCell className="whitespace-nowrap">{dash(contract.branch)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Card>
			</div>

			<Card className="min-w-0">
				<CardHeader><CardTitle>Facturas</CardTitle></CardHeader>
				{detail.invoices.length === 0 ? (
					<EmptyState title="No tiene facturas en Cobrix" description="Sus cuotas no cumplieron las reglas de importación de Configuración." />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Factura</TableHead>
								<TableHead>Cuota</TableHead>
								<TableHead>Contrato</TableHead>
								<TableHead>Periodo</TableHead>
								<TableHead>Vencimiento</TableHead>
								<TableHead>Corte</TableHead>
								<TableHead className="text-right">Total</TableHead>
								<TableHead className="text-right">Saldo</TableHead>
								<TableHead>Estado</TableHead>
								<TableHead>Pago</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{detail.invoices.map(invoice => (
								<TableRow key={invoice.id}>
									<TableCell className="font-mono text-xs whitespace-nowrap">{invoice.number}</TableCell>
									<TableCell className="font-mono text-xs">{invoice.installmentId}</TableCell>
									<TableCell className="font-mono text-xs">{invoice.contractNumber}</TableCell>
									<TableCell className="whitespace-nowrap">{period(invoice.period)}</TableCell>
									<TableCell className="whitespace-nowrap">{date(invoice.dueDate)}</TableCell>
									<TableCell className="whitespace-nowrap">{date(invoice.cutDate)}</TableCell>
									<TableCell className="tabular text-right whitespace-nowrap">{usd(invoice.totalCents)}</TableCell>
									<TableCell className="tabular text-right font-medium whitespace-nowrap">{usd(invoice.balanceCents)}</TableCell>
									<TableCell>
										<div className="flex flex-col items-start gap-1">
											<StatusBadge status={INVOICE_STATUS[invoice.status]} />
											{invoice.partialBalanceCents !== null && <StatusBadge status={PAID_OUTCOME.partial} />}
										</div>
									</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{invoice.paidAt ? (
											<>
												<span className="block">{date(invoice.paidAt)}</span>
												<span className="block font-mono text-xs" title="Factura del administrador">{invoice.paidRef}</span>
											</>
										) : invoice.partialBalanceCents !== null ? (
											// D57: el ISP cobró una parte; Cobrix conserva el saldo entero hasta que se pague.
											<span className="block text-warning-fg" title="Lo que el ISP dice que todavía se debe">Quedan {usd(invoice.partialBalanceCents)}</span>
										) : '—'}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Card>

			<Card>
				<CardHeader><CardTitle>Historial</CardTitle></CardHeader>
				<CardContent>
					<ol className="grid">
						{detail.events.map(event => (
							<li key={event.id} className="flex flex-col gap-1 border-b border-dashed py-2.5 text-sm last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
								<span className="shrink-0 whitespace-nowrap text-muted-foreground sm:w-48">{dateTime(event.at)}</span>
								<span className="min-w-0 flex-1">{eventText(event)}</span>
								<Link to={`/sincronizacion/corridas/${event.runId}`} className="shrink-0 text-primary hover:underline">Corrida #{event.runId}</Link>
							</li>
						))}
					</ol>
				</CardContent>
			</Card>
		</div>
	)
}

function DetailSkeleton() {
	return (
		<div className="grid gap-5" aria-busy="true" aria-label="Cargando el expediente">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>
			<div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
			<Skeleton className="h-64" />
		</div>
	)
}

export function ExpedienteScreen() {
	const key = useParams().id ?? ''
	const location = useLocation()
	const from = (location.state as Partial<FromClientes> | null)?.from ?? '/clientes'
	const query = useQuery({
		queryKey: customerQuery(key),
		queryFn: () => fetchCustomer(key),
		retry: (count, error) => !(error instanceof ApiRequestError && error.status === 404) && count < 1,
	})
	const back = <Link to={from} className="inline-flex items-center gap-1 text-primary"><ArrowLeftIcon className="size-4" aria-hidden />Clientes</Link>

	if (query.error instanceof ApiRequestError && query.error.status === 404) {
		return (
			<>
				<PageHeader back={back} title="No encontramos ese cliente" description="Puede que se hayan borrado los datos de Cobrix, o que el enlace esté mal." />
				<Button asChild variant="outline"><Link to="/clientes">Ver todos los clientes</Link></Button>
			</>
		)
	}
	if (query.isPending) return <><PageHeader back={back} title="Expediente del cliente" /><DetailSkeleton /></>
	if (query.isError) return <><PageHeader back={back} title="Expediente del cliente" /><ErrorState error={query.error} onRetry={() => void query.refetch()} /></>

	const { customer } = query.data
	return (
		<>
			<PageHeader
				back={back}
				title={customer.name}
				description={<>{PERSON_TYPE_LABEL[customer.personType]} · <span className="font-mono text-xs">{customer.document}</span></>}
				actions={
					// Extras RF47: la hoja para imprimir se abre en otra pestaña.
					<Button asChild variant="outline">
						<a href={`/clientes/${encodeURIComponent(customer.key)}/estado-de-cuenta`} target="_blank" rel="noopener">
							<FileTextIcon aria-hidden />Estado de cuenta
						</a>
					</Button>
				}
			/>
			<Detail detail={query.data} />
		</>
	)
}
