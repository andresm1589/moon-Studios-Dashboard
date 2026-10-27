import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, CircleHelp, Clock3, ExternalLink, History, LoaderCircle, LockKeyhole, MapPin, Pencil, Plus, Search, Ticket, Users, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandLogo } from '@/components/BrandLogo';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { FestEvent, FestEventInput } from '@/types/fest';
import { archiveEvent, getFestError, getTicketByToken, saveEvent, watchEvents } from '@/lib/fest/client';
import { FestEventEditor } from './FestEventEditor';
import { FestAttendees } from './FestAttendees';
import { FestLegacyHistory } from './FestLegacyHistory';
import { eventLabel, FEST_PUBLIC_URL, festDate } from './managementUtils';
import { createEntryReader, entryTokenFromQuery } from './entryQuery';
import './fest-management.css';

export interface FestManagementController {
  operatorUid: string;
  events: FestEvent[] | null;
  error: string;
  retry: () => void;
  save: (input: FestEventInput, id?: string) => Promise<string>;
  archive: (id: string) => Promise<void>;
}

type View = 'editions' | 'attendees' | 'legacy';
type EventFilter = 'all' | 'published' | 'draft' | 'archived';

export function FestManagementView({ controller: c }: { controller: FestManagementController }) {
  const [view, setView] = useState<View>('editions');
  const [filter, setFilter] = useState<EventFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editor, setEditor] = useState<{ event?: FestEvent } | null>(null);
  const [confirm, setConfirm] = useState<{ event: FestEvent; action: 'archive' | 'cancel' | 'reactivate' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => new Date());
  const operation = useRef(false);
  const queryToken = entryTokenFromQuery(window.location.search);
  const [entryRetry, setEntryRetry] = useState(0);
  const entryKey = queryToken ? `${c.operatorUid}:${queryToken}:${entryRetry}` : '';
  const [entryResult, setEntryResult] = useState<{ key: string; error: string } | null>(null);
  const [initialEntry, setInitialEntry] = useState<{ eventId: string; code: string } | null>(null);
  const readEntry = useRef(createEntryReader(getTicketByToken));
  useEffect(() => {
    if (!queryToken || !c.operatorUid) return;
    let active = true;
    // Strict Mode and ordinary rerenders share this read. No mutation belongs
    // to a URL: admission still happens through the explicit confirmation.
    void readEntry.current(entryKey, queryToken).then(ticket => {
      if (!active) return;
      if (!ticket) { setEntryResult({ key: entryKey, error: 'No encontramos la entrada de este enlace. Comprueba que el QR esté completo.' }); return; }
      setInitialEntry({ eventId: ticket.eventId, code: ticket.code });
      setSelectedId(ticket.eventId); setView('attendees');
      setEntryResult({ key: entryKey, error: '' });
    }).catch(cause => { if (active) setEntryResult({ key: entryKey, error: getFestError(cause) }); });
    return () => { active = false; };
  }, [c.operatorUid, entryKey, queryToken]);
  const entryError = entryResult?.key === entryKey ? entryResult.error : '';
  const openingEntry = !!entryKey && entryResult?.key !== entryKey;
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer); }, []);
  const events = c.events;
  const selected = events?.find(event => event.id === selectedId) ?? events?.[0];
  const nextEvent = events?.filter(event => event.publication === 'published' && !event.cancelled && event.endsAt > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  const filtered = useMemo(() => (events ?? []).filter(event => (filter === 'all' || event.publication === filter) && `${event.title} ${event.summary} ${event.location}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))), [events, search, filter]);
  const save = async (input: FestEventInput, id?: string) => { const saved = await c.save(input, id); setNotice(input.publication === 'published' ? 'Edición publicada. Sus fechas controlan automáticamente las inscripciones.' : 'Borrador guardado. Puedes continuar cuando quieras.'); return saved; };
  const apply = async () => {
    if (!confirm || operation.current) return;
    operation.current = true; setBusy(true); setActionError('');
    try {
      if (confirm.action === 'archive') await c.archive(confirm.event.id);
      else await c.save({ ...confirm.event, cancelled: confirm.action === 'cancel' }, confirm.event.id);
      setNotice(confirm.action === 'archive' ? 'Edición archivada. Sus inscripciones permanecen en el historial.' : confirm.action === 'cancel' ? 'Evento cancelado. El registro y el ingreso quedan bloqueados.' : 'Evento reactivado. Se aplican nuevamente sus fechas y aforo.');
      setConfirm(null);
    } catch (cause) { setActionError(getFestError(cause)); }
    finally { operation.current = false; setBusy(false); }
  };
  const openAttendees = (id: string) => { setSelectedId(id); setView('attendees'); };

  return <div className="fm-management">
    <header className="fm-hero"><div className="fm-hero-copy"><span className="fm-eyebrow">MOON STUDIOS / EXPERIENCIAS</span><h1>El próximo encuentro<br /><em>empieza contigo.</em></h1><p>Un espacio para crear cada edición, abrir las inscripciones y recibir a tu comunidad.</p><div className="fm-hero-actions"><button type="button" className="fm-button fm-button--hero" onClick={() => { setEditor({}); setNotice(''); }}><Plus size={17} />Crear una edición</button><a className="fm-hero-link" href={FEST_PUBLIC_URL} target="_blank" rel="noopener noreferrer">Ver Moon Fest<ArrowUpRight size={17} /></a></div></div><div className="fm-hero-art" aria-hidden="true"><div className="fm-orbit fm-orbit--one" /><div className="fm-orbit fm-orbit--two" /><BrandLogo compact variant="light" /><span className="fm-art-label">MOON<br />FEST</span><span className="fm-art-coordinate">ENCUENTROS / EXPERIENCIAS / COMUNIDAD</span><span className="fm-orbit-dot" /></div></header>
    <div className="fm-overview"><div><span><CalendarDays size={16} />Ediciones publicadas</span><strong>{events?.filter(event => event.publication === 'published' && !event.cancelled).length ?? '—'}</strong><small>Experiencias visibles en la web</small></div><div><span><Ticket size={16} />Inscripciones</span><strong>{events?.reduce((sum, event) => sum + event.registeredCount, 0).toLocaleString('es-PE') ?? '—'}</strong><small>Plazas reservadas en todas las ediciones</small></div><div className="fm-overview-next"><span><Clock3 size={16} />Próximo encuentro</span><strong>{events === null ? 'Cargando…' : nextEvent?.title ?? 'Por anunciar'}</strong><small>{nextEvent ? festDate(nextEvent.startsAt) : 'Crea y publica tu próxima edición'}</small></div></div>
    <nav className="fm-tabs" aria-label="Administración de Moon Fest">{([{ id: 'editions', label: 'Ediciones', icon: CalendarDays }, { id: 'attendees', label: 'Inscritos y acceso', icon: Users }, { id: 'legacy', label: 'Historial 2026', icon: History }] as const).map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><Icon size={17} />{label}{id === 'editions' && events !== null && <span>{events.length}</span>}</button>)}</nav>
    {openingEntry && <div className="fm-tip" role="status"><LoaderCircle className="fm-spin" size={18} /><p>Localizando la entrada del QR para que puedas comprobarla…</p></div>}
    {entryError && <div className="fm-error" role="alert"><p>{entryError}</p><button type="button" className="fm-button fm-button--small" onClick={() => setEntryRetry(value => value + 1)}>Volver a buscar la entrada</button></div>}
    {initialEntry && view === 'attendees' && <div className="fm-tip"><Ticket size={20} /><p><strong>Entrada localizada.</strong> Su código está preparado en el control de acceso. Comprueba el nombre y confirma el ingreso cuando llegue el asistente.</p></div>}
    {notice && <div className="fm-success" role="status"><Check size={18} /><span>{notice}</span><button className="fm-icon-button" type="button" aria-label="Ocultar mensaje" onClick={() => setNotice('')}>×</button></div>}
    {c.error ? <div className="fm-empty"><XCircle /><h2>No pudimos abrir Moon Fest.</h2><p>{c.error}</p><button type="button" className="fm-button" onClick={c.retry}>Volver a intentar</button></div> : events === null ? <div className="fm-empty" role="status"><LoaderCircle className="fm-spin" /><p>Cargando las ediciones de Moon Fest…</p></div> : <>
      {view === 'editions' && <section className="fm-editions"><div className="fm-section-heading"><div><span className="fm-eyebrow">DE LA IDEA AL ENCUENTRO</span><h2>Tus ediciones.</h2><p>Cada evento tiene sus propias fechas, aforo y entradas.</p></div><button type="button" className="fm-button" onClick={() => setEditor({})}><Plus size={16} />Nueva edición</button></div><div className="fm-list-toolbar"><label className="fm-search"><Search size={18} /><span className="sr-only">Buscar ediciones</span><input value={search} placeholder="Buscar edición, lugar o experiencia…" onChange={change => setSearch(change.target.value)} /></label><label className="fm-filter"><span className="sr-only">Estado de edición</span><select value={filter} onChange={change => setFilter(change.target.value as EventFilter)}><option value="all">Todas las ediciones</option><option value="published">Publicadas</option><option value="draft">Borradores</option><option value="archived">Archivadas</option></select></label></div>
        {!filtered.length ? <div className="fm-empty"><CalendarDays /><h3>{events.length ? 'No hay ediciones con ese filtro.' : 'El siguiente Moon Fest está por escribirse.'}</h3><p>{events.length ? 'Busca otro nombre o cambia el estado.' : 'Empieza con una edición, revisa cómo se verá y publícala cuando esté lista.'}</p>{!events.length && <button className="fm-button fm-button--primary" type="button" onClick={() => setEditor({})}>Crear mi primera edición<ArrowRight size={16} /></button>}</div> : <div className="fm-edition-grid">{filtered.map((event, index) => <article className="fm-edition-card" key={event.id} style={{ animationDelay: `${Math.min(index, 5) * 35}ms` }}><div className={`fm-edition-art${event.coverUrl ? ' has-cover' : ''}`}>{event.coverUrl ? <img src={event.coverUrl} alt="" loading="lazy" /> : <><span>MOON<br />FEST</span><div className="fm-mini-orbit" /></>}<span className={`fm-status fm-status--${event.cancelled ? 'cancelled' : event.publication}`}>{eventLabel(event, now)}</span><span className="fm-edition-year">{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', year: 'numeric' }).format(event.startsAt)}</span></div><div className="fm-edition-copy"><span className="fm-eyebrow">{event.format === 'virtual' ? 'EN LÍNEA' : event.format === 'hibrido' ? 'HÍBRIDO' : 'PRESENCIAL'}</span><h3>{event.title}</h3><p>{event.summary}</p><div className="fm-edition-meta"><span><CalendarDays size={15} />{festDate(event.startsAt)}</span><span><MapPin size={15} />{event.location}</span><span><Users size={15} />{event.registeredCount.toLocaleString('es-PE')} {event.capacity ? `de ${event.capacity.toLocaleString('es-PE')} plazas` : 'personas inscritas'}</span></div>{event.capacity > 0 && <div className="fm-capacity-track" role="img" aria-label={`${event.registeredCount} de ${event.capacity} plazas reservadas`}><span style={{ width: `${Math.min(100, event.registeredCount / event.capacity * 100)}%` }} /></div>}<div className="fm-edition-actions"><button type="button" className="fm-button fm-button--small" onClick={() => setEditor({ event })}><Pencil size={15} />Editar</button><button type="button" className="fm-text-button" onClick={() => openAttendees(event.id)}>Inscritos<ChevronRight size={16} /></button></div><div className="fm-edition-secondary">{event.publication !== 'archived' && <button type="button" onClick={() => { setConfirm({ event, action: 'archive' }); setActionError(''); }}><Archive size={13} />Archivar</button>}<button type="button" onClick={() => { setConfirm({ event, action: event.cancelled ? 'reactivate' : 'cancel' }); setActionError(''); }}><XCircle size={13} />{event.cancelled ? 'Reactivar evento' : 'Cancelar evento'}</button></div></div></article>)}</div>}
        <aside className="fm-help"><CircleHelp size={20} /><div><h3>Una edición, un flujo sencillo.</h3><p>Prepara la experiencia → define sus fechas → publica. Los asistentes reservan su plaza y reciben una entrada para esa edición. En recepción, compruebas y confirmas el acceso.</p></div><a href={FEST_PUBLIC_URL} target="_blank" rel="noopener noreferrer" aria-label="Abrir la página pública de Moon Fest"><ExternalLink size={18} /></a></aside>
      </section>}
      {view === 'attendees' && <>{events.length ? <><label className="fm-event-picker"><span>Selecciona la edición</span><select value={selected?.id ?? ''} onChange={change => setSelectedId(change.target.value)}>{events.map(event => <option key={event.id} value={event.id}>{event.title} · {eventLabel(event, now)}</option>)}</select></label>{selected && <FestAttendees key={`${c.operatorUid}:${selected.id}:${initialEntry?.eventId === selected.id ? initialEntry.code : ''}`} event={selected} operatorUid={c.operatorUid} initialCode={initialEntry?.eventId === selected.id ? initialEntry.code : undefined} />}</> : <div className="fm-empty"><Users /><h3>Primero, crea una edición.</h3><p>Sus inscripciones y el control de acceso aparecerán aquí.</p><button type="button" className="fm-button fm-button--primary" onClick={() => setEditor({})}>Crear edición<Plus size={16} /></button></div>}</>}
      {view === 'legacy' && <FestLegacyHistory operatorUid={c.operatorUid} />}
    </>}
    {editor && <FestEventEditor event={editor.event} onClose={() => setEditor(null)} onSave={save} />}
    {confirm && <Dialog open onOpenChange={open => { if (!open && !operation.current) setConfirm(null); }}><DialogContent className="fm-dialog fm-dialog--confirm" showCloseButton={!busy}><span className="fm-eyebrow">MOON FEST / GESTIONAR EDICIÓN</span><DialogTitle>{confirm.action === 'archive' ? '¿Archivar esta edición?' : confirm.action === 'cancel' ? '¿Cancelar este evento?' : '¿Reactivar este evento?'}</DialogTitle><DialogDescription>{confirm.event.title}</DialogDescription><p className="fm-confirm-description">{confirm.action === 'archive' ? 'Se cierra el registro y el acceso. Conservas la edición y todas sus inscripciones para consultar el historial.' : confirm.action === 'cancel' ? 'La web mostrará que el evento fue cancelado. Se bloquean las nuevas inscripciones y el ingreso de las entradas existentes.' : 'El evento volverá a aplicar sus fechas, modalidad y aforo. Revisa los datos antes de continuar.'}</p>{actionError && <p className="fm-error" role="alert">{actionError}</p>}<div className="fm-confirm-actions"><button type="button" className="fm-button" disabled={busy} onClick={() => setConfirm(null)}>Volver</button><button type="button" className={`fm-button ${confirm.action === 'cancel' ? 'fm-button--danger' : 'fm-button--primary'}`} disabled={busy} onClick={() => void apply()}>{busy && <LoaderCircle className="fm-spin" size={16} />}{confirm.action === 'archive' ? 'Sí, archivar' : confirm.action === 'cancel' ? 'Sí, cancelar evento' : 'Reactivar'}</button></div></DialogContent></Dialog>}
  </div>;
}

function FestManagementConnected({ operatorUid }: { operatorUid: string }) {
  const [data, setData] = useState<{ uid: string; events: FestEvent[] | null; error: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const stop = watchEvents(events => { if (active) setData({ uid: operatorUid, events, error: '' }); }, cause => { if (active) setData({ uid: operatorUid, events: null, error: getFestError(cause) }); }, true);
    return () => { active = false; stop(); };
  }, [operatorUid, retry]);
  const current = data?.uid === operatorUid ? data : null;
  return <FestManagementView controller={{ operatorUid, events: current?.events ?? null, error: current?.error ?? '', retry: () => setRetry(value => value + 1), save: saveEvent, archive: archiveEvent }} />;
}

export default function FestManagementPanel() {
  const { currentUser, userProfile, userRole, puede, loading } = useAuth();
  if (loading) return <div className="fm-empty" role="status"><LoaderCircle className="fm-spin" /><p>Verificando acceso…</p></div>;
  if (!currentUser || !userProfile || currentUser.uid !== userProfile.uid || !(userRole === 'CEO' || (userRole === 'Administración' && puede('webs')))) return <div className="fm-empty"><LockKeyhole /><h2>Un espacio de administración.</h2><p>Solo Dirección y Administración autorizada pueden gestionar los eventos de Moon Studios.</p></div>;
  return <FestManagementConnected key={`${currentUser.uid}:${userRole}`} operatorUid={currentUser.uid} />;
}
