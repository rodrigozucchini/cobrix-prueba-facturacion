# Modelo de datos: Cobrix · integración con el administrador de facturas v1

Parte del plan técnico (`plan.md` §4). Basado en `spec.md` v1.

Base propia: `data/cobrix.sqlite` (variable `COBRIX_DB`). Dinero en centavos (`INTEGER`). Fechas civiles como `TEXT` `YYYY-MM-DD`, calculadas con `today()` (fecha de trabajo). Momentos como `TEXT` ISO en UTC, con la **hora real** (`new Date()`), aunque la fecha de trabajo esté fijada (D35).

**Un solo administrador de facturas (D39).** Su configuración es la única fila de `providers`; contratos, facturas y corridas son de ese administrador.

**Nada se borra con relaciones (D38).** Todas las FK están activas (`PRAGMA foreign_keys = ON`) y son `ON DELETE RESTRICT`: la base rechaza borrar algo que otra fila usa. Nada se borra en cascada, y Cobrix no tiene ninguna acción que borre datos.

## Relaciones

```
settings      (1 fila: datos de la empresa)

providers ──1───N── contracts ──1───N── invoices
    │                                       │
    ├──1───N── invoices                     │
    └──1───N── runs ──1───N── run_rows      │
                 │                          │
customers ──1───N── invoices ───────────────┘
    │            ▲
    └──1───N── events ──N───1── invoices (opcional)
                 │
               runs (qué corrida produjo el evento; también la que creó o pagó cada factura)

customers ┄┄┄ contracts   sin FK: se guardan contratos de titulares que no son clientes
run_rows  ┄┄┄ (todo)      sin FK: cada fila es una «foto» de lo que pasó en la corrida
```

## Tablas

| Tabla | Columnas | Claves y reglas |
| --- | --- | --- |
| `settings` | `id` (= 1), `company_name`, `company_rif`, `company_email`, `updated_at` | Una sola fila: los datos de la empresa (RF1) |
| `providers` | `id`, `name`, `api_url`, `api_user`, `api_password` (cifrada, D53), `import_states` (JSON), `window_months` (nulo = sin ventana), `max_recent` (nulo = todas), `grace_days`, `cap_invoices`, `cap_amount_cents`, `excluded_doc_types` (JSON), `auto_enabled`, `auto_hour`, `updated_at` | PK `id` con `CHECK (id = 1)`: una sola fila, creada con los valores por defecto (D4). `CHECK` de rangos (RF2, RF5, RF6) |
| `customers` | `customer_key`, `document`, `name`, `person_type`, `email`, `phone`, `origin`, `created_at`, `created_run_id`, `updated_at` | PK `customer_key` (ID de cliente, RN4). `person_type` ∈ (`natural`, `juridica`). `created_run_id` → `runs`. |
| `contracts` | `number`, `customer_key`, `holder_name`, `status`, `plan`, `price_cents`, `branch`, `updated_at` | PK `number`. `customer_key` **sin FK** y nulo si la identificación es inválida. `status` con `CHECK` de los 6 estados. Upsert en cada importación real (RF13) |
| `invoices` | `id`, `external_id`, `contract_number`, `customer_key`, `period`, `due_date`, `cut_date`, `total_cents`, `balance_cents`, `status`, `paid_at`, `paid_ref`, `created_run_id`, `paid_run_id` | PK `id` sin `AUTOINCREMENT` (vuelve a 1 después de borrar; arma el número `CBX-`, RN22). **UNIQUE (`external_id`)**: idempotencia (RN19). `contract_number` → `contracts`; `customer_key` → `customers`; `created_run_id` y `paid_run_id` → `runs`. **Coherencia (`CHECK`)**: `open` → saldo = total y sin datos de pago; `paid` → saldo 0, con `paid_at` y `paid_ref` (D16) |
| `runs` | `id`, `kind`, `simulation`, `origin`, `status`, `started_at`, `finished_at`, `error`, `summary`, `counters` (JSON), `warnings` (JSON), `technical` (JSON) | PK `id`. `kind` ∈ (`import`, `paid`); `origin` ∈ (`manual`, `auto`); `status` ∈ (`running`, `completed`, `failed`). Índice único parcial sobre `status = 'running'`: una sola corrida en curso (RN36). `warnings`: avisos del administrador (CL24); `technical`: datos internos, como `successFalseWithData` (D34) |
| `run_rows` | `id`, `run_id`, `contract_number`, `installment_id`, `customer_key`, `customer_name`, `period`, `outcome`, `reason`, `amount_cents`, `detail` (JSON) | `run_id` → `runs`. El resto **sin FK**: en una simulación el cliente no existe y un contrato ilegible no tiene número. `installment_id` nulo si la fila es del contrato |
| `events` | `id`, `customer_key`, `kind`, `invoice_id`, `run_id`, `at`, `detail` (JSON) | `customer_key` → `customers`; `invoice_id` → `invoices` (nulo en «cliente creado»); `run_id` → `runs`. `kind` ∈ (`customer_created`, `invoice_imported`, `invoice_paid`) |

**Índices:** facturas por (`customer_key`, `status`); facturas por `contract_number`; contratos por `customer_key`; filas por `run_id`; eventos por `customer_key`; corridas por `started_at`.
