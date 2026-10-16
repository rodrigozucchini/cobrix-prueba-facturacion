/** Avisos (shadcn/ui sobre sonner): el resultado de una acción en una línea, con los colores del panel. */

import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
	return (
		<Sonner
			theme="light"
			position="top-right"
			closeButton
			style={
				{
					'--normal-bg': 'var(--popover)',
					'--normal-text': 'var(--popover-foreground)',
					'--normal-border': 'var(--border)',
					'--success-bg': 'var(--success-bg)',
					'--success-text': 'var(--success-fg)',
					'--success-border': 'var(--success)',
					'--error-bg': 'var(--danger-bg)',
					'--error-text': 'var(--danger-fg)',
					'--error-border': 'var(--danger)',
				} as CSSProperties
			}
			{...props}
		/>
	)
}
