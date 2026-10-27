/**
 * Settings.tsx — v2.0 MEJORADO
 * ─────────────────────────────────────────────────────────────────
 * NUEVAS FUNCIONALIDADES:
 *  1. Recorte de foto de perfil con canvas (crop circular/cuadrado)
 *  2. Historial de fotos con preview, reutilización y eliminación
 *  3. Auto-eliminación de fotos >7 días (Firestore + Supabase)
 *  4. Animaciones mejoradas en todas las tabs
 *  5. Sección Apariencia corregida con tema dark/light/system
 *  6. Tipografía con preview en tiempo real
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { pedirPermisoNotificaciones } from '@/lib/escritorio';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { WorkspaceMotionControl } from '@/components/WorkspaceMotionControl';
import { limpiarCambios } from '@/lib/ajustes/modelo';
import { cargarFuente } from '@/lib/ajustes/aplicar';
import { fechaNumerica, localeActual } from '@/lib/ajustes/fecha';
import { ATAJOS, esMac } from '@/lib/ajustes/atajos';
import {
  updateUserProfile, updateUserPassword, getUserProfile,
  logUserActivity, getUserActivityLogs, getUserSessions,
  revokeSession, revokeAllOtherSessions,
  type UserActivityRecord, type SessionRecord,
} from '@/lib/firebase';
import { uploadAvatarFile, extractAvatarPath, supabase, AVATARS_BUCKET } from '@/lib/supabaseclient';
import PanelIntegraciones from '@/components/PanelIntegraciones';
import { Switch } from '@/components/ui/switch';
import {
  Moon, Sun, Bell, User, Shield, Palette,
  Camera, Loader2, Trash2, Eye, EyeOff, X,
  Volume2, VolumeX, Play, MessageSquare, Mail, GitBranch, CheckCircle2,
  KeyRound, AlertCircle, Monitor, Smartphone, AppWindow, MapPin, LogOut,
  Keyboard, Database, Zap, Download, Upload,
  Contrast, Wifi, Link2, Trash, Lock,
  Clock3, MousePointer2, Activity, ToggleLeft, Sliders,
  HardDrive, AlarmClock, BellOff,
  UserCheck, ShieldCheck, Cpu, Layout, Maximize2, ChevronDown,
  Type, RotateCcw, ZoomIn, ZoomOut, Crop, History, Star, Search,
} from 'lucide-react';
import { Megaphone as MegaIcon, ListTodo } from 'lucide-react';
import { playNotificationSound } from '@/lib/notificationSound';
import { AvisosDispositivo } from '@/components/ajustes/AvisosDispositivo';
import type { SoundType } from '@/lib/notificationSound';
import { getVersion } from '@tauri-apps/api/app';
import SeccionActualizaciones from '@/components/SeccionActualizaciones';
import { useActualizador } from '@/lib/actualizador';
import './settings.css';
import { IdentificadorUsuario } from '@/components/IdentificadorUsuario';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AvatarRecord { url: string; path: string; uploadedAt: string; }
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const historialValido = (crudo: unknown): AvatarRecord[] => Array.isArray(crudo) ? crudo.filter((r): r is AvatarRecord => !!r && typeof r.url === 'string' && typeof r.path === 'string' && typeof r.uploadedAt === 'string' && Number.isFinite(Date.parse(r.uploadedAt))) : [];
async function eliminarAvatarSeguro(record: AvatarRecord, uid: string) {
  const path = extractAvatarPath(record.url) || record.path;
  // Registros antiguos sin archivo administrado solo conservan una URL externa.
  if (!path || path.startsWith('legacy_')) return;
  if (!path.startsWith(`${uid}/`) || path.split('/').some(p => p === '..')) throw new Error('Esta foto no pertenece a tu cuenta.');
  const { error } = await supabase.storage.from(AVATARS_BUCKET).remove([path]);
  if (error) throw new Error('No se pudo eliminar la foto del almacenamiento.');
}

// ─── Error helpers ────────────────────────────────────────────────────────────
interface FirebaseAuthError { code?: string; message?: string; }
function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as FirebaseAuthError).message);
  return String(err);
}
function getErrCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err)
    return String((err as FirebaseAuthError).code);
  return '';
}

type TabKey =
  | 'profile' | 'appearance' | 'notifications' | 'security'
  | 'privacy' | 'accessibility' | 'shortcuts' | 'integrations'
  | 'storage' | 'activity';

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS: { key: TabKey; label: string; icon: React.ElementType; grupo: 'Cuenta' | 'Preferencias' | 'Sistema'; desc: string }[] = [
  { key: 'profile',       label: 'Perfil',         icon: User,     grupo: 'Cuenta',       desc: 'Tu foto, tu nombre y cómo te ve el equipo.' },
  { key: 'security',      label: 'Seguridad',      icon: Shield,   grupo: 'Cuenta',       desc: 'Contraseña, alertas de inicio de sesión y dispositivos.' },
  { key: 'privacy',       label: 'Privacidad',     icon: Lock,     grupo: 'Cuenta',       desc: 'Tu presencia en línea y tus datos.' },
  { key: 'appearance',    label: 'Apariencia',     icon: Palette,  grupo: 'Preferencias', desc: 'Tema, color, fuente, tamaño y efectos visuales.' },
  { key: 'notifications', label: 'Notificaciones', icon: Bell,     grupo: 'Preferencias', desc: 'Qué te avisa el portal, cómo suena y cuándo callarse.' },
  { key: 'accessibility', label: 'Accesibilidad',  icon: Contrast, grupo: 'Preferencias', desc: 'Contraste, movimiento, foco, idioma y zona horaria.' },
  { key: 'shortcuts',     label: 'Atajos',         icon: Keyboard, grupo: 'Preferencias', desc: 'Atajos de teclado para moverte más rápido.' },
  { key: 'integrations',  label: 'Integraciones',  icon: Link2,    grupo: 'Sistema',      desc: 'Servicios externos conectados al portal.' },
  { key: 'storage',       label: 'Almacenamiento', icon: Database, grupo: 'Sistema',      desc: 'Espacio en este dispositivo, caché, exportar e importar.' },
  { key: 'activity',      label: 'Actividad',      icon: Activity, grupo: 'Sistema',      desc: 'Tu historial reciente y las actualizaciones de la app.' },
];
const GRUPOS_TABS = ['Cuenta', 'Preferencias', 'Sistema'] as const;

const SOUND_OPTIONS: { value: SoundType; label: string; desc: string }[] = [
  { value: 'none',    label: 'Silencio', desc: 'Sin sonido' },
  { value: 'soft',    label: 'Suave',    desc: 'Doble tono sutil' },
  { value: 'default', label: 'Estándar', desc: 'Do → Mi' },
  { value: 'ping',    label: 'Ping',     desc: 'Alta frecuencia' },
  { value: 'chime',   label: 'Campana',  desc: 'Acorde tres notas' },
];

const NOTIF_CATEGORIES = [
  { key: 'notifyAnnouncements', label: 'Anuncios',   icon: MegaIcon,      color: '#a78bfa' },
  { key: 'notifyEmails',        label: 'Correos',    icon: Mail,          color: '#60a5fa' },
  { key: 'notifyThreads',       label: 'Hilos',      icon: GitBranch,     color: '#34d399' },
  { key: 'notifyMessages',      label: 'Mensajería', icon: MessageSquare, color: '#fb923c' },
  { key: 'notifyTasks',         label: 'Tareas',     icon: ListTodo,      color: '#fbbf24' },
] as const;

const FONT_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
type FontSize = typeof FONT_SIZES[number];

export const FONT_OPTIONS = [
  { id: 'DM Sans',          label: 'DM Sans',          desc: 'La fuente actual — moderna y geométrica',       url: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@200;300;400&display=swap',              preview: 'DM Sans' },
  { id: 'Inter',            label: 'Inter',            desc: 'Neutral y altamente legible',                   url: 'https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400&display=swap',               preview: 'Inter' },
  { id: 'Geist',            label: 'Geist',            desc: 'Inspirada en Vercel — minimalista técnica',     url: 'https://fonts.googleapis.com/css2?family=Geist:wght@200;300;400&display=swap',               preview: 'Geist' },
  { id: 'Sora',             label: 'Sora',             desc: 'Redondas y amigables',                          url: 'https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400&display=swap',               preview: 'Sora' },
  { id: 'Space Grotesk',    label: 'Space Grotesk',    desc: 'Compacta y con carácter',                       url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400&display=swap',          preview: 'Space Grotesk' },
  { id: 'Outfit',           label: 'Outfit',           desc: 'Limpia y contemporánea',                        url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400&display=swap',             preview: 'Outfit' },
  { id: 'IBM Plex Sans',    label: 'IBM Plex Sans',    desc: 'Técnica y precisa — ideal para dashboards',     url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@200;300;400&display=swap',       preview: 'IBM Plex Sans' },
  { id: 'Plus Jakarta Sans',label: 'Plus Jakarta Sans',desc: 'Contemporánea con personalidad',                url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400&display=swap',   preview: 'Plus Jakarta Sans' },
  { id: 'Figtree',          label: 'Figtree',          desc: 'Suave y variable — excelente lectura',          url: 'https://fonts.googleapis.com/css2?family=Figtree:wght@300;400&display=swap',               preview: 'Figtree' },
  { id: 'Nunito',           label: 'Nunito',           desc: 'Redondeada y amigable — gran legibilidad',      url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@200;300;400&display=swap',             preview: 'Nunito' },
] as const;

export type FontId = typeof FONT_OPTIONS[number]['id'];

// eslint-disable-next-line react-refresh/only-export-components
export function loadGoogleFont(_url: string, id: string) {
  cargarFuente(id);
}

const ZONA_DISPOSITIVO = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ZONAS = [
  { id: ZONA_DISPOSITIVO, nombre: `La de este dispositivo (${ZONA_DISPOSITIVO.replace(/_/g, ' ')})` },
  { id: 'America/Lima', nombre: 'Lima (UTC-5)' },
  { id: 'America/Bogota', nombre: 'Bogotá (UTC-5)' },
  { id: 'America/Guayaquil', nombre: 'Guayaquil (UTC-5)' },
  { id: 'America/Mexico_City', nombre: 'Ciudad de México (UTC-6)' },
  { id: 'America/New_York', nombre: 'Nueva York (UTC-5/-4)' },
  { id: 'America/Caracas', nombre: 'Caracas (UTC-4)' },
  { id: 'America/La_Paz', nombre: 'La Paz (UTC-4)' },
  { id: 'America/Santiago', nombre: 'Santiago (UTC-4/-3)' },
  { id: 'America/Argentina/Buenos_Aires', nombre: 'Buenos Aires (UTC-3)' },
  { id: 'America/Sao_Paulo', nombre: 'São Paulo (UTC-3)' },
  { id: 'Europe/Madrid', nombre: 'Madrid (UTC+1/+2)' },
].filter((z, i, l) => l.findIndex(x => x.id === z.id) === i);



const ACTIVITY_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  login:            { icon: UserCheck,   color: '#34d399' },
  logout:           { icon: LogOut,      color: '#fb923c' },
  password_changed: { icon: KeyRound,    color: '#a78bfa' },
  avatar_changed:   { icon: Camera,      color: '#60a5fa' },
  profile_updated:  { icon: User,        color: '#60a5fa' },
  settings_changed: { icon: Sliders,     color: '#34d399' },
  '2fa_enabled':    { icon: ShieldCheck, color: '#34d399' },
  '2fa_disabled':   { icon: ShieldCheck, color: '#f87171' },
  session_revoked:  { icon: LogOut,      color: '#fb923c' },
};

const bd = 'var(--border-main)';

// ─── Crop Helper ──────────────────────────────────────────────────────────────
interface CropState { x: number; y: number; scale: number; rotation: number; shape: 'circle' | 'square'; }

function getCroppedCanvas(img: HTMLImageElement, crop: CropState, outputSize = 400): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = outputSize; canvas.height = outputSize;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, outputSize, outputSize);

  if (crop.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();
  } else {
    const r = outputSize * 0.08;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(outputSize - r, 0);
    ctx.quadraticCurveTo(outputSize, 0, outputSize, r);
    ctx.lineTo(outputSize, outputSize - r);
    ctx.quadraticCurveTo(outputSize, outputSize, outputSize - r, outputSize);
    ctx.lineTo(r, outputSize); ctx.quadraticCurveTo(0, outputSize, 0, outputSize - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.closePath(); ctx.clip();
  }

  ctx.save();
const scale = outputSize / Math.min(img.naturalWidth, img.naturalHeight);
const drawW = img.naturalWidth * scale;
const drawH = img.naturalHeight * scale;
ctx.translate(outputSize / 2, outputSize / 2);
ctx.rotate((crop.rotation * Math.PI) / 180);
ctx.scale(crop.scale, crop.scale);
ctx.translate(crop.x - drawW / 2, crop.y - drawH / 2);
ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, drawW, drawH);
ctx.restore();
  return canvas;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatRelativeTime = (date: Date): string => {
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2)  return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  if (hours < 24) return `Hace ${hours} h`;
  if (days < 7)  return `Hace ${days} día${days > 1 ? 's' : ''}`;
  return fechaNumerica(date);
};

const formatDate = (date: Date, format: string, tz: string): string => {
  if (!date) return '';
  try {
    const opts: Intl.DateTimeFormatOptions = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('es-PE', opts).formatToParts(date);
    const p: Record<string, string> = {};
    parts.forEach(({ type, value }) => { p[type] = value; });
    if (format === 'mdy') return `${p.month}/${p.day}/${p.year}`;
    if (format === 'ymd') return `${p.year}/${p.month}/${p.day}`;
    return `${p.day}/${p.month}/${p.year}`;
  } catch { return date.toLocaleDateString(); }
};

// ¿Pantalla ancha (lg de Tailwind, 1024 px)? Decide qué layout se monta: antes
// se montaban los dos (móvil y escritorio) y se ocultaba uno con CSS, así que
// cada formulario existía dos veces en el DOM. (useIsMobile corta en 768 px,
// no sirve para este layout.)
const MQ_ANCHO = '(min-width: 1024px)';
const suscribirAncho = (cb: () => void) => {
  const mql = window.matchMedia(MQ_ANCHO);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};
const useEsPantallaAncha = () => useSyncExternalStore(
  suscribirAncho,
  () => window.matchMedia(MQ_ANCHO).matches,
  () => true,
);

// Reloj de la pestaña Accesibilidad. Tiene su propio intervalo: antes un
// setInterval de 1 s en Settings volvía a renderizar todo el panel cada segundo.
const RelojLocal: React.FC<{ timezone: string; dateFormat: string }> = ({ timezone, dateFormat }) => {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <div style={{ fontSize: '2rem', fontWeight: 200, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>
        {ahora.toLocaleTimeString(localeActual(), { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: timezone })}
      </div>
      <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', marginTop: 3 }}>
        {formatDate(ahora, dateFormat, timezone)} · {timezone.replace('_', ' ')}
      </div>
    </>
  );
};

function useAjustesDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onClose);
  cerrar.current = onClose;
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const elementos = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
    (elementos()[0] ?? panel)?.focus({ preventScroll: true });
    const teclado = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cerrar.current(); }
      if (event.key !== 'Tab') return;
      const lista = elementos(), primero = lista[0], ultimo = lista.at(-1);
      if (!primero) { event.preventDefault(); panel?.focus(); return; }
      if (event.shiftKey && (document.activeElement === primero || !panel?.contains(document.activeElement))) { event.preventDefault(); ultimo?.focus(); }
      else if (!event.shiftKey && (document.activeElement === ultimo || !panel?.contains(document.activeElement))) { event.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', teclado, true);
    return () => { document.removeEventListener('keydown', teclado, true); if (anterior?.isConnected) anterior.focus({ preventScroll: true }); };
  }, []);
  return ref;
}

const FotoAmpliada: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => {
  const ref = useAjustesDialog(onClose);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label="Vista ampliada de la foto" tabIndex={-1} className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-xl" style={{ animation: 'modalIn .2s ease' }} onClick={onClose}>
    <button type="button" aria-label="Cerrar foto ampliada" className="absolute top-6 right-6" style={{ background: 'none', border: 'none', color: '#fff' }} onClick={onClose}><X size={24} /></button>
    <img src={src} className="max-w-[90vw] max-h-[85vh] rounded-2xl object-contain" onClick={event => event.stopPropagation()} alt="Foto de perfil ampliada" style={{ animation: 'scaleIn .2s ease' }} />
  </div>;
};

// ══════════════════════════════════════════════════════════════════════════════
// AVATAR CROP MODAL
// ══════════════════════════════════════════════════════════════════════════════
const AvatarCropModal: React.FC<{
  src: string;
  onSave: (blob: Blob) => void;
  onClose: () => void;
  accentColor: string;
}> = ({ src, onSave, onClose, accentColor }) => {
  const dialogRef = useAjustesDialog(onClose);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, scale: 1, rotation: 0, shape: 'circle' });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const updatePreview = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.complete) return;
    const cropped = getCroppedCanvas(img, crop, 200);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 200, 200);
    ctx.drawImage(cropped, 0, 0);
  }, [crop]);

  useEffect(() => { updatePreview(); }, [updatePreview]);

  const handleSave = async () => {
    const img = imgRef.current;
    if (!img) return;
    const cropped = getCroppedCanvas(img, crop, 400);
    cropped.toBlob(blob => { if (blob) onSave(blob); }, 'image/webp', 0.92);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - crop.x, y: e.clientY - crop.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCrop(c => ({ ...c, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  };
  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: t.clientX - crop.x, y: t.clientY - crop.y });
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const t = e.touches[0];
    setCrop(c => ({ ...c, x: t.clientX - dragStart.x, y: t.clientY - dragStart.y }));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl"
      style={{ animation: 'modalIn 0.22s ease forwards' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Recortar foto de perfil" tabIndex={-1} className="aj-avatar-dialog" style={{
        background: 'var(--bg-sidebar, #111)', border: '1px solid var(--border-main)',
        borderRadius: 24, padding: '0', width: 'min(520px, 96vw)', overflow: 'hidden',
        boxShadow: '0 40px 80px rgba(0,0,0,0.7)',
        animation: 'slideUp 0.28s cubic-bezier(0.2,0.8,0.2,1) forwards',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `${accentColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Crop size={15} style={{ color: 'var(--accent-user-ink)' }} />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>Recortar foto</div>
              <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>Arrastra para posicionar</div>
            </div>
          </div>
          <button aria-label="Cerrar recorte de foto" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Canvas de edición */}
         <div tabIndex={0} role="img" aria-label="Posición de la foto. Usa las flechas del teclado para moverla."
          onKeyDown={e => { const delta = e.shiftKey ? 16 : 4; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setCrop(c => ({ ...c, x: c.x + (e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0), y: c.y + (e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0) })); } }}
          style={{ position: 'relative', background: '#0a0a0a', overflow: 'hidden', userSelect: 'none', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleMouseUp}>
          <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: isDragging ? 'grabbing' : 'grab' }}>
            {/* Grid overlay */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none' }} />

            <img ref={imgRef} src={src} alt=""
              crossOrigin="anonymous"
              onLoad={updatePreview}
              style={{
                maxWidth: '70%', maxHeight: 220,
                transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale}) rotate(${crop.rotation}deg)`,
                transition: isDragging ? 'none' : 'transform 0.15s ease',
                pointerEvents: 'none', display: 'block', borderRadius: 4,
              }} />

            {/* Shape mask overlay */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 160, height: 160,
                borderRadius: crop.shape === 'circle' ? '50%' : 12,
                border: `2px solid ${accentColor}`,
                boxShadow: `0 0 0 2000px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.1)`,
              }} />
            </div>
          </div>
        </div>

        {/* Controles */}
        <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Forma */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['circle', 'square'] as const).map(s => (
              <button key={s} onClick={() => setCrop(c => ({ ...c, shape: s }))}
                style={{ flex: 1, padding: '7px', borderRadius: 9, fontSize: '0.8571rem', cursor: 'pointer', border: `1px solid ${crop.shape === s ? accentColor + '55' : 'var(--border-main)'}`, background: crop.shape === s ? `${accentColor}18` : 'transparent', color: crop.shape === s ? accentColor : 'var(--text-muted)', transition: 'all 0.15s ease' }}>
                {s === 'circle' ? '⬤ Círculo' : '▪ Cuadrado'}
              </button>
            ))}
          </div>

          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ZoomOut size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input aria-label="Zoom de la foto" type="range" min={0.5} max={3} step={0.01} value={crop.scale}
              onChange={e => setCrop(c => ({ ...c, scale: parseFloat(e.target.value) }))}
              style={{ flex: 1, accentColor, height: 3 }} />
            <ZoomIn size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>{(crop.scale * 100).toFixed(0)}%</span>
          </div>

          {/* Rotación */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RotateCcw size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input aria-label="Rotación de la foto" type="range" min={-180} max={180} step={1} value={crop.rotation}
              onChange={e => setCrop(c => ({ ...c, rotation: parseFloat(e.target.value) }))}
              style={{ flex: 1, accentColor, height: 3 }} />
            <span style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>{crop.rotation}°</span>
          </div>

          {/* Preview + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2 }}>
            {/* Mini preview */}
            <div style={{ flexShrink: 0 }}>
              <canvas ref={canvasRef} width={200} height={200}
                style={{ width: 52, height: 52, borderRadius: crop.shape === 'circle' ? '50%' : 10, border: `2px solid ${accentColor}44`, display: 'block' }} />
            </div>

            <div style={{ flex: 1, display: 'flex', gap: 8 }}>
              <button onClick={() => setCrop({ x: 0, y: 0, scale: 1, rotation: 0, shape: crop.shape })}
                style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: '0.8571rem', cursor: 'pointer', border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <RotateCcw size={12} /> Resetear
              </button>
              <button onClick={handleSave}
                style={{ flex: 2, padding: '9px', borderRadius: 10, fontSize: '0.9286rem', fontWeight: 500, cursor: 'pointer', border: 'none', background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Usar esta foto
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// AVATAR HISTORY MODAL
// ══════════════════════════════════════════════════════════════════════════════
const AvatarHistoryModal: React.FC<{
  history: AvatarRecord[];
  currentUrl: string;
  accentColor: string;
  onSelect: (record: AvatarRecord) => void;
  onDelete: (record: AvatarRecord) => void | Promise<void>;
  onClose: () => void;
}> = ({ history, currentUrl, accentColor, onSelect, onDelete, onClose }) => {
  const dialogRef = useAjustesDialog(onClose);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [ahora] = useState(Date.now);

  const daysLeft = (uploadedAt: string) =>
    Math.max(0, 7 - Math.floor((ahora - new Date(uploadedAt).getTime()) / 86_400_000));

  const isCurrent = (url: string) => url.split('?')[0] === currentUrl.split('?')[0];

  const handleDelete = async (r: AvatarRecord) => {
    if (confirmDelete !== r.url) { setConfirmDelete(r.url); return; }
    setDeleting(r.url);
    await onDelete(r);
    setDeleting(null);
    setConfirmDelete(null);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/85 backdrop-blur-lg"
      style={{ animation: 'modalIn 0.2s ease forwards' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Historial de fotos de perfil" tabIndex={-1} className="aj-avatar-dialog" style={{
        background: 'var(--bg-sidebar, #111)', border: '1px solid var(--border-main)',
        borderRadius: 24, width: 'min(560px, 96vw)', maxHeight: '80vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s cubic-bezier(0.2,0.8,0.2,1) forwards',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `${accentColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <History size={15} style={{ color: 'var(--accent-user-ink)' }} />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>Historial de fotos</div>
              <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>{history.length} foto{history.length !== 1 ? 's' : ''} · se eliminan a los 7 días</div>
            </div>
          </div>
          <button aria-label="Cerrar historial de fotos" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Grid */}
        <div style={{ overflowY: 'auto', padding: 20, flex: 1 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.9286rem' }}>
              <Camera size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
              No hay fotos en el historial
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
              {history.map((r: AvatarRecord) => {
                const days = daysLeft(r.uploadedAt);
                const current = isCurrent(r.url);
                const isDeleting = deleting === r.url;
                const isConfirm = confirmDelete === r.url;
                return (
                  <div key={r.url} style={{
                    position: 'relative', borderRadius: 14, overflow: 'hidden',
                    border: `2px solid ${current ? accentColor : 'var(--border-main)'}`,
                    background: 'var(--sidebar-card-bg)',
                    transition: 'all 0.2s ease',
                    animation: 'fadeInUp 0.3s ease forwards',
                  }}>
                    {/* Imagen */}
                    <div style={{ aspectRatio: '1', position: 'relative', overflow: 'hidden' }}>
                      <img src={r.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {current && (
                        <div style={{ position: 'absolute', top: 6, right: 6, background: accentColor, borderRadius: 20, padding: '2px 8px', fontSize: '0.6429rem', color: 'var(--accent-on-user)', fontWeight: 600, letterSpacing: '0.05em' }}>
                          ACTUAL
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ padding: '8px 10px 10px' }}>
                      {/* Barra de tiempo */}
                      <div style={{ height: 3, borderRadius: 3, background: 'var(--border-main)', marginBottom: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(days / 7) * 100}%`, background: days <= 1 ? '#ef4444' : days <= 3 ? '#f97316' : accentColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.7143rem', color: days <= 1 ? '#ef4444' : 'var(--text-muted)', marginBottom: 8 }}>
                        {days === 0 ? '⚠ Expira hoy' : `${days}d restante${days !== 1 ? 's' : ''}`}
                      </div>

                      {/* Acciones */}
                      <div style={{ display: 'flex', gap: 5 }}>
                        {!current && (
                          <button onClick={() => onSelect(r)}
                            style={{ flex: 1, padding: '5px 4px', borderRadius: 7, fontSize: '0.7857rem', cursor: 'pointer', border: `1px solid ${accentColor}44`, background: `${accentColor}14`, color: 'var(--accent-user-ink)', transition: 'all 0.15s ease' }}>
                            Usar
                          </button>
                        )}
                        <button aria-label={isConfirm ? 'Confirmar eliminación de foto' : 'Eliminar foto del historial'} onClick={() => handleDelete(r)} disabled={isDeleting || current}
                          style={{ flex: current ? 1 : 0, padding: '5px 8px', borderRadius: 7, fontSize: '0.7857rem', cursor: 'pointer', border: `1px solid ${isConfirm ? 'rgba(239,68,68,0.4)' : 'var(--border-main)'}`, background: isConfirm ? 'rgba(239,68,68,0.12)' : 'transparent', color: isConfirm ? '#ef4444' : 'var(--text-muted)', transition: 'all 0.15s ease' }}>
                          {isDeleting ? <Loader2 size={11} className="animate-spin" /> : isConfirm ? '¿Confirmar?' : <Trash2 size={11} />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


interface ProfileField {
  label: string; field: string; value: string;
  set: (v: string) => void; placeholder: string; disabled?: boolean;
}
// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
const Settings: React.FC = () => {
  const { userProfile, refreshProfile } = useAuth();
  const { settings, updateSettings, isDark, estado, sincronizado, reintentarGuardado, restablecer } = useSettings();

  // ── Core State ──
  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [sectionQuery, setSectionQuery] = useState('');
  const sectionKeywords: Record<TabKey, string> = {
    profile: 'foto avatar nombre teléfono biografía web', security: 'contraseña sesiones dispositivos acceso autenticación',
    privacy: 'presencia conectado eliminar cuenta datos', appearance: 'tema oscuro claro colores fuente tamaño animaciones movimiento',
    notifications: 'sonido volumen silencio horarios avisos', accessibility: 'lector contraste idioma región zona horaria fecha foco',
    shortcuts: 'teclado comandos atajos', integrations: 'conexiones servicios', storage: 'exportar importar caché copia respaldo',
    activity: 'historial versión actualizar Windows',
  };
  const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const matchingTabs = TABS.filter(tab => normalizeSearch(`${tab.label} ${tab.desc} ${sectionKeywords[tab.key]}`).includes(normalizeSearch(sectionQuery.trim())));
  const [mobileTabOpen, setMobileTabOpen] = useState(false);
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [bio, setBio] = useState(userProfile?.bio || '');
  const [website, setWebsite] = useState(userProfile?.website || '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(userProfile?.avatar || null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Crop State ──
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ── Password ──
  const [currentPw, setCurrentPw] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw0, setShowPw0] = useState(false);
  const [showPw1, setShowPw1] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // ── Lo que viene de la configuración ──
  // Se lee SIEMPRE de settings (no hay copias locales): antes cada opción tenía
  // su propio useState, y si cambiaba desde otro lado (el botón de la barra,
  // otro dispositivo) esta pantalla mostraba un valor viejo.
  const accentColor = settings.accentColor || '#6366f1';
  const fontSize = ((settings.fontSize as FontSize) || 'md');
  const compactMode = !!settings.compactMode;
  const animations = settings.animations !== false;
  const blurEffects = settings.blurEffects !== false;
  const sidebarCollapsed = !!settings.sidebarCollapsed;
  const fontFamily = ((settings.fontFamily as FontId) || 'DM Sans');
  const quietHoursEnabled = !!settings.quietHoursEnabled;
  const quietFrom = settings.quietFrom || '22:00';
  const quietTo = settings.quietTo || '08:00';
  const desktopNotifs = settings.desktopNotifs !== false;
  const badgeCount = settings.badgeCount !== false;
  const showOnline = settings.showOnline !== false;
  const loginAlerts = settings.loginAlerts !== false;
  const highContrast = !!settings.highContrast;
  const reduceMotion = !!settings.reduceMotion;
  const screenReader = !!settings.screenReader;
  const focusIndicator = settings.focusIndicator !== false;
  const language = settings.language || 'es';
  const timezone = settings.timezone || 'America/Lima';
  const dateFormat = (settings.dateFormat || 'dmy') as 'dmy' | 'mdy' | 'ymd';

  // ── Storage ──
  // Lo que la app ocupa en este dispositivo, medido por el navegador. Antes
  // eran números fijos ("124 MB", "24 %", "1.2 GB de archivos").
  const [almacenamiento, setAlmacenamiento] = useState<{ uso: number; cuota: number } | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.()
      .then(e => setAlmacenamiento({ uso: e.usage ?? 0, cuota: e.quota ?? 0 }))
      .catch(() => setAlmacenamiento(null));
  }, []);
  const mb = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`;
  const [cacheSize, setCacheSize] = useState('Calculando…');
  useEffect(() => {
    if (!('caches' in window)) { setCacheSize('No disponible en este dispositivo'); return; }
    let activo = true;
    caches.keys().then(keys => { if (activo) setCacheSize(`${keys.length} ${keys.length === 1 ? 'contenedor' : 'contenedores'} de recursos`); })
      .catch(() => { if (activo) setCacheSize('No disponible en este dispositivo'); });
    return () => { activo = false; };
  }, []);
  const [clearingCache, setClearingCache] = useState(false);
  const [clearCacheConfirm, setClearCacheConfirm] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  // ── Sessions ──
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // ── Activity ──
  const [activityLogs, setActivityLogs] = useState<UserActivityRecord[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);


  // ── UI ──
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarHistory, setAvatarHistory] = useState<AvatarRecord[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const cuentaActual = useRef(userProfile?.uid);
  cuentaActual.current = userProfile?.uid;

  // Los formularios también pertenecen a una cuenta: nunca heredar datos de la anterior.
  useEffect(() => {
    setDisplayName(userProfile?.displayName || ''); setPhone(userProfile?.phone || '');
    setBio(userProfile?.bio || ''); setWebsite(userProfile?.website || '');
    setPhotoPreview(userProfile?.avatar || null); setPendingFile(null); setCropSrc(null);
    setCurrentPw(''); setNewPassword(''); setConfirmPw('');
    setSessions([]); setActivityLogs([]); setAvatarHistory([]);
    setMessage(null); setSaving(false); setUploadingPhoto(false);
    setShowHistory(false); setPreviewUrl(null);
    // Un refresco del perfil no borra una edición en curso; un cambio de UID sí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.uid]);

  useEffect(() => () => { if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const esPantallaAncha = useEsPantallaAncha();


  // ─── Password strength ────────────────────────────────────────────────────
  useEffect(() => {
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasswordStrength(score);
  }, [newPassword]);

  // ─── Load sessions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'security' || !userProfile?.uid) return;
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingSessions(true);
    getUserSessions(userProfile.uid)
      .then(datos => { if (activo) setSessions(datos); })
      .catch(error => { console.error(error); if (activo) setMessage({ type: 'error', text: 'No se pudieron cargar los dispositivos. Vuelve a abrir Seguridad para reintentar.' }); })
      .finally(() => { if (activo) setLoadingSessions(false); });
    return () => { activo = false; };
  }, [activeTab, userProfile?.uid]);

  // ─── Load activity ────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'activity' || !userProfile?.uid) return;
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingActivity(true);
    getUserActivityLogs(userProfile.uid, 20)
      .then(datos => { if (activo) setActivityLogs(datos); })
      .catch(error => { console.error(error); if (activo) setMessage({ type: 'error', text: 'No se pudo cargar la actividad. Vuelve a abrir esta sección para reintentar.' }); })
      .finally(() => { if (activo) setLoadingActivity(false); });
    return () => { activo = false; };
  }, [activeTab, userProfile?.uid]);

  // ─── Avatar history + auto-cleanup ───────────────────────────────────────
  useEffect(() => {
    if (!userProfile?.uid) return;
    let activo = true;
    const uid = userProfile.uid;
    (async () => {
      try {
        const data = await getUserProfile(uid);
        if (!activo) return;
        const history = historialValido(data?.avatarHistory);
        const currentUrl = (userProfile.avatar ?? '').split('?')[0];
        const now = Date.now();
        const toDelete = history.filter(r =>
          now - new Date(r.uploadedAt).getTime() > SEVEN_DAYS_MS &&
          r.url.split('?')[0] !== currentUrl
        );
        if (toDelete.length > 0) {
          const resultados = await Promise.allSettled(toDelete.map(r => eliminarAvatarSeguro(r, uid)));
          if (!activo || cuentaActual.current !== uid) return;
          const eliminados = toDelete.filter((_, i) => resultados[i].status === 'fulfilled');
          const clean = history.filter(r => !eliminados.some(d => d.path === r.path && d.url === r.url));
          if (eliminados.length) await updateUserProfile(uid, { avatarHistory: clean });
          if (activo) setAvatarHistory(clean);
        } else {
          if (activo) setAvatarHistory(history);
        }
      } catch (e) { console.error(e); }
    })();
    return () => { activo = false; };
  }, [userProfile?.uid, userProfile?.avatar]);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const showMsg = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  }, []);

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%', background: 'var(--sidebar-card-bg)',
    border: `1px solid ${focusedField === field ? accentColor + '66' : 'var(--border-main)'}`,
    borderRadius: 10, padding: '10px 12px', fontSize: '1rem', fontWeight: 300,
    color: 'var(--text-primary)', outline: 'none', transition: 'all 0.2s ease',
    boxShadow: focusedField === field ? `0 0 0 3px ${accentColor}22` : 'none',
    WebkitAppearance: 'none' as React.CSSProperties['WebkitAppearance'],
  });

  const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#22c55e'][passwordStrength];
  const strengthLabel = ['', 'Muy débil', 'Débil', 'Regular', 'Fuerte', 'Muy fuerte'][passwordStrength];

  const cardStyle: React.CSSProperties = {
    borderRadius: 16, padding: 'var(--aj-card-padding, 20px)',
    border: '1px solid var(--moon-line)',
    background: 'var(--moon-surface)',
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: '0.7857rem', fontWeight: 600, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16,
  };
  const accentColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9'];

  const activeTabData = TABS.find(t => t.key === activeTab)!;
  const ActiveIcon = activeTabData.icon;
  const currentAvatarUrl = (userProfile?.avatar ?? '').split('?')[0];
  const isMuted = settings.notificationsMuted ?? false;
  const currentSound = (settings.notificationSound as SoundType) ?? 'default';
  const mensajeGuardado = estado === 'guardando' ? 'Guardando tus cambios…'
    : estado === 'error' ? 'Cambios locales · sin sincronizar'
    : !sincronizado ? 'Conectando tus preferencias…' : 'Preferencias sincronizadas';

  // ─── Photo select → open crop ─────────────────────────────────────────────
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showMsg('error', 'Máximo 10MB'); return; }
    if (!file.type.startsWith('image/')) { showMsg('error', 'Solo imágenes'); return; }
    const reader = new FileReader();
    reader.onload = ev => setCropSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ─── Crop saved → blob → preview ─────────────────────────────────────────
  const handleCropSave = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    setPhotoPreview(url);
    setPendingFile(new File([blob], 'avatar.webp', { type: 'image/webp' }));
    setCropSrc(null);
  }, []);

  // ─── Restore from history ─────────────────────────────────────────────────
  const handleRestoreAvatar = useCallback(async (record: AvatarRecord) => {
    if (!userProfile?.uid) return;
    const uid = userProfile.uid;
    setSaving(true);
    try {
      await updateUserProfile(uid, { avatar: record.url });
      void logUserActivity(uid, 'avatar_changed', 'Avatar restaurado del historial').catch(console.error);
      if (cuentaActual.current !== uid) return;
      await refreshProfile();
      setPhotoPreview(record.url);
      setShowHistory(false);
      showMsg('success', 'Foto restaurada correctamente');
    } catch (err: unknown) {
      if (cuentaActual.current === uid) showMsg('error', getErrMsg(err) || 'Error al restaurar');
    } finally { if (cuentaActual.current === uid) setSaving(false); }
  }, [userProfile, refreshProfile, showMsg]);

  // ─── Delete from history ──────────────────────────────────────────────────
  const handleDeleteFromHistory = useCallback(async (record: AvatarRecord) => {
    if (!userProfile?.uid) return;
    const uid = userProfile.uid;
    try {
      if (record.url.split('?')[0] === userProfile.avatar?.split('?')[0]) throw new Error('La foto actual no se puede eliminar desde el historial.');
      await eliminarAvatarSeguro(record, uid);
      if (cuentaActual.current !== uid) return;
      const newHistory = avatarHistory.filter(r => r.url !== record.url);
      await updateUserProfile(uid, { avatarHistory: newHistory });
      if (cuentaActual.current !== uid) return;
      setAvatarHistory(newHistory);
      showMsg('success', 'Foto eliminada');
    } catch (error) {
      if (cuentaActual.current === uid) showMsg('error', getErrMsg(error) || 'Error al eliminar foto');
    }
  }, [userProfile, avatarHistory, showMsg]);

  // ─── Save profile ─────────────────────────────────────────────────────────
  const handleUpdateProfile = async () => {
    if (!userProfile?.uid || saving) return;
    const uid = userProfile.uid;
    const nombre = displayName.trim();
    if (!nombre) { showMsg('error', 'Escribe tu nombre para guardar el perfil.'); return; }
    const web = website.trim();
    if (web) {
      try { const url = new URL(web); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('protocolo'); }
      catch { showMsg('error', 'El sitio web debe ser una dirección http:// o https:// válida.'); return; }
    }
    setSaving(true);
    try {
      let avatar = userProfile.avatar ?? '';
      let newHistory = [...avatarHistory];
      if (pendingFile) {
        setUploadingPhoto(true);
        const { url, path } = await uploadAvatarFile(pendingFile, uid);
        if (cuentaActual.current !== uid) return;
        const oldAvatar = userProfile.avatar ?? '';
        if (oldAvatar && !newHistory.some(r => r.url.split('?')[0] === oldAvatar.split('?')[0])) {
          newHistory.unshift({ url: oldAvatar, path: extractAvatarPath(oldAvatar), uploadedAt: new Date().toISOString() });
        }
        newHistory.unshift({ url, path, uploadedAt: new Date().toISOString() });
        avatar = url;
      }
      await updateUserProfile(uid, { displayName: nombre, phone: phone.trim(), bio: bio.trim(), website: web, avatar, avatarHistory: newHistory });
      void logUserActivity(uid, pendingFile ? 'avatar_changed' : 'profile_updated', pendingFile ? 'Perfil y avatar actualizados' : 'Perfil actualizado').catch(console.error);
      if (cuentaActual.current !== uid) return;
      await refreshProfile();
      if (cuentaActual.current !== uid) return;
      setPhotoPreview(avatar || null); setPendingFile(null);
      setAvatarHistory(newHistory);
      showMsg('success', 'Perfil actualizado correctamente');
    } catch (err: unknown) {
      if (cuentaActual.current === uid) showMsg('error', getErrMsg(err) || 'Error al guardar');
    } finally { if (cuentaActual.current === uid) { setSaving(false); setUploadingPhoto(false); } }
  };

  // ─── Password ─────────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (newPassword !== confirmPw) { showMsg('error', 'Las contraseñas no coinciden'); return; }
    if (newPassword.length < 8)   { showMsg('error', 'Mínimo 8 caracteres'); return; }
    if (!currentPw)               { showMsg('error', 'Ingresa tu contraseña actual'); return; }
    setPwLoading(true);
    try {
      await updateUserPassword(currentPw, newPassword);
      if (userProfile?.uid) await logUserActivity(userProfile.uid, 'password_changed', 'Contraseña actualizada');
      showMsg('success', 'Contraseña actualizada correctamente');
      setCurrentPw(''); setNewPassword(''); setConfirmPw('');
    } catch (err: unknown) {
      const code = getErrCode(err);
      showMsg('error', code === 'auth/wrong-password' || code === 'auth/invalid-credential'
        ? 'Contraseña actual incorrecta' : getErrMsg(err) || 'Error al cambiar contraseña');
    } finally { setPwLoading(false); }
  };

  const handleRevokeSession = async (id: string) => {
    try { await revokeSession(id); }
    catch (e) { console.error(e); showMsg('error', 'No se pudo cerrar esa sesión'); return; }
    setSessions(prev => prev.filter(s => s.id !== id));
    if (userProfile?.uid) await logUserActivity(userProfile.uid, 'session_revoked', 'Sesión cerrada remotamente');
    showMsg('success', 'Sesión cerrada');
  };

  const handleRevokeAllSessions = async () => {
    if (!userProfile?.uid) return;
    try { await revokeAllOtherSessions(userProfile.uid); }
    catch (e) { console.error(e); showMsg('error', 'No se pudieron cerrar las otras sesiones'); return; }
    setSessions(prev => prev.filter(s => s.current));
    await logUserActivity(userProfile.uid, 'session_revoked', 'Todas las otras sesiones cerradas');
    showMsg('success', 'Otras sesiones cerradas');
  };

  const handleClearCache = async () => {
    if (clearingCache) return;
    if (!clearCacheConfirm) { setClearCacheConfirm(true); return; }
    setClearingCache(true);
    try {
      if (!('caches' in window)) throw new Error('Este dispositivo no expone una caché de recursos que se pueda limpiar.');
      const keys = await caches.keys();
      const resultados = await Promise.allSettled(keys.map(k => caches.delete(k)));
      if (resultados.some(r => r.status === 'rejected')) throw new Error('Algunos recursos no se pudieron limpiar. Inténtalo de nuevo.');
      const restantes = await caches.keys();
      setCacheSize(`${restantes.length} contenedores de recursos`);
      const estimacion = await navigator.storage?.estimate?.();
      if (estimacion) setAlmacenamiento({ uso: estimacion.usage ?? 0, cuota: estimacion.quota ?? 0 });
      showMsg('success', 'Caché de recursos eliminada. Tu sesión y tus preferencias se conservan.');
    } catch (error) {
      showMsg('error', getErrMsg(error));
    } finally {
      setClearingCache(false); setClearCacheConfirm(false);
    }
  };

  const handleExportData = async () => {
    if (!userProfile?.uid) return;
    setExportingData(true);
    try {
      const uid = userProfile.uid;
      const [profile, activityLogs] = await Promise.all([getUserProfile(uid), getUserActivityLogs(uid, 100)]);
      if (cuentaActual.current !== uid) return;
      const payload = { exportedAt: new Date().toISOString(), profile, settings, activityLogs };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const enlace = document.createElement('a');
      enlace.href = url; enlace.download = `moon-mis-datos-${uid.slice(0, 8)}.json`; enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showMsg('success', 'Perfil, preferencias y actividad exportados correctamente');
    }
    catch { showMsg('error', 'Error al exportar datos'); }
    finally { setExportingData(false); }
  };

  // Importar: el JSON de «Exportar» (o uno con solo la configuración). Lo que no
  // es una opción válida se ignora (lo limpia SettingsContext).
  const importInputRef = useRef<HTMLInputElement>(null);
  const handleImportSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('demasiado grande');
      const datos = JSON.parse(await file.text());
      const ajustes = datos?.settings ?? datos;
      if (!ajustes || typeof ajustes !== 'object' || Array.isArray(ajustes)) throw new Error('formato');
      const validas = limpiarCambios(ajustes);
      if (!Object.keys(validas).length) throw new Error('vacío');
      await updateSettings(validas as Partial<typeof settings>);
      showMsg('success', `Configuración importada (${Object.keys(validas).length} opciones)`);
    } catch {
      showMsg('error', 'Ese archivo no es una configuración exportada del portal');
    }
  };

  const handleFontChange = (fontId: FontId) => {
    const opt = FONT_OPTIONS.find(f => f.id === fontId);
    if (!opt) return;
    loadGoogleFont(opt.url, fontId);
    updateSettings({ fontFamily: fontId });
    showMsg('success', `Fuente cambiada a ${opt.label}`);
  };

  const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const [appVersion, setAppVersion] = useState<string>('—');
  useEffect(() => {
    if (!IS_TAURI) return;
    getVersion().then(setAppVersion).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aviso de versión nueva en el encabezado y el menú (estado de lib/actualizador).
  const actualizacion = useActualizador();
  const pendingUpdate = (actualizacion.fase === 'disponible' || actualizacion.fase === 'lista') && actualizacion.version
    ? { version: actualizacion.version } : null;

  const daysUntilExpiry = (uploadedAt: string) =>
    Math.max(0, 7 - Math.floor((Date.now() - new Date(uploadedAt).getTime()) / 86_400_000));

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <section className="moon-module moon-module--settings">
      <style>{`
        @keyframes fadeIn    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeInUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(24px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes modalIn   { from{opacity:0} to{opacity:1} }
        @keyframes toastIn   { from{opacity:0;transform:translateX(14px)} to{opacity:1;transform:translateX(0)} }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes shimmer   { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes tabSwitch { from{opacity:0} to{opacity:1} }
        @keyframes scaleIn   { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }

        .s-fadeIn, .s-tabIn { opacity: 1; }
        .s-slideIn  { animation: toastIn  0.22s ease forwards; }
        .s-scaleIn  { animation: scaleIn  0.25s cubic-bezier(0.2,0.8,0.2,1) forwards; }

        .s-scroll::-webkit-scrollbar       { width: 3px; height: 3px; }
        .s-scroll::-webkit-scrollbar-track { background: transparent; }
        .s-scroll::-webkit-scrollbar-thumb { background: var(--border-main); border-radius: 4px; }

        .s-input, .s-select, .s-textarea { font-size: 16px !important; }
        @media (min-width:640px) { .s-input,.s-select,.s-textarea { font-size:14px !important; } }

        .s-tab-item { transition: all 0.18s ease; }
        .s-tab-item:hover { background: var(--overlay-bg) !important; }

        .s-card-hover { transition: all 0.18s ease; cursor: pointer; }
        .s-card-hover:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,0.15); }

        .font-card { transition: all 0.18s ease; cursor: pointer; }
        .font-card:hover { background: var(--overlay-bg) !important; border-color: var(--border-main) !important; }

        .avatar-btn { transition: all 0.2s ease; }
        .avatar-btn:hover { transform: scale(1.04); }

        .history-photo-card { transition: all 0.18s ease; }
        .history-photo-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }

        .s-tab-dropdown {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0;
          background: var(--bg-sidebar); border: 1px solid var(--border-main);
          border-radius: 14px; overflow: hidden; z-index: 100;
          backdrop-filter: blur(20px); box-shadow: 0 16px 40px rgba(0,0,0,0.3);
          animation: scaleIn 0.2s cubic-bezier(0.2,0.8,0.2,1) forwards;
        }

        input::placeholder, textarea::placeholder { color: var(--content-quaternary,#555); }
        select option { background: var(--bg-sidebar); color: var(--text-primary); }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.4); cursor: pointer; }
        input[type="color"] { -webkit-appearance: none; cursor: pointer; }
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type="color"]::-webkit-color-swatch { border: none; border-radius: 50%; }
        input[type="range"] { cursor: pointer; }

        html.light input[type="time"]::-webkit-calendar-picker-indicator { filter: opacity(0.4); }
        html.light .s-tab-dropdown { box-shadow: 0 16px 40px rgba(0,0,0,0.12); }

        /* Menú de la configuración */
        .aj-nav-item { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 10px; border: none; background: none; cursor: pointer; text-align: left; font-size: 13px; color: var(--text-muted); transition: background .18s ease, color .18s ease; }
        .aj-nav-item:hover { background: var(--overlay-bg, rgba(127,127,127,0.08)); color: var(--text-primary); }
        .aj-nav-item[aria-current="page"] { color: var(--text-primary); font-weight: 500; }
        .aj-nav-item[aria-current="page"]::before { content: ''; position: absolute; left: 0; top: 7px; bottom: 7px; width: 3px; border-radius: 3px; background: var(--accent-user); }
        .s-card-hover:hover, .history-photo-card:hover { transform: none !important; }
      `}</style>

      {/* ── Modales ── */}
      {cropSrc && (
        <AvatarCropModal src={cropSrc} accentColor={accentColor}
          onSave={handleCropSave} onClose={() => setCropSrc(null)} />
      )}
      {showHistory && (
        <AvatarHistoryModal 
  history={avatarHistory.filter(r => r.url.split('?')[0] !== currentAvatarUrl)} 
  currentUrl={currentAvatarUrl}
          accentColor={accentColor} onSelect={handleRestoreAvatar}
          onDelete={handleDeleteFromHistory} onClose={() => setShowHistory(false)} />
      )}

      {/* ── Lightbox ── */}
      {previewUrl && <FotoAmpliada src={previewUrl} onClose={() => setPreviewUrl(null)} />}

      {/* ── Toast ── */}
      <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 'calc(100vw - 32px)' }}>
        {message && (
          <div className={`s-slideIn px-4 py-3 rounded-2xl text-sm font-light flex items-center gap-3 backdrop-blur-xl border ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span className="truncate">{message.text}</span>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
      <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportSettings} className="hidden" />

      <div className="w-full mx-auto" style={{ maxWidth: esPantallaAncha ? 1180 : 900, color: 'var(--text-primary)' }}>
        <div className="aj-workspace-tools">
          <div><span className="aj-workspace-eyebrow">TU ESPACIO · TUS PREFERENCIAS</span><p>Una configuración que trabaja contigo.</p></div>
          <div className="aj-section-search" data-moon-field-frame><Search size={18} aria-hidden="true" /><input aria-label="Buscar en configuración" placeholder="Buscar contraseña, tema, sesiones…" value={sectionQuery} onChange={event => setSectionQuery(event.target.value)} />{sectionQuery && <button type="button" aria-label="Limpiar búsqueda de configuración" onClick={() => setSectionQuery('')}><X size={17} /></button>}</div>
        </div>
        {sectionQuery.trim() && <div className="aj-search-matches" aria-label="Secciones encontradas"><p role="status">{matchingTabs.length ? `${matchingTabs.length} ${matchingTabs.length === 1 ? 'sección encontrada' : 'secciones encontradas'}` : 'Sin coincidencias. Prueba con tema, sesiones o exportar.'}</p>{matchingTabs.map(({key,label,icon:Icon}) => <button key={key} type="button" onClick={() => { setActiveTab(key); setSectionQuery(''); setMobileTabOpen(false); }}><Icon size={16} />{label}</button>)}</div>}
        {/* ── Header (solo en pantallas chicas; en grandes va en la columna) ── */}
        {!esPantallaAncha && <div className="mb-6 text-center px-4">
          <h1 className="moon-page-title text-xl font-light tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>Configuración</h1>
          <p className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>Gestiona tu cuenta, privacidad y preferencias</p>
          {/* Se guarda solo, al momento, y se sincroniza con tus otros dispositivos. */}
          <div role="status" aria-live="polite" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.7857rem', color: estado === 'error' ? 'var(--moon-danger)' : 'var(--text-muted)' }}>
            {estado === 'guardando' ? <Loader2 size={11} className="animate-spin" /> : estado === 'error' ? <AlertCircle size={11} /> : <CheckCircle2 size={11} style={{ color: '#34d399' }} />}
            {mensajeGuardado}
          </div>
          {estado === 'error' && <button type="button" className="aj-retry" onClick={() => void reintentarGuardado()}><RotateCcw size={12} /> Reintentar sincronización</button>}
          {pendingUpdate && (
            <div
              onClick={() => setActiveTab('activity')}
              style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.08)')}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.7)', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '0.8571rem', color: '#34d399' }}>
                Nueva versión <strong>v{pendingUpdate.version}</strong> disponible
              </span>
              <span style={{ fontSize: '0.7857rem', color: 'rgba(52,211,153,0.6)' }}>→ Ver</span>
            </div>
          )}
        </div>}

        {/* ── MOBILE ── (solo se monta el layout que corresponde al ancho) */}
        {!esPantallaAncha && (
        <div className="block lg:hidden px-3">
          <div className="relative mb-4" style={{ zIndex: 50 }}>
            <button aria-label="Seleccionar sección de configuración" aria-expanded={mobileTabOpen} aria-controls="aj-mobile-sections" onClick={() => setMobileTabOpen(o => !o)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 14px', borderRadius: 12, background: 'var(--sidebar-card-bg)',
              border: `1px solid ${mobileTabOpen ? accentColor + '55' : 'var(--border-main)'}`,
              color: 'var(--text-primary)', cursor: 'pointer',
              boxShadow: mobileTabOpen ? `0 0 0 2px ${accentColor}22` : 'none',
              transition: 'all 0.2s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accentColor}20`, border: `1px solid ${accentColor}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ActiveIcon size={14} style={{ color: 'var(--accent-user-ink)' }} />
                </div>
                <span style={{ fontSize: '1rem', fontWeight: 400 }}>{activeTabData.label}</span>
              </div>
              <ChevronDown size={16} style={{ color: 'var(--text-muted)', transform: mobileTabOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
            </button>
            {mobileTabOpen && (
              <div id="aj-mobile-sections" className="s-tab-dropdown">
                {TABS.map(({ key, label, icon: Icon }) => {
                  const isActive = activeTab === key;
                  return (
                    <button key={key} onClick={() => { setActiveTab(key); setMobileTabOpen(false); }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', background: isActive ? `${accentColor}18` : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border-main)',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}>
                      <Icon size={15} style={{ color: isActive ? accentColor : 'var(--text-muted)' }} />
                      <span style={{ fontSize: '1rem', flex: 1 }}>{label}</span>
                      {key === 'activity' && pendingUpdate && !isActive && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', flexShrink: 0, boxShadow: '0 0 6px rgba(52,211,153,0.7)' }} />
                      )}
                      {isActive && <CheckCircle2 size={13} style={{ color: 'var(--accent-user-ink)', marginLeft: 'auto' }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <TabContent key={activeTab} activeTab={activeTab} props={buildProps()} />
        </div>
        )}

        {/* ── DESKTOP ── */}
        {esPantallaAncha && (
        <div className="hidden lg:flex gap-8 px-6 py-2">
          <nav aria-label="Secciones de la configuración" style={{ width: 230, flexShrink: 0, position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
            <div style={{ padding: '4px 10px 18px' }}>
              <h1 className="moon-page-title" style={{ margin: 0, fontSize: '1.7143rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Configuración</h1>
              <div role="status" aria-live="polite" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7857rem', color: estado === 'error' ? 'var(--moon-danger)' : 'var(--text-muted)' }}>
                {estado === 'guardando' ? <Loader2 size={11} className="animate-spin" /> : estado === 'error' ? <AlertCircle size={11} /> : <CheckCircle2 size={11} style={{ color: '#34d399' }} />}
                {mensajeGuardado}
              </div>
              {estado === 'error' && <button type="button" className="aj-retry" onClick={() => void reintentarGuardado()}><RotateCcw size={12} /> Reintentar</button>}
            </div>
            {GRUPOS_TABS.map(grupo => (
              <div key={grupo} style={{ marginBottom: 14 }}>
                <div style={{ padding: '0 10px 6px', fontSize: '0.7143rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', opacity: 0.8 }}>{grupo}</div>
                {TABS.filter(t => t.grupo === grupo).map(({ key, label, icon: Icon }) => {
                  const active = activeTab === key;
                  return (
                    <button key={key} type="button" className="aj-nav-item" aria-current={active ? 'page' : undefined} onClick={() => setActiveTab(key)}>
                      <Icon size={15} strokeWidth={active ? 2 : 1.5} style={{ color: active ? accentColor : undefined, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{label}</span>
                      {key === 'activity' && pendingUpdate && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} title="Hay una versión nueva" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {pendingUpdate && (
              <button type="button" onClick={() => setActiveTab('activity')} className="aj-nav-item" style={{ marginTop: 4, color: '#34d399', fontSize: '0.8571rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
                Versión v{pendingUpdate.version} disponible
              </button>
            )}
          </nav>
          <div className="flex-1 min-w-0" style={{ maxWidth: 860 }}>
            <header key={`cab-${activeTab}`} className="s-fadeIn" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${accentColor}18`, border: `1px solid ${accentColor}33`, flexShrink: 0 }}>
                <ActiveIcon size={18} style={{ color: 'var(--accent-user-ink)' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '1.2857rem', fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{activeTabData.label}</h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.8571rem', color: 'var(--text-muted)' }}>{activeTabData.desc}</p>
              </div>
            </header>
            <TabContent key={activeTab} activeTab={activeTab} props={buildProps()} />
          </div>
        </div>
        )}
      </div>
    </section>
  );

  function buildProps() {
    return {
      userProfile, refreshProfile, settings, updateSettings, isDark,
      displayName, setDisplayName, phone, setPhone, bio, setBio, website, setWebsite,
      photoPreview, setPhotoPreview, pendingFile, setPendingFile, uploadingPhoto,
      cropSrc, setCropSrc,
      currentPw, setCurrentPw, newPassword, setNewPassword, confirmPw, setConfirmPw,
      showPw0, setShowPw0, showPw1, setShowPw1, showPw2, setShowPw2, pwLoading,
      accentColor, fontSize, compactMode,
      animations, blurEffects, sidebarCollapsed,
      fontFamily, handleFontChange,
      quietHoursEnabled, quietFrom, quietTo,
      desktopNotifs, badgeCount, showOnline, loginAlerts,
      highContrast, reduceMotion, screenReader,
      focusIndicator, language, timezone, dateFormat, cacheSize, almacenamiento, mb, clearingCache, clearCacheConfirm, exportingData,
      sessions, loadingSessions, activityLogs, loadingActivity,
      saving, avatarHistory, setAvatarHistory, previewUrl, setPreviewUrl,
      focusedField, setFocusedField, passwordStrength,
      strengthColor, strengthLabel, cardStyle, sectionTitle, accentColors,
      inputStyle, currentAvatarUrl, isMuted, currentSound, bd,
      handlePhotoSelect, handleUpdateProfile, handleChangePassword,
      handleRevokeSession, handleRevokeAllSessions, handleClearCache, handleExportData,
      daysUntilExpiry, showMsg, importInputRef, restablecer,
      fileInputRef, showHistory, setShowHistory, IS_TAURI, appVersion,
    };
  }
};

// ── Row component — fuera de TabContent para no recrearse en cada render ─────
interface RowProps {
  label: string; desc: string; icon: React.ElementType; color: string;
  checked: boolean; onChange: (v: boolean) => void; last?: boolean; bd: string;
}
const Row: React.FC<RowProps> = ({ label, desc, icon: Icon, color, checked, onChange, last, bd: rowBd }) => (
  <div className="aj-option-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--aj-row-padding, 13px) 0', borderBottom: last ? 'none' : `1px solid ${rowBd}`, transition: 'background 0.15s ease' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, marginRight: 12 }}>
      <div style={{ width: 30, height: 30, minWidth: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', ...(checked ? { background: `${color}25`, boxShadow: `0 0 0 1px ${color}33` } : {}) }}>
        <Icon size={14} style={{ color: checked ? color : `${color}88` }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
    <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// TAB CONTENT
// ══════════════════════════════════════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TabContent: React.FC<{ activeTab: TabKey; props: any }> = ({ activeTab, props: p }) => {
  const {
    userProfile, settings, updateSettings,
    displayName, setDisplayName, phone, setPhone, bio, setBio, website, setWebsite,
    photoPreview, setPhotoPreview, uploadingPhoto, pendingFile, setPendingFile,
    currentPw, setCurrentPw, newPassword, setNewPassword, confirmPw, setConfirmPw,
    showPw0, setShowPw0, showPw1, setShowPw1, showPw2, setShowPw2, pwLoading,
    accentColor, fontSize, compactMode,
    animations, blurEffects, sidebarCollapsed,
    fontFamily, handleFontChange,
    quietHoursEnabled, quietFrom, quietTo,
    desktopNotifs, badgeCount, showOnline, loginAlerts,
    highContrast, reduceMotion, screenReader,
    focusIndicator, language, timezone, dateFormat,
    cacheSize, almacenamiento, mb, clearingCache, clearCacheConfirm, exportingData,
    sessions, loadingSessions, activityLogs, loadingActivity,
    saving, avatarHistory, setPreviewUrl,
    setFocusedField, passwordStrength,
    strengthColor, strengthLabel, cardStyle, sectionTitle, accentColors,
    inputStyle, currentAvatarUrl, isMuted, currentSound, bd,
    handleUpdateProfile, handleChangePassword,
    handleRevokeSession, handleRevokeAllSessions, handleClearCache, handleExportData,
    daysUntilExpiry, showMsg, importInputRef, restablecer,
    fileInputRef, setShowHistory, IS_TAURI,
  } = p;
  const [verTodosDispositivos, setVerTodosDispositivos] = useState(false);

  // Las muestras de fuentes solo hacen solicitudes cuando se abre Apariencia.
  useEffect(() => {
    if (activeTab === 'appearance') FONT_OPTIONS.forEach(opt => loadGoogleFont(opt.url, opt.id));
  }, [activeTab]);

  // Row component is defined outside TabContent to avoid recreating on render

  return (
    <div className="s-scroll" style={{ overflowY: 'auto' }}>
      <div className="s-fadeIn space-y-3">

        {/* ══ PERFIL ══ */}
        {activeTab === 'profile' && (
          <>
            {/* Avatar card */}
            <div className="aj-card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                {/* Avatar con acciones */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 80, height: 80, borderRadius: 20, overflow: 'hidden', border: `2px solid ${pendingFile ? accentColor + '88' : 'var(--border-main)'}`, position: 'relative', transition: 'border-color 0.3s ease' }}>
                    {uploadingPhoto ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-user-ink)' }} />
                      </div>
                    ) : photoPreview ? (
                      <img src={photoPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => setPreviewUrl(photoPreview)} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-bg)' }}>
                        <User size={28} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                    {/* Overlay hover */}
                    <button disabled={saving} type="button" aria-label="Cambiar foto de perfil" className="aj-avatar-action" onClick={() => fileInputRef.current?.click()} style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', border: 0, borderRadius: 18, cursor: 'pointer', transition: 'background 0.2s ease',
                    }}><Camera size={18} style={{ color: 'white', transition: 'opacity 0.2s ease' }} /></button>
                  </div>
                  {/* Indicador de cambio pendiente */}
                  {pendingFile && (
                    <div style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: accentColor, border: '2px solid var(--bg-sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse 2s infinite' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'white' }} />
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '1.1429rem', fontWeight: 300, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {userProfile?.displayName || 'Usuario'}
                  </div>
                  <div style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                    {userProfile?.role}
                  </div>
                  {userProfile?.uid && <IdentificadorUsuario uid={userProfile.uid} />}
                  {/* Botones de acción del avatar */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button disabled={saving} className="avatar-btn" onClick={() => fileInputRef.current?.click()}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.8571rem', cursor: 'pointer', border: `1px solid ${accentColor}44`, background: `${accentColor}14`, color: 'var(--accent-user-ink)' }}>
                      <Camera size={12} /> Cambiar foto
                    </button>
                    {avatarHistory.length > 0 && (
                      <button disabled={saving} className="avatar-btn" onClick={() => setShowHistory(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.8571rem', cursor: 'pointer', border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-muted)' }}>
                        <History size={12} /> Historial ({avatarHistory.length})
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border-main)', marginBottom: 16 }} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
                {[
                  { label: 'Nombre completo', field: 'name',    value: displayName, set: setDisplayName, placeholder: 'Tu nombre' },
                  { label: 'Teléfono',         field: 'phone',   value: phone,        set: setPhone,        placeholder: '+51 999 999 999' },
                  { label: 'Sitio web',        field: 'website', value: website,      set: setWebsite,      placeholder: 'https://tu-sitio.com' },
                  { label: 'Correo (no editable)', field: 'email', value: userProfile?.email || '', set: () => {}, placeholder: '', disabled: true },
                ].map(({ label, field, value, set, placeholder, disabled }: ProfileField) => (
                  <div key={field}>
                  <label htmlFor={`aj-profile-${field}`} style={{ fontSize: '0.7143rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>{label}</label>
                    <input id={`aj-profile-${field}`} type={field === 'phone' ? 'tel' : field === 'website' ? 'url' : field === 'email' ? 'email' : 'text'} autoComplete={field === 'name' ? 'name' : field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'url'} className="s-input" style={{ ...inputStyle(field), ...(disabled ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
                      value={value} onChange={e => !disabled && set(e.target.value)}
                      onFocus={() => !disabled && setFocusedField(field)} onBlur={() => setFocusedField(null)}
                      placeholder={placeholder} disabled={disabled} />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="aj-profile-bio" style={{ fontSize: '0.7143rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Bio</label>
                  <textarea id="aj-profile-bio" className="s-textarea" style={{ ...inputStyle('bio'), resize: 'none', minHeight: 72 } as React.CSSProperties}
                    value={bio} onChange={e => setBio(e.target.value)}
                    onFocus={() => setFocusedField('bio')} onBlur={() => setFocusedField(null)}
                    placeholder="Cuéntanos algo sobre ti…" maxLength={160} />
                  <div style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: 3 }}>{bio.length}/160</div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-main)', paddingTop: 14 }}>
                <button disabled={saving} style={{ fontSize: '0.8571rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', borderRadius: 8, transition: 'all 0.15s ease' }}
                  onClick={() => { setDisplayName(userProfile?.displayName || ''); setPhone(userProfile?.phone || ''); setBio(userProfile?.bio || ''); setWebsite(userProfile?.website || ''); setPendingFile(null); setPhotoPreview(userProfile?.avatar || null); }}>
                  Cancelar
                </button>
                <button onClick={handleUpdateProfile} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, fontSize: '0.9286rem', fontWeight: 500, background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'all 0.2s ease' }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 size={14} />}
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>

            {/* Mini historial preview */}
            {avatarHistory.length > 0 && (
              <div className="aj-card" style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>Fotos anteriores</span>
                    <span style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', background: 'var(--overlay-bg)', padding: '1px 8px', borderRadius: 20 }}>{avatarHistory.length}</span>
                  </div>
                  <button onClick={() => setShowHistory(true)}
                    style={{ fontSize: '0.8571rem', color: 'var(--accent-user-ink)', background: `${accentColor}14`, border: `1px solid ${accentColor}33`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
                    Ver todo
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }} className="s-scroll">
                 {(avatarHistory as AvatarRecord[]).slice(0, 6).map((r: AvatarRecord) => {
                    const days = daysUntilExpiry(r.uploadedAt);
                    const isCurrent = r.url.split('?')[0] === currentAvatarUrl;
                    return (
                      <div key={r.url} className="history-photo-card" onClick={() => setShowHistory(true)}
                        style={{ position: 'relative', flexShrink: 0, width: 56, height: 56, borderRadius: 12, overflow: 'hidden', border: `2px solid ${isCurrent ? accentColor : 'var(--border-main)'}`, cursor: 'pointer' }}>
                        <img src={r.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {isCurrent && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accentColor}22` }}>
                            <Star size={14} style={{ color: 'var(--accent-user-ink)' }} fill={accentColor} />
                          </div>
                        )}
                        {/* Barra de tiempo */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.4)' }}>
                          <div style={{ height: '100%', width: `${(days / 7) * 100}%`, background: days <= 1 ? '#ef4444' : days <= 3 ? '#f97316' : accentColor, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  Al abrir Configuración se limpian las fotos anteriores de más de 7 días. Tu foto actual se conserva.
                </p>
              </div>
            )}
          </>
        )}

        {/* ══ APARIENCIA ══ */}
        {activeTab === 'appearance' && (
          <>
            {/* Live preview */}
            <div style={{ ...cardStyle, border: `1px solid ${accentColor}33`, background: `${accentColor}08` }}>
              <div style={{ ...sectionTitle, color: 'var(--accent-user-ink)' }}>Vista previa — cambios en tiempo real</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: `${accentColor}12`, border: `1px solid ${accentColor}25` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
                <span style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>Acento activo: <strong style={{ color: 'var(--accent-user-ink)' }}>{accentColor}</strong></span>
                <span style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>Fuente: {fontFamily}</span>
              </div>
            </div>

            {/* Tema */}
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Tema de color</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {(['dark', 'light', 'system'] as const).map(t => {
                  const currentTheme = (settings.theme || 'system') as string;
                  const isActive = currentTheme === t;
                  return (
                    <button key={t} aria-pressed={isActive} onClick={() => updateSettings({ theme: t })}
                      style={{
                        padding: '14px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'center' as const,
                        border: `1px solid ${isActive ? accentColor + '55' : bd}`,
                        background: isActive ? `${accentColor}14` : 'var(--sidebar-card-bg)',
                        transition: 'all 0.2s cubic-bezier(0.2,0.8,0.2,1)',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                        {t === 'dark' ? <Moon size={18} style={{ color: isActive ? accentColor : 'var(--text-muted)' }} />
                          : t === 'light' ? <Sun size={18} style={{ color: isActive ? accentColor : 'var(--text-muted)' }} />
                            : <Monitor size={18} style={{ color: isActive ? accentColor : 'var(--text-muted)' }} />}
                      </div>
                      <div style={{ fontSize: '0.8571rem', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isActive ? 500 : 300, marginBottom: 4 }}>
                        {t === 'dark' ? 'Oscuro' : t === 'light' ? 'Claro' : 'Sistema'}
                      </div>
                      <div style={{ fontSize: '0.7143rem', color: isActive ? `${accentColor}cc` : 'var(--text-muted)' }}>
                        {t === 'dark' ? '#0c0d0e' : t === 'light' ? '#f3f3f0' : 'Auto'}
                      </div>
                      {isActive && <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}><CheckCircle2 size={12} style={{ color: 'var(--accent-user-ink)' }} /></div>}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', marginTop: 10 }}>"Sistema" detecta automáticamente la preferencia del SO.</p>
            </div>

            {/* Color de acento */}
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Color de acento</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {accentColors.map((color: string) => (
                  <button key={color} aria-label={`Usar acento ${color}`} aria-pressed={accentColor === color} onClick={() => { updateSettings({ accentColor: color }); showMsg('success', 'Color actualizado'); }}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: color, border: 'none', cursor: 'pointer', outline: accentColor === color ? `3px solid ${color}` : '2px solid transparent', outlineOffset: 2, transform: accentColor === color ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.2s cubic-bezier(0.2,0.8,0.2,1)', boxShadow: accentColor === color ? `0 4px 12px ${color}66` : 'none' }} />
                ))}
                <input type="color" value={accentColor}
                  onChange={e => { updateSettings({ accentColor: e.target.value }); }}
                  style={{ width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', border: '1px dashed var(--border-main)', background: 'transparent', padding: 0 }}
                  title="Color personalizado" />
              </div>
            </div>

            {/* Tipografía */}
            <div className="aj-card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Type size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={sectionTitle as React.CSSProperties}>Tipografía</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 165px), 1fr))', gap: 8 }}>
                {FONT_OPTIONS.map(opt => {
                  const isSelected = fontFamily === opt.id;
                  return (
                    <button key={opt.id} aria-pressed={isSelected} className="font-card" onClick={() => handleFontChange(opt.id as FontId)}
                      style={{ padding: '12px', borderRadius: 12, textAlign: 'left' as const, border: `1px solid ${isSelected ? accentColor + '55' : 'var(--border-main)'}`, background: isSelected ? `${accentColor}12` : 'var(--sidebar-card-bg)', cursor: 'pointer', transition: 'all 0.18s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.8571rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: `'${opt.preview}', sans-serif`, fontWeight: 400 }}>
                          {opt.label}
                        </span>
                        {isSelected && <CheckCircle2 size={12} style={{ color: 'var(--accent-user-ink)', flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: '1.4286rem', fontFamily: `'${opt.preview}', sans-serif`, fontWeight: 300, color: isSelected ? 'var(--accent-user-ink)' : 'var(--text-muted)', lineHeight: 1.2, marginBottom: 4 }}>
                        Aa Bb Cc
                      </div>
                      <div style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', fontFamily: `'${opt.preview}', sans-serif` }}>
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', marginTop: 10 }}>La fuente se aplica instantáneamente a todo el dashboard.</p>
            </div>

            {/* Tamaño de fuente */}
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Tamaño de fuente</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {FONT_SIZES.map(size => (
                  <button key={size} aria-label={`Tamaño de texto ${size.toUpperCase()}`} aria-pressed={fontSize === size} onClick={() => { updateSettings({ fontSize: size }); showMsg('success', 'Tamaño actualizado'); }}
                    style={{ padding: '9px 4px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${fontSize === size ? accentColor + '55' : bd}`, background: fontSize === size ? `${accentColor}14` : 'var(--sidebar-card-bg)', fontSize: size === 'xs' ? 10 : size === 'sm' ? 11 : size === 'md' ? 13 : size === 'lg' ? 15 : 17, color: fontSize === size ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'all 0.18s cubic-bezier(0.2,0.8,0.2,1)' }}>Aa</button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.7143rem', color: 'var(--text-muted)' }}>
                <span>XS</span><span>XL</span>
              </div>
            </div>

            {/* Opciones visuales */}
            <WorkspaceMotionControl panel />
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Opciones visuales</div>
              <Row label="Modo compacto" desc="Reduce el espaciado en la interfaz" icon={Layout} color="#60a5fa"
                checked={compactMode} onChange={v => { updateSettings({ compactMode: v }); showMsg('success', `Modo compacto ${v ? 'activado' : 'desactivado'}`); }} bd={bd} />
              <Row label="Animaciones" desc="Transiciones y efectos de movimiento" icon={Zap} color="#a78bfa"
                checked={animations} onChange={v => { updateSettings({ animations: v }); showMsg('success', `Animaciones ${v ? 'activadas' : 'desactivadas'}`); }} bd={bd} />
              <Row label="Efectos de desenfoque" desc="Blur en fondos (usa más GPU)" icon={Maximize2} color="#34d399"
                checked={blurEffects} onChange={v => { updateSettings({ blurEffects: v }); showMsg('success', `Blur ${v ? 'activado' : 'desactivado'}`); }} bd={bd} />
              <Row label="Sidebar colapsada" desc="Solo iconos en el menú lateral" icon={Layout} color="#fb923c"
                checked={sidebarCollapsed} onChange={v => { updateSettings({ sidebarCollapsed: v }); showMsg('success', `Sidebar ${v ? 'colapsada' : 'expandida'}`); }} last bd={bd} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={async () => { await restablecer(["theme","accentColor","fontFamily","fontSize","compactMode","animations","blurEffects","sidebarCollapsed"]); showMsg('success', 'Apariencia restablecida'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontSize: '0.8571rem', cursor: 'pointer', border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-muted)' }}>
                <RotateCcw size={12} /> Restablecer esta sección
              </button>
            </div>
          </>
        )}

        {/* ══ NOTIFICACIONES ══ */}
        {activeTab === 'notifications' && (
          <>
            <div className="aj-card" style={cardStyle}>
              <Row label="Recibir notificaciones" desc="Activa los avisos y sonidos del dashboard. Tu bandeja conserva las novedades para consultarlas cuando quieras." icon={Bell} color="#60a5fa" checked={settings.notifications !== false} onChange={v => { void updateSettings({ notifications: v }); }} last bd={bd} />
            </div>
            <div style={{ ...cardStyle, border: `1px solid ${isMuted ? 'rgba(239,68,68,0.2)' : bd}`, background: isMuted ? 'rgba(239,68,68,0.04)' : 'var(--sidebar-card-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: isMuted ? 'rgba(239,68,68,0.12)' : 'var(--overlay-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>
                    {isMuted ? <VolumeX size={18} style={{ color: '#f87171' }} /> : <Volume2 size={18} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>{isMuted ? 'Notificaciones silenciadas' : 'Sonido activado'}</div>
                    <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>Estado global de alertas</div>
                  </div>
                </div>
                <Switch aria-label="Sonido de notificaciones" checked={!isMuted} onCheckedChange={c => updateSettings({ notificationsMuted: !c })} />
              </div>
            </div>

            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Tipo de sonido</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 130px), 1fr))', gap: 8 }}>
                {SOUND_OPTIONS.map(opt => {
                  const isSelected = currentSound === opt.value;
                  return (
                    <div key={opt.value} className="aj-sound-option"
                      style={{ padding: 12, borderRadius: 12, border: `1px solid ${isSelected ? accentColor + '44' : bd}`, background: isSelected ? `${accentColor}12` : 'var(--sidebar-card-bg)', cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.18s ease' }}>
                      <button type="button" className="aj-sound-select" aria-label={`Seleccionar sonido ${opt.label}`} aria-pressed={isSelected} onClick={() => void updateSettings({ notificationSound: opt.value })}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.8571rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)' }}>{opt.label}</span>
                        {isSelected && <CheckCircle2 size={12} style={{ color: 'var(--accent-user-ink)' }} />}
                        </span>
                        <span style={{ fontSize: '0.7143rem', color: 'var(--text-muted)' }}>{opt.desc}</span>
                      </button>
                      {opt.value !== 'none' && (
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="button" aria-label={`Escuchar sonido ${opt.label}`} onClick={() => void playNotificationSound(opt.value, settings.notificationVolume ?? 0.7)} style={{ padding: '5px 9px', borderRadius: 5, background: 'var(--overlay-bg)', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                            <Play size={9} style={{ color: 'var(--text-muted)' }} fill="currentColor" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="aj-card" style={cardStyle}>
              <label htmlFor="aj-notification-volume" className="aj-volume-label"><span>Volumen de las notificaciones</span><output>{Math.round((settings.notificationVolume ?? 0.7) * 100)} %</output></label>
              <input id="aj-notification-volume" aria-label="Volumen de las notificaciones" type="range" min="0" max="100" step="5" value={Math.round((settings.notificationVolume ?? 0.7) * 100)} onChange={e => void updateSettings({ notificationVolume: Number(e.target.value) / 100 })} style={{ width: '100%', accentColor, marginTop: 12 }} />
              <p className="aj-help">Los botones de escucha usan este volumen, incluso si pausaste las alertas.</p>
            </div>

            <div className="aj-card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>Horas de silencio</div>
                  <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>Sin notificaciones en este rango</div>
                </div>
                <Switch aria-label="Horas de silencio" checked={quietHoursEnabled} onCheckedChange={v => { updateSettings({ quietHoursEnabled: v }); }} />
              </div>
              {quietHoursEnabled && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', animation: 'fadeInUp 0.2s ease' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', marginBottom: 4 }}>Desde</div>
                    <input aria-label="Inicio de las horas de silencio" className="s-input" type="time" value={quietFrom} onChange={e => { updateSettings({ quietFrom: e.target.value }); }} style={inputStyle('quietFrom')} />
                  </div>
                  <span style={{ color: 'var(--text-muted)', paddingTop: 18 }}>→</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', marginBottom: 4 }}>Hasta</div>
                    <input aria-label="Fin de las horas de silencio" className="s-input" type="time" value={quietTo} onChange={e => { updateSettings({ quietTo: e.target.value }); }} style={inputStyle('quietTo')} />
                  </div>
                </div>
              )}
            </div>

            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Categorías</div>
              {NOTIF_CATEGORIES.map((cat, i) => {
                const enabled = settings[cat.key as keyof typeof settings] !== false;
                const Icon = cat.icon;
                return (
                  <React.Fragment key={cat.key}>
                    {i > 0 && <div style={{ height: 1, background: bd }} />}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 30, height: 30, minWidth: 30, borderRadius: 8, background: enabled ? `${cat.color}15` : 'var(--overlay-bg)', border: `1px solid ${enabled ? cat.color + '30' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>
                          <Icon size={14} style={{ color: enabled ? cat.color : 'var(--text-muted)' }} />
                        </div>
                        <span style={{ fontSize: '0.9286rem', color: enabled ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color 0.2s ease' }}>{cat.label}</span>
                      </div>
                      <Switch aria-label={`Notificaciones de ${cat.label.toLowerCase()}`} checked={enabled} onCheckedChange={c => updateSettings({ [cat.key]: c })} />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Preferencias adicionales</div>
              <Row label="Notificaciones de escritorio" desc="Alertas del sistema operativo" icon={Monitor} color="#60a5fa"
                checked={desktopNotifs} onChange={async v => {
                  if (!v) { await updateSettings({ desktopNotifs: false }); return; }
                  try {
                    const permiso = await pedirPermisoNotificaciones();
                    await updateSettings({ desktopNotifs: permiso });
                    if (permiso) window.dispatchEvent(new Event('moon-permiso-notificaciones'));
                    showMsg(permiso ? 'success' : 'error', permiso ? 'Notificaciones del sistema activadas' : 'El sistema no dio permiso. Actívalas en los ajustes de tu navegador o de Windows.');
                  } catch { await updateSettings({ desktopNotifs: false }); showMsg('error', 'No se pudo solicitar el permiso de notificaciones.'); }
                }} bd={bd} />
              <Row label="Contador en el título" desc="«(3) moon Studios»: las notificaciones sin leer en la pestaña o la ventana" icon={Bell} color="#a78bfa"
                checked={badgeCount} onChange={v => { updateSettings({ badgeCount: v }); showMsg('success', 'Actualizado'); }} last bd={bd} />
            </div>
            <AvisosDispositivo Row={Row} cardStyle={cardStyle} sectionTitle={sectionTitle} bd={bd} showMsg={showMsg}
              sonido={currentSound} volumen={settings.notificationVolume ?? 0.7} alActivar={() => { void updateSettings({ desktopNotifs: true }); }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={async () => { await restablecer(["notifications","notificationSound","notificationVolume","notificationsMuted","notifyAnnouncements","notifyEmails","notifyThreads","notifyMessages","notifyTasks","quietHoursEnabled","quietFrom","quietTo","desktopNotifs","badgeCount"]); showMsg('success', 'Preferencias de notificación restablecidas'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontSize: '0.8571rem', cursor: 'pointer', border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-muted)' }}>
                <RotateCcw size={12} /> Restablecer esta sección
              </button>
            </div>
          </>
        )}

        {/* ══ SEGURIDAD ══ */}
        {activeTab === 'security' && (
          <>
            <div className="aj-card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--overlay-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KeyRound size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>Cambiar contraseña</div>
                  <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>Requiere tu contraseña actual</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Contraseña actual', field: 'pw0', value: currentPw, set: setCurrentPw, show: showPw0, setShow: setShowPw0 },
                  { label: 'Nueva contraseña', field: 'pw1', value: newPassword, set: setNewPassword, show: showPw1, setShow: setShowPw1 },
                  { label: 'Confirmar nueva contraseña', field: 'pw2', value: confirmPw, set: setConfirmPw, show: showPw2, setShow: setShowPw2 },
                ].map(({ label, field, value, set, show, setShow }) => (
                  <div key={field}>
                    <label style={{ fontSize: '0.7143rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>{label}</label>
                    <div style={{ position: 'relative' }}>
                      <input id={`aj-security-${field}`} aria-label={label} autoComplete={field === 'pw0' ? 'current-password' : 'new-password'} className="s-input" type={show ? 'text' : 'password'}
                        style={{ ...inputStyle(field), paddingRight: 44, ...(field === 'pw2' && confirmPw && newPassword !== confirmPw ? { borderColor: 'rgba(239,68,68,0.5)' } : {}) }}
                        value={value} onChange={e => set(e.target.value)}
                        onFocus={() => setFocusedField(field)} onBlur={() => setFocusedField(null)} />
                      <button aria-label={`${show ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} onClick={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        {show ? <EyeOff size={14} style={{ color: 'var(--text-muted)' }} /> : <Eye size={14} style={{ color: 'var(--text-muted)' }} />}
                      </button>
                    </div>
                    {field === 'pw1' && newPassword && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <div key={n} style={{ flex: 1, height: 3, borderRadius: 3, background: n <= passwordStrength ? strengthColor : 'var(--border-main)', transition: 'background 0.3s ease' }} />
                          ))}
                        </div>
                        <div style={{ fontSize: '0.7857rem', color: strengthColor }}>{strengthLabel}</div>
                      </div>
                    )}
                    {field === 'pw2' && confirmPw && newPassword !== confirmPw && (
                      <p style={{ fontSize: '0.7857rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                        <AlertCircle size={11} /> Las contraseñas no coinciden
                      </p>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                  <button onClick={handleChangePassword}
                    disabled={pwLoading || !currentPw || newPassword.length < 8 || !confirmPw || newPassword !== confirmPw || passwordStrength < 2}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, fontSize: '0.9286rem', fontWeight: 500, background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)', border: 'none', cursor: 'pointer', opacity: (pwLoading || !currentPw || !newPassword || passwordStrength < 2) ? 0.3 : 1, transition: 'opacity 0.2s ease' }}>
                    {pwLoading ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                    {pwLoading ? 'Verificando…' : 'Actualizar contraseña'}
                  </button>
                </div>
              </div>
            </div>

            <div className="aj-card" style={cardStyle}>
              <Row label="Alertas de inicio de sesión" desc="Te avisamos cuando tu cuenta entra desde un dispositivo nuevo" icon={BellOff} color="#60a5fa" checked={loginAlerts} onChange={v => { updateSettings({ loginAlerts: v }); showMsg('success', v ? 'Alertas activadas' : 'Desactivadas'); }} last bd={bd} />
            </div>

            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: `1px solid ${bd}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Monitor size={14} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>Dispositivos activos</span>
                </div>
                <button disabled={loadingSessions || !sessions.some((s: SessionRecord) => !s.current)} onClick={handleRevokeAllSessions} style={{ fontSize: '0.7857rem', color: 'var(--moon-danger)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>
                  Cerrar todas las otras
                </button>
              </div>
              {loadingSessions ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.8571rem' }}>Sin dispositivos registrados</div>
              ) : (() => {
                // Este dispositivo primero; el resto por uso más reciente. Se muestran 4 y el resto bajo «Ver todos».
                const ordenados = [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || (b.lastActive?.getTime() ?? 0) - (a.lastActive?.getTime() ?? 0));
                const visibles = verTodosDispositivos ? ordenados : ordenados.slice(0, 4);
                const ETIQUETA_APP = { web: 'Navegador', escritorio: 'App de escritorio', android: 'App Android' } as const;
                return <>
                  {visibles.map((session: SessionRecord) => {
                    const Icono = session.app === 'android' || /móvil/i.test(session.device) ? Smartphone : session.app === 'escritorio' ? AppWindow : Monitor;
                    return (
                      <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${bd}` }}>
                        <div style={{ width: 34, height: 34, minWidth: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: session.current ? `${accentColor}18` : 'var(--overlay-bg)' }}>
                          <Icono size={15} style={{ color: session.current ? accentColor : 'var(--text-muted)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8571rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.nombre}</span>
                            {session.current && <span style={{ flex: 'none', fontSize: '0.6429rem', padding: '1px 7px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>Este dispositivo</span>}
                          </div>
                          <div style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {ETIQUETA_APP[session.app]} · {session.current ? 'En uso ahora' : session.lastActive ? formatRelativeTime(session.lastActive) : ''}
                            {session.ip && !/obteniendo/i.test(session.ip) && <><span aria-hidden>·</span><MapPin size={9} /> {session.ip}</>}
                          </div>
                        </div>
                        {!session.current && (
                          <button aria-label={`Cerrar sesión en ${session.nombre}`} title="Cerrar sesión en este dispositivo" onClick={() => handleRevokeSession(session.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 7, color: 'var(--text-muted)', transition: 'color 0.15s ease' }}>
                            <LogOut size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {ordenados.length > 4 && (
                    <button onClick={() => setVerTodosDispositivos(v => !v)} style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.7857rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {verTodosDispositivos ? 'Mostrar menos' : `Ver todos (${ordenados.length})`}
                    </button>
                  )}
                  <p className="aj-help" style={{ padding: '10px 16px 14px', margin: 0 }}>Cada computadora, navegador o teléfono aparece una sola vez. Los que no se usan en 30 días se quitan solos.</p>
                </>;
              })()}
            </div>
          </>
        )}

        {/* ══ PRIVACIDAD ══ */}
        {activeTab === 'privacy' && (
          <>
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Presencia</div>
              <Row label="Mostrar cuando estoy en línea" desc="En los Hilos, los demás ven que estás conectado. Apagado: apareces sin conexión." icon={Wifi} color="#34d399" checked={showOnline} onChange={v => { updateSettings({ showOnline: v }); showMsg('success', v ? 'Ahora te ven en línea' : 'Ahora apareces sin conexión'); }} last bd={bd} />
            </div>
            <div style={{ ...cardStyle, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)' }}>
              <div style={{ fontSize: '0.7857rem', color: '#f87171', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={12} /> Zona de peligro
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
                <div><div style={{ fontSize: '0.9286rem', color: 'var(--text-muted)' }}>Descargar mis datos</div><div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>Exportar en JSON</div></div>
                <button onClick={handleExportData} disabled={exportingData} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.8571rem', border: '1px solid var(--border-main)', background: 'var(--sidebar-card-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  {exportingData ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Exportar
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                <div><div style={{ fontSize: '0.9286rem', color: 'var(--moon-danger)' }}>Eliminar cuenta</div><div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>Solicita la baja al administrador de Moon Studios.</div></div>
                <button disabled title="La baja de la cuenta la gestiona un administrador" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.8571rem', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: 'var(--moon-danger)', cursor: 'not-allowed' }}>
                  <Trash size={12} /> Eliminar
                </button>
              </div>
            </div>
          </>
        )}

        {/* ══ ACCESIBILIDAD ══ */}
        {activeTab === 'accessibility' && (
          <>
            <div className="aj-card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={sectionTitle}>Hora local actual</div>
                  <RelojLocal timezone={timezone} dateFormat={dateFormat} />
                </div>
                <AlarmClock size={30} style={{ color: 'var(--border-main)' }} />
              </div>
            </div>
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Visual</div>
              <Row label="Alto contraste" desc="Textos y bordes más marcados en todo el portal" icon={Contrast} color="#f59e0b" checked={highContrast} onChange={v => { updateSettings({ highContrast: v }); showMsg('success', `Alto contraste ${v ? 'activado' : 'desactivado'}`); }} bd={bd} />
              <Row label="Reducir movimiento" desc="Quita animaciones y transiciones en todo el portal" icon={MousePointer2} color="#a78bfa" checked={reduceMotion} onChange={v => { updateSettings({ reduceMotion: v }); showMsg('success', `Reducir movimiento ${v ? 'activado' : 'desactivado'}`); }} bd={bd} />
              <Row label="Modo lector de pantalla" desc="Foco siempre visible y grueso, sin animaciones, enlaces subrayados" icon={Cpu} color="#34d399" checked={screenReader} onChange={v => { updateSettings({ screenReader: v }); showMsg('success', `Lector ${v ? 'activado' : 'desactivado'}`); }} bd={bd} />
              <Row label="Indicador de foco" desc="Resaltar elemento activo con teclado" icon={ToggleLeft} color="#60a5fa" checked={focusIndicator} onChange={v => { updateSettings({ focusIndicator: v }); showMsg('success', 'Actualizado'); }} last bd={bd} />
            </div>
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Idioma y región</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Idioma de fechas y formatos</label>
                  <select aria-label="Idioma de fechas y formatos" className="s-select" value={language} onChange={e => { updateSettings({ language: e.target.value }); showMsg('success', 'Idioma de fechas actualizado'); }} style={{ ...inputStyle('lang'), cursor: 'pointer' }}>
                    <option value="es">Español</option>
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Zona horaria</label>
                  <select aria-label="Zona horaria" className="s-select" value={timezone} onChange={e => { updateSettings({ timezone: e.target.value }); showMsg('success', 'Zona horaria actualizada'); }} style={{ ...inputStyle('tz'), cursor: 'pointer' }}>
                    {ZONAS.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                    {!ZONAS.some(z => z.id === timezone) && <option value={timezone}>{timezone.replace(/_/g, ' ')}</option>}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1', fontSize: '0.7857rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  La zona horaria y el formato se usan en el reloj, el calendario, las tareas, los mensajes y las exportaciones.
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Formato de fecha</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {[{ value: 'dmy', label: 'DD/MM/AAAA' }, { value: 'mdy', label: 'MM/DD/AAAA' }, { value: 'ymd', label: 'AAAA/MM/DD' }].map(opt => (
                      <button key={opt.value} onClick={() => { updateSettings({ dateFormat: opt.value as 'dmy' | 'mdy' | 'ymd' }); showMsg('success', 'Formato actualizado'); }}
                        style={{ padding: '7px 4px', borderRadius: 8, fontSize: '0.7857rem', cursor: 'pointer', border: `1px solid ${dateFormat === opt.value ? accentColor + '44' : bd}`, background: dateFormat === opt.value ? `${accentColor}14` : 'transparent', color: dateFormat === opt.value ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'all 0.18s ease' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'accessibility' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={async () => { await restablecer(["highContrast","reduceMotion","screenReader","focusIndicator","language","timezone","dateFormat"]); showMsg('success', 'Accesibilidad restablecida'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontSize: '0.8571rem', cursor: 'pointer', border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-muted)' }}>
              <RotateCcw size={12} /> Restablecer esta sección
            </button>
          </div>
        )}

        {/* ══ ATAJOS ══ */}
        {activeTab === 'shortcuts' && (
          <>
            {(['Navegación', 'Interfaz', 'General'] as const).map(cat => (
              <div key={cat} className="aj-card" style={cardStyle}>
                <div style={sectionTitle}>{cat}</div>
                {ATAJOS.filter(a => a.categoria === cat).map((shortcut, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${bd}` }}>
                    <span style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>{shortcut.descripcion}</span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {shortcut.teclas.map(t => (esMac && t === 'Ctrl' ? '⌘' : t)).map((key, k) => (
                        <kbd key={k} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 7px', fontSize: '0.7857rem', borderRadius: 5, background: 'var(--overlay-bg)', border: '1px solid var(--border-main)', color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 22 }}>{key}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ ...cardStyle, textAlign: 'center', padding: 24 }}>
              <Keyboard size={22} style={{ margin: '0 auto 8px', color: 'var(--border-main)' }} />
              <div style={{ fontSize: '0.8571rem', color: 'var(--text-muted)' }}>En Windows estos atajos funcionan dentro de la aplicación. En la web, algunos pueden estar reservados por tu navegador.</div>
            </div>
          </>
        )}

        {/* ══ INTEGRACIONES ══ */}
        {/* Era una lista fija de cinco servicios con el botón desactivado.
            Ahora conecta de verdad; la lista y los datos los da la API. */}
        {activeTab === 'integrations' && (
          <PanelIntegraciones
            cardStyle={cardStyle} sectionTitle={sectionTitle}
            bd={bd} accentColor={accentColor} />
        )}

        {/* ══ ALMACENAMIENTO ══ */}
        {activeTab === 'storage' && (
          <>
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Almacenamiento en este dispositivo</div>
              {almacenamiento && almacenamiento.cuota > 0 ? (
                <>
                  <div style={{ height: 5, borderRadius: 5, background: 'var(--border-main)', overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{ height: '100%', width: `${Math.max(1, Math.min(100, (almacenamiento.uso / almacenamiento.cuota) * 100))}%`, background: accentColor, borderRadius: 5, transition: 'width 1s ease' }} />
                  </div>
                  <div style={{ fontSize: '0.8571rem', color: 'var(--text-muted)' }}>
                    {mb(almacenamiento.uso)} usados de {mb(almacenamiento.cuota)} disponibles para la app
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.8571rem', color: 'var(--text-muted)' }}>Este dispositivo no informa cuánto espacio usa la app.</div>
              )}
              <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', marginTop: 8, opacity: 0.8 }}>
                Los archivos del portal (adjuntos, diseños, reportes) están en la nube y no ocupan espacio aquí.
              </div>
            </div>
            <div className="aj-card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--overlay-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <HardDrive size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>Caché local</div>
                    <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>{cacheSize}. Se conservan la sesión y las preferencias.</div>
                  </div>
                </div>
                <button disabled={clearingCache} onClick={handleClearCache}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.8571rem', cursor: 'pointer', border: clearCacheConfirm ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border-main)', background: clearCacheConfirm ? 'rgba(239,68,68,0.1)' : 'var(--sidebar-card-bg)', color: clearCacheConfirm ? '#f87171' : 'var(--text-muted)', transition: 'all 0.2s ease' }}>
                  {clearingCache ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  {clearingCache ? 'Limpiando…' : clearCacheConfirm ? '¿Confirmar?' : 'Limpiar'}
                </button>
              </div>
            </div>
            <div className="aj-card" style={cardStyle}>
              <div style={sectionTitle}>Acciones</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${bd}` }}>
                <div><div style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>Exportar mis datos</div><div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>Perfil, preferencias actuales y actividad reciente en JSON</div></div>
                <button onClick={handleExportData} disabled={exportingData} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.8571rem', border: '1px solid var(--border-main)', background: 'var(--sidebar-card-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  {exportingData ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Exportar
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                <div><div style={{ fontSize: '0.9286rem', color: 'var(--text-primary)' }}>Importar configuración</div><div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>Desde un archivo exportado (aquí o en otro dispositivo)</div></div>
                <button onClick={() => importInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.8571rem', border: '1px solid var(--border-main)', background: 'var(--sidebar-card-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <Upload size={12} /> Importar
                </button>
              </div>
            </div>
          </>
        )}

        {/* ══ ACTIVIDAD ══ */}
        {activeTab === 'activity' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Registros totales', value: activityLogs.length.toString(), icon: Activity, color: '#60a5fa' },
                { label: 'Sesiones activas', value: String(sessions?.length ?? 0), icon: Clock3, color: '#a78bfa' },
                { label: 'Último acceso', value: activityLogs.find((a: UserActivityRecord) => a.type === 'login') ? formatRelativeTime(activityLogs.find((a: UserActivityRecord) => a.type === 'login')!.createdAt) : '—', icon: Sliders, color: '#34d399' },
              ].map(({ label, value, icon: Icon, color }, idx) => (
                <div key={label} style={{ padding: '14px 10px', borderRadius: 14, background: 'var(--sidebar-card-bg)', border: `1px solid ${bd}`, textAlign: 'center', animation: `fadeInUp 0.25s ease ${idx * 0.05}s forwards`, opacity: 0 }}>
                  <Icon size={16} style={{ color, marginBottom: 6 }} />
                  <div style={{ fontSize: '1.2857rem', fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                  <div style={{ fontSize: '0.6429rem', color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>

            <div className="aj-card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={sectionTitle}>Historial de actividad</span>
                <button onClick={handleExportData} style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Download size={11} /> Exportar
                </button>
              </div>
              {loadingActivity ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : activityLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.8571rem', border: '1px dashed var(--border-main)', borderRadius: 10 }}>
                  Sin actividad registrada
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 14, top: 0, bottom: 0, width: 1, background: 'var(--border-main)' }} />
                  {activityLogs.map((item: UserActivityRecord, i: number) => {
                    const info = ACTIVITY_ICONS[item.type] ?? { icon: Activity, color: '#60a5fa' };
                    const Icon = info.icon;
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', paddingLeft: 4, animation: `fadeInUp 0.2s ease ${i * 0.03}s forwards`, opacity: 0 }}>
                        <div style={{ width: 28, height: 28, minWidth: 28, borderRadius: 8, background: `${info.color}15`, border: `1px solid ${info.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                          <Icon size={12} style={{ color: info.color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8571rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                        </div>
                        <div style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {item.createdAt ? formatRelativeTime(item.createdAt) : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Actualizaciones (solo app de escritorio) */}
              {IS_TAURI && <SeccionActualizaciones acento={accentColor} borde={bd} />}
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default Settings;
