import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowDownRight, ArrowUpRight, CalendarClock, CalendarPlus, Globe2, LoaderCircle, LockKeyhole, Mail, MapPin, PartyPopper, Search, ScanLine, ShieldCheck, Ticket, Users, Video } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FestEventEditor } from '@/components/fest/FestEventEditor';
import { saveEvent, watchEvents } from '@/lib/fest/client';
import type { FestEvent, FestEventInput } from '@/types/fest';
import { escucharEventos, escucharMisInvitaciones, type MiInvitacion } from '@/lib/conferencias/datos';
import { ESTADOS_EVENTO, MODALIDADES, type EventoConf } from '@/lib/conferencias/tipos';
import { ControlAcceso } from './ControlAcceso';
import { EventoDetalle, type Permisos } from './EventoDetalle';
import { EventoEditor, type Persona } from './EventoEditor';
import { MisInvitaciones } from './MisInvitaciones';
import { diaEvento, momento, MOMENTOS, normalizarBusqueda, rangoEvento } from './util';
import '@/styles/enterprise-sections.css';
import '@/styles/conferencias.css';

import { precargarSala } from './cargarSala';
import { HuecoSala } from './HuecoSala';
import { useSalaActiva } from './salaActiva';
// MOON FEST (eventos públicos con inscripción abierta) vive aquí, no en Webs.
const FestManagementPanel = lazy(() => import('@/components/fest/FestManagementPanel'));
const CorreoFestPanel = lazy(() => import('@/components/fest/CorreoFest'));
const ROLES_EMPRESA = ['CEO', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación'];
type Vista = 'invitaciones' | 'eventos' | 'puerta' | 'fest';

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** Datos de un evento privado como punto de partida de una edición pública de MOON FEST. */
function aEdicionFest(e: EventoConf): Partial<FestEventInput> {
  const ahora = new Date();
  const formato = e.modalidad === 'presencial' ? 'presencial' : e.modalidad === 'hibrido' ? 'hibrido' : 'virtual';
  return {
    title: e.titulo, slug: slug(e.titulo), summary: (e.descripcion || e.titulo).slice(0, 240), description: e.descripcion,
    format: formato, location: e.lugar || (formato === 'virtual' ? 'En línea' : ''), capacity: e.capacidad,
    startsAt: e.inicio, endsAt: e.fin, registrationOpensAt: ahora, registrationClosesAt: e.inicio > ahora ? e.inicio : undefined,
  };
}

function permisosPara(evento: EventoConf, uid: string, global: boolean): Permisos {
  if (global) return { global, gestiona: true, veInvitados: true, modera: true, controla: true, auditoria: true };
  const rol = evento.equipo[uid];
  return { global, gestiona: rol === 'organizador', veInvitados: rol === 'organizador' || rol === 'moderador', modera: rol === 'organizador' || rol === 'moderador', controla: !!rol, auditoria: rol === 'organizador' };
}

/** Moon Studios Conferencias: eventos privados, invitaciones con QR, puerta y salas propias. */
export default function Conferencias() {
  const { currentUser, puede, userRole } = useAuth();
  const uid = currentUser?.uid ?? '';
  const global = puede('conferencias');
  // Igual que las reglas de MOON FEST: CEO, o Administración con el módulo Webs.
  const gestionaFest = userRole === 'CEO' || (userRole === 'Administración' && puede('webs'));
  const [festVista, setFestVista] = useState<'ediciones' | 'correo'>('ediciones');
  const [params, setParams] = useSearchParams();
  const [eventos, setEventos] = useState<EventoConf[] | null>(null);
  const [mias, setMias] = useState<MiInvitacion[] | null>(null);
  const conSala = !!mias?.some(m => m.evento.salaVirtual && m.evento.estado === 'programado');
  useEffect(() => { if (conSala) precargarSala(); }, [conSala]);
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState<'elegir' | 'privado' | null>(null);
  const [festEditor, setFestEditor] = useState<{ inicial?: Partial<FestEventInput> } | null>(null);
  const [festEventos, setFestEventos] = useState<FestEvent[]>([]);
  useEffect(() => (gestionaFest ? watchEvents(setFestEventos, () => {}, true) : undefined), [gestionaFest]);
  const guardarFest = async (input: FestEventInput, id?: string) => { const r = await saveEvent(input, id); ir('fest'); return r; };
  // La sala vive en SalaActivaProvider: sigue conectada aunque se cambie de página.
  const { activa: salaActiva, expandida: salaExpandida, entrar: entrarSala } = useSalaActiva();
  const [puertaId, setPuertaId] = useState('');
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!uid) return;
    const fallo = (e: Error) => setError(e.message.includes('permission') ? 'No se pudieron cargar los eventos: faltan permisos. Actualiza la aplicación.' : e.message);
    const a = escucharEventos(uid, global, setEventos, fallo);
    const b = escucharMisInvitaciones(uid, setMias, fallo);
    return () => { a(); b(); };
  }, [uid, global]);
  useEffect(() => {
    if (!global && !eventos?.length) return;
    getDocs(collection(db, 'users')).then(s => setPersonal(s.docs
      .filter(d => ROLES_EMPRESA.includes(d.data().role) && d.data().isActive !== false)
      .map(d => ({ uid: d.id, nombre: (d.data().displayName || d.data().email || 'Equipo Moon') as string, role: d.data().role as string }))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')))).catch(() => {});
  }, [global, eventos?.length]);

  const gestiona = global || !!eventos?.length;
  const parametroVista = params.get('vista');
  const vista: Vista = ['invitaciones', 'eventos', 'puerta', 'fest'].includes(parametroVista || '') ? parametroVista as Vista : (gestiona ? 'eventos' : 'invitaciones');
  const vistaActual: Vista = vista === 'fest' ? (gestionaFest ? 'fest' : 'invitaciones') : vista !== 'invitaciones' && !gestiona ? 'invitaciones' : vista;
  const seleccionado = eventos?.find(e => e.id === params.get('evento'));
  const ir = (v: Vista, evento?: string) => setParams(p => { const n = new URLSearchParams(p); n.set('vista', v); if (evento) n.set('evento', evento); else n.delete('evento'); return n; });
  const deHoy = useMemo(() => (eventos ?? []).filter(e => e.estado === 'programado' && ['abierto', 'en-curso'].includes(momento(e, ahora))), [eventos, ahora]);
  const conPuerta = (eventos ?? []).filter(e => e.estado === 'programado' && momento(e) !== 'terminado' && permisosPara(e, uid, global).controla);
  const proximos = (eventos ?? []).filter(e => e.estado === 'programado' && momento(e) !== 'terminado').length;

  if (salaActiva && salaExpandida) return <div className="moon-module moon-module--conferencias"><HuecoSala /></div>;

  return <div className="moon-module moon-module--conferencias cf">
    {!seleccionado && <header className="cf-hub-hero">
      <div className="cf-hub-hero__copy"><span className="cf-eyebrow"><span className="cf-live-dot" /> MOON STUDIOS / ENCUENTROS</span>
        <h1>Conecta ideas.<br /><span>Crea encuentros.</span></h1><p>Un solo lugar para tus conferencias, invitados y experiencias. Desde la primera invitación hasta el último ingreso.</p>
        <div className="cf-acciones">{(global || gestionaFest) && <button type="button" className="enterprise-action enterprise-action--primary" onClick={() => setCreando('elegir')}><CalendarPlus />Crear un encuentro<ArrowUpRight /></button>}
          <button type="button" className="enterprise-action" onClick={() => ir('invitaciones')}><Ticket />Mis invitaciones</button></div>
        <span className="cf-hub-hero__note"><ShieldCheck />Acceso personal · Invitaciones verificadas</span></div>
      <div className="cf-hub-hero__right"><div className="cf-orbit-art" aria-hidden="true"><div className="cf-orbit-art__ring" /><div className="cf-orbit-art__ring" /><span className="cf-orbit-art__moon" /><span className="cf-orbit-art__label">LET’S MEET.<ArrowDownRight /></span></div>
        <div className="cf-hub-metrics"><button type="button" onClick={() => ir('invitaciones')}><span>Mis invitaciones<ArrowUpRight /></span><strong>{mias === null ? '—' : mias.filter(m => m.invitacion.estado === 'aceptada' && m.evento.estado === 'programado' && m.evento.fin >= ahora).length}</strong><small>Activas en tu cuenta</small></button>
        {gestiona && <><button type="button" onClick={() => ir('eventos')}><span>Próximos eventos<ArrowUpRight /></span><strong>{eventos === null ? '—' : proximos}</strong><small>{global ? 'Programados' : 'De tu equipo'}</small></button>
          <button type="button" onClick={() => ir('puerta')}><span>Acceso abierto<ArrowUpRight /></span><strong>{eventos === null ? '—' : deHoy.length}</strong><small>En este momento</small></button></>}</div></div>
    </header>}
    {error && <p className="cf-alerta" role="alert"><AlertCircle />{error}</p>}

    {!seleccionado && <nav className="cf-tabs" aria-label="Secciones de Conferencias">
      <button type="button" aria-current={vistaActual === 'invitaciones' ? 'page' : undefined} onClick={() => ir('invitaciones')}><Ticket />Mis invitaciones</button>
      {gestiona && <button type="button" aria-current={vistaActual === 'eventos' ? 'page' : undefined} onClick={() => ir('eventos')}><Users />Eventos</button>}
      {gestiona && <button type="button" aria-current={vistaActual === 'puerta' ? 'page' : undefined} onClick={() => ir('puerta')}><ScanLine />Control de acceso{deHoy.length > 0 && <span className="cf-count">{deHoy.length}</span>}</button>}
      {gestionaFest && <button type="button" aria-current={vistaActual === 'fest' ? 'page' : undefined} onClick={() => ir('fest')}><PartyPopper />MOON FEST</button>}
    </nav>}

    {seleccionado ? <EventoDetalle key={seleccionado.id} evento={seleccionado} permisos={permisosPara(seleccionado, uid, global)} personal={personal} uid={uid} onVolver={() => ir('eventos')}
      onPublicarFest={gestionaFest ? () => setFestEditor({ inicial: aEdicionFest(seleccionado) }) : undefined} />
      : vistaActual === 'invitaciones' ? <MisInvitaciones invitaciones={mias} onEntrarSala={(evento, moderador) => entrarSala(evento, moderador)} />
      : vistaActual === 'fest' ? <section className="cf">
        <div className="cf-filtros" style={{ margin: 0 }}>
          <span className="cf-muted" style={{ flex: 1 }}>Eventos públicos con inscripción abierta en moon-studios-fest.netlify.app.</span>
          <button type="button" className="enterprise-pill" aria-pressed={festVista === 'ediciones'} onClick={() => setFestVista('ediciones')}>Ediciones e inscritos</button>
          <button type="button" className="enterprise-pill" aria-pressed={festVista === 'correo'} onClick={() => setFestVista('correo')}><Mail style={{ width: 14 }} />Correo edición 2026</button>
        </div>
        <Suspense fallback={<p className="cf-nota"><LoaderCircle className="cf-spin" />Cargando MOON FEST…</p>}>
          {festVista === 'ediciones' ? <FestManagementPanel /> : <CorreoFestPanel />}
        </Suspense>
      </section>
      : vistaActual === 'eventos' ? <ListaEventos ahora={ahora} eventos={eventos} fest={gestionaFest ? festEventos : []} global={global} onAbrir={id => ir('eventos', id)} onAbrirFest={() => ir('fest')} onCrear={() => setCreando('elegir')} />
      : <section className="cf-panel">
        <header><div><h2>Control de acceso</h2><p className="cf-muted">Elige el evento y valida las entradas con la cámara o el código.</p></div>
          <select className="cf-input" style={{ width: 'auto', minWidth: 240 }} value={puertaId} onChange={e => setPuertaId(e.target.value)} aria-label="Evento">
            <option value="">Elige un evento…</option>{conPuerta.map(e => <option key={e.id} value={e.id}>{e.titulo} · {rangoEvento(e)}</option>)}
          </select></header>
        {conPuerta.find(e => e.id === puertaId) ? <ControlAcceso key={puertaId} evento={conPuerta.find(e => e.id === puertaId)!} />
          : <div className="cf-vacio"><ScanLine /><h3>{conPuerta.length ? 'Elige un evento' : 'No hay eventos programados'}</h3><p>Solo aparecen los eventos programados donde haces control de acceso.</p></div>}
      </section>}

    {creando === 'elegir' && <Dialog open onOpenChange={v => { if (!v) setCreando(null); }}>
      <DialogContent className="cf-dialog max-w-2xl">
        <span className="cf-eyebrow">CREAR UN ENCUENTRO</span><DialogTitle>¿A quién quieres reunir?</DialogTitle>
        <DialogDescription>Elige el alcance. Gestionarás ambos tipos desde este panel.</DialogDescription>
        <div className="cf-modalidades" style={{ gridTemplateColumns: '1fr' }}>
          {global && <button type="button" className="cf-opcion" onClick={() => setCreando('privado')}>
            <strong><LockKeyhole style={{ width: 15, display: 'inline', verticalAlign: '-2px' }} /> Privado, por invitación</strong>
            <small>Reuniones, conferencias internas o eventos exclusivos. Solo entran las personas invitadas, con su QR o a la sala de video. No aparece en ninguna web.</small>
          </button>}
          {gestionaFest && <button type="button" className="cf-opcion" onClick={() => { setCreando(null); setFestEditor({}); }}>
            <strong><Globe2 style={{ width: 15, display: 'inline', verticalAlign: '-2px' }} /> Público en MOON FEST</strong>
            <small>Se publica en moon-studios-fest.netlify.app con inscripción abierta: cualquiera reserva su lugar y recibe su entrada con QR.</small>
          </button>}
        </div>
      </DialogContent>
    </Dialog>}
    {creando === 'privado' && <EventoEditor personal={personal} editaEquipo={global} onCerrar={() => setCreando(null)} onGuardado={id => { setCreando(null); ir('eventos', id); }} />}
    {festEditor && <FestEventEditor inicial={festEditor.inicial} onClose={() => setFestEditor(null)} onSave={guardarFest} />}
  </div>;
}

export function ListaEventos({ eventos, fest, global, onAbrir, onAbrirFest, onCrear, ahora }: {
  ahora: Date; eventos: EventoConf[] | null; fest: FestEvent[]; global: boolean; onAbrir: (id: string) => void; onAbrirFest: () => void; onCrear: () => void;
}) {
  const [filtro, setFiltro] = useState<'proximos' | 'pasados' | 'todos'>('proximos');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<'todos' | 'privados' | 'publicos'>('todos');
  if (eventos === null) return <div className="cf-loading" role="status"><LoaderCircle className="cf-spin" /><span>Preparando tu agenda…</span></div>;
  const coincide = (s: string) => normalizarBusqueda(s).includes(normalizarBusqueda(busqueda));
  // La sala de una edición de MOON FEST se abre desde la tarjeta de esa edición; no se lista aparte.
  const lista = eventos.filter(e => !e.festEventoId && tipo !== 'publicos' && coincide(`${e.titulo} ${e.lugar} ${MODALIDADES[e.modalidad].nombre} ${ESTADOS_EVENTO[e.estado]}`) && (filtro === 'todos' || (filtro === 'proximos' ? !['finalizado', 'cancelado'].includes(e.estado) && e.fin >= ahora : e.estado === 'finalizado' || e.estado === 'cancelado' || e.fin < ahora)));
  const publicos = fest.filter(e => tipo !== 'privados' && coincide(`${e.title} ${e.location} Moon Fest`) && (filtro === 'todos' || (filtro === 'proximos' ? e.publication !== 'archived' && !e.cancelled && e.endsAt >= ahora : e.publication === 'archived' || e.cancelled || e.endsAt < ahora)));
  const estadoFest = (e: FestEvent) => e.cancelled ? 'Cancelado' : e.publication === 'draft' ? 'Borrador' : e.publication === 'archived' ? 'Archivado' : 'Publicado';
  const dia = (d: Date) => ({ dia: new Intl.DateTimeFormat('es-PE', { day: '2-digit', timeZone: 'America/Lima' }).format(d), mes: new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'America/Lima' }).format(d).replace('.', '') });
  return <section className="cf-panel cf-agenda">
    <header><div><span className="cf-eyebrow">TU CENTRO DE OPERACIONES</span><h2>La agenda de Moon.</h2><p className="cf-muted">{global ? 'Organiza cada experiencia, de principio a fin.' : 'Los encuentros donde eres parte de la organización.'}</p></div>
      <div className="cf-segmented">{(['proximos', 'pasados', 'todos'] as const).map(f => <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{f === 'proximos' ? 'Próximos' : f === 'pasados' ? 'Historial' : 'Todos'}</button>)}</div></header>
    <div className="cf-agenda-toolbar"><label className="cf-search"><Search /><input type="search" placeholder="Buscar un encuentro, lugar o modalidad…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar eventos" /></label>
      <select className="cf-input" aria-label="Tipo de evento" value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}><option value="todos">Todos los tipos</option><option value="privados">Por invitación</option><option value="publicos">Públicos · MOON FEST</option></select></div>
    <div className="cf-list-caption"><span>{lista.length + publicos.length} {lista.length + publicos.length === 1 ? 'encuentro' : 'encuentros'}</span><span>Horarios según tu configuración</span></div>
    {lista.length || publicos.length ? <div className="cf-eventos">{publicos.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).map(e => { const f = dia(e.startsAt); const salaId = eventos.find(c => c.festEventoId === e.id)?.id; return <button key={`fest-${e.id}`} type="button" className="cf-evento cf-evento--fest" onClick={() => (salaId ? onAbrir(salaId) : onAbrirFest())}>
      <div className="cf-evento__top"><span className="cf-evento__kind"><Globe2 />MOON FEST</span><ArrowUpRight /></div>
      <div className="cf-evento__fecha"><div className="cf-dia"><strong>{f.dia}</strong><span>{f.mes}</span></div><span className={`cf-chip${e.cancelled ? ' cf-chip--off' : ''}`}><span className="cf-punto" />{estadoFest(e)}</span></div>
      <div className="cf-evento__body"><h3>{e.title}</h3><p>{e.summary || 'Evento público de Moon Studios.'}</p></div>
      <div className="cf-evento__facts"><span><CalendarClock />{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(e.startsAt)} · Lima</span><span><MapPin />{e.location || 'En línea'}</span>{salaId && <span><Video />Sala de Moon Studios</span>}</div>
      <div className="cf-evento__bottom"><span><Users />{e.registeredCount}{e.capacity ? ` / ${e.capacity}` : ''} inscritos</span><span>{salaId ? 'Ver sala y asistentes' : 'Gestionar edición'}<ArrowUpRight /></span></div>
    </button>; })}{lista.sort((a, b) => filtro === 'pasados' ? b.inicio.getTime() - a.inicio.getTime() : a.inicio.getTime() - b.inicio.getTime()).map(e => {
      const { dia, mes } = diaEvento(e), situacion = e.estado === 'programado' ? momento(e, ahora) : null;
      return <button key={e.id} type="button" className="cf-evento" onClick={() => onAbrir(e.id)}>
        <div className="cf-evento__top"><span className="cf-evento__kind">{e.salaVirtual ? <Video /> : <MapPin />}{MODALIDADES[e.modalidad].nombre}</span><ArrowUpRight /></div>
        <div className="cf-evento__fecha"><div className="cf-dia"><strong>{dia}</strong><span>{mes}</span></div><span className={`cf-chip${situacion === 'en-curso' || situacion === 'abierto' ? ' cf-chip--vivo' : ''}${e.estado === 'cancelado' ? ' cf-chip--off' : ''}`}><span className="cf-punto" />{situacion ? MOMENTOS[situacion] : ESTADOS_EVENTO[e.estado]}</span></div>
        <div className="cf-evento__body"><h3>{e.titulo}</h3><p>{e.descripcion || 'Un encuentro privado de Moon Studios.'}</p></div>
        <div className="cf-evento__facts"><span><CalendarClock />{rangoEvento(e)}</span><span><LockKeyhole />Acceso por invitación{e.lugar ? ` · ${e.lugar}` : ''}</span></div>
        <div className="cf-evento__bottom"><span><Users />{e.contadores.aceptadas} / {e.contadores.invitados} activadas</span><span>Ver evento<ArrowUpRight /></span></div>
      </button>;
    })}</div> : <div className="cf-vacio"><CalendarPlus /><span className="cf-eyebrow">ESPACIO PARA LO QUE VIENE</span><h3>{eventos.length || fest.length ? 'No hay encuentros con estos filtros.' : 'Tu próxima gran idea tiene lugar aquí.'}</h3><p>{busqueda || tipo !== 'todos' ? 'Prueba con otra búsqueda o revisa todos los tipos de evento.' : 'Crea una reunión privada, una conferencia o una edición pública de MOON FEST.'}</p>
      {eventos.length || fest.length ? <button type="button" className="enterprise-action" onClick={() => { setBusqueda(''); setTipo('todos'); setFiltro('todos'); }}>Ver todos los eventos</button> : global && <button type="button" className="enterprise-action enterprise-action--primary" onClick={onCrear}><CalendarPlus />Crear mi primer encuentro</button>}</div>}
  </section>;
}
