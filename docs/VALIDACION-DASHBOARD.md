# Validación del dashboard 2.1.59

15 de octubre de 2026. Revisión sobre el checkout del dashboard y componentes reales con conectores sintéticos en la galería local. Las pruebas automatizadas y la galería utilizan servicios sintéticos. La comprobación publicada también recuperó la sesión que ya existía en el navegador, sin introducir credenciales ni modificar contenido o preferencias.

## Cobertura visual

- Inicio y 18 módulos: Calendario, Tareas, Proyectos, Anuncios, Correo, Hilos, Mensajería, Discord, Webs, Programación, Diseño, Contabilidad, Secretaría, CEO, Administración, Roles, Usuarios y Configuración. Todos se abrieron en claro y oscuro sin desbordar horizontalmente la página de escritorio. Los subpaneles y cambios por archivo están en PANELES-DASHBOARD.md.
- Se comprobó el color calculado de las acciones principales de Programación, Diseño, Secretaría, Usuarios, Proyectos e Hilos en ambos temas. El botón Proyecto dejó de mostrar texto oscuro sobre fondo oscuro en claro.
- Configuración: se abrieron Perfil, Seguridad, Privacidad, Apariencia, Notificaciones, Accesibilidad, Atajos, Integraciones, Almacenamiento y Actividad. Cancelar restaura el nombre del perfil de prueba; volumen por teclado cambia a cero; el horario de silencio abre sus campos; tamaño, densidad, contraste y movimiento se aplican al documento.
- Reducir movimiento mantiene visibles las tarjetas de Actividad con opacidad inicial, y detiene las órbitas de bienvenida. Se corrigió la cancelación genérica que dejaba elementos invisibles.
- La bienvenida, el aviso de inactividad y Configuración se revisaron también a 390 px sin desbordamiento horizontal de la página. Seguir conectado invoca la acción real del componente con un callback de prueba.
- Las capturas de .moon-qa son vistas con datos sintéticos, no cuentas de producción.

## Pruebas ejecutadas

| Comprobación | Resultado |
| --- | --- |
| scripts/test-workspace-access.mjs | 47 comprobaciones correctas |
| scripts/test-session-deadlines.mjs | 11 comprobaciones correctas |
| scripts/test-session-identity.mjs | 28 comprobaciones correctas |
| scripts/test-settings-sync.mjs | 19 escenarios correctos |
| scripts/test-notification-settings.mjs | 12 escenarios correctos |
| Fixture React real de bienvenida | 24 comprobaciones correctas en navegador |
| TypeScript global | Correcto |

La fixture comprueba esperas sin concesión de acceso, pasos reales de una promesa controlada, éxito, fallo, reintento, StrictMode, entrada única, cancelación, desmontaje y recuperación de un cierre rechazado. El núcleo de acceso usa roles reales y dependencias sintéticas para comprobar cambios de cuenta, token expirado y perfil ausente. El adaptador de producción utiliza Firebase Authentication y lectura del perfil desde el servidor.

## Límites explícitos

Las pruebas de guardado y cambios de cuenta usan almacenamiento y servicios simulados; no sustituyen un ensayo con cuentas y permisos reales. Las integraciones no implementadas se muestran como próximas. El idioma configura fechas y formatos; la interfaz sigue en español. El cierre coordinado de otros dispositivos requiere clientes actualizados y conexión con el servidor; no revoca tokens desde un backend (SESIONES-DISPOSITIVOS.md).

La publicación web y Windows se completa mediante release.ps1, que verifica versión, firma y manifiestos remotos. El resultado y los hashes se conservan en .moon-qa/releases/v2.1.59.
## Publicación confirmada

- Web estable: https://moon-studios-dashboard.netlify.app — versión 2.1.59, deploy `6ad0e3f15d635832650984bf`.
- Windows estable: https://github.com/andresm1589/moon-Studios-Dashboard/releases/tag/v2.1.59.
- Instalador descargado por HTTP desde la URL del updater: 5 933 609 bytes; SHA-256 `5f8b77ce8d27930394abfbc676c4656ae4f36a3eea27d7c634ca6e1001b32042`, idéntico al firmado localmente.
- La verificación inicial de una sesión guardada mostró un error de conexión recuperable. Reintentar confirmó el acceso y abrió `/dashboard` con perfil y datos reales. No se asignaron permisos ni se introdujeron credenciales.
- Captura de producción: `.moon-qa/dashboard-publicado-2.1.59.jpg`. La captura de bienvenida utiliza un perfil sintético.
- El comando no creó commits ni modificó el índice Git; publicó la compilación actual del workspace.