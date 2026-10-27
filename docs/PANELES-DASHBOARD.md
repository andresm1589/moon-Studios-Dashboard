# Cobertura visual del dashboard

Actualización del 15 de octubre de 2026. La interfaz utiliza superficies Moon en
claro y oscuro y conserva los colores semánticos de estados, roles y prioridades.
Los colores de proyectos, marca, gráficos y contenido que se guardan en la base
de datos conservan sus valores originales.

## Revisión por sección

| Sección | Cambios de presentación |
| --- | --- |
| Calendario | Encabezado delimitado, cuadrícula y panel de detalle en superficies Moon, fechas y estados legibles, acento de texto adaptado al tema y ventanas con los mismos bordes. |
| Tareas | Estadísticas, filtros, listado, gestor de equipo, formulario y detalle comparten superficies y colores de estado legibles. Los colores funcionan también dentro de las ventanas. |
| Proyectos | Encabezado y selector de vistas, tarjetas, bloques, prioridades y estados integrados; estados conservan su significado y los colores guardados de cada proyecto. |
| Anuncios | Encabezado, tarjetas editoriales, filtros, metadatos y creación/edición con jerarquía y contraste común; los avisos importantes mantienen el tono rojo. |
| Correo | Navegación, bandejas, listado, lector, contactos, borradores, redacción y adjuntos usan el tema; íconos de estados se adaptan sin afectar los colores de las imágenes. |
| Hilos | Categorías, selección de conversación, búsqueda, reacciones, redactor, menús y creación/detalle usan clases explícitas que también funcionan en portales. Los controles de imágenes mantienen tinta blanca sobre su fondo oscuro. |
| Mensajería | Estadísticas, estado leído, origen, remitente, fechas, respuestas y acciones. Se eliminó el texto blanco translúcido fijo que desaparecía en claro. |
| Discord | Estado, servidores, comandos, métricas, incidentes, mantenimiento y formularios conservan semántica de estados con tinta legible. La vista sin conexión y la carga pertenecen también al sistema visual del módulo. |
| Webs: resumen y navegación | Encabezado delimitado, navegación y paneles comunes con bordes y superficies Moon. |
| Webs: Moon Studios | Editor de contenido, colecciones, campos, controles de vista previa y avisos de borrador/error/éxito integrados. La vista previa mantiene los colores de la web publicada. |
| Webs: portal de clientes | Solicitudes, estados, socios, notas, respuesta, metadatos y formularios con tinta del tema. |
| Webs: equipo y portafolio | Tarjetas, altas, edición y formularios de contenido sin blancos fijos ni botones de guardar de bajo contraste. |
| Webs: Luna NET | Aliados, editor web, documentos legales e idiomas, eventos, incidentes, filtros y formularios: textos y estados responden al tema. |
| Webs: Moon Fest | General, marca, Discord, usuarios y correo: controles, destinatarios y metadatos responden al tema. Los colores configurados de la marca del evento no se modifican. |
| Panel CEO | Encabezado, pestañas, usuarios, tareas, reportes, selectores, estados y avisos con tinta de tema. Visores multimedia conservan un contexto oscuro local para mantener sus controles legibles. |
| Usuarios | Encabezado, búsqueda, listado, roles, creación/edición, validaciones y selectores; las ventanas comparten el mismo sistema de color. |
| Contabilidad | Todas las pestañas, tarjetas, tablas, facturas y estados de pago usan clases de tema; los tooltips de los gráficos dejan de tener un fondo oscuro fijo en tema claro. |
| Programación | Encabezado, resumen, proyectos, sprints, changelog, métricas y formularios mantienen los estados semánticos adaptados al tema. |
| Administración | Encabezado, métricas, registros, estadísticas, accesos, sistema y menús de exportación con contraste de tema. |
| Roles | Encabezado, tarjetas por rol, usuarios, matriz de permisos y menú de cambio de rol legibles; se eliminaron los grises fijos del botón de cambio. |
| Diseño | Encabezado, subida, estadísticas, galería, listado y edición integrados; la imagen o video conserva sus propios colores. |
| Secretaría | Encabezado, estadísticas, documentos, formulario, actividad y estados usan las mismas superficies con jerarquía numérica consistente. |

## Implementación y límites de esta revisión

- `src/styles/dashboard-modules.css` define clases de superficies y tintas
  específicas. No se invierten colores de contenedores ni se oculta contenido.
- `src/lib/panelColors.ts` adapta solamente la tinta de estados y roles. Las
  transparencias de fondo, gráficos y colores persistidos permanecen intactos.
- Los colores de texto se aplican en el componente, también para Select y Dialog
  que React monta fuera del contenedor de la página.
- Los módulos usan directamente las superficies Moon sólidas. Los botones
  inversos declaran juntos su fondo y tinta (`--moon-accent` y
  `--moon-accent-ink`); los de acento usan `--accent-on-user`. Las clases explícitas
  de acción y badges semánticos tienen precedencia sobre las reparaciones del
  tema claro de la interfaz anterior.
- Los visores con `data-fondo="oscuro"` tienen un contexto de color local; el
  tema claro no vuelve negros sus controles.
- Las consultas, rutas, permisos y operaciones de negocio no se cambian por
  esta revisión de color. No se crean ni modifican datos remotos para validarla.
- Se verifica TypeScript con `npx tsc -b`. La galería local de QA carga componentes
  reales con datos sintéticos y conectores sustituidos, para revisar cada ruta sin
  escribir datos reales. La validación final visual y de publicación se realiza
  desde el flujo principal.
- La paleta semántica de 10 tintas se comprobó numéricamente contra la superficie
  principal y elevada de ambos temas: los 40 pares alcanzan al menos 4.5:1. El
  resultado está en `.moon-qa/panel-color-contrast.json`; esto verifica la paleta,
  no sustituye la revisión de todos los estados y contenidos reales.
