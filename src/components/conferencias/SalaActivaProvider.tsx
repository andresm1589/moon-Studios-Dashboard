import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoaderCircle, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useIsTauri } from '@/hooks/useIsTauri';
import type { EventoConf } from '@/lib/conferencias/tipos';
import { cargarSala } from './cargarSala';
import { SalaActivaContext, type SalaActiva } from './salaActiva';
import { activarFlotante, desactivarFlotante } from './ventanaFlotante';
import { cerrarVentanaApp, seguirEnSegundoPlano } from '@/lib/segundoPlano';
import './sala.css';

const SalaVirtual = lazy(cargarSala);

/**
 * Mantiene la conferencia por encima de las páginas: la llamada sigue al
 * navegar por el dashboard (ventanita en la esquina), al minimizar la app y,
 * en Windows, en una ventana flotante siempre visible. Si se cae la conexión,
 * la sala vuelve a entrar sola (SalaVirtual).
 */
export function SalaActivaProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const esApp = useIsTauri();
  const [activa, setActiva] = useState<SalaActiva | null>(null);
  const [expandida, setExpandida] = useState(true);
  const [hueco, registrarHueco] = useState<HTMLElement | null>(null);
  const [flotante, setFlotante] = useState(false);
  const [aviso, setAviso] = useState('');
  const estado = useRef({ activa, flotante });
  useEffect(() => { estado.current = { activa, flotante }; }, [activa, flotante]);

  const entrar = useCallback((evento: EventoConf, puedeModerar: boolean) => {
    setActiva(actual => (actual?.evento.id === evento.id ? actual : { evento, puedeModerar, volverA: location.pathname + location.search }));
    setExpandida(true);
  }, [location.pathname, location.search]);
  const minimizar = useCallback(() => setExpandida(false), []);
  const expandir = useCallback(() => {
    setExpandida(true);
    const destino = estado.current.activa?.volverA;
    if (destino && !location.pathname.startsWith('/dashboard/conferencias')) navigate(destino);
  }, [location.pathname, navigate]);

  const alternarFlotante = useCallback(async () => {
    try {
      if (estado.current.flotante) { await desactivarFlotante(); setFlotante(false); }
      else { await activarFlotante(); setFlotante(true); }
    } catch { setAviso('No se pudo cambiar la ventana. Actualiza la app e inténtalo de nuevo.'); }
  }, []);
  const salir = useCallback(async (motivo?: string) => {
    if (estado.current.flotante) { await desactivarFlotante().catch(() => {}); setFlotante(false); }
    setActiva(null);
    if (motivo) setAviso(motivo);
  }, []);

  // Cerrar la app (o la pestaña) en plena conferencia pide confirmación.
  useEffect(() => {
    if (!esApp) {
      const antes = (e: BeforeUnloadEvent) => { if (estado.current.activa) { e.preventDefault(); e.returnValue = ''; } };
      window.addEventListener('beforeunload', antes);
      return () => window.removeEventListener('beforeunload', antes);
    }
    let quitar: (() => void) | undefined;
    // Cerrar la ventana la deja en la bandeja (sigue avisando); en plena conferencia, antes se confirma.
    void getCurrentWindow().onCloseRequested(async e => {
      e.preventDefault();
      if (estado.current.activa) {
        const sigue = seguirEnSegundoPlano();
        if (!window.confirm(sigue ? 'Estás en una conferencia. ¿Salir de la llamada y cerrar la ventana?' : 'Estás en una conferencia. ¿Cerrar la app y salir de la llamada?')) return;
        if (estado.current.flotante) await desactivarFlotante().catch(() => {});
        await salir();
      }
      await cerrarVentanaApp();
    }).then(f => { quitar = f; }).catch(() => {});
    return () => quitar?.();
  }, [esApp, salir]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 7000); return () => clearTimeout(t); }, [aviso]);

  const valor = useMemo(() => ({ activa, expandida, entrar, minimizar, expandir, registrarHueco }), [activa, expandida, entrar, minimizar, expandir]);
  const completa = !flotante && expandida && !!hueco;
  return <SalaActivaContext.Provider value={valor}>
    {children}
    {activa && <Contenedor hueco={completa ? hueco : null} flotante={flotante}>
      <Suspense fallback={<div className="msala-previo"><div className="msala-previo__caja"><span className="msala-previo__icono"><LoaderCircle className="cf-spin" /></span><h3>Preparando la sala…</h3></div></div>}>
        <SalaVirtual key={activa.evento.id} evento={activa.evento} puedeModerar={activa.puedeModerar} onSalir={motivo => void salir(motivo)}
          modo={completa ? 'completa' : 'mini'} onMinimizar={minimizar} onExpandir={() => { if (flotante) void alternarFlotante(); expandir(); }}
          flotante={esApp ? { activo: flotante, alternar: () => void alternarFlotante() } : undefined} />
      </Suspense>
    </Contenedor>}
    {aviso && <div className="msala-toast" role="status"><span>{aviso}</span><button type="button" aria-label="Cerrar" onClick={() => setAviso('')}><X size={15} /></button></div>}
  </SalaActivaContext.Provider>;
}

/**
 * Un único contenedor fijo para la sala (así nunca se desmonta ni se corta):
 * encima de su lugar en la página, como ventanita en la esquina o, en la app,
 * ocupando la ventana flotante.
 */
function Contenedor({ hueco, flotante, children }: { hueco: HTMLElement | null; flotante: boolean; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    el.removeAttribute('style');
    if (!hueco || flotante) return;
    let cuadro = 0, previo = '';
    const seguir = () => {
      const r = hueco.getBoundingClientRect();
      const area = document.getElementById('moon-main-content')?.getBoundingClientRect();
      // Nunca más abajo del borde visible: así los controles de abajo siempre se ven.
      const alto = Math.max(320, Math.min(r.height, (area ? area.bottom : window.innerHeight) - r.top - 12));
      const recorte = area ? [Math.max(0, area.top - r.top), Math.max(0, r.right - area.right), Math.max(0, r.top + alto - area.bottom), Math.max(0, area.left - r.left)] : [0, 0, 0, 0];
      const clave = `${r.top}|${r.left}|${r.width}|${alto}|${recorte.join(',')}`;
      if (clave !== previo) {
        previo = clave;
        Object.assign(el.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${alto}px`, clipPath: `inset(${recorte.map(v => `${v}px`).join(' ')})` });
      }
      cuadro = requestAnimationFrame(seguir);
    };
    seguir();
    return () => cancelAnimationFrame(cuadro);
  }, [hueco, flotante]);
  return <div ref={caja} className={`msala-contenedor ${flotante ? 'is-flotante' : hueco ? 'is-completa' : 'is-mini'}`}>{children}</div>;
}
