# Fase 6a — Corrida automática

**Tareas:** T060–T062

## Objetivo

La corrida automática a la hora elegida (CA30), una automática que choca con otra en curso queda fallida (CL20), y una corrida cortada por un reinicio queda fallida al arrancar (CA36).

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| P36 | La fase 6 va en dos partes: la corrida automática y el cierre | El cierre se hace una sola vez, con todo terminado |
| P37 | Una automática que no puede iniciarse queda fallida, también si falta la configuración | El operador ve por qué no corrió |
| P38 | «A esa hora» es toda esa hora | RN37 solo dice que no se recupera después |

## Qué quedó

- Cada 30 s, con el reloj real de Caracas: «Importar» y después «Actualizar pagadas», una vez por día.

## Verificación

- 191 pruebas en verde, con un reloj de prueba: la hora de Caracas, una vez por día, no se recupera, pagadas aunque falle la importación, y CL20.
- Con el reloj real: las dos corridas «Automática» aparecieron solas a los 24 s (CA30).
