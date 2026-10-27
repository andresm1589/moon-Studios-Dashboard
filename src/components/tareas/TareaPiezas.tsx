import { EmojiText } from '@/components/discord/EmojiText';
import { panelInk } from '@/lib/panelColors';
import { useState } from 'react';
import {
  Check, Pencil, Trash2, CalendarDays, Flag, UsersRound, Users, UserCheck, MessageSquareText,
  FileText, Play, CheckCheck, Send, Clock, AlertTriangle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { abrirExterno } from '@/lib/escritorio';
import {
  type Tarea, type EstadoTarea, type ReporteTarea, ESTADOS, PRIORIDADES, ESTADOS_REPORTE,
  plazo, fechaCorta, porRevisar,
} from '@/lib/tareas';
import type { UserProfile } from '@/types';
import './tareas.css';

export type Archivo = { url: string; name: string; type: string };

const cssVar = (c: string) => ({ ['--tr-c' as string]: panelInk(c) });

const haceCuanto = (d: Date | null) => {
  if (!d) return '';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return dias < 7 ? `hace ${dias} d` : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
};

/** A quién le toca: avatar y nombre, el rol o "Todo el equipo". */
export function Asignado({ tarea, usuarios, grande = false }: { tarea: Tarea; usuarios: UserProfile[]; grande?: boolean }) {
  if (tarea.assignedTo) {
    const u = usuarios.find(x => x.uid === tarea.assignedTo);
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0" style={{ fontSize: grande ? 13 : 11, color: panelInk(grande ? 'var(--moon-ink)' : 'var(--moon-muted)') }}>
        <span className={`tr-av${grande ? ' tr-av-lg' : ''}`}>{u?.avatar ? <img src={u.avatar} alt="" /> : (u?.displayName?.[0] ?? '?').toUpperCase()}</span>
        <span className="truncate">{u?.displayName ?? 'Usuario eliminado'}</span>
      </span>
    );
  }
  if (tarea.assignedToRole) {
    return <span className="inline-flex items-center gap-1.5" style={{ fontSize: grande ? 13 : 11, color: panelInk(grande ? 'var(--moon-ink)' : 'var(--moon-muted)') }}><UsersRound size={grande ? 15 : 12} /> {tarea.assignedToRole}</span>;
  }
  return <span className="inline-flex items-center gap-1.5" style={{ fontSize: grande ? 13 : 11, color: panelInk(grande ? 'var(--moon-ink)' : 'var(--moon-muted)') }}><Users size={grande ? 15 : 12} /> Todo el equipo</span>;
}

export function ChipEstado({ estado }: { estado: EstadoTarea }) {
  const e = ESTADOS[estado];
  return <span className="tr-chip" style={cssVar(e.color)}><span className="tr-punto" />{e.label}</span>;
}

export function ChipPlazo({ tarea }: { tarea: Tarea }) {
  const p = plazo(tarea);
  if (p.tipo === 'completada') return null;
  const fuerte = p.tipo === 'vencida' || p.tipo === 'hoy' || p.tipo === 'pronto';
  return (
    <span className={`tr-chip${fuerte ? '' : ' tr-chip-plano'}`} style={fuerte ? cssVar(p.color) : undefined} title={tarea.fecha ? tarea.fecha.toLocaleDateString('es-PE', { dateStyle: 'full' }) : undefined}>
      {p.tipo === 'vencida' ? <AlertTriangle size={11} /> : <CalendarDays size={11} />}
      {p.tipo === 'normal' || p.tipo === 'sin-fecha' ? fechaCorta(tarea.fecha) : p.texto}
    </span>
  );
}

/** Resumen de los reportes de una tarea: cuántos y cómo dijo el último. */
export function ChipReportes({ reportes }: { reportes: ReporteTarea[] }) {
  if (reportes.length === 0) return null;
  const ultimo = ESTADOS_REPORTE[reportes[0].estado];
  return (
    <span className="tr-chip" style={cssVar(ultimo.color)} title={`Último reporte: ${ultimo.label} (${reportes[0].autor})`}>
      <MessageSquareText size={11} /> {reportes.length} · {ultimo.label}
    </span>
  );
}

interface FilaProps {
  tarea: Tarea;
  usuarios: UserProfile[];
  reportes: ReporteTarea[];
  onAbrir: () => void;
  /** Solo para quien puede cambiarla: marcar/desmarcar como completada. */
  onCompletar?: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
  /** Para el resto: reportar avance. */
  onReportar?: () => void;
  compacta?: boolean;
  arrastrable?: boolean;
}

export function TareaFila({ tarea, usuarios, reportes, onAbrir, onCompletar, onEditar, onEliminar, onReportar, compacta, arrastrable }: FilaProps) {
  const hecha = tarea.status === 'completed';
  const pri = PRIORIDADES[tarea.priority];
  const revisar = porRevisar(tarea, reportes);
  return (
    <div data-moon-reveal="row" className="tr-fila tr-entrar group" data-hecha={hecha} role="button" tabIndex={0}
      onClick={onAbrir} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}
      draggable={arrastrable} onDragStart={arrastrable ? e => { e.dataTransfer.setData('text/tarea', tarea.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}>
      {onCompletar ? (
        <button type="button" className="tr-check" data-on={hecha} aria-label={hecha ? 'Marcar como pendiente' : 'Marcar como completada'}
          title={hecha ? 'Marcar como pendiente' : 'Marcar como completada'}
          onClick={e => { e.stopPropagation(); onCompletar(); }}>
          <Check size={13} strokeWidth={3} />
        </button>
      ) : (
        <span className="tr-punto" style={{ ...cssVar(pri.color), marginTop: 7 }} title={`Prioridad ${pri.label.toLowerCase()}`} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {onCompletar && <span className="tr-punto" style={cssVar(pri.color)} title={`Prioridad ${pri.label.toLowerCase()}`} />}
          <p className="tr-titulo"><EmojiText text={tarea.title} /></p>
        </div>
        {!compacta && tarea.description && <p className="tr-desc mt-0.5"><EmojiText text={tarea.description} /></p>}
        <div className="tr-meta">
          {!compacta && <ChipEstado estado={tarea.status} />}
          <ChipPlazo tarea={tarea} />
          {revisar
            ? <span className="tr-chip" style={cssVar('#a78bfa')}><CheckCheck size={11} /> Por confirmar</span>
            : <ChipReportes reportes={reportes} />}
          <Asignado tarea={tarea} usuarios={usuarios} />
        </div>
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        {onReportar && (
          <button type="button" className="tr-btn tr-btn-chico" onClick={e => { e.stopPropagation(); onReportar(); }}>
            <Send size={12} /> Reportar
          </button>
        )}
        {onEditar && <button type="button" className="tr-icono" title="Editar" aria-label="Editar" onClick={e => { e.stopPropagation(); onEditar(); }}><Pencil size={14} /></button>}
        {onEliminar && <button type="button" className="tr-icono tr-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={e => { e.stopPropagation(); onEliminar(); }}><Trash2 size={14} /></button>}
      </div>
    </div>
  );
}

// ─── Detalle ──────────────────────────────────────────────────────────────────

interface DetalleProps {
  tarea: Tarea | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  usuarios: UserProfile[];
  reportes: ReporteTarea[];
  /** CEO / Administración */
  gestor: boolean;
  onCambiarEstado?: (e: EstadoTarea) => void;
  onEditar?: () => void;
  onEliminar?: () => void;
  onReportar?: () => void;
  onVerArchivo?: (a: Archivo) => void;
}

function Miniaturas({ archivos, onVer }: { archivos: ReporteTarea['archivos']; onVer: (a: Archivo) => void }) {
  if (archivos.length === 0) return null;
  return (
    <div className="tr-miniaturas">
      {archivos.map((a, i) => (
        <button key={i} type="button" className="tr-mini" title={a.name} onClick={() => onVer(a)}>
          {a.type.startsWith('image/') ? <img src={a.url} alt={a.name} loading="lazy" />
            : a.type.startsWith('video/') ? <Play size={16} /> : <FileText size={16} />}
        </button>
      ))}
    </div>
  );
}

export function TareaDetalleDialog({ tarea, open, onOpenChange, usuarios, reportes, gestor, onCambiarEstado, onEditar, onEliminar, onReportar, onVerArchivo }: DetalleProps) {
  const [verTodos, setVerTodos] = useState(false);
  if (!tarea) return null;
  const pri = PRIORIDADES[tarea.priority];
  const p = plazo(tarea);
  const revisar = porRevisar(tarea, reportes);
  const quienCompleto = reportes.find(r => r.estado === 'completed');
  const ver = onVerArchivo ?? ((a: Archivo) => void abrirExterno(a.url));
  const lista = verTodos ? reportes : reportes.slice(0, 3);

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setVerTodos(false); }}>
      <DialogContent className="tr-acento w-[calc(100vw-2rem)] sm:max-w-[640px] p-0 gap-0">
        <div className="px-5 sm:px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--tr-linea)' }}>
          <div className="flex items-center gap-2 flex-wrap pr-8">
            <ChipEstado estado={tarea.status} />
            <span className="tr-chip" style={cssVar(pri.color)}><Flag size={11} /> {pri.label}</span>
            <ChipPlazo tarea={tarea} />
          </div>
          <DialogTitle className="text-[17px] font-normal mt-3 leading-snug" style={{ color: 'var(--moon-ink)' }}><EmojiText text={tarea.title} /></DialogTitle>
          <DialogDescription className="text-xs mt-1" style={{ color: 'var(--moon-muted)' }}>
            {tarea.createdByName ? `Creada por ${tarea.createdByName}` : 'Tarea'}{tarea.creada ? ` · ${haceCuanto(tarea.creada)}` : ''}
          </DialogDescription>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-5">
          {gestor && revisar && quienCompleto && (
            <div className="tr-aviso" style={cssVar('#a78bfa')}>
              <CheckCheck size={16} style={{ color: panelInk('#a78bfa'), flexShrink: 0, marginTop: 1 }} />
              <div className="flex-1 min-w-0">
                <p><b style={{ fontWeight: 500 }}>{quienCompleto.autor || 'Alguien'}</b> reportó que la terminó. Revisa su reporte y confírmala.</p>
              </div>
              {onCambiarEstado && (
                <button type="button" className="tr-btn tr-btn-chico tr-btn-primario" onClick={() => onCambiarEstado('completed')}>
                  <Check size={12} /> Confirmar
                </button>
              )}
            </div>
          )}

          <div>
            <p className="tr-dato-lbl">Descripción</p>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: panelInk(tarea.description ? 'var(--moon-ink)' : 'var(--moon-muted)') }}>
              {tarea.description || 'Sin descripción.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="tr-dato">
              <p className="tr-dato-lbl">Fecha límite</p>
              <p className="tr-dato-val"><CalendarDays size={14} style={{ color: 'var(--moon-muted)' }} />
                {tarea.fecha ? tarea.fecha.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' }) : 'Sin fecha'}
              </p>
              {p.tipo !== 'completada' && p.tipo !== 'sin-fecha' && <p className="text-[11px] mt-1" style={{ color: panelInk(p.color) }}>{p.texto}</p>}
            </div>
            <div className="tr-dato">
              <p className="tr-dato-lbl">Asignada a</p>
              <div className="tr-dato-val"><Asignado tarea={tarea} usuarios={usuarios} grande /></div>
            </div>
          </div>

          {gestor && onCambiarEstado && (
            <div>
              <p className="tr-dato-lbl">Cambiar estado</p>
              <div className="tr-seg tr-seg-lleno" role="group" aria-label="Estado">
                {(Object.keys(ESTADOS) as EstadoTarea[]).map(s => (
                  <button key={s} type="button" aria-pressed={tarea.status === s} onClick={() => tarea.status !== s && onCambiarEstado(s)}>
                    <span className="tr-punto" style={cssVar(ESTADOS[s].color)} /> {ESTADOS[s].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reportes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="tr-dato-lbl" style={{ margin: 0 }}>{gestor ? 'Reportes del equipo' : 'Tu reporte'} {reportes.length > 0 && `(${reportes.length})`}</p>
              {onReportar && (
                <button type="button" className="tr-btn tr-btn-chico" onClick={onReportar}>
                  <Send size={12} /> {reportes.length ? 'Actualizar reporte' : 'Reportar avance'}
                </button>
              )}
            </div>
            {reportes.length === 0 ? (
              <p className="text-xs rounded-xl px-3 py-4 text-center" style={{ color: 'var(--moon-muted)', border: '1px dashed var(--tr-linea-2)' }}>
                {gestor ? 'Nadie ha reportado esta tarea todavía.' : 'Aún no reportas tu avance.'}
              </p>
            ) : (
              <div className="space-y-2">
                {lista.map(r => {
                  const e = ESTADOS_REPORTE[r.estado];
                  return (
                    <div data-moon-reveal="row" key={r.id} className="tr-reporte">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="tr-av">{(r.autor?.[0] ?? '?').toUpperCase()}</span>
                        <span className="text-[13px] truncate" style={{ color: 'var(--moon-ink)' }}>{r.autor || 'Usuario'}</span>
                        {r.rol && <span className="text-[11px] truncate" style={{ color: 'var(--moon-muted)' }}>{r.rol}</span>}
                        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--moon-muted)' }}><Clock size={11} />{haceCuanto(r.fecha)}</span>
                          <span className="tr-chip" style={cssVar(e.color)}>{e.label}</span>
                        </span>
                      </div>
                      {r.motivo && <p className="text-xs mt-2 leading-relaxed" style={{ color: panelInk('#f87171') }}>Motivo: <EmojiText text={r.motivo} /></p>}
                      {r.comentario && <p className="text-xs mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--moon-ink)' }}><EmojiText text={r.comentario} /></p>}
                      <Miniaturas archivos={r.archivos} onVer={ver} />
                    </div>
                  );
                })}
                {reportes.length > 3 && (
                  <button type="button" className="tr-btn tr-btn-fantasma tr-btn-chico w-full" onClick={() => setVerTodos(v => !v)}>
                    {verTodos ? 'Ver menos' : `Ver los ${reportes.length} reportes`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {gestor && (onEditar || onEliminar) && (
          <div className="sticky bottom-0 z-10 flex items-center gap-2 px-5 sm:px-6 py-4" style={{ borderTop: '1px solid var(--tr-linea)', background: 'var(--tr-card-2)' }}>
            {onEliminar && <button type="button" className="tr-btn tr-btn-peligro tr-btn-chico" onClick={onEliminar}><Trash2 size={13} /> Eliminar</button>}
            <span className="flex-1" />
            {onEditar && <button type="button" className="tr-btn tr-btn-primario" onClick={onEditar}><Pencil size={13} /> Editar</button>}
          </div>
        )}
        {!gestor && (
          <div className="flex items-center gap-2 px-5 sm:px-6 py-3" style={{ borderTop: '1px solid var(--tr-linea)', background: 'var(--tr-card-2)' }}>
            <UserCheck size={13} style={{ color: 'var(--moon-muted)' }} />
            <p className="text-[11px]" style={{ color: 'var(--moon-muted)' }}>Tu reporte le llega a quien creó la tarea; CEO o Administración la marcan como completada.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
