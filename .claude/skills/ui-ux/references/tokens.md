# Tokens del panel

Variables CSS de `src/panel/styles.css`. Los nombres base son los que espera shadcn/ui; los de estado son propios. Cada tono de estado tiene tres variables: el color, un fondo suave para el distintivo y el texto sobre ese fondo.

```css
:root {
	/* Base (shadcn/ui) */
	--background: oklch(0.985 0.002 260);
	--foreground: oklch(0.21 0.02 265);
	--card: oklch(1 0 0);
	--card-foreground: var(--foreground);
	--popover: oklch(1 0 0);
	--popover-foreground: var(--foreground);
	--primary: oklch(0.5 0.2 268);            /* acento: índigo */
	--primary-foreground: oklch(0.985 0 0);
	--secondary: oklch(0.96 0.006 265);
	--secondary-foreground: var(--foreground);
	--muted: oklch(0.96 0.006 265);
	--muted-foreground: oklch(0.52 0.02 265);
	--accent: oklch(0.95 0.02 268);
	--accent-foreground: var(--foreground);
	--destructive: oklch(0.56 0.21 25);
	--border: oklch(0.91 0.008 265);
	--input: var(--border);
	--ring: var(--primary);
	--radius: 0.625rem;

	/* Estados */
	--success: oklch(0.6 0.14 155);
	--success-bg: oklch(0.96 0.04 155);
	--success-fg: oklch(0.38 0.1 155);

	--info: oklch(0.58 0.14 245);
	--info-bg: oklch(0.96 0.03 245);
	--info-fg: oklch(0.4 0.12 245);

	--warning: oklch(0.75 0.15 75);
	--warning-bg: oklch(0.97 0.05 85);
	--warning-fg: oklch(0.45 0.11 60);

	--danger: var(--destructive);
	--danger-bg: oklch(0.96 0.03 25);
	--danger-fg: oklch(0.45 0.17 25);

	--neutral: oklch(0.6 0.01 265);
	--neutral-bg: var(--muted);
	--neutral-fg: var(--muted-foreground);

	/* Esqueleto de carga */
	--skeleton: oklch(0.93 0.006 265);
	--skeleton-shine: oklch(0.97 0.004 265);

	/* Tipografía y sombras */
	--font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	--font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
	--shadow-card: 0 1px 2px oklch(0 0 0 / 0.05);
}
```

Al conectarlas con Tailwind, cada variable se expone con el mismo nombre (`--color-success: var(--success)`, etc.), así las clases son `bg-success-bg`, `text-success-fg`, `bg-skeleton`…

Antes de cambiar un valor, comprobar que el texto de cada distintivo (`*-fg` sobre `*-bg`) sigue cumpliendo contraste AA.
