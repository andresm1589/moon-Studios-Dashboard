import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArchiveRestore, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, Clipboard, Clock3, FilePenLine, Flag, LayoutGrid, LoaderCircle, LockKeyhole, LogOut, MailPlus, Megaphone, Plus, RefreshCw, Search, Settings2, ShieldCheck, Trash2, UsersRound, Vote, X } from 'lucide-react';
import type { Candidate, Election, ElectionController, ElectionStatus, ElectoralInvitation } from './types';
import { canManageElections, getElectionEditMode, getElectionWindow, getInvitationState, isAnnouncementVisible } from './model';
import { Dialog } from './ElectoralDialog';
import { ProcessEditor, electoralInputDate, parseElectoralInput } from './ProcessEditor';
import { ElectoralAccessManagement } from './ElectoralAccessPanel';
import { DirectorCandidaturas } from './DirectorCandidaturas';
import { DirectorComunicados } from './DirectorComunicados';
import { DirectorAjustes } from './DirectorAjustes';
import { Empty, Portrait, candidateLabels, errorText, formatDate } from './directorShared';
import './electoral.css';
import './electoral-director.css';

type Props = { system: ElectionController; basePath: string; embedded: boolean; logoUrl?: string; onLogout?: () => void };
type Decision =
  | { kind: 'status'; election: Election; status: ElectionStatus }
  | { kind: 'trash'; election: Election }
  | { kind: 'restore'; election: Election }
  | { kind: 'revoke'; invitation: ElectoralInvitation };
const inviteLink = (id: string) => `https://moonstudios-elecciones.netlify.app/invitacion/${encodeURIComponent(id)}`;
const navigation = [
  { path: '', name: 'Centro de control', icon: LayoutGrid },
  { path: 'procesos', name: 'Procesos', icon: Flag },
  { path: 'candidaturas', name: 'Candidaturas', icon: UsersRound },
  { path: 'participantes', name: 'Participantes', icon: ShieldCheck },
  { path: 'invitaciones', name: 'Invitaciones', icon: MailPlus },
  { path: 'comunicados', name: 'Comunicados', icon: Megaphone },
  { path: 'ajustes', name: 'Ajustes', icon: Settings2 },
];
const headings: Record<string, [string, string]> = {
  '': ['Tu dirección. Cada decisión.', 'Procesos, personas y calendario en un espacio exclusivo para la dirección.'],
  procesos: ['Diseña la próxima decisión.', 'Prepara, publica, cierra y archiva cada convocatoria. Lo eliminado queda en la papelera.'],
  candidaturas: ['Conoce cada propuesta.', 'Revisa, filtra y decide sobre cada expediente, uno a uno o en lote.'],
  participantes: ['Cada permiso, bajo control.', 'Procesos, personas y calendario en un espacio exclusivo para la dirección.'],
  invitaciones: ['Abre la puerta a participar.', 'Crea enlaces personales, revisa su uso y decide cuándo revocarlos.'],
  comunicados: ['Que todos lo sepan a tiempo.', 'Publica avisos con vigencia para el portal de participantes.'],
  ajustes: ['El sistema, a tu medida.', 'Abre o cierra la participación y define el mensaje entre ediciones.'],
};

export default function ElectionDirectorWorkspace({ system, basePath, embedded, logoUrl, onLogout }: Props) {
  const location = useLocation(), navigate = useNavigate();
  const base = basePath.replace(/\/+$/, ''), director = `${base}/direccion`;
  const to = (section: string) => `${director}${section ? '/' + section : ''}`;
  const view = location.pathname.replace(/\/+$/, '').slice(director.length).replace(/^\//, '');
  const [now, setNow] = useState(Date.now), [search, setSearch] = useState(''), [process, setProcess] = useState(() => new URLSearchParams(location.search).get('proceso') || 'all'), [filter, setFilter] = useState('all');
  const [editor, setEditor] = useState<Election | 'new' | null>(null), [decision, setDecision] = useState<Decision | null>(null);
  const [inviteEditor, setInviteEditor] = useState<ElectoralInvitation | 'new' | null>(null), [linkId, setLinkId] = useState<string | null>(null), [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [working, setWorking] = useState(false);
  const lock = useRef(false), busy = working || system.busy;

  // Cada pestaña empieza con su propio filtro: antes un filtro de una pestaña
  // (p. ej. «Por revisar») vaciaba otra que no tenía ese estado.


  const all = [...system.elections].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const elections = all.filter(item => item.status !== 'deleted');
  const trash = all.filter(item => item.status === 'deleted');
  const trashedIds = new Set(trash.map(item => item.id));
  const liveCandidates = system.candidates.filter(item => !trashedIds.has(item.electionId));
  const pendingCandidates = liveCandidates.filter(item => item.status === 'pending');
  const pendingAccess = system.accessRequests.filter(item => !trashedIds.has(item.electionId) && (item.voterStatus === 'pending' || item.candidateStatus === 'pending'));
  const upcoming = elections.filter(item => item.status === 'active' && item.endDate.getTime() > now).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const liveNotices = system.announcements.filter(item => isAnnouncementVisible(item, new Date(now)));
  const matches = (text: string) => text.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'));
  const invitationState = (item: ElectoralInvitation) => getInvitationState(item, new Date(now));
  const invitationLabels = { active: 'Disponible', accepted: 'Aceptada', revoked: 'Revocada', expired: 'Vencida' };
  const visibleInvites = system.invitations.filter(item => (process === 'all' || item.electionId === process) && (filter === 'all' || invitationState(item) === filter) && matches(`${item.label} ${item.email}`)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const processPool = filter === 'deleted' ? trash : elections;
  const visibleProcesses = processPool.filter(item => matches(`${item.name} ${item.description} ${item.positions.join(' ')}`) && (filter === 'all' || filter === 'deleted' || getElectionWindow(item, new Date(now)).state === filter));

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const boundaries = [...system.elections.flatMap(item => [item.startDate, item.endDate, item.registrationStartDate, item.registrationEndDate]), ...system.invitations.map(item => item.expiresAt), ...system.announcements.flatMap(item => [item.startsAt, item.endsAt])].filter((value): value is Date => !!value).map(value => new Date(value).getTime()).filter(value => value > Date.now());
    const timer = window.setTimeout(refresh, Math.max(20, Math.min(30000, boundaries.length ? Math.min(...boundaries) - Date.now() + 20 : 30000)));
    window.addEventListener('focus', refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, [now, system.elections, system.invitations, system.announcements]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (lock.current || system.busy) return false;
    lock.current = true; setWorking(true); setError(''); setNotice('');
    try { await action(); setNotice(success); return true; } catch (cause) { setError(errorText(cause)); return false; } finally { lock.current = false; setWorking(false); }
  };
  const confirm = async () => {
    if (!decision) return;
    const target = decision;
    const action = () => target.kind === 'status' ? system.setElectionStatus(target.election.id, target.status)
      : target.kind === 'trash' ? system.deleteElection(target.election.id)
        : target.kind === 'restore' ? system.restoreElection(target.election.id)
          : system.revokeInvitation(target.invitation.id);
    const success = target.kind === 'trash' ? 'Proceso enviado a la papelera. Puedes restaurarlo cuando quieras.' : target.kind === 'restore' ? 'Proceso restaurado como archivado.' : 'El cambio se guardó correctamente.';
    if (await run(action, success)) setDecision(null);
  };
  const processFilter = <select aria-label="Filtrar por proceso" value={process} onChange={event => setProcess(event.target.value)}><option value="all">Todos los procesos</option>{elections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
  const searchField = (placeholder: string) => <label className="el-search" data-moon-field-frame><Search size={19} /><input type="search" aria-label={placeholder} placeholder={placeholder} value={search} onChange={event => setSearch(event.target.value)} /></label>;
  const miniCandidate = (candidate: Candidate) => <article className="ed-candidate" key={candidate.id} data-moon-reveal="card">
    <div className="ed-person"><Portrait candidate={candidate} /><div><h3>{candidate.name}</h3><p>{candidate.department}</p></div><span className={`el-status el-status-${candidate.status}`}>{candidateLabels[candidate.status]}</span></div>
    <span className="el-kicker">{candidate.position}</span><p>{elections.find(item => item.id === candidate.electionId)?.name || 'Proceso histórico'}</p>
    <p className="ed-excerpt">{candidate.slogan || candidate.proposals[0] || 'Consulta la información registrada.'}</p>
    <div className="ed-card-foot"><span>{candidate.proposals.length} propuestas · {formatDate(candidate.createdAt)}</span><button className="el-button" onClick={() => navigate(to('candidaturas') + '?expediente=' + encodeURIComponent(candidate.id))}>Ver expediente<ArrowUpRight size={16} /></button></div>
  </article>;
  const processCard = (election: Election) => {
    const phase = getElectionWindow(election, new Date(now)), mode = getElectionEditMode(election, new Date(now));
    const applications = system.candidates.filter(item => item.electionId === election.id);
    const deleted = election.status === 'deleted';
    return <article className={`ed-process${deleted ? ' is-trashed' : ''}`} key={election.id} data-moon-reveal="card">
      <div className="ed-process-title"><span className={`el-status el-status-${phase.state}`}><span />{phase.label}</span><span className="el-kicker">{deleted ? 'PAPELERA · SOLO CEO' : election.status === 'draft' ? 'PRIVADO · CEO' : 'CONVOCATORIA PUBLICADA'}</span></div>
      <h3>{election.name}</h3><p>{election.description || 'Sin descripción adicional.'}</p>
      {deleted && <p className="el-field-note">En la papelera desde {formatDate(election.deletedAt)}. Votos y expedientes se conservan; al restaurarlo vuelve como archivado.</p>}
      <dl className="ed-dates"><div><dt><CalendarDays size={15} />Postulaciones</dt><dd>{formatDate(election.registrationStartDate || election.createdAt)}<br />{formatDate(election.registrationEndDate || election.startDate)}</dd></div><div><dt><Vote size={15} />Votación</dt><dd>{formatDate(election.startDate)}<br />{formatDate(election.endDate)}</dd></div></dl>
      <div className="ed-process-numbers"><span><strong>{election.positions.length}</strong> cargos</span><span><strong>{applications.length}</strong> candidaturas</span><span><strong>{election.totalVotes}</strong> votos</span></div>
      <div className="ed-process-actions">
        {deleted ? <button className="el-button el-button-primary" disabled={busy} onClick={() => { setError(''); setDecision({ kind: 'restore', election }); }}><ArchiveRestore size={16} />Restaurar</button> : <>
          {mode !== 'none' && <button className="el-button" disabled={busy} onClick={() => setEditor(election)}><FilePenLine size={16} />{mode === 'details' ? 'Editar información' : 'Editar proceso'}</button>}
          {election.status === 'draft' && <button className="el-button el-button-primary" disabled={busy} onClick={() => setDecision({ kind: 'status', election, status: 'active' })}>Publicar<ArrowUpRight size={16} /></button>}
          {election.status === 'active' && <button className="el-button" disabled={busy} onClick={() => setDecision({ kind: 'status', election, status: 'closed' })}>{phase.state === 'closed' ? 'Confirmar cierre' : 'Cerrar proceso'}</button>}
          {['draft', 'closed'].includes(election.status) && <button className="el-button" disabled={busy} onClick={() => setDecision({ kind: 'status', election, status: 'archived' })}>Archivar</button>}
          <button className="el-text-button" onClick={() => navigate(to('candidaturas') + '?proceso=' + encodeURIComponent(election.id))}>Ver candidaturas<ChevronRight size={15} /></button>
          <button className="el-icon-button ed-danger-icon ed-push-right" disabled={busy} aria-label={`Enviar ${election.name} a la papelera`} title="Enviar a la papelera" onClick={() => { setError(''); setDecision({ kind: 'trash', election }); }}><Trash2 size={16} /></button>
        </>}
      </div>
    </article>;
  };
  const saveInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!inviteEditor) return;
    const values = new FormData(event.currentTarget), current = inviteEditor;
    const label = String(values.get('label') || '').trim(), expiresAt = parseElectoralInput(String(values.get('expiresAt') || ''));
    const success = await run(async () => {
      if (current !== 'new') await system.updateInvitation(current.id, { label, expiresAt });
      else { const id = await system.createInvitation({ electionId: String(values.get('electionId')), label, email: String(values.get('email') || '').trim(), requestedVoter: values.get('voter') === 'on', requestedCandidate: values.get('candidate') === 'on', expiresAt }); setLinkId(id); setCopied(false); }
    }, current === 'new' ? 'Invitación creada. Comparte su enlace con la persona destinataria.' : 'Invitación actualizada.');
    if (success) setInviteEditor(null);
  };
  const decisionCopy = (target: Decision) => {
    switch (target.kind) {
      case 'revoke': return ['Revocar invitación', target.invitation.label, 'Este enlace dejará de permitir nuevas aceptaciones. Los permisos ya solicitados se conservan.'];
      case 'trash': return ['Enviar a la papelera', target.election.name, 'El proceso dejará de verse para los participantes y se detendrán sus postulaciones y su votación. Los votos y expedientes se conservan, y puedes restaurarlo como archivado.'];
      case 'restore': return ['Restaurar proceso', target.election.name, 'Volverá como proceso archivado, con todo su historial. La votación no se reabre.'];
      default: return ['Cambiar estado del proceso', target.election.name, target.status === 'active' ? 'La convocatoria será pública. Las postulaciones y el voto seguirán las fechas del calendario; todos los participantes necesitan tu aprobación.' : target.status === 'closed' ? 'El proceso dejará de recibir votos inmediatamente. Los votos y expedientes registrados se conservarán.' : 'El proceso pasará al archivo y conservará su historial.'];
    }
  };
  if (!system.canManage || !canManageElections(system.identity.role)) return <div className="moon-electoral"><Empty title="Acceso reservado al CEO">Tu cuenta no tiene el rol necesario para abrir la dirección electoral.</Empty></div>;
  const [heading, subheading] = headings[view] ?? headings[''];
  const clearError = () => setError('');

  return <div className={`moon-electoral ed-workspace ${embedded ? 'el-embedded' : 'el-standalone'}`}>
    <div className="ed-shell">
      <header className="ed-header"><div className="ed-brand">{logoUrl ? <img src={logoUrl} alt="Moon Studios" /> : <strong>moon<span>STUDIOS</span></strong>}<span className="ed-header-divider" /><div><span className="el-kicker">DIRECCIÓN ELECTORAL</span><span>Administración del CEO</span></div></div><div className="ed-header-tools">{!system.settings.enabled && <Link className="ed-closed-badge" to={to('ajustes')}><LockKeyhole size={14} />Participación cerrada</Link>}<span className="ed-verified"><ShieldCheck size={16} />CEO verificado</span>{!embedded && onLogout && <button className="el-icon-button" aria-label="Cerrar sesión" onClick={onLogout}><LogOut size={18} /></button>}</div></header>
      <div className="ed-page-heading"><div><span className="el-kicker">MOON STUDIOS / GOBIERNO DEL PROCESO</span><h1>{heading}</h1><p>{subheading}</p></div><div className="ed-top-actions"><Link className="el-button" to={`${base}/participar`}>Portal de participantes<ArrowUpRight size={16} /></Link><button className="el-button el-button-primary" disabled={busy || system.loading} onClick={() => setEditor('new')}><Plus size={17} />Nuevo proceso</button></div></div>
      <nav className="ed-navigation" aria-label="Dirección electoral">{navigation.map(({ path, name, icon: Icon }) => <Link key={path} to={to(path)} aria-current={view === path ? 'page' : undefined}><Icon size={17} />{name}{path === 'candidaturas' && pendingCandidates.length > 0 && <span>{pendingCandidates.length}</span>}{path === 'participantes' && pendingAccess.length > 0 && <span>{pendingAccess.length}</span>}{path === 'comunicados' && liveNotices.length > 0 && <span>{liveNotices.length}</span>}</Link>)}</nav>
      {system.error && <div className="el-alert el-alert-error" role="alert">{system.error}<button className="el-text-button" onClick={system.refresh}><RefreshCw size={15} />Reintentar</button></div>}
      {notice && <p className="el-alert el-alert-success" role="status"><CheckCircle2 size={17} />{notice}</p>}
      {error && !decision && !inviteEditor && !['candidaturas', 'comunicados', 'ajustes'].includes(view) && <p className="el-alert el-alert-error" role="alert">{error}</p>}
      {system.loading ? <div className="el-loading" role="status"><LoaderCircle className="el-spin" />Cargando el centro de dirección…</div> : <main className="ed-main">
        {view === '' && <>
          <section className="ed-overview"><article className="ed-command" data-moon-reveal="card"><div><span className="el-kicker"><span className="ed-live-dot" />CENTRO DE CONTROL / CEO</span><h2>La participación empieza<br />con una buena dirección.</h2><p>Publica el calendario, revisa a cada participante y aprueba las propuestas que llegarán a la votación.</p><Link className="el-button el-button-primary" to={to(pendingCandidates.length ? 'candidaturas' : 'participantes')}>Abrir bandeja de revisión<ArrowRight size={17} /></Link></div><div className="ed-command-art" aria-hidden="true"><span /><span /><ShieldCheck size={52} /></div><div className="ed-command-bottom"><Clock3 size={15} />Apertura y cierre automáticos · Hora de Lima</div></article>
            <aside className="ed-inbox" data-moon-reveal="card"><span className="el-kicker">TU BANDEJA</span><h3>Atención de la dirección</h3>{[{ n: pendingCandidates.length, label: 'Candidaturas por revisar', path: 'candidaturas' }, { n: pendingAccess.length, label: 'Participantes por autorizar', path: 'participantes' }, { n: system.invitations.filter(item => invitationState(item) === 'active').length, label: 'Invitaciones disponibles', path: 'invitaciones' }, { n: liveNotices.length, label: 'Comunicados vigentes', path: 'comunicados' }].map(item => <Link key={item.path} to={to(item.path)}><strong>{String(item.n).padStart(2, '0')}</strong><span>{item.label}</span><ArrowUpRight size={17} /></Link>)}</aside></section>
          <section className="ed-stats" aria-label="Indicadores de dirección">{[{ n: elections.length, label: 'Procesos creados', icon: Flag }, { n: upcoming.length, label: 'Convocatorias vigentes', icon: CalendarDays }, { n: system.accessRequests.filter(item => !trashedIds.has(item.electionId) && item.voterStatus === 'approved').length, label: 'Permisos de voto aprobados', icon: ShieldCheck }, { n: liveCandidates.length, label: 'Expedientes registrados', icon: UsersRound }].map(({ n, label, icon: Icon }) => <article key={label} data-moon-reveal="card"><Icon size={20} /><strong>{n}</strong><span>{label}</span></article>)}</section>
          <div className="el-section-heading"><div><span className="el-kicker">EN LA AGENDA</span><h2>Próximas decisiones</h2></div><Link className="el-text-button" to={to('procesos')}>Todos los procesos<ArrowRight size={17} /></Link></div>
          <div className="ed-process-grid">{(upcoming.length ? upcoming : elections).slice(0, 2).map(processCard)}</div>
          {!elections.length && <Empty title="Tu primera convocatoria empieza aquí">Crea un proceso, define los cargos y publica el calendario cuando esté listo.</Empty>}
          {pendingCandidates.length > 0 && <><div className="el-section-heading"><div><span className="el-kicker">PENDIENTES DEL CEO</span><h2>Propuestas por conocer</h2></div><Link className="el-text-button" to={to('candidaturas')}>Abrir expedientes<ArrowRight size={17} /></Link></div><div className="ed-candidate-grid">{pendingCandidates.slice(0, 2).map(miniCandidate)}</div></>}
        </>}
        {view === 'procesos' && <>
          <div className="ed-section-intro"><div><h2>Procesos y calendario</h2><p>La preparación es privada. Publicar hace visible la convocatoria y activa sus fechas.</p></div><span className="el-result-count">{elections.length} procesos{trash.length ? ` · ${trash.length} en la papelera` : ''}</span></div>
          <div className="ed-toolbar">{searchField('Buscar procesos y cargos…')}<select aria-label="Estado del proceso" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos los estados</option><option value="draft">En preparación</option><option value="scheduled">Programados</option><option value="open">Votación abierta</option><option value="closed">Finalizados</option><option value="archived">Archivados</option><option value="deleted">En la papelera ({trash.length})</option></select></div>
          <div className="ed-process-grid">{visibleProcesses.map(processCard)}</div>
          {!visibleProcesses.length && <Empty title={filter === 'deleted' ? 'La papelera está vacía' : 'Sin procesos en esta vista'}>{filter === 'deleted' ? 'Los procesos que envíes a la papelera aparecerán aquí para restaurarlos.' : 'Cambia la búsqueda o crea una nueva convocatoria.'}</Empty>}
        </>}
        {view === 'candidaturas' && <DirectorCandidaturas system={system} elections={elections} now={now} busy={busy} run={run} error={error} clearError={clearError} />}
        {view === 'participantes' && <><div className="ed-section-intro"><div><h2>Control de participantes</h2><p>Autoriza a cada votante y revisa por separado el permiso para presentar candidatura.</p></div></div><ElectoralAccessManagement system={system} now={now} /></>}
        {view === 'invitaciones' && <>
          <div className="ed-section-intro"><div><h2>Invitaciones con seguimiento</h2><p>Cada enlace admite una aceptación. Puedes limitarlo a un correo y revocarlo mientras esté disponible.</p></div><button className="el-button el-button-primary" disabled={busy || !upcoming.length || !system.settings.enabled || system.settingsLoading || !!system.settingsError} onClick={() => { setError(''); setInviteEditor('new'); }}><MailPlus size={17} />Crear invitación</button></div>
          <div className="el-schedule-note"><ShieldCheck size={20} /><div><strong>Invitar no concede permisos</strong><p>La persona entra con su propia cuenta de Google o Discord. Al aceptar solicita participación; el CEO aprueba el voto y la postulación de forma independiente.</p></div></div>
          <div className="ed-toolbar ed-toolbar-three">{searchField('Buscar destinatario o correo…')}{processFilter}<select aria-label="Estado de invitación" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos los estados</option>{Object.entries(invitationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div className="ed-invitations">{visibleInvites.map(item => { const state = invitationState(item); return <article key={item.id} data-moon-reveal="card"><div className="ed-invite-icon"><MailPlus size={23} /></div><div className="ed-invite-copy"><div><h3>{item.label || 'Invitación de participación'}</h3><span className={`el-status el-status-${state}`}>{invitationLabels[state]}</span></div><p>{item.email || 'Enlace sin restricción de correo'} · {all.find(election => election.id === item.electionId)?.name || 'Proceso histórico'}</p><small>{[item.requestedVoter && 'Solicitar voto', item.requestedCandidate && 'Solicitar postulación'].filter(Boolean).join(' · ')} · Vence {formatDate(item.expiresAt)}</small>{item.status === 'accepted' && <small>Aceptada {formatDate(item.acceptedAt)} · Cuenta: {item.acceptedBy}</small>}</div><div className="ed-invite-actions">{item.status === 'active' && <><button className="el-button" disabled={busy || state !== 'active'} onClick={() => { setLinkId(item.id); setCopied(false); }}><Clipboard size={16} />Enlace</button><button className="el-icon-button" disabled={busy} aria-label={`Editar invitación ${item.label}`} onClick={() => { setError(''); setInviteEditor(item); }}><FilePenLine size={17} /></button><button className="el-icon-button" disabled={busy} aria-label={`Revocar invitación ${item.label}`} onClick={() => setDecision({ kind: 'revoke', invitation: item })}><X size={17} /></button></>}</div></article>; })}</div>
          {!visibleInvites.length && <Empty title="Sin invitaciones en esta vista">Publica un proceso vigente para crear invitaciones y compartir sus enlaces.</Empty>}
        </>}
        {view === 'comunicados' && <DirectorComunicados system={system} elections={elections} now={now} busy={busy} run={run} error={error} clearError={clearError} />}
        {view === 'ajustes' && <DirectorAjustes system={system} busy={busy} run={run} error={error} />}
        {!navigation.some(item => item.path === view) && <Empty title="404 · Esta sección no existe"><Link className="el-button" to={director}>Volver al centro de control<ArrowRight size={17} /></Link></Empty>}
      </main>}
      <footer className="ed-footer"><span><ShieldCheck size={15} />Dirección electoral · Moon Studios</span><span>{system.identity.displayName} · Rol CEO verificado</span></footer>
    </div>
    {editor && <ProcessEditor election={editor === 'new' ? null : editor} busy={busy} onClose={() => setEditor(null)} onSubmit={async input => { if (lock.current || system.busy) throw new Error('Espera a que termine la operación actual.'); lock.current = true; setWorking(true); try { if (editor === 'new') await system.createElection(input); else await system.updateElection(editor.id, input); setEditor(null); setNotice('Proceso guardado. Revisa el calendario antes de publicarlo.'); } finally { lock.current = false; setWorking(false); } }} />}
    {decision && (() => { const [title, name, description] = decisionCopy(decision); const danger = decision.kind === 'trash'; return <Dialog title={title} busy={busy} onClose={() => { setDecision(null); setError(''); }}><div className="el-dialog-body"><h3 className="el-confirm-name">{name}</h3><p className="el-confirm-description">{description}</p>{error && <p className="el-alert el-alert-error" role="alert">{error}</p>}<div className="el-dialog-actions"><button className="el-button" disabled={busy} onClick={() => { setDecision(null); setError(''); }}>Cancelar</button><button className={`el-button ${danger ? 'ed-danger-solid' : 'el-button-primary'}`} disabled={busy} onClick={() => void confirm()}>{busy ? <LoaderCircle className="el-spin" size={17} /> : danger ? <Trash2 size={17} /> : <ShieldCheck size={17} />}{danger ? 'Enviar a la papelera' : 'Confirmar cambio'}</button></div></div></Dialog>; })()}
    {inviteEditor && <Dialog title={inviteEditor === 'new' ? 'Crear invitación' : 'Editar invitación'} busy={busy} onClose={() => { setInviteEditor(null); setError(''); }}><form className="el-form el-dialog-body" onSubmit={saveInvitation}><p className="el-muted">El enlace solicita los permisos indicados. La aprobación sigue en manos del CEO.</p><label>Nombre o referencia<input name="label" required maxLength={120} placeholder="Ej. María · Comité creativo" defaultValue={inviteEditor === 'new' ? '' : inviteEditor.label} /></label>{inviteEditor === 'new' ? <><label>Proceso electoral<select name="electionId" required>{upcoming.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Correo de la cuenta destinataria <small>Opcional</small><input name="email" type="email" maxLength={254} placeholder="persona@ejemplo.com" /><small>Si lo indicas, la persona debe iniciar sesión con ese correo verificado. Algunas cuentas de Discord no comparten correo.</small></label><fieldset className="ed-rights"><legend>Permisos que solicitará al aceptar</legend><label><input type="checkbox" name="voter" defaultChecked />Solicitar permiso de voto</label><label><input type="checkbox" name="candidate" />Solicitar permiso para postular</label></fieldset></> : <p className="el-field-note">Destinatario: {inviteEditor.email || 'Sin restricción de correo'}. El proceso y los permisos se mantienen; crea otra invitación para cambiarlos.</p>}<label>Vencimiento · Hora de Lima<input type="datetime-local" name="expiresAt" required defaultValue={inviteEditor === 'new' ? electoralInputDate(new Date(Math.min(now + 86400000, upcoming[0]?.endDate.getTime() || now))) : electoralInputDate(inviteEditor.expiresAt)} /><small>Debe estar dentro del proceso. Si permite postular, debe vencer antes del cierre de inscripciones.</small></label>{error && <p className="el-alert el-alert-error" role="alert">{error}</p>}<div className="el-dialog-actions"><button type="button" className="el-button" disabled={busy} onClick={() => setInviteEditor(null)}>Cancelar</button><button type="submit" className="el-button el-button-primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="el-spin" /> : <MailPlus size={17} />}Guardar invitación</button></div></form></Dialog>}
    {linkId && !inviteEditor && <Dialog title="Compartir invitación" busy={false} onClose={() => setLinkId(null)}><div className="el-dialog-body el-form"><p className="el-muted">Comparte este enlace con la persona destinataria. La aceptación no aprueba automáticamente sus permisos.</p><label>Enlace de un solo uso<input readOnly aria-label="Enlace de invitación" value={inviteLink(linkId)} onFocus={event => event.currentTarget.select()} /></label><div className="el-dialog-actions"><button className="el-button" onClick={() => setLinkId(null)}>Listo</button><button className="el-button el-button-primary" onClick={async () => { try { await navigator.clipboard.writeText(inviteLink(linkId)); setCopied(true); } catch { setCopied(false); setError('Selecciona y copia el enlace del campo.'); } }}>{copied ? <CheckCircle2 size={17} /> : <Clipboard size={17} />}{copied ? 'Enlace copiado' : 'Copiar enlace'}</button></div>{error && <p role="status" className="el-field-note">{error}</p>}</div></Dialog>}
  </div>;
}
