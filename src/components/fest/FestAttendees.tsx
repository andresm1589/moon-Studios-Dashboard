import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, ChevronLeft, ChevronRight, Download, LoaderCircle, QrCode, Search, Ticket, UserCheck, Users, XCircle } from 'lucide-react';
import type { FestEvent, FestTicket } from '@/types/fest';
import { cancelTicket, checkInTicket, findTicketByCode, getFestError, watchRegistrations } from '@/lib/fest/client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { downloadCsv, festDate, ticketLabel, ticketsCsv } from './managementUtils';

interface RegistrationState { eventId: string; tickets: FestTicket[] | null; error: string }
type TicketFilter = 'all' | 'active' | 'checked-in' | 'cancelled';

export function FestAttendees({ event, operatorUid, initialCode }: { event: FestEvent; operatorUid: string; initialCode?: string }) {
  const [snapshot, setSnapshot] = useState<RegistrationState | null>(null);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TicketFilter>('all');
  const [page, setPage] = useState(0);
  const [code, setCode] = useState(initialCode ?? '');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<FestTicket | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'lookup' | 'checkin' | 'cancel' | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const operation = useRef(false);
  useEffect(() => {
    let active = true;
    const stop = watchRegistrations(event.id, tickets => { if (active) setSnapshot({ eventId: event.id, tickets, error: '' }); }, cause => { if (active) setSnapshot({ eventId: event.id, tickets: null, error: getFestError(cause) }); });
    return () => { active = false; stop(); };
  }, [event.id, operatorUid, retry]);
  useEffect(() => { const clock = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(clock); }, []);
  const tickets = snapshot?.eventId === event.id ? snapshot.tickets : null;
  const loadingError = snapshot?.eventId === event.id ? snapshot.error : '';
  const matching = useMemo(() => (tickets ?? []).filter(ticket => (filter === 'all' || ticket.state === filter) && `${ticket.firstName} ${ticket.lastName} ${ticket.email} ${ticket.code}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))), [tickets, filter, search]);
  const pages = Math.max(1, Math.ceil(matching.length / 20));
  const visiblePage = Math.min(page, pages - 1);
  const current = selected ? tickets?.find(ticket => ticket.id === selected.id) ?? selected : null;
  const accessOpen = !event.cancelled && event.publication === 'published' && now >= event.startsAt.getTime() && now < event.endsAt.getTime();
  const run = async (name: 'lookup' | 'checkin' | 'cancel', action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(name); setError(''); setNotice('');
    try { await action(); }
    catch (cause) { setError(getFestError(cause)); }
    finally { operation.current = false; setBusy(null); }
  };
  const lookup = () => run('lookup', async () => {
    if (!code.trim()) throw new Error('Escribe o pega el código de una entrada de esta edición.');
    const found = await findTicketByCode(event.id, code.trim());
    if (!found) throw new Error('No encontramos una entrada de esta edición con ese código.');
    setSelected(found); setConfirmCancel(false);
  });
  const admit = () => run('checkin', async () => {
    if (!current) return;
    const updated = await checkInTicket(current.id);
    setSelected(updated); setNotice(`Ingreso registrado: ${updated.firstName} ${updated.lastName}.`);
  });
  const cancel = () => run('cancel', async () => {
    if (!current) return;
    await cancelTicket(current.id); setSelected(null); setConfirmCancel(false); setNotice('La entrada fue cancelada. La plaza vuelve a estar disponible.');
  });
  return <section className="fm-attendees">
    <div className="fm-section-heading"><div><span className="fm-eyebrow">ASISTENTES Y RECEPCIÓN</span><h2>{event.title}</h2><p>{festDate(event.startsAt)} · {event.location}</p></div><button type="button" className="fm-button" disabled={!tickets?.length} onClick={() => { if (tickets) downloadCsv(ticketsCsv(tickets), `Moon-Fest_${event.slug}_inscritos.csv`); }}><Download size={16} />Exportar CSV</button></div>
    <div className="fm-attendee-stats"><div><Users /><strong>{tickets?.filter(ticket => ticket.state !== 'cancelled').length ?? '—'}</strong><span>Inscripciones activas</span></div><div><UserCheck /><strong>{tickets?.filter(ticket => ticket.state === 'checked-in').length ?? '—'}</strong><span>Ingresos registrados</span></div><div><Ticket /><strong>{event.capacity === 0 ? '∞' : Math.max(0, event.capacity - event.registeredCount).toLocaleString('es-PE')}</strong><span>Plazas disponibles</span></div></div>
    <div className="fm-gate"><span className="fm-gate-icon"><QrCode size={26} /></span><div><h3>Control de acceso</h3><p>Pega el código completo de la entrada. Primero compruebas el nombre; después confirmas el ingreso.</p><form onSubmit={submit => { submit.preventDefault(); void lookup(); }}><label className="sr-only" htmlFor="fest-ticket-code">Código de entrada</label><input id="fest-ticket-code" value={code} onChange={change => setCode(change.target.value)} autoComplete="off" placeholder="MF-…" maxLength={2048} /><button className="fm-button fm-button--primary" type="submit" disabled={!!busy}>{busy === 'lookup' ? <LoaderCircle className="fm-spin" size={16} /> : <Search size={16} />}Comprobar entrada</button></form><small>El ingreso se habilita durante el evento y cada entrada se admite una sola vez.</small></div></div>
    {error && <p className="fm-error" role="alert">{error}</p>}{notice && <p className="fm-success" role="status"><Check size={17} />{notice}</p>}
    <div className="fm-list-toolbar"><label className="fm-search"><Search size={18} /><span className="sr-only">Buscar asistentes</span><input value={search} onChange={change => { setSearch(change.target.value); setPage(0); }} placeholder="Buscar por nombre, correo o código…" /></label><label className="fm-filter"><span className="sr-only">Filtrar estado de entrada</span><select value={filter} onChange={change => { setFilter(change.target.value as TicketFilter); setPage(0); }}><option value="all">Todas las entradas</option><option value="active">Por ingresar</option><option value="checked-in">Ya ingresaron</option><option value="cancelled">Canceladas</option></select></label></div>
    {loadingError ? <div className="fm-empty"><XCircle /><h3>No pudimos cargar los inscritos.</h3><p>{loadingError}</p><button className="fm-button" type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div> : tickets === null ? <div className="fm-empty" role="status"><LoaderCircle className="fm-spin" /><p>Cargando inscripciones…</p></div> : !matching.length ? <div className="fm-empty"><Users /><h3>{tickets.length ? 'No hay coincidencias.' : 'La lista empieza con la primera inscripción.'}</h3><p>{tickets.length ? 'Prueba con otro nombre, correo o estado.' : 'Cada asistente inscrito aparecerá aquí con su entrada y estado de acceso.'}</p></div> : <><div className="fm-table-wrap"><table className="fm-table"><thead><tr><th>Asistente</th><th>Entrada</th><th>Inscrito</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{matching.slice(visiblePage * 20, visiblePage * 20 + 20).map(ticket => <tr key={ticket.id}><td><strong>{ticket.firstName} {ticket.lastName}</strong><span>{ticket.email}</span></td><td><code>{ticket.code}</code></td><td>{festDate(ticket.createdAt)}</td><td><span className={`fm-status fm-status--${ticket.state}`}>{ticketLabel(ticket)}</span></td><td><button type="button" className="fm-button fm-button--small" onClick={() => { setSelected(ticket); setConfirmCancel(false); setError(''); }}>Ver entrada</button></td></tr>)}</tbody></table></div><div className="fm-pagination"><span>{matching.length} {matching.length === 1 ? 'entrada' : 'entradas'} · Página {visiblePage + 1} de {pages}</span><div><button type="button" className="fm-icon-button" aria-label="Página anterior" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}><ChevronLeft size={18} /></button><button type="button" className="fm-icon-button" aria-label="Página siguiente" disabled={visiblePage >= pages - 1} onClick={() => setPage(visiblePage + 1)}><ChevronRight size={18} /></button></div></div></>}
    {current && <Dialog open onOpenChange={open => { if (!open && !operation.current) { setSelected(null); setConfirmCancel(false); } }}><DialogContent className="fm-dialog fm-dialog--ticket" showCloseButton={!busy}><span className="fm-eyebrow">ENTRADA / {event.title}</span><DialogTitle>{current.firstName} {current.lastName}</DialogTitle><DialogDescription>Comprueba la identidad del asistente antes de confirmar el ingreso.</DialogDescription><div className="fm-ticket-data"><span className={`fm-status fm-status--${current.state}`}>{ticketLabel(current)}</span><code>{current.code}</code><dl><div><dt>Correo</dt><dd>{current.email}</dd></div><div><dt>Teléfono</dt><dd>{current.phone || 'No indicado'}</dd></div><div><dt>Inscripción</dt><dd>{festDate(current.createdAt)}</dd></div>{current.checkedInAt && <div><dt>Ingresó</dt><dd>{festDate(current.checkedInAt)}</dd></div>}</dl></div>{error && <p className="fm-error" role="alert">{error}</p>}{notice && <p className="fm-success" role="status">{notice}</p>}
      {confirmCancel ? <div className="fm-confirm"><h3>¿Cancelar esta entrada?</h3><p>El asistente ya no podrá usarla para ingresar. Su inscripción queda en el historial.</p><div><button type="button" className="fm-button" disabled={!!busy} onClick={() => setConfirmCancel(false)}>Conservar entrada</button><button type="button" className="fm-button fm-button--danger" disabled={!!busy} onClick={() => void cancel()}>{busy === 'cancel' ? <LoaderCircle className="fm-spin" size={16} /> : <XCircle size={16} />}Sí, cancelar</button></div></div> : <footer className="fm-ticket-actions"><button type="button" className="fm-button" disabled={!!busy} onClick={() => setSelected(null)}>Cerrar</button>{current.state === 'active' && <><button type="button" className="fm-text-button" disabled={!!busy} onClick={() => setConfirmCancel(true)}>Cancelar entrada</button><button type="button" className="fm-button fm-button--primary" disabled={!!busy || !accessOpen} onClick={() => void admit()}>{busy === 'checkin' ? <LoaderCircle className="fm-spin" size={16} /> : <UserCheck size={16} />}Confirmar ingreso</button></>}{current.state === 'checked-in' && <span className="fm-inline-note"><CheckCheck size={17} />Esta entrada ya fue utilizada.</span>}</footer>}
      {current.state === 'active' && !accessOpen && <p className="fm-inline-note">El acceso solo está disponible durante el horario de una edición publicada y activa.</p>}
    </DialogContent></Dialog>}
  </section>;
}
