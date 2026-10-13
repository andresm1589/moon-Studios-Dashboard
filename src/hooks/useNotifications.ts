// src/hooks/useNotifications.ts

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc as docRef, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { playNotificationSound } from '@/lib/notificationSound';
import { notificarSistema, enHorasDeSilencio } from '@/lib/escritorio';
import type { SoundType } from '@/lib/notificationSound';

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
}

interface UseNotificationsOptions {
  uid:               string | undefined;
  /** Mensajes de contacto de las webs: las reglas solo dejan leerlos a CEO y Administración. */
  puedeVerMensajeria?: boolean;
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
  escritorio = false,
  silencio,
  soundType,
  soundVolume,
  muted,
  enabledCategories,
}: UseNotificationsOptions) {

  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);

  const [estado, setEstado] = useState<EstadoNotif | null>(null);
  const estadoRef = useRef<EstadoNotif | null>(null);

  const knownIdsRef    = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const prevUidRef     = useRef<string | undefined>(undefined);

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
    if (prevUidRef.current && prevUidRef.current !== uid) {
      knownIdsRef.current    = new Set();
      isFirstLoadRef.current = true;
      setNotifications([]);
    }
    prevUidRef.current = uid;

    const local = leerCache(uid);
    if (local) { estadoRef.current = local; setEstado(local); }
    return onSnapshot(docRef(db, 'users', uid), snap => {
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
      console.error('[notif] estado:', err);
      if (!estadoRef.current) { const e = estadoInicial(uid); estadoRef.current = e; setEstado(e); }
    });
  }, [uid]);

  /** Cambia el estado y lo guarda en la cuenta (y en la copia local). */
  const cambiar = useCallback((f: (e: EstadoNotif) => EstadoNotif) => {
    if (!uid) return;
    const nuevo = recortar(f(estadoRef.current ?? estadoInicial(uid)));
    estadoRef.current = nuevo; setEstado(nuevo);
    try { localStorage.setItem(claveCache(uid), JSON.stringify(nuevo)); } catch { /* sin espacio */ }
    updateDoc(docRef(db, 'users', uid), { notifEstado: nuevo }).catch(err => console.error('[notif] guardar estado:', err));
  }, [uid]);

  // ── Merge helper ──────────────────────────────────────────────────────────
  const merge = useCallback((incoming: UnifiedNotification[], category: NotifCategory | 'mention' | 'aviso-tarea') => {
    setNotifications(prev => {
      const rest     = prev.filter(n => (n.fuente ?? n.category) !== category);
      const combined = [...rest, ...incoming];
      combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return combined.slice(0, 50);
    });
  }, []);

  // ── Sonido: solo para notificaciones genuinamente nuevas ──────────────────
  useEffect(() => {
    if (notifications.length === 0) return;

    if (isFirstLoadRef.current) {
      // Primera carga post-login: registrar todos sin sonar
      notifications.forEach(n => knownIdsRef.current.add(n.id));
      isFirstLoadRef.current = false;
      return;
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
      if (escritorio && !callado && (document.hidden || !document.hasFocus())) {
        const n = newOnes[0];
        const extra = newOnes.length > 1 ? ` (+${newOnes.length - 1} más)` : '';
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
    const unsub = onSnapshot(q, snap => {
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
    const unsub = onSnapshot(q, snap => {
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
    const unsub = onSnapshot(q, snap => {
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
  useEffect(() => {
    // Siempre se escucha: los avisos de seguridad (inicio de sesión) no se pueden apagar por categoría.
    if (!uid) return;
    const q = query(collection(db, 'notifications'), where('toUids', 'array-contains', uid));
    const ESTADO: Record<string, string> = {
      pending: 'pendiente', 'in-progress': 'en progreso', completed: 'completada', 'not-completed': 'no completada',
    };
    const unsub = onSnapshot(q, snap => {
      const menciones: UnifiedNotification[] = [];
      const tareas: UnifiedNotification[] = [];
      const seguridad: UnifiedNotification[] = [];
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
      merge(recientes(menciones), 'mention');
      merge(recientes(tareas), 'aviso-tarea');
      merge(recientes(seguridad), 'security');
    }, err => console.error('[notif] notifications:', err));
    // Al desactivar la categoría o cerrar sesión se quitan de la campana.
    return () => { unsub(); merge([], 'mention'); merge([], 'aviso-tarea'); merge([], 'security'); };
  }, [uid, conMenciones, conTareas, merge]);

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
    const unsub = onSnapshot(q, snap => {
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
      merge(items, 'message');
    }, err => console.error('[notif] mensajeria:', err));
    return unsub;
  }, [uid, enabledCategories.message, puedeVerMensajeria, merge]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  // Lo eliminado no se muestra; lo leído se calcula contra el estado de la cuenta.
  const visibles = useMemo(() => (estado ? notifications.filter(n => !estaOculta(estado, n)) : notifications), [estado, notifications]);
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

  return { notifications: visibles, unreadCount, readIds, markOneRead, markAllRead, markPanelSeen, dismissOne, dismissAllRead, dismissAll, cargado: !!estado };
}