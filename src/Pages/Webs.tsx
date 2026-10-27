import { panelInk } from '@/lib/panelColors';
import '@/styles/enterprise-sections.css';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  collection, doc, getDocs, deleteDoc,
  Timestamp, updateDoc, addDoc, writeBatch,
} from 'firebase/firestore';
import {
  Globe, ExternalLink, Save, Image, Loader2,
  RefreshCw, Trash2, Send, X, CheckCircle, UserCheck, AlertCircle,
  Search, FileText, Edit, Eye, ChevronDown, Building2, Paperclip,
  Activity, Tag, Sparkles, Plus, ChevronUp, Link2,
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
import { WebMoonPanel } from '@/components/WebMoonPanel';
import { EventosLunaPanel } from '@/components/EventosLunaPanel';
import { ProteccionErrores } from '@/components/ProteccionErrores';
import { SociosPanel } from '@/components/webs/SociosPanel';
import { ResumenWebs } from '@/components/webs/ResumenWebs';
import { cargarDatosWebs, type DatosWebs } from '@/components/webs/datos';
import { CSS_WEBS } from '@/components/webs/estilos';
import { LayoutDashboard, ChevronRight as Flecha } from 'lucide-react';

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
  if (monto >= 10000) return 'Socio Fundador';
  if (monto >= 5000)  return 'Socio Platino';
  if (monto >= 2500)  return 'Socio Oro';
  if (monto >= 1000)  return 'Socio Plata';
  return 'Socio Semilla';
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
    <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk(mt) }}>{label}</label>
    {children}
    {hint && <p className="text-[11px] font-light" style={{ color: 'var(--moon-muted)' }}>{hint}</p>}
  </div>
);

const StyledInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { name: string }> = ({ name, ...props }) => (
  <input
    name={name}
    {...props}
    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all"
    style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
    onFocus={e => (e.target.style.borderColor = 'color-mix(in srgb, var(--moon-ink) 20%, transparent)')}
    onBlur={e =>  (e.target.style.borderColor = bd)}
  />
);

const SaveBtn: React.FC<{ saving: boolean; onClick: () => void; label?: string }> = ({
  saving, onClick, label = 'Guardar',
}) => (
  <button
    onClick={onClick}
    disabled={saving}
    className="moon-panel-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
    style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}
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
      style={{ background: cfg.bg, color: panelInk(cfg.color), border: `1px solid ${cfg.color}25` }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
};

/** Spinner de carga centrado genérico. */
const LoadingSpinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center h-32 gap-3">
    <div className="w-5 h-5 border moon-panel-border border-t-zinc-300 rounded-full animate-spin" />
    {label && <p className="text-xs font-light" style={{ color: panelInk(mt) }}>{label}</p>}
  </div>
);

/** Estado de error con botón reintentar. */
const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div
    className="flex flex-col items-center justify-center h-40 gap-4 rounded-2xl"
    style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}
  >
    <div className="flex items-center gap-2">
      <AlertCircle className="w-4 h-4" style={{ color: panelInk('#f87171') }} strokeWidth={1.5} />
      <p className="text-sm font-light" style={{ color: panelInk('#f87171') }}>{message}</p>
    </div>
    <button
      onClick={onRetry}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
              background: formTab === id ? 'color-mix(in srgb, var(--moon-ink) 8%, transparent)' : 'transparent',
              color: panelInk(formTab === id ? 'var(--moon-ink)' : mt),
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
                onFocus={e => (e.target.style.borderColor = 'color-mix(in srgb, var(--moon-ink) 20%, transparent)')}
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
                ? <ToggleRight className="w-5 h-5" style={{ color: panelInk('#4ade80') }} />
                : <ToggleLeft  className="w-5 h-5" style={{ color: panelInk(mt) }} />}
              <span style={{ color: panelInk(form.active ? '#4ade80' : mt) }}>
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
              <p className="text-[9px] uppercase tracking-widest font-light mb-2" style={{ color: panelInk(mt) }}>Preview logo</p>
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
                style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          <button
            onClick={addStat}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
                  color:      panelInk(plan.highlight ? '#facc15' : mt),
                }}
                title="Popular"
              >
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => removePlan(i)}
                className="w-9 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:bg-red-500/10"
                style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          <button
            onClick={addPlan}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Agregar plan
          </button>
        </div>
      )}

      {/* VISIBILIDAD */}
      {formTab === 'display' && (
        <div className="space-y-2.5">
          <p className="text-xs font-light pb-1" style={{ color: 'var(--moon-muted)' }}>
            Controla qué secciones aparecen en la card pública. Los cambios se reflejan tras guardar.
          </p>
          {DISPLAY_SECTIONS.map(({ key, label, desc, Icon }) => {
            const enabled = form.features?.[key] ?? true;
            return (
              <div
                key={key}
                className="flex items-start gap-3 p-3.5 rounded-xl transition-all"
                style={{
                  background: enabled ? 'color-mix(in srgb, var(--moon-ink) 4%, transparent)' : 'color-mix(in srgb, var(--moon-ink) 1%, transparent)',
                  border: `1px solid ${enabled ? 'color-mix(in srgb, var(--moon-ink) 10%, transparent)' : bd}`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: enabled ? 'color-mix(in srgb, var(--moon-ink) 6%, transparent)' : 'transparent', border: `1px solid ${bd}` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: panelInk(enabled ? 'var(--moon-ink)' : mt) }} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light" style={{ color: panelInk(enabled ? 'var(--moon-ink)' : mt) }}>{label}</p>
                  <p className="text-[11px] font-light mt-0.5" style={{ color: 'var(--moon-muted)' }}>{desc}</p>
                </div>
                <button
                  onClick={() => setForm(f => ({
                    ...f,
                    features: { ...(f.features ?? DEFAULT_FEATURES_ON), [key]: !enabled },
                  }))}
                  className="flex-shrink-0 mt-0.5 transition-transform hover:scale-110"
                >
                  {enabled
                    ? <ToggleRight className="w-5 h-5" style={{ color: panelInk('#4ade80') }} />
                    : <ToggleLeft  className="w-5 h-5" style={{ color: panelInk(mt) }} />}
                </button>
              </div>
            );
          })}
          {form.features && !Object.values(form.features).some(Boolean) && (
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: panelInk('#f59e0b') }} strokeWidth={1.5} />
              <p className="text-xs font-light" style={{ color: panelInk('#f59e0b') }}>
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
          className="px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
          style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
          <p className="text-sm font-light moon-panel-ink">Aliados de Luna NET</p>
          <p className="text-xs font-light mt-0.5" style={{ color: panelInk(mt) }}>
            Los cambios se reflejan en tiempo real en la web de Luna NET
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAllies}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all moon-panel-hover"
            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={showNew ? cancelForm : openNew}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
            style={{
              background: showNew ? 'transparent' : 'color-mix(in srgb, var(--moon-ink) 7%, transparent)',
              border:     `1px solid ${showNew ? bd : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)'}`,
              color:      panelInk(showNew ? mt : 'var(--moon-ink)'),
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
        <div data-moon-reveal="card" className="rounded-2xl p-5" style={{ background: sf, border: `1px solid color-mix(in srgb, var(--moon-ink) 12%, transparent)` }}>
          <p className="text-xs font-light moon-panel-ink">Nuevo aliado</p>
          <AllyForm
            form={form} setForm={setForm} saving={saving}
            editingId={editingId} onCancel={cancelForm} onSave={handleSave}
          />
        </div>
      )}

      {/* Lista vacía */}
      {allies.length === 0 && !showNew ? (
        <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
          <Handshake className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--moon-muted)' }} strokeWidth={1} />
          <p className="text-sm font-light" style={{ color: panelInk(mt) }}>No hay aliados todavía. Agrega el primero.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allies.map((ally, idx) => {
            const isEditing = editingId === ally.id;
            return (
              <div data-moon-reveal="card"
                key={ally.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{ background: sf, border: `1px solid ${isEditing ? 'color-mix(in srgb, var(--moon-ink) 15%, transparent)' : bd}` }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Logo */}
                  <div
                    className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'color-mix(in srgb, var(--moon-ink) 4%, transparent)', border: `1px solid ${bd}` }}
                  >
                    {ally.logo
                      ? <img
                          src={ally.logo} alt=""
                          className="w-full h-full object-contain p-1"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      : <Handshake className="w-4 h-4" style={{ color: panelInk(mt) }} strokeWidth={1.5} />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="moon-panel-ink text-sm font-light truncate">{ally.name}</p>
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--moon-ink) 5%, transparent)', color: panelInk(mt) }}
                      >
                        {ally.badge}
                      </span>
                    </div>
                    <p className="text-[10px] font-light truncate mt-0.5" style={{ color: 'var(--moon-muted)' }}>
                      {ally.tagline}
                    </p>
                  </div>

                  {/* Estado */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: ally.active ? '#4ade80' : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)' }} />
                    <span className="text-[9px] font-light"
                      style={{ color: panelInk(ally.active ? '#4ade80' : mt) }}>
                      {ally.active ? 'Activo' : 'Oculto'}
                    </span>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveOrder(ally, 'up')} disabled={idx === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                    >
                      <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => moveOrder(ally, 'down')} disabled={idx === allies.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                    >
                      <ArrowDown className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => toggleActive(ally)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                      style={{ border: `1px solid ${bd}`, color: panelInk(ally.active ? '#4ade80' : mt) }}
                      title={ally.active ? 'Ocultar' : 'Mostrar'}
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <a
                      href={ally.website} target="_blank" rel="noopener noreferrer"
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                    >
                      <ExtLink className="w-3 h-3" strokeWidth={1.5} />
                    </a>
                    <button
                      onClick={() => isEditing ? cancelForm() : openEdit(ally)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                      style={{
                        border: `1px solid ${isEditing ? 'color-mix(in srgb, var(--moon-ink) 20%, transparent)' : bd}`,
                        color:  panelInk(isEditing ? 'var(--moon-ink)' : mt),
                      }}
                    >
                      {isEditing
                        ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                        : <Edit className="w-3 h-3" strokeWidth={1.5} />}
                    </button>
                    <button
                      onClick={() => handleDelete(ally.id!, ally.name)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10 hover:border-red-500/30"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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

const PortalClientesPanel: React.FC<{ onCambio?: () => void }> = ({ onCambio }) => {
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
      onCambio?.();
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
      onCambio?.();
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
          className="fixed inset-0 z-50 flex items-center justify-center p-6 moon-media-overlay bg-black/90 backdrop-blur-md"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setViewingImage(null)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'color-mix(in srgb, var(--moon-ink) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--moon-ink) 20%, transparent)' }}
            >
              <X className="w-4 h-4 moon-panel-ink" />
            </button>
            <img
              src={viewingImage} alt="Adjunto"
              className="w-full h-auto rounded-2xl shadow-2xl"
              style={{ border: '1px solid color-mix(in srgb, var(--moon-ink) 10%, transparent)' }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Solicitudes',       value: stats.total,       sub: `${stats.pendiente} pend.`,     color: 'var(--moon-ink)', icon: <FileText className="w-3.5 h-3.5" /> },
          { label: 'En proceso',        value: stats.en_proceso,  sub: `${stats.completado} OK`,        color: '#60a5fa',               icon: <Activity className="w-3.5 h-3.5" /> },
          { label: 'Completadas',       value: stats.completado,  sub: 'cerradas con éxito',           color: '#4ade80',               icon: <CheckCircle className="w-3.5 h-3.5" /> },
          { label: 'Denegadas',         value: stats.denegado,    sub: 'no aprobadas',                 color: '#f87171',               icon: <X className="w-3.5 h-3.5" /> },
        ].map((s, i) => (
          <div data-moon-reveal="card" key={i} className="rounded-2xl p-4" style={{ background: sf, border: `1px solid ${bd}` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk(mt) }}>{s.label}</span>
              <span style={{ color: panelInk(mt) }}>{s.icon}</span>
            </div>
            <p className="text-2xl font-light" style={{ color: panelInk(s.color) }}>{s.value}</p>
            <p className="text-[11px] font-light mt-1" style={{ color: panelInk(mt) }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs (los socios ahora tienen su propia sección en Webs) */}
      <div className="hidden">
        {(['solicitudes', 'socios'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-light transition-all"
            style={{
              background: activeTab === tab ? 'color-mix(in srgb, var(--moon-ink) 8%, transparent)' : 'transparent',
              color:      panelInk(activeTab === tab ? 'var(--moon-ink)' : mt),
            }}
          >
            {tab === 'solicitudes'
              ? <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
              : <Building2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
            {tab === 'solicitudes' ? 'Solicitudes' : 'Socios Capitalistas'}
            {tab === 'socios' && stats.socioPending > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: 'rgba(245,158,11,0.15)', color: panelInk('#f59e0b') }}>
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
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: panelInk(mt) }} strokeWidth={1.5} />
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
                style={{ background: sf, border: `1px solid ${bd}`, color: panelInk(filterTipo !== 'todos' ? 'var(--moon-ink)' : mt) }}
              >
                <option value="todos">Tipo: todos</option>
                {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: panelInk(mt) }} />
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
                      background: active ? (cfg ? cfg.bg : 'color-mix(in srgb, var(--moon-ink) 8%, transparent)') : 'transparent',
                      color:      panelInk(active ? (cfg ? cfg.color : 'var(--moon-ink)') : mt),
                      border:    `1px solid ${active ? (cfg ? `${cfg.color}30` : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)') : 'transparent'}`,
                    }}
                  >
                    {s === 'todas' ? 'Todas' : s === 'en_proceso' ? 'En proceso' : STATUS_CONFIG[s].label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={loadData}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all moon-panel-hover"
              style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
              <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--moon-muted)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: panelInk(mt) }}>No hay solicitudes que coincidan.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(s => {
                const isExpanded = expandedId === s.id;
                const isEditing  = editingId  === s.id;
                return (
                  <div data-moon-reveal="card"
                    key={s.id}
                    className="rounded-2xl overflow-hidden transition-all"
                    style={{
                      background: sf,
                      border: `1px solid ${isEditing ? 'color-mix(in srgb, var(--moon-ink) 15%, transparent)' : isExpanded ? 'color-mix(in srgb, var(--moon-ink) 10%, transparent)' : bd}`,
                    }}
                  >
                    {/* Fila principal */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--moon-ink) 4%, transparent)', border: `1px solid ${bd}` }}
                      >
                        <Tag className="w-3.5 h-3.5" style={{ color: panelInk(mt) }} strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="moon-panel-ink text-sm font-light truncate">{s.titulo}</p>
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ background: 'color-mix(in srgb, var(--moon-ink) 5%, transparent)', color: panelInk(mt) }}
                          >
                            {TIPO_LABELS[s.tipo] ?? s.tipo}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] font-light font-mono" style={{ color: 'var(--moon-muted)' }}>
                            {s.uid.substring(0, 10)}…
                          </span>
                          <span className="text-[10px] font-light" style={{ color: 'var(--moon-muted)' }}>
                            {formatDateShort(s.creadoEn)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={s.estado} />
                        {s.imageUrl && (
                          <button
                            onClick={() => setViewingImage(s.imageUrl!)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                          >
                            <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (isExpanded && !isEditing) setExpandedId(null);
                            else { setExpandedId(s.id); setEditingId(null); }
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                          style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
                          <p className="text-sm font-light leading-relaxed" style={{ color: 'var(--moon-muted)' }}>
                            {s.descripcion}
                          </p>
                        </div>
                        {s.nota && (
                          <div
                            className="mx-4 mb-3 flex gap-2.5 p-3 rounded-xl"
                            style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)' }}
                          >
                            <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: panelInk('#fbbf24') }} strokeWidth={1.5} />
                            <div>
                              <p className="text-[9px] uppercase tracking-widest font-light mb-1" style={{ color: 'rgba(251,191,36,0.5)' }}>
                                Nota interna
                              </p>
                              <p className="text-xs font-light" style={{ color: 'rgba(251,191,36,0.8)' }}>{s.nota}</p>
                            </div>
                          </div>
                        )}
                        <div className="px-4 pb-4">
                          <p className="text-[9px] uppercase tracking-widest font-light mb-2" style={{ color: panelInk(mt) }}>
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
                                      color:      panelInk(s.estado === st ? c.color : mt),
                                      border:    `1px solid ${s.estado === st ? `${c.color}30` : 'color-mix(in srgb, var(--moon-ink) 8%, transparent)'}`,
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
                                style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                              <button
                                onClick={() => { setEditingId(s.id); setEditData({ estado: s.estado, nota: s.nota ?? '' }); }}
                                className="moon-panel-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                                style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}
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
                              style={{ background: sc, border: `1px solid ${bd}`, color: 'var(--moon-ink)' }}
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
                            style={{ background: sc, border: `1px solid ${bd}`, color: 'var(--moon-ink)' }}
                            rows={3}
                            onFocus={e => (e.target.style.borderColor = 'color-mix(in srgb, var(--moon-ink) 20%, transparent)')}
                            onBlur={e =>  (e.target.style.borderColor = bd)}
                          />
                        </Field>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
                            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleDeleteSolicitud(s.id, s.imageUrl)}
                            className="px-3 py-2 rounded-xl text-xs font-light"
                            style={{ border: '1px solid rgba(248,113,113,0.25)', color: panelInk('#f87171'), background: 'rgba(248,113,113,0.05)' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleUpdateSolicitud(s.id)}
                            disabled={saving}
                            className="moon-panel-primary flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                            style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}
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
              { label: 'Total solicitudes',    value: socios.length, color: 'var(--moon-ink)' },
              { label: 'Inversión aprobada',   value: `$${socios.filter(s => s.estado === 'aprobado').reduce((a, s) => a + s.monto, 0).toLocaleString('es-PE')}`, color: '#4ade80' },
              { label: 'Inversión pendiente',  value: `$${socios.filter(s => s.estado === 'pendiente').reduce((a, s) => a + s.monto, 0).toLocaleString('es-PE')}`, color: '#f59e0b' },
            ].map((s, i) => (
              <div data-moon-reveal="card" key={i} className="rounded-2xl p-4" style={{ background: sf, border: `1px solid ${bd}` }}>
                <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: panelInk(mt) }}>{s.label}</p>
                <p className="text-xl font-light" style={{ color: panelInk(s.color) }}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: panelInk(mt) }} strokeWidth={1.5} />
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
                    ? (f !== 'todos' ? SOCIO_STATUS[f].bg : 'color-mix(in srgb, var(--moon-ink) 8%, transparent)')
                    : 'transparent',
                  color: panelInk(socioFilter === f
                    ? (f !== 'todos' ? SOCIO_STATUS[f].color : 'var(--moon-ink)')
                    : mt),
                  border: `1px solid ${socioFilter === f ? 'color-mix(in srgb, var(--moon-ink) 15%, transparent)' : 'transparent'}`,
                }}
              >
                {f === 'todos' ? 'Todos' : SOCIO_STATUS[f].label}
              </button>
            ))}
          </div>
          {filteredSocios.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
              <Building2 className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--moon-muted)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: panelInk(mt) }}>No hay solicitudes de socio.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSocios.map(s => {
                const cfg  = SOCIO_STATUS[s.estado] ?? SOCIO_STATUS.pendiente;
                const tier = s.tierLabel ?? getTierLabel(s.monto);
                return (
                  <div data-moon-reveal="card" key={s.id} className="rounded-2xl p-4 transition-all" style={{ background: sf, border: `1px solid ${bd}` }}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="moon-panel-ink text-sm font-light">{s.nombre}</p>
                          <span
                            className="text-xs font-light px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(74,222,128,0.08)', color: panelInk('#4ade80'), border: '1px solid rgba(74,222,128,0.15)' }}
                          >
                            ${s.monto.toLocaleString('es-PE')} USD
                          </span>
                          <span className="text-[10px]">{tier}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-light" style={{ color: panelInk(mt) }}>
                            {s.metodo === 'transferencia' ? '🏦 Transferencia' : '💵 Efectivo'}
                          </span>
                          <span className="text-xs font-light" style={{ color: 'var(--moon-muted)' }}>
                            {formatDate(s.creadoEn)}
                          </span>
                        </div>
                        {s.mensaje && (
                          <p className="text-xs font-light mt-1.5 leading-relaxed" style={{ color: 'var(--moon-muted)' }}>
                            "{s.mensaje}"
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {s.fileUrl && (
                          <a
                            href={s.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                          >
                            <Paperclip className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </a>
                        )}
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                          style={{ background: cfg.bg, color: panelInk(cfg.color), border: `1px solid ${cfg.color}25` }}
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
                            style={{ background: 'color-mix(in srgb, var(--moon-ink) 4%, transparent)', border: `1px solid ${bd}`, color: 'var(--moon-muted)' }}
                          >
                            <option value="pendiente">En revisión</option>
                            <option value="aprobado">Aprobado</option>
                            <option value="rechazado">Rechazado</option>
                          </select>
                          {updatingSocio === s.id
                            ? <Loader2 className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 animate-spin pointer-events-none" style={{ color: panelInk(mt) }} />
                            : <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: panelInk(mt) }} />}
                        </div>
                        <button
                          onClick={() => handleDeleteSocio(s.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                          style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
  ninguno: { label: 'Sin impacto',     color: 'var(--moon-muted)' },
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
    <div data-moon-reveal="card"
      className="rounded-2xl overflow-hidden"
      style={{
        border:     `1px solid ${isResolved ? bd : sCfg.color + '30'}`,
        background: isResolved ? 'color-mix(in srgb, var(--moon-ink) 1.5%, transparent)' : sCfg.bg,
      }}
    >
      {/* Fila header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all moon-panel-hover"
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${!isResolved ? 'animate-pulse' : ''}`}
          style={{ background: sCfg.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-light moon-panel-ink">{inc.title}</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{
                background: iCfg.color + '18',
                color:      panelInk(iCfg.color),
                border:     `1px solid ${iCfg.color}35`,
              }}
            >
              {iCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: panelInk(sCfg.color) }}>
              {sCfg.label}
            </span>
            <span className="w-1 h-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--moon-ink) 20%, transparent)' }} />
            <span className="text-[11px] font-light" style={{ color: panelInk(mt) }}>{fmtRel(inc.createdAt)}</span>
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
            style={{ color: panelInk(mt), transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            strokeWidth={1.5}
          />
        </div>
      </button>

      {/* Contenido expandido */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid color-mix(in srgb, var(--moon-ink) 5%, transparent)' }}>

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
                        <div className="w-px flex-1 mt-1.5" style={{ background: 'color-mix(in srgb, var(--moon-ink) 6%, transparent)', minHeight: 12 }} />
                      )}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: panelInk(uCfg.color) }}>
                          {uCfg.label}
                        </span>
                        <span className="text-[10px] font-light" style={{ color: panelInk(mt) }}>{fmtRel(u.createdAt)}</span>
                      </div>
                      <p className="text-xs font-light leading-relaxed" style={{ color: 'var(--moon-muted)' }}>
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
            <div className="space-y-2.5 pt-2" style={{ borderTop: '1px solid color-mix(in srgb, var(--moon-ink) 5%, transparent)' }}>
              <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk(mt) }}>
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
                onFocus={e => (e.target.style.borderColor = 'color-mix(in srgb, var(--moon-ink) 20%, transparent)')}
                onBlur={e =>  (e.target.style.borderColor = bd)}
              />
              <div className="flex justify-end">
                <button
                  onClick={onAddUpdate}
                  disabled={updating || !updateForm.message.trim()}
                  className="moon-panel-primary flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-light transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}
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
            <p className="text-[11px] font-light pt-2" style={{ color: panelInk(mt), borderTop: '1px solid color-mix(in srgb, var(--moon-ink) 5%, transparent)' }}>
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
          <p className="text-sm font-light moon-panel-ink">Sistema de Incidentes</p>
          <p className="text-xs font-light mt-0.5" style={{ color: panelInk(mt) }}>
            {activos.length > 0
              ? `${activos.length} incidente${activos.length > 1 ? 's' : ''} activo${activos.length > 1 ? 's' : ''}`
              : 'Sin incidentes activos · todos los sistemas OK'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadIncidents}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all moon-panel-hover"
            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
              color:      panelInk(showNew ? mt : '#f87171'),
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
          <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk('#f87171') }}>
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
              onFocus={e => (e.target.style.borderColor = 'color-mix(in srgb, var(--moon-ink) 20%, transparent)')}
              onBlur={e =>  (e.target.style.borderColor = bd)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowNew(false)}
              className="px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
              style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
            <CheckCircle className="w-5 h-5" style={{ color: panelInk('#4ade80') }} strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-sm font-light moon-panel-ink">Todos los sistemas operativos</p>
            <p className="text-xs font-light mt-0.5" style={{ color: panelInk(mt) }}>No hay incidentes activos</p>
          </div>
        </div>
      )}

      {/* Incidentes activos */}
      {activos.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk('#f87171') }}>
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
          <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk(mt) }}>
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

      <p className="text-[10px] uppercase tracking-widest font-light pt-1" style={{ color: panelInk(mt) }}>
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
          className="px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
          style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
          <p className="text-sm font-light moon-panel-ink">Equipo de Moon Studios</p>
          <p className="text-xs font-light mt-0.5" style={{ color: panelInk(mt) }}>
            Se muestra en la sección "Equipo" de la web pública
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadEquipo}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all moon-panel-hover"
            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={showNew ? cancelForm : openNew}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
            style={{
              background: showNew ? 'transparent' : 'color-mix(in srgb, var(--moon-ink) 7%, transparent)',
              border:     `1px solid ${showNew ? bd : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)'}`,
              color:      panelInk(showNew ? mt : 'var(--moon-ink)'),
            }}
          >
            {showNew
              ? <><X className="w-3.5 h-3.5" strokeWidth={1.5} />Cancelar</>
              : <><Plus className="w-3.5 h-3.5" strokeWidth={1.5} />Nuevo integrante</>}
          </button>
        </div>
      </div>

      {showNew && (
        <div data-moon-reveal="card" className="rounded-2xl p-5" style={{ background: sf, border: `1px solid color-mix(in srgb, var(--moon-ink) 12%, transparent)` }}>
          <p className="text-xs font-light moon-panel-ink">Nuevo integrante</p>
          <EquipoForm
            form={form} setForm={setForm} saving={saving}
            editingId={editingId} onCancel={cancelForm} onSave={handleSave}
          />
        </div>
      )}

      {miembros.length === 0 && !showNew ? (
        <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
          <UserCheck className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--moon-muted)' }} strokeWidth={1} />
          <p className="text-sm font-light" style={{ color: panelInk(mt) }}>Aún no hay integrantes. Agrega el primero.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {miembros.map((m, idx) => {
            const isEditing = editingId === m.id;
            return (
              <div data-moon-reveal="card"
                key={m.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{ background: sf, border: `1px solid ${isEditing ? 'color-mix(in srgb, var(--moon-ink) 15%, transparent)' : bd}` }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'color-mix(in srgb, var(--moon-ink) 4%, transparent)', border: `1px solid ${bd}` }}
                  >
                    {m.foto
                      ? <img
                          src={m.foto} alt=""
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      : <UserCheck className="w-4 h-4" style={{ color: panelInk(mt) }} strokeWidth={1.5} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="moon-panel-ink text-sm font-light truncate">{m.nombre}</p>
                    <p className="text-[10px] font-light truncate mt-0.5" style={{ color: 'var(--moon-muted)' }}>
                      {m.rol}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: m.active ? '#4ade80' : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)' }} />
                    <span className="text-[9px] font-light"
                      style={{ color: panelInk(m.active ? '#4ade80' : mt) }}>
                      {m.active ? 'Visible' : 'Oculto'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveOrder(m, 'up')} disabled={idx === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                    >
                      <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => moveOrder(m, 'down')} disabled={idx === miembros.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                    >
                      <ArrowDown className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => toggleActive(m)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                      style={{ border: `1px solid ${bd}`, color: panelInk(m.active ? '#4ade80' : mt) }}
                      title={m.active ? 'Ocultar' : 'Mostrar'}
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => isEditing ? cancelForm() : openEdit(m)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                      style={{
                        border: `1px solid ${isEditing ? 'color-mix(in srgb, var(--moon-ink) 20%, transparent)' : bd}`,
                        color:  panelInk(isEditing ? 'var(--moon-ink)' : mt),
                      }}
                    >
                      {isEditing
                        ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                        : <Edit className="w-3 h-3" strokeWidth={1.5} />}
                    </button>
                    <button
                      onClick={() => handleDelete(m.id!, m.nombre)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10 hover:border-red-500/30"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
          background: form.destacado ? 'rgba(250,204,21,0.06)' : 'color-mix(in srgb, var(--moon-ink) 1%, transparent)',
          border: `1px solid ${form.destacado ? 'rgba(250,204,21,0.25)' : bd}`,
        }}
      >
        <Star className="w-4 h-4 flex-shrink-0" style={{ color: panelInk(form.destacado ? '#facc15' : mt) }} strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-light" style={{ color: panelInk(form.destacado ? 'var(--moon-ink)' : mt) }}>Destacado</p>
          <p className="text-[11px] font-light mt-0.5" style={{ color: 'var(--moon-muted)' }}>
            Aparece en el teaser de "Trabajos recientes" del Home
          </p>
        </div>
        <button
          onClick={() => setForm(f => ({ ...f, destacado: !f.destacado }))}
          className="flex-shrink-0 transition-transform hover:scale-110"
        >
          {form.destacado
            ? <ToggleRight className="w-5 h-5" style={{ color: panelInk('#facc15') }} />
            : <ToggleLeft  className="w-5 h-5" style={{ color: panelInk(mt) }} />}
        </button>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
          style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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
          <p className="text-sm font-light moon-panel-ink">Portafolio de Moon Studios</p>
          <p className="text-xs font-light mt-0.5" style={{ color: panelInk(mt) }}>
            Se muestra en "Trabajos recientes" del Home y en /proyectos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadItems}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all moon-panel-hover"
            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={showNew ? cancelForm : openNew}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
            style={{
              background: showNew ? 'transparent' : 'color-mix(in srgb, var(--moon-ink) 7%, transparent)',
              border:     `1px solid ${showNew ? bd : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)'}`,
              color:      panelInk(showNew ? mt : 'var(--moon-ink)'),
            }}
          >
            {showNew
              ? <><X className="w-3.5 h-3.5" strokeWidth={1.5} />Cancelar</>
              : <><Plus className="w-3.5 h-3.5" strokeWidth={1.5} />Nuevo proyecto</>}
          </button>
        </div>
      </div>

      {showNew && (
        <div data-moon-reveal="card" className="rounded-2xl p-5" style={{ background: sf, border: `1px solid color-mix(in srgb, var(--moon-ink) 12%, transparent)` }}>
          <p className="text-xs font-light moon-panel-ink">Nuevo proyecto</p>
          <PortfolioForm
            form={form} setForm={setForm} saving={saving}
            editingId={editingId} onCancel={cancelForm} onSave={handleSave}
          />
        </div>
      )}

      {items.length === 0 && !showNew ? (
        <div className="text-center py-12 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
          <Briefcase className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--moon-muted)' }} strokeWidth={1} />
          <p className="text-sm font-light" style={{ color: panelInk(mt) }}>Aún no hay proyectos. Agrega el primero.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p, idx) => {
            const isEditing = editingId === p.id;
            return (
              <div data-moon-reveal="card"
                key={p.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{ background: sf, border: `1px solid ${isEditing ? 'color-mix(in srgb, var(--moon-ink) 15%, transparent)' : bd}` }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'color-mix(in srgb, var(--moon-ink) 4%, transparent)', border: `1px solid ${bd}` }}
                  >
                    {p.imagen
                      ? <img
                          src={p.imagen} alt=""
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      : <Image className="w-4 h-4" style={{ color: panelInk(mt) }} strokeWidth={1.5} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="moon-panel-ink text-sm font-light truncate">{p.titulo}</p>
                      {p.destacado && <Star className="w-3 h-3 flex-shrink-0" style={{ color: panelInk('#facc15') }} strokeWidth={1.5} />}
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--moon-ink) 5%, transparent)', color: panelInk(mt) }}
                      >
                        {p.tag}
                      </span>
                    </div>
                    <p className="text-[10px] font-light truncate mt-0.5" style={{ color: 'var(--moon-muted)' }}>
                      {p.categoria} · {p.year}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: p.active ? '#4ade80' : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)' }} />
                    <span className="text-[9px] font-light"
                      style={{ color: panelInk(p.active ? '#4ade80' : mt) }}>
                      {p.active ? 'Activo' : 'Oculto'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveOrder(p, 'up')} disabled={idx === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                    >
                      <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => moveOrder(p, 'down')} disabled={idx === items.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover disabled:opacity-20"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                    >
                      <ArrowDown className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                      style={{ border: `1px solid ${bd}`, color: panelInk(p.active ? '#4ade80' : mt) }}
                      title={p.active ? 'Ocultar' : 'Mostrar'}
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    {p.link && (
                      <a
                        href={p.link} target="_blank" rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                        style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                      >
                        <ExtLink className="w-3 h-3" strokeWidth={1.5} />
                      </a>
                    )}
                    <button
                      onClick={() => isEditing ? cancelForm() : openEdit(p)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                      style={{
                        border: `1px solid ${isEditing ? 'color-mix(in srgb, var(--moon-ink) 20%, transparent)' : bd}`,
                        color:  panelInk(isEditing ? 'var(--moon-ink)' : mt),
                      }}
                    >
                      {isEditing
                        ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                        : <Edit className="w-3 h-3" strokeWidth={1.5} />}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id!, p.titulo)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10 hover:border-red-500/30"
                      style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
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

type TabId =
  | 'resumen' | 'webmoon' | 'portal' | 'socios' | 'portafolio' | 'equipo'
  | 'luna' | 'webluna' | 'legal' | 'eventos' | 'incidentes';

interface Seccion { id: TabId; label: string; desc: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }
interface Grupo { titulo: string; sitio?: string; items: Seccion[] }

// El menú, agrupado por sitio. Cada grupo lleva el enlace a su web en vivo.
const GRUPOS: Grupo[] = [
  { titulo: 'General', items: [
    { id: 'resumen', label: 'Resumen', desc: 'Los tres sitios de un vistazo y lo que espera respuesta.', Icon: LayoutDashboard },
  ] },
  { titulo: 'Moon Studios', sitio: 'https://moon-studios.netlify.app', items: [
    { id: 'webmoon',    label: 'Editor de la web', desc: 'Contenido, animaciones, secciones, vista previa y publicación de Moon Studios.', Icon: Sparkles },
    { id: 'portal',     label: 'Solicitudes',  desc: 'Cotizaciones, tickets, alianzas y soporte del portal de clientes.', Icon: FileText },
    { id: 'socios',     label: 'Socios',       desc: 'Socios capitalistas: revisar, aprobar, confirmar pagos y dejar notas.', Icon: Building2 },
    { id: 'portafolio', label: 'Portafolio',   desc: 'Los proyectos que se muestran en la web y en /proyectos.', Icon: Briefcase },
    { id: 'equipo',     label: 'Equipo',       desc: 'Las personas de la sección «Equipo».', Icon: UserCheck },
  ] },
  { titulo: 'Luna NET', sitio: 'https://luna-net.nellyx.xyz', items: [
    { id: 'luna',       label: 'Aliados',      desc: 'Los aliados que se muestran en la web de Luna.', Icon: Handshake },
    { id: 'webluna',    label: 'Web Luna',     desc: 'Sobre nosotros, contacto y blog.', Icon: Newspaper },
    { id: 'legal',      label: 'Legal',        desc: 'Privacidad, términos y cookies.', Icon: FileText },
    { id: 'eventos',    label: 'Eventos',      desc: 'Eventos de temporada: contenido, imágenes y fechas.', Icon: CalendarDays },
    { id: 'incidentes', label: 'Incidentes',   desc: 'El estado del sistema que ven los usuarios.', Icon: AlertTriangle },
  ] },
];
const SECCIONES = GRUPOS.flatMap(g => g.items.map(it => ({ ...it, grupo: g })));
const CLAVE_SECCION = 'webs-seccion';

const Webs: React.FC = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [sectionSearch, setSectionSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try { const v = localStorage.getItem(CLAVE_SECCION) as TabId | null; if (v && SECCIONES.some(x => x.id === v)) return v; } catch { /* sin almacenamiento */ }
    return 'resumen';
  });
  const [datos, setDatos] = useState<DatosWebs | null>(null);
  const actual = SECCIONES.find(x => x.id === activeTab) ?? SECCIONES[0];
  const sectionTerm = sectionSearch.trim().toLocaleLowerCase('es');
  const matchingGroups = GRUPOS.map(group => ({ ...group, items: group.items.filter(item => !sectionTerm || `${group.titulo} ${item.label} ${item.desc}`.toLocaleLowerCase('es').includes(sectionTerm)) })).filter(group => group.items.length > 0);

  // Lo que alimenta el resumen y las insignias del menú.
  const recargar = useCallback(() => { cargarDatosWebs(lunaFetch).then(setDatos).catch(e => console.error('Webs:', e)); }, []);
  useEffect(() => { recargar(); }, [recargar]);

  const ir = (id: string) => {
    if (!SECCIONES.some(x => x.id === id)) return;
    setActiveTab(id as TabId);
    try { localStorage.setItem(CLAVE_SECCION, id); } catch { /* da igual */ }
    if (id === 'resumen') recargar();
    if (window.innerWidth <= 1100) requestAnimationFrame(() => contentRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  };

  const insignia: Partial<Record<TabId, number>> = {
    portal: datos?.solicitudes.filter(x => x.estado === 'pendiente').length ?? 0,
    socios: datos?.socios.filter(x => x.estado === 'pendiente').length ?? 0,
  };

  return (
    <div className="moon-module moon-module--webs">
      <style>{CSS_WEBS}</style>
      <div className="wb">
        <nav className="wb-nav" aria-label="Secciones de Webs">
          <div className="wb-nav-marca">
            <span className="wb-avatar" style={{ borderRadius: 11 }}><Globe className="w-4 h-4" strokeWidth={1.5} /></span>
            <div><b>Webs</b><small>Administración de los sitios</small></div>
          </div>
          <div className="enterprise-web-search"><Search aria-hidden="true" /><input aria-label="Buscar sección de sitios" value={sectionSearch} onChange={e => setSectionSearch(e.target.value)} placeholder="Buscar sección…" /></div>
          {matchingGroups.length === 0 && <p className="enterprise-web-empty">No hay secciones con ese nombre.</p>}
          {matchingGroups.map(g => (
            <div key={g.titulo} className="wb-grupo">
              <div className="wb-grupo-titulo">
                {g.titulo}
                {g.sitio && <a href={g.sitio} target="_blank" rel="noopener noreferrer" title={`Abrir ${g.titulo}`}><ExternalLink className="w-3 h-3" /></a>}
              </div>
              {g.items.map(({ id, label, Icon }) => (
                <button key={id} type="button" className="wb-item" aria-current={activeTab === id ? 'page' : undefined} onClick={() => ir(id)}>
                  <Icon strokeWidth={1.5} /><span>{label}</span>
                  {!!insignia[id] && <i className="wb-insignia" style={{ fontStyle: 'normal' }}>{insignia[id]}</i>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="wb-cuerpo" ref={contentRef}>
          <header data-moon-reveal="heading" className="moon-module-heading wb-cab">
            <div style={{ minWidth: 0 }}>
              <div className="wb-ruta">Webs<Flecha className="w-3 h-3" />{actual.grupo.titulo}</div>
              <h1 className="moon-page-title"><actual.Icon className="w-5 h-5" strokeWidth={1.5} />{actual.label}</h1>
              <p>{actual.desc}</p>
            </div>
            {actual.grupo.sitio && (
              <a className="wb-btn" href={actual.grupo.sitio} target="_blank" rel="noopener noreferrer">
                <ExternalLink />Ver {actual.grupo.titulo}
              </a>
            )}
          </header>

          <div hidden={activeTab !== 'webmoon'} className="wb-panel">
            <ProteccionErrores nombre="Editor de la web Moon Studios">
              <WebMoonPanel ir={ir} />
            </ProteccionErrores>
          </div>
          <div hidden={activeTab === 'webmoon'} key={activeTab} className={`wb-panel${activeTab === 'resumen' || activeTab === 'socios' ? ' wb-panel-limpio' : ''}`}>
            {/* Si un panel se rompe, solo ese muestra el error (antes la app quedaba en negro). */}
            <ProteccionErrores nombre={activeTab}>
              {activeTab === 'resumen'    && <ResumenWebs datos={datos} ir={ir} />}
              {activeTab === 'portal'     && <PortalClientesPanel onCambio={recargar} />}
              {activeTab === 'socios'     && <SociosPanel borrarArchivo={deleteSupabaseImage} onCambio={recargar} />}
              {activeTab === 'portafolio' && <PortfolioPanel />}
              {activeTab === 'equipo'     && <EquipoPanel />}
              {activeTab === 'luna'       && <AlliesPanel />}
              {activeTab === 'webluna'    && <WebLunaPanel lunaFetch={lunaFetch} />}
              {activeTab === 'legal'      && <LegalLunaPanel lunaFetch={lunaFetch} />}
              {activeTab === 'eventos'    && <EventosLunaPanel lunaFetch={lunaFetch} lunaSubir={lunaSubir} />}
              {activeTab === 'incidentes' && <IncidentsPanel />}
            </ProteccionErrores>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Webs;
