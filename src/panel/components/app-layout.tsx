/** El marco del panel: menú lateral en pantallas anchas y barra con menú desplegable en las angostas (skill ui-ux §0, §8). */

import { useQuery } from '@tanstack/react-query'
import { Building2Icon, LayoutDashboardIcon, MenuIcon, RefreshCwIcon, SettingsIcon, UsersIcon, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'

import { Button } from '@/components/ui/button.tsx'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet.tsx'
import { fetchSettings, SETTINGS_QUERY } from '@/lib/queries.ts'
import { cn } from '@/lib/utils.ts'

interface NavItem {
	readonly to: string
	readonly label: string
	readonly icon: LucideIcon
	readonly end?: boolean
}

const NAV: readonly NavItem[] = [
	{ to: '/', label: 'Resumen', icon: LayoutDashboardIcon, end: true },
	{ to: '/clientes', label: 'Clientes', icon: UsersIcon },
	{ to: '/sincronizacion', label: 'Sincronización', icon: RefreshCwIcon },
	{ to: '/configuracion', label: 'Configuración', icon: SettingsIcon },
]

function Brand() {
	return (
		<div className="flex items-center gap-2.5">
			<span className="grid size-9 place-items-center rounded-lg bg-primary text-base font-bold text-primary-foreground" aria-hidden>C</span>
			<span className="leading-tight">
				<span className="block font-semibold">Cobrix</span>
				<span className="block text-xs text-muted-foreground">Panel de cobranza</span>
			</span>
		</div>
	)
}

function NavLinks({ onNavigate }: { readonly onNavigate?: () => void }) {
	return (
		<nav aria-label="Principal" className="grid gap-1">
			{NAV.map(item => (
				<NavLink
					key={item.to}
					to={item.to}
					end={item.end ?? false}
					onClick={onNavigate}
					className={({ isActive }) => cn(
						'flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors',
						'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
						isActive ? 'bg-accent text-primary' : 'text-foreground',
					)}
				>
					<item.icon className="size-4" aria-hidden />
					{item.label}
				</NavLink>
			))}
		</nav>
	)
}

function Company({ onNavigate }: { readonly onNavigate?: () => void }) {
	const settings = useQuery({ queryKey: SETTINGS_QUERY, queryFn: fetchSettings })
	const name = settings.data?.company.name ?? ''
	if (!settings.data) return null
	return (
		<div className="mt-auto border-t pt-4 text-sm">
			{name === ''
				? <Link to="/configuracion" onClick={onNavigate} className="text-primary hover:underline">Carga los datos de tu empresa</Link>
				: <p className="flex items-center gap-2 text-muted-foreground"><Building2Icon className="size-4 shrink-0" aria-hidden /><span className="min-w-0 truncate" title={name}>{name}</span></p>}
		</div>
	)
}

export function AppLayout() {
	const [menuOpen, setMenuOpen] = useState(false)
	return (
		<div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
			<aside className="hidden border-r bg-card md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:gap-6 md:p-4">
				<Brand />
				<NavLinks />
				<Company />
			</aside>

			<header className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/95 px-4 py-2 backdrop-blur md:hidden">
				<Brand />
				<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
					<SheetTrigger asChild>
						<Button variant="ghost" size="icon" aria-label="Abrir menú">
							<MenuIcon className="size-5" aria-hidden />
						</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetTitle>Menú</SheetTitle>
						<SheetDescription>Pantallas del panel de cobranza</SheetDescription>
						<NavLinks onNavigate={() => setMenuOpen(false)} />
						<Company onNavigate={() => setMenuOpen(false)} />
					</SheetContent>
				</Sheet>
			</header>

			<main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
				<div className="mx-auto max-w-6xl">
					<Outlet />
				</div>
			</main>
		</div>
	)
}
