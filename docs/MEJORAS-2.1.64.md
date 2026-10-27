# Moon Studios 2.1.64 · Dirección electoral del CEO

La gestión electoral tiene un espacio propio para el CEO, separado del portal de participantes. Desde la dirección se crean y editan procesos, se revisan expedientes completos, se resuelven permisos y se administran invitaciones. La misma implementación se integra en el dashboard, la aplicación de Windows y la web electoral independiente.

## Dirección y participación

- Solo el rol almacenado exacto `CEO`, verificado desde el servidor, habilita la dirección. El rol histórico `ceo`, los demás empleados y las cuentas externas no obtienen administración.
- El acceso del dashboard empieza en `/dashboard/elecciones/direccion`, con secciones de procesos, candidaturas, participantes e invitaciones. `/gestion` se conserva como redirección compatible para el CEO.
- El portal de participantes mantiene sus propias pantallas. La vista del CEO permite volver a ese portal con datos y controles de participante; los borradores y las solicitudes ajenas quedan fuera de esa vista.
- Los expedientes muestran fotografía, identidad de cuenta, correo de la solicitud, cargo, área, agrupación, lema, todas las propuestas, revisión y votos agregados. Los documentos históricos solo se enlazan si tienen una URL HTTPS válida sin credenciales en la dirección.
- Aprobar el permiso para postular y aprobar una candidatura siguen siendo decisiones distintas. Todos los votantes, incluido el CEO, requieren aprobación por proceso.

## Invitaciones

El CEO crea enlaces de un solo uso y los comparte manualmente. No se envían correos ni mensajes automáticamente. Puede modificar la referencia y el vencimiento mientras la invitación siga sin aceptar, o revocarla; el proceso, el destinatario y los permisos se conservan para mantener su historial.

Las invitaciones pueden quedar abiertas al poseedor del enlace autenticado o dirigirse a un correo concreto. Las dirigidas requieren un correo verificado del proveedor. Las personas destinatarias consultan únicamente el enlace conocido; solo el CEO puede listar las invitaciones.

Aceptar una invitación registra solicitudes pendientes de los permisos indicados. La transacción conserva las aprobaciones y los rechazos anteriores, no reinicia solicitudes rechazadas y no concede roles corporativos. Una invitación ya aceptada no admite otra aceptación. La edición posterior del calendario también se comprueba al aceptar: un vencimiento que haya quedado fuera del nuevo plazo no permite continuar.

Las invitaciones para postular vencen como máximo al cierre de postulaciones y se aceptan durante esa ventana. Las de votación vencen como máximo al cierre del proceso. Las fechas se muestran y editan en hora de Lima; la autorización utiliza la hora del servidor.

Google y Discord mantienen el enlace de invitación al completar el acceso. La continuación de Discord forma parte del estado firmado y solo admite un identificador de invitación validado, sin destinos arbitrarios de redirección.

## Validación

| Comprobación | Resultado |
| --- | --- |
| Dominio electoral real | 204 comprobaciones aprobadas. |
| Función de autenticación OAuth | 103 comprobaciones sintéticas aprobadas. |
| Rules API | 2.066 casos aprobados, con hashes y alcance registrados. |
| Interfaz local | Navegación, permisos, expedientes, invitaciones, errores y formularios revisados con un controlador sintético. |
| Adaptación móvil | Vista de 390 × 844; búsqueda de 16 px y al menos 48 px de alto, sin desbordamiento horizontal del área principal. |

La evaluación de reglas conserva las protecciones corporativas publicadas en v3 y modifica únicamente el bloque electoral. Se mantienen los límites y las cuatro escrituras atómicas del voto; los recibos de presupuesto de acceso incluyen también los flujos de invitación.

Las comprobaciones de interfaz y Rules API son sintéticas. No se ejecutó un commit SDK contra el emulador y no se crearon usuarios, elecciones, candidaturas ni votos de prueba en producción. Las capturas y el detalle de las interacciones están en `.moon-qa/elections-v4/ui-checks.md`.

## Publicación

La publicación de dashboard y Windows utiliza el comando existente `release.ps1 -Version 2.1.64`. La web electoral conserva su sitio Netlify y las reglas se publican con `scripts/deploy-election-rules-v4.ps1` y su comprobación de integridad.

**Publicación 2.1.64 completada y verificada.** Dashboard Netlify: `6ad4300300bccd42a6049c23`. Web electoral: `6ad42f1bc3750a5d276fb0b3`. Ruleset activo: `1b846013-5870-41e6-afb4-fa37f90821c0`. Windows Latest ofrece v2.1.64; el instalador público descargado coincide en SHA-256 con la compilación local y pasó la verificación de firma Minisign. Los recibos están en `.moon-qa/elections-v4/verified-publication.json` y `.moon-qa/releases/v2.1.64/verified-publication.json`.

La descripción del contrato y el historial v3 permanecen en `docs/elections-architecture.md`.
