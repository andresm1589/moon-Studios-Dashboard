import type { DocumentData, DocumentReference } from 'firebase/firestore';
import { createSessionRemovalGuard, TabSessionKeys, type SessionKeyStorage } from './sessionIdentity';
import { esRolDelEquipo } from '@/types';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, type User, updatePassword, updateEmail,
  sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider,
} from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc,
  deleteDoc, query, where, orderBy, Timestamp, addDoc, onSnapshot,
  serverTimestamp, limit, writeBatch,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ═══════════════════════════════════════════════════════════════════
// AUTH FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

export const registerUser = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const loginUser = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const logoutUser = async () => {
  // Antes de salir, este navegador deja de recibir los avisos push de la cuenta.
  await import('./pushWeb').then(m => m.desactivarPushWeb(auth.currentUser)).catch(() => {});
  saliendo = true;
  try {
    await endCurrentSession();
    await signOut(auth);
  } finally { saliendo = false; }
};

export const resetUserPassword = (email: string) =>
  sendPasswordResetEmail(auth, email);

export const onAuthChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);

export const updateUserEmail = (email: string) => {
  const user = auth.currentUser;
  if (user) return updateEmail(user, email);
  throw new Error('No user logged in');
};

/**
 * Cambia la contraseña re-autenticando primero al usuario.
 * Lanza error si la contraseña actual es incorrecta.
 */
export const updateUserPassword = async (currentPassword: string, newPassword: string) => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No user logged in');

  // Re-autenticación obligatoria antes de cambiar contraseña
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
};

/**
 * Re-autentica sin cambiar contraseña (para operaciones sensibles).
 */
export const reauthenticateUser = async (currentPassword: string) => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No user logged in');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
};

// ═══════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export const createUserInvitation = async (
  userData: { email: string; displayName: string; role: string },
  createdBy: string,
) => {
  const tempPassword = generateTempPassword();
  await setDoc(doc(db, 'userInvitations', userData.email), {
    ...userData, tempPassword, createdBy,
    createdAt: Timestamp.now(), status: 'pending', used: false,
  });
  return { success: true, tempPassword, message: 'Invitación creada.' };
};

export const verifyUserInvitation = async (email: string, password: string) => {
  const snap = await getDoc(doc(db, 'userInvitations', email));
  if (!snap.exists()) return { valid: false, message: 'No existe invitación para este email' };
  const inv = snap.data();
  if (inv.used)                    return { valid: false, message: 'Invitación ya utilizada' };
  if (inv.status !== 'pending')    return { valid: false, message: 'Invitación no válida o expirada' };
  if (inv.tempPassword !== password) return { valid: false, message: 'Contraseña temporal incorrecta' };
  return { valid: true, invitation: { email: inv.email, displayName: inv.displayName, role: inv.role } };
};

export const completeUserRegistration = async (email: string, uid: string) => {
  const ref  = doc(db, 'userInvitations', email);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Invitación no encontrada');
  const inv = snap.data();
  await updateDoc(ref, { used: true, status: 'completed', completedAt: Timestamp.now(), userId: uid });
  await setDoc(doc(db, 'users', uid), {
    uid, email: inv.email, displayName: inv.displayName, role: inv.role,
    createdAt: Timestamp.now(), createdBy: inv.createdBy, isFirstLogin: true,
  });
  return { success: true };
};

export const deleteUserData     = async (uid: string) => { await deleteDoc(doc(db, 'users', uid)); return { success: true }; };
export const deleteUserProfile  = async (uid: string) => deleteDoc(doc(db, 'users', uid));

// ═══════════════════════════════════════════════════════════════════
// USER PROFILE
// ═══════════════════════════════════════════════════════════════════

export const createUserProfile = async (uid: string, data: any) => {
  await setDoc(doc(db, 'users', uid), {
    ...data, createdAt: Timestamp.now(),
    settings: { theme: 'dark', sidebarCollapsed: false, notifications: true, language: 'es' },
  });
};

export const getUserProfile  = async (uid: string) => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
};

export const updateUserProfile = async (uid: string, data: any) =>
  updateDoc(doc(db, 'users', uid), data);

/** Directorio del equipo (sin cuentas de clientes, ver esRolDelEquipo). */
export const getAllUsers = async () => {
  const q    = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.filter(d => esRolDelEquipo(d.data().role)).map(d => ({ uid: d.id, ...d.data() }));
};

// ═══════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════

export const updateUserSettings = async (uid: string, settings: any) =>
  updateDoc(doc(db, 'users', uid), { settings });

export const getUserSettings = async (uid: string) => {
  const profile = await getUserProfile(uid);
  return profile?.settings || { theme: 'dark', sidebarCollapsed: false, notifications: true, language: 'es' };
};

// ═══════════════════════════════════════════════════════════════════
// SESSIONS  (guardadas en Firestore, colección userSessions)
// ═══════════════════════════════════════════════════════════════════

export interface SessionRecord {
  id:         string;
  uid:        string;
  app:        AppSesion;
  nombre:     string;
  device:     string;
  browser:    string;
  os:         string;
  ip:         string;
  location:   string;
  createdAt:  Date;
  lastActive: Date;
  current:    boolean;
  sessionKey: string; // clave única por pestaña/dispositivo
}

/** Detecta OS y navegador desde el userAgent */
export const parseUserAgent = (): { device: string; browser: string; os: string } => {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);

  let browser = 'Navegador desconocido';
  if (/Edg\//i.test(ua))       browser = `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] ?? ''}`;
  else if (/Chrome\//i.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1]?.split('.')[0] ?? ''}`;
  else if (/Firefox\//i.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1]?.split('.')[0] ?? ''}`;
  else if (/Safari\//i.test(ua)) browser = `Safari ${ua.match(/Version\/([\d.]+)/)?.[1]?.split('.')[0] ?? ''}`;

  let os = 'SO desconocido';
  if (/Windows NT/i.test(ua))     os = 'Windows';
  else if (/Mac OS X/i.test(ua))  os = 'macOS';
  else if (/Android/i.test(ua))   os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua))     os = 'Linux';

  return { device: isMobile ? 'Dispositivo móvil' : 'Computadora', browser, os };
};

/** La sesión es del DISPOSITIVO (localStorage), no de cada pestaña: abrir otra
 * pestaña o volver a abrir la app reutiliza el mismo registro en vez de crear
 * uno nuevo. La clave por pestaña de versiones anteriores se adopta una vez. */
const almacenSesion = (): SessionKeyStorage => ({
  getItem: clave => {
    const guardada = localStorage.getItem(clave);
    if (guardada) return guardada;
    const anterior = sessionStorage.getItem(clave);
    if (anterior) localStorage.setItem(clave, anterior);
    return anterior;
  },
  setItem: (clave, valor) => localStorage.setItem(clave, valor),
});
const tabSessionKeys = new TabSessionKeys(almacenSesion, () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`);

/** Web, app de escritorio (Tauri) o app Android: la app Android escribe 'android' con el mismo formato. */
export type AppSesion = 'web' | 'escritorio' | 'android';
const esEscritorio = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const describirDispositivo = () => {
  const { device, browser, os } = parseUserAgent();
  const app: AppSesion = esEscritorio() ? 'escritorio' : 'web';
  const nombre = app === 'escritorio' ? `Moon Studios para ${os}` : `${browser.replace(/\s[\d.]+$/, '')} en ${os}`;
  return { app, nombre, device, browser, os };
};
// Un registro sin uso en 30 días se borra solo; los de la versión por pestaña
// (sin campo `app`) se limpian a los 2 días, porque cada pestaña creaba uno.
const DIA = 24 * 60 * 60 * 1000;
const caducada = (data: { app?: unknown; lastActive?: Timestamp }, ahora: number) => {
  const ultima = data.lastActive?.toMillis?.() ?? 0;
  return ahora - ultima > (data.app ? 30 : 2) * DIA;
};
let saliendo = false;
let ultimoToque = 0;
const sessionRegistrations = new Map<string, Promise<string>>();
const registeredSessionRefs = new Map<string, { key: string; ref: DocumentReference }>();
const requireSessionOwner = (uid: string) => {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('La cuenta cambió. Vuelve a cargar tus registros de acceso.');
};

/** Records this tab for the current account; this document is not an auth token. */
export const registerSession = (uid: string): Promise<string> => {
  try { requireSessionOwner(uid); } catch (error) { return Promise.reject(error); }
  const existing = sessionRegistrations.get(uid);
  if (existing) return existing;
  const job = (async () => {
    const sessionKey = tabSessionKeys.ensure(uid);
    const { app, nombre, device, browser, os } = describirDispositivo();
    // Both the owner and device key must match. A former account's document can
    // never be reused, including when a browser still holds the old global key.
    const snap = await getDocs(query(collection(db, 'userSessions'), where('uid', '==', uid), where('sessionKey', '==', sessionKey)));
    requireSessionOwner(uid);
    const propios = snap.docs.filter(record => record.data().uid === uid && record.data().sessionKey === sessionKey);
    let ref: DocumentReference;
    if (propios.length) {
      // Si dos pestañas lo crearon a la vez, queda uno solo.
      const [previous, ...repetidos] = propios.sort((a, b) => (b.data().lastActive?.toMillis?.() ?? 0) - (a.data().lastActive?.toMillis?.() ?? 0));
      await updateDoc(previous.ref, { lastActive: Timestamp.now(), app, nombre, device, browser, os });
      repetidos.forEach(r => void deleteDoc(r.ref).catch(() => {}));
      ref = previous.ref;
    } else {
      ref = await addDoc(collection(db, 'userSessions'), {
        uid, app, nombre, device, browser, os, ip: 'Obteniendo...', location: '',
        createdAt: Timestamp.now(), lastActive: Timestamp.now(), sessionKey,
      });
      // Non-blocking, optional device information must not follow an account switch.
      void revisarDispositivo(uid, nombre).catch(console.error);
    }
    requireSessionOwner(uid);
    registeredSessionRefs.set(uid, { key: sessionKey, ref });
    ultimoToque = Date.now();
    void fetch('https://api.ipify.org?format=json').then(response => response.json()).then(async ({ ip }) => {
      if (auth.currentUser?.uid !== uid || tabSessionKeys.read(uid) !== sessionKey || typeof ip !== 'string' || !ip.trim()) return;
      // Keep the exact registered reference. No second key-only query can
      // accidentally update a document belonging to another account.
      await updateDoc(ref, { ip });
    }).catch(() => { /* Optional IP information does not affect access. */ });
    return sessionKey;
  })();
  sessionRegistrations.set(uid, job);
  const release = () => { if (sessionRegistrations.get(uid) === job) sessionRegistrations.delete(uid); };
  void job.then(release, release);
  return job;
};

/** Watches only a record whose creation/update was acknowledged by the server.
 * Updated clients cooperate by signing out after its confirmed deletion. This
 * does not revoke Firebase tokens and cannot close older/offline applications.
 */
export const subscribeCurrentSession = (uid: string, onRemoved: () => void): (() => void) => {
  requireSessionOwner(uid);
  const session = registeredSessionRefs.get(uid);
  if (!session || session.key !== tabSessionKeys.read(uid)) return () => {};
  const receive = createSessionRemovalGuard(uid, () => auth.currentUser?.uid ?? null, onRemoved, true);
  // A deleted document has no owner field for document-level read rules. Use
  // the owner-scoped query (whose empty result remains readable) and still
  // require the exact registered document ID to be present.
  const tracked = query(collection(db, 'userSessions'), where('uid', '==', uid), where('sessionKey', '==', session.key));
  return onSnapshot(tracked, { includeMetadataChanges: true }, snapshot => {
    if (saliendo) return; // Al cerrar sesión aquí mismo se borra el registro: no es un cierre remoto.
    receive({ exists: snapshot.docs.some(record => record.id === session.ref.id), fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites });
  }, () => { /* A connectivity or permission error must never be mistaken for revocation. */ });
};

/** Marca el dispositivo como usado ahora (como mucho cada 10 minutos). */
export const touchSession = async (uid: string) => {
  const session = registeredSessionRefs.get(uid);
  if (!session || auth.currentUser?.uid !== uid || Date.now() - ultimoToque < 10 * 60 * 1000) return;
  ultimoToque = Date.now();
  await updateDoc(session.ref, { lastActive: Timestamp.now() }).catch(() => { /* Sin conexión: se intenta en la próxima visita. */ });
};

/** Al cerrar sesión aquí, este dispositivo sale de la lista de la cuenta. */
const endCurrentSession = async () => {
  const uid = auth.currentUser?.uid;
  const session = uid ? registeredSessionRefs.get(uid) : undefined;
  if (!uid || !session) return;
  registeredSessionRefs.delete(uid);
  await deleteDoc(session.ref).catch(() => { /* Sin conexión: el registro caduca solo. */ });
};

/**
 * Cada navegador o app guarda un id propio (localStorage). La cuenta recuerda
 * sus dispositivos en users/{uid}.dispositivos; uno que no está ahí es nuevo.
 * El primero de todos no avisa (no hay contra qué comparar).
 */
async function revisarDispositivo(uid: string, nombre: string) {
  requireSessionOwner(uid);
  let id = localStorage.getItem('dispositivo-id');
  if (!id) { id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('dispositivo-id', id); }
  const ref = doc(db, 'users', uid);
  const datos = (await getDoc(ref)).data() ?? {};
  requireSessionOwner(uid);
  const conocidos: { id: string; nombre: string; visto: Timestamp }[] = Array.isArray(datos.dispositivos) ? datos.dispositivos : [];
  if (conocidos.some(d => d.id === id)) return;
  if (conocidos.length && datos.settings?.loginAlerts !== false) {
    await addDoc(collection(db, 'notifications'), {
      type: 'login-alert', toUids: [uid], authorUid: 'sistema', dispositivo: nombre,
      createdAt: Timestamp.now(), read: false,
    });
  }
  requireSessionOwner(uid);
  await updateDoc(ref, { dispositivos: [...conocidos, { id, nombre, visto: Timestamp.now() }].slice(-15) });
}

/** Lists access records; presence in this list does not prove a live auth token. */
export const getUserSessions = async (uid: string): Promise<SessionRecord[]> => {
  requireSessionOwner(uid);
  const currentKey = tabSessionKeys.read(uid);
  const q    = query(
    collection(db, 'userSessions'),
    where('uid', '==', uid),
    orderBy('lastActive', 'desc'),
  );
  const snap = await getDocs(q);
  requireSessionOwner(uid);
  // Los registros abandonados se borran aquí, sin tocar el de este dispositivo.
  const ahora = Date.now();
  const vigentes = snap.docs.filter(d => {
    if (d.data().sessionKey === currentKey || !caducada(d.data(), ahora)) return true;
    void deleteDoc(d.ref).catch(() => {});
    return false;
  });
  return vigentes.map(d => ({
    id:         d.id,
    uid:        d.data().uid,
    app:        (['web', 'escritorio', 'android'].includes(d.data().app) ? d.data().app : 'web') as AppSesion,
    nombre:     typeof d.data().nombre === 'string' && d.data().nombre ? d.data().nombre : `${String(d.data().browser ?? '').replace(/\s[\d.]+$/, '')} en ${d.data().os ?? ''}`,
    device:     d.data().device,
    browser:    d.data().browser,
    os:         d.data().os,
    ip:         d.data().ip,
    location:   d.data().location ?? '',
    createdAt:  d.data().createdAt?.toDate(),
    lastActive: d.data().lastActive?.toDate(),
    current:    currentKey !== null && d.data().uid === uid && d.data().sessionKey === currentKey,
    sessionKey: d.data().sessionKey,
  }));
};

/** Requests coordinated closure by deleting the record; Firebase tokens are not revoked. */
export const revokeSession = async (sessionId: string) =>
  deleteDoc(doc(db, 'userSessions', sessionId));

/** Updated clients observe these deletions and sign out; older clients do not. */
export const revokeAllOtherSessions = async (uid: string) => {
  requireSessionOwner(uid);
  const currentKey = tabSessionKeys.read(uid);
  const q    = query(collection(db, 'userSessions'), where('uid', '==', uid));
  const snap = await getDocs(q);
  requireSessionOwner(uid);
  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    if (d.data().sessionKey !== currentKey) batch.delete(d.ref);
  });
  await batch.commit();
};

// ═══════════════════════════════════════════════════════════════════
// USER ACTIVITY LOG  (colección userActivityLogs)
// ═══════════════════════════════════════════════════════════════════

export type ActivityType =
  | 'login'
  | 'logout'
  | 'password_changed'
  | 'avatar_changed'
  | 'profile_updated'
  | 'settings_changed'
  | '2fa_enabled'
  | '2fa_disabled'
  | 'session_revoked';

export interface UserActivityRecord {
  id:        string;
  uid:       string;
  type:      ActivityType;
  label:     string;
  createdAt: Date;
  meta?:     Record<string, any>;
}

export const logUserActivity = async (
  uid:   string,
  type:  ActivityType,
  label: string,
  meta?: Record<string, any>,
) => {
  await addDoc(collection(db, 'userActivityLogs'), {
    uid, type, label, meta: meta ?? {},
    createdAt: Timestamp.now(),
  });
};

export const getUserActivityLogs = async (
  uid:      string,
  maxItems: number = 20,
): Promise<UserActivityRecord[]> => {
  const q    = query(
    collection(db, 'userActivityLogs'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id:        d.id,
    uid:       d.data().uid,
    type:      d.data().type,
    label:     d.data().label,
    createdAt: d.data().createdAt?.toDate(),
    meta:      d.data().meta,
  }));
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT USER DATA
// ═══════════════════════════════════════════════════════════════════

/** Exporta todos los datos del usuario como JSON y descarga el archivo */
export const exportUserData = async (uid: string) => {
  const [profile, settings, activityLogs] = await Promise.all([
    getUserProfile(uid),
    getUserSettings(uid),
    getUserActivityLogs(uid, 100),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    profile,
    settings,
    activityLogs,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mis-datos-${uid.slice(0, 8)}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// ═══════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════

export const createTask = async (taskData: any) =>
  addDoc(collection(db, 'tasks'), { ...taskData, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });

export const getTasks = async () => {
  const snap = await getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getTasksByUser = async (userId: string) => {
  const snap = await getDocs(query(
    collection(db, 'tasks'),
    where('assignedTo', '==', userId),
    orderBy('createdAt', 'desc'),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const updateTask = async (taskId: string, data: any) =>
  updateDoc(doc(db, 'tasks', taskId), { ...data, updatedAt: Timestamp.now() });

export const deleteTask = async (taskId: string) =>
  deleteDoc(doc(db, 'tasks', taskId));

export const subscribeToTasks = (callback: (tasks: any[]) => void, onError?: (e: Error) => void) => {
  const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => onError?.(e));
};

// Usuarios en vivo. Sin orderBy en la consulta: Firestore deja fuera a los
// documentos que no tienen el campo ordenado (usuarios viejos sin createdAt
// desaparecían de la lista). Se ordena acá, los más nuevos primero.
// Solo el equipo: las cuentas de clientes (rol `client`) son otro sistema.
export const subscribeToUsers = (callback: (users: DocumentData[]) => void, onError?: (e: Error) => void) =>
  onSnapshot(collection(db, 'users'), snap => {
    const lista = snap.docs.filter(d => esRolDelEquipo(d.data().role)).map(d => ({ uid: d.id, ...d.data() })) as { uid: string; createdAt?: { toMillis?: () => number } }[];
    lista.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    callback(lista);
  }, e => onError?.(e));

export const getTasksRealtime = subscribeToTasks;

// ═══════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════

export const createAnnouncement = async (data: any) =>
  addDoc(collection(db, 'announcements'), { ...data, createdAt: Timestamp.now() });

export const getAnnouncements = async () => {
  const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const subscribeToAnnouncements = (callback: (items: DocumentData[]) => void, onError?: (e: Error) => void) =>
  onSnapshot(query(collection(db, 'announcements'), orderBy('createdAt', 'desc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => onError?.(e));

export const updateAnnouncement = async (id: string, data: any) =>
  updateDoc(doc(db, 'announcements', id), data);

export const deleteAnnouncement = async (id: string) =>
  deleteDoc(doc(db, 'announcements', id));

// ═══════════════════════════════════════════════════════════════════
// DISCORD BOT
// ═══════════════════════════════════════════════════════════════════

export const getDiscordConfig = async () => {
  const snap = await getDoc(doc(db, 'discord', 'config'));
  return snap.exists() ? snap.data() : null;
};
export const updateDiscordConfig = async (data: any) =>
  setDoc(doc(db, 'discord', 'config'), { ...data, updatedAt: Timestamp.now() }, { merge: true });

export const getDiscordData = async () => {
  const snap = await getDoc(doc(db, 'discord', 'botData'));
  return snap.exists() ? snap.data() : null;
};
export const updateDiscordData = async (data: any) =>
  setDoc(doc(db, 'discord', 'botData'), { ...data, updatedAt: Timestamp.now() }, { merge: true });

// ═══════════════════════════════════════════════════════════════════
// ACTIVITY LOG (global del sistema, mantener compatibilidad)
// ═══════════════════════════════════════════════════════════════════

// Todo el registro de actividad va a `activityLogs` con el mismo formato, para
// que lo lean igual el Inicio (description + createdAt), el Panel Admin
// (message, level, module) y Secretaría (module). Antes cada uno usaba otra
// colección u otros campos: lo del Panel CEO no aparecía en el Inicio (no
// tenía createdAt), Panel Admin leía `system_logs` (que nadie escribía) y
// Secretaría escribía en `activity_log`, que las reglas de Firestore rechazan.
// Las reglas: cualquiera con sesión puede crear; solo CEO y Administración leen.
const MODULO_ACCION: Record<string, string> = {
  USER_CREATED: 'users', USER_DELETED: 'users', ROLE_CHANGED: 'users',
  TASK_CREATED: 'admin', TASK_DELETED: 'admin', TASK_UPDATED: 'admin',
  REPORT_DELETED: 'admin', BANNERS_CONFIG_SAVED: 'admin',
  MESSAGE_SENT: 'discord', MAINTENANCE_ACTIVATED: 'discord', MAINTENANCE_DEACTIVATED: 'discord',
};
type Detalle = Record<string, unknown> | undefined;
const TEXTO_ACCION: Record<string, (d: Detalle) => string> = {
  USER_CREATED:            d => `Creó la cuenta de ${d?.displayName || d?.email || 'un usuario'}${d?.role ? ` (${d.role})` : ''}`,
  USER_DELETED:            d => `Eliminó la cuenta de ${d?.userName || 'un usuario'}`,
  ROLE_CHANGED:            d => `Cambió un rol a ${d?.newRole ?? '—'}`,
  TASK_CREATED:            d => `Creó la tarea "${d?.title ?? ''}"`,
  TASK_DELETED:            d => `Eliminó la tarea "${d?.title ?? ''}"`,
  TASK_UPDATED:            d => `Editó la tarea "${d?.title ?? ''}"`,
  REPORT_DELETED:          () => 'Eliminó un reporte de tarea',
  BANNERS_CONFIG_SAVED:    () => 'Actualizó los banners del inicio',
  MESSAGE_SENT:            () => 'Envió un mensaje con el bot de Discord',
  MAINTENANCE_ACTIVATED:   d => `Activó el mantenimiento del bot${d?.reason ? `: ${d.reason}` : ''}`,
  MAINTENANCE_DEACTIVATED: () => 'Desactivó el mantenimiento del bot',
};

export const logActivity = async (
  action: string, details: any, userId: string, userName: string,
  extra: { module?: string; description?: string; level?: 'info' | 'warning' | 'error' | 'success' } = {},
) => {
  const description = extra.description ?? TEXTO_ACCION[action]?.(details) ?? action;
  const ahora = Timestamp.now();
  return addDoc(collection(db, 'activityLogs'), {
    action, details: details ?? {}, userId, userName,
    description, message: description,
    module: extra.module ?? MODULO_ACCION[action] ?? 'system',
    level: extra.level ?? 'info',
    timestamp: ahora, createdAt: ahora,
  });
};

export const getActivityLogs = async (maxItems = 50) => {
  const snap = await getDocs(query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(maxItems)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════

export const createNotification = async (data: any) =>
  addDoc(collection(db, 'notifications'), { ...data, createdAt: Timestamp.now(), read: false });

export const getNotifications = async (userId: string) => {
  const snap = await getDocs(query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const markNotificationAsRead   = async (id: string) => updateDoc(doc(db, 'notifications', id), { read: true });
export const deleteNotification       = async (id: string) => deleteDoc(doc(db, 'notifications', id));

export const getUnreadNotificationsCount = async (userId: string) => {
  const snap = await getDocs(query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false),
  ));
  return snap.size;
};

export { Timestamp };

// ═══════════════════════════════════════════════════════════════════
// CREATE USER WITH ROLE (sin cerrar sesión del CEO)
// ═══════════════════════════════════════════════════════════════════

export const createUserWithRole = async (
  email: string, password: string, displayName: string, role: string,
): Promise<{ uid: string }> => {
  const operator = auth.currentUser;
  if (!operator) throw new Error('Inicia sesión para crear usuarios.');
  const profile = await getUserProfile(operator.uid);
  if (profile?.role !== 'CEO' && !(profile?.role === 'Administración' && role === 'Empleado')) {
    throw new Error('Tu rol no permite crear esta cuenta.');
  }
  const secondaryApp  = getApps().find(a => a.name === 'Secondary') || initializeApp(firebaseConfig, 'Secondary');
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = credential.user.uid;
    // Assign staff roles through the operator's session; a public account can only create a baseline profile.
    await setDoc(doc(db, 'users', uid), {
      uid, email, displayName, role,
      createdAt: serverTimestamp(), isActive: true,
    });
    return { uid };
  } finally { await secondaryAuth.signOut(); }
};

// ═══════════════════════════════════════════════════════════════════
// TASK REPORTS
// ═══════════════════════════════════════════════════════════════════

export const getTaskReports = async () => {
  const snap = await getDocs(query(collection(db, 'taskReports'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const deleteTaskReport = async (id: string) => deleteDoc(doc(db, 'taskReports', id));
