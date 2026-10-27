import { panelInk } from '@/lib/panelColors';
import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Mail, Newspaper, AlertCircle, RefreshCw } from 'lucide-react';
import { EmpresaEditor, type Empresa } from './webLuna/EmpresaEditor';
import { ContactoEditor, type Contacto } from './webLuna/ContactoEditor';
import { BlogEditor } from './webLuna/BlogEditor';
import { BotonSec } from './webLuna/ui';
import { bd, mt, mensajeError, type LunaFetch } from './webLuna/comun';

// ─── Web de Luna — Empresa, Contacto y Blog ──────────────────────────────────
// Lo que la web de Luna (luna-net.nellyx.xyz) muestra en /about, /contacto y
// /blog. Se guarda por la API del bot (/api/bot/web/:doc y /api/bot/blog/:slug,
// requiere sesión de staff) y se ve en la web en la siguiente visita.
// Las tres secciones quedan montadas: cambiar de una a otra no pierde lo escrito.

type Seccion = 'empresa' | 'contacto' | 'blog';
const SECCIONES: { id: Seccion; label: string; ruta: string; Icon: React.ElementType; color: string }[] = [
  { id: 'empresa', label: 'Sobre nosotros', ruta: '/about', Icon: Building2, color: '#a5b4fc' },
  { id: 'contacto', label: 'Contacto', ruta: '/contacto', Icon: Mail, color: '#818cf8' },
  { id: 'blog', label: 'Blog', ruta: '/blog', Icon: Newspaper, color: '#f472b6' },
];

export const WebLunaPanel: React.FC<{ lunaFetch: LunaFetch }> = ({ lunaFetch }) => {
  const [docs, setDocs] = useState<{ empresa: Empresa; contacto: Contacto } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activa, setActiva] = useState<Seccion>('empresa');
  const [sucios, setSucios] = useState<Record<Seccion, boolean>>({ empresa: false, contacto: false, blog: false });

  const pedir = useCallback(() => {
    lunaFetch('/api/bot/web')
      .then(r => setDocs(r.data as { empresa: Empresa; contacto: Contacto }))
      .catch((e: unknown) => setError(mensajeError(e, 'No se pudo conectar con la API de Luna NET')));
  }, [lunaFetch]);
  useEffect(() => { pedir(); }, [pedir]);

  const marcarEmpresa = useCallback((s: boolean) => setSucios(p => (p.empresa === s ? p : { ...p, empresa: s })), []);
  const marcarContacto = useCallback((s: boolean) => setSucios(p => (p.contacto === s ? p : { ...p, contacto: s })), []);
  const marcarBlog = useCallback((s: boolean) => setSucios(p => (p.blog === s ? p : { ...p, blog: s })), []);

  // Aviso del navegador si se cierra con cambios sin guardar.
  const algunoSucio = Object.values(sucios).some(Boolean);
  useEffect(() => {
    if (!algunoSucio) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [algunoSucio]);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        {SECCIONES.map(({ id, label, ruta, Icon, color }) => {
          const on = id === activa;
          return (
            <button key={id} type="button" onClick={() => setActiva(id)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all moon-panel-hover"
              style={{ background: on ? 'color-mix(in srgb, var(--moon-ink) 6%, transparent)' : 'transparent', border: `1px solid ${on ? `${color}55` : bd}` }}>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
                <Icon className="w-4 h-4" style={{ color: panelInk(color) }} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-light moon-panel-ink">
                  {label}
                  {sucios[id] && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#facc15' }} title="Cambios sin guardar" />}
                </span>
                <span className="block text-[11px] font-light font-mono" style={{ color: panelInk(mt) }}>{ruta}</span>
              </span>
            </button>
          );
        })}
      </div>

      {activa !== 'blog' && error && (
        <div className="flex flex-col items-center justify-center h-40 gap-4 rounded-2xl text-center px-4" style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: panelInk('#f87171') }} strokeWidth={1.5} />
            <p className="text-sm font-light" style={{ color: panelInk('#f87171') }}>{error}</p>
          </div>
          <BotonSec onClick={() => { setError(null); pedir(); }}><RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Reintentar</BotonSec>
        </div>
      )}
      {activa !== 'blog' && !error && !docs && (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <div className="w-5 h-5 border moon-panel-border border-t-zinc-300 rounded-full animate-spin" />
          <p className="text-xs font-light" style={{ color: panelInk(mt) }}>Cargando el contenido de la web…</p>
        </div>
      )}

      {docs && (
        <>
          <div hidden={activa !== 'empresa'}><EmpresaEditor lunaFetch={lunaFetch} inicial={docs.empresa} onSucio={marcarEmpresa} /></div>
          <div hidden={activa !== 'contacto'}><ContactoEditor lunaFetch={lunaFetch} inicial={docs.contacto} onSucio={marcarContacto} /></div>
        </>
      )}
      <div hidden={activa !== 'blog'}><BlogEditor lunaFetch={lunaFetch} onSucio={marcarBlog} /></div>
    </div>
  );
};

export default WebLunaPanel;
