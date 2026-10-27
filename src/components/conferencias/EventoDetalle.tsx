import { useEffect, useMemo, useRef, useState } from 'react';
import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
import {
  AlertCircle, ArrowLeft, Ban, Check, Globe2, ClipboardList, Copy, Download, FilePenLine, History, KeyRound, LoaderCircle, Megaphone,
  CalendarClock, RefreshCw, ScanLine, Search, Send, ShieldCheck, Trash2, Unlink, UserPlus, Users, Video,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fechaHora, hora } from '@/lib/ajustes/fecha';
import * as api from '@/lib/conferencias/api';
import { escucharAsistencia, escucharAuditoria, escucharAvisos, escucharEspera, escucharInvitaciones } from '@/lib/conferencias/datos';
import {
  ACCIONES_AUDITORIA, ESTADOS_EVENTO, ESTADOS_INVITACION, MODALIDADES, ROLES_EQUIPO, ROLES_INVITADO, VIAS,
  type AsistenciaConf, type AvisoConf, type EsperaConf, type EventoConf, type InvitacionConf, type RegistroConf,
} from '@/lib/conferencias/tipos';
import { ControlAcceso } from './ControlAcceso';
import { EventoEditor, type Persona } from './EventoEditor';
import { InvitarDialog } from './InvitarDialog';
import { copiar, descargarCalendario, descargarCsv, mensajeError, momento, MOMENTOS, normalizarBusqueda, rangoEvento } from './util';

import { precargarSala } from './cargarSala';
import { useSalaActiva } from './salaActiva';

export interface Permisos { global: boolean; gestiona: boolean; veInvitados: boolean; modera: boolean; controla: boolean; auditoria: boolean }
type Vista = 'resumen' | 'invitados' | 'asistencia' | 'puerta' | 'sala' | 'avisos' | 'auditoria';

export function EventoDetalle({ evento, permisos, personal, uid, onVolver, onPublicarFest }: {
  evento: EventoConf; permisos: Permisos; personal: Persona[]; uid: string; onVolver: () => void;
  /** Copia el evento a MOON FEST (sitio público con inscripción abierta). */
  onPublicarFest?: () => void;
}) {
  const [vista, setVista] = useState<Vista>('resumen');
  const [invitaciones, setInvitaciones] = useState<InvitacionConf[]>([]);
  const [asistencia, setAsistencia] = useState<AsistenciaConf[]>([]);
  const [avisos, setAvisos] = useState<AvisoConf[]>([]);
  const [espera, setEspera] = useState<EsperaConf[]>([]);
  const [auditoria, setAuditoria] = useState<RegistroConf[]>([]);
  const [editando, setEditando] = useState(false);
  const [invitando, setInvitando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [confirmar, setConfirmar] = useState<{ texto: string; accion: () => Promise<void> } | null>(null);
  // La sala vive en SalaActivaProvider: no se corta al volver o al navegar.
  const { entrar: entrarSala } = useSalaActiva();
  useEffect(() => { if (evento.salaVirtual && evento.estado === 'programado') precargarSala(); }, [evento.salaVirtual, evento.estado]);
  const bloqueo = useRef(false);

  useEffect(() => {
    const fallo = (e: Error) => setError(e.message.includes('permission') ? 'No tienes acceso a esta parte del evento.' : e.message);
    const stops = [escucharAvisos(evento.id, setAvisos, fallo)];
    if (permisos.veInvitados) stops.push(escucharInvitaciones(evento.id, setInvitaciones, fallo), escucharAsistencia(evento.id, setAsistencia, fallo));
    if (permisos.modera && evento.salaVirtual) stops.push(escucharEspera(evento.id, setEspera, fallo));
    if (permisos.auditoria) stops.push(escucharAuditoria(evento.id, setAuditoria, fallo));
    return () => stops.forEach(s => s());
  }, [evento.id, evento.salaVirtual, permisos.veInvitados, permisos.modera, permisos.auditoria]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 5000); return () => clearTimeout(t); }, [aviso]);

  const nombreDe = (u: string | null | undefined) => (u ? personal.find(p => p.uid === u)?.nombre ?? invitaciones.find(i => i.ownerUid === u)?.nombre ?? 'Cuenta externa' : '—');
  const correr = async (clave: string, fn: () => Promise<unknown>, exito?: string) => {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(clave); setError('');
    try { await fn(); if (exito) setAviso(exito); } catch (e) { setError(mensajeError(e)); } finally { bloqueo.current = false; setOcupado(''); setConfirmar(null); }
  };
  const cambiarEstado = (estado: string, texto: string) => setConfirmar({ texto, accion: () => correr(`estado-${estado}`, () => api.editarEvento(evento.id, { estado }), `Evento ${ESTADOS_EVENTO[estado as keyof typeof ESTADOS_EVENTO].toLowerCase()}.`) });
  const c = evento.contadores;
  const enEspera = espera.filter(e => e.estado === 'esperando');
  const situacion = evento.estado === 'programado' ? momento(evento) : null;
  const pestañas: { v: Vista; nombre: string; icono: typeof Users; ver: boolean; n?: number }[] = [
    { v: 'resumen', nombre: 'Resumen', icono: ClipboardList, ver: true },
    { v: 'invitados', nombre: 'Invitados', icono: Users, ver: permisos.veInvitados, n: c.invitados },
    { v: 'asistencia', nombre: 'Asistencia', icono: Check, ver: permisos.veInvitados, n: c.asistentes },
    { v: 'puerta', nombre: 'Control de acceso', icono: ScanLine, ver: permisos.controla },
    { v: 'sala', nombre: 'Sala virtual', icono: Video, ver: evento.salaVirtual && permisos.modera, n: enEspera.length || undefined },
    { v: 'avisos', nombre: 'Avisos', icono: Megaphone, ver: true, n: avisos.length || undefined },
    { v: 'auditoria', nombre: 'Auditoría', icono: History, ver: permisos.auditoria },
  ];
  const vistaSegura = pestañas.some(p => p.v === vista && p.ver) ? vista : 'resumen';


  return <div className="cf">
    <div className="cf-detalle__cabecera cf-detail-hero">
      <div style={{ minWidth: 0 }}>
        <button type="button" className="cf-volver" onClick={onVolver}><ArrowLeft />Todos los eventos</button>
        <span className="cf-eyebrow">MOON STUDIOS / {MODALIDADES[evento.modalidad].nombre}</span>
        <h2>{evento.titulo}</h2>
        <div className="cf-evento__pie" style={{ marginTop: 8 }}>
          <span className={`cf-chip${situacion === 'en-curso' || situacion === 'abierto' ? ' cf-chip--vivo' : ''}${evento.estado === 'cancelado' ? ' cf-chip--off' : ''}`}><span className="cf-punto" />{situacion ? MOMENTOS[situacion] : ESTADOS_EVENTO[evento.estado]}</span>
          <span className="cf-chip">{MODALIDADES[evento.modalidad].nombre}</span>
          <span className="cf-chip">{rangoEvento(evento)}</span>
        </div>
      </div>
      {permisos.gestiona && evento.festEventoId && <div className="cf-acciones"><span className="cf-chip" title="Nombre, fechas y estado se sincronizan desde la edición de MOON FEST."><Globe2 />Sala de MOON FEST · se gestiona desde la edición</span></div>}
      {permisos.gestiona && !evento.festEventoId && <div className="cf-acciones">
        {evento.estado !== 'finalizado' && <button type="button" className="enterprise-action" onClick={() => setEditando(true)}><FilePenLine />Editar</button>}
        {evento.estado === 'borrador' && <button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado} onClick={() => cambiarEstado('programado', '¿Programar el evento? Los invitados podrán activar sus invitaciones y, a la hora indicada, entrar.')}><Check />Programar</button>}
        {evento.estado === 'cancelado' && <button type="button" className="enterprise-action" disabled={!!ocupado} onClick={() => cambiarEstado('programado', '¿Reactivar el evento?')}><RefreshCw />Reactivar</button>}
        {evento.estado === 'programado' && <button type="button" className="enterprise-action" disabled={!!ocupado} onClick={() => cambiarEstado('finalizado', '¿Finalizar el evento? Se cierra el acceso y la asistencia queda archivada; no se puede deshacer.')}><Check />Finalizar</button>}
        {['borrador', 'programado'].includes(evento.estado) && <button type="button" className="enterprise-action cf-peligro" disabled={!!ocupado} onClick={() => cambiarEstado('cancelado', '¿Cancelar el evento? Ninguna invitación servirá para entrar mientras esté cancelado.')}><Ban />Cancelar evento</button>}
        {onPublicarFest && evento.estado !== 'finalizado' && <button type="button" className="enterprise-action" onClick={onPublicarFest}><Globe2 />Crear edición en MOON FEST</button>}
        {permisos.global && c.ingresos === 0 && <button type="button" className="cf-icono" aria-label="Eliminar evento" disabled={!!ocupado} onClick={() => setConfirmar({ texto: '¿Eliminar el evento con todas sus invitaciones? No se puede deshacer.', accion: () => correr('eliminar', async () => { await api.eliminarEvento(evento.id); onVolver(); }) })}><Trash2 /></button>}
      </div>}
    </div>

    {confirmar && <Dialog open onOpenChange={v => { if (!v && !ocupado) setConfirmar(null); }}><DialogContent className="cf-dialog cf-confirm max-w-lg"><span className="cf-confirm__icon"><ShieldCheck /></span><span className="cf-eyebrow">CONFIRMA LA ACCIÓN</span><DialogTitle>Una última revisión.</DialogTitle><DialogDescription>{confirmar.texto}</DialogDescription>
      <div className="cf-acciones"><button type="button" className="enterprise-action" disabled={!!ocupado} onClick={() => setConfirmar(null)} autoFocus>Volver</button><button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado} onClick={() => void confirmar.accion()}>{ocupado && <LoaderCircle className="cf-spin" />}Confirmar</button></div>
    </DialogContent></Dialog>}
    {error && <p className="cf-alerta" role="alert"><AlertCircle />{error}</p>}
    {aviso && <p className="cf-nota" role="status"><Check />{aviso}</p>}

    <nav className="cf-tabs" aria-label="Secciones del evento">{pestañas.filter(p => p.ver).map(({ v, nombre, icono: Icono, n }) =>
      <button key={v} type="button" aria-current={vistaSegura === v ? 'page' : undefined} onClick={() => setVista(v)}><Icono />{nombre}{n !== undefined && n > 0 && <span className="cf-count">{n}</span>}</button>)}</nav>

    {vistaSegura === 'resumen' && <><div className="cf-operation-guide"><span><ShieldCheck />{evento.estado === 'borrador' ? '1. Configura el encuentro' : '1. Encuentro configurado'}</span><span><Users />{c.invitados ? `${c.invitados} invitaciones creadas` : '2. Agrega tus invitados'}</span><span><ScanLine />{evento.estado === 'programado' ? '3. Acceso según el horario' : '3. Programa para habilitar el acceso'}</span></div><Resumen evento={evento} nombreDe={nombreDe} /></>}
    {vistaSegura === 'invitados' && <Invitados evento={evento} invitaciones={invitaciones} gestiona={permisos.gestiona} onInvitar={() => setInvitando(true)} ocupado={ocupado} correr={correr} setConfirmar={setConfirmar} />}
    {vistaSegura === 'asistencia' && <Asistencia evento={evento} asistencia={asistencia} invitaciones={invitaciones} nombreDe={nombreDe} />}
    {vistaSegura === 'puerta' && (evento.estado === 'programado' ? <ControlAcceso evento={evento} /> : <p className="cf-nota"><AlertCircle />El control de acceso funciona cuando el evento está programado.</p>)}
    {vistaSegura === 'sala' && <Sala evento={evento} espera={espera} ocupado={ocupado} correr={correr} onEntrar={() => entrarSala(evento, permisos.modera)} />}
    {vistaSegura === 'avisos' && <Avisos evento={evento} avisos={avisos} gestiona={permisos.gestiona} correr={correr} ocupado={ocupado} />}
    {vistaSegura === 'auditoria' && <Auditoria registros={auditoria} nombreDe={nombreDe} invitaciones={invitaciones} />}

    {editando && permisos.gestiona && <EventoEditor evento={evento} personal={personal} editaEquipo={permisos.global} onCerrar={() => setEditando(false)} onGuardado={() => { setEditando(false); setAviso('Evento actualizado.'); }} />}
    {invitando && permisos.gestiona && <InvitarDialog eventoId={evento.id} personal={personal.filter(p => p.uid !== uid || permisos.global)} existentes={invitaciones}
      capacidadRestante={evento.capacidad > 0 ? Math.max(0, evento.capacidad - c.invitados) : null} onCerrar={() => setInvitando(false)} />}
  </div>;
}

function Resumen({ evento, nombreDe }: { evento: EventoConf; nombreDe: (u: string) => string }) {
  const c = evento.contadores;
  const pct = (a: number, b: number) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
  return <>
    <div className="cf-metricas">
      <div className="cf-metrica"><span>Invitaciones</span><strong>{c.invitados}{evento.capacidad > 0 && <small className="cf-muted" style={{ fontSize: 13 }}> / {evento.capacidad}</small>}</strong>{evento.capacidad > 0 && <div className="cf-barra"><i style={{ width: `${pct(c.invitados, evento.capacidad)}%` }} /></div>}</div>
      <div className="cf-metrica"><span>Activadas</span><strong>{c.aceptadas}</strong><div className="cf-barra"><i style={{ width: `${pct(c.aceptadas, c.invitados)}%` }} /></div></div>
      <div className="cf-metrica"><span>Asistieron</span><strong>{c.asistentes}</strong><div className="cf-barra"><i style={{ width: `${pct(c.asistentes, c.aceptadas)}%` }} /></div></div>
      <div className="cf-metrica"><span>Ingresos registrados</span><strong>{c.ingresos}</strong></div>
    </div>
    <section className="cf-panel">
      <header><div><span className="cf-eyebrow">LA EXPERIENCIA EN DETALLE</span><h2>Todo sobre este encuentro.</h2></div><button type="button" className="enterprise-action" onClick={() => descargarCalendario(evento)}><CalendarClock />Calendario</button></header>
      <dl className="cf-datos">
        <div><dt>Modalidad</dt><dd>{MODALIDADES[evento.modalidad].nombre}</dd></div>
        <div><dt>Horario</dt><dd>{rangoEvento(evento)}</dd></div>
        <div><dt>Acceso desde</dt><dd>{evento.aperturaMinutos} min antes del inicio</dd></div>
        {evento.lugar && <div><dt>Lugar</dt><dd>{evento.lugar}</dd></div>}
        <div><dt>Aforo</dt><dd>{evento.capacidad || 'Sin límite'}</dd></div>
        <div><dt>Ingreso</dt><dd>{evento.ingresoUnico ? 'Único por invitación' : 'Puede salir y volver'}</dd></div>
        {evento.salaVirtual && <div><dt>Sala virtual</dt><dd>{evento.salaEspera ? 'Con sala de espera' : 'Entrada directa'}{evento.grabacionPermitida ? ' · grabación permitida' : ''}</dd></div>}
        <div><dt>Creado por</dt><dd>{evento.creadoPorNombre || '—'}</dd></div>
      </dl>
      {evento.descripcion && <><h3 style={{ marginTop: 18 }}>Descripción</h3><p className="cf-muted" style={{ whiteSpace: 'pre-wrap' }}>{evento.descripcion}</p></>}
      {evento.instrucciones && <><h3 style={{ marginTop: 18 }}>Instrucciones para los invitados</h3><p className="cf-muted" style={{ whiteSpace: 'pre-wrap' }}>{evento.instrucciones}</p></>}
      {Object.keys(evento.equipo).length > 0 && <><h3 style={{ marginTop: 18 }}>Equipo del evento</h3>
        <div className="cf-evento__pie">{Object.entries(evento.equipo).map(([u, r]) => <span key={u} className="cf-chip">{nombreDe(u)} · {ROLES_EQUIPO[r].nombre}</span>)}</div></>}
    </section>
  </>;
}

type Correr = (clave: string, fn: () => Promise<unknown>, exito?: string) => Promise<void>;
type Confirmar = (c: { texto: string; accion: () => Promise<void> } | null) => void;

function Invitados({ evento, invitaciones, gestiona, onInvitar, ocupado, correr, setConfirmar }: {
  evento: EventoConf; invitaciones: InvitacionConf[]; gestiona: boolean; onInvitar: () => void; ocupado: string; correr: Correr; setConfirmar: Confirmar;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'pendiente' | 'aceptada' | 'revocada'>('todas');
  const [enlaceNuevo, setEnlaceNuevo] = useState<{ nombre: string; enlace: string } | null>(null);
  const abierta = !['cancelado', 'finalizado'].includes(evento.estado);
  const lista = useMemo(() => invitaciones.filter(i => (filtro === 'todas' || i.estado === filtro)
    && normalizarBusqueda(`${i.nombre} ${i.email} ${i.codigo}`).includes(normalizarBusqueda(busqueda))), [invitaciones, filtro, busqueda]);
  const exportar = () => descargarCsv(`invitados-${evento.titulo}`, ['Nombre', 'Correo', 'Tipo', 'Rol', 'Estado', 'Código', 'Ingresos', 'Primer ingreso', 'Enviada'],
    lista.map(i => [i.nombre, i.email, i.interno ? 'Equipo' : 'Externo', ROLES_INVITADO[i.rol], ESTADOS_INVITACION[i.estado], i.codigo, i.ingresos, i.primerIngresoAt ? fechaHora(i.primerIngresoAt) : '', i.enviadaAt ? fechaHora(i.enviadaAt) : '']));
  return <section className="cf-panel">
    <header><div><h2>Invitados</h2><p className="cf-muted">{invitaciones.filter(i => i.estado !== 'revocada').length} vigentes · {invitaciones.filter(i => i.estado === 'pendiente').length} sin activar</p></div>
      <div className="cf-acciones">
        <button type="button" className="enterprise-action" disabled={!lista.length} onClick={exportar}><Download />CSV</button>
        {gestiona && abierta && <button type="button" className="enterprise-action enterprise-action--primary" onClick={onInvitar}><UserPlus />Invitar</button>}
      </div></header>
    {enlaceNuevo && <div className="cf-enlace" style={{ marginBottom: 12 }}><div style={{ minWidth: 0 }}><strong>Nuevo enlace para {enlaceNuevo.nombre}</strong><code>{enlaceNuevo.enlace}</code></div>
      <button type="button" className="cf-icono" aria-label="Copiar enlace" onClick={() => void copiar(enlaceNuevo.enlace)}><Copy /></button></div>}
    <div className="cf-filtros">
      <input className="cf-input" type="search" placeholder="Buscar nombre, correo o código…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar invitados" />
      {(['todas', 'aceptada', 'pendiente', 'revocada'] as const).map(f => <button key={f} type="button" className="enterprise-pill" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{f === 'todas' ? 'Todas' : ESTADOS_INVITACION[f]}</button>)}
    </div>
    {lista.length ? <div className="cf-tabla-envoltorio"><table className="cf-tabla">
      <thead><tr><th>Invitado</th><th>Rol</th><th>Estado</th><th>Código</th><th>Asistencia</th>{gestiona && <th><span className="sr-only">Acciones</span></th>}</tr></thead>
      <tbody>{lista.map(i => <tr key={i.id}>
        <td><strong style={{ fontWeight: 500 }}>{i.nombre}</strong><small>{i.interno ? 'Equipo Moon Studios' : i.email}</small></td>
        <td>{ROLES_INVITADO[i.rol]}</td>
        <td><span className={`cf-chip${i.estado === 'aceptada' ? ' cf-chip--ok' : i.estado === 'revocada' ? ' cf-chip--off' : ''}`}>{ESTADOS_INVITACION[i.estado]}</span>{i.enviadaAt && <small>Enviada {fechaHora(i.enviadaAt)}</small>}</td>
        <td><code>{i.estado === 'revocada' ? '—' : i.codigo}</code></td>
        <td>{i.ingresos ? <>{i.ingresos} {i.ingresos === 1 ? 'ingreso' : 'ingresos'}<small>{i.primerIngresoAt && hora(i.primerIngresoAt)}</small></> : <span className="cf-muted">—</span>}</td>
        {gestiona && <td><div className="cf-acciones-fila">{i.estado !== 'revocada' && abierta && <>
          <button type="button" className="cf-icono" title="Enviar invitación" aria-label={`Enviar invitación a ${i.nombre}`} disabled={!!ocupado} onClick={() => void correr(`env-${i.id}`, () => api.enviarInvitacion(evento.id, i.id), i.interno ? 'Notificación enviada.' : 'Correo enviado.')}>{ocupado === `env-${i.id}` ? <LoaderCircle className="cf-spin" /> : <Send />}</button>
          <button type="button" className="cf-icono" title="Nuevo enlace y QR" aria-label={`Regenerar enlace y QR de ${i.nombre}`} disabled={!!ocupado} onClick={() => setConfirmar({ texto: `¿Generar un nuevo QR y enlace para ${i.nombre}? Los anteriores dejarán de valer.`, accion: () => correr(`reg-${i.id}`, async () => { const r = await api.regenerar(evento.id, i.id); if (!i.interno) setEnlaceNuevo({ nombre: i.nombre, enlace: r.enlace }); }, 'Credenciales regeneradas.') })}><KeyRound /></button>
          {!i.interno && i.ownerUid && <button type="button" className="cf-icono" title="Desvincular la cuenta" aria-label={`Desvincular la cuenta de ${i.nombre}`} disabled={!!ocupado} onClick={() => setConfirmar({ texto: `¿Desvincular la cuenta que activó la invitación de ${i.nombre}? Tendrá que activarla de nuevo con un enlace nuevo.`, accion: () => correr(`lib-${i.id}`, async () => { const r = await api.regenerar(evento.id, i.id, true); setEnlaceNuevo({ nombre: i.nombre, enlace: r.enlace }); }, 'Cuenta desvinculada.') })}><Unlink /></button>}
          <button type="button" className="cf-icono" title="Revocar" aria-label={`Revocar la invitación de ${i.nombre}`} disabled={!!ocupado} onClick={() => setConfirmar({ texto: `¿Revocar la invitación de ${i.nombre}? Su enlace y su QR dejarán de valer.`, accion: () => correr(`rev-${i.id}`, () => api.revocar(evento.id, i.id), 'Invitación revocada.') })}><Ban /></button>
        </>}</div></td>}
      </tr>)}</tbody></table></div>
      : <div className="cf-vacio"><Users /><h3>{invitaciones.length ? 'Sin resultados' : 'Aún no hay invitados'}</h3>{!invitaciones.length && gestiona && abierta && <button type="button" className="enterprise-action enterprise-action--primary" onClick={onInvitar}><UserPlus />Invitar</button>}</div>}
  </section>;
}

function Asistencia({ evento, asistencia, invitaciones, nombreDe }: { evento: EventoConf; asistencia: AsistenciaConf[]; invitaciones: InvitacionConf[]; nombreDe: (u: string | null) => string }) {
  const [busqueda, setBusqueda] = useState(''), [via, setVia] = useState('todas');
  const lista = asistencia.filter(a => (via === 'todas' || a.via === via) && normalizarBusqueda(`${a.nombre} ${ROLES_INVITADO[a.rol]}`).includes(normalizarBusqueda(busqueda)));
  const ausentes = invitaciones.filter(i => i.estado === 'aceptada' && !i.ingresos);
  const exportar = () => descargarCsv(`asistencia-${evento.titulo}`, ['Nombre', 'Rol', 'Vía', 'Hora', 'Validado por'],
    lista.map(a => [a.nombre, ROLES_INVITADO[a.rol], VIAS[a.via], a.at ? fechaHora(a.at) : '', a.validadoPor ? nombreDe(a.validadoPor) : 'Automático']));
  return <section className="cf-panel">
    <header><div><h2>Asistencia en vivo</h2><p className="cf-muted">{evento.contadores.asistentes} personas · {evento.contadores.ingresos} ingresos · {ausentes.length} con invitación activa sin ingresar</p></div>
      <button type="button" className="enterprise-action" disabled={!lista.length} onClick={exportar}><Download />Exportar vista</button></header>
    <div className="cf-agenda-toolbar"><label className="cf-search"><Search /><input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar en la asistencia…" aria-label="Buscar en asistencia" /></label><select className="cf-input" aria-label="Filtrar vía de ingreso" value={via} onChange={e => setVia(e.target.value)}><option value="todas">Todas las vías</option>{Object.entries(VIAS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
    <p className="cf-list-caption">{lista.length} resultados entre los últimos 500 registros disponibles.</p>
    {lista.length ? <div className="cf-tabla-envoltorio"><table className="cf-tabla">
      <thead><tr><th>Hora</th><th>Invitado</th><th>Vía</th><th>Validó</th></tr></thead>
      <tbody>{lista.map(a => <tr key={a.id}><td>{a.at ? hora(a.at) : '—'}<small>{a.at && fechaHora(a.at)}</small></td><td>{a.nombre}<small>{ROLES_INVITADO[a.rol]}</small></td><td>{VIAS[a.via]}</td><td>{a.validadoPor ? nombreDe(a.validadoPor) : 'Automático'}</td></tr>)}</tbody>
    </table></div> : <div className="cf-vacio"><Check /><h3>{asistencia.length ? 'No hay coincidencias.' : 'Sin ingresos todavía'}</h3><p>{asistencia.length ? 'Prueba otro nombre o vía de ingreso.' : 'Aparecerán aquí al validar entradas o cuando los invitados entren a la sala.'}</p></div>}
  </section>;
}

function Sala({ evento, espera, ocupado, correr, onEntrar }: { evento: EventoConf; espera: EsperaConf[]; ocupado: string; correr: Correr; onEntrar: () => void }) {
  const esperando = espera.filter(e => e.estado === 'esperando'), expulsados = espera.filter(e => e.estado === 'expulsado');
  const moderar = (e: EsperaConf, accion: 'admitir' | 'rechazar' | 'readmitir') => correr(`${accion}-${e.uid}`, () => api.moderarSala(evento.id, e.uid, accion));
  return <section className="cf-panel">
    <header><div><h2>Sala virtual</h2><p className="cf-muted">{evento.salaEspera ? 'Los invitados esperan a que un moderador los admita.' : 'Los invitados entran directamente.'}</p></div>
      <button type="button" className="enterprise-action enterprise-action--primary" disabled={evento.estado !== 'programado'} onClick={onEntrar}><Video />Entrar a la sala</button></header>
    <h3>Sala de espera ({esperando.length})</h3>
    {esperando.length ? <div className="cf-avisos">{esperando.map(e => <div key={e.uid} className="cf-persona"><div>{e.nombre}<small>{ROLES_INVITADO[e.rol as keyof typeof ROLES_INVITADO] ?? e.rol}{e.at ? ` · desde las ${hora(e.at)}` : ''}</small></div>
      <button type="button" className="enterprise-action" disabled={!!ocupado} onClick={() => void moderar(e, 'rechazar')}>Rechazar</button>
      <button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado} onClick={() => void moderar(e, 'admitir')}>Admitir</button></div>)}</div>
      : <p className="cf-muted">Nadie esperando.</p>}
    {expulsados.length > 0 && <><h3 style={{ marginTop: 16 }}>Acceso retirado</h3><div className="cf-avisos">{expulsados.map(e => <div key={e.uid} className="cf-persona"><div>{e.nombre || 'Participante'}<small>Expulsado de la sala</small></div>
      <button type="button" className="enterprise-action" disabled={!!ocupado} onClick={() => void moderar(e, 'readmitir')}>Readmitir</button></div>)}</div></>}
  </section>;
}

function Avisos({ evento, avisos, gestiona, correr, ocupado }: { evento: EventoConf; avisos: AvisoConf[]; gestiona: boolean; correr: Correr; ocupado: string }) {
  const [titulo, setTitulo] = useState(''), [mensaje, setMensaje] = useState('');
  const titleEmojiRef = useRef<HTMLInputElement>(null), messageEmojiRef = useRef<HTMLTextAreaElement>(null);
  return <section className="cf-panel">
    <header><div><h2>Avisos</h2><p className="cf-muted">Los invitados los ven en su invitación; el equipo invitado recibe además una notificación.</p></div></header>
    {gestiona && evento.estado !== 'finalizado' && <form className="cf-form" style={{ marginBottom: 16 }} onSubmit={e => { e.preventDefault(); void correr('aviso', async () => { await api.publicarAviso(evento.id, titulo, mensaje); setTitulo(''); setMensaje(''); }, 'Aviso publicado.'); }}>
      <label className="cf-campo"><span>Título</span><input ref={titleEmojiRef} value={titulo} maxLength={120} onChange={e => setTitulo(e.target.value)} placeholder="Cambio de horario" /></label>
      <EmojiButton value={titulo} onChange={setTitulo} inputRef={titleEmojiRef} maxLength={120} disabled={!!ocupado} unicodeOnly label="Añadir emoji al título del aviso" />
      <label className="cf-campo"><span>Mensaje</span><textarea ref={messageEmojiRef} value={mensaje} maxLength={2000} onChange={e => setMensaje(e.target.value)} /></label>
      <EmojiButton value={mensaje} onChange={setMensaje} inputRef={messageEmojiRef} maxLength={2000} disabled={!!ocupado} unicodeOnly label="Añadir emoji al aviso para los invitados" />
      <div className="cf-acciones"><button type="submit" className="enterprise-action enterprise-action--primary" disabled={!!ocupado || titulo.trim().length < 3 || !mensaje.trim()}>{ocupado === 'aviso' ? <LoaderCircle className="cf-spin" /> : <Megaphone />}Publicar aviso</button></div>
    </form>}
    {avisos.length ? <div className="cf-avisos">{avisos.map(a => <article key={a.id} className="cf-aviso"><strong><EmojiText text={a.titulo} /></strong><p><EmojiText text={a.mensaje} /></p><time>{a.autorNombre} · {a.at ? fechaHora(a.at) : ''}</time></article>)}</div>
      : <p className="cf-muted">Todavía no hay avisos.</p>}
  </section>;
}

function Auditoria({ registros, nombreDe, invitaciones }: { registros: RegistroConf[]; nombreDe: (u: string) => string; invitaciones: InvitacionConf[] }) {
  const [busqueda, setBusqueda] = useState('');
  const objetivo = (r: RegistroConf) => (r.objetivo ? invitaciones.find(i => i.id === r.objetivo)?.nombre ?? '' : '');
  const lista = registros.filter(r => normalizarBusqueda(`${ACCIONES_AUDITORIA[r.accion] ?? r.accion} ${nombreDe(r.actorUid)} ${objetivo(r)} ${r.motivo ?? ''} ${r.detalle ?? ''}`).includes(normalizarBusqueda(busqueda)));
  return <section className="cf-panel">
    <header><div><h2>Auditoría</h2><p className="cf-muted">Cada acción administrativa y cada intento de acceso, con quién y cuándo.</p></div>
      <button type="button" className="enterprise-action" disabled={!lista.length} onClick={() => descargarCsv('auditoria-evento', ['Hora', 'Acción', 'Por', 'Sobre', 'Detalle'], lista.map(r => [r.at ? fechaHora(r.at, true) : '', ACCIONES_AUDITORIA[r.accion] ?? r.accion, nombreDe(r.actorUid), objetivo(r), r.motivo ?? r.detalle ?? '']))}><Download />Exportar vista</button></header>
    <label className="cf-search"><Search /><input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar acción, persona o detalle…" aria-label="Buscar en auditoría" /></label><p className="cf-list-caption">{lista.length} resultados entre los últimos 300 registros disponibles.</p>
    {lista.length ? <div className="cf-tabla-envoltorio"><table className="cf-tabla">
      <thead><tr><th>Hora</th><th>Acción</th><th>Por</th><th>Detalle</th></tr></thead>
      <tbody>{lista.map(r => <tr key={r.id}><td>{r.at ? fechaHora(r.at, true) : '—'}</td><td>{ACCIONES_AUDITORIA[r.accion] ?? r.accion}</td><td>{nombreDe(r.actorUid)}</td><td>{[objetivo(r), r.motivo, r.detalle].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody>
    </table></div> : <p className="cf-muted">Sin registros.</p>}
  </section>;
}
