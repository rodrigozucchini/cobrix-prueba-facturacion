---
name: ui-ux
description: Reglas de diseño visual y experiencia del panel React de este proyecto. Tokens en variables CSS, colores por estado, esqueletos de carga, tablas, formularios, vacíos, errores, confirmaciones, avisos, textos, accesibilidad y pantallas angostas. Úsalo antes de crear o cambiar cualquier pantalla o componente en src/panel/.
---

# UI/UX del panel

Un panel de trabajo para un operador de cobranza: **claro, rápido de leer y que siempre diga qué está pasando.** Lo técnico de React está en `stack-node` → `references/panel.md`; este skill dice cómo se ve y cómo se usa.

## 0. Pantallas

Qué bloques tiene cada pantalla y en qué orden. Sale de la referencia de layout del enunciado (`docs/capturas/referencia-layout/`): es una guía de **organización**, no un diseño a copiar. Los datos de cada bloque están en la spec (RF de cada sección).

**Menú lateral** (en pantallas angostas, menú desplegable): Resumen · Clientes · Sincronización · Configuración. Abajo, el nombre de la empresa. El Expediente y el Detalle de corrida se abren desde otras pantallas y tienen «← Volver».

| Pantalla | Bloques, de arriba hacia abajo |
| --- | --- |
| **Resumen** (`/`) | 1. Encabezado, con «Importar» y «Actualizar pagadas» a la derecha (RF32). 2. Cinco contadores: clientes, contratos, facturas abiertas, facturas pagadas y por cobrar (RF31). 3. Bloque **Proveedor**: nombre, URL, estados que se importan, ventana y máximo, corrida automática (activa y hora), con el enlace «Editar configuración». Sin proveedor: aviso que lleva a Configuración (RF33). 4. **Últimas corridas** (5), con «Ver todas» |
| **Configuración** | Dos bloques. 1. **Empresa**: nombre, RIF, correo; zona horaria y moneda solo de lectura; «Guardar empresa». 2. **Proveedor**, con «Probar conexión» arriba a la derecha: nombre visible, URL, usuario y contraseña («Déjala vacía para conservar la actual»); después, **las opciones de importación agrupadas**: estados (casillas), ventana (lista), máximo de cuotas, días de gracia, topes, tipos de documento excluidos (casillas) y corrida automática (casilla + hora); «Guardar proveedor» y «Última modificación» |
| **Sincronización** | 1. Dos tarjetas lado a lado (una debajo de la otra en móvil): **Importar cuotas** («Simular importación» + «Importar») y **Actualizar facturas pagadas** («Simular actualización» + «Actualizar pagadas»), cada una con una línea que explica qué hace. 2. **Historial de corridas**: número, tipo con distintivos «Simulación» y «Automática», inicio, estado y resumen; cada fila abre el detalle |
| **Detalle de corrida** | 1. «← Sincronización», título («Importación #2»), fecha, estado, duración y origen. Si falló, el error destacado. 2. **Contadores destacados** en tarjetas. Importación: contratos leídos, importadas (o se importarían), clientes creados, ya importadas, excluidas por estado. Pagadas: consultadas, marcadas pagadas (o se marcarían), abono parcial, siguen pendientes, sin evidencia y en revisión. 3. **Todos los contadores** en una tabla. 4. Advertencias del administrador, si las hay (CL24). 5. **Detalle**: una fila por cuota (contrato, cuota, cliente con enlace al expediente, resultado, motivo, monto), con filtro por resultado |
| **Clientes** | 1. Encabezado con una línea que explica qué es la tabla. 2. Búsqueda y cantidad de clientes. 3. Tabla con las columnas de RF23, ordenable (RF25); cada fila abre el expediente |
| **Expediente** | 1. «← Clientes», nombre, tipo y documento. 2. Cuatro totales: deuda abierta, facturas abiertas, facturas pagadas y contratos. 3. Dos bloques lado a lado (uno debajo del otro en móvil): **Datos del cliente** y **Contratos en el administrador**. 4. **Facturas** (tabla, de la más nueva a la más vieja). 5. **Historial** (del más reciente al más antiguo) |

## 1. Todo sale de variables CSS

- Colores, radios, sombras y tipografía viven como **variables CSS en `:root`**, en `src/panel/styles.css`. Tailwind las expone como clases (`bg-primary`, `text-success-fg`…). Los valores están en [`references/tokens.md`](references/tokens.md).
- **Prohibido el color suelto en los componentes:** ni `bg-green-500` ni `#16a34a`. Si falta un color, primero se crea su variable.
- **Solo modo claro.** Como todo es variable, un modo oscuro sería agregar un bloque de valores; queda fuera de alcance.
- Estilo neutro de shadcn/ui con **un solo color de acento** (`--primary`) para la acción principal de cada pantalla.
- Tipografía del sistema (`system-ui`), sin fuentes descargadas. **Montos y números con `tabular-nums`**, alineados a la derecha. IDs (contrato, cuota, factura) en monoespaciada.
- Íconos de **lucide**, siempre acompañados de texto o con `aria-label`.

## 2. Estados: un solo lugar, siempre color + ícono + texto

Todos los estados se dibujan con un `StatusBadge` que lee un único mapa en `src/panel/lib/status.ts` (estado → tono, ícono y texto). Ninguna pantalla decide colores por su cuenta.

| Tono | Variable | Estados |
| --- | --- | --- |
| Éxito | `--success` | Pagada, Importada, Marcada pagada, Corrida completada, Conexión correcta |
| Información | `--info` | Abierta, Sigue pendiente, Simulación, Se importaría, Se marcaría pagada |
| Advertencia | `--warning` | Abono parcial, Frenada por tope, Sin evidencia, En revisión, Corrida en curso, y todo lo que pide revisar a mano: Sin identificación válida, Estado desconocido, Respuesta inconsistente, Contrato ilegible en la lista |
| Peligro | `--danger` | Corrida fallida, Consulta fallida, Contrato CORTADO |
| Apagado | `--muted` | Ya importada, Sin deuda, Excluida (por estado, ventana, moneda, saldo residual, tipo de documento, máximo de cuotas) |

Los motivos técnicos (`contract_pending`, `ledger_pending`) **nunca** se muestran solos: primero la frase para una persona y el código, si aporta, en gris y pequeño.

## 3. Cargas: esqueletos, no pantallas en blanco

- **Toda lectura muestra un esqueleto** con la misma forma que el contenido final: tarjetas con bloques grises donde irán los números, filas grises donde irá la tabla. Así la pantalla no «salta» cuando llegan los datos.
- **Cada sección carga por su cuenta:** si los totales llegan antes que las corridas, se muestran ya. Nunca un cargador que bloquee toda la pantalla.
- **Al volver a pedir datos** (búsqueda, filtros, refresco) se mantiene lo anterior visible y atenuado, con un indicador pequeño, en lugar de volver al esqueleto.
- **Acciones** (Importar, Guardar, Probar conexión): el botón muestra un spinner y un texto en curso («Importando…») y queda deshabilitado para no lanzar dos veces. El resto de la pantalla sigue usable.
- **Corridas:** mientras una corrida está en curso, su estado se actualiza solo (consultando cada pocos segundos) y se ve en Sincronización y en Resumen.
- Con `prefers-reduced-motion`, el brillo animado del esqueleto se apaga.

## 4. Patrones de pantalla

- **Encabezado:** título, una línea que explica para qué sirve la pantalla y, a la derecha, la acción principal.
- **Contadores** arriba, en tarjetas: número grande, etiqueta corta y, si suma, el monto. Los importantes van primero.
- **Tablas:**
  - encabezado fijo al hacer scroll;
  - montos a la derecha y fechas legibles (`13 oct 2026`);
  - fila completa clicable y navegable con teclado cuando abre un detalle;
  - en pantallas angostas, scroll horizontal dentro de la tarjeta, nunca de la página;
  - filtros por resultado o estado cuando hay más de un tipo de fila (por ejemplo, el detalle de una corrida).
- **Búsqueda:** filtra mientras se escribe (con una pausa de ~250 ms) y queda en la URL (`?q=`), para que «Atrás» y compartir el enlace funcionen.
- **Detalle de corrida:** primero lo destacado (importadas, excluidas, frenadas o pagadas), después todos los contadores y luego una fila por cuota con su resultado y su motivo.
- **Simulación:** se distingue a simple vista de una corrida real, con un distintivo «Simulación» y un texto del tipo «Esto es lo que pasaría; no se guardó nada».

## 5. Vacíos, errores y confirmaciones

- **Vacío:** ícono, qué significa y **qué hacer**, con un botón. Por ejemplo: «Todavía no hay clientes. Importa desde el administrador para traerlos» y un botón «Ir a Sincronización».
- **Error:** un aviso en el lugar donde falló que dice **qué pasó y cómo seguir**, con un botón «Reintentar». Por ejemplo: «No se pudo conectar con el administrador: el usuario o la contraseña no son correctos. Revisa las credenciales en Configuración». Nunca un error crudo ni un stack.
- **Confirmación** antes de acciones que escriben o borran, con `AlertDialog`: dice qué va a pasar y cuántas cosas afecta («Se importarán hasta 42 facturas»). El botón dice la acción («Importar»), no «Aceptar». Las simulaciones no piden confirmación.
- **Avisos breves (toasts)** al terminar una acción: el resultado en una línea y un enlace al detalle («Importación completada: 42 facturas nuevas · Ver corrida»).

## 6. Formularios

- Etiqueta arriba, una ayuda corta debajo si hace falta y el error en rojo debajo del campo.
- Se valida al salir del campo y al guardar, con los mismos límites que el backend (por ejemplo, días de gracia de 0 a 60). El backend vuelve a validar siempre.
- Los opcionales dicen qué pasa si quedan vacíos («Vacío = todas»).
- **Contraseña:** el campo nunca muestra la guardada; la ayuda dice «Déjala vacía para conservar la actual».
- Guardar deshabilitado mientras guarda; al terminar, un aviso y la fecha de «Última modificación».

## 7. Textos

- Español neutro, tuteo (como el enunciado), frases cortas.
- Los botones dicen la acción con un verbo: «Importar», «Simular importación», «Actualizar pagadas», «Probar conexión».
- Dinero siempre con moneda (`USD 1.235,00`); fechas legibles en America/Caracas; nada de `2026-10-13` crudo salvo en un detalle técnico.
- Sin jerga de programación frente al usuario.

## 8. Accesibilidad y pantallas angostas

- Contraste AA como mínimo; foco visible en todo lo que se puede usar con teclado.
- Todo campo con etiqueta; los íconos solos llevan `aria-label`.
- Los avisos y los cambios de estado de una corrida se anuncian con `aria-live`.
- Zonas táctiles de al menos 40 px.
- **Móvil primero:** el menú lateral pasa a un menú desplegable (`Sheet`) en pantallas angostas; las tarjetas de contadores van en 2 columnas; los formularios, en 1.
- Transiciones cortas (~150 ms) y nunca necesarias para entender algo.
