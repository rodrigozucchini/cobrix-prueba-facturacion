# Qué hice yo y qué hizo la IA

Trabajé con **Claude Code**. La IA escribió prácticamente todo el código, las pruebas y los documentos. Yo decidí qué se construía y cómo, revisé cada propuesta antes de que se programara y probé el producto. El código lo entendí pidiendo explicaciones archivo por archivo y probándolo.

## Cómo trabajamos: SDD

Elegí un proceso de **desarrollo guiado por especificaciones** propio, con mi aprobación entre cada paso:

1. **Constitution:** los principios que mandan sobre todo lo demás (simplicidad, nunca adivinar, datos con respeto…).
2. **Spec:** qué se construye, con requisitos, reglas, criterios de aceptación y las decisiones de lo que el enunciado no aclaraba.
3. **Plan y modelo de datos:** cómo se construye.
4. **Tareas:** en qué orden.
5. **Implementación por fases:** cada fase empezaba con una propuesta que yo aprobaba y terminaba con su verificación.

Además pedí **skills** para guiar a la IA en cada tema (stack, tipado y UX), y un `CLAUDE.md` con las reglas fijas:
- no tocar el administrador de facturas ni su base;
- nunca escribir secretos;
- nada fuera de la spec;
- nada terminado sin el chequeo de tipos y las pruebas en verde.

## Lo que decidí yo

- **Revisé la spec contra la API y el enunciado, punto por punto**, antes de programar, y decidí los casos dudosos:
  - al vencer el token, login de nuevo (la API no tiene refresh token);
  - los contratos ilegibles se marcan para revisión manual en vez de descartarse;
  - `success` y `errors` no se ignoran, aunque la API los manda mal: quedan registrados como datos técnicos y avisos;
  - validar lo mínimo y no descartar datos que sirven.
- **Una API JSON**, pensando en que mañana la use una app nativa, y el panel en **React**, con esqueletos de carga y estilos en variables CSS.
- **Nada con relaciones se borra,** y descarté el borrado lógico.
- **Del punto diferencial, la auditoría fue idea mía:** cada acción queda en un archivo **fuera de la base**, para que sobreviva si la base se cae. Los otros agregados los elegí entre las ideas que propuso la IA.
- **Pedí simplificar** donde había más de lo que el enunciado pedía, y sumar **seguridad mínima** y mejoras de **experiencia**.
- **Probé el producto a mano** y, a partir de eso, pedí aclarar en el README los datos de prueba.

## Lo que hizo la IA

- **Propuso casi todas las decisiones**, cada una con su recomendación. La mayoría las aprobé tal cual; en las que dudaba, le pedí que me las explicara más simple o con fuentes.
- **Encontró las rarezas de la API** leyendo su documentación y el código del simulador: el login con clave mala responde 400 y no 401, `success` miente, la cuota `"0"`, la moneda incoherente, entre otras.
- **Escribió el backend, el panel, las 208 pruebas** (las de las reglas, primero) y la documentación.
- **Verificó cada fase:** corrió los tipos, las pruebas y el build, y recorrió el panel en un navegador sobre copias de las bases.
