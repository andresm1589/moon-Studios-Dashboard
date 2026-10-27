import type { UserRole } from '@/types';
import { normalizarDocumento } from './tramitesDocumentoModelo';

export interface TramiteNotificationRecord { id: string; data: Record<string, unknown> }

/** El permiso delegado ya debe estar confirmado por la sesión del panel. */
export const esRevisorTramites = (rol: UserRole | undefined, delegado = false) =>
  rol === 'CEO' || (rol === 'Administración' && delegado);

function fecha(valor: unknown): Date | undefined {
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? new Date(valor.getTime()) : undefined;
  if (valor && typeof (valor as { toDate?: unknown }).toDate === 'function') {
    try { return fecha((valor as { toDate: () => unknown }).toDate()); } catch { return undefined; }
  }
  return undefined;
}

const texto = (valor: unknown, defecto: string) => typeof valor === 'string' && valor.trim() ? valor.trim() : defecto;
const enlace = (vista: string, id: string) => `/dashboard/tramites?vista=${vista}&id=${encodeURIComponent(id)}`;

/** Cada solicitud representa su respuesta actual. La emisión sustituye al aviso
 * de aprobación y tiene una identidad propia para las marcas leído/eliminado. */
export function tramitesOwnNotifications(records: TramiteNotificationRecord[], uid: string) {
  return records.flatMap(({ id, data }) => {
    if (!uid || data.solicitanteUid !== uid || !['en_revision', 'aprobado', 'rechazado'].includes(String(data.estado))) return [];
    const changed = fecha(data.resueltoAt) ?? fecha(data.updatedAt);
    if (!changed) return [];
    const nombre = texto(data.tipoNombre, 'Trámite');
    const documento = data.estado === 'aprobado' ? normalizarDocumento(data.documento) : undefined;
    if (documento && documento.solicitudId === id && documento.destinatarioUid === uid) {
      return [{
        id: `tramite_documento_${id}_${documento.emitidoAt.getTime()}`, rawId: id,
        category: 'task' as const, fuente: 'tramites-propios' as const,
        title: documento.plantilla === 'credencial' ? 'Tu tarjeta Moon Studios está lista' : 'Tu documento está listo',
        preview: `${nombre} · Descarga el PDF en Mis documentos`, important: true,
        createdAt: documento.emitidoAt, linkTo: enlace('documentos', id),
      }];
    }
    const estado = String(data.estado);
    const respuesta = texto(data.comentario, estado === 'en_revision' ? 'El equipo está atendiendo tu solicitud.' : 'Revisa el detalle de tu solicitud.');
    return [{
      id: `tramite_estado_${id}_${estado}_${changed.getTime()}`, rawId: id,
      category: 'task' as const, fuente: 'tramites-propios' as const,
      title: estado === 'en_revision' ? 'Tu trámite está en revisión' : estado === 'aprobado' ? 'Tu trámite fue aprobado' : 'Tu trámite tiene una respuesta',
      preview: `${nombre} · ${respuesta}`, important: estado !== 'en_revision',
      createdAt: changed, linkTo: enlace('mios', id),
    }];
  });
}

/** La bandeja avisa únicamente de solicitudes ajenas que aún esperan revisión.
 * Administración nunca recibe como trabajo un trámite reservado al CEO. */
export function tramitesInboxNotifications(records: TramiteNotificationRecord[], uid: string, rol: UserRole | undefined, delegado = false) {
  if (!uid || !esRevisorTramites(rol, delegado)) return [];
  return records.flatMap(({ id, data }) => {
    if (data.estado !== 'pendiente' || typeof data.solicitanteUid !== 'string' || !data.solicitanteUid || data.solicitanteUid === uid || (data.soloCeo !== false && rol !== 'CEO')) return [];
    const createdAt = fecha(data.createdAt);
    if (!createdAt) return [];
    return [{
      id: `tramite_pendiente_${id}_${createdAt.getTime()}`, rawId: id,
      category: 'task' as const, fuente: 'tramites-bandeja' as const,
      title: `${texto(data.solicitanteNombre, 'Una persona del equipo')} solicitó un trámite`,
      preview: `${texto(data.tipoNombre, 'Trámite')} · Pendiente de revisión`, important: false,
      createdAt, linkTo: enlace('bandeja', id),
    }];
  });
}
