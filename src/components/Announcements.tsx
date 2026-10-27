import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
import { panelInk } from '@/lib/panelColors';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToAnnouncements, createAnnouncement, deleteAnnouncement, updateAnnouncement } from '@/lib/firebase';
import { Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { Megaphone, Plus, Trash2, AlertCircle, Calendar, X, Pin, ChevronDown, Sparkles, Bell, Pencil } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Announcement } from '@/types';
import '@/styles/enterprise-sections.css';
import { Search } from 'lucide-react';

// ── CSS: keyframes + ALL theme-sensitive classes (no hardcoded white/black) ───
const STYLES = `
  @keyframes ann-slide-up {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes ann-fade-in {
    from { opacity: 0; } to { opacity: 1; }
  }
  @keyframes ann-modal-in {
    from { opacity: 0; transform: scale(0.94) translateY(12px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes ann-shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes ann-pulse-ring {
    0%,100% { transform: scale(1);    opacity: 0.5; }
    50%     { transform: scale(1.12); opacity: 0.15; }
  }
  @keyframes ann-bounce-dot {
    0%, 80%, 100% { transform: scale(0); }
    40%           { transform: scale(1); }
  }

  /* ── Card ── */
  .ann-card { animation: none; }
  .ann-card-wrap {
    position: relative;
    background: var(--moon-surface);
    border: 1px solid var(--moon-line);
    border-radius: 24px;
    overflow: hidden;
    transition: border-color 0.25s, box-shadow 0.25s, transform 0.2s;
  }
  .ann-card-wrap:hover { transform: translateY(-2px); }
  html.light .ann-card-wrap:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.08); }
  html:not(.light) .ann-card-wrap:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.22); }
  .ann-card-wrap.important { border-color: rgba(248,113,113,0.22); }
  .ann-card-wrap:not(.important):hover { border-color: color-mix(in srgb, var(--accent-user, #a78bfa) 30%, transparent); }
  .ann-card-wrap.important:hover { border-color: rgba(248,113,113,0.38); }

  /* ── Modal ── */
  .ann-modal-overlay {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center; padding: 16px;
    background: rgba(0,0,0,0.45);
    backdrop-filter: blur(16px);
    animation: ann-fade-in 0.2s ease;
  }
  .ann-modal-box {
    width: 100%; max-width: 512px;
    background: var(--moon-surface);
    border: 1px solid var(--moon-line);
    border-radius: 28px; overflow: hidden;
    animation: ann-modal-in 0.32s cubic-bezier(0.22,1,0.36,1);
  }
  html.light .ann-modal-box { box-shadow: 0 32px 80px rgba(0,0,0,0.18); }
  html:not(.light) .ann-modal-box { box-shadow: 0 48px 120px rgba(0,0,0,0.45); }
  .ann-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 28px; border-bottom: 1px solid var(--moon-line);
  }
  .ann-modal-body  { padding: 24px 28px; display: flex; flex-direction: column; gap: 18px; }
  .ann-modal-footer{ padding: 0 28px 24px; display: flex; gap: 10px; }

  /* ── Inputs ── */
  .ann-input {
    background: var(--moon-surface-raised);
    border: 1px solid var(--moon-line);
    color: var(--moon-ink);
    caret-color: var(--moon-ink);
    outline: none; width: 100%; border-radius: 14px;
    padding: 11px 15px; font-size: 14px; font-weight: 300;
    transition: border-color 0.2s, box-shadow 0.2s;
    font-family: inherit;
  }
  .ann-input:focus {
    border-color: color-mix(in srgb, var(--accent-user, #a78bfa) 55%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-user, #a78bfa) 10%, transparent);
  }
  .ann-input::placeholder { color: var(--moon-muted); }

  /* ── Buttons ── */
  .ann-close-btn {
    width: 32px; height: 32px; border-radius: 10px;
    background: var(--moon-surface-raised); border: 1px solid var(--moon-line);
    color: var(--moon-muted); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s; font-family: inherit;
  }
  .ann-close-btn:hover { background: var(--moon-surface-raised); color: var(--moon-ink); }

  .ann-btn-cancel {
    background: var(--moon-surface-raised); border: 1px solid var(--moon-line);
    color: var(--moon-muted); border-radius: 14px;
    padding: 11px 0; font-size: 13px; font-weight: 300;
    cursor: pointer; transition: background 0.15s; font-family: inherit; flex: 1;
  }
  .ann-btn-cancel:hover { background: var(--moon-surface-raised); }

  /* Primary uses text-primary as bg so it inverts automatically in both themes */
  .ann-btn-primary {
    background: var(--moon-accent); color: var(--moon-accent-ink);
    border: none; border-radius: 14px;
    padding: 11px 0; font-size: 13px; font-weight: 500;
    cursor: pointer; transition: opacity 0.15s, transform 0.15s;
    font-family: inherit; flex: 2;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .ann-btn-primary:hover { opacity: 0.85; transform: scale(1.01); }
  .ann-btn-primary:disabled { opacity: 0.5; cursor: wait; }
  .ann-btn-primary.important-mode {
    background: #f87171; color: #fff;
    box-shadow: 0 4px 16px rgba(248,113,113,0.28);
  }

  .ann-btn-new {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 9px 18px; border-radius: 14px; font-size: 13px; font-weight: 500;
    background: var(--moon-accent); color: var(--moon-accent-ink);
    border: none; cursor: pointer;
    transition: opacity 0.15s, transform 0.15s; font-family: inherit; white-space: nowrap;
  }
  .ann-btn-new:hover { opacity: 0.82; transform: scale(1.02); }

  /* ── Toggle row ── */
  .ann-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-radius: 18px; cursor: pointer; width: 100%;
    background: var(--moon-surface-raised); border: 1px solid var(--moon-line);
    transition: all 0.25s cubic-bezier(0.22,1,0.36,1); font-family: inherit;
  }
  .ann-toggle-row.on { background: rgba(248,113,113,0.07); border-color: rgba(248,113,113,0.22); }

  .ann-toggle-icon {
    width: 36px; height: 36px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    background: var(--moon-surface-raised); border: 1px solid var(--moon-line);
    transition: all 0.25s;
  }
  .ann-toggle-row.on .ann-toggle-icon {
    background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.22);
  }

  /* ── Filter ── */
  .ann-filter-pill {
    display: flex; align-items: center;
    background: var(--moon-surface-raised); border: 1px solid var(--moon-line);
    border-radius: 14px; padding: 4px; gap: 3px;
  }
  .ann-filter-btn {
    padding: 6px 14px; border-radius: 10px; font-size: 12px; font-weight: 300;
    background: transparent; border: 1px solid transparent;
    color: var(--moon-muted); cursor: pointer; transition: all 0.2s; font-family: inherit;
  }
  .ann-filter-btn.active      { background: var(--moon-surface-raised); border-color: var(--moon-line); color: var(--moon-ink); }
  .ann-filter-btn.active-imp  { background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.22); color:var(--moon-tone-red); }

  /* ── Card delete ── */
  .ann-del-btn {
    width: 30px; height: 30px; border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    background: var(--moon-surface-raised); border: 1px solid var(--moon-line);
    color: var(--moon-muted); cursor: pointer;
    opacity: 0; transition: opacity 0.2s, background 0.15s, color 0.15s; font-family: inherit;
  }
  .ann-card-wrap:hover .ann-del-btn { opacity: 1; }
  .ann-del-btn:hover { color:var(--moon-tone-red); background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.22); }
  .ann-edit-btn:hover { color: var(--accent-user, #a78bfa); background: color-mix(in srgb, var(--accent-user, #a78bfa) 10%, transparent); border-color: color-mix(in srgb, var(--accent-user, #a78bfa) 22%, transparent); }
  .ann-del-yes {
    font-size: 10px; font-weight: 400; padding: 4px 10px; border-radius: 8px; cursor: pointer;
    background: rgba(248,113,113,0.1); color:var(--moon-tone-red); border: 1px solid rgba(248,113,113,0.25); font-family: inherit;
  }
  .ann-del-no {
    font-size: 10px; font-weight: 300; padding: 4px 10px; border-radius: 8px; cursor: pointer;
    background: var(--moon-surface-raised); color: var(--moon-muted); border: 1px solid var(--moon-line); font-family: inherit;
  }

  /* ── Icon boxes ── */
  .ann-icon-accent { background: color-mix(in srgb, var(--accent-user, #a78bfa) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent-user, #a78bfa) 22%, transparent); }
  .ann-icon-danger { background: rgba(248,113,113,0.10); border: 1px solid rgba(248,113,113,0.20); }
  .ann-icon-wrap {
    width: 42px; height: 42px; border-radius: 14px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s;
  }
  .ann-card-wrap:hover .ann-icon-wrap { transform: scale(1.05); }

  /* ── Typography ── */
  .ann-heading  { color: var(--moon-ink); font-weight: 300; font-size: 20px; letter-spacing: -0.02em; line-height: 1; }
  .ann-subtext  { color: var(--moon-muted); font-size: 12px; font-weight: 300; margin-top: 3px; }
  .ann-title    { color: var(--moon-ink); font-weight: 300; font-size: 14px; line-height: 1.4; letter-spacing: -0.01em; }
  .ann-body     { font-size: 13px; font-weight: 300; line-height: 1.7; color: var(--moon-muted); white-space: pre-wrap; word-break: break-word; }
  .ann-meta     { font-size: 11px; font-weight: 300; color: var(--moon-muted); }
  .ann-sep      { color: var(--moon-line); }
  .ann-label    { display: block; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--moon-muted); font-weight: 300; margin-bottom: 8px; }
  .ann-read-more{ display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 12px; font-weight: 300; color: var(--accent-user, #a78bfa); background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }
  .ann-read-more:hover { opacity: 0.7; }

  /* ── Meta row ── */
  .ann-meta-row {
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--moon-line);
  }
  .ann-author-av {
    width: 20px; height: 20px; border-radius: 7px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 600;
    background: color-mix(in srgb, var(--accent-user, #a78bfa) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent-user, #a78bfa) 22%, transparent); color: var(--accent-user, #a78bfa);
  }
  .ann-author-av.imp { background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.20); color:var(--moon-tone-red); }

  /* ── Error ── */
  .ann-error {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: 12px;
    background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2);
    animation: ann-slide-up 0.2s ease;
  }

  /* ── Banner ── */
  .ann-banner {
    border-radius: 20px; padding: 14px 18px;
    display: flex; align-items: center; gap: 14px;
    background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.18);
    animation: ann-slide-up 0.3s ease;
  }

  /* ── Empty ── */
  .ann-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 64px 24px;
    border-radius: 24px; border: 2px dashed var(--moon-line);
    animation: ann-fade-in 0.4s ease;
  }
  .ann-empty-icon {
    width: 52px; height: 52px; border-radius: 18px;
    background: var(--moon-surface-raised); border: 1px solid var(--moon-line);
    display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
  }

  /* ── Loading ── */
  .ann-loading-icon {
    width: 48px; height: 48px; border-radius: 16px;
    display: flex; align-items: center; justify-content: center;
  }
`;

// El acento sigue el color que el usuario eligió en Configuración.
const ACCENT = 'var(--accent-user, #a78bfa)';
const DANGER  = '#f87171';
// Transparencia sobre un color que puede ser una variable CSS (no se le puede
// pegar un sufijo hex como antes).
const mezcla = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// createdBy guarda el uid en los anuncios nuevos y createdByName el nombre.
// Los antiguos tienen el nombre en createdBy, de ahí el respaldo al mostrar.
type AnnouncementDoc = Announcement & { createdByName?: string; updatedAt?: Date | null };
const autorDe = (a: AnnouncementDoc) => a.createdByName ?? a.createdBy ?? '';

// ── Loading dots ──────────────────────────────────────────────────────────────
const LoadingDots: React.FC = () => (
  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: 6, height: 6, borderRadius: '50%', background: ACCENT,
        animation: `ann-bounce-dot 1.2s ease-in-out ${i * 0.16}s infinite`,
      }} />
    ))}
  </div>
);

// ── CreateModal (crear y editar) ──────────────────────────────────────────────
interface CreateModalProps {
  onClose: () => void;
  onSuccess: () => void;
  canEdit: boolean;
  createdByUid: string;
  createdByName: string;
  /** Si llega, el modal edita este anuncio en vez de crear uno nuevo. */
  editing?: AnnouncementDoc | null;
}

const CreateModal: React.FC<CreateModalProps> = ({ onClose, onSuccess, canEdit, createdByUid, createdByName, editing }) => {
  const [form, setForm]      = useState(() => editing
    ? { title: editing.title, content: editing.content, important: !!editing.important }
    : { title: '', content: '', important: false });
  const [submitting, setSub] = useState(false);
  const [error, setError]    = useState('');
  const titleEmojiRef = useRef<HTMLInputElement>(null);
  const contentEmojiRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    if (!canEdit) return;
    if (!form.title.trim())   { setError('El título es obligatorio.'); return; }
    if (!form.content.trim()) { setError('El contenido es obligatorio.'); return; }
    setError(''); setSub(true);
    const datos = { title: form.title.trim(), content: form.content.trim(), important: form.important };
    try {
      if (editing) {
        await updateAnnouncement(editing.id, { ...datos, updatedAt: Timestamp.now(), updatedBy: createdByUid });
        toast.success('Anuncio actualizado');
      } else {
        await createAnnouncement({ ...datos, createdBy: createdByUid, createdByName });
        toast.success('Anuncio publicado');
      }
      onSuccess(); onClose();
    } catch (err) {
      console.error(err);
      setError(editing ? 'Error al guardar los cambios. Intenta de nuevo.' : 'Error al publicar. Intenta de nuevo.');
    } finally { setSub(false); }
  }, [canEdit, form, editing, createdByUid, createdByName, onSuccess, onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return createPortal(
    <div className="ann-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ann-modal-box">

        {/* Gradient strip */}
        <div style={{
          height: 3,
          background: `linear-gradient(90deg, ${ACCENT}, #60a5fa, ${ACCENT})`,
          backgroundSize: '200% 100%',
          animation: 'ann-shimmer 2.5s linear infinite',
        }} />

        {/* Header */}
        <div className="ann-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className="ann-icon-accent">
              <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: 'color-mix(in srgb, var(--accent-user, #a78bfa) 12%, transparent)', animation: 'ann-pulse-ring 2.5s ease-in-out infinite' }} />
              <Megaphone style={{ width: 18, height: 18, color: panelInk(ACCENT), position: 'relative', zIndex: 1 }} strokeWidth={1.5} />
            </div>
            <div>
              <p style={{ color: 'var(--moon-ink)', fontWeight: 300, fontSize: 15 }}>{editing ? 'Editar anuncio' : 'Nuevo Anuncio'}</p>
              <p className="ann-subtext">{editing ? 'Los cambios se verán para todos los usuarios' : 'Se publicará para todos los usuarios'}</p>
            </div>
          </div>
          <button className="ann-close-btn" type="button" onClick={onClose}>
            <X style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="ann-modal-body">
          <div>
            <label className="ann-label">Título</label>
            <input ref={titleEmojiRef} className="ann-input" type="text" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Título del anuncio..." />
            <EmojiButton value={form.title} onChange={title => setForm(f => ({ ...f, title }))} inputRef={titleEmojiRef} disabled={submitting} label="Añadir emoji al título del anuncio" />
          </div>
          <div>
            <label className="ann-label">Contenido</label>
            <textarea ref={contentEmojiRef} className="ann-input" value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Escribe el contenido del anuncio..."
              rows={4} style={{ resize: 'none' }} />
            <EmojiButton value={form.content} onChange={content => setForm(f => ({ ...f, content }))} inputRef={contentEmojiRef} disabled={submitting} label="Añadir emoji al anuncio" />
          </div>

          {/* Important toggle */}
          <button type="button" className={`ann-toggle-row ${form.important ? 'on' : ''}`}
            onClick={() => setForm(f => ({ ...f, important: !f.important }))}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="ann-toggle-icon">
                <Pin style={{ width: 14, height: 14, color: panelInk(form.important ? DANGER : 'var(--moon-muted)'), transition: 'color 0.25s' }} strokeWidth={1.5} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: panelInk(form.important ? DANGER : 'var(--moon-muted)'), fontSize: 13, fontWeight: 300, transition: 'color 0.25s' }}>
                  Marcar como importante
                </p>
                <p style={{ color: 'var(--moon-muted)', fontSize: 11, fontWeight: 300, marginTop: 2 }}>
                  Se destacará con prioridad alta
                </p>
              </div>
            </div>
            {/* Pill */}
            <div style={{
              width: 44, height: 24, borderRadius: 999, flexShrink: 0, position: 'relative',
              background: form.important ? DANGER : 'var(--moon-surface-raised)',
              border: `1px solid ${form.important ? 'rgba(248,113,113,0.45)' : 'var(--moon-line)'}`,
              transition: 'background 0.25s, border-color 0.25s',
            }}>
              <div style={{
                position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
                background: 'var(--moon-surface)',
                left: form.important ? 23 : 3,
                transition: 'left 0.25s cubic-bezier(0.22,1,0.36,1)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </div>
          </button>

          {error && (
            <div className="ann-error">
              <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, color: panelInk(DANGER) }} strokeWidth={1.5} />
              <p style={{ color: panelInk(DANGER), fontSize: 12, fontWeight: 300 }}>{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ann-modal-footer">
          <button type="button" className="ann-btn-cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className={`ann-btn-primary ${form.important ? 'important-mode' : ''}`}
            onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? <LoadingDots />
              : <><Sparkles style={{ width: 14, height: 14 }} strokeWidth={1.5} />{editing ? 'Guardar cambios' : 'Publicar Anuncio'}</>
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── AnnouncementCard ──────────────────────────────────────────────────────────
interface CardProps { a: AnnouncementDoc; canEdit: boolean; onDelete: (id: string) => void; onEdit: (a: AnnouncementDoc) => void; index: number; }

const AnnouncementCard: React.FC<CardProps> = React.memo(({ a, canEdit, onDelete, onEdit, index }) => {
  const [expanded,   setExpanded]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const isLong  = a.content.length > 220;
  const preview = isLong && !expanded ? a.content.slice(0, 220) + '…' : a.content;

  return (
    <div data-moon-reveal="card" className={`ann-card ann-card-wrap ${a.important ? 'important' : ''}`}
      style={{ animationDelay: `${index * 0.06}s` }}>

      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, zIndex: 1,
        background: `linear-gradient(180deg, ${a.important ? DANGER : ACCENT}, ${a.important ? mezcla(DANGER, 53) : mezcla(ACCENT, 40)})`,
        opacity: a.important ? 1 : 0.55,
      }} />

      <div style={{ padding: '20px 22px 20px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>

          {/* Icon */}
          <div className={`ann-icon-wrap ${a.important ? 'ann-icon-danger' : 'ann-icon-accent'}`}>
            {a.important
              ? <AlertCircle style={{ width: 18, height: 18, color: panelInk(DANGER) }} strokeWidth={1.5} />
              : <Megaphone   style={{ width: 18, height: 18, color: panelInk(ACCENT) }} strokeWidth={1.5} />
            }
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                <h3 className="ann-title"><EmojiText text={a.title} /></h3>
                {a.important && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 400,
                    letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase',
                    background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.22)', color: panelInk(DANGER),
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: DANGER, display: 'inline-block' }} />
                    Importante
                  </span>
                )}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {confirmDel ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <button type="button" className="ann-del-yes" onClick={() => onDelete(a.id)}>Eliminar</button>
                      <button type="button" className="ann-del-no"  onClick={() => setConfirmDel(false)}>No</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="ann-del-btn ann-edit-btn" title="Editar anuncio" onClick={() => onEdit(a)}>
                        <Pencil style={{ width: 13, height: 13 }} strokeWidth={1.5} />
                      </button>
                      <button type="button" className="ann-del-btn" title="Eliminar anuncio" onClick={() => setConfirmDel(true)}>
                        <Trash2 style={{ width: 14, height: 14 }} strokeWidth={1.5} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="ann-body"><EmojiText text={preview} /></p>
            {isLong && (
              <button type="button" className="ann-read-more" onClick={() => setExpanded(e => !e)}>
                {expanded ? 'Ver menos' : 'Leer más'}
                <ChevronDown style={{ width: 14, height: 14, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} strokeWidth={1.5} />
              </button>
            )}

            <div className="ann-meta-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className={`ann-author-av ${a.important ? 'imp' : ''}`}>
                  {autorDe(a)[0]?.toUpperCase() ?? 'A'}
                </div>
                <span className="ann-meta">{autorDe(a) || 'Administración'}</span>
              </div>
              <span className="ann-sep">·</span>
              <span className="ann-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar style={{ width: 12, height: 12 }} strokeWidth={1.5} />
                {format(new Date(a.createdAt), "d MMM yyyy, HH:mm", { locale: es })}
              </span>
              <span className="ann-sep">·</span>
              <span style={{ fontSize: 11, fontWeight: 300, color: 'var(--moon-muted)' }}>
                {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: es })}
              </span>
              {a.updatedAt && (
                <span className="ann-meta" title={format(a.updatedAt, "d MMM yyyy, HH:mm", { locale: es })}>(editado)</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
AnnouncementCard.displayName = 'AnnouncementCard';

// ── Main ──────────────────────────────────────────────────────────────────────
const Announcements: React.FC = () => {
  const { canEdit, userProfile, currentUser } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementDoc[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editing,       setEditing]       = useState<AnnouncementDoc | null>(null);
  const [filter,        setFilter]        = useState<'all' | 'important'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'priority' | 'oldest'>('recent');

  // En vivo: antes la lista se leía una vez, así que la campana avisaba de un
  // anuncio nuevo que esta página no mostraba hasta recargar. `load` queda
  // para los llamados que ya había; la escucha ya trae los cambios.
  const load = useCallback(async () => {}, []);

  useEffect(() => subscribeToAnnouncements(
    data => {
      const aFecha = (v: unknown): Date | null => {
        if (!v) return null;
        const ts = v as { toDate?: () => Date };
        return ts.toDate ? ts.toDate() : new Date(v as string | number);
      };
      setAnnouncements(
        data.map(a => ({
          ...a,
          createdAt: aFecha(a.createdAt) ?? new Date(0),
          updatedAt: aFecha(a.updatedAt),
        })) as AnnouncementDoc[]
      );
      setLoading(false);
    },
    // Antes el error solo iba a la consola y la página quedaba vacía.
    e => { console.error(e); toast.error('No se pudieron cargar los anuncios', { description: e.message }); setLoading(false); },
  ), []);

  const handleDelete = useCallback(async (id: string) => {
    if (!canEdit) return;
    try { await deleteAnnouncement(id); toast.success('Anuncio eliminado'); load(); }
    catch (e) { console.error(e); toast.error('No se pudo eliminar el anuncio', { description: (e as Error)?.message }); }
  }, [canEdit, load]);

  const handleEdit = useCallback((a: AnnouncementDoc) => {
    if (!canEdit) return;
    setEditing(a); setModalOpen(true);
  }, [canEdit]);

  const cerrarModal = useCallback(() => { setModalOpen(false); setEditing(null); }, []);

  const important = announcements.filter(a => a.important);
  const term = search.trim().toLocaleLowerCase('es');
  const visible = announcements.filter(a => (filter !== 'important' || a.important)
    && (!term || `${a.title} ${a.content} ${autorDe(a)}`.toLocaleLowerCase('es').includes(term)))
    .sort((a, b) => {
      const time = (a.createdAt as Date)?.getTime?.() || 0;
      const otherTime = (b.createdAt as Date)?.getTime?.() || 0;
      if (sortBy === 'priority') return Number(!!b.important) - Number(!!a.important) || otherTime - time;
      return sortBy === 'oldest' ? time - otherTime : otherTime - time;
    });

  // Los estilos van también en la carga: sin ellos los puntos no se animaban.
  if (loading) return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 16 }}>
        <div className="ann-loading-icon ann-icon-accent">
          <Megaphone style={{ width: 20, height: 20, color: panelInk(ACCENT) }} strokeWidth={1.5} />
        </div>
        <LoadingDots />
      </div>
    </>
  );

  return (
    <section className="moon-module moon-module--announcements">
      <style>{STYLES}</style>

      {modalOpen && canEdit && (
        <CreateModal key={editing?.id ?? 'nuevo'} onClose={cerrarModal} onSuccess={load}
          canEdit={canEdit} editing={editing}
          createdByUid={currentUser?.uid ?? userProfile?.uid ?? ''}
          createdByName={userProfile?.displayName || 'Administrador'} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div data-moon-reveal="heading" className="moon-module-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{ width: 40, height: 40, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                className="ann-icon-accent">
                <Megaphone style={{ width: 18, height: 18, color: panelInk(ACCENT) }} strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="moon-page-title ann-heading">Anuncios</h1>
                <p className="ann-subtext">
                  {announcements.length} {announcements.length !== 1 ? 'publicaciones' : 'publicación'}
                  {important.length > 0 && (
                    <span style={{ color: 'rgba(248,113,113,0.8)', marginLeft: 8 }}>
                      · {important.length} importante{important.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {important.length > 0 && (
              <div className="ann-filter-pill">
                <button type="button" className={`ann-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
                <button type="button" className={`ann-filter-btn ${filter === 'important' ? 'active-imp' : ''}`} onClick={() => setFilter('important')}>⚑ Importantes</button>
              </div>
            )}
            {canEdit && (
              <button type="button" className="ann-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
                <Plus style={{ width: 16, height: 16 }} strokeWidth={2} />
                Nuevo anuncio
              </button>
            )}
          </div>
        </div>

        <div className="enterprise-toolbar" aria-label="Buscar y organizar anuncios">
          <div className="enterprise-toolbar__search"><Search aria-hidden="true" /><input aria-label="Buscar anuncios" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar un anuncio, tema o autor" /></div>
          <select aria-label="Orden de anuncios" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
            <option value="recent">Más recientes primero</option><option value="priority">Prioridad primero</option><option value="oldest">Más antiguos primero</option>
          </select>
          <span className="enterprise-toolbar__results" role="status">{visible.length} de {announcements.length} publicaciones</span>
          {(term || filter !== 'all' || sortBy !== 'recent') && <button type="button" className="enterprise-action" onClick={() => { setSearch(''); setFilter('all'); setSortBy('recent'); }}>Restablecer vista</button>}
        </div>

        {/* Banner */}
        {filter === 'all' && important.length > 0 && (
          <div className="ann-banner">
            <div style={{ position: 'relative', width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(248,113,113,0.1)', animation: 'ann-pulse-ring 2s ease-in-out infinite' }} />
              <Bell style={{ width: 16, height: 16, color: panelInk(DANGER), position: 'relative', zIndex: 1 }} strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 300, color: panelInk(DANGER) }}>
                {important.length} anuncio{important.length !== 1 ? 's' : ''} importante{important.length !== 1 ? 's' : ''} activo{important.length !== 1 ? 's' : ''}
              </p>
              <p style={{ fontSize: 11, fontWeight: 300, color: 'rgba(248,113,113,0.55)', marginTop: 2 }}>
                {important[0]?.title}{important.length > 1 && ` y ${important.length - 1} más`}
              </p>
            </div>
            <button type="button" onClick={() => setFilter('important')}
              style={{ fontSize: 12, fontWeight: 300, padding: '6px 14px', borderRadius: 10, whiteSpace: 'nowrap',
                color: panelInk(DANGER), background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.22)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Ver todos →
            </button>
          </div>
        )}

        {/* List */}
        {visible.length === 0 ? (
          <div className="ann-empty">
            <div className="ann-empty-icon">
              <Megaphone style={{ width: 20, height: 20, color: 'var(--moon-muted)' }} strokeWidth={1} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 300, color: 'var(--moon-muted)' }}>
              {term ? 'Ningún anuncio coincide con tu búsqueda' : filter === 'important' ? 'No hay anuncios importantes' : 'No hay anuncios publicados'}
            </p>
            {filter === 'important' && (
              <button type="button" onClick={() => setFilter('all')}
                style={{ marginTop: 10, fontSize: 12, fontWeight: 300, color: panelInk(ACCENT), background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                Ver todos
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visible.map((a, i) => (
              <AnnouncementCard key={a.id} a={a} canEdit={canEdit} onDelete={handleDelete} onEdit={handleEdit} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Announcements;
