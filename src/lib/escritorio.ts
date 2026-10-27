// ─── App de escritorio (Tauri) y web: lo que cambia entre una y otra ─────────
// El portal corre igual en moon-studios-dashboard.netlify.app y dentro de la
// app de escritorio. En la app, algunas cosas del navegador no sirven:
//   · window.location.origin es http://tauri.localhost (un link compartido
//     desde la app no abre en ningún otro lado),
//   · un <a target="_blank"> abría la página dentro de la ventana de la app,
//   · no había notificaciones del sistema.
// Estas funciones hacen lo correcto en cada caso.

import { isTauri } from '@tauri-apps/api/core';
import { regionActual } from '@/lib/ajustes/fecha';
import { crearSolicitudPermiso, estaEnHorasDeSilencio } from '@/lib/ajustes/notificaciones';

/** Dirección pública del portal web (para links que se comparten). */
export const URL_PUBLICA = 'https://moon-studios-dashboard.netlify.app';

export const esEscritorio = (): boolean => {
  try { return isTauri(); } catch { return false; }
};

/** URL absoluta que funciona fuera de la app: en escritorio usa la web pública. */
export const urlPublica = (ruta: string): string =>
  `${esEscritorio() ? URL_PUBLICA : window.location.origin}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;

/** Abre un enlace externo: en escritorio, en el navegador del sistema. */
export async function abrirExterno(url: string): Promise<void> {
  if (esEscritorio()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch (e) {
      console.error('No se pudo abrir en el navegador del sistema:', e);
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function permisoNotificaciones(): Promise<boolean> {
  if (esEscritorio()) {
    const n = await import('@tauri-apps/plugin-notification');
    if (await n.isPermissionGranted()) return true;
    return (await n.requestPermission()) === 'granted';
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Deduplica solicitudes simultáneas y reconsulta cambios de permiso posteriores. */
export const pedirPermisoNotificaciones = crearSolicitudPermiso(permisoNotificaciones);

/** Notificación del sistema (Windows en la app, el navegador en la web). */
export async function notificarSistema(titulo: string, cuerpo: string): Promise<void> {
  try {
    // En la web el permiso se pide con un clic (Configuración → Notificaciones):
    // pedirlo en segundo plano lo bloquean los navegadores y no mostraba nada.
    if (!esEscritorio()) { if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return; }
    else if (!(await pedirPermisoNotificaciones())) return;
    if (esEscritorio()) {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({ title: titulo, body: cuerpo });
    } else {
      new Notification(titulo, { body: cuerpo, icon: '/favicon.ico' });
    }
  } catch (e) {
    console.error('No se pudo mostrar la notificación:', e);
  }
}

/** ¿Estamos dentro de las horas de silencio? ('HH:mm', puede cruzar medianoche) */
export function enHorasDeSilencio(desde?: string, hasta?: string, ahora = new Date()): boolean {
  return estaEnHorasDeSilencio(desde, hasta, ahora, regionActual().zona);
}

/**
 * En escritorio, los clics en enlaces externos (target="_blank", http(s) de
 * otro dominio o mailto:) se abren en el navegador / correo del sistema.
 * Devuelve la función para dejar de escuchar.
 */
export function interceptarEnlacesExternos(): () => void {
  if (!esEscritorio()) return () => {};
  const alClic = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = (e.target as HTMLElement | null)?.closest?.('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    let url: URL;
    try { url = new URL(href, window.location.href); } catch { return; }
    const externo = url.protocol === 'mailto:' || url.protocol === 'tel:' ||
      ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== window.location.origin);
    // Los adjuntos con "download" se dejan al WebView (los descarga él).
    if (!externo || a.hasAttribute('download')) return;
    e.preventDefault();
    void abrirExterno(url.href);
  };
  document.addEventListener('click', alClic, true);
  return () => document.removeEventListener('click', alClic, true);
}
