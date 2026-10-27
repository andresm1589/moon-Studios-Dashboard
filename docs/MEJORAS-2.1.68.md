# Moon Studios 2.1.68 · Gestión y comunicaciones electorales

La dirección electoral incorpora papelera de procesos, una gestión ampliada de candidaturas, comunicados para los participantes y un cierre global editable entre ediciones. El dashboard, Windows y la web electoral comparten el módulo de `C:\MOON STUDIOS ELECCIONES\src\electoral`; el dashboard lo incorpora mediante `scripts/sync-elections.mjs`.

## Procesos y candidaturas

Solo el perfil activo con el rol almacenado exacto `CEO`, verificado en el servidor, puede administrar estos sistemas. Los empleados, invitados y roles escritos con otra capitalización conservan su experiencia de participantes.

- **Eliminar un proceso** lo traslada a la papelera y lo retira del portal. Conserva candidaturas, permisos, resultados y boletas, junto con el estado anterior, la fecha y el responsable de la eliminación. No borra el historial electoral.
- **Restaurar un proceso** lo devuelve como archivado. La restauración no reabre una votación ni reactiva su calendario.
- **Eliminar candidaturas** requiere que el expediente no tenga votos. Una opción aprobada con la votación abierta queda protegida incluso si todavía tiene cero votos. El borrado deja constancia en auditoría.
- Las candidaturas admiten búsquedas, filtros por proceso, cargo, área, estado y periodo; ordenación, tarjetas o tabla, revisión del expediente, selección múltiple y exportación CSV.
- Las operaciones múltiples se procesan expediente por expediente, con sus propias verificaciones y transacciones. No constituyen un único lote indivisible: ante un fallo, las operaciones anteriores que ya se confirmaron permanecen guardadas.

La aprobación del permiso para postular sigue siendo independiente de la revisión de la candidatura. Todo votante, incluido el CEO, necesita autorización para cada proceso. El sentido de las boletas individuales no se expone en el dashboard.

## Comunicados y notificaciones

La sección **Dirección → Comunicados** permite preparar, publicar, editar, destacar y retirar anuncios generales o vinculados a un proceso. Cada comunicado incluye título, contenido, inicio y fin de vigencia. Las fechas se editan y muestran en hora de Lima.

Los participantes ven los comunicados publicados durante su vigencia en el resumen del portal. El panel **Inicio** del dashboard incorpora un bloque específico de comunicaciones electorales. Los borradores, los anuncios retirados y los que todavía no empiezan o ya vencieron quedan fuera de esas vistas.

La campana incorpora estas publicaciones como una fuente electoral dentro de la categoría de anuncios. Reutiliza el estado leído/oculto de la cuenta y las preferencias existentes de sonido, horas de silencio y avisos de escritorio. Cada actualización tiene una identidad estable: recargar no vuelve a crear el mismo aviso, mientras que una revisión publicada puede generar una nueva versión. Los anuncios programados se activan al comenzar su vigencia; los retirados o vencidos salen del listado.

No se duplican anuncios en cada cuenta y no se envían correos, mensajes de Discord ni otros mensajes externos. El CEO publica desde su panel y las vistas se actualizan mediante las suscripciones compartidas. La primera instantánea electoral al entrar registra las publicaciones existentes sin reproducir un sonido por cada una.

## Cierre global entre ediciones

En **Dirección → Ajustes**, el CEO puede habilitar o cerrar la participación. Puede editar el título de cierre, el mensaje y el año de la próxima edición, y revisar una vista previa antes de guardar. El cambio de abierto a cerrado, o la reapertura, requiere una confirmación explícita en el panel.

Al cerrar, la web electoral muestra la pantalla de cierre antes del inicio de sesión. Las rutas directas de votación, postulaciones e invitaciones quedan cubiertas por el mismo estado. Las personas que ya iniciaron sesión también ven el cierre; pueden cambiar de cuenta. El dashboard muestra el aviso en Inicio y bloquea el portal electoral.

El acceso explícito `/login?direccion=1` permite verificar la cuenta del CEO y mantener disponible la administración. Una cuenta sin ese rol sigue sin obtener gestión. La dirección conserva los ajustes, los comunicados, la papelera, la restauración y la revocación de invitaciones durante el cierre.

El bloqueo también se aplica en Firestore: no basta con ocultar botones. Impide solicitar o ampliar permisos, aceptar invitaciones, crear candidaturas, votar y resolver aprobaciones electorales mientras el estado final esté cerrado. El CEO tampoco puede votar como participante durante el cierre. Los calendarios y las aprobaciones existentes se conservan al reabrir y siguen sujetos a los plazos de cada proceso.

La ausencia histórica del documento de configuración conserva el portal abierto únicamente después de confirmarse en el servidor. Mientras se consulta, ante datos malformados, una respuesta local sin confirmar o un error de conexión, la participación permanece bloqueada. Una conexión recuperada vuelve a consultar el estado real. No se presenta un año de cierre inventado cuando lo que ocurre es un fallo de disponibilidad.

El cierre limita las acciones y las pantallas de participación; no borra los documentos existentes ni revoca los accesos de infraestructura previamente autorizados.

## Integridad del voto

El cliente lee la configuración global, la elección, la candidatura, el permiso aprobado y el registro propio en la misma transacción antes de realizar las cuatro escrituras del voto: boleta determinista, incremento de candidatura, incremento del proceso y ampliación del registro propio. Un cierre concurrente invalida la lectura de configuración y obliga a reintentar o denegar.

Las reglas verifican el estado final de la configuración mediante `getAfter`/`existsAfter`. La boleta obliga a ampliar el registro; el registro obliga a incrementar exactamente ambos contadores; las actualizaciones de los contadores exigen que la boleta no existiera antes. Esa relación evita que un subconjunto de operaciones forme por sí solo un commit válido. No se reutiliza una boleta existente para incrementar resultados.

Un cierre y un voto no pueden confirmarse juntos. Una reapertura y un voto aprobado solo podrían formar un commit válido si la propia escritura de reapertura está autorizada al CEO exacto; una cuenta externa no obtiene esa facultad por proporcionar un estado posterior abierto. La interfaz guarda primero la reapertura y después utiliza el flujo normal de participación.

## Validación y límites

Comprobaciones locales completadas durante la preparación de esta versión:

| Comprobación | Alcance |
| --- | --- |
| `scripts/test-election-model.mjs` | 261 comprobaciones del dominio real, con datos sintéticos. |
| `scripts/test-electoral-runtime.mjs` | 37 comprobaciones del hook público y de las transacciones con adaptadores en memoria, incluidas caché, desconexión y recuperación. |
| `scripts/test-electoral-notifications.mjs` | 10 escenarios de vigencia, retirada, versiones e identidad de lectura. |
| `scripts/test-electoral-notification-hook.mjs` | 8 escenarios del hook real: lectura, descarte, silencio inicial, nueva publicación, reloj programado y aislamiento al cambiar de cuenta. |
| `scripts/test-notification-settings.mjs` | 12 escenarios de preferencias, zonas horarias, silencio y permisos de escritorio. |
| `C:\MOON STUDIOS ELECCIONES\scripts\test-electoral-auth.mjs` | 103 comprobaciones aisladas de autenticación electoral. |
| TypeScript | Dashboard, web electoral y fixture local v5 sin errores en las comprobaciones realizadas. |
| Rules API v5 | 2.621 casos aprobados y 78 grupos de integridad atómica aprobados, ligados a los hashes exactos de sus fuentes. |
| Interfaz local | Pantalla de cierre global revisada en escritorio y móvil con datos en RAM; capturas en `.moon-qa/elections-v5/cierre-global-escritorio-2.1.68.png` y `cierre-global-movil-2.1.68.png`. |

La batería v5 de Rules API incluye la configuración global, la papelera, las comunicaciones, las protecciones corporativas anteriores y la integridad del voto. Evalúa los subconjuntos de las cuatro escrituras y mantiene un registro adicional de grupos: un commit inválido debe contener al menos una operación denegada, aunque alguna operación delegue parte de su prueba en las otras. Añade casos adversariales de boletas existentes con registros incoherentes y de reapertura con cinco operaciones. Los 2.621 casos y los 78 grupos pasaron; los resultados están en `.moon-qa/elections-v5/test-manifest.json`, `test-result.json` y `atomic-proof-ledger.json`.

El inventario de las trazas sintéticas examinadas alcanza como máximo 10 pares función/ruta por escritura y 14 por commit de voto, dentro de los presupuestos comprobados. Cuenta `exists`, `get`, `existsAfter` y `getAfter` como funciones distintas. Se conserva en `.moon-qa/elections-v5/ballot-access-budget.json`; no equivale a medir un commit SDK real.

Las pruebas del dominio, autenticación, hooks y Rules API emplean datos o dependencias sintéticas. La fixture `.moon-qa/elections-v5.html` modifica solo datos en RAM y sirve para revisar la interfaz sin crear elecciones, candidaturas, cuentas ni votos reales. No se ha ejecutado un commit SDK contra un emulador ni se han usado procesos o votantes de producción como datos de prueba.

## Publicación

La versión 2.1.68 se publicó el 18 de octubre de 2026. Dashboard y Windows se publicaron mediante el comando existente `release.ps1 -Version 2.1.68`, que terminó correctamente. La web electoral conserva su destino Netlify y su configuración privada de autenticación. Las reglas se publicaron por separado con `scripts/deploy-election-rules-v5.ps1`, después de validar el baseline activo, los hashes y los grupos de integridad.

| Canal | Recibo publicado |
| --- | --- |
| Dashboard | https://moon-studios-dashboard.netlify.app · deploy `6ad4ea2015b17b9a817e641f`. |
| Web electoral | https://moonstudios-elecciones.netlify.app · deploy `6ad4e8e9b989f620eb7e9c5a`. |
| Firestore | Ruleset `b26ea745-3f83-4246-bd80-53a990272dc7`; contenido corporativo exterior conservado byte por byte. |
| Windows | GitHub Latest `v2.1.68`; instalador público de 6.047.704 bytes descargado y verificado contra el artefacto local y la clave pública de Tauri. |

La verificación pública terminó correctamente: el HTML, los bundles seleccionados y los manifiestos de ambos sitios coinciden byte por byte con las compilaciones. Los 20 archivos compartidos coinciden con ambos manifiestos y la fuente canónica. El SHA-256 del instalador publicado es `28b3f87745525b766d26b5a97a37cc588ad8a0c2d1a452046523bcb03a9480d4`; su firma Minisign es válida. El endpoint configurado del actualizador devuelve 2.1.68. No se ejecutó el instalador en el equipo.

La configuración pública confirma Google y Discord habilitados. El inicio de Discord devuelve 303 al proveedor esperado y conserva las cookies HttpOnly/Secure de estado y limpieza del ticket anterior. Esta comprobación no completa un inicio de sesión real con el proveedor.

Los recibos definitivos están en `.moon-qa/elections-v5/verified-publication.json` y `.moon-qa/releases/v2.1.68/verified-publication.json`. Los despliegues individuales y el ruleset tienen sus propios recibos en esas carpetas. La publicación no cerró elecciones reales, no publicó comunicados de prueba ni modificó procesos, candidatos, cuentas o votos de producción. El CEO puede configurar esas acciones desde la dirección.
