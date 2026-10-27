import { useState, type FormEvent } from 'react';
import { CalendarClock, Eye, EyeOff, FilePenLine, LoaderCircle, Pin, PinOff, Plus, Search, Send } from 'lucide-react';
import type { AnnouncementInput, Election, ElectionController, ElectoralAnnouncement } from './types';
import { Dialog } from './ElectoralDialog';
import { electoralInputDate, parseElectoralInput } from './ProcessEditor';
import { Empty, formatDate, type DirectorRun } from './directorShared';

// ─── Comunicados: avisos del CEO para participantes ─────────────────────────
// Se publican con un periodo de vigencia; para conservar el historial se
// retiran en lugar de borrarse. Un aviso puede ser general o de un proceso.

type Props = { system: ElectionController; elections: Election[]; now: number; busy: boolean; run: DirectorRun; error: string; clearError: () => void };
type Phase = 'draft' | 'scheduled' | 'live' | 'expired' | 'withdrawn';
const phaseLabels: Record<Phase, string> = { draft: 'Borrador', scheduled: 'Programado', live: 'Vigente', expired: 'Vencido', withdrawn: 'Retirado' };

const phaseOf = (item: ElectoralAnnouncement, now: number): Phase => {
  if (item.status === 'draft') return 'draft';
  if (item.status === 'withdrawn') return 'withdrawn';
  if (item.startsAt.getTime() > now) return 'scheduled';
  return item.endsAt.getTime() <= now ? 'expired' : 'live';
};
const inputOf = (item: ElectoralAnnouncement): AnnouncementInput => ({ title: item.title, body: item.body, status: item.status, electionId: item.electionId, pinned: item.pinned, startsAt: item.startsAt, endsAt: item.endsAt });

export function DirectorComunicados({ system, elections, now, busy, run, error, clearError }: Props) {
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState<'all' | Phase>('all');
  const [editor, setEditor] = useState<ElectoralAnnouncement | 'new' | null>(null);
  const items = system.announcements;
  const counts = Object.fromEntries((Object.keys(phaseLabels) as Phase[]).map(key => [key, items.filter(item => phaseOf(item, now) === key).length])) as Record<Phase, number>;
  const visible = items.filter(item => (phase === 'all' || phaseOf(item, now) === phase) && `${item.title} ${item.body}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const electionName = (id: string) => id ? elections.find(item => item.id === id)?.name || 'Proceso no disponible' : 'Comunicado general';

  const quick = (item: ElectoralAnnouncement, patch: Partial<AnnouncementInput>, success: string) => run(() => system.updateAnnouncement(item.id, { ...inputOf(item), ...patch }), success);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const values = new FormData(event.currentTarget), current = editor;
    const input: AnnouncementInput = {
      title: String(values.get('title') || '').trim(),
      body: String(values.get('body') || '').trim(),
      electionId: String(values.get('electionId') || ''),
      pinned: values.get('pinned') === 'on',
      status: values.get('status') === 'published' ? 'published' : 'draft',
      startsAt: parseElectoralInput(String(values.get('startsAt') || '')),
      endsAt: parseElectoralInput(String(values.get('endsAt') || '')),
    };
    const ok = await run(() => current === 'new' ? system.createAnnouncement(input) : system.updateAnnouncement(current.id, input),
      input.status === 'published' ? 'Comunicado publicado. Los participantes lo verán durante su vigencia.' : 'Comunicado guardado como borrador.');
    if (ok) setEditor(null);
  };

  const chip = (key: 'all' | Phase, label: string, n: number) => <button type="button" className={`ed-chip${phase === key ? ' is-active' : ''}`} aria-pressed={phase === key} onClick={() => setPhase(key)}>{label}<strong>{n}</strong></button>;
  const defaults = editor && editor !== 'new' ? editor : null;

  return <>
    <div className="ed-section-intro"><div><h2>Comunicados electorales</h2><p>Avisos para participantes con fecha de inicio y de cierre. Se retiran en lugar de borrarse, así queda el historial.</p></div>
      <button type="button" className="el-button el-button-primary" disabled={busy} onClick={() => { clearError(); setEditor('new'); }}><Plus size={17} />Nuevo comunicado</button></div>
    <div className="ed-chips" role="group" aria-label="Filtrar comunicados">
      {chip('all', 'Todos', items.length)}{chip('live', 'Vigentes', counts.live)}{chip('scheduled', 'Programados', counts.scheduled)}{chip('draft', 'Borradores', counts.draft)}{chip('expired', 'Vencidos', counts.expired)}{chip('withdrawn', 'Retirados', counts.withdrawn)}
    </div>
    <div className="ed-filters ed-filters-compact"><label className="el-search ed-filters-search" data-moon-field-frame><Search size={19} /><input type="search" aria-label="Buscar comunicados" placeholder="Buscar por título o contenido…" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {system.announcementsError && <p className="el-alert el-alert-error" role="alert">{system.announcementsError}</p>}
    {system.announcementsLoading ? <div className="el-loading" role="status"><LoaderCircle className="el-spin" />Cargando comunicados…</div>
      : visible.length ? <div className="ed-notices">{visible.map(item => {
        const current = phaseOf(item, now);
        return <article key={item.id} className={`ed-notice${item.pinned ? ' is-pinned' : ''}`} data-moon-reveal="card">
          <div className="ed-notice-head"><span className={`el-status ed-phase-${current}`}><span />{phaseLabels[current]}</span>{item.pinned && <span className="ed-pin"><Pin size={13} />Destacado</span>}<span className="ed-muted">{electionName(item.electionId)}</span></div>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <footer>
            <span className="ed-muted"><CalendarClock size={14} />{formatDate(item.startsAt)} — {formatDate(item.endsAt)}</span>
            <div className="ed-row-actions">
              <button type="button" className="el-icon-button" disabled={busy} aria-label={item.pinned ? 'Quitar de destacados' : 'Destacar'} title={item.pinned ? 'Quitar de destacados' : 'Destacar'} onClick={() => void quick(item, { pinned: !item.pinned }, item.pinned ? 'Comunicado sin destacar.' : 'Comunicado destacado.')}>{item.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>
              <button type="button" className="el-icon-button" disabled={busy} aria-label="Editar comunicado" title="Editar" onClick={() => { clearError(); setEditor(item); }}><FilePenLine size={16} /></button>
              {item.status === 'published'
                ? <button type="button" className="el-button el-button-small" disabled={busy} onClick={() => void quick(item, { status: 'withdrawn' }, 'Comunicado retirado. Ya no lo ven los participantes.')}><EyeOff size={15} />Retirar</button>
                : <button type="button" className="el-button el-button-small el-button-primary" disabled={busy} onClick={() => void quick(item, { status: 'published' }, 'Comunicado publicado.')}><Eye size={15} />Publicar</button>}
            </div>
          </footer>
        </article>;
      })}</div>
      : <Empty title={items.length ? 'Ningún comunicado en esta vista' : 'Aún no hay comunicados'}>{items.length ? 'Cambia el filtro o la búsqueda.' : 'Publica avisos de calendario, resultados o cambios para que los participantes los vean en su portal.'}</Empty>}

    {editor && <Dialog title={editor === 'new' ? 'Nuevo comunicado' : 'Editar comunicado'} busy={busy} onClose={() => { setEditor(null); clearError(); }}>
      <form className="el-form el-dialog-body" onSubmit={save}>
        <label>Título<input name="title" required minLength={3} maxLength={160} defaultValue={defaults?.title ?? ''} placeholder="Ej. Calendario de votación confirmado" /></label>
        <label>Contenido<textarea name="body" required maxLength={4000} rows={5} defaultValue={defaults?.body ?? ''} placeholder="Lo que los participantes deben saber." /></label>
        <div className="el-form-grid">
          <label>Proceso<select name="electionId" defaultValue={defaults?.electionId ?? ''}><option value="">Comunicado general</option>{elections.filter(item => item.status !== 'deleted').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>Un comunicado publicado no puede apuntar a un proceso en preparación.</small></label>
          <label>Estado<select name="status" defaultValue={defaults?.status === 'published' ? 'published' : 'draft'}><option value="draft">Borrador</option><option value="published">Publicado</option></select></label>
        </div>
        <div className="el-form-grid">
          <label>Visible desde · Hora de Lima<input type="datetime-local" name="startsAt" required defaultValue={electoralInputDate(defaults?.startsAt ?? new Date(now))} /></label>
          <label>Visible hasta · Hora de Lima<input type="datetime-local" name="endsAt" required defaultValue={electoralInputDate(defaults?.endsAt ?? new Date(now + 7 * 86400000))} /></label>
        </div>
        <label className="ed-inline-check"><input type="checkbox" name="pinned" className="ed-check" defaultChecked={defaults?.pinned ?? false} />Destacar al inicio del portal</label>
        {error && <p className="el-alert el-alert-error" role="alert">{error}</p>}
        <div className="el-dialog-actions"><button type="button" className="el-button" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button type="submit" className="el-button el-button-primary" disabled={busy}>{busy ? <LoaderCircle className="el-spin" size={17} /> : <Send size={17} />}Guardar comunicado</button></div>
      </form>
    </Dialog>}
  </>;
}
