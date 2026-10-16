# Arquitectura

Cómo está armado Cobrix, en una página. El detalle está en [`specs/plan.md`](specs/plan.md) y [`specs/data-model.md`](specs/data-model.md).

## Las tres partes

```
 navegador ──HTTP──► Cobrix (:4300) ─────────────────────────────HTTP──► Administrador de facturas (:4310)
 (panel React)        │                                                   src/billing-api/ (simulado, no se toca)
                      ├─ src/server/   NestJS: API JSON /api/* + panel compilado
                      ├─ src/cobrix/   reglas, corridas, cliente HTTP, base
                      └─ data/cobrix.sqlite (base propia) · logs/ (auditoría)
```

- **El administrador de facturas** es el sistema del ISP. Cobrix solo le habla por su API (`/api/v1`): nunca toca su base ni su simulador.
- **Cobrix** importa clientes y facturas, actualiza las pagadas y guarda todo en **su propia base**.
- **El panel** solo muestra lo que le da la API de Cobrix. No calcula deudas ni decide estados: eso vive en el backend, así cualquier otra app puede usar la misma API.

## Capas del backend

| Capa | Dónde | Qué hace | Depende de |
| --- | --- | --- | --- |
| **HTTP** | `src/server/` | NestJS: un controlador por recurso, el filtro de errores y el middleware (panel, cabeceras, CSRF) | `cobrix/` |
| **Corridas** | `src/cobrix/runs/` | Importar y actualizar pagadas: leen todo, clasifican y aplican en **una** transacción | `billing/`, `rules/`, `store/` |
| **Reglas** | `src/cobrix/rules/` | Funciones puras: identificación, qué se importa y qué se marca pagado | Nada |
| **Cliente del ISP** | `src/cobrix/billing/` | Login con token, las tres rutas que se leen y la **lectura estricta** de cada respuesta | `fetch` |
| **Base** | `src/cobrix/store/` | SQLite (`node:sqlite`): esquema, lecturas, escrituras y la contraseña cifrada | `node:sqlite` |
| **Consultas** | `src/cobrix/queries/` | Lo que piden las pantallas: clientes, expediente, resumen, antigüedad y estado de cuenta | `store/` |
| **Compartido** | `src/shared/` | Tipos de la API JSON, fechas, montos y nombres de resultados, para el backend y el panel | Nada |

**La regla que ordena todo:** las reglas no saben de HTTP ni de la base, y `src/cobrix/` no sabe que existe Nest. Por eso las reglas se prueban sin servidor.

## La API JSON (controladores de Nest)

| Controlador | Rutas | Requisitos |
| --- | --- | --- |
| `SettingsController` | `GET` y `PUT /api/configuracion` · `POST /api/configuracion/probar-conexion` | RF1–RF8 |
| `RunsController` | `POST` y `GET /api/corridas` · `GET /api/corridas/:id` | RF17–RF22 |
| `CustomersController` | `GET /api/clientes` · `/api/clientes/:id` · `/api/clientes/:id/estado-de-cuenta` | RF23–RF30, extras RF47 |
| `SummaryController` | `GET /api/resumen` | RF31–RF33 |
| `ExportsController` | `GET /api/clientes.csv` · `/api/corridas/:id.csv` | extras RF44–RF46 |

- **Errores:** siempre `{ "error": { "code", "message" } }`, con el mensaje en español y qué hacer.
- **Inyección:** con tokens explícitos (`DB`, `AUDIT`, `NOW`, `ENGINE`). Los valores se crean afuera, así `main.ts` y las pruebas arman la misma app.

## Cómo funciona una corrida

```
POST /api/corridas ──► 202 enseguida ──► en segundo plano:
   1. login y lista de contratos      (si falla: corrida fallida, nada cambia)
   2. leer cada contrato              (un contrato con problemas queda en su fila; la corrida sigue)
   3. clasificar con las reglas puras
   4. aplicar en UNA transacción      (la simulación corre igual y se salta este paso)
   5. cerrar con contadores, una fila por cuota y su motivo
```

- **Una corrida a la vez:** la garantiza un índice único de la base.
- **Idempotencia:** el `deuda_id` es único, así reimportar no duplica.
- **Nunca se adivina:** un dato raro deja fuera esa cuota o contrato con su motivo; nunca entra mal.
- **Pagadas:** solo con evidencia completa en el libro de cuotas. Un abono parcial se informa y no rebaja el saldo.
- **Corrida automática:** cada 30 s se mira el reloj real de Caracas; a la hora elegida corre importar y después pagadas.

## Datos

Ocho tablas en `data/cobrix.sqlite`: `settings` (empresa), `providers` (la configuración del administrador), `runs` y `run_rows` (cada corrida y su detalle), `customers`, `contracts`, `invoices` y `events` (el historial del expediente). Las claves foráneas no borran en cascada, y Cobrix no tiene ninguna acción que borre datos.

**La auditoría está fuera de la base** (`logs/`, una línea JSON por acción), así sobrevive aunque la base se dañe.

## Seguridad

- La contraseña del proveedor se guarda **cifrada** (AES-256-GCM), con la clave fuera de la base, y nunca sale por la API.
- Las escrituras solo se aceptan como **JSON y desde el propio panel** (CSRF).
- Todas las respuestas llevan **cabeceras de seguridad**.
- No hay login: escucha solo en `127.0.0.1` y es de un solo operador.

## Pruebas

Corren con `node:test`. Las de la API y del ciclo levantan la **app real** (`createCobrixApp`) contra el administrador simulado, en una carpeta temporal. Cubren las reglas con los ejemplos del enunciado, el ciclo completo (importar → pagar → actualizar → repetir), la API, el punto diferencial y la seguridad. Del panel se prueban `format.ts` y `status.ts`; las pantallas se verifican a mano con [`specs/verificacion.md`](specs/verificacion.md).
