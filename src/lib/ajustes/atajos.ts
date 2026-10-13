// ─── Atajos de teclado ───────────────────────────────────────────────────────
// La MISMA lista la usan DashboardLayout (que los ejecuta) y Configuración →
// Atajos (que los muestra): antes se mostraban nueve y solo Esc funcionaba.
// Ctrl en Windows/Linux, ⌘ en Mac.

export type AccionAtajo =
  | { tipo: 'ir'; ruta: string }
  | { tipo: 'barra' }
  | { tipo: 'tema' };

export interface Atajo { teclas: string[]; descripcion: string; categoria: 'Navegación' | 'Interfaz' | 'General'; tecla: string; shift?: boolean; accion?: AccionAtajo }

export const ATAJOS: Atajo[] = [
  { categoria: 'Navegación', descripcion: 'Ir al inicio',        tecla: '1', teclas: ['Ctrl', '1'], accion: { tipo: 'ir', ruta: '/dashboard' } },
  { categoria: 'Navegación', descripcion: 'Ir a Mensajería',     tecla: '2', teclas: ['Ctrl', '2'], accion: { tipo: 'ir', ruta: '/dashboard/mensajeria' } },
  { categoria: 'Navegación', descripcion: 'Ir al Correo',        tecla: '3', teclas: ['Ctrl', '3'], accion: { tipo: 'ir', ruta: '/dashboard/correo' } },
  { categoria: 'Navegación', descripcion: 'Ir al Calendario',    tecla: '4', teclas: ['Ctrl', '4'], accion: { tipo: 'ir', ruta: '/dashboard/calendar' } },
  { categoria: 'Navegación', descripcion: 'Ir a Mis tareas',     tecla: '5', teclas: ['Ctrl', '5'], accion: { tipo: 'ir', ruta: '/dashboard/tareas' } },
  { categoria: 'Navegación', descripcion: 'Ir a Hilos',          tecla: '6', teclas: ['Ctrl', '6'], accion: { tipo: 'ir', ruta: '/dashboard/hilos' } },
  { categoria: 'Navegación', descripcion: 'Ir a Configuración',  tecla: ',', teclas: ['Ctrl', ','], accion: { tipo: 'ir', ruta: '/dashboard/settings' } },
  { categoria: 'Interfaz',   descripcion: 'Contraer o expandir el menú lateral', tecla: '\\', teclas: ['Ctrl', '\\'], accion: { tipo: 'barra' } },
  { categoria: 'Interfaz',   descripcion: 'Cambiar entre tema claro y oscuro',   tecla: 'l', shift: true, teclas: ['Ctrl', 'Shift', 'L'], accion: { tipo: 'tema' } },
  { categoria: 'General',    descripcion: 'Cerrar el panel o la ventana abierta', tecla: 'Escape', teclas: ['Esc'] },
  { categoria: 'General',    descripcion: 'Deshacer en un campo de texto',        tecla: 'z', teclas: ['Ctrl', 'Z'] },
  { categoria: 'General',    descripcion: 'Rehacer en un campo de texto',         tecla: 'y', teclas: ['Ctrl', 'Y'] },
];

export const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** El atajo (con acción) que corresponde a una tecla pulsada, si hay uno. */
export function atajoDe(e: KeyboardEvent): Atajo | null {
  const mod = esMac ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey) return null;
  const k = e.key.toLowerCase();
  return ATAJOS.find(a => a.accion && a.tecla.toLowerCase() === k && !!a.shift === e.shiftKey) ?? null;
}
