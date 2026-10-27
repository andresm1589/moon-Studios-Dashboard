# Moon Studios Conferencias — arquitectura

Sistema privado de eventos, invitaciones con QR, control de acceso y salas de
video propias. Este documento es la referencia técnica y la guía de
coordinación entre las sesiones que trabajan en el panel.

> Reparto vigente de la tarea de diseño: [COORDINACION-DISENO.md](COORDINACION-DISENO.md). El usuario dejó los sistemas a Claude y la presentación a Codex.

## 1. Reparto del trabajo (sesiones en paralelo)

| Área | Responsable | Archivos |
|---|---|---|
| MOON FEST público (inscripción abierta, entradas, diseño) | Sesión de diseño (Codex) | `src/components/fest/*`, `src/lib/fest/*`, `src/types/fest.ts`, `src/Pages/Webs.tsx`, colecciones `moon_fest_*` |
| Conferencias privadas (eventos, invitaciones, QR, acceso, asistencia, salas) | Sesión de sistema (Claude) | `src/components/conferencias/*`, `src/lib/conferencias/*`, `src/styles/conferencias*.css`, colecciones `moon_conf_*`, API `C:\LUNA NET\src\api\routes\conferencias.routes.js` y `src\api\services\conferencias\*` |
| Archivos compartidos | Ambas, con cuidado | `src/App.tsx`, `src/components/DashboardLayout.tsx`, `src/types/index.ts`, `firebase/firestore.rules` |

Reglas de convivencia: nadie edita los archivos del otro; antes de tocar un
archivo compartido se revisa su fecha de modificación; las reglas de Firestore
se despliegan componiendo sobre las reglas activas (nunca pegando una copia
vieja).

**Un solo lugar en el panel:** MOON FEST ya no está en Webs. Su gestión
(ediciones, inscritos, acceso y el correo de la edición 2026) es la pestaña
«MOON FEST» de Conferencias (`/dashboard/conferencias?vista=fest`), visible para
el CEO y para Administración con el módulo Webs, igual que exigen sus reglas.

## 2. Principios

1. **La autorización vive en el servidor.** Toda escritura pasa por la API de
   Luna NET (`https://api.lunanet.nellyx.xyz/api/moon/conferencias/*`), que
   verifica el token de Firebase, el rol y el estado del evento. Las reglas de
   Firestore solo permiten **leer** lo que a cada persona le corresponde; los
   clientes no escriben en `moon_conf_*`.
2. **El QR no contiene datos personales ni permisos.** Es una credencial
   opaca `MSC1.<invitación>.<versión>.<firma>` firmada con HMAC-SHA256 en el
   servidor. No se puede falsificar sin la clave; al revocarla o regenerarla
   sube la versión y los QR anteriores dejan de valer.
3. **Tener el QR no basta.** Cada lectura comprueba en el servidor que la
   invitación esté activa, pertenezca a ese evento, que el evento no esté
   cancelado, que esté dentro del horario de acceso y, si el evento es de
   ingreso único, que no se haya usado antes.
4. **La invitación pertenece a una persona.** El enlace privado se activa con
   una cuenta cuyo correo esté verificado y coincida con el de la invitación.
   Reenviar el enlace no sirve a otra persona.
5. **Nada de secretos en la base de datos.** Las firmas se derivan de una
   clave del servidor (`MOON_CONF_SECRET`, o en su defecto un documento solo
   accesible para el servidor, `moon_conf_servidor/clave`).

## 3. Modelo de datos (Firestore `moon-studios-16102025`)

| Colección | Contenido | Quién lee |
|---|---|---|
| `moon_conf_eventos/{eventoId}` | Título, descripción, modalidad (`virtual`, `reunion`, `presencial`, `hibrido`), inicio, fin, lugar, instrucciones, aforo, ingreso único, sala virtual, sala de espera, grabación permitida, equipo (`{uid: organizador\|moderador\|control}`), contadores, estado (`borrador`, `programado`, `cancelado`, `finalizado`) | Gestores, equipo del evento e invitados con acceso |
| `moon_conf_invitaciones/{invId}` | Evento, nombre, correo, rol (`asistente`, `ponente`, `moderador`), estado (`pendiente`, `aceptada`, `revocada`), dueño (`ownerUid`), código corto, versión del QR, ingresos | Gestores del evento y el propio invitado |
| `moon_conf_accesos/{eventoId}_{uid}` | Marca de acceso de una persona a un evento (la usan las reglas) | El propio invitado y los gestores |
| `moon_conf_asistencia/{id}` | Cada ingreso: invitación, evento, vía (`qr`, `codigo`, `sala`), hora, quién lo validó | Gestores del evento |
| `moon_conf_avisos/{id}` | Avisos del organizador a los invitados | Gestores e invitados del evento |
| `moon_conf_espera/{eventoId}_{uid}` | Sala de espera virtual: `esperando`, `admitido`, `expulsado` | El propio invitado y el equipo |
| `moon_conf_auditoria/{id}` | Cada acción administrativa y cada intento de acceso | CEO y gestores |
| `moon_conf_servidor/*` | Clave del servidor | Nadie desde el cliente |

**Gestores globales:** el CEO, y Administración si el CEO le habilita el
módulo «Conferencias» en el Centro de administración. **Equipo por evento:**
`organizador` (gestiona ese evento), `moderador` (sala y asistencia) y
`control` (solo escanea entradas en la puerta).

## 4. API (Luna NET, Express)

Todas las rutas exigen `Authorization: Bearer <ID token de Firebase Moon Studios>`.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/moon/conferencias/eventos` | Gestor global | Crea un evento |
| `PATCH /api/moon/conferencias/eventos/:id` | Gestor del evento | Edita, programa, cancela o finaliza |
| `DELETE /api/moon/conferencias/eventos/:id` | Gestor global | Elimina un evento sin ingresos registrados |
| `POST /api/moon/conferencias/eventos/:id/invitaciones` | Gestor del evento | Invita (individual o en lote; empleados o externos) y devuelve los enlaces privados una sola vez |
| `POST /api/moon/conferencias/invitaciones/:id/revocar` | Gestor del evento | Revoca: el enlace y el QR dejan de valer |
| `POST /api/moon/conferencias/invitaciones/:id/regenerar` | Gestor del evento | Nuevo enlace y nuevo QR; los anteriores quedan inválidos |
| `POST /api/moon/conferencias/invitaciones/:id/enviar` | Gestor del evento | Envía la invitación por correo o notificación interna |
| `POST /api/moon/conferencias/reclamar` | Cualquier cuenta | Activa un enlace privado en la cuenta (correo verificado y coincidente) |
| `GET /api/moon/conferencias/invitaciones/:id/credencial` | Dueño de la invitación | Devuelve el QR y el código de acceso |
| `POST /api/moon/conferencias/validar` | Gestor o equipo del evento | Valida un QR o un código en la puerta y registra el ingreso |
| `POST /api/moon/conferencias/eventos/:id/avisos` | Gestor del evento | Publica un aviso (y notifica) |
| `POST /api/moon/conferencias/eventos/:id/sala/entrar` | Invitado o equipo | Pide entrar a la sala virtual (sala de espera o token de LiveKit) |
| `POST /api/moon/conferencias/eventos/:id/sala/admitir` | Moderador | Admite, expulsa, silencia o bloquea a un participante |

Límites de intentos: activar enlaces 10 cada 15 min por IP; validar en puerta
240 por minuto por persona del equipo; credencial y sala 60 cada 15 min.

## 5. Videoconferencias propias (LiveKit autoalojado)

- **Servidor:** LiveKit open source (Apache 2.0) en un VPS propio. No es un
  servicio de videoconferencias de terceros: la interfaz, las cuentas, los
  permisos y los datos son de Moon Studios.
- **Por qué no en Nellyx:** el contenedor de Pterodactyl no expone los puertos
  UDP (50000–60000) ni TCP 7881 que necesita el video en tiempo real.
- **Costo estimado:** VPS de 2 vCPU y 4 GB (Hetzner CX22 ≈ 4–6 USD/mes,
  DigitalOcean ≈ 24 USD/mes) para reuniones de hasta ~50 participantes con
  video; para eventos grandes, 4–8 vCPU. Tráfico: ~1–2 GB por persona y hora
  de video en calidad HD.
- **Tokens:** los emite la API de Luna NET con `livekit-server-sdk`, solo si
  la persona tiene acceso vigente y, con sala de espera, solo después de que
  un moderador la admita. El rol define los permisos: anfitrión y moderador
  (`roomAdmin`), ponente (publicar audio, video y pantalla), asistente
  (publicar solo si el evento es una reunión).
- **Grabación:** LiveKit Egress, solo en eventos con «grabación permitida» y
  con aviso a los participantes. Se instala aparte cuando se necesite.
- Instalación paso a paso: `docs/conferencias/LIVEKIT.md`.

## 6. Interfaces

- **Panel (`/dashboard/conferencias`):** eventos, editor, invitaciones,
  control de acceso con escáner QR, asistencia en vivo, avisos, reportes y
  auditoría. Los empleados invitados ven sus invitaciones en «Mis invitaciones».
- **Portal de invitados (web oficial, `/conferencias`):** iniciar sesión,
  activar el enlace privado, ver las invitaciones, el QR, los avisos y entrar a
  la sala cuando se habilite.

## 7. Variables de entorno (servidor de Luna NET)

| Variable | Obligatoria | Uso |
|---|---|---|
| `MS_FIREBASE_*` | Sí (ya existen) | Acceso de servidor a Firebase de Moon Studios |
| `MOON_CONF_SECRET` | Recomendada | Clave HMAC de enlaces y QR (≥ 32 caracteres). Si falta, se genera y guarda en `moon_conf_servidor/clave` |
| `MOON_CONF_PORTAL_URL` | No | Por defecto `https://moon-studios.netlify.app/conferencias` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Solo para video | Servidor LiveKit propio |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Para enviar por correo (ya existen) | Correos de invitación |
