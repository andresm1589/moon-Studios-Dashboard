import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Clipboard, Download, LayoutGrid, LoaderCircle, Rows3, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import type { Candidate, Election, ElectionController } from './types';
import { candidateDeletionBlock } from './model';
import { Dialog } from './ElectoralDialog';
import { candidateLabels, downloadCsv, Empty, formatDate, Portrait, today, type DirectorRun } from './directorShared';

// ─── Candidaturas: revisión, filtros, selección múltiple y borrado ──────────
// El borrado sigue la misma regla que Firestore (candidateDeletionBlock): solo
// expedientes sin votos, y nunca una opción aprobada con la votación abierta.

type Props = { system: ElectionController; elections: Election[]; now: number; busy: boolean; run: DirectorRun; error: string; clearError: () => void };
type Status = 'all' | Candidate['status'];
type Sort = 'recent' | 'oldest' | 'name' | 'position' | 'votes';
type Bulk = { kind: 'approve' | 'reject'; items: Candidate[] };
const VISTA = 'moon-electoral-candidaturas-vista';
const DAY = 86400000;

export function DirectorCandidaturas({ system, elections, now, busy, run, error, clearError }: Props) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [search, setSearch] = useState('');
  const [process, setProcess] = useState(() => params.get('proceso') || 'all');
  const [status, setStatus] = useState<Status>('all');
  const [position, setPosition] = useState('all');
  const [department, setDepartment] = useState('all');
  const [period, setPeriod] = useState('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [layout, setLayout] = useState<'cards' | 'table'>(() => { try { return localStorage.getItem(VISTA) === 'table' ? 'table' : 'cards'; } catch { return 'cards'; } });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dossierId, setDossierId] = useState<string | null>(() => params.get('expediente'));
  const [review, setReview] = useState<{ candidate: Candidate; status: 'approved' | 'rejected' } | null>(null);
  const [bulk, setBulk] = useState<Bulk | null>(null);
  const [deleting, setDeleting] = useState<Candidate[] | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { try { localStorage.setItem(VISTA, layout); } catch { /* almacenamiento bloqueado */ } }, [layout]);

  const electionOf = (candidate: Candidate) => elections.find(item => item.id === candidate.electionId);
  const access = (candidate: Candidate) => system.accessRequests.find(item => item.uid === candidate.uid && item.electionId === candidate.electionId);
  const reviewAllowed = (candidate: Candidate) => { const election = electionOf(candidate); return system.settings.enabled && !system.settingsLoading && !system.settingsError && election?.status === 'active' && election.startDate.getTime() > now && candidate.votes === 0; };
  const canApprove = (candidate: Candidate) => reviewAllowed(candidate) && candidate.status !== 'approved' && access(candidate)?.candidateStatus === 'approved';
  const canReject = (candidate: Candidate) => reviewAllowed(candidate) && candidate.status !== 'rejected';
  const deleteBlock = (candidate: Candidate) => candidateDeletionBlock(candidate, electionOf(candidate) ?? null, new Date(now));

  // Los expedientes de procesos en la papelera no se mezclan con los vigentes.
  const trashed = new Set(system.elections.filter(item => item.status === 'deleted').map(item => item.id));
  const pool = system.candidates.filter(item => !trashed.has(item.electionId));
  const text = (value: string) => value.toLocaleLowerCase('es');
  const scope = pool.filter(item => (process === 'all' || item.electionId === process)
    && (position === 'all' || item.position === position)
    && (department === 'all' || item.department === department)
    && (period === 'all' || now - item.createdAt.getTime() <= Number(period) * DAY)
    && (!search || text(`${item.name} ${item.position} ${item.department} ${item.uid} ${item.party ?? ''} ${access(item)?.email ?? ''}`).includes(text(search))));
  const counts = { all: scope.length, pending: scope.filter(item => item.status === 'pending').length, approved: scope.filter(item => item.status === 'approved').length, rejected: scope.filter(item => item.status === 'rejected').length };
  const visible = scope.filter(item => status === 'all' || item.status === status).sort((a, b) => {
    switch (sort) {
      case 'oldest': return a.createdAt.getTime() - b.createdAt.getTime();
      case 'name': return a.name.localeCompare(b.name, 'es');
      case 'position': return a.position.localeCompare(b.position, 'es') || a.name.localeCompare(b.name, 'es');
      case 'votes': return b.votes - a.votes || a.name.localeCompare(b.name, 'es');
      default: return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });
  const positions = [...new Set(pool.filter(item => process === 'all' || item.electionId === process).map(item => item.position))].sort((a, b) => a.localeCompare(b, 'es'));
  const departments = [...new Set(pool.filter(item => process === 'all' || item.electionId === process).map(item => item.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const filtersActive = search !== '' || process !== 'all' || status !== 'all' || position !== 'all' || department !== 'all' || period !== 'all';
  const clearFilters = () => { setSearch(''); setProcess('all'); setStatus('all'); setPosition('all'); setDepartment('all'); setPeriod('all'); };

  const chosen = visible.filter(item => selected.has(item.id));
  const allChosen = visible.length > 0 && chosen.length === visible.length;
  const toggle = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(visible.map(item => item.id)));

  const dossier = pool.find(item => item.id === dossierId) ?? null;
  const dossierIndex = dossier ? visible.findIndex(item => item.id === dossier.id) : -1;

  const exportRows = (items: Candidate[]) => downloadCsv(`candidaturas-${today()}.csv`,
    ['Nombre', 'Cargo', 'Departamento', 'Proceso', 'Estado', 'Votos', 'Lema', 'Agrupación', 'Propuestas', 'Correo', 'Cuenta', 'Presentada', 'Última revisión'],
    items.map(item => [item.name, item.position, item.department, electionOf(item)?.name || item.electionId, candidateLabels[item.status], item.votes, item.slogan ?? '', item.party ?? '', item.proposals.join(' | '), access(item)?.email ?? '', item.uid, formatDate(item.createdAt), item.approvedAt ? formatDate(item.approvedAt) : '']));

  const confirmReview = async () => {
    if (!review) return;
    const target = review;
    if (await run(() => system.reviewCandidate(target.candidate.id, target.status), target.status === 'approved' ? 'Candidatura aprobada: ya aparece entre las opciones de votación.' : 'Candidatura marcada como no aprobada.')) setReview(null);
  };
  const confirmBulk = async () => {
    if (!bulk) return;
    const target = bulk;
    const ok = await run(async () => {
      for (const item of target.items) await system.reviewCandidate(item.id, target.kind === 'approve' ? 'approved' : 'rejected');
    }, target.kind === 'approve' ? `Se aprobaron ${target.items.length} candidaturas.` : `Se marcaron ${target.items.length} candidaturas como no aprobadas.`);
    if (ok) { setBulk(null); setSelected(new Set()); }
  };
  const deletable = (deleting ?? []).filter(item => !deleteBlock(item));
  const blocked = (deleting ?? []).filter(item => deleteBlock(item));
  const needsTyping = deletable.length > 1;
  const confirmDelete = async () => {
    if (!deletable.length) return;
    const ids = deletable.map(item => item.id);
    const ok = await run(async () => { for (const id of ids) await system.deleteCandidate(id); },
      ids.length === 1 ? 'Expediente eliminado. Quedó constancia en la auditoría.' : `Se eliminaron ${ids.length} expedientes. Quedó constancia en la auditoría.`);
    if (ok) {
      setDeleting(null); setConfirmText('');
      setSelected(previous => { const next = new Set(previous); ids.forEach(id => next.delete(id)); return next; });
      if (dossierId && ids.includes(dossierId)) setDossierId(null);
    }
  };
  const openDelete = (items: Candidate[]) => { clearError(); setConfirmText(''); setDeleting(items); };

  const statusChip = (key: Status, label: string, n: number) => <button type="button" className={`ed-chip${status === key ? ' is-active' : ''}`} aria-pressed={status === key} onClick={() => setStatus(key)}>{label}<strong>{n}</strong></button>;
  const checkbox = (candidate: Candidate) => <input type="checkbox" className="ed-check" checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} aria-label={`Seleccionar a ${candidate.name}`} />;
  const card = (candidate: Candidate) => <article className={`ed-candidate${selected.has(candidate.id) ? ' is-selected' : ''}`} key={candidate.id} data-moon-reveal="card">
    <div className="ed-person">{checkbox(candidate)}<Portrait candidate={candidate} /><div><h3>{candidate.name}</h3><p>{candidate.department || 'Sin departamento'}</p></div><span className={`el-status el-status-${candidate.status}`}>{candidateLabels[candidate.status]}</span></div>
    <span className="el-kicker">{candidate.position}</span>
    <p>{electionOf(candidate)?.name || 'Proceso histórico'}</p>
    <p className="ed-excerpt">{candidate.slogan || candidate.proposals[0] || 'Consulta la información registrada.'}</p>
    <div className="ed-card-foot"><span>{candidate.proposals.length} propuestas · {candidate.votes} votos · {formatDate(candidate.createdAt)}</span><div className="ed-card-actions">
      <button type="button" className="el-icon-button ed-danger-icon" disabled={busy || !!deleteBlock(candidate)} title={deleteBlock(candidate) ?? 'Eliminar expediente'} aria-label={`Eliminar el expediente de ${candidate.name}`} onClick={() => openDelete([candidate])}><Trash2 size={16} /></button>
      <button type="button" className="el-button" onClick={() => setDossierId(candidate.id)}>Ver expediente<ArrowUpRight size={16} /></button>
    </div></div>
  </article>;

  return <>
    <div className="ed-section-intro"><div><h2>Expedientes de candidaturas</h2><p>Revisa identidad, propuestas y permiso de postulación antes de publicar una candidatura.</p></div>
      <div className="ed-intro-tools"><span className="el-result-count">{visible.length} de {pool.length} expedientes</span>
        <div className="ed-segmented" role="group" aria-label="Forma de ver los expedientes"><button type="button" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}><LayoutGrid size={15} />Tarjetas</button><button type="button" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}><Rows3 size={15} />Tabla</button></div>
        <button type="button" className="el-button" disabled={!visible.length} onClick={() => exportRows(visible)}><Download size={16} />Exportar CSV</button>
      </div>
    </div>

    <div className="ed-chips" role="group" aria-label="Filtrar por estado">
      {statusChip('all', 'Todas', counts.all)}{statusChip('pending', 'Por revisar', counts.pending)}{statusChip('approved', 'Aprobadas', counts.approved)}{statusChip('rejected', 'No aprobadas', counts.rejected)}
    </div>

    <div className="ed-filters">
      <label className="el-search ed-filters-search" data-moon-field-frame><Search size={19} /><input type="search" aria-label="Buscar candidaturas" placeholder="Buscar nombre, cargo, correo o cuenta…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select aria-label="Proceso" value={process} onChange={event => { setProcess(event.target.value); setPosition('all'); setDepartment('all'); }}><option value="all">Proceso: todos</option>{elections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Cargo" value={position} onChange={event => setPosition(event.target.value)}><option value="all">Cargo: todos</option>{positions.map(item => <option key={item}>{item}</option>)}</select>
      <select aria-label="Departamento" value={department} onChange={event => setDepartment(event.target.value)}><option value="all">Área: todas</option>{departments.map(item => <option key={item}>{item}</option>)}</select>
      <select aria-label="Periodo de presentación" value={period} onChange={event => setPeriod(event.target.value)}><option value="all">Fecha: todas</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></select>
      <select aria-label="Ordenar" value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="recent">Más recientes</option><option value="oldest">Más antiguas</option><option value="name">Nombre (A–Z)</option><option value="position">Cargo</option><option value="votes">Más votos</option></select>
      {filtersActive && <button type="button" className="el-text-button ed-clear" onClick={clearFilters}><X size={15} />Limpiar filtros</button>}
    </div>

    {chosen.length > 0 && <div className="ed-bulkbar" role="region" aria-label="Acciones con la selección">
      <span><strong>{chosen.length}</strong> seleccionada{chosen.length === 1 ? '' : 's'}</span>
      <div>
        <button type="button" className="el-button el-button-small" disabled={busy || !chosen.some(canApprove)} onClick={() => { clearError(); setBulk({ kind: 'approve', items: chosen.filter(canApprove) }); }}><Check size={15} />Aprobar</button>
        <button type="button" className="el-button el-button-small" disabled={busy || !chosen.some(canReject)} onClick={() => { clearError(); setBulk({ kind: 'reject', items: chosen.filter(canReject) }); }}>No aprobar</button>
        <button type="button" className="el-button el-button-small" onClick={() => exportRows(chosen)}><Download size={15} />Exportar</button>
        <button type="button" className="el-button el-button-small ed-danger" disabled={busy} onClick={() => openDelete(chosen)}><Trash2 size={15} />Eliminar</button>
        <button type="button" className="el-text-button" onClick={() => setSelected(new Set())}>Cancelar</button>
      </div>
    </div>}

    {visible.length > 0 && <label className="ed-select-all"><input type="checkbox" className="ed-check" checked={allChosen} ref={node => { if (node) node.indeterminate = chosen.length > 0 && !allChosen; }} onChange={toggleAll} />Seleccionar los {visible.length} expedientes visibles</label>}

    {layout === 'cards'
      ? <div className="ed-candidate-grid">{visible.map(card)}</div>
      : visible.length > 0 && <div className="ed-table-wrap"><table className="ed-table">
        <thead><tr><th scope="col" className="ed-table-check"><span className="ed-sr">Seleccionar</span></th><th scope="col">Persona</th><th scope="col">Cargo</th><th scope="col">Proceso</th><th scope="col">Estado</th><th scope="col" className="ed-num">Votos</th><th scope="col">Presentada</th><th scope="col"><span className="ed-sr">Acciones</span></th></tr></thead>
        <tbody>{visible.map(candidate => <tr key={candidate.id} className={selected.has(candidate.id) ? 'is-selected' : undefined}>
          <td className="ed-table-check">{checkbox(candidate)}</td>
          <td><div className="ed-table-person"><Portrait candidate={candidate} /><div><strong>{candidate.name}</strong><span>{candidate.department || 'Sin departamento'}</span></div></div></td>
          <td>{candidate.position}</td>
          <td className="ed-muted">{electionOf(candidate)?.name || 'Proceso histórico'}</td>
          <td><span className={`el-status el-status-${candidate.status}`}>{candidateLabels[candidate.status]}</span></td>
          <td className="ed-num">{candidate.votes}</td>
          <td className="ed-muted">{formatDate(candidate.createdAt)}</td>
          <td><div className="ed-row-actions"><button type="button" className="el-icon-button ed-danger-icon" disabled={busy || !!deleteBlock(candidate)} title={deleteBlock(candidate) ?? 'Eliminar expediente'} aria-label={`Eliminar el expediente de ${candidate.name}`} onClick={() => openDelete([candidate])}><Trash2 size={15} /></button><button type="button" className="el-button el-button-small" onClick={() => setDossierId(candidate.id)}>Ver</button></div></td>
        </tr>)}</tbody>
      </table></div>}
    {!visible.length && <Empty title={filtersActive ? 'Ningún expediente coincide con los filtros' : 'Todavía no hay expedientes'}>{filtersActive ? 'Prueba con otros filtros o límpialos para ver todas las candidaturas.' : 'Las candidaturas enviadas por participantes autorizados aparecerán aquí.'}</Empty>}

    {dossier && <Dialog title="Expediente de candidatura" busy={busy} onClose={() => setDossierId(null)}><div className="el-dialog-body ed-dossier">
      <div className="ed-dossier-nav"><button type="button" className="el-icon-button" disabled={dossierIndex <= 0} aria-label="Expediente anterior" onClick={() => setDossierId(visible[dossierIndex - 1].id)}><ChevronLeft size={18} /></button><span>{dossierIndex >= 0 ? `${dossierIndex + 1} de ${visible.length}` : 'Fuera de los filtros actuales'}</span><button type="button" className="el-icon-button" disabled={dossierIndex < 0 || dossierIndex >= visible.length - 1} aria-label="Expediente siguiente" onClick={() => setDossierId(visible[dossierIndex + 1].id)}><ChevronRight size={18} /></button></div>
      <div className="ed-dossier-header"><Portrait key={dossier.id} candidate={dossier} large /><div><span className={`el-status el-status-${dossier.status}`}>{candidateLabels[dossier.status]}</span><h3>{dossier.name}</h3><p>{dossier.position} · {dossier.department}</p></div></div>
      <dl className="ed-dossier-details">
        <div><dt>Proceso</dt><dd>{electionOf(dossier)?.name || dossier.electionId}</dd></div>
        <div><dt>Correo de la solicitud</dt><dd>{access(dossier)?.email || 'No registrado'}</dd></div>
        <div><dt>Cuenta participante</dt><dd className="ed-copy">{dossier.uid}<button type="button" className="el-text-button" onClick={async () => { try { await navigator.clipboard.writeText(dossier.uid); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } }}><Clipboard size={14} />{copied ? 'Copiada' : 'Copiar'}</button></dd></div>
        <div><dt>Presentación</dt><dd>{formatDate(dossier.createdAt)}</dd></div>
        <div><dt>Permiso para postular</dt><dd>{access(dossier)?.candidateStatus === 'approved' ? 'Aprobado por el CEO' : 'Sin aprobación vigente'}</dd></div>
        <div><dt>Agrupación</dt><dd>{dossier.party || 'No registrada'}</dd></div>
        {dossier.approvedBy && <div><dt>Última revisión</dt><dd>{formatDate(dossier.approvedAt)} · {dossier.approvedBy}</dd></div>}
        <div><dt>Votos acumulados</dt><dd>{dossier.votes}</dd></div>
      </dl>
      {dossier.slogan && <blockquote>{dossier.slogan}</blockquote>}
      <div><span className="el-kicker">PROPUESTAS COMPLETAS</span><ol className="ed-full-proposals">{dossier.proposals.map((item, index) => <li key={index}>{item}</li>)}</ol></div>
      <div><span className="el-kicker">DOCUMENTOS REGISTRADOS</span>{dossier.documents?.length ? <ul className="ed-documents">{dossier.documents.map((url, index) => <li key={index}><a href={url} target="_blank" rel="noopener noreferrer">Abrir documento {index + 1}<ArrowUpRight size={15} /></a></li>)}</ul> : <p className="el-muted">Esta candidatura no adjuntó documentos.</p>}</div>
      {!reviewAllowed(dossier) && <p className="el-field-note">El período de revisión terminó o ya hay votos. El expediente se conserva para consulta.</p>}
      <div className="el-dialog-actions ed-dossier-actions">
        <button type="button" className="el-button ed-danger" disabled={busy || !!deleteBlock(dossier)} title={deleteBlock(dossier) ?? undefined} onClick={() => openDelete([dossier])}><Trash2 size={16} />Eliminar expediente</button>
        <span className="ed-spacer" />
        {canReject(dossier) && <button type="button" className="el-button" disabled={busy} onClick={() => { clearError(); setReview({ candidate: dossier, status: 'rejected' }); }}>{dossier.status === 'approved' ? 'Retirar candidatura' : 'No aprobar'}</button>}
        {reviewAllowed(dossier) && dossier.status !== 'approved' && <button type="button" className="el-button el-button-primary" disabled={busy || !canApprove(dossier)} title={canApprove(dossier) ? undefined : 'Primero aprueba su permiso para postular en Participantes.'} onClick={() => { clearError(); setReview({ candidate: dossier, status: 'approved' }); }}><Check size={17} />Aprobar candidatura</button>}
      </div>
      {deleteBlock(dossier) && <p className="el-field-note">{deleteBlock(dossier)}</p>}
    </div></Dialog>}

    {review && <Dialog title="Confirmar revisión" busy={busy} onClose={() => { setReview(null); clearError(); }}><div className="el-dialog-body">
      <h3 className="el-confirm-name">{review.candidate.name}</h3>
      <p className="el-confirm-description">{review.status === 'approved' ? 'La candidatura aparecerá entre las opciones de votación del proceso.' : 'La candidatura no aparecerá como opción para votar. Su expediente se conserva.'}</p>
      {error && <p className="el-alert el-alert-error" role="alert">{error}</p>}
      <div className="el-dialog-actions"><button type="button" className="el-button" disabled={busy} onClick={() => { setReview(null); clearError(); }}>Cancelar</button><button type="button" className="el-button el-button-primary" disabled={busy} onClick={() => void confirmReview()}>{busy ? <LoaderCircle className="el-spin" size={17} /> : <ShieldCheck size={17} />}Confirmar</button></div>
    </div></Dialog>}

    {bulk && <Dialog title={bulk.kind === 'approve' ? 'Aprobar candidaturas' : 'No aprobar candidaturas'} busy={busy} onClose={() => { setBulk(null); clearError(); }}><div className="el-dialog-body">
      <p className="el-confirm-description">{bulk.kind === 'approve' ? `Se aprobarán ${bulk.items.length} de las ${chosen.length} seleccionadas: las que están en plazo de revisión y tienen su permiso para postular aprobado.` : `Se marcarán ${bulk.items.length} de las ${chosen.length} seleccionadas como no aprobadas. Sus expedientes se conservan.`}</p>
      <ul className="ed-name-list">{bulk.items.slice(0, 8).map(item => <li key={item.id}>{item.name}<span>{item.position}</span></li>)}{bulk.items.length > 8 && <li className="ed-muted">y {bulk.items.length - 8} más</li>}</ul>
      {error && <p className="el-alert el-alert-error" role="alert">{error}</p>}
      <div className="el-dialog-actions"><button type="button" className="el-button" disabled={busy} onClick={() => { setBulk(null); clearError(); }}>Cancelar</button><button type="button" className="el-button el-button-primary" disabled={busy || !bulk.items.length} onClick={() => void confirmBulk()}>{busy ? <LoaderCircle className="el-spin" size={17} /> : <ShieldCheck size={17} />}{bulk.kind === 'approve' ? 'Aprobar' : 'No aprobar'} {bulk.items.length}</button></div>
    </div></Dialog>}

    {deleting && <Dialog title={deleting.length === 1 ? 'Eliminar expediente' : 'Eliminar expedientes'} busy={busy} onClose={() => { setDeleting(null); clearError(); }}><div className="el-dialog-body">
      {deletable.length > 0 ? <>
        <p className="el-confirm-description">Se borrará{deletable.length === 1 ? ' el expediente' : `n ${deletable.length} expedientes`} con sus datos y propuestas. <strong>Esta acción no se puede deshacer.</strong> Quedará constancia en la auditoría.</p>
        <ul className="ed-name-list">{deletable.slice(0, 8).map(item => <li key={item.id}>{item.name}<span>{item.position} · {candidateLabels[item.status]}</span></li>)}{deletable.length > 8 && <li className="ed-muted">y {deletable.length - 8} más</li>}</ul>
      </> : <p className="el-confirm-description">Ninguno de los expedientes seleccionados se puede eliminar.</p>}
      {blocked.length > 0 && <div className="ed-blocked"><span className="el-kicker">SE CONSERVAN ({blocked.length})</span><ul>{blocked.slice(0, 5).map(item => <li key={item.id}><strong>{item.name}</strong> — {deleteBlock(item)}</li>)}{blocked.length > 5 && <li>y {blocked.length - 5} más</li>}</ul></div>}
      {needsTyping && <label className="el-form ed-type-confirm">Escribe <strong>ELIMINAR</strong> para confirmar<input value={confirmText} onChange={event => setConfirmText(event.target.value)} autoComplete="off" spellCheck={false} /></label>}
      {error && <p className="el-alert el-alert-error" role="alert">{error}</p>}
      <div className="el-dialog-actions"><button type="button" className="el-button" disabled={busy} onClick={() => { setDeleting(null); clearError(); }}>Cancelar</button><button type="button" className="el-button ed-danger-solid" disabled={busy || !deletable.length || (needsTyping && confirmText.trim().toUpperCase() !== 'ELIMINAR')} onClick={() => void confirmDelete()}>{busy ? <LoaderCircle className="el-spin" size={17} /> : <Trash2 size={17} />}Eliminar {deletable.length > 1 ? deletable.length : ''}</button></div>
    </div></Dialog>}
  </>;
}
