---
name: sdd
description: Proceso de desarrollo guiado por especificaciones (SDD) en cuatro fases con aprobación del usuario entre cada una - constitution, spec, plan y tareas - más la implementación siguiendo las tareas. Úsalo cuando se pida crear o cambiar la constitution, una especificación, un plan o una lista de tareas, al empezar una funcionalidad nueva o al implementar tareas de specs/.
---

# SDD: de la idea al código en fases

## Las fases

| Fase | Responde | Se guarda en |
| --- | --- | --- |
| 0. Constitution | ¿Qué reglas no se rompen nunca? | `specs/constitution.md` |
| 1. Spec | ¿QUÉ se construye? | `specs/spec.md` |
| 2. Plan | ¿CÓMO se construye? | `specs/plan.md`, y el modelo de datos aparte en `specs/data-model.md` cuando es grande (el plan lo enlaza; nunca se copia en los dos) |
| 3. Tareas | ¿En qué orden y en qué pasos? | `specs/tasks.md` |
| 4. Implementación | El código, tarea por tarea | El código del proyecto, y un registro por fase en `specs/implementacion/` (`00_fase1.md`, `01_faseA.md`…, en el orden en que se hacen) |

La constitution es una sola por proyecto. La spec, el plan y las tareas de `specs/` son la base completa del proyecto. Un agregado posterior va en `specs/extras/<nombre>/` con su propia `spec.md`, `plan.md` y `tasks.md`, y su spec dice de qué parte de `specs/spec.md` parte.

## Reglas del proceso

1. **Una fase por vez y con aprobación.** Al terminar una fase se para, se muestra un resumen corto de lo escrito y se espera el «ok» del usuario. Sin ese «ok» no se empieza la siguiente.
2. **Antes de cada fase se lee la constitution**, y lo producido se revisa contra ella. Si algo la contradice, se para y se pregunta.
3. **Antes de escribir la spec se pregunta.** Todas las ambigüedades se resuelven con el usuario. Cada pregunta trae una recomendación, para que pueda responder «ok». Lo decidido va a «Decisiones tomadas».
4. **Cada fase usa la anterior y nada más:** el plan sale de la spec y las tareas salen del plan. Si una fase necesita algo que la anterior no dice, se vuelve a la anterior, se propone el cambio y se pide aprobación.
5. **Los IDs se mantienen en todas las fases:** HU, RF, RN, CA, CL y D en la spec; DT y R en el plan; T en las tareas. El plan y las tareas siempre dicen qué IDs de la spec cubren.
6. **Cero alcance fantasma:** lo que no está en la spec no se planifica ni se implementa. Una idea nueva se anota como propuesta y se le muestra al usuario.
7. **Lenguaje claro.** La spec la tiene que entender alguien que no programa; el plan, otro desarrollador que llega nuevo.

## Implementación (fase 4)

- Se siguen las tareas en orden. Antes de escribir código, se cargan los skills que apliquen (stack, tipado, UI/UX).
- **Prueba primero en las reglas puras:** si la tarea implementa una regla de negocio sin I/O, primero se escribe la prueba con los ejemplos de la spec (las RN ya los traen) y se la ve fallar; después se escribe el código hasta que pase. En las tareas, la prueba aparece antes que la implementación.
- Una tarea se tilda (`- [x]`) solo cuando está hecha y verificada: `npm run typecheck` y `npm test` en verde.
- Al terminar una fase de tareas se corre su **Verificación** y se escribe su registro en `specs/implementacion/NN_faseX.md`, corto:
  - el objetivo;
  - las **decisiones** (con su motivo, en una línea);
  - qué quedó;
  - cómo se verificó.
  
  Después se informa el resultado y se espera el «ok» antes de seguir.
- Si al implementar aparece un hueco o un error en la spec o en el plan, no se resuelve en silencio: se para, se propone el cambio en el documento que corresponde y se sigue con la aprobación.

## Cambios a documentos aprobados

- La constitution registra cada cambio en su tabla «Cambios».
- La spec registra cada decisión nueva en «Decisiones tomadas» y, si el cambio es grande, sube de versión (`v1` → `v2`).
- Cuando cambia la spec, se revisa si el plan y las tareas siguen valiendo.
