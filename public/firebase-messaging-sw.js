/* Notificaciones push del panel web de moon Studios (Firebase Cloud Messaging).
 * Muestra los avisos aunque la pestaña esté cerrada. La configuración pública de
 * Firebase llega en la URL de registro (src/lib/pushWeb.ts): nada fijo aquí. */
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

const config = JSON.parse(new URL(self.location.href).searchParams.get('config') || '{}');
if (config.apiKey && config.messagingSenderId) {
  firebase.initializeApp(config);
  // Los avisos con «notification» los muestra el SDK solo; el clic abre fcmOptions.link.
  firebase.messaging();
}

self.addEventListener('notificationclick', event => {
  const destino = event.notification?.data?.FCM_MSG?.fcmOptions?.link || event.notification?.data?.link || '/dashboard';
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    for (const c of lista) if (c.url.startsWith(self.location.origin) && 'focus' in c) { c.navigate(destino).catch(() => {}); return c.focus(); }
    return clients.openWindow(destino);
  }));
});
