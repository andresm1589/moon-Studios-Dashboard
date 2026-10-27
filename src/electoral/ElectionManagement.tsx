import { useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, FilePenLine, Flag, ShieldCheck, UsersRound } from 'lucide-react';
import type { Candidate, Election, ElectionController, ElectionStatus } from './types';
import { getElectionEditMode, getElectionWindow } from './model';
import { ElectoralAccessManagement } from './ElectoralAccessPanel';

const date = (value: Date) => Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Fecha por definir';
export function ElectionManagement({ system, now, onEdit, onStatus, onReview, onResults }: { system: ElectionController; now: number; onEdit: (election: Election) => void; onStatus: (election: Election, status: ElectionStatus) => void; onReview: (candidate: Candidate, status: 'approved' | 'rejected') => void; onResults: (election: Election) => void }) {
  const [tab, setTab] = useState('processes'), [reviewFilter, setReviewFilter] = useState('pending');
  const pendingAccess = system.accessRequests.filter(item => item.voterStatus === 'pending' || item.candidateStatus === 'pending').length;
  const pendingCandidates = system.candidates.filter(item => item.status === 'pending').length;
  if (!system.canManage) return <div className="el-empty"><ShieldCheck size={28}/><h3>Esta sección está reservada al CEO</h3><p>Puedes consultar tus permisos y solicitar participación desde Mi acceso.</p></div>;
  return <section className="el-view">
    <div className="el-section-heading"><div><span className="el-kicker">DIRECCIÓN / CONTROL ELECTORAL</span><h2>Procesos claros. Participación aprobada.</h2><p>El CEO administra el calendario, autoriza a los votantes y revisa las candidaturas.</p></div><span className="el-access-badge"><ShieldCheck size={16}/>Gestión del CEO</span></div>
    <div className="el-management-summary">
      <article><Flag size={20}/><strong>{system.elections.length}</strong><span>Procesos electorales</span></article>
      <article><UsersRound size={20}/><strong>{pendingAccess}</strong><span>Solicitudes de acceso pendientes</span></article>
      <article><Clock3 size={20}/><strong>{pendingCandidates}</strong><span>Candidaturas por revisar</span></article>
    </div>
    <div className="el-management-tabs" role="group" aria-label="Herramientas del CEO">{[['processes', 'Procesos y calendario'], ['people', 'Votantes y permisos'], ['candidates', 'Revisar candidaturas']].map(([id, name]) => <button className="el-button" aria-pressed={tab === id} onClick={() => setTab(id)} key={id}>{name}</button>)}</div>
    {tab === 'people' && <ElectoralAccessManagement system={system} now={now}/>}
    {tab === 'processes' && <section className="el-panel" data-moon-reveal="card"><div className="el-panel-heading"><Flag size={21}/><div><h3>Calendario y edición de procesos</h3><p>Publicar abre la convocatoria. La votación comienza y termina automáticamente en las fechas indicadas.</p></div></div>
      <div className="el-management-processes">{system.elections.map(election => {
        const phase = getElectionWindow(election, new Date(now));
        const editMode = getElectionEditMode(election, new Date(now));
        return <article key={election.id}><div><span className={`el-status el-status-${phase.state}`}><span/>{phase.label}</span><h4>{election.name}</h4><p>Votación: {date(election.startDate)} — {date(election.endDate)} · Lima</p>
          <p>Postulaciones: {date(election.registrationStartDate || election.createdAt)} — {date(election.registrationEndDate || election.startDate)}</p>
          <p className="el-field-note">{election.status === 'draft' ? 'Privado: sólo visible para el CEO hasta publicar la convocatoria.' : phase.state === 'closed' ? 'El plazo terminó. No se admiten más votos.' : 'Los cargos publicados se conservan. Todos los votantes requieren aprobación.'}</p>
        </div><div className="el-management-actions">
          {editMode !== 'none' && <button className="el-button el-button-small" disabled={system.busy} onClick={() => onEdit(election)}><FilePenLine size={15}/>{editMode === 'details' ? 'Editar información' : 'Editar proceso'}</button>}
          {election.status === 'draft' && <><button className="el-button el-button-small el-button-primary" disabled={system.busy} onClick={() => onStatus(election, 'active')}>Publicar convocatoria<ArrowUpRight size={15}/></button><button className="el-button el-button-small" disabled={system.busy} onClick={() => onStatus(election, 'archived')}>Archivar preparación</button></>}
          {election.status === 'active' && <button className="el-button el-button-small" disabled={system.busy} onClick={() => onStatus(election, 'closed')}>{phase.state === 'closed' ? 'Confirmar cierre' : 'Cerrar anticipadamente'}</button>}
          {election.status === 'closed' && <button className="el-button el-button-small" disabled={system.busy} onClick={() => onStatus(election, 'archived')}>Archivar proceso</button>}
          <button className="el-icon-button" aria-label={`Ver resultados de ${election.name}`} onClick={() => onResults(election)}><ArrowUpRight size={18}/></button>
        </div></article>;
      })}</div>{!system.elections.length && <div className="el-empty"><Flag size={26}/><h3>Crea la primera convocatoria</h3><p>Usa Nuevo proceso para definir las fechas, los cargos y las condiciones de participación.</p></div>}
    </section>}
    {tab === 'candidates' && <section className="el-panel" data-moon-reveal="card"><div className="el-section-heading"><div><h3>Revisión de candidaturas</h3><p>El permiso para postular permite enviar una propuesta. Esta revisión decide si aparece en la votación.</p></div><select aria-label="Filtrar candidaturas por revisión" value={reviewFilter} onChange={event => setReviewFilter(event.target.value)}><option value="pending">Pendientes</option><option value="approved">Aprobadas</option><option value="rejected">No aprobadas</option><option value="all">Todas</option></select></div>
      <div className="el-review-grid">{system.candidates.filter(item => reviewFilter === 'all' || item.status === reviewFilter).map(candidate => {
        const election = system.elections.find(item => item.id === candidate.electionId);
        const canReview = election?.status === 'active' && election.startDate.getTime() > now && candidate.votes === 0;
        return <article className="el-review-card" key={candidate.id}><span className={`el-status el-status-${candidate.status}`}>{candidate.status === 'pending' ? 'Pendiente del CEO' : candidate.status === 'approved' ? 'Aprobada para votar' : 'No aprobada'}</span><h4>{candidate.name}</h4><p>{candidate.position} · {candidate.department}</p><small>{election?.name || 'Convocatoria anterior'}</small><ul>{candidate.proposals.map((proposal, index) => <li key={index}>{proposal}</li>)}</ul>
          {canReview ? <div className="el-review-actions">
            {candidate.status !== 'rejected' && <button className="el-button el-button-small" disabled={system.busy} onClick={() => onReview(candidate, 'rejected')}>{candidate.status === 'approved' ? 'Retirar candidatura' : 'Rechazar candidatura'}</button>}
            {candidate.status !== 'approved' && <button className="el-button el-button-small el-button-primary" disabled={system.busy} onClick={() => onReview(candidate, 'approved')}><CheckCircle2 size={15}/>Aprobar candidatura</button>}
          </div> : <p className="el-field-note">{election ? 'La revisión está cerrada. Las candidaturas se conservan al iniciar la votación.' : 'El proceso original ya no está disponible. Se conserva este registro histórico.'}</p>}
        </article>;
      })}</div>{!system.candidates.some(item => reviewFilter === 'all' || item.status === reviewFilter) && <div className="el-empty"><CheckCircle2 size={26}/><h3>Sin candidaturas en este estado</h3><p>Las propuestas enviadas por participantes autorizados aparecerán aquí para revisión.</p></div>}
    </section>}
  </section>;
}
