# Moon Fest: nueva web y gestión en Moon Studios

## Experiencia pública

Moon Fest dispone de una web preparada para distintas ediciones, con portada, próximos encuentros, detalle de cada evento, inscripción, cartera de entradas, consulta del QR, privacidad y página 404. El diseño mantiene la paleta monocromática de Moon Studios, integra el logotipo nuevo y añade órbitas, entradas suaves y estados claros de carga y error. Las animaciones se reducen cuando el visitante activa esa preferencia.

Cada edición tiene título, resumen, descripción, imagen opcional, modalidad presencial/virtual/híbrida, ubicación, enlace opcional de transmisión, fechas, apertura/cierre de registro y aforo. El aforo cero significa ilimitado. Las fechas se muestran en la hora de Lima. La web distingue registro próximo, abierto, completo, cerrado, evento terminado, archivado y cancelado; no necesita sustituir manualmente un año fijo en la portada.

La inscripción reserva una plaza y genera una entrada con un token aleatorio de 128 bits. El asistente puede consultar la entrada y descargar su PDF A4 con QR. La vista pública del QR excluye correo y teléfono; el enlace permite consultar nombre, edición, código y estado, por lo que debe tratarse como un enlace compartible de la entrada. El padrón no se puede enumerar mediante esta consulta.

La cartera depende de la sesión del navegador que creó la inscripción. No debe presentarse como una cuenta universal entre dispositivos ni como un envío de entradas por correo: no se incorporó un servicio de correo automático en este trabajo. El PDF y el enlace permiten conservar la entrada.

## Administración dentro del dashboard

La gestión se encuentra en **Webs → Moon Fest**, en `/dashboard/webs?panel=fest`. Se requiere un perfil corporativo activo de CEO o Administración autorizada para Webs; una sesión pública, anónima o electoral no concede acceso.

El panel reúne las ediciones, sus inscripciones y el histórico 2026. La creación y edición utiliza pasos de contenido, fechas/opciones y revisión antes de guardar o publicar. La lista permite buscar, filtrar, editar, cancelar, reactivar y archivar. Archivar conserva los registros y cierra el acceso; no borra la trazabilidad de las entradas emitidas.

En **Inscritos y acceso** se elige la edición, se filtran asistentes, se exporta CSV y se comprueba el código completo o el enlace de una entrada. Primero se revisa el nombre y después se confirma el ingreso. El check-in solo está disponible durante el horario de una edición publicada y activa y se admite una vez. La cancelación de una entrada activa solicita confirmación y libera exactamente una plaza; no reabre una entrada que ya ingresó.

El histórico de la colección anterior se conserva como consulta exclusiva de gestión, sin altas o modificaciones desde el nuevo sistema.

## Datos y permisos

La web y el dashboard comparten copias exactas del contrato `src/types/fest.ts` y de `src/lib/fest/model.ts` y `src/lib/fest/client.ts`. No hay dos motores distintos de reserva.

Una inscripción enlaza en una transacción el registro privado, el índice del correo, la proyección del QR y el incremento del contador. Las reglas comprueban la fecha del servidor, capacidad disponible, identidad del titular y consistencia de los cuatro cambios. La cancelación y el ingreso mantienen sincronizados el registro y su QR. Los identificadores emitidos y el índice del correo no se eliminan ni reutilizan.

Las reglas se componen desde la fuente activa y se conserva byte por byte el exterior del bloque Moon Fest. Se protege el acceso privado a los datos de contacto y se evita listar el padrón del QR. Los detalles del token, los permisos y la privacidad están documentados en `C:/MOON STUDIOS FEST/docs/SEGURIDAD-MOON-FEST.md`.

## Pruebas y límites

Las pruebas del modelo y cliente ejecutan el código real con un adaptador de Firestore en memoria. Las comprobaciones de reglas usan Rules API con documentos simulados y verifican permisos, fechas, capacidad, transacciones incompletas, cancelación, ingreso y conservación del histórico. Estas pruebas son distintas de ejecutar transacciones del SDK contra producción.

Los PDF normal y con valores máximos fueron generados con la función real, renderizados y revisados. Ambos ocupan una página A4, conservan el texto y no desbordan los márgenes. Los dos QR se decodificaron desde sus imágenes renderizadas y coinciden exactamente con sus enlaces de prueba.

Las vistas de QA usan datos sintéticos y adaptadores en memoria. No se crean asistentes, cuentas de Firebase Auth, eventos de ejemplo ni inscripciones reales para probar. Los estados vacíos públicos se conservan hasta que Dirección publique una edición real.

La actualización unificada 2.1.74 también incluye el rediseño del instalador. Su evidencia estática y de compilación comprueba la plantilla, los recursos y el AVI nativo. La interacción del preview nativo se interrumpió con Escape y no constituye una instalación, actualización o desinstalación real completada. La verificación criptográfica del EXE publicado no ejecuta el instalador.

## Publicación y comprobación

Pendiente la publicación final de **Moon Fest 1.0.0** y **dashboard/Windows 2.1.74**. No se afirma que estén publicados en este borrador.

El verificador `.moon-qa/fest/verify-publication.ps1` revisa las copias del núcleo, los metadatos y hashes de los builds, las pruebas y recibos de reglas, el PDF/QR y los archivos estáticos públicos. Reutiliza el comprobador de dashboard/Windows para el endpoint del actualizador, GitHub Latest, tamaño, SHA256 y firma Minisign del EXE descargado. La firma se comprueba con la clave pública configurada de Tauri.

El recibo completo será `.moon-qa/fest/verified-publication.json`, con copia en `.moon-qa/releases/v2.1.74/fest-verified-publication.json` y en el proyecto Moon Fest. Si se utiliza `-RulesPending`, el recibo informa expresamente de reglas pendientes y no acredita el sistema completo.

```powershell
# Inspección exclusivamente local; requiere los artifacts finales compilados.
& '.moon-qa/fest/verify-publication.ps1' -LocalOnly

# Solo después de publicar ambas webs, Windows y las reglas finales.
& '.moon-qa/fest/verify-publication.ps1'
```
