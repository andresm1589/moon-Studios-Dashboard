import { panelInk } from '@/lib/panelColors';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, Search, LayoutList, Columns3, ListTodo, AlertTriangle, Clock, CheckCheck, CircleCheckBig, X, Loader2,
} from 'lucide-react';
import { updateTask, deleteTask, logActivity } from '@/lib/firebase';
import {
  type Tarea, type EstadoTarea, ESTADOS, PRIORIDADES, plazo, destinatarios, avisarTarea, porRevisar,
} from '@/lib/tareas';
import type { UserProfile } from '@/types';
import { useTareas } from './useTareas';
import TareaFormDialog from './TareaFormDialog';
import { TareaFila, TareaDetalleDialog, type Archivo } from './TareaPiezas';
import './tareas.css';
import WorkViewToolbar from '../work/WorkViewToolbar';
import { exportWorkspaceCsv } from '@/lib/workspaceExport';

// ─── Gestor de tareas (CEO y Administración) ──────────────────────────────────
// Lista o tablero con filtros, vencimientos y los reportes de cada tarea. Lo
// usan el Panel CEO (pestaña Tareas) y Mis tareas → Gestionar.

type Filtro = 'activas' | 'todas' | 'vencidas' | 'pronto' | 'revisar' | 'sinfecha' | EstadoTarea;
type Orden  = 'plazo' | 'prioridad' | 'recientes';
type Vista  = 'lista' | 'tablero';

const CLAVE_VISTA = 'moon_tareas_vista';
const leerVista = (): Vista => { try { return localStorage.getItem(CLAVE_VISTA) === 'tablero' ? 'tablero' : 'lista'; } catch { return 'lista'; } };

interface Props {
  perfil: UserProfile | null;
  /** Abre el formulario de una tarea nueva con esta fecha ('yyyy-MM-dd'). */
  fechaNueva?: string;
  onVerArchivo?: (a: Archivo) => void;
}

export default function GestorTareas({ perfil, fechaNueva, onVerArchivo }: Props) {
  const { tareas, usuarios, reportes, cargando, error } = useTareas(perfil);
  const [buscar, setBuscar]       = useState('');
  const [filtro, setFiltro]       = useState<Filtro>('activas');
  const [prioridad, setPrioridad] = useState<'all' | Tarea['priority']>('all');
  const [asignado, setAsignado]   = useState('all');
  const [orden, setOrden]         = useState<Orden>('plazo');
  const [vista, setVista]         = useState<Vista>(leerVista);
  // Llegó desde el Calendario ("Crear tarea este día"): el formulario arranca abierto.
  const [formAbierto, setFormAbierto] = useState(!!fechaNueva);
  const [editando, setEditando]   = useState<Tarea | null>(null);
  const [fechaForm, setFechaForm] = useState<string | undefined>(fechaNueva);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [sobreCol, setSobreCol]   = useState<EstadoTarea | null>(null);

  useEffect(() => { try { localStorage.setItem(CLAVE_VISTA, vista); } catch { /* sin storage */ } }, [vista]);

  const reportesDe = useMemo(() => {
    const m = new Map<string, typeof reportes>();
    for (const r of reportes) { const l = m.get(r.taskId) ?? []; l.push(r); m.set(r.taskId, l); }
    return m;
  }, [reportes]);
  const deTarea = (id: string) => reportesDe.get(id) ?? [];

  const cuenta = useMemo(() => {
    const c = { activas: 0, vencidas: 0, pronto: 0, revisar: 0, completadas: 0, todas: tareas.length };
    for (const t of tareas) {
      const p = plazo(t).tipo;
      if (t.status === 'completed') c.completadas++; else c.activas++;
      if (p === 'vencida') c.vencidas++;
      if (p === 'hoy' || p === 'pronto') c.pronto++;
      if (porRevisar(t, reportesDe.get(t.id) ?? [])) c.revisar++;
    }
    return c;
  }, [tareas, reportesDe]);
  const pct = cuenta.todas ? Math.round((cuenta.completadas / cuenta.todas) * 100) : 0;

  // En el tablero "Activas" deja ver también la columna de completadas.
  const filtroEf: Filtro = vista === 'tablero' && filtro === 'activas' ? 'todas' : filtro;
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = tareas.filter(t => {
      const p = plazo(t).tipo;
      const filtro = filtroEf;
      if (filtro === 'activas'  && t.status === 'completed') return false;
      if (filtro === 'vencidas' && p !== 'vencida') return false;
      if (filtro === 'pronto'   && p !== 'hoy' && p !== 'pronto') return false;
      if (filtro === 'revisar'  && !porRevisar(t, reportesDe.get(t.id) ?? [])) return false;
      if (filtro === 'sinfecha' && (t.fecha || t.status === 'completed')) return false;
      if ((filtro === 'pending' || filtro === 'in-progress' || filtro === 'completed') && t.status !== filtro) return false;
      if (prioridad !== 'all' && t.priority !== prioridad) return false;
      if (asignado === 'equipo' && (t.assignedTo || t.assignedToRole)) return false;
      if (asignado.startsWith('u:') && t.assignedTo !== asignado.slice(2)) return false;
      if (asignado.startsWith('r:') && t.assignedToRole !== asignado.slice(2)) return false;
      if (q) {
        const quien = t.assignedTo ? usuarios.find(u => u.uid === t.assignedTo)?.displayName ?? '' : t.assignedToRole ?? '';
        if (![t.title, t.description, quien].some(s => s.toLowerCase().includes(q))) return false;
      }
      return true;
    });
    const fechaMs = (t: Tarea) => t.fecha?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return lista.sort((a, b) => {
      // Lo completado siempre al final; dentro de cada grupo, el orden elegido.
      if ((a.status === 'completed') !== (b.status === 'completed')) return a.status === 'completed' ? 1 : -1;
      if (orden === 'prioridad') return PRIORIDADES[b.priority].peso - PRIORIDADES[a.priority].peso || fechaMs(a) - fechaMs(b);
      if (orden === 'recientes') return (b.creada?.getTime() ?? 0) - (a.creada?.getTime() ?? 0);
      return fechaMs(a) - fechaMs(b) || PRIORIDADES[b.priority].peso - PRIORIDADES[a.priority].peso;
    });
  }, [tareas, filtroEf, prioridad, asignado, buscar, orden, usuarios, reportesDe]);

  const hayFiltros = buscar.trim() !== '' || prioridad !== 'all' || asignado !== 'all' || filtro !== 'activas';
  const limpiar = () => { setBuscar(''); setPrioridad('all'); setAsignado('all'); setFiltro('activas'); };

  const detalle = detalleId ? tareas.find(t => t.id === detalleId) ?? null : null;
  const rolesUsados = [...new Set(tareas.map(t => t.assignedToRole).filter(Boolean))] as string[];

  // ── Acciones ──
  const cambiarEstado = async (t: Tarea, estado: EstadoTarea, conDeshacer = true) => {
    const antes = t.status;
    if (antes === estado) return;
    try {
      await updateTask(t.id, { status: estado });
      logActivity('TASK_UPDATED', { taskId: t.id, title: t.title, status: estado }, perfil?.uid ?? '', perfil?.displayName ?? '').catch(() => {});
      void avisarTarea('task-status', destinatarios(t, usuarios, perfil?.uid), {
        taskId: t.id, taskTitle: t.title, autorUid: perfil?.uid, autorNombre: perfil?.displayName, estado,
      });
      toast.success(`${t.title}: ${ESTADOS[estado].label.toLowerCase()}`, conDeshacer ? {
        action: { label: 'Deshacer', onClick: () => { void cambiarEstado({ ...t, status: estado }, antes, false); } },
      } : undefined);
    } catch (e) {
      console.error(e);
      toast.error((e as { code?: string })?.code === 'permission-denied' ? 'No tienes permiso para cambiar tareas' : 'No se pudo cambiar el estado');
    }
  };

  const eliminar = async (t: Tarea) => {
    const n = deTarea(t.id).length;
    if (!confirm(`¿Eliminar la tarea "${t.title}"?${n ? `\n\nSus ${n} reporte${n === 1 ? '' : 's'} seguirán en la pestaña Reportes.` : ''}`)) return;
    try {
      await deleteTask(t.id);
      logActivity('TASK_DELETED', { taskId: t.id, title: t.title }, perfil?.uid ?? '', perfil?.displayName ?? '').catch(() => {});
      if (detalleId === t.id) setDetalleId(null);
      toast.success('Tarea eliminada');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo eliminar la tarea');
    }
  };

  const nueva  = () => { setEditando(null); setFechaForm(undefined); setFormAbierto(true); };
  const editar = (t: Tarea) => { setEditando(t); setFormAbierto(true); };

  const fila = (t: Tarea, compacta = false) => (
    <TareaFila key={t.id} tarea={t} usuarios={usuarios} reportes={deTarea(t.id)} compacta={compacta} arrastrable={vista === 'tablero'}
      onAbrir={() => setDetalleId(t.id)}
      onCompletar={() => void cambiarEstado(t, t.status === 'completed' ? 'pending' : 'completed')}
      onEditar={() => editar(t)} onEliminar={() => void eliminar(t)} />
  );

  const stats: { id: Filtro; label: string; valor: number; color: string; icono: React.ReactNode }[] = [
    { id: 'activas',   label: 'Activas',       valor: cuenta.activas,     color: 'var(--accent-user, #6366f1)', icono: <ListTodo size={12} /> },
    { id: 'vencidas',  label: 'Vencidas',      valor: cuenta.vencidas,    color: '#f87171', icono: <AlertTriangle size={12} /> },
    { id: 'pronto',    label: 'Vencen pronto', valor: cuenta.pronto,      color: '#fbbf24', icono: <Clock size={12} /> },
    { id: 'revisar',   label: 'Por confirmar', valor: cuenta.revisar,     color: '#a78bfa', icono: <CheckCheck size={12} /> },
    { id: 'completed', label: 'Completadas',   valor: cuenta.completadas, color: '#34d399', icono: <CircleCheckBig size={12} /> },
  ];

  return (
    <div className="tr-acento space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {stats.map(s => (
          <button data-moon-reveal="metric" key={s.id} type="button" className="tr-stat" data-activo={filtro === s.id} style={{ ['--tr-c' as string]: panelInk(s.color) }}
            onClick={() => setFiltro(filtro === s.id ? 'todas' : s.id)}>
            <span className="tr-stat-lbl">{s.icono} {s.label}</span>
            <span className="tr-stat-num">{s.valor}</span>
          </button>
        ))}
      </div>
      {cuenta.todas > 0 && (
        <div className="flex items-center gap-3">
          <div className="tr-barra flex-1"><div style={{ width: `${pct}%` }} /></div>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--moon-muted)' }}>{pct}% completado · {cuenta.completadas}/{cuenta.todas}</span>
        </div>
      )}

      {/* Herramientas */}
      <WorkViewToolbar label="Mesa de seguimiento" description="Revisa entregas pendientes de confirmación y tareas que todavía necesitan una fecha."
        count={visibles.length} total={tareas.length} loading={cargando} onReset={hayFiltros ? limpiar : undefined}
        onExport={() => exportWorkspaceCsv('moon-tareas-equipo', ['Tarea', 'Estado', 'Prioridad', 'Asignación', 'Fecha límite'], visibles.map(t => [t.title, ESTADOS[t.status].label, PRIORIDADES[t.priority].label, t.assignedTo ? usuarios.find(u => u.uid === t.assignedTo)?.displayName || t.assignedTo : t.assignedToRole || 'Todo el equipo', t.fecha?.toLocaleDateString('sv-SE')]))}>
        <button type="button" aria-pressed={filtro === 'revisar'} onClick={() => setFiltro(filtro === 'revisar' ? 'activas' : 'revisar')}><CheckCheck size={15} />Por confirmar · {cuenta.revisar}</button>
        <button type="button" aria-pressed={filtro === 'sinfecha'} onClick={() => setFiltro(filtro === 'sinfecha' ? 'activas' : 'sinfecha')}><Clock size={15} />Sin fecha · {tareas.filter(t => !t.fecha && t.status !== 'completed').length}</button>
      </WorkViewToolbar>
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--moon-muted)' }} />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por título, descripción o persona…" aria-label="Buscar tareas"
            className="w-full h-9 pl-9 pr-3 text-sm" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filtro} onChange={e => setFiltro(e.target.value as Filtro)} className="h-9 px-2.5 text-xs" aria-label="Estado">
            <option value="activas">Activas</option>
            <option value="todas">Todas</option>
            <option value="pending">Pendientes</option>
            <option value="in-progress">En progreso</option>
            <option value="completed">Completadas</option>
            <option value="vencidas">Vencidas</option>
            <option value="pronto">Vencen pronto</option>
            <option value="revisar">Por confirmar</option>
            <option value="sinfecha">Activas sin fecha</option>
          </select>
          <select value={prioridad} onChange={e => setPrioridad(e.target.value as typeof prioridad)} className="h-9 px-2.5 text-xs" aria-label="Prioridad">
            <option value="all">Toda prioridad</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
          <select value={asignado} onChange={e => setAsignado(e.target.value)} className="h-9 px-2.5 text-xs max-w-[180px]" aria-label="Asignada a">
            <option value="all">Cualquier persona</option>
            <option value="equipo">Todo el equipo</option>
            {rolesUsados.length > 0 && <optgroup label="Roles">{rolesUsados.map(r => <option key={r} value={`r:${r}`}>{r}</option>)}</optgroup>}
            <optgroup label="Personas">
              {[...usuarios].sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '', 'es'))
                .map(u => <option key={u.uid} value={`u:${u.uid}`}>{u.displayName || u.email}</option>)}
            </optgroup>
          </select>
          <select value={orden} onChange={e => setOrden(e.target.value as Orden)} className="h-9 px-2.5 text-xs" aria-label="Ordenar">
            <option value="plazo">Por fecha límite</option>
            <option value="prioridad">Por prioridad</option>
            <option value="recientes">Más recientes</option>
          </select>
          <div className="tr-seg" role="group" aria-label="Vista">
            <button type="button" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')} title="Lista"><LayoutList size={14} /></button>
            <button type="button" aria-pressed={vista === 'tablero'} onClick={() => setVista('tablero')} title="Tablero"><Columns3 size={14} /></button>
          </div>
          <button type="button" className="tr-btn tr-btn-primario h-9" onClick={nueva}><Plus size={15} /> Nueva tarea</button>
        </div>
      </div>

      {hayFiltros && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--moon-muted)' }}>
          <span>{visibles.length} de {tareas.length} tarea{tareas.length === 1 ? '' : 's'}</span>
          <button type="button" className="tr-filtro" style={{ padding: '3px 9px' }} onClick={limpiar}><X size={11} /> Quitar filtros</button>
        </div>
      )}

      {/* Contenido */}
      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--moon-muted)' }}><Loader2 size={16} className="animate-spin" /> Cargando tareas…</div>
      ) : error ? (
        <div data-moon-reveal="card" className="tr-vacio" style={{ borderColor: 'rgba(248,113,113,0.35)', color: panelInk('#f87171') }}><AlertTriangle size={22} /> {error}</div>
      ) : tareas.length === 0 ? (
        <div data-moon-reveal="card" className="tr-vacio">
          <ListTodo size={26} strokeWidth={1.5} />
          <p style={{ color: 'var(--moon-ink)' }}>Todavía no hay tareas</p>
          <p className="text-xs">Crea la primera y asígnala a una persona, a un rol o a todo el equipo.</p>
          <button type="button" className="tr-btn tr-btn-primario mt-2" onClick={nueva}><Plus size={15} /> Nueva tarea</button>
        </div>
      ) : vista === 'lista' ? (
        visibles.length === 0 ? (
          <div data-moon-reveal="card" className="tr-vacio"><Search size={22} strokeWidth={1.5} /> Ninguna tarea coincide con los filtros.</div>
        ) : (
          <div className="flex flex-col gap-2">{visibles.map(t => fila(t))}</div>
        )
      ) : (
        <div className="tr-tablero">
          {(Object.keys(ESTADOS) as EstadoTarea[]).map(s => {
            const col = visibles.filter(t => t.status === s);
            const mostradas = s === 'completed' ? col.slice(0, 30) : col;
            return (
              <div key={s} className="tr-col" data-sobre={sobreCol === s}
                onDragOver={e => { if (e.dataTransfer.types.includes('text/tarea')) { e.preventDefault(); setSobreCol(s); } }}
                onDragLeave={() => setSobreCol(c => (c === s ? null : c))}
                onDrop={e => {
                  e.preventDefault(); setSobreCol(null);
                  const t = tareas.find(x => x.id === e.dataTransfer.getData('text/tarea'));
                  if (t) void cambiarEstado(t, s);
                }}>
                <div className="tr-col-hd">
                  <span className="flex items-center gap-2"><span className="tr-punto" style={{ ['--tr-c' as string]: ESTADOS[s].color }} /> {ESTADOS[s].label}</span>
                  <span className="tabular-nums">{col.length}</span>
                </div>
                <div className="tr-col-cuerpo">
                  {mostradas.length === 0
                    ? <p className="text-[11px] text-center py-6" style={{ color: 'var(--moon-muted)' }}>Arrastra tareas aquí</p>
                    : mostradas.map(t => fila(t, true))}
                  {col.length > mostradas.length && <p className="text-[11px] text-center py-1" style={{ color: 'var(--moon-muted)' }}>y {col.length - mostradas.length} más</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TareaFormDialog open={formAbierto} onOpenChange={setFormAbierto} tarea={editando} fechaInicial={fechaForm}
        usuarios={usuarios} perfil={perfil} />

      <TareaDetalleDialog tarea={detalle} open={!!detalle} onOpenChange={v => { if (!v) setDetalleId(null); }}
        usuarios={usuarios} reportes={detalle ? deTarea(detalle.id) : []} gestor
        onCambiarEstado={s => detalle && void cambiarEstado(detalle, s)}
        onEditar={() => { if (detalle) { setDetalleId(null); editar(detalle); } }}
        onEliminar={() => detalle && void eliminar(detalle)}
        onVerArchivo={onVerArchivo} />
    </div>
  );
}
