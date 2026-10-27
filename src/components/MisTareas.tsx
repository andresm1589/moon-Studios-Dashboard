import { panelInk } from '@/lib/panelColors';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListTodo, AlertTriangle, CalendarClock, CircleCheckBig, Search, Loader2, ClipboardList, UserCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { updateTask } from '@/lib/firebase';
import { toast } from 'sonner';
import { type Tarea, plazo, esParaMi, esGestorTareas, destinatarios, avisarTarea, ESTADOS, PRIORIDADES } from '@/lib/tareas';
import TaskReportDialog from '@/components/TaskReportDialog';
import GestorTareas from '@/components/tareas/GestorTareas';
import { TareaFila, TareaDetalleDialog } from '@/components/tareas/TareaPiezas';
import { useTareas } from '@/components/tareas/useTareas';
import '@/components/tareas/tareas.css';
import WorkViewToolbar from './work/WorkViewToolbar';
import { exportWorkspaceCsv } from '@/lib/workspaceExport';

// ─── Mis tareas ───────────────────────────────────────────────────────────────
// Lo que le toca a cada persona (asignado a ella, a su rol o a todo el equipo),
// agrupado por vencimiento, con el reporte de avance a un clic. CEO y
// Administración tienen además la pestaña "Gestionar equipo".

type Ver = 'activas' | 'completadas' | 'todas';
type Enfoque = 'all' | 'vencidas' | 'semana' | 'alta';

const GRUPOS = [
  { id: 'vencida', label: 'Vencidas',       color: '#f87171' },
  { id: 'hoy',     label: 'Para hoy',       color: '#fbbf24' },
  { id: 'semana',  label: 'Próximos 7 días', color: 'var(--accent-user, #6366f1)' },
  { id: 'luego',   label: 'Más adelante',   color: 'var(--moon-muted)' },
  { id: 'sin',     label: 'Sin fecha',      color: 'var(--moon-muted)' },
  { id: 'hecha',   label: 'Completadas',    color: '#34d399' },
] as const;

const grupoDe = (t: Tarea): (typeof GRUPOS)[number]['id'] => {
  const p = plazo(t);
  if (p.tipo === 'completada') return 'hecha';
  if (p.tipo === 'vencida') return 'vencida';
  if (p.tipo === 'hoy') return 'hoy';
  if (p.tipo === 'sin-fecha') return 'sin';
  return p.dias <= 7 ? 'semana' : 'luego';
};

export default function MisTareas() {
  const { userProfile } = useAuth();
  const gestor = esGestorTareas(userProfile?.role);
  const [params, setParams] = useSearchParams();
  const modo = gestor && params.get('vista') === 'equipo' ? 'equipo' : 'mias';
  const { tareas, usuarios, reportes, cargando, error } = useTareas(userProfile);
  const [ver, setVer]           = useState<Ver>('activas');
  const [buscar, setBuscar]     = useState('');
  const [enfoque, setEnfoque] = useState<Enfoque>('all');
  const [orden, setOrden] = useState<'plazo' | 'prioridad' | 'nombre'>('plazo');
  const [detalleId, setDetalle] = useState<string | null>(null);
  const [reportar, setReportar] = useState<Tarea | null>(null);

  const mias = useMemo(() => tareas.filter(t => esParaMi(t, userProfile)), [tareas, userProfile]);
  const misReportes = useMemo(() => reportes.filter(r => r.autorUid === userProfile?.uid), [reportes, userProfile?.uid]);
  // En "Mis tareas" cada quien ve su propio reporte; quien gestiona ve los de todos en el detalle.
  const reportesDe = (id: string) => (gestor ? reportes : misReportes).filter(r => r.taskId === id);
  const miReporte  = (id: string) => misReportes.filter(r => r.taskId === id);

  const cuenta = useMemo(() => {
    const c = { activas: 0, vencidas: 0, semana: 0, hechas: 0 };
    for (const t of mias) {
      const g = grupoDe(t);
      if (g === 'hecha') c.hechas++; else c.activas++;
      if (g === 'vencida') c.vencidas++;
      if (g === 'hoy' || g === 'semana') c.semana++;
    }
    return c;
  }, [mias]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return mias
      .filter(t => ver === 'todas' || (ver === 'completadas' ? t.status === 'completed' : t.status !== 'completed'))
      .filter(t => !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
      .filter(t => enfoque === 'all' || (enfoque === 'vencidas' ? grupoDe(t) === 'vencida' : enfoque === 'semana' ? ['hoy', 'semana'].includes(grupoDe(t)) : t.status !== 'completed' && t.priority === 'high'))
      .sort((a, b) => {
        if (orden === 'nombre') return a.title.localeCompare(b.title, 'es');
        const porPlazo = (a.fecha?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.fecha?.getTime() ?? Number.MAX_SAFE_INTEGER);
        const porPrioridad = PRIORIDADES[b.priority].peso - PRIORIDADES[a.priority].peso;
        return orden === 'prioridad' ? porPrioridad || porPlazo : porPlazo || porPrioridad;
      });
  }, [mias, ver, buscar, enfoque, orden]);

  const grupos = GRUPOS.map(g => ({ ...g, tareas: filtradas.filter(t => grupoDe(t) === g.id) })).filter(g => g.tareas.length > 0);
  const detalle = detalleId ? tareas.find(t => t.id === detalleId) ?? null : null;

  // Quien gestiona también puede marcar sus propias tareas desde aquí.
  const cambiarEstado = async (t: Tarea, estado: Tarea['status']) => {
    if (!gestor || t.status === estado) return;
    try {
      await updateTask(t.id, { status: estado });
      void avisarTarea('task-status', destinatarios(t, usuarios, userProfile?.uid), {
        taskId: t.id, taskTitle: t.title, autorUid: userProfile?.uid, autorNombre: userProfile?.displayName, estado,
      });
      toast.success(`${t.title}: ${ESTADOS[estado].label.toLowerCase()}`);
    } catch { toast.error('No se pudo cambiar el estado'); }
  };

  const nombre = userProfile?.displayName?.split(' ')[0] ?? '';
  const resumen = cuenta.activas === 0
    ? 'No tienes tareas pendientes. ¡Buen trabajo!'
    : `Tienes ${cuenta.activas} tarea${cuenta.activas === 1 ? '' : 's'} activa${cuenta.activas === 1 ? '' : 's'}${cuenta.vencidas ? `, ${cuenta.vencidas} vencida${cuenta.vencidas === 1 ? '' : 's'}` : ''}.`;

  const stats = [
    { label: 'Activas',         valor: cuenta.activas,  color: 'var(--accent-user, #6366f1)', icono: <ListTodo size={12} />,       ver: 'activas' as Ver, enfoque: 'all' as Enfoque },
    { label: 'Vencidas',        valor: cuenta.vencidas, color: '#f87171',                     icono: <AlertTriangle size={12} />,  ver: 'activas' as Ver, enfoque: 'vencidas' as Enfoque },
    { label: 'Esta semana',     valor: cuenta.semana,   color: '#fbbf24',                     icono: <CalendarClock size={12} />,  ver: 'activas' as Ver, enfoque: 'semana' as Enfoque },
    { label: 'Completadas',     valor: cuenta.hechas,   color: '#34d399',                     icono: <CircleCheckBig size={12} />, ver: 'completadas' as Ver, enfoque: 'all' as Enfoque },
  ];

  return (
    <div className="moon-module moon-module--mis-tareas tr-acento max-w-[1100px] mx-auto space-y-5">
      {/* Encabezado */}
      <div data-moon-reveal="heading" className="moon-module-heading moon-work-page-heading flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="tr-av tr-av-lg" style={{ width: 40, height: 40, borderRadius: 12 }}><ClipboardList size={18} /></div>
          <div className="min-w-0">
            <span className="moon-work-kicker">{modo === 'equipo' ? 'COORDINACIÓN DEL EQUIPO' : 'TU AGENDA DE TRABAJO'}</span>
            <h1 className="moon-page-title text-xl font-light" style={{ color: 'var(--moon-ink)' }}>{modo === 'equipo' ? 'Tareas del equipo' : 'Mis tareas'}</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--moon-muted)' }}>
              {modo === 'equipo' ? 'Crea, asigna y confirma las tareas de todos.' : `${nombre ? `${nombre}, ` : ''}${resumen.charAt(0).toLowerCase()}${resumen.slice(1)}`}
            </p>
          </div>
        </div>
        {gestor && (
          <div className="tr-seg" role="tablist" aria-label="Vista">
            <button type="button" role="tab" aria-pressed={modo === 'mias'} aria-selected={modo === 'mias'}
              onClick={() => setParams(p => { p.delete('vista'); return p; }, { replace: true })}><UserCheck size={13} /> Mis tareas</button>
            <button type="button" role="tab" aria-pressed={modo === 'equipo'} aria-selected={modo === 'equipo'}
              onClick={() => setParams(p => { p.set('vista', 'equipo'); return p; }, { replace: true })}><ListTodo size={13} /> Gestionar equipo</button>
          </div>
        )}
      </div>

      {modo === 'equipo' ? (
        <GestorTareas perfil={userProfile} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {stats.map(s => (
              <button data-moon-reveal="metric" key={s.label} type="button" className="tr-stat" data-activo={ver === s.ver && enfoque === s.enfoque} style={{ ['--tr-c' as string]: panelInk(s.color) }} onClick={() => { setVer(s.ver); setEnfoque(s.enfoque); }}>
                <span className="tr-stat-lbl">{s.icono} {s.label}</span>
                <span className="tr-stat-num">{s.valor}</span>
              </button>
            ))}
          </div>

          <WorkViewToolbar label="Organiza tu jornada" description="Concentra la vista en los compromisos que necesitas atender primero."
            count={filtradas.length} total={mias.length} loading={cargando}
            onReset={buscar || ver !== 'activas' || enfoque !== 'all' || orden !== 'plazo' ? () => { setBuscar(''); setVer('activas'); setEnfoque('all'); setOrden('plazo'); } : undefined}
            onExport={() => exportWorkspaceCsv('moon-mis-tareas', ['Tarea', 'Estado', 'Prioridad', 'Fecha límite'], filtradas.map(t => [t.title, ESTADOS[t.status].label, PRIORIDADES[t.priority].label, t.fecha?.toLocaleDateString('sv-SE')]))}>
            <label>Enfoque<select value={enfoque} onChange={e => { setEnfoque(e.target.value as Enfoque); if (e.target.value !== 'all') setVer('activas'); }}><option value="all">Todas las fechas</option><option value="vencidas">Solo vencidas</option><option value="semana">Hoy y próximos 7 días</option><option value="alta">Prioridad alta</option></select></label>
            <label>Orden dentro de cada grupo<select value={orden} onChange={e => setOrden(e.target.value as typeof orden)}><option value="plazo">Fecha límite</option><option value="prioridad">Prioridad</option><option value="nombre">Nombre A–Z</option></select></label>
          </WorkViewToolbar>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="tr-seg" role="group" aria-label="Mostrar">
              {([['activas', 'Activas'], ['completadas', 'Completadas'], ['todas', 'Todas']] as [Ver, string][]).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={ver === v} onClick={() => { setVer(v); if (v === 'completadas') setEnfoque('all'); }}>{l}</button>
              ))}
            </div>
            <div className="relative flex-1 min-w-0 sm:ml-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--moon-muted)' }} />
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar en mis tareas…" aria-label="Buscar en mis tareas"
                className="w-full h-9 pl-9 pr-3 text-sm" />
            </div>
          </div>

          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--moon-muted)' }}><Loader2 size={16} className="animate-spin" /> Cargando tus tareas…</div>
          ) : error ? (
            <div data-moon-reveal="card" className="tr-vacio" style={{ color: panelInk('#f87171') }}><AlertTriangle size={22} /> {error}</div>
          ) : grupos.length === 0 ? (
            <div data-moon-reveal="card" className="tr-vacio">
              <CircleCheckBig size={26} strokeWidth={1.5} style={{ color: panelInk('#34d399') }} />
              <p style={{ color: 'var(--moon-ink)' }}>
                {buscar || enfoque !== 'all' ? 'Ninguna tarea coincide con estos filtros' : ver === 'completadas' ? 'Aún no completas ninguna tarea' : 'Estás al día'}
              </p>
              {!buscar && enfoque === 'all' && ver !== 'completadas' && <p className="text-xs">Cuando te asignen una tarea, aparecerá aquí y te llegará un aviso.</p>}
            </div>
          ) : (
            <div>
              {grupos.map(g => (
                <section key={g.id}>
                  <div className="tr-grupo-hd">
                    <span className="tr-punto" style={{ ['--tr-c' as string]: panelInk(g.color) }} />
                    <span style={{ color: 'var(--moon-ink)' }}>{g.label}</span>
                    <span className="tabular-nums">{g.tareas.length}</span>
                    <span className="tr-linea-h" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {g.tareas.map(t => (
                      <TareaFila key={t.id} tarea={t} usuarios={usuarios} reportes={miReporte(t.id)}
                        onAbrir={() => setDetalle(t.id)}
                        onCompletar={gestor ? () => void cambiarEstado(t, t.status === 'completed' ? 'pending' : 'completed') : undefined}
                        onReportar={t.status !== 'completed' ? () => setReportar(t) : undefined} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <TareaDetalleDialog tarea={detalle} open={!!detalle} onOpenChange={v => { if (!v) setDetalle(null); }}
        usuarios={usuarios} reportes={detalle ? reportesDe(detalle.id) : []} gestor={gestor}
        onCambiarEstado={gestor && detalle ? s => void cambiarEstado(detalle, s) : undefined}
        onReportar={detalle && detalle.status !== 'completed' ? () => { setReportar(detalle); setDetalle(null); } : undefined} />

      {reportar && userProfile && (
        <TaskReportDialog open={!!reportar} onClose={() => setReportar(null)} task={reportar} userProfile={userProfile} />
      )}
    </div>
  );
}
