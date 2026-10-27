// Moon Studios Conferencias — cliente de la API de Luna NET.
// Toda escritura pasa por el servidor: las reglas de Firestore solo dejan leer.
import { auth } from '@/lib/firebase';
import type { EventoEntrada, InvitacionCreada, InvitadoEntrada, RespuestaSala, ResultadoValidacion } from './tipos';

const API = (import.meta.env.VITE_LUNA_API_URL || import.meta.env.VITE_API_URL || 'https://api.lunanet.nellyx.xyz').replace(/\/$/, '');
const BASE = `${API}/api/moon/conferencias`;

export class ErrorConf extends Error {
  readonly codigo: string;
  readonly status: number;
  constructor(mensaje: string, codigo = '', status = 0) { super(mensaje); this.codigo = codigo; this.status = status; }
}

async function llamar<T>(ruta: string, metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'POST', cuerpo?: unknown): Promise<T> {
  const usuario = auth.currentUser;
  if (!usuario) throw new ErrorConf('Inicia sesión para continuar.', 'sin-sesion', 401);
  const token = await usuario.getIdToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorConf('No se pudo conectar con el servidor de Moon Studios. Revisa tu conexión.', 'red');
  }
  const json = await res.json().catch(() => null) as ({ success: boolean; error?: string; codigo?: string } & T) | null;
  if (!json) {
    throw new ErrorConf(res.status === 404
      ? 'El servidor todavía no tiene Conferencias: falta subir y reiniciar la API de Luna NET.'
      : `El servidor respondió algo inesperado (HTTP ${res.status}).`, 'servidor', res.status);
  }
  if (!res.ok || !json.success) throw new ErrorConf(json.error || `Error ${res.status}`, json.codigo ?? '', res.status);
  return json;
}

const e = encodeURIComponent;

export const crearEvento = (datos: EventoEntrada) => llamar<{ id: string }>('/eventos', 'POST', datos);
export const editarEvento = (id: string, datos: Partial<EventoEntrada> & { estado?: string }) => llamar<{ id: string; estado: string }>(`/eventos/${e(id)}`, 'PATCH', datos);
export const eliminarEvento = (id: string) => llamar<{ id: string }>(`/eventos/${e(id)}`, 'DELETE');
export const publicarAviso = (id: string, titulo: string, mensaje: string) => llamar<{ id: string }>(`/eventos/${e(id)}/avisos`, 'POST', { titulo, mensaje });

export const invitar = (id: string, invitados: InvitadoEntrada[]) =>
  llamar<{ creadas: InvitacionCreada[]; omitidos: { nombre: string; motivo: string }[] }>(`/eventos/${e(id)}/invitaciones`, 'POST', { invitados });
export const revocar = (id: string, inv: string) => llamar<{ id: string }>(`/eventos/${e(id)}/invitaciones/${e(inv)}/revocar`);
export const regenerar = (id: string, inv: string, liberar = false) => llamar<{ id: string; enlace: string }>(`/eventos/${e(id)}/invitaciones/${e(inv)}/regenerar`, 'POST', { liberar });
export const enviarInvitacion = (id: string, inv: string) => llamar<{ id: string; canal: 'panel' | 'correo' }>(`/eventos/${e(id)}/invitaciones/${e(inv)}/enviar`);

export const credencial = (id: string, inv: string) => llamar<{ qr: string; codigo: string }>(`/eventos/${e(id)}/invitaciones/${e(inv)}/credencial`, 'GET');
export const validar = (id: string, datos: { qr?: string; codigo?: string; registrar?: boolean }) => llamar<ResultadoValidacion>(`/eventos/${e(id)}/validar`, 'POST', datos);

export const entrarSala = (id: string) => llamar<RespuestaSala>(`/eventos/${e(id)}/sala/entrar`);
export const moderarSala = (id: string, uid: string, accion: 'admitir' | 'rechazar' | 'expulsar' | 'readmitir' | 'silenciar') =>
  llamar<{ uid: string }>(`/eventos/${e(id)}/sala/moderar`, 'POST', { uid, accion });
