/** Etiqueta (shadcn/ui), siempre unida a su campo. */

import { Label as LabelPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils.ts'

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
	return <LabelPrimitive.Root data-slot="label" className={cn('text-sm font-medium leading-none select-none', className)} {...props} />
}
