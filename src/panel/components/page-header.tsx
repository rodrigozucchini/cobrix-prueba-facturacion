/** Encabezado: título, para qué sirve la pantalla y la acción principal (skill ui-ux §4). El título también nombra la pestaña. */

import { useEffect, type ReactNode } from 'react'

interface PageHeaderProps {
	readonly title: ReactNode
	readonly description?: ReactNode
	readonly actions?: ReactNode
	readonly back?: ReactNode
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
	useEffect(() => {
		if (typeof title === 'string') document.title = `${title} · Cobrix`
	}, [title])
	return (
		<header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="min-w-0">
				{back && <div className="mb-1 text-sm">{back}</div>}
				<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
				{description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
			</div>
			{actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
		</header>
	)
}
