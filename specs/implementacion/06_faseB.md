# Fase B — Antigüedad de la deuda (punto diferencial)

**Tareas:** T080–T085

## Objetivo

Saber a quién cobrarle primero: las facturas abiertas en 4 tramos de atraso, y cada tramo abre Clientes filtrado (CA44–CA46).

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| P24 | Los tramos se definen una sola vez | Una factura no puede estar en un tramo en una pantalla y en otro en la otra |
| P25 | Una factura que todavía no venció cuenta en 0–30 | Cada factura va a un solo tramo (RN40) |
| P26 | El entorno de las pruebas pasa a `test/helpers/sandbox.ts` | Una sola copia |
| P27 | Las tarjetas muestran primero el monto | Para cobrar importa cuánto se debe |

## Qué quedó

- El bloque «Antigüedad de la deuda» en el Resumen y el filtro `?tramo=` en Clientes, con su chip para quitarlo.

## Verificación

- 161 pruebas en verde, con los bordes de cada tramo.
- Recién importado: 21/USD 615 · 9/USD 270 · 6/USD 155 · 6/USD 195. Después del ciclo: 19/USD 530 · 7/USD 185 · 5/USD 135 · 3/USD 105. «Más de 90 días»: solo MIGUEL ANGEL SOTO.
