/**
 * Configuración, «Administrador de facturas» (RF2–RF8): conexión (la contraseña nunca se muestra),
 * reglas de importación y corrida automática. «Probar conexión» usa lo del formulario (D24).
 */

import { useMutation } from '@tanstack/react-query'
import { CheckCircle2Icon, FlaskConicalIcon, Loader2Icon, PlugIcon, PlugZapIcon, SaveIcon, XCircleIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import {
	CONTRACT_STATUSES,
	DOC_TYPES,
	IMPORT_WINDOWS,
	type ConnectionTestResult,
	type ContractStatus,
	type DocType,
	type ProviderInput,
	type Settings,
} from '../../../shared/api-types.ts'
import { validateProvider, type FieldErrors } from '../../../cobrix/settings/validate.ts'
import { FieldSet, FormField } from '@/components/form-field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx'
import { api, ApiRequestError } from '@/lib/api.ts'
import { amount } from '@/lib/format.ts'
import { CONTRACT_STATUS } from '@/lib/status.ts'
import { blockErrors, lastSaved, useSaveSettings, type BlockProps } from './save-settings.ts'

interface ProviderForm {
	readonly name: string
	readonly apiUrl: string
	readonly apiUser: string
	readonly apiPassword: string
	readonly importStates: readonly ContractStatus[]
	readonly windowMonths: string
	readonly maxRecent: string
	readonly graceDays: string
	readonly capInvoices: string
	readonly capAmount: string
	readonly excludedDocTypes: readonly DocType[]
	readonly autoEnabled: boolean
	readonly autoHour: string
}

const providerForm = ({ provider }: Settings): ProviderForm => ({
	name: provider.name,
	apiUrl: provider.apiUrl,
	apiUser: provider.apiUser,
	apiPassword: '',
	importStates: provider.importStates,
	windowMonths: provider.windowMonths === null ? 'none' : String(provider.windowMonths),
	maxRecent: provider.maxRecent === null ? '' : String(provider.maxRecent),
	graceDays: String(provider.graceDays),
	capInvoices: String(provider.capInvoices),
	capAmount: amount(provider.capAmountCents),
	excludedDocTypes: provider.excludedDocTypes,
	autoEnabled: provider.autoEnabled,
	autoHour: provider.autoHour === null ? '' : String(provider.autoHour),
})

/** `50.000,00`, `50000,5` o `50000.50` → centavos; lo demás → NaN. */
function parseAmountToCents(text: string): number {
	const trimmed = text.trim()
	const normalized = trimmed.includes(',') ? trimmed.replaceAll('.', '').replace(',', '.') : trimmed
	if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN
	return Math.round(Number(normalized) * 100)
}

const toNumber = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text.trim().replace(',', '.')))

/** Formulario → datos de la API. Los números mal quedan NaN (van como null) y la validación los marca. */
function providerInput(form: ProviderForm): ProviderInput {
	return {
		name: form.name,
		apiUrl: form.apiUrl,
		apiUser: form.apiUser,
		apiPassword: form.apiPassword,
		importStates: form.importStates,
		windowMonths: form.windowMonths === 'none' ? null : (IMPORT_WINDOWS.find(m => String(m) === form.windowMonths) ?? null),
		maxRecent: form.maxRecent.trim() === '' ? null : toNumber(form.maxRecent),
		graceDays: toNumber(form.graceDays),
		capInvoices: toNumber(form.capInvoices),
		capAmountCents: parseAmountToCents(form.capAmount),
		excludedDocTypes: form.excludedDocTypes,
		autoEnabled: form.autoEnabled,
		autoHour: form.autoHour === '' ? null : toNumber(form.autoHour),
	}
}

function toggle<T>(list: readonly T[], item: T, on: boolean): T[] {
	return on ? [...list.filter(x => x !== item), item] : list.filter(x => x !== item)
}

/** RF4: el resultado de «Probar conexión», bajo el encabezado del bloque. */
function ConnectionResult({ result }: { readonly result: ConnectionTestResult }) {
	if (result.ok) {
		const unreadable = result.unreadable > 0 ? ` (${result.unreadable} ilegible${result.unreadable === 1 ? '' : 's'} en la lista)` : ''
		return (
			<div className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-success/30 bg-success-bg px-3 py-2 text-sm text-success-fg sm:mx-5">
				<CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
				<p><strong>Conexión correcta:</strong> el administrador tiene {result.contracts} contratos{unreadable}.</p>
			</div>
		)
	}
	return (
		<div role="alert" className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger-fg sm:mx-5">
			<XCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
			<p><strong>No se pudo conectar.</strong> {result.message}</p>
		</div>
	)
}

/** D58: las credenciales públicas del sandbox de la prueba (docs/API.md). Solo completan el formulario. */
const SANDBOX = { apiUrl: 'http://127.0.0.1:4310', apiUser: 'cobrix', apiPassword: 'cobrix-sandbox' } as const

export function ProviderBlock({ settings }: BlockProps) {
	const [initial, setInitial] = useState(() => providerForm(settings))
	const [form, setForm] = useState(initial)
	const [errors, setErrors] = useState<FieldErrors>({})
	const dirty = JSON.stringify(form) !== JSON.stringify(initial)
	const hasPassword = settings.provider.hasPassword

	const save = useSaveSettings(
		fields => setErrors(blockErrors(fields, 'provider')),
		'Datos del proveedor guardados.',
		saved => {
			const next = providerForm(saved)
			setInitial(next)
			setForm(next)
			setErrors({})
		},
	)

	const validate = (current: ProviderForm) => {
		const result = validateProvider(providerInput(current), hasPassword)
		return result.ok ? {} : blockErrors(result.error, 'provider')
	}
	/** Al salir de un campo, muestra (o borra) solo su mensaje. */
	const check = (key: string) => {
		const all = validate(form)
		setErrors(current => ({ ...current, [key]: all[key] ?? '' }))
	}
	const [connection, setConnection] = useState<ConnectionTestResult | undefined>(undefined)
	const set = <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) => {
		setForm(current => ({ ...current, [key]: value }))
		// Un resultado de otras credenciales confundiría: se borra si cambian.
		if (key === 'apiUrl' || key === 'apiUser' || key === 'apiPassword') setConnection(undefined)
	}

	const test = useMutation({
		mutationFn: () => api.post<ConnectionTestResult>('/api/configuracion/probar-conexion', { apiUrl: form.apiUrl, apiUser: form.apiUser, apiPassword: form.apiPassword }),
		onMutate: () => setConnection(undefined),
		onSuccess: result => {
			setConnection(result)
			if (result.ok) toast.success(`Conexión correcta: ${result.contracts} contratos.`)
			else toast.error('No se pudo conectar con el administrador.')
		},
		onError: error => {
			if (error instanceof ApiRequestError) setErrors(current => ({ ...current, ...blockErrors(error.fields, 'provider') }))
			toast.error(error instanceof Error ? error.message : 'No se pudo probar la conexión.')
		},
	})

	const submit = (event: FormEvent) => {
		event.preventDefault()
		const result = validateProvider(providerInput(form), hasPassword)
		if (!result.ok) {
			setErrors(blockErrors(result.error, 'provider'))
			toast.error('Hay campos con errores. Corrígelos y vuelve a guardar.')
			return
		}
		save.mutate({ provider: result.value })
	}

	const error = (key: string) => errors[key] || undefined
	const textField = (key: 'name' | 'apiUrl' | 'apiUser' | 'maxRecent' | 'graceDays' | 'capInvoices' | 'capAmount', label: string, options: { help?: string; placeholder?: string; inputMode?: 'numeric' | 'decimal'; errorKey?: string } = {}) => {
		const errorKey = options.errorKey ?? key
		return (
			<FormField id={`provider-${key}`} label={label} help={options.help} error={error(errorKey)}>
				<Input
					id={`provider-${key}`}
					value={form[key]}
					placeholder={options.placeholder}
					inputMode={options.inputMode}
					aria-invalid={Boolean(errors[errorKey])}
					aria-describedby={errors[errorKey] ? `provider-${key}-error` : undefined}
					onChange={event => set(key, event.target.value)}
					onBlur={() => check(errorKey)}
				/>
			</FormField>
		)
	}

	return (
		<Card>
			<form onSubmit={submit} noValidate>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><PlugIcon className="size-4" aria-hidden />Administrador de facturas</CardTitle>
					<div className="flex flex-wrap gap-2">
						{!hasPassword && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => {
									setForm(current => ({ ...current, ...SANDBOX }))
									setErrors(current => ({ ...current, apiUrl: '', apiUser: '', apiPassword: '' }))
									setConnection(undefined)
									toast.info('Datos del sandbox cargados. Prueba la conexión y guarda el proveedor.')
								}}
							>
								<FlaskConicalIcon aria-hidden />Usar el sandbox de la prueba
							</Button>
						)}
						<Button type="button" variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutate()}>
							{test.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <PlugZapIcon aria-hidden />}
							{test.isPending ? 'Probando…' : 'Probar conexión'}
						</Button>
					</div>
				</CardHeader>
				<div aria-live="polite">{connection && <ConnectionResult result={connection} />}</div>
				<CardContent className="grid gap-5">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{textField('name', 'Nombre visible', { placeholder: 'Ej.: Administrador de facturas' })}
						{textField('apiUrl', 'URL de la API', { help: 'Con o sin /api/v1. La de prueba es http://127.0.0.1:4310', placeholder: 'Ej.: http://127.0.0.1:4310' })}
						{textField('apiUser', 'Usuario', { placeholder: 'Ej.: cobrix' })}
						<FormField
							id="provider-apiPassword"
							label="Contraseña"
							help={hasPassword ? 'Déjala vacía para conservar la actual' : 'Obligatoria la primera vez'}
							error={error('apiPassword')}
						>
							<Input
								id="provider-apiPassword"
								type="password"
								autoComplete="new-password"
								value={form.apiPassword}
								aria-invalid={Boolean(errors.apiPassword)}
								onChange={event => set('apiPassword', event.target.value)}
								onBlur={() => check('apiPassword')}
							/>
						</FormField>
					</div>

					<FieldSet legend="Estados de contrato que se importan" error={error('importStates')}>
						{CONTRACT_STATUSES.map(state => (
							<label key={state} className="flex min-h-10 items-center gap-2 text-sm">
								<Checkbox
									checked={form.importStates.includes(state)}
									onCheckedChange={checked => {
										const next = toggle(form.importStates, state, checked === true)
										setForm(current => ({ ...current, importStates: next }))
										setErrors(current => ({ ...current, importStates: next.length === 0 ? 'Elige al menos un estado de contrato para importar.' : '' }))
									}}
								/>
								{CONTRACT_STATUS[state].label}
							</label>
						))}
					</FieldSet>

					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<FormField id="provider-windowMonths" label="Ventana de importación" help="Solo cuotas desde el mes actual menos N meses" error={error('windowMonths')}>
							<Select value={form.windowMonths} onValueChange={value => set('windowMonths', value)}>
								<SelectTrigger id="provider-windowMonths"><SelectValue /></SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Sin ventana</SelectItem>
									{IMPORT_WINDOWS.map(months => <SelectItem key={months} value={String(months)}>{months} meses</SelectItem>)}
								</SelectContent>
							</Select>
						</FormField>
						{textField('maxRecent', 'Máximo de cuotas recientes por contrato', { help: 'De 1 a 60. Vacío = todas', inputMode: 'numeric' })}
						{textField('graceDays', 'Días de gracia para el corte', { help: 'Corte = vencimiento + días (0 a 60)', inputMode: 'numeric' })}
						{textField('capInvoices', 'Tope de facturas nuevas por corrida', { help: 'Número entero, 1 o más', inputMode: 'numeric' })}
						{textField('capAmount', 'Tope de monto nuevo por corrida (USD)', { help: 'Mayor que 0, hasta 2 decimales', inputMode: 'decimal', errorKey: 'capAmountCents' })}
					</div>

					<FieldSet legend="Excluir por tipo de documento del titular" help="Una cédula sin letra nunca se excluye por tipo">
						{DOC_TYPES.map(type => (
							<label key={type} className="flex min-h-10 items-center gap-2 text-sm">
								<Checkbox
									checked={form.excludedDocTypes.includes(type)}
									onCheckedChange={checked => set('excludedDocTypes', toggle(form.excludedDocTypes, type, checked === true))}
								/>
								{type}
							</label>
						))}
					</FieldSet>

					<FieldSet legend="Corrida automática" error={error('autoHour')}>
						<label className="flex min-h-10 items-center gap-2 text-sm">
							<Checkbox
								checked={form.autoEnabled}
								onCheckedChange={checked => setForm(current => ({ ...current, autoEnabled: checked === true }))}
							/>
							Importar y actualizar pagadas una vez al día
						</label>
						<div className="flex items-center gap-2 text-sm">
							<span id="provider-autoHour-label">a las</span>
							<Select value={form.autoHour} onValueChange={value => set('autoHour', value)}>
								<SelectTrigger className="w-28" aria-labelledby="provider-autoHour-label"><SelectValue placeholder="—" /></SelectTrigger>
								<SelectContent>
									{Array.from({ length: 24 }, (_, hour) => (
										<SelectItem key={hour} value={String(hour)}>{String(hour).padStart(2, '0')}:00</SelectItem>
									))}
								</SelectContent>
							</Select>
							<span className="text-muted-foreground">(hora de Caracas)</span>
						</div>
					</FieldSet>
				</CardContent>
				<CardFooter>
					<Button type="submit" disabled={save.isPending || !dirty}>
						<SaveIcon aria-hidden />
						{save.isPending ? 'Guardando…' : 'Guardar proveedor'}
					</Button>
					<span className="text-xs text-muted-foreground">{lastSaved(settings.providerUpdatedAt)}</span>
				</CardFooter>
			</form>
		</Card>
	)
}
