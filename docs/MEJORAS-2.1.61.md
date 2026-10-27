# Dashboard 2.1.61

## Navegación y formularios

La navegación sustituye la vista inmediatamente. Se retiró la secuencia de salida/entrada de la página completa que se acumulaba con las entradas de los paneles. Cada superficie tiene una sola entrada; sus hijos no vuelven a desplazarse. Las superficies visibles empiezan antes del primer pintado, también cuando llega un módulo diferido. El cambio de sección restablece el desplazamiento antes del pintado y el contenido no salta por anclaje de scroll.

Se conservan el control de movimiento, las preferencias de accesibilidad, las órbitas del inicio y la recuperación al volver de una pestaña oculta. La navegación lateral no repite su entrada al recuperar visibilidad.

Los campos usan un mínimo de 44 px y texto de al menos 14 px, escalando con el tamaño de fuente. En dispositivos táctiles usan al menos 16 px. Los buscadores con iconos dibujan un solo marco y foco en su contenedor. Los diálogos comparten las medidas. En móvil, las líneas de un asiento contable se presentan en tarjetas con cuenta, descripción, Debe y Haber; el formulario no desborda horizontalmente.

## Herramientas por sección

| Sección | Mejoras |
| --- | --- |
| Inicio | Foco de tareas que necesitan atención, conservando contadores y órbitas. |
| Calendario | Hoy, salto al mes, Mes/Agenda, próximos siete días, vencidas, agenda personal, orden y exportación ICS. El menú de filtros abre/cierra una vez por clic. |
| Mis tareas y equipo | Métricas que filtran correctamente, enfoque, orden, tareas sin fecha y exportación de la vista. |
| Proyectos | Participación, prioridad, fechas límite, orden y exportación CSV. |
| Diseño | Biblioteca, recursos propios, archivos sin etiquetas, orden e inventario CSV. |
| Secretaría | Categorías, documentos propios, plazos, orden y exportación. |
| Programación | Búsqueda de sprint y enfoque por responsable, prioridad y vencimiento. |
| Usuarios | Directorio en tarjetas/lista, rol, orden y CSV disponible para CEO. |
| Roles | Filtros por área y matrices/directorio desplazables dentro de su contenedor en móvil. |
| CEO, Administración, Contabilidad y Discord | Encabezados operativos con métricas que abren sus herramientas correspondientes. |
| Anuncios y Mensajería | Búsqueda, prioridad, orden y limpieza de filtros. |
| Correo e Hilos | Búsquedas amplias, listas adaptables y filtros de interés/lectura. Ctrl+K sólo abre la búsqueda global; redactar correo usa Ctrl+Alt+N. |
| Webs | Búsqueda de secciones, navegación en cuadrícula a 390/820 px y desplazamiento al panel elegido. |
| Configuración | Búsqueda por conceptos como sesiones, contraseña, tema o exportar. |

Las fechas del calendario admiten Date, Timestamp, ISO y fechas locales. Las tareas sin fecha válida ya no se convierten en tareas para hoy. La exportación sólo utiliza los registros visibles en cada vista; no envía información a servicios externos.

## Validación

- Fixture real de movimiento: 18 comprobaciones en React StrictMode; incluye sustitución inmediata, ausencia de animación anidada, inicio antes de pintar, carga oculta, recuperación, repetición y pausa.
- Fechas/ICS: 36 comprobaciones, incluyendo America/Lima, ausencia de fecha, fechas imposibles, bisiestos, escape de contenido y líneas UTF-8.
- CSV de trabajo: ocho comprobaciones de Unicode, delimitadores, comillas, saltos y fórmulas. El directorio se comprobó por separado con siete casos.
- Se abrieron los módulos de escritorio; cada cambio mostró una sola vista y no se encontraron campos por debajo del mínimo. En móvil se comprobaron 18 módulos, además del formulario contable. Roles desplazaba toda la página antes del ajuste; después, main y contenido midieron 390 px y el directorio de 720 px quedó dentro de su viewport de 356 px.
- Filtros probados con datos sintéticos: prioridad de proyectos (1/3), diseño sin etiquetas (1/3), documentos pendientes vencidos (1/3), sprint sin responsable (1/3), directorio por rol (1/3), búsqueda del calendario y búsqueda de configuración.
- El formulario contable a 390 px midió 388 px de ancho sin desbordamiento; sus campos de texto midieron 316 px, los importes 152 px y la altura mínima 44.8 px.
- Evidencia: `.moon-qa/panel-audit-2.1.61.json`. Los datos de la galería son sintéticos y todas sus escrituras están bloqueadas. Estas comprobaciones no sustituyen una transacción real en producción; no se modificaron permisos ni reglas de acceso.

## Publicación confirmada

`release.ps1 -Version 2.1.61` completó TypeScript, Vite, la compilación de Windows, la verificación criptográfica de la firma y ambos despliegues. Recibos en `.moon-qa/releases/v2.1.61/`.

- Netlify: `6ad1af30bb101ea8de85bb6b`, versión HTTP 2.1.61.
- Windows estable: https://github.com/andresm1589/moon-Studios-Dashboard/releases/tag/v2.1.61, updater HTTP 2.1.61.
- Instalador descargado: 5 955 539 bytes; SHA-256 `f384b31c16c040839c455b75837ca2030d790d2c6e5a114cb4d79adc7028bb46`, idéntico al artefacto firmado.
- La sesión real recuperó el acceso y cargó `/assets/index-zpS9T4xt.js`. Proyectos → Calendario mostró una vista por ruta y scroll restablecido. El buscador midió 44 px de alto y 14 px de texto, con borde interior de 0 px y sin sombra interior, en modo compacto.
- Captura de producción: `.moon-qa/dashboard-publicado-2.1.61.png`. El servidor local de QA se detuvo.

El comando publicó los artefactos y la actualización; no instaló ni reinició la aplicación local ni creó commits.
