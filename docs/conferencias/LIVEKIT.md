# Servidor de video propio (LiveKit) — instalación

Las salas virtuales de Moon Studios Conferencias usan **LiveKit**, un servidor de
video en tiempo real de código abierto (licencia Apache 2.0) instalado en un
servidor **propio**. No es Zoom ni Meet: la interfaz, las cuentas, los permisos
y los datos son de Moon Studios. Mientras este servidor no exista, todo lo demás
funciona (eventos, invitaciones, QR, puerta, asistencia) y la sala responde
«La sala de video todavía no está configurada».

## 1. Qué hace falta

| Recurso | Recomendado | Costo aproximado |
|---|---|---|
| VPS con Ubuntu 22.04 o 24.04 e IP pública | Hetzner CX22 (2 vCPU, 4 GB) | 4–6 USD/mes |
| Para eventos grandes (MOON FEST con video) | Hetzner CPX41 (8 vCPU, 16 GB) | 25–30 USD/mes, solo el mes del evento |
| Dominio propio | Dos subdominios: `video.` y `turn.` | 10–15 USD/año |

**Por qué no en Nellyx:** el contenedor de Pterodactyl no abre los puertos UDP que
necesita el video en tiempo real.

**Capacidad orientativa (2 vCPU):** una reunión de ~25 personas con cámara, o una
conferencia de 3–5 ponentes con ~150 oyentes. El consumo de tráfico es de
~1–2 GB por persona y hora en calidad HD.

## 2. Preparar el VPS

1. Crea el VPS y anota su IP pública.
2. En el DNS de tu dominio crea dos registros **A** hacia esa IP:
   - `video.tudominio.com`
   - `turn.tudominio.com`
3. Abre estos puertos en el firewall del proveedor:

| Puerto | Protocolo | Uso |
|---|---|---|
| 80, 443 | TCP | Certificado HTTPS y conexión segura (WSS) |
| 7881 | TCP | Video por TCP cuando UDP está bloqueado |
| 3478 | UDP | TURN |
| 5349 | TCP | TURN sobre TLS (redes corporativas) |
| 50000–60000 | UDP | Audio y video |

## 3. Instalar LiveKit (asistente oficial)

Conectado al VPS por SSH:

```bash
curl -fsSL https://get.docker.com | sh
mkdir -p ~/livekit && cd ~/livekit
docker run --rm -it -v "$PWD":/output livekit/generate
```

Responde al asistente:
- **Primary domain:** `video.tudominio.com`
- **TURN domain:** `turn.tudominio.com`
- **SSL:** Let's Encrypt (automático)
- **Version:** la última estable
- **Redis:** sí (incluido)

Al terminar, el asistente muestra el **API Key** y el **API Secret** y genera un
script de instalación. Ejecútalo como indica (instala Caddy para HTTPS, Redis y
LiveKit como servicio que arranca solo).

Comprueba que responde: `https://video.tudominio.com` debe mostrar «OK».

## 4. Conectar con Moon Studios

En el servidor de Luna NET (Pterodactyl → Variables o archivo `.env`) agrega:

```
LIVEKIT_URL=wss://video.tudominio.com
LIVEKIT_API_KEY=<API Key del asistente>
LIVEKIT_API_SECRET=<API Secret del asistente>
```

Reinicia el bot. Si el panel de Pterodactyl no instala dependencias al arrancar,
ejecuta una vez `npm install` en la consola del servidor (agrega
`livekit-server-sdk`).

**El API Secret nunca va en el panel ni en la web:** solo el servidor de Luna NET
lo conoce y con él firma un pase de 4 horas para cada persona autorizada.

## 5. Probar

1. En el panel: Conferencias → Nuevo evento → «Reunión privada», que empiece en
   unos minutos → Programar.
2. Invita a alguien del equipo y entra con «Entrar a la sala».
3. Comprueba micrófono, cámara, compartir pantalla, chat, sala de espera,
   silenciar y expulsar.

## 6. Grabación (opcional, más adelante)

LiveKit Egress graba las salas a un archivo. Se instala aparte en el mismo VPS
(o en otro) y necesita un almacenamiento (por ejemplo, un bucket S3 compatible).
Solo se usará en eventos marcados con «Permitir grabación», que ya avisan a los
participantes y piden su consentimiento antes de entrar.

## 7. Seguridad

- Los pases de LiveKit los emite la API solo a quien tiene una invitación
  activa y, con sala de espera, solo después de que un moderador la admita.
- Cada rol tiene sus permisos: anfitrión y moderador administran la sala;
  ponentes publican audio, video y pantalla; los asistentes de una conferencia
  solo escuchan (en una reunión privada todos pueden hablar).
- Expulsar a alguien lo saca de la sala y bloquea su reingreso.
- Mantén el VPS actualizado (`apt upgrade`) y no compartas el API Secret.
