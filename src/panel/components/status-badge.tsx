/** Dibuja un estado con color, ícono y texto, desde el mapa único de lib/status.ts (RF38). */

import {
	AlertTriangleIcon,
	BanIcon,
	CheckIcon,
	ClockIcon,
	EyeIcon,
	FlaskConicalIcon,
	Loader2Icon,
	MinusIcon,
	XIcon,
	type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge.tsx'
import type { StatusIcon, StatusInfo } from '@/lib/status.ts'

const ICONS: Readonly<Record<StatusIcon, LucideIcon>> = {
	check: CheckIcon,
	clock: ClockIcon,
	alert: AlertTriangleIcon,
	cross: XIcon,
	minus: MinusIcon,
	loader: Loader2Icon,
	flask: FlaskConicalIcon,
	eye: EyeIcon,
	ban: BanIcon,
}

interface StatusBadgeProps {
	readonly status: StatusInfo
	readonly className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
	const Icon = ICONS[status.icon]
	return (
		<Badge tone={status.tone} className={className}>
			<Icon aria-hidden className={status.icon === 'loader' ? 'animate-spin' : undefined} />
			{status.label}
		</Badge>
	)
}
