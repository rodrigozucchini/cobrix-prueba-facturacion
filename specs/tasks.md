# Tareas: Cobrix · integración con el administrador de facturas v1

Basado en: `plan.md` v1 y `data-model.md`. Cada fase termina con algo que funciona y se puede probar.

Reglas: en las **reglas puras** (identificación, lectores, importación, pagos) la prueba se escribe **antes** que el código, con los ejemplos de la spec. Una tarea se tilda solo cuando está hecha y verificada (`npm run typecheck` y `npm test` en verde). Antes de programar se cargan los skills que apliquen (`stack-node`, `tipado-ts`, `ui-ux`). Si aparece algo que no está en la spec, no se agrega: se para y se propone. Al terminar cada fase se corre su verificación y se espera el «ok» antes de seguir.

El punto diferencial tiene sus propias tareas en `extras/punto-diferencial/tasks.md` (T070–T113), intercaladas con estas: la auditoría va después de la fase 1, y T025, T032 y T060 se hacen junto con su registro de auditoría (T075 y T076).

## Avance

| Fase | Estado |
| --- | --- |
| 1 — Base del proyecto | ✅ Completada |
| A — Auditoría (extras) | ✅ Completada |
| 2 — Conexión con el administrador | ✅ Completada |
| 3 — Importación | ✅ Completada |
| 4 — Actualizar pagadas | ✅ Completada |
| 5 — Clientes, expediente y resumen | ✅ Completada |
| B — Antigüedad de la deuda (extras) | ✅ Completada |
| C — Exportar CSV (extras) | ✅ Completada |
| D — Estado de cuenta (extras) | ✅ Completada |
| 6a — Corrida automática | ✅ Completada |
| 6b + E — Cierre: UX, README, nota y verificación final | ✅ Completada |

## Fase 1 — Base del proyecto ✅

- [x] T001 Instalar las dependencias con versiones exactas: NestJS y `tsx` para el backend; para el panel, React, React Router, TanStack Query, Vite, Tailwind y lo que pide shadcn/ui. Cubre: DT10. Dónde: `package.json`.
- [x] T002 Configurar Vite (raíz `src/panel/`, salida `dist/panel/`, alias `@/`, proxy de `/api` al 4300) y `tsconfig.panel.json`. Scripts:
  - `build` (`vite build` → `dist/panel/`);
  - `prestart` (corre `build`, así `npm start` siempre sirve el panel actualizado);
  - `start` (con `node --import tsx`: API simulada en 4310 y Cobrix con el panel en 4300), y `start:isp` y `start:cobrix` para cada parte;
  - `dev` (Vite con recarga automática) y `dev:api` (`node --import tsx --watch`), para desarrollar en dos terminales;
  - `typecheck` (los dos `tsconfig`).
  
  NestJS y `tsx` van en `dependencies`; las librerías del panel, en `devDependencies`. Cubre: DT1, DT10. Dónde: `vite.config.ts`, `tsconfig.panel.json`, `package.json`.
- [x] T003 Agregar al `.gitignore` la base de Cobrix y `dist/`. Cubre: R4. Dónde: `.gitignore`.
- [x] T004 Preparar Tailwind con los tokens de `ui-ux/references/tokens.md` (solo modo claro) e iniciar shadcn/ui con los componentes base: botón, tarjeta, campo, casilla, lista, diálogo de confirmación, avisos, esqueleto, tabla, distintivo y menú desplegable. Cubre: RF38. Dónde: `src/panel/styles.css`, `src/panel/components/ui/`.
- [x] T005 Crear los tipos compartidos iniciales de la API JSON: configuración, pedido de configuración y error. Cubre: DT11. Dónde: `src/shared/api-types.ts`.
- [x] T006 Crear el almacenamiento: abrir la base, activar las FK, crear el esquema completo de `data-model.md`, `transaction()` y las filas iniciales (empresa vacía y proveedor 1 con los valores por defecto). Cubre: RF5, D4, D38, D39. Dónde: `src/cobrix/store/`.
- [x] T007 Probar el esquema: coherencia de la factura (abierta y pagada), `RESTRICT` al borrar, único por (proveedor, `deuda_id`) y una sola corrida en curso. Cubre: RN19, RN36, D16, D38. Dónde: `test/store.test.ts`.
- [x] T008 Crear el servidor de Cobrix en NestJS: módulo, controladores de `/api/*`, lectura de JSON, filtro con el formato de error y el panel compilado con `index.html` como respaldo. Cubre: plan §5.1. Dónde: `src/server/`.
- [x] T009 Implementar `GET` y `PUT /api/configuracion` con todas las validaciones (empresa, URL, rangos, topes, al menos un estado). La contraseña nunca se devuelve (`hasPassword`) y, si llega vacía, se conserva. Cubre: RF1–RF3, RF5–RF8, D36. Dónde: `src/server/`, `src/cobrix/store/`.
- [x] T010 Probar la configuración por HTTP: contraseña no devuelta, `400` con los campos y valores válidos. Cubre: CA2, CA5, CA6, CA43. Dónde: `test/api.test.ts`.
- [x] T011 Cambiar `src/main.ts` para que levante la API simulada y el servidor de Cobrix. Al arrancar, marcar como fallidas las corridas que quedaron en curso. Cubre: DT1, DT12. Dónde: `src/main.ts`.
- [x] T012 Armar el panel: menú lateral (desplegable en móvil), rutas, consultas y avisos. Las 6 pantallas nacen como «Por implementar» con su lista de `SCREENS`. Cubre: RF40, `ui-ux` §0. Dónde: `src/panel/`.
- [x] T013 Crear `lib/api.ts`, `lib/format.ts` (`USD 1.235,00`, fechas de Caracas) y `StatusBadge` con su mapa único de estados. Cubre: RF38, RF39. Dónde: `src/panel/lib/`, `src/panel/components/`.
- [x] T014 Implementar la pantalla Configuración completa: dos bloques, validación al salir del campo, contraseña vacía para conservar y «Última modificación». Cubre: RF1–RF8. Dónde: `src/panel/routes/`.
- [x] T015 Adaptar el caso del panel en `test/entorno.test.ts`: que el panel responda y que `/simulador` dé 404. Los casos de la API no se tocan. Cubre: R5, CL18. Dónde: `test/entorno.test.ts`.
- [x] T016 Agregar `npm run build` al CI. Cubre: R6. Dónde: `.github/workflows/ci.yml`.
- [x] T017 Probar con `node:test` la lógica chica del panel:
  - `format.ts`: `USD 1.235,00`, `USD 0,00`, `13 oct 2026`, fecha de Caracas;
  - `status.ts`: cada código de resultado y estado tiene texto, tono e ícono.
  
  Los dos archivos no usan nada del navegador. Cubre: RF38, RF39, CA42. Dónde: `test/panel-format.test.ts`.
- [x] T018 Reescribir «Levantar el entorno» del README:
  - requisitos (Node 24);
  - `npm install` y `npm start`, con la tabla de direcciones (panel React en 4300, API del administrador y Swagger en 4310) y las credenciales del sandbox;
  - cómo desarrollar con `npm run dev:api` y `npm run dev`;
  - las pruebas (`npm test`, `npm run typecheck`, `npm run build`);
  - un enlace a `specs/` y a `CLAUDE.md`.
  
  Cubre: enunciado §2 («si cambias de stack, explica cómo levantarlo») y §6. Dónde: `README.md`.

**Verificación:** `npm run typecheck`, `npm test` y `npm run build` en verde. **Copia limpia:** el proyecto en una carpeta temporal, `npm install` y `npm start` → en `http://127.0.0.1:4300` está el panel React con el menú, y en `http://127.0.0.1:4310/docs` el Swagger, siguiendo solo lo que dice el README. Con `npm start`, cargar empresa y proveedor, guardar y recargar: los datos siguen ahí y la contraseña no se muestra (CA1, CA2). Probar los valores inválidos (CA5, CA6, CA43).

## Fase 2 — Conexión con el administrador ✅

- [x] T020 **Prueba primero:** escribir las pruebas de `normalizeIdentification()` con todos los ejemplos de la spec y después implementarla hasta que pasen (letra, separadores, ceros, minúsculas, 6 a 12 dígitos después de quitar ceros, tipo de persona). Cubre: RN1–RN3, D18, D37. Dónde: `src/cobrix/rules/identification.ts`, `test/identification.test.ts`.
- [x] T021 Implementar el cliente del administrador. Debe:
  - normalizar la URL;
  - hacer login y uno nuevo 5 minutos antes de que venza el token (sin refresh token);
  - ante un 401, hacer login y reintentar una vez;
  - ante un 400 en el login, informar credenciales rechazadas, sin reintentar;
  - cortar a los 15 s;
  - usar solo `/api/v1` y dar errores con tipo.
  
  Cubre: RN7, CL2, CL4, CL17, D31, D32. Dónde: `src/cobrix/billing/client.ts`.
- [x] T022 **Prueba primero:** escribir las pruebas de los lectores con respuestas buenas y raras, antes del código (fallan hasta T023). Cubre: RN8–RN10, RN15, RN38, CL7, CL23–CL25. Dónde: `test/readers.test.ts`.
- [x] T023 Implementar los lectores estrictos:
  - **lista de contratos:** total, ilegibles, repetidos y `success`/`errors` registrados;
  - **filas de contrato:** los 13 campos, coherencia, estado, `"0"`, periodo y correo en minúsculas;
  - **filas del libro:** los 8 campos y el número de cuota en texto o número.
  
  Cubre: RN6, RN8–RN10, RN15, RN38, CL6, CL7, CL23–CL25, D34. Dónde: `src/cobrix/billing/readers.ts`.
- [x] T024 Probar el cliente con un `fetch` falso: 401 con login nuevo, 400 sin reintento, tiempo límite, URL con o sin `/api/v1` y error de un contrato. Cubre: RN7, CL2, CL4, CL17. Dónde: `test/billing-client.test.ts`.
- [x] T025 Implementar `POST /api/configuracion/probar-conexion` (con la contraseña guardada si viene vacía) y el botón en Configuración. Cubre: RF4, D24. Dónde: `src/server/`, `src/panel/routes/`.

**Verificación:** pruebas en verde. En el panel, «Probar conexión» dice 27 contratos con `cobrix` / `cobrix-sandbox` (CA3) y avisa el rechazo con una contraseña mala (CA4).

## Fase 3 — Importación ✅

- [x] T030 **Prueba primero:** escribir las pruebas de las reglas de importación con los ejemplos de la spec, antes del código (fallan hasta T031). Cubre: RN11–RN21, CL19, CL21. Dónde: `test/import-rules.test.ts`.
- [x] T031 Implementar `classifyContract()` y `applyCaps()`: estado, tipo de documento (sin letra no se excluye), moneda, residual, ventana, máximo, ya importada y topes, en el orden de la spec. Cubre: RN11–RN20, D5–D7, D17, CL19, CL21. Dónde: `src/cobrix/rules/import.ts`.
- [x] T032 Implementar el motor de corridas:
  - crear la corrida en curso, con candado (`409` si ya hay una);
  - ejecutarla en segundo plano;
  - cerrarla como completada o fallida;
  - guardar el resumen de una línea, los contadores, las advertencias y los datos técnicos.
  
  Cubre: RF17, RF20–RF22, RN33, RN34, RN36, spec §5.5. Dónde: `src/cobrix/runs/engine.ts`.
- [x] T033 Implementar la corrida de importación: login → lista → contratos → clasificar → acumular → aplicar en una transacción (si no es simulación) los contratos, clientes, facturas y eventos. Cubre: RF9–RF13, RN4–RN6, RN19, RN21–RN23, RN35, D25, D26. Dónde: `src/cobrix/runs/import-run.ts`.
- [x] T034 Implementar `POST /api/corridas`, `GET /api/corridas` y `GET /api/corridas/:id`, con `409` si ya hay una corrida en curso o falta el proveedor, y `404` si no existe. Cubre: RF17–RF19, RF21, RF41, CL1, CL13, CL15. Dónde: `src/server/`.
- [x] T035 Agregar los tipos de corridas, contadores y códigos de resultado, con su texto en español en el panel. Cubre: plan §5.3, DT11. Dónde: `src/shared/api-types.ts`, `src/panel/lib/status.ts`.
- [x] T036 Implementar la pantalla Sincronización: dos tarjetas con «Simular» y confirmación para lo real, más el historial con los distintivos. Cubre: RF18, RF35, RF41. Dónde: `src/panel/routes/`.
- [x] T037 Implementar la pantalla Detalle de corrida:
  - destacados;
  - todos los contadores;
  - advertencias;
  - filas con filtro por resultado;
  - consulta cada segundo mientras corre;
  - aviso al terminar con enlace a la corrida.
  
  Cubre: RF19, RF22, RF37. Dónde: `src/panel/routes/`.
- [x] T038 Probar el ciclo de importación contra la API simulada: simular, importar, exclusiones, 27 contratos leídos, reimportar, LUIS GOMEZ, ELENA RUIZ, los titulares que no aparecen y las configuraciones de ventana, máximo, tipo, tope y gracia. Cubre: CA7–CA18. Dónde: `test/ciclo.test.ts`.
- [x] T039 Probar por HTTP la corrida fallida por credenciales, el `409` y el `404`. Cubre: CA26, CA29, CL13, CL15. Dónde: `test/api.test.ts`.

**Verificación:** desde el panel, con Cobrix vacío, se cumplen CA7–CA18 y CA26–CA29. Las pruebas están en verde.

## Fase 4 — Actualizar pagadas ✅

- [x] T040 **Prueba primero:** escribir las pruebas de las reglas de pagos con los ejemplos de la spec, antes del código (fallan hasta T041). Cubre: RN24–RN30. Dónde: `test/paid-rules.test.ts`.
- [x] T041 Implementar `classifyInvoice()`:
  - filas que coinciden en contrato, periodo, saldo y monto pagado;
  - pagada;
  - abono parcial;
  - sigue pendiente;
  - exonerada;
  - contradicción;
  - comparar con el contrato cuando la cuota no está en el libro;
  - sin evidencia.
  
  Cubre: RN24–RN30, D20, D21. Dónde: `src/cobrix/rules/paid.ts`.
- [x] T042 Implementar la corrida de pagadas:
  - agrupar por contrato y consultar el libro con su rango de fechas;
  - releer el contrato solo si hace falta;
  - registrar consultas fallidas;
  - aplicar el pago (fecha, referencia, saldo 0 y evento);
  - sin facturas abiertas, no conectarse.
  
  Cubre: RF14–RF16, RN31, RN32, D12, CL8, CL9, CL16, CL26. Dónde: `src/cobrix/runs/paid-run.ts`.
- [x] T043 Completar el Detalle de corrida para pagadas: destacados y abono parcial con lo que dice el ISP y lo que tiene Cobrix. Cubre: RF16, RF19. Dónde: `src/panel/routes/`.
- [x] T044 Completar el ciclo: pagos en la caja (`/__sim/pagar` y `/__sim/anular`) → simular → actualizar → repetir → reimportar. Cubre: CA19–CA25. Dónde: `test/ciclo.test.ts`.

**Verificación:** desde el panel, con los pagos del enunciado en el Swagger, se cumplen CA19–CA25 (8 pagadas, 34 abiertas por USD 955,00). Las pruebas están en verde.

## Fase 5 — Clientes, expediente y resumen ✅

- [x] T050 Implementar la consulta y `GET /api/clientes`:
  - búsqueda sin mayúsculas, acentos ni separadores;
  - orden;
  - deuda, vencimiento más antiguo y cantidad de contratos;
  - «Sin facturas abiertas» al final.
  
  Cubre: RF23–RF25, D28, D29. Dónde: `src/cobrix/queries/customers.ts`, `src/server/`.
- [x] T051 Implementar la consulta y `GET /api/clientes/:id`: datos, totales, todos los contratos del titular, facturas (de la más nueva a la más vieja) e historial con enlace a la corrida. Cubre: RF27–RF30, CL15. Dónde: `src/cobrix/queries/customer-detail.ts`, `src/server/`.
- [x] T052 Implementar la consulta y `GET /api/resumen`: totales, monto por cobrar, proveedor, corrida automática y últimas 5 corridas. Cubre: RF31–RF33. Dónde: `src/cobrix/queries/summary.ts`, `src/server/`.
- [x] T053 Implementar la pantalla Clientes: búsqueda con pausa y en la URL, orden por columna, vacío y sin resultados. Cubre: RF23–RF26, CL14. Dónde: `src/panel/routes/`.
- [x] T054 Implementar la pantalla Expediente. Cubre: RF27–RF30. Dónde: `src/panel/routes/`.
- [x] T055 Implementar la pantalla Resumen, con accesos rápidos que piden confirmación y el aviso «Configura el proveedor». Cubre: RF31–RF33, RF35. Dónde: `src/panel/routes/`.
- [x] T056 Probar por HTTP la búsqueda, el orden, el expediente de LUIS GOMEZ y los totales del resumen después del ciclo. Cubre: CA31–CA34, CA23. Dónde: `test/api.test.ts`.

**Verificación:** desde el panel se cumplen CA31–CA35, y el Resumen coincide con la suma de la tabla de clientes (CA23).

## Fase 6 — Corrida automática y pulido ✅

- [x] T060 Implementar el programador:
  - cada 30 s mira la hora real de Caracas;
  - si toca y hoy no corrió, lanza la importación y después pagadas, aunque la importación falle;
  - si hay otra corrida en curso, registra la automática como fallida.
  
  Probarlo con un reloj de prueba. Cubre: RF6, RN37, D22, D23, DT9, CL20. Dónde: `src/cobrix/scheduler.ts`, `test/scheduler.test.ts`.
- [x] T061 Al arrancar, marcar como fallidas, con el motivo, las corridas que quedaron en curso por un corte. Cubre: RF34, DT12. Dónde: `src/cobrix/store/runs.ts`, `src/main.ts`.
- [x] T062 Probar la corrida interrumpida: pasa a fallida con su motivo y las demás no cambian. Cubre: CA36. Dónde: `test/store.test.ts`.
- [x] T063 Registrar las acciones del sistema: lo hace la auditoría en archivo del punto diferencial (D48, `extras/punto-diferencial/tasks.md`). Cubre: RF51.
- [x] T064 Revisar la UX pantalla por pantalla:
  - esqueletos, vacíos y errores con «Reintentar»;
  - confirmaciones;
  - formato de montos y fechas;
  - móvil a 360 px y accesibilidad.
  
  Cubre: RF35–RF40, CA37–CA42. Dónde: `src/panel/`.
- [x] T065 Completar el README (lo de levantar y probar ya está desde T018 y se mantiene en cada fase):
  - cómo levantar (`npm install`, `npm start`, `npm run dev`);
  - cómo correr las pruebas;
  - la lista de verificación manual de los CA;
  - la advertencia sobre `SANDBOX_TODAY` y `npm run seed` (para volver al estado entregado se usa `git checkout`).
  
  Cubre: enunciado §6. Dónde: `README.md`.
- [x] T066 Escribir la nota de decisiones:
  - la elección del stack y del diseño;
  - las decisiones principales, con sus fuentes;
  - qué quedó fuera;
  - qué se haría con más tiempo (la clave de la contraseña en un gestor de secretos, ya que el cifrado se hizo con D53; versión y autenticación de la API; punto diferencial).
  
  Cubre: enunciado §3.7 y §6. Dónde: `NOTA.md`.
- [x] T067 Verificación final completa: todos los CA desde el panel, `typecheck`, `test` y `build` en verde, con la base del administrador reiniciada y Cobrix vacío. Cubre: todos los CA. Dónde: —.

**Verificación:** se cumplen CA30 y CA36–CA42. Todo en verde. README y nota listos.
