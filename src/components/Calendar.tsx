import { panelInk } from '@/lib/panelColors';
import { calendarTaskDate, createCalendarExport } from '@/lib/calendarExport';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { subscribeToTasks, updateTask, subscribeToUsers } from '@/lib/firebase';
import TaskReportDialog from '@/components/TaskReportDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle2, Flag, Calendar as CalendarIcon,
  AlignLeft, ChevronLeft, ChevronRight, Lock,
  UserCheck, UsersRound, Eye, Ban, ListTodo, X, ShieldCheck,
  Filter, LayoutGrid, List, Search, AlertCircle, PartyPopper, Download, Plus, ArrowUpDown, Target, CalendarDays
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths,
  startOfWeek, endOfWeek, isPast, isToday, startOfDay,
  differenceInDays, parseISO, addDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import type { Task, UserProfile, UserRole } from '@/types';
import { eventosDeCalendario, estaConectado, type EventoCalendario } from '@/lib/integraciones';
import { abrirExterno } from '@/lib/escritorio';

// ── Hex to RGB helper ─────────────────────────────────────────────────────────
function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}

// ── Theme variables injected into :root so Dialog portals also get them ───────
const injectThemeVars = (isDark: boolean, accentColor: string) => {
  const id = 'cal-theme-root-vars';
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }

  const accentRgb = hexToRgb(accentColor);
  const aRgb = accentRgb ? `${accentRgb.r},${accentRgb.g},${accentRgb.b}` : '99,102,241';

  const dark = isDark;
  style.textContent = `
    :root {
      --cal-accent: var(--accent-user-ink, ${panelInk(accentColor)});
      --cal-accent-rgb: ${aRgb};
      --cal-bg: var(--moon-bg);
      --cal-card-bg: var(--moon-surface);
      --cal-overlay: var(--moon-surface-raised);
      --cal-border: var(--moon-line);
      --cal-text-primary: var(--moon-ink);
      --cal-text-secondary: var(--moon-muted);
      --cal-text-muted: var(--moon-muted);
      --cal-text-quaternary: var(--moon-muted);
      --cal-holiday-bg:       ${dark ? 'rgba(251,191,36,0.10)' : 'rgba(251,146,60,0.10)'};
      --cal-holiday-border:   ${dark ? 'rgba(251,191,36,0.22)' : 'rgba(251,146,60,0.22)'};
      --cal-holiday-color:    ${dark ? '#fbbf24'              : '#ea580c'};
      /* Google, en azul, para no confundirlo con un feriado ni con una tarea. */
      --cal-gcal-bg:          ${dark ? 'rgba(66,133,244,0.12)' : 'rgba(66,133,244,0.10)'};
      --cal-gcal-border:      ${dark ? 'rgba(66,133,244,0.28)' : 'rgba(66,133,244,0.24)'};
      --cal-gcal-color:       ${dark ? '#8ab4f8'               : '#1a73e8'};
      --cal-dialog-bg: var(--moon-surface);
      --cal-dialog-border: var(--moon-line);
      --cal-dialog-text: var(--moon-ink);
    }
  `;
};

// ── CSS animations & component styles (static — no theme vars needed) ─────────
const CAL_STYLES = `
  @keyframes cal-fade-in  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes cal-panel-in { from{opacity:0;transform:translateX(10px) scale(0.97)} to{opacity:1;transform:translateX(0) scale(1)} }
  @keyframes cal-scale-in { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
  @keyframes cal-spin     { to{transform:rotate(360deg)} }
  @keyframes cal-stagger  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

  .cal-root { display:flex;flex-direction:column;gap:20px; }

  .cal-card { border-radius:16px;padding:16px;border:1px solid var(--cal-border);background:var(--cal-card-bg); }

  .cal-grid-wrap { border-radius:16px;overflow:hidden;background:var(--cal-card-bg);border:1px solid var(--cal-border); }
  .cal-weekday { text-align:center;font-size:max(11px,.79rem);font-weight:500;letter-spacing:0.08em;text-transform:uppercase;padding:12px 0;color:var(--cal-text-muted); }

  .cal-day { min-height:102px;padding:10px 6px;border-radius:10px;background:var(--cal-card-bg);border:1px solid var(--cal-border);transition:background 0.15s,border-color 0.15s,box-shadow 0.15s;position:relative; }
  .cal-day.other-month { background:transparent;border-color:transparent;opacity:0.2; }
  .cal-day.selected   { background:rgba(var(--cal-accent-rgb),0.08);border-color:rgba(var(--cal-accent-rgb),0.35);box-shadow:0 0 0 1px rgba(var(--cal-accent-rgb),0.15); }
  .cal-day.clickable  { cursor:pointer; }
  .cal-day.clickable:hover { background:var(--cal-overlay); }
  .cal-day.is-holiday { border-color:var(--cal-holiday-border) !important; }

  .cal-day-num { font-size:max(13px,.93rem);text-align:center;width:28px;height:28px;border-radius:50%;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;color:var(--cal-text-primary);border:1px solid transparent;font-weight:400;transition:background 0.15s; }
  .cal-day-num.today { background:rgba(var(--cal-accent-rgb),0.15);border-color:rgba(var(--cal-accent-rgb),0.35);color:var(--cal-accent);font-weight:500; }
  .cal-day-num.past  { color:var(--cal-text-quaternary); }

  .cal-holiday-dot { width:5px;height:5px;border-radius:50%;background:var(--cal-holiday-color);margin:0 auto 2px;display:block; }
  .cal-holiday-label { font-size:8px;font-weight:300;color:var(--cal-holiday-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;line-height:1.2;padding:0 2px; }

  .cal-panel { flex-shrink:0;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;background:var(--cal-card-bg);border:1px solid var(--cal-border); }
  .cal-panel-header { display:flex;align-items:flex-start;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--cal-border);flex-shrink:0; }
  .cal-panel-body { flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;min-height:120px; }
  .cal-panel-body::-webkit-scrollbar { width:3px; }
  .cal-panel-body::-webkit-scrollbar-track { background:transparent; }
  .cal-panel-body::-webkit-scrollbar-thumb { background:var(--cal-border);border-radius:4px; }

  .cal-task-btn { width:100%;text-align:left;padding:10px 12px;border-radius:12px;background:var(--cal-card-bg);border:1px solid var(--cal-border);cursor:pointer;transition:background 0.15s,border-color 0.15s;font-family:inherit;color:var(--cal-text-primary); }
  .cal-task-btn:hover { background:var(--cal-overlay); }

  .cal-list-row { display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:12px;transition:background 0.15s;cursor:default; }
  .cal-list-row:hover { background:var(--cal-overlay); }

  .cal-nav-btn { width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--cal-card-bg);border:1px solid var(--cal-border);color:var(--cal-text-primary);cursor:pointer;transition:all 0.15s;font-family:inherit; }
  .cal-nav-btn:hover { background:var(--cal-overlay); }

  .cal-icon-btn { width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.18s;font-family:inherit;border:1px solid var(--cal-border);background:transparent;color:var(--cal-text-muted); }
  .cal-icon-btn:hover  { background:var(--cal-overlay);color:var(--cal-text-primary); }
  .cal-icon-btn.active { background:rgba(var(--cal-accent-rgb),0.12);border-color:rgba(var(--cal-accent-rgb),0.3);color:var(--cal-accent); }

  .cal-close-btn { width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:var(--cal-card-bg);border:1px solid var(--cal-border);color:var(--cal-text-muted);cursor:pointer;transition:all 0.15s;font-family:inherit; }
  .cal-close-btn:hover { background:var(--cal-overlay);color:var(--cal-text-primary); }

  .cal-status-btn { background:none;border:none;cursor:pointer;padding:0;flex-shrink:0;transition:color 0.15s;font-family:inherit; }

  .cal-view-btn { font-size:12px;font-weight:300;padding:4px 10px;border-radius:8px;color:var(--cal-text-muted);background:var(--cal-card-bg);border:1px solid var(--cal-border);cursor:pointer;transition:all 0.15s;font-family:inherit; }
  .cal-view-btn:hover { background:var(--cal-overlay);color:var(--cal-text-primary); }

  .cal-report-btn { width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 0;border-radius:12px;font-size:13px;font-weight:300;background:var(--cal-card-bg);border:1px solid var(--cal-border);color:var(--cal-text-primary);cursor:pointer;transition:all 0.15s;font-family:inherit; }
  .cal-report-btn:hover { background:var(--cal-overlay); }

  /* ── Dialog: override shadcn internals using :root vars ── */
  .cal-dialog-box { background:var(--cal-dialog-bg) !important;border:1px solid var(--cal-dialog-border) !important;border-radius:20px !important;max-height:90vh;overflow-y:auto;color:var(--cal-dialog-text) !important; }
  .cal-dialog-box [class*="DialogTitle"] { color:var(--cal-dialog-text) !important; }
  .cal-dialog-box [class*="DialogDescription"] { color:var(--cal-text-secondary) !important; }

  .cal-desc-box { font-size:13px;font-weight:300;line-height:1.7;padding:12px 14px;border-radius:10px;white-space:pre-wrap;background:var(--cal-overlay);border:1px solid var(--cal-border);color:var(--cal-text-secondary); }
  .cal-assignee-card { display:inline-flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:var(--cal-overlay);border:1px solid var(--cal-border); }
  .cal-assignee-av { width:28px;height:28px;border-radius:8px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.22);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:var(--moon-tone-purple); }

  .cal-lock-notice,.cal-no-interact { display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:var(--cal-overlay);border:1px solid var(--cal-border); }

  .cal-gcal-chip { display:flex;align-items:center;gap:3px;font-size:9px;line-height:1.3;padding:1px 4px;border-radius:4px;
    background:var(--cal-gcal-bg);border:1px solid var(--cal-gcal-border);color:var(--cal-gcal-color);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px; }
  .cal-gcal-chip.rechazado { opacity:.5;text-decoration:line-through; }
  .cal-gcal-panel-item { display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:10px;
    background:var(--cal-gcal-bg);border:1px solid var(--cal-gcal-border);width:100%;text-align:left;
    cursor:pointer;font:inherit; }
  .cal-gcal-panel-item:disabled { cursor:default; }
  .cal-holiday-panel-item { display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:10px;background:var(--cal-holiday-bg);border:1px solid var(--cal-holiday-border); }

  .cal-stats-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px; }

  .cal-stat-card { padding:20px;border-radius:14px;background:var(--cal-card-bg);border:1px solid var(--cal-border);text-align:left;display:grid;grid-template-columns:1fr auto;gap:12px; }

  .cal-filter-dropdown { position:absolute;top:calc(100% + 6px);right:0;min-width:200px;background:var(--cal-card-bg);border:1px solid var(--cal-border);border-radius:12px;overflow:hidden;z-index:100;animation:cal-scale-in 0.18s cubic-bezier(0.34,1.56,0.64,1); }

  .cal-filter-btn { padding:5px 10px;border-radius:7px;font-size:12px;cursor:pointer;border:1px solid var(--cal-border);background:var(--cal-card-bg);color:var(--cal-text-muted);transition:all 0.15s ease;font-family:inherit; }
  .cal-filter-btn:hover { background:var(--cal-overlay);color:var(--cal-text-primary); }
  .cal-filter-btn.active-filter { background:rgba(var(--cal-accent-rgb),0.12);border-color:rgba(var(--cal-accent-rgb),0.35);color:var(--cal-accent); }

  .cal-search-wrap { display:flex;align-items:center;gap:10px;padding:0 14px;border-radius:12px;background:var(--cal-card-bg);border:1px solid var(--cal-border);transition:border-color 0.15s,box-shadow 0.15s;flex:1;min-width:min(100%,240px); }
  .cal-search-wrap:focus-within { border-color:rgba(var(--cal-accent-rgb),0.4);box-shadow:0 0 0 3px rgba(var(--cal-accent-rgb),0.1); }
  .cal-search-wrap input { background:none;border:none;outline:none;font-size:max(14px,1rem);font-weight:400;color:var(--cal-text-primary);font-family:inherit;flex:1;min-width:0; }
  .cal-search-wrap input::placeholder { color:var(--cal-text-muted); }

  .cal-badge-today { font-size:9px;font-weight:500;letter-spacing:0.06em;padding:2px 7px;border-radius:999px;background:rgba(var(--cal-accent-rgb),0.15);color:var(--cal-accent);border:1px solid rgba(var(--cal-accent-rgb),0.25); }
  .cal-badge-past  { font-size:9px;font-weight:300;padding:2px 7px;border-radius:999px;color:var(--cal-text-muted);background:var(--cal-overlay);display:flex;align-items:center;gap:3px; }
  .cal-badge-overdue { font-size:10px;font-weight:300;padding:2px 7px;border-radius:999px;background:rgba(248,113,113,0.1);color:var(--moon-tone-red);flex-shrink:0; }

  .cal-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px; }

  .cal-spinner { width:26px;height:26px;border-radius:50%;border:2px solid var(--cal-border);border-top-color:var(--cal-accent);animation:cal-spin 0.8s linear infinite; }

  .cal-progress-bar { grid-column:1 / -1;height:4px;border-radius:4px;background:var(--cal-border);overflow:hidden;margin-top:8px; }
  .cal-progress-fill { height:100%;border-radius:4px;transition:width 0.6s ease; }

  .cal-mobile-panel { display:none; }

  @media (max-width:1023px) { .cal-desktop-panel{display:none!important} .cal-mobile-panel{display:block} }
  @media (min-width:1024px) { .cal-desktop-layout{display:flex!important;gap:16px;align-items:flex-start} .cal-panel{width:300px} }

  .cal-grid-inner { display:grid;grid-template-columns:repeat(7,1fr);gap:3px; }
  @media (max-width:480px) { .cal-day{min-height:76px;padding:6px 2px} .cal-day-num{font-size:12px;width:25px;height:25px} }

  .cal-list-assignee { display:block; }
  @media (max-width:420px) { .cal-list-assignee{display:none} }

  .cal-month-title { color:var(--cal-text-primary);font-weight:500;font-size:max(17px,1.2rem);min-width:160px;text-align:center;text-transform:capitalize; }

  .cal-task-chip { font-size:max(10px,.72rem);padding:4px 5px;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400;line-height:1.4;display:block; }

  .cal-accent-btn { font-size:12px;padding:5px 12px;border-radius:8px;cursor:pointer;background:rgba(var(--cal-accent-rgb),0.1);border:1px solid rgba(var(--cal-accent-rgb),0.25);color:var(--cal-accent);font-family:inherit;transition:all 0.15s; }
  .cal-accent-btn:hover { background:rgba(var(--cal-accent-rgb),0.18); }
  .cal-head { display:flex;justify-content:space-between;gap:20px;align-items:flex-start;flex-wrap:wrap; }
  .cal-eyebrow { display:flex;gap:7px;align-items:center;color:var(--cal-text-muted);font-size:max(11px,.79rem);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px; }
  .cal-subtitle { color:var(--cal-text-muted);font-size:max(14px,1rem);margin-top:9px;line-height:1.6;max-width:560px; }
  .cal-head-actions,.cal-toolbar,.cal-period-nav,.cal-focusbar { display:flex;gap:10px;align-items:center;flex-wrap:wrap; }
  .cal-toolbar { padding:16px;border:1px solid var(--cal-border);border-radius:16px;background:var(--cal-card-bg); }
  .cal-period-nav { margin-right:auto;gap:6px; }
  .cal-action { min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border-radius:10px;background:var(--cal-card-bg);border:1px solid var(--cal-border);color:var(--cal-text-primary);font-size:max(13px,.93rem);font-weight:500;transition:background .15s; }
  .cal-action:hover { background:var(--cal-overlay); }
  .cal-action:disabled { opacity:.45;cursor:not-allowed; }
  .cal-action.primary { background:var(--moon-accent);color:var(--moon-accent-ink);border-color:var(--moon-accent); }
  .cal-segment { display:inline-flex;border:1px solid var(--cal-border);background:var(--cal-overlay);padding:4px;border-radius:12px; }
  .cal-segment button { border:0;background:transparent;min-height:38px;padding:8px 12px;display:flex;gap:7px;align-items:center;justify-content:center;border-radius:8px;font-size:max(13px,.93rem);font-weight:500;color:var(--cal-text-muted); }
  .cal-segment button[aria-pressed=true] { background:var(--cal-card-bg);color:var(--cal-text-primary);box-shadow:0 1px 4px #0002; }
  .cal-focusbar { gap:8px; }
  .cal-focusbar > span { font-size:max(12px,.86rem);color:var(--cal-text-muted);margin-right:4px; }
  .cal-focus-btn { min-height:40px;border:1px solid var(--cal-border);border-radius:999px;padding:8px 13px;display:inline-flex;gap:7px;align-items:center;background:var(--cal-card-bg);color:var(--cal-text-secondary);font-size:max(13px,.93rem); }
  .cal-focus-btn[aria-pressed=true] { background:var(--moon-accent);color:var(--moon-accent-ink);border-color:var(--moon-accent); }
  .cal-search-toolbar { display:flex;gap:12px;flex-wrap:wrap;align-items:center; }
  .cal-search-toolbar select { min-width:190px;background:var(--cal-card-bg);border:1px solid var(--cal-border);border-radius:10px;padding:10px 12px; }
  .cal-filter-dropdown { min-width:280px;max-width:calc(100vw - 40px);padding:18px!important;box-shadow:0 18px 40px #0003; }
  .cal-filter-btn,.cal-view-btn,.cal-accent-btn { min-height:40px;font-size:max(13px,.93rem);padding:8px 12px;font-weight:400; }
  .cal-nav-btn,.cal-icon-btn { min-width:44px;min-height:44px; }
  .cal-close-btn { min-width:34px;min-height:34px; }
  .cal-list-row { padding:16px 12px;gap:12px; }
  .cal-list-row + .cal-list-row { border-top:1px solid var(--cal-border);border-radius:0; }
  .cal-status-btn { min-width:34px;min-height:34px;display:grid;place-items:center; }
  .cal-day:focus-visible { outline:2px solid var(--cal-accent);outline-offset:2px; }
  .cal-export-note { font-size:max(12px,.86rem);color:var(--cal-text-muted);line-height:1.6; }
  .cal-stat-label { font-size:max(13px,.93rem);color:var(--cal-text-muted); }
  .cal-stat-value { font-size:clamp(28px,3vw,38px);line-height:1.15;font-weight:500;letter-spacing:-.04em;color:var(--cal-text-primary);font-variant-numeric:tabular-nums;margin-top:10px; }
  .cal-stat-icon { width:36px;height:36px;border:1px solid var(--cal-border);border-radius:10px;display:grid;place-items:center;background:var(--cal-overlay); }
  @media (max-width:640px) { .cal-toolbar{padding:12px}.cal-period-nav{width:100%;justify-content:space-between}.cal-month-title{min-width:0;flex:1}.cal-stats-grid{gap:8px}.cal-stat-card{padding:14px;display:block}.cal-stat-icon{display:none}.cal-stat-label{font-size:12px}.cal-head-actions{width:100%}.cal-head-actions>*{flex:1}.cal-search-toolbar select{flex:1}.cal-search-wrap{width:100%;flex-basis:100%}.cal-stat-value{font-size:28px}.cal-list-row{padding:14px 4px;align-items:flex-start}.cal-task-chip{font-size:10px}.cal-holiday-label{font-size:9px} }
`;

// ── Constants ─────────────────────────────────────────────────────────────────
const isDayPast = (day: Date) => isPast(startOfDay(day)) && !isToday(day);

const PRI = {
  high:   { label: 'Alta',  color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#f87171' },
  medium: { label: 'Media', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  dot: '#fbbf24' },
  low:    { label: 'Baja',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  dot: '#4ade80' },
} as const;

const STA = {
  pending:       { label: 'Pendiente',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  'in-progress': { label: 'En progreso', color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
  completed:     { label: 'Completada',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
} as const;

const ROLE_CFG: Record<string, { label: string; color: string }> = {
  CEO:            { label: 'CEO',            color: '#c084fc' },
  Administración: { label: 'Administración', color: '#60a5fa' },
  Empleado:       { label: 'Empleado',       color: '#94a3b8' },
  Contador:       { label: 'Contador',       color: '#34d399' },
  Diseño:         { label: 'Diseño',         color: '#a78bfa' },
  Secretaría:     { label: 'Secretaría',     color: '#4ade80' },
  Programación:   { label: 'Programación',   color: '#f472b6' },
};

type FilterStatus   = 'all' | 'pending' | 'in-progress' | 'completed';
type FilterPriority = 'all' | 'high' | 'medium' | 'low';
type ViewMode       = 'grid' | 'list';
type AgendaFocus    = 'month' | 'upcoming' | 'overdue' | 'mine';

// ── Nager.Date Holiday API ────────────────────────────────────────────────────
interface NagerHoliday {
  date: string;        // "YYYY-MM-DD"
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

// Detect country from browser locale + timezone
const detectCountryCode = (): string => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzMap: Record<string, string> = {
      'America/Lima': 'PE',
      'America/Bogota': 'CO',
      'America/Santiago': 'CL',
      'America/Buenos_Aires': 'AR',
      'America/Argentina/Buenos_Aires': 'AR',
      'America/Caracas': 'VE',
      'America/Guayaquil': 'EC',
      'America/La_Paz': 'BO',
      'America/Asuncion': 'PY',
      'America/Montevideo': 'UY',
      'America/Mexico_City': 'MX',
      'America/New_York': 'US',
      'America/Chicago': 'US',
      'America/Los_Angeles': 'US',
      'America/Sao_Paulo': 'BR',
      'Europe/Madrid': 'ES',
      'Europe/London': 'GB',
      'Europe/Paris': 'FR',
      'Europe/Berlin': 'DE',
      'Europe/Rome': 'IT',
      'Asia/Tokyo': 'JP',
      'Asia/Shanghai': 'CN',
      'Asia/Seoul': 'KR',
      'Asia/Kolkata': 'IN',
    };
    if (tzMap[tz]) return tzMap[tz];
    // Fallback: try navigator.language region
    const lang = navigator.language || '';
    const region = lang.split('-')[1]?.toUpperCase();
    return region && region.length === 2 ? region : 'PE';
  } catch {
    return 'PE';
  }
};

// null = no se pudo consultar (sin red, API caída o país sin datos): el
// calendario sigue funcionando y se muestra un aviso discreto.
const fetchHolidays = async (countryCode: string, year: number): Promise<NagerHoliday[] | null> => {
  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as NagerHoliday[]) : null;
  } catch {
    return null;
  }
};

// "YYYY-MM-DD" con new Date() se lee como medianoche UTC: en Perú (UTC-5)
// el feriado caía el día anterior. parseISO lo toma como fecha local.
const fechaFeriado = (h: NagerHoliday) => parseISO(h.date);

// ── Google Calendar ─────────────────────────────────────────────────────────

/* La fecha de un evento. Los de todo el día llegan como "2026-10-26" y hay
   que leerlos como fecha local: `new Date("2026-10-26")` los interpreta en
   UTC y en Perú (UTC-5) caerían el día anterior. */
const fechaEvento = (e: EventoCalendario): Date =>
  e.todoElDia ? parseISO((e.inicio ?? "").slice(0, 10)) : new Date(e.inicio ?? 0);

/* La hora, con la zona del navegador. Las de Google ya vienen con su propia
   zona dentro, así que no se tocan a mano. */
const horaEvento = (e: EventoCalendario): string =>
  e.todoElDia ? "Todo el día"
    : new Date(e.inicio ?? 0).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

const CLAVE_VER_GCAL = "cal-ver-google";


// ── Extended Task shape (adds optional assignment fields beyond base Task) ─────
interface ExtTask extends Task {
  assignedTo?: string;
  assignedToRole?: UserRole;
}

// ── Visibility helpers ────────────────────────────────────────────────────────
const canUserSeeTask = (task: ExtTask, userProfile: UserProfile | null): boolean => {
  if (!userProfile) return false;
  if (userProfile.role === 'CEO' || userProfile.role === 'Administración') return true;
  if (!task.assignedTo && !task.assignedToRole) return true;
  if (task.assignedTo) return task.assignedTo === userProfile.uid;
  if (task.assignedToRole) return task.assignedToRole === userProfile.role;
  return false;
};
const canUserInteract = (task: ExtTask, userProfile: UserProfile | null) => canUserSeeTask(task, userProfile);

// ── ReadOnlyTaskView ──────────────────────────────────────────────────────────
const ReadOnlyTaskView: React.FC<{ task: ExtTask; users: UserProfile[]; isCEO: boolean }> = ({ task, users, isCEO }) => {
  const pri = PRI[task.priority as keyof typeof PRI] ?? PRI.medium;
  const sta = STA[task.status as keyof typeof STA] ?? STA.pending;
  const assignedUser = task.assignedTo ? users.find(u => u.uid === task.assignedTo) ?? null : null;
  const assignedRole = task.assignedToRole ?? null;
  const roleCfg      = assignedRole ? ROLE_CFG[assignedRole] : null;
  const dueDate      = new Date(task.date);
  const daysLeft     = differenceInDays(dueDate, new Date());
  const isOverdue    = daysLeft < 0 && task.status !== 'completed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
      {!isCEO && (
        <div className="cal-lock-notice">
          <Lock style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--cal-text-muted)' }} strokeWidth={1.5} />
          <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-text-muted)' }}>Solo el CEO puede modificar tareas.</p>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: pri.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 'max(11px,0.79rem)', padding: '2px 7px', borderRadius: 20, color: panelInk(sta.color), background: sta.bg, fontWeight: 400 }}>{sta.label}</span>
          {isOverdue && <span className="cal-badge-overdue">Vencida</span>}
        </div>
        <p style={{ fontWeight: 400, fontSize: 16, lineHeight: 1.4, color: 'var(--cal-text-primary)' }}>{task.title}</p>
      </div>

      {task.description && (
        <div>
          <p style={{ fontSize: 'max(12px,0.86rem)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlignLeft style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Descripción
          </p>
          <p className="cal-desc-box">{task.description}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <p style={{ fontSize: 'max(12px,0.86rem)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Flag style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Prioridad
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'max(14px,1.00rem)', fontWeight: 400, padding: '5px 10px', borderRadius: 8, background: pri.bg, color: panelInk(pri.color) }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: pri.color }} />
            {pri.label}
          </span>
        </div>
        <div>
          <p style={{ fontSize: 'max(12px,0.86rem)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CalendarIcon style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Fecha límite
          </p>
          <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: panelInk(isOverdue ? '#f87171' : 'var(--cal-text-secondary)') }}>
            {format(dueDate, "d 'de' MMMM yyyy", { locale: es })}
          </p>
          {!isOverdue && task.status !== 'completed' && daysLeft >= 0 && (
            <p style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: panelInk(daysLeft <= 2 ? '#fbbf24' : 'var(--cal-text-muted)'), marginTop: 2 }}>
              {daysLeft === 0 ? 'Vence hoy' : `${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>
      </div>

      {assignedUser && (
        <div>
          <p style={{ fontSize: 'max(12px,0.86rem)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <UserCheck style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Asignado a
          </p>
          <div className="cal-assignee-card">
            <div className="cal-assignee-av">{assignedUser.displayName?.[0]?.toUpperCase() ?? '?'}</div>
            <div>
              <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-text-primary)' }}>{assignedUser.displayName}</p>
              <p style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: 'var(--cal-text-muted)' }}>{assignedUser.email}</p>
            </div>
          </div>
        </div>
      )}

      {!assignedUser && assignedRole && roleCfg && (
        <div>
          <p style={{ fontSize: 'max(12px,0.86rem)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <UsersRound style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Rol asignado
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'max(14px,1.00rem)', fontWeight: 400, padding: '5px 10px', borderRadius: 8, background: `${roleCfg.color}18`, color: panelInk(roleCfg.color) }}>
            <UsersRound style={{ width: 12, height: 12 }} strokeWidth={1.5} />
            {roleCfg.label}
          </span>
        </div>
      )}
    </div>
  );
};

// ── DayPanel ──────────────────────────────────────────────────────────────────
const DayPanel: React.FC<{
  day: Date; tasks: ExtTask[]; users: UserProfile[]; holidays: NagerHoliday[];
  eventosGoogle: EventoCalendario[];
  onTaskClick: (task: ExtTask) => void; onClose: () => void;
  /** Solo para el CEO: abre el Panel CEO con una tarea nueva para este día. */
  onCrearTarea?: () => void;
}> = ({ day, tasks, users, holidays, eventosGoogle, onTaskClick, onClose, onCrearTarea }) => {
  const past  = isDayPast(day);
  const today = isToday(day);
  const dayHolidays = holidays.filter(h => isSameDay(fechaFeriado(h), day));
  const dayGoogle = eventosGoogle.filter(e => isSameDay(fechaEvento(e), day));

  return (
    <div data-moon-reveal="card" className="cal-panel">
      <div className="cal-panel-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontWeight: 400, fontSize: 'max(14px,1.00rem)', color: 'var(--cal-text-primary)', textTransform: 'capitalize' }}>
              {today ? 'Hoy' : format(day, "EEEE d MMM", { locale: es })}
            </p>
            {today && <span className="cal-badge-today">HOY</span>}
            {past  && <span className="cal-badge-past"><Ban style={{ width: 9, height: 9 }} strokeWidth={1.5} /> Pasado</span>}
            {dayHolidays.length > 0 && (
              <span style={{ fontSize: 'max(11px,0.79rem)', fontWeight: 500, padding: '2px 7px', borderRadius: 999, background: 'var(--cal-holiday-bg)', color: 'var(--cal-holiday-color)', border: '1px solid var(--cal-holiday-border)' }}>
                🎉 Feriado
              </span>
            )}
          </div>
          <p style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: 'var(--cal-text-muted)', marginTop: 2 }}>
            {tasks.length === 0 && dayHolidays.length === 0 && dayGoogle.length === 0
              ? 'Sin eventos'
              : `${tasks.length > 0 ? `${tasks.length} tarea${tasks.length !== 1 ? 's' : ''}` : ''}${tasks.length > 0 && dayHolidays.length > 0 ? ' · ' : ''}${dayHolidays.length > 0 ? `${dayHolidays.length} feriado${dayHolidays.length !== 1 ? 's' : ''}` : ''}`}
          </p>
        </div>
        <button type="button" className="cal-close-btn" aria-label="Cerrar detalle del día" onClick={onClose}>
          <X style={{ width: 13, height: 13 }} strokeWidth={1.5} />
        </button>
      </div>

      <div className="cal-panel-body">
        {onCrearTarea && !past && (
          <button type="button" onClick={onCrearTarea}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', marginBottom: 8,
                     borderRadius: 10, border: '1px dashed var(--cal-border, rgba(255,255,255,0.15))', background: 'transparent',
                     color: 'var(--cal-text-secondary, var(--cal-text-muted))', fontSize: 'max(14px,1.00rem)', fontWeight: 400, cursor: 'pointer' }}>
            + Crear tarea este día
          </button>
        )}
        {/* Holidays first */}
        {dayHolidays.map((h, i) => (
          <div key={i} className="cal-holiday-panel-item">
            <PartyPopper style={{ width: 14, height: 14, color: 'var(--cal-holiday-color)', flexShrink: 0, marginTop: 1 }} strokeWidth={1.5} />
            <div>
              <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-holiday-color)' }}>{h.localName}</p>
              {h.localName !== h.name && (
                <p style={{ fontSize: 'max(12px,0.86rem)', fontWeight: 400, color: 'var(--cal-text-muted)' }}>{h.name}</p>
              )}
            </div>
          </div>
        ))}

        {/* Tasks */}
        {/* Google Calendar: se abre en el navegador, no se edita acá. */}
        {dayGoogle.map(e => (
          <button key={e.id} type="button" className="cal-gcal-panel-item"
                  disabled={!e.meet && !e.url}
                  onClick={() => { const u = e.meet || e.url; if (u) abrirExterno(u); }}>
            <CalendarDays style={{ width: 14, height: 14, color: 'var(--cal-gcal-color)', flexShrink: 0, marginTop: 1 }} strokeWidth={1.5} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-gcal-color)',
                             textDecoration: e.respuesta === 'declined' ? 'line-through' : undefined }}>
                {e.titulo}
              </span>
              <span style={{ display: 'block', fontSize: 'max(11px,0.79rem)', opacity: 0.8, color: 'var(--cal-gcal-color)' }}>
                {[horaEvento(e), e.lugar, e.meet ? 'Meet' : null,
                  e.respuesta === 'declined' ? 'rechazado' : null].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        ))}

        {tasks.length === 0 && dayHolidays.length === 0 && dayGoogle.length === 0 ? (
          <div className="cal-empty" style={{ height: 90 }}>
            <ListTodo style={{ width: 20, height: 20, color: 'var(--cal-text-quaternary)' }} strokeWidth={1} />
            <p style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: 'var(--cal-text-muted)' }}>
              {past ? 'No hubo tareas' : 'Ninguna tarea'}
            </p>
          </div>
        ) : tasks.length === 0 ? null : tasks.map(task => {
          const pri = PRI[task.priority as keyof typeof PRI] ?? PRI.medium;
          const sta = STA[task.status as keyof typeof STA] ?? STA.pending;
          const assignee = task.assignedToRole
            ? ROLE_CFG[task.assignedToRole]?.label
            : task.assignedTo ? users.find(u => u.uid === task.assignedTo)?.displayName : null;

          return (
            <button data-moon-reveal="row" key={task.id} type="button" className="cal-task-btn" onClick={() => onTaskClick(task)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0, background: pri.dot, opacity: task.status === 'completed' ? 0.3 : 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: task.status === 'completed' ? 'line-through' : 'none', opacity: task.status === 'completed' ? 0.5 : 1 }}>
                    {task.title}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    <span style={{ fontSize: 'max(12px,0.86rem)', fontWeight: 400, padding: '2px 6px', borderRadius: 5, color: panelInk(sta.color), background: sta.bg }}>{sta.label}</span>
                    {assignee && <span style={{ fontSize: 'max(12px,0.86rem)', fontWeight: 400, color: 'var(--cal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{assignee}</span>}
                  </div>
                </div>
                <Eye style={{ width: 11, height: 11, color: 'var(--cal-text-muted)', flexShrink: 0, marginTop: 2 }} strokeWidth={1.5} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── FilterDropdown ────────────────────────────────────────────────────────────
const FilterDropdown: React.FC<{
  filterStatus: FilterStatus; filterPriority: FilterPriority;
  onStatusChange: (v: FilterStatus) => void; onPriorityChange: (v: FilterPriority) => void;
  onClose: () => void;
}> = ({ filterStatus, filterPriority, onStatusChange, onPriorityChange, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-cal-filter-trigger]')) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onClose();
      document.querySelector<HTMLButtonElement>('[data-cal-filter-trigger]')?.focus();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', escape); };
  }, [onClose]);

  return (
    <div ref={ref} id="cal-filters" className="cal-filter-dropdown" role="region" aria-label="Filtros de tareas" style={{ padding: 14 }}>
      <p style={{ fontSize: 'max(11px,0.79rem)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--cal-text-muted)', marginBottom: 8, fontWeight: 400 }}>Estado</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {([['all','Todos'], ['pending','Pendiente'], ['in-progress','En progreso'], ['completed','Completada']] as [FilterStatus,string][]).map(([v, l]) => (
          <button type="button" key={v} aria-pressed={filterStatus === v} className={`cal-filter-btn ${filterStatus === v ? 'active-filter' : ''}`} onClick={() => onStatusChange(v)}>{l}</button>
        ))}
      </div>
      <p style={{ fontSize: 'max(11px,0.79rem)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--cal-text-muted)', marginBottom: 8, fontWeight: 400 }}>Prioridad</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {([
          ['all','Todas', undefined],
          ['high','Alta','#f87171'],
          ['medium','Media','#fbbf24'],
          ['low','Baja','#4ade80'],
        ] as [FilterPriority, string, string|undefined][]).map(([v, l, c]) => (
          <button type="button" key={v} aria-pressed={filterPriority === v}
            className={`cal-filter-btn ${filterPriority === v ? 'active-filter' : ''}`}
            style={filterPriority === v && c ? { color: panelInk(c), borderColor: `${c}55`, background: `${c}14` } : undefined}
            onClick={() => onPriorityChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Main CalendarPage ─────────────────────────────────────────────────────────
const CalendarPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { settings, isDark } = useSettings();
  const isCEO = userProfile?.role === 'CEO';
  const navigate = useNavigate();
  // Las tareas se crean en el Panel CEO: se abre ahí con el formulario listo y la fecha puesta.
  const crearTareaEn = (dia: Date) => navigate('/dashboard/ceo-panel', { state: { nuevaTarea: format(dia, 'yyyy-MM-dd') } });

  const accentColor: string = (settings?.accentColor as string) || '#6366f1';

  const [allTasks,       setAllTasks]       = useState<ExtTask[]>([]);
  const [users,          setUsers]          = useState<UserProfile[]>([]);
  const [currentMonth,   setCurrentMonth]   = useState(new Date());
  const [selectedTask,   setSelectedTask]   = useState<ExtTask | null>(null);
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [panelDay,       setPanelDay]       = useState<Date | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [reportTask,     setReportTask]     = useState<ExtTask | null>(null);
  const [viewMode,       setViewMode]       = useState<ViewMode>('grid');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all');
  const [showFilter,     setShowFilter]     = useState(false);
  const [mobilePanelOpen,setMobilePanelOpen]= useState(false);
  const [agendaFocus,    setAgendaFocus]    = useState<AgendaFocus>('month');
  const [sortOrder,      setSortOrder]      = useState<'date' | 'priority'>('date');

  // ── Holidays state ──
  // ── Detect country once (synchronous, no effect needed) ──
  const [countryCode] = useState<string>(() => detectCountryCode());
  const [holidays,    setHolidays]    = useState<NagerHoliday[]>([]);
  const [loadedYear,  setLoadedYear]  = useState<number | null>(null);
  const [holidaysError, setHolidaysError] = useState(false);

  // ── Google Calendar ──
  // Solo aparece si la cuenta está conectada desde Configuración.
  const [googleConectado, setGoogleConectado] = useState(false);
  const [eventosGoogle, setEventosGoogle] = useState<EventoCalendario[]>([]);
  const [errorGoogle, setErrorGoogle] = useState<string | null>(null);
  const [verGoogle, setVerGoogle] = useState<boolean>(() => {
    try { return localStorage.getItem(CLAVE_VER_GCAL) !== 'no'; } catch { return true; }
  });

  // ── Inject :root CSS vars whenever theme/accent changes ──
  useEffect(() => {
    injectThemeVars(isDark, accentColor);
    return () => {
      const el = document.getElementById('cal-theme-root-vars');
      if (el) el.remove();
    };
  }, [isDark, accentColor]);

  // ── Fetch functions declared before useEffect that calls them ──
  // Tareas y usuarios en vivo: lo que el CEO cree o cambie en su panel se ve
  // acá al instante. `fetchTasks` queda para los llamados que ya había.
  const fetchTasks = useCallback(async () => {}, []);

  useEffect(() => {
    const unsubTasks = subscribeToTasks(raw => {
      const mapped = raw.flatMap((t: Record<string, unknown>) => {
        const date = calendarTaskDate(t.date ?? t.dueDate);
        return date ? [{ ...t, date } as ExtTask] : [];
      });
      setAllTasks(mapped);
      setLoading(false);
    }, e => { console.error(e); setLoading(false); });
    const unsubUsers = subscribeToUsers(u => setUsers(u as UserProfile[]), e => console.error(e));
    return () => { unsubTasks(); unsubUsers(); };
  }, []);

  // ── Load holidays when month/year or country changes (async, no sync setState) ──
  useEffect(() => {
    const year = currentMonth.getFullYear();
    if (loadedYear === year) return;
    let vigente = true;
    fetchHolidays(countryCode, year).then(h => {
      // Si ya se cambió de año mientras llegaba la respuesta, se descarta.
      if (!vigente) return;
      setHolidays(h ?? []);
      setHolidaysError(h === null);
      setLoadedYear(year);
    });
    return () => { vigente = false; };
  }, [currentMonth, countryCode, loadedYear]);

  // ── ¿Hay cuenta de Google conectada? Se pregunta una vez. ──
  useEffect(() => {
    let vigente = true;
    estaConectado('google').then(v => { if (vigente) setGoogleConectado(v); });
    return () => { vigente = false; };
  }, []);

  // ── Los eventos del RANGO VISIBLE, no del mes ──
  // La rejilla enseña días del mes anterior y del siguiente para completar
  // las semanas; pidiendo solo el mes, esos días saldrían vacíos sin motivo.
  const desdeVisible = startOfWeek(startOfMonth(currentMonth)).getTime();
  const hastaVisible = endOfWeek(endOfMonth(currentMonth)).getTime();

  useEffect(() => {
    // Sin salida temprana que limpie el estado: hacerlo acá sería un setState
    // síncrono dentro del efecto y encadenaría renders. Lo que se enseña se
    // deriva más abajo, en eventosVisibles.
    if (!googleConectado || !verGoogle) return;
    let vigente = true;
    eventosDeCalendario(new Date(desdeVisible), new Date(hastaVisible + 86400000))
      .then(r => { if (!vigente) return; setEventosGoogle(r.eventos); setErrorGoogle(null); })
      .catch((e: unknown) => {
        if (!vigente) return;
        setEventosGoogle([]);
        setErrorGoogle(e instanceof Error ? e.message : 'No se pudo leer tu calendario de Google.');
      });
    return () => { vigente = false; };
  }, [googleConectado, verGoogle, desdeVisible, hastaVisible]);

  const alternarGoogle = (v: boolean) => {
    setVerGoogle(v);
    try { localStorage.setItem(CLAVE_VER_GCAL, v ? 'si' : 'no'); } catch { /* sin almacenamiento */ }
  };

  const visibleTasks = allTasks.filter(t => canUserSeeTask(t, userProfile));

  const filteredTasks = visibleTasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLocaleLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false;
    }
    const date = startOfDay(new Date(t.date));
    if (agendaFocus === 'overdue' && (t.status === 'completed' || !isDayPast(date))) return false;
    if (agendaFocus === 'upcoming' && (t.status === 'completed' || date < startOfDay(new Date()) || date >= addDays(startOfDay(new Date()), 7))) return false;
    if (agendaFocus === 'mine' && (t.assignedTo ? t.assignedTo !== userProfile?.uid : !t.assignedToRole || t.assignedToRole !== userProfile?.role)) return false;
    return true;
  });

  const days     = eachDayOfInterval({ start: startOfWeek(startOfMonth(currentMonth)), end: endOfWeek(endOfMonth(currentMonth)) });
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const getTasksForDay = (day: Date) =>
    filteredTasks.filter(t => isSameDay(new Date(t.date), day));

  const getHolidaysForDay = (day: Date) =>
    holidays.filter(h => isSameDay(fechaFeriado(h), day));

  const handleDayClick = (day: Date) => {
    if (!isSameMonth(day, currentMonth)) return;
    const dayTasks    = getTasksForDay(day);
    const dayHolidays = getHolidaysForDay(day);
    if (!isCEO && dayTasks.length === 0 && dayHolidays.length === 0) return;
    if (panelDay && isSameDay(day, panelDay)) { setPanelDay(null); setMobilePanelOpen(false); return; }
    setPanelDay(day);
    setMobilePanelOpen(true);
  };

  const handleTaskClick = (task: ExtTask, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedTask(task); setPanelDay(null); setMobilePanelOpen(false); setDialogOpen(true);
  };

  const handleStatusToggle = async (task: ExtTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCEO) return;
    try {
      await updateTask(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' });
      fetchTasks();
    } catch (err) { console.error(err); toast.error('No se pudo cambiar el estado de la tarea'); }
  };

  const getAssignLabel = (task: ExtTask): string | null => {
    if (task.assignedToRole) return ROLE_CFG[task.assignedToRole]?.label ?? task.assignedToRole;
    if (task.assignedTo)     return users.find(u => u.uid === task.assignedTo)?.displayName ?? null;
    return null;
  };

  const isSearching = searchQuery.trim().length > 0;

  const monthTasks = filteredTasks
    .filter(t => isSearching || agendaFocus === 'upcoming' || agendaFocus === 'overdue' || isSameMonth(new Date(t.date), currentMonth))
    .sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return (sortOrder === 'priority' ? (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1) : 0) || new Date(a.date).getTime() - new Date(b.date).getTime();
    });

  const totalMonth     = visibleTasks.filter(t => isSameMonth(new Date(t.date), currentMonth)).length;
  const completedCount = visibleTasks.filter(t => isSameMonth(new Date(t.date), currentMonth) && t.status === 'completed').length;
  const overdueCount   = visibleTasks.filter(t => isSameMonth(new Date(t.date), currentMonth) && isDayPast(new Date(t.date)) && t.status !== 'completed').length;
  const completionPct  = totalMonth > 0 ? Math.round((completedCount / totalMonth) * 100) : 0;
  const activeFilters  = (filterStatus !== 'all' ? 1 : 0) + (filterPriority !== 'all' ? 1 : 0) + (searchQuery.trim() ? 1 : 0) + (agendaFocus !== 'month' ? 1 : 0);
  const resetFilters = () => { setFilterStatus('all'); setFilterPriority('all'); setSearchQuery(''); setAgendaFocus('month'); };
  const changeMonth = (date: Date) => { setCurrentMonth(date); setPanelDay(null); setMobilePanelOpen(false); setAgendaFocus('month'); };
  const exportAgenda = () => {
    const contents = createCalendarExport(monthTasks);
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `moon-agenda-${agendaFocus}-${format(currentMonth, 'yyyy-MM')}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${monthTasks.length} tarea${monthTasks.length !== 1 ? 's' : ''} exportada${monthTasks.length !== 1 ? 's' : ''}`);
  };

  const userCanInteract = selectedTask ? canUserInteract(selectedTask, userProfile) : false;
  const monthHolidays   = holidays.filter(h => isSameMonth(fechaFeriado(h), currentMonth));

  // Country flag emoji from code
  const countryFlag = (code: string) =>
    code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));

  // Los estilos van antes que el spinner: sin ellos .cal-spinner no tenía forma ni giro.
  if (loading) return (
    <>
      <style>{CAL_STYLES}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280 }}>
        <div className="cal-spinner" />
      </div>
    </>
  );

  const panelTasks    = panelDay ? getTasksForDay(panelDay) : [];
  const panelHolidays = panelDay ? getHolidaysForDay(panelDay) : [];
  // Lo traído sigue en memoria aunque se apague el interruptor: volver a
  // encenderlo no cuesta otra llamada.
  const eventosVisibles = googleConectado && verGoogle ? eventosGoogle : [];
  const eventosDelDia = (d: Date) => eventosVisibles.filter(e => isSameDay(fechaEvento(e), d));

  return (
    <section className="moon-module moon-module--calendar">
      <style>{CAL_STYLES}</style>
      <div className="cal-root">

        <header data-moon-reveal="heading" className="cal-head moon-module-heading">
          <div>
            <span className="cal-eyebrow"><CalendarDays size={15} /> Planificación del equipo</span>
            <h1 className="moon-page-title">Calendario</h1>
            <p className="cal-subtitle">Organiza las entregas, identifica prioridades y consulta la agenda de tu empresa en un solo lugar.</p>
          </div>
          <div className="cal-head-actions">
            <button type="button" className="cal-action" disabled={monthTasks.length === 0} onClick={exportAgenda} title="Descargar las tareas de la lista como archivo de calendario">
              <Download size={16} /> Exportar agenda
            </button>
            {isCEO && <button type="button" className="cal-action primary" onClick={() => crearTareaEn(new Date())}><Plus size={17} /> Nueva tarea</button>}
          </div>
        </header>

        <div className="cal-toolbar">
          <div className="cal-period-nav">
            <button type="button" aria-label="Mes anterior" className="cal-nav-btn" onClick={() => changeMonth(subMonths(currentMonth, 1))}><ChevronLeft size={18} /></button>
            <h2 className="cal-month-title">{format(currentMonth, 'MMMM yyyy', { locale: es })}</h2>
            <button type="button" aria-label="Mes siguiente" className="cal-nav-btn" onClick={() => changeMonth(addMonths(currentMonth, 1))}><ChevronRight size={18} /></button>
            <button type="button" className="cal-action" onClick={() => { changeMonth(new Date()); setPanelDay(new Date()); setMobilePanelOpen(true); }}>Hoy</button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cal-text-muted)', fontSize: 'max(14px,1.00rem)' }}>
            <span>Ir al mes</span>
            <input aria-label="Ir al mes" type="month" value={format(currentMonth, 'yyyy-MM')} onChange={e => { if (e.target.value) { const date = parseISO(e.target.value + '-01'); if (Number.isFinite(date.getTime())) changeMonth(date); } }} style={{ width: 170, paddingInline: 12 }} />
          </label>
          <div className="cal-segment" role="group" aria-label="Vista de la agenda">
            <button type="button" aria-pressed={viewMode === 'grid'} onClick={() => { setViewMode('grid'); setAgendaFocus('month'); }}><LayoutGrid size={16} /> Mes</button>
            <button type="button" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><List size={16} /> Agenda</button>
          </div>
        </div>

        <div className="cal-search-toolbar">
          <div className="cal-search-wrap" data-moon-field-frame>
            <Search size={18} style={{ color: 'var(--cal-text-muted)' }} aria-hidden="true" />
            <input placeholder="Buscar tareas por título o descripción…" aria-label="Buscar tareas en el calendario" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && <button type="button" className="cal-icon-btn" aria-label="Limpiar búsqueda" onClick={() => setSearchQuery('')} style={{ border: 0, background: 'transparent' }}><X size={16} /></button>}
          </div>
          {/* Solo si hay cuenta conectada: si no, ni interruptor ni hueco. */}
          {googleConectado && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--cal-gcal-color)', cursor: 'pointer' }}>
              <input type="checkbox" checked={verGoogle}
                     onChange={e => alternarGoogle(e.target.checked)} />
              <CalendarDays size={15} /> Google Calendar
            </label>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--cal-text-muted)' }}>
            <ArrowUpDown size={17} aria-hidden="true" />
            <select aria-label="Ordenar tareas del calendario" value={sortOrder} onChange={e => setSortOrder(e.target.value as 'date' | 'priority')}><option value="date">Fecha de entrega</option><option value="priority">Mayor prioridad</option></select>
          </label>
          <div style={{ position: 'relative' }}>
            <button type="button" data-cal-filter-trigger aria-label="Filtrar calendario" aria-controls="cal-filters" aria-expanded={showFilter} className="cal-action" onClick={() => setShowFilter(v => !v)}><Filter size={16} /> Filtros{activeFilters > 0 ? ' (' + activeFilters + ')' : ''}</button>
            {showFilter && <FilterDropdown filterStatus={filterStatus} filterPriority={filterPriority} onStatusChange={setFilterStatus} onPriorityChange={setFilterPriority} onClose={() => setShowFilter(false)} />}
          </div>
        </div>

        <div className="cal-focusbar" role="group" aria-label="Enfoque de la agenda">
          <span><Target size={15} style={{ display: 'inline', marginRight: 6 }} /> Enfoque</span>
          {([['month', 'Todo el mes'], ['upcoming', 'Próximos 7 días'], ['overdue', 'Vencidas'], ['mine', 'Mi agenda']] as [AgendaFocus, string][]).map(([value, label]) => <button type="button" key={value} className="cal-focus-btn" aria-pressed={agendaFocus === value} onClick={() => { setAgendaFocus(value); if (value === 'upcoming' || value === 'overdue') setViewMode('list'); }}>{label}</button>)}
          {activeFilters > 0 && <button type="button" className="cal-action" onClick={resetFilters}><X size={15} /> Limpiar</button>}
        </div>

        {/* ── Stats ── */}
        <div className="cal-stats-grid">
          {[
            { label: 'Tareas del mes',              value: totalMonth.toString(),     icon: CalendarIcon,  color: 'var(--cal-accent)' },
            { label: `Completadas (${completionPct}%)`, value: completedCount.toString(), icon: CheckCircle2,  color: '#4ade80' },
            { label: 'Vencidas',                    value: overdueCount.toString(),   icon: AlertCircle,   color: '#f87171' },
          ].map(({ label, value, icon: Icon, color }, i) => (
            <div data-moon-reveal="metric" key={label} className="cal-stat-card">
              <div><div className="cal-stat-label">{label}</div><div className="cal-stat-value">{value}</div></div>
              <span className="cal-stat-icon"><Icon size={18} style={{ color: panelInk(color) }} strokeWidth={1.5} /></span>
              {i === 1 && totalMonth > 0 && (
                <div className="cal-progress-bar">
                  <div className="cal-progress-fill" style={{ width: `${completionPct}%`, background: '#4ade80' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="cal-export-note">
          {!isCEO && <><Lock size={13} style={{ display: 'inline', marginRight: 5 }} /> Ves únicamente las tareas disponibles para tu cuenta. </>}
          <span title={`País detectado: ${countryCode}`}>{countryFlag(countryCode)} Feriados de {countryCode}.</span> Exportar agenda descarga las tareas de la lista en formato .ics para tu aplicación de calendario.
        </p>

        {/* ── Holiday summary strip (if any this month) ── */}
        {monthHolidays.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <PartyPopper style={{ width: 13, height: 13, color: 'var(--cal-holiday-color)', flexShrink: 0 }} strokeWidth={1.5} />
            <span style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: 'var(--cal-text-muted)', flexShrink: 0 }}>Feriados:</span>
            {monthHolidays.map((h, i) => (
              <span key={i} style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, padding: '3px 8px', borderRadius: 999, background: 'var(--cal-holiday-bg)', color: 'var(--cal-holiday-color)', border: '1px solid var(--cal-holiday-border)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {format(fechaFeriado(h), "d 'de' MMM", { locale: es })} – {h.localName}
              </span>
            ))}
          </div>
        )}

        {/* Si la conexión con Google caducó, se dice. Antes el calendario se
            habría quedado sin eventos sin explicar por qué. */}
        {errorGoogle && googleConectado && verGoogle && (
          <p style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: 'var(--cal-gcal-color)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} strokeWidth={1.5} />
            {errorGoogle} Vuelve a conectarla en Configuración → Integraciones.
          </p>
        )}

        {holidaysError && (
          <p style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: 'var(--cal-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} strokeWidth={1.5} />
            No se pudieron cargar los feriados de {countryCode}. El calendario funciona igual.
            <button type="button" className="cal-accent-btn" style={{ padding: '2px 8px', fontSize: 'max(13px,0.93rem)' }}
              onClick={() => { setHolidaysError(false); setLoadedYear(null); }}>
              Reintentar
            </button>
          </p>
        )}

        {/* ── Grid view ── */}
        {viewMode === 'grid' && (
          <>
            <div className="cal-desktop-layout" style={{ display: 'flex' }}>
              <div data-moon-reveal="card" className="cal-grid-wrap" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ padding: 12 }}>
                  <div className="cal-grid-inner" style={{ marginBottom: 6 }}>
                    {weekDays.map(d => <div key={d} className="cal-weekday">{d}</div>)}
                  </div>
                  <div className="cal-grid-inner">
                    {days.map((day, i) => {
                      const dayTasks    = getTasksForDay(day);
                      const dayHolidays = getHolidaysForDay(day);
                      const inMonth     = isSameMonth(day, currentMonth);
                      const today       = isToday(day);
                      const past        = isDayPast(day);
                      const isSelected  = panelDay ? isSameDay(day, panelDay) : false;
                      const isHoliday   = dayHolidays.length > 0 && inMonth;
                      const clickable   = inMonth && (isCEO || dayTasks.length > 0 || dayHolidays.length > 0);

                      return (
                        <div key={i}
                          className={[
                            'cal-day',
                            !inMonth ? 'other-month' : '',
                            isSelected ? 'selected' : '',
                            clickable ? 'clickable' : '',
                            isHoliday ? 'is-holiday' : '',
                          ].filter(Boolean).join(' ')}
                          style={{ opacity: past && inMonth ? 0.65 : undefined }}
                          role={clickable ? 'button' : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          aria-label={clickable ? `${format(day, "d 'de' MMMM", { locale: es })}, ${dayTasks.length} tareas${isHoliday ? ', feriado' : ''}` : undefined}
                          aria-pressed={clickable ? isSelected : undefined}
                          onKeyDown={e => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleDayClick(day); } }}
                          onClick={() => clickable && handleDayClick(day)}
                        >
                          <div className={['cal-day-num', today ? 'today' : '', past ? 'past' : ''].filter(Boolean).join(' ')}>
                            {format(day, 'd')}
                          </div>

                          {/* Holiday indicator */}
                          {isHoliday && (
                            <div style={{ marginBottom: 2 }}>
                              <span className="cal-holiday-dot" />
                              <span className="cal-holiday-label">{dayHolidays[0].localName}</span>
                            </div>
                          )}

                          {/* Google Calendar: hasta dos, y el resto contados.
                              Una celda de calendario no da para más sin que
                              las tareas dejen de verse. */}
                          {(() => {
                            const evs = eventosDelDia(day);
                            if (!evs.length) return null;
                            return (
                              <>
                                {evs.slice(0, 2).map(e => (
                                  <span key={e.id}
                                        className={`cal-gcal-chip${e.respuesta === 'declined' ? ' rechazado' : ''}`}
                                        title={`${horaEvento(e)} · ${e.titulo}`}>
                                    {e.todoElDia ? '' : `${horaEvento(e)} `}{e.titulo}
                                  </span>
                                ))}
                                {evs.length > 2 && (
                                  <span className="cal-gcal-chip">+{evs.length - 2} más</span>
                                )}
                              </>
                            );
                          })()}

                          {/* Task chips */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {dayTasks.slice(0, isHoliday ? 1 : 2).map(task => {
                              const pri = PRI[task.priority as keyof typeof PRI] ?? PRI.medium;
                              return (
                                <div key={task.id} className="cal-task-chip" title={task.title}
                                  style={{
                                    background: task.status === 'completed' ? 'rgba(74,222,128,0.12)' : pri.bg,
                                    color: panelInk(task.status === 'completed' ? '#4ade80' : pri.color),
                                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                                  }}>
                                  {task.title}
                                </div>
                              );
                            })}
                            {dayTasks.length > (isHoliday ? 1 : 2) && (
                              <div style={{ fontSize: 'max(11px,0.79rem)', fontWeight: 400, padding: '0 3px', color: 'var(--cal-text-muted)' }}>
                                +{dayTasks.length - (isHoliday ? 1 : 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Desktop side panel */}
              {panelDay && (
                <div className="cal-desktop-panel">
                  <DayPanel
                    day={panelDay} tasks={panelTasks} users={users} holidays={panelHolidays}
                    eventosGoogle={panelDay ? eventosDelDia(panelDay) : []}
                    onTaskClick={handleTaskClick}
                    onClose={() => { setPanelDay(null); setMobilePanelOpen(false); }}
                    onCrearTarea={isCEO ? () => crearTareaEn(panelDay) : undefined}
                  />
                </div>
              )}
            </div>

            {/* Mobile panel (below grid) */}
            {panelDay && mobilePanelOpen && (
              <div className="cal-mobile-panel">
                <DayPanel
                  day={panelDay} tasks={panelTasks} users={users} holidays={panelHolidays}
                    eventosGoogle={panelDay ? eventosDelDia(panelDay) : []}
                  onTaskClick={handleTaskClick}
                  onClose={() => { setPanelDay(null); setMobilePanelOpen(false); }}
                  onCrearTarea={isCEO ? () => crearTareaEn(panelDay) : undefined}
                />
              </div>
            )}
          </>
        )}

        {/* ── Month task list ── */}
        <div data-moon-reveal="card" className="cal-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--cal-border)' }}>
            <span style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-text-primary)' }}>
              {agendaFocus === 'overdue' ? 'Tareas vencidas · todos los meses' : agendaFocus === 'upcoming' ? 'Entregas de los próximos 7 días' : isSearching ? 'Resultados de búsqueda · todos los meses' : agendaFocus === 'mine' ? 'Mi agenda del mes' : 'Agenda del mes'}
            </span>
            <span style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-text-muted)' }}>
              {monthTasks.length} tarea{monthTasks.length !== 1 ? 's' : ''}
              {activeFilters > 0 && <span style={{ fontSize: 'max(12px,0.86rem)', color: 'var(--cal-accent)', marginLeft: 5 }}>· Filtradas</span>}
            </span>
          </div>
          <div style={{ padding: 10 }}>
            {monthTasks.length === 0 ? (
              <div className="cal-empty" style={{ padding: '36px 0' }}>
                <CalendarIcon style={{ width: 26, height: 26, color: 'var(--cal-text-quaternary)' }} strokeWidth={1} />
                <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-text-muted)' }}>
                  {isSearching ? `Sin resultados para "${searchQuery}"` : activeFilters > 0 ? 'Sin resultados para los filtros activos' : isCEO ? 'No hay tareas programadas' : 'No tienes tareas asignadas este mes'}
                </p>
                {activeFilters > 0 && (
                  <button className="cal-accent-btn" onClick={resetFilters} style={{ marginTop: 4 }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="cal-list-rows" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {monthTasks.map(task => {
                  const pri         = PRI[task.priority as keyof typeof PRI] ?? PRI.medium;
                  const sta         = STA[task.status as keyof typeof STA] ?? STA.pending;
                  const assignLabel = getAssignLabel(task);
                  const past        = isDayPast(new Date(task.date));
                  const isOverdue   = past && task.status !== 'completed';
                  const taskHoliday = getHolidaysForDay(new Date(task.date));

                  return (
                    <div data-moon-reveal="row" key={task.id} className="cal-list-row" style={{ opacity: past && !isOverdue ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        {isCEO && !past ? (
                          <button className="cal-status-btn" aria-label={`${task.status === 'completed' ? 'Marcar pendiente' : 'Completar tarea'}: ${task.title}`} onClick={e => handleStatusToggle(task, e)}
                            style={{ color: panelInk(task.status === 'completed' ? '#4ade80' : 'var(--cal-text-quaternary)') }}>
                            <CheckCircle2 style={{ width: 18, height: 18 }} strokeWidth={1.5} />
                          </button>
                        ) : (
                          <CheckCircle2 style={{ width: 18, height: 18, flexShrink: 0 }} strokeWidth={1.5}
                            color={task.status === 'completed' ? '#4ade80' : 'var(--cal-text-quaternary)'} />
                        )}
                        <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: pri.dot }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: task.status === 'completed' ? 'line-through' : 'none', opacity: task.status === 'completed' ? 0.5 : 1 }}>
                              {task.title}
                            </p>
                            {isOverdue && <span className="cal-badge-overdue">Vencida</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: 'var(--cal-text-muted)' }}>
                              {format(new Date(task.date), isSearching || agendaFocus === 'overdue' || agendaFocus === 'upcoming' ? "d 'de' MMMM yyyy" : "d 'de' MMMM", { locale: es })}
                            </p>
                            {taskHoliday.length > 0 && (
                              <span style={{ fontSize: 'max(12px,0.86rem)', color: 'var(--cal-holiday-color)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                · 🎉 {taskHoliday[0].localName}
                              </span>
                            )}
                            {assignLabel && (
                              <span className="cal-list-assignee" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ color: 'var(--cal-border)', fontSize: 'max(12px,0.86rem)' }}>·</span>
                                <p style={{ fontSize: 'max(13px,0.93rem)', fontWeight: 400, color: 'var(--cal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{assignLabel}</p>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 'max(12px,0.86rem)', fontWeight: 400, padding: '3px 7px', borderRadius: 999, color: panelInk(sta.color), background: sta.bg, whiteSpace: 'nowrap' }}>
                          {sta.label}
                        </span>
                        <button className="cal-view-btn" onClick={e => handleTaskClick(task, e)}>Ver →</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Task detail dialog ── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="cal-dialog-box" style={{ maxWidth: 480 }}>
            <DialogHeader>
              <DialogTitle style={{ fontWeight: 400, fontSize: 14, color: 'var(--cal-dialog-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarIcon style={{ width: 15, height: 15, color: 'var(--cal-text-muted)' }} strokeWidth={1.5} />
                Detalle de tarea
              </DialogTitle>
            </DialogHeader>

            {selectedTask ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <ReadOnlyTaskView task={selectedTask} users={users} isCEO={isCEO} />

                {userCanInteract && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--cal-border)' }}>
                    <button type="button" className="cal-report-btn"
                      onClick={() => { setDialogOpen(false); setReportTask(selectedTask); }}>
                      <CheckCircle2 style={{ width: 15, height: 15, color: panelInk('#4ade80') }} strokeWidth={1.5} />
                      Reportar estado
                    </button>
                  </div>
                )}

                {isCEO && (
                  // El CEO no tenía desde aquí cómo editar la tarea: se gestiona en su panel.
                  <button type="button" className="cal-report-btn"
                    onClick={() => { setDialogOpen(false); navigate('/dashboard/ceo-panel'); }}>
                    <ShieldCheck style={{ width: 15, height: 15, color: 'var(--cal-accent)' }} strokeWidth={1.5} />
                    Gestionar en el Panel CEO
                  </button>
                )}

                {!userCanInteract && !isCEO && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--cal-border)' }}>
                    <div className="cal-no-interact">
                      <ShieldCheck style={{ width: 13, height: 13, flexShrink: 0, color: 'var(--cal-text-muted)' }} strokeWidth={1.5} />
                      <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, color: 'var(--cal-text-muted)' }}>Esta tarea no está asignada a ti.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 'max(14px,1.00rem)', fontWeight: 400, textAlign: 'center', padding: '16px 0', color: 'var(--cal-text-muted)' }}>No se encontró la tarea.</p>
            )}
          </DialogContent>
        </Dialog>

        {reportTask && userProfile && (
          <TaskReportDialog
            open={!!reportTask}
            onClose={() => setReportTask(null)}
            task={reportTask}
            userProfile={userProfile}
          />
        )}
      </div>
    </section>
  );
};

export default CalendarPage;
