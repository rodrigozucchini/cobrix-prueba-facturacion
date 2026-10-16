/**
 * Iniciar corridas (RF21, RF32, RF35, RF37, P22): las reales piden confirmación, las simulaciones
 * no; al terminar, un aviso con «Ver corrida» y se refresca lo que cambió.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DownloadCloudIcon, RefreshCwIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import type { RunKind, RunListItem, StartRunInput } from '../../shared/api-types.ts'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { api, ApiRequestError } from '@/lib/api.ts'
import { CUSTOMERS_QUERY, RUN_KIND_LABEL, RUNS_QUERY, SUMMARY_QUERY } from '@/lib/queries.ts'

export function useStartRun() {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	return useMutation({
		mutationFn: (input: StartRunInput) => api.post<RunListItem>('/api/corridas', input),
		onSuccess: run => {
			queryClient.setQueryData<RunListItem[]>(RUNS_QUERY, current => [run, ...(current ?? []).filter(item => item.id !== run.id)])
			void queryClient.invalidateQueries({ queryKey: SUMMARY_QUERY })
			toast.info(`${RUN_KIND_LABEL[run.kind]}${run.simulation ? ' simulada' : ''} en curso…`)
		},
		onError: error => {
			const notConfigured = error instanceof ApiRequestError && error.code === 'provider_not_configured'
			toast.error(error instanceof Error ? error.message : 'No se pudo iniciar la corrida.', notConfigured
				? { action: { label: 'Ir a Configuración', onClick: () => void navigate('/configuracion') } }
				: undefined)
		},
	})
}

const CONFIRM: Readonly<Record<RunKind, { title: string; description: string; action: string }>> = {
	import: {
		title: '¿Importar ahora?',
		description: 'Se van a crear facturas y clientes en Cobrix con las cuotas que cumplan las reglas de Configuración. Si quieres ver antes qué pasaría, usa «Simular importación».',
		action: 'Importar',
	},
	paid: {
		title: '¿Actualizar las pagadas ahora?',
		description: 'Se van a marcar como pagadas las facturas que el ISP ya cobró por completo, según su libro de cuotas. Si quieres ver antes qué pasaría, usa «Simular actualización».',
		action: 'Actualizar pagadas',
	},
}

/** El botón de la corrida real, con su confirmación (RF35). */
export function RunConfirmButton({ kind, disabled, onConfirm }: { readonly kind: RunKind; readonly disabled: boolean; readonly onConfirm: () => void }) {
	const text = CONFIRM[kind]
	const Icon = kind === 'import' ? DownloadCloudIcon : RefreshCwIcon
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button disabled={disabled}><Icon aria-hidden />{text.action}</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{text.title}</AlertDialogTitle>
					<AlertDialogDescription>{text.description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>{text.action}</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

/** Avisa cuando termina una corrida en curso (RF37) y refresca lo que cambió. */
export function useFinishedRunToasts(runs: readonly RunListItem[] | undefined) {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const watched = useRef(new Set<number>())
	useEffect(() => {
		if (!runs) return
		for (const run of runs) {
			if (run.status === 'running') {
				watched.current.add(run.id)
			} else if (watched.current.has(run.id)) {
				watched.current.delete(run.id)
				for (const queryKey of [SUMMARY_QUERY, CUSTOMERS_QUERY, RUNS_QUERY]) void queryClient.invalidateQueries({ queryKey })
				const title = `${RUN_KIND_LABEL[run.kind]}${run.simulation ? ' simulada' : ''} ${run.status === 'completed' ? 'completada' : 'fallida'}`
				const show = run.status === 'completed' ? toast.success : toast.error
				show(title, {
					description: run.summary ?? undefined,
					action: { label: 'Ver corrida', onClick: () => void navigate(`/sincronizacion/corridas/${run.id}`) },
					duration: 10_000,
				})
			}
		}
	}, [runs, navigate, queryClient])
}
