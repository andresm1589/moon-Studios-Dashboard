import { panelInk } from '@/lib/panelColors';
import { EnterpriseFocus } from '@/components/EnterpriseFocus';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, subscribeToUsers } from '@/lib/firebase';
import {
  collection, onSnapshot, query, orderBy, limit, where,
  getDocs, getCountFromServer, Timestamp,
} from 'firebase/firestore';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { SystemLog, LogLevel, UserRole } from '@/types';
import {
  Search, AlertTriangle, Info, CheckCircle2,
  XCircle, Users, Settings, BarChart3, Database,
  RefreshCw, Download, Terminal, Layers, Server, Lock,
  Activity, ChevronDown, Clock,
  AlertCircle, Eye, Package,
  X,
} from 'lucide-react';
import { format, subDays, subHours, startOfHour, isAfter } from 'date-fns';
import { fechaHora, diaMes } from '@/lib/ajustes/fecha';

// ─── Constantes ──────────────────────────────────────────────────────────────
const LOG_META: Record<LogLevel, { label: string; color: string; bg: string; icon: React.FC<any> }> = {
  info:    { label: 'Info',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   icon: Info },
  warning: { label: 'Warning', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: AlertTriangle },
  error:   { label: 'Error',   color: '#f87171', bg: 'rgba(248,113,113,0.1)', icon: XCircle },
  success: { label: 'Success', color: '#34d399', bg: 'rgba(52,211,153,0.1)',  icon: CheckCircle2 },
};

const ROLE_COLORS: Record<string, string> = {
  CEO:            '#c084fc',
  Administración: '#60a5fa',
  Diseño:         '#a78bfa',
  Secretaría:     '#4ade80',
  Programación:   '#f472b6',
  Contador:       '#34d399',
  Empleado:       '#94a3b8',
};

const MODULES = ['auth', 'users', 'admin', 'diseno', 'secretaria', 'programacion', 'contador', 'discord', 'correo', 'system'];

const COLLECTIONS: { id: string; label: string; color: string }[] = [
  { id: 'users',           label: 'Usuarios',         color: '#60a5fa' },
  { id: 'dev_projects',    label: 'Proyectos',         color: '#f472b6' },
  { id: 'dev_changelog',   label: 'Changelog',         color: '#a78bfa' },
  { id: 'dev_tasks',       label: 'Tareas dev',        color: '#818cf8' },
  { id: 'diseno_media',    label: 'Archivos diseño',   color: '#c084fc' },
  { id: 'secretaria_docs', label: 'Documentos',        color: '#4ade80' },
  { id: 'activityLogs',    label: 'Actividad',         color: '#f59e0b' },
  { id: 'userActivityLogs', label: 'Accesos',          color: '#9ca3af' },
  { id: 'bug_reports',     label: 'Bug Reports',       color: '#fb923c' },
  { id: 'maintenance',     label: 'Mantenimiento',     color: '#34d399' },
];

// Módulos que cuentan como auditoría (cuentas, roles y acciones de admin).
// Una sola lista para el filtro y para el chequeo de "vacío".
const AUDIT_MODULES = ['auth', 'admin', 'users'];
const AUDIT_HORAS   = 48;

const ROLE_ORDER: UserRole[] = ['CEO', 'Administración', 'Diseño', 'Secretaría', 'Programación', 'Contador', 'Empleado'];

type Tab = 'logs' | 'estadisticas' | 'auditoria' | 'config';

interface SystemStats {
  totalUsers: number;
  byRole: Record<string, number>;
  totalDocs: Record<string, number>;
  errorRate: number;
  logsHoy: number;
  logsHora: number;
}

interface LogEntry extends SystemLog {
  id: string;
  createdAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const bd = 'var(--moon-line)';
const sf = 'var(--moon-surface)';

function exportJSON(data: any[], filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(data: any[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows    = data.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
  const csv     = [headers.join(','), ...rows].join('\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Un registro de `activityLogs` con la forma que usa este panel. Los viejos
// (del Panel CEO antes de unificar) solo tenían action/details/timestamp.
function aLogEntry(id: string, r: any): LogEntry {
  const fecha = r.createdAt?.toDate?.() ?? r.timestamp?.toDate?.() ?? new Date();
  const texto = r.message ?? r.description ?? r.action ?? 'Actividad';
  return { ...r, id, createdAt: fecha, message: texto, level: r.level ?? 'info', module: r.module ?? 'system' } as LogEntry;
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function PanelAdmin() {
  const { currentUser, userProfile } = useAuth();

  // ── Estados ────────────────────────────────────────────────────────────────
  const [logs,           setLogs]           = useState<LogEntry[]>([]);
  const [stats,          setStats]          = useState<SystemStats | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState<Tab>('logs');
  const [search,         setSearch]         = useState('');
  const [filterLevel,    setFilterLevel]    = useState<LogLevel | 'all'>('all');
  const [filterModule,   setFilterModule]   = useState<string>('all');
  const [loadingStats,   setLoadingStats]   = useState(false);
  const [logLimit,       setLogLimit]       = useState(200);
  const [expandedLog,    setExpandedLog]    = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [statsError,     setStatsError]     = useState<string | null>(null);
  const [userCount,      setUserCount]      = useState<number | null>(null);
  const [appVersion,     setAppVersion]     = useState<string>(
    // En web no hay versión de Tauri: se muestra la del build si existe.
    (import.meta.env.VITE_APP_VERSION as string | undefined) || '—'
  );
  const exportRef = useRef<HTMLDivElement>(null);

  // ── Versión real de la app ─────────────────────────────────────────────────
  // Igual que Ajustes: en el escritorio se le pregunta a Tauri; en web se queda
  // la del build (o "—").
  useEffect(() => {
    if (!isTauri()) return;
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  // ── Conteo de usuarios para el encabezado ──────────────────────────────────
  // Antes salía "—" hasta abrir Estadísticas; ahora se escucha desde el inicio.
  useEffect(() => {
    const unsub = subscribeToUsers(
      lista => setUserCount(lista.length),
      err => console.error('PanelAdmin usuarios:', err),
    );
    return () => unsub();
  }, []);

  // ── Suscripción real a logs ────────────────────────────────────────────────
  // `activityLogs` es donde escribe todo el portal (lib/firebase.ts →
  // logActivity). Antes se leía `system_logs`, que nadie escribía.
  const [logsError, setLogsError] = useState<string | null>(null);
  useEffect(() => {
    const q = query(
      collection(db, 'activityLogs'),
      orderBy('createdAt', 'desc'),
      limit(logLimit)
    );
    const unsub = onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => aLogEntry(d.id, d.data())));
      setLogsError(null);
      setLoading(false);
    }, (err) => { setLogsError(err.message); setLoading(false); });
    return () => unsub();
  }, [logLimit]);

  // ── Cerrar export menu al click fuera ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Cargar estadísticas ────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      // Usuarios por rol
      const usersSnap = await getDocs(collection(db, 'users'));
      const byRole    = ROLE_ORDER.reduce((a, r) => { a[r] = 0; return a; }, {} as Record<string, number>);
      usersSnap.forEach(d => {
        const role = d.data().role as string;
        if (role in byRole) byRole[role]++;
      });

      // Conteo de colecciones
      const totalDocs: Record<string, number> = {};
      await Promise.all(COLLECTIONS.map(async col => {
        try {
          const snap = await getCountFromServer(collection(db, col.id));
          totalDocs[col.id] = snap.data().count;
        } catch { totalDocs[col.id] = 0; }
      }));

      // Métricas de logs
      const hoy        = startOfHour(new Date());
      const hace24h    = subDays(new Date(), 1);
      const logsSnap   = await getDocs(query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(500)));
      const allLogs    = logsSnap.docs.map(d => aLogEntry(d.id, d.data()));
      const logsHoy    = allLogs.filter((l: any) => isAfter(l.createdAt, hace24h)).length;
      const logsHora   = allLogs.filter((l: any) => isAfter(l.createdAt, hoy)).length;
      const errores    = allLogs.filter((l: any) => l.level === 'error').length;
      const errorRate  = allLogs.length > 0 ? Math.round((errores / allLogs.length) * 100) : 0;

      setStats({ totalUsers: usersSnap.size, byRole, totalDocs, errorRate, logsHoy, logsHora });
      setStatsError(null);
    } catch (err) {
      console.error('loadStats:', err);
      setStatsError('No se pudieron calcular las estadísticas. Inténtalo de nuevo.');
      toast.error('No se pudieron cargar las estadísticas');
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'estadisticas') loadStats();
  }, [activeTab, loadStats]);

  // ── Auditoría: últimas 48 h ───────────────────────────────────────────────
  // Consulta propia por fecha: la lista de Logs está limitada a N entradas y
  // podía cortar eventos de las últimas 48 h (o mostrar otros más viejos).
  const [auditLogs,  setAuditLogs]  = useState<LogEntry[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  useEffect(() => {
    if (activeTab !== 'auditoria') return;
    const desde = Timestamp.fromDate(subHours(new Date(), AUDIT_HORAS));
    const q = query(
      collection(db, 'activityLogs'),
      where('createdAt', '>=', desde),
      orderBy('createdAt', 'desc'),
      limit(500),
    );
    const unsub = onSnapshot(q, snap => {
      setAuditLogs(snap.docs.map(d => aLogEntry(d.id, d.data())));
      setAuditError(null);
    }, err => { setAuditError(err.message); setAuditLogs([]); });
    return () => unsub();
  }, [activeTab]);

  // Se vuelve a cortar por fecha aquí por si la pestaña queda abierta mucho rato.
  const auditCorte    = subHours(new Date(), AUDIT_HORAS);
  const auditFiltrado = (auditLogs ?? [])
    .filter(l => AUDIT_MODULES.includes(l.module) && isAfter(l.createdAt, auditCorte));

  // ── Exportar ──────────────────────────────────────────────────────────────
  const handleExport = (format_: 'json' | 'csv') => {
    if (filteredLogs.length === 0) {
      toast.info('No hay logs para exportar');
      setShowExportMenu(false);
      return;
    }
    const data = filteredLogs.map(l => ({
      nivel:   l.level,
      módulo:  l.module,
      mensaje: l.message,
      usuario: l.userName ?? '—',
      uid:     l.userId ?? '—',
      fecha:   fechaHora(l.createdAt, true),
    }));
    const fname = `logs_${format(new Date(), 'yyyyMMdd_HHmm')}`;
    format_ === 'json' ? exportJSON(data, `${fname}.json`) : exportCSV(data, `${fname}.csv`);
    setShowExportMenu(false);
  };

  // ── Derivados ─────────────────────────────────────────────────────────────
  const filteredLogs = logs.filter(l => {
    const ml = filterLevel === 'all' || l.level === filterLevel;
    const mm = filterModule === 'all' || l.module === filterModule;
    const ms = !search ||
      l.message.toLowerCase().includes(search.toLowerCase()) ||
      l.module.toLowerCase().includes(search.toLowerCase()) ||
      l.userName?.toLowerCase().includes(search.toLowerCase()) ||
      l.userId?.toLowerCase().includes(search.toLowerCase());
    return ml && mm && ms;
  });

  const countByLevel = (['info', 'warning', 'error', 'success'] as LogLevel[]).reduce((acc, l) => {
    acc[l] = logs.filter(x => x.level === l).length;
    return acc;
  }, {} as Record<LogLevel, number>);

  const moduleCounts = MODULES.reduce((acc, m) => {
    acc[m] = logs.filter(l => l.module === m).length;
    return acc;
  }, {} as Record<string, number>);

  const TABS: { id: Tab; label: string; icon: React.FC<any>; badge?: number }[] = [
    { id: 'logs',        label: 'Logs',          icon: Terminal,   badge: countByLevel.error },
    { id: 'estadisticas',label: 'Estadísticas',  icon: BarChart3 },
    { id: 'auditoria',   label: 'Auditoría',     icon: Eye },
    { id: 'config',      label: 'Sistema',       icon: Settings },
  ];

  return (
    <div className="moon-module moon-module--panel-admin max-w-5xl mx-auto space-y-6">

      <EnterpriseFocus eyebrow="Administración · Supervisión" title="Centro de operaciones"
        description="Revisa el estado del sistema, investiga incidencias y consulta el historial de actividad del equipo."
        metrics={[
          { label: 'Errores cargados', value: countByLevel.error, detail: 'Investigar registros', onClick: () => { setSearch(''); setFilterModule('all'); setFilterLevel('error'); setActiveTab('logs'); } },
          { label: 'Advertencias', value: countByLevel.warning, detail: 'Revisar actividad', onClick: () => { setSearch(''); setFilterModule('all'); setFilterLevel('warning'); setActiveTab('logs'); } },
          { label: 'Usuarios', value: userCount ?? stats?.totalUsers ?? '—', detail: 'Consultar estadísticas', onClick: () => setActiveTab('estadisticas') },
        ]}>
        <button type="button" className="enterprise-action" onClick={() => setActiveTab('auditoria')}><Eye />Auditar accesos</button>
        {activeTab === 'logs' && (
          <div className="flex items-center gap-2">
            {/* Exportar */}
            <div className="relative" ref={exportRef}>
              <button onClick={() => setShowExportMenu(v => !v)}
                className="enterprise-action">
                <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                Exportar
                <ChevronDown className={`w-3 h-3 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} strokeWidth={1.5} />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-36 rounded-xl overflow-hidden z-50"
                  style={{ background: 'var(--moon-surface)', border: `1px solid ${bd}` }}>
                  {['JSON', 'CSV'].map(f => (
                    <button key={f} onClick={() => handleExport(f.toLowerCase() as any)}
                      className="w-full px-4 py-2.5 text-left text-xs font-light moon-panel-muted moon-panel-hover transition-colors flex items-center gap-2">
                      <Package className="w-3 h-3 moon-panel-muted" strokeWidth={1.5} />
                      Exportar {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </EnterpriseFocus>

      {/* ── Cards resumen por nivel ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['info', 'warning', 'error', 'success'] as LogLevel[]).map(level => {
          const meta   = LOG_META[level];
          const Icon   = meta.icon;
          const active = filterLevel === level;
          const pct    = logs.length > 0 ? Math.round((countByLevel[level] / logs.length) * 100) : 0;
          return (
            <button data-moon-reveal="metric" key={level} onClick={() => setFilterLevel(active ? 'all' : level)}
              className="moon-stat rounded-2xl p-4 text-left transition-all"
              style={{ background: active ? meta.bg : sf, border: `1px solid ${active ? meta.color + '55' : bd}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: meta.bg }}>
                  <Icon className="w-4 h-4" style={{ color: panelInk(meta.color) }} strokeWidth={1.5} />
                </div>
                <span className="text-[10px] font-light" style={{ color: panelInk(meta.color) }}>{pct}%</span>
              </div>
              <p className="moon-panel-ink text-2xl font-light tabular-nums">{countByLevel[level]}</p>
              <p className="text-xs font-light mt-0.5" style={{ color: panelInk(meta.color) }}>{meta.label}</p>
            </button>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <div data-moon-reveal="card" className="moon-panel flex gap-1 p-1 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
        {TABS.map(tab => {
          const Icon   = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 py-2.5 rounded-xl text-xs font-light transition-all flex items-center justify-center gap-1.5"
              style={{ background: active ? "var(--moon-surface-raised)" : 'transparent', color: panelInk(active ? "var(--moon-ink)" : "var(--moon-muted)") }}>
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(248,113,113,0.2)', color: panelInk('#f87171') }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ════ LOGS ════ */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Filtros avanzados */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 moon-panel-muted" strokeWidth={1.5} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar mensaje, módulo, usuario, UID..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs font-light moon-panel-ink placeholder-zinc-700 outline-none"
                style={{ background: 'var(--moon-surface)', border: `1px solid ${bd}` }} />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 moon-panel-muted moon-panel-hover">
                  <X className="w-3 h-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
            <div className="relative">
              <select value={filterModule} onChange={e => setFilterModule(e.target.value)}
                className="appearance-none pl-3.5 pr-9 py-2.5 rounded-xl text-xs font-light moon-panel-ink outline-none cursor-pointer"
                style={{ background: 'var(--moon-surface)', border: `1px solid ${bd}` }}>
                <option value="all">Todos los módulos</option>
                {MODULES.filter(m => moduleCounts[m] > 0).map(m => (
                  <option key={m} value={m}>{m} ({moduleCounts[m]})</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 moon-panel-muted pointer-events-none" strokeWidth={1.5} />
            </div>
            <div className="relative">
              <select value={logLimit} onChange={e => setLogLimit(parseInt(e.target.value))}
                className="appearance-none pl-3.5 pr-9 py-2.5 rounded-xl text-xs font-light moon-panel-ink outline-none cursor-pointer"
                style={{ background: 'var(--moon-surface)', border: `1px solid ${bd}` }}>
                {[50, 100, 200, 500].map(n => <option key={n} value={n}>Últimos {n}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 moon-panel-muted pointer-events-none" strokeWidth={1.5} />
            </div>
          </div>

          {/* Info fila resultados */}
          <div className="flex items-center justify-between">
            <p className="moon-panel-muted text-xs font-light">
              {filteredLogs.length} de {logs.length} entradas
              {(filterLevel !== 'all' || filterModule !== 'all' || search) && ' (filtrado)'}
            </p>
            {(filterLevel !== 'all' || filterModule !== 'all' || search) && (
              <button onClick={() => { setFilterLevel('all'); setFilterModule('all'); setSearch(''); }}
                className="moon-panel-muted moon-panel-hover text-xs font-light transition-colors flex items-center gap-1">
                <X className="w-3 h-3" strokeWidth={1.5} /> Limpiar filtros
              </button>
            )}
          </div>

          {/* Tabla de logs */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${bd}` }}>
            {loading ? (
              <div className="py-16 flex items-center justify-center gap-3">
                <div className="w-5 h-5 border moon-panel-border border-t-zinc-400 rounded-full animate-spin" />
                <span className="moon-panel-muted text-sm font-light">Cargando logs en tiempo real...</span>
              </div>
            ) : logsError ? (
              <div className="py-16 text-center px-4">
                <AlertCircle className="w-10 h-10 text-red-400/70 mx-auto mb-3" strokeWidth={1} />
                <p className="moon-panel-tone-red text-sm font-light">No se pudo leer el registro de actividad</p>
                <p className="moon-panel-muted text-xs font-light mt-1">{logsError}</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-16 text-center">
                <Terminal className="w-10 h-10 moon-panel-muted mx-auto mb-3" strokeWidth={1} />
                <p className="moon-panel-muted text-sm font-light">Sin logs que mostrar</p>
                <p className="moon-panel-muted text-xs font-light mt-1">
                  {filterLevel !== 'all' || filterModule !== 'all' || search ? 'Ajusta los filtros' : 'Los logs aparecerán aquí en tiempo real'}
                </p>
              </div>
            ) : (
              <>
                {/* Header tabla */}
                <div className="grid grid-cols-12 gap-2 px-5 py-3"
                  style={{ background: 'var(--moon-surface)', borderBottom: `1px solid ${bd}` }}>
                  {[
                    { label: 'Nivel',   cols: 'col-span-2' },
                    { label: 'Módulo',  cols: 'col-span-2' },
                    { label: 'Mensaje', cols: 'col-span-5' },
                    { label: 'Usuario', cols: 'col-span-2' },
                    { label: 'Hora',    cols: 'col-span-1' },
                  ].map(h => (
                    <span key={h.label} className={`${h.cols} moon-panel-muted text-[10px] font-light uppercase tracking-widest`}>{h.label}</span>
                  ))}
                </div>

                {/* Filas */}
                <div className="divide-y" style={{ borderColor: "var(--moon-line)" }}>
                  {filteredLogs.map(log => {
                    const meta   = LOG_META[log.level] ?? LOG_META.info;
                    const Icon   = meta.icon;
                    const isExp  = expandedLog === log.id;
                    return (
                      <div data-moon-reveal="row" key={log.id}
                        className="moon-panel-hover transition-colors cursor-pointer"
                        onClick={() => setExpandedLog(isExp ? null : log.id)}>
                        <div className="grid grid-cols-12 gap-2 px-5 py-3 items-center">
                          <div className="col-span-2">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-light"
                              style={{ color: panelInk(meta.color), background: meta.bg, border: `1px solid ${meta.color}25` }}>
                              <Icon className="w-3 h-3 flex-shrink-0" strokeWidth={1.5} />
                              {meta.label}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="moon-panel-muted text-xs font-light px-2 py-0.5 rounded-lg"
                              style={{ background: 'var(--moon-surface-raised)' }}>
                              {log.module}
                            </span>
                          </div>
                          <div className="col-span-5 min-w-0">
                            <p className={`text-xs font-light leading-relaxed ${isExp ? 'moon-panel-ink' : 'moon-panel-muted truncate'}`}>
                              {log.message}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="moon-panel-muted text-xs font-light truncate">{log.userName ?? log.userId ?? '—'}</p>
                          </div>
                          <div className="col-span-1">
                            <p className="moon-panel-muted text-xs font-light tabular-nums">{format(log.createdAt, 'HH:mm')}</p>
                            <p className="moon-panel-muted text-[10px] font-light tabular-nums">{diaMes(log.createdAt)}</p>
                          </div>
                        </div>

                        {/* Detalle expandido */}
                        {isExp && (
                          <div className="px-5 py-4 border-t space-y-3"
                            style={{ borderColor: bd, background: 'var(--moon-surface)' }}>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                { label: 'ID', value: log.id },
                                { label: 'Nivel', value: log.level },
                                { label: 'Módulo', value: log.module },
                                { label: 'Fecha completa', value: fechaHora(log.createdAt, true) },
                                { label: 'Usuario', value: log.userName ?? '—' },
                                { label: 'UID', value: log.userId ?? '—' },
                              ].map(({ label, value }) => (
                                <div key={label}>
                                  <p className="moon-panel-muted text-[10px] font-light uppercase tracking-widest mb-1">{label}</p>
                                  <p className="moon-panel-muted text-xs font-light font-mono break-all">{value}</p>
                                </div>
                              ))}
                            </div>
                            <div>
                              <p className="moon-panel-muted text-[10px] font-light uppercase tracking-widest mb-1">Mensaje completo</p>
                              <p className="moon-panel-muted text-xs font-light leading-relaxed break-words">{log.message}</p>
                            </div>
                            {(log as any).metadata && (
                              <div>
                                <p className="moon-panel-muted text-[10px] font-light uppercase tracking-widest mb-1">Metadata</p>
                                <pre className="moon-panel-muted text-[10px] font-mono leading-relaxed overflow-x-auto px-3 py-2 rounded-lg"
                                  style={{ background: 'var(--moon-surface)', border: `1px solid ${bd}` }}>
                                  {JSON.stringify((log as any).metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Histograma por módulo */}
          {logs.length > 0 && (
            <div data-moon-reveal="card" className="moon-panel rounded-2xl p-4" style={{ background: sf, border: `1px solid ${bd}` }}>
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 moon-panel-muted" strokeWidth={1.5} />
                <p className="moon-panel-muted text-xs font-light uppercase tracking-widest">Distribución por módulo</p>
              </div>
              <div className="space-y-2">
                {MODULES.filter(m => moduleCounts[m] > 0)
                  .sort((a, b) => moduleCounts[b] - moduleCounts[a])
                  .map(m => {
                    const count = moduleCounts[m];
                    const pct   = logs.length > 0 ? (count / logs.length) * 100 : 0;
                    const active = filterModule === m;
                    return (
                      <div key={m} className="cursor-pointer" onClick={() => setFilterModule(active ? 'all' : m)}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="moon-panel-muted text-xs font-light">{m}</span>
                          <div className="flex items-center gap-2">
                            <span className="moon-panel-muted text-[10px] font-light">{pct.toFixed(0)}%</span>
                            <span className="moon-panel-muted text-xs font-light tabular-nums w-6 text-right">{count}</span>
                          </div>
                        </div>
                        <div className="h-1.5 moon-panel-surface rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: active ? '#60a5fa' : "var(--moon-surface-raised)" }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════ ESTADÍSTICAS ════ */}
      {activeTab === 'estadisticas' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="moon-panel-muted text-sm font-light">Resumen del sistema</p>
            <button onClick={loadStats} disabled={loadingStats}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-light moon-panel-muted moon-panel-hover transition-colors"
              style={{ background: sf, border: `1px solid ${bd}` }}>
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              Actualizar
            </button>
          </div>

          {loadingStats ? (
            <div className="py-16 flex items-center justify-center gap-3">
              <div className="w-5 h-5 border moon-panel-border border-t-zinc-400 rounded-full animate-spin" />
              <span className="moon-panel-muted text-sm font-light">Calculando estadísticas...</span>
            </div>
          ) : stats ? (
            <>
              {/* KPIs sistema */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total usuarios',  value: stats.totalUsers,   color: '#60a5fa', icon: Users },
                  { label: 'Logs últimas 24h', value: stats.logsHoy,    color: '#a78bfa', icon: Activity },
                  { label: 'Logs esta hora',   value: stats.logsHora,   color: '#34d399', icon: Clock },
                  { label: 'Tasa de error',    value: `${stats.errorRate}%`, color: stats.errorRate > 10 ? '#f87171' : '#34d399', icon: AlertCircle },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div data-moon-reveal="card" key={label} className="moon-panel rounded-2xl p-4 space-y-3" style={{ background: sf, border: `1px solid ${bd}` }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: color + '18' }}>
                      <Icon className="w-4 h-4" style={{ color: panelInk(color) }} strokeWidth={1.5} />
                    </div>
                    <p className="text-2xl font-light tabular-nums" style={{ color: panelInk(color) }}>{value}</p>
                    <p className="text-[10px] uppercase tracking-widest font-light moon-panel-muted">{label}</p>
                  </div>
                ))}
              </div>

              {/* Usuarios por rol */}
              <div data-moon-reveal="card" className="moon-panel rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 moon-panel-muted" strokeWidth={1.5} />
                    <p className="moon-panel-ink text-sm font-light">Distribución por rol</p>
                  </div>
                  <span className="moon-panel-muted text-xs font-light px-2.5 py-1 rounded-lg" style={{ background: 'var(--moon-surface-raised)' }}>
                    {stats.totalUsers} total
                  </span>
                </div>
                <div className="space-y-3.5">
                  {ROLE_ORDER.map(role => {
                    const count = stats.byRole[role] ?? 0;
                    const pct   = stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0;
                    const color = ROLE_COLORS[role] ?? '#6b7280';
                    return (
                      <div key={role}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                            <span className="moon-panel-muted text-sm font-light">{role}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="moon-panel-muted text-xs font-light">{pct.toFixed(0)}%</span>
                            <span className="moon-panel-ink text-sm font-light tabular-nums w-4 text-right">{count}</span>
                          </div>
                        </div>
                        <div className="h-1.5 moon-panel-surface rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: color + 'bb' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Colecciones Firestore */}
              <div data-moon-reveal="card" className="moon-panel rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
                <div className="flex items-center gap-2 mb-5">
                  <Database className="w-4 h-4 moon-panel-muted" strokeWidth={1.5} />
                  <p className="moon-panel-ink text-sm font-light">Colecciones Firestore</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {COLLECTIONS.map(col => {
                    const count = stats.totalDocs[col.id] ?? 0;
                    return (
                      <div key={col.id} className="rounded-xl p-3.5 transition-all hover:border-zinc-700"
                        style={{ background: 'var(--moon-surface)', border: `1px solid ${bd}` }}>
                        <div className="w-2 h-2 rounded-full mb-3" style={{ background: col.color }} />
                        <p className="moon-panel-ink text-xl font-light tabular-nums">{count}</p>
                        <p className="moon-panel-muted text-[10px] font-light mt-1 uppercase tracking-widest">{col.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center rounded-2xl" style={{ border: `1px dashed ${bd}` }}>
              <BarChart3 className="w-10 h-10 moon-panel-muted mx-auto mb-3" strokeWidth={1} />
              <p className={`text-sm font-light ${statsError ? 'moon-panel-tone-red' : 'moon-panel-muted'}`}>
                {statsError ?? 'Cargando estadísticas...'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════ AUDITORÍA ════ */}
      {activeTab === 'auditoria' && (
        <div className="space-y-4">
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${bd}` }}>
            <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'var(--moon-surface)', borderBottom: `1px solid ${bd}` }}>
              <Eye className="w-4 h-4 moon-panel-muted" strokeWidth={1.5} />
              <p className="moon-panel-ink text-sm font-light">Registro de acciones</p>
              <span className="moon-panel-muted text-xs font-light ml-auto">Últimas {AUDIT_HORAS}h</span>
            </div>
            {auditLogs === null ? (
              <div className="py-12 flex items-center justify-center gap-3">
                <div className="w-5 h-5 border moon-panel-border border-t-zinc-400 rounded-full animate-spin" />
                <span className="moon-panel-muted text-sm font-light">Cargando auditoría...</span>
              </div>
            ) : auditError ? (
              <div className="py-12 text-center px-4">
                <AlertCircle className="w-8 h-8 text-red-400/70 mx-auto mb-3" strokeWidth={1} />
                <p className="moon-panel-tone-red text-sm font-light">No se pudo leer la auditoría</p>
                <p className="moon-panel-muted text-xs font-light mt-1">{auditError}</p>
              </div>
            ) : auditFiltrado.length === 0 ? (
              <div className="py-12 text-center">
                <Eye className="w-8 h-8 moon-panel-muted mx-auto mb-3" strokeWidth={1} />
                <p className="moon-panel-muted text-sm font-light">Sin eventos de auditoría recientes</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--moon-line)" }}>
                {auditFiltrado
                  .slice(0, 50)
                  .map(log => {
                    const meta = LOG_META[log.level] ?? LOG_META.info;
                    return (
                      <div key={log.id} className="flex items-start gap-4 px-5 py-3.5 moon-panel-hover transition-colors">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: meta.bg }}>
                          <meta.icon className="w-3.5 h-3.5" style={{ color: panelInk(meta.color) }} strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="moon-panel-muted text-xs font-light">{log.message}</p>
                          <div className="flex items-center gap-3 mt-1 text-[10px] font-light moon-panel-muted">
                            <span>{log.userName ?? log.userId ?? 'Sistema'}</span>
                            <span>·</span>
                            <span>{log.module}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="moon-panel-muted text-[10px] font-light">{format(log.createdAt, 'HH:mm')}</p>
                          <p className="moon-panel-muted text-[10px] font-light">{diaMes(log.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ SISTEMA / CONFIG ════ */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          {/* Info del sistema */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${bd}` }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ background: 'var(--moon-surface)', borderBottom: `1px solid ${bd}` }}>
              <Server className="w-4 h-4 moon-panel-muted" strokeWidth={1.5} />
              <p className="moon-panel-ink text-sm font-light">Información del sistema</p>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--moon-line)" }}>
              {[
                { label: 'Versión Dashboard',  value: appVersion,                                    color: '#60a5fa' },
                { label: 'Backend',            value: 'Firebase Firestore + Supabase Storage',        color: null },
                { label: 'Autenticación',      value: 'Firebase Auth',                               color: null },
                { label: 'Frontend',           value: 'React 19 + TailwindCSS + Radix UI',           color: null },
                { label: 'Bot Discord',        value: 'Luna NET (Node.js + Discord.js v14)',          color: null },
                { label: 'Administrador',      value: userProfile?.displayName ?? '—',               color: '#34d399' },
                { label: 'Rol',               value: userProfile?.role ?? '—',                       color: ROLE_COLORS[userProfile?.role ?? ''] ?? null },
                { label: 'UID',               value: currentUser?.uid ?? '—',                        color: null },
                // lastSignInTime es el último inicio de sesión; creationTime era la fecha de alta de la cuenta.
                { label: 'Sesión iniciada',   value: currentUser?.metadata?.lastSignInTime ? fechaHora(new Date(currentUser.metadata.lastSignInTime)) : '—', color: null },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between px-5 py-3.5 moon-panel-hover transition-colors">
                  <span className="moon-panel-muted text-sm font-light">{item.label}</span>
                  <span className="text-sm font-light font-mono" style={{ color: panelInk(item.color ?? "var(--moon-ink)") }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stack técnico */}
          <div data-moon-reveal="card" className="moon-panel rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 moon-panel-muted" strokeWidth={1.5} />
              <p className="moon-panel-ink text-sm font-light">Stack técnico</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'React 19',    color: '#61dafb' },
                { name: 'TypeScript',  color: '#3178c6' },
                { name: 'TailwindCSS', color: '#06b6d4' },
                { name: 'Firebase',    color: '#f59e0b' },
                { name: 'Supabase',    color: '#3ecf8e' },
                { name: 'Radix UI',    color: '#9ca3af' },
                { name: 'Vite',        color: '#646cff' },
                { name: 'Discord.js',  color: '#5865f2' },
              ].map(t => (
                <span key={t.name} className="px-3 py-1.5 rounded-xl text-xs font-light"
                  style={{ color: panelInk(t.color), background: t.color + '15', border: `1px solid ${t.color}30` }}>
                  {t.name}
                </span>
              ))}
            </div>
          </div>

          {/* Colecciones activas */}
          <div data-moon-reveal="card" className="moon-panel rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 moon-panel-muted" strokeWidth={1.5} />
              <p className="moon-panel-ink text-sm font-light">Colecciones activas</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {COLLECTIONS.map(col => (
                <span key={col.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-light"
                  style={{ color: panelInk(col.color), background: col.color + '12', border: `1px solid ${col.color}25` }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: col.color }} />
                  {col.id}
                </span>
              ))}
            </div>
          </div>

          {/* Zona de peligro */}
          <div data-moon-reveal="card" className="moon-panel rounded-2xl p-5" style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 moon-panel-tone-red" strokeWidth={1.5} />
              <p className="moon-panel-tone-red text-sm font-light">Zona de peligro</p>
            </div>
            <p className="moon-panel-muted text-xs font-light leading-relaxed">
              El registro de actividad es de solo agregar: las reglas de Firestore no permiten borrar
              entradas desde el portal, para que nadie pueda ocultar lo que hizo. Si hace falta
              limpiarlo, se hace desde la consola de Firebase.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
