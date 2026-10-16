# Plan técnico: Cobrix · integración con el administrador de facturas v1

Basado en: `spec.md` v1 y `constitution.md`. Sigue los skills `stack-node`, `tipado-ts` y `ui-ux`.

## 1. Enfoque en pocas líneas

Un solo proceso de Node levanta la API simulada del administrador (puerto 4310, sin tocarla) y el **servidor de Cobrix** (puerto 4300). El servidor de Cobrix expone una **API JSON** en `/api/*` y sirve el **panel React** ya compilado. Toda la lógica de negocio vive en el backend, dividida en tres capas:

- **lectores**, que convierten cada respuesta del administrador en datos tipados o en un error que explica qué falló;
- **clasificadores puros**, que deciden qué pasa con cada cuota sin hacer I/O;
- **corridas**, que leen todo, clasifican y recién al final guardan los cambios en una sola transacción. Si la corrida es una simulación, no guardan.

El panel solo pide datos a la API JSON y los muestra.

## 2. Revisión contra la constitution

| Principio | Cómo lo cumple este plan |
| --- | --- |
| 1. Simplicidad ante todo | Reglas y almacenamiento sin dependencias (`node:sqlite`, `fetch`); NestJS solo en la capa HTTP (DT1). Llamadas al administrador en secuencia, sin colas ni workers. Sin paginación, porque los volúmenes son chicos. Una sola transacción por corrida. |
| 2. Idioma y mercado | Textos en español neutro con tuteo. Dinero en centavos, mostrado como `USD 1.235,00`. Fechas civiles en America/Caracas con `src/shared/dates.ts`. |
| 3. Cero alcance fantasma | Cada pieza de la sección 6 sale de un RF o una RN. Nada de login, versionado de API ni modo oscuro. |
| 4. Nunca se adivina | Los lectores validan cada campo y nunca usan `as` sobre datos externos. Toda duda termina en un resultado explicado («Respuesta inconsistente», «En revisión», «Sin evidencia»). |
| 5. Repetible y explicable | Idempotencia por `UNIQUE` sobre el `deuda_id`. La simulación usa el mismo código y solo omite el paso de guardar. Cada corrida guarda una fila por cuota con su motivo. |
| 6. Verificable por una persona no técnica | Cada CA se puede hacer desde el panel. Las RN tienen pruebas automáticas, y el ciclo completo se prueba contra la API simulada. |
| 7. Datos con respeto | La contraseña nunca sale por la API JSON (solo `hasPassword`). Ninguna credencial queda en el código. Con el administrador se habla solo por HTTP. |

## 3. Arquitectura

```
                    ┌────────────────────────── proceso Node (npm start) ──────────────────────────┐
                    │                                                                              │
 navegador ──HTTP──►│  src/server/ (NestJS) API JSON /api/*  +  archivos de dist/panel/ (React)     │
 (panel React)      │      │                                                                       │
                    │      ▼                                                                       │
                    │  src/cobrix/                                                                 │
                    │   ├─ runs/        motor de corridas: una a la vez, en segundo plano          │
                    │   │    ├─ import-run.ts   ─┐                                                 │
                    │   │    └─ paid-run.ts     ─┤ leen ──► billing/client.ts ──HTTP──┐            │
                    │   ├─ rules/       clasificadores puros (RN1–RN32)               │            │
                    │   ├─ billing/     cliente HTTP + lectores estrictos             │            │
                    │   ├─ store/       SQLite de Cobrix (data/cobrix.sqlite)         │            │
                    │   ├─ queries/     lecturas para las pantallas                   │            │
                    │   └─ scheduler.ts corrida automática diaria                     │            │
                    │                                                                 ▼            │
                    │  src/billing-api/  API simulada del administrador (4310) — NO SE TOCA       │
                    └──────────────────────────────────────────────────────────────────────────────┘
```

| Pieza | Qué hace | Habla con |
| --- | --- | --- |
| `src/main.ts` | Arranca la API simulada, el servidor de Cobrix y el programador de la corrida automática | Todo |
| `src/server/` | App NestJS: un controlador por recurso de `/api/*`, que valida el pedido y responde JSON; un filtro con el formato único de error, y el middleware que sirve el panel (con `index.html` como respaldo para React Router) | `cobrix/runs`, `cobrix/queries`, `cobrix/store` |
| `src/cobrix/billing/client.ts` | Login (y login nuevo cuando el token vence: no hay refresh token), `lista_ids_contratos`, `contrato/individual` y `pago_informacion`. Errores tipados | API del administrador |
| `src/cobrix/billing/readers.ts` | `unknown` → tipos del dominio o error de lectura con el campo que falló | — |
| `src/cobrix/rules/` | Funciones puras: identificación (RN1–RN3), periodo (RN15), clasificación de importación (RN7–RN21) y de pagos (RN24–RN30) | — |
| `src/cobrix/runs/` | Inicia una corrida (con candado), la ejecuta en segundo plano y guarda el resultado; si falla, la marca fallida | `billing`, `rules`, `store` |
| `src/cobrix/store/` | Abre la base, crea el esquema y ofrece `transaction()` y los repositorios | SQLite |
| `src/cobrix/queries/` | Arma lo que cada pantalla necesita: resumen, clientes (búsqueda y orden) y expediente | `store` |
| `src/cobrix/scheduler.ts` | Cada 30 s revisa si es la hora configurada y si hoy no corrió; si corresponde, lanza importación y luego pagadas | `runs` |
| `src/shared/api-types.ts` | Tipos de cada pedido y respuesta de la API JSON | Backend y panel |
| `src/panel/` | App React: pantallas, consultas con TanStack Query, componentes shadcn/ui | `/api/*` |

## 4. Modelo de datos

Está en su propio archivo: **[`data-model.md`](data-model.md)**. Resume: base SQLite propia (`data/cobrix.sqlite`), con un solo administrador (D39), FK con `RESTRICT` sin borrado en cascada (D38), e idempotencia por `deuda_id`.

## 5. Contratos

### 5.1 API JSON de Cobrix

Los tipos de todas las respuestas están en `src/shared/api-types.ts`. Errores: `{ "error": { "code", "message", "fields"? } }`, con el `message` en español.

| Ruta | Pedido | Respuesta | Errores |
| --- | --- | --- | --- |
| `GET /api/resumen` | — | `Summary`: totales (clientes, contratos, abiertas, pagadas, `openAmountCents`), proveedor (o `null`), corrida automática, últimas 5 corridas | — |
| `GET /api/configuracion` | — | `Settings`: todo menos la contraseña, más `hasPassword` y `updatedAt` | — |
| `PUT /api/configuracion` | `SettingsInput` (contraseña opcional: vacía conserva la anterior) | `Settings` | `400 validation` con `fields: { campo: mensaje }` |
| `POST /api/configuracion/probar-conexion` | `{ url, user, password? }` | `{ ok: true, contracts: 27 }` o `{ ok: false, message }` | `400` si falta la URL o el usuario |
| `GET /api/clientes?q=&orden=vencimiento\|deuda\|nombre` | — | `CustomerListItem[]` | `400` si el orden no es válido |
| `GET /api/clientes/:id` | — | `CustomerDetail`: cliente, totales, contratos, facturas e historial | `404 not_found` |
| `POST /api/corridas` | `{ tipo: 'importacion' \| 'pagadas', simulacion: boolean }` | `202` con `RunListItem` (estado `running`) | `409 run_in_progress`, `409 provider_not_configured`, `400` |
| `GET /api/corridas` | — | `RunListItem[]`, de la más reciente a la más antigua | — |
| `GET /api/corridas/:id` | — | `RunDetail`: corrida, contadores y filas | `404 not_found` |

Las corridas son **asíncronas**: el `POST` responde enseguida y la corrida sigue en segundo plano. El panel consulta `GET /api/corridas/:id` cada segundo mientras el estado es `running` (RF22).

### 5.2 API del administrador (lo que se lee)

El cliente del administrador solo usa rutas `/api/v1/...`. **Nunca** llama a `/__sim/*`: el simulador no existe en un ISP real y lo usa solo la persona que prueba (y las pruebas automáticas, como lo haría esa persona).

| Llamada | Cómo se usa |
| --- | --- |
| `POST /usuario/login` | Se guarda el token con su vencimiento (UTC sin zona → se agrega `Z`). La API **no tiene refresh token**: 5 minutos antes de que venza se hace un **login nuevo** con el mismo usuario y contraseña. Ante un 401 también se hace un login nuevo y se reintenta **una vez** (CL4) |
| Errores del login | **Credenciales malas:** el login responde **400** («El correo no se encuentra registrado» o «Contraseña Incorrecta») → no se reintenta; la corrida queda fallida y pide revisar Configuración (RN33). **Token vencido o inválido:** una ruta `/isp/...` responde **401** → login nuevo automático y se repite esa consulta una vez (CL4) |
| `GET /isp/lista_ids_contratos` | **Sin** el parámetro `estado` (CL22) y sin `page` ni `per_page` (la API los ignora y devuelve todo). Se exige que la cantidad recibida sea igual a `pagination.total` y que `total_pages` sea 1; si no, la corrida falla (CL23). `success` se lee y se registra como segunda opinión, sin decidir (D34): con `false` y datos válidos suma 1 al contador técnico `successFalseWithData` de la corrida (no se muestra en el panel); con datos rotos, su `message` se agrega al error. `errors` trae siempre una fila vacía: se descartan las vacías y, si alguna trae un mensaje con texto, se guarda como advertencia de la corrida, sin hacerla fallar (CL24). Si `data` no es una lista, la corrida falla (RN33). Cada elemento pasa por `readContractId()`: número entero positivo, o texto con solo dígitos y espacios alrededor → número; cualquier otra cosa → fila `unreadable_list_item` con el valor crudo (RN38). Los números repetidos se procesan una vez (CL6) |
| `GET /isp/contrato/individual?id_contrato=` | Se lee como lista; las filas se validan una por una (RN8) |
| `GET /isp/pago_informacion?id_contrato=&tipo_busqueda=CUOTA&fecha_inicio=&fecha_fin=` | Siempre con fechas (sin ellas, la API devuelve un rango fijo viejo): desde el día 1 del periodo de la factura abierta más vieja del contrato hasta el último día del mes actual. Se ignora `success` (CL7) |

#### Campos que se leen de `contrato/individual`

De los ~50 campos de cada fila se usan solo estos 13, que son los que el enunciado pide guardar o mostrar (§3.5 y §3.6) o que hacen falta para las reglas. El resto se ignora (*Tolerant Reader*): si el ISP lo cambia, Cobrix no se rompe. No se guarda la dirección ni el corte del ISP (`dia_corte`): el corte de Cobrix es vencimiento + días de gracia.

| Campo de la API | Dato en Cobrix | ¿Obligatorio? | Cómo se lee |
| --- | --- | --- | --- |
| `contrato_id` | Número de contrato | Sí | Igual al contrato pedido (RN8) |
| `identificacion_contrato` | ID de cliente y documento | Sí | ID normalizado (RN1); documento tal cual |
| `nombre_contrato` | Nombre del cliente | Sí | Sin espacios sobrantes |
| `estado` | Estado del contrato | Sí | Uno de los 6 conocidos (RN9) |
| `moneda_sigla` | — (solo para validar) | Sí | Tiene que ser `USD` (RN14) |
| `precio_servicio` | Precio del plan | Sí | Llega como texto (`"25.000000"`) → centavos |
| `deuda_id` | Cuota del administrador | Sí | Texto con dígitos; `"0"` = sin deuda (RN10) |
| `deuda` | Total de la factura | Sí, si hay cuota | Número ≥ 0 → centavos (RN21) |
| `detalle_deuda` | Periodo y vencimiento | Sí, si hay cuota | Lista con un solo texto (RN15) |
| `email` | Correo | No | En minúsculas (RN6); si falta, «—» |
| `telefono` | Teléfono | No | Si falta, «—» |
| `nombre_plan` | Plan | No | Si falta, «—» |
| `sigla_sucursal` | Sucursal | No | La sigla (`CCS`), como la referencia; si falta, «—» |

Si falta un campo obligatorio o no se puede leer, el contrato queda «Respuesta inconsistente» (RN8). Si falta uno opcional, el contrato se importa igual.

#### Campos que se leen de `pago_informacion`

Se usan solo estos 8. El resto (`tarifa`, `descuento`, `detalle`, datos del cliente, etc.) se ignora (*Tolerant Reader*).

| Campo de la API | Para qué | ¿Obligatorio? | Cómo se lee |
| --- | --- | --- | --- |
| `detalle_pago.id_cuota` | A qué factura de Cobrix corresponde la fila | Sí | **Llega como número** (`7000008`), mientras que `deuda_id` de `contrato/individual` llega como texto (`"7000008"`). Se comparan como el mismo identificador: los dos se leen a texto con solo dígitos antes de comparar. Si no, ninguna factura encontraría su cuota y todas quedarían «Sin evidencia» |
| `id_contrato` | Comprobar que la fila es del contrato pedido (RN28) | Sí | Número igual al contrato consultado |
| `detalle_pago.saldo_cuota` | Cuánto falta pagar | Sí | Número ≥ 0 → centavos; menos de un centavo cuenta como 0 (D20) |
| `detalle_pago.valor_pago` | Cuánto se pagó (pago o exoneración, RN27) | Sí | Número ≥ 0 → centavos |
| `id_factura` | `0` = la cuota no tiene cobro; otro número = factura real | Sí | Número entero ≥ 0 |
| `num_factura` | Referencia de la factura que pagó | Sí, si `id_factura` ≠ 0 | Texto |
| `fecha_emision` | Fecha de pago | Sí, si `id_factura` ≠ 0 | Fecha `YYYY-MM-DD` |
| `success` | Solo se registra (D34) | No | Booleano |

Si a una fila de una cuota de Cobrix le falta un campo obligatorio o no se puede leer, esa factura queda «En revisión» con el detalle: nunca se marca pagada con una fila dudosa. Las filas de cuotas que Cobrix no tiene se descartan sin leerlas a fondo (CL8).

### 5.3 Resultados y contadores

Los códigos son uniones de literales en `src/shared/api-types.ts`. Cada código tiene un texto en español en el panel.

- **Importación:** `imported`, `already_imported`, `excluded_status`, `excluded_doc_type`, `outside_window`, `excluded_max`, `residual`, `blocked_by_cap`, `currency_not_usd`, `currency_incoherent`, `invalid_identification`, `unknown_status`, `inconsistent_response`, `lookup_failed`, `no_debt`, `unreadable_list_item`.
- **Pagadas:** `marked_paid`, `still_open`, `partial`, `under_review`, `no_evidence`, `lookup_failed`.

En una simulación se usan los mismos códigos; el panel los muestra como «Se importaría» o «Se marcaría pagada».

## 6. Cómo se cumple cada requisito

| Requisito | Dónde y cómo |
| --- | --- |
| RF1–RF3, RF7, RF8 | `PUT /api/configuracion` valida con los mismos rangos que el `CHECK` de la base. La contraseña vacía conserva la guardada. `GET` nunca la devuelve |
| RF4 | `probar-conexion` arma un cliente temporal con los datos del pedido (la contraseña guardada si viene vacía), hace login y cuenta `lista_ids_contratos` |
| RF5, RF6 | Campos de `providers` (fila 1); formulario en la pantalla Configuración |
| RF9, RF10, RF11–RF13 | `runs/import-run.ts`: login → lista → por contrato: `contrato/individual` → lector → `rules/import.ts` → acumula cambios → si no es simulación, `transaction()` con upserts de clientes y contratos, inserción de facturas y eventos |
| RF14–RF16 | `runs/paid-run.ts`: facturas abiertas agrupadas por contrato → `pago_informacion` → `rules/paid.ts` → relee el contrato solo si una cuota no está en el libro (RN29) → aplica en una transacción |
| RF17–RF20 | `runs/engine.ts`: crea la fila de `runs` en `running`, ejecuta, guarda contadores, filas y resumen, y cierra en `completed` o `failed` con el error |
| RF21, RN36 | El índice `UNIQUE` parcial sobre las corridas en curso. Un segundo `POST` responde `409` |
| RF22 | Corrida asíncrona y consulta cada segundo desde el panel |
| RF23–RF26 | `queries/customers.ts`: totales por cliente con SQL. La búsqueda normaliza el texto (sin acentos ni mayúsculas) y el documento con la misma función de RN1. Orden por defecto: vencimiento, con los que no tienen facturas abiertas al final |
| RF27–RF30 | `queries/customer-detail.ts`: cliente, contratos por `customer_key`, facturas y `events` con el enlace a su corrida |
| RF31–RF33 | `queries/summary.ts` |
| RF34 | `failInterruptedRuns` al arrancar (`main.ts`): las corridas que quedaron `running` pasan a `failed` con el motivo (DT12). Como cada corrida aplica todo en una transacción al final (DT3), no queda nada a medias |
| RF35–RF41 | Panel, según el skill `ui-ux`: `AlertDialog`, esqueletos, vacíos, errores con «Reintentar», toasts, `StatusBadge`, `lib/format.ts` y diseño para móvil primero |
| RN1–RN3 | `rules/identification.ts`: `normalizeIdentification(raw) → { key, document, personType } \| null` |
| RN4–RN6 | Upsert de `customers` por `customer_key`, solo si el contrato tiene al menos una cuota `imported`. Los datos salen del último contrato del titular, en orden de número |
| RN7 | Error del cliente HTTP en un contrato → fila `lookup_failed` y la corrida sigue |
| RN8, RN9, RN15 | `billing/readers.ts`: valida filas, `contrato_id`, cuotas duplicadas, la mezcla con `deuda_id: "0"`, coherencia de estado, titular, moneda y precio del plan, montos negativos, periodo futuro y `detalle_deuda` |
| RN10–RN21 | `rules/import.ts`: `classifyContract(contract, provider, today)` devuelve los resultados por cuota en el orden de la spec. `applyCaps(candidates, settings)` recorre por contrato y periodo. Lo importado se calcula contra el conjunto de `external_id` ya guardados |
| RN24–RN30 | `rules/paid.ts`: `classifyInvoice(invoice, ledgerRows, contractRow)` compara en centavos. Las filas del libro tienen que coincidir en contrato, periodo, saldo y monto pagado. Si la cuota no está en el libro, compara el saldo de la fila del contrato (`contractRow`) con el de Cobrix |
| RN31 | Error al leer el libro o el contrato → `lookup_failed` para las facturas de ese contrato |
| RN33, RN34 | Si el login o la lista fallan, la corrida se marca `failed` antes de escribir nada. Los cambios se aplican en una sola transacción al final |
| RN35 | Mismo código; `simulation = true` omite solo el paso de aplicar los cambios |
| RN38 | `billing/readers.ts`: `readContractList()` separa números válidos e ilegibles; los ilegibles se guardan como filas con `installment_id` y `contract_id` nulos y el valor crudo en `detail` |
| RN37 | `scheduler.ts`: hora real de Caracas. «Ya corrió hoy» = existe una corrida `auto` de importación iniciada hoy (fecha real de Caracas). Importación y después pagadas, siempre las dos |

## 7. Errores y casos límite

| Caso | Comportamiento |
| --- | --- |
| CL1 | `POST /api/corridas` → `409 provider_not_configured`; el panel lleva a Configuración |
| CL2 | Tiempo límite de 15 s por llamada. Si fallan el login o la lista, la corrida queda `failed` con un mensaje que dice qué pasó y qué hacer |
| CL3 | Se captura el error del contrato → `lookup_failed` → sigue con el siguiente |
| CL4 | Renovación preventiva del token y un reintento ante 401 |
| CL5 | Lista vacía → corrida `completed` con 0 contratos leídos |
| CL6 | `new Set()` sobre los números de contrato |
| CL7 | El lector ignora `success` |
| CL8 | Solo se miran las filas cuyo `id_cuota` corresponde a una factura abierta |
| CL9 | Se usa el saldo actual de las filas; una anulación devuelve la cuota a «Sigue pendiente» |
| CL10, CL11, CL12 | Upsert de cliente y contrato; las facturas no se tocan |
| CL13 | `409 run_in_progress` al pedir una corrida |
| CL14, CL15 | Vacío con «Limpiar búsqueda»; `404` → pantalla «No encontramos…» con un enlace para volver |
| CL16 | `no_evidence`; la factura sigue abierta |
| CL17 | `normalizeBaseUrl()` quita la barra final y `/api/v1` antes de armar las rutas |
| CL18 | El servidor responde 404 a cualquier ruta que no sea una pantalla del panel (`shared/panel-routes.ts`), con la página del panel, que muestra «No encontramos esa pantalla» |
| CL19 | `applyCaps` frena desde la primera cuota que supera el tope |
| CL20 | El programador encuentra el candado tomado → registra una corrida `auto` `failed`: «Ya había una corrida en curso» |
| CL21 | Las cuotas se ordenan por periodo antes de aplicar el máximo y los topes |
| CL22 | Lista sin `estado`; la prueba del ciclo verifica 27 contratos leídos |
| CL23 | `pagination.total` ≠ cantidad recibida o `total_pages` ≠ 1 → corrida `failed`, nada cambia |
| CL24 | `success` y `errors` se registran (D34), no deciden |
| CL25 | `data` no es lista → `failed`; elementos ilegibles → fila `unreadable_list_item` y la corrida sigue (RN38) |
| CL26 | Sin facturas abiertas → corrida `completed` con 0 consultadas, sin login ni llamadas al administrador |
| **Arranque con una corrida en `running`** (proceso cortado a mitad de camino) | Al iniciar, se marca `failed`: «Se interrumpió porque el servidor se reinició». Como los cambios van en una sola transacción, no quedó nada a medias |

## 8. Pruebas

**Automáticas (`node:test`, `npm test`):**

| Archivo | Cubre |
| --- | --- |
| `test/identification.test.ts` | RN1, RN2, RN3 con todos los ejemplos de la spec |
| `test/readers.test.ts` | RN8, RN9, RN10, RN15, RN38 y CL7, CL23–CL25: filas de otro contrato, cuotas duplicadas, mezcla con `"0"`, estado desconocido, detalle ilegible, periodo futuro, `success: false` |
| `test/import-rules.test.ts` | RN11–RN21 y CL19, CL21: estado, tipo de documento, moneda (no USD e incoherente), residual, ventana, máximo, ya importada, topes y orden |
| `test/paid-rules.test.ts` | RN24–RN30: pagada, abono parcial, sigue pendiente, exonerada, filas contradictorias o de otro contrato, saldo mayor, mes en curso, sin evidencia |
| `test/billing-client.test.ts` | CL4 (401 y relogin), CL17 (URL), CL2 (tiempo límite) y RN7, con un `fetch` falso |
| `test/ciclo.test.ts` | Contra la API simulada en una carpeta temporal: CA7–CA18 (importar, simular y configuraciones) y CA19–CA25 (pagos en la caja → pagadas → repetir → reimportar), con los números exactos |
| `test/api.test.ts` | API JSON por HTTP: CA2 (la contraseña no se devuelve), CA5, CA6 y CA43 (`400` con los campos), CA26 (fallida con credenciales malas), CA29 y CL13 (`409`), CL15 (`404`) |
| `test/panel-format.test.ts` | Lógica del panel sin pantalla: `lib/format.ts` (montos y fechas, RF39) y `lib/status.ts` (texto, tono e ícono de cada estado, RF38). Son funciones sin DOM, así que corren con `node:test` sin dependencias |
| `test/entorno.test.ts` | Se adapta solo el caso del panel: responde y `/simulador` da 404 (CL18) |
| `test/store.test.ts` | La base: coherencia de facturas, idempotencia, relaciones con `RESTRICT`, una sola corrida en curso y la corrida interrumpida (RF34, CA36) |

Los nombres de las pruebas llevan el ID que cubren (`it('RN25: …')`).

**El panel** no tiene pruebas de componentes ni de punta a punta: sus datos ya los prueba `api.test.ts` (el panel no tiene reglas de negocio) y su lógica chica, `panel-format.test.ts`. Con más tiempo, se sumarían 3 recorridos de punta a punta con Playwright (configurar → importar; pagar → actualizar pagadas; buscar → expediente); queda anotado para la nota.

**A mano**, con una lista en el README: CA1, CA3, CA4, CA27, CA28, CA30–CA35 y CA37–CA42 (pantallas, confirmaciones, avisos, móvil). Todas usan los datos del sandbox.

## 9. Decisiones técnicas

- **DT1.** ¿Cómo se levanta y con qué framework? → Un proceso con dos puertos, como el esqueleto: 4310 para la simulada y 4300 para Cobrix. La API HTTP es **NestJS** (con Express), para que el servidor tenga la estructura que reconoce un equipo backend: módulo, controladores, inyección y un filtro de errores. Nest vive solo en `src/server/`: las reglas, las corridas y la base no importan nada de Nest. Corre con `tsx` (`node --import tsx`), que transforma los decoradores; la inyección usa tokens explícitos porque no hay metadatos de tipos. `npm start` compila el panel (`vite build`) y levanta todo; `start:isp` y `start:cobrix`, cada parte por separado; `npm run dev`, Vite con proxy de `/api` al 4300. Motivo de un solo proceso: un comando, como pide el README.
- **DT2.** ¿Corridas síncronas o asíncronas? → Asíncronas: `202` y consulta periódica. Descartado: esperar la respuesta del `POST` y usar WebSockets o SSE. Motivo: RF22 pide ver el estado en curso, y consultar cada segundo es lo más simple.
- **DT3.** ¿Cómo se garantiza «fallida no cambia nada» y la simulación idéntica? → Leer y clasificar todo, y aplicar los cambios en **una** transacción al final. La simulación omite solo ese paso. Descartado: escribir sobre la marcha, o abrir la transacción y hacer `ROLLBACK` en la simulación. Motivo: un solo camino de código y nada a medias.
- **DT4.** ¿Dónde están las reglas? → En funciones puras en `src/cobrix/rules/`, sin I/O. Motivo: se prueban sin servidor y la simulación reutiliza exactamente lo mismo.
- **DT5.** ¿Base de datos? → `node:sqlite`, archivo `data/cobrix.sqlite` (no se entrega). En las pruebas, una base en una carpeta temporal.
- **DT6.** ¿Cómo se guarda la contraseña? → En la base local, cifrada con `node:crypto` (D53, `store/secret.ts`), y nunca sale por la API JSON.
- **DT7.** ¿Búsqueda y orden en el backend o en el panel? → En el backend: la normalización del documento es una regla (RN1) y vive en un solo lugar. Sin paginación (20 clientes).
- **DT8.** ¿Llamadas al administrador en paralelo? → No, en secuencia. Con 27 contratos tarda menos de un segundo, y evita saturar una API real.
- **DT9.** ¿Cómo sabe el programador si ya corrió hoy? → Por la tabla `runs`, sin estado extra. Con la hora y la fecha reales de Caracas (D22), no con `SANDBOX_TODAY`.
- **DT10.** ¿Panel? → React con Vite, React Router, TanStack Query, Tailwind y shadcn/ui, compilado en `dist/panel/` (no se entrega). Versiones exactas fijadas en `package.json` al instalar.
- **DT11.** ¿Contrato entre backend y panel? → Tipos en `src/shared/api-types.ts`, importados por los dos. Si cambia una respuesta, `typecheck` falla en ambos lados.
- **DT12.** ¿Qué pasa con una corrida que quedó `running` tras un corte? → Se marca `failed` al arrancar (sección 7).

## 10. Riesgos y preguntas abiertas

- **R1.** Un administrador real puede responder distinto al simulado. → Los lectores son estrictos y todo lo inesperado sale como «Respuesta inconsistente» con el detalle. Nada se adivina.
- **R2.** La fecha fijada (`SANDBOX_TODAY`) y el reloj real conviven. → «Hoy» para las reglas siempre sale de `today()`; la hora de la corrida automática usa el reloj real (D22). Se explica en el README.
- **R4.** La contraseña queda en un archivo local. → Va cifrada (D53); la base y su clave están en `.gitignore`.
- **R5.** Al reemplazar el esqueleto, el CI falla si no se adapta `entorno.test.ts`. → Se adapta en la misma tarea que pone React como panel.
- **R6.** El CI hoy corre `typecheck` y `test`, pero no compila el panel. → `typecheck` revisa también el `tsconfig` del panel, y se agrega `npm run build` al CI.
