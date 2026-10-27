import { useRef, useState } from 'react';
import { CheckCircle2, Clock3, Search, ShieldCheck, UserRoundCheck, UsersRound, Vote } from 'lucide-react';
import type { Election, ElectionController, ElectoralAccess } from './types';
import { getRegistrationWindow } from './model';
import { Dialog } from './ElectoralDialog';

const labels = { none: 'No solicitado', pending: 'Pendiente de aprobación', approved: 'Aprobado por el CEO', rejected: 'No autorizado' };
const message = (cause: unknown) => cause instanceof Error ? cause.message : 'No pudimos guardar el cambio. Inténtalo de nuevo.';
const formatDate = (date: Date) => Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Fecha por definir';

export function MyElectoralAccess({ system, election, now }: { system: ElectionController; election?: Election; now: number }) {
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [working, setWorking] = useState(false);
  const lock = useRef(false);
  const record = system.accessRequests.find(item => item.uid === system.identity.uid && item.electionId === election?.id);
  const registration = election ? getRegistrationWindow(election, new Date(now)) : null;
  const voterOpen = election?.status === 'active' && new Date(election.endDate).getTime() > now;
  const send = async (kind: 'voter' | 'candidate') => {
    if (!election || lock.current || system.busy) return;
    lock.current = true; setWorking(true); setError(''); setNotice('');
    try { await system.requestAccess(election.id, { voter: kind === 'voter', candidate: kind === 'candidate' }); setNotice('Solicitud enviada. El CEO revisará tu permiso para este proceso.'); }
    catch (cause) { setError(message(cause)); } finally { lock.current = false; setWorking(false); }
  };
  return <section className="el-view">
    <div className="el-section-heading"><div><span className="el-kicker">TU PARTICIPACIÓN</span><h2>Una cuenta. Permisos claros.</h2><p>El CEO aprueba a cada participante por proceso, incluidos los empleados del estudio.</p></div></div>
    {error && <p className="el-alert el-alert-error" role="alert">{error}</p>}{notice && <p className="el-alert el-alert-success" role="status">{notice}</p>}
    {!election ? <div className="el-empty"><UsersRound size={28}/><h3>Aún no hay una convocatoria</h3><p>Podrás solicitar participación cuando el CEO publique un proceso.</p></div> : <>
      <div className="el-schedule-note"><ShieldCheck size={20}/><div><strong>{election.name}</strong><p>Tu cuenta está autenticada. Iniciar sesión no concede automáticamente permiso para votar o postular.</p></div></div>
      <div className="el-access-grid">{(['voter', 'candidate'] as const).map(kind => {
        const status = kind === 'voter' ? record?.voterStatus || 'none' : record?.candidateStatus || 'none';
        const open = kind === 'voter' ? voterOpen : registration?.canRegister;
        const Icon = kind === 'voter' ? Vote : UserRoundCheck;
        return <article className="el-panel el-access-card" data-moon-reveal="card" key={kind}>
          <div className="el-card-top"><Icon size={25}/><span className={`el-status el-status-${status}`}>{labels[status]}</span></div>
          <h3>{kind === 'voter' ? 'Permiso de votante' : 'Permiso para postular'}</h3>
          <p>{kind === 'voter' ? 'Te permite elegir una candidatura por cada cargo, durante las fechas de votación.' : 'Te permite presentar tu propuesta durante la inscripción. Después, el CEO revisa la candidatura antes de publicarla.'}</p>
          {status === 'none' && <button className="el-button el-button-primary" disabled={working || system.busy || !open} onClick={() => void send(kind)}>Solicitar {kind === 'voter' ? 'permiso para votar' : 'permiso para postular'}</button>}
          {status === 'pending' && <p className="el-field-note"><Clock3 size={16}/>Tu solicitud está en la bandeja del CEO.</p>}
          {status === 'approved' && <p className="el-field-note"><CheckCircle2 size={16}/>{kind === 'voter' ? 'Tu permiso está aprobado. La votación sigue el calendario publicado.' : 'Tu permiso está aprobado. Presenta la candidatura dentro del plazo publicado.'}</p>}
          {status === 'rejected' && <p className="el-field-note">El CEO puede revisar esta decisión desde la gestión de participantes.</p>}
          {status === 'none' && !open && <p className="el-field-note">{kind === 'voter' ? 'Este proceso no admite nuevas solicitudes de voto.' : registration?.label || 'Inscripciones no disponibles.'}</p>}
        </article>;
      })}</div>
      <div className="el-panel el-calendar-summary"><h3>Calendario oficial · Hora de Lima</h3><dl>
        <div><dt>Apertura de postulaciones</dt><dd>{formatDate(election.registrationStartDate || election.createdAt)}</dd></div>
        <div><dt>Cierre de postulaciones</dt><dd>{formatDate(election.registrationEndDate || election.startDate)}</dd></div>
        <div><dt>Inicio de votación</dt><dd>{formatDate(election.startDate)}</dd></div>
        <div><dt>Cierre automático</dt><dd>{formatDate(election.endDate)}</dd></div>
      </dl><p className="el-field-note">El servidor rechaza los votos fuera del plazo, aunque el dispositivo muestre otra hora.</p></div>
    </>}
  </section>;
}

type Decision = { record: ElectoralAccess; kind: 'voter' | 'candidate'; status: 'approved' | 'rejected' };
export function ElectoralAccessManagement({ system, now }: { system: ElectionController; now: number }) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('pending'), [process, setProcess] = useState('all');
  const [decision, setDecision] = useState<Decision | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [working, setWorking] = useState(false);
  const lock = useRef(false);
  const pending = system.accessRequests.filter(item => item.voterStatus === 'pending' || item.candidateStatus === 'pending').length;
  const records = [...system.accessRequests].filter(item => (process === 'all' || process === item.electionId)
    && `${item.displayName} ${item.email} ${item.uid}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))
    && (filter === 'all' || filter === 'pending' && (item.voterStatus === 'pending' || item.candidateStatus === 'pending') || filter === 'voters' && item.voterStatus === 'approved' || filter === 'nonvoters' && item.voterStatus !== 'approved' || filter === 'candidates' && item.candidateStatus === 'approved'))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const confirm = async () => {
    if (!decision || system.busy || lock.current) return;
    lock.current = true; setWorking(true); setError('');
    try {
      await system.reviewAccess(decision.record.id, decision.kind === 'voter' ? { voterStatus: decision.status } : { candidateStatus: decision.status });
      setDecision(null); setNotice('Permiso actualizado. Los votos registrados anteriormente se conservan.');
    } catch (cause) { setError(message(cause)); } finally { lock.current = false; setWorking(false); }
  };
  if (!system.canManage) return null;
  return <section className="el-panel el-access-management" data-moon-reveal="card">
    <div className="el-section-heading"><div><span className="el-kicker">PADRÓN DEL PROCESO</span><h3>Votantes y permisos de postulación</h3><p>Decide quién puede votar y quién puede presentar candidatura. Cada permiso se aprueba por separado.</p></div><span className="el-access-badge"><ShieldCheck size={16}/>{pending} solicitudes pendientes</span></div>
    <div className="el-access-toolbar">
      <label className="el-search" data-moon-field-frame><Search size={18}/><input type="search" aria-label="Buscar participantes" placeholder="Buscar por nombre, correo o cuenta…" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <select aria-label="Filtrar participantes por proceso" value={process} onChange={event => setProcess(event.target.value)}><option value="all">Todos los procesos</option>{system.elections.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select aria-label="Filtrar permisos de participación" value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">Pendientes de revisión</option><option value="voters">Votantes aprobados</option><option value="nonvoters">No votantes</option><option value="candidates">Pueden postular</option><option value="all">Todos los participantes</option></select>
    </div>
    {notice && <p className="el-alert el-alert-success" role="status">{notice}</p>}
    <div className="el-access-review-list">{records.map(record => <article className="el-access-review" key={record.id}>
      <header><div><h4>{record.displayName || 'Participante'}</h4><p>{record.email || 'Cuenta de Discord'} · {system.elections.find(item => item.id === record.electionId)?.name || 'Proceso anterior'}</p><small>Cuenta: {record.uid}</small></div></header>
      <div className="el-access-decisions">{(['voter', 'candidate'] as const).map(kind => {
        const status = kind === 'voter' ? record.voterStatus : record.candidateStatus;
        const requested = kind === 'voter' ? record.requestedVoter : record.requestedCandidate;
        const name = kind === 'voter' ? 'Votante' : 'Postulación';
        const election = system.elections.find(item => item.id === record.electionId);
        const canReview = system.settings.enabled && !system.settingsLoading && !system.settingsError && election?.status === 'active' && election.endDate.getTime() > now
          && (kind === 'voter' || election.startDate.getTime() > now);
        return <div key={kind}><div><strong>{name}</strong><span className={`el-status el-status-${status}`}>{labels[status]}</span></div>{requested && <div className="el-access-actions">
          {status !== 'approved' && <button className="el-button el-button-small el-button-primary" disabled={system.busy || !canReview} onClick={() => { setError(''); setDecision({ record, kind, status: 'approved' }); }}>Aprobar {kind === 'voter' ? 'votante' : 'postulación'}</button>}
          {status !== 'rejected' && <button className="el-button el-button-small" disabled={system.busy || !canReview} onClick={() => { setError(''); setDecision({ record, kind, status: 'rejected' }); }}>{status === 'approved' ? 'Retirar permiso' : 'Rechazar solicitud'}</button>}
        </div>}{requested && !canReview && <p className="el-field-note">{!system.settings.enabled ? 'El sistema electoral está cerrado. Reabre la participación desde Ajustes para revisar permisos.' : kind === 'candidate' && election?.status === 'active' && election.startDate.getTime() <= now ? 'La autorización para postular se conserva al iniciar la votación.' : 'La revisión de permisos terminó para este proceso.'}</p>}</div>;
      })}</div>
    </article>)}</div>
    {!records.length && <div className="el-empty"><UsersRound size={26}/><h3>No hay participantes en este filtro</h3><p>Las solicitudes enviadas con una cuenta autenticada aparecerán aquí.</p></div>}
    {decision && <Dialog title="Confirmar permiso electoral" busy={working || system.busy} onClose={() => setDecision(null)}><div className="el-dialog-body">
      <h3 className="el-confirm-name">{decision.record.displayName}</h3><p>{decision.status === 'approved' ? 'Aprobar' : 'Rechazar o retirar'} el permiso de <strong>{decision.kind === 'voter' ? 'votante' : 'postulación'}</strong> para <strong>{system.elections.find(item => item.id === decision.record.electionId)?.name || 'este proceso'}</strong>.</p>
      <p className="el-field-note">Este cambio sólo afecta al proceso electoral. Los roles del dashboard y los votos anteriores se conservan.</p>
      {error && <p className="el-alert el-alert-error" role="alert">{error}</p>}
      <div className="el-dialog-actions"><button className="el-button" disabled={working || system.busy} onClick={() => setDecision(null)}>Cancelar</button><button className="el-button el-button-primary" disabled={working || system.busy} onClick={() => void confirm()}>{working ? 'Guardando…' : 'Confirmar permiso'}</button></div>
    </div></Dialog>}
  </section>;
}
