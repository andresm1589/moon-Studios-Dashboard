# Moon Studios 2.1.63 · Procesos electorales y permisos

La sección Elecciones permite editar los procesos según su etapa, distingue la preparación privada de una convocatoria publicada y cumple los plazos de postulación y votación. La web independiente abre la participación a cuentas externas con Google, sin convertirlas en empleados ni darles acceso a datos corporativos.

## Cambios

- Solo CEO/ceo gestiona elecciones. Todos los votantes, incluidos empleados y CEO, necesitan aprobación por proceso.
- Padrón con solicitudes y decisiones separadas para votar y postular. Aprobar el permiso de postulación no aprueba automáticamente una candidatura.
- Candidaturas pendientes con revisión del CEO y reconsideración antes de votar. Las candidaturas nuevas tienen ID determinista por persona, proceso y cargo para impedir duplicados simultáneos.
- Cuatro fechas mostradas y editadas en America/Lima: inicio/cierre de postulaciones e inicio/cierre de votación.
- Plazos aplicados con hora del servidor. Una elección deja de admitir votos automáticamente al llegar al cierre aunque su estado persistido continúe active.
- El estado privado draft se presenta como En preparación. Al publicar se abre la convocatoria por calendario; no exige candidaturas antes de recibir postulaciones.
- Edición completa durante preparación; publicado y antes de votar permite corregir fechas y textos; desde el inicio de votación solo nombre y descripción. Los procesos cerrados o archivados conservan su historial.
- Permisos visibles y controles de revisión acordes con cada fecha. Retirar un permiso de votante bloquea cargos futuros y conserva los votos anteriores.
- Google y Discord habilitados para la comunidad. Discord usa Luna Bot - Official y una identidad de firma dedicada sin roles corporativos. La activación del servicio no cambia los binarios Windows de 2.1.63.
- Separación de datos corporativos mediante 44 cambios explícitos de reglas. El inicio de sesión externo no permite listar empleados, leer tareas, Discord o sesiones internas ni crear un perfil propio de empleado.
- Se mantienen el portal del cliente, las preferencias de cuenta, el CMS público y sus formularios.

## Integridad y compatibilidad

Los votos siguen realizando cuatro escrituras atómicas: boleta, contador de candidatura, contador del proceso y registro de cargos votados. Las reglas relacionan esos documentos, exigen aprobación de votante y respetan el cierre por fecha.

La traza sintética de Rules API registra hasta 11 pares distintos función/ruta por commit y hasta 10 por escritura en los casos examinados. No se presentan esas trazas como un commit real del SDK.

Se preservan elecciones, candidaturas con IDs históricos y registros previos. Esta actualización no migra cuentas ni modifica retroactivamente boletas. No se crearon procesos ni votos de prueba en producción.

El padrón muestra identidad y permisos, no la opción elegida. Los resultados usan contadores agregados, distinguen empates y no declaran ganador con cero votos. Las boletas conservan UID en la infraestructura; no se afirma anonimato criptográfico.

## Verificación

- 134 pruebas del dominio electoral real aprobadas.
- 79 pruebas del acceso corporativo aprobadas.
- 58 pruebas sintéticas de la función de autenticación aprobadas.
- 1.868 casos finales de Rules API aprobados y ligados a los hashes del código publicado.
- TypeScript estricto del hook y el modelo sin errores.
- Revisión local de interfaz con datos sintéticos, sin crear ni alterar documentos empresariales reales.

No se ejecutó una transacción SDK contra el emulador. Las pruebas de interfaz con controlador simulado y las evaluaciones de Rules API verifican contratos distintos y no equivalen a una elección real en producción.

## Publicación y pendientes

El dashboard web y Windows se publicaron mediante `release.ps1 -Version 2.1.63`. Se verificaron por HTTP los bundles del dashboard y de Elecciones frente al build local, la versión del updater, el SHA-256 de la descarga real de Windows y su firma con la clave pública de la aplicación. La release estable `v2.1.63` está marcada como Latest.

- Dashboard Netlify: `6ad24b47cb0371bd0a4ea6ef`.
- Elecciones Netlify con Discord activo: `6ad4297b363c658f5f28b88e`.
- Firestore: `619dded2-a973-468b-b06d-fe0c20eeea9b`.
- Instalador: 5.985.049 bytes, SHA-256 `e4a6fd2b0e2aab76e73ec3133a38d590b88e39db4e0f686389b6317507732bba`.
- Recibo de verificación: `.moon-qa/releases/v2.1.63/verified-publication.json`.

La comprobación visual local con datos sintéticos cubrió las herramientas del CEO y los participantes. En la revisión final del navegador publicado la sesión empresarial ya no estaba activa; no se simula una sesión ni se crean cuentas de prueba en producción.

Se verificaron Google y Discord activos mediante HTTP, el callback exacto, las cookies HttpOnly/Secure y el rechazo de estado inválido. Una revisión independiente confirmó el SHA-256 del bundle cliente, idéntico al build previo a configurar las claves. Los secretos no se insertaron en el frontend ni se guardaron en Git. La primera autorización de una cuenta se completa en el proveedor.

El contrato completo, los límites conocidos y las rutas de evidencia están descritos en docs/elections-architecture.md.
