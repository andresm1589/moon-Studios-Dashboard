import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { MotionConfig } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { aplicarAjustes, esOscuro } from '@/lib/ajustes/aplicar';
import { usarRegion } from '@/lib/ajustes/fecha';
import { claveCacheAjustes, defaultSettings, leerCacheAjustes, normalizarAjustes, type CacheAjustes, type Settings } from '@/lib/ajustes/modelo';
import { SincronizadorAjustes, type EstadoGuardado, type VistaAjustes } from '@/lib/ajustes/sincronizar';

export { defaultSettings } from '@/lib/ajustes/modelo';
export type { Settings } from '@/lib/ajustes/modelo';
export type { EstadoGuardado } from '@/lib/ajustes/sincronizar';

interface SettingsContextType {
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => Promise<void>;
  restablecer: (claves?: (keyof Settings)[]) => Promise<void>;
  reintentarGuardado: () => Promise<void>;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  isDark: boolean;
  isSidebarCollapsed: boolean;
  estado: EstadoGuardado;
  sincronizado: boolean;
}

const leerCache = (uid: string | null): CacheAjustes => {
  try { return leerCacheAjustes(localStorage, uid); }
  catch { return { settings: { ...defaultSettings }, pending: {} }; }
};
const guardarCache = (uid: string | null, cache: CacheAjustes) => {
  try { localStorage.setItem(claveCacheAjustes(uid), JSON.stringify(cache)); }
  catch { /* La sincronización remota sigue funcionando si no queda espacio. */ }
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings, updateSettings: async () => {}, restablecer: async () => {}, reintentarGuardado: async () => {},
  toggleTheme: () => {}, toggleSidebar: () => {}, isDark: true, isSidebarCollapsed: false, estado: 'guardado', sincronizado: false,
});

// eslint-disable-next-line react-refresh/only-export-components
export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? null;
  const [vista, setVista] = useState<VistaAjustes & { uid: string | null }>(() => ({
    uid, settings: leerCache(uid).settings, estado: 'guardado', sincronizado: false,
  }));
  // Mientras React cambia de cuenta, nunca renderizar ajustes de la cuenta anterior.
  const fallback = useMemo(() => leerCache(uid), [uid]);
  const settings = vista.uid === uid ? vista.settings : fallback.settings;
  const estado = vista.uid === uid ? vista.estado : 'guardado';
  const sincronizado = vista.uid === uid && vista.sincronizado;
  const [sistema, setSistema] = useState(0);
  const sincronizador = useRef<{ uid: string; cola: SincronizadorAjustes } | null>(null);
  const [revisionConexion, setRevisionConexion] = useState(0);

  useEffect(() => {
    aplicarAjustes(settings);
    usarRegion({ zona: settings.timezone, formato: settings.dateFormat, idioma: settings.language });
  }, [settings]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const cambio = () => { aplicarAjustes(settings); setSistema(n => n + 1); };
    mq.addEventListener('change', cambio);
    return () => mq.removeEventListener('change', cambio);
  }, [settings]);

  useEffect(() => {
    // El formato antiguo no identificaba al propietario: no se migra entre cuentas.
    try { localStorage.removeItem('ajustes-cache'); } catch { /* No storage access. */ }
    if (!uid) {
      sincronizador.current = null;
      setVista({ uid: null, settings: leerCache(null).settings, estado: 'guardado', sincronizado: false });
      return;
    }
    let activo = true;
    const cola = new SincronizadorAjustes({
      uid, cache: leerCache(uid),
      write: async (owner, cambios) => {
        await updateDoc(doc(db, 'users', owner), Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`settings.${k}`, v])));
      },
      persist: guardarCache,
      changed: nuevo => { if (activo) setVista({ uid, ...nuevo }); },
      online: () => navigator.onLine,
      failed: error => {
        console.error('Configuración:', error);
        toast.error('Los cambios quedan en este dispositivo. Se reintentará la sincronización al recuperar la conexión.');
      },
    });
    sincronizador.current = { uid, cola };
    const cache = leerCache(uid);
    setVista({ uid, settings: normalizarAjustes({ ...cache.settings, ...cache.pending }), estado: Object.keys(cache.pending).length ? 'guardando' : 'guardado', sincronizado: false });
    const cancelar = onSnapshot(doc(db, 'users', uid), { includeMetadataChanges: true }, snap => {
      if (!activo) return;
      if (!snap.exists()) { cola.receiveError(new Error('No se encontró el perfil de esta cuenta.')); return; }
      cola.receive(snap.data().settings, snap.metadata.fromCache);
    }, error => cola.receiveError(error));
    const reconectar = () => { void cola.flush(); };
    const recuperarConexion = () => setRevisionConexion(n => n + 1);
    const ocultar = () => { if (document.visibilityState === 'hidden') void cola.flush(); };
    window.addEventListener('online', recuperarConexion);
    window.addEventListener('pagehide', reconectar);
    document.addEventListener('visibilitychange', ocultar);
    return () => {
      activo = false;
      cancelar();
      cola.dispose();
      if (sincronizador.current?.cola === cola) sincronizador.current = null;
      window.removeEventListener('online', recuperarConexion);
      window.removeEventListener('pagehide', reconectar);
      document.removeEventListener('visibilitychange', ocultar);
    };
  }, [uid, revisionConexion]);

  const updateSettings = useCallback(async (cambios: Partial<Settings>) => {
    if (uid) {
      const actual = sincronizador.current;
      if (actual?.uid === uid) actual.cola.update(cambios);
      return;
    }
    setVista(actual => {
      const nuevo = normalizarAjustes({ ...(actual.uid === null ? actual.settings : defaultSettings), ...cambios });
      guardarCache(null, { settings: nuevo, pending: {} });
      return { uid: null, settings: nuevo, estado: 'guardado', sincronizado: false };
    });
  }, [uid]);

  const restablecer = useCallback(async (claves?: (keyof Settings)[]) => {
    const lista = claves ?? (Object.keys(defaultSettings) as (keyof Settings)[]);
    await updateSettings(Object.fromEntries(lista.map(k => [k, defaultSettings[k]])) as Partial<Settings>);
  }, [updateSettings]);

  const reintentarGuardado = useCallback(async () => {
    if (sincronizado) await sincronizador.current?.cola.flush();
    else setRevisionConexion(n => n + 1);
  }, [sincronizado]);

  const valor = useMemo<SettingsContextType>(() => ({
    settings, updateSettings, restablecer, reintentarGuardado, estado, sincronizado,
    toggleTheme: () => { void updateSettings({ theme: esOscuro(settings) ? 'light' : 'dark' }); },
    toggleSidebar: () => { void updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed }); },
    isDark: esOscuro(settings), isSidebarCollapsed: settings.sidebarCollapsed,
  }), [settings, updateSettings, restablecer, reintentarGuardado, estado, sincronizado, sistema]);

  const sinMovimiento = settings.animations === false || !!settings.reduceMotion || !!settings.screenReader;
  return <SettingsContext.Provider value={valor}>
    <MotionConfig reducedMotion={sinMovimiento ? 'always' : 'user'}>{children}</MotionConfig>
  </SettingsContext.Provider>;
};
