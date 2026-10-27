// La sala (LiveKit) es el paquete más pesado de Conferencias. Se carga aparte y
// se precarga en cuanto se ve un evento con sala virtual, para que «Entrar a la
// sala» abra al instante también en la versión web (en la app ya es local).
export const cargarSala = () => import('./SalaVirtual');

/** Precarga en segundo plano, cuando el navegador queda libre. */
export function precargarSala() {
  const cargar = () => { void cargarSala().catch(() => { /* se reintenta al entrar */ }); };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(cargar, { timeout: 3000 }); else setTimeout(cargar, 1200);
}
