# Especificación: Cobrix · integración con el administrador de facturas v1

## 1. Objetivo y contexto de negocio

Cobrix cobra por cuenta de proveedores de internet (ISP). Cada ISP lleva a sus clientes en su propio **administrador de facturas**: contratos, cuotas mensuales y los cobros que hace en su caja. Para poder cobrar, Cobrix necesita tener esas deudas en su propio sistema y saber, día a día, cuáles el ISP ya cobró por su lado.

Este producto resuelve eso. Un operador de cobranza:

1. configura una vez los datos de su empresa y del administrador de facturas del ISP;
2. **importa** las cuotas pendientes como facturas abiertas de Cobrix, junto con sus clientes;
3. **actualiza las pagadas**: marca como pagadas las facturas que el ISP ya cobró por completo;
4. revisa en el historial qué pasó con cada cuota y por qué;
5. consulta los clientes, su deuda y su expediente.

Importa porque **cobrar algo que ya se pagó, o no cobrar algo que se debe, es un error con el cliente final.** Por eso el producto nunca adivina: si un dato del administrador es raro, lo deja fuera y lo explica.

En la vida real lo usa todos los días: la corrida automática trae lo nuevo cada mañana y el operador revisa el resultado; cuando necesita, simula antes de importar o corre una actualización a mano.

### Vocabulario

| Término | Qué es |
| --- | --- |
| **Administrador de facturas** | El sistema del ISP. Cobrix solo lo lee por su API; nunca lo modifica. |
| **Credenciales del proveedor** | La cuenta (usuario y contraseña) que el ISP le da a Cobrix para leer su administrador. Es una sola, se carga en Configuración y la usan todas las corridas. |
| **Contrato** | Un servicio de internet de un titular en el administrador. Un titular puede tener varios. |
| **Cuota** | Lo que un contrato debe por un mes. Se identifica por su `deuda_id`. |
| **ID de cliente** | La identificación del titular normalizada (RN1), por ejemplo `V9876543`. Identifica al cliente y agrupa sus contratos. |
| **Documento** | La identificación tal como la escribe el administrador, por ejemplo `V-9876543`. Es lo que se muestra al operador. |
| **Factura de Cobrix** | Lo que Cobrix crea por cada cuota pendiente importada. Tiene número propio (`CBX-000001`). |
| **Factura del administrador** | Un cobro que el ISP hizo en su caja. Puede pagar una o varias cuotas, total o parcialmente. |
| **Libro de cuotas** | La consulta del administrador que dice, por cuota, cuánto se pagó, cuánto falta y con qué facturas. |
| **Corrida** | Una ejecución de «Importar» o de «Actualizar pagadas». Queda registrada con su resultado por cuota. |
| **Simulación** | Una corrida que hace exactamente lo mismo pero no guarda nada: solo dice qué pasaría. |

## 2. Usuarios

**Operador de cobranza (usuario principal).**
- **Sabe:** qué es un contrato, una cuota, un abono y un corte; reconoce cédulas y RIF; sabe cobrar.
- **No sabe:** programar ni leer la API del administrador. No tiene por qué saber qué es un `deuda_id`.
- **Necesita:** ver de un vistazo qué hay que cobrar, confiar en que lo importado es correcto y entender cada exclusión sin preguntarle a nadie.
- Trabaja en una computadora de escritorio, pero a veces consulta desde el teléfono.

**Responsable de la cuenta del ISP (configura).** Puede ser el mismo operador. Carga una vez las credenciales del administrador y las reglas de importación. Sabe qué estados de contrato se cobran en su ISP.

**Quien recibe el resultado sin usar el producto:**
- **El ISP**, que confía en que Cobrix no cobre lo que su caja ya cobró.
- **Los clientes finales del ISP**, que serán cobrados con base en estas facturas. Esta versión no los contacta (ver «Fuera de alcance»).
- **Quien evalúa la prueba técnica**, que verifica los criterios de aceptación usando el panel y el simulador de caja.

## 3. Escenarios de usuario (historias)

- **HU1** — Como responsable de la cuenta, quiero cargar los datos de mi empresa y del administrador de facturas y probar la conexión, para saber que Cobrix puede leer los datos del ISP.
- **HU2** — Como responsable de la cuenta, quiero elegir qué se importa (estados de contrato, antigüedad, cantidad de cuotas, tipos de documento y topes), para cobrar solo lo que mi ISP quiere cobrar.
- **HU3** — Como operador, quiero simular una importación antes de hacerla, para ver qué se crearía sin tocar nada.
- **HU4** — Como operador, quiero importar las cuotas pendientes como facturas y sus clientes, para tenerlas listas para cobrar.
- **HU5** — Como operador, quiero actualizar las facturas pagadas (y poder simularlo antes), para no cobrar lo que el ISP ya cobró.
- **HU6** — Como operador, quiero ver el historial de corridas y el detalle de cada una con el resultado y el motivo por cuota, para entender qué pasó y explicarlo.
- **HU7** — Como operador, quiero buscar un cliente por nombre, cédula o RIF y ver su deuda, para saber a quién cobrar primero.
- **HU8** — Como operador, quiero abrir el expediente de un cliente con sus contratos, facturas e historial, para responder cualquier consulta sobre él.
- **HU9** — Como operador, quiero un resumen al entrar con los totales, el proveedor y las últimas corridas, para saber en segundos cómo está todo.
- **HU10** — Como responsable de la cuenta, quiero que la importación y la actualización corran solas cada día a una hora, para no depender de que alguien se acuerde.
- **HU11** — Como operador, quiero que una corrida cortada por un reinicio del servidor quede registrada como fallida y sin cambios a medias, para saber que tengo que repetirla.

## 4. Requisitos funcionales

### 4.1 Configuración

- **RF1.** El sistema debe permitir cargar y editar los datos de la **empresa**: nombre, RIF y correo de cobranza. Muestra, sin poder editarlos, la zona horaria (America/Caracas) y la moneda (USD). Validación mínima al guardar: el nombre es obligatorio; el RIF es una letra (V, E, J, G o P) y 9 dígitos, con o sin guiones (`J-12345678-9` o `J123456789`), y se guarda como `J-12345678-9`; el correo tiene forma de correo (`algo@dominio`). Estos datos no intervienen en las corridas.
- **RF2.** El sistema debe permitir cargar y editar el **proveedor**: nombre visible, URL de la API, usuario y contraseña. La URL es obligatoria y empieza con `http://` o `https://` (la API de prueba usa `http://127.0.0.1:4310`).
- **RF3.** El sistema nunca debe mostrar la contraseña guardada. Al editar, el campo aparece vacío; si se guarda vacío, se conserva la anterior.
- **RF4.** El sistema debe ofrecer **«Probar conexión»**: inicia sesión en el administrador con los datos del formulario (aunque no estén guardados) y dice si funcionó y cuántos contratos hay; si falla, dice por qué.
- **RF5.** El sistema debe permitir configurar las **reglas de importación**:
  - estados de contrato que se importan (por defecto ACTIVO y CORTADO; al menos uno);
  - ventana de importación: 3, 6, 9 o 12 meses, o sin ventana (por defecto, sin ventana);
  - máximo de cuotas recientes por contrato: de 1 a 60, o vacío para todas (por defecto, vacío);
  - días de gracia para el corte: de 0 a 60 (por defecto, 0);
  - tope de facturas nuevas por corrida (por defecto, 500; número entero de 1 o más) y tope de monto nuevo por corrida (por defecto, USD 50.000,00; mayor que USD 0, con hasta 2 decimales). Los dos son obligatorios: siempre hay un freno;
  - tipos de documento excluidos: V, E, J, G y P (por defecto, ninguno).
- **RF6.** El sistema debe permitir activar la **corrida automática** diaria y elegir la hora (hora en punto, de 00:00 a 23:00, hora de Caracas). A esa hora corre «Importar» y, al terminar, «Actualizar pagadas».
- **RF7.** El sistema debe validar cada campo al guardar y decir, junto al campo, qué está mal y cuál es el rango permitido. No guarda nada si hay un error.
- **RF8.** El sistema debe mostrar cuándo se modificó la configuración por última vez.

### 4.2 Importar clientes y facturas

- **RF9.** El sistema debe ofrecer **«Importar»**: recorre **todos** los contratos del administrador y, por cada cuota pendiente que cumpla las reglas de la sección 5, crea una **factura abierta** de Cobrix y, si no existe, su **cliente**.
- **RF10.** El sistema debe ofrecer **«Simular importación»**, que hace exactamente lo mismo que «Importar» pero no crea ni cambia nada: solo dice qué se importaría.
- **RF11.** Por cada factura creada, el sistema debe guardar: número de Cobrix, cuota del administrador, contrato, periodo, vencimiento, corte, total, saldo y estado (abierta).
- **RF12.** Por cada cliente, el sistema debe guardar: nombre, ID de cliente (identificación normalizada, RN1), documento (tal como viene del administrador), tipo (natural o jurídico), correo, teléfono y origen (el nombre visible del proveedor).
- **RF13.** Por cada contrato que se pudo leer en una importación real, el sistema debe guardar o actualizar: número de contrato, titular, estado, plan, precio y sucursal, **aunque ninguna de sus cuotas se importe** (por ejemplo, uno excluido por estado o sin deuda). Los contratos con «Consulta fallida» o «Respuesta inconsistente» no se guardan ni se actualizan: se conserva lo último que se supo de ellos.

### 4.3 Actualizar facturas pagadas

- **RF14.** El sistema debe ofrecer **«Actualizar pagadas»**: revisa cada factura abierta de Cobrix contra el libro de cuotas del administrador y marca **pagadas** las que el ISP cobró por completo, con la fecha y el número de la factura del administrador que las pagó.
- **RF15.** El sistema debe ofrecer **«Simular actualización»**, que hace lo mismo pero no cambia nada: solo dice qué se marcaría pagada.
- **RF16.** El sistema debe informar, sin cambiar la factura, los **abonos parciales**: cuotas con un saldo menor al de Cobrix pero mayor que cero.

### 4.4 Corridas e historial

- **RF17.** El sistema debe registrar **cada corrida**, real o simulada, manual o automática: tipo, fecha y hora de inicio, duración, si fue simulación, origen (manual o automática), estado (en curso, completada o fallida) y un resumen de una línea.
- **RF18.** El sistema debe mostrar el **historial de corridas**, de la más reciente a la más antigua.
- **RF19.** El sistema debe mostrar el **detalle de cada corrida**: sus contadores (sección 5.5) y **una fila por cuota** con contrato, cuota, cliente, resultado, motivo en palabras y monto. Las filas se pueden filtrar por resultado.
- **RF20.** Una corrida que no puede terminar (por ejemplo, con credenciales incorrectas) debe quedar registrada como **fallida**, con el error explicado y sin haber cambiado nada.
- **RF21.** El sistema no debe permitir dos corridas a la vez. Si se pide una mientras hay otra en curso, avisa que hay una corrida en curso y no la inicia.
- **RF22.** Mientras una corrida está en curso, su estado debe verse y actualizarse solo, sin recargar la página.

### 4.5 Clientes

- **RF23.** El sistema debe mostrar la **tabla de clientes** importados con: nombre, documento, tipo (natural o jurídico), número de contratos, facturas abiertas, facturas pagadas, deuda y vencimiento más antiguo. Si un cliente no tiene facturas abiertas, su deuda es `USD 0,00` y en vencimiento más antiguo dice «Sin facturas abiertas».
  - **Deuda:** suma de los saldos de sus facturas **abiertas** en Cobrix. Las pagadas no cuentan, y un abono parcial no la baja (D16). Ejemplo: LUIS GOMEZ después de los pagos → julio pagada (no cuenta) + agosto 20 + septiembre 20 + octubre 20 + octubre 35 = **USD 95,00**.
  - **Vencimiento más antiguo:** el vencimiento más viejo entre sus facturas **abiertas**. Ejemplo: LUIS GOMEZ después de los pagos → **1 ago 2026** (julio ya está pagada).
  - **Número de contratos:** todos los contratos del titular que Cobrix tiene guardados, se hayan importado cuotas de ellos o no (RF13). Ejemplo: LUIS GOMEZ → **2**.
- **RF24.** El sistema debe permitir **buscar** por nombre, cédula o RIF. La búsqueda filtra mientras se escribe, no distingue mayúsculas ni acentos y encuentra un documento escrito con o sin letra, guiones, puntos o ceros a la izquierda.
- **RF25.** El sistema debe permitir **ordenar** la tabla por nombre, deuda o vencimiento más antiguo. Por defecto, el vencimiento más antiguo primero; los clientes sin facturas abiertas van al final.
- **RF26.** Cada fila de la tabla debe abrir el **expediente** del cliente.

### 4.6 Expediente del cliente

- **RF27.** El expediente debe mostrar los totales del cliente (deuda, facturas abiertas y pagadas, contratos) y sus datos: ID de cliente, documento, tipo, correo, teléfono y origen. Si no tiene facturas abiertas, lo dice: «Sin facturas abiertas».
- **RF28.** El expediente debe mostrar todos los **contratos** del titular en el administrador, se hayan importado cuotas de ellos o no: número, estado, plan, precio y sucursal.
- **RF29.** El expediente debe mostrar las **facturas**: número de Cobrix, cuota del administrador, contrato, periodo, vencimiento, corte, total, saldo y estado; si está pagada, la fecha de pago. Se listan por vencimiento, de la más nueva a la más vieja, igual que el historial.
- **RF30.** El expediente debe mostrar el **historial** del cliente, del más reciente al más antiguo: cliente creado, factura importada y factura pagada en el ISP (con el número y la fecha de la factura del administrador que la pagó). Cada evento enlaza a la corrida que lo produjo.

### 4.7 Resumen

- **RF31.** La pantalla de inicio debe mostrar: totales (clientes, contratos guardados del administrador, facturas abiertas, facturas pagadas y monto por cobrar), el proveedor configurado, si la corrida automática está activa y a qué hora, y las últimas 5 corridas. El **monto por cobrar** es la suma de los saldos de todas las facturas **abiertas**, con la misma regla que la deuda de la tabla de clientes (RF23): las pagadas no cuentan y un abono parcial no lo baja. Es igual a la suma de la columna «Deuda» de todos los clientes. Ejemplo: después del ciclo de pagos, **USD 955,00**.
- **RF32.** El resumen debe ofrecer accesos directos a «Importar» y «Actualizar pagadas».
- **RF33.** Si el proveedor no está configurado, el resumen debe decirlo y llevar a Configuración.

### 4.8 Reinicios

- **RF34.** Si el servidor se apaga en medio de una corrida, al volver a arrancar esa corrida debe figurar como **fallida**, con un motivo que lo explique, y sin ningún cambio a medias: los cambios de una corrida se aplican todos juntos al final o no se aplican.

### 4.9 Experiencia general

- **RF35.** Antes de «Importar» y «Actualizar pagadas», el sistema debe pedir confirmación diciendo qué va a pasar. Las simulaciones no piden confirmación.
- **RF36.** Toda pantalla debe mostrar un aviso de carga con la forma del contenido mientras espera los datos, un mensaje de vacío que diga qué hacer, y un mensaje de error que diga qué pasó y cómo seguir, con opción de reintentar.
- **RF37.** Al terminar una acción, el sistema debe mostrar el resultado en una línea con un enlace al detalle (por ejemplo, a la corrida).
- **RF38.** Los estados deben distinguirse de un vistazo, con color, ícono y texto.
- **RF39.** Los montos deben mostrarse con su moneda (`USD 1.235,00`) y las fechas de forma legible (`13 oct 2026`), en hora de Caracas.
- **RF40.** Todas las pantallas deben poder usarse en un teléfono.
- **RF41.** Las corridas que no se pueden iniciar porque el proveedor no está configurado deben avisarlo y llevar a Configuración.

## 5. Reglas de negocio (con ejemplos)

Los ejemplos usan los datos del sandbox con la fecha de la prueba: **13 de octubre de 2026**.

### 5.1 Clientes

- **RN1. Identificación normalizada (ID de cliente).** Letra de tipo opcional (V, E, J, G o P) seguida de 6 a 12 dígitos, sin separadores (guion, punto, espacio) y sin ceros a la izquierda. La letra se acepta en minúscula y se guarda en mayúscula. Los dígitos se cuentan después de quitar los ceros.
  Ejemplos: `V-12345678` → `V12345678`; `09000123` → `9000123`; `J-40123456-7` → `J401234567`; `v 12.345.678` → `V12345678`.
- **RN2. Identificación inválida.** Un contrato cuya identificación no cumple RN1 no se importa ni crea cliente, pero **no se pierde**: queda como fila «Sin identificación válida» con el número de contrato, el valor tal cual llegó y el motivo, más la nota «Revísala a mano en el administrador del ISP». Si el ISP la corrige, la próxima corrida lo importa.
  Ejemplos: `V-12345` (5 dígitos), `X-12345678` (letra no válida), vacía, `V-000123` («La cédula tiene menos de 6 dígitos»: quedan 3 al quitar los ceros).
- **RN3. Tipo de persona.** J y G son personas **jurídicas**; V, E, P y sin letra, **naturales**.
  Ejemplo: COMERCIAL EL FARO, C.A. (`J-40123456-7`) → jurídica; ELENA RUIZ (`09000123`) → natural.
- **RN4. Un cliente por titular.** Un cliente por ID de cliente (identificación normalizada). Si un titular tiene varios contratos, todos quedan en el mismo cliente.
  Ejemplo: LUIS GOMEZ tiene los contratos 900102 (ACTIVO) y 900103 (CORTADO) → 1 cliente con 2 contratos.
- **RN5. Solo con facturas.** Un cliente se crea solo si al menos una de sus cuotas se importa como factura.
  Ejemplo: LAURA MENDEZ no debe nada → no se crea como cliente.
- **RN6. Datos del cliente.** Nombre, documento, correo y teléfono se toman del administrador y se actualizan en cada importación con los del último contrato leído del titular (los contratos se leen en orden de número).
  El correo se guarda en minúsculas, porque el administrador lo manda en mayúsculas y es el mismo correo. Ejemplo: `LUIS.GOMEZ@EXAMPLE.COM` → `luis.gomez@example.com`.

### 5.2 Facturas: qué se importa

Las reglas se aplican en este orden. La primera que corresponde da el resultado de la cuota.

**Lista de contratos** (antes de leer cada contrato):

- **RN38. Números de contrato legibles.** Cada elemento de la lista debe ser un número de contrato. Un número escrito como texto o con espacios se acepta: es el mismo número (`"900101"` o `" 900101 "` → `900101`). Lo que no es un número de contrato entero y positivo (`"abc"`, vacío, `-5`, `900101.5`) **no se adivina**: queda como fila «Contrato ilegible en la lista», con el valor tal cual llegó y la nota «No se pudo leer este contrato en la lista del administrador. Revísalo a mano en el administrador del ISP». La corrida sigue con los demás. Como cada corrida vuelve a pedir la lista, si el ISP lo corrige entra en la próxima.

**Por contrato** (afectan a todas sus cuotas):

- **RN7. Consulta fallida.** Si no se pudo leer un contrato (error de red o del administrador), ese contrato queda fuera con el resultado «Consulta fallida» y la corrida sigue con los demás.
- **RN8. Respuesta inconsistente.** Si la respuesta de un contrato se contradice, el contrato queda fuera completo: resultado «Respuesta inconsistente», con el detalle de qué se contradijo. **Nunca se adivina.** Es inconsistente si:
  - trae filas de otro contrato;
  - trae dos veces la misma cuota;
  - mezcla la fila «sin deuda» con cuotas;
  - sus filas no coinciden entre sí en estado, titular, moneda o precio del plan;
  - viene vacía o le falta un dato necesario;
  - una cuota tiene un monto negativo o un periodo posterior al mes actual;
  - el detalle de una cuota no se puede leer (ver RN15).
- **RN9. Estado desconocido.** Un estado de contrato fuera de ACTIVO, CORTADO, CORTESIA, RETIRADO, RECHAZADO y ANULADO deja el contrato fuera: resultado «Estado desconocido».
  Ejemplo: un contrato en estado `SUSPENDIDO` → fuera.
- **RN10. Sin deuda.** La fila con `deuda_id: "0"` significa que el contrato no debe nada: no es una cuota. Resultado del contrato: «Sin deuda».
  Ejemplo: LAURA MENDEZ (contrato 900109).
- **RN11. Identificación.** Se aplican RN1 y RN2.
- **RN12. Estado no importable.** Si el estado del contrato no está entre los configurados (RF5), cada una de sus cuotas queda «Excluida por estado».
  Ejemplo con la configuración por defecto: CARLOS ROJAS (CORTESIA, 3 cuotas), ROSA DIAZ (RETIRADO, 3), PEDRO LEON (RECHAZADO, 1) y ANDRES VARGAS (ANULADO, 2) → **9 cuotas excluidas por estado**.
- **RN13. Tipo de documento excluido.** Si la letra del titular está entre los tipos excluidos (RF5), cada cuota queda «Excluida por tipo de documento».
  Ejemplo: excluyendo J → las 2 cuotas de COMERCIAL EL FARO, C.A. quedan excluidas.
  Una identificación **sin letra** no se excluye nunca por tipo, porque no tiene letra que comparar. Ejemplo: excluyendo V, ELENA RUIZ (`09000123`) se importa igual.
- **RN14. Moneda.** Solo se importan contratos en USD **coherente**:
  - un contrato en otra moneda queda fuera: «Moneda distinta de USD»;
  - un contrato que dice USD pero tiene **alguna** cuota con saldo mayor que cero y menor al **1 %** del precio del plan queda fuera completo: «Moneda incoherente». Las cuotas con saldo residual (RN16) no cuentan para esta comparación.
  
  Ejemplo: JORGE CASTILLO, plan de USD 20,00, cuotas de USD 0,05 (0,25 %) → contrato fuera por moneda incoherente.

**Por cuota:**

- **RN15. Periodo, vencimiento y corte.** Salen del detalle de la cuota, que tiene la forma `PLAN - AAAA Mes`, con el mes en español. El vencimiento es el día 1 de ese mes y el corte es el vencimiento más los días de gracia.
  Ejemplo: «PLAN15MB25 - 2026 Agosto» → periodo `2026-08`, vencimiento 1 ago 2026; con 5 días de gracia, corte 6 ago 2026.
- **RN16. Saldo residual.** Una cuota cuyo saldo, redondeado a centavos, es 0 no se importa: «Saldo residual».
  Ejemplo: SOFIA TORRES, cuota de septiembre con saldo 0,001317 → no se importa.
- **RN17. Ventana de importación.** Con una ventana de N meses, solo se importan las cuotas con periodo desde el mes actual menos N, inclusive. Las demás quedan «Fuera de la ventana».
  Ejemplo: ventana de 3 meses → desde `2026-07`. MIGUEL ANGEL SOTO debe de marzo a octubre (8 cuotas) → 4 entran (julio a octubre) y 4 quedan fuera.
- **RN18. Máximo de cuotas recientes.** Se aplica después de RN16 y RN17: se conservan las N cuotas más recientes del contrato y las más viejas quedan «Excluidas por máximo de cuotas».
  Ejemplo: máximo 2 → MIGUEL ANGEL SOTO conserva septiembre y octubre; las otras 6 quedan excluidas.
- **RN19. Idempotencia.** Una cuota que ya tiene factura en Cobrix no se vuelve a crear: «Ya importada». Correr la importación dos veces no duplica nada.
  Ejemplo: importar → 42 facturas; importar otra vez → 0 nuevas y 42 «Ya importada».
- **RN20. Topes por corrida.** Las cuotas nuevas se recorren por número de contrato y, dentro del contrato, de la más vieja a la más nueva. Desde la primera que superaría el tope de facturas o el de monto, **esa y todas las siguientes** quedan «Frenada por tope», aunque alguna más chica entrara.
  Ejemplo: tope de 10 facturas → se importan las 10 primeras y las 32 restantes quedan frenadas.
- **RN21. Monto.** Una factura por cuota. Su identificador externo es el `deuda_id` y su total es el saldo de la cuota (`deuda`) en el momento de importarla. El saldo de la factura empieza igual al total.
  Ejemplo: ANA PEREZ, cuota de agosto de USD 25,00 con un abono previo de USD 5,00 → factura por USD 20,00.
- **RN22. Número de Cobrix.** Cada factura nueva recibe el siguiente número correlativo: `CBX-000001`, `CBX-000002`… Una simulación no consume números.
- **RN23. Cambios en el administrador después de importar.** Si después cambia la configuración o el estado de un contrato (por ejemplo, pasa a RETIRADO), las facturas ya importadas no se tocan. Solo se actualizan los datos del cliente (RN6) y del contrato (RF13).

### 5.3 Pagos: qué se marca pagado

Para cada factura abierta se buscan, en el libro de cuotas de su contrato, las filas de su cuota. El libro se consulta desde el primer día del periodo de la factura abierta más vieja del contrato hasta el último día del mes actual. Los montos se comparan en centavos.

- **RN24. Pagada.** Se marca pagada solo si **todas** las filas de la cuota coinciden entre sí en **contrato, periodo, saldo y monto pagado**, el saldo es 0 y hay algo pagado. Si alguna de esas cuatro cosas difiere entre filas → «En revisión» (RN28). Fecha de pago y referencia: la fecha y el número de la factura del administrador más reciente que tocó la cuota. El saldo de la factura en Cobrix pasa a 0.
  Ejemplo: ANA PEREZ paga todo en la caja → sus 3 facturas pasan a pagadas, con el número y la fecha (13 oct 2026) de la factura que emitió la caja.
- **RN25. Abono parcial.** Si el saldo en el libro es mayor que 0 pero menor que el saldo de Cobrix, se informa «Abono parcial» y la factura **sigue abierta, sin cambiar su saldo**.
  Ejemplo: LUIS GOMEZ (contrato 900103, cuotas de USD 20,00) paga USD 25,00 → la cuota de julio queda pagada; la de agosto queda «Abono parcial: el administrador dice que se deben USD 15,00 y Cobrix tiene USD 20,00».
- **RN26. Sigue pendiente.** Si el saldo en el libro es igual al de Cobrix, la factura sigue abierta: «Sigue pendiente».
  Ejemplo: ELENA RUIZ paga y el pago se anula → su saldo vuelve al original → sus facturas siguen abiertas.
- **RN27. Exonerada no es pago.** Una cuota con saldo 0 y nada pagado no se marca pagada: «En revisión: exonerada en el administrador».
- **RN28. Evidencia contradictoria.** Si las filas de la cuota no coinciden entre sí, alguna es de otro contrato, o el saldo del libro es **mayor** que el de Cobrix, la factura sigue abierta: «En revisión», con el detalle de la contradicción.
- **RN29. No aparece en el libro.** Si la cuota no aparece en el libro (suele pasar con la del mes en curso, pero aplica a cualquiera), se consulta el contrato. Si el contrato la sigue listando como pendiente, se compara su saldo con el de Cobrix, igual que con el libro: igual → «Sigue pendiente»; menor → «Abono parcial» (RN25); mayor → «En revisión» (RN28).
  Ejemplo: Cobrix tiene USD 20,00, la cuota no está en el libro y el contrato dice que se deben USD 15,00 → «Abono parcial».
- **RN30. Sin evidencia.** Si la cuota no aparece ni en el libro ni como pendiente en el contrato → «Sin evidencia». **Nunca** se marca pagada.
- **RN31. Consulta fallida.** Si no se pudo leer el libro o el contrato, las facturas de ese contrato quedan «Consulta fallida», siguen abiertas y la corrida continúa.
- **RN32. Idempotencia.** Repetir la actualización no cambia nada que ya esté bien: una factura pagada no se vuelve a revisar.
  Ejemplo: después del ciclo de pagos, repetir → 0 marcadas pagadas.

### 5.4 Corridas

- **RN33. Fallida no cambia nada.** Si falla el inicio de sesión, o la lista de contratos no se puede obtener o no viene como una lista, la corrida queda «Fallida» con el error y no se crea ni se cambia ningún cliente, contrato o factura.
  Ejemplo: contraseña incorrecta → corrida fallida: «El administrador rechazó el usuario o la contraseña. Revísalos en Configuración».
- **RN34. Todo o nada.** Lo que una corrida real cambia se guarda junto al terminar. Si algo falla a mitad de camino, por un motivo distinto de RN7 o RN31, no queda nada a medias.
- **RN35. Simulación.** Hace las mismas lecturas y aplica las mismas reglas que la corrida real, con los mismos resultados, pero no crea, cambia ni numera nada. Solo queda registrada la corrida simulada.
- **RN36. Una a la vez.** Nunca hay dos corridas en curso. Si a la hora de la corrida automática hay una en curso, la automática queda registrada como «Fallida: ya había una corrida en curso».
- **RN37. Corrida automática.** Corre una vez al día a la hora configurada, en hora real de Caracas: primero «Importar» y después «Actualizar pagadas», aunque la importación haya fallado. Si el sistema estaba apagado a esa hora, no se recupera después.

### 5.5 Resultados y contadores

**Importación.** Cada cuota (o contrato, si no se pudo leer) termina con uno de estos resultados:

| Resultado | Cuenta en |
| --- | --- |
| Importada / Se importaría (en simulación) | Facturas nuevas y monto nuevo |
| Ya importada | Ya importadas |
| Excluida por estado | Excluidas por estado |
| Excluida por tipo de documento | Excluidas por tipo de documento |
| Fuera de la ventana | Fuera de la ventana |
| Excluida por máximo de cuotas | Excluidas por máximo |
| Saldo residual | Saldo residual |
| Frenada por tope | Frenadas por tope |
| Moneda distinta de USD / Moneda incoherente | Contratos fuera por moneda |
| Sin identificación válida | Contratos fuera por identificación |
| Estado desconocido / Respuesta inconsistente | Contratos fuera por respuesta inconsistente |
| Consulta fallida | Consultas fallidas |
| Contrato ilegible en la lista | Contratos ilegibles en la lista |
| Sin deuda | Contratos sin deuda |

Además: contratos leídos, clientes nuevos (o que se crearían) y clientes actualizados.

**Actualización de pagadas:** facturas consultadas, marcadas pagadas (o que se marcarían), siguen pendientes, abono parcial, en revisión, sin evidencia, consultas fallidas y contratos releídos.

**Resumen de una línea de cada corrida (RF17).** Muestra los contadores principales y, además, cualquier otro contador que no sea 0, para que nada importante quede escondido en el detalle:

| Corrida | Contadores principales | Ejemplo |
| --- | --- | --- |
| Importación | Contratos leídos · Importadas · Clientes creados · Excluidas por estado | «Contratos leídos: 27 · Importadas: 42 · Clientes creados: 20 · Excluidas por estado: 9» |
| Importación simulada | Contratos leídos · Se importarían · Excluidas por estado | «Contratos leídos: 27 · Se importarían: 42 · Excluidas por estado: 9» |
| Actualizar pagadas (real o simulada) | Facturas consultadas · Marcadas pagadas (o Se marcarían pagadas) · Abono parcial · Siguen pendientes | «Facturas consultadas: 42 · Marcadas pagadas: 8 · Abono parcial: 1 · Siguen pendientes: 33» |
| Fallida | El error explicado | «El administrador rechazó el usuario o la contraseña. Revísalos en Configuración» |

## 6. Criterios de aceptación (verificables sin código)

Todos se comprueban con el panel, la fecha de la prueba (13 oct 2026), la base del administrador recién reiniciada (`/__sim/reiniciar`), Cobrix vacío (sin `data/cobrix.sqlite`, D15) y la configuración por defecto, salvo que se diga otra cosa.

### Configuración

- **CA1 (RF1, RF2, RF8).** Cargo empresa y proveedor, guardo y recargo la página → los datos siguen ahí y se ve la fecha de «Última modificación».
- **CA2 (RF3).** Después de guardar la contraseña, el campo aparece vacío. Si guardo otro cambio sin escribirla, «Probar conexión» sigue funcionando.
- **CA3 (RF4).** Con usuario `cobrix` y contraseña `cobrix-sandbox`, «Probar conexión» dice que la conexión es correcta y que hay **27 contratos**.
- **CA4 (RF4).** Con una contraseña incorrecta, «Probar conexión» dice que el administrador rechazó las credenciales.
- **CA5 (RF5, RF7).** Si escribo 61 en días de gracia, 0 en máximo de cuotas, 0 o 2,5 en tope de facturas, 0 en tope de monto, o dejo un tope vacío, no se guarda y el campo dice el rango permitido.
- **CA43 (RF1, RF7).** Si guardo la empresa sin nombre, con el RIF `hola` o con el correo `cobranza`, no se guarda y cada campo dice qué está mal y un ejemplo válido. Con `J-00000000-0` y `cobranza@example.com` se guarda.
- **CA6 (RF5, RF7).** Si desmarco todos los estados de contrato, no se guarda y se me pide elegir al menos uno.

### Importación

- **CA7 (RF10, RN35).** «Simular importación» dice que **42 cuotas** se importarían, que se crearían **20 clientes** y que el monto sería **USD 1.235,00**. Después, la tabla de clientes sigue vacía y la corrida aparece en el historial marcada como simulación.
- **CA8 (RF9).** «Importar» crea **20 clientes** y **42 facturas abiertas** por **USD 1.235,00**, numeradas de `CBX-000001` a `CBX-000042`.
- **CA9 (RF9, RF19, RN12, RN14, RN16).** El detalle de esa importación muestra **27 contratos leídos** (todos, de cualquier estado), **9 cuotas excluidas por estado**, **1 contrato fuera por moneda incoherente** (JORGE CASTILLO), **1 saldo residual** (SOFIA TORRES) y **1 contrato sin deuda** (LAURA MENDEZ).
- **CA10 (RN19).** «Importar» otra vez crea **0 facturas nuevas**, y el detalle muestra 42 «Ya importada».
- **CA11 (RN4).** LUIS GOMEZ aparece como **1 cliente con 2 contratos** y 5 facturas abiertas por **USD 115,00**. Su vencimiento más antiguo es **1 jul 2026**.
- **CA12 (RN1, RN3, RF12).** ELENA RUIZ tiene ID de cliente **`9000123`**, documento `09000123` y es natural. COMERCIAL EL FARO, C.A. tiene ID de cliente `J401234567`, documento `J-40123456-7` y es jurídica.
- **CA13 (RN2–RN14).** No aparecen como clientes: CARLOS ROJAS, ROSA DIAZ, PEDRO LEON, ANDRES VARGAS, LAURA MENDEZ y JORGE CASTILLO.
- **CA14 (RN17).** Con ventana de 3 meses, «Simular importación» muestra para MIGUEL ANGEL SOTO 4 cuotas que se importarían y 4 fuera de la ventana.
- **CA15 (RN18).** Con máximo 2 cuotas recientes, la simulación muestra para MIGUEL ANGEL SOTO 2 que se importarían (septiembre y octubre) y 6 excluidas por máximo.
- **CA16 (RN13).** Excluyendo el tipo J, la simulación muestra las 2 cuotas de COMERCIAL EL FARO, C.A. como excluidas por tipo de documento.
- **CA17 (RN20).** Con un tope de 10 facturas, la simulación muestra 10 que se importarían y 32 frenadas por tope.
- **CA18 (RN15).** Con 5 días de gracia, una factura de periodo agosto 2026 importada así tiene vencimiento 1 ago 2026 y corte 6 ago 2026.

### Pagos

Después de importar, se registran estos pagos en la caja del simulador:

| Cliente | En la caja |
| --- | --- |
| ANA PEREZ (900101) | `{"id_contrato": 900101}` |
| LUIS GOMEZ (900103) | `{"id_contrato": 900103, "monto": 25}` |
| COMERCIAL EL FARO, C.A. (900104) | `{"id_contrato": 900104}` |
| MIGUEL ANGEL SOTO (900114) | `{"id_contrato": 900114, "monto": 70}` |
| ELENA RUIZ (900113) | `{"id_contrato": 900113}` y luego `/__sim/anular` con el `id_factura` devuelto |

- **CA19 (RF15, RN35).** «Simular actualización» dice que se marcarían **8 facturas pagadas**. Después, ninguna factura cambió.
- **CA20 (RF14, RN24).** «Actualizar pagadas» marca pagadas las 3 de ANA PEREZ, 1 de LUIS GOMEZ (julio, contrato 900103), las 2 de COMERCIAL EL FARO y las 2 más viejas de MIGUEL ANGEL SOTO: **8 pagadas**, cada una con la fecha y el número de la factura del administrador.
- **CA21 (RF16, RN25).** El detalle muestra **1 abono parcial**: la cuota de agosto de LUIS GOMEZ, con lo que dice el administrador (USD 15,00) y lo que tiene Cobrix (USD 20,00). Esa factura sigue abierta por USD 20,00.
- **CA22 (RN26).** Las facturas de ELENA RUIZ siguen abiertas.
- **CA23.** Resultado final: **8 facturas pagadas** y **34 abiertas por USD 955,00**, tanto en el Resumen como sumando la tabla de clientes.
- **CA24 (RN32).** Repetir «Actualizar pagadas» marca **0** facturas y no cambia los totales.
- **CA25 (RN19).** Después del ciclo de pagos, «Importar» otra vez crea **0 facturas nuevas** y muestra **34 «Ya importada»**: las 8 cuotas pagadas ya no figuran como pendientes en el administrador y no se vuelven a crear.

### Corridas e historial

- **CA26 (RF20, RN33).** Con una contraseña incorrecta guardada, «Importar» termina como **Fallida**, el detalle explica que las credenciales fueron rechazadas y qué hacer, y no se creó ningún cliente.
- **CA27 (RF18, RF17).** El historial muestra cada corrida con tipo, fecha, si fue simulación, origen, estado y resumen, de la más reciente a la más antigua.
- **CA28 (RF19).** En el detalle de una importación puedo filtrar las filas por resultado (por ejemplo, solo «Excluida por estado») y veo solo esas.
- **CA29 (RF21).** Si inicio una corrida mientras otra está en curso, se me avisa y no se inicia una segunda.
- **CA30 (RF6, RN37).** Activo la corrida automática a la hora siguiente. Al llegar esa hora aparecen en el historial una importación y una actualización de pagadas con origen «Automática».

### Clientes, expediente y resumen

- **CA31 (RF24).** Buscar «gomez», «9876543» o «V-9876543» encuentra a LUIS GOMEZ; buscar «elena» o «09000123» encuentra a ELENA RUIZ.
- **CA32 (RF23, RF25).** Al ordenar por deuda, el primero de la tabla es el cliente con más deuda. Con el orden por defecto y después del ciclo de pagos, ANA PEREZ y COMERCIAL EL FARO, C.A. aparecen al final con deuda `USD 0,00` y «Sin facturas abiertas».
- **CA33 (RF26–RF30).** El expediente de LUIS GOMEZ muestra sus 2 contratos (ACTIVO y CORTADO) con plan, precio y sucursal, sus facturas con todos los datos y un historial con «Cliente creado» y «Factura importada». Después del ciclo de pagos aparece «Factura pagada en el ISP» con la factura del administrador.
- **CA34 (RF31, RF32, RF13).** Después del ciclo de pagos, el Resumen muestra 20 clientes, **27 contratos**, las facturas abiertas y pagadas de CA23, el proveedor, el estado de la corrida automática, las últimas 5 corridas y los botones «Importar» y «Actualizar pagadas».
- **CA35 (RF33, RF41).** Sin proveedor configurado, el Resumen y Sincronización lo dicen y llevan a Configuración.

### Reinicios y experiencia general

- **CA36 (RF34).** Si apago el servidor mientras corre una importación y lo vuelvo a levantar, esa corrida figura como «Fallida», con el motivo, y no se creó ninguna factura ni cliente de esa corrida.
- **CA37 (RF35).** «Importar» y «Actualizar pagadas» piden confirmación; las simulaciones no.
- **CA38 (RF36).** Con Cobrix vacío, la tabla de clientes dice que todavía no hay clientes y ofrece ir a Sincronización.
- **CA39 (RF36).** Si el servidor de Cobrix no responde, cada pantalla muestra un error que dice qué pasó y un botón «Reintentar».
- **CA40 (RF37).** Al terminar una importación aparece un aviso con el resultado y un enlace a la corrida.
- **CA41 (RF39).** Todos los montos se ven como `USD 1.235,00` y ninguna fecha aparece como `2026-10-13` fuera de un detalle técnico.
- **CA42 (RF40).** En un teléfono (360 px de ancho) puedo navegar todas las pantallas, usar el menú y ver las tablas sin que la página se desborde de costado.

## 7. Casos límite

- **CL1.** ¿Qué pasa si se importa sin proveedor configurado? → No se inicia; se avisa y se lleva a Configuración (RF41).
- **CL2.** ¿Qué pasa si el administrador no responde o tarda demasiado al iniciar sesión o al listar contratos? → Corrida fallida con el error explicado y nada cambiado (RN33).
- **CL3.** ¿Qué pasa si falla un solo contrato a mitad de la corrida? → Ese contrato queda «Consulta fallida» y la corrida sigue (RN7, RN31).
- **CL4.** ¿Qué pasa si el permiso de acceso vence a mitad de una corrida? → Se vuelve a iniciar sesión una vez y se sigue. Si falla otra vez, la corrida falla (RN33).
- **CL5.** ¿Qué pasa si la lista de contratos viene vacía? → La corrida termina «Completada» con 0 contratos leídos, y el resumen lo dice. No es un error.
- **CL6.** ¿Qué pasa si la lista de contratos trae un número repetido? → El contrato se procesa una sola vez.
- **CL7.** ¿Qué pasa si la respuesta dice `success: false` pero trae datos? → Se ignora ese campo y se usan los datos, validándolos (RN8).
- **CL8.** ¿Qué pasa si el libro trae cuotas futuras o cuotas que Cobrix no tiene? → Se ignoran: solo se miran las filas de las cuotas de facturas abiertas.
- **CL9.** ¿Qué pasa si el libro trae un pago anulado? → Cuenta el saldo actual de la cuota: si volvió a deber, sigue pendiente (RN26).
- **CL10.** ¿Qué pasa si un titular cambia de nombre o de correo en el administrador? → Se actualiza en la siguiente importación (RN6) y las facturas no cambian.
- **CL11.** ¿Qué pasa si un contrato importado pasa a RETIRADO? → Sus facturas abiertas siguen abiertas y se siguen revisando en «Actualizar pagadas» (RN23).
- **CL12.** ¿Qué pasa si se cambia la configuración después de importar (por ejemplo, se excluye J)? → Las facturas ya importadas no se tocan; la regla vale para las próximas importaciones (RN23).
- **CL13.** ¿Qué pasa si se pide una corrida mientras hay otra en curso? → Se avisa y no se inicia (RF21).
- **CL14.** ¿Qué pasa si la búsqueda de clientes no encuentra nada? → Mensaje «No hay clientes que coincidan con…» y un botón para limpiar la búsqueda.
- **CL15.** ¿Qué pasa si se abre el expediente o el detalle de corrida de algo que no existe (por ejemplo, un enlace viejo o mal escrito)? → Mensaje «No encontramos ese cliente» (o esa corrida) y un enlace para volver.
- **CL16.** ¿Qué pasa si una factura abierta no aparece en el libro ni en el contrato? → «Sin evidencia»: sigue abierta y nunca se marca pagada (RN30).
- **CL17.** ¿Qué pasa si la URL de la API se escribe con o sin `/api/v1`, o con una barra al final? → Funciona igual.
- **CL18.** ¿Qué pasa si se abre una dirección del panel que no existe? → «No encontramos esa pantalla», con un enlace al Resumen; el servidor responde 404.
- **CL19.** ¿Qué pasa si el tope de monto es menor que la primera cuota nueva? → Esa y todas las siguientes quedan frenadas; se importan 0 (RN20).
- **CL20.** ¿Qué pasa si la corrida automática coincide con una manual en curso? → La automática queda registrada como fallida por corrida en curso (RN36).
- **CL21.** ¿Qué pasa si las cuotas de un contrato llegan desordenadas? → El resultado no depende del orden: las cuotas se ordenan por periodo antes de aplicar el máximo de cuotas y los topes (RN18, RN20).
- **CL22.** ¿Qué pasa si el administrador devuelve solo los contratos activos? → No debe pasar: la lista se pide de forma que traiga todos los estados. Se comprueba con los 27 contratos leídos (CA3, CA9).
- **CL23.** ¿Qué pasa si la lista de contratos viene incompleta, por ejemplo «página 1 de 10»? → La corrida falla sin cambiar nada: «La lista de contratos vino incompleta (llegaron X de Y)». Nunca se importa una parte creyendo que es todo (RN33).
- **CL24.** ¿Qué pasa con los campos `success` y `errors` de las respuestas? → No deciden solos: lo que decide es si la respuesta llegó bien y si los datos se pueden leer. `success` se lee y se registra como segunda opinión (D34): si dice `false` pero los datos son válidos, se procesa normal y queda anotado en los datos técnicos de la corrida, sin mostrárselo al operador; si los datos vienen rotos, el mensaje del administrador se agrega al error (CL7). `errors` trae siempre una fila vacía; si alguna vez trae un mensaje con texto, queda como **advertencia** visible en el detalle de la corrida («El administrador informó: …»), sin hacerla fallar.
- **CL25.** ¿Qué pasa si la lista de contratos trae datos raros? → Si no viene como lista, la corrida falla sin cambiar nada (RN33). Si viene como lista con algunos elementos raros, los que son el mismo número escrito distinto se aceptan y los ilegibles quedan a la vista para revisarlos a mano; la corrida sigue (RN38).
- **CL26.** ¿Qué pasa si se corre «Actualizar pagadas» sin facturas abiertas en Cobrix? → La corrida termina **completada** con 0 facturas consultadas, sin conectarse al administrador (no hay nada que preguntarle). El resumen dice: «No hay facturas abiertas para revisar. Importa primero desde el administrador».

## 8. Fuera de alcance

Esta versión **no**:

- tiene inicio de sesión ni usuarios para el panel;
- tiene un botón para desconectar el proveedor: para que Cobrix deje de leerlo, se apaga la corrida automática o se cambian las credenciales;
- maneja varias empresas ni varios administradores de facturas: hay uno de cada uno (D39);
- escribe en el administrador de facturas: solo lo lee (el simulador de caja lo usa la persona que prueba, no Cobrix);
- contacta ni cobra a los clientes finales (correos, mensajes, links de pago);
- permite crear, editar, anular ni marcar pagadas facturas a mano;
- aplica abonos parciales: el saldo de una factura solo cambia cuando queda pagada por completo;
- maneja monedas distintas del dólar;
- importa cuotas futuras;
- recupera corridas automáticas que no corrieron porque el sistema estaba apagado;
- permite configurar la ventana de consulta del libro de cuotas: se calcula sola (sección 5.3);
- exporta datos (CSV, PDF) ni guarda un historial de cambios de la configuración (el CSV, el estado de cuenta imprimible y el registro de auditoría se agregan en `specs/extras/punto-diferencial/`);
- tiene modo oscuro;
- ofrece una app nativa ni acceso autenticado para otras aplicaciones;
- incluye el **punto diferencial**: está en su propia spec, `specs/extras/punto-diferencial/spec.md`.

## 9. Decisiones tomadas

- **D1.** ¿Una spec o varias? → Una spec completa para todo el enunciado; los agregados posteriores van en `specs/extras/`.
- **D2.** ¿Punto diferencial? → Fuera de esta versión; se define después con su propia spec.
- **D3.** ¿Campos que aparecen en las capturas de referencia pero no en el enunciado? → Se incluyen «Nombre visible» del proveedor (hace falta para el origen del cliente y el Resumen), «Zona horaria y moneda» (solo lectura) y el resultado «En revisión» (hace falta para la evidencia contradictoria). No se incluye «Ventana de consulta de pagadas»: el rango del libro se calcula solo.
- **D4.** ¿Valores por defecto? → Los de la captura de referencia: ACTIVO y CORTADO, sin ventana, sin máximo, 0 días de gracia, topes de 500 facturas y USD 50.000,00, sin tipos excluidos y corrida automática apagada.
- **D5.** ¿La ventana incluye el mes límite? → Sí: con N=3 el 13 oct 2026 entra desde `2026-07`.
- **D6.** ¿Cómo actúan los topes? → Por número de contrato y de la cuota más vieja a la más nueva; desde la primera que supera, todo lo siguiente queda frenado.
- **D7.** ¿Cuándo se aplica el máximo de cuotas? → Después del saldo residual y la ventana.
- **D8.** ¿Qué pasa con lo importado si cambia algo después? → Las facturas no se tocan; los datos del cliente y del contrato sí se actualizan.
- **D9.** ¿Qué pasa si la API falla en medio? → Si falla el inicio de sesión o la lista de contratos, la corrida falla sin cambiar nada; si falla un contrato, ese queda fuera y la corrida sigue.
- **D10.** ¿Dos corridas a la vez? ¿Se recupera una automática perdida? → No, y no.
- **D11.** ¿Número de factura? → `CBX-000001`, correlativo.
- **D12.** ¿Qué fecha de pago se muestra? → La de la factura del administrador más reciente que tocó la cuota, con su número.
- **D13.** ¿Qué pide confirmación? → «Importar» y «Actualizar pagadas». Las simulaciones no.
- **D14.** ¿Login para el panel? → No; queda fuera de alcance.
- **D15.** ¿Cómo se empieza de cero? → Con el servidor apagado, se borra `data/cobrix.sqlite`. No hay un botón: borrar datos no es una tarea del operador.
- **D16.** ¿Un abono parcial rebaja el saldo en Cobrix? → No. Se informa y la factura sigue abierta por su saldo original, como en la captura de referencia.
- **D17.** ¿Cuándo es «moneda incoherente»? → Si **alguna** cuota con saldo mayor que cero es menor al 1 % del precio del plan. Se elige la regla más prudente: ante la duda, el contrato queda fuera y se explica.
- **D18.** ¿Se aceptan minúsculas y separadores en la identificación? → Sí (guion, punto y espacio); no es adivinar, es la misma identificación escrita distinto.
- **D19.** ¿Una cuota con periodo futuro en la lista de pendientes? → Es una respuesta inconsistente: el contrato queda fuera.
- **D20.** ¿Un saldo menor a un centavo en el libro? → Cuenta como 0, igual que en la importación.
- **D21.** ¿Una exoneración es pago? → No: queda «En revisión», sigue abierta.
- **D22.** ¿La corrida automática usa la fecha de la prueba? → La hora de disparo es la real de Caracas; la fecha de «hoy» para las reglas es la de la prueba cuando está fijada.
- **D23.** ¿Si la importación automática falla, se actualizan las pagadas? → Sí; son independientes y ambas quedan registradas.
- **D24.** ¿«Probar conexión» usa los datos guardados o los del formulario? → Los del formulario; si la contraseña está vacía, usa la guardada. No guarda nada.
- **D25.** ¿Una simulación queda en el historial? → Sí, marcada como simulación. Es lo único que guarda.
- **D26.** ¿Cuándo se guarda un contrato? → Todo contrato que se pudo leer en una importación real, aunque no se importe ninguna de sus cuotas; se actualiza en cada importación. Motivo: el Resumen de la referencia muestra los 27 contratos, y el expediente muestra todos los contratos del titular. Los de respuesta inconsistente o consulta fallida no se guardan, para no guardar datos dudosos.
- **D27.** ¿Tuteo o usted? → Tuteo, en español neutro, como el enunciado.
- **D28.** ¿Orden por defecto de la tabla de clientes? → Vencimiento más antiguo primero: es a quien conviene cobrar antes.
- **D29.** ¿Qué se muestra en un cliente sin facturas abiertas? → Deuda `USD 0,00` y «Sin facturas abiertas». No «Al día»: Cobrix no sabe si el titular debe algo que no se importó (otro contrato excluido, cuotas fuera de la ventana o frenadas).
- **D30.** ¿Documento o ID de cliente? → Las dos cosas: el ID de cliente es la identificación normalizada y agrupa los contratos; el documento es el original del administrador y es lo que se muestra. Así lo piden el enunciado («ID de cliente `9000123`») y la referencia.
- **D31.** ¿Se cierra la sesión en el administrador al terminar una corrida? → No: no se usa `logout` porque `API.md` no lo documenta. El token se descarta al terminar y la API lo vence sola a las 2 horas.
- **D32.** ¿El login acepta usuario o también correo? → Solo usuario (`user_name`), que es lo que documenta `API.md`.
- **D33.** ¿Qué se hace con un elemento ilegible en la lista de contratos? → Se separa el caso: si la respuesta entera está rota, la corrida falla; si solo algunos elementos son raros, se normaliza lo que es el mismo número escrito distinto y lo ilegible queda en cuarentena, visible y con la nota para revisarlo a mano, mientras la corrida sigue. Motivo: un dato malo no debe frenar la cobranza de todos los demás, pero tampoco puede perderse en silencio. Sigue los patrones *Tolerant Reader* (Fowler) e *Invalid Message Channel* (*Enterprise Integration Patterns*).
- **D34.** ¿Qué se hace con `success`? → Se lee y se registra siempre, pero no decide solo: decide el código HTTP y que los datos se puedan leer. Si `success` es `false` con datos válidos, se procesa normal y se anota en los datos técnicos de la corrida (el operador no lo ve). Si los datos vienen rotos, el `message` del administrador se suma al error. Motivo: `API.md` documenta que no es confiable («no hay que fiarse de ese campo»), y se sigue el contrato documentado del proveedor; si un proveedor documentara que `success` sí es confiable, se respetaría. Se basa en el estándar RFC 9457, *Problem Details for HTTP APIs* (IETF): el código HTTP da el significado general de la respuesta y el cuerpo aporta los detalles del error.
- **D35.** ¿Qué reloj usan las fechas? → Dos relojes, cada uno para lo suyo. Las **fechas de negocio** (mes actual, ventana, vencimientos, qué cuota es del mes) usan la **fecha de trabajo**: la de la prueba (13 oct 2026) cuando está fijada. Los **momentos en que pasó algo** (inicio de una corrida, cliente creado, factura importada) usan la **hora real**, porque ocurrieron de verdad en ese momento.
- **D36.** ¿Se validan los datos de la empresa? → Sí, lo mínimo: nombre obligatorio, RIF con formato y correo con forma de correo. El enunciado no lo pide; se valida para no guardar datos basura y dar mensajes claros (§3.7). Estos datos no intervienen en las corridas, así que la validación no puede afectarlas.
- **D37.** ¿Los 6 a 12 dígitos de la identificación se cuentan antes o después de quitar los ceros a la izquierda? → Después. El enunciado describe cómo queda la identificación ya normalizada («letra opcional y de 6 a 12 dígitos, sin separadores ni ceros a la izquierda»). Así, `V-000123` queda en 3 dígitos y no es válida: no se importa, pero queda a la vista para revisarla a mano (RN2). Aceptarla crearía un cliente `V123` que no es una cédula real y podría mezclar a personas distintas.
- **D38.** ¿Qué se puede borrar? → Nada: Cobrix no borra datos. No se usa borrado lógico (`is_deleted`): obligaría a filtrar en cada consulta, rompería la idempotencia y la numeración al volver a importar, y un filtro olvidado mezclaría datos viejos con nuevos. Las relaciones de la base impiden borrar algo que otro dato usa.
- **D39.** ¿Varios proveedores? → No: uno solo, como el enunciado; su configuración es una fila de `providers`.
- **D53.** ¿Cómo se guarda la contraseña del proveedor? → Cifrada (AES-256-GCM). La clave sale de `COBRIX_SECRET_KEY` o, sin ella, de un archivo que se crea una vez junto a la base (`data/cobrix.sqlite.key`), nunca dentro de ella. Si no se puede descifrar (otra clave), el panel la pide de nuevo.
- **D54.** ¿Cómo se evita que otra página web use la API (CSRF)? → Toda escritura (`POST`, `PUT`) tiene que ser JSON (`415` si no) y, si el navegador dice de dónde viene (`Origin`), tiene que ser el propio Cobrix (`403` si no). No hay login: el panel es local y de un solo operador.
- **D55.** ¿Qué cabeceras de seguridad lleva cada respuesta? → `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y una `Content-Security-Policy` que solo deja cargar archivos del propio Cobrix y no deja meter el panel en un iframe.
- **D56.** ¿Cómo sabe el operador qué revisar? → El Resumen tiene «Requiere atención»: los casos para una persona (abono parcial, en revisión, sin evidencia, consultas fallidas, respuestas inconsistentes, identificación inválida, frenadas por tope) de la última corrida real de cada tipo, o que esa corrida falló. Cada línea abre la corrida filtrada. Una simulación no cuenta.
- **D57.** ¿Dónde se ve un abono parcial fuera de la corrida? → En el expediente, la factura lleva «Abono parcial» y lo que el ISP dice que todavía se debe; en Clientes, el cliente lleva la etiqueta. Sale de la última «Actualizar pagadas» real; el saldo de Cobrix no cambia (RN25).
- **D58.** ¿Cómo se conecta rápido al sandbox de la prueba? → Mientras no hay contraseña guardada, Configuración ofrece «Usar el sandbox de la prueba», que completa la URL, el usuario y la contraseña públicos de `docs/API.md`. Solo completa el formulario: no se guarda nada hasta «Guardar proveedor». No son un secreto de un ISP real.
- **D59.** ¿Se puede aplicar lo que mostró una simulación? → Sí: el detalle de una simulación completada ofrece la corrida real del mismo tipo, con su confirmación de siempre, y al iniciarla abre su detalle.
