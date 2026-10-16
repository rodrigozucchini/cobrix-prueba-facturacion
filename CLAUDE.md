# Cobrix · integración con el administrador de facturas

Prueba técnica: importar clientes y facturas desde la API de un administrador de facturas de un ISP, aplicar los pagos que el ISP ya cobró y construir un panel para operarlo.

## Antes de trabajar

1. Lee `specs/constitution.md`: los principios que mandan sobre todo lo demás.
2. Lo que se construye está en `specs/`: `spec.md` (qué), `plan.md` (cómo), `data-model.md` (base de datos), `tasks.md` (tareas) e `implementacion/` (un registro por fase de lo que pasó al implementar: verificación, decisiones y desvíos). El punto diferencial tiene los suyos en `specs/extras/punto-diferencial/` (`spec.md`, `plan.md` y `tasks.md`), con IDs que continúan los de la base. El enunciado original está en `docs/ENUNCIADO.md` y la API en `docs/API.md`.
3. Trabaja con el proceso del skill `sdd`: una fase por vez y con la aprobación del usuario entre cada una.

## Skills del proyecto

| Skill | Para qué |
| --- | --- |
| `sdd` | Proceso: constitution → spec → plan → tareas → implementación |
| `stack-node` | Stack, estructura de carpetas, API JSON, almacenamiento y pruebas |
| `tipado-ts` | Reglas de TypeScript y lectura estricta de datos externos |
| `ui-ux` | Diseño y experiencia del panel React |

## Cómo se implementa una tarea

1. Leer la tarea y lo que cita (RF, RN, CA, CL, D) en la spec y el plan.
2. Cargar los skills que apliquen (`stack-node`, `tipado-ts`, `ui-ux`).
3. Si es una **regla pura** (identificación, lectores, importación, pagos, CSV, auditoría): escribir **primero la prueba** con los ejemplos de la spec y verla fallar.
4. Implementar lo mínimo para que pase, sin agregar nada que la spec no pida.
5. `npm run typecheck` y `npm test` en verde. Si la tarea cambia cómo se levanta o se prueba algo, actualizar el README en la misma tarea: `npm install` + `npm start` siempre tienen que levantar todo.
6. Tildar la tarea en `tasks.md`.
7. Al terminar la fase: correr su **Verificación**, escribir su registro en `specs/implementacion/` (qué funciona, cómo se verificó, decisiones, desvíos y pendientes), informar el resultado y esperar el «ok» antes de seguir.

## Pruebas

- Viven en `test/*.test.ts`, con `node:test`. El nombre de cada prueba dice el comportamiento y el ID que cubre: `it('RN25: abono parcial deja la factura abierta')`.
- Las del ciclo corren contra la API simulada en una carpeta temporal, con la fecha fija `2026-10-13` y los pagos por `/__sim/*`.
- En `test/entorno.test.ts`, los casos de la API **no se tocan**; solo se adapta el del panel (T015).
- Del panel se prueba solo `lib/format.ts` y `lib/status.ts`; las pantallas se verifican a mano con `specs/verificacion.md`.

## Lo que nunca se hace

- Tocar `src/billing-api/` o `data/billing-api.sqlite`: con el administrador se habla solo por HTTP.
- Llamar a `/__sim/*` desde el código de Cobrix: el simulador no existe en un ISP real. Solo lo usan las pruebas y la persona que prueba.
- Escribir contraseñas o tokens en la auditoría, en la consola o en una respuesta de la API. La contraseña del proveedor solo vive cifrada en su campo de la base (DT6, D53); el token, solo en memoria durante la corrida.
- Implementar algo que no esté en las specs (base o `extras/`).
- Dar una tarea por terminada sin `npm run typecheck` y `npm test` en verde (y `npm run build` si tocó el panel).

## Comandos

```bash
npm install         # dependencias (Node 24)
npm start           # compila el panel y levanta todo: Cobrix (NestJS) + panel en :4300, API simulada en :4310 (fecha fija 2026-10-13)
npm run start:isp   # solo la API simulada del administrador (:4310)
npm run start:cobrix # solo Cobrix (NestJS) + panel (:4300)
npm run dev:api     # desarrollo: backend que se reinicia al guardar
npm run dev         # desarrollo: panel con recarga automática (proxy de /api al :4300)
npm test
npm run typecheck   # backend y panel
npm run build       # compila el panel a dist/panel
```
