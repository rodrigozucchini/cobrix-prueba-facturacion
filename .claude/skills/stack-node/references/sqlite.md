# SQLite: almacenamiento de Cobrix (`node:sqlite`)

- `DatabaseSync` de `node:sqlite`. Archivo propio de Cobrix, **separado** de la base del administrador; la ruta sale de una variable de entorno con un valor por defecto.
- **Esquema** en un string SQL con `CREATE TABLE IF NOT EXISTS`, igual que `src/billing-api/schema.ts`. Al abrir la base se ejecuta `PRAGMA foreign_keys = ON`.
- **Siempre consultas preparadas** con `?`. Nunca se arma SQL concatenando valores.
- **Tipos en la base:**
  - dinero: `INTEGER` en centavos;
  - fechas: `TEXT` (`YYYY-MM-DD`, o ISO con hora para los momentos);
  - booleanos: `INTEGER` 0 o 1;
  - estados: `TEXT` con un `CHECK` de los valores posibles.
- **Las filas que devuelve SQLite son `unknown`:** se convierten a tipos del dominio en una sola función por tabla.
- **Idempotencia en la base:** restricciones `UNIQUE` sobre la identidad externa, por ejemplo la cuota del administrador. Se usa `INSERT … ON CONFLICT` en lugar de consultar y después insertar.
- **Transacciones:** una función auxiliar `transaction(db, fn)` que hace `BEGIN`, ejecuta `fn` y cierra con `COMMIT`, o con `ROLLBACK` si falla. Todo lo que una corrida escribe va en una transacción.
- **Simular** usa la misma lógica y solo omite el paso de aplicar los cambios (plan DT3): se lee y se clasifica todo, y los cambios se aplican en una transacción al final solo si no es simulación.
- **El esquema completo** (tablas, FK, índices, coherencia) está en `specs/data-model.md`. Es la fuente de verdad: no se inventan tablas ni columnas fuera de ahí.
- **FK siempre activas y con `ON DELETE RESTRICT`.** Nada se borra en cascada, y Cobrix no tiene ninguna acción que borre datos.
- En las pruebas: una base nueva en `:memory:` o en una carpeta temporal por prueba.
