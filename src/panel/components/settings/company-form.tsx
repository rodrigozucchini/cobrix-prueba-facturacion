/** Configuración, «Empresa» (RF1, D36): nombre, RIF y correo, validados con las reglas del backend. */

import { Building2Icon, SaveIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { Settings } from '../../../shared/api-types.ts'
import { validateCompany, type FieldErrors } from '../../../cobrix/settings/validate.ts'
import { FormField } from '@/components/form-field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { blockErrors, lastSaved, useSaveSettings, type BlockProps } from './save-settings.ts'

interface CompanyForm {
	readonly name: string
	readonly rif: string
	readonly email: string
}

const companyForm = (settings: Settings): CompanyForm => ({ ...settings.company })

export function CompanyBlock({ settings }: BlockProps) {
	const [initial, setInitial] = useState(() => companyForm(settings))
	const [form, setForm] = useState(initial)
	const [errors, setErrors] = useState<FieldErrors>({})
	const dirty = JSON.stringify(form) !== JSON.stringify(initial)

	const save = useSaveSettings(
		fields => setErrors(blockErrors(fields, 'company')),
		'Datos de la empresa guardados.',
		saved => {
			const next = companyForm(saved)
			setInitial(next)
			setForm(next)
			setErrors({})
		},
	)

	const check = (field: keyof CompanyForm) => {
		const result = validateCompany(form)
		const all = result.ok ? {} : blockErrors(result.error, 'company')
		setErrors(current => ({ ...current, [field]: all[field] ?? '' }))
	}
	const set = (field: keyof CompanyForm, value: string) => setForm(current => ({ ...current, [field]: value }))

	const submit = (event: FormEvent) => {
		event.preventDefault()
		const result = validateCompany(form)
		if (!result.ok) {
			setErrors(blockErrors(result.error, 'company'))
			return
		}
		save.mutate({ company: result.value })
	}

	const field = (key: keyof CompanyForm, label: string, help: string | undefined, placeholder: string, type = 'text') => (
		<FormField id={`company-${key}`} label={label} help={help} error={errors[key] || undefined}>
			<Input
				id={`company-${key}`}
				type={type}
				value={form[key]}
				placeholder={placeholder}
				aria-invalid={Boolean(errors[key])}
				aria-describedby={errors[key] ? `company-${key}-error` : undefined}
				onChange={event => set(key, event.target.value)}
				onBlur={() => check(key)}
			/>
		</FormField>
	)

	return (
		<Card>
			<form onSubmit={submit} noValidate>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><Building2Icon className="size-4" aria-hidden />Empresa</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{field('name', 'Nombre', undefined, 'Ej.: ISP de Prueba')}
					{field('rif', 'RIF', 'Letra y 9 dígitos, con o sin guiones', 'Ej.: J-12345678-9')}
					{field('email', 'Correo de cobranza', undefined, 'Ej.: cobranza@empresa.com', 'email')}
					<FormField id="company-zone" label="Zona horaria y moneda" help="Fijas en esta versión">
						<Input id="company-zone" value="America/Caracas · USD" readOnly disabled />
					</FormField>
				</CardContent>
				<CardFooter>
					<Button type="submit" disabled={save.isPending || !dirty}>
						<SaveIcon aria-hidden />
						{save.isPending ? 'Guardando…' : 'Guardar empresa'}
					</Button>
					<span className="text-xs text-muted-foreground">{lastSaved(settings.companyUpdatedAt)}</span>
				</CardFooter>
			</form>
		</Card>
	)
}
