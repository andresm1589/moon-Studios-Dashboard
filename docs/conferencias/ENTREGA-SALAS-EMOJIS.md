# Salas de reunión y emojis · 20 de octubre de 2026

La sala compartida por el dashboard, la aplicación Windows y la web tiene un nuevo escenario oscuro: mosaico y enfoque, pantalla compartida, tarjetas con estado de voz/micrófono, chat lateral, búsqueda de participantes y controles inferiores adaptables. Conserva el logo actual de Moon Studios. La ventana minimizada mantiene el mismo componente LiveKitRoom y los controles existentes.

Los emojis rápidos se envían como mensajes del chat existente y aparecen brevemente sobre el escenario. El catálogo se carga al abrir el selector y permite buscar e insertar en el cursor. Los movimientos de voz, entradas y emojis respetan la reducción de movimiento del sistema y del dashboard.

## Integración en el dashboard

Los componentes reutilizables EmojiButton y EmojiText se conectaron en 17 componentes: Mensajería, Hilos, Markdown, Avisos, Correo, reportes/formularios/comentarios de tareas, Proyectos, Programación, Diseño, Secretaría, DiscordBot, avisos de Conferencias, Correo Fest, Trámites y Socios. Las comunicaciones externas insertan Unicode compatible. Los tokens personalizados de Discord se representan cuando ya existen en el texto; el selector reutilizable acepta un catálogo personalizado autorizado mediante `propios` y no consulta la API administrativa.

Los selectores insertan texto; las acciones de enviar/guardar siguen requiriendo los controles existentes. No se modificaron servicios, roles, credenciales, reglas ni el protocolo de los mensajes.

## Validación

- TypeScript y builds de producción de ambos proyectos.
- 27 comprobaciones de parser e inserción de emojis.
- 13 comprobaciones de los adaptadores de sala en memoria y 7 de renderizado SSR del componente real con esos adaptadores.
- Comparación AST de los controladores y las llamadas de persistencia de los 17 componentes; Markdown conserva código y escapa HTML.
- Auditoría contra baseline: firma de sala, desconexión, desbloqueo de audio, selección de micrófono y ventana Mini conservados.
- Navegador: selector con búsqueda «luna» e inserción sin envío; fallo de envío conserva el borrador y permite reintentar; historial al cerrar/reabrir panel; emojis rápidos animados; reducción de movimiento; controles visibles a 320/390 px y 800×450; modo compacto.

Las comprobaciones audiovisuales usan adaptadores en memoria y perfiles de prueba. No acreditan una llamada real, permisos físicos, moderación del servidor ni la disponibilidad de LiveKit. No se enviaron mensajes a personas reales.

## Evidencia y coordinación

- `.moon-qa/salas-redesign/shared-manifest.json`: igualdad de las 11 parejas de archivos compartidos entre web y dashboard.
- `.moon-qa/salas-redesign/source-freeze.json`: hashes de los archivos fuente/assets congelados para la publicación.
- `.moon-qa/salas-redesign/sala-desktop.png` y `sala-emojis.png`: capturas del componente real con datos simulados.
- `.moon-qa/emojis-integracion/README.md`: cobertura por campo y comprobación de controladores.
- `.moon-qa/salas-redesign/readonly-audit.md`: auditoría del contrato de LiveKit instalado.

La coordinación con Claude se conserva en COORDINACION-DISENO.md. La presentación de estas salas y los componentes de emojis queda integrada sin sustituir sus sistemas de acceso, audio, reconexión ni backend. Se usa release.ps1 para publicar el dashboard y Windows con la misma versión; la web pública usa su sitio Netlify existente.

## Publicación comprobada

- Dashboard y actualizador Windows: **2.1.85**, publicado con `release.ps1` (salida 0), firma del instalador comprobada con la clave pública de la aplicación.
- Dashboard Netlify: `6ad77adef649117e202e6080`.
- Web pública Netlify: `6ad77a2f03b05eb343ac9e03`.
- Verificador público: **21 correctas, 0 fallidas**. Los hashes JS/CSS de las salas y el catálogo coinciden con los builds locales en ambos sitios. El descriptor de actualización, build-info y digest de Windows coinciden. Evidencia: `.moon-qa/salas-redesign/publication-results-v2.1.85.json`.
- No se crearon commits ni se alteró el índice de Git. No se desplegó el backend de Luna NET ni reglas desde esta tarea.
