# Especificación: Cobrix · punto diferencial v1

Parte de `specs/spec.md` v1 y la extiende: todo lo de la spec base sigue valiendo. Para no confundir referencias, los IDs **continúan** la numeración de la spec base (HU12, RF42, RN39, CA44, CL27, D40…). Esta spec habilita dos cosas que la base dejaba fuera de alcance: exportar datos (CSV) y generar un documento imprimible.

## 1. Objetivo y contexto de negocio

La spec base trae las deudas del ISP y mantiene al día cuáles se pagaron. Este agregado responde las tres preguntas que el operador se hace después:

1. **¿A quién cobro primero?** → **Antigüedad de la deuda:** cuánto se debe hace menos de un mes, hace dos, tres o más.
2. **¿Cómo le llevo la información a otro?** → **Exportar a CSV** la tabla de clientes o el detalle de una corrida, y **estado de cuenta imprimible** por cliente, con el membrete de la empresa.
3. **¿Quién hizo qué y cuándo?** → **Registro de auditoría** en un archivo fuera de la base de datos, que sobrevive aunque se borren los datos o se rompa la base.

La idea que los une: **Cobrix te dice a quién cobrar primero, te da los papeles para hacerlo y deja registro de todo.**

## 2. Usuarios

- **Operador de cobranza:** usa la antigüedad para priorizar, exporta listas para trabajarlas en Excel e imprime o guarda en PDF el estado de cuenta para mandárselo a un cliente.
- **Quien administra el servidor** (puede ser un desarrollador del equipo): lee el registro de auditoría cuando hay que reconstruir qué pasó. No usa el panel para eso.
- **El cliente final del ISP:** recibe el estado de cuenta, sin usar el producto.

## 3. Escenarios de usuario (historias)

- **HU12** — Como operador, quiero ver cuánto se debe según cuánto tiempo lleva vencido, para cobrar primero lo más atrasado.
- **HU13** — Como operador, quiero exportar la tabla de clientes y el detalle de una corrida a un archivo que abra en Excel, para trabajarlos fuera del panel o compartirlos.
- **HU14** — Como operador, quiero imprimir o guardar en PDF el estado de cuenta de un cliente, con el membrete de mi empresa, para enviárselo.
- **HU15** — Como quien administra el servidor, quiero que cada acción quede registrada en un archivo fuera de la base de datos, para saber quién hizo qué y cuándo, aunque se borren los datos.

## 4. Requisitos funcionales

### 4.1 Antigüedad de la deuda

- **RF42.** El Resumen debe mostrar las facturas abiertas en **cuatro tramos de atraso**: 0–30, 31–60, 61–90 y más de 90 días. Cada tramo muestra la cantidad de facturas y el monto. Los cuatro montos suman el monto por cobrar (RF31).
- **RF43.** Al tocar un tramo, el sistema debe abrir la tabla de clientes **filtrada** por ese tramo. El filtro se ve, se puede quitar y queda en la dirección de la página, para que «Atrás» y compartir el enlace funcionen.

### 4.2 Exportar a CSV

- **RF44.** La tabla de clientes debe ofrecer **«Exportar CSV»**, que descarga exactamente lo que se ve: con la búsqueda, el filtro por tramo y el orden aplicados, y con las mismas columnas de RF23.
- **RF45.** El detalle de una corrida debe ofrecer **«Exportar CSV»**, que descarga sus filas con el filtro por resultado aplicado: contrato, cuota, cliente, resultado, motivo y monto.
- **RF46.** El archivo debe abrir bien en Excel configurado en español: separador `;`, montos con coma decimal, fechas `dd/mm/aaaa`, acentos correctos y encabezados en español. Nombres: `clientes-AAAA-MM-DD.csv` y `corrida-N.csv`.

### 4.3 Estado de cuenta imprimible

- **RF47.** El expediente debe ofrecer **«Estado de cuenta»**, que abre una hoja lista para imprimir o guardar en PDF con la impresión del navegador. La hoja incluye:
  - el **membrete** de la empresa: nombre, RIF y correo de cobranza;
  - los datos del cliente: nombre, documento, tipo, correo y teléfono;
  - la fecha de emisión;
  - las **facturas abiertas**: número de Cobrix, periodo, vencimiento, corte y saldo;
  - el **total adeudado**.
- **RF48.** Si los datos de la empresa no están completos, el estado de cuenta no se genera, y el sistema avisa: «Completa los datos de la empresa en Configuración para generar estados de cuenta», con un enlace a Configuración.
- **RF49.** Si el cliente no tiene facturas abiertas, el estado de cuenta se genera igual, como constancia: «Sin facturas abiertas al 13 oct 2026».

### 4.4 Registro de auditoría

- **RF50.** Cada acción debe quedar registrada en un **archivo de auditoría fuera de la base de datos**, una línea por acción. El sistema solo agrega líneas: nunca modifica ni borra las que ya existen.
- **RF51.** Se registran estas acciones:
  - guardar la configuración de la empresa o del proveedor;
  - probar la conexión, con su resultado;
  - el inicio y el fin de cada corrida (real o simulada, manual o automática), con su resultado o su error;
  - exportar un CSV;
  - generar un estado de cuenta.
- **RF52.** El registro nunca contiene contraseñas ni tokens. Si cambia la contraseña del proveedor, solo se anota que cambió.
- **RF53.** Se escribe un archivo por día en una carpeta que se puede cambiar por configuración del servidor, para poder apuntarla a otro disco o a una carpeta que otro servidor recoge. El panel no muestra el registro.
- **RF54.** Si el registro no se puede escribir (por ejemplo, disco lleno), la acción **sigue igual** y el servidor avisa del problema en su consola.

## 5. Reglas de negocio (con ejemplos)

Los ejemplos usan los datos del sandbox con la fecha de la prueba: **13 de octubre de 2026**.

- **RN39. Días de atraso.** Son los días entre el **vencimiento** de la factura y la fecha de trabajo (D35).
  Ejemplos: vencimiento 1 oct 2026 → 12 días; 1 sep → 42; 1 ago → 73; 1 jul → 104; 1 may → 165.
- **RN40. Tramos.** 0–30, 31–60, 61–90 y más de 90 días. Cada factura abierta va a un solo tramo. El monto es su saldo en Cobrix (D16); las pagadas no cuentan.
  Ejemplo, recién importado: **0–30:** 21 facturas, USD 615,00 · **31–60:** 9, USD 270,00 · **61–90:** 6, USD 155,00 · **más de 90:** 6, USD 195,00 (LUIS GOMEZ y MIGUEL ANGEL SOTO). Total: 42 y USD 1.235,00.
- **RN41. Filtro por tramo.** Un cliente aparece en el filtro de un tramo si tiene **al menos una** factura abierta en ese tramo. Un mismo cliente puede aparecer en varios tramos.
  Ejemplo: después del ciclo de pagos, «más de 90 días» muestra solo a MIGUEL ANGEL SOTO.
- **RN42. Formato del CSV.** Los montos van como número, sin «USD» en la celda: `95,00`, con la moneda en el encabezado («Deuda (USD)»). Un texto con `;`, comillas o saltos de línea va entre comillas, con las comillas internas duplicadas, para que no rompa las columnas.
  Ejemplo: `"COMERCIAL EL FARO, C.A."` queda en una sola celda.
- **RN43. Total del estado de cuenta.** Es la suma de los saldos de las facturas abiertas: el mismo número que la deuda del cliente (RF23). La fecha de emisión es la fecha de trabajo. Generar un estado de cuenta no cambia nada en Cobrix.
  Ejemplo: LUIS GOMEZ después del ciclo → 4 facturas abiertas, total **USD 95,00**.
- **RN44. Línea de auditoría.** Cada línea tiene:
  - el momento, en hora real (D35);
  - quién: `operador` si vino del panel o `sistema` si fue la corrida automática;
  - la acción, con un nombre fijo (`settings.saved`, `connection.tested`, `run.started`, `run.finished`, `export.csv`, `statement.generated`);
  - los datos de la acción.
  
  Ejemplo: `{"at":"2026-10-13T10:41:03Z","actor":"operador","action":"run.finished","runId":2,"status":"completed","summary":"Importadas: 42 · Clientes creados: 20"}`.
- **RN45. Cambios de configuración.** Se anotan los campos que cambiaron, con su valor nuevo. La contraseña aparece solo como `"apiPassword": "(cambiada)"`.
  Ejemplo: `{"action":"settings.saved","changed":{"graceDays":5,"apiPassword":"(cambiada)"}}`.

## 6. Criterios de aceptación (verificables sin código)

Con los mismos datos y la misma fecha que la spec base.

- **CA44 (RF42, RN39, RN40).** Recién importado, el Resumen muestra 0–30: 21 facturas, USD 615,00 · 31–60: 9, USD 270,00 · 61–90: 6, USD 155,00 · más de 90: 6, USD 195,00. Los cuatro suman USD 1.235,00.
- **CA45 (RF42).** Después del ciclo de pagos, el Resumen muestra 0–30: 19 facturas, USD 530,00 · 31–60: 7, USD 185,00 · 61–90: 5, USD 135,00 · más de 90: 3, USD 105,00. Los cuatro suman USD 955,00.
- **CA46 (RF43, RN41).** Después del ciclo, al tocar «más de 90 días» la tabla de clientes muestra solo a MIGUEL ANGEL SOTO. Al quitar el filtro vuelven los 20 clientes. Recargar la página mantiene el filtro.
- **CA47 (RF44, RF46).** «Exportar CSV» en Clientes descarga `clientes-2026-10-13.csv`. Abierto en Excel en español, muestra 20 filas en columnas separadas, con acentos correctos y montos como `95,00`. Con la búsqueda «gomez», el archivo tiene 1 fila.
- **CA48 (RF45, RN42).** En el detalle de la primera importación, con el filtro «Excluida por estado», el CSV tiene 9 filas. COMERCIAL EL FARO, C.A. queda en una sola celda en el CSV de clientes.
- **CA49 (RF47, RN43).** El estado de cuenta de LUIS GOMEZ, después del ciclo, muestra el membrete de la empresa, sus datos, la fecha 13 oct 2026, 4 facturas abiertas y un total de USD 95,00. En la vista de impresión del navegador entra en una hoja A4, sin el menú del panel.
- **CA50 (RF48).** Con los datos de la empresa vacíos, «Estado de cuenta» muestra el aviso con el enlace a Configuración y no genera la hoja.
- **CA51 (RF49).** El estado de cuenta de ANA PEREZ, después del ciclo, dice «Sin facturas abiertas al 13 oct 2026».
- **CA52 (RF50, RF51, RN44).** Después de importar, el archivo de auditoría del día tiene una línea `run.started` y una `run.finished` con el resumen. Cada acción posterior **agrega** su línea, y las anteriores siguen sin cambios.
- **CA53 (RF52, RN45).** Después de guardar la contraseña `cobrix-sandbox` y correr una importación, buscar `cobrix-sandbox` en el archivo de auditoría no encuentra nada.
- **CA54 (RF53).** Al cambiar la carpeta del registro en la configuración del servidor y reiniciarlo, las líneas nuevas se escriben en la carpeta nueva.

## 7. Casos límite

- **CL27.** ¿Qué pasa si no hay facturas abiertas? → Los cuatro tramos muestran 0 y USD 0,00, sin error.
- **CL28.** ¿Qué pasa si un tramo no tiene facturas? → Muestra 0 y USD 0,00. Al tocarlo, la tabla de clientes muestra el vacío «No hay clientes con deuda en este tramo».
- **CL29.** ¿Qué pasa si se exporta una tabla vacía? → El CSV tiene solo los encabezados.
- **CL30.** ¿Qué pasa si un nombre tiene `;`, comillas o comas? → Va entre comillas y no rompe las columnas (RN42).
- **CL31.** ¿Qué pasa si la carpeta del registro no existe? → Se crea al escribir la primera línea.
- **CL32.** ¿Qué pasa si se cambia de día con el servidor encendido? → La primera acción del día nuevo se escribe en el archivo de ese día.
- **CL33.** ¿Qué pasa si se genera el estado de cuenta desde un teléfono? → Se ve bien en pantalla, y la impresión usa el mismo formato A4.

## 8. Fuera de alcance

Este agregado **no**:

- envía el estado de cuenta por correo ni por mensaje: se imprime o se guarda en PDF con el navegador;
- genera el PDF en el servidor;
- muestra el registro de auditoría en el panel ni permite buscarlo;
- borra ni rota archivos de auditoría viejos: es tarea de quien administra el servidor;
- exporta otras tablas fuera de clientes y detalle de corrida, ni otros formatos que CSV;
- muestra gráficos ni la evolución de la antigüedad en el tiempo;
- registra quién es la persona que hizo la acción: no hay usuarios (D14), así que se distingue solo «operador» o «sistema».

## 9. Decisiones tomadas

- **D40.** ¿Desde cuándo se cuentan los días de atraso? → Desde el vencimiento, no desde el corte: es la fecha en que la cuota empezó a deberse.
- **D41.** ¿Qué tramos? → 0–30, 31–60, 61–90 y más de 90 días, con cantidad y monto. Son los tramos habituales en cobranza.
- **D42.** ¿Dónde se ve la antigüedad? → En el Resumen, y cada tramo lleva a la tabla de clientes filtrada.
- **D43.** ¿Qué se exporta a CSV? → La tabla de clientes (tal como se ve) y el detalle de una corrida (con su filtro).
- **D44.** ¿Formato del CSV? → El que abre bien en Excel en español: `;`, coma decimal, `dd/mm/aaaa` y acentos correctos.
- **D45.** ¿Qué incluye el estado de cuenta? → Membrete, datos del cliente, fecha, solo las facturas abiertas y el total. Por fin usa los datos de la Empresa (RF1).
- **D46.** ¿Y sin datos de la empresa? → No se genera: sin membrete, el documento no sirve. Se avisa y se lleva a Configuración.
- **D47.** ¿Y sin facturas abiertas? → Se genera como constancia de que no debe nada.
- **D48.** ¿El registro de auditoría va en la base de datos? → No, en un archivo aparte:
  - **sobrevive** a una base dañada o reemplazada;
  - **solo se agregan líneas**, así queda un rastro confiable;
  - la carpeta se puede apuntar a **otro disco o a otro servidor**, como se hace en producción.
  
  Reemplaza a los «logs del servidor» que el plan base tenía para la fase 6: hay un solo sistema de registro, no dos.
- **D49.** ¿Se ve el registro en el panel? → No: es para quien administra el servidor, fuera del sistema.
- **D50.** ¿Quién figura como autor? → `operador` (desde el panel) o `sistema` (corrida automática), porque no hay usuarios.
- **D51.** ¿Se borran los registros viejos? → No: el sistema nunca borra registros. Limpiarlos es tarea de quien administra el servidor.
- **D52.** ¿Y si el registro no se puede escribir? → La acción sigue y se avisa en la consola del servidor. Frenar la cobranza por un problema del registro sería peor que perder una línea.
