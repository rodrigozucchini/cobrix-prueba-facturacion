# Fase 1 — Base del proyecto

**Tareas:** T001–T018

## Qué quedó

- `npm install` + `npm start` levantan todo: el panel React y la API de Cobrix en `:4300`, y el administrador simulado en `:4310`.
- La base propia con el esquema completo de `data-model.md`.
- **Configuración** completa (empresa y proveedor, con validaciones); las demás pantallas, preparadas.
- CI con `typecheck`, `test` y `build`.

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| I1 | React Router 7 y Vite 7, con versiones exactas | Líneas estables y conocidas |
| I4 | El servidor conoce las pantallas del panel y responde 404 a las demás | Si no, `/simulador` daría 200 |
| I5 | El formulario de Configuración valida con el mismo archivo que el backend | Los límites del panel y del servidor son siempre los mismos |
| I7 | Las fechas se escriben a mano: «13 oct 2026» | `Intl` en español agrega un punto («13 oct. 2026») |

## Verificación

- 28 pruebas en verde (CA1, CA2, CA5, CA6, CA43; las restricciones de la base, en `store.test.ts`).
- Desde una copia limpia, siguiendo solo el README: el panel y el Swagger responden y `/simulador` da 404.
