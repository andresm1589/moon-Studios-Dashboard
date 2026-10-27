import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Globe2, ImagePlus, LoaderCircle, MapPin, Save, Send, Users, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { FestEvent, FestEventInput } from '@/types/fest';
import { festDate, limaDate, limaInput } from './managementUtils';
import { MOON_SALA, usaSalaMoon, vincularSalaFest } from '@/lib/fest/sala';
// También se abre desde Conferencias, fuera del panel de MOON FEST.
import './fest-management.css';

interface Draft {
  title: string; slug: string; summary: string; description: string; coverUrl: string;
  format: FestEvent['format']; location: string; streamUrl: string; capacity: string;
  startsAt: string; endsAt: string; registrationOpensAt: string; registrationClosesAt: string;
  /** En línea: la sala propia de Moon Studios o un enlace externo. */
  room: 'moon' | 'externa';
}

function makeDraft(event?: Partial<FestEventInput>): Draft {
  return {
    title: event?.title ?? '', slug: event?.slug ?? '', summary: event?.summary ?? '', description: event?.description ?? '', coverUrl: event?.coverUrl ?? '',
    format: event?.format ?? 'presencial', location: event?.location ?? '', streamUrl: event?.streamUrl ?? '', capacity: String(event?.capacity ?? 0),
    startsAt: limaInput(event?.startsAt), endsAt: limaInput(event?.endsAt), registrationOpensAt: limaInput(event?.registrationOpensAt), registrationClosesAt: limaInput(event?.registrationClosesAt),
    room: event?.streamUrl && !usaSalaMoon(event.streamUrl) ? 'externa' : 'moon',
  };
}

function slugOf(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function validateStep(draft: Draft, step: number): string | null {
  if (step === 0) {
    if (draft.title.trim().length < 3) return 'Escribe un nombre de al menos 3 caracteres.';
    if (draft.summary.trim().length < 10) return 'Describe esta edición con al menos 10 caracteres.';
    if (draft.description.trim().length < 20) return 'Añade al menos 20 caracteres acerca de la experiencia.';
    if (draft.slug.length < 3 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) return 'El identificador necesita al menos 3 caracteres y admite letras minúsculas, números y guiones entre palabras.';
    if (draft.coverUrl && !/^https:\/\//i.test(draft.coverUrl)) return 'La imagen debe tener una dirección HTTPS.';
  }
  if (step === 1) {
    const { startsAt, endsAt, registrationOpensAt, registrationClosesAt } = draft;
    if (![startsAt, endsAt, registrationOpensAt, registrationClosesAt].every(value => value && Number.isFinite(limaDate(value).getTime()))) return 'Completa las cuatro fechas. Se interpretan en hora de Lima.';
    if (limaDate(endsAt) <= limaDate(startsAt)) return 'La fecha de fin debe ser posterior al inicio del evento.';
    if (limaDate(registrationClosesAt) <= limaDate(registrationOpensAt)) return 'El cierre de inscripciones debe ser posterior a su apertura.';
    if (limaDate(registrationClosesAt) > limaDate(startsAt)) return 'Las inscripciones deben cerrar antes de que comience el evento.';
    if (!/^\d+$/.test(draft.capacity) || !Number.isSafeInteger(Number(draft.capacity)) || Number(draft.capacity) > 1000000) return 'El aforo debe ser un entero entre 0 y 1 000 000. Usa 0 para no limitarlo.';
    if (draft.format !== 'virtual' && draft.location.trim().length < 3) return 'Indica dónde será el evento, con al menos 3 caracteres.';
    if (draft.format !== 'presencial' && draft.room === 'externa') {
      if (!draft.streamUrl.trim()) return 'Añade el enlace externo o usa la sala de Moon Studios.';
      if (!/^https:\/\//i.test(draft.streamUrl.trim())) return 'El enlace externo debe empezar por https://.';
    }
  }
  return null;
}

export function FestEventEditor({ event, inicial, onClose, onSave }: {
  event?: FestEvent;
  /** Datos para una edición nueva (por ejemplo, copiados de un evento privado). */
  inicial?: Partial<FestEventInput>;
  onClose: () => void;
  onSave: (input: FestEventInput, id?: string) => Promise<string>;
}) {
  const [draft, setDraft] = useState(() => makeDraft(event ?? inicial));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'draft' | 'published' | null>(null);
  const saving = useRef(false);
  // Si la sala falla después de guardar, reintentar no debe crear otra edición.
  const savedId = useRef(event?.id);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const next = () => { const problem = validateStep(draft, step); if (problem) { setError(problem); return; } setError(''); setStep(previous => previous + 1); };
  const save = async (publication: 'draft' | 'published') => {
    if (saving.current) return;
    for (const index of [0, 1]) { const problem = validateStep(draft, index); if (problem) { setStep(index); setError(problem); return; } }
    saving.current = true; setBusy(publication); setError('');
    try {
      const online = draft.format !== 'presencial';
      const moonRoom = online && draft.room === 'moon';
      const streamUrl = !online ? '' : moonRoom ? MOON_SALA : draft.streamUrl.trim();
      const id = await onSave({ title: draft.title.trim(), slug: draft.slug, summary: draft.summary.trim(), description: draft.description.trim(), coverUrl: draft.coverUrl.trim(), format: draft.format, location: draft.location.trim() || (draft.format === 'virtual' ? 'En línea' : ''), streamUrl, startsAt: limaDate(draft.startsAt), endsAt: limaDate(draft.endsAt), registrationOpensAt: limaDate(draft.registrationOpensAt), registrationClosesAt: limaDate(draft.registrationClosesAt), capacity: Number(draft.capacity), publication, cancelled: event?.cancelled ?? false }, savedId.current);
      savedId.current = id;
      if (moonRoom) {
        try { await vincularSalaFest(id); }
        catch (cause) { setError(`La edición se guardó, pero no se pudo preparar su sala de video: ${cause instanceof Error ? cause.message : 'error desconocido'} Vuelve a pulsar «Publicar» o «Guardar» para reintentar.`); return; }
      }
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar el evento. Inténtalo de nuevo.'); }
    finally { saving.current = false; setBusy(null); }
  };

  return <Dialog open onOpenChange={open => { if (!open && !saving.current) onClose(); }}><DialogContent className="fm-dialog" showCloseButton={!busy}>
    <header className="fm-editor-header"><span className="fm-eyebrow">MOON FEST / {event ? 'EDITAR EDICIÓN' : 'NUEVA EDICIÓN'}</span><DialogTitle>{event ? 'Todo listo para el siguiente paso.' : 'Una nueva experiencia comienza aquí.'}</DialogTitle><DialogDescription>Prepara el evento, define sus fechas y revisa antes de publicar.</DialogDescription></header>
    <ol className="fm-steps" aria-label="Pasos para preparar el evento">{['La experiencia', 'Fechas y acceso', 'Revisar'].map((label, index) => <li key={label} className={step === index ? 'is-current' : index < step ? 'is-done' : ''} aria-current={step === index ? 'step' : undefined}><span>{index < step ? <Check size={14} /> : `0${index + 1}`}</span>{label}</li>)}</ol>
    <form onSubmit={form => { form.preventDefault(); if (step < 2) next(); }} className="fm-editor-body" aria-busy={!!busy}>
      <fieldset disabled={!!busy}><legend className="sr-only">{['La experiencia', 'Fechas y acceso', 'Revisar'][step]}</legend>
      {step === 0 && <div className="fm-form-grid" key="experiencia">
        <label className="fm-field fm-span"><span>Nombre de la edición <b>*</b></span><input value={draft.title} maxLength={120} placeholder="Moon Fest · Próxima edición" onChange={change => { const value = change.target.value; setDraft(previous => ({ ...previous, title: value, slug: !event && previous.slug === slugOf(previous.title) ? slugOf(value) : previous.slug })); }} autoFocus /></label>
        <label className="fm-field fm-span"><span>Descripción corta <b>*</b></span><textarea rows={2} value={draft.summary} maxLength={240} placeholder="Lo que hace especial esta experiencia, en pocas palabras." onChange={change => set('summary', change.target.value)} /><small>{draft.summary.length}/240 · Aparece en la tarjeta de la web.</small></label>
        <label className="fm-field fm-span"><span>Acerca del evento <b>*</b></span><textarea rows={5} value={draft.description} maxLength={8000} placeholder="Cuenta qué haremos, a quién está dirigido y qué deben saber los asistentes." onChange={change => set('description', change.target.value)} /><small>El texto se publica tal como lo escribes, sin código HTML.</small></label>
        <label className="fm-field"><span><ImagePlus size={15} />Imagen de portada</span><input type="url" value={draft.coverUrl} maxLength={1500} placeholder="https://…" onChange={change => set('coverUrl', change.target.value)} /><small>Opcional. Usa una imagen horizontal.</small></label>
        <label className="fm-field"><span>Identificador <b>*</b></span><input value={draft.slug} maxLength={80} onChange={change => set('slug', change.target.value)} placeholder="moon-fest-proxima-edicion" spellCheck={false} /><small>Único para esta edición. Se genera con el nombre.</small></label>
      </div>}
      {step === 1 && <div className="fm-form-grid" key="fechas"><div className="fm-tip fm-span"><CalendarDays size={20} /><p><strong>Todo en hora de Lima.</strong> La apertura y el cierre se aplican automáticamente, aunque nadie tenga abierto el dashboard.</p></div>
        <label className="fm-field"><span>Inicio del evento <b>*</b></span><input type="datetime-local" value={draft.startsAt} onChange={change => set('startsAt', change.target.value)} /></label><label className="fm-field"><span>Fin del evento <b>*</b></span><input type="datetime-local" value={draft.endsAt} onChange={change => set('endsAt', change.target.value)} /></label>
        <label className="fm-field"><span>Abrir inscripciones <b>*</b></span><input type="datetime-local" value={draft.registrationOpensAt} onChange={change => set('registrationOpensAt', change.target.value)} /></label><label className="fm-field"><span>Cerrar inscripciones <b>*</b></span><input type="datetime-local" value={draft.registrationClosesAt} onChange={change => set('registrationClosesAt', change.target.value)} /></label>
        <label className="fm-field"><span>Modalidad</span><select value={draft.format} onChange={change => set('format', change.target.value as Draft['format'])}><option value="presencial">Presencial</option><option value="virtual">En línea</option><option value="hibrido">Híbrido</option></select></label><label className="fm-field"><span><Users size={15} />Aforo</span><input type="number" inputMode="numeric" min={0} max={1000000} step={1} value={draft.capacity} onChange={change => set('capacity', change.target.value)} /><small>0 = sin límite. Debe cubrir las inscripciones existentes.</small></label>
        {draft.format !== 'virtual' && <label className="fm-field fm-span"><span><MapPin size={15} />Lugar <b>*</b></span><input value={draft.location} maxLength={200} placeholder="Sede, dirección y ciudad" onChange={change => set('location', change.target.value)} /></label>}
        {draft.format !== 'presencial' && <label className="fm-field fm-span"><span><Video size={15} />Sala en línea</span><select value={draft.room} onChange={change => set('room', change.target.value as Draft['room'])}><option value="moon">Sala de Moon Studios (recomendado)</option><option value="externa">Enlace externo</option></select><small>{draft.room === 'moon' ? 'Cada inscrito entra con la misma cuenta con la que se inscribió, desde Conferencias de Moon Studios. La sala se crea sola al guardar.' : 'Úsalo solo si el encuentro ocurre en otra plataforma.'}</small></label>}
        {draft.format !== 'presencial' && draft.room === 'externa' && <label className="fm-field fm-span"><span><Globe2 size={15} />Enlace externo <b>*</b></span><input type="url" value={usaSalaMoon(draft.streamUrl) ? '' : draft.streamUrl} maxLength={1500} placeholder="https://…" onChange={change => set('streamUrl', change.target.value)} /><small>Los asistentes lo verán en el detalle del evento.</small></label>}
      </div>}
      {step === 2 && <div className="fm-review" key="revision"><div className="fm-review-title"><span className="fm-eyebrow">VISTA PREVIA DE LA EDICIÓN</span><h3>{draft.title}</h3><p>{draft.summary}</p></div><dl><div><dt>Evento</dt><dd>{festDate(limaDate(draft.startsAt))} → {festDate(limaDate(draft.endsAt))}</dd></div><div><dt>Inscripciones</dt><dd>{festDate(limaDate(draft.registrationOpensAt))} → {festDate(limaDate(draft.registrationClosesAt))}</dd></div><div><dt>Modalidad y aforo</dt><dd>{draft.format === 'virtual' ? 'En línea' : draft.format === 'hibrido' ? 'Híbrido' : 'Presencial'} · {Number(draft.capacity) === 0 ? 'Sin límite de aforo' : `${Number(draft.capacity).toLocaleString('es-PE')} plazas`}</dd></div><div><dt>Ubicación</dt><dd>{draft.format === 'virtual' ? (draft.room === 'moon' ? 'Sala de Moon Studios' : draft.streamUrl) : draft.format === 'hibrido' ? `${draft.location} · ${draft.room === 'moon' ? 'Sala de Moon Studios' : 'enlace externo'}` : draft.location}</dd></div></dl><div className="fm-tip"><Globe2 size={20} /><p><strong>Publicar hace visible esta edición.</strong> Las inscripciones solo se abren dentro del plazo establecido. Guardar un borrador permite continuar más tarde.</p></div>{event && event.registeredCount > 0 && <p className="fm-inline-note">Esta edición ya tiene {event.registeredCount} inscripciones. Los cambios de fechas y lugar se mostrarán también en sus entradas.</p>}</div>}
      </fieldset>
      {error && <p className="fm-error" role="alert">{error}</p>}
      <footer className="fm-editor-footer"><button type="button" className="fm-button" onClick={() => { if (step === 0) onClose(); else { setError(''); setStep(previous => previous - 1); } }} disabled={!!busy}><ArrowLeft size={16} />{step === 0 ? 'Cancelar' : 'Atrás'}</button><div>{step < 2 ? <button type="submit" className="fm-button fm-button--primary">Continuar<ArrowRight size={16} /></button> : <><button type="button" className="fm-button" onClick={() => save('draft')} disabled={!!busy}>{busy === 'draft' ? <LoaderCircle className="fm-spin" size={16} /> : <Save size={16} />}{event?.publication === 'published' ? 'Pasar a borrador' : 'Guardar borrador'}</button><button type="button" className="fm-button fm-button--primary" onClick={() => save('published')} disabled={!!busy}>{busy === 'published' ? <LoaderCircle className="fm-spin" size={16} /> : <Send size={16} />}{event?.publication === 'published' ? 'Guardar y publicar' : 'Publicar edición'}</button></>}</div></footer>
    </form>
  </DialogContent></Dialog>;
}
