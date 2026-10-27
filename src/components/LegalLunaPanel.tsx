import { panelInk } from '@/lib/panelColors';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, ScrollText, Cookie, Save, Loader2, RefreshCw, Plus, Trash2,
  ArrowUp, ArrowDown, ExternalLink, RotateCcw, Undo2, AlertCircle, Copy, Info,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Legal de Luna NET — privacidad, términos y cookies ─────────────────────
// Cada documento se edita y se guarda por separado. Se guardan por la API del
// bot (PUT /api/bot/legal/:doc, requiere sesión de staff), que los publica en
// luna-net.nellyx.xyz/privacidad, /terminos y /cookies al instante.

type DocId = 'privacidad' | 'terminos' | 'cookies';
type Lang = 'es' | 'en' | 'pt' | 'ja';
// `nueva`: sección creada en esta sesión y aún sin guardar; su identificador
// sigue al título mientras se escribe. No se envía a la API.
interface Seccion { id: string; titulo: string; texto: string; nueva?: boolean }
interface TextoIdioma { titulo: string; resumen: string; secciones: Seccion[] }
interface Documento {
  doc: DocId; version: string; vigenteDesde: string; actualizadoEn: string | null;
  predeterminado: boolean; idiomas: Partial<Record<Lang, TextoIdioma>>;
}
type LunaFetch = (path: string, opts?: RequestInit) => Promise<{ success: boolean; data?: unknown; error?: string }>;

const DOCS: { id: DocId; label: string; Icon: typeof ShieldCheck; color: string }[] = [
  { id: 'privacidad', label: 'Privacidad', Icon: ShieldCheck, color: '#4ade80' },
  { id: 'terminos',   label: 'Términos',   Icon: ScrollText,  color: '#a5b4fc' },
  { id: 'cookies',    label: 'Cookies',    Icon: Cookie,      color: '#fb923c' },
];
const LANGS: { id: Lang; label: string }[] = [
  { id: 'es', label: 'Español' }, { id: 'en', label: 'English' }, { id: 'pt', label: 'Português' }, { id: 'ja', label: '日本語' },
];
const WEB = 'https://luna-net.nellyx.xyz';

const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const sc = 'hsl(var(--secondary))';
const mt = 'hsl(var(--muted-foreground))';

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'seccion';
const idUnico = (base: string, usados: string[]) => {
  let id = base, n = 2;
  while (usados.includes(id)) id = `${base.slice(0, 36)}-${n++}`;
  return id;
};
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const fechaHora = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' })
  : '';
const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const paraGuardar = (d: Documento) => ({
  version: d.version, vigenteDesde: d.vigenteDesde,
  idiomas: Object.fromEntries(Object.entries(d.idiomas).map(([l, t]) => [l, t && {
    titulo: t.titulo, resumen: t.resumen, secciones: t.secciones.map(({ id, titulo, texto }) => ({ id, titulo, texto })),
  }])),
});

// ─── UI ──────────────────────────────────────────────────────────────────────
const Etiqueta: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <div className="mb-1.5">
    <span className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk(mt) }}>{children}</span>
    {hint && <span className="ml-2 text-[10px] font-light" style={{ color: 'var(--moon-muted)' }}>{hint}</span>}
  </div>
);

const estiloControl: React.CSSProperties = { background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' };
const Entrada: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all focus:border-white/20 ${props.className ?? ''}`} style={{ ...estiloControl, ...props.style }} />
);
const Area: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea {...props} className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all leading-relaxed resize-y focus:border-white/20 ${props.className ?? ''}`} style={{ ...estiloControl, ...props.style }} />
);
const BotonSec: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className, ...props }) => (
  <button type="button" {...props} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover disabled:opacity-40 disabled:pointer-events-none ${className ?? ''}`} style={{ border: `1px solid ${bd}`, color: panelInk(mt), ...props.style }}>
    {children}
  </button>
);
const BotonIcono: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => (
  <button type="button" {...props} className="w-7 h-7 flex items-center justify-center rounded-lg transition-all moon-panel-hover disabled:opacity-25 disabled:pointer-events-none" style={{ color: panelInk(mt), ...props.style }}>
    {children}
  </button>
);

// ─── Panel ───────────────────────────────────────────────────────────────────
export const LegalLunaPanel: React.FC<{ lunaFetch: LunaFetch }> = ({ lunaFetch }) => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [originales, setOriginales] = useState<Partial<Record<DocId, Documento>>>({});
  const [borradores, setBorradores] = useState<Partial<Record<DocId, Documento>>>({});
  const [docActivo, setDocActivo] = useState<DocId>('privacidad');
  const [lang, setLang] = useState<Lang>('es');
  const [guardando, setGuardando] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(0);

  const pedir = useCallback(() => {
    lunaFetch('/api/bot/legal')
      .then(r => {
        const lista = (r.data ?? []) as Documento[];
        const m: Partial<Record<DocId, Documento>> = {};
        for (const d of lista) m[d.doc] = d;
        setOriginales(m); setBorradores(copia(m));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo conectar con la API de Luna NET'))
      .finally(() => setCargando(false));
  }, [lunaFetch]);

  useEffect(() => { pedir(); }, [pedir]);
  const reintentar = () => { setCargando(true); setError(null); pedir(); };

  const doc = borradores[docActivo];
  const original = originales[docActivo];
  const sucio = (id: DocId) => !!borradores[id] && JSON.stringify(paraGuardar(borradores[id]!)) !== JSON.stringify(paraGuardar(originales[id]!));
  const hayCambios = sucio(docActivo);
  const texto = doc?.idiomas[lang];

  // Aviso del navegador si se cierra con cambios sin guardar.
  const algunoSucio = DOCS.some(d => sucio(d.id));
  useEffect(() => {
    if (!algunoSucio) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [algunoSucio]);

  const cambiarDoc = (f: (d: Documento) => void) => setBorradores(prev => {
    const d = prev[docActivo]; if (!d) return prev;
    const nuevo = copia(d); f(nuevo);
    return { ...prev, [docActivo]: nuevo };
  });
  const cambiarTexto = (f: (t: TextoIdioma) => void) => cambiarDoc(d => { const t = d.idiomas[lang]; if (t) f(t); });

  const guardar = async () => {
    if (!doc) return;
    setGuardando(true);
    try {
      const r = await lunaFetch(`/api/bot/legal/${docActivo}`, { method: 'PUT', body: JSON.stringify(paraGuardar(doc)) });
      const d = r.data as Documento;
      setOriginales(p => ({ ...p, [docActivo]: d }));
      setBorradores(p => ({ ...p, [docActivo]: copia(d) }));
      toast.success(`Publicado en la web de Luna: ${DOCS.find(x => x.id === docActivo)!.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setGuardando(false); }
  };

  const restaurar = async () => {
    const nombre = DOCS.find(x => x.id === docActivo)!.label;
    if (!window.confirm(`¿Volver al texto predeterminado de ${nombre}? Se pierde la versión editada en los cuatro idiomas.`)) return;
    setGuardando(true);
    try {
      const r = await lunaFetch(`/api/bot/legal/${docActivo}`, { method: 'DELETE' });
      const d = r.data as Documento;
      setOriginales(p => ({ ...p, [docActivo]: d }));
      setBorradores(p => ({ ...p, [docActivo]: copia(d) }));
      toast.success(`${nombre} volvió al texto predeterminado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo restaurar');
    } finally { setGuardando(false); }
  };

  const descartar = () => { if (original) setBorradores(p => ({ ...p, [docActivo]: copia(original) })); };

  const crearIdiomaDesdeEs = () => cambiarDoc(d => { if (d.idiomas.es) d.idiomas[lang] = copia(d.idiomas.es); });
  const quitarIdioma = () => {
    if (!window.confirm('¿Quitar este idioma? La web mostrará el texto en español a quien lo tenga elegido.')) return;
    cambiarDoc(d => { delete d.idiomas[lang]; });
  };

  const agregarSeccion = () => {
    cambiarTexto(t => {
      const id = idUnico('nueva-seccion', t.secciones.map(s => s.id));
      t.secciones.push({ id, titulo: 'Nueva sección', texto: '', nueva: true });
    });
    setAbierta(texto ? texto.secciones.length : 0);
  };
  const moverSeccion = (i: number, dir: -1 | 1) => {
    cambiarTexto(t => { const j = i + dir; [t.secciones[i], t.secciones[j]] = [t.secciones[j], t.secciones[i]]; });
    setAbierta(a => (a === i ? i + dir : a === i + dir ? i : a));
  };
  const borrarSeccion = (i: number) => {
    if (!window.confirm(`¿Borrar la sección "${texto?.secciones[i]?.titulo}"?`)) return;
    cambiarTexto(t => { t.secciones.splice(i, 1); });
    setAbierta(null);
  };

  if (cargando) return (
    <div className="flex flex-col items-center justify-center h-40 gap-3">
      <div className="w-5 h-5 border moon-panel-border border-t-zinc-300 rounded-full animate-spin" />
      <p className="text-xs font-light" style={{ color: panelInk(mt) }}>Cargando textos legales…</p>
    </div>
  );
  if (error || !doc) return (
    <div className="flex flex-col items-center justify-center h-40 gap-4 rounded-2xl text-center px-4" style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}>
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: panelInk('#f87171') }} strokeWidth={1.5} />
        <p className="text-sm font-light" style={{ color: panelInk('#f87171') }}>{error ?? 'La API no devolvió los textos legales.'}</p>
      </div>
      <BotonSec onClick={reintentar}><RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Reintentar</BotonSec>
    </div>
  );

  const infoDoc = DOCS.find(x => x.id === docActivo)!;

  return (
    <div className="space-y-5">
      {/* ── Documento ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {DOCS.map(({ id, label, Icon, color }) => {
          const o = originales[id]; const activo = id === docActivo;
          return (
            <button key={id} type="button" onClick={() => { setDocActivo(id); setAbierta(0); }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all moon-panel-hover"
              style={{ background: activo ? 'color-mix(in srgb, var(--moon-ink) 6%, transparent)' : 'transparent', border: `1px solid ${activo ? `${color}55` : bd}` }}>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
                <Icon className="w-4 h-4" style={{ color: panelInk(color) }} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-light moon-panel-ink">
                  {label}
                  {sucio(id) && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#facc15' }} title="Cambios sin guardar" />}
                </span>
                <span className="block text-[11px] font-light truncate" style={{ color: panelInk(mt) }}>
                  {o?.predeterminado ? 'Texto predeterminado' : `Editado · ${fechaHora(o?.actualizadoEn ?? null)}`} · v{o?.version}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Datos del documento ── */}
      <div className="rounded-2xl p-4 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <infoDoc.Icon className="w-4 h-4" style={{ color: panelInk(infoDoc.color) }} strokeWidth={1.5} />
            <span className="text-sm font-light moon-panel-ink">{infoDoc.label}</span>
            <span className="text-[10px] font-light px-2 py-0.5 rounded-full" style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}>/{docActivo}</span>
          </div>
          <a href={`${WEB}/${docActivo}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-light transition-all moon-panel-hover" style={{ color: panelInk(mt) }}>
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} /> Ver en la web
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Etiqueta hint="súbela cuando cambies algo importante">Versión</Etiqueta>
            <Entrada value={doc.version} maxLength={20} onChange={e => cambiarDoc(d => { d.version = e.target.value; })} placeholder="3.1" />
          </div>
          <div>
            <Etiqueta>Vigente desde</Etiqueta>
            <div className="flex gap-2">
              <Entrada type="date" value={doc.vigenteDesde} onChange={e => cambiarDoc(d => { d.vigenteDesde = e.target.value; })} style={{ colorScheme: 'dark' }} />
              <BotonSec onClick={() => cambiarDoc(d => { d.vigenteDesde = hoy(); })} className="flex-shrink-0">Hoy</BotonSec>
            </div>
          </div>
        </div>
      </div>

      {/* ── Idioma ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
          {LANGS.map(l => (
            <button key={l.id} type="button" onClick={() => { setLang(l.id); setAbierta(0); }}
              className="px-3 py-1.5 rounded-lg text-xs font-light transition-all"
              style={{ background: lang === l.id ? 'color-mix(in srgb, var(--moon-ink) 8%, transparent)' : 'transparent', color: panelInk(lang === l.id ? 'var(--moon-ink)' : mt), opacity: doc.idiomas[l.id] ? 1 : 0.55 }}>
              {l.label}
            </button>
          ))}
        </div>
        {lang !== 'es' && texto && (
          <BotonSec onClick={quitarIdioma}><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Quitar idioma</BotonSec>
        )}
      </div>

      {!texto ? (
        <div className="rounded-2xl p-6 text-center space-y-3" style={{ border: `1px dashed ${bd}` }}>
          <p className="text-sm font-light" style={{ color: panelInk(mt) }}>
            Este documento no tiene texto en {LANGS.find(l => l.id === lang)!.label}: la web muestra el español a quien tenga ese idioma.
          </p>
          <div className="flex justify-center">
            <BotonSec onClick={crearIdiomaDesdeEs}><Copy className="w-3.5 h-3.5" strokeWidth={1.5} /> Crear a partir del español</BotonSec>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <Etiqueta>Título</Etiqueta>
              <Entrada value={texto.titulo} maxLength={120} onChange={e => cambiarTexto(t => { t.titulo = e.target.value; })} />
            </div>
            <div>
              <Etiqueta hint={`${texto.resumen.length}/600`}>Resumen</Etiqueta>
              <Area rows={2} value={texto.resumen} maxLength={600} onChange={e => cambiarTexto(t => { t.resumen = e.target.value; })} />
            </div>
          </div>

          <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl text-[11px] font-light leading-relaxed" style={{ background: 'rgba(165,180,252,0.05)', border: '1px solid rgba(165,180,252,0.15)', color: panelInk(mt) }}>
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: panelInk('#a5b4fc') }} strokeWidth={1.5} />
            <span>
              Formato del texto: una línea en blanco separa párrafos · <code className="moon-panel-muted">- </code> al inicio hace una lista ·
              {' '}<code className="moon-panel-muted">**negrita**</code> · una línea solo en negrita es un subtítulo ·
              {' '}<code className="moon-panel-muted">[texto](https://…)</code>, <code className="moon-panel-muted">[correo](mailto:…)</code> o <code className="moon-panel-muted">[otra página](/cookies)</code> para enlaces.
            </span>
          </div>

          {/* ── Secciones ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Etiqueta>Secciones ({texto.secciones.length})</Etiqueta>
              <BotonSec onClick={agregarSeccion} disabled={texto.secciones.length >= 40}><Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Añadir sección</BotonSec>
            </div>
            {texto.secciones.map((s, i) => {
              const abiertaAqui = abierta === i;
              return (
                <div key={i} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${abiertaAqui ? 'color-mix(in srgb, var(--moon-ink) 14%, transparent)' : bd}`, background: abiertaAqui ? sf : 'transparent' }}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" onClick={() => setAbierta(abiertaAqui ? null : i)} className="flex items-center gap-3 min-w-0 flex-1 text-left py-1">
                      <span className="text-[10px] font-mono flex-shrink-0" style={{ color: panelInk(mt) }}>{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-sm font-light moon-panel-ink truncate">{s.titulo || 'Sin título'}</span>
                    </button>
                    <BotonIcono title="Subir" onClick={() => moverSeccion(i, -1)} disabled={i === 0}><ArrowUp className="w-3.5 h-3.5" strokeWidth={1.5} /></BotonIcono>
                    <BotonIcono title="Bajar" onClick={() => moverSeccion(i, 1)} disabled={i === texto.secciones.length - 1}><ArrowDown className="w-3.5 h-3.5" strokeWidth={1.5} /></BotonIcono>
                    <BotonIcono title="Borrar sección" onClick={() => borrarSeccion(i)} disabled={texto.secciones.length <= 1}><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /></BotonIcono>
                  </div>
                  {abiertaAqui && (
                    <div className="px-3 pb-3 space-y-3 border-t pt-3" style={{ borderColor: bd }}>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
                        <div>
                          <Etiqueta>Título de la sección</Etiqueta>
                          <Entrada value={s.titulo} maxLength={150} onChange={e => cambiarTexto(t => {
                            const sec = t.secciones[i];
                            // Una sección nueva toma su identificador del título; una existente lo conserva (hay enlaces que apuntan a él).
                            if (sec.nueva) sec.id = idUnico(slug(e.target.value), t.secciones.filter((_, k) => k !== i).map(x => x.id));
                            sec.titulo = e.target.value;
                          })} />
                        </div>
                        <div>
                          <Etiqueta hint="para enlazar">Identificador</Etiqueta>
                          <Entrada value={s.id} maxLength={40} className="font-mono text-xs"
                            onChange={e => cambiarTexto(t => { const sec = t.secciones[i]; sec.id = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); sec.nueva = false; })} />
                        </div>
                      </div>
                      <div>
                        <Etiqueta hint={`${s.texto.length}/10000 · /${docActivo}#${s.id}`}>Texto</Etiqueta>
                        <Area rows={Math.min(22, Math.max(6, s.texto.split('\n').length + 2))} value={s.texto} maxLength={10000}
                          onChange={e => cambiarTexto(t => { t.secciones[i].texto = e.target.value; })} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Acciones ── */}
      <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-t" style={{ background: sf, borderColor: bd }}>
        <div className="flex flex-wrap gap-2">
          <BotonSec onClick={descartar} disabled={!hayCambios || guardando}><Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Descartar cambios</BotonSec>
          <BotonSec onClick={restaurar} disabled={guardando || !!original?.predeterminado}><RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} /> Restaurar predeterminado</BotonSec>
        </div>
        <div className="flex items-center gap-3">
          {hayCambios && <span className="text-[11px] font-light" style={{ color: panelInk('#facc15') }}>Cambios sin guardar</span>}
          <button type="button" onClick={guardar} disabled={guardando || !hayCambios}
            className="moon-panel-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}>
            {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Save className="w-4 h-4" strokeWidth={1.5} /> Publicar {infoDoc.label.toLowerCase()}</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalLunaPanel;
