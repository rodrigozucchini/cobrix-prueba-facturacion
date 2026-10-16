# Constitution · Cobrix (integración con el administrador de facturas)

Panel para que un operador de cobranza de Cobrix importe clientes y facturas desde el administrador de facturas de un ISP y marque como pagadas las que el ISP ya cobró.

Estos principios mandan sobre cualquier spec, plan o tarea. Si algo los contradice, se para y se pregunta.

## Principios

### 1. Simplicidad ante todo

Entre dos soluciones, siempre la más simple. Es una primera versión: el backend sobre el esqueleto entregado (Node 24 y TypeScript), con NestJS solo para la API HTTP y las reglas sin dependencias, y el panel con React. Nada de complejidad anticipada.

### 2. Idioma y mercado

Todo el producto en español. Mercado: Venezuela, con documentos V, E, J, G y P, RIF y hora de America/Caracas. Moneda: dólar estadounidense, mostrado como `USD 1.235,00`. Fechas legibles para una persona.

### 3. Cero alcance fantasma

No se implementa nada que no esté en el enunciado o en una spec. El punto diferencial también: primero se escribe su spec y después se construye. Si surge una idea nueva, se propone; no se construye.

### 4. Nunca se adivina

Si una respuesta del administrador es rara, contradictoria o desconocida, ese dato se deja fuera y se registra el motivo. Una factura solo se marca pagada con evidencia completa en el libro de cuotas.

### 5. Repetible y explicable

Repetir una corrida no duplica ni cambia nada que ya esté bien. Cada corrida deja una fila por cuota con su resultado y su motivo, también cuando falla. «Simular» hace exactamente lo mismo que la corrida real, pero sin guardar nada.

### 6. Verificable por una persona no técnica

Cada criterio de éxito se puede comprobar desde el panel, con los datos de la prueba y el simulador de caja, sin leer código. Además, cada regla de negocio tiene su prueba automática.

### 7. Datos con respeto

Se guarda solo lo imprescindible. Ninguna clave ni secreto va en el código: las credenciales del proveedor se cargan en Configuración y la contraseña no se vuelve a mostrar. Con el administrador se habla solo por su API, nunca tocando su base.

## Cómo se usa

- Toda spec, plan y lista de tareas se revisa contra estos principios antes de darse por buena.
- Cambiar un principio es una decisión explícita: se anota abajo con la fecha y el motivo.

## Cambios

| Fecha | Cambio | Motivo |
| --- | --- | --- |
| 2026-10-14 | Versión inicial | — |
| 2026-10-14 | Principio 1: el panel pasa a React | Panel más rico y una API JSON que una futura app nativa pueda reutilizar |
