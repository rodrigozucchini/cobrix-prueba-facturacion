# Nota de decisiones

El detalle de cada decisión está en [`specs/`](specs/), con su ID: D en la spec, DT en el plan y P en los registros de cada fase (`specs/implementacion/`).

## Cómo se trabajó

Con **desarrollo guiado por especificaciones**: primero la [constitution](specs/constitution.md), la [spec](specs/spec.md), el [plan](specs/plan.md), el [modelo de datos](specs/data-model.md) y las [tareas](specs/tasks.md); después, la implementación **por fases**, con la prueba primero en cada regla. Cada fase empezó con una propuesta aprobada y cerró con su verificación.

Lo que no estaba claro en el enunciado se decidió y quedó anotado en la sección 9 de la spec (D1–D39, D53–D59 para seguridad y experiencia). El punto diferencial sigue con D40–D52. La IA y yo: [`USO-DE-IA.md`](USO-DE-IA.md).

## Stack y diseño (§3.7)

- **Backend sobre el esqueleto:** Node 24 + TypeScript, con **NestJS** para la API HTTP (DT1). Las reglas, las corridas y la base no tienen dependencias (`node:sqlite`, `fetch`, `node:test`) y no saben que existe Nest. Los tipos de la API JSON se comparten con el panel: si cambia una respuesta, `typecheck` falla en los dos lados (DT11).
- **Base propia** (`data/cobrix.sqlite`), separada de la del administrador, con quien Cobrix solo habla por HTTP (D38, D39).
- **Panel en React + Vite + TanStack Query + React Router, con Tailwind y componentes estilo shadcn/ui** (DT10). El esqueleto en HTML plano se quedaba corto para tablas con filtros, diálogos y estados de carga, y estas piezas son estándar, accesibles y fáciles de leer para el siguiente dev.
- **Criterio visual:** un panel de trabajo sobrio con un solo color de acento; cada estado con color, ícono y texto desde un único mapa (`src/panel/lib/status.ts`); montos `USD 1.235,00` y fechas `13 oct 2026`; esqueletos de carga, vacíos que dicen qué hacer, errores con «Reintentar» y confirmación en lo que escribe; usable a 360 px.

## Decisiones principales

| Decisión | Por qué | Fuente |
| --- | --- | --- |
| **Nunca se adivina:** un dato raro, contradictorio o desconocido deja fuera ese contrato o cuota, con el motivo a la vista, y la corrida sigue | Un dato malo no debe frenar la cobranza, pero tampoco puede entrar mal | Constitution 4, D9, D17, D19, D33 |
| Una factura se marca pagada **solo con evidencia completa** en el libro de cuotas. Un abono parcial se informa y no rebaja el saldo; una exoneración no es pago | Marcar pagado algo que no lo está es el peor error de un sistema de cobranza | RN24–RN31, D16, D21 |
| Toda corrida **lee y clasifica todo, y aplica en una sola transacción** al final. «Simular» corre el mismo código, sin aplicar | Una corrida fallida no cambia nada, y la simulación nunca miente | DT3, DT4 |
| **Idempotencia:** reimportar no duplica; las facturas ya creadas no se tocan, y los datos del cliente y del contrato sí se actualizan | Repetir tiene que ser seguro | RN19, D8 |
| **Dos relojes:** las reglas usan la fecha de trabajo (2026-10-13); los momentos y la corrida automática, el reloj real de Caracas | Los criterios dependen de la fecha; lo que pasa de verdad, no | D22, D35 |
| **Seguridad sin dependencias:** contraseña cifrada con la clave fuera de la base, el token solo en memoria, escrituras solo como JSON y desde el propio Cobrix (CSRF) y cabeceras de seguridad | Una copia de la base no revela la contraseña y otra página no puede disparar una importación | DT6, D53–D55 |
| **Nada se borra:** no hay acción que borre datos ni borrado lógico, y las relaciones de la base lo impiden | Un `is_deleted` olvidado mezclaría datos, y borrar no es una tarea del operador | D15, D38 |
| Búsqueda y orden **en el backend**, con la misma regla de identificación de la importación | La normalización del documento vive en un solo lugar | DT7 |
| «**Requiere atención**» en el Resumen: abonos parciales, casos en revisión y corridas fallidas, cada uno abre la corrida filtrada | El operador sabe qué revisar sin recorrer cada corrida | D56, D57 |

## Qué quedó fuera

Sigue la sección 8 de la spec: usuarios e inicio de sesión, varias empresas o proveedores, escribir en el administrador, contactar o cobrar a los clientes, editar facturas a mano, aplicar abonos parciales, otras monedas, cuotas futuras, recuperar una corrida automática perdida y modo oscuro.

El panel **no tiene pruebas de componentes ni de punta a punta**: sus datos los cubren las pruebas de la API, y las pantallas se verifican a mano con [`specs/verificacion.md`](specs/verificacion.md).

## Qué haría con más tiempo

- La clave de la contraseña en un **gestor de secretos**.
- **Autenticación y versión** en la API JSON (`/api/v1`) y **usuarios con permisos** en el panel.
- **Pruebas de punta a punta** del panel con Playwright.
- **Progreso en vivo** de una corrida larga y avisos por correo cuando una corrida automática falla.
- **Rotación** de la auditoría.

## Punto diferencial

**Saber a quién cobrarle primero, poder llevar esa información fuera del panel, y que todo quede registrado.** Tiene su propia [spec](specs/extras/punto-diferencial/spec.md), plan y tareas.

1. **Antigüedad de la deuda:** el Resumen reparte las facturas abiertas en 0–30, 31–60, 61–90 y más de 90 días desde el vencimiento, y cada tramo abre Clientes filtrado (D40–D42).
2. **Exportar a CSV** la tabla de clientes y el detalle de una corrida, con su filtro, en formato para Excel en español (D43, D44).
3. **Estado de cuenta imprimible** por cliente, con el membrete de la empresa; sin deuda, es una constancia. El PDF lo hace la impresión del navegador (D45–D47, DT14).
4. **Registro de auditoría** de cada acción, con autor `operador` o `sistema`. Vive **fuera de la base**, en líneas JSON que solo se agregan: sobrevive a una base dañada, sin secretos ni datos personales, y si no se puede escribir la acción sigue y se avisa (D48–D52).
