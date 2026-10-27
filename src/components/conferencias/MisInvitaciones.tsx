import { useEffect, useState } from 'react';
import { AlertCircle, CalendarClock, CalendarPlus, Download, LoaderCircle, MapPin, Megaphone, QrCode, Search, ShieldCheck, Ticket, Video } from 'lucide-react';
import QRCode from 'qrcode';
import { fechaHora, hora } from '@/lib/ajustes/fecha';
import * as api from '@/lib/conferencias/api';
import { escucharAvisos, type MiInvitacion } from '@/lib/conferencias/datos';
import { ESTADOS_EVENTO, MODALIDADES, ROLES_INVITADO, type AvisoConf, type EventoConf } from '@/lib/conferencias/tipos';
import { descargarCalendario, mensajeError, momento, MOMENTOS, normalizarBusqueda, rangoEvento } from './util';

/** Invitaciones de la cuenta: QR personal, avisos y acceso a la sala. */
export function MisInvitaciones({ invitaciones, onEntrarSala }: { invitaciones: MiInvitacion[] | null; onEntrarSala: (evento: EventoConf, moderador: boolean) => void }) {
  const [busqueda, setBusqueda] = useState(''), [filtro, setFiltro] = useState<'proximas' | 'historial' | 'todas'>('proximas');
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30000); return () => clearInterval(t); }, []);
  if (invitaciones === null) return <div className="cf-loading" role="status"><LoaderCircle className="cf-spin" />Buscando tus invitaciones…</div>;
  const esPasada = (m: MiInvitacion) => m.evento.fin < ahora || ['cancelado', 'finalizado'].includes(m.evento.estado) || m.invitacion.estado === 'revocada';
  const lista = invitaciones.filter(m => (filtro === 'todas' || (filtro === 'historial' ? esPasada(m) : !esPasada(m))) && normalizarBusqueda(`${m.evento.titulo} ${m.evento.lugar}`).includes(normalizarBusqueda(busqueda)));
  return <section className="cf-panel cf-wallet"><header><div><span className="cf-eyebrow">PERSONAL E INTRANSFERIBLE</span><h2>Tu lugar está reservado.</h2><p className="cf-muted">Tus invitaciones, indicaciones y acceso a cada encuentro.</p></div><Ticket className="cf-section-icon" /></header>
    <div className="cf-agenda-toolbar"><label className="cf-search"><Search /><input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar entre tus invitaciones…" aria-label="Buscar mis invitaciones" /></label><div className="cf-segmented">{(['proximas', 'historial', 'todas'] as const).map(f => <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{f === 'proximas' ? 'Próximas' : f === 'historial' ? 'Historial' : 'Todas'}</button>)}</div></div>
    {lista.length ? <div className="cf-invitaciones">{lista.map(m => <Pase key={`${m.evento.id}-${m.invitacion.id}`} item={m} ahora={ahora} onEntrarSala={onEntrarSala} />)}</div> : <div className="cf-vacio"><Ticket /><h3>{invitaciones.length ? 'No hay invitaciones en esta vista.' : 'Lo bueno está por llegar.'}</h3><p>{invitaciones.length ? 'Prueba otra búsqueda o revisa tu historial.' : 'Cuando te inviten a un evento de Moon Studios, tu pase personal aparecerá aquí.'}</p>{invitaciones.length > 0 && <button type="button" className="enterprise-action" onClick={() => { setBusqueda(''); setFiltro('todas'); }}>Ver todas mis invitaciones</button>}</div>}
  </section>;
}

function Pase({ item: { evento, invitacion }, onEntrarSala, ahora }: { item: MiInvitacion; ahora: Date; onEntrarSala: (evento: EventoConf, moderador: boolean) => void }) {
  const [qrGuardado, setQr] = useState<{ imagen: string; codigo: string; version: number } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [avisos, setAvisos] = useState<AvisoConf[]>([]);
  useEffect(() => escucharAvisos(evento.id, setAvisos, () => setError('No se pudieron actualizar los avisos del evento.')), [evento.id]);
  // Si se regenera o revoca la credencial, el QR mostrado deja de valer: se oculta.
  const qr = qrGuardado && qrGuardado.version === invitacion.version && invitacion.estado === 'aceptada' ? qrGuardado : null;

  const vigente = invitacion.estado === 'aceptada' && evento.estado === 'programado' && evento.fin >= ahora;
  const situacion = evento.estado === 'programado' ? momento(evento, ahora) : null;
  const salaAbierta = evento.salaVirtual && evento.estado === 'programado' && (situacion === 'abierto' || situacion === 'en-curso');
  const mostrarQr = async () => {
    setCargando(true); setError('');
    try {
      const c = await api.credencial(evento.id, invitacion.id);
      setQr({ imagen: await QRCode.toDataURL(c.qr, { errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#000000', light: '#ffffff' } }), codigo: c.codigo, version: invitacion.version });
    } catch (e) { setError(mensajeError(e)); } finally { setCargando(false); }
  };

  return <article className="cf-pase" data-inactive={!vigente}>
    <div className="cf-pase__info">
      <span className="cf-eyebrow">{MODALIDADES[evento.modalidad].nombre} · {ROLES_INVITADO[invitacion.rol]}</span>
      <h3>{evento.titulo}</h3>
      <div className="cf-evento__pie">
        <span className={`cf-chip${situacion === 'en-curso' || situacion === 'abierto' ? ' cf-chip--vivo' : ''}${evento.estado === 'cancelado' ? ' cf-chip--off' : ''}`}><span className="cf-punto" />{situacion ? MOMENTOS[situacion] : ESTADOS_EVENTO[evento.estado]}</span>
        <span className="cf-chip"><CalendarClock />{rangoEvento(evento)}</span>
        {evento.lugar && <span className="cf-chip"><MapPin />{evento.lugar}</span>}
        {invitacion.ingresos > 0 && <span className="cf-chip cf-chip--ok">Asististe · {invitacion.primerIngresoAt && hora(invitacion.primerIngresoAt)}</span>}
      </div>
      {evento.descripcion && <p className="cf-muted" style={{ whiteSpace: 'pre-wrap' }}>{evento.descripcion}</p>}
      {evento.instrucciones && <p className="cf-nota"><Ticket />{evento.instrucciones}</p>}
      {avisos.length > 0 && <div className="cf-avisos">{avisos.slice(0, 3).map(a => <div key={a.id} className="cf-aviso"><strong><Megaphone style={{ width: 13, display: 'inline', verticalAlign: '-2px' }} /> {a.titulo}</strong><p>{a.mensaje}</p><time>{a.at && fechaHora(a.at)}</time></div>)}</div>}
      {invitacion.estado === 'revocada' && <p className="cf-alerta"><AlertCircle />Esta invitación fue revocada por la organización.</p>}
      {evento.estado === 'cancelado' && <p className="cf-alerta"><AlertCircle />El evento fue cancelado.</p>}
      {invitacion.estado === 'pendiente' && <p className="cf-nota"><ShieldCheck />Esta invitación aún no se ha activado. Abre el enlace personal que envió la organización.</p>}
      {error && <p className="cf-alerta" role="alert"><AlertCircle />{error}</p>}
      {evento.salaVirtual && vigente && <div className="cf-acciones" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="enterprise-action enterprise-action--primary" disabled={!salaAbierta} onClick={() => onEntrarSala(evento, invitacion.rol === 'moderador')}><Video />{salaAbierta ? 'Entrar a la sala' : `La sala abre ${evento.aperturaMinutos} min antes`}</button>
      </div>}
      {!['cancelado', 'finalizado'].includes(evento.estado) && evento.fin >= ahora && <button type="button" className="enterprise-action cf-calendar-action" onClick={() => descargarCalendario(evento)}><CalendarPlus />Añadir al calendario</button>}
    </div>
    {evento.modalidad !== 'virtual' && evento.modalidad !== 'reunion' && <div className="cf-pase__qr">
      {qr && vigente ? <><img src={qr.imagen} alt={`Código QR de acceso a ${evento.titulo}`} /><span className="cf-codigo" style={{ fontSize: 16 }}>{qr.codigo}</span><small className="cf-muted">Muéstralo en la entrada. Es personal.</small><a className="enterprise-action" href={qr.imagen} download={`moon-pase-${invitacion.id}.png`}><Download />Guardar mi QR</a></>
        : <><QrCode style={{ width: 40, height: 40, opacity: .6 }} /><button type="button" className="enterprise-action" disabled={!vigente || cargando} onClick={() => void mostrarQr()}>{cargando ? <LoaderCircle className="cf-spin" /> : <QrCode />}Mostrar mi QR</button></>}
    </div>}
  </article>;
}
