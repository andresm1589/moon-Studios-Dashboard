# Integraciones (GitHub y Google)

Configuración → Integraciones deja que cada empleado conecte su cuenta de
GitHub o de Google y vea en el dashboard sus repositorios, sus pull requests
abiertos, sus próximas reuniones y sus archivos recientes de Drive.

Todo es de **solo lectura**. Los permisos que se piden no permiten escribir, y
el token de acceso **no llega nunca al navegador**: vive en la API de Luna y
el dashboard solo recibe datos ya resueltos.

---

## Qué falta para que funcione

El código está completo, pero hasta que el servidor tenga credenciales los dos
servicios aparecen como **«Sin configurar»** y el botón no hace nada. Hay que
registrar una aplicación en cada proveedor. Son dos trámites de unos diez
minutos y los tiene que hacer alguien con acceso a las cuentas de Moon Studios.

La URL de retorno es la misma en los dos casos, cambiando el nombre al final:

```
https://api.lunanet.nellyx.xyz/api/moon/integraciones/github/callback
https://api.lunanet.nellyx.xyz/api/moon/integraciones/google/callback
```

Si la API cambia de dominio, se ajusta con la variable `MOON_API_PUBLIC_URL`.

---

## 1. GitHub

Se registra una **GitHub App**, no una OAuth App. Es lo que permite pedir
permisos de solo lectura de verdad: una OAuth App solo ofrece el scope `repo`,
que incluye escritura, así que un token robado podría modificar código.

GitHub → *Settings* → *Developer settings* → **GitHub Apps** → *New GitHub App*.

| Campo | Valor |
|---|---|
| **GitHub App name** | `Moon Studios Dashboard` (el nombre es único en todo GitHub; si está cogido, añade algo) |
| **Homepage URL** | `https://moon-studios-dashboard.netlify.app` |
| **Redirect URI** | `https://api.lunanet.nellyx.xyz/api/moon/integraciones/github/callback` |
| **Allow wildcard matching** | **Desmarcado.** Con comodín, el token podría enviarse a cualquier subdominio. |
| **Expire user authorization tokens** | **Marcado.** Da `refresh_token`; el servidor renueva solo. Sin esto el token no caduca nunca. |
| **Request user authorization (OAuth) during installation** | **Marcado.** |
| **Enable Device Flow** | Desmarcado. |
| **Setup URL** | Vacío. |
| **Redirect on update** | Desmarcado. |
| **Webhook → Active** | **Desmarcado.** No se usan; al quitarlo desaparece «Subscribe to events». |

**Permissions → Repository** — solo estos cuatro, en *Read-only*, y el resto en
*No access*:

- **Contents** · **Issues** · **Metadata** · **Pull requests**

**Organization permissions** y **Account permissions**: ninguno. `/user` y
`/user/installations` funcionan con el token de usuario sin pedir nada extra.

**Where can this GitHub App be installed**: **Any account**. Cada empleado
conecta su propia cuenta de GitHub, y los repositorios están en más de una;
con *Only on this account* nadie más podría usarlo.

Al crearla, copia el **Client ID** y pulsa *Generate a new client secret*.

Después hay que **instalar** la App en la cuenta u organización donde estén los
repositorios, y darle acceso a los que se quieran ver. Sin ese paso la conexión
funciona pero la lista de repositorios sale vacía — el panel lo explica cuando
pasa.

## 2. Google

1. [Google Cloud Console](https://console.cloud.google.com) → crea o elige un proyecto.
2. *APIs y servicios* → **Biblioteca** → activa **Google Calendar API** y **Google Drive API**.
3. *APIs y servicios* → **Pantalla de consentimiento OAuth**:
   - Tipo **Interno** si todos usan cuentas del Workspace de Moon Studios. Así
     se evita el proceso de verificación de Google.
   - Si hay cuentas de fuera, tipo **Externo**: funcionará igual, pero Google
     mostrará un aviso de «app no verificada» hasta que se verifique.
4. **Credenciales** → *Crear credenciales* → **ID de cliente de OAuth** →
   *Aplicación web*.
   - **URI de redirección autorizado**: la de arriba, la de `/google/callback`.
5. Copia el **ID de cliente** y el **secreto**.

Los permisos que se piden son `calendar.readonly` y `drive.metadata.readonly`.
El segundo solo da nombres y fechas de los archivos: **no** permite leer su
contenido.

---

## 3. Variables en el servidor

En el `.env` de la API de Luna (`C:\LUNA NET`), y también en el servidor donde
esté desplegada:

```
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

En cuanto estén, el panel deja de decir «Sin configurar» solo. No hay que tocar
el dashboard ni volver a desplegarlo.

---

## Cómo está montado

- **`src/api/services/integraciones.service.js`** (Luna) — tokens, `state` de
  OAuth, canje y renovación. Los tokens se guardan en Firestore escritos solo
  por el SDK de administración.
- **`src/api/services/integracionesDatos.service.js`** (Luna) — lo que se
  enseña: repositorios, PR, eventos y archivos.
- **`src/api/routes/integraciones.routes.js`** (Luna) — los cinco endpoints
  bajo `/api/moon/integraciones`.
- **`src/lib/integraciones.ts`** (dashboard) — el cliente. No conoce ningún token.
- **`src/components/PanelIntegraciones.tsx`** (dashboard) — la pantalla.
- **`firebase/firestore.rules`** — `integraciones` e `integraciones_estados`
  con `allow read, write: if false`.

### La vuelta del navegador

El dashboard es app de escritorio y web a la vez, y no tiene plugin de
deep-link. Por eso el `redirect_uri` apunta a la API y no a la app: el
proveedor devuelve allí, la API canjea el código y pinta una página de «ya
puedes volver». El dashboard, mientras tanto, pregunta cada pocos segundos si
la conexión apareció, y se rinde a los dos minutos. Funciona igual en los dos
sitios sin cambiar nada.

### Por qué el token no se guarda en Firestore «del usuario»

Una regla del tipo «solo su dueño puede leerlo» dejaría el token dentro del
navegador y de la app: en el almacenamiento local, en las herramientas de
desarrollo y al alcance de cualquier extensión con permiso de lectura. Un token
de GitHub es, a efectos prácticos, una llave de esa cuenta. Por eso las reglas
lo niegan a todo el mundo y solo lo toca el servidor.

## Añadir otro servicio

En `integraciones.service.js`, una entrada más en `PROVEEDORES` con su URL de
autorización, su URL de token y sus permisos; en
`integracionesDatos.service.js`, su función de resumen; y en
`PanelIntegraciones.tsx`, su icono en `ICONOS` y su vista. El resto —
conectar, desconectar, renovar, reglas — ya es común.

Slack, X/Twitter y LinkedIn estaban en la lista anterior y se quitaron: Moon
Studios usa Discord y no Slack, la API de escritura de X es de pago, y publicar
en LinkedIn exige una app aprobada de su Marketing Developer Platform.
