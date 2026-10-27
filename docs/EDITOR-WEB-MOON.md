# Administrar la web de Moon Studios

Entra al dashboard con un rol CEO o Administración y abre **Webs → Moon Studios → Editor de la web**.

- Los apartados del editor permiten cambiar portada, identidad, metadatos, estudio, cifras, valores, servicios, proceso, preguntas, contacto, pie, redes, enlaces de productos, aplicación, cotización y presentación del portal.
- **Secciones y movimiento** permite ordenar u ocultar apartados de la portada y desactivar las animaciones. Se respeta también la preferencia de movimiento reducido del visitante.
- **Portafolio** y **Equipo** conservan sus gestores propios en Webs; los cambios de sus registros se reflejan en la web en tiempo real.
- **Guardar borrador** conserva una versión privada. **Publicar** actualiza el contenido público en Firestore, sin recompilar ni desplegar otra vez para cambiar textos.
- **Vista previa** muestra el contenido que estás editando, en escritorio o móvil, con páginas de Inicio, Proyectos, Cotizar y Portal. Los formularios de contacto y de acceso están desactivados en esa vista.
- **Exportar JSON** guarda un respaldo editable; **Importar JSON** lo carga para revisarlo antes de guardarlo o publicarlo.
- El editor conserva cambios locales de la sesión y avisa si otra persona guarda una versión más reciente. En un conflicto, exporta tu trabajo y recarga antes de continuar.

## Datos y despliegue

Ambos proyectos deben usar el mismo `VITE_FIREBASE_PROJECT_ID`. El documento público es `moonStudios/web`; el privado es `moonStudios/webDraft`. Ambos guardan `{content, revision, updatedAt, updatedBy}`. La publicación escribe ambos documentos en una transacción y comprueba sus revisiones.

El dashboard usa `VITE_MOON_WEB_URL` (por defecto `https://moon-studios.netlify.app`). La web acepta mensajes de vista previa desde `VITE_MOON_DASHBOARD_URL` (por defecto `https://moon-studios-dashboard.netlify.app`) y los orígenes de Tauri para Windows. En desarrollo también admite localhost. La comunicación verifica el origen y la ventana del emisor; nunca se consulta el borrador desde la web pública.

`src/lib/moonContent.ts` debe permanecer idéntico en los dos proyectos. `node scripts/test-moon-content.mjs` verifica ese contrato, URLs, importación y valores vacíos.

`firebase/firestore.rules` contiene las reglas completas tomadas del proyecto existente, con permisos del CMS y una restricción para impedir que las cuentas públicas se asignen roles administrativos al registrarse. La creación de personal usa ahora la sesión del administrador en `createUserWithRole`, conservando su sesión principal.

Las reglas fueron verificadas con 184 casos mediante `scripts/test-moon-rules.ps1`, incluyendo privacidad y validación del portal. Cada cliente consulta sus propias solicitudes e inversiones; CEO y Administración conservan su gestión. Las solicitudes públicas comienzan pendientes y no pueden incluir aprobaciones, pagos ni notas del equipo. Las pruebas utilizan documentos y sesiones sintéticos, sin modificar datos reales.

`scripts/deploy-moon-rules.ps1` conserva un respaldo, verifica que la versión remota no haya cambiado y exige que los hashes de reglas y pruebas coincidan con la ejecución aprobada. Los respaldos y resultados locales quedan en `.moon-qa/`, que se ignora en Git; la sesión de Google Cloud se usa solo en memoria.

El nuevo logo lunar se sirve desde `public/brand` en la web y el dashboard. Los SVG enmarcan el PNG original suministrado y conservan su imagen. El antiguo logo predeterminado se migra al normalizar contenido; los logos personalizados y los campos vacíos se respetan.

La web distingue sus rutas conocidas de enlaces inexistentes. Su build genera `dist/404.html`; `public/_redirects` mantiene las rutas de la aplicación con HTTP 200 y devuelve HTTP 404 para el resto. La pantalla 404 tiene navegación de recuperación y evita su indexación. Los estados de carga, error y conexión no envían formularios automáticamente.

Para cambios de diseño o código: `npm run build` en cada proyecto y despliega su carpeta `dist` a su sitio correspondiente de Netlify. Para la app de Windows, recompila el instalador de Tauri; un despliegue del dashboard web no modifica un instalador ya instalado.
