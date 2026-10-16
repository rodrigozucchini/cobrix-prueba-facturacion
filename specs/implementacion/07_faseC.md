# Fase C — Exportar CSV (punto diferencial)

**Tareas:** T090–T095

## Objetivo

Llevarse a Excel la tabla de clientes tal como se ve y el detalle de una corrida con su filtro (CA47, CA48). Cada exportación queda en la auditoría.

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| P28 | Los nombres de los resultados se comparten entre el panel y el CSV | El archivo dice lo mismo que la pantalla |
| P29 | Montos sin separador de miles: `1235,00` | Excel los lee como número |
| P30 | Se exporta lo que está en la URL | Es exactamente lo que se ve (RF44) |
| P31 | Un resultado que no corresponde al tipo de corrida responde `400` | Evita un archivo vacío que parece correcto |
| I43 | Los montos nunca van entre comillas | Entre comillas, Excel los toma como texto |

## Qué quedó

- `GET /api/clientes.csv` y `GET /api/corridas/:id.csv`: BOM, `;`, coma decimal y fechas `dd/mm/aaaa`.
- «Exportar CSV» en Clientes y en el detalle de una corrida.

## Verificación

- 176 pruebas en verde: formato (CL29, CL30), 20 filas de clientes y 1 con «gomez» (CA47), 9 «Excluida por estado» y EL FARO en una celda (CA48).
- Abrirlos en Excel queda en la [verificación a mano](../verificacion.md).
