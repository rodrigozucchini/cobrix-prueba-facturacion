# Fase 5 — Clientes, expediente y resumen

**Tareas:** T050–T056

## Objetivo

Ver a quién cobrarle: la tabla de clientes, el expediente y el Resumen, que coincide con la suma de la tabla (CA23, CA31–CA35).

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| P19 | El expediente usa la misma consulta de totales que la tabla | La deuda no puede dar distinto en dos pantallas |
| P20 | La búsqueda de documento encuentra mientras se escribe | RF24: con «98765» ya aparece LUIS |
| P21 | Cada columna ordena en un solo sentido | Es lo que sirve para cobrar (RF25) |
| P22 | Los botones de corrida se comparten entre Sincronización y Resumen | La misma confirmación en los dos lados |
| P23 | La búsqueda y el orden viven en la URL | Volver, recargar o compartir conserva la vista |

## Qué quedó

- **Clientes:** búsqueda por nombre (sin mayúsculas ni acentos) y por documento con la regla de RN1, tres órdenes y los que no deben, al final.
- **Expediente:** totales, datos, contratos, facturas e historial con enlace a cada corrida.
- **Resumen:** totales, proveedor, últimas corridas y accesos rápidos.

## Verificación

- 151 pruebas en verde: búsquedas (CA31), órdenes (CA32), expediente (CA33) y totales iguales a la tabla (CA23, CA34).
- En el navegador, en escritorio y en móvil, sobre copias de las bases.
