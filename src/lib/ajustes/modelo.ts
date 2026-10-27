/** Validación compartida por la caché, Firestore y la importación de ajustes. */
export interface Settings {
  theme: 'dark' | 'light' | 'system';
  sidebarCollapsed: boolean;
  notifications: boolean;
  language: string;
  notificationSound?: 'none' | 'soft' | 'default' | 'ping' | 'chime';
  notificationVolume?: number;
  notificationsMuted?: boolean;
  notifyAnnouncements?: boolean;
  notifyEmails?: boolean;
  notifyThreads?: boolean;
  notifyMessages?: boolean;
  notifyTasks?: boolean;
  quietHoursEnabled?: boolean;
  quietFrom?: string;
  quietTo?: string;
  desktopNotifs?: boolean;
  badgeCount?: boolean;
  accentColor?: string;
  fontSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  compactMode?: boolean;
  animations?: boolean;
  blurEffects?: boolean;
  fontFamily?: string;
  showOnline?: boolean;
  loginAlerts?: boolean;
  highContrast?: boolean;
  reduceMotion?: boolean;
  screenReader?: boolean;
  focusIndicator?: boolean;
  timezone?: string;
  dateFormat?: 'dmy' | 'mdy' | 'ymd';
}

export const defaultSettings: Settings = {
  theme: 'dark', fontFamily: 'DM Sans', sidebarCollapsed: false, notifications: true,
  language: 'es', notificationSound: 'default', notificationVolume: 0.7,
  notificationsMuted: false, notifyAnnouncements: true, notifyEmails: true,
  notifyThreads: true, notifyMessages: true, notifyTasks: true,
  quietHoursEnabled: false, quietFrom: '22:00', quietTo: '08:00',
  desktopNotifs: true, badgeCount: true, accentColor: '#6366f1', fontSize: 'md',
  compactMode: false, animations: true, blurEffects: true, showOnline: true,
  loginAlerts: true, highContrast: false, reduceMotion: false, screenReader: false,
  focusIndicator: true, timezone: 'America/Lima', dateFormat: 'dmy',
};

const opciones: Partial<Record<keyof Settings, readonly string[]>> = {
  theme: ['dark', 'light', 'system'], fontSize: ['xs', 'sm', 'md', 'lg', 'xl'],
  dateFormat: ['dmy', 'mdy', 'ymd'], language: ['es', 'en', 'pt', 'fr'],
  notificationSound: ['none', 'soft', 'default', 'ping', 'chime'],
  fontFamily: ['DM Sans', 'Inter', 'Geist', 'Sora', 'Space Grotesk', 'Outfit',
    'IBM Plex Sans', 'Plus Jakarta Sans', 'Figtree', 'Nunito'],
};

/** Conserva únicamente valores reconocidos; jamás escribe entradas sin validar. */
export function limpiarCambios(crudo: unknown): Partial<Settings> {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return {};
  const limpio: Record<string, unknown> = {};
  for (const [clave, valorOriginal] of Object.entries(crudo)) {
    if (!Object.hasOwn(defaultSettings, clave)) continue;
    let valor = valorOriginal;
    const k = clave as keyof Settings;
    if (k === 'fontFamily' && valor === 'Satoshi') valor = 'Nunito';
    if (typeof valor !== typeof defaultSettings[k]) continue;
    if (opciones[k] && !opciones[k]!.includes(valor as string)) continue;
    if (k === 'accentColor' && !/^#[0-9a-f]{6}$/i.test(valor as string)) continue;
    if ((k === 'quietFrom' || k === 'quietTo') && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(valor as string)) continue;
    if (k === 'notificationVolume') {
      if (!Number.isFinite(valor)) continue;
      valor = Math.min(1, Math.max(0, valor as number));
    }
    if (k === 'timezone') {
      try { new Intl.DateTimeFormat('es', { timeZone: valor as string }); }
      catch { continue; }
    }
    limpio[k] = valor;
  }
  return limpio as Partial<Settings>;
}

export const normalizarAjustes = (crudo: unknown): Settings => ({ ...defaultSettings, ...limpiarCambios(crudo) });

export interface CacheAjustes { settings: Settings; pending: Partial<Settings> }
export const claveCacheAjustes = (uid: string | null) => `moon:settings:${uid ? `user:${encodeURIComponent(uid)}` : 'guest'}`;
export function leerCacheAjustes(storage: Pick<Storage, 'getItem'>, uid: string | null): CacheAjustes {
  try {
    const crudo = JSON.parse(storage.getItem(claveCacheAjustes(uid)) || 'null');
    return { settings: normalizarAjustes(crudo?.settings), pending: limpiarCambios(crudo?.pending) };
  } catch { return { settings: { ...defaultSettings }, pending: {} }; }
}
