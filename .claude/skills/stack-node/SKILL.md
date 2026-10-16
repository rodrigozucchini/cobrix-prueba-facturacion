---
name: stack-node
description: Reglas del stack de este proyecto. Backend en Node 24 + TypeScript con NestJS para la API JSON (corre con tsx, sin build) y node:sqlite y node:test; las reglas de negocio sin dependencias; panel en React + Vite + Tailwind + shadcn/ui. Úsalo antes de escribir o cambiar código en src/ o test/, al elegir una librería, al guardar datos, al hablar con la API del administrador, al armar pantallas del panel o al escribir pruebas.
---

# Stack del proyecto

## Dos partes, con reglas distintas

| | Backend | Panel |
| --- | --- | --- |
| Qué es | La integración con el administrador y una **API JSON** | La interfaz del operador, que solo consume la API JSON |
| Dónde | `src/cobrix/`, `src/server/`, `src/shared/` | `src/panel/` |
| Cómo corre | Node 24 con `tsx` (`node --import tsx`), que transforma los decoradores de Nest: sin build | Vite lo compila a `dist/panel/` |
| Dependencias | **NestJS** (`@nestjs/core`, `common`, `platform-express`, con `reflect-metadata` y `rxjs`) y `tsx`, solo para la API HTTP. `src/cobrix/` y `src/shared/` no tienen **ninguna dependencia**: módulos `node:` y `fetch` | React, React Router, TanStack Query, Tailwind, shadcn/ui. Nada más sin proponerlo antes |
| Pruebas | `node:test`: reglas de negocio y ciclo completo | Sin pruebas automáticas; `typecheck` |

**Las reglas de negocio viven solo en el backend.** El panel muestra lo que la API le da: no clasifica cuotas, no calcula deudas ni decide estados. Así cualquier otra aplicación que use la API, por ejemplo una app nativa, obtiene lo mismo.

## Cómo se levanta

- `npm start`: compila el panel y levanta un solo proceso en el puerto 4300 (la API JSON en `/api/*` y el panel), junto con la API simulada en el 4310.
- `npm run start:isp` y `npm run start:cobrix`: cada parte en su propio proceso (`src/main.ts isp` o `cobrix`).
- `npm run dev`: Vite con recarga automática, que redirige `/api` al backend.
- `npm test` y `npm run typecheck` (que revisa los dos `tsconfig`). Antes de dar algo por terminado, los dos pasan.

## Dónde va cada cosa

| Ruta | Qué | ¿Se toca? |
| --- | --- | --- |
| `src/billing-api/` y `data/billing-api.sqlite` | API simulada del administrador | **Nunca.** Solo se habla con ella por HTTP |
| `src/cobrix/` | Cliente HTTP del administrador, lectura estricta, importación, pagadas y almacenamiento | Sí |
| `src/server/` | Servidor NestJS: un módulo, un controlador por recurso de `/api/*`, el filtro de errores y el middleware que sirve el panel | Sí |
| `src/shared/` | Lo que comparten backend y panel: los tipos de la API JSON, fechas, montos, contadores, nombres de los resultados y las rutas del panel | Sí |
| `src/panel/` | La app React | Sí |
| `test/` | Pruebas `*.test.ts` | Sí |

## Estilo del código

Igual que el código existente, en las dos partes:

- Tabs, comillas simples, sin punto y coma, coma final en listas de varias líneas.
- Cada archivo empieza con un comentario `/** … */` que dice para qué existe. **Comentarios en español y cortos**: dicen el porqué o la regla que cumplen (con su ID), no repiten el código.
- **Identificadores en inglés** (`importInvoices`, `invoicesMarkedPaid`). Los campos de la API del administrador conservan sus nombres tal cual (`deuda_id`, `detalle_deuda`).
- **Textos en español**: todo lo que ve el usuario, los motivos de las corridas y los nombres de las pruebas.
- Backend: funciones fábrica `createX(deps)` que reciben sus dependencias. Nada de singletons ni de estado global.
- **Nest solo en `src/server/`.** Los controladores son delgados: leen el pedido, llaman a `src/cobrix/` y devuelven el resultado. Las reglas nunca importan nada de Nest, así se prueban sin servidor.
- Exportaciones con nombre, nunca `export default`, salvo donde una herramienta lo exige, como `vite.config.ts`.

## Fechas y dinero

- **Hoy** se obtiene siempre con `today()` de `src/shared/dates.ts`, nunca con `new Date()`. Respeta `SANDBOX_TODAY`, y de eso dependen los números de los criterios de aceptación. Solo el backend decide qué es hoy.
- **Los momentos** (cuándo empezó una corrida, cuándo se creó un cliente) usan la **hora real** (`new Date()`), no la fecha de trabajo: ocurrieron de verdad en ese momento (spec D35).
- Las fechas viajan como texto civil: `YYYY-MM-DD` y periodos `YYYY-MM`. Los momentos, en ISO con zona.
- **El dinero va en centavos enteros** (`amountCents`), en la base y en el JSON. Los montos de la API del administrador llegan con decimales: se convierten una sola vez, al leerlos, con `Math.round(valor * 100)`.
- El panel solo **formatea**: `USD 1.235,00` y fechas legibles en America/Caracas. No calcula.

## Secretos y configuración

- Ninguna credencial en el código ni en las pruebas, salvo las del sandbox, que ya son públicas en la documentación.
- Puertos y rutas salen de variables de entorno con un valor por defecto, como en `src/main.ts`.
- La contraseña del proveedor se guarda en la base de Cobrix y la API JSON nunca la devuelve.

## Referencias

Leer la que corresponda antes de trabajar en esa parte:

- [`references/http.md`](references/http.md): la API JSON y el cliente de la API del administrador.
- [`references/sqlite.md`](references/sqlite.md): el almacenamiento de Cobrix.
- [`references/panel.md`](references/panel.md): la app React.
- [`references/testing.md`](references/testing.md): las pruebas.

Lo que hace la API del administrador y sus rarezas está en `docs/API.md`; las reglas de negocio, en la spec. Este skill no las repite.
