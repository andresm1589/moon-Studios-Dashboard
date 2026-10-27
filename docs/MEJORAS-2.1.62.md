# Moon Studios 2.1.62 · Elecciones

El sistema electoral se incorpora como sección nativa del dashboard en `/dashboard/elecciones`. Usa la sesión existente, el nuevo logo de Moon Studios, los temas claro y oscuro y los controles de movimiento del workspace. La web electoral independiente comparte el mismo módulo y conserva su dirección de publicación.

## Cambios

- Resumen de participación, procesos con búsqueda y filtros, votación por cargo, postulaciones con seguimiento, resultados y gestión electoral.
- Formularios amplios, navegación móvil, confirmaciones accesibles, estados vacíos y página interna de ruta no encontrada.
- Animaciones de entrada, interacción y órbitas decorativas que respetan las preferencias de movimiento.
- Resultados provisionales, tratamiento de empates y cero votos y exportación CSV.
- Gestión del ciclo de procesos y revisión de candidaturas para el CEO y los responsables electorales existentes. El historial se conserva.
- Adaptador compartido de Firebase: cada voto agrega la boleta, los dos contadores y el registro propio en una transacción. Las reglas comprueban su relación, fechas, cargo y duplicados.
- Acceso independiente con verificación Firebase y perfil. La contraseña se borra del estado después de entrar; un error al cerrar sesión se muestra en pantalla.

## Verificación

- 70 comprobaciones del dominio real y 327 casos sintéticos de Rules API aprobados. El despliegue de reglas exige los hashes exactos y limita el cambio al bloque electoral.
- Revisión visual local del módulo real con controlador sintético: dos cargos, bloqueo de repetición, error y reintento, borrador, revisión, postulación, permisos, filtros, CSV, empate y distribución móvil.
- Las compilaciones del dashboard y de la web independiente verifican el código compartido. `release.ps1` publica dashboard y Windows con la misma versión.

No se emitieron votos ni se crearon elecciones de prueba en producción. Las pruebas sintéticas no equivalen a un commit SDK real contra el emulador. El contrato de perfiles y sus límites, la privacidad de las boletas y las candidaturas simultáneas están descritos en `docs/elections-architecture.md`. Los recibos de despliegue se conservan en `.moon-qa/elections` y `.moon-qa/releases/v2.1.62`.

## Publicación confirmada

Publicada el 16 de octubre de 2026 en el dashboard, la web electoral y Windows mediante `release.ps1 -Version 2.1.62`. Las reglas activas son `ed0363ea-935c-44b9-965f-0c06391ca122`, con cambio limitado al bloque electoral.

Se restauró la sesión existente del CEO en producción y se comprobaron las seis secciones con lecturas reales, sin crear procesos ni emitir votos. Las animaciones estaban activas y no se registraron errores de consola. Los bundles remotos coinciden por SHA-256 con las compilaciones locales. El instalador descargado desde el updater tiene 5.977.671 bytes y SHA-256 `a7ccd3bdbfd1752056e75c03a57051159911b01d686b6f8788adfec57238db4d`, coincidente con el artefacto firmado.

- Dashboard: https://moon-studios-dashboard.netlify.app/dashboard/elecciones
- Web electoral: https://moonstudios-elecciones.netlify.app/
- Windows: https://github.com/andresm1589/moon-Studios-Dashboard/releases/tag/v2.1.62
