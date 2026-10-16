# Plan técnico: Cobrix · punto diferencial v1

Basado en: `extras/punto-diferencial/spec.md` v1, `specs/plan.md`, `specs/data-model.md` y `constitution.md`. Sigue los skills `stack-node`, `tipado-ts` y `ui-ux`. Todo lo del plan base sigue valiendo; acá va solo lo que se agrega o cambia.

## 1. Enfoque en pocas líneas

Cuatro agregados chicos, sin dependencias nuevas y sin tablas nuevas:

- la **antigüedad** es una consulta SQL más sobre las facturas abiertas;
- el **CSV** lo arma el backend en rutas propias, así las reglas de formato y el registro de la exportación quedan en un solo lugar;
- el **estado de cuenta** es una pantalla del panel pensada para la impresión del navegador (`@media print`), alimentada por una ruta JSON;
- la **auditoría** es un módulo que agrega líneas JSON a un archivo diario fuera de la base, y que todas las acciones del backend llaman.

## 2. Revisión contra la constitution

| Principio | Cómo lo cumple este plan |
| --- | --- |
| 1. Simplicidad ante todo | Sin dependencias: CSV a mano, PDF con la impresión del navegador y archivo con `node:fs`. Sin tablas nuevas |
| 2. Idioma y mercado | CSV para Excel en español (`;`, coma decimal, `dd/mm/aaaa`); estado de cuenta en USD con RIF y fecha de Caracas |
| 3. Cero alcance fantasma | Solo lo de `spec.md` (RF42–RF54). Nada de envío de correos, PDF en el servidor ni pantalla de logs |
| 4. Nunca se adivina | La antigüedad usa la fecha de trabajo y el saldo de Cobrix. El CSV escapa todo lo que podría romper columnas |
| 5. Repetible y explicable | La auditoría deja rastro de cada acción, aunque se borren los datos |
| 6. Verificable sin leer código | CA44–CA54 se comprueban con el panel, Excel y el archivo del día |
| 7. Datos con respeto | La auditoría nunca escribe contraseñas ni tokens: la contraseña solo aparece como «(cambiada)» |

## 3. Arquitectura

```
src/cobrix/
  audit.ts                 ← NUEVO: createAuditLog({ dir, now }) → record(actor, action, data)
  queries/aging.ts         ← NUEVO: tramos de antigüedad; filtro por tramo para clientes
  queries/statement.ts     ← NUEVO: datos del estado de cuenta
  export/csv.ts            ← NUEVO: toCsv(columnas, filas) con las reglas de RN42
src/server/                ← rutas nuevas (§5) y llamadas a audit.record() en cada acción
src/shared/api-types.ts    ← tipos nuevos: AgingBucket, StatementResponse
src/panel/
  routes/Resumen           ← bloque «Antigüedad de la deuda»
  routes/Clientes          ← filtro por tramo y botón «Exportar CSV»
  routes/Corrida           ← botón «Exportar CSV»
  routes/EstadoDeCuenta    ← NUEVA: hoja imprimible, fuera del layout del panel
```

| Pieza | Qué hace | Habla con |
| --- | --- | --- |
| `audit.ts` | Agrega una línea JSON a `<dir>/cobrix-AAAA-MM-DD.log` con `appendFileSync`. Crea la carpeta si no existe. Si falla, avisa con `console.error` y **no lanza error** (RF54). Reloj inyectable para probar el cambio de día | `node:fs` |
| `queries/aging.ts` | `CASE` sobre los días entre `due_date` y la fecha de trabajo (`today()`, pasada como parámetro, nunca `date('now')`) | `store` |
| `export/csv.ts` | Arma el texto con BOM UTF-8, `;`, comillas cuando hace falta y saltos `\r\n` (lo que espera Excel) | — |
| `queries/statement.ts` | Empresa, cliente, facturas abiertas y total; indica si la empresa está incompleta | `store` |

## 4. Modelo de datos

**Sin cambios en la base.** La antigüedad y el estado de cuenta se calculan sobre `invoices`, `customers` y `settings`. El registro de auditoría **no está en la base** (D48): son archivos en la carpeta `COBRIX_AUDIT_DIR` (por defecto `logs/`, en `.gitignore`).

## 5. Contratos

### 5.1 Rutas nuevas o cambiadas de la API JSON

| Ruta | Pedido | Respuesta | Errores |
| --- | --- | --- | --- |
| `GET /api/resumen` (cambia) | — | Suma `aging`: 4 tramos con `count` y `amountCents` | — |
| `GET /api/clientes?tramo=` (cambia) | `tramo` ∈ `0-30`, `31-60`, `61-90`, `90+` | Solo los clientes con al menos una factura abierta en ese tramo (RN41) | `400` si el tramo no es válido |
| `GET /api/clientes.csv?q=&orden=&tramo=` | Los mismos filtros que la tabla | `text/csv; charset=utf-8` con `Content-Disposition: attachment; filename="clientes-AAAA-MM-DD.csv"` | `400` |
| `GET /api/corridas/:id.csv?resultado=` | Filtro por resultado | CSV `corrida-N.csv` | `404`, `400` |
| `GET /api/clientes/:id/estado-de-cuenta` | — | `StatementResponse`: empresa, cliente, fecha de emisión, facturas abiertas y total | `404`; `409 company_incomplete` (RF48) |

Las rutas CSV y la del estado de cuenta registran su acción en la auditoría **del lado del servidor**. Por eso el CSV no se arma en el panel: si se armara allá, la exportación no quedaría registrada.

### 5.2 Columnas del CSV

| Archivo | Columnas (en este orden) |
| --- | --- |
| Clientes | Nombre; Documento; Tipo; Contratos; Facturas abiertas; Facturas pagadas; Deuda (USD); Vencimiento más antiguo |
| Corrida | Contrato; Cuota; Cliente; Resultado; Motivo; Monto (USD) |

Los montos van como `1235,00`, las fechas como `13/10/2026` y «Sin facturas abiertas» como texto. El resultado de la corrida usa el mismo texto en español que el panel.

### 5.3 Línea de auditoría

```ts
interface AuditEntry {
	readonly at: string            // ISO en UTC, hora real (D35)
	readonly actor: 'operador' | 'sistema'
	readonly action: 'settings.saved' | 'connection.tested' | 'run.started' | 'run.finished'
		| 'export.csv' | 'statement.generated'
	readonly [key: string]: unknown // datos de la acción, nunca secretos
}
```

| Acción | Dónde se llama | Datos |
| --- | --- | --- |
| `settings.saved` | `PUT /api/configuracion` | `changed`: campos que cambiaron con su valor nuevo; `apiPassword: "(cambiada)"` (RN45) |
| `connection.tested` | `probar-conexion` | `ok`, `contracts` o `message` |
| `run.started` / `run.finished` | Motor de corridas | `runId`, `kind`, `simulation`, `origin`; al terminar, `status` y `summary` o `error`. `actor` = `sistema` si `origin = auto` |
| `export.csv` | Rutas `.csv` | `file`, `rows`, filtros aplicados |
| `statement.generated` | Ruta del estado de cuenta | `customer`, `openInvoices`, `totalCents` |

## 6. Cómo se cumple cada requisito

| Requisito | Dónde y cómo |
| --- | --- |
| RF42, RN39, RN40 | `queries/aging.ts`: días = `julianday(:today) - julianday(due_date)` sobre las facturas `open`, agrupados con `CASE`. Siempre devuelve los 4 tramos, aunque estén en 0 (CL27, CL28). Bloque en el Resumen con 4 tarjetas |
| RF43, RN41 | Parámetro `tramo` en `GET /api/clientes` (`EXISTS` sobre las facturas abiertas del cliente en ese rango) y en la URL del panel (`?tramo=90+`), con un chip «Tramo: más de 90 días ✕» |
| RF44–RF46, RN42 | `export/csv.ts` más las rutas `.csv`; reutilizan las mismas consultas que la tabla y el detalle, con los mismos filtros. El panel descarga con un enlace normal (`<a href download>`) |
| RF47, RN43 | Ruta del panel `/clientes/:id/estado-de-cuenta`, **sin** el layout (sin menú). CSS de impresión: `@page { size: A4; margin: 15mm }` y `@media print` oculta los botones. Botón «Imprimir / Guardar PDF» que llama a `window.print()` |
| RF48 | La API responde `409 company_incomplete`; la pantalla muestra el aviso con el enlace a Configuración |
| RF49 | Con 0 facturas abiertas, la hoja muestra la constancia «Sin facturas abiertas al …» |
| RF50, RF51, RN44, RN45 | `audit.ts` y sus llamadas en cada acción (§5.3). Solo `appendFileSync`; no existe ninguna función que modifique o borre |
| RF52 | Lista blanca: solo se escriben los campos de §5.3. `settings.saved` reemplaza la contraseña por «(cambiada)» antes de escribir |
| RF53 | `COBRIX_AUDIT_DIR` (por defecto `logs/`). Nombre del archivo con la **fecha real de Caracas** del momento de escribir |
| RF54 | `try/catch` dentro de `record()`: ante un error, `console.error` y la acción sigue |

## 7. Errores y casos límite

| Caso | Comportamiento |
| --- | --- |
| CL27, CL28 | La consulta devuelve los 4 tramos en 0. Un tramo vacío en Clientes muestra «No hay clientes con deuda en este tramo» |
| CL29 | `toCsv` con 0 filas → solo la fila de encabezados |
| CL30 | Comillas cuando el texto tiene `;`, `"`, `,` o un salto de línea, con las comillas internas duplicadas |
| CL31 | `mkdirSync(dir, { recursive: true })` antes de escribir |
| CL32 | El nombre del archivo se calcula en cada escritura, no al arrancar |
| CL33 | La hoja es responsive en pantalla; la impresión siempre usa A4 |

## 8. Pruebas

| Archivo | Cubre |
| --- | --- |
| `test/aging.test.ts` | RN39–RN41, CL27, CL28; CA44 y CA45 contra la API simulada (recién importado y después del ciclo) y CA46 (filtro) |
| `test/csv.test.ts` | RN42 y CL29, CL30 con textos difíciles; columnas, BOM, `;`, coma decimal y fechas. CA47 y CA48 por HTTP (cantidad de filas con búsqueda y filtro) |
| `test/statement.test.ts` | RN43, CA49 (LUIS: 4 facturas, USD 95,00), CA50 (`409` sin empresa) y CA51 (constancia de ANA) |
| `test/audit.test.ts` | RF50–RF54 y CL31, CL32: solo agrega; crea la carpeta; cambio de día con reloj de prueba; ninguna línea tiene la contraseña (CA53); una carpeta sin permiso de escritura no frena la acción; cada acción agrega su línea sin tocar las anteriores (CA52) |

**A mano:** abrir los CSV en Excel o LibreOffice en español (CA47) y la vista de impresión del estado de cuenta en A4 (CA49, CL33). Van en la lista de verificación del README.

## 9. Decisiones técnicas

- **DT13.** ¿Dónde se arma el CSV? → En el backend. Descartado: en el panel. Motivo: así la exportación queda registrada en la auditoría (RF51) y las reglas de formato viven en un solo lugar.
- **DT14.** ¿Cómo se genera el PDF? → Con la impresión del navegador sobre una hoja con CSS de impresión. Descartado: una librería de PDF en el servidor. Motivo: cero dependencias (principio 1) y el resultado es igual de útil.
- **DT15.** ¿Formato de la auditoría? → Una línea JSON por acción (JSON Lines). Lo lee una persona y lo leen las herramientas que recogen logs para mandarlos a otro servidor.
- **DT16.** ¿Escritura síncrona? → Sí, `appendFileSync`: la línea queda escrita antes de responder. Con un solo proceso y pocas acciones por minuto, el costo es despreciable.
- **DT17.** ¿Qué fecha usa el nombre del archivo? → La fecha **real** de Caracas, como los momentos (D35), no la fecha de trabajo fijada para la prueba.
- **DT18.** ¿Qué pasa con los «logs del servidor» de la fase 6 del plan base? → Los reemplaza la auditoría (D48). En la consola quedan solo los avisos de errores inesperados que ya existían (`console.error`).

## 10. Riesgos y preguntas abiertas

- **R7.** Excel puede abrir mal un CSV sin BOM, o con otro separador si está configurado en inglés. → BOM UTF-8 y `;`, que es lo que usa Excel en español. Para Excel en inglés se puede usar «Datos → Desde texto». Se aclara en el README.
- **R8.** La vista de impresión cambia un poco entre navegadores. → Se prueba en Chrome y Firefox; el CSS de impresión es simple, sin posiciones fijas.
- **R9.** La carpeta de auditoría crece sin límite. → Es lo decidido (D51). En la nota se aclara que rotarla es tarea de quien administra el servidor (por ejemplo, con `logrotate`).
