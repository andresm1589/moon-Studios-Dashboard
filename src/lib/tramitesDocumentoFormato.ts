import type { DocumentoTramite } from './tramitesDocumentoModelo';

/** Consulta privada: el portal comprueba la sesión y el acceso a la solicitud. */
export function urlConsultaDocumentoTramite(documento: Pick<DocumentoTramite, 'solicitudId'>): string {
  const query = new URLSearchParams({ vista: 'mios', id: documento.solicitudId });
  return `https://moon-studios-dashboard.netlify.app/dashboard/tramites?${query.toString()}`;
}

/** Consulta pública «Información» de la web oficial: solo para tarjeta y constancia. */
export const SITIO_VERIFICACION = 'moon-studios.netlify.app/informacion';
export function urlVerificacionPublica(documento: Pick<DocumentoTramite, 'destinatarioCodigo' | 'plantilla'>): string {
  const query = new URLSearchParams({ id: documento.destinatarioCodigo, documento: documento.plantilla });
  return `https://${SITIO_VERIFICACION}?${query.toString()}`;
}

/** Mantiene la fecha institucional de Lima tanto en pantalla como en el PDF. */
export function fechaDocumentoTramite(value: Date | string): string {
  const date = value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-05:00`) : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No especificada';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Lima',
  }).format(date);
}
