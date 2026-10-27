import { panelInk } from '@/lib/panelColors';
import React, { Fragment } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, Copy, Info, Undo2, RotateCcw, Save, Loader2 } from 'lucide-react';
import { LANGS, WEB, bd, sf, sc, mt, tenue, copia, type Lang } from './comun';

// ─── Piezas comunes de los editores de la web de Luna ────────────────────────
// Mismo estilo que el editor legal (LegalLunaPanel): variables del tema,
// fuente ligera, íconos de trazo 1.5.

// ─── Controles ───────────────────────────────────────────────────────────────
export const Etiqueta: React.FC<{ children: React.ReactNode; hint?: React.ReactNode }> = ({ children, hint }) => (
  <div className="mb-1.5 flex items-baseline gap-2 min-w-0">
    <span className="text-[10px] uppercase tracking-widest font-light flex-shrink-0" style={{ color: panelInk(mt) }}>{children}</span>
    {hint && <span className="text-[10px] font-light truncate" style={{ color: panelInk(tenue) }}>{hint}</span>}
  </div>
);

const estiloControl: React.CSSProperties = { background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' };
export const Entrada: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all focus:border-white/20 ${props.className ?? ''}`} style={{ ...estiloControl, ...props.style }} />
);
export const Area = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => (
  <textarea ref={ref} {...props} className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all leading-relaxed resize-y focus:border-white/20 ${props.className ?? ''}`} style={{ ...estiloControl, ...props.style }} />
));
Area.displayName = 'Area';
export const Seleccion: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} className={`w-full px-3 py-2.5 rounded-xl text-sm font-light outline-none transition-all focus:border-white/20 ${props.className ?? ''}`} style={{ ...estiloControl, colorScheme: 'inherit', ...props.style }} />
);
export const BotonSec: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className, ...props }) => (
  <button type="button" {...props} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover disabled:opacity-40 disabled:pointer-events-none ${className ?? ''}`} style={{ border: `1px solid ${bd}`, color: panelInk(mt), ...props.style }}>
    {children}
  </button>
);
export const BotonIcono: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => (
  <button type="button" {...props} className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all moon-panel-hover disabled:opacity-25 disabled:pointer-events-none flex-shrink-0 ${props.className ?? ''}`} style={{ color: panelInk(mt), ...props.style }}>
    {children}
  </button>
);

/** Interruptor con título y explicación. */
export const Interruptor: React.FC<{ activo: boolean; onChange: (v: boolean) => void; titulo: string; texto?: string; color?: string }> = ({ activo, onChange, titulo, texto, color = '#4ade80' }) => (
  <button type="button" role="switch" aria-checked={activo} onClick={() => onChange(!activo)}
    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all moon-panel-hover"
    style={{ border: `1px solid ${activo ? `${color}40` : bd}`, background: activo ? `${color}0a` : 'transparent' }}>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-light moon-panel-ink">{titulo}</span>
      {texto && <span className="block text-[11px] font-light mt-0.5 leading-relaxed" style={{ color: panelInk(mt) }}>{texto}</span>}
    </span>
    <span className="relative w-9 h-5 rounded-full flex-shrink-0 transition-all" style={{ background: activo ? color : 'color-mix(in srgb, var(--moon-ink) 12%, transparent)' }}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: activo ? 18 : 2 }} />
    </span>
  </button>
);

/** Un bloque del formulario con título. */
export const Bloque: React.FC<{ Icon: React.ElementType; titulo: string; texto?: string; color?: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ Icon, titulo, texto, color = '#a5b4fc', extra, children }) => (
  <section className="rounded-2xl p-4 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: panelInk(color) }} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-light moon-panel-ink leading-7">{titulo}</h3>
          {texto && <p className="text-[11px] font-light leading-relaxed" style={{ color: panelInk(mt) }}>{texto}</p>}
        </div>
      </div>
      {extra}
    </header>
    {children}
  </section>
);

/** Lista ordenable: cada fila con subir, bajar y borrar, y un botón para añadir. */
export function Filas<T>({ items, max, onChange, nuevo, textoNuevo, vacio, render, titulo }: {
  items: T[]; max: number; onChange: (items: T[]) => void; nuevo: () => T; textoNuevo: string; vacio: string;
  titulo: (item: T, i: number) => string; render: (item: T, cambiar: (f: (x: T) => void) => void, i: number) => React.ReactNode;
}) {
  const mover = (i: number, dir: -1 | 1) => { const n = [...items]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; onChange(n); };
  const cambiar = (i: number) => (f: (x: T) => void) => { const n = copia(items); f(n[i]); onChange(n); };
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs font-light px-3.5 py-4 rounded-xl text-center" style={{ color: panelInk(mt), border: `1px dashed ${bd}` }}>{vacio}</p>
      )}
      {items.map((item, i) => (
        <div key={i} className="rounded-xl" style={{ border: `1px solid ${bd}`, background: 'color-mix(in srgb, var(--moon-ink) 1.5%, transparent)' }}>
          <div className="flex items-center gap-1 pl-3 pr-1.5 py-1.5 border-b" style={{ borderColor: bd }}>
            <span className="text-[10px] font-mono flex-shrink-0 w-5" style={{ color: panelInk(mt) }}>{String(i + 1).padStart(2, '0')}</span>
            <span className="text-xs font-light text-white/80 truncate flex-1 min-w-0">{titulo(item, i) || 'Sin título'}</span>
            <BotonIcono title="Subir" onClick={() => mover(i, -1)} disabled={i === 0}><ArrowUp className="w-3.5 h-3.5" strokeWidth={1.5} /></BotonIcono>
            <BotonIcono title="Bajar" onClick={() => mover(i, 1)} disabled={i === items.length - 1}><ArrowDown className="w-3.5 h-3.5" strokeWidth={1.5} /></BotonIcono>
            <BotonIcono title="Quitar" onClick={() => onChange(items.filter((_, k) => k !== i))}><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /></BotonIcono>
          </div>
          <div className="p-3 space-y-3">{render(item, cambiar(i), i)}</div>
        </div>
      ))}
      <BotonSec onClick={() => onChange([...items, nuevo()])} disabled={items.length >= max}>
        <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {textoNuevo} <span style={{ color: panelInk(tenue) }}>{items.length}/{max}</span>
      </BotonSec>
    </div>
  );
}

/** Los cuatro idiomas, con «crear desde el español» y «quitar idioma». */
export const SelectorIdioma: React.FC<{
  lang: Lang; setLang: (l: Lang) => void; tiene: (l: Lang) => boolean; onQuitar: () => void;
}> = ({ lang, setLang, tiene, onQuitar }) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="flex gap-1 p-1 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
      {LANGS.map(l => (
        <button key={l.id} type="button" onClick={() => setLang(l.id)}
          className="px-3 py-1.5 rounded-lg text-xs font-light transition-all"
          style={{ background: lang === l.id ? 'color-mix(in srgb, var(--moon-ink) 8%, transparent)' : 'transparent', color: panelInk(lang === l.id ? 'var(--moon-ink)' : mt), opacity: tiene(l.id) ? 1 : 0.55 }}>
          {l.label}
        </button>
      ))}
    </div>
    {lang !== 'es' && tiene(lang) && (
      <BotonSec onClick={() => { if (window.confirm('¿Quitar este idioma? La web mostrará el texto en español a quien lo tenga elegido.')) onQuitar(); }}>
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Quitar idioma
      </BotonSec>
    )}
  </div>
);

export const SinIdioma: React.FC<{ lang: Lang; onCrear: () => void }> = ({ lang, onCrear }) => (
  <div className="rounded-2xl p-6 text-center space-y-3" style={{ border: `1px dashed ${bd}` }}>
    <p className="text-sm font-light" style={{ color: panelInk(mt) }}>
      No hay texto en {LANGS.find(l => l.id === lang)!.label}: la web muestra el español a quien tenga ese idioma.
    </p>
    <div className="flex justify-center">
      <BotonSec onClick={onCrear}><Copy className="w-3.5 h-3.5" strokeWidth={1.5} /> Crear a partir del español</BotonSec>
    </div>
  </div>
);

export const AyudaFormato: React.FC<{ imagenes?: boolean }> = ({ imagenes }) => (
  <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl text-[11px] font-light leading-relaxed" style={{ background: 'rgba(165,180,252,0.05)', border: '1px solid rgba(165,180,252,0.15)', color: panelInk(mt) }}>
    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: panelInk('#a5b4fc') }} strokeWidth={1.5} />
    <span>
      Una línea en blanco separa párrafos · <code className="text-white/70">## </code> subtítulo · <code className="text-white/70">- </code> lista ·
      {' '}<code className="text-white/70">&gt; </code> cita · <code className="text-white/70">**negrita**</code> · <code className="text-white/70">*cursiva*</code> ·
      {' '}<code className="text-white/70">`código`</code> · <code className="text-white/70">[texto](https://…)</code> o <code className="text-white/70">[texto](/wiki)</code>
      {imagenes && <> · <code className="text-white/70">![descripción](https://…)</code> sola en su línea es una imagen</>}.
    </span>
  </div>
);

/** Barra fija de abajo: descartar, restaurar y publicar. */
export const Acciones: React.FC<{
  hayCambios: boolean; guardando: boolean; onDescartar: () => void; onGuardar: () => void; textoGuardar: string;
  onRestaurar?: () => void; restaurarDeshabilitado?: boolean; izquierda?: React.ReactNode;
}> = ({ hayCambios, guardando, onDescartar, onGuardar, textoGuardar, onRestaurar, restaurarDeshabilitado, izquierda }) => (
  <div className="sticky bottom-0 z-10 -mx-5 -mb-5 px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-t" style={{ background: sf, borderColor: bd }}>
    <div className="flex flex-wrap gap-2">
      <BotonSec onClick={onDescartar} disabled={!hayCambios || guardando}><Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Descartar cambios</BotonSec>
      {onRestaurar && <BotonSec onClick={onRestaurar} disabled={guardando || restaurarDeshabilitado}><RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} /> Restaurar predeterminado</BotonSec>}
      {izquierda}
    </div>
    <div className="flex items-center gap-3">
      {hayCambios && <span className="text-[11px] font-light" style={{ color: panelInk('#facc15') }}>Cambios sin guardar</span>}
      <button type="button" onClick={onGuardar} disabled={guardando || !hayCambios}
        className="moon-panel-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
        style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}>
        {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Save className="w-4 h-4" strokeWidth={1.5} /> {textoGuardar}</>}
      </button>
    </div>
  </div>
);

// ─── Vista previa ────────────────────────────────────────────────────────────
// El mismo formato que pinta la web (TextoRico en el repo de la web): nunca
// HTML, solo enlaces https://, mailto: o rutas propias, e imágenes https://.
const RUTA = /^\/[A-Za-z0-9\-_/?=&#.]*$/;

function enLinea(texto: string): React.ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g);
  return partes.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-medium moon-panel-ink">{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="px-1.5 py-px rounded-md text-[0.88em] moon-panel-ink" style={{ background: 'color-mix(in srgb, var(--moon-ink) 7%, transparent)', border: `1px solid ${bd}` }}>{p.slice(1, -1)}</code>;
    if (/^\*[^*\s][^*]*\*$/.test(p)) return <em key={i} className="moon-panel-ink">{p.slice(1, -1)}</em>;
    const m = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) {
      const [, etiqueta, url] = m;
      const ok = RUTA.test(url) || /^(https:\/\/|mailto:)/.test(url);
      if (!ok) return <span key={i} className="underline decoration-wavy" style={{ textDecorationColor: '#f87171' }} title="Este enlace no se publicará: usa https://, mailto: o /ruta">{etiqueta}</span>;
      const href = RUTA.test(url) ? `${WEB}${url}` : url;
      return <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: panelInk('#c4b5fd'), textDecorationColor: 'color-mix(in srgb, var(--moon-ink) 25%, transparent)' }}>{etiqueta}</a>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export const VistaPrevia: React.FC<{ texto: string }> = ({ texto }) => {
  const bloques = String(texto || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.split('\n').filter(l => l.trim()));
  const out: React.ReactNode[] = [];
  for (const lineas of bloques) {
    let lista: string[] = [], parrafo: string[] = [], cita: string[] = [];
    const k = () => `b${out.length}`;
    const lineasCon = (ls: string[]) => ls.map((x, j) => <Fragment key={j}>{j > 0 && <br />}{enLinea(x)}</Fragment>);
    const cerrarLista = () => { if (lista.length) { const it = lista; out.push(<ul key={k()} className="mb-4 pl-5 list-disc space-y-1.5 marker:text-violet-400">{it.map((x, j) => <li key={j}>{enLinea(x)}</li>)}</ul>); lista = []; } };
    const cerrarParrafo = () => { if (parrafo.length) { const ls = parrafo; out.push(<p key={k()} className="mb-4">{lineasCon(ls)}</p>); parrafo = []; } };
    const cerrarCita = () => { if (cita.length) { const ls = cita; out.push(<blockquote key={k()} className="mb-4 px-4 py-3 rounded-r-xl moon-panel-ink" style={{ borderLeft: '3px solid #a78bfa', background: 'color-mix(in srgb, var(--moon-ink) 3%, transparent)' }}>{lineasCon(ls)}</blockquote>); cita = []; } };
    const cerrar = () => { cerrarLista(); cerrarParrafo(); cerrarCita(); };
    for (const l of lineas) {
      const t = l.trim();
      const img = t.match(/^!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)$/);
      if (img) {
        cerrar();
        out.push(<figure key={k()} className="my-5"><img src={img[2]} alt={img[1]} loading="lazy" className="w-full rounded-xl" style={{ border: `1px solid ${bd}` }} />{img[1] && <figcaption className="mt-2 text-xs text-center" style={{ color: panelInk(mt) }}>{img[1]}</figcaption>}</figure>);
      } else if (t.startsWith('### ')) { cerrar(); out.push(<h5 key={k()} className="mt-5 mb-2 text-[15px] font-medium moon-panel-ink">{enLinea(t.slice(4))}</h5>); }
      else if (t.startsWith('## ')) { cerrar(); out.push(<h4 key={k()} className="mt-6 mb-3 text-lg font-medium moon-panel-ink tracking-tight">{enLinea(t.slice(3))}</h4>); }
      else if (/^\*\*[^*]+\*\*$/.test(t)) { cerrar(); out.push(<h4 key={k()} className="mt-6 mb-3 text-lg font-medium moon-panel-ink tracking-tight">{t.slice(2, -2)}</h4>); }
      else if (t.startsWith('- ')) { cerrarParrafo(); cerrarCita(); lista.push(t.slice(2)); }
      else if (t.startsWith('> ')) { cerrarParrafo(); cerrarLista(); cita.push(t.slice(2)); }
      else { cerrarLista(); cerrarCita(); parrafo.push(t); }
    }
    cerrar();
  }
  if (!out.length) return <p className="text-sm font-light italic" style={{ color: panelInk(tenue) }}>Todavía no hay texto.</p>;
  return <div className="text-sm font-light leading-7 [&>:first-child]:mt-0" style={{ color: 'var(--moon-ink)' }}>{out}</div>;
};
