import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Bot, CalendarDays,
  Check, CheckCheck, ChevronDown, Circle, Clock3, FolderKanban, Maximize2,
  Megaphone, MessageSquare, Pause, Play, Plus, ShieldCheck, X,
} from 'lucide-react';
import { db, getAnnouncements, subscribeToTasks } from '@/lib/firebase';
import { getBotStatus, getPublicStatus } from '@/services/discordApi';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { aTarea, esGestorTareas, esParaMi, plazo } from '@/lib/tareas';
import type { Announcement, Task } from '@/types';
import { BrandLogo } from './BrandLogo';
import { useElectoralPublicState } from '@/electoral/useElectoralPublicState';
import { ElectoralAnnouncementBoard, ElectoralClosure, ElectoralUnavailable } from '@/electoral/ElectoralPublicPanel';
import './dashboard-home.css';

type DateValue = unknown;
type BotState = 'online' | 'offline' | 'unknown';
type LoadState = 'loading' | 'ready' | 'error';
export interface DashboardBanner { id: string; url: string; titulo: string; descripcion?: string; creadoEn?: DateValue; orden?: number }
export interface DashboardProject { id: string; nombre: string; descripcion?: string; progreso: number; estado: string; color?: string; actualizadoEn?: DateValue; creadoEn?: DateValue }
export interface DashboardActivity { id: string; message: string; timestamp?: DateValue; meta?: string }
export interface DashboardHealth { label: string; value: string; ok: boolean | null; detail?: string }
interface BannerConfig { autoplay: boolean; interval: number; quality: string }
export interface DashboardHomeViewProps {
  displayName?: string; teamScope?: boolean; tasks: Task[]; announcements: Announcement[];
  projects: DashboardProject[]; activity: DashboardActivity[]; activityLive?: boolean;
  botState: BotState; banners: DashboardBanner[]; bannerConfig?: BannerConfig;
  health: DashboardHealth[]; healthChecked?: Date;
  electoralContent?: ReactNode;
  taskState?: LoadState; announcementState?: LoadState; projectState?: LoadState; healthState?: LoadState;
  onNavigate: (path: string) => void;
}

const asDate = (value: DateValue): Date | null => {
  if (!value) return null;
  try {
    const converted = typeof value === 'object' && value !== null && 'toDate' in value
      ? (value as { toDate: () => Date }).toDate()
      : value instanceof Date ? value : new Date(value as string | number);
    return Number.isFinite(converted.getTime()) ? converted : null;
  } catch { return null; }
};
const dateShort = (value: DateValue) => { const date = asDate(value); return date ? format(date, 'd MMM', { locale: es }) : 'Sin fecha'; };
const relative = (value: DateValue) => { const date = asDate(value); return date ? formatDistanceToNow(date, { locale: es, addSuffix: true }) : ''; };
const percentage = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const projectStatusLabels: Record<string, string> = { planning: 'Planificación', active: 'En curso', paused: 'Pausado', completed: 'Completado', cancelled: 'Cancelado', archived: 'Archivado' };
const statusLabel = (status?: string, legacyStatus?: string) => (status ? projectStatusLabels[status] : undefined) ?? legacyStatus ?? status ?? 'En curso';
const defaultBannerConfig: BannerConfig = { autoplay: true, interval: 5000, quality: 'auto' };

/** One animation frame serves the visible counters; React keeps the real values
 * and accessible labels. Offscreen, background and reduced-motion views settle
 * immediately, so an animated number can never leave old business data behind. */
function useHomeDataMotion(enabled: boolean, valuesKey: string) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previous = useRef(new WeakMap<HTMLElement, number>());
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    type Counter = { element: HTMLElement; from: number; target: number; started: number };
    const counters = new Map<HTMLElement, Counter>();
    const waiting = new Map<HTMLElement, { target: number; from: number }>();
    const fills = new Set<Animation>();
    const art = root.querySelector<HTMLElement>('.dh-hero-art');
    let frame = 0;
    root.dataset.homeMotionPaused = String(document.hidden);
    if (art) art.dataset.homeArtVisible = 'false';
    const artObserver = enabled && art && 'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
        for (const entry of entries) (entry.target as HTMLElement).dataset.homeArtVisible = String(entry.isIntersecting);
      }, { threshold: .05 }) : null;
    if (art && artObserver) artObserver.observe(art);
    else if (art && enabled) art.dataset.homeArtVisible = 'true';
    const write = (element: HTMLElement, value: number) => {
      element.textContent = String(Math.round(value)).padStart(Number(element.dataset.homeDigits ?? 1), '0');
    };
    const finish = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      for (const { element, target } of counters.values()) write(element, target);
      for (const [element, { target }] of waiting) if (element.dataset.homeCount !== undefined) write(element, target);
      counters.clear(); waiting.clear();
      for (const animation of fills) animation.finish();
      fills.clear();
    };
    const tick = (now: number) => {
      frame = 0;
      for (const [element, counter] of counters) {
        const progress = Math.min(1, (now - counter.started) / 1050);
        write(element, counter.from + (counter.target - counter.from) * (1 - (1 - progress) ** 3));
        if (progress === 1) counters.delete(element);
      }
      if (counters.size) frame = requestAnimationFrame(tick);
    };
    const reveal = (element: HTMLElement) => {
      const value = waiting.get(element);
      if (!value || document.hidden) return;
      waiting.delete(element);
      if (element.dataset.homeCount !== undefined) {
        counters.set(element, { element, ...value, started: performance.now() });
        if (!frame) frame = requestAnimationFrame(tick);
      } else {
        const animation = element.animate([{ scale: `${value.from / (value.target || 1)} 1` }, { scale: '1 1' }],
          { duration: 1050, easing: 'cubic-bezier(.22,1,.36,1)' });
        fills.add(animation);
        const finished = () => fills.delete(animation);
        animation.addEventListener('finish', finished, { once: true });
        animation.addEventListener('cancel', finished, { once: true });
      }
    };
    const observer = enabled && !document.hidden && 'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          reveal(entry.target as HTMLElement); observer?.unobserve(entry.target);
        }
      }, { threshold: .2 }) : null;
    for (const element of root.querySelectorAll<HTMLElement>('[data-home-count], [data-home-fill]')) {
      const target = Number(element.dataset.homeValue);
      if (!Number.isFinite(target)) continue;
      const prior = previous.current.get(element);
      previous.current.set(element, target);
      if (!observer || prior === target || target === 0) {
        if (element.dataset.homeCount !== undefined) write(element, target);
        continue;
      }
      const from = Math.min(target, prior ?? 0);
      waiting.set(element, { target, from });
      if (element.dataset.homeCount !== undefined) write(element, from);
      observer.observe(element);
    }
    const visibilityChanged = () => {
      root.dataset.homeMotionPaused = String(document.hidden);
      if (document.hidden) finish();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      observer?.disconnect(); artObserver?.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      if (art) art.dataset.homeArtVisible = 'false';
      finish();
    };
  }, [enabled, valuesKey]);
  return rootRef;
}

function HomeCount({ value, digits = 1 }: { value: number; digits?: number }) {
  return <span aria-label={String(value)}><span aria-hidden="true" data-home-count="" data-home-value={value} data-home-digits={digits}>{String(value).padStart(digits, '0')}</span></span>;
}

function EmptyState({ icon, title, description, action, onAction }: { icon: ReactNode; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="dh-empty"><span className="dh-empty-icon">{icon}</span><strong>{title}</strong><p>{description}</p>
    {action && onAction && <button type="button" className="dh-text-action" onClick={onAction}>{action}<ArrowRight size={14} /></button>}
  </div>;
}
function PanelHeader({ number, title, subtitle, action, onAction }: { number: string; title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <div className="dh-panel-heading"><div><span className="dh-eyebrow">{number} / {subtitle ?? 'WORKSPACE'}</span><h2>{title}</h2></div>
    {action && onAction && <button type="button" className="dh-text-action" onClick={onAction}>{action}<ArrowUpRight size={15} /></button>}
  </div>;
}

function BannerCarousel({ banners, config }: { banners: DashboardBanner[]; config: BannerConfig }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(config.autoplay);
  const [paused, setPaused] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = banners[Math.min(active, banners.length - 1)];
  useEffect(() => { setPlaying(config.autoplay); }, [config.autoplay]);
  useEffect(() => { setActive(previous => Math.min(previous, Math.max(0, banners.length - 1))); }, [banners.length]);
  useEffect(() => {
    if (!playing || paused || lightbox || banners.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') setActive(previous => (previous + 1) % banners.length);
    }, Math.max(2000, Number(config.interval) || 5000));
    return () => window.clearInterval(interval);
  }, [playing, paused, lightbox, banners.length, config.interval]);
  useEffect(() => {
    if (!lightbox) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(false);
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previouslyFocused?.focus({ preventScroll: true }); };
  }, [lightbox]);
  if (!current) return null;
  return <section className="dh-banner" aria-label="Destacados del estudio" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <img key={current.id} src={current.url} alt={current.titulo} className="dh-banner-image" />
    <div className="dh-banner-copy"><span className="dh-eyebrow">EN EL ESTUDIO / DESTACADO</span><h2>{current.titulo}</h2>{current.descripcion && <p>{current.descripcion}</p>}</div>
    <div className="dh-banner-tools">
      {banners.length > 1 && <button type="button" aria-label={playing ? 'Pausar destacados' : 'Reproducir destacados'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>}
      <button type="button" aria-label="Ampliar imagen destacada" onClick={() => setLightbox(true)}><Maximize2 size={15} /></button>
    </div>
    {banners.length > 1 && <div className="dh-banner-pages" aria-label="Seleccionar destacado">{banners.map((banner, index) => <button key={banner.id} type="button"
      className={index === active ? 'is-active' : ''} aria-label={`Ver destacado ${index + 1}: ${banner.titulo}`} aria-current={index === active ? 'true' : undefined} onClick={() => setActive(index)}><span /></button>)}</div>}
    {lightbox && createPortal(<div className="dh-root dh-lightbox" role="dialog" aria-modal="true" aria-label={current.titulo} onClick={() => setLightbox(false)}>
      <button ref={closeRef} type="button" className="dh-lightbox-close" aria-label="Cerrar imagen" onClick={() => setLightbox(false)}><X size={20} /></button>
      <img src={current.url} alt={current.titulo} onClick={event => event.stopPropagation()} />
    </div>, document.body)}
  </section>;
}

function TaskOverview({ tasks, teamScope, state, onNavigate }: { tasks: Task[]; teamScope: boolean; state: LoadState; onNavigate: (path: string) => void }) {
  const [filter, setFilter] = useState('all');
  const route = teamScope ? '/dashboard/tareas?vista=equipo' : '/dashboard/tareas';
  const needsFocus = (task: Task) => task.status !== 'completed' && (task.priority === 'high' || ['vencida', 'hoy'].includes(plazo(aTarea(task as unknown as Record<string, unknown>)).tipo));
  const attention = tasks.filter(needsFocus).length;
  const filtered = tasks.filter(task => filter === 'all' || (filter === 'focus' ? needsFocus(task) : task.status === filter))
    .sort((a, b) => filter === 'focus' ? (asDate(a.date)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (asDate(b.date)?.getTime() ?? Number.MAX_SAFE_INTEGER) : 0);
  return <section className="dh-panel dh-task-panel">
    <PanelHeader number="01" title={teamScope ? 'El trabajo en marcha.' : 'Tu siguiente paso.'} subtitle={teamScope ? 'TAREAS DEL EQUIPO' : 'MIS TAREAS'} action="Abrir tareas" onAction={() => onNavigate(route)} />
    {state === 'ready' && <button type="button" className="dh-focus-strip" aria-pressed={filter === 'focus'} onClick={() => setFilter(filter === 'focus' ? 'all' : 'focus')}>
      <span className="dh-focus-number">{attention}</span><span><strong>{attention ? 'Necesitan atención' : 'Compromisos bajo control'}</strong><small>Vencidas, para hoy o de prioridad alta</small></span><ArrowRight size={16} />
    </button>}
    <div className="dh-task-toolbar"><div className="dh-segment" aria-label="Filtrar tareas">{[{ id: 'all', title: 'Todas' }, { id: 'pending', title: 'Pendientes' }, { id: 'in-progress', title: 'En curso' }, { id: 'completed', title: 'Completadas' }].map(item =>
      <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)}>{item.title}</button>)}</div><span>{filtered.length} {filtered.length === 1 ? 'tarea' : 'tareas'}</span></div>
    {state === 'loading' ? <div className="dh-list-skeleton" aria-label="Cargando tareas">{[0, 1, 2].map(item => <span key={item} />)}</div>
      : state === 'error' ? <EmptyState icon={<Clock3 size={22} />} title="Las tareas no están disponibles" description="Abre el módulo de tareas para volver a consultarlas." action="Ir a tareas" onAction={() => onNavigate(route)} />
      : !filtered.length ? <EmptyState icon={<CheckCheck size={24} />} title={filter === 'completed' ? 'Aquí verás tus avances' : filter === 'all' ? 'Un espacio para empezar' : 'Todo bajo control'}
        description={filter === 'focus' ? 'No hay tareas vencidas, para hoy o de prioridad alta. Puedes seguir con el resto de tu jornada.' : filter === 'completed' ? 'Las tareas completadas aparecerán en esta vista.' : filter === 'all' ? 'Organiza el trabajo y consulta las tareas desde su módulo.' : filter === 'in-progress' ? 'No hay tareas en curso en esta vista. Puedes revisar todo el trabajo.' : 'No hay tareas pendientes en esta vista. Puedes revisar todo el trabajo.'} action="Ver tablero de tareas" onAction={() => onNavigate(route)} />
      : <div className="dh-task-list">{filtered.slice(0, 6).map(task => {
        const deadline = plazo(aTarea(task as unknown as Record<string, unknown>));
        return <button key={task.id} type="button" className="dh-task-item" onClick={() => onNavigate(route)}>
          <span className={`dh-task-symbol ${task.status === 'completed' ? 'is-done' : ''}`}>{task.status === 'completed' ? <Check size={15} /> : task.status === 'in-progress' ? <Activity size={16} /> : <Circle size={15} />}</span>
          <span className="dh-task-copy"><strong>{task.title}</strong><span><CalendarDays size={11} />{dateShort(task.date)}{(deadline.tipo === 'vencida' || deadline.tipo === 'hoy') && task.status !== 'completed' && <em className={deadline.tipo === 'vencida' ? 'is-overdue' : ''}>{deadline.texto}</em>}</span></span>
          {task.priority === 'high' && <span className="dh-priority" title="Prioridad alta">Alta</span>}
          <span className="dh-task-status">{task.status === 'completed' ? 'Completada' : task.status === 'in-progress' ? 'En curso' : 'Pendiente'}</span><ArrowUpRight size={16} className="dh-row-arrow" />
        </button>;
      })}</div>}
    {filtered.length > 6 && <button type="button" className="dh-panel-footer" onClick={() => onNavigate(route)}>Ver {filtered.length - 6} tareas más<ArrowRight size={15} /></button>}
  </section>;
}

function ProjectOverview({ projects, state, onNavigate }: { projects: DashboardProject[]; state: LoadState; onNavigate: (path: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <section className="dh-panel dh-project-panel"><PanelHeader number="02" title="Ideas en movimiento." subtitle="PROYECTOS" action="Ver proyectos" onAction={() => onNavigate('/dashboard/proyectos')} />
    {state === 'loading' ? <div className="dh-list-skeleton" aria-label="Cargando proyectos">{[0, 1, 2].map(item => <span key={item} />)}</div>
      : state === 'error' ? <EmptyState icon={<FolderKanban size={23} />} title="No pudimos consultar los proyectos" description="Revisa tu acceso o consulta el módulo de proyectos." action="Abrir proyectos" onAction={() => onNavigate('/dashboard/proyectos')} />
      : !projects.length ? <EmptyState icon={<FolderKanban size={23} />} title="El próximo proyecto empieza aquí" description="Consulta las iniciativas y sus avances en el espacio de proyectos." action="Explorar proyectos" onAction={() => onNavigate('/dashboard/proyectos')} />
      : <div className="dh-project-list">{projects.slice(0, 4).map((project, index) => <div className="dh-project-item" key={project.id}>
        <button type="button" className="dh-project-toggle" aria-expanded={expanded === project.id} onClick={() => setExpanded(expanded === project.id ? null : project.id)}>
          <span className="dh-project-index">{String(index + 1).padStart(2, '0')}</span><span className="dh-project-name"><strong>{project.nombre}</strong><span>{project.estado}</span></span>
          <span className="dh-project-percent"><HomeCount value={percentage(project.progreso)} /><small>%</small></span><ChevronDown size={15} className={expanded === project.id ? 'is-expanded' : ''} />
        </button>
        <div className="dh-progress-track" role="progressbar" aria-label={`Progreso de ${project.nombre}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage(project.progreso)}><span data-home-fill="" data-home-value={percentage(project.progreso)} style={{ width: `${percentage(project.progreso)}%` }} /></div>
        {expanded === project.id && <div className="dh-project-detail">{project.descripcion ? <p>{project.descripcion}</p> : <p>Consulta el proyecto para ver sus detalles.</p>}{project.actualizadoEn != null && <span>Actualizado {relative(project.actualizadoEn)}</span>}<button type="button" className="dh-text-action" onClick={() => onNavigate('/dashboard/proyectos')}>Abrir proyectos<ArrowUpRight size={13} /></button></div>}
      </div>)}</div>}
  </section>;
}

/** The authenticated container supplies all data; this view performs no requests or writes. */
export function DashboardHomeView({ displayName, teamScope = false, tasks, announcements, projects, activity, activityLive = false, botState, banners, bannerConfig = defaultBannerConfig, health, healthChecked,
  taskState = 'ready', announcementState = 'ready', projectState = 'ready', healthState = 'ready', electoralContent, onNavigate }: DashboardHomeViewProps) {
  const { settings } = useSettings();
  const reducedMotion = useReducedMotion();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = displayName?.trim().split(/\s+/)[0];
  const completed = tasks.filter(task => task.status === 'completed').length;
  const pending = tasks.filter(task => task.status === 'pending').length;
  const inProgress = tasks.filter(task => task.status === 'in-progress').length;
  const completion = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const motionEnabled = settings.animations !== false && !settings.reduceMotion && !settings.screenReader && !reducedMotion;
  const rootRef = useHomeDataMotion(motionEnabled, `${taskState}:${pending}:${inProgress}:${completed}:${completion}|${projectState}:${projects.slice(0, 4).map(project => `${project.id}:${percentage(project.progreso)}`).join('|')}`);
  const stats = [
    { label: 'Tareas pendientes', value: pending, note: 'El siguiente paso', icon: <Clock3 size={17} /> },
    { label: 'En curso', value: inProgress, note: 'Trabajo en movimiento', icon: <Activity size={17} /> },
    { label: 'Completadas', value: completed, note: `De ${tasks.length} tareas ${teamScope ? 'del equipo' : 'en tu espacio'}`, icon: <CheckCheck size={17} /> },
  ];
  return <div ref={rootRef} className="dh-root" data-home-motion={motionEnabled ? 'full' : 'off'}><div className="dh-content">
    <section className="dh-hero">
      <div className="dh-hero-copy"><span className="dh-eyebrow"><span className="dh-small-star">✦</span> TU ESTUDIO. EN UN SOLO LUGAR.</span>
        <p className="dh-greeting">{greeting}{firstName ? `, ${firstName}` : ''}.</p><h1>Hagamos que<br /><span>las ideas sucedan.</span></h1>
        <p className="dh-hero-description">Tu equipo, tus proyectos y lo que viene.<br className="dh-desktop-break" /> Todo listo para dar el siguiente paso.</p>
        <div className="dh-hero-actions"><button type="button" className="dh-button dh-button-primary" onClick={() => onNavigate('/dashboard/tareas')}><Plus size={16} />Ir a mis tareas<ArrowUpRight size={16} /></button>
          <button type="button" className="dh-button dh-button-secondary" onClick={() => onNavigate('/dashboard/calendar')}><CalendarDays size={15} />Ver calendario</button></div>
      </div>
      <div className="dh-hero-art" aria-hidden="true"><div className="dh-orbit dh-orbit-one" /><div className="dh-orbit dh-orbit-two" /><div className="dh-orbit-axis" /><span className="dh-orbit-star">✦</span><BrandLogo compact className="dh-hero-symbol" /><span className="dh-art-note">MOON STUDIOS<br />CREATIVE WORKSPACE</span><ArrowDownLeft className="dh-art-arrow" size={28} strokeWidth={1} /></div>
      <div className="dh-hero-foot"><span>{format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}</span><span className="dh-hero-foot-status"><i />Espacio de trabajo</span><span>CREAR. CONECTAR. CRECER.</span></div>
    </section>
    {electoralContent && <div className="dh-electoral-public">{electoralContent}</div>}
    <section className="dh-stat-grid" aria-label="Resumen de tareas y servicios">{stats.map((stat, index) => <button type="button" key={stat.label} className="dh-stat" onClick={() => onNavigate(teamScope ? '/dashboard/tareas?vista=equipo' : '/dashboard/tareas')}>
      <span className="dh-stat-top">{stat.label}<span>{stat.icon}</span></span><strong>{taskState === 'ready' ? <HomeCount value={stat.value} digits={2} /> : '—'}<ArrowUpRight size={18} /></strong><span className="dh-stat-note">{taskState === 'loading' ? 'Consultando tareas…' : taskState === 'error' ? 'Datos no disponibles' : stat.note}</span><span className="dh-stat-number">0{index + 1}</span>
    </button>)}<button type="button" className="dh-stat dh-bot-stat" onClick={() => onNavigate('/dashboard/discord')}><span className="dh-stat-top">Luna NET<Bot size={17} /></span><strong className="dh-bot-label">{botState === 'online' ? 'En línea' : botState === 'offline' ? 'Sin conexión' : 'Sin verificar'}<span className={`dh-state-dot ${botState}`} /></strong><span className="dh-stat-note">Abrir centro de Discord<ArrowUpRight size={13} /></span></button></section>
    {banners.length > 0 && <BannerCarousel banners={banners} config={bannerConfig} />}
    <div className="dh-work-grid"><TaskOverview tasks={tasks} teamScope={teamScope} state={taskState} onNavigate={onNavigate} /><ProjectOverview projects={projects} state={projectState} onNavigate={onNavigate} /></div>
    <section className="dh-momentum"><div><span className="dh-eyebrow">CADA PASO CUENTA</span><h2>Así avanza {teamScope ? 'el equipo' : 'tu trabajo'}.</h2></div><div className="dh-momentum-progress"><div><span>{taskState === 'ready' ? `${completed} de ${tasks.length} tareas completadas` : 'Consultando el avance'}</span><strong>{taskState === 'ready' ? <><HomeCount value={completion} />%</> : '—'}</strong></div><div className="dh-progress-track" role="progressbar" aria-label="Avance de tareas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}><span data-home-fill="" data-home-value={completion} style={{ width: `${completion}%` }} /></div></div><ArrowUpRight size={32} strokeWidth={1} /></section>
    <div className="dh-bottom-grid"><section className="dh-panel dh-announcement-panel"><PanelHeader number="03" title="Lo nuevo del estudio." subtitle="ANUNCIOS" action="Ver todos" onAction={() => onNavigate('/dashboard/announcements')} />
      {announcementState === 'loading' ? <div className="dh-list-skeleton"><span /><span /></div> : announcementState === 'error' ? <EmptyState icon={<Bell size={22} />} title="No pudimos cargar los anuncios" description="Puedes volver a consultarlos desde su módulo." action="Abrir anuncios" onAction={() => onNavigate('/dashboard/announcements')} />
        : !announcements.length ? <EmptyState icon={<Megaphone size={23} />} title="En sintonía con el estudio" description="Las noticias y comunicaciones del equipo aparecerán aquí." />
        : <div className="dh-announcements">{announcements.slice(0, 3).map(announcement => <button type="button" className="dh-announcement" key={announcement.id} onClick={() => onNavigate('/dashboard/announcements')}><span className="dh-announcement-meta"><span>{announcement.important ? 'IMPORTANTE' : 'DEL ESTUDIO'}</span><time>{dateShort(announcement.createdAt)}</time></span><h3>{announcement.title}<ArrowUpRight size={16} /></h3><p>{announcement.content}</p></button>)}</div>}
    </section><section className="dh-panel dh-activity-panel"><PanelHeader number="04" title={activityLive ? 'Últimos movimientos.' : 'En tu espacio.'} subtitle={activityLive ? 'ACTIVIDAD' : 'TAREAS Y ANUNCIOS'} />
      {!activity.length ? <EmptyState icon={<Activity size={23} />} title="Aquí empieza la historia" description="La actividad del espacio aparecerá cuando el equipo empiece a trabajar." />
        : <ol className="dh-activity-list">{activity.slice(0, 5).map(item => <li key={item.id}><span className="dh-activity-dot" /><div><p>{item.message}</p><span>{item.timestamp != null ? relative(item.timestamp) : 'En tu tablero'}{item.meta && <><i>·</i>{item.meta}</>}</span></div></li>)}</ol>}
    </section></div>
    <section className="dh-services"><div className="dh-services-title"><ShieldCheck size={19} /><div><h2>Estado de los servicios</h2><span>{healthChecked ? `Última consulta ${format(healthChecked, 'HH:mm')}` : 'Consultando los servicios'}</span></div></div>
      <div className="dh-service-items">{healthState === 'loading' ? <span className="dh-service-checking">Comprobando disponibilidad…</span> : health.map(metric => <div key={metric.label} className="dh-service-item" title={metric.detail}><span className={`dh-state-dot ${metric.ok === true ? 'online' : metric.ok === false ? 'offline' : 'unknown'}`} /><div><span>{metric.label}</span><strong>{metric.value}</strong></div></div>)}</div>
    </section>
    <div className="dh-close-note"><BrandLogo className="dh-footer-logo" /><span>Un espacio para lo que estás creando.</span><button type="button" className="dh-text-action" onClick={() => onNavigate('/dashboard/mensajeria')}>Conecta con el equipo<MessageSquare size={14} /></button></div>
  </div></div>;
}

function useProjects() {
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  useEffect(() => onSnapshot(collection(db, 'dev_projects'), snapshot => {
    const mapped = snapshot.docs.map(item => {
      const data = item.data();
      return { id: item.id, nombre: data.name ?? data.nombre ?? 'Sin nombre', descripcion: data.description ?? data.descripcion,
        progreso: percentage(Number(data.progress ?? data.progreso ?? 0)), estado: statusLabel(data.status, data.estado), color: data.color,
        actualizadoEn: data.updatedAt ?? data.actualizadoEn, creadoEn: data.createdAt ?? data.creadoEn } satisfies DashboardProject;
    });
    mapped.sort((a, b) => {
      const aCreated = asDate(a.creadoEn);
      const bCreated = asDate(b.creadoEn);
      return aCreated && bCreated ? bCreated.getTime() - aCreated.getTime() : a.nombre.localeCompare(b.nombre);
    });
    setProjects(mapped); setState('ready');
  }, () => setState('error')), []);
  return { projects, projectState: state };
}
function useActivity() {
  const [activity, setActivity] = useState<DashboardActivity[]>([]);
  const [activityLive, setActivityLive] = useState(false);
  useEffect(() => onSnapshot(query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(10)), snapshot => {
    setActivity(snapshot.docs.map(item => { const data = item.data(); return { id: item.id, message: data.description ?? data.mensaje ?? data.message ?? 'Actividad registrada', timestamp: data.createdAt ?? data.timestamp, meta: data.userName ?? data.module }; }));
    setActivityLive(!snapshot.empty);
  }, () => setActivityLive(false)), []);
  return { activity, activityLive };
}
function useHealth(botState: BotState) {
  const [health, setHealth] = useState<DashboardHealth[]>([]);
  const [healthState, setHealthState] = useState<LoadState>('loading');
  const [healthChecked, setHealthChecked] = useState<Date>();
  useEffect(() => {
    let disposed = false;
    let latestCheck = 0;
    const fetchHealth = async () => {
      const check = ++latestCheck;
      const started = performance.now();
      let stored: DashboardHealth[] | null = null;
      let dbState: boolean | null = null;
      let databaseChecked = false;
      let api: { ok: boolean | null; ms: number | null; ping: number | null } = { ok: null, ms: null, ping: null };
      const publish = () => {
        if (disposed || check !== latestCheck || !databaseChecked) return;
        setHealth(stored?.length ? stored : [
          { label: 'API Luna NET', value: api.ok === null ? 'Consultando…' : api.ok ? `${api.ms} ms` : 'Sin respuesta', ok: api.ok },
          { label: 'Base de datos', value: dbState === true ? 'Conectada' : dbState === false ? 'Sin conexión' : 'Sin verificar', ok: dbState },
          { label: 'Discord', value: botState === 'online' ? api.ping != null ? `Activo · ${api.ping} ms` : 'Activo' : botState === 'offline' ? 'Sin conexión' : 'Sin verificar', ok: botState === 'unknown' ? null : botState === 'online' },
        ]);
        setHealthState('ready'); setHealthChecked(new Date());
      };
      // The external API must not block Firestore metrics or the database state.
      void getPublicStatus().then(status => {
        api = { ok: true, ms: Math.round(performance.now() - started), ping: status?.bot?.ping ?? null };
        publish();
      }).catch(() => { api = { ok: false, ms: null, ping: null }; publish(); });
      try {
        const metricsDoc = await getDoc(doc(db, 'system_health', 'metrics'));
        if (metricsDoc.exists()) {
          const data = metricsDoc.data();
          stored = Array.isArray(data.metrics) ? data.metrics : Object.entries(data).map(([label, value]) => {
            const metric = value as { value?: unknown; ok?: boolean; detail?: string } | null;
            return { label, value: String(metric?.value ?? value), ok: metric?.ok ?? null, detail: metric?.detail };
          });
        } else {
          const snapshot = await getDocs(collection(db, 'system_health'));
          if (!snapshot.empty) stored = snapshot.docs.map(item => { const data = item.data(); return { label: data.label ?? item.id, value: String(data.value ?? '—'), ok: typeof data.ok === 'boolean' ? data.ok : null, detail: data.detail }; });
        }
        dbState = true;
      } catch (error) { dbState = (error as { code?: string })?.code === 'unavailable' ? false : null; }
      databaseChecked = true;
      publish();
    };
    void fetchHealth();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void fetchHealth(); }, 30_000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [botState]);
  return { health, healthState, healthChecked };
}

export default function DashboardHome() {
  const { userProfile } = useAuth();
  const electoral = useElectoralPublicState({ db, includeAnnouncements: true, canManage: false });
  const navigate = useNavigate();
  const teamScope = esGestorTareas(userProfile?.role);
  const [allTasks, setTasks] = useState<Task[]>([]);
  const [taskState, setTaskState] = useState<LoadState>('loading');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementState, setAnnouncementState] = useState<LoadState>('loading');
  const [botState, setBotState] = useState<BotState>('unknown');
  const [banners, setBanners] = useState<DashboardBanner[]>([]);
  const [bannerConfig, setBannerConfig] = useState<BannerConfig>(defaultBannerConfig);
  const projectData = useProjects();
  const activityData = useActivity();
  const healthData = useHealth(botState);
  const tasks = teamScope ? allTasks : allTasks.filter(task => esParaMi(aTarea(task as unknown as Record<string, unknown>), userProfile));
  useEffect(() => {
    let disposed = false;
    getAnnouncements().then(data => { if (!disposed) { setAnnouncements(data as Announcement[]); setAnnouncementState('ready'); } }).catch(() => { if (!disposed) setAnnouncementState('error'); });
    getBotStatus().then(status => { if (!disposed) setBotState(status?.status === 'online' ? 'online' : 'offline'); }).catch(() => { if (!disposed) setBotState('unknown'); });
    const unsubscribeTasks = subscribeToTasks(data => { setTasks(data as Task[]); setTaskState('ready'); }, () => setTaskState('error'));
    const unsubscribeBanners = onSnapshot(collection(db, 'dashboard_banners'), snapshot => {
      const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as DashboardBanner));
      items.sort((a, b) => (typeof a.orden === 'number' ? a.orden : Number.MAX_SAFE_INTEGER) - (typeof b.orden === 'number' ? b.orden : Number.MAX_SAFE_INTEGER) || (asDate(b.creadoEn)?.getTime() ?? 0) - (asDate(a.creadoEn)?.getTime() ?? 0));
      setBanners(items);
    }, () => setBanners([]));
    const unsubscribeConfig = onSnapshot(doc(db, 'dashboard_config', 'banner_settings'), snapshot => { if (snapshot.exists()) setBannerConfig(current => ({ ...current, ...snapshot.data() })); }, () => {});
    return () => { disposed = true; unsubscribeTasks(); unsubscribeBanners(); unsubscribeConfig(); };
  }, []);
  const fallbackActivity: DashboardActivity[] = [
    ...tasks.slice(0, 3).map(task => ({ id: `task-${task.id}`, message: task.title, meta: task.status === 'completed' ? 'Completada' : task.status === 'in-progress' ? 'En curso' : 'Pendiente' })),
    ...announcements.slice(0, 2).map(announcement => ({ id: `announcement-${announcement.id}`, message: announcement.title, timestamp: announcement.createdAt, meta: 'Anuncio' })),
  ];
  return <DashboardHomeView displayName={userProfile?.displayName} teamScope={teamScope} tasks={tasks} taskState={taskState} announcements={announcements} announcementState={announcementState}
    electoralContent={<>{electoral.settingsError ? <ElectoralUnavailable compact onRetry={electoral.refresh}/> : !electoral.settingsLoading && !electoral.settings.enabled ? <ElectoralClosure compact settings={electoral.settings}/> : null}<ElectoralAnnouncementBoard announcements={electoral.announcements} loading={electoral.announcementsLoading} error={electoral.announcementsError} title="Tu voz. Lo que viene." limit={4} portalHref="/dashboard/elecciones"/></>}
    botState={botState} banners={banners} bannerConfig={bannerConfig} {...projectData} {...healthData} activity={activityData.activityLive ? activityData.activity : fallbackActivity} activityLive={activityData.activityLive} onNavigate={navigate} />;
}
