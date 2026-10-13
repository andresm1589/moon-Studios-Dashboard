import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { MotionConfig } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { aplicarAjustes, esOscuro } from '@/lib/ajustes/aplicar';
import { usarRegion } from '@/lib/ajustes/fecha';

// ─── Configuración del usuario ───────────────────────────────────────────────
// Una sola fuente de verdad: users/{uid}.settings en Firestore, escuchado en
// tiempo real (un cambio en la app se ve en la web y al revés), con una copia
// local para que al abrir se aplique al instante, sin pantalla de carga.
// Los cambios se guardan juntos (cada 400 ms) y solo lo que cambió.

export interface Settings {
  theme:            'dark' | 'light' | 'system';
  sidebarCollapsed: boolean;
  notifications:    boolean;
  language:         string;

  // Notificaciones
  notificationSound?:   'none' | 'soft' | 'default' | 'ping' | 'chime';
  notificationVolume?:  number;
  notificationsMuted?:  boolean;
  notifyAnnouncements?: boolean;
  notifyEmails?:        boolean;
  notifyThreads?:       boolean;
  notifyMessages?:      boolean;
  notifyTasks?:         boolean;
  quietHoursEnabled?:   boolean;
  quietFrom?:           string;
  quietTo?:             string;
  desktopNotifs?:       boolean;
  badgeCount?:          boolean;

  // Apariencia
  accentColor?:     string;
  fontSize?:        'xs' | 'sm' | 'md' | 'lg' | 'xl';
  compactMode?:     boolean;
  animations?:      boolean;
  blurEffects?:     boolean;
  fontFamily?:      string;

  // Privacidad y seguridad
  showOnline?:      boolean;
  loginAlerts?:     boolean;

  // Accesibilidad e idioma
  highContrast?:    boolean;
  reduceMotion?:    boolean;
  screenReader?:    boolean;
  focusIndicator?:  boolean;
  timezone?:        string;
  dateFormat?:      'dmy' | 'mdy' | 'ymd';
}

export type EstadoGuardado = 'guardado' | 'guardando' | 'error';

interface SettingsContextType {
  settings:           Settings;
  updateSettings:     (s: Partial<Settings>) => Promise<void>;
  restablecer:        (claves?: (keyof Settings)[]) => Promise<void>;
  toggleTheme:        () => void;
  toggleSidebar:      () => void;
  isDark:             boolean;
  isSidebarCollapsed: boolean;
  estado:             EstadoGuardado;
}

// eslint-disable-next-line react-refresh/only-export-components
export const defaultSettings: Settings = {
  theme:               'dark',
  fontFamily:          'DM Sans',
  sidebarCollapsed:    false,
  notifications:       true,
  language:            'es',
  notificationSound:   'default',
  notificationVolume:  0.7,
  notificationsMuted:  false,
  notifyAnnouncements: true,
  notifyEmails:        true,
  notifyThreads:       true,
  notifyMessages:      true,
  notifyTasks:         true,
  quietHoursEnabled:   false,
  quietFrom:           '22:00',
  quietTo:             '08:00',
  desktopNotifs:       true,
  badgeCount:          true,
  accentColor:         '#6366f1',
  fontSize:            'md',
  compactMode:         false,
  animations:          true,
  blurEffects:         true,
  showOnline:          true,
  loginAlerts:         true,
  highContrast:        false,
  reduceMotion:        false,
  screenReader:        false,
  focusIndicator:      true,
  timezone:            'America/Lima',
  dateFormat:          'dmy',
};

// Lo guardado puede venir de versiones viejas o con valores rotos: se valida
// campo por campo y lo que no sirve vuelve al valor por defecto.
const TIPOS = Object.fromEntries(Object.entries(defaultSettings).map(([k, v]) => [k, typeof v]));
function limpiar(crudo: unknown): Settings {
  const s: Record<string, unknown> = { ...defaultSettings };
  if (crudo && typeof crudo === 'object') {
    for (const [k, v] of Object.entries(crudo)) if (k in TIPOS && typeof v === TIPOS[k]) s[k] = v;
  }
  const r = s as unknown as Settings;
  if (!['dark', 'light', 'system'].includes(r.theme)) r.theme = 'dark';
  if (!['xs', 'sm', 'md', 'lg', 'xl'].includes(r.fontSize ?? '')) r.fontSize = 'md';
  if (!['dmy', 'mdy', 'ymd'].includes(r.dateFormat ?? '')) r.dateFormat = 'dmy';
  if (!/^#[0-9a-f]{6}$/i.test(r.accentColor ?? '')) r.accentColor = defaultSettings.accentColor;
  r.notificationVolume = Math.min(1, Math.max(0, Number(r.notificationVolume ?? 0.7)));
  return r;
}

const CLAVE_CACHE = 'ajustes-cache';
const leerCache = (): Settings => { try { return limpiar(JSON.parse(localStorage.getItem(CLAVE_CACHE) || 'null')); } catch { return defaultSettings; } };
const guardarCache = (s: Settings) => { try { localStorage.setItem(CLAVE_CACHE, JSON.stringify(s)); } catch { /* sin espacio */ } };

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings, updateSettings: async () => {}, restablecer: async () => {},
  toggleTheme: () => {}, toggleSidebar: () => {}, isDark: true, isSidebarCollapsed: false, estado: 'guardado',
});

// eslint-disable-next-line react-refresh/only-export-components
export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? null;
  const [settings, setSettings] = useState<Settings>(leerCache);
  const [estado, setEstado] = useState<EstadoGuardado>('guardado');
  const [, setSistema] = useState(0);
  const pendiente = useRef<Partial<Settings>>({});
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aplicar a la página (y a las fechas) en cada cambio.
  useEffect(() => {
    aplicarAjustes(settings);
    usarRegion({ zona: settings.timezone, formato: settings.dateFormat, idioma: settings.language });
    guardarCache(settings);
  }, [settings]);

  // Con el tema «Sistema», seguir al sistema operativo en vivo.
  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const cambio = () => { aplicarAjustes(settings); setSistema(n => n + 1); };
    mq.addEventListener('change', cambio);
    return () => mq.removeEventListener('change', cambio);
  }, [settings]);

  // Lo guardado en Firestore, en tiempo real. Lo que el usuario está cambiando
  // ahora mismo (todavía sin guardar) se respeta sobre lo que llega.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), snap => {
      const remoto = limpiar(snap.data()?.settings);
      setSettings(actual => {
        const nuevo = { ...remoto, ...pendiente.current };
        return JSON.stringify(nuevo) === JSON.stringify(actual) ? actual : nuevo;
      });
    }, e => console.error('Configuración:', e));
  }, [uid]);

  const guardarAhora = useCallback(async () => {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; }
    const cambios = pendiente.current;
    if (!uid || !Object.keys(cambios).length) return;
    pendiente.current = {};
    setEstado('guardando');
    try {
      // Solo los campos que cambiaron (settings.x): dos cambios seguidos ya no se pisan.
      await updateDoc(doc(db, 'users', uid), Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`settings.${k}`, v])));
      setEstado(e => (Object.keys(pendiente.current).length ? e : 'guardado'));
    } catch (e) {
      console.error('Error guardando la configuración:', e);
      pendiente.current = { ...cambios, ...pendiente.current };
      setEstado('error');
      toast.error('No se pudo guardar la configuración. Revisa tu conexión: se reintentará con el próximo cambio.');
    }
  }, [uid]);

  // Al cerrar o salir, lo pendiente se guarda.
  useEffect(() => {
    const salir = () => { void guardarAhora(); };
    window.addEventListener('beforeunload', salir);
    return () => { window.removeEventListener('beforeunload', salir); void guardarAhora(); };
  }, [guardarAhora]);

  const updateSettings = useCallback(async (cambios: Partial<Settings>) => {
    setSettings(actual => limpiar({ ...actual, ...cambios }));
    pendiente.current = { ...pendiente.current, ...cambios };
    if (!uid) return;
    setEstado('guardando');
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => { void guardarAhora(); }, 400);
  }, [uid, guardarAhora]);

  const restablecer = useCallback(async (claves?: (keyof Settings)[]) => {
    const lista = claves ?? (Object.keys(defaultSettings) as (keyof Settings)[]);
    await updateSettings(Object.fromEntries(lista.map(k => [k, defaultSettings[k]])) as Partial<Settings>);
  }, [updateSettings]);

  const valor = useMemo<SettingsContextType>(() => ({
    settings, updateSettings, restablecer, estado,
    toggleTheme: () => { void updateSettings({ theme: esOscuro(settings) ? 'light' : 'dark' }); },
    toggleSidebar: () => { void updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed }); },
    isDark: esOscuro(settings),
    isSidebarCollapsed: settings.sidebarCollapsed,
  }), [settings, updateSettings, restablecer, estado]);

  const sinMovimiento = settings.animations === false || !!settings.reduceMotion || !!settings.screenReader;

  return (
    <SettingsContext.Provider value={valor}>
      {/* Las animaciones de framer-motion también respetan «sin animaciones». */}
      <MotionConfig reducedMotion={sinMovimiento ? 'always' : 'user'}>
        {children}
      </MotionConfig>
    </SettingsContext.Provider>
  );
};
