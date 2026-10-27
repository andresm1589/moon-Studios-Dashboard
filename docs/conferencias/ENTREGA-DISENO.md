# Entrega del diseño de Conferencias

El diseño de la web y el dashboard está terminado en los archivos de trabajo. La publicación conjunta queda pendiente mientras Claude desarrolla el sistema. No se ejecutaron despliegues, envíos de correo ni operaciones con invitados reales.

## Vistas de revisión

- [Portal de invitados](http://127.0.0.1:5184/.moon-qa/conferencias-publicas/index.html?view=guest)
- [Pases y agenda personal](http://127.0.0.1:5184/.moon-qa/conferencias-publicas/index.html?view=passes)
- [Dashboard](http://127.0.0.1:5185/.moon-qa/conferencias-dashboard/index.html)

Todas estas vistas contienen **datos de prueba en memoria**, con red externa bloqueada. No son el sitio publicado ni una verificación de LiveKit o del backend. Los botones y formularios conservan las firmas de las APIs actuales.

## Cambios visuales

Acceso, registro y recuperación; bienvenida; búsqueda y filtros; pases y QR; avisos; estados vacíos y errores; estilo de sala, espera, chat y participantes. Dashboard con agenda, editor de tres pasos, revisión de destinatarios, detalle, listas y control de acceso. Logo actual, paleta monocromática y tokens claro/oscuro del dashboard. Campos de 16 px, diálogos adaptables y animaciones CSS con movimiento reducido y ajustes desactivados.

## Validación

Compilaciones de web y dashboard correctas. TypeScript correcto en ambos proyectos. Quince comprobaciones de presentación/calendario y veinte de formularios/presentación. Navegador: escritorio y 390 px, sin desbordamiento horizontal, campos de 16 px, QR de prueba, espera/sala de maqueta, editor, validación de destinatarios, tema oscuro y movimiento apagado. Contrastes revisados entre 4.62:1 y 6.19:1 para los textos corregidos.

Los hashes de los quince archivos entregados están en [design-manifest.json](../../.moon-qa/conferencias-diseno/design-manifest.json). Las capturas están en [acceso](../../.moon-qa/conferencias-diseno/conferencias-acceso.png) y [dashboard](../../.moon-qa/conferencias-diseno/conferencias-dashboard.png).

## Integración con Claude

Aplicar el [reparto vigente](COORDINACION-DISENO.md). No sustituir los servicios, autenticación, reglas o contratos de Claude por las propuestas retiradas. Su integración nueva de entradas de Moon Fest en el portal conserva sus handlers: puede reutilizar los componentes y clases de los pases rediseñados. La maqueta de sala solo verifica estilos; los dispositivos y el proveedor de video corresponden al sistema.

Guías de detalle: C:/MOON STUDIOS PAGINA WEB/.moon-qa/conferencias-publicas/DISENO-Y-CONTRATOS.md y C:/MOON STUDIOS APP DASHBOARD/.moon-qa/conferencias-dashboard/README.md. Las propuestas funcionales retiradas se conservan únicamente como material de revisión en .moon-qa/conferencias-diseno/coordinar-claude.md.
