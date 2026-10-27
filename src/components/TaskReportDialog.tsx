import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
/**
 * TaskReportDialog.tsx
 * Diálogo para que cada persona reporte cómo va una tarea.
 * - Estado: Completada / En desarrollo / No completada
 * - Comentario (siempre) y motivo (obligatorio si "No completada")
 * - Hasta 5 archivos de 10 MB en Supabase
 * - Edita el propio reporte si ya existía
 * Al guardar avisa en la campana a quien creó la tarea.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, Loader2, Upload, Trash2,
  FileImage, FileText, File, AlertCircle, Clock, Send, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadReportFile, deleteReportFile } from '@/lib/supabaseclient';
import {
  createTaskReport, updateTaskReport, getMyReport,
  type TaskReport, type ReportStatus, type Attachment,
} from '@/lib/taskReports';
import { avisarTarea } from '@/lib/tareas';
import { abrirExterno } from '@/lib/escritorio';
import type { UserProfile } from '@/types';
import '@/components/tareas/tareas.css';

// ── Configuración de estados ──────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ReportStatus; label: string; ayuda: string; icon: React.ReactNode; color: string }[] = [
  { value: 'completed',     label: 'Completada',    ayuda: 'Terminé la tarea',        icon: <CheckCircle2 size={16} />, color: '#34d399' },
  { value: 'in-progress',   label: 'En desarrollo', ayuda: 'Sigo trabajando en ella', icon: <Clock size={16} />,        color: '#60a5fa' },
  { value: 'not-completed', label: 'No completada', ayuda: 'No pude completarla',     icon: <XCircle size={16} />,      color: '#f87171' },
];

const MAX_FILES    = 5;
const MAX_FILE_MB  = 10;
const MAX_FILE_B   = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'video/mp4', 'video/webm',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <FileImage size={15} />;
  if (mime === 'application/pdf') return <FileText size={15} style={{ color: '#f87171' }} />;
  return <File size={15} />;
}

function msgError(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? '');
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TaskReportDialogProps {
  open:        boolean;
  onClose:     () => void;
  /** Lo único que hace falta de la tarea (sirve el Task del Calendario o una Tarea). */
  task:        { id: string; title: string; createdBy?: string };
  userProfile: UserProfile;
}

// ── Componente ────────────────────────────────────────────────────────────────

const TaskReportDialog: React.FC<TaskReportDialogProps> = ({
  open, onClose, task, userProfile,
}) => {
  const [reportStatus, setReportStatus] = useState<ReportStatus>('in-progress');
  const [comment,      setComment]      = useState('');
  const commentEmojiRef = useRef<HTMLTextAreaElement>(null);
  const reasonEmojiRef = useRef<HTMLTextAreaElement>(null);
  const [reason,       setReason]       = useState('');
  const [attachments,  setAttachments]  = useState<Attachment[]>([]);
  const [uploading,    setUploading]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [existingReport, setExisting]   = useState<TaskReport | null>(null);
  // Para qué tarea/usuario ya se cargó el reporte previo; mientras no coincida, se está cargando.
  const [cargadoPara,  setCargadoPara]  = useState<string | null>(null);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [reintento,    setReintento]    = useState(0);
  const [arrastrando,  setArrastrando]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Archivos subidos en esta sesión del diálogo que todavía no están en un
  // reporte guardado: si se cancela, se borran para no dejar huérfanos.
  const subidosSesion = useRef<Set<string>>(new Set());
  // Adjuntos ya guardados que el usuario quitó: se borran del almacenamiento
  // solo cuando el reporte se guarda (si cancela, el reporte los sigue usando).
  const quitadosGuardados = useRef<Set<string>>(new Set());
  // Cambia en cada cierre: una subida que termina con el diálogo ya cerrado se descarta.
  const sesion = useRef(0);

  const clave = `${task.id}|${userProfile.uid}`;
  const cargando = open && cargadoPara !== clave && !loadError;

  const descartarSubidas = () => {
    const urls = [...subidosSesion.current];
    subidosSesion.current.clear();
    quitadosGuardados.current.clear();
    urls.forEach(url => { deleteReportFile(url).catch(console.error); });
  };

  // Si el diálogo se desmonta sin guardar (el Calendario lo quita al cerrar), limpia lo subido.
  // El Set y el ref son siempre los mismos objetos: se capturan para usarlos en la limpieza.
  useEffect(() => {
    const subidos = subidosSesion.current;
    const ses = sesion;
    return () => {
      ses.current++;
      const urls = [...subidos];
      subidos.clear();
      urls.forEach(url => { deleteReportFile(url).catch(console.error); });
    };
  }, []);

  // Cargar reporte previo del usuario
  useEffect(() => {
    if (!open) return;
    let vigente = true;
    getMyReport(task.id, userProfile.uid)
      .then(rep => {
        if (!vigente) return;
        setError(null);
        setLoadError(null);
        setExisting(rep);
        setReportStatus(rep?.reportStatus ?? 'in-progress');
        setComment(rep?.comment ?? '');
        setReason(rep?.reason ?? '');
        setAttachments(rep?.attachments ?? []);
        setCargadoPara(`${task.id}|${userProfile.uid}`);
      })
      .catch(err => {
        if (!vigente) return;
        console.error('Error cargando el reporte previo:', err);
        // Sin saber si ya hay un reporte no se deja enviar: se duplicaría.
        setLoadError('No se pudo cargar tu reporte anterior. Revisa tu conexión e inténtalo de nuevo.');
      });
    return () => { vigente = false; };
  }, [open, task.id, userProfile.uid, reintento]);

  const handleClose = () => {
    if (saving) return;
    sesion.current++;
    descartarSubidas();
    setCargadoPara(null);
    setLoadError(null);
    setError(null);
    onClose();
  };

  // ── Subida de archivos ───────────────────────────────────────────────────────

  const handleFiles = async (files: FileList | null) => {
    if (!files || uploading) return;
    const arr = Array.from(files);
    // Se limpia para que volver a elegir el mismo archivo dispare onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Validaciones
    if (attachments.length + arr.length > MAX_FILES) {
      setError(`Máximo ${MAX_FILES} archivos por reporte.`);
      return;
    }
    const invalid = arr.filter(f => !ALLOWED_TYPES.includes(f.type) || f.size > MAX_FILE_B);
    if (invalid.length) {
      setError(`Algunos archivos no se pueden adjuntar (tipo no permitido o más de ${MAX_FILE_MB} MB).`);
      return;
    }
    setError(null);
    setUploading(true);
    const miSesion = sesion.current;
    try {
      // allSettled: si uno falla, los que sí subieron no se pierden (ni quedan huérfanos).
      const results = await Promise.allSettled(arr.map(f => uploadReportFile(f, task.id, userProfile.uid)));
      const ok = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));
      if (miSesion !== sesion.current) {
        ok.forEach(a => { deleteReportFile(a.url).catch(console.error); });
        return;
      }
      ok.forEach(a => subidosSesion.current.add(a.url));
      setAttachments(prev => [...prev, ...ok]);
      const fallidos = results.filter(r => r.status === 'rejected');
      if (fallidos.length) {
        const r = fallidos[0] as PromiseRejectedResult;
        setError(`${fallidos.length} archivo(s) no se pudieron subir: ${msgError(r.reason)}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = (att: Attachment) => {
    setAttachments(prev => prev.filter(a => a.url !== att.url));
    if (subidosSesion.current.has(att.url)) {
      // Subido en esta sesión y nunca guardado: nadie más lo usa, se borra ya.
      subidosSesion.current.delete(att.url);
      deleteReportFile(att.url).catch(console.error);
    } else {
      quitadosGuardados.current.add(att.url);
    }
  };

  // ── Guardar reporte ──────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cargando || loadError) return;
    if (reportStatus === 'not-completed' && !reason.trim()) {
      setError('Cuéntanos qué impidió completar la tarea.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        taskId:       task.id,
        taskTitle:    task.title,
        reportedBy:   userProfile.uid,
        reporterName: userProfile.displayName ?? 'Usuario',
        reporterRole: userProfile.role,
        reportStatus,
        comment:      comment.trim(),
        reason:       reportStatus === 'not-completed' ? reason.trim() : '',
        attachments,
      };
      if (existingReport) {
        await updateTaskReport(existingReport.id, payload);
      } else {
        await createTaskReport(payload);
      }
      // Ya guardado: lo subido pasa a ser del reporte y lo quitado ya no se usa.
      const aBorrar = [...quitadosGuardados.current];
      subidosSesion.current.clear();
      quitadosGuardados.current.clear();
      aBorrar.forEach(url => { deleteReportFile(url).catch(console.error); });
      sesion.current++;
      setCargadoPara(null);
      // Quien creó la tarea se entera en su campana (si no es uno mismo).
      if (task.createdBy && task.createdBy !== userProfile.uid) {
        void avisarTarea('task-report', [task.createdBy], {
          taskId: task.id, taskTitle: task.title, autorUid: userProfile.uid,
          autorNombre: userProfile.displayName, estado: reportStatus,
        });
      }
      toast.success(existingReport ? 'Reporte actualizado' : 'Reporte enviado');
      onClose();
    } catch (e) {
      setError(msgError(e) || 'No se pudo guardar el reporte.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const caja = (color: string, texto: string) => (
    <div className="tr-aviso" style={{ ['--tr-c' as string]: color }}>
      <AlertCircle size={15} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <p>{texto}</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="tr-acento w-[calc(100vw-2rem)] sm:max-w-[560px] p-0 gap-0">
        <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--tr-linea)' }}>
          <div className="tr-av tr-av-lg" style={{ borderRadius: 11 }}><Send size={15} /></div>
          <div className="min-w-0 pr-8">
            <DialogTitle className="text-[15px] font-normal" style={{ color: 'var(--text-primary)' }}>
              {existingReport ? 'Actualizar mi reporte' : 'Reportar avance'}
            </DialogTitle>
            <DialogDescription className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              <EmojiText text={task.title} />
            </DialogDescription>
          </div>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-14" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs">Cargando tu reporte…</span>
          </div>
        ) : loadError ? (
          <div className="px-5 sm:px-6 py-5 space-y-4">
            {caja('#f87171', loadError)}
            <div className="flex gap-2 justify-end">
              <button type="button" className="tr-btn tr-btn-fantasma" onClick={handleClose}>Cerrar</button>
              <button type="button" className="tr-btn tr-btn-primario" onClick={() => { setLoadError(null); setReintento(n => n + 1); }}>Reintentar</button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="px-5 sm:px-6 py-5 space-y-5">

            {/* ── Estado ── */}
            <div>
              <span className="tr-form-label">¿Cómo va la tarea? <span className="tr-req">*</span></span>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Estado de la tarea">
                {STATUS_OPTIONS.map(opt => {
                  const sel = reportStatus === opt.value;
                  return (
                    <button key={opt.value} type="button" role="radio" aria-checked={sel}
                      onClick={() => { setReportStatus(opt.value); setError(null); }}
                      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-center transition-all"
                      style={{
                        border: `1px solid ${sel ? `${opt.color}66` : 'var(--campo-borde, var(--tr-linea))'}`,
                        background: sel ? `${opt.color}14` : 'var(--campo-fondo, var(--tr-card-2))',
                        color: sel ? opt.color : 'var(--text-muted)',
                      }}>
                      {opt.icon}
                      <span className="text-[12px] leading-tight" style={{ color: sel ? opt.color : 'var(--text-primary)' }}>{opt.label}</span>
                      <span className="text-[10px] leading-tight hidden sm:block" style={{ color: 'var(--text-muted)' }}>{opt.ayuda}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Motivo (solo si No completada) ── */}
            {reportStatus === 'not-completed' && (
              <div>
                <label className="tr-form-label" htmlFor="rep-motivo">¿Qué lo impidió? <span className="tr-req">*</span></label>
                <textarea ref={reasonEmojiRef} id="rep-motivo" value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={2000}
                  placeholder="Explica qué impidió completar la tarea…" className="w-full px-3 py-2.5 text-sm resize-none" />
                <EmojiButton value={reason} onChange={setReason} inputRef={reasonEmojiRef} maxLength={2000} disabled={saving} label="Añadir emoji al motivo" />
              </div>
            )}

            {/* ── Comentario ── */}
            <div>
              <label className="tr-form-label" htmlFor="rep-comentario">Comentario o avance</label>
              <textarea ref={commentEmojiRef} id="rep-comentario" value={comment} onChange={e => setComment(e.target.value)} rows={3} maxLength={4000}
                placeholder="Qué hiciste, qué falta o cualquier nota útil…" className="w-full px-3 py-2.5 text-sm resize-none leading-relaxed" />
              <EmojiButton value={comment} onChange={setComment} inputRef={commentEmojiRef} maxLength={4000} disabled={saving} label="Añadir emoji al comentario de la tarea" />
            </div>

            {/* ── Adjuntos ── */}
            <div>
              <span className="tr-form-label">Capturas o archivos <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{attachments.length}/{MAX_FILES}</span></span>
              <button type="button"
                className="w-full rounded-xl p-4 text-center transition-colors"
                style={{
                  border: `1px dashed ${arrastrando ? 'var(--tr-a)' : 'var(--tr-linea-2)'}`,
                  background: arrastrando ? 'color-mix(in srgb, var(--tr-a) 7%, transparent)' : 'transparent',
                  color: 'var(--text-muted)', cursor: uploading || attachments.length >= MAX_FILES ? 'default' : 'pointer',
                }}
                disabled={uploading || attachments.length >= MAX_FILES}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={e => { e.preventDefault(); setArrastrando(false); void handleFiles(e.dataTransfer.files); }}>
                {uploading ? (
                  <span className="flex items-center justify-center gap-2 text-xs"><Loader2 size={15} className="animate-spin" /> Subiendo…</span>
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <Upload size={18} />
                    <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                      {attachments.length >= MAX_FILES ? 'Llegaste al máximo de archivos' : 'Haz clic o arrastra archivos aquí'}
                    </span>
                    <span className="text-[11px]">PNG, JPG, GIF, WEBP, PDF o MP4 · hasta {MAX_FILE_MB} MB cada uno</span>
                  </span>
                )}
              </button>
              <input ref={fileInputRef} type="file" multiple accept={ALLOWED_TYPES.join(',')} className="hidden"
                onChange={e => { void handleFiles(e.target.files); }} />

              {attachments.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {attachments.map(att => (
                    <div key={att.url} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl group"
                      style={{ background: 'var(--tr-card-2)', border: '1px solid var(--tr-linea)' }}>
                      <span className="tr-av" style={{ width: 34, height: 34, borderRadius: 9, color: 'var(--text-muted)', background: 'var(--tr-hover)' }}>
                        {att.type.startsWith('image/') ? <img src={att.url} alt="" /> : fileIcon(att.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{att.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatBytes(att.size)}</p>
                      </div>
                      <button type="button" className="tr-icono" onClick={() => void abrirExterno(att.url)} aria-label={`Abrir ${att.name}`} title="Abrir">
                        <ExternalLink size={14} />
                      </button>
                      <button type="button" className="tr-icono tr-icono-peligro" onClick={() => handleRemoveAttachment(att)} aria-label={`Quitar ${att.name}`} title="Quitar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && caja('#f87171', error)}
          </div>

          {/* ── Acciones ── */}
          <div className="sticky bottom-0 z-10 flex justify-end gap-2 px-5 sm:px-6 py-4" style={{ borderTop: '1px solid var(--tr-linea)', background: 'var(--tr-card-2)' }}>
            <button type="button" className="tr-btn tr-btn-fantasma" onClick={handleClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="tr-btn tr-btn-primario" disabled={saving || uploading}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {saving ? 'Guardando…' : existingReport ? 'Actualizar reporte' : 'Enviar reporte'}
            </button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TaskReportDialog;
