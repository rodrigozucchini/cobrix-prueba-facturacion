# Panel: React + Vite

## Librerías

Estas, y ninguna otra sin proponerla antes:

| Para qué | Librería |
| --- | --- |
| Interfaz | React |
| Compilar y servidor de desarrollo | Vite |
| Pantallas y URLs | React Router |
| Pedir datos a la API | TanStack Query |
| Estilos | Tailwind CSS |
| Componentes | shadcn/ui: se agregan solo los que se usan |

## Estructura de `src/panel/`

```
src/panel/
  main.tsx            ← arranque: router y QueryClient
  routes/             ← una pantalla por archivo: Resumen, Clientes, Expediente, Sincronizacion, Corrida, Configuracion
  components/         ← componentes propios reutilizables
  components/ui/      ← componentes de shadcn/ui (generados, no se editan salvo para ajustar estilo)
  lib/api.ts          ← único lugar que llama a /api con fetch; tipado con los tipos de src/shared/
  lib/format.ts       ← formato de dinero, fechas y estados
```

## Cómo crece

- React es el único panel desde el primer día.
- Nunca hay dos paneles funcionando a la vez.

## Reglas

- **El panel no tiene reglas de negocio.** Muestra lo que devuelve la API. Si una pantalla necesita un dato calculado, por ejemplo la deuda o el vencimiento más antiguo, lo calcula el backend.
- **Datos con TanStack Query:** `useQuery` para leer y `useMutation` para las acciones. Después de una acción se invalidan las consultas afectadas. No se guardan datos de la API en `useState`.
- **Cada pantalla contempla sus cuatro estados:** cargando, error, vacío y con datos. Cómo se ve cada uno, junto con colores, formato, confirmaciones y textos, está en el skill `ui-ux`.
- **Alias `@/`** apuntando a `src/panel/`, como espera shadcn/ui.
- **`lib/format.ts` y `lib/status.ts` no usan nada del navegador** (ni `window`, ni `document`, ni JSX) ni el alias `@/`, e importan con extensión `.ts`. Así se prueban con `node:test` igual que el backend.
