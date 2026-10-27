import { EmojiButton } from '@/components/discord/EmojiButton';
import { useMemo, useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  ClipboardList, Flag, CalendarDays, UserCheck, UsersRound, Users, Search, Check, Loader2, Bell,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { createTask, updateTask, logActivity } from '@/lib/firebase';
import {
  type Tarea, type EstadoTarea, type PrioridadTarea, ESTADOS, PRIORIDADES,
  aInputFecha, deInputFecha, destinatarios, avisarTarea,
} from '@/lib/tareas';
import type { UserProfile, UserRole } from '@/types';
import './tareas.css';

// ─── Formulario único para crear y editar tareas ──────────────────────────────
// Lo usan el Panel CEO y Mis tareas (CEO y Administración). Al guardar avisa en
// la campana a quien le toca la tarea y, si cambia el estado, a los asignados.

type Modo = 'user' | 'role' | 'team';

const ROLES_ASIGNABLES: UserRole[] = ['Administración', 'Diseño', 'Secretaría', 'Programación', 'Contador', 'Empleado', 'CEO'];

interface Props {
  open:          boolean;
  onOpenChange:  (v: boolean) => void;
  /** Tarea a editar; sin ella el formulario crea una nueva. */
  tarea?:        Tarea | null;
  /** Fecha sugerida para una tarea nueva ('yyyy-MM-dd'), p. ej. desde el Calendario. */
  fechaInicial?: string;
  usuarios:      UserProfile[];
  perfil:        UserProfile | null;
  onGuardada?:   (id: string) => void;
}

const sumarDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return aInputFecha(d); };

/** Cada apertura monta el formulario de nuevo: arranca con la tarea (o vacío). */
export default function TareaFormDialog(props: Props) {
  const clave = props.open ? `${props.tarea?.id ?? 'nueva'}|${props.fechaInicial ?? ''}` : 'cerrado';
  return <FormularioTarea key={clave} {...props} />;
}

function FormularioTarea({ open, onOpenChange, tarea, fechaInicial, usuarios, perfil, onGuardada }: Props) {
  const editando = !!tarea;
  const [titulo, setTitulo]       = useState(tarea?.title ?? '');
  const [desc, setDesc]           = useState(tarea?.description ?? '');
  const descEmojiRef = useRef<HTMLTextAreaElement>(null);
  const titleEmojiRef = useRef<HTMLInputElement>(null);
  const [prioridad, setPrioridad] = useState<PrioridadTarea>(tarea?.priority ?? 'medium');
  const [estado, setEstado]       = useState<EstadoTarea>(tarea?.status ?? 'pending');
  const [fecha, setFecha]         = useState(tarea ? aInputFecha(tarea.fecha) : (fechaInicial ?? ''));
  const [modo, setModo]           = useState<Modo>(tarea ? (tarea.assignedTo ? 'user' : tarea.assignedToRole ? 'role' : 'team') : 'user');
  const [persona, setPersona]     = useState(tarea?.assignedTo ?? '');
  const [rol, setRol]             = useState<UserRole | ''>(tarea?.assignedToRole ?? '');
  const [buscar, setBuscar]       = useState('');
  const [avisar, setAvisar]       = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento]     = useState(false);

  const roles = useMemo(() => {
    const extra = usuarios.map(u => u.role).filter(r => r && !ROLES_ASIGNABLES.includes(r));
    return [...ROLES_ASIGNABLES, ...new Set(extra)];
  }, [usuarios]);

  const personas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return [...usuarios]
      .filter(u => !q || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q))
      .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '', 'es'));
  }, [usuarios, buscar]);

  const asignacion = {
    assignedTo:     modo === 'user' ? persona || null : null,
    assignedToRole: modo === 'role' ? (rol || null) as UserRole | null : null,
  };
  const incompleta = (modo === 'user' && !persona) || (modo === 'role' && !rol);
  const para = incompleta ? [] : destinatarios(asignacion, usuarios, perfil?.uid);

  const errores = {
    titulo:  !titulo.trim() ? 'Escribe un título' : titulo.trim().length > 140 ? 'Máximo 140 caracteres' : '',
    fecha:   !fecha ? 'Elige la fecha límite' : '',
    asignar: modo === 'user' && !persona ? 'Elige a una persona' : modo === 'role' && !rol ? 'Elige un rol' : '',
  };
  const valido = !errores.titulo && !errores.fecha && !errores.asignar;
  const hoy = aInputFecha(new Date());

  const guardar = async () => {
    setIntento(true);
    if (!valido || guardando) return;
    setGuardando(true);
    const datos = {
      title: titulo.trim(), description: desc.trim(), priority: prioridad,
      date: deInputFecha(fecha), ...asignacion,
    };
    try {
      if (!editando) {
        const ref = await createTask({
          ...datos, status: 'pending',
          createdBy: perfil?.uid ?? '', createdByName: perfil?.displayName ?? '',
        });
        logActivity('TASK_CREATED', { title: datos.title }, perfil?.uid ?? '', perfil?.displayName ?? '').catch(() => {});
        if (avisar) void avisarTarea('task-assigned', para, { taskId: ref.id, taskTitle: datos.title, autorUid: perfil?.uid, autorNombre: perfil?.displayName });
        toast.success('Tarea creada', { description: para.length ? `Se avisó a ${para.length} persona${para.length === 1 ? '' : 's'}` : undefined });
        onGuardada?.(ref.id);
      } else if (tarea) {
        await updateTask(tarea.id, { ...datos, status: estado });
        logActivity('TASK_UPDATED', { taskId: tarea.id, title: datos.title }, perfil?.uid ?? '', perfil?.displayName ?? '').catch(() => {});
        if (avisar) {
          const antes = destinatarios(tarea, usuarios, perfil?.uid);
          const nuevos = para.filter(u => !antes.includes(u));
          if (nuevos.length) void avisarTarea('task-assigned', nuevos, { taskId: tarea.id, taskTitle: datos.title, autorUid: perfil?.uid, autorNombre: perfil?.displayName });
          if (estado !== tarea.status) void avisarTarea('task-status', para, { taskId: tarea.id, taskTitle: datos.title, autorUid: perfil?.uid, autorNombre: perfil?.displayName, estado });
        }
        toast.success('Cambios guardados');
        onGuardada?.(tarea.id);
      }
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error((e as { code?: string })?.code === 'permission-denied'
        ? 'No tienes permiso para guardar tareas'
        : 'No se pudo guardar la tarea');
    } finally { setGuardando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !guardando && onOpenChange(v)}>
      <DialogContent className="tr-acento w-[calc(100vw-2rem)] sm:max-w-[620px] p-0 gap-0">
        <form onSubmit={e => { e.preventDefault(); void guardar(); }} className="flex flex-col min-h-0">
          {/* Encabezado */}
          <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--tr-linea)' }}>
            <div className="tr-av tr-av-lg" style={{ borderRadius: 11 }}><ClipboardList size={16} /></div>
            <div className="min-w-0 pr-8">
              <DialogTitle className="text-[15px] font-normal" style={{ color: 'var(--moon-ink)' }}>
                {editando ? 'Editar tarea' : 'Nueva tarea'}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5" style={{ color: 'var(--moon-muted)' }}>
                {editando ? 'Los cambios se ven al instante en el Calendario y en Mis tareas.' : 'Define qué hay que hacer, para cuándo y quién se encarga.'}
              </DialogDescription>
            </div>
          </div>

          <div className="px-5 sm:px-6 py-5 space-y-5">
            {/* Título */}
            <div>
              <label className="tr-form-label" htmlFor="tr-titulo">Título <span className="tr-req">*</span></label>
              <input ref={titleEmojiRef} id="tr-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={160}
                placeholder="Ej: Preparar el informe mensual de ventas" className="w-full h-10 px-3 text-sm" />
              <EmojiButton value={titulo} onChange={setTitulo} inputRef={titleEmojiRef} maxLength={160} disabled={guardando} label="Añadir emoji al título de la tarea" />
              {intento && errores.titulo && <p className="tr-form-error">{errores.titulo}</p>}
            </div>

            {/* Descripción */}
            <div>
              <label className="tr-form-label" htmlFor="tr-desc">Descripción</label>
              <textarea ref={descEmojiRef} id="tr-desc" value={desc} onChange={e => setDesc(e.target.value)} rows={3} maxLength={4000}
                placeholder="Contexto, pasos o el resultado que esperas…" className="w-full px-3 py-2.5 text-sm resize-none leading-relaxed" />
              <EmojiButton value={desc} onChange={setDesc} inputRef={descEmojiRef} maxLength={4000} disabled={guardando} label="Añadir emoji a la descripción de la tarea" />
            </div>

            {/* Prioridad + fecha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="tr-form-label"><Flag size={12} /> Prioridad</span>
                <div className="tr-seg tr-seg-lleno" role="group" aria-label="Prioridad">
                  {(Object.keys(PRIORIDADES) as PrioridadTarea[]).reverse().map(p => (
                    <button key={p} type="button" aria-pressed={prioridad === p} onClick={() => setPrioridad(p)}>
                      <span className="tr-punto" style={{ ['--tr-c' as string]: PRIORIDADES[p].color }} /> {PRIORIDADES[p].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="tr-form-label" htmlFor="tr-fecha"><CalendarDays size={12} /> Fecha límite <span className="tr-req">*</span></label>
                <input id="tr-fecha" type="date" value={fecha} min={editando ? undefined : hoy} onChange={e => setFecha(e.target.value)} className="w-full h-10 px-3 text-sm" />
                <div className="tr-atajos">
                  {[['Hoy', 0], ['Mañana', 1], ['+7 días', 7], ['+14 días', 14]].map(([l, n]) => (
                    <button key={l} type="button" className="tr-filtro" style={{ padding: '3px 9px', fontSize: 11 }}
                      aria-pressed={fecha === sumarDias(n as number)} onClick={() => setFecha(sumarDias(n as number))}>{l}</button>
                  ))}
                </div>
                {intento && errores.fecha && <p className="tr-form-error">{errores.fecha}</p>}
              </div>
            </div>

            {/* Estado (solo al editar) */}
            {editando && (
              <div>
                <span className="tr-form-label">Estado</span>
                <div className="tr-seg tr-seg-lleno" role="group" aria-label="Estado">
                  {(Object.keys(ESTADOS) as EstadoTarea[]).map(s => (
                    <button key={s} type="button" aria-pressed={estado === s} onClick={() => setEstado(s)}>
                      <span className="tr-punto" style={{ ['--tr-c' as string]: ESTADOS[s].color }} /> {ESTADOS[s].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="tr-sep" />

            {/* Asignación */}
            <div>
              <span className="tr-form-label">Asignar a <span className="tr-req">*</span></span>
              <div className="tr-seg" role="group" aria-label="Asignar a">
                <button type="button" aria-pressed={modo === 'user'} onClick={() => setModo('user')}><UserCheck size={13} /> Persona</button>
                <button type="button" aria-pressed={modo === 'role'} onClick={() => setModo('role')}><UsersRound size={13} /> Rol</button>
                <button type="button" aria-pressed={modo === 'team'} onClick={() => setModo('team')}><Users size={13} /> Todo el equipo</button>
              </div>

              {modo === 'user' && (
                <>
                  <div className="relative mt-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--moon-muted)' }} />
                    <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, correo o rol…"
                      className="w-full h-9 pl-9 pr-3 text-sm" aria-label="Buscar persona" />
                  </div>
                  <div className="tr-lista-personas" role="listbox" aria-label="Personas">
                    {personas.length === 0 ? (
                      <p className="text-xs text-center py-6" style={{ color: 'var(--moon-muted)' }}>
                        {usuarios.length === 0 ? 'Todavía no hay usuarios' : 'Nadie coincide con la búsqueda'}
                      </p>
                    ) : personas.map(u => (
                      <button key={u.uid} type="button" className="tr-persona" aria-pressed={persona === u.uid} onClick={() => setPersona(u.uid)}>
                        <span className="tr-av tr-av-lg">{u.avatar ? <img src={u.avatar} alt="" /> : (u.displayName?.[0] ?? '?').toUpperCase()}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] truncate">{u.displayName || u.email}{u.uid === perfil?.uid && <span style={{ color: 'var(--moon-muted)' }}> (tú)</span>}</span>
                          <span className="block text-[11px] truncate" style={{ color: 'var(--moon-muted)' }}>{u.email}</span>
                        </span>
                        <span className="tr-chip tr-chip-plano">{u.role}</span>
                        {persona === u.uid && <Check size={15} style={{ color: 'var(--tr-a)' }} />}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {modo === 'role' && (
                <div className="tr-roles">
                  {roles.map(r => {
                    const n = usuarios.filter(u => u.role === r).length;
                    return (
                      <button key={r} type="button" className="tr-rol" aria-pressed={rol === r} onClick={() => setRol(r)}>
                        <span className="flex items-center justify-between text-[13px]">{r} {rol === r && <Check size={14} style={{ color: 'var(--tr-a)' }} />}</span>
                        <span className="text-[11px]" style={{ color: 'var(--moon-muted)' }}>{n} miembro{n === 1 ? '' : 's'}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {modo === 'team' && (
                <p className="tr-form-ayuda" style={{ marginTop: 10 }}>La verá todo el equipo en Mis tareas y en el Calendario; cualquiera puede reportar su avance.</p>
              )}
              {intento && errores.asignar && <p className="tr-form-error">{errores.asignar}</p>}
            </div>
          </div>

          {/* Pie */}
          <div className="sticky bottom-0 z-10 flex flex-col-reverse sm:flex-row sm:items-center gap-3 px-5 sm:px-6 py-4" style={{ borderTop: '1px solid var(--tr-linea)', background: 'var(--tr-card-2)' }}>
            <label className="flex items-center gap-2 text-xs mr-auto cursor-pointer" style={{ color: 'var(--moon-muted)' }}>
              <input type="checkbox" checked={avisar} onChange={e => setAvisar(e.target.checked)} />
              <Bell size={12} />
              {para.length > 0 ? `Avisar a ${para.length} persona${para.length === 1 ? '' : 's'}` : 'Avisar en la campana'}
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" className="tr-btn tr-btn-fantasma" onClick={() => onOpenChange(false)} disabled={guardando}>Cancelar</button>
              <button type="submit" className="tr-btn tr-btn-primario" disabled={guardando}>
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editando ? 'Guardar cambios' : 'Crear tarea'}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
