/** La pantalla de una dirección que no existe. */

import { Link } from 'react-router'

import { PageHeader } from '@/components/page-header.tsx'
import { Button } from '@/components/ui/button.tsx'

export function NotFoundScreen() {
	return (
		<>
			<PageHeader title="No encontramos esa pantalla" description="La dirección no existe o cambió." />
			<Button asChild variant="outline">
				<Link to="/">Volver al resumen</Link>
			</Button>
		</>
	)
}
