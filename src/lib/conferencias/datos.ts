// Moon Studios Conferencias — lecturas en tiempo real (Firestore).
// Las reglas deciden qué ve cada quien; aquí solo se escucha y se normaliza.
import { collection, doc, limit, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AsistenciaConf, AvisoConf, EsperaConf, EventoConf, InvitacionConf, RegistroConf } from './tipos';

const fecha = (v: unknown): Date | null => (v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : v instanceof Date ? v : null);
const txt = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function aEvento(id: string, d: DocumentData): EventoConf {
  const c = d.contadores ?? {};
  return {
    id, titulo: txt(d.titulo), descripcion: txt(d.descripcion), modalidad: d.modalidad ?? 'virtual',
    inicio: fecha(d.inicio) ?? new Date(0), fin: fecha(d.fin) ?? new Date(0), lugar: txt(d.lugar), instrucciones: txt(d.instrucciones),
    capacidad: num(d.capacidad), ingresoUnico: d.ingresoUnico !== false, salaEspera: d.salaEspera !== false,
    grabacionPermitida: d.grabacionPermitida === true, aperturaMinutos: num(d.aperturaMinutos ?? 60), salaVirtual: d.salaVirtual === true,
    equipo: d.equipo && typeof d.equipo === 'object' ? d.equipo : {}, miembros: Array.isArray(d.miembros) ? d.miembros : [],
    estado: d.estado ?? 'borrador',
    contadores: { invitados: num(c.invitados), aceptadas: num(c.aceptadas), asistentes: num(c.asistentes), ingresos: num(c.ingresos) },
    creadoPorNombre: txt(d.creadoPorNombre), creadoAt: fecha(d.creadoAt), actualizadoAt: fecha(d.actualizadoAt),
    festEventoId: txt(d.festEventoId),
  };
}

export function aInvitacion(id: string, d: DocumentData): InvitacionConf {
  return {
    id, eventoId: txt(d.eventoId), nombre: txt(d.nombre), email: txt(d.email), rol: d.rol ?? 'asistente', interno: d.interno === true,
    estado: d.estado ?? 'pendiente', ownerUid: typeof d.ownerUid === 'string' ? d.ownerUid : null, codigo: txt(d.codigo), version: num(d.version),
    ingresos: num(d.ingresos), primerIngresoAt: fecha(d.primerIngresoAt), ultimoIngresoAt: fecha(d.ultimoIngresoAt),
    envios: num(d.envios), enviadaAt: fecha(d.enviadaAt), aceptadaAt: fecha(d.aceptadaAt), creadaAt: fecha(d.creadaAt),
  };
}

const ordenarPorInicio = (l: EventoConf[]) => l.sort((a, b) => b.inicio.getTime() - a.inicio.getTime());

/** La dirección ve todos los eventos; el resto, aquellos en cuyo equipo está. */
export function escucharEventos(uid: string, global: boolean, listo: (l: EventoConf[]) => void, error: (e: Error) => void): Unsubscribe {
  const q = global ? collection(db, 'moon_conf_eventos') : query(collection(db, 'moon_conf_eventos'), where('miembros', 'array-contains', uid));
  return onSnapshot(q, s => listo(ordenarPorInicio(s.docs.map(d => aEvento(d.id, d.data())))), error);
}

export const escucharEvento = (id: string, listo: (e: EventoConf | null) => void, error: (e: Error) => void) =>
  onSnapshot(doc(db, 'moon_conf_eventos', id), s => listo(s.exists() ? aEvento(s.id, s.data()) : null), error);

export const escucharInvitaciones = (eventoId: string, listo: (l: InvitacionConf[]) => void, error: (e: Error) => void) =>
  onSnapshot(collection(db, 'moon_conf_eventos', eventoId, 'conf_invitaciones'),
    s => listo(s.docs.map(d => aInvitacion(d.id, d.data())).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))), error);

export const escucharAsistencia = (eventoId: string, listo: (l: AsistenciaConf[]) => void, error: (e: Error) => void) =>
  onSnapshot(query(collection(db, 'moon_conf_eventos', eventoId, 'asistencia'), orderBy('at', 'desc'), limit(500)),
    s => listo(s.docs.map(d => ({ id: d.id, invId: txt(d.data().invId), nombre: txt(d.data().nombre), rol: d.data().rol ?? 'asistente', via: d.data().via ?? 'qr', at: fecha(d.data().at), validadoPor: d.data().validadoPor ?? null }))), error);

export const escucharAvisos = (eventoId: string, listo: (l: AvisoConf[]) => void, error: (e: Error) => void) =>
  onSnapshot(query(collection(db, 'moon_conf_eventos', eventoId, 'avisos'), orderBy('at', 'desc'), limit(50)),
    s => listo(s.docs.map(d => ({ id: d.id, titulo: txt(d.data().titulo), mensaje: txt(d.data().mensaje), autorNombre: txt(d.data().autorNombre), at: fecha(d.data().at) }))), error);

export const escucharEspera = (eventoId: string, listo: (l: EsperaConf[]) => void, error: (e: Error) => void) =>
  onSnapshot(collection(db, 'moon_conf_eventos', eventoId, 'espera'),
    s => listo(s.docs.map(d => ({ uid: d.id, estado: d.data().estado ?? 'esperando', nombre: txt(d.data().nombre), rol: txt(d.data().rol), at: fecha(d.data().at ?? d.data().moderadoAt) }))), error);

export const escucharMiEspera = (eventoId: string, uid: string, listo: (estado: EsperaConf['estado'] | null) => void, error: (e: Error) => void) =>
  onSnapshot(doc(db, 'moon_conf_eventos', eventoId, 'espera', uid), s => listo(s.exists() ? s.data().estado ?? 'esperando' : null), error);

export const escucharAuditoria = (eventoId: string, listo: (l: RegistroConf[]) => void, error: (e: Error) => void) =>
  onSnapshot(query(collection(db, 'moon_conf_eventos', eventoId, 'auditoria'), orderBy('at', 'desc'), limit(300)),
    s => listo(s.docs.map(d => ({ id: d.id, accion: txt(d.data().accion), actorUid: txt(d.data().actorUid), objetivo: d.data().objetivo ?? null, motivo: d.data().motivo, detalle: d.data().detalle, at: fecha(d.data().at) }))), error);

export interface MiInvitacion { evento: EventoConf; invitacion: InvitacionConf }

/**
 * Invitaciones de la cuenta: se parte de moon_conf_accesos (las reglas solo
 * devuelven las propias) y se escucha cada evento e invitación por separado.
 */
export function escucharMisInvitaciones(uid: string, listo: (l: MiInvitacion[]) => void, error: (e: Error) => void): Unsubscribe {
  const hijos = new Map<string, Unsubscribe[]>();
  const eventos = new Map<string, EventoConf>(), invitaciones = new Map<string, InvitacionConf>();
  const emitir = () => listo([...hijos.keys()].flatMap(eventoId => {
    const evento = eventos.get(eventoId), invitacion = invitaciones.get(eventoId);
    return evento && invitacion ? [{ evento, invitacion }] : [];
  }).sort((a, b) => a.evento.inicio.getTime() - b.evento.inicio.getTime()));
  const raiz = onSnapshot(query(collection(db, 'moon_conf_accesos'), where('uid', '==', uid)), s => {
    const vigentes = new Map(s.docs.map(d => [txt(d.data().eventoId), txt(d.data().invId)]));
    for (const [eventoId, stop] of hijos) if (!vigentes.has(eventoId)) { stop.forEach(f => f()); hijos.delete(eventoId); eventos.delete(eventoId); invitaciones.delete(eventoId); }
    for (const [eventoId, invId] of vigentes) {
      if (hijos.has(eventoId) || !eventoId || !invId) continue;
      hijos.set(eventoId, [
        onSnapshot(doc(db, 'moon_conf_eventos', eventoId), d => { if (d.exists()) eventos.set(eventoId, aEvento(d.id, d.data())); else eventos.delete(eventoId); emitir(); }, () => {}),
        onSnapshot(doc(db, 'moon_conf_eventos', eventoId, 'conf_invitaciones', invId), d => { if (d.exists()) invitaciones.set(eventoId, aInvitacion(d.id, d.data())); else invitaciones.delete(eventoId); emitir(); }, () => {}),
      ]);
    }
    emitir();
  }, error);
  return () => { raiz(); hijos.forEach(l => l.forEach(f => f())); hijos.clear(); };
}
