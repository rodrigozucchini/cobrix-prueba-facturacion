/** Distintivo (shadcn/ui), una variante por tono de estado (skill ui-ux §2). */

import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils.ts'

export const badgeVariants = cva(
	'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5',
	{
		variants: {
			tone: {
				success: 'border-success/30 bg-success-bg text-success-fg',
				info: 'border-info/30 bg-info-bg text-info-fg',
				warning: 'border-warning/40 bg-warning-bg text-warning-fg',
				danger: 'border-danger/30 bg-danger-bg text-danger-fg',
				neutral: 'border-border bg-neutral-bg text-neutral-fg',
			},
		},
		defaultVariants: { tone: 'neutral' },
	},
)

interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
	return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}
