import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, RefreshCw, CalendarDays, Plus, Trash2, ExternalLink, Trophy, Users, Award, Gift, Ghost,
  Terminal, Settings2, Loader2, Save, X, PlayCircle, PauseCircle, Wand2, Clock, CheckCircle2, Archive, Palette, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { BotonSec, Bloque, Entrada, Etiqueta, Interruptor, Seleccion } from './webLuna/ui';
import { WEB, bd, sc, sf, mt, tenue, mensajeError, type LunaFetch } from './webLuna/comun';
import { TiposPanel } from './eventos/TiposPanel';
import { EditorContenido } from './eventos/EditorContenido';
import type { LunaSubir } from './eventos/campos';
import type { Contenido, TipoEvento } from './eventos/modelo';

// ─── Eventos de Luna — el calendario de temporada ────────────────────────────
// Cada evento (Halloween, Navidad, San Valentín…) es un TIPO con su comando,
// sus fechas y su plantilla de contenido, y tiene una EDICIÓN por año. El bot
// decide solo, por fechas, cuándo una edición está en curso: ese día aparece
// su comando en Discord y su página en la web; al terminar, el comando
// desaparece, se entregan los premios y la página pasa al archivo.
//
//   Ediciones        fechas, pausa, forzar, preparación, cifras y premios;
//                    «Personalizar» cambia el contenido de esa edición sola
//   Tipos de evento  crear eventos nuevos y cambiar su plantilla (criaturas,
//                    moneda, insignias, tienda, misiones, bonos, textos, tema)
//
// API: /api/bot/eventos (requiere sesión de staff).

type Estado = 'programado' | 'activo' | 'pausado' | 'terminado';
type Modo = 'auto' | 'activo' | 'pausado';
interface Ganador { puesto: number; userId?: string; nombre: string; avatar: string | null; dulces: number; atrapadas: number }
interface Cifras { participantes: number; top: Ganador[]; premiosEntregadosEn: string | null; insigniasEntregadas: number }
interface Edicion {
  id: string; tipo: string; anio: number; nombre: string; inicio: string; fin: string;
  modo: Modo; anticipacionDias: number; mostrarEnWeb: boolean; base: boolean; actualizadoEn: string | null;
  estado: Estado; enPreparacion: boolean; emoji: string; color: string; tipoNombre?: string; contenidoPropio?: boolean;
  moneda?: { nombre: string; emoji: string } | null;
  comandos: string[]; comandosVisibles: boolean; esActual: boolean; criaturasSueltas: number | null; cifras: Cifras | null;
}
type Tipo = TipoEvento;
interface Datos {
  ahora: string; ediciones: Edicion[]; tipos: Tipo[];
  comandos: { firma?: string; en?: string; visibles: string[]; firmaActual: string };
}

const ESTADOS: Record<Estado, { label: string; color: string; Icon: React.ElementType }> = {
  activo: { label: 'En curso', color: '#4ade80', Icon: PlayCircle },
  pausado: { label: 'En pausa', color: '#facc15', Icon: PauseCircle },
  programado: { label: 'Programado', color: '#a5b4fc', Icon: Clock },
  terminado: { label: 'Terminado', color: '#94a3b8', Icon: Archive },
};
const MODOS: { id: Modo; label: string; texto: string }[] = [
  { id: 'auto', label: 'Automático', texto: 'Empieza y termina solo en las fechas.' },
  { id: 'activo', label: 'Forzar activo', texto: 'Corre ya, aunque todavía no sea la fecha de inicio.' },
  { id: 'pausado', label: 'Pausar', texto: 'Sin criaturas ni tienda; los comandos siguen visibles.' },
];

// ─── Fechas: todo en hora de Lima (UTC−5, sin horario de verano) ─────────────
const LIMA = 5 * 3600e3;
const aLima = (iso: string) => new Date(Date.parse(iso) - LIMA).toISOString().slice(0, 16);
const deLima = (v: string) => new Date(Date.parse(`${v}:00.000Z`) + LIMA).toISOString();
const fecha = (iso: string, conHora = false) => new Date(iso).toLocaleString('es-PE', {
  timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric', ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
});
const mil = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-PE'));
function duracion(ms: number) {
  const m = Math.max(0, Math.round(ms / 60e3));
  const d = Math.floor(m / 1440), h = Math.floor(m / 60) % 24, mm = m % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${mm} min`;
  return `${mm} min`;
}

const Pastilla: React.FC<{ color: string; children: React.ReactNode; title?: string }> = ({ color, children, title }) => (
  <span title={title} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-light whitespace-nowrap"
    style={{ background: `${color}12`, color, border: `1px solid ${color}30` }}>{children}</span>
);

const Cifra: React.FC<{ Icon: React.ElementType; valor: React.ReactNode; label: string; color?: string }> = ({ Icon, valor, label, color = '#a5b4fc' }) => (
  <div className="rounded-xl px-3 py-2.5 min-w-0" style={{ background: sc, border: `1px solid ${bd}` }}>
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>
      <Icon className="w-3 h-3 flex-shrink-0" style={{ color }} strokeWidth={1.5} /><span className="truncate">{label}</span>
    </div>
    <div className="mt-1 text-base font-light text-white truncate">{valor}</div>
  </div>
);

/** Barra de tiempo: cuánto va del evento (o cuánto falta para que empiece). */
const Progreso: React.FC<{ e: Edicion; ahora: number }> = ({ e, ahora }) => {
  const ini = Date.parse(e.inicio), fin = Date.parse(e.fin);
  const pct = Math.max(0, Math.min(100, ((ahora - ini) / (fin - ini)) * 100));
  const { color } = ESTADOS[e.estado];
  let texto: string;
  if (e.estado === 'terminado') texto = `Terminó hace ${duracion(ahora - fin)}`;
  else if (ahora < ini) texto = e.estado === 'activo' ? `Forzado: empieza oficialmente en ${duracion(ini - ahora)}` : `Empieza en ${duracion(ini - ahora)}`;
  else texto = `${Math.floor(pct)} % · termina en ${duracion(fin - ahora)}`;
  return (
    <div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${e.estado === 'terminado' ? 100 : pct}%`, background: color, opacity: e.estado === 'terminado' ? 0.4 : 1 }} />
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] font-light" style={{ color: mt }}>
        <span>{fecha(e.inicio, true)} → {fecha(e.fin, true)}</span>
        <span style={{ color: e.estado === 'terminado' ? mt : 'white' }}>{texto}</span>
      </div>
    </div>
  );
};

// ─── Configuración de una edición ────────────────────────────────────────────
const Configurar: React.FC<{ e: Edicion; lunaFetch: LunaFetch; onListo: () => void; onCerrar: () => void }> = ({ e, lunaFetch, onListo, onCerrar }) => {
  const original = useMemo(() => ({ nombre: e.nombre, inicio: aLima(e.inicio), fin: aLima(e.fin), modo: e.modo, anticipacionDias: e.anticipacionDias, mostrarEnWeb: e.mostrarEnWeb }), [e]);
  const [f, setF] = useState(original);
  const [guardando, setGuardando] = useState(false);
  const hayCambios = JSON.stringify(f) !== JSON.stringify(original);
  const terminado = e.estado === 'terminado';

  const guardar = async () => {
    const cuerpo: Record<string, unknown> = {};
    if (f.nombre !== original.nombre) cuerpo.nombre = f.nombre;
    if (f.inicio !== original.inicio) cuerpo.inicio = deLima(f.inicio);
    if (f.fin !== original.fin) cuerpo.fin = deLima(f.fin);
    if (f.modo !== original.modo) cuerpo.modo = f.modo;
    if (f.anticipacionDias !== original.anticipacionDias) cuerpo.anticipacionDias = f.anticipacionDias;
    if (f.mostrarEnWeb !== original.mostrarEnWeb) cuerpo.mostrarEnWeb = f.mostrarEnWeb;
    if (cuerpo.fin && Date.parse(cuerpo.fin as string) <= Date.now() && !terminado
      && !window.confirm('Con esa fecha de fin el evento termina ya: desaparecen sus comandos y se entregan los premios finales. ¿Seguir?')) return;
    setGuardando(true);
    try {
      await lunaFetch(`/api/bot/eventos/${e.id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
      toast.success(`${e.nombre} guardado. El bot lo aplica en menos de un minuto.`);
      onListo();
      onCerrar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo guardar'));
    } finally { setGuardando(false); }
  };

  return (
    <div className="mt-4 pt-4 space-y-4 border-t" style={{ borderColor: bd }}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block min-w-0">
          <Etiqueta>Nombre</Etiqueta>
          <Entrada value={f.nombre} maxLength={60} onChange={ev => setF({ ...f, nombre: ev.target.value })} />
        </label>
        <label className="block min-w-0">
          <Etiqueta hint="hora de Lima">Inicio</Etiqueta>
          <Entrada type="datetime-local" value={f.inicio} onChange={ev => setF({ ...f, inicio: ev.target.value })} style={{ colorScheme: 'dark' }} />
        </label>
        <label className="block min-w-0">
          <Etiqueta hint="hora de Lima">Fin</Etiqueta>
          <Entrada type="datetime-local" value={f.fin} onChange={ev => setF({ ...f, fin: ev.target.value })} style={{ colorScheme: 'dark' }} />
        </label>
      </div>

      <div>
        <Etiqueta>Modo</Etiqueta>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {MODOS.map(m => {
            const on = f.modo === m.id;
            return (
              <button key={m.id} type="button" disabled={terminado} onClick={() => setF({ ...f, modo: m.id })}
                className="px-3.5 py-2.5 rounded-xl text-left transition-all hover:bg-white/[0.03] disabled:opacity-40"
                style={{ border: `1px solid ${on ? 'rgba(255,255,255,0.25)' : bd}`, background: on ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                <span className="block text-sm font-light text-white">{m.label}</span>
                <span className="block text-[11px] font-light mt-0.5 leading-relaxed" style={{ color: mt }}>{m.texto}</span>
              </button>
            );
          })}
        </div>
        {terminado && <p className="mt-2 text-[11px] font-light" style={{ color: mt }}>Esta edición ya terminó. Para reabrirla, mueve la fecha de fin hacia adelante.</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block min-w-0">
          <Etiqueta hint="0 a 30">Días de preparación</Etiqueta>
          <Entrada type="number" min={0} max={30} value={f.anticipacionDias}
            onChange={ev => setF({ ...f, anticipacionDias: Math.max(0, Math.min(30, Math.round(Number(ev.target.value) || 0))) })} />
          <span className="block mt-1.5 text-[11px] font-light leading-relaxed" style={{ color: mt }}>
            Días antes del inicio en que el comando ya aparece en Discord, para que el staff lo configure (canal de criaturas, etc.). Los jugadores no pueden jugar hasta el inicio.
          </span>
        </label>
        <Interruptor activo={f.mostrarEnWeb} onChange={v => setF({ ...f, mostrarEnWeb: v })}
          titulo="Mostrar en la web" texto="Aparece en /eventos y tiene su página (en curso, próxima o en el archivo)." />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <BotonSec onClick={onCerrar} disabled={guardando}><X className="w-3.5 h-3.5" strokeWidth={1.5} /> Cancelar</BotonSec>
        <button type="button" onClick={guardar} disabled={guardando || !hayCambios}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
          style={{ background: '#fff', color: '#000' }}>
          {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Save className="w-4 h-4" strokeWidth={1.5} /> Guardar</>}
        </button>
      </div>
    </div>
  );
};

// ─── Tarjeta de una edición ──────────────────────────────────────────────────
const TarjetaEdicion: React.FC<{ e: Edicion; ahora: number; lunaFetch: LunaFetch; onCambio: () => void; onPersonalizar: () => void }> = ({ e, ahora, lunaFetch, onCambio, onPersonalizar }) => {
  const [abierta, setAbierta] = useState(false);
  const [verTop, setVerTop] = useState(false);
  const [trabajando, setTrabajando] = useState<null | 'premios' | 'borrar'>(null);
  const est = ESTADOS[e.estado];
  const c = e.cifras;
  const puedePremios = e.estado === 'terminado' && e.esActual && c && !c.premiosEntregadosEn;
  const puedeBorrar = !e.base && e.estado === 'programado';

  const premios = async () => {
    if (!window.confirm(`¿Entregar ya los premios de ${e.nombre}? Los primeros del ranking reciben sus insignias de premio final, con un MD. Solo pasa una vez.`)) return;
    setTrabajando('premios');
    try {
      const r = await lunaFetch(`/api/bot/eventos/${e.id}/premios`, { method: 'POST' });
      const d = r.data as { entregados: number; yaEstaban: boolean };
      toast.success(d.yaEstaban ? 'Los premios ya se habían entregado.' : `Premios entregados a ${d.entregados} jugadores.`);
      onCambio();
    } catch (err) { toast.error(mensajeError(err, 'No se pudieron entregar')); } finally { setTrabajando(null); }
  };
  const borrar = async () => {
    if (!window.confirm(`¿Borrar ${e.nombre}? Todavía no empezó, así que no se pierde ningún progreso.`)) return;
    setTrabajando('borrar');
    try {
      await lunaFetch(`/api/bot/eventos/${e.id}`, { method: 'DELETE' });
      toast.success(`${e.nombre} borrado.`);
      onCambio();
    } catch (err) { toast.error(mensajeError(err, 'No se pudo borrar')); } finally { setTrabajando(null); }
  };

  return (
    <article className="rounded-2xl p-4" style={{ background: sf, border: `1px solid ${e.estado === 'activo' ? `${e.color}45` : bd}` }}>
      <header className="flex flex-wrap items-start gap-3">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: `${e.color}14`, border: `1px solid ${e.color}30` }}>{e.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-light text-white">{e.nombre}</h3>
            <Pastilla color={est.color}><est.Icon className="w-3 h-3" strokeWidth={1.5} />{est.label}</Pastilla>
            {e.enPreparacion && <Pastilla color="#60a5fa" title="Su comando ya está en Discord para que el staff lo configure">En preparación</Pastilla>}
            {e.modo !== 'auto' && e.estado !== 'terminado' && <Pastilla color="#fb923c">Modo manual: {MODOS.find(m => m.id === e.modo)?.label}</Pastilla>}
            {!e.mostrarEnWeb && <Pastilla color="#94a3b8">Oculto en la web</Pastilla>}
            {e.contenidoPropio && <Pastilla color="#c4b5fd" title="Tiene su propio contenido (no el de la plantilla de su tipo)">Personalizada</Pastilla>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-light" style={{ color: mt }}>
            <span className="inline-flex items-center gap-1"><Terminal className="w-3 h-3" strokeWidth={1.5} />
              {e.comandos.map(x => `/${x}`).join(', ')}:{' '}
              <span style={{ color: e.comandosVisibles ? '#4ade80' : tenue }}>{e.comandosVisibles ? 'visible en Discord' : 'oculto en Discord'}</span>
            </span>
            {e.esActual && <span title="La edición que usa el bot ahora (juego, cierre y premios)">· edición en uso del bot</span>}
            {e.actualizadoEn && <span>· cambiado {fecha(e.actualizadoEn, true)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {e.mostrarEnWeb && (
            <a href={`${WEB}/eventos/${e.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5" style={{ border: `1px solid ${bd}`, color: mt }}>
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} /> Ver en la web
            </a>
          )}
          <BotonSec onClick={onPersonalizar}><Palette className="w-3.5 h-3.5" strokeWidth={1.5} /> Personalizar</BotonSec>
          <BotonSec onClick={() => setAbierta(a => !a)}><Settings2 className="w-3.5 h-3.5" strokeWidth={1.5} /> {abierta ? 'Cerrar' : 'Fechas y modo'}</BotonSec>
        </div>
      </header>

      <div className="mt-4"><Progreso e={e} ahora={ahora} /></div>

      {c && (
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Cifra Icon={Users} label="Participantes" valor={mil(c.participantes)} color="#60a5fa" />
          <Cifra Icon={Award} label="Insignias dadas" valor={mil(c.insigniasEntregadas)} color="#c4b5fd" />
          {e.estado === 'activo'
            ? <Cifra Icon={Ghost} label="Criaturas sueltas" valor={e.criaturasSueltas ?? '—'} color="#fb923c" />
            : <Cifra Icon={Gift} label="Premios finales" color="#facc15"
                valor={c.premiosEntregadosEn ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-400" strokeWidth={1.5} />{fecha(c.premiosEntregadosEn)}</span>
                  : e.estado === 'terminado' ? 'Pendientes' : 'Al terminar'} />}
          <Cifra Icon={Trophy} label={`Primer puesto${e.moneda ? ` · ${e.moneda.emoji}` : ''}`} color="#facc15"
            valor={c.top[0] ? <span className="inline-flex items-center gap-1.5 min-w-0">{c.top[0].avatar && <img src={c.top[0].avatar} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />}<span className="truncate">{c.top[0].nombre}</span></span> : '—'} />
        </div>
      )}
      {!c && e.estado !== 'programado' && (
        <p className="mt-3 text-[11px] font-light" style={{ color: mt }}>Sin cifras: el bot no pudo leer la base de datos del evento.</p>
      )}

      {c && c.top.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setVerTop(v => !v)} className="text-xs font-light underline underline-offset-2" style={{ color: mt }}>
            {verTop ? 'Ocultar el top 10' : `Ver el top ${c.top.length}`}
          </button>
          {verTop && (
            <ol className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {c.top.map(g => (
                <li key={g.puesto} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light min-w-0" style={{ background: sc, border: `1px solid ${bd}` }}>
                  <span className="w-6 font-mono flex-shrink-0" style={{ color: g.puesto <= 3 ? '#facc15' : mt }}>#{g.puesto}</span>
                  {g.avatar && <img src={g.avatar} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />}
                  <span className="text-white truncate flex-1 min-w-0">{g.nombre}</span>
                  <span className="flex-shrink-0" style={{ color: mt }}>{e.moneda?.emoji ?? '🍬'} {mil(g.dulces)} · {mil(g.atrapadas)} atrapadas</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {(puedePremios || puedeBorrar) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {puedePremios && (
            <BotonSec onClick={premios} disabled={!!trabajando} style={{ color: '#facc15', borderColor: 'rgba(250,204,21,0.3)' }}>
              {trabajando === 'premios' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" strokeWidth={1.5} />} Entregar premios ahora
            </BotonSec>
          )}
          {puedeBorrar && (
            <BotonSec onClick={borrar} disabled={!!trabajando} style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}>
              {trabajando === 'borrar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />} Borrar edición
            </BotonSec>
          )}
        </div>
      )}
      {puedePremios && (
        <p className="mt-2 text-[11px] font-light" style={{ color: mt }}>El bot los entrega solo unos minutos después del cierre; este botón es por si algo falló.</p>
      )}

      {abierta && <Configurar e={e} lunaFetch={lunaFetch} onListo={onCambio} onCerrar={() => setAbierta(false)} />}
    </article>
  );
};

// ─── Crear la edición de otro año ────────────────────────────────────────────
const NuevaEdicion: React.FC<{ tipos: Tipo[]; ediciones: Edicion[]; lunaFetch: LunaFetch; onCreada: () => void; onCerrar: () => void; inicial?: string | null }> = ({ tipos, ediciones, lunaFetch, onCreada, onCerrar, inicial }) => {
  const anioActual = new Date().getFullYear();
  const [tipo, setTipo] = useState(inicial ?? tipos[0]?.id ?? 'halloween');
  const libre = (t: string) => Array.from({ length: 6 }, (_, i) => anioActual + i).find(a => !ediciones.some(e => e.id === `${t}${a}`)) ?? anioActual + 1;
  const [anio, setAnio] = useState(() => libre(inicial ?? tipos[0]?.id ?? 'halloween'));
  const [creando, setCreando] = useState(false);
  const t = tipos.find(x => x.id === tipo);
  const existe = ediciones.some(e => e.id === `${tipo}${anio}`);

  const crear = async () => {
    setCreando(true);
    try {
      await lunaFetch('/api/bot/eventos', { method: 'POST', body: JSON.stringify({ tipo, anio }) });
      toast.success(`${t?.nombre ?? tipo} ${anio} creado con las fechas de siempre. Puedes ajustarlas en «Configurar».`);
      onCreada();
      onCerrar();
    } catch (err) { toast.error(mensajeError(err, 'No se pudo crear')); } finally { setCreando(false); }
  };

  return (
    <Bloque Icon={Wand2} titulo="Nueva edición" color="#c4b5fd"
      texto="Crea el evento de un año con sus fechas de siempre y la plantilla de su tipo. Sus insignias son nuevas (de ese año) y las de otros años quedan en los perfiles."
      extra={<BotonSec onClick={onCerrar}><X className="w-3.5 h-3.5" strokeWidth={1.5} /> Cerrar</BotonSec>}>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
        <label className="block min-w-0">
          <Etiqueta>Evento</Etiqueta>
          <Seleccion value={tipo} onChange={ev => { setTipo(ev.target.value); setAnio(libre(ev.target.value)); }}>
            {tipos.map(x => <option key={x.id} value={x.id}>{x.emoji} {x.nombre}</option>)}
          </Seleccion>
        </label>
        <label className="block min-w-0">
          <Etiqueta>Año</Etiqueta>
          <Seleccion value={anio} onChange={ev => setAnio(Number(ev.target.value))}>
            {Array.from({ length: 6 }, (_, i) => anioActual + i).map(a => <option key={a} value={a}>{a}</option>)}
          </Seleccion>
        </label>
        <button type="button" onClick={crear} disabled={creando || existe}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
          style={{ background: '#fff', color: '#000' }}>
          {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" strokeWidth={1.5} />} Crear {t?.nombre} {anio}
        </button>
      </div>
      {existe && <p className="text-[11px] font-light" style={{ color: '#facc15' }}>Esa edición ya existe.</p>}
    </Bloque>
  );
};

// ─── Panel ───────────────────────────────────────────────────────────────────
export const EventosLunaPanel: React.FC<{ lunaFetch: LunaFetch; lunaSubir: LunaSubir }> = ({ lunaFetch, lunaSubir }) => {
  const [vista, setVista] = useState<'ediciones' | 'tipos'>('ediciones');
  const [editando, setEditando] = useState<null | { e: Edicion; contenido: Contenido; propio: boolean }>(null);
  const [tipoNuevaEdicion, setTipoNuevaEdicion] = useState<string | null>(null);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const pedir = useCallback(() => {
    setCargando(true);
    lunaFetch('/api/bot/eventos')
      .then(r => { setDatos(r.data as Datos); setError(null); })
      .catch((e: unknown) => setError(mensajeError(e, 'No se pudo conectar con la API de Luna NET')))
      .finally(() => setCargando(false));
  }, [lunaFetch]);
  // Las cifras se refrescan solas cada 30 s; el reloj, cada 30 s también.
  useEffect(() => { const t = setTimeout(pedir, 0); const id = setInterval(pedir, 30_000); return () => { clearTimeout(t); clearInterval(id); }; }, [pedir]);
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(id); }, []);

  const registrar = async () => {
    setRegistrando(true);
    try {
      await lunaFetch('/api/bot/eventos/comandos', { method: 'POST' });
      toast.success('Comandos registrados de nuevo en Discord. Pueden tardar un par de minutos en verse en todos los servidores.');
      pedir();
    } catch (err) { toast.error(mensajeError(err, 'No se pudieron registrar')); } finally { setRegistrando(false); }
  };

  if (error && !datos) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
        <p className="text-sm font-light max-w-md" style={{ color: mt }}>{error}</p>
        <BotonSec onClick={pedir}><RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Reintentar</BotonSec>
      </div>
    );
  }
  if (!datos) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: mt }} /></div>;

  const personalizar = async (e: Edicion) => {
    try {
      const r = await lunaFetch(`/api/bot/eventos/${e.id}/contenido`);
      const d = r.data as { propio: boolean; contenido: Contenido };
      setEditando({ e, contenido: d.contenido, propio: d.propio });
    } catch (err) { toast.error(mensajeError(err, 'No se pudo abrir el contenido')); }
  };

  if (editando) {
    const { e } = editando;
    return (
      <EditorContenido
        key={e.id} titulo={`Personalizar ${e.nombre}`} emoji={e.emoji} inicial={editando.contenido} subir={lunaSubir}
        aviso={<p className="text-[11px] font-light leading-relaxed px-3.5 py-2.5 rounded-xl" style={{ color: mt, border: `1px solid ${bd}` }}>
          {editando.propio
            ? <>Esta edición tiene su <b className="text-white font-normal">propio contenido</b>: los cambios de la plantilla de {e.tipoNombre ?? e.tipo} no la afectan.</>
            : <>Ahora usa la plantilla de {e.tipoNombre ?? e.tipo}. Al guardar, esta edición pasa a tener su propio contenido (la plantilla no cambia).</>}
          {e.estado === 'activo' && <> Está <b className="text-white font-normal">en curso</b>: los cambios se ven en Discord al instante. Cambiar ids de criaturas o insignias ya entregadas puede dejarlas sin mostrar.</>}
        </p>}
        extra={editando.propio && (
          <BotonSec onClick={async () => {
            if (!window.confirm(`¿Quitarle a ${e.nombre} su contenido propio y volver a la plantilla de ${e.tipoNombre ?? e.tipo}?`)) return;
            try {
              await lunaFetch(`/api/bot/eventos/${e.id}/contenido`, { method: 'PUT', body: JSON.stringify({ contenido: null }) });
              toast.success(`${e.nombre} vuelve a usar la plantilla.`);
              setEditando(null); pedir();
            } catch (err) { toast.error(mensajeError(err, 'No se pudo')); }
          }}><Layers className="w-3.5 h-3.5" strokeWidth={1.5} /> Volver a la plantilla</BotonSec>
        )}
        onCerrar={() => setEditando(null)}
        onGuardar={async (contenido) => {
          await lunaFetch(`/api/bot/eventos/${e.id}/contenido`, { method: 'PUT', body: JSON.stringify({ contenido }) });
          toast.success(`${e.nombre} guardado. El bot lo usa al instante.`);
          setEditando(null); pedir();
        }}
      />
    );
  }

  const pestanas = (
    <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: sc, border: `1px solid ${bd}` }}>
      {([['ediciones', 'Ediciones', CalendarDays], ['tipos', 'Tipos de evento', Layers]] as const).map(([id, label, Icon]) => (
        <button key={id} type="button" onClick={() => setVista(id)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-light transition-all"
          style={{ background: vista === id ? 'rgba(255,255,255,0.08)' : 'transparent', color: vista === id ? 'white' : mt }}>
          <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />{label}
        </button>
      ))}
    </div>
  );

  if (vista === 'tipos') {
    return (
      <div className="space-y-4">
        {pestanas}
        <TiposPanel tipos={datos.tipos} lunaFetch={lunaFetch} lunaSubir={lunaSubir} onCambio={pedir}
          onCrearEdicion={(t) => { setTipoNuevaEdicion(t); setCreando(true); setVista('ediciones'); }} />
      </div>
    );
  }

  const { comandos } = datos;
  const alDia = comandos.firma === comandos.firmaActual;
  const orden: Estado[] = ['activo', 'pausado', 'programado', 'terminado'];
  const lista = [...datos.ediciones].sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado)
    || (a.estado === 'programado' ? Date.parse(a.inicio) - Date.parse(b.inicio) : Date.parse(b.inicio) - Date.parse(a.inicio)));

  return (
    <div className="space-y-4">
      {pestanas}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start">
        <Bloque Icon={Terminal} titulo="Comandos de eventos en Discord" color={alDia ? '#4ade80' : '#facc15'}
          texto="El bot revisa el calendario cada minuto: cuando una edición empieza o termina, vuelve a registrar los comandos solo."
          extra={<BotonSec onClick={registrar} disabled={registrando}>{registrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />} Re-registrar ahora</BotonSec>}>
          <div className="flex flex-wrap items-center gap-2 text-xs font-light" style={{ color: mt }}>
            {datos.tipos.map(t => {
              const on = comandos.visibles.includes(t.id);
              return <Pastilla key={t.id} color={on ? '#4ade80' : '#94a3b8'}>{t.emoji} /{t.comando} · {on ? 'visible' : 'oculto'}</Pastilla>;
            })}
            <span>·</span>
            {alDia
              ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" strokeWidth={1.5} /> Al día{comandos.en ? ` (registrados ${fecha(comandos.en, true)})` : ''}</span>
              : <span style={{ color: '#facc15' }}>Hay un cambio pendiente: se aplica en menos de un minuto.</span>}
          </div>
        </Bloque>
        <div className="flex flex-wrap gap-2 lg:flex-col">
          <BotonSec onClick={() => { setTipoNuevaEdicion(null); setCreando(c => !c); }}><Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Nueva edición</BotonSec>
          <BotonSec onClick={pedir} disabled={cargando}><RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} /> Actualizar</BotonSec>
          <a href={`${WEB}/eventos`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5" style={{ border: `1px solid ${bd}`, color: mt }}>
            <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.5} /> Calendario en la web
          </a>
        </div>
      </div>

      {error && <p className="text-[11px] font-light" style={{ color: '#f87171' }}>No se pudo actualizar: {error}</p>}
      {creando && <NuevaEdicion key={tipoNuevaEdicion ?? '-'} inicial={tipoNuevaEdicion} tipos={datos.tipos} ediciones={datos.ediciones} lunaFetch={lunaFetch} onCreada={pedir} onCerrar={() => setCreando(false)} />}

      {lista.length === 0
        ? <p className="text-xs font-light px-3.5 py-6 rounded-xl text-center" style={{ color: mt, border: `1px dashed ${bd}` }}>Todavía no hay ediciones.</p>
        : lista.map(e => <TarjetaEdicion key={e.id} e={e} ahora={ahora} lunaFetch={lunaFetch} onCambio={pedir} onPersonalizar={() => void personalizar(e)} />)}
    </div>
  );
};
