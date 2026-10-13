import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Smile, Search, RefreshCw, X, Loader2, AlertTriangle, RotateCcw, CheckCircle2, Upload, Copy, Trash2,
  ImagePlus, Layers, Sparkles,
} from 'lucide-react';
import {
  getEmojis, setEmoji, subirEmojiPropio, borrarEmojiPropio,
  type DatosEmojis, type EmojiBot, type EmojiPropio,
} from '@/services/discordApi';
import { CSS_WEBS } from '@/components/webs/estilos';

// ─── Bot de Discord → Emojis ─────────────────────────────────────────────────
// Los emojis «con significado» del bot (la moneda, los rangos, las mascotas,
// los ítems…), que viven en src/utils/core/emojis.js del bot. Desde acá se
// cambian sin tocar código: se guardan en Firestore y el bot los aplica al
// momento. También se suben emojis propios a la aplicación del bot, que es lo
// que hace falta para que un <:nombre:id> se vea en cualquier servidor.

const ORIGEN = {
  fabrica: { nombre: 'De fábrica', color: '#a1a1aa' },
  archivo: { nombre: 'Archivo', color: '#60a5fa' },
  panel:   { nombre: 'Cambiado aquí', color: '#22c55e' },
} as const;

const RE_DISCORD = /^<a?:[A-Za-z0-9_]{2,32}:\d{15,25}>$/;

/** Cómo se ve un emoji: el unicode tal cual, o la imagen del CDN si es propio. */
function Vista({ valor, url, size = 26 }: { valor: string; url?: string | null; size?: number }) {
  const id = valor.match(/:(\d+)>$/)?.[1];
  const src = url ?? (id ? `https://cdn.discordapp.com/emojis/${id}.${valor.startsWith('<a:') ? 'gif' : 'png'}?size=64` : null);
  if (RE_DISCORD.test(valor) && src) return <img src={src} alt={valor} width={size} height={size} style={{ objectFit: 'contain' }} />;
  return <span style={{ fontSize: size * 0.95, lineHeight: 1 }}>{valor}</span>;
}

export function EmojisPanel() {
  const [datos, setDatos] = useState<DatosEmojis | null>(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState<'bot' | 'propios'>('bot');
  const [grupo, setGrupo] = useState('todos');
  const [filtro, setFiltro] = useState<'todos' | 'cambiados' | 'rotos'>('todos');
  const [buscar, setBuscar] = useState('');
  const [editando, setEditando] = useState<{ grupo: string; item: EmojiBot } | null>(null);

  const cargar = useCallback(() => getEmojis()
    .then(d => { setDatos(d); setError(''); })
    .catch((e: Error) => setError(e.message || 'No se pudo conectar con el bot.')), []);
  useEffect(() => { void cargar(); }, [cargar]);

  const todos = useMemo(() => (datos?.grupos ?? []).flatMap(g => g.items.map(item => ({ grupo: g, item }))), [datos]);
  const rotos = todos.filter(x => !x.item.disponible).length;
  const cambiados = todos.filter(x => x.item.origen === 'panel').length;
  const q = buscar.trim().toLowerCase();
  const visibles = todos.filter(({ grupo: g, item }) =>
    (grupo === 'todos' || g.id === grupo)
    && (filtro === 'todos' || (filtro === 'cambiados' ? item.origen === 'panel' : !item.disponible))
    && (!q || item.clave.toLowerCase().includes(q) || g.nombre.toLowerCase().includes(q) || item.valor.includes(buscar.trim())));

  const alGuardar = (grupoId: string, nuevo: EmojiBot) => {
    setDatos(d => d && { ...d, grupos: d.grupos.map(g => g.id !== grupoId ? g : { ...g, items: g.items.map(i => i.clave === nuevo.clave ? nuevo : i) }) });
    setEditando(e => e && { ...e, item: nuevo });
  };

  if (error && !datos) return (
    <div className="wb-tarjeta wb-vacio"><AlertTriangle />{error}<button type="button" className="wb-btn" onClick={() => { setError(''); void cargar(); }}><RefreshCw />Reintentar</button></div>
  );
  if (!datos) return <div className="wb-vacio"><Loader2 className="animate-spin" />Cargando los emojis del bot…</div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <style>{CSS_WEBS + CSS}</style>

      <div className="wb-kpis">
        {[
          { t: 'Emojis del bot', v: String(todos.length), s: `${datos.grupos.length} grupos`, I: Smile },
          { t: 'Cambiados aquí', v: String(cambiados), s: datos.actualizado ? `Último cambio ${new Date(datos.actualizado.en).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}` : 'Ninguno todavía', I: Sparkles },
          { t: 'No se ven', v: String(rotos), s: rotos ? 'El bot no tiene esos emojis' : 'Todos se muestran bien', I: AlertTriangle },
          { t: 'Propios del bot', v: `${datos.enAplicacion}`, s: `de ${datos.limiteAplicacion.toLocaleString('es-PE')} posibles`, I: ImagePlus },
        ].map(k => (
          <div key={k.t} className="wb-tarjeta wb-kpi"><div className="wb-kpi-cab">{k.t}<k.I /></div><b>{k.v}</b><small>{k.s}</small></div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div className="wb-segmento" role="group">
          <button type="button" aria-pressed={vista === 'bot'} onClick={() => setVista('bot')}><Layers size={13} />Emojis del bot</button>
          <button type="button" aria-pressed={vista === 'propios'} onClick={() => setVista('propios')}><ImagePlus size={13} />Emojis propios<i>{datos.propios.length}</i></button>
        </div>
        <button type="button" className="wb-btn" style={{ marginLeft: 'auto' }} onClick={() => void cargar()} title="Recargar"><RefreshCw /></button>
      </div>

      {vista === 'bot' ? (
        <div className="em-cuerpo">
          <nav className="em-grupos" aria-label="Grupos">
            <button type="button" className="wb-item" aria-current={grupo === 'todos' ? 'page' : undefined} onClick={() => setGrupo('todos')}><Layers strokeWidth={1.5} /><span>Todos</span><i className="em-cuenta">{todos.length}</i></button>
            {datos.grupos.map(g => {
              const malos = g.items.filter(i => !i.disponible).length;
              return (
                <button key={g.id} type="button" className="wb-item" aria-current={grupo === g.id ? 'page' : undefined} onClick={() => setGrupo(g.id)}>
                  <span className="em-grupo-ico"><Vista valor={g.items[0]?.valor ?? '•'} url={g.items[0]?.url} size={15} /></span>
                  <span>{g.nombre}</span>
                  {malos > 0 ? <i className="wb-insignia" style={{ fontStyle: 'normal' }}>{malos}</i> : <i className="em-cuenta">{g.items.length}</i>}
                </button>
              );
            })}
          </nav>

          <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <div className="wb-buscar"><Search /><input className="wb-input" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre (moneda, dragon…) o pegar un emoji" /></div>
              <div className="wb-segmento" role="group">
                <button type="button" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</button>
                <button type="button" aria-pressed={filtro === 'cambiados'} onClick={() => setFiltro('cambiados')}>Cambiados<i>{cambiados}</i></button>
                <button type="button" aria-pressed={filtro === 'rotos'} onClick={() => setFiltro('rotos')}>No se ven<i>{rotos}</i></button>
              </div>
            </div>

            {visibles.length === 0 ? (
              <div className="wb-tarjeta wb-vacio"><Smile />Nada coincide con la búsqueda.</div>
            ) : (
              <div className="em-rejilla">
                {visibles.map(({ grupo: g, item }) => (
                  <button key={`${g.id}.${item.clave}`} type="button" className={`em-celda${!item.disponible ? ' em-rota' : ''}`} onClick={() => setEditando({ grupo: g.id, item })} title={`${g.id}.${item.clave}`}>
                    <span className="em-emoji"><Vista valor={item.valor} url={item.url} size={30} /></span>
                    <b>{item.clave.replace(/_/g, ' ')}</b>
                    {grupo === 'todos' && <small>{g.nombre}</small>}
                    {item.origen !== 'fabrica' && <i className="em-marca" style={{ background: ORIGEN[item.origen].color }} title={ORIGEN[item.origen].nombre} />}
                    {!item.disponible && <AlertTriangle className="em-aviso" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <Propios datos={datos} onCambio={cargar} />
      )}

      {editando && (
        <Editor grupo={datos.grupos.find(g => g.id === editando.grupo)!} item={editando.item} propios={datos.propios}
          onCerrar={() => setEditando(null)} onGuardado={n => alGuardar(editando.grupo, n)} />
      )}
    </div>
  );
}

// ── Cambiar un emoji ─────────────────────────────────────────────────────────

function Editor({ grupo, item, propios, onCerrar, onGuardado }: {
  grupo: { id: string; nombre: string }; item: EmojiBot; propios: EmojiPropio[]; onCerrar: () => void; onGuardado: (n: EmojiBot) => void;
}) {
  const [valor, setValor] = useState(item.valor);
  const [guardando, setGuardando] = useState(false);
  const [buscarPropio, setBuscarPropio] = useState('');
  const limpio = valor.trim();
  const valido = RE_DISCORD.test(limpio) || (limpio.length > 0 && limpio.length <= 16 && !/^[\x20-\x7E]+$/.test(limpio));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const guardar = async (v: string | null) => {
    setGuardando(true);
    try {
      const n = await setEmoji(grupo.id, item.clave, v);
      onGuardado(n);
      setValor(n.valor);
      toast.success(v === null ? 'Volvió al emoji anterior' : 'Emoji cambiado en todo el bot');
    } catch (e) { toast.error((e as Error).message); }
    setGuardando(false);
  };

  const qp = buscarPropio.trim().toLowerCase();
  const sugeridos = propios.filter(p => !qp || p.nombre.toLowerCase().includes(qp)).slice(0, 60);

  return (
    <>
      <div className="wb-velo" onClick={onCerrar} />
      <aside className="wb-hoja" role="dialog" aria-label={`Emoji ${item.clave}`}>
        <div className="wb-hoja-cab">
          <span className="em-grande"><Vista valor={item.valor} url={item.url} size={36} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 16, fontWeight: 400, color: 'hsl(var(--foreground))' }}>{item.clave.replace(/_/g, ' ')}</b>
            <small style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}>{grupo.id}.{item.clave}</small>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="wb-pill" style={{ '--c': ORIGEN[item.origen].color } as React.CSSProperties}>{ORIGEN[item.origen].nombre}</span>
              {!item.disponible && <span className="wb-pill" style={{ '--c': '#ef4444' } as React.CSSProperties}><AlertTriangle size={11} />No se ve</span>}
            </div>
          </div>
          <button type="button" className="wb-btn" style={{ width: 34, padding: 0 }} onClick={onCerrar} aria-label="Cerrar"><X /></button>
        </div>

        <div className="wb-hoja-cuerpo">
          {!item.disponible && (
            <p className="em-alerta"><AlertTriangle size={15} />El bot no tiene este emoji propio: en Discord se ve el texto «{item.valor.split(':')[1]}» en vez de la imagen. Súbelo en «Emojis propios» o elige otro.</p>
          )}

          <div>
            <span className="wb-etiqueta">Nuevo emoji</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="em-previa">{valido ? <Vista valor={limpio} size={26} /> : <span style={{ opacity: .4 }}>?</span>}</span>
              <input className="wb-input" value={valor} onChange={e => setValor(e.target.value)} placeholder="🌙 o <:nombre:id>" style={{ fontFamily: RE_DISCORD.test(limpio) ? 'monospace' : undefined }} />
            </div>
            <small className="em-ayuda">Pega un emoji normal, o uno propio con la forma {'<:nombre:id>'} (animado: {'<a:nombre:id>'}). En Discord: escribe \:nombre: en un mensaje para ver su código.</small>
          </div>

          <div>
            <span className="wb-etiqueta">Elegir un emoji propio del bot</span>
            <div className="wb-buscar" style={{ marginBottom: 8 }}><Search /><input className="wb-input" value={buscarPropio} onChange={e => setBuscarPropio(e.target.value)} placeholder="Buscar por nombre" /></div>
            {sugeridos.length ? (
              <div className="em-propios-mini">
                {sugeridos.map(p => (
                  <button key={p.id} type="button" title={`${p.nombre} · ${p.origen}`} aria-pressed={limpio === p.codigo} onClick={() => setValor(p.codigo)}>
                    <img src={p.url} alt={p.nombre} width={26} height={26} />
                  </button>
                ))}
              </div>
            ) : <small className="em-ayuda">No hay emojis propios con ese nombre.</small>}
          </div>

          <dl className="wb-datos">
            <div><dt>De fábrica</dt><dd><Vista valor={item.base} size={20} /></dd></div>
            <div><dt>Si lo restableces</dt><dd><Vista valor={item.antes} size={20} /></dd></div>
          </dl>
        </div>

        <div className="wb-hoja-pie">
          {item.origen === 'panel' && (
            <button type="button" className="wb-btn" onClick={() => guardar(null)} disabled={guardando} title="Vuelve al emoji del archivo o al de fábrica"><RotateCcw />Restablecer</button>
          )}
          <button type="button" className="wb-btn wb-btn-fuerte" style={{ flex: 1 }} onClick={() => guardar(limpio)} disabled={!valido || limpio === item.valor || guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Guardar en todo el bot
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Emojis propios ───────────────────────────────────────────────────────────

function Propios({ datos, onCambio }: { datos: DatosEmojis; onCambio: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia); }, [vistaPrevia]);

  const elegir = (f: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type)) return toast.error('Usa una imagen PNG, JPG, WEBP o GIF.');
    if (f.size > 256 * 1024) return toast.error('La imagen pesa más de 256 KB (el límite de Discord).');
    setArchivo(f);
    setVistaPrevia(URL.createObjectURL(f));
    if (!nombre) setNombre(f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32));
  };

  const nombreOk = /^[A-Za-z0-9_]{2,32}$/.test(nombre);
  const subir = async () => {
    if (!archivo || !nombreOk) return;
    setSubiendo(true);
    try {
      const e = await subirEmojiPropio(archivo, nombre);
      await navigator.clipboard.writeText(e.codigo).catch(() => {});
      toast.success(`Subido. Código copiado: ${e.codigo}`);
      setArchivo(null); setVistaPrevia(null); setNombre('');
      onCambio();
    } catch (e) { toast.error((e as Error).message); }
    setSubiendo(false);
  };

  const borrar = async (p: EmojiPropio) => {
    if (!confirm(`¿Borrar el emoji «${p.nombre}» de la aplicación del bot?`)) return;
    setBorrando(p.id);
    try { await borrarEmojiPropio(p.id); toast.success('Emoji borrado'); onCambio(); }
    catch (e) { toast.error((e as Error).message); }
    setBorrando(null);
  };

  const q = buscar.trim().toLowerCase();
  const lista = datos.propios.filter(p => !q || p.nombre.toLowerCase().includes(q) || p.origen.toLowerCase().includes(q));
  const deApp = lista.filter(p => p.borrable);
  const deServidores = lista.filter(p => !p.borrable);

  const Celda = ({ p }: { p: EmojiPropio }) => (
    <div className="em-propio">
      <img src={p.url} alt={p.nombre} width={34} height={34} />
      <b title={p.nombre}>{p.nombre}</b>
      <small title={p.origen}>{p.animado ? 'Animado · ' : ''}{p.origen}</small>
      <div className="em-propio-acciones">
        <button type="button" title="Copiar el código" onClick={() => { void navigator.clipboard.writeText(p.codigo); toast.success(`Copiado: ${p.codigo}`); }}><Copy size={13} /></button>
        {p.borrable && <button type="button" title="Borrar" onClick={() => borrar(p)} disabled={borrando === p.id}>{borrando === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}</button>}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="wb-tarjeta em-subir">
        <button type="button" className="em-soltar" onClick={() => input.current?.click()}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) elegir(f); }}>
          {vistaPrevia ? <img src={vistaPrevia} alt="" width={56} height={56} /> : <><Upload size={20} /><span>Elegir imagen</span></>}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { const f = e.target.files?.[0]; if (f) elegir(f); e.target.value = ''; }} />
        <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 8 }}>
          <div>
            <b style={{ fontSize: 13, fontWeight: 400, color: 'hsl(var(--foreground))' }}>Subir un emoji propio al bot</b>
            <small className="em-ayuda" style={{ marginTop: 2 }}>Se sube a la aplicación del bot: lo puede usar en cualquier servidor. PNG, JPG, WEBP o GIF (animado) de hasta 256 KB; idealmente 128×128.</small>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="wb-input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="nombre_del_emoji" maxLength={32} style={{ fontFamily: 'monospace' }} />
            <button type="button" className="wb-btn wb-btn-fuerte" onClick={subir} disabled={!archivo || !nombreOk || subiendo}>{subiendo ? <Loader2 className="animate-spin" /> : <Upload />}Subir</button>
          </div>
          {nombre && !nombreOk && <small style={{ fontSize: 11, color: '#ef4444' }}>De 2 a 32 caracteres: letras, números y guion bajo.</small>}
        </div>
      </section>

      <div className="wb-buscar"><Search /><input className="wb-input" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre o servidor" /></div>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 className="wb-h2"><ImagePlus />De la aplicación del bot <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 300 }}>· {deApp.length}</span></h3>
        {deApp.length ? <div className="em-rejilla-propios">{deApp.map(p => <Celda key={p.id} p={p} />)}</div>
          : <div className="wb-tarjeta wb-vacio" style={{ padding: 20 }}>{q ? 'Ninguno coincide.' : 'Todavía no hay emojis subidos a la aplicación.'}</div>}
      </section>
      {deServidores.length > 0 && (
        <section style={{ display: 'grid', gap: 10 }}>
          <h3 className="wb-h2"><Layers />De los servidores donde está el bot <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 300 }}>· {deServidores.length}</span></h3>
          <div className="em-rejilla-propios">{deServidores.map(p => <Celda key={p.id} p={p} />)}</div>
        </section>
      )}
    </div>
  );
}

const T = 'hsl(var(--foreground))';
const tinte = (p: number) => `color-mix(in srgb, ${T} ${p}%, transparent)`;
const CSS = `
.em-cuerpo { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 16px; align-items: start; }
.em-grupos { position: sticky; top: 12px; display: grid; gap: 2px; padding: 8px; border-radius: 16px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); }
.em-grupo-ico { flex: none; width: 18px; display: grid; place-items: center; }
.em-cuenta { font-style: normal; font-size: 10.5px; color: hsl(var(--muted-foreground)); }
.em-rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
.em-celda { position: relative; display: grid; justify-items: center; gap: 4px; padding: 14px 8px 10px; border-radius: 14px; cursor: pointer; text-align: center;
  background: hsl(var(--card)); border: 1px solid hsl(var(--border)); color: ${T}; transition: background .2s, border-color .2s, transform .2s; }
.em-celda:hover { background: ${tinte(5)}; border-color: ${tinte(18)}; transform: translateY(-1px); }
.em-celda b { max-width: 100%; font-size: 11.5px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.em-celda small { font-size: 10px; color: hsl(var(--muted-foreground)); }
.em-emoji { height: 34px; display: grid; place-items: center; }
.em-marca { position: absolute; top: 8px; left: 8px; width: 7px; height: 7px; border-radius: 50%; }
.em-aviso { position: absolute; top: 7px; right: 7px; width: 13px; height: 13px; color: #ef4444; }
.em-rota { border-color: rgba(239, 68, 68, .35); }
.em-grande { flex: none; width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; background: ${tinte(5)}; }
.em-previa { flex: none; width: 40px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: ${tinte(5)}; color: ${T}; }
.em-ayuda { display: block; margin-top: 6px; font-size: 11px; font-weight: 300; line-height: 1.5; color: hsl(var(--muted-foreground)); }
.em-alerta { display: flex; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 12px; line-height: 1.5; color: #ef4444; background: rgba(239, 68, 68, .07); border: 1px solid rgba(239, 68, 68, .25); }
.em-alerta svg { flex: none; margin-top: 1px; }
.em-propios-mini { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; max-height: 210px; overflow-y: auto; }
.em-propios-mini button { height: 40px; display: grid; place-items: center; border-radius: 10px; cursor: pointer; background: ${tinte(3)}; border: 1px solid transparent; }
.em-propios-mini button:hover { background: ${tinte(8)}; }
.em-propios-mini button[aria-pressed="true"] { border-color: ${tinte(45)}; background: ${tinte(10)}; }
.em-subir { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 16px; }
.em-soltar { flex: none; width: 88px; height: 88px; border-radius: 18px; display: grid; place-items: center; align-content: center; gap: 4px; cursor: pointer; font-size: 11px;
  color: hsl(var(--muted-foreground)); background: ${tinte(3)}; border: 1px dashed ${tinte(25)}; }
.em-soltar:hover { background: ${tinte(6)}; color: ${T}; }
.em-soltar img { object-fit: contain; }
.em-rejilla-propios { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.em-propio { position: relative; display: grid; grid-template-columns: 34px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 10px; align-items: center; padding: 10px; border-radius: 14px;
  background: hsl(var(--card)); border: 1px solid hsl(var(--border)); }
.em-propio img { grid-row: 1 / 3; object-fit: contain; }
.em-propio b { font-size: 12px; font-weight: 400; color: ${T}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.em-propio small { font-size: 10.5px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.em-propio-acciones { position: absolute; top: 6px; right: 6px; display: none; gap: 4px; }
.em-propio:hover .em-propio-acciones { display: flex; }
.em-propio-acciones button { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; cursor: pointer; color: ${T}; background: hsl(var(--secondary)); border: 1px solid hsl(var(--border)); }
@media (max-width: 860px) {
  .em-cuerpo { grid-template-columns: minmax(0, 1fr); }
  .em-grupos { position: static; display: flex; overflow-x: auto; }
  .em-grupos .wb-item { width: auto; white-space: nowrap; }
}
`;
