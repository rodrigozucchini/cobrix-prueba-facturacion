# Tareas: Cobrix · punto diferencial v1

Basado en: `extras/punto-diferencial/plan.md` v1. Los números siguen los de `specs/tasks.md` (T001–T067), así no se repiten.

Las reglas son las mismas que en las tareas base:
- una tarea se tilda solo hecha y verificada (`npm run typecheck` y `npm test` en verde);
- se cargan los skills que apliquen;
- nada fuera de la spec;
- al terminar cada fase, se verifica y se espera el «ok».

**Orden respecto de las tareas base:**

| Fase | Va después de… |
| --- | --- |
| A. Auditoría | La **fase 1 base**. Sus tareas T075 y T076 se hacen **junto con** las tareas base que crean esas acciones |
| B. Antigüedad · C. CSV · D. Estado de cuenta | La **fase 5 base** |
| E. Cierre | Todo lo anterior, antes de la verificación final base (T067) |

## Fase A — Auditoría (después de la fase 1 base) ✅

- [x] T070 **Prueba primero** (los casos de T074), después implementar `createAuditLog({ dir, now })` y `record(actor, action, data)`:
  - una línea JSON por acción, solo con `appendFileSync`;
  - crea la carpeta si no existe;
  - el nombre del archivo usa la fecha real de Caracas, calculada en cada escritura;
  - ante un error, `console.error` y no lanza.
  
  Cubre: RF50, RF53, RF54, RN44, DT15–DT17, CL31, CL32. Dónde: `src/cobrix/audit.ts`.
- [x] T071 Agregar los tipos de `AuditEntry` y la lista cerrada de acciones. Cubre: RN44. Dónde: `src/cobrix/audit.ts`.
- [x] T072 Agregar `COBRIX_AUDIT_DIR` (por defecto `logs/`) en el arranque y `logs/` al `.gitignore`. Cubre: RF53. Dónde: `src/main.ts`, `.gitignore`.
- [x] T073 Registrar `settings.saved` en `PUT /api/configuracion`, con los campos que cambiaron y la contraseña solo como «(cambiada)». Cubre: RF51, RF52, RN45. Dónde: `src/server/`.
- [x] T074 Probar la auditoría:
  - solo agrega líneas;
  - crea la carpeta;
  - cambia de archivo al cambiar el día (con un reloj de prueba);
  - nunca escribe la contraseña;
  - una carpeta sin permiso de escritura no frena la acción.
  
  Cubre: RF50, RF52–RF54, CL31, CL32. Dónde: `test/audit.test.ts`.
- [x] T075 Registrar `connection.tested` con su resultado. **Se hace junto con T025.** Cubre: RF51. Dónde: `src/server/`.
- [x] T076 Registrar `run.started` y `run.finished` (con `actor` = `sistema` si la corrida es automática). **Se hace junto con T032; la automática, con T060.** Cubre: RF51, RN44. Dónde: `src/cobrix/runs/engine.ts`.

**Verificación:** pruebas en verde. Guardar la configuración con una contraseña escribe una línea `settings.saved` en `logs/cobrix-<fecha>.log`, y en esa línea la contraseña figura solo como «(cambiada)».

## Fase B — Antigüedad de la deuda (después de la fase 5 base) ✅

- [x] T080 Implementar la consulta de tramos: días entre el vencimiento y la fecha de trabajo, solo facturas abiertas, siempre los 4 tramos. Sumarla a `GET /api/resumen`. Cubre: RF42, RN39, RN40, CL27. Dónde: `src/cobrix/queries/aging.ts`, `src/server/`.
- [x] T081 Agregar el parámetro `tramo` a `GET /api/clientes` (un cliente entra si tiene al menos una factura abierta en ese tramo), con `400` si no es válido. Cubre: RF43, RN41, CL28. Dónde: `src/cobrix/queries/customers.ts`, `src/server/`.
- [x] T082 Agregar el tipo `AgingBucket` y sumarlo a la respuesta del Resumen. Cubre: DT11. Dónde: `src/shared/api-types.ts`.
- [x] T083 Agregar al Resumen el bloque «Antigüedad de la deuda»: 4 tarjetas con cantidad y monto; cada una lleva a Clientes filtrado. Cubre: RF42, RF43. Dónde: `src/panel/routes/`.
- [x] T084 Agregar a Clientes el filtro por tramo: en la URL, con un chip para quitarlo y el vacío «No hay clientes con deuda en este tramo». Cubre: RF43, CL28. Dónde: `src/panel/routes/`.
- [x] T085 Probar los tramos con datos armados y contra la API simulada. Cubre: RN39–RN41, CA44–CA46, CL27, CL28. Dónde: `test/aging.test.ts`.

**Verificación:** recién importado, el Resumen muestra 21/USD 615 · 9/USD 270 · 6/USD 155 · 6/USD 195 (CA44). Después del ciclo, 19/USD 530 · 7/USD 185 · 5/USD 135 · 3/USD 105 (CA45). «Más de 90» muestra solo a MIGUEL ANGEL SOTO (CA46).

## Fase C — Exportar CSV (después de la fase 5 base) ✅

- [x] T090 **Prueba primero** (los casos de formato y de textos difíciles de T095), después implementar `toCsv(columnas, filas)`:
  - BOM UTF-8, `;` y saltos `\r\n`;
  - montos con coma decimal y fechas `dd/mm/aaaa`;
  - comillas cuando el texto tiene `;`, `"`, `,` o un salto de línea, con las comillas internas duplicadas.
  
  Cubre: RF46, RN42, CL29, CL30. Dónde: `src/cobrix/export/csv.ts`.
- [x] T091 Implementar `GET /api/clientes.csv`, con los mismos filtros y orden que la tabla y el nombre `clientes-AAAA-MM-DD.csv`. Cubre: RF44, RF46. Dónde: `src/server/`.
- [x] T092 Implementar `GET /api/corridas/:id.csv`, con el filtro por resultado y el nombre `corrida-N.csv`. Cubre: RF45, RF46. Dónde: `src/server/`.
- [x] T093 Registrar `export.csv` en las dos rutas: archivo, cantidad de filas y filtros. Cubre: RF51. Dónde: `src/server/`.
- [x] T094 Agregar los botones «Exportar CSV» en Clientes y en el Detalle de corrida; descargan con los filtros que están aplicados. Cubre: RF44, RF45. Dónde: `src/panel/routes/`.
- [x] T095 Probar el formato y los textos difíciles, y por HTTP la cantidad de filas: 20, 1 con «gomez» y 9 con «Excluida por estado». Cubre: RN42, CA47, CA48, CL29, CL30. Dónde: `test/csv.test.ts`.

**Verificación:** los dos CSV abren en Excel o LibreOffice en español con columnas separadas, acentos correctos y montos `95,00` (CA47, CA48).

## Fase D — Estado de cuenta (después de la fase 5 base) ✅

- [x] T100 Implementar la consulta y `GET /api/clientes/:id/estado-de-cuenta`: empresa, cliente, fecha de emisión (fecha de trabajo), facturas abiertas y total. Responde `409 company_incomplete` si falta la empresa y `404` si el cliente no existe. Cubre: RF47–RF49, RN43. Dónde: `src/cobrix/queries/statement.ts`, `src/server/`.
- [x] T101 Registrar `statement.generated`: cliente, cantidad de facturas y total. Cubre: RF51. Dónde: `src/server/`.
- [x] T102 Implementar la pantalla del estado de cuenta:
  - sin el menú del panel;
  - CSS de impresión A4;
  - botón «Imprimir / Guardar PDF»;
  - aviso con enlace si falta la empresa;
  - constancia si el cliente no tiene facturas abiertas.
  
  Cubre: RF47–RF49, CL33. Dónde: `src/panel/routes/`.
- [x] T103 Agregar el botón «Estado de cuenta» en el Expediente; abre la hoja en una pestaña nueva. Cubre: RF47. Dónde: `src/panel/routes/`.
- [x] T104 Probar el estado de cuenta: LUIS GOMEZ con 4 facturas y USD 95,00; `409` sin empresa; constancia de ANA PEREZ. Cubre: RN43, CA49–CA51. Dónde: `test/statement.test.ts`.

**Verificación:** el estado de cuenta de LUIS GOMEZ se imprime en una hoja A4 con membrete, sus 4 facturas y USD 95,00 (CA49). Sin empresa aparece el aviso (CA50). El de ANA PEREZ es una constancia (CA51).

## Fase E — Cierre ✅

- [x] T110 Probar la auditoría de punta a punta: guardar la configuración, probar la conexión, importar, actualizar, exportar, y generar un estado de cuenta. Todas las acciones de RF51 aparecen; cada una agrega su línea sin tocar las anteriores, y `cobrix-sandbox` no aparece en ninguna. Cubre: CA52, CA53. Dónde: `test/audit.test.ts`.
- [x] T111 Probar que con otra `COBRIX_AUDIT_DIR` las líneas nuevas van a la carpeta nueva. Cubre: CA54. Dónde: `test/audit.test.ts`.
- [x] T112 Sumar al README:
  - la auditoría: dónde está, su formato, `COBRIX_AUDIT_DIR` y cómo rotarla;
  - cómo abrir el CSV en Excel;
  - el estado de cuenta;
  - la verificación manual de CA44–CA54.
  
  Cubre: R7–R9. Dónde: `README.md`.
- [x] T113 Sumar a la nota la sección del punto diferencial: la idea que une los cuatro agregados, las decisiones D40–D52 y por qué la auditoría vive fuera de la base. Cubre: enunciado §6 y §7. Dónde: `NOTA.md`.

**Verificación:** todo en verde, CA44–CA54 comprobados, y README y nota actualizados.
