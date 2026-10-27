# Moon Studios 2.1.70 · Trámites más fáciles

Esta versión continúa la entrega de documentos incorporada en 2.1.69 y simplifica el trabajo de empleados y dirección. Conserva las solicitudes y documentos existentes. No crea solicitudes ni emite documentos reales durante las pruebas o la publicación.

## Para el empleado

1. En **Trámites → Solicitar**, elige el trámite disponible y completa sus datos.
2. **Revisar solicitud** muestra un resumen. **Corregir datos** permite volver sin perder las respuestas; solo **Enviar solicitud** registra el expediente.
3. **Mis trámites** muestra el seguimiento y la respuesta. Cuando la dirección emite un documento, aparece en **Mis documentos** con vista directa y descarga PDF.

Las personas con permisos de revisión abren por defecto la bandeja; el resto abre el catálogo para solicitar. Las pantallas de seguimiento y documentos usan una cabecera compacta. La galería de diseños es opcional y se despliega cuando se necesita. Los filtros de la bandeja se reducen a Por atender, Aprobados, Rechazados y Todos; esta última vista conserva también cancelaciones e historial.

## Para la dirección

Abre una solicitud en **Bandeja** y revisa sus respuestas. Puedes marcarla en revisión, rechazarla con un motivo o aprobarla. Si corresponde entregar un documento, el recorrido se separa en tres pantallas: solicitud, vista previa/personalización y confirmación de destinatario y entrega.

Las plantillas preparadas son **Constancia A4**, **Tarjeta Moon Studios de dos caras CR80** y **Documento de respuesta A4**. La vista previa es la primera pantalla del documento; Personalizar abre los campos editables. La tarjeta limita el título a 60 y el contenido a 240 caracteres para conservar la legibilidad; los documentos A4 admiten 100 y 6.000 respectivamente. El contenido extenso se pagina.

El botón final **Emitir y enviar al empleado** guarda la aprobación y el documento de forma atómica. Las aprobaciones históricas sin documento admiten una emisión posterior desde su expediente. Los documentos emitidos no se editan: conservan contenido, folio, destinatario, emisor y fecha. Los PDF se generan al descargarlos a partir de ese registro; no se duplica una copia del archivo por cada dispositivo.

Solo el CEO exacto y Administración con el permiso delegado de resolver pueden revisar y emitir. Administración no puede resolver sus propias solicitudes ni las reservadas al CEO. El CEO conserva su comportamiento previo para solicitudes propias. Las identidades de destinatario y emisor se consultan desde perfiles corporativos vigentes y los tiempos de emisión proceden del servidor. El QR de la tarjeta abre el expediente privado y requiere acceso autorizado; no es una verificación pública ni una firma criptográfica.

## Avisos y consistencia

La campana obtiene avisos de las propias solicitudes y, para quien puede revisar, de la bandeja autorizada. Una nueva respuesta o un PDF entregado enlaza directamente al expediente. No se envían mensajes externos ni correos. El estado leído/oculto y las preferencias existentes se respetan.

Los avisos antiguos de la colección notifications se ignoran en favor de la fuente real para evitar duplicados. La primera captura se carga en silencio; capturas de caché o escrituras pendientes no generan avisos falsos. El cambio de cuenta o la retirada de permisos ocultan inmediatamente la información anterior e ignoran respuestas tardías.

El envío vuelve a leer el catálogo vigente y conserva una captura de las etiquetas, tipos y respuestas del formulario. Las nuevas solicitudes guardan todos los IDs del formulario, incluidos opcionales vacíos. Las reglas también aceptan el formato de 2.1.69 que omite esas respuestas opcionales, sin admitir claves ajenas ni capturas alteradas. Ambos formatos se validaron con hasta 12 campos, incluso todos requeridos y al máximo de longitud, sin exceder el presupuesto de reglas. Se comprueban fechas reales, opciones disponibles, números finitos y texto significativo. Los documentos históricos siguen siendo legibles. La inicialización del catálogo añade únicamente los trámites base que faltan y no sobrescribe personalizaciones.

## Interfaz y accesibilidad

Los campos de escritura usan texto de 16 px y los controles principales de formulario tienen 48 px de altura. Los diálogos conservan un marco de 640 px o 980 px para documentos, limitado por el ancho del dispositivo. Se comprobó la presentación a 390 × 844 y en escritorio. Las transiciones cortas respetan la preferencia de reducir movimiento; la vista previa ya no carga anticipadamente jsPDF.

## Validación

- 50 comprobaciones del modelo de documentos y 63 de ejecución del dominio con Firestore en memoria.
- 21 comprobaciones del mapeador y 20 del hook real de notificaciones de Trámites.
- Regresión de 8 comprobaciones del hook electoral y 12 de preferencias de notificaciones.
- 389 casos de Rules API: roles, delegaciones, privacidad, datos inmutables, documentos, calendarios reales, valores válidos y compatibilidad de formularios v69/v70 de 4 y 12 campos.
- TypeScript global y ESLint de los componentes cambiados aprobados antes de publicar.
- PDF: constancia de una página, respuesta extensa de tres páginas y tarjeta CR80 de dos caras renderizadas e inspeccionadas sin recortes ni pérdida de texto. Se descargó también una tarjeta PDF real desde el navegador de la fixture.
- UI con datos en RAM: solicitud guiada, vuelta al formulario sin perder datos, validación de requeridos, aprobación y entrega de tarjeta/constancia, apertura directa y descarga, vista móvil y marco de escritorio. Detalle y capturas en `.moon-qa/tramites-v3/ui-checks.md`.

Las pruebas usan datos sintéticos y adaptadores en memoria. Rules API no equivale a ejecutar una transacción SDK contra un emulador; no se realizó esa prueba ni se usaron cuentas, documentos o solicitudes reales como datos de prueba. No se ejecutó el instalador de Windows; su firma y descarga pública se verifican tras publicarlo.

## Publicación

Las reglas actuales se publicaron con `node scripts/test-tramites-rules-v2.mjs --deploy`, que volvió a aprobar los 389 casos antes de cambiar la versión activa. Ruleset `14f04aa9-9ac8-4e99-9c3d-28d716157868`, propuesto SHA-256 `8904b9e452cd6bccf2495dfc5247d43afd57fa785d7a7d98fe5cdc2d27395beb`. El exterior de Trámites, incluido todo el sistema electoral, permanece idéntico a la base v5 revisada. Recibo: `.moon-qa/tramites-v2/desplegado.json`.

Dashboard y Windows se publicaron juntos con `release.ps1 -Version 2.1.70`, que terminó correctamente. La compilación final incorpora el marco corregido de los diálogos.

| Canal | Publicación |
| --- | --- |
| Dashboard | https://moon-studios-dashboard.netlify.app/dashboard/tramites · deploy `6ad58729c3fddb08e3a3e14b`. |
| Windows | https://github.com/andresm1589/moon-Studios-Dashboard/releases/tag/v2.1.70 · GitHub Latest estable 2.1.70. |

La comprobación pública de la aplicación pasó: HTML, entrada, Trámites, notificaciones, PDF, jsPDF y CSS coinciden con los archivos compilados. El CSS publicado contiene el marco de 980 px y la descarga del PDF permanece bajo demanda. El instalador público de 6.270.936 bytes coincide con el artefacto local, con SHA-256 `67455f9f4dff88f8214a346d5cab3514e812856b328ce275b6c5422829bcdb00` y firma Minisign válida. Recibo de aplicación: `.moon-qa/tramites-v3/app-publication-verification.json`, también copiado a `.moon-qa/releases/v2.1.70`.

La comprobación final completa terminó correctamente: `.moon-qa/tramites-v3/verified-publication.json` y su copia en `.moon-qa/releases/v2.1.70/verified-publication.json` son idénticas. Incluyen las reglas desplegadas con 389 casos aprobados, los archivos públicos de la web y la descarga/firma del instalador. La web electoral independiente conserva su versión anterior porque no recibió cambios de código en esta tarea.
