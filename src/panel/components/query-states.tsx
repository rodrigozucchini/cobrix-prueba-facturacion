/** Los estados sin datos (RF36, skill ui-ux §5): error con «Reintentar» y vacío que dice qué hacer. */

import { AlertCircleIcon, InboxIcon, RotateCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button.tsx'

export function ErrorState({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
	const message = error instanceof Error ? error.message : 'Algo falló al cargar los datos.'
	return (
		<div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger-bg p-4 text-danger-fg sm:flex-row sm:items-center">
			<AlertCircleIcon className="size-5 shrink-0" aria-hidden />
			<p className="flex-1 text-sm">{message}</p>
			<Button variant="outline" size="sm" onClick={onRetry}>
				<RotateCwIcon aria-hidden />
				Reintentar
			</Button>
		</div>
	)
}

export function EmptyState({ title, description, action }: { readonly title: string; readonly description: string; readonly action?: ReactNode }) {
	return (
		<div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
			<InboxIcon className="size-8 text-muted-foreground" aria-hidden />
			<div>
				<p className="font-medium">{title}</p>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			</div>
			{action}
		</div>
	)
}
