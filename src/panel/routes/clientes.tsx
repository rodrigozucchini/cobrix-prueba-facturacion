/**
 * Clientes (RF23–RF26, CL14, P23, extras RF43, CL28). La búsqueda, el orden y el tramo viven en
 * la URL, así volver, recargar o compartir el enlace conserva lo que se veía.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDownIcon, DownloadIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'

import { AGING_BUCKET_KEYS, CUSTOMER_SORTS, type AgingBucketKey, type CustomerListItem, type CustomerSort } from '../../shared/api-types.ts'
import { PageHeader } from '@/components/page-header.tsx'
import { EmptyState, ErrorState } from '@/components/query-states.tsx'
import { StatusBadge } from '@/components/status-badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx'
import { date, usd } from '@/lib/format.ts'
import { AGING_LABEL, customersQuery, fetchCustomers, PERSON_TYPE_LABEL } from '@/lib/queries.ts'
import { PAID_OUTCOME } from '@/lib/status.ts'

const SEARCH_PAUSE_MS = 250

/** Adónde vuelve «← Clientes» desde el expediente (P23). */
export interface FromClientes {
	readonly from: string
}

function SortHead({ sort, current, onSort, children, className }: {
	readonly sort: CustomerSort
	readonly current: CustomerSort
	readonly onSort: (sort: CustomerSort) => void
	readonly children: string
	readonly className?: string
}) {
	const active = sort === current
	return (
		<TableHead className={className} aria-sort={active ? (sort === 'deuda' ? 'descending' : 'ascending') : 'none'}>
			<button
				type="button"
				onClick={() => onSort(sort)}
				className={`inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring ${active ? 'font-semibold text-foreground' : ''}`}
			>
				{children}
				{active && <ArrowDownIcon className="size-3.5" aria-hidden />}
			</button>
		</TableHead>
	)
}

function CustomerRow({ customer, from }: { readonly customer: CustomerListItem; readonly from: string }) {
	const navigate = useNavigate()
	const to = `/clientes/${encodeURIComponent(customer.key)}`
	const state: FromClientes = { from }
	const open = () => void navigate(to, { state })
	return (
		<TableRow tabIndex={0} className="cursor-pointer" onClick={open} onKeyDown={event => { if (event.key === 'Enter') open() }}>
			<TableCell className="font-medium whitespace-nowrap">
				<Link to={to} state={state} className="text-primary hover:underline" onClick={event => event.stopPropagation()}>{customer.name}</Link>
				{customer.partialInvoices > 0 && <StatusBadge status={PAID_OUTCOME.partial} className="ml-2" />}
			</TableCell>
			<TableCell className="font-mono text-xs whitespace-nowrap">{customer.document}</TableCell>
			<TableCell>{PERSON_TYPE_LABEL[customer.personType]}</TableCell>
			<TableCell className="tabular text-right">{customer.contracts}</TableCell>
			<TableCell className="tabular text-right">{customer.openInvoices}</TableCell>
			<TableCell className="tabular text-right">{customer.paidInvoices}</TableCell>
			<TableCell className="tabular text-right font-medium whitespace-nowrap">{usd(customer.debtCents)}</TableCell>
			<TableCell className="whitespace-nowrap">
				{customer.oldestDueDate ? date(customer.oldestDueDate) : <span className="text-muted-foreground">Sin facturas abiertas</span>}
			</TableCell>
		</TableRow>
	)
}

export function ClientesScreen() {
	const location = useLocation()
	const [search, setSearch] = useSearchParams()
	const q = search.get('q') ?? ''
	const sort = CUSTOMER_SORTS.find(candidate => candidate === search.get('orden')) ?? 'vencimiento'
	const bucket = AGING_BUCKET_KEYS.find(candidate => candidate === search.get('tramo')) ?? null
	const [text, setText] = useState(q)
	/** La última búsqueda que este cuadro mandó a la URL. */
	const sent = useRef(q)

	const update = (next: { q?: string; sort?: CustomerSort; bucket?: AgingBucketKey | null }) => {
		const params = new URLSearchParams()
		const nextQ = (next.q ?? q).trim()
		const nextSort = next.sort ?? sort
		const nextBucket = next.bucket === undefined ? bucket : next.bucket
		sent.current = nextQ
		if (nextQ !== '') params.set('q', nextQ)
		if (nextSort !== 'vencimiento') params.set('orden', nextSort)
		if (nextBucket !== null) params.set('tramo', nextBucket)
		setSearch(params, { replace: true })
	}

	// La búsqueda va a la URL después de una pausa al escribir (skill ui-ux §4).
	useEffect(() => {
		if (text.trim() === q) return
		const timer = setTimeout(() => update({ q: text }), SEARCH_PAUSE_MS)
		return () => clearTimeout(timer)
	}, [text, q, sort, bucket]) // `update` reads this render's URL
	// «Atrás» cambia la URL sin pasar por el cuadro: el cuadro la sigue.
	useEffect(() => {
		if (q === sent.current) return
		sent.current = q
		setText(q)
	}, [q])

	const query = useQuery({ queryKey: customersQuery(q, sort, bucket), queryFn: () => fetchCustomers(q, sort, bucket), placeholderData: keepPreviousData })
	const clear = () => { setText(''); update({ q: '' }) }
	const from = `${location.pathname}${location.search}`
	const total = query.data?.length ?? 0

	return (
		<>
			<PageHeader title="Clientes" description="Los clientes importados del administrador, con su deuda en Cobrix. Por defecto, primero a quien conviene cobrar antes: el vencimiento más antiguo." />

			<Card className="min-w-0">
				<CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-auto sm:flex-row sm:items-center">
						<div className="relative w-full sm:min-w-72 sm:max-w-sm">
							<SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
							<Input
								type="search"
								value={text}
								onChange={event => setText(event.target.value)}
								placeholder="Buscar por nombre, cédula o RIF"
								aria-label="Buscar por nombre, cédula o RIF"
								className="pl-9"
							/>
						</div>
						{bucket && (
							<Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => update({ bucket: null })} aria-label={`Quitar el filtro: deuda de ${AGING_LABEL[bucket]}`}>
								Tramo: {AGING_LABEL[bucket]}<XIcon aria-hidden />
							</Button>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-3 sm:shrink-0">
						{query.data && total > 0 && (
							<p className="text-sm text-muted-foreground" aria-live="polite">
								{q === '' ? (total === 1 ? '1 cliente' : `${total} clientes`) : (total === 1 ? '1 cliente coincide' : `${total} clientes coinciden`)}
								{bucket && ` con deuda de ${AGING_LABEL[bucket]}`}
								{query.isPlaceholderData && ' · buscando…'}
							</p>
						)}
						{/* Extras RF44, P30: exactamente lo que muestra la tabla, desde la URL. */}
						<Button asChild variant="outline" size="sm">
							<a href={`/api/clientes.csv?${new URLSearchParams({ q, orden: sort, ...(bucket ? { tramo: bucket } : {}) }).toString()}`} download>
								<DownloadIcon aria-hidden />Exportar CSV
							</a>
						</Button>
					</div>
				</CardContent>

				{query.isPending && (
					<CardContent className="grid gap-3" aria-busy="true" aria-label="Cargando los clientes">
						{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
					</CardContent>
				)}
				{query.isError && <CardContent><ErrorState error={query.error} onRetry={() => void query.refetch()} /></CardContent>}
				{query.data && total === 0 && q === '' && bucket === null && (
					<EmptyState
						title="Todavía no hay clientes"
						description="Importa desde el administrador de facturas para traerlos."
						action={<Button asChild variant="outline"><Link to="/sincronizacion">Ir a Sincronización</Link></Button>}
					/>
				)}
				{query.data && total === 0 && q === '' && bucket !== null && (
					<EmptyState
						title="No hay clientes con deuda en este tramo"
						description={`Ningún cliente tiene facturas abiertas con ${AGING_LABEL[bucket]} de atraso.`}
						action={<Button variant="outline" onClick={() => update({ bucket: null })}><XIcon aria-hidden />Quitar el filtro</Button>}
					/>
				)}
				{query.data && total === 0 && q !== '' && (
					<EmptyState
						title={`No hay clientes que coincidan con «${q}»`}
						description="Prueba con otra parte del nombre, o con la cédula o el RIF sin letra."
						action={<Button variant="outline" onClick={clear}><XIcon aria-hidden />Limpiar búsqueda</Button>}
					/>
				)}
				{query.data && total > 0 && (
					<div className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
						<Table>
							<TableHeader>
								<TableRow>
									<SortHead sort="nombre" current={sort} onSort={next => update({ sort: next })}>Nombre</SortHead>
									<TableHead>Documento</TableHead>
									<TableHead>Tipo</TableHead>
									<TableHead className="text-right">Contratos</TableHead>
									<TableHead className="text-right">Abiertas</TableHead>
									<TableHead className="text-right">Pagadas</TableHead>
									<SortHead sort="deuda" current={sort} onSort={next => update({ sort: next })} className="text-right">Deuda</SortHead>
									<SortHead sort="vencimiento" current={sort} onSort={next => update({ sort: next })}>Vencimiento más antiguo</SortHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{query.data.map(customer => <CustomerRow key={customer.key} customer={customer} from={from} />)}
							</TableBody>
						</Table>
					</div>
				)}
			</Card>
		</>
	)
}
