# Elecciones de Moon Studios · contrato v5

La versión 2.1.68 amplía la dirección exclusiva del CEO con papelera recuperable, comunicaciones electorales y cierre global editable. El módulo canónico mantiene 20 archivos compartidos entre la web electoral y el dashboard; Windows incorpora la misma compilación del dashboard. El contrato actual se resume aquí y se desarrolla en [MEJORAS-2.1.68.md](MEJORAS-2.1.68.md). Los contratos v4 y v3 que siguen se conservan como historial, no como instrucciones para volver a desplegar sus reglas.

## Cambios de datos y autorización en v5

| Documento o estado | Contrato actual |
| --- | --- |
| `elections.status = deleted` | Eliminación recuperable con `previousStatus`, `deletedAt` y `deletedBy`. Oculta el proceso a participantes y conserva expedientes, permisos, votos y resultados. La restauración siempre devuelve `archived`. |
| `electoralSettings/general` | `enabled`, `closureTitle`, `closureMessage`, `returnYear`, `updatedAt` y `updatedBy`. Solo el CEO exacto puede guardar cambios; la interfaz confirma cierre y reapertura. |
| `electoralAnnouncements` | Comunicados generales o de un proceso, con título, contenido, estado, destacado y vigencia. Solo el CEO escribe. Los documentos publicados tienen lectura pública; la interfaz filtra su vigencia, incluso antes del acceso. Borradores y retirados son privados de dirección. |

El rol almacenado exacto `CEO` conserva procesos, expedientes completos, revisiones, invitaciones, comunicaciones y ajustes. Ningún inicio de sesión externo, enlace de invitación ni permiso electoral concede un rol corporativo. Todos los votantes siguen necesitando aprobación del proceso, incluido el CEO.

El cierre bloquea solicitudes, ampliaciones de permisos, postulaciones, revisiones, votos y creación o aceptación de invitaciones. Lo aplican las rutas públicas, las transacciones y Firestore. La dirección sigue disponible para mantener el sistema y reabrirlo. `/login?direccion=1` permite autenticar al CEO cuando la página pública está cerrada; una cuenta sin ese rol continúa viendo el cierre.

La falta histórica del documento de ajustes solo conserva la apertura una vez confirmada por el servidor. Una respuesta pendiente o de caché, un documento malformado o un error de conexión no habilitan participación. El controlador consulta la configuración dentro de cada transacción de participación. Las reglas comprueban su estado final mediante `getAfter`/`existsAfter`; una reapertura solo puede ser autorizada por el CEO y no sustituye el resto de permisos ni los plazos del proceso.

Los comunicados publicados aparecen en el portal, en Inicio y en la campana del dashboard. La campana deriva versiones estables del anuncio y reutiliza lecturas, descartes y preferencias de la cuenta, sin crear copias por usuario. El primer listado no reproduce avisos sonoros atrasados. Los anuncios futuros se incorporan al comenzar su vigencia; las retiradas y vencimientos los eliminan de la presentación. El cambio de cuenta limpia la vista anterior e ignora respuestas tardías del UID anterior.

## Verificación de v5

Pasaron 261 comprobaciones del dominio, 37 de hooks/transacciones con adaptadores en memoria, 8 del hook real de notificaciones, 10 del mapeador electoral, 12 de preferencias, 103 de OAuth y 79 de acceso corporativo. Rules API aprobó 2.621 casos y 78 grupos de integridad atómica. Las trazas sintéticas alcanzaron un máximo de 10 pares función/ruta por escritura y 14 por commit. No se ejecutaron transacciones SDK contra emulador ni se utilizaron datos electorales reales en estas pruebas.

La revisión visual con datos en RAM comprobó eliminación y restauración, publicaciones en Inicio, cierre y reapertura confirmados, rutas directas de voto/invitación y recuperación de errores. En móvil de 390 × 844 el área principal conservó el mismo ancho que su contenido. El detalle está en `.moon-qa/elections-v5/ui-checks.md`.

Las reglas v5 se publicaron con `scripts/deploy-election-rules-v5.ps1`, conservando byte por byte el contenido corporativo exterior al bloque electoral. Ruleset activo de esta publicación: `b26ea745-3f83-4246-bd80-53a990272dc7`; fuente SHA-256 `FCBD549190CB65D1002ABCC15BA69E9856816ECD764E4C6A9502891BB6442260`. Recibo: `.moon-qa/elections-v5/deployed.json`.

Dashboard, web electoral y Windows Latest publican 2.1.68. Se verificaron los archivos públicos de ambos sitios, los 20 archivos de fuente compartida, la disponibilidad pública de Google y Discord, y la descarga real del instalador con su digest y firma válidos. Recibos definitivos: `.moon-qa/elections-v5/verified-publication.json` y `.moon-qa/releases/v2.1.68/verified-publication.json`. Los identificadores de deploy y los límites de esta verificación se documentan en MEJORAS-2.1.68.md. No se cambiaron el estado de apertura ni los datos de participación reales.

## Historial: contrato v4

La versión 2.1.64 añade una dirección exclusiva del CEO y enlaces de invitación. Mantiene las ventanas electorales, las aprobaciones independientes y la integridad del voto del contrato v3. El historial de comprobaciones y publicaciones v3 se conserva al final de este documento.

El módulo funciona como sección nativa en /dashboard/elecciones y como web electoral independiente en https://moonstudios-elecciones.netlify.app/. Ambas aplicaciones usan el mismo proyecto Firebase y conservan las elecciones, candidaturas y boletas existentes. La actualización no migra cuentas ni copia datos a otra base.

## Código compartido

La fuente canónica está en C:/MOON STUDIOS ELECCIONES/src/electoral. Antes de desarrollar o compilar, scripts/sync-elections.mjs incluye una copia en src/electoral del dashboard y registra sus hashes en source-manifest.json. La copia permite compilar el dashboard cuando la carpeta hermana no está disponible.

- types.ts y electionTypes.ts definen ElectionController, las identidades, procesos y permisos.
- model.ts valida calendarios, edición, candidaturas, acceso, invitaciones, votos y resultados.
- useElectionSystem.ts conecta el contrato con Firestore. Recibe la instancia Firebase y una identidad verificada; no crea otra sesión ni acepta identidades de localStorage.
- ElectionWorkspace.tsx separa las rutas de dirección, invitación y participación; ElectionDirectorWorkspace presenta el espacio del CEO. ProcessEditor y ElectoralAccessPanel conservan la edición y las decisiones de acceso. ElectoralInvitation presenta un enlace conocido a su destinatario.
- El anfitrión gestiona las fotografías del bucket candidates de Supabase: JPG, PNG o WebP de hasta 4 MB.

## Identidad y separación de permisos

**Solo el rol exacto CEO gestiona elecciones.** Debe estar almacenado en el perfil verificado del servidor. El rol histórico ceo sigue permitiendo participación, pero ya no concede gestión. Los roles electorales históricos admin, moderator y superadmin, Administración y los demás roles del dashboard tampoco reciben ese permiso.

Todas las personas necesitan la aprobación explícita del CEO **como votantes de cada proceso**, incluidos empleados y el propio CEO. El rol de empresa no sustituye al padrón. Los permisos de votante y de postulación son independientes: una persona puede obtener uno, ambos o ninguno.

La web independiente permite iniciar sesión con Google sin pertenecer a Moon Studios. Verifica el token y consulta el perfil del servidor; si no hay perfil corporativo usa identidad electoral externa, sin crear un perfil de empleado. La integración dentro del dashboard reutiliza su sesión verificada. Firebase no comparte automáticamente la sesión entre orígenes del navegador.

El perfil puede omitir isActive por compatibilidad histórica. Si el campo existe debe ser el booleano true; false, null y otros tipos no habilitan acceso. La autorización se vuelve a comprobar en reglas, con el UID del token. El acceso externo al sistema electoral no concede entrada a datos del dashboard.

### Dirección separada del portal

La entrada del CEO se dirige a `/dashboard/elecciones/direccion`, o a `/direccion` en la web independiente. La dirección ofrece centro de control, `/procesos`, `/candidaturas`, `/participantes` e `/invitaciones` bajo ese prefijo. El acceso antiguo `/gestion` redirige a la dirección para una cuenta CEO; los demás usuarios ven acceso reservado.

El CEO puede abrir el portal de participantes en `/dashboard/elecciones/participar`, o `/participar` en la web independiente. Esa presentación filtra borradores, solicitudes ajenas e invitaciones privadas y oculta las herramientas de dirección. No cambia el rol almacenado ni elimina sus permisos de administración en el servidor. El participante ordinario conserva la entrada habitual `/dashboard/elecciones` o `/`.

El acceso de dirección exige tanto `system.canManage` como el rol exacto del helper compartido. Las reglas comprueban por separado el perfil y el UID auténticos para cada lectura y escritura privilegiadas. Ocultar un botón no constituye la frontera de autorización.

### Estado real de Discord

**Discord está habilitado en producción**, junto con Google. Se configuró la aplicación Luna Bot - Official (`1142511367455264858`) y una identidad de firma dedicada, sin roles asignados en el proyecto. `/api/electoral-auth/config` devuelve ambos proveedores activos; el inicio OAuth devuelve 303 con el callback oficial y rechaza estados inválidos.

El plan actual de Netlify rechazó los ámbitos específicos y Secrets Controller. Se utiliza la configuración privada estándar de producción con todos los ámbitos, incluido Functions, sin prefijos VITE_ y sin cambiar el plan. Los bundles cliente publicados son idénticos a los compilados antes de configurar credenciales. La clave RSA de recuperación local se almacena mediante Windows DPAPI fuera del workspace; los recibos no incluyen secretos.

La implementación utiliza estado firmado, cookies HttpOnly/Secure, callback de origen fijo, un ticket cifrado de corta duración y un token Firebase firmado del lado del servidor. El UID es discord: seguido del identificador de Discord; no se vincula una cuenta corporativa por correo. electoral_email es información verificada del proveedor cuando existe, no un rol ni un permiso. No se aceptan tokens de Discord o perfiles guardados en localStorage como sesión Firebase.

En v4, Google y Discord preservan el destino de una invitación al iniciar sesión. Discord incorpora únicamente el identificador validado del enlace al estado firmado y vuelve a la ruta local de invitación; no admite URLs arbitrarias de retorno. La propiedad informativa `emailVerified` de la identidad se deriva de `email_verified` o del claim electoral_email emitido por el servidor tras verificar al proveedor. Las reglas vuelven a exigir esa verificación para un enlace dirigido a correo.

La activación requiere configurar únicamente en el servidor DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, ELECTORAL_FIREBASE_PROJECT_ID, ELECTORAL_FIREBASE_CLIENT_EMAIL y ELECTORAL_FIREBASE_PRIVATE_KEY, junto con el callback autorizado https://moonstudios-elecciones.netlify.app/auth/callback. No se deben colocar esas credenciales en variables VITE ni reutilizar una credencial personal. La ruta de configuración solo publica disponibilidad, no secretos.

## Procesos, estados y cuatro fechas

El calendario se muestra y edita en **America/Lima**, con independencia de la zona horaria del dispositivo. Firestore guarda instantes Timestamp. Cada proceso nuevo tiene cuatro fechas:

| Campo | Función |
| --- | --- |
| registrationStartDate | Inicio de solicitudes de permiso para postular y recepción de candidaturas. |
| registrationEndDate | Cierre de postulaciones. |
| startDate | Inicio de votación. |
| endDate | Cierre de votación. |

El orden válido es inicio de postulaciones < cierre de postulaciones <= inicio de votación < cierre de votación. Si el formulario omite las fechas de postulación, el dominio propone el instante actual y el inicio de votación; las fechas definitivas se guardan explícitamente en procesos nuevos.

El estado persistido conserva draft → active → closed → archived; un draft también puede archivarse. En la interfaz draft significa **En preparación** y es privado del CEO. Publicar cambia a active y abre la convocatoria según su calendario; no exige candidaturas previas, porque estas se reciben después de publicar.

El estado visible distingue Programada, Postulaciones abiertas, Votación abierta y Plazo finalizado. El inicio se incluye y el cierre se excluye: startDate <= request.time < endDate. Las postulaciones se rigen de igual modo por su propia ventana y siempre terminan antes de votar.

El cierre por fecha es automático en la interfaz y en la autorización del servidor. No depende de un cron ni de que alguien cambie active a closed: el servidor deniega votos al alcanzar endDate. El cambio manual a closed conserva el historial y puede adelantar el cierre.

Para documentos históricos sin ambas fechas de postulación se usa createdAt/startDate para mostrar la ventana. Un proceso antiguo creado cuando la votación ya había comenzado no adquiere un nuevo plazo de postulaciones. Las correcciones de título y el cierre conservan ese documento sin exigir una migración.

### Qué se puede editar

| Situación | Cambios permitidos |
| --- | --- |
| En preparación, sin votos | Nombre, descripción, calendario, cargos y áreas. Si existen candidaturas históricas se conservan cargos y áreas. |
| Publicado, antes de votar y sin votos | Nombre, descripción y calendario; se conservan cargos y áreas. El nuevo inicio de votación debe seguir en el futuro. |
| La votación empezó o ya existen votos | Solo nombre y descripción. |
| closed o archived | Sin edición del proceso; se conserva el historial. |

La hora del navegador ayuda a mostrar los controles; las reglas usan request.time para autorizar cada operación.

## Padrón, solicitudes y candidaturas

La persona solicita permiso de votante, permiso para postular o ambos. La solicitud de votante se admite en un proceso active hasta su cierre; solicitar permiso para postular requiere la ventana de postulaciones abierta.

Cada permiso pasa de none a pending, y el CEO lo resuelve como approved o rejected. La persona no puede aprobarse ni reiniciar una decisión rechazada. El CEO puede reconsiderarla mientras se respete el plazo correspondiente.

La autorización para postular **no aprueba la candidatura**. Una persona habilitada envía nombre, cargo, área, propuestas y foto opcional. La candidatura queda pending hasta una segunda revisión del CEO. El CEO puede aprobar, rechazar o reconsiderar la candidatura antes del inicio de votación y siempre que no tenga votos.

El permiso de postulación solo puede cambiar antes de votar. El permiso de votante puede retirarse durante una votación abierta y bloquea cargos futuros; no borra ni invalida votos anteriores. Cambiar cualquiera de estos permisos no cambia el rol corporativo.

Las candidaturas nuevas usan el ID determinista uid_electionId_positionIndex y guardan positionIndex. La transacción comprueba que no exista; impide dos nuevas postulaciones simultáneas de la misma persona al mismo cargo. Una candidatura rechazada no se vuelve a crear: su decisión debe revisarla el CEO. Los IDs aleatorios históricos se conservan y no se reclasifican de manera automática.

La dirección muestra el expediente completo disponible: foto, UID, correo de la solicitud, cargo, área, agrupación, lema, todas las propuestas, revisión y votos agregados. El normalizador conserva los documentos históricos con URL HTTPS válida sin credenciales; descarta protocolos inseguros, enlaces relativos y direcciones inválidas. No se introduce una lectura de boletas individuales para mostrar el expediente.

## Invitaciones de un solo uso

El CEO crea documentos de ID aleatorio en electoralInvitations y comparte manualmente el enlace `/invitacion/{id}` del sitio electoral. No se envían correos ni mensajes desde este flujo. Cada documento contiene electionId, label, email, requestedVoter/requestedCandidate, status, expiresAt, createdAt, createdBy y updatedAt; la aceptación añade acceptedAt y acceptedBy.

Solo el rol exacto CEO puede listar, crear, editar o revocar invitaciones. La edición permite label y expiresAt mientras status sea active; el destino, los permisos y el creador se conservan. El CEO puede extender una invitación vencida sin aceptar si el calendario vigente lo permite, o revocarla. Las invitaciones aceptadas y revocadas conservan su historial sin edición ni eliminación.

El destinatario autenticado consulta individualmente un identificador conocido. Un email vacío permite el uso por una cuenta autenticada activa que tenga el enlace. Un email específico, normalizado a minúsculas, debe coincidir con el correo verificado del token o con electoral_email verificado por el servidor. La cuenta no puede listar otros enlaces. La autenticación anónima y los perfiles explícitamente inactivos no habilitan este acceso.

La creación y edición requieren una elección publicada active con plazo vigente y un vencimiento futuro como máximo en endDate. Si requestedCandidate es true, el vencimiento debe quedar como máximo en registrationEndDate, o en startDate para procesos históricos. La aceptación también comprueba la ventana de postulaciones. Se revalida todo el calendario actual si el CEO modificó las fechas después de emitir el enlace.

La aceptación transaccional lee invitación, elección y acceso propio. Marca status accepted y los metadatos del usuario auténtico; crea o amplía las solicitudes propias pendientes y conserva createdAt y las decisiones anteriores del CEO. Cuando ya se habían solicitado todos los permisos, la invitación puede aceptarse sin reescribir el acceso. Nunca restablece un rechazo ni asigna roles laborales. Las reglas relacionan la aceptación con el acceso resultante mediante getAfter; los controles independientes de electoralAccess impiden autoaprobaciones. Una segunda aceptación del mismo documento falla por su estado.

## Documentos y consultas

| Colección | Contrato |
| --- | --- |
| elections | IDs existentes; cuatro fechas en procesos nuevos, estado, cargos, áreas, auditoría y totalVotes. No se eliminan procesos. |
| electoralAccess | ID uid_electionId; identidad informativa, requestedVoter/requestedCandidate, estados de cada permiso, creación/actualización y revisión del CEO. |
| electoralInvitations | ID aleatorio; destino, permisos solicitados, vigencia, estado y metadatos de creación/aceptación. Lista exclusiva del CEO; lectura individual del destinatario autenticado. |
| candidates | ID determinista nuevo o ID histórico; UID, elección, cargo/índice, propuestas, estado, votes y revisión. |
| voteRecords | ID uid_electionId; cargos ya votados, último voto y timestamp. Los registros históricos sin campos last* siguen siendo válidos. |
| votes | ID uid_electionId_positionIndex; boleta inmutable con UID, candidatura, elección, cargo/índice y timestamp del servidor. |
| auditLogs | Acciones y decisiones con el UID real, nombre acotado, detalles y timestamp; entradas inmutables desde el cliente. |
| electionResults | Lectura histórica; la interfaz actual deriva resultados de los contadores de candidaturas. |

El CEO consulta todas las elecciones, candidaturas, solicitudes de acceso e invitaciones. Los participantes consultan procesos publicados, candidaturas aprobadas y sus propias candidaturas/solicitudes. El hook usa consultas separadas para aprobadas y propias, suscripciones individuales para los registros de voto propios y ninguna suscripción de listado de invitaciones para participantes. loadInvitation consulta únicamente el documento conocido desde el servidor.

Los snapshots informativos de acceso no conceden derechos. Su correo se toma de Firebase Auth o del claim electoral_email firmado. Al ampliar una solicitud propia puede actualizarse al correo autenticado actual, sin modificar createdAt ni campos de revisión.

## Transacción de voto e integridad

El hook lee la elección, la candidatura, el registro propio y el permiso electoral actualizado dentro de la transacción. Exige aprobación de votante, fechas abiertas, candidatura aprobada correspondiente al cargo y ausencia de un voto previo para ese cargo. Después realiza **cuatro escrituras atómicas**:

1. Crea la boleta determinista.
2. Incrementa exactamente en uno candidates.votes.
3. Incrementa exactamente en uno elections.totalVotes.
4. Agrega el cargo al registro propio, conservando los anteriores y la referencia a la última boleta.

Las reglas relacionan las cuatro escrituras mediante getAfter. Rechazan cambios aislados de contadores, boletas repetidas, cargos o candidaturas ajenos, otro UID, registros manipulados y plazos vencidos. Los contadores son enteros no negativos dentro del rango exacto de JavaScript.

La traza sintética de Rules API registra hasta **11 pares distintos función/ruta por commit** de los casos examinados y hasta 10 por escritura, dentro de los límites verificados por el script. El inventario cuenta exists y get por separado y reutiliza recursos de la escritura actual. Es una medición sintética; no es la ejecución de un commit SDK ni una prueba con emulador.

## Límite de datos corporativos

firebase/company-auth.rules.patch.json contiene **44 reemplazos explícitos**, con texto anterior/posterior y hashes. Sus reglas resultantes se pueden revisar en firebase/company-auth.rules.review.md. La composición conserva el baseline autorizado y modifica solo esos bloques y el bloque electoral.

El acceso corporativo requiere un perfil activo con uno de los siete roles de empresa: CEO, Administración, Empleado, Contador, Diseño, Secretaría o Programación. Un inicio de sesión externo o una aprobación electoral no satisface ese requisito. La lista de usuarios, tareas, Discord, sesiones, mensajes, conferencias y demás colecciones internas quedan dentro de esa frontera, conservando las restricciones adicionales por rol y propietario.

El alta pública propia solo puede crear el perfil client que usa el portal. La asignación de perfiles de empleado corresponde al operador corporativo autorizado; Administración conserva únicamente la creación de Empleado. La actualización propia permite los campos de perfil y configuración usados por las aplicaciones y no permite cambiar role, isActive ni permisos privilegiados.

Se conservan las solicitudes propias de clientes, el CMS publicado y los formularios públicos. No se migran ni se auditan retrospectivamente perfiles existentes. Los bloques públicos preexistentes allies, incidents y _system quedan intactos; sus escrituras públicas anteriores están fuera del alcance de este cambio.

## Resultados y privacidad

Los resultados usan los contadores agregados de candidaturas, muestran porcentajes, distinguen empates y no declaran ganador con cero votos. Mientras la elección está abierta son provisionales.

Los clientes, incluido el CEO en la interfaz, no pueden leer ni listar boletas individuales. El propietario puede leer su propio registro de participación; el padrón del CEO contiene solicitudes y permisos, no el sentido del voto.

Las boletas conservan voterId en la infraestructura. Esto no equivale a voto criptográficamente anónimo: una persona con permisos de consola o Admin SDK está sujeta a los controles de infraestructura.

## Verificación y publicación

La verificación v4 suma **204 comprobaciones del dominio electoral**, **103 de la función OAuth** y **2.066 casos de Rules API**. Los casos cubren rol exacto CEO, invitaciones, correo verificado, límites temporales, preservación de decisiones y las protecciones previas de acceso y voto. Las pruebas de dominio y autenticación emplean datos o dependencias sintéticas; no usan cuentas reales, no crean elecciones y no emiten votos de producción.

scripts/test-election-rules-v4.ps1 compone únicamente el bloque electoral sobre el ruleset v3 autorizado `619dded2-a973-468b-b06d-fe0c20eeea9b`. La revisión conserva el contenido exterior al bloque, incluidas las 44 protecciones corporativas de v3. scripts/deploy-election-rules-v4.ps1 verifica el manifiesto, los hashes, el alcance y el baseline activo antes de publicar. El manifiesto y los inventarios sintéticos de acceso se guardan en `.moon-qa/elections-v4`.

La revisión de interfaz con controlador sintético cubre expedientes completos, aprobación separada, creación/copia/revocación de invitaciones, correo dirigido sin verificar, aceptación pendiente, acceso directo denegado a cuentas externas o ceo minúscula, formularios con error simulado y recuperación. En la vista móvil de 390 × 844 se verificó la búsqueda de 16 px y al menos 48 px de alto, sin desbordamiento horizontal del área principal. El detalle y las capturas están en `.moon-qa/elections-v4/ui-checks.md`.

La publicación v2.1.64 de dashboard y Windows se completó con release.ps1. La web electoral conserva su destino Netlify y la función de autenticación. Los archivos publicados, el instalador descargado y su firma se verificaron contra las compilaciones locales. Los recibos finales están en `.moon-qa/elections-v4/verified-publication.json` y `.moon-qa/releases/v2.1.64/verified-publication.json`.

Estas comprobaciones no equivalen a una transacción Firebase real: no se ejecutó un commit SDK contra el emulador ni se crearon datos de prueba en producción.

### Historial conservado: contrato v3 y publicación 2.1.63

Las pruebas locales del dominio real de v3 sumaron **134 comprobaciones**, la verificación del acceso corporativo **79** y la función de autenticación **58**, con dependencias y datos sintéticos.

La batería final de **1.868 casos de Rules API** pasó y conserva su manifiesto ligado a los hashes exactos. scripts/test-election-rules-v3.ps1 validó las reglas, el alcance de cambios y los presupuestos de acceso. scripts/deploy-election-rules-v3.ps1 exigió los hashes aprobados y que el ruleset activo siguiera siendo el baseline revisado. Las reglas publicadas para v3 fueron `619dded2-a973-468b-b06d-fe0c20eeea9b`; el recibo se conserva en `.moon-qa/elections-v3/deployed.json`. Esos scripts históricos no deben volver a aplicar su composición sobre el baseline v4.

Las pruebas de interfaz con controlador sintético comprueban navegación, edición, solicitudes, aprobación separada, confirmaciones, errores, fechas y adaptación móvil. No equivalen a probar una transacción Firebase real. Tampoco Rules API sustituye un commit SDK contra un emulador; no se ejecutó tal prueba.

La publicación de dashboard y Windows utiliza release.ps1. La web electoral tiene su destino Netlify existente y su función de autenticación. Las reglas se despliegan por separado con su guardia de integridad. La publicación no requiere migrar cuentas ni crear boletas o procesos reales. Los manifiestos, resultados y recibos quedan en .moon-qa/elections-v3 y en los directorios de cada publicación.


### Recibos finales de v2.1.64

Publicados y comprobados: dashboard 6ad4300300bccd42a6049c23, web electoral 6ad42f1bc3750a5d276fb0b3 y ruleset 1b846013-5870-41e6-afb4-fa37f90821c0. Windows Latest sirve 2.1.64. Se compararon los archivos públicos con ambas compilaciones y los 13 archivos de fuente compartida; la descarga pública del instalador y su firma coinciden y son válidas. Detalle en .moon-qa/elections-v4/verified-publication.json, duplicado junto a los artefactos de .moon-qa/releases/v2.1.64/.
