import { useState } from 'react';
import { LoaderCircle, LockKeyhole, RefreshCw, Save, Unlock } from 'lucide-react';
import type { ElectionController, ElectoralSettings, ElectoralSettingsInput } from './types';
import { Dialog } from './ElectoralDialog';
import { ElectoralClosure } from './ElectoralPublicPanel';
import { formatDate, type DirectorRun } from './directorShared';

// ─── Ajustes: abrir o cerrar las elecciones para participantes ──────────────
// Con la participación cerrada, el portal muestra la pantalla de cierre y no
// se puede solicitar acceso, aceptar invitaciones, postular ni votar. El CEO
// sigue entrando a la dirección. La vista previa usa el mismo componente.

type Props = { system: ElectionController; busy: boolean; run: DirectorRun; error: string };

export function DirectorAjustes({ system, busy, run, error }: Props) {
  const [form, setForm] = useState<ElectoralSettings>(system.settings);
  const [dirty, setDirty] = useState(false);
  const [source, setSource] = useState(system.settings);
  const [pending, setPending] = useState<ElectoralSettingsInput | null>(null);
  // Si otro dispositivo guarda mientras no hay cambios locales, se adopta lo guardado.
  if (!dirty && source !== system.settings) { setSource(system.settings); setForm(system.settings); }
  const set = <K extends keyof ElectoralSettings>(key: K, value: ElectoralSettings[K]) => { setForm(previous => ({ ...previous, [key]: value })); setDirty(true); };

  const apply = async (input: ElectoralSettingsInput) => {
    const ok = await run(() => system.updateSettings(input), input.enabled ? 'Ajustes guardados: la participación está abierta.' : 'Ajustes guardados: los participantes ven la pantalla de cierre.');
    if (ok) { setDirty(false); setPending(null); }
  };
  const save = async () => {
    const input = { enabled: form.enabled, closureTitle: form.closureTitle.trim(), closureMessage: form.closureMessage.trim(), returnYear: Number(form.returnYear) };
    if (input.enabled !== system.settings.enabled) setPending(input);
    else await apply(input);
  };

  return <>
    <div className="ed-section-intro"><div><h2>Ajustes del sistema electoral</h2><p>Abre o cierra la participación y personaliza el mensaje que verán los participantes entre una edición y otra.</p></div>
      {system.settings.updatedAt && <span className="el-result-count">Última modificación: {formatDate(system.settings.updatedAt)}</span>}</div>
    {system.settingsError && <div className="el-alert el-alert-error" role="alert"><span>{system.settingsError}</span><button className="el-button" type="button" onClick={system.refresh}><RefreshCw size={16}/>Volver a consultar</button></div>}
    {system.settingsLoading ? <div className="el-loading" role="status"><LoaderCircle className="el-spin" />Cargando ajustes…</div> : <div className="ed-settings">
      <form className="el-form ed-settings-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className={`ed-switch-card${form.enabled ? ' is-on' : ''}`}>
          <div className="ed-switch-icon">{form.enabled ? <Unlock size={20} /> : <LockKeyhole size={20} />}</div>
          <div><strong>{form.enabled ? 'Participación abierta' : 'Participación cerrada'}</strong><p>{form.enabled ? 'Los participantes usan el portal según el calendario de cada proceso.' : 'El portal muestra la pantalla de cierre. Nadie puede solicitar acceso, postular ni votar.'}</p></div>
          <label className="ed-switch"><input type="checkbox" checked={form.enabled} disabled={busy} onChange={event => set('enabled', event.target.checked)} aria-label="Participación habilitada" /><span /></label>
        </div>
        <label>Título de la pantalla de cierre<input value={form.closureTitle} disabled={busy} required minLength={3} maxLength={160} onChange={event => set('closureTitle', event.target.value)} /></label>
        <label>Mensaje<textarea value={form.closureMessage} disabled={busy} required maxLength={2000} rows={4} onChange={event => set('closureMessage', event.target.value)} /></label>
        <label>Año de la próxima edición<input type="number" min={2000} max={2200} step={1} value={form.returnYear} disabled={busy} required onChange={event => set('returnYear', Number(event.target.value))} /></label>
        {error && <p className="el-alert el-alert-error" role="alert">{error}</p>}
        <div className="ed-settings-actions">{dirty && <span className="ed-muted">Hay cambios sin guardar.</span>}<button type="button" className="el-button" disabled={busy || !dirty} onClick={() => { setForm(system.settings); setDirty(false); }}>Descartar</button><button type="submit" className="el-button el-button-primary" disabled={busy || !dirty}>{busy ? <LoaderCircle className="el-spin" size={17} /> : <Save size={17} />}Guardar ajustes</button></div>
      </form>
      <div className="ed-settings-preview"><span className="el-kicker">VISTA PREVIA · PANTALLA DE CIERRE</span><div className="ed-preview-frame"><ElectoralClosure settings={{ ...form, closureTitle: form.closureTitle || 'Elecciones cerradas', closureMessage: form.closureMessage || ' ' }} compact /></div></div>
    </div>}
    {pending && <Dialog title={pending.enabled ? 'Reabrir las elecciones' : 'Cerrar las elecciones'} busy={busy} onClose={() => setPending(null)}><div className="el-dialog-body"><h3 className="el-confirm-name">{pending.enabled ? 'Volver a participar' : pending.closureTitle}</h3><p className="el-confirm-description">{pending.enabled ? 'Los participantes volverán al portal. Cada proceso mantendrá sus fechas y permisos aprobados.' : `El portal quedará bloqueado para solicitar acceso, aceptar invitaciones, postular y votar. Mostrará tu mensaje y el año ${pending.returnYear}. La dirección del CEO seguirá disponible para administrar el sistema.`}</p>{error && <p className="el-alert el-alert-error" role="alert">{error}</p>}<div className="el-dialog-actions"><button type="button" className="el-button" disabled={busy} onClick={() => setPending(null)}>Cancelar</button><button type="button" className="el-button el-button-primary" disabled={busy} onClick={() => void apply(pending)}>{busy ? <LoaderCircle className="el-spin" size={17}/> : pending.enabled ? <Unlock size={17}/> : <LockKeyhole size={17}/ >}{pending.enabled ? 'Confirmar reapertura' : 'Confirmar cierre global'}</button></div></div></Dialog>}
  </>;
}
