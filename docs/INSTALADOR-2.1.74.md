# Instalador Moon Studios 2.1.74

## Rediseño

El asistente de Windows tiene una composición nueva en todas sus páginas: panel lateral oscuro con el logotipo de Moon Studios, fondo marfil, tipografía Segoe UI, títulos amplios, navegación clara y un indicador de cuatro etapas. Conserva la paleta de la marca.

La bienvenida presenta el espacio de trabajo. La configuración reúne la carpeta, el acceso del escritorio, el menú Inicio y la opción de reducir movimiento. Antes de instalar aparece una revisión de las opciones elegidas. La instalación muestra el progreso real de NSIS y permite consultar los detalles. Al terminar se puede abrir Moon Studios. La gestión de instalaciones existentes, los estados de error y la confirmación y finalización de la desinstalación comparten el nuevo diseño.

Las páginas tienen una entrada breve y el panel lateral incorpora una órbita animada. La animación se reproduce mediante el control nativo de Windows `SysAnimate32`: AVI sin audio ni compresión, 230 × 230 px, 48 fotogramas a 12 fps y un ciclo de cuatro segundos. No usa callbacks periódicos de NSIS durante la copia de archivos. Se respeta la preferencia de movimiento de Windows y se ofrece «Reducir movimiento» en el asistente. Si el recurso no puede abrirse, permanece una alternativa estática.

Los textos, controles de formulario y navegación son controles nativos. Las posiciones escalan según los DPI. La barra de progreso utiliza las operaciones reales del instalador; la órbita es decorativa y no representa un porcentaje de descarga o instalación.

## Alcance técnico

`src-tauri/installer/installer.nsi` se genera a partir de la plantilla fijada de Tauri CLI 2.11.1. `scripts/build-installer-template.mjs --check` comprueba su hash base, revierte las modificaciones de presentación y compara las secciones y funciones del motor con la base. El motor de copia, WebView2, actualización, registro, accesos y retirada se conserva. Las funciones de presentación viven en `ui.nsh`, `ui-functions.nsh` y `hooks.nsh`. Los recursos se generan mediante `scripts/build-installer-assets.ps1`, manteniendo intacto el logotipo suministrado.

Esta versión se publica con el flujo unificado `release.ps1`: instalador Windows firmado para el actualizador y dashboard web con metadatos de la misma versión. Este trabajo cambia el asistente de instalación; no añade cambios funcionales a las pantallas del dashboard.

## Verificación y límites

La vista de prueba de `.moon-qa/installer-v74` usa los mismos helpers, recursos y controles que el instalador. Sus operaciones de copia y retirada son simulaciones, sin instalar la aplicación, escribir su registro, crear accesos, cerrar la aplicación o borrar datos. Su compilación no equivale a una instalación o desinstalación real.

El inspector `inspect-orbital.cjs` valida el contenedor RIFF, los fotogramas DIB de 24 bits, el índice AVI, las dimensiones, la frecuencia y la ausencia de audio. Comprueba que cada fotograma conserva exactamente el recorte de fondo y solo cambia el punto que recorre la órbita.

El verificador `.moon-qa/installer-v74/verify-publication.ps1` exige versión 2.1.74 coherente en Tauri, Cargo, Cargo.lock, build-info, dist y latest.json. Comprueba que el bundle NSIS y el instalador archivado tienen los mismos bytes, registra hashes de fuentes y recursos, valida la firma local y examina el NSIS generado para descartar el preview. En su modo público descarga el manifest desde el endpoint configurado, comprueba GitHub Latest, descarga el EXE y su firma y compara tamaño, SHA256 y firma Minisign con la clave pública de la aplicación. También compara los bytes de los metadatos web, HTML y módulo de entrada publicados con el build local.

No se ejecuta el instalador real durante esta comprobación. No se afirma una instalación, actualización o desinstalación real en el equipo, ni se accede a cuentas o registros de Firestore.

## Publicación

Pendiente de la publicación y comprobación final del instalador 2.1.74. El recibo definitivo será `.moon-qa/installer-v74/verified-publication.json`, con copia en `.moon-qa/releases/v2.1.74/installer-publication-verification.json`.
