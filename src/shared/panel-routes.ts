/**
 * Las pantallas del panel: el servidor responde 200 en estas y 404 en lo demás (con la página que
 * dice «No encontramos esa pantalla»). Tiene que coincidir con las rutas de src/panel/main.tsx.
 */

export const PANEL_ROUTES: readonly RegExp[] = [
	/^\/$/,
	/^\/clientes$/,
	/^\/clientes\/[^/]+$/,
	/^\/clientes\/[^/]+\/estado-de-cuenta$/,
	/^\/sincronizacion$/,
	/^\/sincronizacion\/corridas\/[^/]+$/,
	/^\/configuracion$/,
]

export function isPanelRoute(pathname: string): boolean {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
	return PANEL_ROUTES.some(pattern => pattern.test(path))
}
