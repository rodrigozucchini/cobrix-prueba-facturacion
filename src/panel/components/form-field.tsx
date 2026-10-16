/** Un campo: etiqueta arriba, ayuda corta y el error en rojo debajo (skill ui-ux §6). */

import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label.tsx'
import { cn } from '@/lib/utils.ts'

interface FormFieldProps {
	readonly id: string
	readonly label: string
	readonly help?: string
	readonly error?: string | undefined
	readonly className?: string
	readonly children: ReactNode
}

export function FormField({ id, label, help, error, className, children }: FormFieldProps) {
	return (
		<div className={cn('grid content-start gap-1.5', className)}>
			<Label htmlFor={id}>{label}</Label>
			{help && <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p>}
			{children}
			{error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger-fg">{error}</p>}
		</div>
	)
}

/** Un grupo de casillas con su leyenda, para listas como estados o tipos de documento. */
export function FieldSet({ legend, help, error, children }: { readonly legend: string; readonly help?: string; readonly error?: string | undefined; readonly children: ReactNode }) {
	return (
		<fieldset className="grid gap-2 rounded-md border px-3 pt-1 pb-3">
			<legend className="px-1 text-sm font-medium">{legend}</legend>
			{help && <p className="text-xs text-muted-foreground">{help}</p>}
			<div className="flex flex-wrap gap-x-5 gap-y-2">{children}</div>
			{error && <p role="alert" className="text-xs font-medium text-danger-fg">{error}</p>}
		</fieldset>
	)
}
