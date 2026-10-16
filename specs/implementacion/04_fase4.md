# Fase 4 — Actualizar pagadas

**Tareas:** T040–T044

## Objetivo

Marcar pagadas solo las facturas que el ISP cobró por completo (CA19–CA25): 8 pagadas, el abono parcial de LUIS, ELENA sin cambios y 34 abiertas por USD 955,00.

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| P13 | El login va aparte (`connect()`) | Si falla el login, falla la corrida; si falla un contrato, solo sus facturas |
| P14 | El contrato se relee una vez, solo si una cuota no está en el libro | Evita consultas de más |
| P15 | Si el contrato releído se contradice, «En revisión» | La consulta funcionó; el dato no |
| P16 | Fecha y referencia de pago: la factura más reciente que tocó la cuota | D12 |
| P17 | Sin facturas abiertas, termina sin conectarse | CL26 |
| P18 | El monto de la fila es el de Cobrix; el del ISP va en el motivo | El del ISP es la evidencia |

## Qué quedó

- Reglas de pagos como función pura, con una prueba por caso.
- La corrida de pagadas en el mismo motor, con su evento «factura pagada en el ISP».
- En el panel: simular y actualizar, y el detalle con el abono parcial (lo que dice el ISP frente a Cobrix).

## Verificación

- 143 pruebas en verde. CA19–CA25 y CL26 contra la API simulada: simular no cambia nada, repetir da 0 y reimportar, 0 nuevas.
- En el navegador, sobre copias de las bases: el ciclo completo con los pagos del enunciado.
