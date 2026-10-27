# Movimiento del dashboard — 2.1.60

La versión 2.1.59 contenía transiciones, pero el estado efectivo de la sesión observada en producción era `data-moon-workspace-motion="off"` y el documento tenía `ajustes-lector` y `ajustes-sin-movimiento`. El modo lector desactiva el movimiento aunque el interruptor principal de Animaciones esté encendido. La revisión anterior no informó de este bloqueo.

Había además un fallo en las entradas: el observador consumía un elemento antes de comprobar si la página estaba oculta o el elemento tenía opacidad cero. Al regresar a la pestaña no volvía a observarlo. Las órbitas de 42/58 segundos y los fundidos muy breves hacían poco perceptible el movimiento restante.

## Cambios

- Las superficies se mantienen pendientes mientras están ocultas; al volver a la pestaña o finalizar una entrada CSS se vuelve a comprobar su intersección.
- Se añadieron 176 puntos explícitos de entrada en 21 archivos de módulos, CMS y tareas. Las entradas se agrupan por visibilidad y se escalonan; el observador no escucha scroll ni cambia el estado React por fila.
- Inicio usa órbitas de 18/30 segundos, satélites visibles, flotación suave del símbolo y contadores y barras basados en los valores reales. El contenedor y la navegación permanecen fijos. Las órbitas se pausan fuera del viewport y con la pestaña oculta.
- El nuevo control de movimiento del encabezado y Apariencia muestra los motivos efectivos del bloqueo. Activar animaciones completas actualiza conjuntamente animations=true, reduceMotion=false y screenReader=false. La acción es explícita y el texto informa de los modos que desactiva. Se respeta siempre la preferencia de movimiento del sistema.
- Repetir animación de entrada vuelve a animar superficies existentes sin desmontar la herramienta ni reiniciar sus formularios o consultas.
- La sesión guardada muestra la verificación desde que Firebase restaura su identidad; la entrada sigue dependiendo del perfil y permisos confirmados por el servidor.

## Validación

- TypeScript global y compilación de producción correctos.
- Fixture `.moon-qa/motion-regression.html`: 11 comprobaciones correctas de carga oculta, regreso, animación WAAPI real, repetición, pausa con contenido visible y preferencias. Ejecutada con React StrictMode y sin servicios de producción.
- Activación desde modo lector y pausa/reactivación desde el diálogo comprobadas en navegador.
- Los 18 módulos se abrieron y mostraron superficies reveladas en el viewport. Resultados en `.moon-qa/motion-results-2.1.60.json`.
- Dos lecturas de las matrices CSS de ambas órbitas cambiaron con animation-play-state=running y duraciones 18/30s. Al desplazar la ilustración fuera de pantalla se observó su estado visible=false. Los contadores y progresos terminaron en los valores de prueba 2/1/1 y 72/45/20/25, respectivamente.
- El encabezado y su nuevo control encajan a 390 px sin desbordamiento horizontal.
- `.moon-qa/movimiento-dashboard-2.1.60.gif` es una grabación de capturas reales de la galería con datos sintéticos, no una recreación. Las 28 capturas cubren aproximadamente 2.2 segundos.

## Preferencia de la cuenta

Las preferencias existentes de otros usuarios no se cambian al publicar. Si el movimiento sigue desactivado, el control con icono de órbita indica el motivo y permite activar las animaciones completas. La pestaña publicada recuperó después la sesión existente sin introducir credenciales. Se observó el bloqueo por modo lector y, posteriormente, el estado Animaciones activas con Preferencia guardada. En producción body pasó a on, se retiraron las clases de lector/movimiento reducido y ambas órbitas mostraron running a 18/30 segundos. La cuenta quedó con movimiento activo; no se atribuye la activación a una pulsación del agente porque su intento coincidió con la desaparición del botón. Captura: .moon-qa/animaciones-activas-2.1.60.jpg.

## Publicación

Web y Windows publicados y verificados como 2.1.60 con release.ps1. Deploy Netlify: 6ad16b27c4c944c2eeef751c. Actualización Windows: https://github.com/andresm1589/moon-Studios-Dashboard/releases/tag/v2.1.60. No se crearon commits ni se modificó el índice Git.

El instalador descargado del updater estable coincide con SHA-256 0fa05daef20814f272f65a50eb58ecc9a063a901d6680e12ffd7528b51f56b49 (5 937 564 bytes). El servidor sirvió el bundle index-DHmA2-em.js de esta compilación.
