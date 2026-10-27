# Registros de acceso y dispositivos

`userSessions` guarda información de una pestaña o aplicación para mostrarla en Configuración. La clave local ahora pertenece al UID: `moon-session:<UID codificado>`. La antigua clave global `sessionKey` no se migra porque no permite identificar a su propietario.

- `registerSession(uid)` consulta conjuntamente propietario y clave de pestaña. Las llamadas simultáneas para ese UID comparten una promesa. Un cambio de cuenta interrumpe las operaciones posteriores a una lectura. La IP opcional actualiza exclusivamente la referencia creada y únicamente mientras siga abierta la misma cuenta.
- `getUserSessions(uid)` solo identifica la pestaña actual utilizando la clave de esa cuenta.
- `revokeSession(id)` y `revokeAllOtherSessions(uid)` eliminan registros de seguimiento en Firestore. Sus nombres se conservan por compatibilidad.
- Después de obtener un perfil verificado y registrar su sesión, `AuthContext` observa exclusivamente ese documento mediante una consulta acotada por UID y clave. Un fallo temporal de registro se reintenta al recuperar conexión; un perfil obtenido mediante Reintentar también inicia el registro. Los clientes actualizados cierran su sesión Firebase cuando el servidor confirma que el registro fue eliminado. Se ignoran snapshots de caché, escrituras pendientes y errores de conexión o permisos; cambiar de cuenta o desmontar el proveedor retira el observador. Una eliminación se procesa una sola vez.

El cierre es coordinado entre **clientes que ejecutan esta versión actualizada**. Los clientes antiguos no implementan el observador. Un cliente sin conexión procesa el cierre cuando vuelve a recibir la confirmación del servidor. La lista puede contener registros de dispositivos que ya no están conectados.

Esto **no revoca tokens de Firebase Authentication desde el servidor**. Invalidar tokens en todos los clientes exige un sistema adicional: revocación desde un backend autorizado y comprobación de esa revocación en los recursos protegidos, o un protocolo de sesiones cuyo estado valide realmente el acceso. Este cambio no añade ese sistema ni modifica permisos o reglas.

Comprobación local: `node scripts/test-session-identity.mjs`. Utiliza almacenamiento y generadores sintéticos; no conecta con Firebase ni escribe datos de cuentas.
