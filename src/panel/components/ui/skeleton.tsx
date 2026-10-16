/** Esqueleto de carga con la forma del contenido (skill ui-ux §3). Sin brillo con prefers-reduced-motion. */

import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils.ts'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			data-slot="skeleton"
			aria-hidden
			className={cn(
				'rounded-md bg-skeleton bg-[linear-gradient(90deg,var(--skeleton)_0%,var(--skeleton-shine)_50%,var(--skeleton)_100%)] bg-[length:200%_100%] animate-[skeleton-shine_1.6s_ease-in-out_infinite]',
				className,
			)}
			{...props}
		/>
	)
}
