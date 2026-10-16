# Fase D — Estado de cuenta (punto diferencial)

**Tareas:** T100–T104

## Objetivo

Mandarle a un cliente su estado de cuenta: una hoja con el membrete, sus facturas abiertas y el total, para imprimir o guardar en PDF (CA49–CA51).

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| P32 | La empresa está completa con nombre, RIF y correo | Son los datos del membrete |
| P33 | Las facturas van de la más vieja a la más nueva | Lo más atrasado primero |
| P34 | La hoja va fuera del marco del panel | Sale sin el menú |
| P35 | La hoja pide los datos una sola vez | Cada pedido queda en la auditoría |

## Qué quedó

- `GET /api/clientes/:id/estado-de-cuenta`: `404` si el cliente no existe y `409` si falta la empresa. Solo lee.
- La hoja, con su constancia «Sin facturas abiertas al …», y el botón en el Expediente.

## Verificación

- 182 pruebas en verde: LUIS con 4 facturas y USD 95,00 (CA49), el aviso sin empresa (CA50) y ANA sin deuda (CA51).
- El PDF que genera Chrome sale en una página A4, sin la barra ni los botones.
