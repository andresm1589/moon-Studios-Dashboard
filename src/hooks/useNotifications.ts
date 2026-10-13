// src/hooks/useNotifications.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
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

// ── Storage helpers — CLAVE POR USUARIO para evitar que estados de sesiones
//    anteriores contaminen nuevas sesiones o usuarios distintos ───────────────

function storageKey(uid: string) {
  return `notif_readIds_v3_${uid}`;
}

function loadReadIds(uid: string | undefined): Set<string> {
  if (!uid) return new Set();
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(uid: string | undefined, ids: Set<string>) {
  if (!uid) return;
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify([...ids]));
  } catch {}
}

// Limpia claves de versiones antiguas para no acumular basura
function cleanLegacyKeys() {
  try {
    const legacyPrefixes = ['notif_readIds_v1', 'notif_readIds_v2'];
    Object.keys(localStorage).forEach(k => {
      if (legacyPrefixes.some(p => k.startsWith(p))) {
        localStorage.removeItem(k);
      }
    });
  } catch {}
}

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

  // FIX: readIds empieza vacío — se carga cuando uid está disponible
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const knownIdsRef    = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const prevUidRef     = useRef<string | undefined>(undefined);

  // ── FIX PRINCIPAL: Cargar readIds del usuario correcto cuando uid cambia ──
  // Esto soluciona el bug de "siempre aparece como no leído al iniciar sesión"
  useEffect(() => {
    if (!uid) {
      // Sin sesión: limpiar todo
      setReadIds(new Set());
      setNotifications([]);
      knownIdsRef.current    = new Set();
      isFirstLoadRef.current = true;
      prevUidRef.current     = undefined;
      return;
    }

    // Si cambió el usuario (logout + login con otro), resetear estado
    if (prevUidRef.current && prevUidRef.current !== uid) {
      knownIdsRef.current    = new Set();
      isFirstLoadRef.current = true;
      setNotifications([]);
    }

    prevUidRef.current = uid;

    // Cargar IDs leídos del localStorage para este usuario
    const stored = loadReadIds(uid);
    setReadIds(stored);

    // Limpiar claves obsoletas una sola vez
    cleanLegacyKeys();
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

    const newOnes = notifications.filter(n => !knownIdsRef.current.has(n.id));
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

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  const markOneRead = useCallback((id: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(uid, next);
      return next;
    });
  }, [uid]);

  const markAllRead = useCallback(() => {
    const all = new Set(notifications.map(n => n.id));
    setReadIds(all);
    saveReadIds(uid, all);
  }, [notifications, uid]);

  // markPanelSeen se mantiene como no-op — el DashboardLayout
  // llama markAllRead con delay al abrir el panel
  const markPanelSeen = useCallback(() => {}, []);

  return { notifications, unreadCount, readIds, markOneRead, markAllRead, markPanelSeen };
}