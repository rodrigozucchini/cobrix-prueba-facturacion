# Verificación a mano

En el orden en que se recorre el panel, con la base del administrador como se entrega y Cobrix vacío. La última columna dice qué prueba automática cubre además cada criterio.

| # | Qué hacer | Qué tiene que pasar | Prueba |
| --- | --- | --- | --- |
| CA35, CA38 | Abrir el panel por primera vez | Resumen y Sincronización avisan que falta el proveedor; Clientes ofrece ir a Sincronización | `api` |
| CA43, CA5, CA6 | Configuración con datos inválidos | No se guarda y cada campo dice qué está mal | `api` |
| CA1–CA4 | Cargar empresa y proveedor, guardar, recargar y «Probar conexión» | Los datos siguen, la contraseña aparece vacía; «27 contratos» o «rechazó el usuario o la contraseña» | `api` |
| CA7–CA10, CA37, CA40 | Simular e importar (dos veces) | Sin confirmación al simular; 20 clientes y 42 facturas `CBX-000001`…`CBX-000042`; aviso con «Ver corrida»; la segunda vez, 0 nuevas | `ciclo` |
| CA27, CA28 | Historial y detalle de una corrida | Todos los datos; filtrar por «Excluida por estado» | — |
| CA11–CA13 | Clientes | LUIS GOMEZ: 2 contratos, USD 115,00, 1 jul 2026; ELENA `9000123`; no están los 6 titulares excluidos | `ciclo` |
| CA14–CA18 | Simular con ventana, máximo, tipo excluido, tope y días de gracia | Lo que dice cada criterio | `ciclo` |
| CA44 | Resumen, recién importado | 21/USD 615 · 9/USD 270 · 6/USD 155 · 6/USD 195 | `aging` |
| CA19–CA25 | Pagos del recorrido, simular y actualizar (dos veces), reimportar | 8 pagadas; el abono de LUIS (USD 15,00 frente a 20,00); ELENA abierta; 34 por USD 955,00; repetir no cambia nada | `ciclo`, `api` |
| CA31–CA34, CA45, CA46 | Buscar, ordenar, abrir LUIS, el Resumen y «Más de 90 días» | Lo que dice cada criterio; el filtro sigue al recargar | `api`, `aging` |
| CA47, CA48 | «Exportar CSV» en Clientes y en el detalle de una corrida. **Abrirlos en Excel** | 20 / 1 / 9 filas, columnas separadas, `95,00`, COMERCIAL EL FARO en una celda | `csv` (sin Excel) |
| CA49–CA51 | «Estado de cuenta» sin empresa, de LUIS y de ANA. **Imprimir** | Aviso / una hoja A4 con 4 facturas y USD 95,00 / «Sin facturas abiertas al 13 oct 2026» | `statement` (sin impresora) |
| CA26, CA29 | Contraseña mala e «Importar»; una corrida con otra en curso | «Fallida» con qué hacer; aviso y no se inicia | `api` |
| CA30 | Activar la corrida automática a la hora en curso de Caracas | En menos de un minuto aparecen las dos «Automática» | `scheduler` |
| CA36 | Apagar el servidor durante una importación y volver a levantarlo | Esa corrida figura «Fallida», con el motivo, y no dejó nada a medias | `store` |
| CA52–CA54 | Mirar `logs/`, buscar `cobrix-sandbox`, reiniciar con otra `COBRIX_AUDIT_DIR` | Una línea por acción; la contraseña no aparece; las nuevas van a la carpeta nueva | `audit` |
| D56, D57 | Después de los pagos, el Resumen y el expediente de LUIS | «Requiere atención»: «Abono parcial · 1 caso», que abre la corrida filtrada; la factura de agosto dice «Quedan USD 15,00» | `api` |
| D58, D59 | Con Cobrix vacío, «Usar el sandbox de la prueba»; después, «Importar» desde el detalle de una simulación | Se completan los tres datos sin guardar; la corrida real pide confirmación y abre su detalle | — |
| CA39, CA41, CA42 | Apagar el servidor con el panel abierto; recorrer todo a 360 px | «No se pudo conectar…» y «Reintentar»; montos `USD 1.235,00`, fechas `13 oct 2026`; nada se desborda | — |
