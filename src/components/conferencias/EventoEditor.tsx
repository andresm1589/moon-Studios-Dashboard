import { useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarClock, Check, CheckCheck, ClipboardCheck, LoaderCircle, MapPin, Plus, ShieldCheck, Trash2, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import * as api from '@/lib/conferencias/api';
import { MODALIDADES, ROLES_EQUIPO, type EventoConf, type EventoEntrada, type Modalidad, type RolEquipo } from '@/lib/conferencias/tipos';
import { aInputLocal, deInputLocal, mensajeError, validarFechas, zonaFormulario } from './util';

export interface Persona { uid: string; nombre: string; role: string }

function inicial(e?: EventoConf): EventoEntrada {
  if (e) return { titulo: e.titulo, descripcion: e.descripcion, modalidad: e.modalidad, inicio: aInputLocal(e.inicio), fin: aInputLocal(e.fin), lugar: e.lugar,
    instrucciones: e.instrucciones, capacidad: e.capacidad, ingresoUnico: e.ingresoUnico, salaEspera: e.salaEspera,
    grabacionPermitida: e.grabacionPermitida, aperturaMinutos: e.aperturaMinutos, equipo: { ...e.equipo } };
  const inicio = new Date(); inicio.setDate(inicio.getDate() + 7); inicio.setHours(19, 0, 0, 0);
  const fin = new Date(inicio); fin.setHours(21);
  return { titulo: '', descripcion: '', modalidad: 'virtual', inicio: aInputLocal(inicio), fin: aInputLocal(fin), lugar: '', instrucciones: '',
    capacidad: 0, ingresoUnico: true, salaEspera: true, grabacionPermitida: false, aperturaMinutos: 60, equipo: {} };
}
const PASOS = [{ titulo: 'El evento', detalle: 'Identidad y horario', icono: CalendarClock }, { titulo: 'Acceso', detalle: 'Aforo y organización', icono: ShieldCheck }, { titulo: 'Revisar', detalle: 'Todo antes de guardar', icono: ClipboardCheck }];

export function EventoEditor({ evento, personal, editaEquipo, onCerrar, onGuardado }: {
  evento?: EventoConf; personal: Persona[]; editaEquipo: boolean; onCerrar: () => void; onGuardado: (id: string) => void;
}) {
  const [d, setD] = useState<EventoEntrada>(() => inicial(evento));
  const [paso, setPaso] = useState(0), [error, setError] = useState(''), [guardando, setGuardando] = useState(false);
  const [nuevoMiembro, setNuevoMiembro] = useState(''), [modificado, setModificado] = useState(false), [salir, setSalir] = useState(false);
  const bloqueo = useRef(false);
  const set = <K extends keyof EventoEntrada>(k: K, v: EventoEntrada[K]) => { setD(p => ({ ...p, [k]: v })); setError(''); setModificado(true); };
  const virtual = d.modalidad !== 'presencial', presencial = d.modalidad === 'presencial' || d.modalidad === 'hibrido', equipo = d.equipo ?? {};
  const cerrar = () => { if (bloqueo.current) return; if (modificado) setSalir(true); else onCerrar(); };
  const validar = (p: number) => {
    if (p === 0) {
      if (d.titulo.trim().length < 3) return 'Escribe un nombre de al menos 3 caracteres.';
      const fechas = validarFechas(d.inicio, d.fin); if (fechas) return fechas;
      if (presencial && d.lugar.trim().length < 2) return 'Indica la dirección o el lugar del evento.';
    }
    if (!Number.isInteger(d.capacidad) || d.capacidad < 0 || d.capacidad > 100000) return 'El aforo debe estar entre 0 y 100 000.';
    if (!Number.isInteger(d.aperturaMinutos) || d.aperturaMinutos < 0 || d.aperturaMinutos > 1440) return 'El acceso puede abrir entre 0 y 1 440 minutos antes.';
    return '';
  };
  const siguiente = () => { const fallo = validar(paso); if (fallo) return setError(fallo); setError(''); setPaso(p => p + 1); };
  const guardar = async () => {
    if (bloqueo.current) return;
    const fallo = validar(0) || validar(1); if (fallo) { setPaso(0); setError(fallo); return; }
    bloqueo.current = true; setGuardando(true); setError('');
    try {
      const datos: EventoEntrada = { ...d, inicio: deInputLocal(d.inicio), fin: deInputLocal(d.fin), lugar: presencial ? d.lugar : '' };
      if (!editaEquipo) delete datos.equipo;
      const id = evento ? (await api.editarEvento(evento.id, datos)).id : (await api.crearEvento(datos)).id;
      onGuardado(id);
    } catch (e) { setError(mensajeError(e)); } finally { bloqueo.current = false; setGuardando(false); }
  };
  return <Dialog open onOpenChange={v => { if (!v) cerrar(); }}><DialogContent className="cf-dialog cf-dialog--editor max-w-3xl max-h-[94vh] overflow-y-auto">
    <div className="cf-dialog__heading"><span className="cf-eyebrow">CONFERENCIAS / {evento ? 'EDICIÓN' : 'NUEVO EVENTO'}</span><DialogTitle>{evento ? 'Diseña la próxima experiencia.' : 'Un gran encuentro empieza aquí.'}</DialogTitle>
      <DialogDescription>{evento ? 'Revisa los cambios: al guardar se actualizará la información de tus invitados.' : 'Configura el evento en tres pasos. Se creará como borrador; después podrás programarlo e invitar.'}</DialogDescription></div>
    <ol className="cf-steps" aria-label="Pasos del editor">{PASOS.map(({ titulo, detalle, icono: Icono }, i) => <li key={titulo} aria-current={paso === i ? 'step' : undefined} data-completed={i < paso}>
      <span>{i < paso ? <Check /> : <Icono />}</span><div><strong>{titulo}</strong><small>{detalle}</small></div></li>)}</ol>
      {salir && <div className="cf-alerta cf-alerta--confirm" role="alert"><AlertCircle /><div><strong>Hay cambios sin guardar</strong><p>Si cierras ahora, se perderán los cambios de este formulario.</p><div className="cf-acciones"><button type="button" className="enterprise-action" onClick={() => setSalir(false)}>Seguir editando</button><button type="button" className="enterprise-action cf-peligro" onClick={onCerrar}>Descartar y cerrar</button></div></div></div>}
    <form hidden={salir} className="cf-form" style={salir ? { display: 'none' } : undefined} onSubmit={e => { e.preventDefault(); if (paso < 2) siguiente(); else void guardar(); }}>
      <fieldset className="cf-fieldset" disabled={guardando}><div className="cf-editor-page" key={paso}>
      {paso === 0 && <>
        <label className="cf-campo"><span>Nombre del evento <b aria-hidden="true">*</b></span><input value={d.titulo} maxLength={120} minLength={3} required onChange={e => set('titulo', e.target.value)} placeholder="Encuentro de innovación Moon" autoFocus /><small>{d.titulo.length}/120 caracteres</small></label>
        <div className="cf-campo"><span>¿Cómo se reunirán?</span><div className="cf-modalidades">{(Object.keys(MODALIDADES) as Modalidad[]).map(m => <button key={m} type="button" className="cf-opcion" aria-pressed={d.modalidad === m} onClick={() => set('modalidad', m)}>
          {m === 'presencial' ? <MapPin /> : <Video />}<strong>{MODALIDADES[m].nombre}</strong><small>{MODALIDADES[m].detalle}</small><Check className="cf-opcion__check" /></button>)}</div></div>
        <div className="cf-fila"><label className="cf-campo"><span>Fecha y hora de inicio *</span><input type="datetime-local" required value={d.inicio} onChange={e => set('inicio', e.target.value)} /></label>
          <label className="cf-campo"><span>Fecha y hora de cierre *</span><input type="datetime-local" required value={d.fin} min={d.inicio} onChange={e => set('fin', e.target.value)} /></label></div>
        <p className="cf-inline-note"><CalendarClock /> Horarios en {zonaFormulario()}. Se guardan como un instante único para todos los invitados.</p>
        {presencial && <label className="cf-campo"><span>Dirección o lugar *</span><input required value={d.lugar} maxLength={200} onChange={e => set('lugar', e.target.value)} placeholder="Sede, sala o dirección completa" /></label>}
        <label className="cf-campo"><span>Acerca del encuentro</span><textarea value={d.descripcion} maxLength={4000} onChange={e => set('descripcion', e.target.value)} placeholder="Presenta el propósito, la agenda y a quién está dirigido." rows={4} /></label>
      </>}
      {paso === 1 && <>
        <div className="cf-fila"><label className="cf-campo"><span>Aforo máximo</span><input type="number" required min={0} max={100000} value={d.capacidad} onChange={e => set('capacidad', Number(e.target.value))} /><small>Escribe 0 para no establecer un límite.</small></label>
          <label className="cf-campo"><span>Abrir acceso antes del inicio</span><div className="cf-input-unit"><input type="number" required min={0} max={1440} value={d.aperturaMinutos} onChange={e => set('aperturaMinutos', Number(e.target.value))} /><span>minutos</span></div><small>Hasta un día antes del horario del evento.</small></label></div>
        <label className="cf-campo"><span>Indicaciones para tus invitados</span><textarea value={d.instrucciones} maxLength={2000} onChange={e => set('instrucciones', e.target.value)} placeholder={presencial ? 'Presenta tu QR y un documento en la entrada. Llega 15 minutos antes.' : 'Ten tu cámara y micrófono listos. Ingresa desde tu invitación.'} rows={3} /></label>
        <div className="cf-settings"><label className="cf-interruptor"><input type="checkbox" checked={d.ingresoUnico} onChange={e => set('ingresoUnico', e.target.checked)} /><span><strong>Un ingreso por invitación</strong><small>Desactívalo si se permite salir y volver a entrar.</small></span></label>
          {virtual && <><label className="cf-interruptor"><input type="checkbox" checked={d.salaEspera} onChange={e => set('salaEspera', e.target.checked)} /><span><strong>Esperar la aprobación del moderador</strong><small>La sala de espera protege el acceso a la videollamada.</small></span></label>
            <label className="cf-interruptor"><input type="checkbox" checked={d.grabacionPermitida} onChange={e => set('grabacionPermitida', e.target.checked)} /><span><strong>Permitir grabación</strong><small>Se informa a los participantes. La disponibilidad depende del servidor de video.</small></span></label></>}
        </div>
        {editaEquipo && <div className="cf-campo"><span>Quién organiza este evento</span><p className="cf-muted">Asigna responsabilidades a personas de Moon Studios.</p>
          {Object.entries(equipo).map(([uid, rol]) => { const p = personal.find(x => x.uid === uid); return <div key={uid} className="cf-persona"><span className="cf-avatar">{(p?.nombre || 'M').slice(0, 1)}</span><div>{p?.nombre ?? 'Cuenta sin perfil'}<small>{p?.role}</small></div>
            <select className="cf-input" aria-label={`Responsabilidad de ${p?.nombre ?? uid}`} value={rol} onChange={e => set('equipo', { ...equipo, [uid]: e.target.value as RolEquipo })}>{(Object.keys(ROLES_EQUIPO) as RolEquipo[]).map(r => <option key={r} value={r}>{ROLES_EQUIPO[r].nombre}</option>)}</select>
            <button type="button" className="cf-icono" aria-label={`Quitar a ${p?.nombre ?? 'esta persona'}`} onClick={() => { const n = { ...equipo }; delete n[uid]; set('equipo', n); }}><Trash2 /></button></div>; })}
          <div className="cf-filtros"><select className="cf-input" value={nuevoMiembro} onChange={e => setNuevoMiembro(e.target.value)} aria-label="Agregar persona al equipo"><option value="">Selecciona una persona…</option>{personal.filter(p => !equipo[p.uid]).map(p => <option key={p.uid} value={p.uid}>{p.nombre} · {p.role}</option>)}</select>
            <button type="button" className="enterprise-action" disabled={!nuevoMiembro} onClick={() => { set('equipo', { ...equipo, [nuevoMiembro]: 'control' }); setNuevoMiembro(''); }}><Plus />Agregar</button></div>
          <div className="cf-role-guide">{Object.values(ROLES_EQUIPO).map(r => <div key={r.nombre}><strong>{r.nombre}</strong><small>{r.detalle}</small></div>)}</div>
        </div>}
      </>}
      {paso === 2 && <><div className="cf-review"><span className="cf-review__icon"><CheckCheck /></span><span className="cf-eyebrow">LISTO PARA {evento ? 'ACTUALIZAR' : 'CREAR'}</span><h3>{d.titulo}</h3><p>{MODALIDADES[d.modalidad].nombre}</p>
        <dl className="cf-datos"><div><dt>Inicio · {zonaFormulario()}</dt><dd>{new Date(deInputLocal(d.inicio)).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div><div><dt>Finalización · {zonaFormulario()}</dt><dd>{new Date(deInputLocal(d.fin)).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div><div><dt>Aforo</dt><dd>{d.capacidad || 'Sin límite'}</dd></div><div><dt>Apertura del acceso</dt><dd>{d.aperturaMinutos} minutos antes</dd></div>{presencial && <div><dt>Lugar</dt><dd>{d.lugar}</dd></div>}<div><dt>Equipo asignado</dt><dd>{Object.keys(equipo).length} personas</dd></div></dl>
        {d.descripcion && <p className="cf-review__text">{d.descripcion}</p>}</div>
        <p className="cf-nota"><ShieldCheck />{evento ? 'Los cambios se aplicarán a las invitaciones existentes al guardar.' : 'Guardar crea un borrador privado. Programa el evento desde su resumen para habilitar el acceso.'}</p></>}
      </div></fieldset>
      {error && <p className="cf-alerta" role="alert"><AlertCircle />{error}</p>}

      <footer className="cf-editor-footer"><button type="button" className="enterprise-action" disabled={guardando} onClick={paso ? () => { setError(''); setPaso(p => p - 1); } : cerrar}>{paso ? <><ArrowLeft />Anterior</> : 'Cancelar'}</button><span>Paso {paso + 1} de 3</span><button type="submit" className="enterprise-action enterprise-action--primary" disabled={guardando}>{guardando ? <LoaderCircle className="cf-spin" /> : paso === 2 ? <Check /> : null}{paso < 2 ? <>Continuar<ArrowRight /></> : evento ? 'Guardar cambios' : 'Crear borrador'}</button></footer>
    </form>
  </DialogContent></Dialog>;
}

