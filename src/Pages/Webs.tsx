import React, { useState, useEffect, useMemo, useCallback } from 'react';
import emailjs from '@emailjs/browser';
import {
  collection, doc, getDoc, setDoc, getDocs, deleteDoc,
  Timestamp, updateDoc, addDoc, writeBatch,
} from 'firebase/firestore';
import {
  Globe, ExternalLink, Save, Settings, Image, MessageCircle, Users, Loader2,
  RefreshCw, Trash2, Mail, Send, X, CheckCircle, UserCheck, AlertCircle,
  Search, AtSign, FileText, Edit, Eye, ChevronDown, Building2, Paperclip,
  Activity, Tag, Sparkles, DollarSign, Plus, Moon, ChevronUp, Link2,
  AlertTriangle,
  BarChart3, CreditCard, Handshake, ToggleLeft, ToggleRight,
  ArrowUp, ArrowDown, ExternalLink as ExtLink,
  Briefcase, Star, Newspaper, CalendarDays
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import { LegalLunaPanel } from '@/components/LegalLunaPanel';
import { WebLunaPanel } from '@/components/WebLunaPanel';
import { EventosLunaPanel } from '@/components/EventosLunaPanel';
import { ProteccionErrores } from '@/components/ProteccionErrores';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES DE CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════

const TIMEOUTS = {
  LOAD:   12_000,
  SAVE:   15_000,
  DELETE: 10_000,
  BATCH:  10_000,
} as const;

// ── API de Luna NET (para incidentes — van a la DB correcta vía el server) ────
const LUNA_API = import.meta.env.VITE_LUNA_API_URL
  || import.meta.env.VITE_API_URL
  || import.meta.env.VITE_API_BASE_URL
  || 'http://localhost:3001';

// Las rutas de gestión de incidentes exigen sesión de staff (requireLunaStaff
// en el backend) — se autentica con el ID token de Firebase de la sesión ya
// iniciada en este portal, no con un secreto compartido.
const lunaFetch = async (path: string, opts: RequestInit = {}) => {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${LUNA_API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  // Una ruta que el bot aún no tiene (o un error del proxy) llega como HTML.
  const json = await res.json().catch(() => null);
  if (!json) {
    throw new Error(res.status === 404
      ? 'La API de Luna NET todavía no tiene esta función: falta subir y reiniciar el bot.'
      : `La API de Luna NET respondió algo inesperado (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
};

/** Sube una imagen a la API de Luna (Cloudinary) y devuelve su URL. Solo staff. */
const lunaSubir = async (archivo: File): Promise<string> => {
  const token = await auth.currentUser?.getIdToken();
  const datos = new FormData();
  datos.append('imagen', archivo);
  const res = await fetch(`${LUNA_API}/api/bot/eventos/imagen`, {
    method: 'POST', body: datos, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(res.status === 404 ? 'La API de Luna NET todavía no tiene esta función: falta subir y reiniciar el bot.' : `HTTP ${res.status}`);
  if (!res.ok || !json.data?.url) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data.url as string;
};

// ── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

// ── EmailJS ───────────────────────────────────────────────────────────────────
const EJ_SERVICE  = import.meta.env.VITE_EMAILJS_SERVICE_ID  as string;
const EJ_TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string;
const EJ_KEY      = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  as string;

// ═══════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════

export interface AllyFeatures {
  nodeWidget: boolean; // Widget CPU/RAM/Storage
  plans:      boolean; // Tabla de planes
  stats:      boolean; // Barra de estadísticas
  links:      boolean; // Sección de enlaces
}

interface AllyData {
  id?: string;
  name: string; tagline: string; description: string; logo: string;
  accentColor: string; website: string; discord: string; billing: string;
  status: string; badge: string;
  stats: { label: string; value: string; icon: string }[];
  plans: { name: string; price: string; highlight?: boolean }[];
  apiUrl: string; order: number; active: boolean;
  features: AllyFeatures; // siempre requerido en dashboard (se inicializa en DEFAULT_ALLY / openEdit)
}
interface FestConfig {
  logoUrl: string; discordInviteUrl: string; eventName: string; eventDate: string;
  eventLocation: string; primaryColor: string; secondaryColor: string; accentColor: string;
}
interface FestUser {
  id: string; code: string; firstName: string; lastName: string;
  email: string; phone: string; registeredAt: Timestamp | string | null;
}
type SolicitudStatus = 'pendiente' | 'en_proceso' | 'completado' | 'denegado';
type SolicitudTipo   = 'alianza' | 'ticket' | 'cotizacion' | 'soporte' | 'otro';
interface Solicitud {
  id: string; uid: string; tipo: SolicitudTipo | string; titulo: string; descripcion: string;
  estado: SolicitudStatus; imageUrl?: string; creadoEn: Timestamp | null;
  actualizadoEn?: Timestamp | null; nota?: string;
}
interface Socio {
  id: string; uid: string; nombre: string; monto: number; metodo: string;
  mensaje?: string; estado: 'pendiente' | 'aprobado' | 'rechazado';
  creadoEn: Timestamp | null; fileUrl?: string; tierLabel?: string;
}

/** Integrante del equipo — mostrado en la sección pública "Equipo". */
interface EquipoMember {
  id?: string;
  nombre: string;
  rol: string;       // rol/cargo personalizado (ej. "CEO & Fundador")
  foto: string;       // URL de la foto/avatar
  bio: string;         // descripción corta
  email?: string;
  linkedin?: string;
  github?: string;
  twitter?: string;
  instagram?: string;
  order: number;
  active: boolean;    // visible en la web pública
}

/** Proyecto del portafolio — mostrado en Home (teaser) y en /proyectos (listado completo). */
interface PortfolioItem {
  id?: string;
  titulo: string;
  categoria: string;
  year: string;
  imagen: string;
  tag: string;              // usado para filtros (ej. "Web", "Discord")
  descripcion: string;
  link: string;              // URL del proyecto / página en vivo
  cliente?: string;
  tecnologias: string;      // lista separada por comas (ej. "React, Firebase, Tailwind")
  destacado: boolean;       // si aparece en el teaser del Home
  order: number;
  active: boolean;          // visible públicamente
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Envuelve una promesa con un timeout explícito. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s): ${label}`)), ms)
    ),
  ]);
}

const formatDate = (value: Timestamp | string | null | undefined): string => {
  if (!value) return '—';
  try {
    const d = value instanceof Timestamp ? value.toDate() : new Date(value as string);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
};

const formatDateShort = (value: Timestamp | null | undefined): string => {
  if (!value) return '—';
  try {
    return value.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  } catch { return '—'; }
};

const getTierLabel = (monto: number): string => {
  if (monto >= 10000) return '🌙 Socio Fundador';
  if (monto >= 5000)  return '⭐ Socio Platino';
  if (monto >= 2500)  return '💎 Socio Oro';
  if (monto >= 1000)  return '🚀 Socio Plata';
  return '🌱 Socio Semilla';
};

const TIPO_LABELS: Record<string, string> = {
  alianza: 'Alianza', ticket: 'Ticket', cotizacion: 'Cotización',
  soporte: 'Soporte', otro: 'Otro',
};

const deleteSupabaseImage = async (url: string): Promise<void> => {
  try {
    const bucket = 'solicitudes';
    const prefix = `/storage/v1/object/public/${bucket}/`;
    const index  = url.indexOf(prefix);
    if (index === -1) return;
    const path = decodeURIComponent(url.substring(index + prefix.length));
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw error;
  } catch (e) {
    console.error('Error eliminando imagen de Supabase:', e);
  }
};

// ── Firestore refs (db principal) ─────────────────────────────────────────────
const CONFIG_DOC      = doc(db, 'config', 'appConfig');
const USERS_COL       = collection(db, 'moon_studios_fest_2026');
const SOLICITUDES_COL = collection(db, 'moonStudios', 'solicitudes', 'items');
const SOCIOS_COL      = collection(db, 'moonStudios', 'socios', 'items');
const EQUIPO_COL      = collection(db, 'moonStudios', 'equipo', 'items');
const PORTFOLIO_COL   = collection(db, 'moonStudios', 'portfolio', 'items');

// ── Design tokens ─────────────────────────────────────────────────────────────
const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const sc = 'hsl(var(--secondary))';
const mt = 'hsl(var(--muted-foreground))';

// ── Status configs ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<SolicitudStatus, { label: string; color: string; bg: string; dot: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  dot: '#f59e0b' },
  en_proceso: { label: 'En Proceso', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  dot: '#60a5fa' },
  completado: { label: 'Completado', color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  dot: '#4ade80' },
  denegado:   { label: 'Denegado',   color: '#f87171', bg: 'rgba(248,113,113,0.08)', dot: '#f87171' },
};
const SOCIO_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pendiente: { label: 'En revisión', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  aprobado:  { label: 'Aprobado',    color: '#4ade80', bg: 'rgba(74,222,128,0.08)' },
  rechazado: { label: 'Rechazado',   color: '#f87171', bg: 'rgba(248,113,113,0.08)' },
};

// ═══════════════════════════════════════════════════════════════════
// COMPONENTES UI COMPARTIDOS
// ═══════════════════════════════════════════════════════════════════

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>{label}</label>
    {children}
    {hint && <p className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.2)' }}>{hint}</p>}
  </div>
);

const StyledInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { name: string }> = ({ name, ...props }) => (
  <input
    name={name}
    {...props}
    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all"
    style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
    onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
    onBlur={e =>  (e.target.style.borderColor = bd)}
  />
);

const SaveBtn: React.FC<{ saving: boolean; onClick: () => void; label?: string }> = ({
  saving, onClick, label = 'Guardar',
}) => (
  <button
    onClick={onClick}
    disabled={saving}
    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
    style={{ background: '#fff', color: '#000' }}
  >
    {saving
      ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando...</>
      : <><Save className="w-4 h-4" strokeWidth={1.5} />{label}</>}
  </button>
);

const StatusBadge: React.FC<{ status: SolicitudStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}25` }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
};

/** Spinner de carga centrado genérico. */
const LoadingSpinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center h-32 gap-3">
    <div className="w-5 h-5 border border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
    {label && <p className="text-xs font-light" style={{ color: mt }}>{label}</p>}
  </div>
);

/** Estado de error con botón reintentar. */
const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div
    className="flex flex-col items-center justify-center h-40 gap-4 rounded-2xl"
    style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}
  >
    <div className="flex items-center gap-2">
      <AlertCircle className="w-4 h-4" style={{ color: '#f87171' }} strokeWidth={1.5} />
      <p className="text-sm font-light" style={{ color: '#f87171' }}>{message}</p>
    </div>
    <button
      onClick={onRetry}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
      style={{ border: `1px solid ${bd}`, color: mt }}
    >
      <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Reintentar
    </button>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// ALLY FORM
// ═══════════════════════════════════════════════════════════════════

interface AllyFormProps {
  form: Omit<AllyData, 'id'>;
  setForm: React.Dispatch<React.SetStateAction<Omit<AllyData, 'id'>>>;
  saving: boolean;
  editingId: string | null;
  onCancel: () => void;
  onSave: () => void;
}

const AllyForm: React.FC<AllyFormProps> = ({ form, setForm, saving, editingId, onCancel, onSave }) => {
  const [formTab, setFormTab] = useState<'info' | 'links' | 'stats' | 'plans' | 'display'>('info');

  const addStat    = () => setForm(f => ({ ...f, stats: [...f.stats, { icon: '⭐', label: '', value: '' }] }));
  const removeStat = (i: number) => setForm(f => ({ ...f, stats: f.stats.filter((_, idx) => idx !== i) }));
  const updateStat = (i: number, key: string, val: string) =>
    setForm(f => ({ ...f, stats: f.stats.map((s, idx) => idx === i ? { ...s, [key]: val } : s) }));

  const addPlan    = () => setForm(f => ({ ...f, plans: [...f.plans, { name: '', price: '', highlight: false }] }));
  const removePlan = (i: number) => setForm(f => ({ ...f, plans: f.plans.filter((_, idx) => idx !== i) }));
  const updatePlan = (i: number, key: string, val: string | boolean) =>
    setForm(f => ({ ...f, plans: f.plans.map((p, idx) => idx === i ? { ...p, [key]: val } : p) }));

  const FORM_TABS = [
    { id: 'info'    as const, label: 'Info',        Icon: FileText   },
    { id: 'links'   as const, label: 'Links',       Icon: Link2      },
    { id: 'stats'   as const, label: 'Stats',       Icon: BarChart3  },
    { id: 'plans'   as const, label: 'Planes',      Icon: CreditCard },
    { id: 'display' as const, label: 'Visibilidad', Icon: Eye        },
  ];

  const DISPLAY_SECTIONS: {
    key: keyof AllyFeatures; label: string; desc: string;
    Icon: React.ElementType;
  }[] = [
    { key: 'nodeWidget', label: 'Widget del servidor',   desc: 'CPU, RAM y Storage en tiempo real. Requiere URL API configurada.',  Icon: Activity   },
    { key: 'stats',      label: 'Estadísticas',          desc: 'Barra de métricas personalizadas (uptime, servidores, etc.).',      Icon: BarChart3  },
    { key: 'plans',      label: 'Planes de precios',     desc: 'Tabla de planes con precios. Requiere planes agregados.',           Icon: CreditCard },
    { key: 'links',      label: 'Enlaces rápidos',       desc: 'Solo muestra los links que tengan URL configurada.',               Icon: Link2      },
  ];

  const LINK_FIELDS = [
    { key: 'logo',    label: 'URL del Logo',    placeholder: 'https://cdn.example.com/logo.png' },
    { key: 'website', label: 'Sitio Web',        placeholder: 'https://flyxnodes.xyz' },
    { key: 'discord', label: 'Discord',          placeholder: 'https://discord.flyxnodes.xyz' },
    { key: 'billing', label: 'Panel / Billing',  placeholder: 'https://client.flyxnodes.xyz' },
    { key: 'status',  label: 'Página de Status', placeholder: 'https://status.flyxnodes.xyz' },
    { key: 'apiUrl',  label: 'URL API del Nodo', placeholder: 'https://n1.flyxnodes.xyz/api' },
  ];

  return (
    <div className="space-y-4 mt-4 pt-4" style={{ borderTop: `1px solid ${bd}` }}>
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
        {FORM_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setFormTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-light transition-all"
            style={{
              background: formTab === id ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: formTab === id ? 'white' : mt,
            }}
          >
            <Icon className="w-3 h-3" strokeWidth={1.5} />{label}
          </button>
        ))}
      </div>

      {/* INFO */}
      {formTab === 'info' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Field label="Nombre *">
              <StyledInput
                name="name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="FlyxNodes"
              />
            </Field>
          </div>
          <Field label="Tagline">
            <StyledInput
              name="tagline"
              value={form.tagline}
              onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
              placeholder="The power your community deserves."
            />
          </Field>
          <Field label="Badge">
            <StyledInput
              name="badge"
              value={form.badge}
              onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}
              placeholder="Aliado Oficial"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descripción">
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none resize-none transition-all"
                style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
                rows={3}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
                onBlur={e =>  (e.target.style.borderColor = bd)}
              />
            </Field>
          </div>
          <Field label="Color de acento">
            <div className="flex gap-2">
              <input
                type="color"
                value={form.accentColor.startsWith('rgba') ? '#6366f1' : form.accentColor}
                onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
                className="w-12 h-10 rounded-xl p-1 cursor-pointer"
                style={{ background: sc, border: `1px solid ${bd}` }}
              />
              <StyledInput
                name="accentColor"
                value={form.accentColor}
                onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
                placeholder="rgba(99,102,241,1)"
              />
            </div>
          </Field>
          <Field label="Orden">
            <StyledInput
              name="order"
              type="number"
              value={String(form.order)}
              onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
            />
          </Field>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => setForm(f => ({ ...f, active: !f.active }))}
              className="flex items-center gap-2 text-sm font-light transition-all"
            >
              {form.active
                ? <ToggleRight className="w-5 h-5" style={{ color: '#4ade80' }} />
                : <ToggleLeft  className="w-5 h-5" style={{ color: mt }} />}
              <span style={{ color: form.active ? '#4ade80' : mt }}>
                {form.active ? 'Activo' : 'Inactivo'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* LINKS */}
      {formTab === 'links' && (
        <div className="space-y-3">
          {LINK_FIELDS.map(({ key, label, placeholder }) => (
            <Field key={key} label={label}>
              <StyledInput
                name={key}
                value={(form as unknown as Record<string, string>)[key] ?? ''}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
              />
            </Field>
          ))}
          {form.logo && (
            <div className="p-3 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
              <p className="text-[9px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Preview logo</p>
              <img
                src={form.logo}
                alt="Logo preview"
                className="h-12 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </div>
      )}

      {/* STATS */}
      {formTab === 'stats' && (
        <div className="space-y-2">
          {form.stats.map((stat, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="grid grid-cols-3 gap-2 flex-1">
                <StyledInput name={`stat_icon_${i}`}  value={stat.icon}  onChange={e => updateStat(i, 'icon', e.target.value)}  placeholder="🛡" />
                <StyledInput name={`stat_label_${i}`} value={stat.label} onChange={e => updateStat(i, 'label', e.target.value)} placeholder="Uptime" />
                <StyledInput name={`stat_value_${i}`} value={stat.value} onChange={e => updateStat(i, 'value', e.target.value)} placeholder="99.9%" />
              </div>
              <button
                onClick={() => removeStat(i)}
                className="w-9 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:bg-red-500/10"
                style={{ border: `1px solid ${bd}`, color: mt }}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          <button
            onClick={addStat}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
            style={{ border: `1px solid ${bd}`, color: mt }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Agregar stat
          </button>
        </div>
      )}

      {/* PLANS */}
      {formTab === 'plans' && (
        <div className="space-y-2">
          {form.plans.map((plan, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="grid grid-cols-2 gap-2 flex-1">
                <StyledInput name={`plan_name_${i}`}  value={plan.name}  onChange={e => updatePlan(i, 'name', e.target.value)}  placeholder="Node Nova" />
                <StyledInput name={`plan_price_${i}`} value={plan.price} onChange={e => updatePlan(i, 'price', e.target.value)} placeholder="$2.99/mo" />
              </div>
              <button
                onClick={() => updatePlan(i, 'highlight', !plan.highlight)}
                className="w-9 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  border:     `1px solid ${plan.highlight ? 'rgba(250,204,21,0.3)' : bd}`,
                  background: plan.highlight ? 'rgba(250,204,21,0.08)' : 'transparent',
                  color:      plan.highlight ? '#facc15' : mt,
                }}
                title="Popular"
              >
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => removePlan(i)}
                className="w-9 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:bg-red-500/10"
                style={{ border: `1px solid ${bd}`, color: mt }}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          <button
            onClick={addPlan}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
            style={{ border: `1px solid ${bd}`, color: mt }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Agregar plan
          </button>
        </div>
      )}

      {/* VISIBILIDAD */}
      {formTab === 'display' && (
        <div className="space-y-2.5">
          <p className="text-xs font-light pb-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Controla qué secciones aparecen en la card pública. Los cambios se reflejan tras guardar.
          </p>
          {DISPLAY_SECTIONS.map(({ key, label, desc, Icon }) => {
            const enabled = form.features?.[key] ?? true;
            return (
              <div
                key={key}
                className="flex items-start gap-3 p-3.5 rounded-xl transition-all"
                style={{
                  background: enabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)',
                  border: `1px solid ${enabled ? 'rgba(255,255,255,0.1)' : bd}`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: enabled ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${bd}` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: enabled ? 'white' : mt }} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light" style={{ color: enabled ? 'white' : mt }}>{label}</p>
                  <p className="text-[11px] font-light mt-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>{desc}</p>
                </div>
                <button
                  onClick={() => setForm(f => ({
                    ...f,
                    features: { ...(f.features ?? DEFAULT_FEATURES_ON), [key]: !enabled },
                  }))}
                  className="flex-shrink-0 mt-0.5 transition-transform hover:scale-110"
                >
                  {enabled
                    ? <ToggleRight className="w-5 h-5" style={{ color: '#4ade80' }} />
                    : <ToggleLeft  className="w-5 h-5" style={{ color: mt }} />}
                </button>
              </div>
            );
          })}
          {form.features && !Object.values(form.features).some(Boolean) && (
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f59e0b' }} strokeWidth={1.5} />
              <p className="text-xs font-light" style={{ color: '#f59e0b' }}>
                Todas las secciones están ocultas. Solo se mostrará el encabezado del aliado.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
          style={{ border: `1px solid ${bd}`, color: mt }}
        >
          Cancelar
        </button>
        <SaveBtn saving={saving} onClick={onSave} label={editingId ? 'Actualizar' : 'Crear Aliado'} />
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// ALLIES PANEL
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_FEATURES_ON: AllyFeatures = {
  nodeWidget: true,
  plans:      true,
  stats:      true,
  links:      true,
};

const DEFAULT_ALLY: Omit<AllyData, 'id'> = {
  name: '', tagline: '', description: '', logo: '', accentColor: 'rgba(99,102,241,1)',
  website: '', discord: '', billing: '', status: '', badge: 'Aliado Oficial',
  stats: [], plans: [], apiUrl: '', order: 0, active: true,
  features: { nodeWidget: true, plans: true, stats: true, links: true },
};

const AlliesPanel: React.FC = () => {
  const [allies,    setAllies]    = useState<AllyData[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew,   setShowNew]   = useState(false);
  const [form,      setForm]      = useState<Omit<AllyData, 'id'>>(DEFAULT_ALLY);

  const loadAllies = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const json = await withTimeout(
        lunaFetch('/api/bot/allies'),
        TIMEOUTS.LOAD,
        'GET /api/bot/allies',
      );
      const data: AllyData[] = ((json.data ?? []) as AllyData[])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setAllies(data);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      console.error('Error cargando aliados:', e);
      setLoadError(msg);
      toast.error('Error cargando aliados: ' + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAllies(); }, [loadAllies]);

  const openNew = () => {
    setForm({ ...DEFAULT_ALLY, order: allies.length });
    setShowNew(true);
    setEditingId(null);
  };

  const openEdit = (ally: AllyData) => {
    const { id, ...rest } = ally;
    void id; // excluido intencionalmente
    // Normaliza features para aliados guardados antes de que existiera este campo
    const smartFeatures: AllyFeatures = {
      nodeWidget: !!rest.apiUrl?.trim(),
      plans:      (rest.plans?.length ?? 0) > 0,
      stats:      (rest.stats?.length ?? 0) > 0,
      links:      !!(rest.website || rest.discord || rest.billing || rest.status),
    };
    setForm({
      ...rest,
      features: rest.features ?? smartFeatures,
    } as Omit<AllyData, 'id'>);
    setEditingId(ally.id ?? null);
    setShowNew(false);
  };

  const cancelForm = () => { setShowNew(false); setEditingId(null); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const json = await withTimeout(
          lunaFetch(`/api/bot/allies/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) }),
          TIMEOUTS.SAVE,
          'PATCH ally',
        );
        setAllies(prev => prev.map(a => a.id === editingId ? (json.data as AllyData) : a));
        toast.success('Aliado actualizado ✓');
      } else {
        const json = await withTimeout(
          lunaFetch('/api/bot/allies', { method: 'POST', body: JSON.stringify(form) }),
          TIMEOUTS.SAVE,
          'POST ally',
        );
        setAllies(prev =>
          [...prev, json.data as AllyData].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        );
        toast.success('Aliado creado ✓');
      }
      cancelForm();
    } catch (e: unknown) {
      console.error('Error al guardar aliado:', e);
      toast.error('Error al guardar: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a "${name}"?`)) return;
    try {
      await withTimeout(
        lunaFetch(`/api/bot/allies/${id}`, { method: 'DELETE' }),
        TIMEOUTS.DELETE,
        'DELETE ally',
      );
      setAllies(prev => prev.filter(a => a.id !== id));
      if (editingId === id) cancelForm();
      toast.success('Aliado eliminado');
    } catch (e: unknown) {
      toast.error('Error al eliminar: ' + (e as Error).message);
    }
  };

  const toggleActive = async (ally: AllyData) => {
    if (!ally.id) return;
    const newVal = !ally.active;
    // Optimistic update
    setAllies(prev => prev.map(a => a.id === ally.id ? { ...a, active: newVal } : a));
    try {
      await withTimeout(
        lunaFetch(`/api/bot/allies/${ally.id}`, { method: 'PATCH', body: JSON.stringify({ active: newVal }) }),
        TIMEOUTS.SAVE,
        'toggleActive',
      );
    } catch (e: unknown) {
      // Revert on error
      setAllies(prev => prev.map(a => a.id === ally.id ? { ...a, active: !newVal } : a));
      toast.error('Error actualizando: ' + (e as Error).message);
    }
  };

  const moveOrder = async (ally: AllyData, dir: 'up' | 'down') => {
    const idx       = allies.findIndex(a => a.id === ally.id);
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= allies.length) return;
    const target = allies[targetIdx];
    if (!ally.id || !target.id) return;

    // Optimistic update
    setAllies(prev => {
      const next = prev.map(a => {
        if (a.id === ally.id)   return { ...a, order: target.order };
        if (a.id === target.id) return { ...a, order: ally.order };
        return a;
      });
      return next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    try {
      await withTimeout(
        Promise.all([
          lunaFetch(`/api/bot/allies/${ally.id}`,   { method: 'PATCH', body: JSON.stringify({ order: target.order }) }),
          lunaFetch(`/api/bot/allies/${target.id}`, { method: 'PATCH', body: JSON.stringify({ order: ally.order }) }),
        ]),
        TIMEOUTS.BATCH,
        'moveOrder',
      );
    } catch (e: unknown) {
      // Revert
      await loadAllies();
      toast.error('Error reordenando: ' + (e as Error).message);
    }
  };

  if (loading)   return <LoadingSpinner label="Conectando con Luna NET…" />;
  if (loadError) return <ErrorState message={loadError} onRetry={loadAllies} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-light text-white">Aliados de Luna NET</p>
          <p className="text-xs font-light mt-0.5" style={{ color: mt }}>
            Los cambios se reflejan en tiempo real en la web de Luna NET
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAllies}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/5"
            style={{ border: `1px solid ${bd}`, color: mt }}
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={showNew ? cancelForm : openNew}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
            style={{
              background: showNew ? 'transparent' : 'rgba(255,255,255,0.07)',
              border:     `1px solid ${showNew ? bd : 'rgba(255,255,255,0.15)'}`,
              color:      showNew ? mt : 'white',
            }}
          >
            {showNew
              ? <><X className="w-3.5 h-3.5" strokeWidth={1.5} />Cancelar</>
              : <><Plus className="w-3.5 h-3.5" strokeWidth={1.5} />Nuevo aliado</>}
          </button>
        </div>
      </div>

      {/* Formulario nuevo */}
      {showNew && (
        <div className="rounded-2xl p-5" style={{ background: sf, border: `1px solid rgba(255,255,255,0.12)` }}>
          <p className="text-xs font-light text-white">Nuevo aliado</p>
          <AllyForm
            form={form} setForm={setForm} saving={saving}
            editingId={editingId} onCancel={cancelForm} onSave={handleSave}
          />
        </div>
      )}

      {/* Lista vacía */}
      {allies.length === 0 && !showNew ? (
        <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
          <Handshake className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.08)' }} strokeWidth={1} />
          <p className="text-sm font-light" style={{ color: mt }}>No hay aliados todavía. Agrega el primero.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allies.map((ally, idx) => {
            const isEditing = editingId === ally.id;
            return (
              <div
                key={ally.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{ background: sf, border: `1px solid ${isEditing ? 'rgba(255,255,255,0.15)' : bd}` }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Logo */}
                  <div
                    className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}
                  >
                    {ally.logo
                      ? <img
                          src={ally.logo} alt=""
                          className="w-full h-full object-contain p-1"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      : <Handshake className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-light truncate">{ally.name}</p>
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.05)', color: mt }}
                      >
                        {ally.badge}
                      </span>
                    </div>
                    <p className="text-[10px] font-light truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
                      {ally.tagline}
                    </p>
                  </div>

                  {/* Estado */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: ally.active ? '#4ade80' : 'rgba(255,255,255,0.15)' }} />
                    <span className="text-[9px] font-light"
                      style={{ color: ally.active ? '#4ade80' : mt }}>
                      {ally.active ? 'Activo' : 'Oculto'}
                    </span>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveOrder(ally, 'up')} disabled={idx === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5 disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => moveOrder(ally, 'down')} disabled={idx === allies.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5 disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <ArrowDown className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => toggleActive(ally)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      style={{ border: `1px solid ${bd}`, color: ally.active ? '#4ade80' : mt }}
                      title={ally.active ? 'Ocultar' : 'Mostrar'}
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <a
                      href={ally.website} target="_blank" rel="noopener noreferrer"
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <ExtLink className="w-3 h-3" strokeWidth={1.5} />
                    </a>
                    <button
                      onClick={() => isEditing ? cancelForm() : openEdit(ally)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      style={{
                        border: `1px solid ${isEditing ? 'rgba(255,255,255,0.2)' : bd}`,
                        color:  isEditing ? 'white' : mt,
                      }}
                    >
                      {isEditing
                        ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                        : <Edit className="w-3 h-3" strokeWidth={1.5} />}
                    </button>
                    <button
                      onClick={() => handleDelete(ally.id!, ally.name)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10 hover:border-red-500/30"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* Formulario edición inline */}
                {isEditing && (
                  <div className="px-5 pb-5">
                    <AllyForm
                      form={form} setForm={setForm} saving={saving}
                      editingId={editingId} onCancel={cancelForm} onSave={handleSave}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// PORTAL CLIENTES
// ═══════════════════════════════════════════════════════════════════

const PortalClientesPanel: React.FC = () => {
  const [solicitudes,    setSolicitudes]    = useState<Solicitud[]>([]);
  const [socios,         setSocios]         = useState<Socio[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState<'solicitudes' | 'socios'>('solicitudes');
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editData,       setEditData]       = useState<{ estado: SolicitudStatus; nota: string }>({ estado: 'pendiente', nota: '' });
  const [saving,         setSaving]         = useState(false);
  const [viewingImage,   setViewingImage]   = useState<string | null>(null);
  const [filterStatus,   setFilterStatus]   = useState<SolicitudStatus | 'todas'>('todas');
  const [filterTipo,     setFilterTipo]     = useState<string>('todos');
  const [searchQ,        setSearchQ]        = useState('');
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [socioSearch,    setSocioSearch]    = useState('');
  const [socioFilter,    setSocioFilter]    = useState<'todos' | 'pendiente' | 'aprobado' | 'rechazado'>('todos');
  const [updatingSocio,  setUpdatingSocio]  = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [solSnap, socioSnap] = await Promise.all([
        getDocs(SOLICITUDES_COL),
        getDocs(SOCIOS_COL),
      ]);
      const solData = solSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Solicitud))
        .sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0));
      setSolicitudes(solData);

      const socioData = socioSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Socio))
        .sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0));
      setSocios(socioData);
    } catch (e) {
      toast.error('Error cargando datos del portal');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const stats = useMemo(() => ({
    total:        solicitudes.length,
    pendiente:    solicitudes.filter(s => s.estado === 'pendiente').length,
    en_proceso:   solicitudes.filter(s => s.estado === 'en_proceso').length,
    completado:   solicitudes.filter(s => s.estado === 'completado').length,
    denegado:     solicitudes.filter(s => s.estado === 'denegado').length,
    socioTotal:   socios.length,
    socioMonto:   socios.filter(s => s.estado === 'aprobado').reduce((a, s) => a + s.monto, 0),
    socioPending: socios.filter(s => s.estado === 'pendiente').length,
    socioAprobado:socios.filter(s => s.estado === 'aprobado').length,
  }), [solicitudes, socios]);

  const filtered = useMemo(() => solicitudes.filter(s => {
    if (filterStatus !== 'todas' && s.estado !== filterStatus) return false;
    if (filterTipo   !== 'todos' && s.tipo   !== filterTipo)   return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!s.titulo.toLowerCase().includes(q) &&
          !s.descripcion.toLowerCase().includes(q) &&
          !s.uid.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [solicitudes, filterStatus, filterTipo, searchQ]);

  const filteredSocios = useMemo(() => socios.filter(s => {
    if (socioFilter !== 'todos' && s.estado !== socioFilter) return false;
    if (socioSearch && !s.nombre.toLowerCase().includes(socioSearch.toLowerCase())) return false;
    return true;
  }), [socios, socioFilter, socioSearch]);

  const handleUpdateSolicitud = async (id: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'moonStudios', 'solicitudes', 'items', id), {
        estado: editData.estado, nota: editData.nota, actualizadoEn: new Date(),
      });
      setSolicitudes(prev => prev.map(s =>
        s.id === id ? { ...s, estado: editData.estado, nota: editData.nota } : s
      ));
      toast.success('Solicitud actualizada');
      setEditingId(null);
    } catch (e) {
      toast.error('Error al actualizar');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSolicitud = async (id: string, imageUrl?: string) => {
    if (!confirm('¿Eliminar esta solicitud?')) return;
    try {
      if (imageUrl) await deleteSupabaseImage(imageUrl);
      await deleteDoc(doc(db, 'moonStudios', 'solicitudes', 'items', id));
      setSolicitudes(prev => prev.filter(s => s.id !== id));
      toast.success('Solicitud eliminada');
      if (editingId === id) setEditingId(null);
    } catch (e) {
      toast.error('Error al eliminar');
      console.error(e);
    }
  };

  const handleQuickStatus = async (id: string, newStatus: SolicitudStatus) => {
    // Optimistic update
    setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, estado: newStatus } : s));
    try {
      await updateDoc(doc(db, 'moonStudios', 'solicitudes', 'items', id), {
        estado: newStatus, actualizadoEn: new Date(),
      });
      toast.success(`Estado → ${STATUS_CONFIG[newStatus].label}`);
    } catch {
      setSolicitudes(prev => prev.map(s =>
        s.id === id ? { ...s, estado: s.estado } : s
      ));
      toast.error('Error al actualizar');
    }
  };

  const handleUpdateSocio = async (id: string, newStatus: 'aprobado' | 'rechazado' | 'pendiente') => {
    setUpdatingSocio(id);
    // Optimistic update
    setSocios(prev => prev.map(s => s.id === id ? { ...s, estado: newStatus } : s));
    try {
      await updateDoc(doc(db, 'moonStudios', 'socios', 'items', id), { estado: newStatus });
      toast.success(`Socio → ${SOCIO_STATUS[newStatus].label}`);
    } catch {
      toast.error('Error al actualizar');
      await loadData(); // revert
    } finally {
      setUpdatingSocio(null);
    }
  };

  const handleDeleteSocio = async (id: string) => {
    if (!confirm('¿Eliminar esta solicitud de socio?')) return;
    try {
      await deleteDoc(doc(db, 'moonStudios', 'socios', 'items', id));
      setSocios(prev => prev.filter(s => s.id !== id));
      toast.success('Solicitud eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      {/* Lightbox imagen */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setViewingImage(null)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <X className="w-4 h-4 text-white" />
            </button>
            <img
              src={viewingImage} alt="Adjunto"
              className="w-full h-auto rounded-2xl shadow-2xl"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Solicitudes',       value: stats.total,       sub: `${stats.pendiente} pend.`,     color: 'rgba(255,255,255,0.7)', icon: <FileText className="w-3.5 h-3.5" /> },
          { label: 'En proceso',        value: stats.en_proceso,  sub: `${stats.completado} OK`,        color: '#60a5fa',               icon: <Activity className="w-3.5 h-3.5" /> },
          { label: 'Socios',            value: stats.socioTotal,  sub: `${stats.socioPending} revs.`,   color: '#f59e0b',               icon: <Building2 className="w-3.5 h-3.5" /> },
          { label: 'Inversión aprobada',value: `$${stats.socioMonto.toLocaleString('es-PE')}`, sub: `${stats.socioAprobado} socios`, color: '#4ade80', icon: <DollarSign className="w-3.5 h-3.5" /> },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-4" style={{ background: sf, border: `1px solid ${bd}` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>{s.label}</span>
              <span style={{ color: mt }}>{s.icon}</span>
            </div>
            <p className="text-2xl font-light" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[11px] font-light mt-1" style={{ color: mt }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl p-1.5" style={{ background: sc, border: `1px solid ${bd}` }}>
        {(['solicitudes', 'socios'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-light transition-all"
            style={{
              background: activeTab === tab ? 'rgba(255,255,255,0.08)' : 'transparent',
              color:      activeTab === tab ? 'white' : mt,
            }}
          >
            {tab === 'solicitudes'
              ? <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
              : <Building2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
            {tab === 'solicitudes' ? 'Solicitudes' : 'Socios Capitalistas'}
            {tab === 'socios' && stats.socioPending > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                {stats.socioPending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── SOLICITUDES ── */}
      {activeTab === 'solicitudes' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-light outline-none"
                style={{ background: sf, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
              />
            </div>
            <div className="relative">
              <select
                value={filterTipo}
                onChange={e => setFilterTipo(e.target.value)}
                className="pl-3 pr-8 py-2 rounded-xl text-xs font-light outline-none appearance-none cursor-pointer"
                style={{ background: sf, border: `1px solid ${bd}`, color: filterTipo !== 'todos' ? 'white' : mt }}
              >
                <option value="todos">Tipo: todos</option>
                {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: mt }} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['todas', 'pendiente', 'en_proceso', 'completado', 'denegado'] as const).map(s => {
                const cfg    = s === 'todas' ? null : STATUS_CONFIG[s];
                const active = filterStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-all"
                    style={{
                      background: active ? (cfg ? cfg.bg : 'rgba(255,255,255,0.08)') : 'transparent',
                      color:      active ? (cfg ? cfg.color : 'white') : mt,
                      border:    `1px solid ${active ? (cfg ? `${cfg.color}30` : 'rgba(255,255,255,0.15)') : 'transparent'}`,
                    }}
                  >
                    {s === 'todas' ? 'Todas' : s === 'en_proceso' ? 'En proceso' : STATUS_CONFIG[s].label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={loadData}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/5"
              style={{ border: `1px solid ${bd}`, color: mt }}
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
              <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.08)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: mt }}>No hay solicitudes que coincidan.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(s => {
                const isExpanded = expandedId === s.id;
                const isEditing  = editingId  === s.id;
                return (
                  <div
                    key={s.id}
                    className="rounded-2xl overflow-hidden transition-all"
                    style={{
                      background: sf,
                      border: `1px solid ${isEditing ? 'rgba(255,255,255,0.15)' : isExpanded ? 'rgba(255,255,255,0.1)' : bd}`,
                    }}
                  >
                    {/* Fila principal */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}
                      >
                        <Tag className="w-3.5 h-3.5" style={{ color: mt }} strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white text-sm font-light truncate">{s.titulo}</p>
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ background: 'rgba(255,255,255,0.05)', color: mt }}
                          >
                            {TIPO_LABELS[s.tipo] ?? s.tipo}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] font-light font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                            {s.uid.substring(0, 10)}…
                          </span>
                          <span className="text-[10px] font-light" style={{ color: 'rgba(255,255,255,0.2)' }}>
                            {formatDateShort(s.creadoEn)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={s.estado} />
                        {s.imageUrl && (
                          <button
                            onClick={() => setViewingImage(s.imageUrl!)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                            style={{ border: `1px solid ${bd}`, color: mt }}
                          >
                            <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (isExpanded && !isEditing) setExpandedId(null);
                            else { setExpandedId(s.id); setEditingId(null); }
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                          style={{ border: `1px solid ${bd}`, color: mt }}
                        >
                          <ChevronDown
                            className="w-3.5 h-3.5 transition-transform"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                            strokeWidth={1.5}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Detalle expandido */}
                    {isExpanded && !isEditing && (
                      <div style={{ borderTop: `1px solid ${bd}` }}>
                        <div className="px-4 py-3">
                          <p className="text-sm font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                            {s.descripcion}
                          </p>
                        </div>
                        {s.nota && (
                          <div
                            className="mx-4 mb-3 flex gap-2.5 p-3 rounded-xl"
                            style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)' }}
                          >
                            <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} strokeWidth={1.5} />
                            <div>
                              <p className="text-[9px] uppercase tracking-widest font-light mb-1" style={{ color: 'rgba(251,191,36,0.5)' }}>
                                Nota interna
                              </p>
                              <p className="text-xs font-light" style={{ color: 'rgba(251,191,36,0.8)' }}>{s.nota}</p>
                            </div>
                          </div>
                        )}
                        <div className="px-4 pb-4">
                          <p className="text-[9px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>
                            Cambio rápido
                          </p>
                          <div className="flex gap-2 flex-wrap items-center justify-between">
                            <div className="flex gap-1.5 flex-wrap">
                              {(['pendiente', 'en_proceso', 'completado', 'denegado'] as SolicitudStatus[]).map(st => {
                                const c = STATUS_CONFIG[st];
                                return (
                                  <button
                                    key={st}
                                    onClick={() => handleQuickStatus(s.id, st)}
                                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                                    style={{
                                      background: s.estado === st ? c.bg : 'transparent',
                                      color:      s.estado === st ? c.color : mt,
                                      border:    `1px solid ${s.estado === st ? `${c.color}30` : 'rgba(255,255,255,0.08)'}`,
                                    }}
                                  >
                                    {c.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDeleteSolicitud(s.id, s.imageUrl)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                                style={{ border: `1px solid ${bd}`, color: mt }}
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                              <button
                                onClick={() => { setEditingId(s.id); setEditData({ estado: s.estado, nota: s.nota ?? '' }); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                                style={{ background: '#fff', color: '#000' }}
                              >
                                <Edit className="w-3 h-3" />Gestionar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Formulario edición */}
                    {isEditing && (
                      <div className="px-4 pb-4 space-y-3" style={{ borderTop: `1px solid ${bd}` }}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                          <Field label="Estado">
                            <select
                              value={editData.estado}
                              onChange={e => setEditData(d => ({ ...d, estado: e.target.value as SolicitudStatus }))}
                              className="w-full px-3 py-2.5 rounded-xl text-sm font-light outline-none cursor-pointer"
                              style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }}
                            >
                              {(['pendiente', 'en_proceso', 'completado', 'denegado'] as SolicitudStatus[]).map(st => (
                                <option key={st} value={st}>{STATUS_CONFIG[st].label}</option>
                              ))}
                            </select>
                          </Field>
                          <div className="flex items-end">
                            <StatusBadge status={editData.estado} />
                          </div>
                        </div>
                        <Field label="Nota interna">
                          <textarea
                            value={editData.nota}
                            onChange={e => setEditData(d => ({ ...d, nota: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl text-sm font-light outline-none resize-none transition-all"
                            style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }}
                            rows={3}
                            onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
                            onBlur={e =>  (e.target.style.borderColor = bd)}
                          />
                        </Field>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
                            style={{ border: `1px solid ${bd}`, color: mt }}
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleDeleteSolicitud(s.id, s.imageUrl)}
                            className="px-3 py-2 rounded-xl text-xs font-light"
                            style={{ border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', background: 'rgba(248,113,113,0.05)' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleUpdateSolicitud(s.id)}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                            style={{ background: '#fff', color: '#000' }}
                          >
                            {saving
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Save className="w-3 h-3" />}
                            Guardar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SOCIOS ── */}
      {activeTab === 'socios' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total solicitudes',    value: socios.length, color: 'rgba(255,255,255,0.7)' },
              { label: 'Inversión aprobada',   value: `$${socios.filter(s => s.estado === 'aprobado').reduce((a, s) => a + s.monto, 0).toLocaleString('es-PE')}`, color: '#4ade80' },
              { label: 'Inversión pendiente',  value: `$${socios.filter(s => s.estado === 'pendiente').reduce((a, s) => a + s.monto, 0).toLocaleString('es-PE')}`, color: '#f59e0b' },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl p-4" style={{ background: sf, border: `1px solid ${bd}` }}>
                <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>{s.label}</p>
                <p className="text-xl font-light" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
              <input
                value={socioSearch}
                onChange={e => setSocioSearch(e.target.value)}
                placeholder="Buscar por nombre..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-light outline-none"
                style={{ background: sf, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
              />
            </div>
            {(['todos', 'pendiente', 'aprobado', 'rechazado'] as const).map(f => (
              <button
                key={f}
                onClick={() => setSocioFilter(f)}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-all"
                style={{
                  background: socioFilter === f
                    ? (f !== 'todos' ? SOCIO_STATUS[f].bg : 'rgba(255,255,255,0.08)')
                    : 'transparent',
                  color: socioFilter === f
                    ? (f !== 'todos' ? SOCIO_STATUS[f].color : 'white')
                    : mt,
                  border: `1px solid ${socioFilter === f ? 'rgba(255,255,255,0.15)' : 'transparent'}`,
                }}
              >
                {f === 'todos' ? 'Todos' : SOCIO_STATUS[f].label}
              </button>
            ))}
          </div>
          {filteredSocios.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
              <Building2 className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.08)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: mt }}>No hay solicitudes de socio.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSocios.map(s => {
                const cfg  = SOCIO_STATUS[s.estado] ?? SOCIO_STATUS.pendiente;
                const tier = s.tierLabel ?? getTierLabel(s.monto);
                return (
                  <div key={s.id} className="rounded-2xl p-4 transition-all" style={{ background: sf, border: `1px solid ${bd}` }}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-white text-sm font-light">{s.nombre}</p>
                          <span
                            className="text-xs font-light px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.15)' }}
                          >
                            ${s.monto.toLocaleString('es-PE')} USD
                          </span>
                          <span className="text-[10px]">{tier}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-light" style={{ color: mt }}>
                            {s.metodo === 'transferencia' ? '🏦 Transferencia' : '💵 Efectivo'}
                          </span>
                          <span className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.2)' }}>
                            {formatDate(s.creadoEn)}
                          </span>
                        </div>
                        {s.mensaje && (
                          <p className="text-xs font-light mt-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            "{s.mensaje}"
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {s.fileUrl && (
                          <a
                            href={s.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                            style={{ border: `1px solid ${bd}`, color: mt }}
                          >
                            <Paperclip className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </a>
                        )}
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}25` }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
                          {cfg.label}
                        </span>
                        <div className="relative">
                          <select
                            value={s.estado}
                            onChange={e => handleUpdateSocio(s.id, e.target.value as 'aprobado' | 'rechazado' | 'pendiente')}
                            disabled={updatingSocio === s.id}
                            className="pl-2.5 pr-7 py-1.5 rounded-xl text-[10px] font-light outline-none appearance-none cursor-pointer transition-all disabled:opacity-50"
                            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}`, color: 'rgba(255,255,255,0.6)' }}
                          >
                            <option value="pendiente">En revisión</option>
                            <option value="aprobado">Aprobado</option>
                            <option value="rechazado">Rechazado</option>
                          </select>
                          {updatingSocio === s.id
                            ? <Loader2 className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 animate-spin pointer-events-none" style={{ color: mt }} />
                            : <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: mt }} />}
                        </div>
                        <button
                          onClick={() => handleDeleteSocio(s.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                          style={{ border: `1px solid ${bd}`, color: mt }}
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// MOON FEST PANEL
// ═══════════════════════════════════════════════════════════════════

const MoonFestPanel: React.FC = () => {
  const [config,     setConfig]     = useState<Partial<FestConfig>>({
    logoUrl: '', discordInviteUrl: '', eventName: 'MOON FEST 2026', eventDate: '',
    eventLocation: '', primaryColor: '#000000', secondaryColor: '#ffffff', accentColor: '#6b7280',
  });
  const [users,      setUsers]      = useState<FestUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [activeTab,  setActiveTab]  = useState('general');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configSnap, usersSnap] = await Promise.all([getDoc(CONFIG_DOC), getDocs(USERS_COL)]);
      if (configSnap.exists()) setConfig(configSnap.data() as FestConfig);
      setUsers(usersSnap.docs.map(d => ({ ...d.data(), id: d.id }) as FestUser));
    } catch (e) {
      toast.error('Error cargando datos');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async (fields: Partial<FestConfig>) => {
    setSaving(true);
    try {
      await setDoc(CONFIG_DOC, fields, { merge: true });
      setConfig(p => ({ ...p, ...fields }));
      toast.success('Guardado correctamente');
    } catch (e) {
      toast.error('Error al guardar');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(p => ({ ...p, [name]: value }));
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      await deleteDoc(doc(db, 'moon_studios_fest_2026', userId));
      setUsers(p => p.filter(u => u.id !== userId));
      toast.success('Eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) return <LoadingSpinner />;

  const TABS = [
    { id: 'general',  label: 'General',                           icon: Settings },
    { id: 'branding', label: 'Marca',                             icon: Image },
    { id: 'discord',  label: 'Discord',                           icon: MessageCircle },
    { id: 'users',    label: `Registrados (${users.length})`,     icon: Users },
  ];

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl p-1.5 flex-wrap" style={{ background: sc, border: `1px solid ${bd}` }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-light transition-all"
            style={{
              background: activeTab === id ? 'rgba(255,255,255,0.08)' : 'transparent',
              color:      activeTab === id ? 'white' : mt,
            }}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />{label}
          </button>
        ))}
      </div>

      {/* GENERAL */}
      {activeTab === 'general' && (
        <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
          <p className="text-sm font-light text-white">Configuración General</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre del Evento" hint="Aparece como título en la web pública">
              <StyledInput name="eventName" value={config.eventName ?? ''} onChange={handleChange} placeholder="MOON FEST 2026" />
            </Field>
            <Field label="Fecha del Evento">
              <StyledInput name="eventDate" type="date" value={config.eventDate ?? ''} onChange={handleChange} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Ubicación">
                <StyledInput name="eventLocation" value={config.eventLocation ?? ''} onChange={handleChange} placeholder="Lima, Perú" />
              </Field>
            </div>
          </div>
          {(config.eventName || config.eventDate || config.eventLocation) && (
            <div className="p-4 rounded-2xl" style={{ background: sc, border: `1px solid ${bd}` }}>
              <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Vista previa</p>
              <p className="text-base font-light text-white">{config.eventName}</p>
              {config.eventDate && (
                <p className="text-sm font-light mt-0.5" style={{ color: mt }}>
                  {new Date(config.eventDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
              {config.eventLocation && (
                <p className="text-sm font-light" style={{ color: mt }}>📍 {config.eventLocation}</p>
              )}
            </div>
          )}
          <SaveBtn
            saving={saving}
            onClick={() => handleSave({
              eventName:     config.eventName     ?? '',
              eventDate:     config.eventDate     ?? '',
              eventLocation: config.eventLocation ?? '',
            })}
          />
        </div>
      )}

      {/* BRANDING */}
      {activeTab === 'branding' && (
        <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
          <p className="text-sm font-light text-white">Configuración de Marca</p>
          <Field label="URL del Logo" hint="Aparece en el header y en los tickets">
            <StyledInput name="logoUrl" value={config.logoUrl ?? ''} onChange={handleChange} placeholder="https://ejemplo.com/logo.png" />
          </Field>
          {config.logoUrl && (
            <div className="p-4 rounded-2xl" style={{ background: sc, border: `1px solid ${bd}` }}>
              <p className="text-[10px] uppercase tracking-widest font-light mb-3" style={{ color: mt }}>Vista previa</p>
              <img
                src={config.logoUrl} alt="Logo"
                className="h-16 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: 'primaryColor'   as const, label: 'Primario' },
              { key: 'secondaryColor' as const, label: 'Secundario' },
              { key: 'accentColor'    as const, label: 'Acento' },
            ]).map(({ key, label }) => (
              <Field key={key} label={label}>
                <div className="flex gap-2">
                  <input
                    name={key} type="color"
                    value={config[key] ?? '#000000'}
                    onChange={handleChange}
                    className="w-12 h-10 rounded-xl p-1 cursor-pointer"
                    style={{ background: sc, border: `1px solid ${bd}` }}
                  />
                  <input
                    value={config[key] ?? ''} readOnly
                    className="flex-1 px-2.5 rounded-xl text-xs font-mono font-light"
                    style={{ background: sc, border: `1px solid ${bd}`, color: mt }}
                  />
                </div>
              </Field>
            ))}
          </div>
          <SaveBtn
            saving={saving}
            onClick={() => handleSave({
              logoUrl:        config.logoUrl        ?? '',
              primaryColor:   config.primaryColor   ?? '#000000',
              secondaryColor: config.secondaryColor ?? '#ffffff',
              accentColor:    config.accentColor    ?? '#6b7280',
            })}
          />
        </div>
      )}

      {/* DISCORD */}
      {activeTab === 'discord' && (
        <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
          <p className="text-sm font-light text-white">Configuración de Discord</p>
          <Field label="URL de Invitación" hint="Aparece en el ticket tras el registro">
            <StyledInput
              name="discordInviteUrl"
              value={config.discordInviteUrl ?? ''}
              onChange={handleChange}
              placeholder="https://discord.gg/tu-invitacion"
            />
          </Field>
          {config.discordInviteUrl && (
            <div
              className="flex items-center gap-2.5 p-3 rounded-xl"
              style={{ background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)' }}
            >
              <MessageCircle className="w-4 h-4" style={{ color: '#818cf8' }} strokeWidth={1.5} />
              <span className="text-sm font-light" style={{ color: '#818cf8' }}>{config.discordInviteUrl}</span>
            </div>
          )}
          <SaveBtn
            saving={saving}
            onClick={() => handleSave({ discordInviteUrl: config.discordInviteUrl ?? '' })}
          />
        </div>
      )}

      {/* USERS */}
      {activeTab === 'users' && (
        <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: bd }}>
            <div>
              <span className="text-sm font-light text-white">Usuarios Registrados</span>
              <span className="text-xs font-light ml-2" style={{ color: mt }}>{users.length} total</span>
            </div>
            <button
              onClick={loadData}
              className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
              style={{ borderColor: bd, color: mt }}
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
          {users.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: mt }}>No hay usuarios registrados aún</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: bd }}>
                    {['Código', 'Nombre', 'Correo', 'Teléfono', 'Registrado', ''].map(h => (
                      <th
                        key={h}
                        className="text-left py-3 px-4 text-[10px] uppercase tracking-widest font-light"
                        style={{ color: mt }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b transition-colors hover:bg-white/[0.02]" style={{ borderColor: bd }}>
                      <td className="py-3 px-4 font-mono text-xs" style={{ color: mt }}>{user.code ?? '—'}</td>
                      <td className="py-3 px-4 font-light text-white text-sm">{user.firstName} {user.lastName}</td>
                      <td className="py-3 px-4 font-light text-sm" style={{ color: mt }}>{user.email}</td>
                      <td className="py-3 px-4 font-light text-sm" style={{ color: mt }}>{user.phone}</td>
                      <td className="py-3 px-4 font-light text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {formatDate(user.registeredAt)}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                          style={{ color: 'rgba(255,255,255,0.2)' }}
                          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#f87171')}
                          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.2)')}
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// CORREO FEST PANEL
// ═══════════════════════════════════════════════════════════════════

const CorreoFestPanel: React.FC = () => {
  const [festUsers,     setFestUsers]     = useState<FestUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [mode,          setMode]          = useState<'all' | 'one'>('all');
  const [selectedUser,  setSelectedUser]  = useState<FestUser | null>(null);
  const [userSearch,    setUserSearch]    = useState('');
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [subject,       setSubject]       = useState('');
  const [body,          setBody]          = useState('');
  const [fromName,      setFromName]      = useState('Moon Studios');
  const [sending,       setSending]       = useState(false);
  const [progress,      setProgress]      = useState({ current: 0, total: 0 });
  const [done,          setDone]          = useState(false);
  const [failedList,    setFailedList]    = useState<{ name: string; email: string }[]>([]);
  const [formError,     setFormError]     = useState('');

  const ejConfigured = !!(
    EJ_SERVICE  && EJ_SERVICE  !== 'undefined' &&
    EJ_TEMPLATE && EJ_TEMPLATE !== 'undefined' &&
    EJ_KEY      && EJ_KEY      !== 'undefined'
  );

  useEffect(() => {
    getDocs(USERS_COL)
      .then(snap => setFestUsers(snap.docs.map(d => ({ ...d.data(), id: d.id }) as FestUser)))
      .catch(e => { toast.error('Error cargando usuarios'); console.error(e); })
      .finally(() => setLoading(false));
  }, []);

  const recipients      = mode === 'all' ? festUsers : selectedUser ? [selectedUser] : [];
  const validRecipients = recipients.filter(u => u.email?.includes('@'));
  const filtered        = festUsers.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleSend = async () => {
    setFormError(''); setFailedList([]); setDone(false);
    if (!ejConfigured)            { setFormError('EmailJS no está configurado.'); return; }
    if (!subject.trim())          { setFormError('El asunto es obligatorio.'); return; }
    if (!body.trim())             { setFormError('El mensaje no puede estar vacío.'); return; }
    if (validRecipients.length === 0) { setFormError('No hay destinatarios con email válido.'); return; }
    if (!confirm(`¿Enviar a ${validRecipients.length} destinatario${validRecipients.length !== 1 ? 's' : ''}?`)) return;

    setSending(true);
    setProgress({ current: 0, total: validRecipients.length });
    const failed: { name: string; email: string }[] = [];

    for (let i = 0; i < validRecipients.length; i++) {
      const user     = validRecipients[i];
      const fullName = `${user.firstName} ${user.lastName}`.trim();
      try {
        await emailjs.send(EJ_SERVICE, EJ_TEMPLATE, {
          to_email:  user.email,
          to_name:   fullName || user.email,
          subject:   subject.trim(),
          message:   body.trim(),
          from_name: fromName.trim() || 'Moon Studios',
        }, EJ_KEY);
      } catch (err) {
        console.error(err);
        failed.push({ name: fullName, email: user.email });
      }
      setProgress({ current: i + 1, total: validRecipients.length });
      if (i < validRecipients.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setSending(false);
    setFailedList(failed);
    setDone(true);
    const sent = validRecipients.length - failed.length;
    if (sent > 0) {
      toast.success(`${sent} email${sent !== 1 ? 's' : ''} enviado${sent !== 1 ? 's' : ''}`);
      setSubject(''); setBody(''); setSelectedUser(null);
    }
    if (failed.length > 0) toast.error(`${failed.length} fallo${failed.length !== 1 ? 's' : ''}`);
  };

  return (
    <div className="space-y-5">
      {!ejConfigured && (
        <div
          className="flex items-start gap-3 p-4 rounded-2xl"
          style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} strokeWidth={1.5} />
          <div className="space-y-1.5">
            <p className="text-sm font-light" style={{ color: '#fbbf24' }}>EmailJS no configurado</p>
            <div className="rounded-lg p-3 space-y-1" style={{ background: 'rgba(0,0,0,0.3)' }}>
              {[
                'VITE_EMAILJS_SERVICE_ID=service_xxxxxxx',
                'VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx',
                'VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxx',
              ].map(line => (
                <p key={line} className="text-[11px] font-mono" style={{ color: 'rgba(251,191,36,0.5)' }}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Destinatarios */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AtSign className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />
            <p className="text-sm font-light text-white">Destinatarios</p>
          </div>
          {!loading && (
            <span className="text-xs font-light px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: mt }}>
              {festUsers.length} registrado{festUsers.length !== 1 ? 's' : ''} · {festUsers.filter(u => u.email?.includes('@')).length} con email
            </span>
          )}
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
          {([
            { id: 'all' as const, label: 'Todos los registrados',    Icon: Users },
            { id: 'one' as const, label: 'Un usuario específico',    Icon: UserCheck },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { setMode(id); setSelectedUser(null); setUserSearch(''); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-light transition-all"
              style={{
                background: mode === id ? 'rgba(255,255,255,0.08)' : 'transparent',
                color:      mode === id ? 'white' : mt,
              }}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />{label}
            </button>
          ))}
        </div>
        {mode === 'all' && !loading && (
          <div
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)' }}
          >
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#4ade80' }} strokeWidth={1.5} />
            <p className="text-xs font-light" style={{ color: '#4ade80' }}>
              Se enviará a <strong>{validRecipients.length}</strong> correos válidos
            </p>
          </div>
        )}
        {mode === 'one' && (
          <div className="relative">
            {selectedUser ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-light">{selectedUser.firstName?.[0]?.toUpperCase() ?? '?'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-light truncate">{selectedUser.firstName} {selectedUser.lastName}</p>
                  <p className="text-xs font-light truncate" style={{ color: mt }}>{selectedUser.email}</p>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10"
                  style={{ color: mt }}
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
                  <input
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Buscar por nombre o email..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm font-light outline-none"
                    style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
                  />
                </div>
                {showDropdown && filtered.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 max-h-52 overflow-y-auto"
                    style={{ background: 'hsl(var(--card))', border: `1px solid ${bd}`, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                  >
                    {filtered.map(u => (
                      <button
                        key={u.id}
                        onMouseDown={() => { setSelectedUser(u); setUserSearch(''); setShowDropdown(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
                        style={{ borderBottom: `1px solid ${bd}` }}
                      >
                        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs">{u.firstName?.[0]?.toUpperCase() ?? '?'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-light truncate">{u.firstName} {u.lastName}</p>
                          <p className="text-xs font-light truncate" style={{ color: mt }}>{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Remitente */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: sf, border: `1px solid ${bd}` }}>
        <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Nombre del remitente</p>
        <input
          value={fromName}
          onChange={e => setFromName(e.target.value)}
          placeholder="Moon Studios"
          maxLength={60}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none"
          style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
          onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
          onBlur={e =>  (e.target.style.borderColor = bd)}
        />
      </div>

      {/* Redactar */}
      <div className="rounded-2xl overflow-hidden" style={{ background: sf, border: `1px solid ${bd}` }}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: bd }}>
          <Mail className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />
          <p className="text-sm font-light text-white">Redactar email</p>
        </div>

        {/* Asunto */}
        <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Asunto</p>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            maxLength={100}
            placeholder="Ej: ¡Bienvenido al Moon Studios Fest 2026!"
            className="w-full bg-transparent text-white text-sm font-light outline-none placeholder:opacity-25"
          />
          <div className="flex justify-end mt-2">
            <span className="text-[10px] font-light" style={{ color: subject.length > 85 ? '#f87171' : 'rgba(255,255,255,0.15)' }}>
              {subject.length}/100
            </span>
          </div>
        </div>

        {/* Mensaje */}
        <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Mensaje</p>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={8}
            maxLength={3000}
            placeholder="Escribe el contenido del email..."
            className="w-full bg-transparent text-white text-sm font-light outline-none resize-none placeholder:opacity-20 leading-relaxed"
          />
          <div className="flex justify-end mt-1">
            <span className="text-[10px] font-light" style={{ color: body.length > 2700 ? '#f87171' : 'rgba(255,255,255,0.15)' }}>
              {body.length}/3000
            </span>
          </div>
        </div>

        {/* Progreso */}
        {sending && progress.total > 0 && (
          <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-light" style={{ color: mt }}>
                Enviando {progress.current} de {progress.total}...
              </span>
              <span className="text-xs font-light" style={{ color: mt }}>
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%`, background: '#818cf8' }}
              />
            </div>
          </div>
        )}

        {/* Resultado */}
        {done && !sending && (
          <div className="px-5 py-4 border-b space-y-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5" style={{ color: '#4ade80' }} strokeWidth={1.5} />
              <p className="text-xs font-light" style={{ color: '#4ade80' }}>
                {progress.total - failedList.length} email{progress.total - failedList.length !== 1 ? 's' : ''} enviado{progress.total - failedList.length !== 1 ? 's' : ''}
              </p>
            </div>
            {failedList.length > 0 && (
              <div
                className="rounded-xl p-3 space-y-1.5"
                style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)' }}
              >
                <p className="text-xs font-light" style={{ color: '#f87171' }}>
                  {failedList.length} fallo{failedList.length !== 1 ? 's' : ''}:
                </p>
                {failedList.map((e, i) => (
                  <p key={i} className="text-[11px] font-mono" style={{ color: 'rgba(248,113,113,0.65)' }}>
                    {e.name} — {e.email}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer con botón enviar */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            {formError && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f87171' }} strokeWidth={1.5} />
                <p className="text-xs font-light" style={{ color: '#f87171' }}>{formError}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={sending || validRecipients.length === 0 || !subject.trim() || !body.trim() || !ejConfigured}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-light transition-all disabled:opacity-40 hover:opacity-90"
            style={{ background: '#fff', color: '#000' }}
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />Enviando {progress.current}/{progress.total}</>
              : <><Send className="w-4 h-4" strokeWidth={1.5} />Enviar{validRecipients.length > 0 ? ` (${validRecipients.length})` : ''}</>}
          </button>
        </div>
      </div>
      <p className="text-[11px] font-light text-center" style={{ color: 'rgba(255,255,255,0.15)' }}>
        Plan gratuito EmailJS: 200 emails/mes · Los emails llegan directamente al Gmail del registrado
      </p>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// INCIDENTS PANEL
// ═══════════════════════════════════════════════════════════════════

type EstadoIncidente = 'investigando' | 'identificado' | 'monitoreando' | 'resuelto';
type ImpactoTipo     = 'ninguno' | 'menor' | 'mayor' | 'crítico';

interface ActualizacionInc {
  id: string; status: EstadoIncidente; body: string; createdAt: string;
}
interface IncidenteItem {
  id: string; title: string; status: EstadoIncidente; impact: ImpactoTipo;
  createdAt: string; resolvedAt: string | null; updates: ActualizacionInc[];
}

const INC_STATUS: Record<EstadoIncidente, { label: string; color: string; bg: string }> = {
  investigando: { label: 'Investigando', color: '#f87171', bg: 'rgba(248,113,113,0.06)' },
  identificado: { label: 'Identificado', color: '#facc15', bg: 'rgba(250,204,21,0.06)'  },
  monitoreando: { label: 'Monitoreando', color: '#60a5fa', bg: 'rgba(96,165,250,0.06)'  },
  resuelto:     { label: 'Resuelto',     color: '#4ade80', bg: 'rgba(74,222,128,0.06)'  },
};

const INC_IMPACT: Record<ImpactoTipo, { label: string; color: string }> = {
  ninguno: { label: 'Sin impacto',     color: 'rgba(255,255,255,0.3)' },
  menor:   { label: 'Impacto menor',   color: '#facc15'               },
  mayor:   { label: 'Impacto mayor',   color: '#fb923c'               },
  crítico: { label: 'Impacto crítico', color: '#f87171'               },
};

const fmtRel = (iso: string): string => {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dd = Math.floor(d / 86400000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `hace ${m}m`;
  if (h < 24) return `hace ${h}h`;
  return `hace ${dd}d`;
};

// ── Tarjeta de incidente individual ──────────────────────────────────────────

interface IncidentCardProps {
  inc:          IncidenteItem;
  isExpanded:   boolean;
  onToggle:     () => void;
  updateForm:   { status: EstadoIncidente; message: string };
  onUpdateForm: (patch: Partial<{ status: EstadoIncidente; message: string }>) => void;
  onAddUpdate:  () => void;
  onDelete:     () => void;
  updating:     boolean;
  deleting:     boolean;
}

const IncidentCard: React.FC<IncidentCardProps> = ({
  inc, isExpanded, onToggle, updateForm, onUpdateForm, onAddUpdate, onDelete, updating, deleting,
}) => {
  const sCfg      = INC_STATUS[inc.status] ?? INC_STATUS.investigando;
  const iCfg      = INC_IMPACT[inc.impact] ?? INC_IMPACT.menor;
  const isResolved = inc.status === 'resuelto';

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border:     `1px solid ${isResolved ? bd : sCfg.color + '30'}`,
        background: isResolved ? 'rgba(255,255,255,0.015)' : sCfg.bg,
      }}
    >
      {/* Fila header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all hover:bg-white/[0.03]"
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${!isResolved ? 'animate-pulse' : ''}`}
          style={{ background: sCfg.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-light text-white">{inc.title}</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{
                background: iCfg.color + '18',
                color:      iCfg.color,
                border:     `1px solid ${iCfg.color}35`,
              }}
            >
              {iCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: sCfg.color }}>
              {sCfg.label}
            </span>
            <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            <span className="text-[11px] font-light" style={{ color: mt }}>{fmtRel(inc.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            disabled={deleting}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/15 disabled:opacity-40"
            style={{ color: 'rgba(248,113,113,0.45)' }}
          >
            {deleting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2  className="w-3.5 h-3.5" strokeWidth={1.5} />}
          </button>
          <ChevronDown
            className="w-4 h-4 transition-transform"
            style={{ color: mt, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            strokeWidth={1.5}
          />
        </div>
      </button>

      {/* Contenido expandido */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>

          {/* Timeline de actualizaciones */}
          {inc.updates.length > 0 && (
            <div className="space-y-3 pt-3">
              {inc.updates.map((u, i) => {
                const uCfg = INC_STATUS[u.status] ?? INC_STATUS.investigando;
                return (
                  <div key={u.id} className="flex gap-3">
                    <div className="flex flex-col items-center pt-0.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: uCfg.color }} />
                      {i < inc.updates.length - 1 && (
                        <div className="w-px flex-1 mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', minHeight: 12 }} />
                      )}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: uCfg.color }}>
                          {uCfg.label}
                        </span>
                        <span className="text-[10px] font-light" style={{ color: mt }}>{fmtRel(u.createdAt)}</span>
                      </div>
                      <p className="text-xs font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {u.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Formulario de actualización (solo si no está resuelto) */}
          {!isResolved && (
            <div className="space-y-2.5 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>
                Añadir actualización
              </p>
              <select
                value={updateForm.status}
                onChange={e => onUpdateForm({ status: e.target.value as EstadoIncidente })}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all"
                style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
              >
                <option value="investigando">Investigando</option>
                <option value="identificado">Identificado</option>
                <option value="monitoreando">Monitoreando</option>
                <option value="resuelto">✓ Resuelto</option>
              </select>
              <textarea
                value={updateForm.message}
                onChange={e => onUpdateForm({ message: e.target.value })}
                rows={2}
                placeholder="Describe el progreso del incidente…"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none resize-none transition-all"
                style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
                onBlur={e =>  (e.target.style.borderColor = bd)}
              />
              <div className="flex justify-end">
                <button
                  onClick={onAddUpdate}
                  disabled={updating || !updateForm.message.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-light transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: '#fff', color: '#000' }}
                >
                  {updating
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />Publicando...</>
                    : <><Send    className="w-3.5 h-3.5" strokeWidth={1.5} />Publicar actualización</>}
                </button>
              </div>
            </div>
          )}

          {/* Fecha de resolución */}
          {isResolved && inc.resolvedAt && (
            <p className="text-[11px] font-light pt-2" style={{ color: mt, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              Resuelto el {new Date(inc.resolvedAt).toLocaleString('es-ES', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Panel principal de incidentes ─────────────────────────────────────────────

const IncidentsPanel: React.FC = () => {
  const [incidents,   setIncidents]   = useState<IncidenteItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [showNew,     setShowNew]     = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [newForm,     setNewForm]     = useState({ title: '', impact: 'menor' as ImpactoTipo, message: '' });
  const [updateForms, setUpdateForms] = useState<Record<string, { status: EstadoIncidente; message: string }>>({});
  const [updating,    setUpdating]    = useState<Record<string, boolean>>({});
  const [deleting,    setDeleting]    = useState<Record<string, boolean>>({});
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({});

  // ── Carga desde la API de Luna NET (no Firestore — garantiza la DB correcta) ──
  const loadIncidents = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const json = await lunaFetch('/api/public/incidents'); // endpoint público, sin API key
      const data: IncidenteItem[] = (json.data ?? [])
        .sort((a: IncidenteItem, b: IncidenteItem) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      setIncidents(data);
      // Auto-expandir activos
      const autoExp: Record<string, boolean> = {};
      data.filter(i => i.status !== 'resuelto').forEach(i => { autoExp[i.id] = true; });
      setExpanded(autoExp);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setLoadError(msg);
      toast.error('Error cargando incidentes: ' + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  const handleCreate = async () => {
    if (!newForm.title.trim()) { toast.error('El título es obligatorio'); return; }
    if (!auth.currentUser) { toast.error('Debes iniciar sesión'); return; }
    setCreating(true);
    try {
      const json = await lunaFetch('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title:   newForm.title.trim(),
          impact:  newForm.impact,
          message: newForm.message.trim() || undefined,
        }),
      });
      const created: IncidenteItem = json.data;
      setIncidents(prev => [created, ...prev]);
      setNewForm({ title: '', impact: 'menor', message: '' });
      setShowNew(false);
      setExpanded(prev => ({ ...prev, [created.id]: true }));
      toast.success('Incidente creado ✓');
    } catch (e: unknown) {
      toast.error('Error al crear: ' + (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const initUpdateForm = (id: string, currentStatus: EstadoIncidente) => {
    setUpdateForms(prev => prev[id] ? prev : { ...prev, [id]: { status: currentStatus, message: '' } });
  };

  const handleAddUpdate = async (incId: string) => {
    const form = updateForms[incId];
    if (!form?.message?.trim()) { toast.error('El mensaje es obligatorio'); return; }
    if (!auth.currentUser) { toast.error('Debes iniciar sesión'); return; }
    setUpdating(prev => ({ ...prev, [incId]: true }));
    try {
      const json = await lunaFetch(`/api/incidents/${incId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: form.status, message: form.message.trim() }),
      });
      const updated: IncidenteItem = json.data;
      setIncidents(prev => prev.map(i => i.id === incId ? updated : i));
      setUpdateForms(prev => ({ ...prev, [incId]: { status: form.status, message: '' } }));
      toast.success('Actualización publicada ✓');
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setUpdating(prev => ({ ...prev, [incId]: false }));
    }
  };

  const handleDelete = async (incId: string, title: string) => {
    if (!confirm(`¿Eliminar "${title}"?`)) return;
    if (!auth.currentUser) { toast.error('Debes iniciar sesión'); return; }
    setDeleting(prev => ({ ...prev, [incId]: true }));
    try {
      await lunaFetch(`/api/incidents/${incId}`, { method: 'DELETE' });
      setIncidents(prev => prev.filter(i => i.id !== incId));
      toast.success('Incidente eliminado');
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setDeleting(prev => ({ ...prev, [incId]: false }));
    }
  };

  const activos   = incidents.filter(i => i.status !== 'resuelto');
  const resueltos = incidents.filter(i => i.status === 'resuelto');

  if (loading)   return <LoadingSpinner label="Cargando incidentes…" />;
  if (loadError) return <ErrorState message={loadError} onRetry={loadIncidents} />;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-light text-white">Sistema de Incidentes</p>
          <p className="text-xs font-light mt-0.5" style={{ color: mt }}>
            {activos.length > 0
              ? `${activos.length} incidente${activos.length > 1 ? 's' : ''} activo${activos.length > 1 ? 's' : ''}`
              : 'Sin incidentes activos · todos los sistemas OK'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadIncidents}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/5"
            style={{ border: `1px solid ${bd}`, color: mt }}
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setShowNew(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
            style={{
              background: showNew ? 'transparent' : 'rgba(248,113,113,0.08)',
              border:     `1px solid ${showNew ? bd : 'rgba(248,113,113,0.3)'}`,
              color:      showNew ? mt : '#f87171',
            }}
          >
            {showNew
              ? <X             className="w-3.5 h-3.5" strokeWidth={1.5} />
              : <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />}
            {showNew ? 'Cancelar' : 'Nuevo incidente'}
          </button>
        </div>
      </div>

      {/* Formulario creación */}
      {showNew && (
        <div
          className="space-y-3 p-4 rounded-2xl"
          style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.2)' }}
        >
          <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: '#f87171' }}>
            Declarar incidente
          </p>
          <Field label="Título *">
            <StyledInput
              name="inc_title"
              value={newForm.title}
              onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ej: Latencia elevada en el Gateway de Discord"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Impacto">
              <select
                value={newForm.impact}
                onChange={e => setNewForm(f => ({ ...f, impact: e.target.value as ImpactoTipo }))}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all"
                style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
              >
                <option value="ninguno">Sin impacto</option>
                <option value="menor">Menor</option>
                <option value="mayor">Mayor</option>
                <option value="crítico">Crítico</option>
              </select>
            </Field>
          </div>
          <Field label="Mensaje inicial" hint="Si lo dejas vacío se usará el texto por defecto.">
            <textarea
              value={newForm.message}
              onChange={e => setNewForm(f => ({ ...f, message: e.target.value }))}
              rows={2}
              placeholder="Estamos investigando este incidente."
              className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none resize-none transition-all"
              style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
              onBlur={e =>  (e.target.style.borderColor = bd)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowNew(false)}
              className="px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
              style={{ border: `1px solid ${bd}`, color: mt }}
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newForm.title.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: '#f87171', color: '#000' }}
            >
              {creating
                ? <><Loader2      className="w-3.5 h-3.5 animate-spin" />Creando...</>
                : <><AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />Declarar incidente</>}
            </button>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {activos.length === 0 && !showNew && (
        <div
          className="flex flex-col items-center justify-center py-10 rounded-2xl gap-3"
          style={{ background: 'rgba(74,222,128,0.03)', border: '1px solid rgba(74,222,128,0.12)' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}
          >
            <CheckCircle className="w-5 h-5" style={{ color: '#4ade80' }} strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-sm font-light text-white">Todos los sistemas operativos</p>
            <p className="text-xs font-light mt-0.5" style={{ color: mt }}>No hay incidentes activos</p>
          </div>
        </div>
      )}

      {/* Incidentes activos */}
      {activos.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: '#f87171' }}>
            ● Activos ({activos.length})
          </p>
          {activos.map(inc => (
            <IncidentCard
              key={inc.id}
              inc={inc}
              isExpanded={!!expanded[inc.id]}
              onToggle={() => { setExpanded(prev => ({ ...prev, [inc.id]: !prev[inc.id] })); initUpdateForm(inc.id, inc.status); }}
              updateForm={updateForms[inc.id] ?? { status: inc.status, message: '' }}
              onUpdateForm={patch => setUpdateForms(prev => ({
                ...prev,
                [inc.id]: { ...(prev[inc.id] ?? { status: inc.status, message: '' }), ...patch },
              }))}
              onAddUpdate={() => handleAddUpdate(inc.id)}
              onDelete={() => handleDelete(inc.id, inc.title)}
              updating={!!updating[inc.id]}
              deleting={!!deleting[inc.id]}
            />
          ))}
        </div>
      )}

      {/* Incidentes resueltos */}
      {resueltos.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>
            ✓ Resueltos ({resueltos.length})
          </p>
          {resueltos.slice(0, 15).map(inc => (
            <IncidentCard
              key={inc.id}
              inc={inc}
              isExpanded={!!expanded[inc.id]}
              onToggle={() => setExpanded(prev => ({ ...prev, [inc.id]: !prev[inc.id] }))}
              updateForm={updateForms[inc.id] ?? { status: 'resuelto', message: '' }}
              onUpdateForm={patch => setUpdateForms(prev => ({
                ...prev,
                [inc.id]: { ...(prev[inc.id] ?? { status: 'resuelto', message: '' }), ...patch },
              }))}
              onAddUpdate={() => handleAddUpdate(inc.id)}
              onDelete={() => handleDelete(inc.id, inc.title)}
              updating={!!updating[inc.id]}
              deleting={!!deleting[inc.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// EQUIPO — Panel de administración
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_EQUIPO: Omit<EquipoMember, 'id'> = {
  nombre: '', rol: '', foto: '', bio: '',
  email: '', linkedin: '', github: '', twitter: '', instagram: '',
  order: 0, active: true,
};

interface EquipoFormProps {
  form: Omit<EquipoMember, 'id'>;
  setForm: React.Dispatch<React.SetStateAction<Omit<EquipoMember, 'id'>>>;
  saving: boolean;
  editingId: string | null;
  onCancel: () => void;
  onSave: () => void;
}

const EquipoForm: React.FC<EquipoFormProps> = ({ form, setForm, saving, editingId, onCancel, onSave }) => {
  const handle = (key: keyof Omit<EquipoMember, 'id'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4 mt-4 pt-4" style={{ borderTop: `1px solid ${bd}` }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre completo">
          <StyledInput name="nombre" value={form.nombre} onChange={handle('nombre')} placeholder="Andre Sm" />
        </Field>
        <Field label="Rol / Cargo" hint="Rol personalizado del integrante">
          <StyledInput name="rol" value={form.rol} onChange={handle('rol')} placeholder="CEO & Fundador" />
        </Field>
      </div>

      <Field label="Foto (URL)">
        <StyledInput name="foto" value={form.foto} onChange={handle('foto')} placeholder="https://cdn.example.com/foto.png" />
      </Field>

      <Field label="Biografía / Descripción corta">
        <textarea
          name="bio" value={form.bio} onChange={handle('bio')} rows={3}
          placeholder="Breve descripción del rol y experiencia del integrante..."
          className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all resize-none"
          style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
        />
      </Field>

      <p className="text-[10px] uppercase tracking-widest font-light pt-1" style={{ color: mt }}>
        Redes / Contacto (opcional)
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Email">
          <StyledInput name="email" value={form.email ?? ''} onChange={handle('email')} placeholder="andre@moonstudios.dev" />
        </Field>
        <Field label="LinkedIn">
          <StyledInput name="linkedin" value={form.linkedin ?? ''} onChange={handle('linkedin')} placeholder="https://linkedin.com/in/..." />
        </Field>
        <Field label="GitHub">
          <StyledInput name="github" value={form.github ?? ''} onChange={handle('github')} placeholder="https://github.com/..." />
        </Field>
        <Field label="Twitter / X">
          <StyledInput name="twitter" value={form.twitter ?? ''} onChange={handle('twitter')} placeholder="https://x.com/..." />
        </Field>
        <Field label="Instagram">
          <StyledInput name="instagram" value={form.instagram ?? ''} onChange={handle('instagram')} placeholder="https://instagram.com/..." />
        </Field>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
          style={{ border: `1px solid ${bd}`, color: mt }}
        >
          Cancelar
        </button>
        <SaveBtn saving={saving} onClick={onSave} label={editingId ? 'Actualizar' : 'Agregar integrante'} />
      </div>
    </div>
  );
};

const EquipoPanel: React.FC = () => {
  const [miembros,  setMiembros]  = useState<EquipoMember[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew,   setShowNew]   = useState(false);
  const [form,      setForm]      = useState<Omit<EquipoMember, 'id'>>(DEFAULT_EQUIPO);

  const loadEquipo = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await withTimeout(getDocs(EQUIPO_COL), TIMEOUTS.LOAD, 'getDocs equipo');
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as EquipoMember))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setMiembros(data);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      console.error('Error cargando equipo:', e);
      setLoadError(msg);
      toast.error('Error cargando equipo: ' + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEquipo(); }, [loadEquipo]);

  const openNew = () => {
    setForm({ ...DEFAULT_EQUIPO, order: miembros.length });
    setShowNew(true);
    setEditingId(null);
  };

  const openEdit = (m: EquipoMember) => {
    const { id, ...rest } = m;
    void id;
    setForm(rest as Omit<EquipoMember, 'id'>);
    setEditingId(m.id ?? null);
    setShowNew(false);
  };

  const cancelForm = () => { setShowNew(false); setEditingId(null); };

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!form.rol.trim())    { toast.error('El rol es obligatorio'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingId) {
        await withTimeout(
          updateDoc(doc(db, 'moonStudios', 'equipo', 'items', editingId), { ...form, updatedAt: now }),
          TIMEOUTS.SAVE,
          'updateDoc equipo',
        );
        setMiembros(prev => prev.map(m => m.id === editingId ? { ...m, ...form, id: editingId } : m));
        toast.success('Integrante actualizado ✓');
      } else {
        const ref = await withTimeout(
          addDoc(EQUIPO_COL, { ...form, createdAt: now, updatedAt: now }),
          TIMEOUTS.SAVE,
          'addDoc equipo',
        );
        setMiembros(prev =>
          [...prev, { id: ref.id, ...form }].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        );
        toast.success('Integrante agregado ✓');
      }
      cancelForm();
    } catch (e: unknown) {
      console.error('Error al guardar integrante:', e);
      toast.error('Error al guardar: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar a "${nombre}" del equipo?`)) return;
    try {
      await withTimeout(
        deleteDoc(doc(db, 'moonStudios', 'equipo', 'items', id)),
        TIMEOUTS.DELETE,
        'deleteDoc equipo',
      );
      setMiembros(prev => prev.filter(m => m.id !== id));
      if (editingId === id) cancelForm();
      toast.success('Integrante eliminado');
    } catch (e: unknown) {
      toast.error('Error al eliminar: ' + (e as Error).message);
    }
  };

  const toggleActive = async (m: EquipoMember) => {
    if (!m.id) return;
    const newVal = !m.active;
    setMiembros(prev => prev.map(x => x.id === m.id ? { ...x, active: newVal } : x));
    try {
      await withTimeout(
        updateDoc(doc(db, 'moonStudios', 'equipo', 'items', m.id), { active: newVal }),
        TIMEOUTS.SAVE,
        'toggleActive equipo',
      );
    } catch (e: unknown) {
      setMiembros(prev => prev.map(x => x.id === m.id ? { ...x, active: !newVal } : x));
      toast.error('Error actualizando: ' + (e as Error).message);
    }
  };

  const moveOrder = async (m: EquipoMember, dir: 'up' | 'down') => {
    const idx       = miembros.findIndex(x => x.id === m.id);
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= miembros.length) return;
    const target = miembros[targetIdx];
    if (!m.id || !target.id) return;

    setMiembros(prev => {
      const next = prev.map(x => {
        if (x.id === m.id)      return { ...x, order: target.order };
        if (x.id === target.id) return { ...x, order: m.order };
        return x;
      });
      return next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'moonStudios', 'equipo', 'items', m.id),      { order: target.order });
      batch.update(doc(db, 'moonStudios', 'equipo', 'items', target.id), { order: m.order });
      await withTimeout(batch.commit(), TIMEOUTS.BATCH, 'batch moveOrder equipo');
    } catch (e: unknown) {
      await loadEquipo();
      toast.error('Error reordenando: ' + (e as Error).message);
    }
  };

  if (loading)   return <LoadingSpinner label="Cargando equipo…" />;
  if (loadError) return <ErrorState message={loadError} onRetry={loadEquipo} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-light text-white">Equipo de Moon Studios</p>
          <p className="text-xs font-light mt-0.5" style={{ color: mt }}>
            Se muestra en la sección "Equipo" de la web pública
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadEquipo}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/5"
            style={{ border: `1px solid ${bd}`, color: mt }}
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={showNew ? cancelForm : openNew}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
            style={{
              background: showNew ? 'transparent' : 'rgba(255,255,255,0.07)',
              border:     `1px solid ${showNew ? bd : 'rgba(255,255,255,0.15)'}`,
              color:      showNew ? mt : 'white',
            }}
          >
            {showNew
              ? <><X className="w-3.5 h-3.5" strokeWidth={1.5} />Cancelar</>
              : <><Plus className="w-3.5 h-3.5" strokeWidth={1.5} />Nuevo integrante</>}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="rounded-2xl p-5" style={{ background: sf, border: `1px solid rgba(255,255,255,0.12)` }}>
          <p className="text-xs font-light text-white">Nuevo integrante</p>
          <EquipoForm
            form={form} setForm={setForm} saving={saving}
            editingId={editingId} onCancel={cancelForm} onSave={handleSave}
          />
        </div>
      )}

      {miembros.length === 0 && !showNew ? (
        <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
          <UserCheck className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.08)' }} strokeWidth={1} />
          <p className="text-sm font-light" style={{ color: mt }}>Aún no hay integrantes. Agrega el primero.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {miembros.map((m, idx) => {
            const isEditing = editingId === m.id;
            return (
              <div
                key={m.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{ background: sf, border: `1px solid ${isEditing ? 'rgba(255,255,255,0.15)' : bd}` }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}
                  >
                    {m.foto
                      ? <img
                          src={m.foto} alt=""
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      : <UserCheck className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-light truncate">{m.nombre}</p>
                    <p className="text-[10px] font-light truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {m.rol}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: m.active ? '#4ade80' : 'rgba(255,255,255,0.15)' }} />
                    <span className="text-[9px] font-light"
                      style={{ color: m.active ? '#4ade80' : mt }}>
                      {m.active ? 'Visible' : 'Oculto'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveOrder(m, 'up')} disabled={idx === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5 disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => moveOrder(m, 'down')} disabled={idx === miembros.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5 disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <ArrowDown className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => toggleActive(m)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      style={{ border: `1px solid ${bd}`, color: m.active ? '#4ade80' : mt }}
                      title={m.active ? 'Ocultar' : 'Mostrar'}
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => isEditing ? cancelForm() : openEdit(m)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      style={{
                        border: `1px solid ${isEditing ? 'rgba(255,255,255,0.2)' : bd}`,
                        color:  isEditing ? 'white' : mt,
                      }}
                    >
                      {isEditing
                        ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                        : <Edit className="w-3 h-3" strokeWidth={1.5} />}
                    </button>
                    <button
                      onClick={() => handleDelete(m.id!, m.nombre)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10 hover:border-red-500/30"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="px-5 pb-5">
                    <EquipoForm
                      form={form} setForm={setForm} saving={saving}
                      editingId={editingId} onCancel={cancelForm} onSave={handleSave}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// PORTAFOLIO — Panel de administración
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_PORTFOLIO: Omit<PortfolioItem, 'id'> = {
  titulo: '', categoria: '', year: new Date().getFullYear().toString(),
  imagen: '', tag: '', descripcion: '', link: '', cliente: '',
  tecnologias: '', destacado: false, order: 0, active: true,
};

interface PortfolioFormProps {
  form: Omit<PortfolioItem, 'id'>;
  setForm: React.Dispatch<React.SetStateAction<Omit<PortfolioItem, 'id'>>>;
  saving: boolean;
  editingId: string | null;
  onCancel: () => void;
  onSave: () => void;
}

const PortfolioForm: React.FC<PortfolioFormProps> = ({ form, setForm, saving, editingId, onCancel, onSave }) => {
  const handle = (key: keyof Omit<PortfolioItem, 'id'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4 mt-4 pt-4" style={{ borderTop: `1px solid ${bd}` }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Título del proyecto">
          <StyledInput name="titulo" value={form.titulo} onChange={handle('titulo')} placeholder="Luna NET - Bot V2.3" />
        </Field>
        <Field label="Categoría">
          <StyledInput name="categoria" value={form.categoria} onChange={handle('categoria')} placeholder="Bot de Discord" />
        </Field>
        <Field label="Año">
          <StyledInput name="year" value={form.year} onChange={handle('year')} placeholder="2026" />
        </Field>
        <Field label="Tag (para filtros)" hint="Ej. Web, Discord, App">
          <StyledInput name="tag" value={form.tag} onChange={handle('tag')} placeholder="Web" />
        </Field>
      </div>

      <Field label="Imagen (URL)">
        <StyledInput name="imagen" value={form.imagen} onChange={handle('imagen')} placeholder="https://cdn.example.com/preview.png" />
      </Field>

      <Field label="Link del proyecto / página en vivo">
        <StyledInput name="link" value={form.link} onChange={handle('link')} placeholder="https://mi-proyecto.netlify.app" />
      </Field>

      <Field label="Descripción">
        <textarea
          name="descripcion" value={form.descripcion} onChange={handle('descripcion')} rows={3}
          placeholder="Describe brevemente el proyecto, su objetivo y resultado..."
          className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all resize-none"
          style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Cliente (opcional)">
          <StyledInput name="cliente" value={form.cliente ?? ''} onChange={handle('cliente')} placeholder="Nombre del cliente" />
        </Field>
        <Field label="Tecnologías" hint="Separadas por coma">
          <StyledInput name="tecnologias" value={form.tecnologias} onChange={handle('tecnologias')} placeholder="React, Firebase, Tailwind" />
        </Field>
      </div>

      <div
        className="flex items-center gap-3 p-3.5 rounded-xl transition-all"
        style={{
          background: form.destacado ? 'rgba(250,204,21,0.06)' : 'rgba(255,255,255,0.01)',
          border: `1px solid ${form.destacado ? 'rgba(250,204,21,0.25)' : bd}`,
        }}
      >
        <Star className="w-4 h-4 flex-shrink-0" style={{ color: form.destacado ? '#facc15' : mt }} strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-light" style={{ color: form.destacado ? 'white' : mt }}>Destacado</p>
          <p className="text-[11px] font-light mt-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>
            Aparece en el teaser de "Trabajos recientes" del Home
          </p>
        </div>
        <button
          onClick={() => setForm(f => ({ ...f, destacado: !f.destacado }))}
          className="flex-shrink-0 transition-transform hover:scale-110"
        >
          {form.destacado
            ? <ToggleRight className="w-5 h-5" style={{ color: '#facc15' }} />
            : <ToggleLeft  className="w-5 h-5" style={{ color: mt }} />}
        </button>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
          style={{ border: `1px solid ${bd}`, color: mt }}
        >
          Cancelar
        </button>
        <SaveBtn saving={saving} onClick={onSave} label={editingId ? 'Actualizar' : 'Agregar proyecto'} />
      </div>
    </div>
  );
};

const PortfolioPanel: React.FC = () => {
  const [items,     setItems]     = useState<PortfolioItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew,   setShowNew]   = useState(false);
  const [form,      setForm]      = useState<Omit<PortfolioItem, 'id'>>(DEFAULT_PORTFOLIO);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await withTimeout(getDocs(PORTFOLIO_COL), TIMEOUTS.LOAD, 'getDocs portfolio');
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PortfolioItem))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setItems(data);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      console.error('Error cargando portafolio:', e);
      setLoadError(msg);
      toast.error('Error cargando portafolio: ' + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const openNew = () => {
    setForm({ ...DEFAULT_PORTFOLIO, order: items.length });
    setShowNew(true);
    setEditingId(null);
  };

  const openEdit = (p: PortfolioItem) => {
    const { id, ...rest } = p;
    void id;
    setForm(rest as Omit<PortfolioItem, 'id'>);
    setEditingId(p.id ?? null);
    setShowNew(false);
  };

  const cancelForm = () => { setShowNew(false); setEditingId(null); };

  const handleSave = async () => {
    if (!form.titulo.trim())      { toast.error('El título es obligatorio'); return; }
    if (!form.descripcion.trim()) { toast.error('La descripción es obligatoria'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingId) {
        await withTimeout(
          updateDoc(doc(db, 'moonStudios', 'portfolio', 'items', editingId), { ...form, updatedAt: now }),
          TIMEOUTS.SAVE,
          'updateDoc portfolio',
        );
        setItems(prev => prev.map(p => p.id === editingId ? { ...p, ...form, id: editingId } : p));
        toast.success('Proyecto actualizado ✓');
      } else {
        const ref = await withTimeout(
          addDoc(PORTFOLIO_COL, { ...form, createdAt: now, updatedAt: now }),
          TIMEOUTS.SAVE,
          'addDoc portfolio',
        );
        setItems(prev =>
          [...prev, { id: ref.id, ...form }].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        );
        toast.success('Proyecto agregado ✓');
      }
      cancelForm();
    } catch (e: unknown) {
      console.error('Error al guardar proyecto:', e);
      toast.error('Error al guardar: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, titulo: string) => {
    if (!confirm(`¿Eliminar el proyecto "${titulo}"?`)) return;
    try {
      await withTimeout(
        deleteDoc(doc(db, 'moonStudios', 'portfolio', 'items', id)),
        TIMEOUTS.DELETE,
        'deleteDoc portfolio',
      );
      setItems(prev => prev.filter(p => p.id !== id));
      if (editingId === id) cancelForm();
      toast.success('Proyecto eliminado');
    } catch (e: unknown) {
      toast.error('Error al eliminar: ' + (e as Error).message);
    }
  };

  const toggleActive = async (p: PortfolioItem) => {
    if (!p.id) return;
    const newVal = !p.active;
    setItems(prev => prev.map(x => x.id === p.id ? { ...x, active: newVal } : x));
    try {
      await withTimeout(
        updateDoc(doc(db, 'moonStudios', 'portfolio', 'items', p.id), { active: newVal }),
        TIMEOUTS.SAVE,
        'toggleActive portfolio',
      );
    } catch (e: unknown) {
      setItems(prev => prev.map(x => x.id === p.id ? { ...x, active: !newVal } : x));
      toast.error('Error actualizando: ' + (e as Error).message);
    }
  };

  const moveOrder = async (p: PortfolioItem, dir: 'up' | 'down') => {
    const idx       = items.findIndex(x => x.id === p.id);
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const target = items[targetIdx];
    if (!p.id || !target.id) return;

    setItems(prev => {
      const next = prev.map(x => {
        if (x.id === p.id)      return { ...x, order: target.order };
        if (x.id === target.id) return { ...x, order: p.order };
        return x;
      });
      return next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'moonStudios', 'portfolio', 'items', p.id),      { order: target.order });
      batch.update(doc(db, 'moonStudios', 'portfolio', 'items', target.id), { order: p.order });
      await withTimeout(batch.commit(), TIMEOUTS.BATCH, 'batch moveOrder portfolio');
    } catch (e: unknown) {
      await loadItems();
      toast.error('Error reordenando: ' + (e as Error).message);
    }
  };

  if (loading)   return <LoadingSpinner label="Cargando portafolio…" />;
  if (loadError) return <ErrorState message={loadError} onRetry={loadItems} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-light text-white">Portafolio de Moon Studios</p>
          <p className="text-xs font-light mt-0.5" style={{ color: mt }}>
            Se muestra en "Trabajos recientes" del Home y en /proyectos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadItems}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/5"
            style={{ border: `1px solid ${bd}`, color: mt }}
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={showNew ? cancelForm : openNew}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
            style={{
              background: showNew ? 'transparent' : 'rgba(255,255,255,0.07)',
              border:     `1px solid ${showNew ? bd : 'rgba(255,255,255,0.15)'}`,
              color:      showNew ? mt : 'white',
            }}
          >
            {showNew
              ? <><X className="w-3.5 h-3.5" strokeWidth={1.5} />Cancelar</>
              : <><Plus className="w-3.5 h-3.5" strokeWidth={1.5} />Nuevo proyecto</>}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="rounded-2xl p-5" style={{ background: sf, border: `1px solid rgba(255,255,255,0.12)` }}>
          <p className="text-xs font-light text-white">Nuevo proyecto</p>
          <PortfolioForm
            form={form} setForm={setForm} saving={saving}
            editingId={editingId} onCancel={cancelForm} onSave={handleSave}
          />
        </div>
      )}

      {items.length === 0 && !showNew ? (
        <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
          <Briefcase className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.08)' }} strokeWidth={1} />
          <p className="text-sm font-light" style={{ color: mt }}>Aún no hay proyectos. Agrega el primero.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p, idx) => {
            const isEditing = editingId === p.id;
            return (
              <div
                key={p.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{ background: sf, border: `1px solid ${isEditing ? 'rgba(255,255,255,0.15)' : bd}` }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}
                  >
                    {p.imagen
                      ? <img
                          src={p.imagen} alt=""
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      : <Image className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-light truncate">{p.titulo}</p>
                      {p.destacado && <Star className="w-3 h-3 flex-shrink-0" style={{ color: '#facc15' }} strokeWidth={1.5} />}
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.05)', color: mt }}
                      >
                        {p.tag}
                      </span>
                    </div>
                    <p className="text-[10px] font-light truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
                      {p.categoria} · {p.year}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: p.active ? '#4ade80' : 'rgba(255,255,255,0.15)' }} />
                    <span className="text-[9px] font-light"
                      style={{ color: p.active ? '#4ade80' : mt }}>
                      {p.active ? 'Activo' : 'Oculto'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveOrder(p, 'up')} disabled={idx === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5 disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => moveOrder(p, 'down')} disabled={idx === items.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5 disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <ArrowDown className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      style={{ border: `1px solid ${bd}`, color: p.active ? '#4ade80' : mt }}
                      title={p.active ? 'Ocultar' : 'Mostrar'}
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    {p.link && (
                      <a
                        href={p.link} target="_blank" rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                        style={{ border: `1px solid ${bd}`, color: mt }}
                      >
                        <ExtLink className="w-3 h-3" strokeWidth={1.5} />
                      </a>
                    )}
                    <button
                      onClick={() => isEditing ? cancelForm() : openEdit(p)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      style={{
                        border: `1px solid ${isEditing ? 'rgba(255,255,255,0.2)' : bd}`,
                        color:  isEditing ? 'white' : mt,
                      }}
                    >
                      {isEditing
                        ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                        : <Edit className="w-3 h-3" strokeWidth={1.5} />}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id!, p.titulo)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10 hover:border-red-500/30"
                      style={{ border: `1px solid ${bd}`, color: mt }}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="px-5 pb-5">
                    <PortfolioForm
                      form={form} setForm={setForm} saving={saving}
                      editingId={editingId} onCancel={cancelForm} onSave={handleSave}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// WEBS — COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

const TABS_CONFIG = [
  { id: 'sitios',     label: 'Sitios Web',  Icon: Globe,          color: '#4ade80' },
  { id: 'equipo',     label: 'Equipo',      Icon: UserCheck,      color: '#facc15' },
  { id: 'portafolio', label: 'Portafolio',  Icon: Briefcase,      color: '#fb923c' },
  { id: 'luna',       label: 'Luna NET',    Icon: Moon,           color: '#a5b4fc' },
  { id: 'legal',      label: 'Legal Luna',  Icon: FileText,       color: '#c4b5fd' },
  { id: 'webluna',    label: 'Web Luna',    Icon: Newspaper,      color: '#f472b6' },
  { id: 'eventos',    label: 'Eventos',     Icon: CalendarDays,   color: '#fb923c' },
  { id: 'incidentes', label: 'Incidentes',  Icon: AlertTriangle,  color: '#f87171' },
  { id: 'portal',     label: 'Portal',      Icon: Users,          color: '#60a5fa' },
  { id: 'correo',     label: 'Correo',      Icon: Mail,           color: '#818cf8' },
] as const;

type TabId = typeof TABS_CONFIG[number]['id'];

const Webs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('sitios');
  const current = TABS_CONFIG.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${current.color}18`, border: `1px solid ${current.color}30` }}
          >
            <current.Icon className="w-4 h-4" style={{ color: current.color }} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-light text-white tracking-tight">Webs</h1>
            <p className="text-xs font-light" style={{ color: mt }}>Moon Studios · Administración web</p>
          </div>
        </div>
        {activeTab === 'sitios' && (
          <a
            href="https://moon-studios-fest.netlify.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/[0.07]"
            style={{ border: `1px solid ${bd}`, color: mt }}
          >
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} /> Ver Moon Fest
          </a>
        )}
      </div>

      {/* Navegación de tabs */}
      <div className="flex gap-1 p-1.5 rounded-2xl" style={{ background: sc, border: `1px solid ${bd}` }}>
        {TABS_CONFIG.map(({ id, label, Icon, color }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-light transition-all"
            style={{
              background: activeTab === id ? 'rgba(255,255,255,0.07)' : 'transparent',
              color:      activeTab === id ? 'white' : mt,
              border:    `1px solid ${activeTab === id ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
            }}
          >
            <Icon
              className="w-3.5 h-3.5"
              style={{ color: activeTab === id ? color : 'inherit' }}
              strokeWidth={1.5}
            />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${current.color}18` }}>
        {/* Panel header */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ background: sf, borderColor: `${current.color}15` }}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${current.color}12`, border: `1px solid ${current.color}22` }}
          >
            <current.Icon className="w-3.5 h-3.5" style={{ color: current.color }} strokeWidth={1.5} />
          </div>
          <span className="text-sm font-light text-white">
            {activeTab === 'sitios'     && 'Moon Studios Fest — Administración'}
            {activeTab === 'equipo'     && 'Moon Studios — Equipo'}
            {activeTab === 'portafolio' && 'Moon Studios — Portafolio de proyectos'}
            {activeTab === 'luna'       && 'Luna NET — Gestión de Aliados'}
            {activeTab === 'legal'      && 'Luna NET — Privacidad, términos y cookies'}
            {activeTab === 'webluna'    && 'Luna NET — Sobre nosotros, contacto y blog'}
            {activeTab === 'eventos'    && 'Luna NET — Calendario de eventos de temporada'}
            {activeTab === 'incidentes' && 'Luna NET — Incidentes del Sistema'}
            {activeTab === 'portal'     && 'Portal de Clientes · Solicitudes & Socios'}
            {activeTab === 'correo'     && 'Correo Masivo · Moon Fest 2026'}
          </span>
          {activeTab === 'luna' && (
            <span
              className="ml-auto text-[9px] font-light px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(165,180,252,0.08)', color: '#a5b4fc', border: '1px solid rgba(165,180,252,0.18)' }}
            >
              Firebase Luna NET
            </span>
          )}
          {activeTab === 'incidentes' && (
            <span
              className="ml-auto text-[9px] font-light px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              Firebase Luna NET
            </span>
          )}
          {activeTab === 'portal' && (
            <span
              className="ml-auto text-[9px] font-light px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(96,165,250,0.08)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.18)' }}
            >
              Admin
            </span>
          )}
        </div>

        {/* Panel body */}
        <div className="p-5">
          {/* Si un panel se rompe, solo ese muestra el error (antes la app quedaba en negro). */}
          <ProteccionErrores nombre={activeTab}>
          {activeTab === 'sitios'  && <MoonFestPanel />}
          {activeTab === 'equipo'     && <EquipoPanel />}
          {activeTab === 'portafolio' && <PortfolioPanel />}
          {activeTab === 'luna'       && <AlliesPanel />}
          {activeTab === 'legal'      && <LegalLunaPanel lunaFetch={lunaFetch} />}
          {activeTab === 'webluna'    && <WebLunaPanel lunaFetch={lunaFetch} />}
          {activeTab === 'eventos'    && <EventosLunaPanel lunaFetch={lunaFetch} lunaSubir={lunaSubir} />}
          {activeTab === 'incidentes' && <IncidentsPanel />}
          {activeTab === 'portal'  && <PortalClientesPanel />}
          {activeTab === 'correo'  && <CorreoFestPanel />}
          </ProteccionErrores>
        </div>
      </div>
    </div>
  );
};

export default Webs;