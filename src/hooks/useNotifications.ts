// src/hooks/useNotifications.ts

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc as docRef, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { playNotificationSound } from '@/lib/notificationSound';
import { notificarSistema, enHorasDeSilencio } from '@/lib/escritorio';
import { pushWebActivo } from '@/lib/pushWeb';
import type { SoundType } from '@/lib/notificationSound';
import { normalizeElectoralAnnouncement } from '@/electoral/model';
import { electoralAnnouncementNotifications } from '@/lib/electoralNotifications';
import { useElectoralAnnouncementClock } from '@/electoral/ElectoralPublicPanel';
import type { ElectoralAnnouncement } from '@/electoral/types';
import type { UserRole } from '@/types';
import { esRevisorTramites, tramitesOwnNotifications, tramitesInboxNotifications } from '@/lib/tramitesNotifications';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type NotifCategory = 'announcement' | 'email' | 'thread' | 'message' | 'task' | 'security';

export interface UnifiedNotification {
  id:        string;
  category:  NotifCategory;
  title:     string;
  preview:   string;
  createdAt: Date;
  important?: boolean;
  linkTo?:   string;
  rawId?:    string;
  /** Qué escucha la trajo, si no es la de su categoría (p. ej. 'mention'). */
  fuente?:   string;
  /** Invalida datos de Trámites al cambiar la cuenta o su delegación. */
  tramitesScope?: string;
}

interface UseNotificationsOptions {
  uid:               string | undefined;
  /** Mensajes de contacto de las webs: las reglas solo dejan leerlos a CEO y Administración. */
  puedeVerMensajeria?: boolean;
  rol?: UserRole;
  /** Delegación de revisión de Trámites confirmada para Administración. */
  puedeRevisarTramites?: boolean;
  /** Ajuste "Notificaciones de escritorio": aviso del sistema (Windows o el navegador). */
  escritorio?:       boolean;
  /** Horas de silencio: ni sonido ni aviso del sistema entre `desde` y `hasta` ('HH:mm'). */
  silencio?:         { activo: boolean; desde?: string; hasta?: string };
  soundType:         SoundType;
  soundVolume:       number;
  muted:             boolean;
  enabledCategories: Record<NotifCategory, boolean>;
}

// ── Qué está leído y qué se eliminó: en la CUENTA, no en el dispositivo ──────
// Antes se guardaba en localStorage: en otro equipo, en la web o con los datos
// limpios todo volvía como nuevo. Y «marcar todo» reemplazaba la lista por
// solo lo que estaba cargado en ese momento, así que lo demás «revivía».
//
// Ahora vive en users/{uid}.notifEstado (sincronizado en tiempo real) con una
// marca «hasta»: todo lo creado antes de leidasHasta cuenta como leído y todo
// lo anterior a ocultasHasta como eliminado. Las listas sueltas solo guardan
// lo marcado de a uno, y se recortan (no crecen para siempre).

export interface EstadoNotif { leidasHasta: number; leidas: string[]; ocultasHasta: number; ocultas: string[] }
/** Fuentes que también llegan por push desde Luna NET (services/push/avisosPush.js). */
const FUENTES_CON_PUSH = new Set(['mention', 'aviso-tarea', 'security', 'conferencias', 'tramites-propios', 'tramites-bandeja']);
const MAX_SUELTAS = 300;
const TRES_DIAS = 3 * 86_400_000;

const claveCache = (uid: string) => `notif-estado-${uid}`;
function leerCache(uid: string): EstadoNotif | null {
  try { const e = JSON.parse(localStorage.getItem(claveCache(uid)) || 'null'); return e && typeof e.leidasHasta === 'number' ? e : null; } catch { return null; }
}
/** La primera vez: lo leído/eliminado en este dispositivo (versión vieja) y lo de más de 3 días, leído. */
function estadoInicial(uid: string): EstadoNotif {
  const viejo = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  return {
    leidasHasta: Date.now() - TRES_DIAS, leidas: viejo(`notif_readIds_v3_${uid}`).slice(-MAX_SUELTAS),
    ocultasHasta: 0, ocultas: viejo(`notif_dismissed_${uid}`).slice(-MAX_SUELTAS),
  };
}
const recortar = (e: EstadoNotif): EstadoNotif => ({ ...e, leidas: e.leidas.slice(-MAX_SUELTAS), ocultas: e.ocultas.slice(-MAX_SUELTAS) });
const tiempo = (n: UnifiedNotification) => n.createdAt.getTime();
export const estaLeida  = (e: EstadoNotif, n: UnifiedNotification) => tiempo(n) <= e.leidasHasta || e.leidas.includes(n.id);
export const estaOculta = (e: EstadoNotif, n: UnifiedNotification) => tiempo(n) <= e.ocultasHasta || e.ocultas.includes(n.id);

// ── Hook principal ─────────────────────────────────────────────────────────────

// Hilos.tsx guarda acá cuándo respondiste tú un hilo, para no avisarte de tu
// propia respuesta (el hilo no guarda quién respondió último: las reglas de
// Firestore no dejan escribir ese campo a quien no es el autor).
export const claveMiRespuesta = (uid: string, hiloId: string) => `hilos_mi_respuesta_${uid}_${hiloId}`;

export function useNotifications({
  uid,
  puedeVerMensajeria = false,
  rol,
  puedeRevisarTramites = false,
  escritorio = false,
  silencio,
  soundType,
  soundVolume,
  muted,
  enabledCategories,
}: UseNotificationsOptions) {

  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [electoralFeed, setElectoralFeed] = useState<{ uid: string; items: ElectoralAnnouncement[] }>({ uid: '', items: [] });
  const electoralClock = useElectoralAnnouncementClock(electoralFeed.items);

  const [estado, setEstado] = useState<EstadoNotif | null>(null);
  const estadoRef = useRef<EstadoNotif | null>(null);

  const knownIdsRef    = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const prevUidRef     = useRef<string | undefined>(undefined);
  const requestedUidRef = useRef(uid);
  requestedUidRef.current = uid;
  const revisaTramites = esRevisorTramites(rol, puedeRevisarTramites);
  const tramitesScope = `${uid || ''}:${enabledCategories.task}:${rol || ''}:${revisaTramites}`;
  const requestedTramitesScopeRef = useRef(tramitesScope);
  // Invalidate queued private callbacks before effect cleanup at a role change.
  // eslint-disable-next-line react-hooks/refs
  requestedTramitesScopeRef.current = tramitesScope;

  // ── Estado de la cuenta: al instante desde la copia local, y en vivo desde Firestore ──
  useEffect(() => {
    if (!uid) {
      setEstado(null); estadoRef.current = null;
      setNotifications([]);
      knownIdsRef.current    = new Set();
      isFirstLoadRef.current = true;
      prevUidRef.current     = undefined;
      return;
    }
    if (prevUidRef.current !== uid) {
      knownIdsRef.current    = new Set();
      isFirstLoadRef.current = true;
      setNotifications([]);
      // A second account with no local cache must never initialize its
      // Firestore state from the account that was previously signed in.
      estadoRef.current = null;
      setEstado(null);
    }
    prevUidRef.current = uid;

    const local = leerCache(uid);
    if (local) { estadoRef.current = local; setEstado(local); }
    let active = true;
    const unsubscribe = onSnapshot(docRef(db, 'users', uid), snap => {
      if (!active || requestedUidRef.current !== uid) return;
      const remoto = snap.data()?.notifEstado as EstadoNotif | undefined;
      if (remoto && typeof remoto.leidasHasta === 'number') {
        const e = recortar({ leidasHasta: remoto.leidasHasta, leidas: remoto.leidas ?? [], ocultasHasta: remoto.ocultasHasta ?? 0, ocultas: remoto.ocultas ?? [] });
        estadoRef.current = e; setEstado(e);
        try { localStorage.setItem(claveCache(uid), JSON.stringify(e)); } catch { /* sin espacio */ }
      } else if (snap.exists()) {
        // Primera vez con este sistema: se crea con lo que había en este dispositivo.
        const e = estadoRef.current ?? estadoInicial(uid);
        estadoRef.current = e; setEstado(e);
        updateDoc(docRef(db, 'users', uid), { notifEstado: e }).catch(err => console.error('[notif] estado:', err));
      }
    }, err => {
      if (!active || requestedUidRef.current !== uid) return;
      console.error('[notif] estado:', err);
      if (!estadoRef.current) { const e = estadoInicial(uid); estadoRef.current = e; setEstado(e); }
    });
    return () => { active = false; unsubscribe(); };
  }, [uid]);

  /** Cambia el estado y lo guarda en la cuenta (y en la copia local). */
  const cambiar = useCallback((f: (e: EstadoNotif) => EstadoNotif) => {
    if (!uid || requestedUidRef.current !== uid || prevUidRef.current !== uid) return;
    const nuevo = recortar(f(estadoRef.current ?? estadoInicial(uid)));
    estadoRef.current = nuevo; setEstado(nuevo);
    try { localStorage.setItem(claveCache(uid), JSON.stringify(nuevo)); } catch { /* sin espacio */ }
    updateDoc(docRef(db, 'users', uid), { notifEstado: nuevo }).catch(err => console.error('[notif] guardar estado:', err));
  }, [uid]);

  /** Marca como ya conocidas (sin sonido ni aviso) las notificaciones de una primera carga. */
  const sembrar = (items: UnifiedNotification[]) => { items.forEach(n => knownIdsRef.current.add(n.id)); };

  // ── Merge helper ──────────────────────────────────────────────────────────
  const merge = useCallback((incoming: UnifiedNotification[], category: NotifCategory | 'mention' | 'aviso-tarea' | 'electoral' | 'tramites-propios' | 'tramites-bandeja' | 'conferencias') => {
    setNotifications(prev => {
      const rest     = prev.filter(n => (n.fuente ?? n.category) !== category);
      const combined = [...rest, ...incoming];
      combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return combined.slice(0, 50);
    });
  }, []);

  // Electoral communications are a live public source, without copying them to
  // every account or sending emails. Withdrawal/expiry removes them immediately.
  useEffect(() => {
    setElectoralFeed({ uid: uid || '', items: [] });
    merge([], 'electoral');
    if (!uid || !enabledCategories.announcement) return;
    let active = true;
    let firstSnapshot = true;
    const unsubscribe = onSnapshot(query(collection(db, 'electoralAnnouncements'), where('status', '==', 'published')), snapshot => {
      if (!active || requestedUidRef.current !== uid) return;
      const items = snapshot.docs.map(item => normalizeElectoralAnnouncement(item.id, item.data()));
      if (firstSnapshot) {
        // Other notification sources can finish first. Existing electoral
        // publications must still stay silent on login/reconnection.
        electoralAnnouncementNotifications(items, new Date()).forEach(item => knownIdsRef.current.add(item.id));
        firstSnapshot = false;
      }
      setElectoralFeed({ uid, items });
    }, () => {
      if (active) { setElectoralFeed({ uid, items: [] }); merge([], 'electoral'); }
    });
    return () => { active = false; unsubscribe(); };
  }, [uid, enabledCategories.announcement, merge]);
  useEffect(() => {
    if (!uid || electoralFeed.uid !== uid || !enabledCategories.announcement) { merge([], 'electoral'); return; }
    merge(electoralAnnouncementNotifications(electoralFeed.items, electoralClock), 'electoral');
  }, [uid, electoralFeed, electoralClock.getTime(), enabledCategories.announcement, merge]);

  // La campana se deriva de las solicitudes confirmadas, sin copiar avisos a
  // cada cuenta. Un cambio de sesión o delegación invalida callbacks en cola.
  useEffect(() => {
    if (!uid || !enabledCategories.task) return;
    let active = true;
    const sources = [
      { source: query(collection(db, 'tramites_solicitudes'), where('solicitanteUid', '==', uid)), category: 'tramites-propios' as const },
      ...(revisaTramites ? [{ source: collection(db, 'tramites_solicitudes'), category: 'tramites-bandeja' as const }] : []),
    ];
    const unsubscribes = sources.map(({ source, category }) => {
      let firstSnapshot = true;
      let failed = false;
      return onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
        if (!active || failed || requestedUidRef.current !== uid || requestedTramitesScopeRef.current !== tramitesScope) return;
        // Una escritura optimista o una copia sin confirmar no constituye una
        // entrega. Esperamos al servidor también en el primer acceso sin red.
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) { merge([], category); return; }
        const records = snapshot.docs.filter(item => !item.metadata.hasPendingWrites).map(item => ({ id: item.id, data: item.data() }));
        const items = category === 'tramites-propios'
          ? tramitesOwnNotifications(records, uid)
          : tramitesInboxNotifications(records, uid, rol, puedeRevisarTramites);
        if (firstSnapshot) {
          items.forEach(item => knownIdsRef.current.add(item.id));
          firstSnapshot = false;
        }
        merge(items.map(item => ({ ...item, tramitesScope })), category);
      }, () => {
        failed = true;
        if (active && requestedUidRef.current === uid && requestedTramitesScopeRef.current === tramitesScope) merge([], category);
      });
    });
    return () => { active = false; unsubscribes.forEach(unsubscribe => unsubscribe()); merge([], 'tramites-propios'); merge([], 'tramites-bandeja'); };
  }, [uid, enabledCategories.task, rol, puedeRevisarTramites, revisaTramites, tramitesScope, merge]);

  // ── Sonido: solo para notificaciones genuinamente nuevas ──────────────────
  useEffect(() => {
    if (notifications.length === 0) return;

    if (isFirstLoadRef.current) {
      // Los trámites registran su propia primera captura, incluso si estaba
      // vacía: una respuesta posterior sí debe avisar aunque sea el primer
      // elemento de la campana. El resto conserva la carga inicial silenciosa.
      notifications.filter(n => n.fuente !== 'tramites-propios' && n.fuente !== 'tramites-bandeja').forEach(n => knownIdsRef.current.add(n.id));
      isFirstLoadRef.current = false;
    }

    const e = estadoRef.current;
    const newOnes = notifications.filter(n => !knownIdsRef.current.has(n.id) && !(e && (estaLeida(e, n) || estaOculta(e, n))));
    notifications.forEach(n => knownIdsRef.current.add(n.id));
    if (newOnes.length > 0) {
      newOnes.forEach(n => knownIdsRef.current.add(n.id));
      // Antes las horas de silencio y "Notificaciones de escritorio" se
      // guardaban en Configuración pero nada las leía.
      const callado = !!silencio?.activo && enHorasDeSilencio(silencio.desde, silencio.hasta);
      if (!muted && !callado) {
        playNotificationSound(soundType, soundVolume);
      }
      // Aviso del sistema solo si no estás mirando el portal.
      // Si este navegador ya recibe push, Luna avisa de esas fuentes: no se duplica.
      const paraSistema = pushWebActivo() ? newOnes.filter(n => !FUENTES_CON_PUSH.has(n.fuente ?? n.category)) : newOnes;
      if (escritorio && !callado && paraSistema.length > 0 && (document.hidden || !document.hasFocus())) {
        const n = paraSistema[0];
        const extra = paraSistema.length > 1 ? ` (+${paraSistema.length - 1} más)` : '';
        void notificarSistema(`${n.title}${extra}`, n.preview || 'moon Studios');
      }
    }
  }, [notifications]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listener: Anuncios ────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.announcement) {
      merge([], 'announcement');
      return;
    }

    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    // La primera carga de cada fuente es historia: no suena ni avisa al sistema.
    let primera = true;
    const unsub = onSnapshot(q, snap => {
      if (requestedUidRef.current !== uid) return;
      const items: UnifiedNotification[] = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id:        `ann_${doc.id}`,
          rawId:     doc.id,
          category:  'announcement',
          title:     d.title   ?? 'Anuncio',
          preview:   d.content ?? '',
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || 0),
          important: d.important ?? false,
          linkTo:    '/dashboard/announcements',
        };
      });
      if (primera) { sembrar(items); primera = false; }
      merge(items, 'announcement');
    }, err => console.error('[notif] announcements:', err));
    return unsub;
  }, [uid, enabledCategories.announcement, merge]);

  // ── Listener: Correos ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.email) {
      merge([], 'email');
      return;
    }

    const q = query(
      collection(db, 'correos'),
      where('toUid',   '==', uid),
      where('read',    '==', false),
      where('deleted', '==', false),
      where('draft',   '==', false)
    );
    // La primera carga de cada fuente es historia: no suena ni avisa al sistema.
    let primera = true;
    const unsub = onSnapshot(q, snap => {
      if (requestedUidRef.current !== uid) return;
      const items: UnifiedNotification[] = snap.docs
        // La papelera y el borrado ahora son por persona (Correo.tsx).
        .filter(doc => {
          const d = doc.data();
          return !(d.trashedBy ?? []).includes(uid) && !(d.purgedBy ?? []).includes(uid);
        })
        .map(doc => {
          const d = doc.data();
          return {
            id:        `mail_${doc.id}`,
            rawId:     doc.id,
            category:  'email' as NotifCategory,
            title:     d.subject  ?? '(Sin asunto)',
            preview:   `De: ${d.fromName ?? d.fromEmail ?? 'Desconocido'}`,
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || 0),
            linkTo:    '/dashboard/correo',
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (primera) { sembrar(items); primera = false; }
      merge(items, 'email');
    }, err => console.error('[notif] correos:', err));
    return unsub;
  }, [uid, enabledCategories.email, merge]);

  // ── Listener: Hilos ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.thread) {
      merge([], 'thread');
      return;
    }

    // Antes filtraba por `participants`, un campo que ningún hilo tiene: esta
    // campana nunca sonaba. Los hilos guardan a sus seguidores en
    // `subscribers` (el autor y quien responde). Cada respuesta nueva cambia
    // lastReplyAt, y con eso el id: cuenta como notificación nueva.
    const q = query(
      collection(db, 'hilos'),
      where('subscribers', 'array-contains', uid)
    );
    // La primera carga de cada fuente es historia: no suena ni avisa al sistema.
    let primera = true;
    const unsub = onSnapshot(q, snap => {
      if (requestedUidRef.current !== uid) return;
      const items: UnifiedNotification[] = snap.docs
        .filter(doc => {
          const d = doc.data();
          if (d.deleted || !d.replyCount) return false;
          const ultima = d.lastReplyAt?.toMillis?.() ?? 0;
          let mia = 0;
          try { mia = Number(localStorage.getItem(claveMiRespuesta(uid, doc.id)) || 0); } catch { /* sin storage */ }
          return ultima > mia + 2000;
        })
        .map(doc => {
          const d  = doc.data();
          const ts = d.lastReplyAt?.toDate?.() ?? d.updatedAt?.toDate?.() ?? new Date(0);
          return {
            id:        `hilo_${doc.id}_${ts.getTime()}`,
            rawId:     doc.id,
            category:  'thread' as NotifCategory,
            title:     `Nueva respuesta en "${d.title ?? 'un hilo'}"`,
            preview:   `${d.replyCount} respuesta${d.replyCount === 1 ? '' : 's'}`,
            createdAt: ts,
            linkTo:    '/dashboard/hilos',
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 15);
      if (primera) { sembrar(items); primera = false; }
      merge(items, 'thread');
    }, err => console.error('[notif] hilos:', err));
    return unsub;
  }, [uid, enabledCategories.thread, merge]);

  // ── Listener: colección `notifications` (menciones y tareas) ─────────────
  // Hilos.tsx escribe una por respuesta con los mencionados en `toUids`; el
  // sistema de tareas (lib/tareas.ts) escribe 'task-assigned', 'task-status' y
  // 'task-report'. Solo array-contains (sin orderBy) para no necesitar índice.
  const conMenciones = !!enabledCategories.thread;
  const conTareas    = !!enabledCategories.task;
  const conAnuncios  = !!enabledCategories.announcement;
  useEffect(() => {
    // Siempre se escucha: los avisos de seguridad (inicio de sesión) no se pueden apagar por categoría.
    if (!uid) return;
    const q = query(collection(db, 'notifications'), where('toUids', 'array-contains', uid));
    const ESTADO: Record<string, string> = {
      pending: 'pendiente', 'in-progress': 'en progreso', completed: 'completada', 'not-completed': 'no completada',
    };
    // La primera carga de cada fuente es historia: no suena ni avisa al sistema.
    let primera = true;
    const unsub = onSnapshot(q, snap => {
      if (requestedUidRef.current !== uid) return;
      const menciones: UnifiedNotification[] = [];
      const tareas: UnifiedNotification[] = [];
      const seguridad: UnifiedNotification[] = [];
      const conferencias: UnifiedNotification[] = [];
      for (const doc of snap.docs) {
        const d = doc.data();
        const createdAt = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(0);
        const tipo = String(d.type ?? 'mention');
        if (tipo === 'login-alert') {
          seguridad.push({
            id: `seguridad_${doc.id}`, rawId: doc.id, category: 'security', createdAt,
            title: 'Nuevo inicio de sesión',
            preview: `Desde ${d.dispositivo || 'un dispositivo nuevo'}. ¿No fuiste tú? Cierra esa sesión en Configuración → Seguridad.`,
            linkTo: '/dashboard/settings', important: true,
          });
          continue;
        }
        // Los trámites actuales se derivan de su registro real. Ignoramos las
        // copias históricas para no duplicar avisos ni conservar datos revocados.
        if (tipo.startsWith('tramite')) {
          continue;
        }
        // Moon Studios Conferencias: invitaciones y avisos del organizador.
        if (tipo.startsWith('conferencia')) {
          if (conAnuncios) conferencias.push({
            id: `conf_${doc.id}`, rawId: doc.id, category: 'announcement', fuente: 'conferencias', createdAt,
            title: tipo === 'conferencia-aviso' ? `Aviso: ${d.avisoTitulo || 'novedades del evento'}` : 'Tienes una invitación',
            preview: d.eventoTitulo ? String(d.eventoTitulo) : 'Un evento de Moon Studios',
            linkTo: '/dashboard/conferencias?vista=invitaciones', important: tipo === 'conferencia-invitacion',
          });
          continue;
        }
        if (tipo.startsWith('task')) {
          if (!conTareas || d.authorUid === uid) continue;
          const titulo = d.taskTitle ? `"${d.taskTitle}"` : 'una tarea';
          const estado = ESTADO[String(d.estado ?? '')] ?? '';
          tareas.push({
            id: `tarea_${doc.id}`, rawId: doc.id, category: 'task', fuente: 'aviso-tarea', createdAt,
            title: tipo === 'task-assigned' ? 'Nueva tarea para ti'
              : tipo === 'task-report' ? `${d.authorName || 'Alguien'} reportó una tarea`
              : 'Una tarea cambió de estado',
            preview: tipo === 'task-assigned' ? `${titulo}${d.authorName ? ` · de ${d.authorName}` : ''}`
              : tipo === 'task-report' ? `${titulo}${estado ? ` · ${estado}` : ''}`
              : `${titulo}${estado ? ` ahora está ${estado}` : ''}`,
            linkTo: tipo === 'task-report' ? '/dashboard/tareas?vista=equipo' : '/dashboard/tareas',
            important: tipo === 'task-assigned',
          });
        } else if (conMenciones) {
          menciones.push({
            id: `mencion_${doc.id}`, rawId: doc.id, category: 'thread', fuente: 'mention', createdAt,
            title: `${d.authorName || 'Alguien'} te mencionó`,
            preview: d.hiloTitle ? `En "${d.hiloTitle}"` : 'En un hilo',
            linkTo: '/dashboard/hilos',
          });
        }
      }
      const recientes = (l: UnifiedNotification[]) => l.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20);
      if (primera) { sembrar([...menciones, ...tareas, ...seguridad, ...conferencias]); primera = false; }
      merge(recientes(menciones), 'mention');
      merge(recientes(tareas), 'aviso-tarea');
      merge(recientes(seguridad), 'security');
      merge(recientes(conferencias), 'conferencias');
    }, err => console.error('[notif] notifications:', err));
    // Al desactivar la categoría o cerrar sesión se quitan de la campana.
    return () => { unsub(); merge([], 'mention'); merge([], 'aviso-tarea'); merge([], 'security'); merge([], 'conferencias'); };
  }, [uid, conMenciones, conTareas, conAnuncios, merge]);

  // ── Listener: Mensajería ──────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.message || !puedeVerMensajeria) {
      merge([], 'message');
      return;
    }

    // El panel Mensajería muestra `correos_panel_moonstudios` (formularios de
    // contacto de las webs, campos nombre/mensaje/fecha/leido). Antes esto
    // escuchaba `mensajeria`, que el panel no usa: nunca avisaba.
    const q = query(
      collection(db, 'correos_panel_moonstudios'),
      where('leido', '==', false)
    );
    // La primera carga de cada fuente es historia: no suena ni avisa al sistema.
    let primera = true;
    const unsub = onSnapshot(q, snap => {
      if (requestedUidRef.current !== uid) return;
      const items: UnifiedNotification[] = snap.docs
        .map(doc => {
          const d = doc.data();
          const f = d.fecha?.toDate ? d.fecha.toDate() : new Date(d.fecha || 0);
          return {
            id:        `msg_${doc.id}`,
            rawId:     doc.id,
            category:  'message' as NotifCategory,
            title:     `Mensaje de ${d.nombre ?? 'alguien'}`,
            preview:   String(d.mensaje ?? '').slice(0, 140),
            createdAt: Number.isNaN(f.getTime()) ? new Date(0) : f,
            linkTo:    '/dashboard/mensajeria',
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 15);
      if (primera) { sembrar(items); primera = false; }
      merge(items, 'message');
    }, err => console.error('[notif] mensajeria:', err));
    return unsub;
  }, [uid, enabledCategories.message, puedeVerMensajeria, merge]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  // Lo eliminado no se muestra; lo leído se calcula contra el estado de la cuenta.
  const visibles = useMemo(() => notifications.filter(n =>
    ((!n.fuente?.startsWith('tramites-')) || n.tramitesScope === tramitesScope)
    && (n.fuente !== 'tramites-bandeja' || (enabledCategories.task && revisaTramites))
    && (n.fuente !== 'tramites-propios' || enabledCategories.task)
    && (!estado || !estaOculta(estado, n))), [estado, notifications, enabledCategories.task, revisaTramites, tramitesScope]);
  const readIds = useMemo(() => new Set(estado ? visibles.filter(n => estaLeida(estado, n)).map(n => n.id) : []), [estado, visibles]);
  // Mientras carga el estado no se cuenta nada como nuevo (antes «revivían» al abrir).
  const unreadCount = estado ? visibles.length - readIds.size : 0;

  const markOneRead = useCallback((id: string) => {
    cambiar(e => (e.leidas.includes(id) ? e : { ...e, leidas: [...e.leidas, id] }));
  }, [cambiar]);

  /** Todo lo que existe hasta ahora queda leído, aunque todavía no haya cargado. */
  const markAllRead = useCallback(() => {
    cambiar(e => ({ ...e, leidasHasta: Date.now(), leidas: [] }));
  }, [cambiar]);

  const dismissOne = useCallback((id: string) => {
    cambiar(e => ({ ...e, ocultas: e.ocultas.includes(id) ? e.ocultas : [...e.ocultas, id], leidas: e.leidas.includes(id) ? e.leidas : [...e.leidas, id] }));
  }, [cambiar]);

  const dismissAllRead = useCallback(() => {
    const ids = visibles.filter(n => readIds.has(n.id)).map(n => n.id);
    cambiar(e => ({ ...e, ocultas: [...new Set([...e.ocultas, ...ids])] }));
  }, [cambiar, visibles, readIds]);

  const dismissAll = useCallback(() => {
    const ahora = Date.now();
    cambiar(e => ({ ...e, ocultasHasta: ahora, ocultas: [], leidasHasta: Math.max(e.leidasHasta, ahora), leidas: [] }));
  }, [cambiar]);

  // markPanelSeen se mantiene como no-op — el DashboardLayout
  // llama markAllRead con delay al abrir el panel
  const markPanelSeen = useCallback(() => {}, []);

  // Hide data from the old account during the render before effect cleanup.
  const sameAccount = !!uid && prevUidRef.current === uid;
  return { notifications: sameAccount ? visibles : [], unreadCount: sameAccount ? unreadCount : 0, readIds: sameAccount ? readIds : new Set<string>(), markOneRead, markAllRead, markPanelSeen, dismissOne, dismissAllRead, dismissAll, cargado: sameAccount && !!estado };
}
