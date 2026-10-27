import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarClock, CircleAlert, LockKeyhole, LogOut, Megaphone, Pin, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { isAnnouncementVisible } from './model';
import type { ElectoralAnnouncement, ElectoralSettings } from './types';
import './electoral-public.css';

/** One timeout follows publication/expiry boundaries; visibility changes refresh a sleeping tab. */
export function useElectoralAnnouncementClock(announcements: ElectoralAnnouncement[]): Date {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const schedule = () => {
      clearTimeout(timer);
      const current = Date.now();
      const boundaries = announcements.flatMap(item => [item.startsAt.getTime(), item.endsAt.getTime()]).filter(value => Number.isFinite(value) && value > current);
      const wait = boundaries.length ? Math.min(60000, Math.max(25, Math.min(...boundaries) - current + 25)) : 60000;
      timer = setTimeout(() => { if (alive) { setNow(Date.now()); schedule(); } }, wait);
    };
    const visible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); schedule(); } };
    schedule();
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [announcements]);
  return new Date(now);
}

interface ClosureProps { settings: ElectoralSettings; adminHref?: string; onLogout?: () => void; compact?: boolean }
export function ElectoralUnavailable({ onRetry, adminHref, onLogout, compact = false }: { onRetry: () => void; adminHref?: string; onLogout?: () => void; compact?: boolean }) {
  const titleId = useId();
  return <section className={`el-public el-public-unavailable${compact ? ' is-compact' : ''}`} aria-labelledby={titleId}>
    <CircleAlert size={28} strokeWidth={1.4}/><span className="el-public-kicker">ESPACIO ELECTORAL</span><h2 id={titleId}>Estamos verificando la disponibilidad.</h2><p>No pudimos confirmar el estado del sistema electoral. Para proteger el proceso, las acciones de participación permanecen bloqueadas hasta recuperar la conexión.</p><div className="el-public-closure-actions"><button type="button" className="el-public-button" onClick={onRetry}><RefreshCw size={16}/>Volver a consultar</button>{adminHref && <Link className="el-public-button" to={adminHref}><ShieldCheck size={16}/>Acceso de dirección</Link>}{onLogout && <button type="button" className="el-public-button" onClick={onLogout}><LogOut size={16}/>Cambiar de cuenta</button>}</div>
  </section>;
}
export function ElectoralClosure({ settings, adminHref, onLogout, compact = false }: ClosureProps) {
  const titleId = useId();
  return <section className={`el-public el-public-closure${compact ? ' is-compact' : ''}`} aria-labelledby={titleId}>
    <div className="el-public-closure-top"><img src="/brand/moon-wordmark.svg" alt="Moon Studios" /><span><LockKeyhole size={14} /> ELECCIONES</span></div>
    <div className="el-public-closure-main">
      <div className="el-public-closure-copy"><span className="el-public-kicker"><span />EL SIGUIENTE ENCUENTRO</span><h1 id={titleId}>{settings.closureTitle}</h1><p>{settings.closureMessage}</p><div className="el-public-return"><CalendarClock size={20} /><div><span>VOLVEREMOS EN</span><strong>{settings.returnYear}</strong></div><Sparkles size={22} strokeWidth={1.2} /></div><div className="el-public-closure-actions">{adminHref && <Link className="el-public-button" to={adminHref}><ShieldCheck size={16} />Acceso de dirección<ArrowUpRight size={16} /></Link>}{onLogout && <button type="button" className="el-public-button" onClick={onLogout}><LogOut size={16} />Cambiar de cuenta</button>}</div></div>
      <div className="el-public-lunar" aria-hidden="true"><div className="el-public-orbit first"/><div className="el-public-orbit second"/><div className="el-public-moon"/><span>{settings.returnYear}</span><small>CADA VOZ CUENTA.</small></div>
    </div>
    <footer><span>MOON STUDIOS · PARTICIPACIÓN ELECTORAL</span><span>Gracias por ser parte de esta etapa.<ArrowUpRight size={14}/></span></footer>
  </section>;
}

interface AnnouncementBoardProps { announcements: ElectoralAnnouncement[]; loading?: boolean; error?: string | null; title?: string; limit?: number; electionId?: string; showEmpty?: boolean; portalHref?: string }
const dateLabel = (value: Date) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(value);
export function ElectoralAnnouncementBoard({ announcements, loading = false, error = null, title = 'Lo que debes saber.', limit = 6, electionId, showEmpty = false, portalHref }: AnnouncementBoardProps) {
  const now = useElectoralAnnouncementClock(announcements), titleId = useId();
  const visible = announcements.filter(item => isAnnouncementVisible(item, now) && (electionId === undefined || !item.electionId || item.electionId === electionId))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.startsAt.getTime() - left.startsAt.getTime()).slice(0, Math.max(1, limit));
  if (!loading && !error && !visible.length && !showEmpty) return null;
  return <section className="el-public el-public-announcements" aria-labelledby={titleId} data-moon-reveal>
    <header><div><span className="el-public-kicker"><Megaphone size={15} />COMUNICADOS ELECTORALES</span><h2 id={titleId}>{title}</h2></div>{portalHref && <Link className="el-public-text-link" to={portalHref}>Abrir elecciones<ArrowUpRight size={16}/></Link>}</header>
    {loading ? <div className="el-public-loading" role="status"><RefreshCw size={18} className="el-public-spin"/>Consultando las comunicaciones de dirección…</div>
      : error ? <div className="el-public-loading" role="status"><CircleAlert size={19}/><p>No pudimos confirmar los comunicados. Vuelve a consultar el espacio electoral cuando tengas conexión.</p></div>
        : !visible.length ? <div className="el-public-loading"><Megaphone size={20}/><p>Los comunicados publicados por el CEO aparecerán aquí durante su periodo de vigencia.</p></div>
          : <div className="el-public-announcement-grid">{visible.map(item => <article key={item.id} className={item.pinned ? 'is-pinned' : ''}><div className="el-public-announcement-meta"><span>{item.pinned ? <><Pin size={12}/>DESTACADO</> : item.electionId ? 'DE UN PROCESO' : 'COMUNICADO GENERAL'}</span><time dateTime={item.startsAt.toISOString()}>{dateLabel(item.startsAt)}</time></div><h3>{item.title}</h3><p>{item.body}</p><footer><CalendarClock size={14}/><span>Vigente hasta el {dateLabel(item.endsAt)} · Perú</span></footer></article>)}</div>}
  </section>;
}
