# Fase 3 — Importación

**Tareas:** T030–T039 y T076

## Objetivo

Simular e importar desde Sincronización y ver el detalle de cada corrida, con una fila por cuota y su motivo (CA7–CA18, CA26–CA29).

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| P7 | Lo que es del contrato (estado desconocido, sin deuda, cédula inválida…) da una fila por contrato | No hay cuotas confiables que listar |
| P8 | Los contratos de estado desconocido no se guardan | Sus datos son dudosos (D26) |
| P9 | Un cliente existente se actualiza en cada lectura de su contrato | RN6 |
| P10 | Al iniciar una corrida, el operador se queda en Sincronización, con aviso al terminar | No lo saca de donde trabaja |
| P11 | El cliente del administrador se puede reemplazar en las pruebas | Permite probar el `409` sin depender de la velocidad |
| P12 | Mientras faltaba «Actualizar pagadas», la API respondía `400` con un aviso | No finge que funciona |
| I27 | La fila importada dice «Factura CBX-000001 creada.» | Apunta a la factura exacta |
| I29 | El filtro del detalle vive en la URL | «Atrás» y compartir lo conservan |

## Qué quedó

- Simular (sin confirmación) e importar (con confirmación), con historial en vivo y aviso al terminar.
- Detalle con destacados, contadores, avisos del administrador y una fila por cuota con filtro.
- Importación en una transacción; una corrida a la vez; inicio y fin en la auditoría.

## Verificación

- 119 pruebas en verde. CA7–CA18 contra la API simulada (`ciclo.test.ts`); CA26, CA29, CL1 y CL15 por HTTP.
- En el navegador: sin proveedor, aviso y botones deshabilitados; simular, importar y el detalle filtrado.
