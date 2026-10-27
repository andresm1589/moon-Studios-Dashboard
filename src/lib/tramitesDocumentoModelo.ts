/** Modelo del documento entregado. No depende de Firebase ni del generador PDF. */
export type PlantillaDocumentoTramite = 'constancia' | 'credencial' | 'respuesta';

export interface BorradorDocumentoTramite {
  plantilla: PlantillaDocumentoTramite;
  titulo: string;
  contenido: string;
  cargo: string;
  area: string;
  vigenteHasta: string;
}

export interface DocumentoTramite extends BorradorDocumentoTramite {
  version: 1;
  folio: string;
  solicitudId: string;
  destinatarioUid: string;
  destinatarioNombre: string;
  destinatarioCodigo: string;
  emitidoPor: string;
  emitidoPorNombre: string;
  emitidoAt: Date;
}

export const PLANTILLAS_DOCUMENTO_TRAMITE: PlantillaDocumentoTramite[] = ['constancia', 'credencial', 'respuesta'];
export const LIMITES_DOCUMENTO_TRAMITE = { titulo: 100, contenido: 6000, cargo: 100, area: 100, tituloCredencial: 60, contenidoCredencial: 240 };

/** La validación compara los componentes para rechazar 31 de febrero y similares. */
export function esFechaTramite(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [year, month, day] = valor.split('-').map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validarBorradorDocumento(borrador: BorradorDocumentoTramite): string | null {
  if (!borrador || !PLANTILLAS_DOCUMENTO_TRAMITE.includes(borrador.plantilla)) return 'Selecciona una plantilla de documento válida.';
  for (const key of ['titulo', 'contenido', 'cargo', 'area', 'vigenteHasta'] as const) {
    if (typeof borrador[key] !== 'string') return 'Completa los datos del documento.';
  }
  if (borrador.titulo.trim().length < 3 || borrador.titulo.trim().length > LIMITES_DOCUMENTO_TRAMITE.titulo) return 'El título debe tener entre 3 y 100 caracteres.';
  if (!borrador.contenido.trim() || borrador.contenido.trim().length > LIMITES_DOCUMENTO_TRAMITE.contenido) return 'El contenido debe tener entre 1 y 6000 caracteres.';
  if (borrador.plantilla === 'credencial' && borrador.titulo.trim().length > LIMITES_DOCUMENTO_TRAMITE.tituloCredencial) return 'El título de la credencial admite hasta 60 caracteres.';
  if (borrador.plantilla === 'credencial' && borrador.contenido.trim().length > LIMITES_DOCUMENTO_TRAMITE.contenidoCredencial) return 'El texto de la credencial admite hasta 240 caracteres para conservar su legibilidad.';
  if (borrador.cargo.trim().length > LIMITES_DOCUMENTO_TRAMITE.cargo || borrador.area.trim().length > LIMITES_DOCUMENTO_TRAMITE.area) return 'El cargo y el área admiten hasta 100 caracteres.';
  if (borrador.vigenteHasta && !esFechaTramite(borrador.vigenteHasta)) return 'Indica una fecha de vigencia válida.';
  return null;
}

export function limpiarBorradorDocumento(borrador: BorradorDocumentoTramite): BorradorDocumentoTramite {
  const error = validarBorradorDocumento(borrador);
  if (error) throw new Error(error);
  return { plantilla: borrador.plantilla, titulo: borrador.titulo.trim(), contenido: borrador.contenido.trim(), cargo: borrador.cargo.trim(), area: borrador.area.trim(), vigenteHasta: borrador.vigenteHasta };
}

type SolicitudParaBorrador = { tipoId: string; tipoNombre: string; solicitanteNombre: string; solicitanteRol?: string; respuestas?: Record<string, string> };
export function crearBorradorDocumento(solicitud: SolicitudParaBorrador): BorradorDocumentoTramite {
  const plantilla: PlantillaDocumentoTramite = solicitud.tipoId === 'tarjeta' ? 'credencial' : solicitud.tipoId === 'constancia' ? 'constancia' : 'respuesta';
  const nombre = solicitud.solicitanteNombre || 'la persona solicitante';
  return {
    plantilla,
    titulo: plantilla === 'credencial' ? 'Credencial de Moon Studios' : plantilla === 'constancia' ? 'Constancia de vínculo con Moon Studios' : `Respuesta: ${solicitud.tipoNombre}`.slice(0, 100),
    contenido: plantilla === 'credencial'
      ? `Esta credencial identifica a ${nombre} como integrante de Moon Studios. Su uso es personal e intransferible.`
      : plantilla === 'constancia'
        ? `Moon Studios deja constancia de que ${nombre} forma parte de nuestro equipo. El presente documento se emite a solicitud de la persona interesada para los fines que estime pertinentes.`
        : `Moon Studios comunica a ${nombre} la aprobación de su solicitud de ${solicitud.tipoNombre.toLocaleLowerCase('es')}.`,
    cargo: (solicitud.solicitanteRol || '').slice(0, 100),
    area: (solicitud.respuestas?.area || '').slice(0, 100),
    vigenteHasta: '',
  };
}

/** Documento de vista previa: la identidad real y la fecha se fijan al emitir. */
export function documentoDeVista(solicitud: { id: string; solicitanteUid: string; solicitanteNombre: string }, borrador: BorradorDocumentoTramite, emisor: { uid: string; nombre: string }): DocumentoTramite {
  return { ...borrador, version: 1, folio: `MS-DOC-${solicitud.id.toUpperCase()}`, solicitudId: solicitud.id,
    destinatarioUid: solicitud.solicitanteUid, destinatarioNombre: solicitud.solicitanteNombre,
    destinatarioCodigo: `MS-${solicitud.solicitanteUid.slice(0, 8).toUpperCase()}`,
    emitidoPor: emisor.uid, emitidoPorNombre: emisor.nombre, emitidoAt: new Date() };
}

function convertirFecha(valor: unknown): Date | undefined {
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? new Date(valor.getTime()) : undefined;
  if (valor && typeof (valor as { toDate?: unknown }).toDate === 'function') {
    try { return convertirFecha((valor as { toDate: () => unknown }).toDate()); } catch { return undefined; }
  }
  return undefined;
}

/** Un documento pendiente de serverTimestamp todavía no está listo para entregar. */
export function normalizarDocumento(valor: unknown): DocumentoTramite | undefined {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return undefined;
  const data = valor as Record<string, unknown>;
  const emitidoAt = convertirFecha(data.emitidoAt);
  const borrador = data as unknown as BorradorDocumentoTramite;
  if (data.version !== 1 || !emitidoAt || validarBorradorDocumento(borrador)) return undefined;
  for (const key of ['folio', 'solicitudId', 'destinatarioUid', 'destinatarioNombre', 'destinatarioCodigo', 'emitidoPor', 'emitidoPorNombre'] as const) {
    if (typeof data[key] !== 'string' || !data[key]) return undefined;
  }
  const solicitudId = data.solicitudId as string, destinatarioUid = data.destinatarioUid as string;
  if (data.folio !== `MS-DOC-${solicitudId.toUpperCase()}` || data.destinatarioCodigo !== `MS-${destinatarioUid.slice(0, 8).toUpperCase()}`) return undefined;
  return {
    ...limpiarBorradorDocumento(borrador), version: 1, folio: data.folio as string, solicitudId,
    destinatarioUid, destinatarioNombre: data.destinatarioNombre as string, destinatarioCodigo: data.destinatarioCodigo as string,
    emitidoPor: data.emitidoPor as string, emitidoPorNombre: data.emitidoPorNombre as string, emitidoAt,
  };
}
