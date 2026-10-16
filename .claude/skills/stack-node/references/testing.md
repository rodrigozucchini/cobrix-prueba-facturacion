# Pruebas (`node:test`)

- **El backend tiene las pruebas automáticas.** Del panel se prueba solo su lógica chica (`lib/format.ts` y `lib/status.ts`) con `node:test`, en `test/panel-format.test.ts`; las pantallas se revisan con `typecheck` y a mano.
- `describe` e `it` de `node:test` y `assert` de `node:assert/strict`. Archivos `test/*.test.ts`.
- **Nombres en español** que dicen el comportamiento: `it('una cuota con deuda 0 no se importa')`. Si la prueba cubre una regla de la spec, el nombre lleva su ID: `it('RN4: …')`.
- **Fecha fija:** `process.env.SANDBOX_TODAY = '2026-10-13'` al principio del archivo.
- **Con la API real del sandbox**, como en `test/entorno.test.ts`:
  - `seedBillingApi` en una carpeta temporal;
  - `createBillingApiServer` escuchando en el puerto `0`;
  - limpieza en `after`.
  
  Los pagos se crean con las rutas `/__sim/*`, igual que lo haría una persona.
- **Lógica pura sin servidor:** la normalización de la identificación y la lectura de `detalle_deuda` se prueban llamando a la función directamente.
- **Respuestas raras de la API** que el sandbox no produce: se prueban pasando un `fetch` falso al cliente. Sin librerías de mocks.
- **API JSON de Cobrix:** al menos una prueba que recorre el ciclo por HTTP, como lo haría el panel, y verifica los códigos de error (`400`, `404`, `409`).
- **Cobertura mínima:**
  - una prueba por cada regla de negocio (RN);
  - el ciclo completo importar → pagar en la caja → actualizar pagadas, con los números de los criterios de aceptación;
  - correr dos veces no cambia nada.
- **`test/entorno.test.ts` es del entorno entregado:** los casos de la API (login, contratos, cuotas y rutas de Swagger) no se tocan. Solo se adapta el caso del panel cuando React pasa a ser el panel: deja de buscar «Por implementar» en el HTML, pero sigue comprobando que el panel responde y que **no** tiene pantalla de simulador (`/simulador` da 404). El cambio se anota en la nota de decisiones.
- Las pruebas no dependen del orden ni de datos que haya dejado otra prueba (`--test-concurrency=1` ya viene en el script).
