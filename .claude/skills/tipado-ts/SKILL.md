---
name: tipado-ts
description: Reglas de tipado TypeScript de este proyecto (dos tsconfig estrictos, backend y panel React; decoradores de Nest solo en src/server; lectura estricta de datos externos; tipos de la API JSON compartidos; uniones discriminadas). Úsalo al escribir o revisar cualquier tipo, interfaz, import, componente, validación de respuestas de la API o filas de la base.
---

# Tipado

## Dos `tsconfig`

- **Backend** (`tsconfig.json`, el actual): `src/` y `test/`, salvo `src/panel/`. Node los ejecuta con `tsx`, así que valen todas las restricciones de abajo.
- **Panel** (`tsconfig.panel.json`): `src/panel/` y lo que importe de `src/shared/` (por ejemplo `api-types.ts`). No incluye todo `src/shared/`: `dates.ts` usa `process`, que no existe en el navegador. Lo compila Vite. Usa `jsx: react-jsx`, `lib` con `DOM`, `moduleResolution: bundler` y el alias `@/`. Mantiene `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` y `allowImportingTsExtensions`.
- **Una sola regla de imports para todo el proyecto:** los imports locales llevan su extensión (`.ts` o `.tsx`). Node la necesita y Vite la acepta, así `src/shared/` funciona en los dos lados.
- `enum`, `namespace`, `import x = require()` y las propiedades en los parámetros del constructor (`constructor(private x)`) no se usan en ningún lado: un solo estilo en todo el código.
- `npm run typecheck` revisa los dos.

## Lo que exige el `tsconfig` del backend (si no se cumple, el código no corre o no pasa `typecheck`)

| Opción | Qué significa en la práctica |
| --- | --- |
| `experimentalDecorators` | Los decoradores de Nest (`@Controller`, `@Get`, `@Inject`…), **solo en `src/server/`**. Sin `emitDecoratorMetadata`: la inyección usa `@Inject(TOKEN)` y el constructor asigna cada campo a mano. |
| `verbatimModuleSyntax` | Lo que es solo un tipo se importa como tipo: `import type { X }` o `import { type X, y }`. |
| `allowImportingTsExtensions` | Los imports locales llevan `.ts`: `from './dates.ts'`. |
| `strict` | Sin `any` implícito; `null` y `undefined` se manejan explícitamente. |
| `noUncheckedIndexedAccess` | `arr[0]` y `obj[key]` pueden ser `undefined`: se comprueba antes de usarlos. |

## Reglas

1. **Nada de `any`.** Lo que no se conoce es `unknown` y se estrecha con comprobaciones.
2. **Los datos externos entran como `unknown`**, sean respuestas de la API, filas de SQLite o formularios. Se leen con una función lectora que comprueba cada campo y devuelve el tipo del dominio o un error que dice qué campo falló. **Nunca** se convierten con `as`. Esto implementa el principio «nunca se adivina».
3. **`as` solo cuando el código ya lo garantiza**, por ejemplo una tupla después de `split` validado, como en `src/shared/dates.ts`. Nunca para datos de afuera.
4. **El `!` no se usa en el código de `src/`:** se comprueba y se maneja el caso. En las pruebas sí se permite.
5. **En lugar de `enum`, uniones de literales:**
   ```ts
   const CONTRACT_STATUSES = ['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'] as const
   type ContractStatus = (typeof CONTRACT_STATUSES)[number]
   ```
6. **Resultados como uniones discriminadas** por un campo `kind`, con `switch` exhaustivo que termina en `never`:
   ```ts
   type InstallmentOutcome =
   	| { kind: 'imported'; invoiceId: string }
   	| { kind: 'excluded_status'; status: ContractStatus }
   	| { kind: 'blocked_by_cap' }
   ```
   Así, agregar un resultado nuevo obliga a manejarlo en todos lados.
7. **Errores esperados como valor, no como excepción:**
   ```ts
   type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
   ```
   Se usa `throw` solo para lo que es un bug o una falla de infraestructura que corta la corrida entera.
8. **`interface` para las formas de objetos y `type` para las uniones y los alias**, como en el código existente.
9. **`readonly`** en las propiedades de las interfaces del dominio y `readonly T[]` en las listas que no se modifican.
10. **Tipo de retorno explícito** en toda función exportada.
11. **Nombres que dicen la unidad:** `amountCents`, `dueDate` (`YYYY-MM-DD`), `period` (`YYYY-MM`). Sin tipos «marcados» (brands): sería complejidad de más para esta versión.
12. **`satisfies`** para las constantes de configuración: se comprueba el tipo sin perder los literales.
13. **Tipos de la API JSON en `src/shared/`**, uno por respuesta y por pedido, por ejemplo `CustomerDetail` o `RunSummary`. El backend los cumple al responder y el panel los usa con `import type`. Si cambia una respuesta, se cambia ahí y `typecheck` marca todo lo afectado en los dos lados.
14. **Componentes React:** función con nombre y props en una `interface` (`interface CustomerTableProps`). Sin `React.FC`.
