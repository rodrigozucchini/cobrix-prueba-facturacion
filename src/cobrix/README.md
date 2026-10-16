# `src/cobrix/`: la integración

Todo el lado de Cobrix, sin HTTP propio ni pantallas (eso está en `src/server/` y `src/panel/`).

| Carpeta | Qué hace |
| --- | --- |
| `billing/` | `client.ts` habla con la API del administrador (login con token, contratos, libro de cuotas). `readers.ts` lee cada respuesta de forma estricta: lo raro no se adivina, vuelve con su motivo |
| `rules/` | Las reglas de la sección 4 del enunciado, como funciones puras: identificación, qué se importa y qué se marca pagado |
| `runs/` | Las corridas. `engine.ts` las arranca, una a la vez, y aplica todo en una sola transacción al final; `import-run.ts` y `paid-run.ts` clasifican. «Simular» corre el mismo código sin aplicar |
| `store/` | La base propia (`node:sqlite`): esquema, lectura y escritura. `secret.ts` cifra la contraseña del proveedor |
| `queries/` | Lo que piden las pantallas: clientes, expediente, resumen, antigüedad de la deuda y estado de cuenta |
| `settings/` | Validación de la configuración y qué cambió al guardarla |
| `export/` | El CSV para Excel en español |
| `scheduler.ts` | La corrida automática diaria |
| `audit.ts` | El registro de auditoría, fuera de la base |
