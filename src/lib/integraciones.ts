// lib/integraciones.ts — cuentas externas conectadas al dashboard.
//
// El token de acceso de GitHub o de Google NUNCA llega acá. Este módulo pide
// a la API de Luna «¿qué tengo conectado?» y «dame el resumen», y la API es
// la que habla con el proveedor. Si el token viviera en el navegador estaría
// en el almacenamiento local, en las herramientas de desarrollo y al alcance
// de cualquier extensión con permiso de lectura.
//
// Cómo vuelve el navegador: el `redirect_uri` apunta a la API, no a la app.
// El proveedor devuelve allí, la API canjea el código y pinta una página de
// «ya puedes volver». Acá se pregunta cada pocos segundos si la conexión
// apareció. Funciona igual en la app de escritorio y en la web, sin
// necesitar deep-links.

import { auth } from '@/lib/firebase';
import { abrirExterno } from '@/lib/escritorio';

const API = ((import.meta.env.VITE_LUNA_API_URL as string | undefined)
  || (import.meta.env.VITE_API_URL as string | undefined)
  || 'https://api.lunanet.nellyx.xyz').replace(/\/$/, '');

const BASE = `${API}/api/moon/integraciones`;

export type ProveedorId = 'github' | 'google';

export interface Servicio {
  id: ProveedorId;
  nombre: string;
  permisos: string;
  /** Si el servidor no tiene credenciales, el botón no puede hacer nada. */
  configurado: boolean;
}

export interface Conexion {
  proveedor: ProveedorId;
  cuenta: string | null;
  nombre: string | null;
  avatar: string | null;
  conectadoEn: number | null;
  permisos: string | null;
  caducado: boolean;
}

export interface RepoGithub {
  id: number; nombre: string; descripcion: string | null; privado: boolean;
  lenguaje: string | null; estrellas: number; actualizado: string | null; url: string;
}
export interface PrGithub {
  id: number; titulo: string; numero: number; repo: string | null;
  autor: string | null; borrador: boolean; actualizado: string; url: string;
}
export interface ResumenGithub {
  repos: RepoGithub[];
  totalRepos: number;
  prs: PrGithub[];
  instalaciones: { cuenta: string | null; tipo: string | null; repositorios: string }[];
}

export interface EventoGoogle {
  id: string; titulo: string; inicio: string | null; fin: string | null;
  todoElDia: boolean; lugar: string | null; meet: string | null; url: string | null;
}
export interface ArchivoGoogle {
  id: string; nombre: string; tipo: string; modificado: string;
  url: string | null; icono: string | null;
}
export interface ResumenGoogle { eventos: EventoGoogle[]; archivos: ArchivoGoogle[]; }

/** Un evento del calendario, con la respuesta del usuario a la invitación. */
export interface EventoCalendario extends EventoGoogle {
  respuesta: 'accepted' | 'declined' | 'tentative' | 'needsAction' | null;
}

/** Un error de la API que ya trae el motivo escrito para el usuario. */
export class ErrorIntegracion extends Error {
  reconectar: boolean;
  constructor(mensaje: string, reconectar = false) {
    super(mensaje);
    this.name = 'ErrorIntegracion';
    this.reconectar = reconectar;
  }
}

async function llamar<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ErrorIntegracion('Inicia sesión para continuar.');

  const res = await fetch(`${BASE}${ruta}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });

  const json = await res.json().catch(() => null) as
    { success?: boolean; data?: T; error?: string; reconectar?: boolean } | null;

  if (!res.ok || !json?.success) {
    throw new ErrorIntegracion(
      json?.error || `No se pudo completar la operación (${res.status}).`,
      Boolean(json?.reconectar));
  }
  return json.data as T;
}

/** Qué servicios hay y cuáles tiene conectados esta cuenta. */
export const listar = () =>
  llamar<{ servicios: Servicio[]; conexiones: Conexion[] }>('');

/** Quita la conexión y, si se puede, revoca el token en el proveedor. */
export const desconectar = (proveedor: ProveedorId) =>
  llamar<unknown>(`/${proveedor}`, { method: 'DELETE' });

export const resumenDe = <T>(proveedor: ProveedorId) =>
  llamar<T>(`/${proveedor}/resumen`);

/**
 * Los eventos de Google entre dos fechas, para el calendario del dashboard.
 *
 * El servidor limita el rango a 62 días, que cubre de sobra la vista de un
 * mes (seis semanas como mucho).
 */
export const eventosDeCalendario = (desde: Date, hasta: Date) =>
  llamar<{ eventos: EventoCalendario[] }>(
    `/google/calendario?desde=${encodeURIComponent(desde.toISOString())}`
    + `&hasta=${encodeURIComponent(hasta.toISOString())}`);

/** ¿Tiene esta cuenta conectado ese servicio? Sin reventar si falla la red. */
export async function estaConectado(proveedor: ProveedorId): Promise<boolean> {
  try {
    const { conexiones } = await listar();
    return conexiones.some(c => c.proveedor === proveedor && !c.caducado);
  } catch {
    return false;
  }
}

/**
 * Abre la autorización del proveedor y espera a que la conexión aparezca.
 *
 * El sondeo es la parte fea pero es lo que permite que funcione igual en la
 * app y en la web. Se rinde a los dos minutos: pasado ese tiempo, o cerró la
 * ventana o se quedó a medias, y seguir preguntando solo gasta batería.
 */
export async function conectar(
  proveedor: ProveedorId,
  opciones: { señal?: AbortSignal } = {},
): Promise<Conexion> {
  const { url } = await llamar<{ url: string }>(`/${proveedor}/iniciar`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  await abrirExterno(url);

  const limite = Date.now() + 2 * 60 * 1000;
  // La primera espera es más larga: nadie autoriza en menos de dos segundos,
  // y preguntar antes solo añade una llamada segura de fallar.
  await pausa(3000, opciones.señal);

  while (Date.now() < limite) {
    if (opciones.señal?.aborted) throw new ErrorIntegracion('Conexión cancelada.');
    try {
      const { conexiones } = await listar();
      const hecha = conexiones.find(c => c.proveedor === proveedor);
      if (hecha) return hecha;
    } catch (e) {
      // Un fallo de red suelto no cancela la espera: el usuario sigue en el
      // navegador y puede terminar en cualquier momento.
      if (e instanceof ErrorIntegracion && /Inicia sesión/.test(e.message)) throw e;
    }
    await pausa(2500, opciones.señal);
  }

  throw new ErrorIntegracion(
    'No se recibió la confirmación. Si autorizaste la cuenta, pulsa «Actualizar»; si no, vuelve a intentarlo.');
}

const pausa = (ms: number, señal?: AbortSignal) =>
  new Promise<void>((resolver, rechazar) => {
    if (señal?.aborted) return rechazar(new ErrorIntegracion('Conexión cancelada.'));
    const t = setTimeout(resolver, ms);
    señal?.addEventListener('abort', () => { clearTimeout(t); rechazar(new ErrorIntegracion('Conexión cancelada.')); },
      { once: true });
  });

/** «hace 3 h», «ayer», «12 mar» — para fechas de actualización. */
export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
