// MOON FEST × Conferencias: una edición virtual o híbrida usa la sala propia de
// Moon Studios (no un enlace externo). La API de Luna NET crea o actualiza la
// sala con el mismo id de la edición; quien tenga entrada entra desde el portal
// de conferencias con la misma cuenta con la que se inscribió.
import { auth } from '@/lib/firebase';

/** Portal donde están la sala y las invitaciones. Es el «enlace de acceso» de la edición. */
export const MOON_SALA = 'https://moon-studios.netlify.app/conferencias';
export const usaSalaMoon = (streamUrl: string | undefined) => !!streamUrl && streamUrl.startsWith(MOON_SALA);

const API = (import.meta.env.VITE_LUNA_API_URL || import.meta.env.VITE_API_URL || 'https://api.lunanet.nellyx.xyz').replace(/\/$/, '');

/** Crea o sincroniza la sala de la edición (nombre, fechas y estado salen de MOON FEST). */
export async function vincularSalaFest(festId: string): Promise<void> {
  const usuario = auth.currentUser;
  if (!usuario || usuario.isAnonymous) throw new Error('Inicia sesión para continuar.');
  const token = await usuario.getIdToken();
  let res: Response;
  try {
    res = await fetch(`${API}/api/moon/conferencias/fest/${encodeURIComponent(festId)}/vincular`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch { throw new Error('No se pudo conectar con el servidor de Moon Studios.'); }
  const json = await res.json().catch(() => null) as { success?: boolean; error?: string } | null;
  if (!json) throw new Error(res.status === 404 ? 'El servidor todavía no tiene esta función: falta subir y reiniciar la API de Luna NET.' : `El servidor respondió algo inesperado (HTTP ${res.status}).`);
  if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
}
