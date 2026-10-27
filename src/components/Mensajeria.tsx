import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
import { panelInk } from '@/lib/panelColors';
import { EnterpriseFocus } from '@/components/EnterpriseFocus';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  collection, doc, onSnapshot, updateDoc, deleteDoc, writeBatch, Timestamp,
} from 'firebase/firestore';
import {
  MessagesSquare, Mail, MailOpen, Search, RefreshCw, Trash2, ChevronDown,
  Copy, CheckCheck, AlertCircle, Headphones, Globe, Send, Loader2,
  BadgeCheck, X, Moon,
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════
// ESTILO — mismas variables de tema que el resto del dashboard (Webs.tsx)
// ═══════════════════════════════════════════════════════════════════
const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const sc = 'hsl(var(--secondary))';
const mt = 'hsl(var(--muted-foreground))';

// ═══════════════════════════════════════════════════════════════════
// API — backend propio (Luna NET) donde vive POST /api/correos/:id/responder
// ═══════════════════════════════════════════════════════════════════
const LUNA_API = import.meta.env.VITE_LUNA_API_URL
  || import.meta.env.VITE_API_URL
  || import.meta.env.VITE_API_BASE_URL
  || 'https://api.lunanet.nellyx.xyz';

/**
 * Llama al endpoint de respuesta. Manda el ID token de Firebase del usuario
 * logueado como Bearer — el backend (middlewares/requireStaff.js) lo valida
 * y chequea que el rol sea CEO/Administración antes de mandar nada.
 */
async function apiResponderCorreo(correoId: string, mensaje: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay sesión activa. Volvé a iniciar sesión.');
  const token = await user.getIdToken();

  const res = await fetch(`${LUNA_API}/api/correos/${correoId}/responder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mensaje }),
  });

  let json: { ok?: boolean; error?: string } = {};
  try { json = await res.json(); } catch { /* respuesta sin body */ }

  if (!res.ok) {
    throw new Error(json.error || `Error HTTP ${res.status} al enviar la respuesta.`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════
type Origen = 'web_contacto' | 'web_soporte_interno' | string;

interface Correo {
  id: string;
  nombre: string;
  email: string;
  mensaje: string;
  fecha: Timestamp | null;
  leido: boolean;
  origen: Origen;
  ip_aproximada?: string | null;
  respondido?: boolean;
  respondidoEn?: Timestamp | null;
  // Los del formulario de la web de Luna (luna-net.nellyx.xyz/contacto)
  // llegan con origen «web_contacto», sitio «luna-net» y un asunto.
  sitio?: string;
  asunto?: string;
  idioma?: string;
}

type OrigenFilter = 'todos' | Origen;
type LeidoFilter = 'todos' | 'no_leidos' | 'leidos';

// Estos son los ÚNICOS dos orígenes que las reglas de Firestore aceptan hoy
// (ver correos_panel_moonstudios en firestore.rules). Si agregan un formulario
// nuevo con otro `origen`, hay que sumarlo acá Y en las reglas, o esos correos
// jamás van a poder guardarse.
const ORIGEN_CONFIG: Record<string, { label: string; color: string; Icon: typeof Globe }> = {
  web_contacto:        { label: 'Sitio público',   color: '#4ade80', Icon: Globe },
  web_soporte_interno: { label: 'Soporte interno', color: '#fb923c', Icon: Headphones },
};
const origenMeta = (origen: string) =>
  ORIGEN_CONFIG[origen] ?? { label: origen || 'Desconocido', color: mt, Icon: Mail };

const ASUNTOS_LUNA: Record<string, string> = {
  soporte: 'Soporte con el bot', factura: 'Pagos y Premium', bug: 'Error en el bot', sugerencia: 'Sugerencia',
  privacidad: 'Privacidad y datos', alianza: 'Alianzas', otro: 'Otro',
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
const formatDate = (value: Timestamp | null | undefined): string => {
  if (!value) return '—';
  try {
    const d = value.toDate();
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
};

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

const CORREOS_COL = collection(db, 'correos_panel_moonstudios');

// ═══════════════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ═══════════════════════════════════════════════════════════════════
const LoadingSpinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center h-32 gap-3">
    <div className="w-5 h-5 border moon-panel-border border-t-zinc-300 rounded-full animate-spin" />
    {label && <p className="text-xs font-light" style={{ color: panelInk(mt) }}>{label}</p>}
  </div>
);

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

const OrigenBadge: React.FC<{ origen: string; sitio?: string }> = ({ origen, sitio }) => {
  const { label, color, Icon } = sitio === 'luna-net'
    ? { label: 'Luna NET', color: '#a5b4fc', Icon: Moon }
    : origenMeta(origen);
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: `${color}18`, color: panelInk(color), border: `1px solid ${color}30` }}
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={2} />
      {label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════
// MENSAJERÍA — panel de administración de correos de contacto
// ═══════════════════════════════════════════════════════════════════
const Mensajeria: React.FC = () => {
  const [correos,      setCorreos]      = useState<Correo[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [searchQ,      setSearchQ]      = useState('');
  const [origenFilter, setOrigenFilter] = useState<OrigenFilter>('todos');
  const [leidoFilter,  setLeidoFilter]  = useState<LeidoFilter>('todos');
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [updatingId,   setUpdatingId]   = useState<string | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [markingAll,   setMarkingAll]   = useState(false);

  // ── Estado del compositor de respuesta ─────────────────────────────
  const [replyingId,   setReplyingId]   = useState<string | null>(null);
  const [replyText,    setReplyText]    = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const replyEmojiRef = useRef<HTMLTextAreaElement>(null);

  // En vivo: un mensaje nuevo desde las webs aparece sin tocar "Actualizar".
  // El botón vuelve a suscribirse, por si la escucha falló.
  const [intento, setIntento] = useState(0);
  const loadData = useCallback(async () => { setLoading(true); setError(null); setIntento(n => n + 1); }, []);

  useEffect(() => onSnapshot(CORREOS_COL, snap => {
    const data = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Correo))
      .sort((a, b) => (b.fecha?.seconds ?? 0) - (a.fecha?.seconds ?? 0));
    setCorreos(data);
    setError(null);
    setLoading(false);
  }, e => {
    console.error('Error cargando correos:', e);
    setError('No se pudieron cargar los correos. Revisa tu conexión o tus permisos.');
    setLoading(false);
  }), [intento]);

  const stats = useMemo(() => ({
    total:    correos.length,
    noLeidos: correos.filter(c => !c.leido).length,
    contacto: correos.filter(c => c.origen === 'web_contacto').length,
    soporte:  correos.filter(c => c.origen === 'web_soporte_interno').length,
  }), [correos]);

  const origenesPresentes = useMemo(
    () => Array.from(new Set(correos.map(c => c.origen))).filter(Boolean),
    [correos]
  );

  const filtered = useMemo(() => correos.filter(c => {
    if (onlyUnanswered && c.respondido) return false;
    if (origenFilter !== 'todos' && c.origen !== origenFilter) return false;
    if (leidoFilter === 'no_leidos' && c.leido) return false;
    if (leidoFilter === 'leidos' && !c.leido) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!c.nombre.toLowerCase().includes(q) &&
          !c.email.toLowerCase().includes(q) &&
          !c.mensaje.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const time = a.fecha?.toMillis?.() || 0;
    const otherTime = b.fecha?.toMillis?.() || 0;
    return sortBy === 'recent' ? otherTime - time : time - otherTime;
  }), [correos, origenFilter, leidoFilter, searchQ, onlyUnanswered, sortBy]);

  // ── Acciones ──────────────────────────────────────────────────────
  const handleToggleLeido = async (correo: Correo) => {
    const nuevoEstado = !correo.leido;
    setUpdatingId(correo.id);
    // Optimistic update
    setCorreos(prev => prev.map(c => c.id === correo.id ? { ...c, leido: nuevoEstado } : c));
    try {
      await updateDoc(doc(db, 'correos_panel_moonstudios', correo.id), { leido: nuevoEstado });
    } catch (e) {
      console.error(e);
      // Revertir si falla
      setCorreos(prev => prev.map(c => c.id === correo.id ? { ...c, leido: correo.leido } : c));
      toast.error('No se pudo actualizar el correo');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (correo: Correo) => {
    if (!confirm(`¿Eliminar el mensaje de ${correo.nombre}? Esta acción no se puede deshacer.`)) return;
    setDeletingId(correo.id);
    try {
      await deleteDoc(doc(db, 'correos_panel_moonstudios', correo.id));
      setCorreos(prev => prev.filter(c => c.id !== correo.id));
      if (expandedId === correo.id) setExpandedId(null);
      toast.success('Correo eliminado');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo eliminar el correo');
    } finally {
      setDeletingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    const pendientes = filtered.filter(c => !c.leido);
    if (pendientes.length === 0) return;
    setMarkingAll(true);
    const prevState = correos;
    setCorreos(prev => prev.map(c => pendientes.some(p => p.id === c.id) ? { ...c, leido: true } : c));
    try {
      const batch = writeBatch(db);
      pendientes.forEach(c => batch.update(doc(db, 'correos_panel_moonstudios', c.id), { leido: true }));
      await batch.commit();
      toast.success(`${pendientes.length} correo(s) marcados como leídos`);
    } catch (e) {
      console.error(e);
      setCorreos(prevState); // revertir
      toast.error('No se pudo marcar todo como leído');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success('Email copiado');
  };

  // ── Responder (llama al backend, que arma la plantilla y manda el mail) ──
  const openReply = (correoId: string) => {
    setReplyingId(correoId);
    setReplyText('');
  };

  const closeReply = () => {
    setReplyingId(null);
    setReplyText('');
  };

  const handleSendReply = async (correo: Correo) => {
    const mensaje = replyText.trim();
    if (mensaje.length < 2) {
      toast.error('Escribí una respuesta antes de enviar.');
      return;
    }
    setSendingReply(true);
    try {
      await apiResponderCorreo(correo.id, mensaje);
      // El backend ya marca respondido/leido en Firestore — reflejamos eso localmente
      // en vez de esperar otro round-trip de lectura.
      setCorreos(prev => prev.map(c =>
        c.id === correo.id ? { ...c, respondido: true, leido: true } : c
      ));
      toast.success(`Respuesta enviada a ${correo.email}`);
      closeReply();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar la respuesta');
    } finally {
      setSendingReply(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  if (loading) return <LoadingSpinner label="Cargando bandeja de entrada..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="moon-module moon-module--mensajeria space-y-5">
      <EnterpriseFocus eyebrow="Clientes · Atención" title="Mensajería"
        description="Organiza las consultas recibidas desde tus sitios y prioriza los mensajes que esperan una respuesta."
        metrics={[
          { label: 'Recibidos', value: stats.total, detail: 'Todos los orígenes', onClick: () => { setOrigenFilter('todos'); setLeidoFilter('todos'); setOnlyUnanswered(false); setSearchQ(''); } },
          { label: 'Sin leer', value: stats.noLeidos, detail: 'Abrir pendientes de lectura', onClick: () => { setOrigenFilter('todos'); setLeidoFilter('no_leidos'); setOnlyUnanswered(false); setSearchQ(''); } },
          { label: 'Sin responder', value: correos.filter(c => !c.respondido).length, detail: 'Priorizar atención', onClick: () => { setOrigenFilter('todos'); setOnlyUnanswered(true); setLeidoFilter('todos'); setSearchQ(''); } },
        ]}>
        <button type="button" className="enterprise-action" onClick={loadData}><RefreshCw />Actualizar bandeja</button>
      </EnterpriseFocus>

      {/* Filtros */}
      <div className="enterprise-toolbar">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: panelInk(mt) }} strokeWidth={1.5} />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Buscar por nombre, email o mensaje..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-light outline-none"
            style={{ background: sf, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
          />
        </div>

        <div className="relative">
          <select
            value={origenFilter}
            onChange={e => setOrigenFilter(e.target.value as OrigenFilter)}
            className="pl-3 pr-8 py-2 rounded-xl text-xs font-light outline-none appearance-none cursor-pointer"
            style={{ background: sf, border: `1px solid ${bd}`, color: panelInk(origenFilter !== 'todos' ? "var(--moon-ink)" : mt) }}
          >
            <option value="todos">Origen: todos</option>
            {origenesPresentes.map(o => (
              <option key={o} value={o}>{origenMeta(o).label}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: panelInk(mt) }} />
        </div>

        <select aria-label="Orden de consultas" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
          <option value="recent">Más recientes primero</option><option value="oldest">Más antiguos primero</option>
        </select>
        <button type="button" className="enterprise-pill" aria-pressed={onlyUnanswered} onClick={() => setOnlyUnanswered(v => !v)}>Sin responder</button>
        {(searchQ || origenFilter !== 'todos' || leidoFilter !== 'todos' || onlyUnanswered) && <button type="button" className="enterprise-action" onClick={() => { setSearchQ(''); setOrigenFilter('todos'); setLeidoFilter('todos'); setOnlyUnanswered(false); }}>Limpiar filtros</button>}

        <div className="flex gap-1 rounded-xl p-1" style={{ background: sc, border: `1px solid ${bd}` }}>
          {([
            { key: 'todos',     label: 'Todos' },
            { key: 'no_leidos', label: 'Sin leer' },
            { key: 'leidos',    label: 'Leídos' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setLeidoFilter(key)}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-all"
              style={{
                background: leidoFilter === key ? "var(--moon-surface-raised)" : 'transparent',
                color:      panelInk(leidoFilter === key ? "var(--moon-ink)" : mt),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {stats.noLeidos > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover disabled:opacity-50"
            style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
          >
            <CheckCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
            {markingAll ? 'Marcando...' : 'Marcar todo leído'}
          </button>
        )}

        <button
          onClick={loadData}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all moon-panel-hover flex-shrink-0"
          style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
          aria-label="Refrescar"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
          <MessagesSquare className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--moon-muted)' }} strokeWidth={1} />
          <p className="text-sm font-light" style={{ color: panelInk(mt) }}>
            {correos.length === 0 ? 'Todavía no llegó ningún mensaje.' : 'Ningún correo coincide con el filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(correo => {
            const isExpanded  = expandedId === correo.id;
            const isUpdating  = updatingId === correo.id;
            const isDeleting  = deletingId === correo.id;
            const isReplying  = replyingId === correo.id;
            return (
              <div data-moon-reveal="row"
                key={correo.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{
                  background: sf,
                  border: `1px solid ${isExpanded ? 'color-mix(in srgb, var(--moon-ink) 14%, transparent)' : !correo.leido ? 'rgba(129,140,248,0.25)' : bd}`,
                  opacity: isDeleting ? 0.4 : 1,
                }}
              >
                {/* Fila principal */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : correo.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: correo.leido ? 'transparent' : '#818cf8' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm truncate ${correo.leido ? 'font-light' : 'font-medium'}`} style={{ color: panelInk(correo.leido ? mt : "var(--moon-ink)") }}>
                        {correo.nombre}
                      </p>
                      <OrigenBadge origen={correo.origen} sitio={correo.sitio} />
                      {correo.asunto && (
                        <span className="text-[10px] font-light px-2 py-0.5 rounded-full flex-shrink-0" style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}>
                          {ASUNTOS_LUNA[correo.asunto] ?? correo.asunto}{correo.idioma && correo.idioma !== 'es' ? ` · ${correo.idioma.toUpperCase()}` : ''}
                        </span>
                      )}
                      {correo.respondido && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'rgba(74,222,128,0.12)', color: panelInk('#4ade80'), border: '1px solid rgba(74,222,128,0.25)' }}
                        >
                          <BadgeCheck className="w-2.5 h-2.5" strokeWidth={2} /> Respondido
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-light truncate mt-0.5" style={{ color: 'var(--moon-muted)' }}>
                      <EmojiText text={truncate(correo.mensaje, 90)} size={16} />
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] font-light hidden sm:inline" style={{ color: 'var(--moon-muted)' }}>
                      {formatDate(correo.fecha)}
                    </span>
                    <ChevronDown
                      className="w-3.5 h-3.5 transition-transform"
                      style={{ color: panelInk(mt), transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                    />
                  </div>
                </button>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3" style={{ borderTop: `1px solid ${bd}` }}>
                    <div className="flex items-center gap-2 flex-wrap pt-3">
                      <button
                        onClick={() => handleCopyEmail(correo.email)}
                        className="flex items-center gap-1.5 text-xs font-light px-2.5 py-1 rounded-lg transition-all moon-panel-hover"
                        style={{ color: 'hsl(var(--foreground))', border: `1px solid ${bd}` }}
                      >
                        {correo.email} <Copy className="w-3 h-3" style={{ color: panelInk(mt) }} />
                      </button>
                      <span className="text-[10px] font-light" style={{ color: 'var(--moon-muted)' }}>
                        {formatDate(correo.fecha)}
                      </span>
                      {correo.ip_aproximada && (
                        <span className="text-[10px] font-mono" style={{ color: 'var(--moon-muted)' }}>
                          IP: {correo.ip_aproximada}
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-light leading-relaxed whitespace-pre-wrap" style={{ color: 'hsl(var(--foreground))' }}>
                      <EmojiText text={correo.mensaje} />
                    </p>

                    {/* Compositor de respuesta */}
                    {isReplying ? (
                      <div className="space-y-2.5 rounded-xl p-3.5" style={{ background: sc, border: `1px solid ${bd}` }}>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk(mt) }}>
                            Responder a {correo.nombre}
                          </p>
                          <button
                            onClick={closeReply}
                            disabled={sendingReply}
                            className="w-6 h-6 rounded-md flex items-center justify-center moon-panel-hover disabled:opacity-50"
                            style={{ color: panelInk(mt) }}
                          >
                            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </div>
                        <textarea
                          ref={replyEmojiRef}
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          disabled={sendingReply}
                          rows={4}
                          maxLength={5000}
                          placeholder="Escribí tu respuesta. Se envía con la plantilla de Moon Studios y se cita tu mensaje original automáticamente."
                          className="w-full px-3 py-2.5 rounded-lg text-xs font-light outline-none resize-none disabled:opacity-50"
                          style={{ background: sf, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[10px] font-light" style={{ color: 'var(--moon-muted)' }}>
                            <EmojiButton value={replyText} onChange={setReplyText} inputRef={replyEmojiRef} maxLength={5000} disabled={sendingReply} unicodeOnly label="Añadir emoji a la respuesta" />
                            {replyText.length}/5000
                          </div>
                          <button
                            onClick={() => handleSendReply(correo)}
                            disabled={sendingReply || replyText.trim().length < 2}
                            className="moon-panel-primary flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                            style={{ background: "var(--moon-ink)", color: "var(--moon-bg)" }}
                          >
                            {sendingReply
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
                              : <><Send className="w-3.5 h-3.5" strokeWidth={2} /> Enviar respuesta</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <button
                          onClick={() => openReply(correo.id)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover"
                          style={{ border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
                        >
                          <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                          {correo.respondido ? 'Responder de nuevo' : 'Responder'}
                        </button>
                        <button
                          onClick={() => handleToggleLeido(correo)}
                          disabled={isUpdating}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all moon-panel-hover disabled:opacity-50"
                          style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}
                        >
                          {correo.leido
                            ? <><Mail className="w-3.5 h-3.5" strokeWidth={1.5} /> Marcar como no leído</>
                            : <><MailOpen className="w-3.5 h-3.5" strokeWidth={1.5} /> Marcar como leído</>}
                        </button>
                        <button
                          onClick={() => handleDelete(correo)}
                          disabled={isDeleting}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-red-500/10 disabled:opacity-50 ml-auto"
                          style={{ border: '1px solid rgba(248,113,113,0.2)', color: panelInk('#f87171') }}
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Eliminar
                        </button>
                      </div>
                    )}
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

export default Mensajeria;
