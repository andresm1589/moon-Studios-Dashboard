import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3,
  CheckCircle2, CircleHelp, Clock3, FilePenLine, Flag, LayoutGrid,
  LoaderCircle, LogOut, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, UsersRound, Vote, X,
} from 'lucide-react';
import type { Candidate, CandidateInput, Election, ElectionController, ElectionStatus } from './types';
import { canManageElections, getElectionWindow, getRegistrationWindow } from './model';
import ElectionDirectorWorkspace from './ElectionDirectorWorkspace';
import { ElectoralAnnouncementBoard, ElectoralClosure, ElectoralUnavailable } from './ElectoralPublicPanel';
import ElectoralInvitationView from './ElectoralInvitation';
import { Dialog } from './ElectoralDialog';
import { ProcessEditor } from './ProcessEditor';
import { MyElectoralAccess } from './ElectoralAccessPanel';
import { ElectionManagement } from './ElectionManagement';
import './electoral.css';

export interface ElectionWorkspaceProps {
  system: ElectionController;
  basePath?: string;
  embedded?: boolean;
  logoUrl?: string;
  onLogout?: () => void;
}

type View = '' | 'procesos' | 'participacion' | 'votar' | 'postular' | 'resultados' | 'gestion';
type Confirmation =
  | { kind: 'vote'; election: Election; candidate: Candidate; position: string }
  | { kind: 'status'; election: Election; status: ElectionStatus }
  | { kind: 'review'; candidate: Candidate; status: 'approved' | 'rejected' };

const statusLabels: Record<ElectionStatus, string> = { draft: 'En preparación', active: 'Convocatoria publicada', closed: 'Finalizada', archived: 'Archivada', deleted: 'En la papelera' };
const candidateLabels = { pending: 'En revisión', approved: 'Aprobada', rejected: 'No aprobada' };
const navigation: { path: View; name: string; icon: typeof Vote }[] = [
  { path: '', name: 'Resumen', icon: LayoutGrid },
  { path: 'procesos', name: 'Procesos', icon: Flag },
  { path: 'participacion', name: 'Mi acceso', icon: ShieldCheck },
  { path: 'votar', name: 'Votar', icon: Vote },
  { path: 'postular', name: 'Postular', icon: FilePenLine },
  { path: 'resultados', name: 'Resultados', icon: BarChart3 },
  { path: 'gestion', name: 'Gestión electoral', icon: SlidersHorizontal },
];
const readableDate = (date: Date) => Number.isFinite(new Date(date).getTime())
  ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
  : 'Fecha por definir';
const isOpen = (election: Election, now: number) => getElectionWindow(election, new Date(now)).canVote;
const phaseLabel = (election: Election, now: number) => getRegistrationWindow(election, new Date(now)).canRegister ? 'Postulaciones abiertas' : getElectionWindow(election, new Date(now)).label;
const isFinished = (election: Election, now: number) => ['closed', 'archived'].includes(getElectionWindow(election, new Date(now)).state);
const getSchedule = (election: Election, now: number) => {
  if (election.status === 'draft') return 'En preparación · privado para el CEO';
  if (isFinished(election, now)) return 'Finalizó el ' + readableDate(election.endDate) + ' · Lima';
  if (getRegistrationWindow(election, new Date(now)).canRegister) return 'Postulaciones hasta ' + readableDate(election.registrationEndDate || election.startDate) + ' · Lima';
  return (now < new Date(election.startDate).getTime() ? 'Votación desde ' + readableDate(election.startDate) : 'Votación hasta ' + readableDate(election.endDate)) + ' · Lima';
};
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'M';
const getError = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.';
const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
};

function EmptyState({ icon: Icon = Flag, title, children, action }: { icon?: typeof Vote; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="el-empty"><span className="el-empty-symbol"><Icon size={26} aria-hidden="true" /></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

function CandidateAvatar({ candidate }: { candidate: Candidate }) {
  const [failed, setFailed] = useState(false);
  return <span className="el-avatar" aria-hidden="true">{candidate.photoURL && !failed ? <img src={candidate.photoURL} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials(candidate.name)}</span>;
}

export default function ElectionWorkspace(props: ElectionWorkspaceProps) {
  const { system, basePath = '/', embedded = false, logoUrl, onLogout } = props;
  const location = useLocation();
  const base = basePath.replace(/\/+$/, '');
  const relative = location.pathname.replace(/\/+$/, '').slice(base.length).replace(/^\//, '');
  const manager = system.canManage && canManageElections(system.identity.role);
  const visibleElections = system.elections.filter(item => item.status !== 'draft' && item.status !== 'deleted');
  const visibleElectionIds = new Set(visibleElections.map(item => item.id));
  const participantSystem: ElectionController = { ...system, canManage: false, invitations: [], elections: visibleElections, candidates: system.candidates.filter(item => (item.status === 'approved' || item.uid === system.identity.uid) && visibleElectionIds.has(item.electionId)), accessRequests: system.accessRequests.filter(item => item.uid === system.identity.uid && visibleElectionIds.has(item.electionId)) };
  const participantPath = manager ? `${base}/participar` : base || '/';
  const participantRoute = !manager || relative === 'participar' || relative.startsWith('participar/') || relative.startsWith('invitacion/');
  if (participantRoute && system.settingsLoading) return <div className="moon-electoral"><div className="el-loading" role="status"><LoaderCircle className="el-spin"/>Confirmando la disponibilidad del sistema electoral…</div></div>;
  if (participantRoute && system.settingsError) return <div className={`moon-electoral ${embedded ? 'el-embedded' : 'el-standalone'}`}><ElectoralUnavailable onRetry={system.refresh} adminHref={manager ? `${base}/direccion` : undefined} onLogout={embedded ? undefined : onLogout} compact={embedded}/></div>;
  const closed = participantRoute && !system.settings.enabled;
  if (closed) return <div className={`moon-electoral ${embedded ? 'el-embedded' : 'el-standalone'}`}><ElectoralClosure settings={system.settings} adminHref={manager ? `${base}/direccion` : embedded ? undefined : '/login?direccion=1'} onLogout={embedded ? undefined : onLogout} compact={embedded}/></div>;
  if (relative.startsWith('invitacion/')) return <div className={`moon-electoral ${embedded ? 'el-embedded' : 'el-standalone'}`}>
    {!embedded && <header className="el-standalone-header"><Link className="el-brand" to={participantPath}>{logoUrl && <img src={logoUrl} alt="Moon Studios"/>}<span>Invitación electoral</span></Link><div className="el-header-account"><span>{system.identity.displayName}</span>{onLogout && <button className="el-button" onClick={onLogout}><LogOut size={17}/>Cambiar de cuenta</button>}</div></header>}
    <div className="el-content"><ElectoralInvitationView system={participantSystem} invitationId={relative.slice('invitacion/'.length)} portalPath={participantPath}/></div>
  </div>;
  if (relative === 'gestion' || relative === 'direccion' || relative.startsWith('direccion/')) {
    if (!manager) return <div className="moon-electoral"><div className="el-content"><EmptyState icon={ShieldCheck} title="Dirección reservada al CEO">Tu cuenta no tiene permiso para gestionar procesos ni consultar expedientes privados.<Link className="el-button" to={base || '/'}>Ir al portal de participantes<ArrowRight size={17}/></Link></EmptyState></div></div>;
    if (relative === 'gestion') return <Navigate to={`${base}/direccion`} replace/>;
    return <ElectionDirectorWorkspace key={relative} system={system} basePath={base} embedded={embedded} logoUrl={logoUrl} onLogout={onLogout}/>;
  }
  if (manager && relative !== 'participar' && !relative.startsWith('participar/')) return <Navigate to={`${base}/direccion`} replace/>;
  return <>{manager && <div className="ed-preview-bar"><span>{system.settings.enabled ? 'Portal de participantes · Tus permisos electorales también requieren aprobación.' : 'Las elecciones están cerradas: los participantes ven la pantalla de cierre. Tú ves el portal como vista previa.'}</span><Link to={`${base}/direccion`}>Volver a dirección<ArrowUpRight size={16}/></Link></div>}<ParticipantWorkspace {...props} system={participantSystem} basePath={participantPath}/></>;
}

function ParticipantWorkspace({ system, basePath = '/', embedded = false, logoUrl, onLogout }: ElectionWorkspaceProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedBase = basePath.replace(/\/+$/, '');
  const to = (view: View) => `${normalizedBase}/${view}`.replace(/\/$/, '') || '/';
  const relativePath = location.pathname.replace(/\/+$/, '').slice(normalizedBase.length).replace(/^\//, '');
  const knownView = navigation.some(item => item.path === relativePath);
  const view = relativePath as View;
  const [now, setNow] = useState(Date.now);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [position, setPosition] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [editor, setEditor] = useState<Election | 'new' | null>(null);
  const operationLock = useRef(false);
  const candidateForm = useRef<HTMLFormElement>(null);
  const busy = system.busy || localBusy;
  const elections = [...system.elections].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const publicElections = system.canManage ? elections : elections.filter(election => election.status !== 'draft');
  const availableElections = view === 'postular' ? publicElections.filter(election => election.status !== 'draft' && election.status !== 'archived') : publicElections;
  const selectedElection = availableElections.find(election => election.id === selectedId) || availableElections.find(election => isOpen(election, now)) || availableElections[0];
  const currentPosition = selectedElection?.positions.includes(position) ? position : selectedElection?.positions[0] || '';
  const electionCandidates = system.candidates.filter(candidate => candidate.electionId === selectedElection?.id);
  const approvedCandidates = electionCandidates.filter(candidate => candidate.status === 'approved');
  const positionsVoted = selectedElection ? system.records[selectedElection.id]?.positionsVoted || [] : [];
  const ownAccess = system.accessRequests.find(item => item.uid === system.identity.uid && item.electionId === selectedElection?.id);
  const activeElections = publicElections.filter(election => isOpen(election, now));
  const ownCandidates = system.candidates.filter(candidate => candidate.uid === system.identity.uid);
  const pendingCandidates = [...system.candidates.filter(candidate => candidate.status === 'pending'), ...system.accessRequests.filter(item => item.voterStatus === 'pending' || item.candidateStatus === 'pending')];
  const filteredElections = publicElections.filter(election => (statusFilter === 'all' || getElectionWindow(election, new Date(now)).state === statusFilter)
    && `${election.name} ${election.description} ${election.positions.join(' ')}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const votesCast = Object.values(system.records).reduce((sum, record) => sum + record.positionsVoted.length, 0);
  const totalVotes = publicElections.reduce((sum, election) => sum + (Number(election.totalVotes) || 0), 0);

  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    const boundaries = system.elections.flatMap(election => [election.startDate, election.endDate, election.registrationStartDate, election.registrationEndDate]).filter((date): date is Date => !!date).map(date => new Date(date).getTime()).filter(time => time > Date.now());
    const delay = Math.max(20, Math.min(30_000, (boundaries.length ? Math.min(...boundaries) - Date.now() + 20 : 30_000)));
    const timer = window.setTimeout(refreshClock, delay);
    window.addEventListener('focus', refreshClock); document.addEventListener('visibilitychange', refreshClock);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', refreshClock); document.removeEventListener('visibilitychange', refreshClock); };
  }, [system.elections, now]);
  // Preserve process selection at the deadline and clear stale ballot choices in the same render.
  const selectionScope = `${selectedElection?.id || ''}|${currentPosition}|${view}`;
  const [previousScope, setPreviousScope] = useState(selectionScope);
  if (selectedElection && selectedId !== selectedElection.id) setSelectedId(selectedElection.id);
  if (previousScope !== selectionScope) { setPreviousScope(selectionScope); setSelectedCandidate(''); setActionError(''); }

  const selectElection = (election: Election, destination: View) => {
    setSelectedId(election.id);
    setPosition(election.positions[0] || '');
    navigate(to(destination));
  };
  const perform = async (action: () => Promise<unknown>, success: string) => {
    if (operationLock.current || system.busy) return false;
    operationLock.current = true;
    setLocalBusy(true);
    setActionError('');
    setNotice('');
    try { await action(); setNotice(success); return true; }
    catch (issue) { setActionError(getError(issue)); return false; }
    finally { operationLock.current = false; setLocalBusy(false); }
  };
  const confirmAction = async () => {
    if (!confirmation) return;
    const target = confirmation;
    const success = await perform(async () => {
      if (target.kind === 'vote') await system.castVote(target.election.id, target.candidate.id, target.position);
      else if (target.kind === 'status') await system.setElectionStatus(target.election.id, target.status);
      else await system.reviewCandidate(target.candidate.id, target.status);
    }, target.kind === 'vote' ? `Tu voto para ${target.position} quedó registrado.` : 'El cambio se guardó correctamente.');
    if (success) { setConfirmation(null); setSelectedCandidate(''); }
  };
  const registerCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedElection || busy) return;
    const submittedForm = event.currentTarget;
    const form = new FormData(submittedForm);
    setNotice('');
    const proposals = String(form.get('proposals') || '').split(/\r?\n/).map(text => text.trim()).filter(Boolean);
    if (!proposals.length) { setActionError('Describe al menos una propuesta para tu candidatura.'); return; }
    const file = form.get('photo');
    const photo = file instanceof File && file.size > 0 ? file : undefined;
    if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 4 * 1024 * 1024)) { setActionError('Usa una foto JPG, PNG o WebP de hasta 4 MB.'); return; }
    const input: CandidateInput = { electionId: selectedElection.id, name: String(form.get('name')).trim(), position: String(form.get('position')), department: String(form.get('department')).trim(), proposals, slogan: String(form.get('slogan') || '').trim() };
    const success = await perform(() => system.registerCandidate(input, photo), 'Tu postulación se envió a revisión. Podrás consultar su estado aquí.');
    if (success) submittedForm.reset();
  };
  const exportResults = () => {
    if (!selectedElection) return;
    const rows: unknown[][] = [['Proceso', 'Estado', 'Cargo', 'Candidatura', 'Departamento', 'Votos']];
    approvedCandidates.forEach(candidate => rows.push([selectedElection.name, phaseLabel(selectedElection, now), candidate.position, candidate.name, candidate.department, candidate.votes || 0]));
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `resultados-${selectedElection.name.toLocaleLowerCase('es').replace(/[^a-z0-9áéíóúñ]+/g, '-').slice(0, 70)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const selectionControl = (label = 'Proceso electoral') => <label className="el-election-select">{label}<select value={selectedElection?.id || ''} onChange={event => { setSelectedId(event.target.value); setPosition(''); }} disabled={!availableElections.length || busy} aria-label={label}>
    {!availableElections.length && <option value="">No hay procesos disponibles</option>}{availableElections.map(election => <option key={election.id} value={election.id}>{election.name} · {phaseLabel(election, now)}</option>)}
  </select></label>;

  const electionCards = (items: Election[]) => <div className="el-process-grid">{items.map(election => {
    const candidates = system.candidates.filter(candidate => candidate.electionId === election.id && candidate.status === 'approved');
    const record = system.records[election.id];
    const open = isOpen(election, now);
    const registering = getRegistrationWindow(election, new Date(now)).canRegister;
    const access = system.accessRequests.find(item => item.uid === system.identity.uid && item.electionId === election.id);
    const complete = election.positions.length > 0 && election.positions.every(item => record?.positionsVoted.includes(item));
    return <article className="el-process-card" data-moon-reveal="card" key={election.id}>
      <div className="el-card-top"><span className={`el-status el-status-${election.status}`}><span />{phaseLabel(election, now)}</span><Flag size={19} aria-hidden="true" /></div>
      <h3>{election.name}</h3><p className="el-clamp-two">{election.description || 'Consulta los cargos, las candidaturas y el calendario de este proceso.'}</p>
      <div className="el-card-facts"><span><UsersRound size={15} />{candidates.length} candidatura{candidates.length === 1 ? '' : 's'}</span><span><Vote size={15} />{election.positions.length} cargo{election.positions.length === 1 ? '' : 's'}</span></div>
      <p className="el-card-date"><Clock3 size={14} />{getSchedule(election, now)}</p>
      <div className="el-card-bottom">{complete ? <span className="el-completed"><CheckCircle2 size={16} />Participación completa</span> : <span className="el-muted">{record?.positionsVoted.length ? `${record.positionsVoted.length} de ${election.positions.length} cargos votados` : 'Tu equipo. Tu decisión.'}</span>}<button className="el-button el-button-small" onClick={() => selectElection(election, registering ? access?.candidateStatus === 'approved' ? 'postular' : 'participacion' : open && !complete ? access?.voterStatus === 'approved' ? 'votar' : 'participacion' : 'resultados')}>{registering ? access?.candidateStatus === 'approved' ? 'Postular' : 'Solicitar acceso' : open && !complete ? access?.voterStatus === 'approved' ? 'Participar' : 'Solicitar acceso' : 'Ver resultados'}<ArrowUpRight size={16} /></button></div>
    </article>;
  })}</div>;

  return <div className={`moon-electoral ${embedded ? 'el-embedded' : 'el-standalone'}`}>
    {!embedded && <header className="el-standalone-header"><Link className="el-brand" to={to('')} aria-label="Moon Studios · Inicio de elecciones">{logoUrl ? <img src={logoUrl} alt="Moon Studios" /> : <span className="el-brand-text">moon<span>Studios</span></span>}<span className="el-brand-divider" /><span>Elecciones</span></Link><div className="el-header-account"><span className="el-account-initials">{initials(system.identity.displayName)}</span><span>{system.identity.displayName}</span>{onLogout && <button className="el-icon-button" onClick={onLogout} aria-label="Cerrar sesión"><LogOut size={18} /></button>}</div></header>}
    <div className="el-content">
      <header className="el-page-heading" data-moon-reveal="heading"><div><span className="el-kicker">MOON STUDIOS / PARTICIPACIÓN</span><h1>Tu voz mueve <span>el equipo.</span></h1><p>Un espacio para proponer, elegir y construir el próximo capítulo de Moon.</p></div><div className="el-heading-actions"><button className="el-icon-button" aria-label="Actualizar elecciones" title="Actualizar elecciones" disabled={busy || system.loading} onClick={() => system.refresh()}><RefreshCw size={18} className={system.loading ? 'el-spin' : ''} /></button>{system.canManage && <button className="el-button el-button-primary" onClick={() => setEditor('new')} disabled={busy}><Plus size={18} />Nuevo proceso</button>}</div></header>
      <nav className="el-navigation" aria-label="Secciones de elecciones">{navigation.filter(item => item.path !== 'gestion' || system.canManage).map(({ path, name, icon: Icon }) => <Link key={path} to={to(path)} aria-current={view === path ? 'page' : undefined}><Icon size={17} aria-hidden="true" /><span>{name}</span>{path === 'gestion' && pendingCandidates.length > 0 && <span className="el-nav-count">{pendingCandidates.length}</span>}</Link>)}</nav>
      <div className="el-notices">{system.error && <div className="el-alert el-alert-error" role="alert"><CircleHelp size={19} /><div><strong>No pudimos actualizar las elecciones.</strong><p>{system.error}</p></div><button className="el-button el-button-small" onClick={system.refresh}>Reintentar</button></div>}{actionError && !confirmation && <div className="el-alert el-alert-error" role="alert">{actionError}<button className="el-icon-button" aria-label="Cerrar mensaje de error" onClick={() => setActionError('')}><X size={17} /></button></div>}{notice && <div className="el-alert el-alert-success" role="status"><CheckCircle2 size={19} /><span>{notice}</span><button className="el-icon-button" aria-label="Cerrar confirmación" onClick={() => setNotice('')}><X size={17} /></button></div>}</div>
      {system.loading && !elections.length ? <div className="el-loading" role="status"><LoaderCircle className="el-spin" size={28} /><h2>Cargando tu espacio electoral</h2><p>Consultando los procesos y las candidaturas disponibles.</p></div> : <>
        {view === '' && <section className="el-view"><ElectoralAnnouncementBoard announcements={system.announcements} loading={system.announcementsLoading} error={system.announcementsError}/>
          <div className="el-overview-grid"><article className="el-spotlight" data-moon-reveal="card"><div className="el-spotlight-copy"><span className="el-kicker"><span className="el-live-dot" /> EL SIGUIENTE PASO ES CONTIGO</span><h2>{activeElections.length ? 'Las decisiones se toman participando.' : 'Las buenas ideas empiezan con una voz.'}</h2><p>{activeElections.length ? `Tienes ${activeElections.length} proceso${activeElections.length === 1 ? '' : 's'} con votación abierta. Conoce las propuestas y elige a quienes representarán al equipo.` : 'Explora los procesos de la empresa, presenta tus propuestas y sigue cada decisión desde un mismo lugar.'}</p><button className="el-button el-button-primary" onClick={() => navigate(to(activeElections.length ? 'votar' : 'procesos'))}>{activeElections.length ? 'Ir a votar' : 'Explorar procesos'}<ArrowRight size={17} /></button></div><div className="el-orbit-art" aria-hidden="true"><span className="el-orbit el-orbit-one" /><span className="el-orbit el-orbit-two" /><div className="el-ballot"><Vote size={60} strokeWidth={1} /></div><span className="el-orbit-note">CADA VOZ CUENTA</span></div></article><aside className="el-participation" data-moon-reveal="card"><div className="el-card-top"><span className="el-kicker">MI PARTICIPACIÓN</span><ShieldCheck size={20} /></div><strong className="el-participation-number">{String(votesCast).padStart(2, '0')}</strong><h3>voto{votesCast === 1 ? '' : 's'} registrado{votesCast === 1 ? '' : 's'}</h3><p>Consulta tus cargos completados y las postulaciones que has enviado.</p><div className="el-participation-foot"><span>{ownCandidates.length} postulación{ownCandidates.length === 1 ? '' : 'es'}</span><button className="el-text-button" onClick={() => navigate(to('postular'))}>Ver mi actividad<ArrowUpRight size={16} /></button></div></aside></div>
          <div className="el-metrics" aria-label="Resumen de elecciones">{[
            { value: publicElections.length, name: 'Procesos electorales', icon: Flag, note: 'Disponibles en tu espacio' },
            { value: activeElections.length, name: 'Votaciones abiertas', icon: Vote, note: 'Dentro del plazo de votación' },
            { value: system.candidates.filter(candidate => candidate.status === 'approved' && publicElections.some(election => election.id === candidate.electionId)).length, name: 'Candidaturas aprobadas', icon: UsersRound, note: 'Propuestas del equipo' },
            { value: totalVotes, name: 'Votos registrados', icon: BarChart3, note: 'Suma de votos por cargo' },
          ].map(({ value, name, icon: Icon, note }) => <article className="el-metric" data-moon-reveal="card" key={name}><div><span>{name}</span><Icon size={18} /></div><strong>{value.toLocaleString('es-PE')}</strong><small>{note}</small></article>)}</div>
          <div className="el-section-heading"><div><span className="el-kicker">EN TU EMPRESA</span><h2>Procesos recientes</h2></div><Link className="el-text-button" to={to('procesos')}>Ver todos<ArrowRight size={16} /></Link></div>
          {publicElections.length ? electionCards(publicElections.slice(0, 4)) : <EmptyState title="Aquí empieza la próxima decisión">Los procesos aparecerán en este espacio cuando se publiquen.{system.canManage ? ' Puedes crear la primera convocatoria desde Nuevo proceso.' : ''}</EmptyState>}
          <div className="el-steps" data-moon-reveal="card">{[{ n: '01', icon: UsersRound, title: 'Conoce al equipo', text: 'Revisa las candidaturas aprobadas y sus propuestas antes de elegir.' }, { n: '02', icon: Vote, title: 'Participa con claridad', text: 'Selecciona una candidatura y confirma tu voto para cada cargo disponible.' }, { n: '03', icon: BarChart3, title: 'Sigue los resultados', text: 'Consulta el conteo por cargo y el estado de cada proceso electoral.' }].map(({ n, icon: Icon, title, text }) => <article key={n}><span>{n}</span><Icon size={21} /><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>}

        {view === 'procesos' && <section className="el-view"><div className="el-section-heading"><div><span className="el-kicker">EXPLORA Y PARTICIPA</span><h2>Procesos electorales</h2><p>El calendario, los cargos y la participación de tu empresa.</p></div><span className="el-result-count">{filteredElections.length} resultado{filteredElections.length === 1 ? '' : 's'}</span></div><div className="el-toolbar"><label className="el-search" data-moon-field-frame><Search size={19} aria-hidden="true" /><input type="search" placeholder="Buscar procesos, cargos o descripción…" value={search} onChange={event => setSearch(event.target.value)} aria-label="Buscar procesos electorales" /></label><select aria-label="Filtrar procesos por estado" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todos los estados</option>{Object.entries({ draft: 'En preparación', scheduled: 'Convocatoria programada', open: 'Votación abierta', closed: 'Finalizada', archived: 'Archivada' }).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>{filteredElections.length ? electionCards(filteredElections) : <EmptyState title={search || statusFilter !== 'all' ? 'No hay coincidencias' : 'Todavía no hay procesos'} action={search || statusFilter !== 'all' ? <button className="el-button" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Limpiar filtros</button> : undefined}>{search || statusFilter !== 'all' ? 'Prueba con otro nombre o cambia el filtro de estado.' : 'Los nuevos procesos electorales aparecerán aquí.'}</EmptyState>}</section>}

        {view === 'participacion' && <section className="el-view">{selectionControl()}<MyElectoralAccess key={selectedElection?.id || 'empty'} system={system} election={selectedElection} now={now}/></section>}

        {view === 'votar' && <section className="el-view"><div className="el-section-heading"><div><span className="el-kicker">ELIGE CON INFORMACIÓN</span><h2>Tu voto, una decisión</h2><p>Un voto por cargo. Revisa tu selección antes de confirmarla.</p></div></div>{selectionControl()}
          {!selectedElection ? <EmptyState icon={Vote} title="Aún no hay una votación disponible">Consulta los procesos para conocer las próximas elecciones.</EmptyState> : <><div className="el-process-strip" data-moon-reveal="card"><div><span className={`el-status el-status-${selectedElection.status}`}><span />{phaseLabel(selectedElection, now)}</span><h3>{selectedElection.name}</h3><p><Clock3 size={15} />{getSchedule(selectedElection, now)}</p></div><span className="el-record-count"><strong>{positionsVoted.length}</strong> / {selectedElection.positions.length}<small>cargos completados</small></span></div><div className="el-position-tabs" role="group" aria-label="Elegir cargo">{selectedElection.positions.map(item => <button type="button" aria-pressed={currentPosition === item} key={item} onClick={() => setPosition(item)}>{positionsVoted.includes(item) ? <CheckCircle2 size={16} /> : <Vote size={16} />}{item}</button>)}</div>
            {!isOpen(selectedElection, now) ? <EmptyState icon={Clock3} title="La votación no está abierta">{getSchedule(selectedElection, now)}. Puedes consultar las candidaturas y los resultados publicados.<Link className="el-button" to={to('resultados')}>Consultar resultados<ArrowRight size={16} /></Link></EmptyState> : ownAccess?.voterStatus !== 'approved' ? <EmptyState icon={ShieldCheck} title="Necesitas aprobación como votante">El CEO debe autorizar tu participación en este proceso antes de votar, aunque seas empleado.<Link className="el-button el-button-primary" to={to('participacion')}>Consultar mi acceso<ArrowRight size={17}/></Link></EmptyState> : positionsVoted.includes(currentPosition) ? <EmptyState icon={CheckCircle2} title="Tu voto para este cargo ya está registrado">Ya participaste en {currentPosition}. Selecciona otro cargo para continuar o consulta los resultados.<Link className="el-button" to={to('resultados')}>Ver resultados<ArrowRight size={16} /></Link></EmptyState> : <><div className="el-section-heading el-section-heading-small"><div><h3>Candidaturas a {currentPosition}</h3><p>Selecciona una propuesta para continuar.</p></div><span className="el-result-count">{approvedCandidates.filter(candidate => candidate.position === currentPosition).length} disponibles</span></div><div className="el-candidates-grid">{approvedCandidates.filter(candidate => candidate.position === currentPosition).map(candidate => <article className={`el-candidate-card ${selectedCandidate === candidate.id ? 'is-selected' : ''}`} key={candidate.id} data-moon-reveal="card"><div className="el-candidate-head"><CandidateAvatar candidate={candidate} /><span className="el-status el-status-approved"><ShieldCheck size={13} />Aprobada</span></div><h3>{candidate.name}</h3><span className="el-candidate-role">{candidate.department || 'Moon Studios'}</span>{candidate.slogan && <p className="el-candidate-slogan">“{candidate.slogan}”</p>}<div className="el-proposals"><span className="el-kicker">SUS PROPUESTAS</span><ul>{candidate.proposals.map((proposal, index) => <li key={`${index}-${proposal}`}>{proposal}</li>)}</ul></div><button className={`el-button ${selectedCandidate === candidate.id ? 'el-button-primary' : ''}`} aria-pressed={selectedCandidate === candidate.id} disabled={busy} onClick={() => setSelectedCandidate(candidate.id)}>{selectedCandidate === candidate.id ? <CheckCircle2 size={18} /> : <Plus size={18} />}{selectedCandidate === candidate.id ? 'Candidatura seleccionada' : 'Elegir candidatura'}</button></article>)}</div>{!approvedCandidates.some(candidate => candidate.position === currentPosition) && <EmptyState icon={UsersRound} title="Las candidaturas aún no están listas">Cuando se aprueben candidaturas para este cargo, podrás consultarlas y votar aquí.</EmptyState>}{selectedCandidate && <div className="el-vote-bar"><div><ShieldCheck size={22} /><p><strong>{approvedCandidates.find(candidate => candidate.id === selectedCandidate)?.name}</strong><span>Tu selección para {currentPosition}</span></p></div><button className="el-button el-button-primary" disabled={busy} onClick={() => { const candidate = approvedCandidates.find(item => item.id === selectedCandidate); if (candidate) setConfirmation({ kind: 'vote', candidate, election: selectedElection, position: currentPosition }); }}>Revisar y confirmar<ArrowRight size={17} /></button></div>}</>}
          </>}
        </section>}

        {view === 'postular' && <section className="el-view"><div className="el-section-heading"><div><span className="el-kicker">PROPÓN EL SIGUIENTE CAPÍTULO</span><h2>Las ideas también se postulan.</h2><p>Cuéntale al equipo qué quieres aportar y presenta tu candidatura.</p></div></div><div className="el-application-layout"><article className="el-panel" data-moon-reveal="card"><div className="el-panel-heading"><FilePenLine size={21} /><div><h3>Nueva postulación</h3><p>Las candidaturas se revisan antes de aparecer en la votación.</p></div></div>{selectionControl()}{selectedElection && getRegistrationWindow(selectedElection, new Date(now)).canRegister && ownAccess?.candidateStatus === 'approved' ? <form ref={candidateForm} key={selectedElection.id} className="el-form" onSubmit={registerCandidate}><label>Nombre para tu candidatura<input name="name" required minLength={3} maxLength={120} defaultValue={system.identity.displayName} autoComplete="name" /></label><div className="el-form-grid"><label>Cargo<select required name="position">{selectedElection.positions.map(item => <option key={item}>{item}</option>)}</select></label><label>Departamento{selectedElection.departments.length ? <select name="department" required>{selectedElection.departments.map(item => <option key={item}>{item}</option>)}</select> : <input name="department" required maxLength={100} placeholder="Ej. Desarrollo" />}</label></div><label>Una frase que represente tu propuesta <small>Opcional</small><input name="slogan" maxLength={180} placeholder="Lo que podemos construir juntos" /></label><label>Propuestas<textarea name="proposals" required rows={5} maxLength={6000} placeholder={'¿Qué mejorarías?\n¿Qué cambios propones para el equipo?'} /><small>Escribe una propuesta por línea. Sé concreto y explica su beneficio.</small></label><label>Foto de la candidatura <small>Opcional</small><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" /><small>JPG, PNG o WebP. Máximo 4 MB.</small></label><div className="el-form-footer"><p><ShieldCheck size={16} />Se registrará con tu cuenta de Moon Studios.</p><button className="el-button el-button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="el-spin" /> : <ArrowUpRight size={17} />}{busy ? 'Enviando…' : 'Enviar a revisión'}</button></div></form> : <EmptyState icon={ShieldCheck} title={selectedElection && getRegistrationWindow(selectedElection, new Date(now)).canRegister ? 'Solicita permiso para postular' : 'Las postulaciones no están abiertas'}>El CEO autoriza tu permiso y revisa tu propuesta. Sólo se reciben candidaturas dentro del calendario publicado.<Link className="el-button" to={to('participacion')}>Ver permisos y calendario<ArrowRight size={17}/></Link></EmptyState>}</article><aside className="el-panel el-own-applications" data-moon-reveal="card"><div className="el-panel-heading"><UsersRound size={21} /><div><h3>Mis postulaciones</h3><p>{ownCandidates.length} enviada{ownCandidates.length === 1 ? '' : 's'}</p></div></div>{ownCandidates.length ? ownCandidates.map(candidate => <article className="el-own-application" key={candidate.id}><div><CandidateAvatar candidate={candidate} /><span className={`el-status el-status-${candidate.status}`}>{candidateLabels[candidate.status]}</span></div><h4>{candidate.position}</h4><p>{publicElections.find(election => election.id === candidate.electionId)?.name || 'Proceso electoral'}</p><small>{readableDate(candidate.createdAt)}</small>{candidate.status === 'pending' && <p className="el-field-note">La dirección revisará tu propuesta antes de publicarla.</p>}</article>) : <EmptyState title="Tu primera propuesta empieza aquí">Cuando envíes una candidatura, podrás seguir su estado en este panel.</EmptyState>}</aside></div></section>}

        {view === 'resultados' && <section className="el-view"><div className="el-section-heading"><div><span className="el-kicker">EL EQUIPO EN NÚMEROS</span><h2>Resultados del proceso</h2><p>Conteos por candidatura y cargo, con el estado actual de la elección.</p></div><button className="el-button" onClick={exportResults} disabled={!selectedElection || !approvedCandidates.length}><ArrowDownToLine size={17} />Exportar CSV</button></div>{selectionControl()}{selectedElection ? <><div className="el-results-banner" data-moon-reveal="card"><div><span className={`el-status el-status-${selectedElection.status}`}><span />{phaseLabel(selectedElection, now)}</span><h3>{selectedElection.name}</h3><p>{isFinished(selectedElection, now) ? 'Este proceso está cerrado. El desglose muestra los votos registrados por cargo.' : 'Conteo provisional. El proceso todavía no se ha cerrado; los resultados pueden cambiar.'}</p></div><div><strong>{(Number(selectedElection.totalVotes) || 0).toLocaleString('es-PE')}</strong><span>votos registrados</span></div></div><div className="el-results-grid">{selectedElection.positions.map(item => {
          const candidates = approvedCandidates.filter(candidate => candidate.position === item).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
          const total = candidates.reduce((sum, candidate) => sum + (Number(candidate.votes) || 0), 0);
          const highest = candidates[0]?.votes || 0;
          const tied = highest > 0 && candidates.filter(candidate => candidate.votes === highest).length > 1;
          const closed = isFinished(selectedElection, now);
          return <article className="el-panel el-result-panel" key={item} data-moon-reveal="card"><div className="el-result-title"><div><span className="el-kicker">RESULTADOS POR CARGO</span><h3>{item}</h3></div><span className="el-result-total">{total}<small>votos</small></span></div>{candidates.length ? <div className="el-result-rows">{candidates.map((candidate, index) => { const percentage = total ? candidate.votes / total * 100 : 0; return <div className="el-result-row" key={candidate.id}><div className="el-result-person"><span className="el-ranking">{String(index + 1).padStart(2, '0')}</span><CandidateAvatar candidate={candidate} /><div><strong>{candidate.name}</strong><small>{candidate.department}</small></div><span><strong>{Number(candidate.votes || 0).toLocaleString('es-PE')}</strong><small>{percentage.toLocaleString('es-PE', { maximumFractionDigits: 1 })}%</small></span></div><div className="el-result-track" role="img" aria-label={`${candidate.name}: ${candidate.votes || 0} votos, ${percentage.toFixed(1)} por ciento`}><span style={{ width: `${percentage}%` }} /></div></div>; })}</div> : <p className="el-muted el-result-no-data">No hay candidaturas aprobadas para este cargo.</p>}<div className="el-result-verdict">{!total ? <><Clock3 size={16} />Aún no hay votos registrados.</> : !closed ? <><Clock3 size={16} />Conteo provisional; sin resultado definitivo.</> : tied ? <><UsersRound size={16} />Empate en el primer lugar. Requiere resolución.</> : <><CheckCircle2 size={16} />Mayor votación: {candidates[0]?.name}.</>}</div></article>;
        })}</div></> : <EmptyState icon={BarChart3} title="Los resultados llegarán aquí">Selecciona un proceso cuando haya elecciones disponibles.</EmptyState>}</section>}

        {view === 'gestion' && <ElectionManagement system={system} now={now} onEdit={setEditor} onStatus={(election,status) => setConfirmation({kind:'status',election,status})} onReview={(candidate,status) => setConfirmation({kind:'review',candidate,status})} onResults={election => selectElection(election,'resultados')}/>}

        {!knownView && <EmptyState icon={CircleHelp} title="Este espacio no existe"><span>404 · La sección electoral que buscas no está disponible.</span><Link className="el-button el-button-primary" to={to('')}>Volver a elecciones<ArrowRight size={17} /></Link></EmptyState>}
      </>}
      <footer className="el-footer"><span><Sparkles size={14} />Moon Studios · Juntos decidimos lo que viene.</span><span>Cuenta de {system.identity.displayName}</span></footer>
    </div>
    {editor && system.canManage && <ProcessEditor election={editor === 'new' ? null : editor} busy={busy} onClose={() => setEditor(null)} onSubmit={async input => {
      if (operationLock.current || system.busy) return;
      operationLock.current = true; setLocalBusy(true);
      try { if (editor === 'new') await system.createElection(input); else await system.updateElection(editor.id, input); setNotice('El proceso se guardó correctamente.'); setEditor(null); }
      finally { operationLock.current = false; setLocalBusy(false); }
    }} />}
    {confirmation && <Dialog title={confirmation.kind === 'vote' ? 'Confirma tu decisión' : confirmation.kind === 'review' ? 'Revisar candidatura' : 'Cambiar estado del proceso'} busy={busy} onClose={() => { setConfirmation(null); setActionError(''); }}><div className="el-dialog-body"><div className="el-confirm-symbol">{confirmation.kind === 'vote' ? <Vote size={30} /> : <ShieldCheck size={30} />}</div>{confirmation.kind === 'vote' ? <><h3 className="el-confirm-name">{confirmation.candidate.name}</h3><p className="el-confirm-description">Votarás por esta candidatura a <strong>{confirmation.position}</strong> en {confirmation.election.name}.</p><p className="el-confirm-warning">Una vez registrado, tu voto para este cargo no se puede cambiar desde este espacio.</p></> : confirmation.kind === 'review' ? <><h3 className="el-confirm-name">{confirmation.candidate.name}</h3><p className="el-confirm-description">{confirmation.status === 'approved' ? 'Esta candidatura se habilitará para participar en la votación.' : 'Esta candidatura quedará como no aprobada y no aparecerá entre las opciones para votar.'}</p></> : <><h3 className="el-confirm-name">{confirmation.election.name}</h3><p className="el-confirm-description">{confirmation.status === 'active' ? 'La convocatoria se publicará para recibir solicitudes. La votación se abrirá y cerrará automáticamente en las fechas configuradas.' : confirmation.status === 'closed' ? 'La votación se cerrará y dejará de recibir votos. Los votos ya registrados se conservarán.' : 'El proceso pasará al archivo. Su información y los votos registrados se conservarán.'}</p><p className="el-field-note">Nuevo estado: {statusLabels[confirmation.status]}.</p></>}{actionError && <p className="el-alert el-alert-error" role="alert">{actionError}</p>}<div className="el-dialog-actions"><button className="el-button" disabled={busy} onClick={() => { setConfirmation(null); setActionError(''); }}>Volver</button><button className="el-button el-button-primary" disabled={busy} onClick={confirmAction}>{busy ? <LoaderCircle size={17} className="el-spin" /> : <CheckCircle2 size={17} />}{busy ? 'Guardando…' : confirmation.kind === 'vote' ? 'Confirmar mi voto' : 'Confirmar cambio'}</button></div></div></Dialog>}
  </div>;
}




