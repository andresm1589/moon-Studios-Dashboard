import { panelInk } from '@/lib/panelColors';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, ArrowLeft, ExternalLink, Trash2, Star, Sparkles, RefreshCw, PartyPopper, BookOpen,
  Megaphone, CalendarDays, Link2, ImageIcon, Tags, X, Eye, EyeOff, AlertCircle, Newspaper, Clock, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { EditorTexto } from './EditorTexto';
import { Acciones, Area, AyudaFormato, BotonSec, Bloque, Entrada, Etiqueta, Interruptor, SelectorIdioma, SinIdioma } from './ui';
import { LANGS, WEB, aSlug, bd, copia, fechaHora, hoy, igual, mensajeError, mt, sc, sf, tenue, type Lang, type LunaFetch } from './comun';

// ─── Blog — /blog y /blog/:slug de la web de Luna ────────────────────────────
// Cada artículo es un documento propio (luna_blog/{slug}). Los borradores no
// se ven en la web; el destacado (el más reciente marcado) va arriba del
// blog. La dirección sale del título en español mientras sea nuevo.

interface ArticuloTexto { titulo: string; resumen: string; contenido: string }
interface Articulo {
  slug: string; fecha: string; categoria: string; publicado: boolean; destacado: boolean; portada: string | null;
  autor: string; etiquetas: string[]; idiomas: Partial<Record<Lang, ArticuloTexto>>;
  actualizadoEn?: string | null; creadoEn?: string | null;
}
interface Edicion { anterior: string | null; base: Articulo; borrador: Articulo; slugManual: boolean }

const CATEGORIAS: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  novedad: { label: 'Novedad', Icon: Sparkles, color: '#a78bfa' },
  actualizacion: { label: 'Actualización', Icon: RefreshCw, color: '#38bdf8' },
  evento: { label: 'Evento', Icon: PartyPopper, color: '#fb923c' },
  tutorial: { label: 'Tutorial', Icon: BookOpen, color: '#4ade80' },
  anuncio: { label: 'Anuncio', Icon: Megaphone, color: '#f472b6' },
};
const cat = (c: string) => CATEGORIAS[c] ?? CATEGORIAS.novedad;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const minutos = (t: string) => Math.max(1, Math.round(t.split(/\s+/).filter(Boolean).length / 200));
const fechaCorta = (f: string) => {
  const d = new Date(`${f}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? f : d.toLocaleDateString('es-PE', { dateStyle: 'medium', timeZone: 'UTC' });
};
const limpiar = (a: Articulo) => ({
  slug: a.slug, fecha: a.fecha, categoria: a.categoria, publicado: a.publicado, destacado: a.destacado,
  portada: a.portada || null, autor: a.autor, etiquetas: a.etiquetas,
  idiomas: Object.fromEntries(Object.entries(a.idiomas).map(([l, x]) => [l, x && { titulo: x.titulo, resumen: x.resumen, contenido: x.contenido }])),
});
const nuevoArticulo = (): Articulo => ({
  slug: '', fecha: hoy(), categoria: 'novedad', publicado: false, destacado: false, portada: null,
  autor: 'Moon Studios', etiquetas: [], idiomas: { es: { titulo: '', resumen: '', contenido: '' } },
});

/** Lo que la API rechazaría, dicho antes de enviar. */
function problemas(a: Articulo, otros: Articulo[], anterior: string | null): string | null {
  const es = a.idiomas.es;
  if (!es?.titulo.trim()) return 'Falta el título en español.';
  if (!es.resumen.trim()) return 'Falta el resumen en español: es lo que se ve en la lista del blog.';
  if (!es.contenido.trim()) return 'Falta el contenido en español.';
  if (!a.slug || !SLUG.test(a.slug)) return 'La dirección solo admite minúsculas, números y guiones.';
  if (a.slug.includes('wp-')) return 'La dirección no puede contener «wp-».';
  if (otros.some(o => o.slug === a.slug && o.slug !== anterior)) return `Ya hay otro artículo con la dirección «${a.slug}».`;
  if (a.portada && !/^https:\/\/\S+$/.test(a.portada)) return 'La portada tiene que ser una dirección https://';
  for (const l of LANGS) {
    const x = a.idiomas[l.id];
    if (l.id !== 'es' && x && (!x.titulo.trim() || !x.resumen.trim() || !x.contenido.trim())) return `(${l.label}) faltan el título, el resumen o el contenido. Complétalos o quita ese idioma.`;
    // Los mismos enlaces e imágenes que acepta la API (y que la web convierte).
    for (const [, esImg, url] of (x?.contenido ?? '').matchAll(/(!?)\[[^\]]*\]\(([^)\s]*)\)/g)) {
      const ok = esImg ? /^https:\/\/\S+$/.test(url) : /^(https:\/\/\S+|mailto:[^\s@]+@\S+|\/[A-Za-z0-9\-_/?=&#.]*)$/.test(url);
      if (!ok) return `(${l.label}) ${esImg ? 'la imagen' : 'el enlace'} «${url || '(vacío)'}» no se puede publicar: usa ${esImg ? 'https://' : 'https://, mailto: o una ruta como /wiki'}.`;
    }
  }
  return null;
}

// ─── Piezas ──────────────────────────────────────────────────────────────────
const Chip: React.FC<{ color: string; Icon?: React.ElementType; children: React.ReactNode }> = ({ color, Icon, children }) => (
  <span className="inline-flex items-center gap-1 text-[10px] font-light px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${color}14`, color: panelInk(color), border: `1px solid ${color}30` }}>
    {Icon && <Icon className="w-2.5 h-2.5" strokeWidth={2} />}{children}
  </span>
);

const Portada: React.FC<{ a: Articulo; alto: number }> = ({ a, alto }) => {
  const { Icon, color } = cat(a.categoria);
  const [rota, setRota] = useState(false);
  if (a.portada && /^https:\/\/\S+$/.test(a.portada) && !rota) {
    return <img src={a.portada} alt="" onError={() => setRota(true)} className="w-full object-cover" style={{ height: alto }} />;
  }
  return (
    <div className="w-full flex items-center justify-center" style={{ height: alto, background: `radial-gradient(circle at 30% 20%, ${color}33, transparent 60%), linear-gradient(135deg, ${color}14, color-mix(in srgb, var(--moon-ink) 2%, transparent))` }}>
      <Icon className="w-7 h-7" strokeWidth={1.25} style={{ color: panelInk(color) }} />
    </div>
  );
};

/** Así se ve el artículo en la lista del blog de la web. */
const TarjetaPrevia: React.FC<{ a: Articulo; lang: Lang }> = ({ a, lang }) => {
  const t = a.idiomas[lang] ?? a.idiomas.es;
  const c = cat(a.categoria);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${bd}`, background: 'color-mix(in srgb, var(--moon-ink) 2%, transparent)' }}>
      <Portada key={a.portada ?? ''} a={a} alto={120} />
      <div className="p-3.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Chip color={c.color} Icon={c.Icon}>{c.label}</Chip>
          {a.destacado && <Chip color="#facc15" Icon={Star}>Destacado</Chip>}
        </div>
        <p className="text-sm font-medium moon-panel-ink leading-snug line-clamp-2">{t?.titulo || 'Sin título'}</p>
        <p className="text-[11px] font-light leading-relaxed line-clamp-3" style={{ color: panelInk(mt) }}>{t?.resumen || 'Sin resumen'}</p>
        <p className="text-[10px] font-light flex items-center gap-2" style={{ color: panelInk(tenue) }}>
          <span>{fechaCorta(a.fecha)}</span>·<span>{minutos(t?.contenido ?? '')} min de lectura</span>
        </p>
      </div>
    </div>
  );
};

// ─── Panel ───────────────────────────────────────────────────────────────────
export const BlogEditor: React.FC<{ lunaFetch: LunaFetch; onSucio: (s: boolean) => void }> = ({ lunaFetch, onSucio }) => {
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ed, setEd] = useState<Edicion | null>(null);
  const [lang, setLang] = useState<Lang>('es');
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'publicados' | 'borradores'>('todos');
  const [guardando, setGuardando] = useState(false);
  const [etiqueta, setEtiqueta] = useState('');

  const pedir = useCallback(() => {
    lunaFetch('/api/bot/blog')
      .then(r => setArticulos((r.data ?? []) as Articulo[]))
      .catch((e: unknown) => setError(mensajeError(e, 'No se pudo conectar con la API de Luna NET')))
      .finally(() => setCargando(false));
  }, [lunaFetch]);
  useEffect(() => { pedir(); }, [pedir]);

  const hayCambios = !!ed && !igual(limpiar(ed.borrador), limpiar(ed.base));
  useEffect(() => { onSucio(hayCambios); }, [hayCambios, onSucio]);

  const ordenados = useMemo(() => [...articulos].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creadoEn ?? '').localeCompare(a.creadoEn ?? '')), [articulos]);
  const destacadoEnWeb = ordenados.find(a => a.publicado && a.destacado)?.slug ?? null;
  const visibles = ordenados.filter(a => {
    if (filtro === 'publicados' && !a.publicado) return false;
    if (filtro === 'borradores' && a.publicado) return false;
    const q = buscar.trim().toLowerCase();
    if (!q) return true;
    const es = a.idiomas.es;
    return [a.slug, es?.titulo, es?.resumen, ...a.etiquetas].some(x => x?.toLowerCase().includes(q));
  });

  const salir = () => {
    if (hayCambios && !window.confirm('Hay cambios sin guardar en este artículo. ¿Salir igual?')) return false;
    setEd(null); setLang('es'); setEtiqueta('');
    return true;
  };
  const abrir = (a: Articulo | null) => {
    if (ed && !salir()) return;
    const base = a ? copia(a) : nuevoArticulo();
    setEd({ anterior: a?.slug ?? null, base, borrador: copia(base), slugManual: !!a });
    setLang('es');
  };

  const cambiar = (f: (a: Articulo) => void) => setEd(prev => {
    if (!prev) return prev;
    const b = copia(prev.borrador); f(b);
    // Mientras el artículo es nuevo, la dirección sigue al título en español.
    if (!prev.slugManual) b.slug = aSlug(b.idiomas.es?.titulo ?? '').replace(/wp-/g, 'wp');
    return { ...prev, borrador: b };
  });
  const cambiarTexto = (f: (t: ArticuloTexto) => void) => cambiar(a => { const t = a.idiomas[lang]; if (t) f(t); });

  const guardar = async () => {
    if (!ed) return;
    const fallo = problemas(ed.borrador, articulos, ed.anterior);
    if (fallo) { toast.error(fallo); return; }
    if (ed.anterior && ed.anterior !== ed.borrador.slug && ed.base.publicado
      && !window.confirm(`Vas a cambiar la dirección de /blog/${ed.anterior} a /blog/${ed.borrador.slug}. Los enlaces que ya se compartieron dejarán de funcionar. ¿Seguir?`)) return;
    setGuardando(true);
    try {
      const body = { ...limpiar(ed.borrador), ...(ed.anterior && ed.anterior !== ed.borrador.slug ? { anterior: ed.anterior } : {}) };
      const r = await lunaFetch(`/api/bot/blog/${ed.borrador.slug}`, { method: 'PUT', body: JSON.stringify(body) });
      const guardado = r.data as Articulo;
      setArticulos(prev => [...prev.filter(a => a.slug !== ed.anterior && a.slug !== guardado.slug), guardado]);
      setEd({ anterior: guardado.slug, base: copia(guardado), borrador: copia(guardado), slugManual: true });
      toast.success(guardado.publicado ? 'Artículo publicado en la web de Luna' : 'Borrador guardado (no se ve en la web)');
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo guardar'));
    } finally { setGuardando(false); }
  };

  const borrar = async () => {
    if (!ed?.anterior) return;
    const titulo = ed.base.idiomas.es?.titulo ?? ed.anterior;
    if (!window.confirm(`¿Borrar «${titulo}»? Desaparece de la web y no se puede recuperar.`)) return;
    setGuardando(true);
    try {
      await lunaFetch(`/api/bot/blog/${ed.anterior}`, { method: 'DELETE' });
      const slug = ed.anterior;
      setArticulos(prev => prev.filter(a => a.slug !== slug));
      setEd(null);
      toast.success('Artículo borrado');
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo borrar'));
    } finally { setGuardando(false); }
  };

  const agregarEtiqueta = (texto: string) => {
    const e = texto.trim().toLowerCase().replace(/^#/, '').slice(0, 30);
    if (!e) return;
    cambiar(a => { if (!a.etiquetas.includes(e) && a.etiquetas.length < 8) a.etiquetas.push(e); });
    setEtiqueta('');
  };

  // ── Estados de carga ──
  if (cargando) return (
    <div className="flex flex-col items-center justify-center h-40 gap-3">
      <div className="w-5 h-5 border moon-panel-border border-t-zinc-300 rounded-full animate-spin" />
      <p className="text-xs font-light" style={{ color: panelInk(mt) }}>Cargando el blog…</p>
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center h-40 gap-4 rounded-2xl text-center px-4" style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}>
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: panelInk('#f87171') }} strokeWidth={1.5} />
        <p className="text-sm font-light" style={{ color: panelInk('#f87171') }}>{error}</p>
      </div>
      <BotonSec onClick={() => { setCargando(true); setError(null); pedir(); }}><RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Reintentar</BotonSec>
    </div>
  );

  // ── Lista ──
  if (!ed) {
    const n = { todos: articulos.length, publicados: articulos.filter(a => a.publicado).length, borradores: articulos.filter(a => !a.publicado).length };
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} style={{ color: panelInk(mt) }} />
            <Entrada value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por título, dirección o etiqueta…" className="!pl-9" />
          </div>
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
            {([['todos', 'Todos'], ['publicados', 'Publicados'], ['borradores', 'Borradores']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFiltro(id)} className="px-3 py-1.5 rounded-lg text-xs font-light transition-all"
                style={{ background: filtro === id ? 'color-mix(in srgb, var(--moon-ink) 8%, transparent)' : 'transparent', color: panelInk(filtro === id ? 'var(--moon-ink)' : mt) }}>
                {label} <span style={{ color: panelInk(tenue) }}>{n[id]}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => abrir(null)}
            className="moon-panel-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90" style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}>
            <Plus className="w-4 h-4" strokeWidth={1.5} /> Nuevo artículo
          </button>
        </div>

        {visibles.length === 0 ? (
          <div className="rounded-2xl p-10 text-center space-y-2" style={{ border: `1px dashed ${bd}` }}>
            <Newspaper className="w-6 h-6 mx-auto" strokeWidth={1.25} style={{ color: panelInk(mt) }} />
            <p className="text-sm font-light" style={{ color: panelInk(mt) }}>{articulos.length ? 'Ningún artículo coincide.' : 'El blog está vacío. Escribe el primero.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibles.map(a => {
              const es = a.idiomas.es; const c = cat(a.categoria);
              return (
                <button key={a.slug} type="button" onClick={() => abrir(a)}
                  className="group rounded-2xl overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:border-white/20"
                  style={{ border: `1px solid ${bd}`, background: sf }}>
                  <div className="relative">
                    <Portada key={a.portada ?? ''} a={a} alto={110} />
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      {a.publicado
                        ? <Chip color="#4ade80" Icon={Eye}>Publicado</Chip>
                        : <Chip color="#facc15" Icon={EyeOff}>Borrador</Chip>}
                      {a.slug === destacadoEnWeb && <Chip color="#facc15" Icon={Star}>Destacado</Chip>}
                    </div>
                  </div>
                  <div className="p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] font-light" style={{ color: panelInk(tenue) }}>
                      <c.Icon className="w-3 h-3" strokeWidth={1.5} style={{ color: panelInk(c.color) }} />
                      <span style={{ color: panelInk(c.color) }}>{c.label}</span>·<span>{fechaCorta(a.fecha)}</span>
                    </div>
                    <p className="text-sm font-light moon-panel-ink leading-snug line-clamp-2 group-moon-panel-hover">{es?.titulo || a.slug}</p>
                    <p className="text-[11px] font-light leading-relaxed line-clamp-2" style={{ color: panelInk(mt) }}>{es?.resumen}</p>
                    <div className="flex items-center gap-1 pt-1">
                      {LANGS.map(l => (
                        <span key={l.id} className="text-[9px] font-mono px-1.5 py-px rounded" style={{ border: `1px solid ${bd}`, color: panelInk(a.idiomas[l.id] ? 'color-mix(in srgb, var(--moon-ink) 70%, transparent)' : 'color-mix(in srgb, var(--moon-ink) 18%, transparent)') }}>
                          {l.id.toUpperCase()}
                        </span>
                      ))}
                      <span className="ml-auto text-[10px] font-mono truncate" style={{ color: panelInk(tenue) }}>/{a.slug}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Editor ──
  const a = ed.borrador;
  const t = a.idiomas[lang];
  const enWeb = !!ed.anterior && ed.base.publicado;
  const renombra = !!ed.anterior && ed.anterior !== a.slug;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BotonSec onClick={salir}><ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Todos los artículos</BotonSec>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-light" style={{ color: panelInk(mt) }}>
            {ed.anterior ? `Guardado · ${fechaHora(ed.base.actualizadoEn)}` : 'Artículo nuevo, sin guardar'}
          </span>
          {enWeb && (
            <a href={`${WEB}/blog/${ed.anterior}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-light transition-all moon-panel-hover" style={{ color: panelInk(mt) }}>
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} /> Ver en la web
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        {/* ── Texto ── */}
        <div className="space-y-4 min-w-0">
          <SelectorIdioma lang={lang} setLang={setLang} tiene={l => !!a.idiomas[l]} onQuitar={() => cambiar(x => { delete x.idiomas[lang]; })} />
          {!t ? (
            <SinIdioma lang={lang} onCrear={() => cambiar(x => { if (x.idiomas.es) x.idiomas[lang] = copia(x.idiomas.es); })} />
          ) : (
            <>
              <div>
                <Etiqueta hint={`${t.titulo.length}/140`}>Título</Etiqueta>
                <Entrada value={t.titulo} maxLength={140} onChange={e => cambiarTexto(x => { x.titulo = e.target.value; })}
                  placeholder="Luna estrena…" className="!text-base" />
              </div>
              <div>
                <Etiqueta hint={`${t.resumen.length}/400 · se ve en la lista y al compartir`}>Resumen</Etiqueta>
                <Area rows={2} value={t.resumen} maxLength={400} onChange={e => cambiarTexto(x => { x.resumen = e.target.value; })} />
              </div>
              <AyudaFormato imagenes />
              <EditorTexto etiqueta="Contenido" valor={t.contenido} max={40000} filas={16} imagenes
                pista={`${minutos(t.contenido)} min de lectura`} placeholder={'Un párrafo de entrada…\n\n## Qué cambia\n\n- Primera novedad\n- Segunda novedad'}
                onChange={v => cambiarTexto(x => { x.contenido = v; })} />
            </>
          )}
        </div>

        {/* ── Publicación ── */}
        <div className="space-y-4 xl:sticky xl:top-4">
          <Bloque Icon={Eye} titulo="Publicación" color="#4ade80">
            <Interruptor activo={a.publicado} onChange={v => cambiar(x => { x.publicado = v; })}
              titulo={a.publicado ? 'Publicado' : 'Borrador'} texto={a.publicado ? 'Se ve en /blog al guardar.' : 'Solo se ve aquí, en el dashboard.'} />
            <Interruptor activo={a.destacado} onChange={v => cambiar(x => { x.destacado = v; })} color="#facc15"
              titulo="Destacado" texto="Va grande, arriba del blog. Si hay varios, el más reciente." />
            <div>
              <Etiqueta>Fecha</Etiqueta>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <CalendarDays className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.5} style={{ color: panelInk(mt) }} />
                  <Entrada type="date" value={a.fecha} onChange={e => cambiar(x => { x.fecha = e.target.value; })} className="!pl-9" style={{ colorScheme: 'inherit' }} />
                </div>
                <BotonSec onClick={() => cambiar(x => { x.fecha = hoy(); })} className="flex-shrink-0">Hoy</BotonSec>
              </div>
            </div>
            <div>
              <Etiqueta>Categoría</Etiqueta>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(CATEGORIAS).map(([id, { label, Icon, color }]) => (
                  <button key={id} type="button" onClick={() => cambiar(x => { x.categoria = id; })}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-light transition-all moon-panel-hover"
                    style={{ border: `1px solid ${a.categoria === id ? `${color}66` : bd}`, background: a.categoria === id ? `${color}12` : 'transparent', color: panelInk(a.categoria === id ? 'var(--moon-ink)' : mt) }}>
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: panelInk(color) }} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Etiqueta>Autor</Etiqueta>
              <Entrada value={a.autor} maxLength={60} onChange={e => cambiar(x => { x.autor = e.target.value; })} placeholder="Moon Studios" />
            </div>
          </Bloque>

          <Bloque Icon={Link2} titulo="Dirección" color="#38bdf8">
            <div>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: sc, border: `1px solid ${bd}` }}>
                <span className="pl-3 text-xs font-mono flex-shrink-0" style={{ color: panelInk(tenue) }}>/blog/</span>
                <input value={a.slug} maxLength={80}
                  onChange={e => { const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); setEd(p => p && ({ ...p, slugManual: true, borrador: { ...p.borrador, slug: v } })); }}
                  className="flex-1 min-w-0 bg-transparent pr-3 py-2.5 text-xs font-mono outline-none moon-panel-ink" placeholder="sale-del-titulo" />
              </div>
              <p className="mt-1.5 text-[10px] font-light leading-relaxed" style={{ color: panelInk(tenue) }}>
                {ed.slugManual ? 'Minúsculas, números y guiones.' : 'Sale del título en español; edítala para fijarla.'}
              </p>
            </div>
            {renombra && enWeb && (
              <p className="flex items-start gap-1.5 text-[11px] font-light leading-relaxed" style={{ color: panelInk('#facc15') }}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" strokeWidth={1.5} /> Cambia el enlace público: /blog/{ed.anterior} dejará de abrir.
              </p>
            )}
          </Bloque>

          <Bloque Icon={ImageIcon} titulo="Portada" texto="Opcional. Sin portada se usa el ícono de la categoría." color="#f472b6">
            <Entrada value={a.portada ?? ''} maxLength={500} placeholder="https://…/portada.webp" onChange={e => cambiar(x => { x.portada = e.target.value.trim() || null; })} />
          </Bloque>

          <Bloque Icon={Tags} titulo="Etiquetas" texto="Hasta 8. Ayudan a encontrar el artículo." color="#a5b4fc">
            <div className="flex flex-wrap gap-1.5">
              {a.etiquetas.map(e => (
                <span key={e} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-light" style={{ border: `1px solid ${bd}`, color: 'var(--moon-ink)' }}>
                  #{e}
                  <button type="button" aria-label={`Quitar ${e}`} onClick={() => cambiar(x => { x.etiquetas = x.etiquetas.filter(y => y !== e); })} className="w-4 h-4 flex items-center justify-center rounded-full moon-panel-hover">
                    <X className="w-2.5 h-2.5" strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
            {a.etiquetas.length < 8 && (
              <Entrada value={etiqueta} maxLength={31} placeholder="Escribe y pulsa Enter"
                onChange={e => { const v = e.target.value; if (v.endsWith(',')) agregarEtiqueta(v.slice(0, -1)); else setEtiqueta(v); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarEtiqueta(etiqueta); } }}
                onBlur={() => agregarEtiqueta(etiqueta)} />
            )}
          </Bloque>

          <div>
            <Etiqueta hint={<><Clock className="w-2.5 h-2.5 inline" /> así se ve en /blog</>}>Tarjeta</Etiqueta>
            <TarjetaPrevia a={a} lang={lang} />
          </div>
        </div>
      </div>

      <Acciones hayCambios={hayCambios || !ed.anterior} guardando={guardando}
        onDescartar={() => setEd(p => p && ({ ...p, borrador: copia(p.base), slugManual: !!p.anterior }))}
        onGuardar={guardar} textoGuardar={a.publicado ? 'Publicar artículo' : 'Guardar borrador'}
        izquierda={ed.anterior ? <BotonSec onClick={borrar} disabled={guardando} style={{ color: panelInk('#f87171'), borderColor: 'rgba(248,113,113,0.25)' }}><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Borrar artículo</BotonSec> : null} />
    </div>
  );
};
