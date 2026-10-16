# Fase A — Auditoría (punto diferencial)

**Tareas:** T070–T074

## Qué quedó

- **Registro fuera de la base:** una línea JSON por acción en `logs/cobrix-AAAA-MM-DD.log` (la carpeta se cambia con `COBRIX_AUDIT_DIR`). Solo agrega líneas.
- Guardar la configuración queda registrado con los campos que cambiaron; la contraseña, solo como `(cambiada)`.
- Si no se puede escribir, la acción sigue y se avisa en la consola.

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| I13 | Un guardado rechazado por validación no se registra | No cambió nada |
| I14 | Los datos de una acción no pueden pisar `at`, `actor` ni `action` | Nadie puede falsear quién, qué o cuándo |
| I15 | El servidor no arranca sin el registro | Ninguna ruta nueva se puede olvidar de registrar |

## Verificación

- 37 pruebas en verde, escritas antes del código.
- Con el sistema real: el archivo se nombra con la fecha real de Caracas (DT17) y la contraseña aparece 0 veces (CA53).
