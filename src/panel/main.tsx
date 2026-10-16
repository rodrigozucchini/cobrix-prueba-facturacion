/** Entrada del panel: caché de datos (TanStack Query), rutas (React Router), avisos y marco. Las pantallas están en routes/. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { AppLayout } from '@/components/app-layout.tsx'
import { Toaster } from '@/components/ui/sonner.tsx'
import { ConfiguracionScreen } from '@/routes/configuracion.tsx'
import { ClientesScreen } from '@/routes/clientes.tsx'
import { CorridaScreen } from '@/routes/corrida.tsx'
import { EstadoCuentaScreen } from '@/routes/estado-cuenta.tsx'
import { ExpedienteScreen } from '@/routes/expediente.tsx'
import { ResumenScreen } from '@/routes/resumen.tsx'
import { SincronizacionScreen } from '@/routes/sincronizacion.tsx'
import { NotFoundScreen } from '@/routes/not-found.tsx'

import './styles.css'

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: 1, refetchOnWindowFocus: false },
	},
})

const router = createBrowserRouter([
	// Extras P34: el estado de cuenta es una hoja para imprimir, fuera del marco del panel.
	{ path: 'clientes/:id/estado-de-cuenta', element: <EstadoCuentaScreen /> },
	{
		element: <AppLayout />,
		children: [
			{ index: true, element: <ResumenScreen /> },
			{ path: 'clientes', element: <ClientesScreen /> },
			{ path: 'clientes/:id', element: <ExpedienteScreen /> },
			{ path: 'sincronizacion', element: <SincronizacionScreen /> },
			{ path: 'sincronizacion/corridas/:id', element: <CorridaScreen /> },
			{ path: 'configuracion', element: <ConfiguracionScreen /> },
			{ path: '*', element: <NotFoundScreen /> },
		],
	},
])

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el elemento #root')

createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
			<Toaster />
		</QueryClientProvider>
	</StrictMode>,
)
