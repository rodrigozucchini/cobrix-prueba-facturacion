/** Tabla (shadcn/ui). En pantallas angostas se desplaza ella, no la página; el encabezado queda fijo (skill ui-ux §4). */

import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils.ts'

export function Table({ className, ...props }: ComponentProps<'table'>) {
	return (
		<div data-slot="table-container" className="relative w-full overflow-x-auto">
			<table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
		</div>
	)
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
	return <thead data-slot="table-header" className={cn('sticky top-0 z-10 bg-muted [&_tr]:border-b', className)} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
	return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
	return <tr data-slot="table-row" className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
	return <th data-slot="table-head" className={cn('h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground', className)} {...props} />
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
	return <td data-slot="table-cell" className={cn('px-3 py-2.5 align-middle', className)} {...props} />
}
