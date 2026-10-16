# HTTP: API JSON de Cobrix y cliente del administrador

## API JSON de Cobrix (NestJS)

- **Un módulo** (`CobrixModule.with(values)` en `src/server/app.module.ts`) con **un controlador por recurso** en `src/server/controllers/`. `createCobrixApp(deps)` arma la app; `main.ts` y las pruebas usan esa misma función.
- **Inyección con tokens explícitos** (`@Inject(DB)`, `AUDIT`, `NOW`, `ENGINE` de `tokens.ts`): `tsx` no emite metadatos de tipos, así que nada se resuelve por tipo. Los valores se crean afuera y entran como `useValue`.
- **Sin el body parser de Nest:** el cuerpo se lee con `readJson(req)`, que pone el límite de 1 MB y los mensajes en español.
- **Un solo filtro de errores** (`api-error.filter.ts`) para todo: `ApiError` sale como fue lanzado; una ruta inexistente, `404`; una ruta que existe con otro método, `405`; lo demás, `500` con el detalle solo en la consola.
- **Middleware antes de las rutas** (`middleware.ts`): cabeceras de seguridad, el panel fuera de `/api` y el control de CSRF en las escrituras.
- Un `POST` que no crea nada lleva `@HttpCode(200)`; el que inicia una corrida, `@HttpCode(202)`.
- **Rutas por recurso bajo `/api`**, en español como el dominio:
  - `GET /api/resumen`
  - `GET /api/clientes?q=`
  - `GET /api/clientes/:id`
  - `GET` y `PUT /api/configuracion`
  - `POST /api/configuracion/probar-conexion`
  - `POST /api/corridas`, con `{ tipo, simulacion }`
  - `GET /api/corridas`
  - `GET /api/corridas/:id`
  
  Si la ruta lleva un parámetro, se declara en el decorador (`@Get(':id')`) y se valida en el controlador.
- Pensada para cualquier cliente, no solo para el panel: no devuelve HTML ni textos armados para una pantalla concreta.
- **Pedidos y respuestas en JSON.** El cuerpo se lee completo, se interpreta con `JSON.parse` y se valida como `unknown` antes de usarlo.
- **Los tipos de cada respuesta están en `src/shared/`.** El backend los cumple y el panel los importa con `import type`.
- **Códigos de estado:**
  - `200`: lectura;
  - `201`: creación;
  - `400`: pedido inválido;
  - `404`: no existe;
  - `409`: conflicto, por ejemplo una corrida que ya está en curso;
  - `500`: error no previsto.
- **Formato de error:** `{ "error": { "code": "...", "message": "..." } }`. El `message` está en español y dice qué pasó y cómo seguir.
- Las acciones que cambian datos van solo por `POST`, `PUT` o `DELETE`, nunca por `GET`.
- **Archivos del panel:** sirve `dist/panel/`. Cualquier ruta que no sea `/api/*` ni un archivo existente devuelve `index.html`, para que funcione React Router.
- Sin login, sin versión (`/v1`) y sin CORS: quedan fuera de alcance en esta versión.

## Cliente de la API del administrador (`fetch`)

- Un `createBillingClient({ baseUrl, user, password })`, que es el único lugar que habla con la API.
- **Solo rutas `/api/v1/...`. Nunca `/__sim/*`:** el simulador no existe en un ISP real. Solo lo usan la persona que prueba y las pruebas automáticas.
- **URL base:** acepta la dirección con o sin `/api/v1` y la normaliza.
- **Token:** se hace login, se guarda el token con su vencimiento. La API **no tiene refresh token**: antes de que venza se hace un **login nuevo**. La fecha llega en UTC sin zona: se interpreta agregando `Z`. Si una llamada devuelve 401, se hace un login nuevo y se reintenta **una sola vez**.
- **Tiempo límite** en cada llamada: `AbortSignal.timeout(…)`.
- **Las respuestas son `unknown`.** Se validan campo por campo con los lectores de `src/cobrix/` (ver `tipado-ts`) y nunca se convierten con `as`. El campo `success` no se usa para decidir nada.
- **Login con credenciales malas responde 400, no 401:** es «credenciales rechazadas» y no se reintenta. El 401 solo aparece en las rutas `/isp/...` con el token vencido o inválido, y ahí sí se hace un login nuevo.
- **Errores con tipo:** red caída, tiempo agotado, credenciales rechazadas, estado HTTP inesperado o JSON inválido. Quien llama decide si el error hace fallar la corrida o solo deja fuera un contrato.
- `lista_ids_contratos` se llama **sin** el parámetro `estado` (con cualquier valor devuelve solo los activos) y sin `page` ni `per_page`. Se comprueba que lo recibido sea igual a `pagination.total` y que `total_pages` sea 1; si no, la corrida falla: nunca se procesa una lista incompleta.
- **Elementos de la lista:** un número escrito como texto (`"900101"`) se normaliza; lo ilegible (`"abc"`, `null`, `-5`) no se adivina: queda como fila «Contrato ilegible en la lista» para revisar a mano, y la corrida sigue. Si `data` no es una lista, la corrida falla.
- **El número de cuota viene en dos formatos:** `deuda_id` es texto en `contrato/individual` e `id_cuota` es número en `pago_informacion`. Se comparan como el mismo identificador (los dos a texto con solo dígitos).
- **`success` y `errors` no se usan para decidir nada:** deciden el código HTTP y los datos validados. `success` se lee y se registra como segunda opinión: con `false` y datos válidos se anota en los datos técnicos de la corrida (el operador no lo ve); con datos rotos, su `message` se suma al error. `errors` trae siempre una fila vacía: las vacías se descartan y un mensaje con texto se guarda como advertencia de la corrida, sin hacerla fallar.
