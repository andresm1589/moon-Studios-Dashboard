import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Clock, Bot, Smile, Leaf, Apple, Trophy, Plane, Lightbulb, Heart, Flag, Loader2 } from 'lucide-react';
import type { EmojiPropio } from './emoji-types';
import { discordEmojiUrl } from './emoji-text';
import { useEmojiReducedMotion } from './emoji-motion';
import { urlTwemoji } from './twemoji';

// ─── Selector de emojis, como el de Discord ──────────────────────────────────
// Todos los emojis estándar de Discord por categoría (con su nombre en español
// y su :código: de Discord), los emojis propios del bot y los usados hace poco.
// La lista estándar (~1900) se carga aparte, solo cuando se abre el selector.

interface EmojiStd { e: string; n: string; c: string[]; t: string[]; h: string }
type Categorias = Record<string, EmojiStd[]>;

const CATEGORIAS = [
  { id: 'personas',    nombre: 'Personas',          Icon: Smile },
  { id: 'naturaleza',  nombre: 'Naturaleza',        Icon: Leaf },
  { id: 'comida',      nombre: 'Comida',            Icon: Apple },
  { id: 'actividades', nombre: 'Actividades',       Icon: Trophy },
  { id: 'viajes',      nombre: 'Viajes y lugares',  Icon: Plane },
  { id: 'objetos',     nombre: 'Objetos',           Icon: Lightbulb },
  { id: 'simbolos',    nombre: 'Símbolos',          Icon: Heart },
  { id: 'banderas',    nombre: 'Banderas',          Icon: Flag },
] as const;

const CLAVE_RECIENTES = 'emojis-recientes';
const leerRecientes = (): string[] => { try { const value: unknown = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 24) : []; } catch { return []; } };

let cache: Promise<Categorias> | null = null;
const cargarEstandar = () => (cache ??= import('./emojisDiscord.json').then(m => m.default.categorias as Categorias));

/** Un emoji estándar dibujado como en Discord (con el de Windows de respaldo). */
export function Twemoji({ emoji, size = 24 }: { emoji: string; size?: number }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{emoji}</span>;
  return <img src={urlTwemoji(emoji)} alt={emoji} width={size} height={size} loading="lazy" draggable={false} onError={() => setFallo(true)} />;
}

function CustomPreview({ emoji, size }: { emoji: EmojiPropio; size: number }) {
  const reduced = useEmojiReducedMotion();
  const [failed, setFailed] = useState(false);
  const url = discordEmojiUrl(emoji.id, emoji.animado && !reduced);
  return !url || failed ? <span title={`:${emoji.nombre}:`} style={{ maxWidth: size, overflow: 'hidden', fontSize: 10 }}>:{emoji.nombre}:</span> : <img src={url} alt={`:${emoji.nombre}:`} width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />;
}

export function SelectorEmojis({ propios, actual, onElegir, compact = false, ocultarPropiosVacios = false }: { propios: EmojiPropio[]; actual?: string; onElegir: (valor: string) => void; compact?: boolean; ocultarPropiosVacios?: boolean }) {
  const [datos, setDatos] = useState<Categorias | null>(null);
  const [buscar, setBuscar] = useState('');
  const [recientes, setRecientes] = useState<string[]>(leerRecientes);
  const [encima, setEncima] = useState<{ ver: React.ReactNode; nombre: string; codigo: string } | null>(null);
  const [seccion, setSeccion] = useState(() => ocultarPropiosVacios && !propios.length ? 'personas' : 'bot');
  const caja = useRef<HTMLDivElement>(null);
  const reduced = useEmojiReducedMotion();

  useEffect(() => { cargarEstandar().then(setDatos).catch(() => setDatos({})); }, []);

  // Para buscar un emoji (por su :código: o por su nombre) y para mostrar los recientes.
  const porValor = useMemo(() => {
    const m = new Map<string, EmojiStd>();
    for (const l of Object.values(datos ?? {})) for (const x of l) m.set(x.e, x);
    return m;
  }, [datos]);
  const visiblesRecientes = recientes.filter(value => porValor.has(value) || propios.some(emoji => emoji.codigo === value));

  const elegir = (valor: string) => {
    const r = [valor, ...recientes.filter(x => x !== valor)].slice(0, 24);
    setRecientes(r);
    try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(r)); } catch { /* da igual */ }
    onElegir(valor);
  };

  const q = buscar.trim().toLowerCase().replace(/^:|:$/g, '');
  const resultados = useMemo(() => {
    if (!q || !datos) return null;
    const std = Object.values(datos).flat().filter(x => x.c.some(c => c.includes(q)) || x.n.toLowerCase().includes(q) || x.t.some(t => t.toLowerCase().startsWith(q)));
    const pro = propios.filter(p => p.nombre.toLowerCase().includes(q));
    return { std: std.slice(0, 240), pro: pro.slice(0, 60) };
  }, [q, datos, propios]);

  const ir = (id: string) => {
    setSeccion(id);
    if (compact) { caja.current?.scrollTo({ top: 0, behavior: 'instant' }); return; }
    const el = caja.current?.querySelector(`[data-seccion="${id}"]`) as HTMLElement | null;
    if (el && caja.current) caja.current.scrollTo({ top: el.offsetTop - 4, behavior: reduced ? 'auto' : 'smooth' });
  };

  // Al bajar por la lista, la categoría marcada sigue a la que se ve.
  const alBajar = () => {
    const c = caja.current;
    if (!c || q || compact) return;
    const secciones = [...c.querySelectorAll<HTMLElement>('[data-seccion]')];
    const visible = secciones.filter(s => s.offsetTop - c.scrollTop <= 40).pop();
    if (visible) setSeccion(visible.dataset.seccion!);
  };

  const renderStandard = (x: EmojiStd) => (
    <button type="button" className="se-emoji" aria-label={`${x.n} :${x.c[0] ?? x.n}:`} aria-pressed={actual === x.e} title={`:${x.c[0] ?? x.n}:`}
      onClick={() => elegir(x.e)} onMouseEnter={() => setEncima({ ver: <Twemoji emoji={x.e} size={32} />, nombre: x.n, codigo: x.c.length ? `:${x.c[0]}:` : '' })}>
      <Twemoji emoji={x.e} size={26} />
    </button>
  );
  const renderCustom = (p: EmojiPropio) => (
    <button type="button" className="se-emoji" aria-label={`:${p.nombre}:`} aria-pressed={actual === p.codigo} title={`:${p.nombre}:`}
      onClick={() => elegir(p.codigo)} onMouseEnter={() => setEncima({ ver: <CustomPreview emoji={p} size={32} />, nombre: `${p.nombre} · ${p.origen}`, codigo: `:${p.nombre}:` })}>
      <CustomPreview emoji={p} size={26} />
    </button>
  );
  const renderRecent = (v: string) => {
    const p = propios.find(x => x.codigo === v);
    if (p) return renderCustom(p);
    const x = porValor.get(v);
    return x ? renderStandard(x) : null;
  };

  const deApp = propios.filter(p => p.borrable);
  const deServidores = propios.filter(p => !p.borrable);

  return (
    <div className="se">
      <div className="se-cab">
        <div className="wb-buscar"><Search /><input className="wb-input" aria-label="Buscar emojis" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar: fuego, luna, :joy:…" autoFocus /></div>
      </div>
      <div className="se-cuerpo">
        <nav className="se-cats" aria-label="Categorías">
          {visiblesRecientes.length > 0 && <button type="button" title="Usados hace poco" aria-label="Usados hace poco" aria-pressed={!q && seccion === 'recientes'} onClick={() => ir('recientes')}><Clock size={17} /></button>}
          {(!ocultarPropiosVacios || propios.length > 0) && <button type="button" title="Del bot" aria-label="Emojis propios" aria-pressed={!q && seccion === 'bot'} onClick={() => ir('bot')}><Bot size={17} /></button>}
          {CATEGORIAS.map(c => <button key={c.id} type="button" title={c.nombre} aria-label={c.nombre} aria-pressed={!q && seccion === c.id} onClick={() => ir(c.id)}><c.Icon size={17} /></button>)}
        </nav>
        <div className="se-lista" ref={caja} onScroll={alBajar} onMouseLeave={() => setEncima(null)}>
          {!datos ? <div className="wb-vacio"><Loader2 className="animate-spin" />Cargando los emojis de Discord…</div>
            : resultados ? (
              resultados.std.length + resultados.pro.length === 0
                ? <div className="wb-vacio">Ningún emoji se llama «{buscar}».</div>
                : <div className="se-rejilla">{resultados.pro.map(p => <Fragment key={p.id}>{renderCustom(p)}</Fragment>)}{resultados.std.map(x => <Fragment key={x.h}>{renderStandard(x)}</Fragment>)}</div>
            ) : (
              <>
                {visiblesRecientes.length > 0 && (!compact || seccion === 'recientes') && (
                  <section data-seccion="recientes"><h4>Usados hace poco</h4><div className="se-rejilla">{visiblesRecientes.map(v => <Fragment key={v}>{renderRecent(v)}</Fragment>)}</div></section>
                )}
                {(!ocultarPropiosVacios || propios.length > 0) && (!compact || seccion === 'bot') && <section data-seccion="bot">
                  <h4>Del bot <small>(su aplicación de Discord)</small></h4>
                  {deApp.length ? <div className="se-rejilla">{deApp.map(p => <Fragment key={p.id}>{renderCustom(p)}</Fragment>)}</div> : <p className="se-nota">El bot todavía no tiene emojis propios. Súbelos en «Emojis propios».</p>}
                  {deServidores.length > 0 && <><h4>De sus servidores</h4><div className="se-rejilla">{deServidores.map(p => <Fragment key={p.id}>{renderCustom(p)}</Fragment>)}</div></>}
                </section>}
                {CATEGORIAS.map(c => (datos[c.id]?.length && (!compact || seccion === c.id) ? (
                  <section key={c.id} data-seccion={c.id}><h4>{c.nombre}</h4><div className="se-rejilla">{datos[c.id].map(x => <Fragment key={x.h}>{renderStandard(x)}</Fragment>)}</div></section>
                ) : null))}
              </>
            )}
        </div>
      </div>
      <div className="se-pie">
        {encima ? <>{encima.ver}<span><b>{encima.codigo || encima.nombre}</b>{encima.codigo && <small>{encima.nombre}</small>}</span></>
          : <span><small>Pasa el mouse sobre un emoji para ver su nombre.</small></span>}
      </div>
    </div>
  );
}
