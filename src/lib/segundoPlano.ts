// ─── App de escritorio: seguir avisando con la ventana cerrada ───────────────
// Cerrar la ventana la esconde en la bandeja del sistema (junto al reloj): la
// sesión, las escuchas de Firestore y las notificaciones siguen funcionando.
// «Salir por completo» está en el menú de la bandeja. Ambos ajustes son de este
// equipo (localStorage / registro de Windows), no de la cuenta.
import { esEscritorio, notificarSistema } from '@/lib/escritorio';

const CLAVE = 'moon.segundoPlano';
const CLAVE_AVISO = 'moon.segundoPlano.avisado';

export function seguirEnSegundoPlano(): boolean {
  try { return localStorage.getItem(CLAVE) !== '0'; } catch { return true; }
}
export function guardarSegundoPlano(si: boolean) {
  try { localStorage.setItem(CLAVE, si ? '1' : '0'); } catch { /* sin almacenamiento */ }
}

/** Esconde la ventana (o sale, si el ajuste está apagado). */
export async function cerrarVentanaApp(): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  if (!seguirEnSegundoPlano()) {
    const { exit } = await import('@tauri-apps/plugin-process');
    await exit(0);
    return;
  }
  await getCurrentWindow().hide();
  let avisado = false;
  try { avisado = localStorage.getItem(CLAVE_AVISO) === '1'; localStorage.setItem(CLAVE_AVISO, '1'); } catch { /* sin almacenamiento */ }
  if (!avisado) void notificarSistema('moon Studios sigue activo', 'Te seguiremos avisando. Ábrelo desde el ícono junto al reloj; para salir del todo, clic derecho → Salir por completo.');
}

// ─── Abrir al iniciar Windows ────────────────────────────────────────────────
export async function inicioConWindows(): Promise<boolean> {
  if (!esEscritorio()) return false;
  try { const { isEnabled } = await import('@tauri-apps/plugin-autostart'); return await isEnabled(); } catch { return false; }
}
export async function cambiarInicioConWindows(si: boolean): Promise<boolean> {
  const { enable, disable, isEnabled } = await import('@tauri-apps/plugin-autostart');
  if (si) await enable(); else await disable();
  return isEnabled();
}
