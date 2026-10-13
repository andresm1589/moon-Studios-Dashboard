import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db, subscribeToUsers } from '@/lib/firebase';
import { supabase } from '@/lib/supabaseclient';
import { leerCamposComunes, escribirCamposComunes } from '@/lib/devProjects';
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, getDocs, where, writeBatch,
  query, orderBy, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import type { Project, VersionChange, ProjectStatus, ChangeType } from '@/types';
import {
  Code2, Plus, Trash2, Search, GitBranch, Tag, X, Edit3,
  ExternalLink, ChevronDown, Play, Pause,
  CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw, Archive,
  BarChart3, Target, Zap, Flag, TrendingUp,
  GitCommit, Package, Shield, Activity, CheckSquare,
  Cpu, Layers,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { fechaNumerica } from '@/lib/ajustes/fecha';

// ─── Config visual ───────────────────────────────────────────────────────────
const STATUS_META: Record<ProjectStatus, { label: string; color: string; bg: string; icon: React.FC<any> }> = {
  planning:  { label: 'Planificación', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', icon: Clock },
  active:    { label: 'Activo',        color: '#34d399', bg: 'rgba(52,211,153,0.1)',  icon: Play },
  paused:    { label: 'Pausado',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: Pause },
  completed: { label: 'Completado',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: CheckCircle2 },
  cancelled: { label: 'Cancelado',     color: '#f87171', bg: 'rgba(248,113,113,0.1)', icon: XCircle },
  // Estado que pone el panel Proyectos (antes se veía como "Planificación").
  archived:  { label: 'Archivado',     color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: Archive },
};

const CHANGE_META: Record<ChangeType, { label: string; color: string; icon: React.FC<any> }> = {
  feature:  { label: 'Feature',  color: '#a78bfa', icon: Zap },
  bugfix:   { label: 'Bugfix',   color: '#f87171', icon: Shield },
  refactor: { label: 'Refactor', color: '#60a5fa', icon: RefreshCw },
  docs:     { label: 'Docs',     color: '#34d399', icon: Tag },
  hotfix:   { label: 'Hotfix',   color: '#fb923c', icon: AlertCircle },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: 'Crítico', color: '#f87171' },
  high:     { label: 'Alto',    color: '#fb923c' },
  medium:   { label: 'Medio',   color: '#facc15' },
  low:      { label: 'Bajo',    color: '#4ade80' },
};

const STACKS = [
  'React', 'Vue', 'Angular', 'Next.js', 'Node.js', 'Python',
  'TypeScript', 'Firebase', 'Supabase', 'PostgreSQL', 'Docker',
  'AWS', 'GCP', 'Redis', 'MongoDB', 'GraphQL', 'REST API',
  'Tailwind', 'Vite', 'Webpack', 'Jest', 'Cypress',
];

type Tab = 'overview' | 'proyectos' | 'sprints' | 'changelog' | 'metricas';
// ← Un solo tipo para controlar qué modal está abierto
type ActiveModal = 'project' | 'change' | 'task' | null;
type Toast = { type: 'success' | 'error'; msg: string } | null;

interface ProjectForm {
  name: string; description: string; status: ProjectStatus;
  version: string; repository: string; stack: string[];
  priority: string; deadline: string; progress: number;
}
interface ChangeForm {
  projectId: string; version: string; type: ChangeType;
  title: string; description: string; breaking: boolean;
}
interface TaskForm {
  projectId: string; title: string; description: string;
  priority: string; assignee: string; dueDate: string; labels: string[];
}
interface SprintTask {
  id: string; projectId: string; title: string; description?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: string; assignee?: string; dueDate?: string;
  labels: string[]; createdAt: any; authorName?: string;
}

const EMPTY_PROJECT: ProjectForm = {
  name: '', description: '', status: 'planning', version: '0.1.0',
  repository: '', stack: [], priority: 'medium', deadline: '', progress: 0,
};
const EMPTY_CHANGE: ChangeForm = {
  projectId: '', version: '', type: 'feature', title: '', description: '', breaking: false,
};
const EMPTY_TASK: TaskForm = {
  projectId: '', title: '', description: '', priority: 'medium',
  assignee: '', dueDate: '', labels: [],
};

const TASK_STATUS = {
  todo:        { label: 'Por hacer',   color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  in_progress: { label: 'En curso',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  review:      { label: 'En revisión', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  done:        { label: 'Completado',  color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
};

// Las fechas 'yyyy-MM-dd' se guardan sin hora: new Date('2026-10-05') las toma
// como medianoche UTC, que en Perú (UTC-5) cae el día anterior. Se leen a
// mediodía local para que se vea el día que se eligió.
const fechaLocal = (s?: string): Date | null => {
  if (!s) return null;
  const d = new Date(`${s.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
};
const fmtFecha = (s: string | undefined, patron: string) => {
  const d = fechaLocal(s);
  return d ? format(d, patron) : '';
};

// Campos que el panel Proyectos guarda en el mismo documento y aquí también se usan.
type ProyectoDev = Project & { coverPath?: string };
type UsuarioLite = { uid: string; displayName?: string; email?: string };

const BD  = 'var(--border-main)';
const SF  = 'var(--sidebar-card-bg)';
const INP = 'var(--sidebar-card-bg)';

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${BD}`,
  background: SF,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: INP,
  border: `1px solid ${BD}`,
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 14,
  fontWeight: 300,
  color: 'var(--text-primary)',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  marginBottom: 6,
};

// ─── Subcomponentes memorizados ──────────────────────────────────────────────
const SelectField = React.memo<{
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; color?: string }[];
}>(({ label, value, onChange, options }) => {
  const cur = options.find(o => o.value === value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            ...inputStyle,
            appearance: 'none',
            paddingRight: 36,
            cursor: 'pointer',
            color: cur?.color ?? 'var(--text-primary)',
          }}
        >
          {options.map(o => (
            <option key={o.value} value={o.value} style={{ background: 'var(--sidebar-card-bg)', color: 'var(--text-primary)' }}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: 'var(--text-muted)' }}
          strokeWidth={1.5}
        />
      </div>
    </div>
  );
});

const Input = React.memo<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  ({ label, style: extraStyle, ...props }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <input {...props} style={{ ...inputStyle, ...extraStyle }} />
    </div>
  )
);

// ─── Modal base (memoizado) ──────────────────────────────────────────────────
const ModalWrapper = React.memo<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}>(({ title, onClose, children, footer }) => (
  <div
    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
  >
    <div
      className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
      style={{
        background: 'var(--sidebar-bg, var(--sidebar-card-bg))',
        border: `1px solid ${BD}`,
        maxHeight: '95dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${BD}` }}>
        <h2 className="text-base font-light" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: 'var(--sidebar-card-bg)', border: `1px solid ${BD}`, color: 'var(--text-muted)' }}
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto flex-1">{children}</div>
      <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop: `1px solid ${BD}` }}>{footer}</div>
    </div>
  </div>
));

const BtnCancel = React.memo<{ onClick: () => void; saving?: boolean }>(({ onClick, saving }) => (
  <button
    onClick={onClick}
    disabled={saving}
    className="flex-1 py-2.5 rounded-xl text-sm font-light transition-opacity hover:opacity-70"
    style={{ background: 'var(--sidebar-card-bg)', border: `1px solid ${BD}`, color: 'var(--text-muted)' }}
  >
    Cancelar
  </button>
));

const BtnSave = React.memo<{ onClick: () => void; label: string; loadingLabel?: string; saving?: boolean }>(
  ({ onClick, label, loadingLabel, saving }) => (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex-1 py-2.5 rounded-xl text-sm font-light transition-all"
      style={{
        background: saving ? 'var(--sidebar-card-bg)' : 'var(--text-primary)',
        color: saving ? 'var(--text-muted)' : 'var(--sidebar-card-bg)',
        border: `1px solid ${BD}`,
      }}
    >
      {saving ? (loadingLabel ?? 'Guardando...') : label}
    </button>
  )
);

// ─── Barra de progreso de un proyecto ────────────────────────────────────────
// Controlada: muestra el valor en vivo de Firestore y solo usa un borrador
// local mientras la mueves. Guarda al soltar (ratón o dedo), al soltar una
// tecla y al perder el foco, así los cambios con teclado ya no se pierden.
const ProgressSlider: React.FC<{
  value: number; color: string;
  onCommit: (v: number) => Promise<void>;
}> = ({ value, color, onCommit }) => {
  const [draft, setDraft] = useState<number | null>(null);
  const enviando = useRef<number | null>(null);
  const shown = draft ?? value;

  const commit = (e: React.SyntheticEvent<HTMLInputElement>) => {
    if (draft === null) return;                 // no la tocaste: no se escribe nada
    const v = parseInt(e.currentTarget.value, 10);
    if (v === value) { setDraft(null); return; }
    if (enviando.current === v) return;         // pointerup + blur del mismo cambio
    enviando.current = v;
    void onCommit(v).finally(() => {
      enviando.current = null;
      // Si la seguiste moviendo mientras guardaba, conserva el borrador nuevo.
      setDraft(d => (d === v ? null : d));
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>
        <span>PROGRESO</span><span>{shown}%</span>
      </div>
      <input
        type="range" min={0} max={100} step={5} value={shown}
        onChange={e => setDraft(parseInt(e.target.value, 10))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-full"
        style={{ accentColor: color }}
        aria-label="Progreso del proyecto"
      />
    </div>
  );
};

// ─── Componente principal ────────────────────────────────────────────────────
export default function PanelProgramacion() {
  const { currentUser, userProfile, isAdmin } = useAuth();
  // Reglas de Firestore: CEO/Administración/Programación escriben proyectos y
  // tareas; solo CEO/Administración pueden borrarlos (isAdmin ya incluye al CEO).
  const canEdit   = isAdmin || userProfile?.role === 'Programación';
  const canDelete = isAdmin;

  const [projects,        setProjects]        = useState<Project[]>([]);
  const [changes,         setChanges]         = useState<VersionChange[]>([]);
  const [tasks,           setTasks]           = useState<SprintTask[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [activeTab,       setActiveTab]       = useState<Tab>('overview');
  const [search,          setSearch]          = useState('');
  const [filterStatus,    setFilterStatus]    = useState<ProjectStatus | 'all'>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');

  // ← UN solo estado para todos los modales (evita 3 setState = 3 re-renders)
  const [activeModal,    setActiveModal]    = useState<ActiveModal>(null);
  const [editProject,    setEditProject]    = useState<Project | null>(null);
  const [projectForm,    setProjectForm]    = useState<ProjectForm>(EMPTY_PROJECT);
  const [changeForm,     setChangeForm]     = useState<ChangeForm>(EMPTY_CHANGE);
  const [taskForm,       setTaskForm]       = useState<TaskForm>(EMPTY_TASK);
  const [editTask,       setEditTask]       = useState<SprintTask | null>(null);
  // Texto libre de etiquetas ("ui, bug"); se convierte a lista al guardar.
  const [labelsText,     setLabelsText]     = useState('');
  const [users,          setUsers]          = useState<UsuarioLite[]>([]);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [deleting,       setDeleting]       = useState<string | null>(null);
  const [toast,          setToast]          = useState<Toast>(null);
  const [expandedProject,setExpandedProject]= useState<string | null>(null);
  const [dragTask,       setDragTask]       = useState<string | null>(null);

  // ─── Firestore listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'dev_projects'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setProjects(snap.docs.map(d => {
        const r = d.data();
        return { ...r, ...leerCamposComunes(r), id: d.id, createdAt: r.createdAt?.toDate?.() ?? new Date() } as unknown as Project;
      }));
      setLoading(false);
    }, err => {
      // Sin esto el panel quedaba vacío como si no hubiera proyectos.
      console.error('dev_projects:', err);
      setLoadError('No se pudieron cargar los proyectos. Revisa tu conexión o tus permisos.');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'dev_changelog'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setChanges(snap.docs.map(d => {
        const r = d.data();
        return { ...r, id: d.id, createdAt: r.createdAt?.toDate?.() ?? new Date() } as VersionChange;
      }));
    }, err => {
      console.error('dev_changelog:', err);
      setLoadError('No se pudo cargar el changelog. Revisa tu conexión o tus permisos.');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'dev_tasks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ ...d.data(), id: d.id } as SprintTask)));
    }, err => {
      console.error('dev_tasks:', err);
      setLoadError('No se pudieron cargar las tareas. Revisa tu conexión o tus permisos.');
    });
    return () => unsub();
  }, []);

  // Usuarios para elegir el responsable de una tarea (se guarda su uid).
  useEffect(() => subscribeToUsers(
    u => setUsers(u as UsuarioLite[]),
    err => console.error('users:', err),
  ), []);

  const userName = useCallback((uid?: string) => {
    if (!uid) return '';
    const u = users.find(x => x.uid === uid);
    return u?.displayName || u?.email || '';
  }, [users]);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ─── Abrir modales (una sola actualización de estado) ────────────────────
  const openProjectModal = useCallback((project?: Project) => {
    if (project) {
      setEditProject(project);
      setProjectForm({
        name: project.name,
        description: project.description ?? '',
        status: project.status as ProjectStatus,
        version: project.version,
        repository: project.repository ?? '',
        stack: project.stack ?? [],
        priority: project.priority ?? 'medium',
        deadline: project.deadline ?? '',
        progress: project.progress ?? 0,
      });
    } else {
      setEditProject(null);
      setProjectForm(EMPTY_PROJECT);
    }
    setActiveModal('project');
  }, []);

  const openChangeModal = useCallback(() => {
    setChangeForm(EMPTY_CHANGE);
    setActiveModal('change');
  }, []);

  // Sin tarea: crear. Con tarea: el mismo modal sirve para editarla.
  const openTaskModal = useCallback((task?: SprintTask) => {
    if (task) {
      setEditTask(task);
      setTaskForm({
        projectId:   task.projectId,
        title:       task.title,
        description: task.description ?? '',
        priority:    task.priority ?? 'medium',
        assignee:    task.assignee ?? '',
        dueDate:     task.dueDate ?? '',
        labels:      task.labels ?? [],
      });
      setLabelsText((task.labels ?? []).join(', '));
    } else {
      setEditTask(null);
      setTaskForm(EMPTY_TASK);
      setLabelsText('');
    }
    setActiveModal('task');
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setEditProject(null);
    setEditTask(null);
  }, []);

  // ─── Handlers CRUD ───────────────────────────────────────────────────────
  const handleSaveProject = useCallback(async () => {
    if (!projectForm.name.trim()) { showToast('error', 'Nombre obligatorio'); return; }
    setSaving(true);
    try {
      if (editProject) {
        await updateDoc(doc(db, 'dev_projects', editProject.id), { ...escribirCamposComunes({ ...projectForm }), updatedAt: serverTimestamp() });
        showToast('success', 'Proyecto actualizado');
      } else {
        await addDoc(collection(db, 'dev_projects'), {
          ...escribirCamposComunes({ ...projectForm }),
          lead: currentUser?.uid,
          leadName: userProfile?.displayName,
          members: [currentUser?.uid],
          createdAt: serverTimestamp(),
        });
        showToast('success', 'Proyecto creado');
      }
      closeModal();
    } catch (err: any) { showToast('error', err.message); }
    finally { setSaving(false); }
  }, [projectForm, editProject, currentUser, userProfile, showToast, closeModal]);

  const handleSaveChange = useCallback(async () => {
    if (!changeForm.projectId || !changeForm.title.trim() || !changeForm.version.trim()) {
      showToast('error', 'Proyecto, versión y título requeridos'); return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'dev_changelog'), {
        ...changeForm,
        author: currentUser?.uid,
        authorName: userProfile?.displayName,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'dev_projects', changeForm.projectId), {
        version: changeForm.version,
        updatedAt: serverTimestamp(),
      });
      showToast('success', `v${changeForm.version} registrada`);
      closeModal();
    } catch (err: any) { showToast('error', err.message); }
    finally { setSaving(false); }
  }, [changeForm, currentUser, userProfile, showToast, closeModal]);

  const handleSaveTask = useCallback(async () => {
    if (!taskForm.projectId || !taskForm.title.trim()) {
      showToast('error', 'Proyecto y título requeridos'); return;
    }
    const labels = Array.from(new Set(
      labelsText.split(',').map(l => l.trim()).filter(Boolean),
    ));
    const datos = {
      projectId:   taskForm.projectId,
      title:       taskForm.title.trim(),
      description: taskForm.description.trim(),
      priority:    taskForm.priority,
      assignee:    taskForm.assignee,
      dueDate:     taskForm.dueDate,
      labels,
    };
    setSaving(true);
    try {
      if (editTask) {
        // Editar no toca estado, autor ni fecha de creación.
        await updateDoc(doc(db, 'dev_tasks', editTask.id), { ...datos, updatedAt: serverTimestamp() });
        showToast('success', 'Tarea actualizada');
      } else {
        await addDoc(collection(db, 'dev_tasks'), {
          ...datos,
          status: 'todo',
          author: currentUser?.uid,
          authorName: userProfile?.displayName,
          createdAt: serverTimestamp(),
        });
        showToast('success', 'Tarea creada');
      }
      closeModal();
    } catch (err: any) { showToast('error', err.message); }
    finally { setSaving(false); }
  }, [taskForm, labelsText, editTask, currentUser, userProfile, showToast, closeModal]);

  const handleMoveTask = useCallback(async (taskId: string, newStatus: SprintTask['status']) => {
    // Soltar en la misma columna no es un cambio.
    if (tasks.find(t => t.id === taskId)?.status === newStatus) return;
    try {
      await updateDoc(doc(db, 'dev_tasks', taskId), { status: newStatus, updatedAt: serverTimestamp() });
    } catch { showToast('error', 'Error moviendo tarea'); }
  }, [tasks, showToast]);

  const handleDeleteProject = useCallback(async (p: ProyectoDev) => {
    if (!confirm(`¿Eliminar "${p.name}"? También se eliminarán sus tareas.`)) return;
    setDeleting(p.id);
    try {
      await deleteDoc(doc(db, 'dev_projects', p.id));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'No se pudo eliminar el proyecto');
      setDeleting(null);
      return;
    }
    // Lo demás va después: si el proyecto no se pudo borrar, sus tareas y su
    // portada se quedan. Antes quedaban huérfanas para siempre.
    const avisos: string[] = [];
    try {
      const snap = await getDocs(query(collection(db, 'dev_tasks'), where('projectId', '==', p.id)));
      // Un batch admite 500 escrituras.
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error('Borrando tareas del proyecto:', err);
      avisos.push('sus tareas');
    }
    if (p.coverPath) {
      // Misma limpieza que hace el panel Proyectos (bucket 'project-covers').
      try {
        const { error } = await supabase.storage.from('project-covers').remove([p.coverPath.split('?')[0]]);
        if (error) throw error;
      } catch (err) {
        console.warn('No se pudo eliminar la portada:', err);
        avisos.push('su portada');
      }
    }
    if (avisos.length) showToast('error', `Proyecto eliminado, pero no se pudo borrar ${avisos.join(' ni ')}`);
    else showToast('success', 'Proyecto eliminado');
    if (expandedProject === p.id) setExpandedProject(null);
    setDeleting(null);
  }, [showToast, expandedProject]);

  const handleDeleteTask = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      await deleteDoc(doc(db, 'dev_tasks', id));
      showToast('success', 'Tarea eliminada');
    } catch (err: any) { showToast('error', err.message); }
  }, [showToast]);

  const handleUpdateProgress = useCallback(async (id: string, progress: number) => {
    try {
      await updateDoc(doc(db, 'dev_projects', id), { progress, updatedAt: serverTimestamp() });
    } catch (err) {
      // Antes el error se tragaba y la barra quedaba en un valor que no se guardó.
      showToast('error', `No se pudo guardar el progreso: ${err instanceof Error ? err.message : 'error desconocido'}`);
    }
  }, [showToast]);

  // ─── Derivados memorizados ────────────────────────────────────────────────
  const filteredProjects = useMemo(() => projects.filter(p => {
    const ms = filterStatus === 'all' || p.status === filterStatus;
    const mq = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.stack?.some((s: string) => s.toLowerCase().includes(search.toLowerCase()));
    return ms && mq;
  }), [projects, filterStatus, search]);

  const filteredChanges = useMemo(() => changes.filter(c =>
    (selectedProject === 'all' || c.projectId === selectedProject) &&
    (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  ), [changes, selectedProject, search]);

  const projectTasksMap = useMemo(() => {
    const map: Record<string, SprintTask[]> = {};
    tasks.forEach(t => {
      if (!map[t.projectId]) map[t.projectId] = [];
      map[t.projectId].push(t);
    });
    return map;
  }, [tasks]);

  const projectTasks = useCallback((projId: string) => projectTasksMap[projId] ?? [], [projectTasksMap]);

  const tasksByStatus = useCallback((status: string) =>
    tasks.filter(t =>
      (selectedProject === 'all' || t.projectId === selectedProject) &&
      (status === 'all' || t.status === status)
    ), [tasks, selectedProject]);

  const stats = useMemo(() => ({
    totalActive:    projects.filter(p => p.status === 'active').length,
    totalCompleted: projects.filter(p => p.status === 'completed').length,
    totalTasks:     tasks.length,
    doneTasks:      tasks.filter(t => t.status === 'done').length,
    avgProgress:    projects.length
      ? Math.round(projects.reduce((a, p) => a + (p.progress ?? 0), 0) / projects.length)
      : 0,
  }), [projects, tasks]);

  const recentChanges = useMemo(() => changes.slice(0, 5), [changes]);

  const projectOptions = useMemo(() =>
    [{ value: '', label: 'Seleccionar proyecto...' }, ...projects.map(p => ({ value: p.id, label: p.name }))],
    [projects]
  );

  const projectOptionsWithVersion = useMemo(() =>
    [{ value: '', label: 'Seleccionar proyecto...' }, ...projects.map(p => ({ value: p.id, label: p.version ? `${p.name} (v${p.version})` : p.name }))],
    [projects]
  );

  const assigneeOptions = useMemo(() => {
    const opts = [
      { value: '', label: 'Sin asignar' },
      ...users
        .map(u => ({ value: u.uid, label: u.displayName || u.email || u.uid }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    ];
    // Si el responsable ya no está en la lista, que no desaparezca del select.
    if (taskForm.assignee && !opts.some(o => o.value === taskForm.assignee)) {
      opts.push({ value: taskForm.assignee, label: 'Usuario no encontrado' });
    }
    return opts;
  }, [users, taskForm.assignee]);

  const TABS: { id: Tab; label: string; icon: React.FC<any>; badge?: number }[] = useMemo(() => [
    { id: 'overview',  label: 'Overview',  icon: BarChart3 },
    { id: 'proyectos', label: 'Proyectos', icon: Package,   badge: projects.filter(p => p.status === 'active').length },
    { id: 'sprints',   label: 'Sprints',   icon: Target,    badge: tasks.filter(t => t.status !== 'done').length },
    { id: 'changelog', label: 'Changelog', icon: GitCommit, badge: changes.length },
    { id: 'metricas',  label: 'Métricas',  icon: TrendingUp },
  ], [projects, tasks, changes]);

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <div className="w-5 h-5 border border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--border-main)', borderTopColor: 'transparent' }} />
      <span className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>Cargando...</span>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ══ Toast ══════════════════════════════════════════════════════════ */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-light shadow-2xl"
          style={{
            background: toast.type === 'success' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
            border: `1px solid ${toast.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
            color: toast.type === 'success' ? '#34d399' : '#f87171',
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          {toast.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            : <AlertCircle  className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />}
          <span className="truncate">{toast.msg}</span>
        </div>
      )}

      {/* ══ MODALES — fuera de los tabs, al nivel raíz ══════════════════════
          Así React solo monta/desmonta el modal sin re-renderizar la lista
          de proyectos, el kanban ni ningún otro tab.
      ════════════════════════════════════════════════════════════════════════ */}

      {/* Modal: Proyecto */}
      {activeModal === 'project' && (
        <ModalWrapper
          title={editProject ? 'Editar proyecto' : 'Nuevo proyecto'}
          onClose={closeModal}
          footer={
            <>
              <BtnCancel onClick={closeModal} saving={saving} />
              <BtnSave
                onClick={handleSaveProject}
                label={editProject ? 'Actualizar' : 'Crear proyecto'}
                saving={saving}
              />
            </>
          }
        >
          <Input label="Nombre *" value={projectForm.name}
            onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nombre del proyecto" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Descripción</label>
            <textarea
              value={projectForm.description}
              onChange={e => setProjectForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="Descripción breve"
              style={{ ...inputStyle, resize: 'none' } as React.CSSProperties}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField label="Estado" value={projectForm.status}
              onChange={v => setProjectForm(p => ({ ...p, status: v as ProjectStatus }))}
              options={Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
            <SelectField label="Prioridad" value={projectForm.priority}
              onChange={v => setProjectForm(p => ({ ...p, priority: v }))}
              options={Object.entries(PRIORITY_META).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Versión inicial" value={projectForm.version}
              onChange={e => setProjectForm(p => ({ ...p, version: e.target.value }))}
              placeholder="0.1.0" />
            <Input label="Deadline" type="date" value={projectForm.deadline}
              onChange={e => setProjectForm(p => ({ ...p, deadline: e.target.value }))} />
          </div>
          <Input label="Repositorio" value={projectForm.repository}
            onChange={e => setProjectForm(p => ({ ...p, repository: e.target.value }))}
            placeholder="https://github.com/..." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Progreso ({projectForm.progress}%)</label>
            <input
              type="range" min={0} max={100} step={5} value={projectForm.progress}
              onChange={e => setProjectForm(p => ({ ...p, progress: parseInt(e.target.value) }))}
              className="w-full"
              style={{ accentColor: '#f472b6' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Stack</label>
            <div className="flex flex-wrap gap-2">
              {STACKS.map(tech => {
                const sel = projectForm.stack.includes(tech);
                return (
                  <button
                    key={tech}
                    type="button"
                    onClick={() => setProjectForm(p => ({
                      ...p,
                      stack: sel ? p.stack.filter(s => s !== tech) : [...p.stack, tech],
                    }))}
                    className="px-2.5 py-1 rounded-lg text-xs font-light transition-all"
                    style={{
                      background: sel ? 'rgba(167,139,250,0.15)' : 'var(--sidebar-card-bg)',
                      border: `1px solid ${sel ? 'rgba(167,139,250,0.4)' : BD}`,
                      color: sel ? '#a78bfa' : 'var(--text-muted)',
                    }}
                  >
                    {tech}
                  </button>
                );
              })}
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Modal: Release / Changelog */}
      {activeModal === 'change' && (
        <ModalWrapper
          title="Registrar release"
          onClose={closeModal}
          footer={
            <>
              <BtnCancel onClick={closeModal} saving={saving} />
              <BtnSave onClick={handleSaveChange} label="Publicar release" saving={saving} />
            </>
          }
        >
          <SelectField label="Proyecto *" value={changeForm.projectId}
            onChange={v => setChangeForm(p => ({ ...p, projectId: v }))}
            options={projectOptionsWithVersion} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nueva versión *" value={changeForm.version}
              onChange={e => setChangeForm(p => ({ ...p, version: e.target.value }))}
              placeholder="1.2.0" />
            <SelectField label="Tipo" value={changeForm.type}
              onChange={v => setChangeForm(p => ({ ...p, type: v as ChangeType }))}
              options={Object.entries(CHANGE_META).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
          </div>
          <Input label="Título *" value={changeForm.title}
            onChange={e => setChangeForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Descripción corta del cambio" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Notas de release</label>
            <textarea
              value={changeForm.description}
              onChange={e => setChangeForm(p => ({ ...p, description: e.target.value }))}
              rows={4}
              placeholder="Detalla los cambios..."
              style={{ ...inputStyle, resize: 'none' } as React.CSSProperties}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              className="w-10 h-5 rounded-full relative transition-all"
              style={{ background: changeForm.breaking ? '#f87171' : 'var(--border-main)' }}
              onClick={() => setChangeForm(p => ({ ...p, breaking: !p.breaking }))}
            >
              <div
                className="absolute top-0.5 h-4 w-4 rounded-full shadow transition-all"
                style={{ background: 'var(--text-primary)', left: changeForm.breaking ? 'calc(100% - 18px)' : '2px' }}
              />
            </div>
            <span className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>Breaking change</span>
          </label>
        </ModalWrapper>
      )}

      {/* Modal: Tarea */}
      {activeModal === 'task' && (
        <ModalWrapper
          title={editTask ? 'Editar tarea' : 'Nueva tarea'}
          onClose={closeModal}
          footer={
            <>
              <BtnCancel onClick={closeModal} saving={saving} />
              <BtnSave onClick={handleSaveTask} label={editTask ? 'Guardar cambios' : 'Crear tarea'} saving={saving} />
            </>
          }
        >
          <SelectField label="Proyecto *" value={taskForm.projectId}
            onChange={v => setTaskForm(p => ({ ...p, projectId: v }))}
            options={projectOptions} />
          <Input label="Título *" value={taskForm.title}
            onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Título de la tarea" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Descripción</label>
            <textarea
              value={taskForm.description}
              onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Descripción opcional"
              style={{ ...inputStyle, resize: 'none' } as React.CSSProperties}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField label="Prioridad" value={taskForm.priority}
              onChange={v => setTaskForm(p => ({ ...p, priority: v }))}
              options={Object.entries(PRIORITY_META).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
            <Input label="Fecha límite" type="date" value={taskForm.dueDate}
              onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <SelectField label="Responsable" value={taskForm.assignee}
            onChange={v => setTaskForm(p => ({ ...p, assignee: v }))}
            options={assigneeOptions} />
          <Input label="Etiquetas" value={labelsText}
            onChange={e => setLabelsText(e.target.value)}
            placeholder="Separadas por comas: ui, bug, backend" />
        </ModalWrapper>
      )}

      {/* ══ Header ══════════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.2)' }}
          >
            <Code2 className="w-5 h-5" style={{ color: '#f472b6' }} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-light" style={{ color: 'var(--text-primary)' }}>Panel de Programación</h1>
            <p className="text-xs sm:text-sm font-light" style={{ color: 'var(--text-muted)' }}>
              {projects.length} proyectos · {stats.totalTasks} tareas
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openTaskModal()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-opacity hover:opacity-80"
              style={{ background: 'var(--sidebar-card-bg)', border: `1px solid ${BD}`, color: 'var(--text-primary)' }}
            >
              <CheckSquare className="w-3.5 h-3.5" strokeWidth={1.5} /> Tarea
            </button>
            <button
              onClick={openChangeModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-opacity hover:opacity-80"
              style={{ background: 'var(--sidebar-card-bg)', border: `1px solid ${BD}`, color: 'var(--text-primary)' }}
            >
              <GitCommit className="w-3.5 h-3.5" strokeWidth={1.5} /> Release
            </button>
            <button
              onClick={() => openProjectModal()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-light transition-opacity hover:opacity-90"
              style={{ background: 'var(--text-primary)', color: 'var(--bg-sidebar)' }}
            >
              <Plus className="w-4 h-4" strokeWidth={2} /> Proyecto
            </button>
          </div>
        )}
      </div>

      {loadError && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-light"
          style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          <span>{loadError}</span>
        </div>
      )}

      {/* ══ Tabs ════════════════════════════════════════════════════════════ */}
      <div
        className="flex gap-1 p-1 rounded-2xl overflow-x-auto"
        style={{ background: 'var(--sidebar-card-bg)', border: `1px solid ${BD}` }}
      >
        {TABS.map(tab => {
          const Icon   = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-all whitespace-nowrap flex-shrink-0"
              style={{
                background: active ? 'var(--border-main)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
                  style={{
                    background: active ? 'rgba(255,255,255,0.15)' : 'var(--border-main)',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ════ OVERVIEW ══════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Proyectos activos', value: stats.totalActive,                          color: '#34d399', icon: Play },
              { label: 'Completados',        value: stats.totalCompleted,                        color: '#60a5fa', icon: CheckCircle2 },
              { label: 'Tareas abiertas',    value: stats.totalTasks - stats.doneTasks,          color: '#f59e0b', icon: Target },
              { label: 'Progreso promedio',  value: `${stats.avgProgress}%`,                    color: '#a78bfa', icon: TrendingUp },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="rounded-2xl p-4 space-y-3" style={cardStyle}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
                  <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.5} />
                </div>
                <p className="text-xl sm:text-2xl font-light tabular-nums" style={{ color }}>{value}</p>
                <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: 'var(--text-muted)' }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Proyectos activos + actividad reciente */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BD}` }}>
              <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'var(--sidebar-card-bg)', borderBottom: `1px solid ${BD}` }}>
                <Activity className="w-4 h-4" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
                <p className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>Proyectos en curso</p>
              </div>
              <div className="divide-y" style={{ borderColor: BD }}>
                {projects.filter(p => p.status === 'active').slice(0, 5).map(p => {
                  const progress = p.progress ?? 0;
                  const ptasks   = projectTasks(p.id);
                  const done     = ptasks.filter(t => t.status === 'done').length;
                  return (
                    <div key={p.id} className="px-5 py-3.5" style={{ borderColor: BD }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-light truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                          {p.version && <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>v{p.version}</span>}
                        </div>
                        <span className="text-[10px] font-light" style={{ color: '#34d399' }}>{progress}%</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border-main)' }}>
                        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: '#34d399bb' }} />
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>
                        <span>{p.stack?.slice(0, 3).join(' · ')}</span>
                        {ptasks.length > 0 && <span>{done}/{ptasks.length} tareas</span>}
                      </div>
                    </div>
                  );
                })}
                {projects.filter(p => p.status === 'active').length === 0 && (
                  <div className="px-5 py-8 text-center text-sm font-light" style={{ color: 'var(--text-muted)' }}>Sin proyectos activos</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BD}` }}>
              <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'var(--sidebar-card-bg)', borderBottom: `1px solid ${BD}` }}>
                <GitCommit className="w-4 h-4" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
                <p className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>Actividad reciente</p>
              </div>
              <div className="divide-y" style={{ borderColor: BD }}>
                {recentChanges.map(c => {
                  const meta    = CHANGE_META[c.type as ChangeType] ?? CHANGE_META.feature;
                  const project = projects.find(p => p.id === c.projectId);
                  return (
                    <div key={c.id} className="px-5 py-3 flex items-start gap-3" style={{ borderColor: BD }}>
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: meta.color + '20' }}>
                        <meta.icon className="w-3 h-3" style={{ color: meta.color }} strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-light truncate" style={{ color: 'var(--text-primary)' }}>{c.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>
                          <span>{project?.name ?? '—'}</span>
                          <span>·</span>
                          <span>v{c.version}</span>
                          <span>·</span>
                          <span>{c.authorName ?? '—'}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-light flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {formatDistanceToNow(c.createdAt instanceof Date ? c.createdAt : new Date(), { locale: es, addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
                {recentChanges.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm font-light" style={{ color: 'var(--text-muted)' }}>Sin actividad reciente</div>
                )}
              </div>
            </div>
          </div>

          {/* Distribución de estado */}
          <div className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
              <p className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>Distribución de proyectos</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {(Object.entries(STATUS_META) as [ProjectStatus, any][]).map(([status, meta]) => {
                const count = projects.filter(p => p.status === status).length;
                return (
                  <div
                    key={status}
                    className="rounded-xl p-3 text-center cursor-pointer transition-opacity hover:opacity-80"
                    onClick={() => { setActiveTab('proyectos'); setFilterStatus(status); }}
                    style={{
                      background: count > 0 ? meta.color + '12' : 'var(--sidebar-card-bg)',
                      border: `1px solid ${count > 0 ? meta.color + '30' : BD}`,
                    }}
                  >
                    <p className="text-xl sm:text-2xl font-light" style={{ color: meta.color }}>{count}</p>
                    <p className="text-[10px] uppercase tracking-widest font-light mt-1" style={{ color: count > 0 ? meta.color : 'var(--text-muted)' }}>
                      {meta.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════ PROYECTOS ═════════════════════════════════════════════════════ */}
      {activeTab === 'proyectos' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar proyecto..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm font-light outline-none"
                style={{ ...inputStyle, paddingLeft: 36 }}
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['all', ...Object.keys(STATUS_META)] as const).map(s => {
                const active = filterStatus === s;
                const color  = s !== 'all' ? STATUS_META[s as ProjectStatus]?.color : 'var(--text-primary)';
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s as ProjectStatus | 'all')}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-light transition-all"
                    style={{
                      background: active ? (s !== 'all' ? STATUS_META[s as ProjectStatus]?.color + '18' : 'var(--border-main)') : 'var(--sidebar-card-bg)',
                      color: active ? color : 'var(--text-muted)',
                      border: `1px solid ${active ? (s !== 'all' ? STATUS_META[s as ProjectStatus]?.color + '35' : BD) : BD}`,
                    }}
                  >
                    {s === 'all' ? 'Todos' : STATUS_META[s as ProjectStatus]?.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista */}
          {filteredProjects.length === 0 ? (
            <div className="py-16 text-center rounded-2xl" style={{ border: `1px dashed ${BD}` }}>
              <Package className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--border-main)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>Sin proyectos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProjects.map(p => {
                const sm       = STATUS_META[p.status as ProjectStatus] ?? STATUS_META.planning;
                const pm       = PRIORITY_META[p.priority ?? 'medium'];
                const ptasks   = projectTasks(p.id);
                const done     = ptasks.filter(t => t.status === 'done').length;
                const pchange  = changes.filter(c => c.projectId === p.id).length;
                const progress = p.progress ?? 0;
                const isExp    = expandedProject === p.id;

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl overflow-hidden transition-all"
                    style={{
                      border: `1px solid ${isExp ? sm.color + '40' : BD}`,
                      background: isExp ? sm.color + '06' : 'var(--sidebar-card-bg)',
                    }}
                  >
                    <div
                      className="flex items-center gap-3 px-4 py-3.5 cursor-pointer"
                      onClick={() => setExpandedProject(isExp ? null : p.id)}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: sm.bg }}>
                        <sm.icon className="w-4 h-4" style={{ color: sm.color }} strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-light truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                          {p.version && <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>v{p.version}</span>}
                        </div>
                        <div className="h-1 rounded-full overflow-hidden w-full max-w-[180px]" style={{ background: 'var(--border-main)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: sm.color + 'bb' }} />
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-3 text-xs font-light flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        <span className="flex items-center gap-1">
                          <Flag className="w-3 h-3" style={{ color: pm?.color }} strokeWidth={1.5} />
                          {pm?.label}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckSquare className="w-3 h-3" strokeWidth={1.5} />
                          {done}/{ptasks.length}
                        </span>
                        <span className="hidden md:flex items-center gap-1">
                          <GitCommit className="w-3 h-3" strokeWidth={1.5} />
                          {pchange}
                        </span>
                        <span style={{ color: sm.color }}>{progress}%</span>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => openProjectModal(p)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-70"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Edit3 className="w-3 h-3" strokeWidth={1.5} />
                          </button>
                          {p.repository && (
                            <a href={p.repository} target="_blank" rel="noreferrer"
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-70"
                              style={{ color: 'var(--text-muted)' }}>
                              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                            </a>
                          )}
                          {/* Las reglas solo dejan borrar a CEO/Administración. */}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteProject(p)}
                              disabled={deleting === p.id}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-70"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {deleting === p.id
                                ? <RefreshCw className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                                : <Trash2 className="w-3 h-3" strokeWidth={1.5} />}
                            </button>
                          )}
                        </div>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isExp ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-muted)' }}
                        strokeWidth={1.5}
                      />
                    </div>

                    {isExp && (
                      <div className="px-5 py-4 space-y-4" style={{ borderTop: `1px solid ${BD}` }}>
                        {p.description && (
                          <p className="text-sm font-light leading-relaxed" style={{ color: 'var(--text-secondary, var(--text-muted))' }}>{p.description}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-light">
                          {[
                            { label: 'Stack',    value: p.stack?.join(', ') || '—' },
                            { label: 'Lead',     value: p.leadName ?? '—' },
                            { label: 'Deadline', value: fmtFecha(p.deadline, 'dd/MM/yyyy') || '—' },
                            { label: 'Creado',   value: fechaNumerica(p.createdAt instanceof Date ? p.createdAt : new Date()) },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
                              <p style={{ color: 'var(--text-primary)' }}>{value}</p>
                            </div>
                          ))}
                        </div>
                        {canEdit && (
                          <ProgressSlider
                            value={progress}
                            color={sm.color}
                            onCommit={v => handleUpdateProgress(p.id, v)}
                          />
                        )}
                        {ptasks.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: 'var(--text-muted)' }}>Tareas</p>
                            <div className="space-y-1.5">
                              {ptasks.slice(0, 4).map(t => {
                                const ts = TASK_STATUS[t.status];
                                return (
                                  <div key={t.id} className="flex items-center gap-2 text-xs font-light">
                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ts.color }} />
                                    <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                                    <span style={{ color: ts.color }}>{ts.label}</span>
                                  </div>
                                );
                              })}
                              {ptasks.length > 4 && (
                                <p className="text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>+{ptasks.length - 4} más</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════ SPRINTS ═══════════════════════════════════════════════════════ */}
      {activeTab === 'sprints' && (
        <div className="space-y-4">
          {/* Filtros kanban */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                style={{ ...inputStyle, width: 'auto', paddingRight: 36, cursor: 'pointer', appearance: 'none' } as React.CSSProperties}
              >
                <option value="all">Todos los proyectos</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
            </div>
            {canEdit && (
              <button
                onClick={() => openTaskModal()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-light ml-auto"
                style={{ background: 'var(--text-primary)', color: 'var(--bg-sidebar)' }}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Nueva tarea
              </button>
            )}
          </div>

          {/* Kanban */}
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
            {(Object.entries(TASK_STATUS) as [SprintTask['status'], typeof TASK_STATUS[keyof typeof TASK_STATUS]][]).map(([status, meta]) => {
              const colTasks = tasksByStatus(status);
              return (
                <div
                  key={status}
                  className="rounded-2xl overflow-hidden flex-shrink-0"
                  style={{ border: `1px solid ${BD}`, background: 'var(--sidebar-card-bg)', width: 220, minWidth: 200 }}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (dragTask && canEdit) handleMoveTask(dragTask, status); setDragTask(null); }}
                >
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${BD}` }}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                      <span className="text-xs font-light" style={{ color: meta.color }}>{meta.label}</span>
                    </div>
                    <span className="text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>{colTasks.length}</span>
                  </div>
                  <div className="p-2 space-y-2" style={{ minHeight: 100 }}>
                    {colTasks.map(t => {
                      const pm   = PRIORITY_META[t.priority] ?? PRIORITY_META.medium;
                      const proj = projects.find(p => p.id === t.projectId);
                      return (
                        <div
                          key={t.id}
                          draggable={canEdit}
                          onDragStart={() => setDragTask(t.id)}
                          onDragEnd={() => setDragTask(null)}
                          className={`rounded-xl p-3 group ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          style={{ background: 'var(--sidebar-bg, var(--sidebar-card-bg))', border: `1px solid ${BD}` }}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-xs font-light leading-relaxed flex-1" style={{ color: 'var(--text-primary)' }}>{t.title}</p>
                            {/* Siempre visibles: con hover no había forma de borrar en pantallas táctiles. */}
                            {canEdit && (
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button
                                  onClick={() => openTaskModal(t)}
                                  title="Editar tarea"
                                  aria-label="Editar tarea"
                                  className="w-5 h-5 rounded-md flex items-center justify-center transition-all hover:opacity-70"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <Edit3 className="w-3 h-3" strokeWidth={1.5} />
                                </button>
                                {canDelete && (
                                  <button
                                    onClick={() => handleDeleteTask(t.id)}
                                    title="Eliminar tarea"
                                    aria-label="Eliminar tarea"
                                    className="w-5 h-5 rounded-md flex items-center justify-center transition-all hover:opacity-70"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    <X className="w-3 h-3" strokeWidth={1.5} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-light px-1.5 py-0.5 rounded-md" style={{ color: pm.color, background: pm.color + '18' }}>
                              {pm.label}
                            </span>
                            {proj && <span className="text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>{proj.name}</span>}
                            {t.dueDate && <span className="text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>{fmtFecha(t.dueDate, 'dd/MM')}</span>}
                            {t.assignee && userName(t.assignee) && (
                              <span className="text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>· {userName(t.assignee)}</span>
                            )}
                            {(t.labels ?? []).map(l => (
                              <span key={l} className="text-[10px] font-light px-1.5 py-0.5 rounded-md" style={{ color: 'var(--text-muted)', border: `1px solid ${BD}` }}>
                                {l}
                              </span>
                            ))}
                          </div>
                          {/* Mover sin arrastrar: el drag de HTML5 no funciona con el dedo. */}
                          {canEdit && (
                            <select
                              value={t.status}
                              onChange={e => handleMoveTask(t.id, e.target.value as SprintTask['status'])}
                              aria-label="Cambiar estado de la tarea"
                              className="mt-2 w-full text-[10px] font-light rounded-md px-1.5 py-1 outline-none cursor-pointer"
                              style={{ background: 'var(--sidebar-card-bg)', border: `1px solid ${BD}`, color: TASK_STATUS[t.status]?.color ?? 'var(--text-muted)' }}
                            >
                              {(Object.entries(TASK_STATUS) as [SprintTask['status'], { label: string }][]).map(([k, v]) => (
                                <option key={k} value={k} style={{ background: 'var(--sidebar-card-bg)', color: 'var(--text-primary)' }}>{v.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                    {colTasks.length === 0 && (
                      <div className="py-6 text-center text-xs font-light" style={{ color: 'var(--border-main)' }}>Arrastra aquí</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════ CHANGELOG ═════════════════════════════════════════════════════ */}
      {activeTab === 'changelog' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                style={{ ...inputStyle, width: 'auto', paddingRight: 36, cursor: 'pointer', appearance: 'none' } as React.CSSProperties}
              >
                <option value="all">Todos los proyectos</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
            </div>
            {canEdit && (
              <button
                onClick={openChangeModal}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-light ml-auto"
                style={{ background: 'var(--text-primary)', color: 'var(--bg-sidebar)' }}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Release
              </button>
            )}
          </div>

          {filteredChanges.length === 0 ? (
            <div className="py-16 text-center rounded-2xl" style={{ border: `1px dashed ${BD}` }}>
              <GitBranch className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--border-main)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>Sin releases registrados</p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2.5 top-0 bottom-0 w-px" style={{ background: BD }} />
              <div className="space-y-3">
                {filteredChanges.map(c => {
                  const meta = CHANGE_META[c.type as ChangeType] ?? CHANGE_META.feature;
                  const proj = projects.find(p => p.id === c.projectId);
                  return (
                    <div key={c.id} className="relative">
                      <div
                        className="absolute -left-[22px] top-4 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--sidebar-card-bg)', border: `2px solid ${meta.color}` }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                      </div>
                      <div className="rounded-2xl p-4" style={cardStyle}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>{c.title}</span>
                            <span className="text-[10px] font-light px-2 py-0.5 rounded-full"
                              style={{ color: meta.color, background: meta.color + '18', border: `1px solid ${meta.color}30` }}>
                              {meta.label}
                            </span>
                            {c.breaking && (
                              <span className="text-[10px] font-light px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400">breaking</span>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>v{c.version}</p>
                            <p className="text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>{proj?.name}</p>
                          </div>
                        </div>
                        {c.description && (
                          <p className="text-xs font-light leading-relaxed mb-2" style={{ color: 'var(--text-muted)' }}>{c.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>
                          <span>{c.authorName ?? '—'}</span>
                          <span>·</span>
                          <span>{format(c.createdAt instanceof Date ? c.createdAt : new Date(), 'dd MMM yyyy, HH:mm', { locale: es })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════ MÉTRICAS ══════════════════════════════════════════════════════ */}
      {activeTab === 'metricas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total releases',    value: changes.length,      color: '#a78bfa', icon: GitCommit },
              { label: 'Tasa completado',   value: stats.totalTasks > 0 ? `${Math.round((stats.doneTasks / stats.totalTasks) * 100)}%` : '—', color: '#4ade80', icon: CheckCircle2 },
              { label: 'Proyectos activos', value: stats.totalActive,   color: '#34d399', icon: Activity },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="rounded-2xl p-5" style={cardStyle}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.5} />
                  <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: 'var(--text-muted)' }}>{label}</p>
                </div>
                <p className="text-3xl font-light" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-2 mb-5">
              <GitBranch className="w-4 h-4" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
              <p className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>Releases por tipo</p>
            </div>
            <div className="space-y-3">
              {Object.entries(CHANGE_META).map(([type, meta]) => {
                const count = changes.filter(c => c.type === type).length;
                const pct   = changes.length > 0 ? (count / changes.length) * 100 : 0;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <meta.icon className="w-3.5 h-3.5" style={{ color: meta.color }} strokeWidth={1.5} />
                        <span className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
                        <span className="text-sm font-light tabular-nums w-4 text-right" style={{ color: 'var(--text-primary)' }}>{count}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-main)' }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: meta.color + 'bb' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-2 mb-5">
              <Layers className="w-4 h-4" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
              <p className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>Progreso por proyecto</p>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm font-light text-center py-6" style={{ color: 'var(--text-muted)' }}>Sin proyectos</p>
            ) : (
              <div className="space-y-4">
                {projects.map(p => {
                  const sm     = STATUS_META[p.status as ProjectStatus] ?? STATUS_META.planning;
                  const prog   = p.progress ?? 0;
                  const ptasks = projectTasks(p.id);
                  const done   = ptasks.filter(t => t.status === 'done').length;
                  return (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sm.color }} />
                          <span className="text-sm font-light truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                          <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>v{p.version}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {ptasks.length > 0 && (
                            <span className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>{done}/{ptasks.length}</span>
                          )}
                          <span className="text-xs font-light" style={{ color: sm.color }}>{prog}%</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-main)' }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${prog}%`, background: sm.color + 'cc' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}