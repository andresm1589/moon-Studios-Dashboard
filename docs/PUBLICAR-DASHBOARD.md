# Publicar el dashboard web y Windows

Desde PowerShell, en `C:\MOON STUDIOS APP DASHBOARD`:

```powershell
.\release.ps1 -Version 2.1.61 -Notes 'Navegación fluida, campos legibles y nuevas herramientas por sección.'
```

Un solo comando actualiza `tauri.conf.json`, `Cargo.toml` y el paquete de la app en `Cargo.lock`, compila la web y Windows, verifica la firma del instalador con la clave pública del updater, despliega el dashboard existente en Netlify y publica la actualización estable de Windows en GitHub.

Para comprobar herramientas, permisos, credenciales locales, versiones y duplicados sin compilar ni publicar:

```powershell
.\release.ps1 -Version 2.1.61 -CheckOnly
```

## Destinos existentes

- Dashboard: https://moon-studios-dashboard.netlify.app
- Netlify: `63c833fa-109e-4fe4-942e-3bf188c2e440`
- Releases de Windows: https://github.com/pandita1589/moon-Studios-Dashboard/releases
- El updater consume `releases/latest/download/latest.json` del mismo repositorio.

El comando publica el dashboard. La web pública `moon-studios.netlify.app` tiene otro proyecto y otro despliegue.

## Requisitos locales

Deben estar disponibles Node/npm, Rust/Cargo, las herramientas de compilación Windows de Tauri, `gh` y `netlify`. Las dos CLI deben estar autenticadas con acceso a los destinos indicados. Usa una versión nueva con formato `mayor.menor.parche`, superior a las versiones estables publicadas.

La clave privada se conserva en `%USERPROFILE%\moonStudios.key`. La contraseña se conserva cifrada con Windows DPAPI en `%USERPROFILE%\.moon-studios\signing-password.dpapi`, con acceso de archivo restringido a la cuenta Windows actual. La contraseña anterior fue migrada fuera del script. No compartas la clave privada ni copies estos archivos al repositorio.

La credencial DPAPI funciona con la misma cuenta y equipo Windows. Para configurar otra cuenta o sustituirla, crea su credencial desde una entrada segura:

```powershell
$credentialFolder = Join-Path $env:USERPROFILE '.moon-studios'
New-Item -ItemType Directory -Path $credentialFolder -Force | Out-Null
Read-Host 'Contraseña de la clave de firma' -AsSecureString |
    ConvertFrom-SecureString |
    Set-Content -LiteralPath (Join-Path $credentialFolder 'signing-password.dpapi')
```

También se admite `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` si ya está definida en el proceso. El script restaura las variables de firma al terminar y no imprime sus valores.

## Artefactos y comprobaciones

Los archivos de cada versión quedan en `.moon-qa/releases/v<versión>/`:

- `moon.Studios_<versión>_x64-setup.exe` y su `.sig` correspondiente.
- `latest.json`, con esa misma versión, firma y URL exacta.
- `build-info.json`, con SHA-256 del instalador y del conjunto de archivos web.
- `netlify-deploy.json` y `notes.md`.

El script selecciona los archivos exactos de la versión solicitada y verifica criptográficamente tanto la firma Ed25519 del instalador como el comentario firmado de Minisign. No toma el instalador más reciente de otra versión. Antes de anunciar éxito comprueba los assets de GitHub, el descriptor HTTP del updater y `moon-release.json` servido por Netlify.

Los assets de Windows se suben primero a un borrador. Una vez confirmado el despliegue de Netlify, el borrador se publica como estable y se marca `Latest`. Las instalaciones existentes podrán encontrarlo mediante el updater. El comando no instala ni reinicia la app local.

## Código fuente y errores parciales

El comando compila el contenido actual del workspace, incluidos cambios locales. No ejecuta `git add`, `git commit` ni `git push`, y conserva el índice de Git. La etiqueta de la release apunta al commit actual de la rama predeterminada remota; `build-info.json` identifica además el commit local y si el workspace tenía cambios. Versionar y subir el código fuente sigue siendo una operación independiente.

La versión local actualizada se conserva si falla una compilación. Se puede corregir y repetir si aún no se creó la release. El script rechaza etiquetas y releases existentes para no sobrescribir artefactos. Si una publicación falla después de crear un borrador o publicar un canal, informa qué quedó disponible y conserva los artefactos locales. No elimina releases, etiquetas ni despliegues automáticamente.

Si ya existe un borrador con los cuatro assets originales y se conserva el mismo `dist`, se puede completar sin volver a compilar:

```powershell
.\release.ps1 -Version 2.1.59 -Resume
```

`-Resume` exige que la publicación siga en borrador y que su versión coincida con la versión local. Verifica la firma, el SHA-256 del instalador, los manifiestos, todos los archivos del `dist` y el SHA-256 de los cuatro assets en GitHub. Después continúa con Netlify y la publicación del borrador; conserva las notas originales y no reemplaza assets. Si se modificó el build o la release ya es estable, se detiene. Los borradores se localizan listando releases y consultando su identificador, porque GitHub puede no haber creado todavía su etiqueta.

Los errores de las CLI incluyen un extracto limitado de su diagnóstico, con credenciales y tokens redactados; un HTTP 404 se distingue así de un problema de autenticación.
