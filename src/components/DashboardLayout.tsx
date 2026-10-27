/** Moon Studios workspace shell. Business rules remain in the authenticated layout. */

import { unlockAudio } from '@/lib/notificationSound';
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useOutlet, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { BrandLogo } from '@/components/BrandLogo';
import { ProteccionErrores } from '@/components/ProteccionErrores';
import { WorkspaceMotion } from '@/components/WorkspaceMotion';
import { WorkspaceMotionControl } from '@/components/WorkspaceMotionControl';
import { AnimatePresence } from 'framer-motion';
import { logoutUser } from '@/lib/firebase';
import { activarPushWeb } from '@/lib/pushWeb';
import { useNotifications } from '@/hooks/useNotifications';
import { useTabSync } from '@/hooks/useTabSync';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import { useIsMobile } from '@/hooks/use-mobile';
import { TabSyncModal, AutoLogoutModal, SESSION_MODAL_STYLES } from '@/components/SessionModals';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './dashboard-shell.css';
import {
  LayoutDashboard, Calendar, Megaphone, Bot, Bell,
  Settings, LogOut, Crown, ChevronLeft, ChevronRight,
  AlertCircle, X, Mail, MessagesSquare, GitBranch, MessageSquare,
  Calculator, Globe, Menu, Code2, Palette, FileText, UserCog, Users, ShieldCheck,
  CheckCheck, Inbox, Trash2, BellOff, FolderKanban, ListTodo, Search, Sun, Moon, Vote, ClipboardList, SlidersHorizontal, Presentation
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { NotifCategory } from '@/hooks/useNotifications';
import { atajoDe, esMac } from '@/lib/ajustes/atajos';
import { fechaLarga, hora } from '@/lib/ajustes/fecha';

// ── Categorías ────────────────────────────────────────────────────────────────
const CATEGORY_ICON: Record<NotifCategory, React.FC<any>> = {
  announcement: Megaphone, email: Mail, thread: GitBranch, message: MessageSquare, task: ListTodo, security: ShieldCheck,
};
const CATEGORY_LABEL: Record<NotifCategory, string> = {
  announcement: 'Anuncio', email: 'Correo', thread: 'Hilo', message: 'Mensaje', task: 'Tarea', security: 'Seguridad',
};
const CATEGORY_COLOR: Record<NotifCategory, string> = {
  announcement: '#a78bfa', email: '#60a5fa', thread: '#34d399', message: '#fb923c', task: '#fbbf24', security: '#f87171',
};

// El reloj se actualiza de forma aislada para no volver a renderizar los paneles.
const Clock = memo(() => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="moon-shell-clock"><span>{fechaLarga(time, { day: 'numeric', month: 'short', year: 'numeric' })}</span><time dateTime={time.toISOString()}>{hora(time, true)}</time></div>;
});
Clock.displayName = 'Clock';


function useDialogFocus(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const workspace = document.querySelector<HTMLElement>('.moon-shell');
    const wasInert = workspace?.inert ?? false;
    if (workspace) workspace.inert = true;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? []);
    (focusable()[0] ?? ref.current)?.focus({ preventScroll: true });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0]; const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); ref.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.removeEventListener('keydown', trapFocus); if (workspace) workspace.inert = wasInert; previous?.focus({ preventScroll: true }); };
  }, [ref]);
}

// ── LogoutModal ───────────────────────────────────────────────────────────────
interface LogoutModalProps {
  phase: 'confirming' | 'leaving';
  onCancel: () => void;
  onConfirm: () => void;
  cardClass: string;
  userName: string;
}
const LogoutModal: React.FC<LogoutModalProps> = ({ phase, onCancel, onConfirm, cardClass, userName }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return createPortal(
    <div
      className="__lo_overlay fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.82)', zIndex: 99999 }}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="moon-logout-title" tabIndex={-1}
        className={`${cardClass} moon-shell-logout-card relative w-full max-w-[360px]`}
        style={{
          background: 'var(--logout-bg)',
          border: '1px solid var(--logout-border)',
          borderRadius: '20px',
          boxShadow: '0 40px 80px var(--logout-shadow), 0 0 0 1px var(--logout-icon-bg)',
          overflow: 'hidden',
        }}
      >
        {phase === 'leaving' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'var(--logout-border)' }}>
            <div className="__lo_bar" style={{ height: '100%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)' }} />
          </div>
        )}
        <div style={{ padding: '28px 24px 24px' }}>
          {phase === 'confirming' ? (
            <>
              <div style={{ marginBottom: '18px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--logout-icon-bg)', border: '1px solid var(--logout-icon-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogOut style={{ width: '16px', height: '16px', color: 'var(--content-tertiary)' }} strokeWidth={1.5} />
                </div>
              </div>
              <h2 id="moon-logout-title" style={{ color: 'var(--logout-text-primary)', fontSize: '20px', fontWeight: 500, marginBottom: '8px', letterSpacing: '-.03em' }}>¿Cerrar sesión?</h2>
              <p style={{ color: 'var(--logout-text-muted)', fontSize: '13px', fontWeight: 400, marginBottom: '24px', lineHeight: 1.6 }}>
                Saldrás como <span style={{ color: 'var(--logout-text-name)' }}>{userName}</span>
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onCancel}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--logout-btn-bg)', border: '1px solid var(--logout-btn-border)', color: 'var(--content-secondary)', fontSize: '11px', fontWeight: 300, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.18s ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--overlay-bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-primary)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--logout-btn-bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-secondary)'; }}>
                  Cancelar
                </button>
                <button onClick={onConfirm}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--badge-bg)', border: 'none', color: 'var(--badge-color)', fontSize: '11px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.18s ease, transform 0.12s ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}>
                  Salir
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--logout-icon-bg)', border: '1px solid var(--logout-icon-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogOut style={{ width: '16px', height: '16px', color: 'var(--content-tertiary)' }} strokeWidth={1.5} />
                </div>
              </div>
              <h2 id="moon-logout-title" style={{ color: 'var(--content-primary)', fontSize: '16px', fontWeight: 500, marginBottom: '12px' }}>Cerrando sesión</h2>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} className="__lo_dot" style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--logout-dot)' }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── NotifPanel ────────────────────────────────────────────────────────────────
interface NotifPanelProps {
  notifications: any[];
  unreadCount: number;
  readIds: Set<string>;
  markOneRead: (id: string) => void;
  markAllRead: () => void;
  dismissOne: (id: string) => void;
  dismissAllRead: () => void;
  dismissAll: () => void;
  onClose: () => void;
  onNavigate: (path: string) => void;
  uid?: string;
}

// Grupos por fecha, como en cualquier centro de notificaciones.
function grupoDeFecha(d: Date): string {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const t = d.getTime();
  if (t >= hoy.getTime()) return 'Hoy';
  if (t >= hoy.getTime() - 86_400_000) return 'Ayer';
  if (t >= hoy.getTime() - 6 * 86_400_000) return 'Esta semana';
  return 'Anteriores';
}

const NotifPanel: React.FC<NotifPanelProps> = memo(({
  notifications, readIds,
  markOneRead, markAllRead, dismissOne: eliminarUna, dismissAllRead, dismissAll, onClose, onNavigate,
}) => {
  const [activeCategory, setActiveCategory] = useState<NotifCategory | 'all'>('all');
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);

  const dismissOne = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    eliminarUna(id);
  }, [eliminarUna]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleClose]);

  // Lo eliminado ya viene filtrado desde useNotifications (estado de la cuenta).
  const visible = notifications;
  const visibleUnread = visible.filter((n: any) => !readIds.has(n.id)).length;
  const hasRead = visible.some((n: any) => readIds.has(n.id));

  const filtered = activeCategory === 'all'
    ? visible
    : visible.filter((n: any) => n.category === activeCategory);

  const categories = (Object.keys(CATEGORY_LABEL) as NotifCategory[]);

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="notif-drawer-overlay"
        onClick={handleClose}
        style={{ opacity: closing ? 0 : undefined, transition: closing ? 'opacity 0.2s ease' : undefined }}
      />

      {/* Drawer */}
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Notificaciones" tabIndex={-1} className={`notif-drawer${closing ? ' closing' : ''}`}>

        {/* ── Header ── */}
        <div style={{ padding: '20px 20px 14px', flexShrink: 0, borderBottom: '1px solid var(--notif-footer-border)' }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button aria-label="Cerrar notificaciones"
                onClick={handleClose}
                style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--notif-close-bg)', border: '1px solid var(--notif-close-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--content-tertiary)', cursor: 'pointer', transition: 'all 0.15s ease', flexShrink: 0 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-primary)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--overlay-bg)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-tertiary)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--notif-close-bg)'; }}
              >
                <ChevronRight style={{ width: '13px', height: '13px' }} strokeWidth={1.5} />
              </button>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--content-primary)', fontSize: '13px', fontWeight: 400, letterSpacing: '-0.01em' }}>Notificaciones</span>
                  {visibleUnread > 0 && (
                    <span style={{ fontSize: '9px', fontWeight: 600, background: 'var(--badge-bg)', color: 'var(--badge-color)', padding: '3px 7px', borderRadius: '20px', animation: 'badgePop 0.3s cubic-bezier(0.22,1,0.36,1)', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                      {visibleUnread} nuevas
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '10px', fontWeight: 300, color: 'var(--content-quaternary)', marginTop: '1px' }}>
                  {visible.length === 0 ? 'Todo al día' : `${visible.length} en total`}
                </p>
              </div>
            </div>

            {/* Acciones bulk */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {visibleUnread > 0 && (
                <button onClick={markAllRead}
                  title="Marcar todo como leído"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 9px', borderRadius: '8px', background: 'var(--notif-readall-bg)', border: '1px solid var(--notif-readall-border)', color: 'var(--content-tertiary)', fontSize: '10px', fontWeight: 300, cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-primary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--overlay-border)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-tertiary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--notif-readall-border)'; }}
                >
                  <CheckCheck style={{ width: '11px', height: '11px' }} strokeWidth={1.5} />
                  Marcar todo leído
                </button>
              )}
              {hasRead && (
                <button onClick={dismissAllRead}
                  title="Eliminar las leídas"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 9px', borderRadius: '8px', background: 'var(--notif-readall-bg)', border: '1px solid var(--notif-readall-border)', color: 'var(--content-tertiary)', fontSize: '10px', fontWeight: 300, cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef444430'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-tertiary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--notif-readall-border)'; }}
                >
                  <Trash2 style={{ width: '10px', height: '10px' }} strokeWidth={1.5} />
                  Quitar leídas
                </button>
              )}
              {visible.length > 0 && (
                <button onClick={() => { if (window.confirm('¿Quitar todas las notificaciones? Las nuevas seguirán llegando.')) dismissAll(); }}
                  title="Quitar todas"
                  style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--notif-close-bg)', border: '1px solid var(--notif-close-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--content-quaternary)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef444428'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-quaternary)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--notif-close-bg)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--notif-close-border)'; }}
                >
                  <BellOff style={{ width: '11px', height: '11px' }} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button onClick={() => setActiveCategory('all')}
              style={{ padding: '5px 11px', borderRadius: '8px', fontSize: '10px', fontWeight: 300, cursor: 'pointer', transition: 'all 0.15s ease', background: activeCategory === 'all' ? 'var(--notif-tab-active-bg)' : 'transparent', border: activeCategory === 'all' ? '1px solid var(--notif-tab-active-border)' : '1px solid transparent', color: activeCategory === 'all' ? 'var(--badge-color)' : 'var(--content-tertiary)' }}>
              Todo
            </button>
            {categories.map(cat => {
              const n = visible.filter((x: any) => x.category === cat && !readIds.has(x.id)).length;
              const isActive = activeCategory === cat;
              const color = CATEGORY_COLOR[cat];
              const Icon = CATEGORY_ICON[cat];
              return (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '8px', fontSize: '10px', fontWeight: 300, cursor: 'pointer', transition: 'all 0.15s ease', background: isActive ? `${color}15` : 'transparent', border: isActive ? `1px solid ${color}28` : '1px solid transparent', color: isActive ? color : (n > 0 ? 'var(--content-secondary)' : 'var(--content-quaternary)') }}>
                  <Icon style={{ width: '10px', height: '10px' }} strokeWidth={1.5} />
                  {CATEGORY_LABEL[cat]}
                  {n > 0 && <span style={{ minWidth: '16px', height: '16px', borderRadius: '8px', background: isActive ? color : 'var(--notif-count-bg)', color: isActive ? '#fff' : 'var(--content-secondary)', fontSize: '9px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{n}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Lista ── */}
        <div className="notif-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--notif-empty-bg)', border: '1px solid var(--notif-empty-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Inbox style={{ width: '18px', height: '18px', color: 'var(--content-quaternary)' }} strokeWidth={1.5} />
              </div>
              <div>
                <p style={{ color: 'var(--content-tertiary)', fontSize: '12px', fontWeight: 300, marginBottom: '4px' }}>Sin notificaciones</p>
                <p style={{ color: 'var(--content-quaternary)', fontSize: '10px', fontWeight: 300 }}>
                  {activeCategory === 'all' ? 'Todo está al día' : `No hay notificaciones de ${CATEGORY_LABEL[activeCategory]}`}
                </p>
              </div>
            </div>
          ) : filtered.map((n: any, idx: number) => {
            const isUnread = !readIds.has(n.id);
            const grupo = grupoDeFecha(n.createdAt);
            const nuevoGrupo = idx === 0 || grupoDeFecha(filtered[idx - 1].createdAt) !== grupo;
            const Icon = CATEGORY_ICON[n.category as NotifCategory];
            const color = CATEGORY_COLOR[n.category as NotifCategory];
            return (
              <React.Fragment key={n.id}>
              {nuevoGrupo && (
                <div style={{ padding: '14px 20px 6px', fontSize: '9.5px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--content-quaternary)', position: 'sticky', top: 0, zIndex: 1, background: 'var(--notif-bg)' }}>{grupo}</div>
              )}
              <div className="notif-item-anim" role="button" tabIndex={0} aria-label={`${n.title}${isUnread ? ", sin leer" : ", leída"}`} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); markOneRead(n.id); if (n.linkTo) { onNavigate(n.linkTo); handleClose(); } } }}
                onClick={() => { markOneRead(n.id); if (n.linkTo) { onNavigate(n.linkTo); handleClose(); } }}
                style={{ animationDelay: `${Math.min(idx, 6) * 0.025}s`, padding: '13px 16px 13px 20px', cursor: 'pointer', borderBottom: '1px solid var(--notif-item-border)', background: isUnread ? 'var(--notif-item-unread-bg)' : 'transparent', transition: 'background 0.15s ease', display: 'flex', gap: '12px', alignItems: 'flex-start', position: 'relative' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.background = isUnread ? 'var(--notif-item-hover-unread)' : 'var(--notif-item-hover)';
                  const btn = (e.currentTarget as HTMLDivElement).querySelector('.notif-dismiss-btn') as HTMLElement | null;
                  if (btn) btn.style.opacity = '1';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = isUnread ? 'var(--notif-item-unread-bg)' : 'transparent';
                  const btn = (e.currentTarget as HTMLDivElement).querySelector('.notif-dismiss-btn') as HTMLElement | null;
                  if (btn) btn.style.opacity = '0';
                }}
              >
                {isUnread && <div className="unread-dot" style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', width: '3px', height: '55%', maxHeight: '30px', borderRadius: '3px', background: `linear-gradient(180deg, ${color}, ${color}55)` }} />}
                <div style={{ width: '36px', height: '36px', borderRadius: '11px', flexShrink: 0, background: `${color}10`, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
                  <Icon style={{ width: '14px', height: '14px', color }} strokeWidth={1.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                    <p style={{ fontSize: '12px', fontWeight: isUnread ? 500 : 300, color: isUnread ? 'var(--content-primary)' : 'var(--content-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{n.title}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      {n.important && <AlertCircle style={{ width: '11px', height: '11px', color: '#fb923c' }} strokeWidth={1.5} />}
                      <span style={{ fontSize: '9px', color: 'var(--content-quaternary)', fontWeight: 300, whiteSpace: 'nowrap' }}>{formatDistanceToNow(n.createdAt, { addSuffix: false, locale: es })}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '11px', fontWeight: 300, color: 'var(--content-tertiary)', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: '6px' }}>{n.preview}</p>
                  <span style={{ fontSize: '9px', fontWeight: 400, letterSpacing: '0.05em', color, background: `${color}0d`, padding: '2px 7px', borderRadius: '6px', display: 'inline-block' }}>{CATEGORY_LABEL[n.category as NotifCategory]}</span>
                </div>
                {/* Botón eliminar (aparece en hover) */}
                <button
                  className="notif-dismiss-btn"
                  onClick={(e) => dismissOne(n.id, e)}
                  title="Eliminar notificación"
                  style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'var(--notif-close-bg)', border: '1px solid var(--notif-close-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--content-quaternary)', cursor: 'pointer', transition: 'all 0.15s ease', flexShrink: 0, marginTop: '2px', opacity: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef444428'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-quaternary)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--notif-close-bg)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--notif-close-border)'; }}
                >
                  <X style={{ width: '10px', height: '10px' }} strokeWidth={2} />
                </button>
              </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--notif-footer-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--surface-subtle)' }}>
          <button onClick={() => { handleClose(); onNavigate('/dashboard/settings'); }}
            style={{ fontSize: '10px', fontWeight: 300, color: 'var(--content-tertiary)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em', transition: 'color 0.15s ease', display: 'flex', alignItems: 'center', gap: '4px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-secondary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--content-tertiary)'; }}
          >
            <Settings style={{ width: '10px', height: '10px' }} strokeWidth={1.5} />
            Configurar notificaciones
          </button>
          <span style={{ fontSize: '9px', color: 'var(--content-quaternary)', fontWeight: 300, letterSpacing: '0.04em' }}>
            {visibleUnread > 0 ? `${visibleUnread} sin leer` : 'Todo leído'}
          </span>
        </div>
      </div>
    </>,
    document.body
  );
});
NotifPanel.displayName = 'NotifPanel';

// ── NavItem type ──────────────────────────────────────────────────────────────
export interface NavItem { path: string; label: string; icon: React.FC<any>; show?: boolean; badge?: number; }

const SidebarNavLink = memo(({ item, collapsed }: { item: NavItem; collapsed: boolean }) => (
  <NavLink to={item.path} end={item.path === '/dashboard'} title={collapsed ? item.label : undefined} aria-label={collapsed ? item.label : undefined} className={({ isActive }) => `moon-shell-link${isActive ? ' is-active' : ''}${collapsed ? ' is-compact' : ''}`}>
    <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />
    {!collapsed && <span className="moon-shell-link-label">{item.label}</span>}
    {(item.badge ?? 0) > 0 && <span className="moon-shell-badge">{(item.badge ?? 0) > 9 ? '9+' : item.badge}</span>}
  </NavLink>
));
SidebarNavLink.displayName = 'SidebarNavLink';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════
const DashboardLayout: React.FC = () => {
  const outlet = useOutlet();
  const { currentUser, userProfile, loading, puede, userRole, accesoAdmin } = useAuth();
  const { settings, toggleSidebar, toggleTheme, isDark } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutPhase, setLogoutPhase] = useState<'idle' | 'confirming' | 'leaving'>('idle');
  const [cardAnimClass, setCardAnimClass] = useState('__lo_card_in');
  const [pageAnimClass, setPageAnimClass] = useState('');

  const sidebarCollapsed = settings.sidebarCollapsed;
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.moonSessionStyles = 'true';
    style.textContent = SESSION_MODAL_STYLES;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // Atajos de teclado (lib/ajustes/atajos.ts: la misma lista que muestra Configuración).
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      const a = atajoDe(e);
      if (!a?.accion) return;
      e.preventDefault();
      if (a.accion.tipo === 'ir') navigate(a.accion.ruta);
      else if (a.accion.tipo === 'barra') toggleSidebar();
      else toggleTheme();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [navigate, toggleSidebar, toggleTheme]);

  // La configuración (tema, acento, fuente, tamaño, accesibilidad) la aplica
  // lib/ajustes/aplicar.ts desde SettingsContext. Antes este layout la aplicaba
  // OTRA vez sobre <body>, con otros valores, y las dos se pisaban.

  const doLogout = useCallback(async () => {
    setPageAnimClass('__lo_page');
    await new Promise(r => setTimeout(r, 500));
    try { await logoutUser(); } catch (e) { console.error(e); }
    navigate('/');
  }, [navigate]);

  const { showModal: showTabModal, handleStayHere, handleGoToOther } = useTabSync(!!currentUser);
  const { showWarning, countdown, handleStayActive } = useAutoLogout(!!currentUser, doLogout);

  const { notifications, unreadCount, readIds, markOneRead, markAllRead, markPanelSeen, dismissOne, dismissAllRead, dismissAll } =
    useNotifications({
      uid: currentUser?.uid,
      rol: userRole || undefined,
      puedeRevisarTramites: userRole === 'CEO' || (userRole === 'Administración' && accesoAdmin?.tramites.resolver === true),
      puedeVerMensajeria: puede('admin'),
      escritorio: settings.notifications !== false && settings.desktopNotifs !== false,
      silencio: { activo: !!settings.quietHoursEnabled, desde: settings.quietFrom, hasta: settings.quietTo },
      soundType: settings.notificationSound ?? 'default',
      soundVolume: settings.notificationVolume ?? 0.7,
      muted: settings.notifications === false || (settings.notificationsMuted ?? false),
      enabledCategories: {
        announcement: settings.notifyAnnouncements ?? true,
        email: settings.notifyEmails ?? true,
        thread: settings.notifyThreads ?? true,
        message: settings.notifyMessages ?? true,
        task: settings.notifyTasks ?? true,
        security: true,
      },
    });

  const unreadMails = notifications.filter(n => n.category === 'email' && !readIds.has(n.id)).length;

  // Push del navegador: con permiso concedido, este navegador recibe los avisos aunque la pestaña esté cerrada.
  const avisosSistema = settings.notifications !== false && settings.desktopNotifs !== false;
  useEffect(() => {
    if (!currentUser || !avisosSistema) return;
    const activar = () => { void activarPushWeb(currentUser); };
    activar();
    window.addEventListener('moon-permiso-notificaciones', activar);
    return () => window.removeEventListener('moon-permiso-notificaciones', activar);
  }, [currentUser, avisosSistema]);

  // Ajuste "Contador en el título": "(3) moon Studios — Portal Oficial".
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = settings.badgeCount !== false && unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [unreadCount, settings.badgeCount]);

  useEffect(() => { if (!loading && !currentUser) navigate('/'); }, [currentUser, loading, navigate]);
  useEffect(() => {
    const unlock = () => { unlockAudio(); document.removeEventListener('click', unlock); document.removeEventListener('keydown', unlock); };
    document.addEventListener('click', unlock); document.addEventListener('keydown', unlock);
    return () => { document.removeEventListener('click', unlock); document.removeEventListener('keydown', unlock); };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (notifOpen) setNotifOpen(false);
        else if (logoutPhase === 'confirming') handleCancelLogout();
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [logoutPhase, notifOpen]);
  useEffect(() => { setNotifOpen(false); }, [location.pathname]);

  const handleLogoutClick = () => { setCardAnimClass('__lo_card_in'); setLogoutPhase('confirming'); };
  const handleCancelLogout = () => { setCardAnimClass('__lo_card_out'); setTimeout(() => setLogoutPhase('idle'), 200); };
  const handleConfirmLogout = async () => {
    setCardAnimClass('__lo_card_out');
    await new Promise(r => setTimeout(r, 180));
    setCardAnimClass('__lo_card_in');
    setLogoutPhase('leaving');
    await new Promise(r => setTimeout(r, 1800));
    await doLogout();
  };

  const handleOpenPanel = useCallback(() => {
    if (notifOpen) { setNotifOpen(false); return; }
    markPanelSeen();
    setNotifOpen(true);
  }, [notifOpen, markPanelSeen]);

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { path: '/dashboard/calendar', label: 'Calendario', icon: Calendar, show: true },
    { path: '/dashboard/tareas', label: 'Mis tareas', icon: ListTodo, show: true },
    { path: '/dashboard/discord', label: 'Discord Bot', icon: Bot, show: true },
    { path: '/dashboard/announcements', label: 'Anuncios', icon: Megaphone, show: true },
    { path: '/dashboard/correo', label: 'Correo', icon: Mail, show: true, badge: unreadMails },
    { path: '/dashboard/hilos', label: 'Hilos', icon: GitBranch, show: true },
    { path: '/dashboard/mensajeria', label: 'Mensajería', icon: MessagesSquare, show: true },
    { path: '/dashboard/webs', label: 'Webs', icon: Globe, show: puede('webs') },
    { path: '/dashboard/proyectos',    label: 'Proyectos',    icon: FolderKanban,    show: true },
    { path: '/dashboard/elecciones', label: 'Elecciones', icon: Vote, show: true },
    { path: '/dashboard/tramites', label: 'Trámites', icon: ClipboardList, show: true },
    { path: '/dashboard/conferencias', label: 'Conferencias', icon: Presentation, show: true },
    // Cada panel se muestra según ROLE_PERMISSIONS (src/types): el CEO los ve todos.
    { path: '/dashboard/ceo-panel', label: 'Panel CEO', icon: Crown, show: puede('ceo') },
    { path: '/dashboard/administracion', label: 'Centro de administración', icon: SlidersHorizontal, show: puede('acceso') },
    { path: '/dashboard/admin', label: 'Panel Admin', icon: ShieldCheck, show: puede('admin') },
    { path: '/dashboard/roles', label: 'Gestión Roles', icon: UserCog, show: puede('roles') },
    { path: '/dashboard/users', label: 'Usuarios', icon: Users, show: puede('admin') },
    { path: '/dashboard/contador', label: 'Contador', icon: Calculator, show: puede('contador') },
    { path: '/dashboard/programacion', label: 'Programación', icon: Code2, show: puede('programacion') },
    { path: '/dashboard/diseno', label: 'Diseño', icon: Palette, show: puede('diseno') },
    { path: '/dashboard/secretaria', label: 'Secretaría', icon: FileText, show: puede('secretaria') },
    { path: '/dashboard/settings', label: 'Configuración', icon: Settings, show: true },
  ].filter(i => i.show);

  if (loading) return <div className="moon-shell-loading" role="status"><BrandLogo compact /><span>Cargando tu espacio…</span></div>;

  return (
    <>
      <AnimatePresence>{showTabModal && <TabSyncModal key="tab-session" onStayHere={handleStayHere} onGoToOther={handleGoToOther} />}</AnimatePresence>
      <AnimatePresence>{showWarning && <AutoLogoutModal key="idle-session" countdown={countdown} totalSeconds={60} onStayActive={handleStayActive} onLogout={() => { void doLogout(); }} />}</AnimatePresence>
      {logoutPhase !== 'idle' && <LogoutModal phase={logoutPhase} onCancel={handleCancelLogout} onConfirm={handleConfirmLogout} cardClass={cardAnimClass} userName={userProfile?.displayName ?? 'Usuario'} />}
      <DashboardShellView navItems={navItems} displayName={userProfile?.displayName || 'Usuario'} avatar={userProfile?.avatar} role={userProfile?.role} sidebarCollapsed={sidebarCollapsed} isDark={isDark} unreadCount={unreadCount} notifOpen={notifOpen} toggleSidebar={toggleSidebar} toggleTheme={toggleTheme} onOpenNotifications={handleOpenPanel} onLogout={handleLogoutClick} pageAnimClass={pageAnimClass}>{outlet}</DashboardShellView>
      {notifOpen && <NotifPanel notifications={notifications} unreadCount={unreadCount} readIds={readIds} markOneRead={markOneRead} markAllRead={markAllRead} dismissOne={dismissOne} dismissAllRead={dismissAllRead} dismissAll={dismissAll} onClose={() => setNotifOpen(false)} onNavigate={navigate} uid={currentUser?.uid} />}
    </>
  );
};


export interface DashboardShellViewProps {
  navItems: NavItem[];
  displayName: string;
  avatar?: string;
  role?: string;
  sidebarCollapsed: boolean;
  isDark: boolean;
  unreadCount: number;
  notifOpen: boolean;
  toggleSidebar: () => void;
  toggleTheme: () => void;
  onOpenNotifications: () => void;
  onLogout: () => void;
  pageAnimClass?: string;
  children: React.ReactNode;
}

/** Presentación compartida por la aplicación y la comprobación visual aislada. */
export function DashboardShellView({ navItems, displayName, avatar, role, sidebarCollapsed, isDark, unreadCount, notifOpen, toggleSidebar, toggleTheme, onOpenNotifications, onLogout, pageAnimClass = '', children }: DashboardShellViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const initials = (displayName || 'U').split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
  useLayoutEffect(() => { setMobileMenuOpen(false); setSearchOpen(false); mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [location.pathname]);
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(value => !value); }
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, []);
  const navGroups = [
    { label: 'Tu espacio', paths: ['/dashboard', '/dashboard/tareas', '/dashboard/calendar', '/dashboard/proyectos', '/dashboard/tramites', '/dashboard/elecciones'] },
    { label: 'Comunicación', paths: ['/dashboard/correo', '/dashboard/mensajeria', '/dashboard/hilos', '/dashboard/conferencias', '/dashboard/announcements', '/dashboard/discord'] },
    { label: 'Estudio', paths: ['/dashboard/webs', '/dashboard/programacion', '/dashboard/diseno', '/dashboard/contador', '/dashboard/secretaria'] },
    { label: 'Administración', paths: ['/dashboard/ceo-panel', '/dashboard/administracion', '/dashboard/admin', '/dashboard/roles', '/dashboard/users'] },
  ].map(group => ({ ...group, items: group.paths.flatMap(path => navItems.filter(item => item.path === path)) })).filter(group => group.items.length > 0);
  const settingsItem = navItems.find(item => item.path === '/dashboard/settings');
  const activeItem = navItems.find(item => item.path === location.pathname || (item.path === '/dashboard/elecciones' && location.pathname.startsWith(`${item.path}/`)));
  const activeGroup = navGroups.find(group => group.items.some(item => item.path === activeItem?.path));
  const searchResults = navItems.filter(item => item.label.toLocaleLowerCase('es').includes(searchQuery.trim().toLocaleLowerCase('es')));
  const renderNavigation = (compact = false) => navGroups.map(group => (
    <section className="moon-shell-nav-group" key={group.label} aria-label={group.label}>
      {!compact && <h2 className="moon-shell-section-label">{group.label}</h2>}
      {group.items.map(item => <SidebarNavLink key={item.path} item={item} collapsed={compact} />)}
    </section>
  ));
  const renderAvatar = () => <span className="moon-shell-avatar">{avatar && <img src={avatar} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />}<span aria-hidden="true">{initials}</span></span>;


  return <>
      <Dialog open={searchOpen} onOpenChange={open => { setSearchOpen(open); if (!open) setSearchQuery(''); }}>
        <DialogContent className="moon-shell-search-dialog">
          <DialogTitle>Ir a un espacio</DialogTitle>
          <DialogDescription>Encuentra las herramientas disponibles para tu cuenta.</DialogDescription>
          <div className="moon-shell-search-field" data-moon-field-frame><Search size={18} aria-hidden="true" /><input autoFocus aria-label="Buscar herramienta" placeholder="Buscar tareas, proyectos, correo…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></div>
          <nav className="moon-shell-search-results" aria-label="Resultados de búsqueda">
            {searchResults.map(item => <button key={item.path} onClick={() => { setSearchOpen(false); setSearchQuery(''); navigate(item.path); }}><item.icon size={18} aria-hidden="true" /><span>{item.label}</span><ChevronRight size={16} aria-hidden="true" /></button>)}
            {searchResults.length === 0 && <p>No encontramos esa herramienta. Prueba con otro nombre.</p>}
          </nav>
        </DialogContent>
      </Dialog>
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="moon-shell-mobile-panel">
          <SheetHeader className="moon-shell-mobile-brand"><SheetTitle><BrandLogo /></SheetTitle><SheetDescription>Espacio de trabajo</SheetDescription></SheetHeader>
          <nav className="moon-shell-navigation" aria-label="Navegación móvil">{renderNavigation()}{settingsItem && <SidebarNavLink item={settingsItem} collapsed={false} />}</nav>
          <div className="moon-shell-mobile-footer"><div className="moon-shell-profile">{renderAvatar()}<div><strong>{displayName || 'Usuario'}</strong><span>{role || 'Equipo Moon'}</span></div></div><button className="moon-shell-footer-button" onClick={() => { setMobileMenuOpen(false); onLogout(); }}><LogOut size={16} aria-hidden="true" />Cerrar sesión</button></div>
        </SheetContent>
      </Sheet>
      <div className={`moon-shell ${sidebarCollapsed ? 'is-collapsed' : ''} ${pageAnimClass}`}>
        <a className="moon-shell-skip" href="#moon-main-content">Saltar al contenido</a>
        {!isMobile && <aside className="moon-shell-sidebar" aria-label="Barra lateral">
          <div className="moon-shell-brand"><NavLink to="/dashboard" aria-label="Moon Studios, inicio"><BrandLogo compact={sidebarCollapsed} /></NavLink>{!sidebarCollapsed && <span>WORKSPACE <span>01</span></span>}</div>
          <nav className="moon-shell-navigation" aria-label="Navegación principal">{renderNavigation(sidebarCollapsed)}</nav>
          <div className="moon-shell-sidebar-footer">
            {settingsItem && <SidebarNavLink item={settingsItem} collapsed={sidebarCollapsed} />}
            <div className="moon-shell-profile">{renderAvatar()}{!sidebarCollapsed && <div><strong>{displayName || 'Usuario'}</strong><span>{role || 'Equipo Moon'}</span></div>}</div>
            <div className="moon-shell-footer-actions"><button className="moon-shell-footer-button" onClick={toggleSidebar} title={sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'} aria-label={sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Contraer</span></>}</button><button className="moon-shell-footer-button" onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} />{!sidebarCollapsed && <span>Salir</span>}</button></div>
          </div>
        </aside>}
        <div className="moon-shell-workspace">
          <header className="moon-shell-header">
            <div className="moon-shell-header-start">
              {isMobile && <button className="moon-shell-icon-button" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir navegación" aria-expanded={mobileMenuOpen}><Menu size={20} /></button>}
              {isMobile && <BrandLogo compact className="moon-shell-mobile-mark" />}
              <div className="moon-shell-breadcrumb"><span>{activeGroup?.label || 'Tu espacio'}</span><ChevronRight size={13} aria-hidden="true" /><strong>{activeItem?.label || 'Dashboard'}</strong></div>
            </div>
            <div className="moon-shell-header-actions">
              <Clock />
              <button className="moon-shell-search-button" onClick={() => setSearchOpen(true)} aria-label="Buscar herramienta"><Search size={17} /><span>Buscar</span><kbd>{esMac ? '⌘' : 'Ctrl'} K</kbd></button>
              <WorkspaceMotionControl />
              <button className="moon-shell-icon-button moon-shell-theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Activar tema claro' : 'Activar tema oscuro'} title={isDark ? 'Tema claro' : 'Tema oscuro'}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
              <button onClick={onOpenNotifications} className={`moon-shell-icon-button${notifOpen ? ' is-active' : ''}`} aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'} aria-expanded={notifOpen}><Bell size={18} />{unreadCount > 0 && <span className="moon-shell-notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
              <button className="moon-shell-profile-shortcut" onClick={() => navigate('/dashboard/settings')} aria-label="Abrir mi cuenta">{renderAvatar()}</button>
            </div>
          </header>

          <main ref={mainRef} id="moon-main-content" tabIndex={-1} className="moon-shell-main main-scroll"><WorkspaceMotion routeKey={location.pathname === '/dashboard/elecciones' || location.pathname.startsWith('/dashboard/elecciones/') ? '/dashboard/elecciones' : location.pathname}><ProteccionErrores nombre={location.pathname}><React.Suspense fallback={<div className="moon-page-loader" role="status"><BrandLogo compact /><span>Cargando tu herramienta…</span></div>}>{children}</React.Suspense></ProteccionErrores></WorkspaceMotion></main>
        </div>
      </div>

  </>;
}

export default DashboardLayout;
