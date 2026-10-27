import { useRef, useState, type FormEvent } from 'react';
import { Check, Clock3, LoaderCircle } from 'lucide-react';
import type { Election, ElectionInput } from './types';
import { getElectionEditMode } from './model';
import { Dialog } from './ElectoralDialog';

export function electoralInputDate(value: Date | undefined): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function parseElectoralInput(value: string): Date {
  const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(`${value}-05:00`) : new Date(NaN);
  return electoralInputDate(date) === value ? date : new Date(NaN);
}

export function ProcessEditor({ election, busy, onClose, onSubmit }: { election: Election | null; busy: boolean; onClose: () => void; onSubmit: (input: ElectionInput) => Promise<void> }) {
  const [error, setError] = useState('');
  const lock = useRef(false);
  const mode = election ? getElectionEditMode(election, new Date()) : 'full';
  const scheduleLocked = mode === 'details' || mode === 'none';
  const structureLocked = mode !== 'full';
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || lock.current || mode === 'none') return;
    const values = new FormData(event.currentTarget);
    const lines = (key: string) => String(values.get(key) || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    const input: ElectionInput = {
      name: String(values.get('name') || '').trim(), description: String(values.get('description') || '').trim(),
      positions: structureLocked ? election!.positions : lines('positions'),
      departments: structureLocked ? election!.departments : lines('departments'),
      startDate: scheduleLocked ? election!.startDate : parseElectoralInput(String(values.get('startDate'))),
      endDate: scheduleLocked ? election!.endDate : parseElectoralInput(String(values.get('endDate'))),
      registrationStartDate: scheduleLocked ? election!.registrationStartDate : parseElectoralInput(String(values.get('registrationStartDate'))),
      registrationEndDate: scheduleLocked ? election!.registrationEndDate : parseElectoralInput(String(values.get('registrationEndDate'))),
    };
    if (!input.positions.length) { setError('Agrega al menos un cargo.'); return; }
    lock.current = true; setError('');
    try { await onSubmit(input); } catch (issue) { setError(issue instanceof Error ? issue.message : 'No se pudo guardar. Inténtalo de nuevo.'); }
    finally { lock.current = false; }
  };
  return <Dialog title={election ? 'Editar proceso electoral' : 'Crear proceso electoral'} onClose={onClose} busy={busy}>
    <form className="el-form el-dialog-body" onSubmit={handleSubmit}>
      <p className="el-muted">{!election || mode === 'full' ? 'En preparación: sólo el CEO ve el proceso. Publica la convocatoria cuando el calendario y los cargos estén listos.' : mode === 'schedule' ? 'Puedes corregir la información y el calendario antes de iniciar la votación. Los cargos publicados se conservan.' : 'La votación ya comenzó. Puedes corregir el nombre y la descripción; el calendario y los cargos se conservan.'}</p>
      <label>Nombre del proceso<input name="name" autoFocus required minLength={3} maxLength={160} defaultValue={election?.name} /></label>
      <label>Descripción<textarea name="description" maxLength={3000} rows={3} defaultValue={election?.description} /></label>
      <div className="el-schedule-note"><Clock3 size={18}/><div><strong>Hora de Lima · UTC−5</strong><p>La apertura y el cierre se aplican automáticamente. Todas las fechas usan la hora de Lima, independientemente del dispositivo.</p></div></div>
      <fieldset disabled={scheduleLocked} className="el-fieldset"><legend>01 · Inscripción de candidatos</legend><div className="el-form-grid">
        <label>Apertura de postulaciones<input name="registrationStartDate" type="datetime-local" required defaultValue={electoralInputDate(election?.registrationStartDate || election?.createdAt || new Date())}/></label>
        <label>Cierre de postulaciones<input name="registrationEndDate" type="datetime-local" required defaultValue={electoralInputDate(election?.registrationEndDate || election?.startDate)}/></label>
      </div></fieldset>
      <fieldset disabled={scheduleLocked} className="el-fieldset"><legend>02 · Votación</legend><div className="el-form-grid">
        <label>Inicio de votación<input name="startDate" type="datetime-local" required defaultValue={electoralInputDate(election?.startDate)}/></label>
        <label>Cierre de votación<input name="endDate" type="datetime-local" required defaultValue={electoralInputDate(election?.endDate)}/></label>
      </div><p className="el-field-note">Las postulaciones deben cerrar antes o al iniciar la votación.</p></fieldset>
      <fieldset disabled={structureLocked} className="el-fieldset"><legend>03 · Representación</legend><div className="el-form-grid">
        <label>Cargos<textarea name="positions" required rows={3} defaultValue={election?.positions.join('\n')} placeholder={'Representante del equipo\nCoordinación de proyectos'}/><small>Un cargo por línea. Se fijan al publicar.</small></label>
        <label>Departamentos<textarea name="departments" rows={3} defaultValue={election?.departments.join('\n')} placeholder={'Desarrollo\nDiseño'}/><small>Opcional. Uno por línea.</small></label>
      </div></fieldset>
      <div className="el-schedule-note"><strong>Participación con aprobación del CEO</strong><p>Todos deben solicitar permiso para votar o postular, incluidos los empleados. Son permisos independientes.</p></div>
      {error && <p className="el-alert el-alert-error" role="alert">{error}</p>}
      <div className="el-dialog-actions"><button className="el-button" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="el-button el-button-primary" disabled={busy || mode === 'none'} type="submit">{busy ? <LoaderCircle className="el-spin" size={17}/> : <Check size={17}/>} {busy ? 'Guardando…' : election ? 'Guardar cambios' : 'Crear proceso'}</button></div>
    </form>
  </Dialog>;
}
