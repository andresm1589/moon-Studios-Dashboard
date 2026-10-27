import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
import { doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import {
  Building2, Wallet, Clock, Users, Search, X, Mail, FileText, Loader2, Trash2, RefreshCw,
  CheckCircle2, XCircle, RotateCcw, Copy, Inbox, ExternalLink, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, auth } from '@/lib/firebase';
import { NIVELES, nivelDe, sinEmojis, metodoDe, dolares } from './niveles';
import { ESTADOS_SOCIO, cargarSocios, type SocioDoc, type EstadoSocio as Estado } from './datos';

// ─── Socios capitalistas ─────────────────────────────────────────────────────
// Las solicitudes que llegan del portal de clientes (moonStudios/socios/items).
// Acá se revisan: aprobar o rechazar, dejar una nota que el socio ve en su
// portal y marcar cuándo llegó el pago. Cada cambio pone `actualizadoEn`, y
// así el portal le muestra la novedad al socio.

const fecha = (t?: Timestamp | null, hora = false) => {
  if (!t?.toDate) return '—';
  return t.toDate().toLocaleDateString('es-PE', hora ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

export function NivelChip({ monto, etiqueta }: { monto: number; etiqueta?: string }) {
  const n = nivelDe(monto);
  const nombre = sinEmojis(etiqueta) || n.nombre;
  return <span className="wb-con-ico"><n.Icon />{nombre}</span>;
}

export function EstadoSocio({ estado, pago }: { estado: Estado; pago?: boolean }) {
  const e = ESTADOS_SOCIO[estado] ?? ESTADOS_SOCIO.pendiente;
  if (estado === 'aprobado' && pago) return <span className="wb-pill" style={{ '--c': '#22c55e' } as React.CSSProperties}><Wallet size={11} />Pagado</span>;
  return <span className="wb-pill" style={{ '--c': e.color } as React.CSSProperties}>{e.nombre}</span>;
}

export function SociosPanel({ borrarArchivo, onCambio }: { borrarArchivo: (url: string) => Promise<void>; onCambio?: () => void }) {
  const [socios, setSocios] = useState<SocioDoc[] | null>(null);
  const [filtro, setFiltro] = useState<'todos' | Estado | 'pagados'>('todos');
  const [orden, setOrden] = useState<'recientes' | 'monto'>('recientes');
  const [buscar, setBuscar] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(() => cargarSocios()
    .then(setSocios)
    .catch(e => { console.error(e); toast.error('No se pudieron cargar los socios'); setSocios([]); }), []);
  useEffect(() => { void cargar(); }, [cargar]);

  const lista = useMemo(() => socios ?? [], [socios]);
  const aprobados = lista.filter(s => s.estado === 'aprobado');
  const pendientes = lista.filter(s => s.estado === 'pendiente');
  const sumar = (l: SocioDoc[]) => l.reduce((a, s) => a + (Number(s.monto) || 0), 0);

  // Inversores: lo aprobado de cada persona, sumado (su nivel sale del total).
  const inversores = useMemo(() => {
    const m = new Map<string, { nombre: string; total: number }>();
    for (const s of aprobados) {
      const k = s.uid || s.nombre;
      const prev = m.get(k);
      m.set(k, { nombre: s.nombre, total: (prev?.total ?? 0) + (Number(s.monto) || 0) });
    }
    return [...m.values()];
  }, [aprobados]);

  const cuenta = (f: typeof filtro) => f === 'todos' ? lista.length : f === 'pagados' ? lista.filter(s => s.pagoConfirmado).length : lista.filter(s => s.estado === f).length;
  const q = buscar.trim().toLowerCase();
  const visibles = lista
    .filter(s => filtro === 'todos' || (filtro === 'pagados' ? s.pagoConfirmado : s.estado === filtro))
    .filter(s => !q || s.nombre?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
    .sort((a, b) => orden === 'monto' ? b.monto - a.monto : (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0));
  const detalle = abierto ? lista.find(s => s.id === abierto) ?? null : null;

  const copiarCorreos = async () => {
    const correos = [...new Set(aprobados.map(s => s.email).filter(Boolean))];
    if (!correos.length) return toast.error('No hay correos de socios aprobados');
    await navigator.clipboard.writeText(correos.join(', '));
    toast.success(`${correos.length} correo${correos.length > 1 ? 's' : ''} copiado${correos.length > 1 ? 's' : ''}`);
  };

  const alGuardar = (s: SocioDoc) => { setSocios(prev => prev?.map(x => x.id === s.id ? s : x) ?? null); onCambio?.(); };
  const alBorrar = (id: string) => { setSocios(prev => prev?.filter(x => x.id !== id) ?? null); setAbierto(null); onCambio?.(); };

  if (socios === null) return <div className="wb-vacio"><Loader2 className="animate-spin" />Cargando socios…</div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="wb-kpis">
        {[
          { t: 'Capital aprobado', v: dolares(sumar(aprobados)), s: `${aprobados.length} aprobada${aprobados.length === 1 ? '' : 's'}`, I: Building2 },
          { t: 'Pagos recibidos', v: dolares(sumar(aprobados.filter(s => s.pagoConfirmado))), s: `${aprobados.filter(s => s.pagoConfirmado).length} confirmados`, I: Wallet },
          { t: 'En revisión', v: String(pendientes.length), s: `${dolares(sumar(pendientes))} por revisar`, I: Clock },
          { t: 'Inversores', v: String(inversores.length), s: inversores.length ? `Promedio ${dolares(Math.round(sumar(aprobados) / inversores.length))}` : 'Aún ninguno', I: Users },
        ].map(k => (
          <div data-moon-reveal="metric" key={k.t} className="wb-tarjeta wb-kpi">
            <div className="wb-kpi-cab">{k.t}<k.I /></div>
            <b>{k.v}</b><small>{k.s}</small>
          </div>
        ))}
      </div>

      {/* Niveles: cuántos inversores hay en cada uno (por lo aprobado en total). */}
      <div data-moon-reveal="card" className="wb-tarjeta" style={{ padding: 16 }}>
        <h2 className="wb-h2"><Layers />Niveles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
          {[...NIVELES].reverse().map(n => {
            const enNivel = inversores.filter(i => nivelDe(i.total).id === n.id);
            const pct = inversores.length ? (enNivel.length / inversores.length) * 100 : 0;
            return (
              <div key={n.id} style={{ display: 'grid', gap: 6 }}>
                <span className="wb-con-ico" style={{ fontSize: 12, color: 'hsl(var(--foreground))' }}><n.Icon />{n.nombre.replace('Socio ', '')}</span>
                <span style={{ fontSize: 10.5, color: 'hsl(var(--muted-foreground))' }}>desde {dolares(n.desde || 100)}</span>
                <div className="wb-barra"><i style={{ width: `${pct}%` }} /></div>
                <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{enNivel.length} inversor{enNivel.length === 1 ? '' : 'es'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div className="wb-buscar"><Search /><input className="wb-input" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre o correo" /></div>
        <div className="wb-segmento" role="group" aria-label="Filtrar">
          {(['todos', 'pendiente', 'aprobado', 'pagados', 'rechazado'] as const).map(f => (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {f === 'todos' ? 'Todos' : f === 'pagados' ? 'Pagados' : ESTADOS_SOCIO[f].nombre}<i>{cuenta(f)}</i>
            </button>
          ))}
        </div>
        <div className="wb-segmento" role="group" aria-label="Ordenar">
          <button type="button" aria-pressed={orden === 'recientes'} onClick={() => setOrden('recientes')}>Recientes</button>
          <button type="button" aria-pressed={orden === 'monto'} onClick={() => setOrden('monto')}>Mayor monto</button>
        </div>
        <button type="button" className="wb-btn" onClick={copiarCorreos} title="Copia los correos de los socios aprobados"><Copy />Correos</button>
        <button type="button" className="wb-btn" onClick={() => { setSocios(null); cargar(); }} title="Recargar"><RefreshCw /></button>
      </div>

      {visibles.length === 0 ? (
        <div data-moon-reveal="card" className="wb-tarjeta wb-vacio"><Inbox />{lista.length ? 'Nada coincide con la búsqueda o el filtro.' : 'Todavía no llegó ninguna solicitud de socio.'}</div>
      ) : (
        <div className="wb-lista">
          {visibles.map(s => {
            const m = metodoDe(s.metodo);
            return (
              <button data-moon-reveal="row" key={s.id} type="button" className="wb-fila" aria-current={abierto === s.id ? 'true' : undefined} onClick={() => setAbierto(s.id)}>
                <span className="wb-avatar">{(s.nombre || '?').charAt(0).toUpperCase()}</span>
                <span className="wb-fila-texto">
                  <b>{s.nombre || 'Sin nombre'}</b>
                  <small>{s.email || 'Sin correo'} · {fecha(s.creadoEn)}</small>
                </span>
                <span className="wb-fila-texto" style={{ flex: '0 1 170px', display: 'grid', gap: 2 }}>
                  <small style={{ color: 'hsl(var(--foreground))' }}><NivelChip monto={s.monto} etiqueta={s.tierLabel} /></small>
                  <small><span className="wb-con-ico"><m.Icon />{m.nombre}</span>{s.fileUrl && <span className="wb-con-ico"><FileText />PDF</span>}</small>
                </span>
                <span className="wb-monto">{dolares(s.monto)}</span>
                <EstadoSocio estado={s.estado} pago={s.pagoConfirmado} />
              </button>
            );
          })}
        </div>
      )}

      {detalle && <FichaSocio s={detalle} onCerrar={() => setAbierto(null)} onGuardado={alGuardar} onBorrado={alBorrar} borrarArchivo={borrarArchivo} />}
    </div>
  );
}

function FichaSocio({ s, onCerrar, onGuardado, onBorrado, borrarArchivo }: {
  s: SocioDoc; onCerrar: () => void; onGuardado: (s: SocioDoc) => void; onBorrado: (id: string) => void; borrarArchivo: (url: string) => Promise<void>;
}) {
  const [estado, setEstado] = useState<Estado>(s.estado);
  const [nota, setNota] = useState(s.nota ?? '');
  const noteEmojiRef = useRef<HTMLTextAreaElement>(null);
  const [pago, setPago] = useState(!!s.pagoConfirmado);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const m = metodoDe(s.metodo);
  const n = nivelDe(s.monto);
  const cambio = estado !== s.estado || nota.trim() !== (s.nota ?? '') || pago !== !!s.pagoConfirmado;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  // Solo un socio aprobado puede tener el pago confirmado.
  const elegirEstado = (e: Estado) => { setEstado(e); if (e !== 'aprobado') setPago(false); };

  const guardar = async () => {
    setGuardando(true);
    const ahora = Timestamp.now();
    const cambios: Partial<SocioDoc> = {
      estado, nota: nota.trim(), pagoConfirmado: pago, actualizadoEn: ahora, revisadoPor: auth.currentUser?.email ?? '',
      pagoEn: pago ? (s.pagoConfirmado ? s.pagoEn ?? ahora : ahora) : null,
    };
    try {
      await updateDoc(doc(db, 'moonStudios', 'socios', 'items', s.id), cambios);
      onGuardado({ ...s, ...cambios });
      toast.success('Guardado. El socio lo verá en su portal.');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo guardar (¿tu rol es CEO o Administración?)');
    }
    setGuardando(false);
  };

  const borrar = async () => {
    if (!confirm(`¿Eliminar la solicitud de ${s.nombre}? No se puede deshacer.`)) return;
    setBorrando(true);
    try {
      if (s.fileUrl) await borrarArchivo(s.fileUrl);
      await deleteDoc(doc(db, 'moonStudios', 'socios', 'items', s.id));
      toast.success('Solicitud eliminada');
      onBorrado(s.id);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo eliminar');
      setBorrando(false);
    }
  };

  return (
    <>
      <div className="wb-velo" onClick={onCerrar} />
      <aside className="wb-hoja" role="dialog" aria-label={`Socio ${s.nombre}`}>
        <div className="wb-hoja-cab">
          <span className="wb-avatar" style={{ width: 44, height: 44, fontSize: 16 }}>{(s.nombre || '?').charAt(0).toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 16, fontWeight: 400, color: 'hsl(var(--foreground))' }}>{s.nombre || 'Sin nombre'}</b>
            <small style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'hsl(var(--muted-foreground))', overflowWrap: 'anywhere' }}>{s.email || 'Sin correo registrado'}</small>
            <div style={{ marginTop: 8 }}><EstadoSocio estado={s.estado} pago={s.pagoConfirmado} /></div>
          </div>
          <button type="button" className="wb-btn" style={{ width: 34, padding: 0 }} onClick={onCerrar} aria-label="Cerrar"><X /></button>
        </div>

        <div className="wb-hoja-cuerpo">
          <div>
            <span className="wb-etiqueta">Inversión</span>
            <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>{dolares(s.monto)}</div>
          </div>
          <dl className="wb-datos">
            <div><dt>Nivel</dt><dd><span className="wb-con-ico"><n.Icon />{sinEmojis(s.tierLabel) || n.nombre}</span></dd></div>
            <div><dt>Método de pago</dt><dd><span className="wb-con-ico"><m.Icon />{m.nombre}</span></dd></div>
            <div><dt>Enviada</dt><dd>{fecha(s.creadoEn, true)}</dd></div>
            <div><dt>Última revisión</dt><dd>{s.actualizadoEn ? fecha(s.actualizadoEn, true) : 'Sin revisar'}</dd></div>
          </dl>
          {s.revisadoPor && <small style={{ marginTop: -10, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Revisado por {s.revisadoPor}</small>}

          {s.mensaje && <div><span className="wb-etiqueta">Su mensaje</span><p className="wb-cita"><EmojiText text={s.mensaje} /></p></div>}

          {s.fileUrl && (
            <a className="wb-btn" href={s.fileUrl} target="_blank" rel="noopener noreferrer" style={{ justifyContent: 'flex-start' }}>
              <FileText />Ver el documento (PDF)<ExternalLink style={{ marginLeft: 'auto' }} />
            </a>
          )}

          <div>
            <span className="wb-etiqueta">Decisión</span>
            <div className="wb-segmento" style={{ display: 'flex' }}>
              <button type="button" style={{ flex: 1, justifyContent: 'center' }} aria-pressed={estado === 'pendiente'} onClick={() => elegirEstado('pendiente')}><RotateCcw size={13} />En revisión</button>
              <button type="button" style={{ flex: 1, justifyContent: 'center' }} aria-pressed={estado === 'aprobado'} onClick={() => elegirEstado('aprobado')}><CheckCircle2 size={13} />Aprobar</button>
              <button type="button" style={{ flex: 1, justifyContent: 'center' }} aria-pressed={estado === 'rechazado'} onClick={() => elegirEstado('rechazado')}><XCircle size={13} />Rechazar</button>
            </div>
          </div>

          <label className="wb-interruptor" aria-disabled={estado !== 'aprobado'}>
            <span><b>Pago recibido</b><small>{estado === 'aprobado' ? (s.pagoConfirmado && s.pagoEn ? `Confirmado el ${fecha(s.pagoEn)}` : 'Márcalo cuando llegue el dinero.') : 'Primero aprueba la solicitud.'}</small></span>
            <input type="checkbox" checked={pago} disabled={estado !== 'aprobado'} onChange={e => setPago(e.target.checked)} />
          </label>

          <div>
            <span className="wb-etiqueta">Nota para el socio</span>
            <textarea ref={noteEmojiRef} className="wb-input" rows={4} maxLength={1000} value={nota} onChange={e => setNota(e.target.value)}
              placeholder="La verá en su portal. Ej.: «Te escribimos por correo con los datos de la cuenta.»" />
            <EmojiButton value={nota} onChange={setNota} inputRef={noteEmojiRef} maxLength={1000} disabled={guardando || borrando} unicodeOnly label="Añadir emoji a la nota para el socio" />
          </div>
        </div>

        <div className="wb-hoja-pie">
          <button type="button" className="wb-btn wb-btn-peligro" onClick={borrar} disabled={borrando} title="Eliminar">{borrando ? <Loader2 className="animate-spin" /> : <Trash2 />}</button>
          {s.email && <a className="wb-btn" href={`mailto:${s.email}?subject=${encodeURIComponent('Tu inversión en Moon Studios')}`}><Mail />Escribir</a>}
          <button type="button" className="wb-btn wb-btn-fuerte" style={{ flex: 1 }} onClick={guardar} disabled={!cambio || guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Guardar cambios
          </button>
        </div>
      </aside>
    </>
  );
}
