/**
 * El esquema de la base, tal como lo describe specs/data-model.md: un solo administrador (una
 * fila en `providers`), FK sin borrado en cascada (RESTRICT) y CHECK que mantienen cada fila coherente.
 */

export const COBRIX_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	company_name TEXT NOT NULL DEFAULT '',
	company_rif TEXT NOT NULL DEFAULT '',
	company_email TEXT NOT NULL DEFAULT '',
	updated_at TEXT
);

CREATE TABLE IF NOT EXISTS providers (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	name TEXT NOT NULL,
	api_url TEXT NOT NULL DEFAULT '',
	api_user TEXT NOT NULL DEFAULT '',
	api_password TEXT NOT NULL DEFAULT '',
	import_states TEXT NOT NULL CHECK (json_valid(import_states) AND json_array_length(import_states) >= 1),
	window_months INTEGER CHECK (window_months IS NULL OR window_months IN (3, 6, 9, 12)),
	max_recent INTEGER CHECK (max_recent IS NULL OR max_recent BETWEEN 1 AND 60),
	grace_days INTEGER NOT NULL CHECK (grace_days BETWEEN 0 AND 60),
	cap_invoices INTEGER NOT NULL CHECK (cap_invoices >= 1),
	cap_amount_cents INTEGER NOT NULL CHECK (cap_amount_cents >= 1),
	excluded_doc_types TEXT NOT NULL CHECK (json_valid(excluded_doc_types)),
	auto_enabled INTEGER NOT NULL CHECK (auto_enabled IN (0, 1)),
	auto_hour INTEGER CHECK (auto_hour IS NULL OR auto_hour BETWEEN 0 AND 23),
	updated_at TEXT,
	CHECK (auto_enabled = 0 OR auto_hour IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS runs (
	id INTEGER PRIMARY KEY,
	kind TEXT NOT NULL CHECK (kind IN ('import', 'paid')),
	simulation INTEGER NOT NULL CHECK (simulation IN (0, 1)),
	origin TEXT NOT NULL CHECK (origin IN ('manual', 'auto')),
	status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
	started_at TEXT NOT NULL,
	finished_at TEXT,
	error TEXT,
	summary TEXT,
	counters TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(counters)),
	warnings TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings)),
	technical TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(technical))
);

CREATE TABLE IF NOT EXISTS customers (
	customer_key TEXT PRIMARY KEY,
	document TEXT NOT NULL,
	name TEXT NOT NULL,
	person_type TEXT NOT NULL CHECK (person_type IN ('natural', 'juridica')),
	email TEXT,
	phone TEXT,
	origin TEXT NOT NULL,
	created_at TEXT NOT NULL,
	created_run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
	updated_at TEXT NOT NULL
);

-- customer_key sin FK a propósito: también se guardan contratos de titulares que no son clientes.
CREATE TABLE IF NOT EXISTS contracts (
	number INTEGER PRIMARY KEY,
	customer_key TEXT,
	holder_name TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO')),
	plan TEXT,
	price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
	branch TEXT,
	updated_at TEXT NOT NULL
);

-- id sin AUTOINCREMENT: es el número de factura (CBX-000001, RN22).
CREATE TABLE IF NOT EXISTS invoices (
	id INTEGER PRIMARY KEY,
	external_id TEXT NOT NULL UNIQUE,
	contract_number INTEGER NOT NULL REFERENCES contracts(number) ON DELETE RESTRICT,
	customer_key TEXT NOT NULL REFERENCES customers(customer_key) ON DELETE RESTRICT,
	period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	due_date TEXT NOT NULL,
	cut_date TEXT NOT NULL,
	total_cents INTEGER NOT NULL CHECK (total_cents > 0),
	balance_cents INTEGER NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('open', 'paid')),
	paid_at TEXT,
	paid_ref TEXT,
	created_run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
	paid_run_id INTEGER REFERENCES runs(id) ON DELETE RESTRICT,
	-- Coherencia (D16): abierta, con todo su saldo y sin pago; pagada, en 0 y con su pago.
	CHECK (
		(status = 'open' AND balance_cents = total_cents AND paid_at IS NULL AND paid_ref IS NULL AND paid_run_id IS NULL)
		OR (status = 'paid' AND balance_cents = 0 AND paid_at IS NOT NULL AND paid_ref IS NOT NULL AND paid_run_id IS NOT NULL)
	)
);

-- Salvo run_id, es una foto de lo que pasó: sin FK (un cliente simulado no existe).
CREATE TABLE IF NOT EXISTS run_rows (
	id INTEGER PRIMARY KEY,
	run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
	contract_number INTEGER,
	installment_id TEXT,
	customer_key TEXT,
	customer_name TEXT,
	period TEXT,
	outcome TEXT NOT NULL,
	reason TEXT NOT NULL,
	amount_cents INTEGER,
	detail TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail))
);

CREATE TABLE IF NOT EXISTS events (
	id INTEGER PRIMARY KEY,
	customer_key TEXT NOT NULL REFERENCES customers(customer_key) ON DELETE RESTRICT,
	kind TEXT NOT NULL CHECK (kind IN ('customer_created', 'invoice_imported', 'invoice_paid')),
	invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT,
	run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
	at TEXT NOT NULL,
	detail TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail)),
	CHECK ((kind = 'customer_created') = (invoice_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS runs_one_running ON runs(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS runs_started ON runs(started_at);
CREATE INDEX IF NOT EXISTS invoices_customer_status ON invoices(customer_key, status);
CREATE INDEX IF NOT EXISTS invoices_contract ON invoices(contract_number);
CREATE INDEX IF NOT EXISTS contracts_customer ON contracts(customer_key);
CREATE INDEX IF NOT EXISTS run_rows_run ON run_rows(run_id);
CREATE INDEX IF NOT EXISTS events_customer ON events(customer_key);
`
