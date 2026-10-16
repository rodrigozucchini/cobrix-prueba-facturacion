/**
 * Builds the React panel (src/panel) into dist/panel, which the Cobrix server serves on :4300.
 * In development (`npm run dev`) Vite serves the panel itself and proxies /api to the backend
 * started with `npm run dev:api`.
 */

import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const panelDir = fileURLToPath(new URL('./src/panel', import.meta.url))

/**
 * P39: the libraries go in their own files instead of one bundle of 600 kB. They change less than
 * the panel, so the browser keeps them cached between versions.
 */
const VENDOR_CHUNKS: ReadonlyArray<readonly [string, RegExp]> = [
	['react', /node_modules\/(react|react-dom|scheduler)\//],
	['router-query', /node_modules\/(react-router|@tanstack)\//],
	['ui', /node_modules\/(radix-ui|@radix-ui|lucide-react|sonner|class-variance-authority|clsx|tailwind-merge)\//],
]

export default defineConfig({
	root: panelDir,
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: { '@': panelDir },
	},
	build: {
		outDir: fileURLToPath(new URL('./dist/panel', import.meta.url)),
		emptyOutDir: true,
		rollupOptions: {
			output: {
				manualChunks: id => VENDOR_CHUNKS.find(([, pattern]) => pattern.test(id))?.[0],
			},
		},
	},
	server: {
		host: '127.0.0.1',
		proxy: {
			// changeOrigin off: Cobrix sees the panel's own host, so its CSRF check (D54) lets it write.
			'/api': { target: `http://127.0.0.1:${process.env.PORT ?? 4300}`, changeOrigin: false },
		},
	},
})
