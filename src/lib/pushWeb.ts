// ─── Push del navegador (solo el panel web) ──────────────────────────────────
// La API de Luna NET (services/push/avisosPush.js) envía cada aviso nuevo
// (tareas, invitaciones, trámites, menciones, alertas de dirección) a los
// navegadores registrados aquí, aunque la pestaña esté cerrada. La app de
// Windows no lo necesita: sigue activa en la bandeja (lib/segundoPlano.ts).
import type { User } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { esEscritorio } from '@/lib/escritorio';

const API = ((import.meta.env.VITE_LUNA_API_URL as string | undefined) || 'https://api.lunanet.nellyx.xyz').replace(/\/$/, '');
const CLAVE = 'moon.push.web';

export const pushWebSoportado = () =>
  !esEscritorio() && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

const leer = () => { try { return localStorage.getItem(CLAVE) ?? ''; } catch { return ''; } };
const guardar = (t: string) => { try { if (t) localStorage.setItem(CLAVE, t); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } };

/** ¿Este navegador ya recibe los avisos por push? (evita duplicar el aviso del sistema). */
export const pushWebActivo = () => pushWebSoportado() && Notification.permission === 'granted' && !!leer();

async function llamar(ruta: 'registrar' | 'quitar' | 'probar', user: User, cuerpo: Record<string, string>) {
  const res = await fetch(`${API}/api/moon/push/${ruta}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null) as { success?: boolean; error?: string; enviados?: number } | null;
  if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
  return json;
}

async function registro() {
  const o = app.options;
  const config = { apiKey: o.apiKey, authDomain: o.authDomain, projectId: o.projectId, storageBucket: o.storageBucket, messagingSenderId: o.messagingSenderId, appId: o.appId };
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?config=${encodeURIComponent(JSON.stringify(config))}`, { scope: '/firebase-cloud-messaging-push-scope' });
}

/** Registra este navegador para la cuenta. Solo si el permiso ya está concedido (no lo pide). */
export async function activarPushWeb(user: User): Promise<boolean> {
  if (!pushWebSoportado() || Notification.permission !== 'granted') return false;
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return false;
    const token = await getToken(getMessaging(app), { serviceWorkerRegistration: await registro() });
    if (!token) return false;
    if (token !== leer()) { await llamar('registrar', user, { token, plataforma: 'web' }); guardar(token); }
    return true;
  } catch (e) {
    console.warn('[push web] no se pudo activar:', e);
    return false;
  }
}

/** Al cerrar sesión, este navegador deja de recibir los avisos de la cuenta. */
export async function desactivarPushWeb(user: User | null): Promise<void> {
  const token = leer();
  if (!token) return;
  guardar('');
  if (user) await llamar('quitar', user, { token }).catch(() => {});
  try { const { getMessaging, deleteToken } = await import('firebase/messaging'); await deleteToken(getMessaging(app)); } catch { /* ya no existía */ }
}

/** Envía un aviso de prueba a todos los dispositivos de la cuenta (este navegador incluido). */
export async function probarPushWeb(user: User): Promise<number> {
  const r = await llamar('probar', user, { canal: 'moon_avisos' });
  return r.enviados ?? 0;
}
