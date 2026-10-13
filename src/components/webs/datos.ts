import { collection, doc, getCountFromServer, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Webs — datos ────────────────────────────────────────────────────────────

export type EstadoSocio = 'pendiente' | 'aprobado' | 'rechazado';
export interface SocioDoc {
  id: string; uid: string; nombre: string; email?: string; monto: number; metodo: string; mensaje?: string;
  estado: EstadoSocio; creadoEn: Timestamp | null; actualizadoEn?: Timestamp | null; fileUrl?: string | null;
  tierLabel?: string; nota?: string; pagoConfirmado?: boolean; pagoEn?: Timestamp | null; revisadoPor?: string;
}

export const ESTADOS_SOCIO: Record<EstadoSocio, { nombre: string; color: string }> = {
  pendiente: { nombre: 'En revisión', color: '#f59e0b' },
  aprobado:  { nombre: 'Aprobado',    color: '#22c55e' },
  rechazado: { nombre: 'Rechazado',   color: '#ef4444' },
};

/** Los socios (más recientes primero), con el correo de cada uno desde users/{uid}. */
export async function cargarSocios(): Promise<SocioDoc[]> {
  const snap = await getDocs(collection(db, 'moonStudios', 'socios', 'items'));
  const lista = snap.docs.map(d => ({ id: d.id, ...d.data() } as SocioDoc))
    .sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0));
  const faltan = [...new Set(lista.filter(s => !s.email && s.uid).map(s => s.uid))];
  const correos = new Map<string, string>();
  await Promise.allSettled(faltan.map(async uid => {
    const email = (await getDoc(doc(db, 'users', uid))).data()?.email;
    if (typeof email === 'string') correos.set(uid, email);
  }));
  return lista.map(s => (s.email ? s : { ...s, email: correos.get(s.uid) }));
}

export interface SolicitudBreve { id: string; titulo: string; tipo: string; estado: string; creadoEn: Timestamp | null }
export interface DatosWebs {
  solicitudes: SolicitudBreve[]; socios: SocioDoc[];
  proyectos: number | null; equipo: number | null; inscritos: number | null; aliados: number | null;
}

const contar = async (...ruta: [string, ...string[]]) => {
  try { return (await getCountFromServer(collection(db, ...ruta))).data().count; } catch { return null; }
};

/** Lo que alimenta el resumen de Webs y las insignias del menú. */
export async function cargarDatosWebs(lunaFetch: (p: string) => Promise<{ data?: unknown[] }>): Promise<DatosWebs> {
  const [solSnap, socios, proyectos, equipo, inscritos, aliados] = await Promise.all([
    getDocs(collection(db, 'moonStudios', 'solicitudes', 'items')).catch(() => null),
    cargarSocios().catch(() => [] as SocioDoc[]),
    contar('moonStudios', 'portfolio', 'items'),
    contar('moonStudios', 'equipo', 'items'),
    contar('moon_studios_fest_2026'),
    // Con tope: si el bot no responde, el resumen no se queda esperando.
    Promise.race([
      lunaFetch('/api/bot/allies').then(r => (Array.isArray(r?.data) ? r.data.length : null)),
      new Promise<null>(r => setTimeout(() => r(null), 6000)),
    ]).catch(() => null),
  ]);
  const solicitudes = (solSnap?.docs ?? []).map(d => ({ id: d.id, ...d.data() } as SolicitudBreve))
    .sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0));
  return { solicitudes, socios, proyectos, equipo, inscritos, aliados };
}
