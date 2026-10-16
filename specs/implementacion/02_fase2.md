# Fase 2 — Conexión con el administrador

**Tareas:** T020–T025 y T075

## Objetivo

Que Cobrix hable con el administrador y **entienda** lo que responde: cliente HTTP con login, lectores estrictos, identificación normalizada y «Probar conexión» (CA3, CA4).

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| P1 | El cliente devuelve `unknown` y los lectores van aparte | Se prueban por separado |
| P2 | El lector del libro de cuotas se escribe ya | Comparte reglas y pruebas con los demás |
| P3 | `deuda_id` como número se acepta igual que como texto | Es el mismo identificador escrito distinto |
| P4 | Solo los 12 nombres de mes usuales | Nunca se adivina |
| P5 | «Probar conexión» dice si hay contratos ilegibles | No esconde el problema |
| P6 | En la auditoría va la URL, no el usuario | Lo mínimo (principio 7) |
| I17 | Sin identificación es «Sin identificación válida», no «Respuesta inconsistente» | Es un dato vacío, no una contradicción |
| I18 | Si no se puede leer el vencimiento del token, se usa una vez y después login | Nunca se adivina cuánto dura |
| I19 | En el login, 401 y 403 también son credenciales rechazadas | Otro ISP podría responder así |

## Qué quedó

- **Cliente:** login nuevo 5 min antes de que venza el token, un reintento ante 401, sin reintento con credenciales malas, 15 s de límite y errores en español.
- **Lectores** de la lista, las cuotas de un contrato y el libro de cuotas.
- **«Probar conexión»**, registrada en la auditoría (T075).

## Verificación

- 81 pruebas en verde, todas escritas antes del código.
- Los lectores contra las 27 respuestas reales: 0 errores y 54 cuotas pendientes.
- En el navegador: «27 contratos» (CA3) y el rechazo con contraseña mala (CA4).
