import React, { useState } from 'react';
import { Plus, Pencil, RotateCcw, Trash2, Loader2, Save, X, Wand2, Palette, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { BotonSec, Bloque, Seleccion } from '../webLuna/ui';
import { bd, sf, mt, tenue, mensajeError, type LunaFetch } from '../webLuna/comun';
import { Campo, Texto, Emoji, type LunaSubir } from './campos';
import { EditorContenido } from './EditorContenido';
import type { Contenido, TipoEvento } from './modelo';

// ─── Tipos de evento ─────────────────────────────────────────────────────────
// Cada tipo (Halloween, Navidad…) es la receta de un evento: su nombre, su
// comando de Discord, el prefijo de sus insignias, sus fechas de cada año y la
// plantilla de contenido que copia cada edición nueva. Los de fábrica se
// pueden cambiar y restaurar; los nuevos, crear y borrar.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (mmdd: string) => { const [m, d] = mmdd.split('-').map(Number); return `${d} ${MESES[m - 1]}`; };
/** El fin se guarda exclusivo (el día siguiente al último): se muestra el último día. */
const ultimoDia = (mmdd: string) => { const d = new Date(`2028-${mmdd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(5, 10); };
const diaSiguiente = (mmdd: string) => { const d = new Date(`2028-${mmdd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(5, 10); };
const esMMDD = (v: string) => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);

interface General { nombre: string; emoji: string; comando: string; descripcion: string; prefijo: string; inicio: string; fin: string }

/** Nombre, emoji, comando, prefijo y fechas (para crear o cambiar un tipo). */
const FormGeneral: React.FC<{ g: General; set: (g: General) => void; nuevo?: boolean; conEdiciones?: boolean }> = ({ g, set, nuevo, conEdiciones }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Campo label="Nombre"><Texto valor={g.nombre} max={40} onChange={v => set({ ...g, nombre: v })} /></Campo>
      <Campo label="Emoji"><Emoji valor={g.emoji} onChange={v => set({ ...g, emoji: v })} /></Campo>
      <Campo label="Comando de Discord" hint="sin /">
        <Texto valor={g.comando} max={32} placeholder="navidad" onChange={v => set({ ...g, comando: v.toLowerCase().replace(/[^a-z0-9]/g, '') })} />
      </Campo>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Campo label="Empieza" hint="MM-DD, hora de Lima"><Texto valor={g.inicio} max={5} placeholder="12-01" onChange={v => set({ ...g, inicio: v })} /></Campo>
      <Campo label="Último día" hint="MM-DD (incluido)"><Texto valor={g.fin} max={5} placeholder="12-25" onChange={v => set({ ...g, fin: v })} /></Campo>
      <Campo label="Prefijo de insignias" hint={conEdiciones ? 'fijo: ya hay ediciones' : '2 a 4 letras'}>
        <Texto valor={g.prefijo} max={4} placeholder="nv" onChange={v => !conEdiciones && set({ ...g, prefijo: v.toLowerCase().replace(/[^a-z]/g, '') })} />
      </Campo>
    </div>
    {!nuevo && <Campo label="Descripción del comando" hint="la que se ve en Discord · máx. 100"><Texto valor={g.descripcion} max={100} onChange={v => set({ ...g, descripcion: v })} /></Campo>}
    <p className="text-[11px] font-light leading-relaxed" style={{ color: mt }}>
      {esMMDD(g.inicio) && esMMDD(g.fin) ? <>Cada año: del <b className="text-white font-normal">{fechaCorta(g.inicio)}</b> al <b className="text-white font-normal">{fechaCorta(g.fin)}</b>{g.inicio > g.fin ? ' (cruza de año: la edición se llama por el año en que termina)' : ''}. </> : null}
      El comando /{g.comando || '…'} solo existe en Discord mientras el evento está en curso.
    </p>
  </div>
);

export const TiposPanel: React.FC<{ tipos: TipoEvento[]; lunaFetch: LunaFetch; lunaSubir: LunaSubir; onCambio: () => void; onCrearEdicion: (tipo: string) => void }> = ({ tipos, lunaFetch, lunaSubir, onCambio, onCrearEdicion }) => {
  const [abierto, setAbierto] = useState<null | { id: string; g: General }>(null);
  const [editando, setEditando] = useState<null | { t: TipoEvento; contenido: Contenido }>(null);
  const [nuevo, setNuevo] = useState<null | (General & { id: string; desde: string })>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const general = (t: TipoEvento): General => ({ nombre: t.nombre, emoji: t.emoji, comando: t.comando, descripcion: t.descripcion, prefijo: t.prefijo, inicio: t.fechas.inicio, fin: ultimoDia(t.fechas.fin) });
  const cuerpo = (g: General) => {
    if (!esMMDD(g.inicio) || !esMMDD(g.fin)) throw new Error('Las fechas van como MM-DD (por ejemplo 12-01).');
    return { nombre: g.nombre, emoji: g.emoji, comando: g.comando, descripcion: g.descripcion, prefijo: g.prefijo, fechas: { inicio: g.inicio, fin: diaSiguiente(g.fin) } };
  };

  const guardarGeneral = async () => {
    if (!abierto) return;
    setTrabajando(abierto.id);
    try {
      const t = tipos.find(x => x.id === abierto.id)!;
      const b = cuerpo(abierto.g);
      // Lo que no cambió no se manda (p. ej. el prefijo, que no se puede tocar con ediciones).
      const cambios = Object.fromEntries(Object.entries(b).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(k === 'fechas' ? t.fechas : t[k as keyof TipoEvento])));
      await lunaFetch(`/api/bot/eventos/tipos/${abierto.id}`, { method: 'PUT', body: JSON.stringify(cambios) });
      toast.success(`${abierto.g.nombre} guardado.`);
      setAbierto(null);
      onCambio();
    } catch (e) { toast.error(mensajeError(e, 'No se pudo guardar')); } finally { setTrabajando(null); }
  };

  const abrirContenido = async (t: TipoEvento) => {
    setTrabajando(t.id);
    try {
      const r = await lunaFetch(`/api/bot/eventos/tipos/${t.id}`);
      setEditando({ t, contenido: (r.data as TipoEvento).contenido! });
    } catch (e) { toast.error(mensajeError(e, 'No se pudo abrir')); } finally { setTrabajando(null); }
  };

  const restaurar = async (t: TipoEvento) => {
    if (!window.confirm(`¿Volver ${t.nombre} a como viene con el bot? Se pierden los cambios de su plantilla (las ediciones con contenido propio no cambian).`)) return;
    setTrabajando(t.id);
    try { await lunaFetch(`/api/bot/eventos/tipos/${t.id}/restaurar`, { method: 'POST' }); toast.success(`${t.nombre} restaurado.`); onCambio(); }
    catch (e) { toast.error(mensajeError(e, 'No se pudo restaurar')); } finally { setTrabajando(null); }
  };

  const borrar = async (t: TipoEvento) => {
    if (!window.confirm(`¿Borrar el tipo ${t.nombre}? No tiene ediciones, así que no se pierde ningún progreso.`)) return;
    setTrabajando(t.id);
    try { await lunaFetch(`/api/bot/eventos/tipos/${t.id}`, { method: 'DELETE' }); toast.success(`${t.nombre} borrado.`); onCambio(); }
    catch (e) { toast.error(mensajeError(e, 'No se pudo borrar')); } finally { setTrabajando(null); }
  };

  const crear = async () => {
    if (!nuevo) return;
    setTrabajando('nuevo');
    try {
      // Sin descripción: el bot arma una con el nombre y el emoji.
      const b: Partial<ReturnType<typeof cuerpo>> = cuerpo(nuevo);
      delete b.descripcion;
      await lunaFetch('/api/bot/eventos/tipos', { method: 'POST', body: JSON.stringify({ ...b, id: nuevo.id, desde: nuevo.desde }) });
      toast.success(`${nuevo.nombre} creado. Personaliza su contenido y crea su primera edición.`);
      setNuevo(null);
      onCambio();
    } catch (e) { toast.error(mensajeError(e, 'No se pudo crear')); } finally { setTrabajando(null); }
  };

  if (editando) {
    return (
      <EditorContenido
        titulo={`Plantilla de ${editando.t.nombre}`} emoji={editando.t.emoji} inicial={editando.contenido} subir={lunaSubir}
        aviso={<p className="text-[11px] font-light leading-relaxed px-3.5 py-2.5 rounded-xl" style={{ color: mt, border: `1px solid ${bd}` }}>
          La plantilla la usan las ediciones de {editando.t.nombre} que no tienen contenido propio (también la que está en curso) y la copian las nuevas.
          Para cambiar solo una edición, usa «Personalizar» en esa edición.
        </p>}
        onCerrar={() => setEditando(null)}
        onGuardar={async (contenido) => {
          await lunaFetch(`/api/bot/eventos/tipos/${editando.t.id}`, { method: 'PUT', body: JSON.stringify({ contenido }) });
          toast.success('Plantilla guardada. El bot la usa al instante.');
          setEditando(null);
          onCambio();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-light" style={{ color: mt }}>{tipos.length} tipos de evento · cada uno con su comando, sus fechas y su plantilla.</p>
        <BotonSec onClick={() => setNuevo({ id: '', nombre: '', emoji: '✨', comando: '', descripcion: '', prefijo: '', inicio: '04-01', fin: '04-07', desde: 'halloween' })}>
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Nuevo tipo de evento
        </BotonSec>
      </div>

      {nuevo && (
        <Bloque Icon={Wand2} titulo="Nuevo tipo de evento" color="#c4b5fd" texto="Se crea con el contenido de otro evento como punto de partida; después cambias criaturas, moneda, insignias y todo lo demás."
          extra={<BotonSec onClick={() => setNuevo(null)}><X className="w-3.5 h-3.5" strokeWidth={1.5} /> Cerrar</BotonSec>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Id" hint="para siempre · letras y números">
              <Texto valor={nuevo.id} max={20} placeholder="pascua" onChange={v => {
                const id = v.toLowerCase().replace(/[^a-z0-9]/g, '');
                setNuevo({ ...nuevo, id, comando: nuevo.comando && nuevo.comando !== nuevo.id ? nuevo.comando : id });
              }} />
            </Campo>
            <Campo label="Copiar el contenido de">
              <Seleccion value={nuevo.desde} onChange={e => setNuevo({ ...nuevo, desde: e.target.value })}>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.nombre}</option>)}
              </Seleccion>
            </Campo>
          </div>
          <FormGeneral g={nuevo} set={g => setNuevo({ ...nuevo, ...g })} nuevo />
          <div className="flex justify-end">
            <button type="button" onClick={crear} disabled={trabajando === 'nuevo' || !nuevo.id || !nuevo.nombre}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40" style={{ background: '#fff', color: '#000' }}>
              {trabajando === 'nuevo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" strokeWidth={1.5} />} Crear {nuevo.nombre || 'evento'}
            </button>
          </div>
        </Bloque>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {tipos.map(t => (
          <article key={t.id} className="rounded-2xl p-4 space-y-3" style={{ background: sf, border: `1px solid ${abierto?.id === t.id ? `${t.color}55` : bd}` }}>
            <header className="flex items-start gap-3">
              <span className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: `${t.color}14`, border: `1px solid ${t.color}30` }}>{t.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-light text-white">{t.nombre}</h3>
                  <span className="text-[10px] font-light px-2 py-0.5 rounded-full" style={{ color: t.deFabrica ? '#a5b4fc' : '#4ade80', border: `1px solid ${t.deFabrica ? 'rgba(165,180,252,0.3)' : 'rgba(74,222,128,0.3)'}` }}>
                    {t.deFabrica ? (t.modificado ? 'De fábrica · modificado' : 'De fábrica') : 'Creado aquí'}
                  </span>
                </div>
                <p className="text-[11px] font-light mt-0.5" style={{ color: mt }}>
                  /{t.comando} · {fechaCorta(t.fechas.inicio)} → {fechaCorta(ultimoDia(t.fechas.fin))} · {t.moneda?.emoji} {t.moneda?.nombre} · insignias {t.prefijo}AA_… · {t.ediciones ?? 0} {t.ediciones === 1 ? 'edición' : 'ediciones'}
                </p>
              </div>
            </header>
            <div className="flex flex-wrap gap-2">
              <BotonSec onClick={() => abrirContenido(t)} disabled={!!trabajando}>
                {trabajando === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Palette className="w-3.5 h-3.5" strokeWidth={1.5} />} Personalizar plantilla
              </BotonSec>
              <BotonSec onClick={() => setAbierto(abierto?.id === t.id ? null : { id: t.id, g: general(t) })}><Pencil className="w-3.5 h-3.5" strokeWidth={1.5} /> Nombre, comando y fechas</BotonSec>
              <BotonSec onClick={() => onCrearEdicion(t.id)}><CalendarPlus className="w-3.5 h-3.5" strokeWidth={1.5} /> Crear edición</BotonSec>
              {t.deFabrica && t.modificado && <BotonSec onClick={() => restaurar(t)} disabled={!!trabajando}><RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} /> Restaurar</BotonSec>}
              {!t.deFabrica && t.ediciones === 0 && (
                <BotonSec onClick={() => borrar(t)} disabled={!!trabajando} style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Borrar</BotonSec>
              )}
            </div>
            {abierto?.id === t.id && (
              <div className="pt-3 space-y-3 border-t" style={{ borderColor: bd }}>
                <FormGeneral g={abierto.g} set={g => setAbierto({ id: t.id, g })} conEdiciones={t.ediciones > 0} />
                <div className="flex justify-end gap-2">
                  <BotonSec onClick={() => setAbierto(null)}><X className="w-3.5 h-3.5" strokeWidth={1.5} /> Cancelar</BotonSec>
                  <button type="button" onClick={guardarGeneral} disabled={trabajando === t.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40" style={{ background: '#fff', color: '#000' }}>
                    {trabajando === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" strokeWidth={1.5} />} Guardar
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="text-[11px] font-light" style={{ color: tenue }}>Cambiar el comando de un evento solo se puede cuando no está en curso (los botones ya publicados en Discord dejarían de funcionar).</p>
    </div>
  );
};
