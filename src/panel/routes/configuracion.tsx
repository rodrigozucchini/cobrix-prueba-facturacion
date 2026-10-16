/** Configuración (RF1–RF8): empresa y proveedor, cada bloque se guarda por su cuenta. */

import { useQuery } from '@tanstack/react-query'

import { PageHeader } from '@/components/page-header.tsx'
import { ErrorState } from '@/components/query-states.tsx'
import { CompanyBlock } from '@/components/settings/company-form.tsx'
import { ProviderBlock } from '@/components/settings/provider-form.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { fetchSettings, SETTINGS_QUERY } from '@/lib/queries.ts'

function SettingsSkeleton() {
	return (
		<div className="grid gap-5" aria-busy="true" aria-label="Cargando la configuración">
			{[3, 8].map(fields => (
				<div key={fields} className="rounded-lg border bg-card p-5">
					<Skeleton className="mb-5 h-5 w-40" />
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: fields }, (_, i) => (
							<div key={i} className="grid gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
						))}
					</div>
				</div>
			))}
		</div>
	)
}

export function ConfiguracionScreen() {
	const query = useQuery({ queryKey: SETTINGS_QUERY, queryFn: fetchSettings })
	return (
		<>
			<PageHeader title="Configuración" description="Datos de tu empresa y del administrador de facturas del ISP, con las reglas de importación." />
			{query.isPending && <SettingsSkeleton />}
			{query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
			{query.data && (
				<div className="grid gap-5">
					<CompanyBlock settings={query.data} />
					<ProviderBlock settings={query.data} />
				</div>
			)}
		</>
	)
}
