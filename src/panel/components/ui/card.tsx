/** Tarjeta (shadcn/ui): el contenedor de cada bloque. */

import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils.ts'

export function Card({ className, ...props }: ComponentProps<'section'>) {
	return <section data-slot="card" className={cn('rounded-lg border bg-card text-card-foreground shadow-card', className)} {...props} />
}

export function CardHeader({ className, ...props }: ComponentProps<'header'>) {
	return <header data-slot="card-header" className={cn('flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
	return <h2 data-slot="card-title" className={cn('text-base font-semibold', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
	return <div data-slot="card-content" className={cn('px-4 py-4 sm:px-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'footer'>) {
	return <footer data-slot="card-footer" className={cn('flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:px-5', className)} {...props} />
}
