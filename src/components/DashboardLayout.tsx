/**
 * DashboardLayout — ACTUALIZADO
 * ─────────────────────────────────────────────────────────────────
 * Se ha reemplazado el bloque useEffect de estilos globales para
 * soportar Tema Sistema, Fuentes Personalizadas y variables CSS.
 * ─────────────────────────────────────────────────────────────────
 */

import { unlockAudio } from '@/lib/notificationSound';
import React, { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { logoutUser } from '@/lib/firebase';
import { useNotifications } from '@/hooks/useNotifications';
import { useTabSync } from '@/hooks/useTabSync';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import { useIsMobile } from '@/hooks/use-mobile';
import { TabSyncModal, AutoLogoutModal, SESSION_MODAL_STYLES } from '@/components/SessionModals';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  LayoutDashboard, Calendar, Megaphone, Bot, Bell,
  Settings, LogOut, Moon, Crown, ChevronLeft, ChevronRight,
  AlertCircle, X, Mail, MessagesSquare, GitBranch, MessageSquare,
  Calculator, Globe, Menu, Code2, Palette, FileText, UserCog, Users, ShieldCheck,
  CheckCheck, Inbox, Trash2, BellOff, FolderKanban, ListTodo
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { NotifCategory } from '@/hooks/useNotifications';
import { atajoDe } from '@/lib/ajustes/atajos';
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

// ── Estilos globales ──────────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  /* ─── CSS VARIABLES ─── */
  :root {
    --accent: #6366f1;
    --base-font-size: 14px;
    --bg-main: #0a0a0a;
    --bg-sidebar: #080808;
    --bg-header: rgba(0,0,0,0.45);
    --border-main: rgba(255,255,255,0.06);
    --border-header: rgba(255,255,255,0.05);
    --text-primary: rgba(255,255,255,0.85);
    --text-muted: rgba(255,255,255,0.46);
    --nav-active-bg: rgba(255,255,255,0.07);
    --nav-hover-bg: rgba(255,255,255,0.04);
    --sidebar-card-bg: rgba(255,255,255,0.03);
    --sidebar-card-border: rgba(255,255,255,0.06);
    --btn-bg: rgba(255,255,255,0.03);
    --btn-border: rgba(255,255,255,0.06);
    --btn-color: rgba(255,255,255,0.46);
    --btn-hover-bg: rgba(255,255,255,0.07);
    --btn-hover-border: rgba(255,255,255,0.12);
    --btn-hover-color: rgba(255,255,255,0.75);
    --icon-color: rgba(255,255,255,0.46);
    --icon-active: rgba(255,255,255,0.9);
    --icon-bg-active: rgba(255,255,255,0.07);
    --icon-border-active: rgba(255,255,255,0.1);
    --icon-bg-hover: rgba(255,255,255,0.04);
    --icon-border-hover: rgba(255,255,255,0.06);
    --sidebar-logo-bg: rgba(255,255,255,0.04);
    --sidebar-logo-border: rgba(255,255,255,0.09);
    --sidebar-logo-color: rgba(255,255,255,0.65);
    --sidebar-divider: rgba(255,255,255,0.06);
    --sidebar-logo-border-bottom: rgba(255,255,255,0.05);
    --sidebar-footer-border: rgba(255,255,255,0.05);
    --header-icon-bg: rgba(255,255,255,0.04);
    --header-icon-border: rgba(255,255,255,0.07);
    --header-icon-color: rgba(255,255,255,0.4);
    --header-icon-bg-hover: rgba(255,255,255,0.08);
    --header-icon-border-hover: rgba(255,255,255,0.12);
    --header-separator: rgba(255,255,255,0.06);
    --badge-bg: #fff;
    --badge-color: #000;
    --notif-bg: rgba(8,8,8,0.98);
    --notif-border: rgba(255,255,255,0.08);
    --notif-unread-bg: rgba(255,255,255,0.025);
    --notif-footer-border: rgba(255,255,255,0.04);
    --mobile-nav-bg: rgba(8,8,8,0.98);
    --mobile-nav-border: rgba(255,255,255,0.06);
    --surface-hover: rgba(255,255,255,0.04);
    --surface-subtle: rgba(255,255,255,0.03);
    --surface-card: rgba(255,255,255,0.02);
    --overlay-bg: rgba(255,255,255,0.04);
    --overlay-border: rgba(255,255,255,0.08);
    --content-primary: rgba(255,255,255,0.85);
    --content-secondary: rgba(255,255,255,0.55);
    --content-tertiary: rgba(255,255,255,0.45);
    --content-quaternary: rgba(255,255,255,0.42);
    --active-panel-bg: rgba(255,255,255,0.1);
    --active-panel-border: rgba(255,255,255,0.15);
    --avatar-ring-hover: rgba(255,255,255,0.2);
    --scrollbar-thumb: rgba(255,255,255,0.05);
    --logout-bg: rgba(8,8,8,0.98);
    --logout-border: rgba(255,255,255,0.08);
    --logout-shadow: rgba(0,0,0,0.9);
    --logout-icon-bg: rgba(255,255,255,0.04);
    --logout-icon-border: rgba(255,255,255,0.08);
    --logout-btn-bg: rgba(255,255,255,0.04);
    --logout-btn-border: rgba(255,255,255,0.07);
    --logout-text-primary: rgba(255,255,255,0.85);
    --logout-text-muted: rgba(255,255,255,0.3);
    --logout-text-name: rgba(255,255,255,0.6);
    --logout-dot: rgba(255,255,255,0.4);
    --notif-item-border: rgba(255,255,255,0.03);
    --notif-item-unread-bg: rgba(255,255,255,0.025);
    --notif-item-hover-unread: rgba(255,255,255,0.05);
    --notif-item-hover: rgba(255,255,255,0.02);
    --notif-icon-bg: rgba(255,255,255,0.04);
    --notif-empty-bg: rgba(255,255,255,0.03);
    --notif-empty-border: rgba(255,255,255,0.06);
    --notif-badge-bg: rgba(255,255,255,0.1);
    --notif-badge-border: rgba(255,255,255,0.12);
    --notif-tab-active-bg: rgba(255,255,255,0.08);
    --notif-tab-active-border: rgba(255,255,255,0.1);
    --notif-close-bg: rgba(255,255,255,0.04);
    --notif-close-border: rgba(255,255,255,0.07);
    --notif-readall-bg: rgba(255,255,255,0.04);
    --notif-readall-border: rgba(255,255,255,0.07);
    --notif-count-bg: rgba(255,255,255,0.1);
    --mobile-nav-active-bg: rgba(255,255,255,0.08);
    --mobile-nav-icon-active: rgba(255,255,255,0.9);
    --mobile-nav-icon: rgba(255,255,255,0.46);
    --mobile-nav-label-active: rgba(255,255,255,0.75);
    --mobile-nav-label: rgba(255,255,255,0.28);
  }

  html.light {
    --bg-main: #f1f1f3;
    --bg-sidebar: #ffffff;
    --bg-header: rgba(255,255,255,0.92);
    --border-main: rgba(0,0,0,0.08);
    --border-header: rgba(0,0,0,0.07);
    --text-primary: rgba(0,0,0,0.85);
    --text-muted: rgba(0,0,0,0.4);
    --nav-active-bg: rgba(0,0,0,0.06);
    --nav-hover-bg: rgba(0,0,0,0.03);
    --sidebar-card-bg: rgba(0,0,0,0.03);
    --sidebar-card-border: rgba(0,0,0,0.07);
    --btn-bg: rgba(0,0,0,0.04);
    --btn-border: rgba(0,0,0,0.08);
    --btn-color: rgba(0,0,0,0.56);
    --btn-hover-bg: rgba(0,0,0,0.07);
    --btn-hover-border: rgba(0,0,0,0.14);
    --btn-hover-color: rgba(0,0,0,0.75);
    --icon-color: rgba(0,0,0,0.55);
    --icon-active: rgba(0,0,0,0.85);
    --icon-bg-active: rgba(0,0,0,0.06);
    --icon-border-active: rgba(0,0,0,0.1);
    --icon-bg-hover: rgba(0,0,0,0.04);
    --icon-border-hover: rgba(0,0,0,0.07);
    --sidebar-logo-bg: rgba(0,0,0,0.05);
    --sidebar-logo-border: rgba(0,0,0,0.09);
    --sidebar-logo-color: rgba(0,0,0,0.5);
    --sidebar-divider: rgba(0,0,0,0.06);
    --sidebar-logo-border-bottom: rgba(0,0,0,0.05);
    --sidebar-footer-border: rgba(0,0,0,0.05);
    --header-icon-bg: rgba(0,0,0,0.04);
    --header-icon-border: rgba(0,0,0,0.07);
    --header-icon-color: rgba(0,0,0,0.4);
    --header-icon-bg-hover: rgba(0,0,0,0.08);
    --header-icon-border-hover: rgba(0,0,0,0.12);
    --header-separator: rgba(0,0,0,0.07);
    --badge-bg: #000;
    --badge-color: #fff;
    --notif-bg: rgba(255,255,255,0.98);
    --notif-border: rgba(0,0,0,0.1);
    --notif-unread-bg: rgba(0,0,0,0.02);
    --notif-footer-border: rgba(0,0,0,0.05);
    --mobile-nav-bg: rgba(255,255,255,0.98);
    --mobile-nav-border: rgba(0,0,0,0.07);
    --surface-hover: rgba(0,0,0,0.03);
    --surface-subtle: rgba(0,0,0,0.03);
    --surface-card: rgba(0,0,0,0.02);
    --overlay-bg: rgba(0,0,0,0.04);
    --overlay-border: rgba(0,0,0,0.08);
    --content-primary: rgba(0,0,0,0.85);
    --content-secondary: rgba(0,0,0,0.55);
    --content-tertiary: rgba(0,0,0,0.5);
    --content-quaternary: rgba(0,0,0,0.46);
    --active-panel-bg: rgba(0,0,0,0.08);
    --active-panel-border: rgba(0,0,0,0.12);
    --avatar-ring-hover: rgba(0,0,0,0.15);
    --scrollbar-thumb: rgba(0,0,0,0.12);
    --logout-bg: rgba(248,248,250,0.99);
    --logout-border: rgba(0,0,0,0.1);
    --logout-shadow: rgba(0,0,0,0.15);
    --logout-icon-bg: rgba(0,0,0,0.05);
    --logout-icon-border: rgba(0,0,0,0.08);
    --logout-btn-bg: rgba(0,0,0,0.04);
    --logout-btn-border: rgba(0,0,0,0.08);
    --logout-text-primary: rgba(0,0,0,0.8);
    --logout-text-muted: rgba(0,0,0,0.45);
    --logout-text-name: rgba(0,0,0,0.6);
    --logout-dot: rgba(0,0,0,0.3);
    --notif-item-border: rgba(0,0,0,0.04);
    --notif-item-unread-bg: rgba(0,0,0,0.025);
    --notif-item-hover-unread: rgba(0,0,0,0.05);
    --notif-item-hover: rgba(0,0,0,0.02);
    --notif-icon-bg: rgba(0,0,0,0.04);
    --notif-empty-bg: rgba(0,0,0,0.03);
    --notif-empty-border: rgba(0,0,0,0.07);
    --notif-badge-bg: rgba(0,0,0,0.08);
    --notif-badge-border: rgba(0,0,0,0.1);
    --notif-tab-active-bg: rgba(0,0,0,0.07);
    --notif-tab-active-border: rgba(0,0,0,0.09);
    --notif-close-bg: rgba(0,0,0,0.04);
    --notif-close-border: rgba(0,0,0,0.07);
    --notif-readall-bg: rgba(0,0,0,0.04);
    --notif-readall-border: rgba(0,0,0,0.07);
    --notif-count-bg: rgba(0,0,0,0.06);
    --mobile-nav-active-bg: rgba(0,0,0,0.07);
    --mobile-nav-icon-active: rgba(0,0,0,0.85);
    --mobile-nav-icon: rgba(0,0,0,0.55);
    --mobile-nav-label-active: rgba(0,0,0,0.7);
    --mobile-nav-label: rgba(0,0,0,0.3);
  }

  /* ─── TRANSITIONS ─── */
  .sidebar-transition {
    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sidebar-content-transition {
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .sidebar-icon-transition {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* ─── KEYFRAMES ─── */
  @keyframes _loOverlayIn { from{opacity:0} to{opacity:1} }
  @keyframes _loCardIn {
    from { opacity:0; transform:translateY(14px) scale(0.97); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes _loCardOut {
    from { opacity:1; transform:scale(1); filter:blur(0px); }
    to   { opacity:0; transform:scale(0.94); filter:blur(3px); }
  }
  @keyframes _loBar { from{width:0%} to{width:100%} }
  @keyframes _loPageOut {
    0%   { opacity:1; transform:scale(1); filter:blur(0px); }
    100% { opacity:0; transform:scale(1.012); filter:blur(8px); }
  }
  @keyframes _loDot {
    0%,80%,100% { opacity:0.15; transform:scale(0.75); }
    40% { opacity:1; transform:scale(1); }
  }
  @keyframes notifPanelIn {
    from { opacity:0; transform:translateY(-6px) scale(0.98); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes notifDrawerIn {
    from { opacity:0; transform:translateX(100%); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes notifDrawerOut {
    from { opacity:1; transform:translateX(0); }
    to   { opacity:0; transform:translateX(100%); }
  }
  @keyframes notifItemIn {
    from { opacity:0; transform:translateX(6px); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes sidebarFadeIn {
    from { opacity:0; transform:translateX(-4px); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes bellRing {
    0%,100% { transform: rotate(0deg); }
    15%     { transform: rotate(14deg); }
    30%     { transform: rotate(-12deg); }
    45%     { transform: rotate(10deg); }
    60%     { transform: rotate(-8deg); }
    75%     { transform: rotate(4deg); }
  }
  @keyframes dotPulse {
    0%,100% { opacity:1; transform:scale(1); }
    50% { opacity:0.5; transform:scale(0.8); }
  }
  @keyframes navItemSlide {
    from { opacity:0; transform:translateX(-8px); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes badgePop {
    0%   { transform:scale(0.5); opacity:0; }
    70%  { transform:scale(1.15); opacity:1; }
    100% { transform:scale(1); opacity:1; }
  }
  @keyframes headerSlideDown {
    from { opacity:0; transform:translateY(-8px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes onlinePulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.15); }
    50%     { box-shadow: 0 0 0 4px rgba(255,255,255,0); }
  }
  @keyframes shimmer {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes uploadBar {
    0%   { width: 0%; margin-left: 0; }
    50%  { width: 70%; margin-left: 15%; }
    100% { width: 0%; margin-left: 100%; }
  }
  @keyframes dropdownIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes optionIn {
    from { opacity: 0; transform: translateX(-4px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ─── CLASES DE ANIMACIÓN ─── */
  .__lo_overlay  { animation:_loOverlayIn 0.22s ease forwards; }
  .__lo_card_in  { animation:_loCardIn 0.3s cubic-bezier(0.22,1,0.36,1) forwards; }
  .__lo_card_out { animation:_loCardOut 0.2s ease-in forwards; }
  .__lo_bar      { animation:_loBar 1.7s cubic-bezier(0.4,0,0.15,1) forwards; }
  .__lo_page     { animation:_loPageOut 0.5s ease forwards; }
  .__lo_dot      { display:inline-block; }
  .__lo_dot:nth-child(1){ animation:_loDot 1.1s ease-in-out 0s infinite; }
  .__lo_dot:nth-child(2){ animation:_loDot 1.1s ease-in-out 0.18s infinite; }
  .__lo_dot:nth-child(3){ animation:_loDot 1.1s ease-in-out 0.36s infinite; }

  .notif-panel-anim { animation: notifPanelIn 0.22s cubic-bezier(0.22,1,0.36,1) forwards; }
  .notif-item-anim  { animation: notifItemIn 0.22s cubic-bezier(0.22,1,0.36,1) both; }

  /* ─── NOTIF DRAWER ─── */
  .notif-drawer-overlay {
    position: fixed; inset: 0; z-index: 9989;
    background: rgba(0,0,0,0.35);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: _loOverlayIn 0.22s ease forwards;
  }
  .notif-drawer {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 9990;
    width: 380px; max-width: 100vw;
    display: flex; flex-direction: column;
    background: var(--notif-bg);
    border-left: 1px solid var(--notif-border);
    box-shadow: -24px 0 60px rgba(0,0,0,0.25);
    animation: notifDrawerIn 0.3s cubic-bezier(0.22,1,0.36,1) forwards;
  }
  .notif-drawer.closing {
    animation: notifDrawerOut 0.22s cubic-bezier(0.4,0,1,1) forwards;
  }
  @media (max-width: 480px) {
    .notif-drawer { width: 100vw; border-left: none; border-top: 1px solid var(--notif-border); top: 56px; border-radius: 16px 16px 0 0; }
  }
  .header-anim { animation: headerSlideDown 0.4s cubic-bezier(0.22,1,0.36,1) both; }

  /* ─── TEMA DINÁMICO ─── */
  .nav-item-active {
    background: var(--nav-active-bg);
    color: var(--text-primary);
  }
  .nav-item-active-bar {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: var(--accent-user, #6366f1);
    transition: height 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease;
  }
  .nav-item-hover:hover {
    background: var(--nav-hover-bg);
  }
  .nav-section-label {
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 0 10px;
    margin: 14px 0 5px;
    user-select: none;
    transition: opacity 0.2s ease;
  }
  .sidebar-divider {
    height: 1px;
    margin: 6px 10px;
    background: var(--border-main);
  }
  .sidebar-badge {
    background: var(--accent-user, #6366f1);
    color: #000;
    font-size: 9px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 20px;
    line-height: 1;
    animation: badgePop 0.3s cubic-bezier(0.22,1,0.36,1);
  }
  .bell-has-unread { animation: bellRing 1.8s ease-in-out 1s 1; }
  .unread-dot      { animation: dotPulse 2s ease-in-out infinite; }
  .online-dot-pulse { animation: onlinePulse 2.5s ease-in-out infinite; }

  .user-card-sidebar {
    background: var(--sidebar-card-bg);
    border: 1px solid var(--sidebar-card-border);
    border-radius: 10px;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .user-card-sidebar:hover {
    background: var(--nav-hover-bg);
    border-color: var(--border-main);
  }
  .footer-btn-mono {
    background: var(--btn-bg);
    border: 1px solid var(--btn-border);
    border-radius: 9px;
    color: var(--btn-color);
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
    cursor: pointer;
  }
  .footer-btn-mono:hover {
    background: var(--btn-hover-bg);
    border-color: var(--btn-hover-border);
    color: var(--btn-hover-color);
    transform: scale(1.03);
  }
  .footer-btn-mono:active { transform: scale(0.97); }

  .nav-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--border-main) transparent;
  }
  .nav-scroll::-webkit-scrollbar { width: 3px; }
  .nav-scroll::-webkit-scrollbar-track { background: transparent; }
  .nav-scroll::-webkit-scrollbar-thumb { background: var(--border-main); border-radius: 4px; }

  .main-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--border-main) transparent;
  }
  .main-scroll::-webkit-scrollbar { width: 4px; }
  .main-scroll::-webkit-scrollbar-track { background: transparent; }
  .main-scroll::-webkit-scrollbar-thumb { background: var(--border-main); border-radius: 4px; }

  .notif-scroll::-webkit-scrollbar { width: 3px; }
  .notif-scroll::-webkit-scrollbar-track { background: transparent; }
  .notif-scroll::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }

  .nav-tooltip {
    opacity: 0;
    pointer-events: none;
    transform: translateX(-4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
  }
  .group:hover .nav-tooltip {
    opacity: 1;
    transform: translateX(0);
  }
  .header-icon-btn {
    width: 34px; height: 34px;
    border-radius: 10px;
    background: var(--header-icon-bg);
    border: 1px solid var(--header-icon-border);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    position: relative;
    transition: background 0.18s ease, border-color 0.18s ease, transform 0.15s ease;
  }
  .header-icon-btn:hover {
    background: var(--header-icon-bg-hover);
    border-color: var(--header-icon-border-hover);
    transform: scale(1.05);
  }
  .header-icon-btn:active { transform: scale(0.96); }
  .header-icon-btn.active-panel {
    background: var(--active-panel-bg);
    border-color: var(--active-panel-border);
  }
  .avatar-ring {
    transition: box-shadow 0.2s ease;
  }
  .avatar-ring:hover {
    box-shadow: 0 0 0 2px var(--avatar-ring-hover);
  }
  .bottom-nav-safe { }
  .nav-item-mounted {
    animation: navItemSlide 0.28s cubic-bezier(0.22,1,0.36,1) both;
  }

`;

// ── Clock ─────────────────────────────────────────────────────────────────────
const Clock: React.FC<{ isMobile: boolean }> = memo(({ isMobile }) => {
  const [time, setTime] = useState(new Date());
    // ─── INJECT GLOBAL STYLES ───────────────────────────────────────────────────
  useEffect(() => {
    const styleId = 'dashboard-layout-styles';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = GLOBAL_STYLES + (SESSION_MODAL_STYLES || '');
    // No cleanup - styles persist for the session
  }, []);

useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="header-anim">
      <h1 className="font-light text-xs tracking-widest uppercase truncate" style={{ color: 'var(--text-primary)' }}>
        {/* En la zona horaria y el idioma de Configuración → Accesibilidad. */}
        {fechaLarga(time, isMobile ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </h1>
      <p className="text-[10px] font-light tracking-widest" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {hora(time, true)}
      </p>
    </div>
  );
});
Clock.displayName = 'Clock';

// ── LogoutModal ───────────────────────────────────────────────────────────────
interface LogoutModalProps {
  phase: 'confirming' | 'leaving';
  onCancel: () => void;
  onConfirm: () => void;
  cardClass: string;
  userName: string;
}
const LogoutModal: React.FC<LogoutModalProps> = ({ phase, onCancel, onConfirm, cardClass, userName }) =>
  createPortal(
    <div
      className="__lo_overlay fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(20px)', zIndex: 99999 }}
    >
      <div
        className={`${cardClass} relative w-full max-w-[300px]`}
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
              <p style={{ color: 'var(--logout-text-primary)', fontSize: '14px', fontWeight: 300, marginBottom: '5px' }}>¿Cerrar sesión?</p>
              <p style={{ color: 'var(--logout-text-muted)', fontSize: '11px', fontWeight: 300, marginBottom: '24px', lineHeight: 1.6 }}>
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
              <p style={{ color: 'var(--content-tertiary)', fontSize: '10px', fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px' }}>Cerrando sesión</p>
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

// ── NotifPanel ────────────────────────────────────────────────────────────────
interface NotifPanelProps {
  notifications: any[];
  unreadCount: number;
  readIds: Set<string>;
  markOneRead: (id: string) => void;
  markAllRead: () => void;
  onClose: () => void;
  onNavigate: (path: string) => void;
  uid?: string;
}

// Clave de localStorage por usuario
const getDismissKey = (uid?: string) => `notif_dismissed_${uid ?? 'anon'}`;

const NotifPanel: React.FC<NotifPanelProps> = memo(({
  notifications,readIds,
  markOneRead, markAllRead, onClose, onNavigate, uid,
}) => {
  const [activeCategory, setActiveCategory] = useState<NotifCategory | 'all'>('all');
  const [closing, setClosing] = useState(false);

  // ── IDs descartados (persistentes por usuario en localStorage) ──
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(getDismissKey(uid));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  const persistDismiss = useCallback((newSet: Set<string>) => {
    setDismissedIds(newSet);
    try {
      // Mantener solo los IDs que existen actualmente (limpieza automática)
      const existing = notifications.map((n: any) => n.id);
      const pruned = [...newSet].filter(id => existing.includes(id));
      localStorage.setItem(getDismissKey(uid), JSON.stringify(pruned));
    } catch { /* quota exceeded — silent fail */ }
  }, [uid, notifications]);

  const dismissOne = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(dismissedIds);
    next.add(id);
    persistDismiss(next);
    markOneRead(id);
  }, [dismissedIds, persistDismiss, markOneRead]);

  const dismissAllRead = useCallback(() => {
    const readNotifs = notifications.filter((n: any) => readIds.has(n.id));
    const next = new Set(dismissedIds);
    readNotifs.forEach((n: any) => next.add(n.id));
    persistDismiss(next);
  }, [notifications, readIds, dismissedIds, persistDismiss]);

  const dismissAll = useCallback(() => {
    const next = new Set(dismissedIds);
    notifications.forEach((n: any) => next.add(n.id));
    persistDismiss(next);
    markAllRead();
  }, [notifications, dismissedIds, persistDismiss, markAllRead]);

  // Sincronizar si cambia el uid (cambio de usuario)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getDismissKey(uid));
      setDismissedIds(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch { setDismissedIds(new Set()); }
  }, [uid]);

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

  // Notificaciones visibles (no descartadas)
  const visible = notifications.filter((n: any) => !dismissedIds.has(n.id));
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
      <div className={`notif-drawer${closing ? ' closing' : ''}`}>

        {/* ── Header ── */}
        <div style={{ padding: '20px 20px 14px', flexShrink: 0, borderBottom: '1px solid var(--notif-footer-border)' }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
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
                    <span style={{ fontSize: '9px', fontWeight: 600, background: 'var(--accent-user, #6366f1)', color: '#fff', padding: '2px 7px', borderRadius: '20px', animation: 'badgePop 0.3s cubic-bezier(0.22,1,0.36,1)', letterSpacing: '0.03em' }}>
                      {visibleUnread} nuevas
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '10px', fontWeight: 300, color: 'var(--content-quaternary)', marginTop: '1px' }}>
                  {visible.length} notificaciones
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
                  Leído
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
                  Limpiar
                </button>
              )}
              {visible.length > 0 && (
                <button onClick={dismissAll}
                  title="Eliminar todas"
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
              style={{ padding: '5px 11px', borderRadius: '8px', fontSize: '10px', fontWeight: 300, cursor: 'pointer', transition: 'all 0.15s ease', background: activeCategory === 'all' ? 'var(--notif-tab-active-bg)' : 'transparent', border: activeCategory === 'all' ? '1px solid var(--notif-tab-active-border)' : '1px solid transparent', color: activeCategory === 'all' ? 'var(--content-primary)' : 'var(--content-tertiary)' }}>
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
            const Icon = CATEGORY_ICON[n.category as NotifCategory];
            const color = CATEGORY_COLOR[n.category as NotifCategory];
            return (
              <div key={n.id} className="notif-item-anim"
                onClick={() => { markOneRead(n.id); if (n.linkTo) { onNavigate(n.linkTo); handleClose(); } }}
                style={{ animationDelay: `${idx * 0.03}s`, padding: '13px 16px 13px 20px', cursor: 'pointer', borderBottom: '1px solid var(--notif-item-border)', background: isUnread ? 'var(--notif-item-unread-bg)' : 'transparent', transition: 'background 0.15s ease', display: 'flex', gap: '12px', alignItems: 'flex-start', position: 'relative' }}
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
            {visible.length} de {notifications.length}
          </span>
        </div>
      </div>
    </>,
    document.body
  );
});
NotifPanel.displayName = 'NotifPanel';

// ── NavItem type ──────────────────────────────────────────────────────────────
interface NavItem { path: string; label: string; icon: React.FC<any>; show: boolean; badge?: number; }

// ── SidebarNavLink ────────────────────────────────────────────────────────────
const SidebarNavLink: React.FC<{ item: NavItem; collapsed: boolean; delay?: number }> = memo(({ item, collapsed, delay = 0 }) => (
  <NavLink
    to={item.path}
    end={item.path === '/dashboard'}
    className={({ isActive }) =>
      `flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all duration-200 relative group nav-item-hover nav-item-mounted
       ${isActive ? 'nav-item-active' : ''}`
    }
    style={{ animationDelay: `${delay}ms` }}
  >
    {({ isActive }) => (
      <>
        {/* barra lateral activa */}
        <span
          className="nav-item-active-bar"
          style={{ height: isActive ? '60%' : '0%', opacity: isActive ? 1 : 0 }}
        />

        {/* ícono */}
        <div
          className={`flex items-center justify-center rounded-lg flex-shrink-0 sidebar-icon-transition
          ${collapsed ? 'w-8 h-8' : 'w-7 h-7'}`}
          style={{
            background: isActive ? 'var(--icon-bg-active)' : 'transparent',
            border: isActive ? '1px solid var(--icon-border-active)' : '1px solid transparent',
          }}
        >
          <item.icon
            className="sidebar-icon-transition"
            style={{
              width: collapsed ? '15px' : '13px',
              height: collapsed ? '15px' : '13px',
              color: isActive ? 'var(--icon-active)' : 'var(--icon-color)',
              transition: 'color 0.2s ease, width 0.25s ease, height 0.25s ease',
            }}
            strokeWidth={isActive ? 1.75 : 1.5}
          />
        </div>

        {/* texto — se oculta al colapsar */}
        {!collapsed && (
          <span
            className="text-xs font-light whitespace-nowrap overflow-hidden flex-1 tracking-wide sidebar-content-transition"
            style={{ color: isActive ? 'var(--icon-active)' : 'var(--icon-color)' }}
          >
            {item.label}
          </span>
        )}

        {/* badge expandido */}
        {!collapsed && (item.badge ?? 0) > 0 && (
          <span className="sidebar-badge">{(item.badge ?? 0) > 9 ? '9+' : item.badge}</span>
        )}

        {/* badge colapsado */}
        {collapsed && (item.badge ?? 0) > 0 && (
          <span
            className="absolute top-0.5 right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full sidebar-badge"
            style={{ fontSize: '8px' }}
          >
            {(item.badge ?? 0) > 9 ? '9' : item.badge}
          </span>
        )}

        {/* tooltip colapsado */}
        {collapsed && (
          <div className="nav-tooltip absolute left-[52px] top-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div
              style={{
                background: 'rgba(15,15,15,0.97)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '11px',
                fontWeight: 300,
                padding: '5px 10px',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              }}
            >
              {item.label}
            </div>
          </div>
        )}
      </>
    )}
  </NavLink>
));
SidebarNavLink.displayName = 'SidebarNavLink';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════
const DashboardLayout: React.FC = () => {
  const { currentUser, userProfile, loading, puede } = useAuth();
  const { settings, toggleSidebar, toggleTheme } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutPhase, setLogoutPhase] = useState<'idle' | 'confirming' | 'leaving'>('idle');
  const [cardAnimClass, setCardAnimClass] = useState('__lo_card_in');
  const [pageAnimClass, setPageAnimClass] = useState('');

  const sidebarCollapsed = settings.sidebarCollapsed;
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

  const { notifications, unreadCount, readIds, markOneRead, markAllRead, markPanelSeen } =
    useNotifications({
      uid: currentUser?.uid,
      puedeVerMensajeria: puede('admin'),
      escritorio: settings.desktopNotifs !== false,
      silencio: { activo: !!settings.quietHoursEnabled, desde: settings.quietFrom, hasta: settings.quietTo },
      soundType: settings.notificationSound ?? 'default',
      soundVolume: settings.notificationVolume ?? 0.7,
      muted: settings.notificationsMuted ?? false,
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

  // Ajuste "Contador en el título": "(3) moon Studios — Portal Oficial".
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = settings.badgeCount !== false && unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [unreadCount, settings.badgeCount]);
  const initials = (userProfile?.displayName ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

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
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);
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
    // Cada panel se muestra según ROLE_PERMISSIONS (src/types): el CEO los ve todos.
    { path: '/dashboard/ceo-panel', label: 'Panel CEO', icon: Crown, show: puede('ceo') },
    { path: '/dashboard/admin', label: 'Panel Admin', icon: ShieldCheck, show: puede('admin') },
    { path: '/dashboard/roles', label: 'Gestión Roles', icon: UserCog, show: puede('roles') },
    { path: '/dashboard/users', label: 'Usuarios', icon: Users, show: puede('admin') },
    { path: '/dashboard/contador', label: 'Contador', icon: Calculator, show: puede('contador') },
    { path: '/dashboard/programacion', label: 'Programación', icon: Code2, show: puede('programacion') },
    { path: '/dashboard/diseno', label: 'Diseño', icon: Palette, show: puede('diseno') },
    { path: '/dashboard/secretaria', label: 'Secretaría', icon: FileText, show: puede('secretaria') },
    { path: '/dashboard/settings', label: 'Configuración', icon: Settings, show: true },
  ].filter(i => i.show);

  // grupos de nav
  const principalItems = navItems.filter(i => ['/dashboard', '/dashboard/calendar', '/dashboard/tareas', '/dashboard/announcements'].includes(i.path));
  const commsItems = navItems.filter(i => ['/dashboard/correo', '/dashboard/hilos', '/dashboard/mensajeria', '/dashboard/discord'].includes(i.path));
  const gestionItems = navItems.filter(i => ![
    '/dashboard', '/dashboard/calendar', '/dashboard/tareas', '/dashboard/announcements',
    '/dashboard/correo', '/dashboard/hilos', '/dashboard/mensajeria',
    '/dashboard/discord', '/dashboard/settings',
  ].includes(i.path));
  const settingsItem = navItems.filter(i => i.path === '/dashboard/settings');

  if (loading) return (
    <div className="h-full flex items-center justify-center" style={{ background: '#080808' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.08)', borderTopColor: 'rgba(255,255,255,0.5)', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      
      {showTabModal && <TabSyncModal onStayHere={handleStayHere} onGoToOther={handleGoToOther} />}
      {showWarning && <AutoLogoutModal countdown={countdown} totalSeconds={60} onStayActive={handleStayActive} />}
      {logoutPhase !== 'idle' && (
        <LogoutModal
          phase={logoutPhase}
          onCancel={handleCancelLogout}
          onConfirm={handleConfirmLogout}
          cardClass={cardAnimClass}
          userName={userProfile?.displayName ?? 'Usuario'}
        />
      )}

      {/* ── MOBILE DRAWER ── */}
<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
  <SheetContent
    side="left"
    className="w-[272px] p-0 flex flex-col"
    style={{
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-main)',
    }}
  >
    {/* Header */}
    <SheetHeader
      className="px-5 py-4 flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border-main)' }}
    >
      <SheetTitle className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{
            background: 'var(--sidebar-logo-bg)',
            border: '1px solid var(--sidebar-logo-border)',
          }}
        >
          <Moon className="w-4 h-4" style={{ color: 'var(--sidebar-logo-color)' }} strokeWidth={1.5} />
        </div>
        <span
          className="text-sm font-light tracking-[0.22em] uppercase"
          style={{ color: 'var(--text-primary)' }}
        >
          Moon Studios
        </span>
      </SheetTitle>
    </SheetHeader>

    {/* Nav */}
    <nav className="flex-1 py-3 px-3 overflow-y-auto nav-scroll space-y-0.5">
      {navItems.map((item, i) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/dashboard'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 relative nav-item-mounted nav-item-hover
             ${isActive ? 'nav-item-active' : ''}`
          }
          style={{ animationDelay: `${i * 25}ms` }}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="nav-item-active-bar" style={{ height: '55%', opacity: 1 }} />
              )}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: isActive ? 'var(--icon-bg-active)' : 'transparent',
                  border: isActive ? '1px solid var(--icon-border-active)' : '1px solid transparent',
                }}
              >
                <item.icon
                  className="w-3.5 h-3.5"
                  style={{ color: isActive ? 'var(--icon-active)' : 'var(--icon-color)' }}
                  strokeWidth={isActive ? 1.75 : 1.5}
                />
              </div>
              <span
                className="text-sm font-light tracking-wide flex-1"
                style={{ color: isActive ? 'var(--icon-active)' : 'var(--icon-color)' }}
              >
                {item.label}
              </span>
              {(item.badge ?? 0) > 0 && (
                <span className="sidebar-badge">
                  {(item.badge ?? 0) > 9 ? '9+' : item.badge}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>

    {/* Footer */}
    <div
      className="flex-shrink-0"
      style={{
        borderTop: '1px solid var(--border-main)',
        padding: '12px',
        background: 'var(--bg-sidebar)',
      }}
    >
      {/* User card */}
      <div
        className="flex items-center gap-2.5 p-2.5 rounded-xl mb-3 user-card-sidebar"
      >
        <div
          className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
          style={{
            background: 'var(--nav-hover-bg)',
            border: '1px solid var(--border-main)',
          }}
        >
          {userProfile?.avatar
            ? <img src={userProfile.avatar} alt={userProfile.displayName} className="w-full h-full object-cover" />
            : <span className="text-xs font-light" style={{ color: 'var(--text-primary)' }}>{initials}</span>
          }
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-light truncate" style={{ color: 'var(--text-primary)' }}>
            {userProfile?.displayName || 'Usuario'}
          </p>
          <p className="text-[9px] font-light uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {userProfile?.role}
          </p>
        </div>
        <div
          className="online-dot-pulse"
          style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--accent-user, #6366f1)', flexShrink: 0,
          }}
        />
      </div>

      {/* Logout */}
      <button
        onClick={() => { setMobileMenuOpen(false); handleLogoutClick(); }}
        className="footer-btn-mono w-full flex items-center gap-2.5 px-3 py-2.5"
      >
        <LogOut className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
        <span className="text-xs font-light">Cerrar Sesión</span>
      </button>
    </div>
  </SheetContent>
</Sheet>

      {/* ── MAIN LAYOUT ── */}
      <div className={`h-full flex overflow-hidden ${pageAnimClass}`} style={{ background: 'var(--bg-main)' }}>

        {/* ── DESKTOP SIDEBAR ── */}
        {!isMobile && (
          <aside
            className={`flex flex-col sidebar-transition flex-shrink-0 h-full relative ${sidebarCollapsed ? 'w-[60px]' : 'w-[218px]'}`}
            style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-main)' }}
          >
            {/* Logo */}
            <div
              className={`h-14 flex items-center flex-shrink-0 overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'px-3 justify-center' : 'px-4 gap-2.5'}`}
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div
                className="flex items-center justify-center flex-shrink-0 rounded-xl sidebar-icon-transition"
                style={{ width: '30px', height: '30px', background: 'var(--sidebar-logo-bg)', border: '1px solid var(--sidebar-logo-border)' }}
              >
                <Moon className="w-3.5 h-3.5" style={{ color: 'var(--sidebar-logo-color)' }} strokeWidth={1.5} />
              </div>
              {!sidebarCollapsed && (
              <div className="sidebar-content-transition overflow-hidden">
                <span className="text-xs font-light tracking-[0.28em] uppercase whitespace-nowrap"
                  style={{ color: 'var(--text-primary)' }}>Moon Studios</span>
                <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--border-main), transparent)', marginTop: '2px' }} />
              </div>
            )}
            </div>

            {/* Nav */}
            <nav className="flex-1 py-3 px-2 overflow-y-auto overflow-x-hidden nav-scroll space-y-0.5">

              {/* Principal */}
              {!sidebarCollapsed && <div className="nav-section-label">Principal</div>}
              {sidebarCollapsed && <div style={{ height: '12px' }} />}
              {principalItems.map((item, i) => (
                <SidebarNavLink key={item.path} item={item} collapsed={sidebarCollapsed} delay={i * 30} />
              ))}

              {/* Comunicación */}
              {!sidebarCollapsed && <div className="nav-section-label" style={{ marginTop: '12px' }}>Comunicación</div>}
              {!sidebarCollapsed && <div className="sidebar-divider" style={{ margin: '0 4px 2px' }} />}
              {sidebarCollapsed && <div style={{ height: '10px' }} />}
              {commsItems.map((item, i) => (
                <SidebarNavLink key={item.path} item={item} collapsed={sidebarCollapsed} delay={principalItems.length * 30 + i * 30} />
              ))}

              {/* Gestión */}
              {gestionItems.length > 0 && (
                <>
                  {!sidebarCollapsed && <div className="nav-section-label" style={{ marginTop: '12px' }}>Gestión</div>}
                  {!sidebarCollapsed && <div className="sidebar-divider" style={{ margin: '0 4px 2px' }} />}
                  {sidebarCollapsed && <div style={{ height: '10px' }} />}
                  {gestionItems.map((item, i) => (
                    <SidebarNavLink key={item.path} item={item} collapsed={sidebarCollapsed} delay={(principalItems.length + commsItems.length) * 30 + i * 30} />
                  ))}
                </>
              )}

              {/* Settings */}
              {!sidebarCollapsed && <div className="sidebar-divider" style={{ marginTop: '10px' }} />}
              {sidebarCollapsed && <div style={{ height: '10px' }} />}
              {settingsItem.map(item => (
                <SidebarNavLink key={item.path} item={item} collapsed={sidebarCollapsed} />
              ))}
            </nav>

            {/* Footer — User card + botones */}
            <div
              className="flex-shrink-0"
              style={{ borderTop: '1px solid var(--sidebar-footer-border)', padding: sidebarCollapsed ? '10px 8px' : '10px' }}
            >
              {/* User card — solo visible expandido */}
              {!sidebarCollapsed && (
                <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl mb-2 sidebar-content-transition user-card-sidebar">
                  <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--nav-hover-bg)', border: '1px solid var(--border-main)' }}>
                    {userProfile?.avatar
                      ? <img src={userProfile.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[10px] font-light" style={{ color: 'var(--text-primary)' }}>{initials}</span>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-light truncate leading-none" style={{ color: 'var(--text-primary)' }}>
                      {userProfile?.displayName || 'Usuario'}
                    </p>
                    <p className="text-[9px] font-light uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {userProfile?.role}
                    </p>
                  </div>
                  <div
                    className="online-dot-pulse"
                    style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-user, #6366f1)', flexShrink: 0 }}
                  />
                </div>
              )}

              {/* Avatar centrado cuando colapsado */}
              {sidebarCollapsed && (
                <div className="flex justify-center mb-2 sidebar-content-transition">
                  <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center avatar-ring"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    {userProfile?.avatar
                      ? <img src={userProfile.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[10px] font-light" style={{ color: 'rgba(255,255,255,0.75)' }}>{initials}</span>
                    }
                  </div>
                </div>
              )}

              {/* Botones */}
              <div className={`flex ${sidebarCollapsed ? 'flex-col gap-1.5' : 'flex-row gap-1.5'}`}>
                {/* Collapse toggle */}
                <button
                  onClick={toggleSidebar}
                  className="footer-btn-mono flex items-center justify-center sidebar-icon-transition"
                  style={{
                    flex: sidebarCollapsed ? 'unset' : 1,
                    width: sidebarCollapsed ? '100%' : 'auto',
                    height: '30px',
                    gap: '5px',
                  }}
                  title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
                >
                  {sidebarCollapsed
                    ? <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                    : <><ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /><span className="text-[10px] font-light tracking-wide">Colapsar</span></>
                  }
                </button>

                {/* Logout */}
                <button
                  onClick={handleLogoutClick}
                  className="footer-btn-mono flex items-center justify-center sidebar-icon-transition"
                  style={{
                    flex: sidebarCollapsed ? 'unset' : 1,
                    width: sidebarCollapsed ? '100%' : 'auto',
                    height: '30px',
                    gap: '5px',
                  }}
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                  {!sidebarCollapsed && <span className="text-[10px] font-light tracking-wide">Salir</span>}
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* ── CONTENT AREA ── */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">

          {/* ── HEADER ── */}
          <header
            className="header-anim h-14 flex items-center justify-between flex-shrink-0"
            style={{
              padding: '0 20px',
              background: 'var(--bg-header)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderBottom: '1px solid var(--border-header)',
            }}
          >
            <div className="flex items-center gap-3">
              {isMobile && (
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="header-icon-btn"
                >
                  <Menu className="w-4 h-4" style={{ color: 'var(--header-icon-color)' }} strokeWidth={1.5} />
                </button>
              )}
              <Clock isMobile={isMobile} />
            </div>

            <div className="flex items-center gap-3">
              {/* Bell */}
              <button
                onClick={handleOpenPanel}
                className={`header-icon-btn ${notifOpen ? 'active-panel' : ''} ${unreadCount > 0 && !notifOpen ? 'bell-has-unread' : ''}`}
              >
                <Bell className="w-4 h-4" style={{ color: notifOpen ? 'var(--icon-active)' : 'var(--header-icon-color)' }} strokeWidth={1.5} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5"
                    style={{ background: 'var(--badge-bg)', color: 'var(--badge-color)', fontSize: '8px', fontWeight: 700, animation: 'badgePop 0.3s cubic-bezier(0.22,1,0.36,1)' }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <NotifPanel
                  notifications={notifications}
                  unreadCount={unreadCount}
                  readIds={readIds}
                  markOneRead={markOneRead}
                  markAllRead={markAllRead}
                  onClose={() => setNotifOpen(false)}
                  onNavigate={navigate}
                  uid={currentUser?.uid}
                />
              )}

              {/* Separador */}
              <div style={{ width: '1px', height: '18px', background: 'var(--header-separator)' }} />

              {/* User info */}
              <div className="flex items-center gap-2.5">
                {!isMobile && (
                  <div className="text-right sidebar-content-transition">
                    <p className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>{userProfile?.displayName || 'Usuario'}</p>
                    <p className="text-[9px] font-light uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{userProfile?.role}</p>
                  </div>
                )}
                <div
                  className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center avatar-ring"
                  style={{ background: 'var(--nav-hover-bg)', border: '1px solid var(--border-main)' }}
                >
                  {userProfile?.avatar ? (
                    <>
                      <img
                        src={userProfile.avatar}
                        alt={userProfile.displayName}
                        className="w-full h-full object-cover"
                        onError={e => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                          const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (next) next.style.display = 'flex';
                        }}
                      />
                      <span className="text-xs font-light hidden w-full h-full items-center justify-center"
                        style={{ color: 'var(--text-primary)' }}>{initials}</span>
                    </>
                  ) : (
                    <span className="text-xs font-light" style={{ color: 'var(--text-primary)' }}>{initials}</span>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* ── MAIN CONTENT ── */}
          <main className="flex-1 p-4 md:p-6 overflow-y-auto main-scroll">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
};

export default DashboardLayout;