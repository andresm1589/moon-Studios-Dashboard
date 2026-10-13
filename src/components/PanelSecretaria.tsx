import { useState, useEffect, useCallback, useRef } from 'react';
import { db, logActivity as registrarActividad } from '@/lib/firebase';
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, updateDoc, limit,
  Timestamp, deleteField,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import type { SecretaryDocument, ActivityRecord, DocStatus } from '@/types';
import {
 Plus, Trash2, Search, Check, AlertCircle,
  FileText, Clock, CheckCircle2, Archive, RotateCcw,
  ChevronDown, X, Edit3, Activity, CalendarDays, type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { fechaNumerica } from '@/lib/ajustes/fecha';

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_META: Record<DocStatus, { label: string; color: string; icon: LucideIcon }> = {
  draft:    { label: 'Borrador',   color: '#9ca3af', icon: Edit3 },
  review:   { label: 'En revisión', color: '#f59e0b', icon: RotateCcw },
  approved: { label: 'Aprobado',   color: '#34d399', icon: CheckCircle2 },
  archived: { label: 'Archivado',  color: '#6b7280', icon: Archive },
};

const DOC_CATEGORIES = [
  'Contrato', 'Acta', 'Memorando', 'Informe', 'Circular',
  'Resolución', 'Oficio', 'Carta', 'Solicitud', 'Otro',
];

type Tab = 'documentos' | 'actividades';
type Toast = { type: 'success' | 'error'; msg: string } | null;

interface DocForm {
  title: string;
  content: string;
  category: string;
  status: DocStatus;
  notes: string;
  dueDate: string;   // 'yyyy-MM-dd' del <input type="date">, '' si no tiene
}

const EMPTY_FORM: DocForm = { title: '', content: '', category: 'Acta', status: 'draft', notes: '', dueDate: '' };

// En Firestore el documento guarda también la fecha límite (el tipo compartido no la trae).
type SecDoc = SecretaryDocument & { dueDate?: Date };

function msgError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// La fecha del input es local: se guarda al mediodía para que el cambio a UTC
// no la corra al día anterior.
const fechaAGuardar = (s: string) => Timestamp.fromDate(new Date(`${s}T12:00:00`));

export default function PanelSecretaria() {
  const { currentUser, userProfile, isAdmin, isCEO } = useAuth();
  const canEdit = isAdmin || isCEO || userProfile?.role === 'Secretaría';
  // Las reglas de secretaria_docs solo dejan borrar a CEO y Administración.
  const puedeBorrar = isAdmin || isCEO;

  const [docs,       setDocs]       = useState<SecDoc[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [statusMenu, setStatusMenu] = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<Tab>('documentos');
  const [search,     setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState<DocStatus | 'all'>('all');
  const [showForm,   setShowForm]   = useState(false);
  const [editDoc,    setEditDoc]    = useState<SecDoc | null>(null);
  const [form,       setForm]       = useState<DocForm>(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [toast,      setToast]      = useState<Toast>(null);

  // ── Cargar documentos ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'secretaria_docs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          ...raw,
          id: d.id,
          createdAt: raw.createdAt?.toDate?.() ?? new Date(),
          updatedAt: raw.updatedAt?.toDate?.() ?? new Date(),
          dueDate:   raw.dueDate?.toDate?.() ?? undefined,
        } as unknown as SecDoc;
      });
      setDocs(data);
      setLoadError(null);
      setLoading(false);
    }, err => {
      // Sin este callback, un error (p. ej. permisos) dejaba el spinner girando para siempre.
      console.error('Error cargando documentos:', err);
      setLoadError(err.code === 'permission-denied'
        ? 'No tienes permiso para ver los documentos de Secretaría.'
        : 'No se pudieron cargar los documentos. Revisa tu conexión e inténtalo de nuevo.');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Cargar actividades ───────────────────────────────────────────────────
  // El registro es `activityLogs` (el mismo de todo el portal). Las reglas de
  // Firestore solo dejan leerlo a CEO y Administración; se filtra por módulo
  // acá para no depender de un índice compuesto.
  const puedeVerActividad = isCEO || isAdmin;
  useEffect(() => {
    if (!puedeVerActividad) return;
    const q = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(300));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs
        .filter(d => d.data().module === 'secretaria')
        .map(d => {
          const raw = d.data();
          return { ...raw, id: d.id, createdAt: raw.createdAt?.toDate?.() ?? new Date() } as ActivityRecord;
        });
      setActivities(data);
    }, () => setActivities([]));
    return () => unsub();
  }, [puedeVerActividad]);

  // Un solo temporizador: si no, el de un toast anterior cierra antes de tiempo el nuevo.
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastRef.current) clearTimeout(toastRef.current); }, []);

  const logActivity = async (action: string, description: string) => {
    try {
      await registrarActividad(action, {}, currentUser?.uid ?? '', userProfile?.displayName ?? '', { module: 'secretaria', description });
    } catch { /* no bloquear si el log falla */ }
  };

  // ── Guardar documento ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      showToast('error', 'Título y contenido son obligatorios');
      return;
    }
    if (!currentUser) return;
    setSaving(true);
    const base = {
      title:    form.title.trim(),
      content:  form.content,
      category: form.category,
      status:   form.status,
      notes:    form.notes.trim(),
    };
    try {
      if (editDoc) {
        await updateDoc(doc(db, 'secretaria_docs', editDoc.id), {
          ...base,
          // Si se borró la fecha, se quita el campo en vez de dejar la anterior.
          dueDate:   form.dueDate ? fechaAGuardar(form.dueDate) : deleteField(),
          updatedAt: serverTimestamp(),
        });
        await logActivity('editar_doc', `Editó el documento: ${base.title}`);
        showToast('success', 'Documento actualizado');
      } else {
        await addDoc(collection(db, 'secretaria_docs'), {
          ...base,
          ...(form.dueDate ? { dueDate: fechaAGuardar(form.dueDate) } : {}),
          createdBy:   currentUser.uid,   // la regla de create exige createdBy == uid
          creatorName: userProfile?.displayName ?? '',
          createdAt:   serverTimestamp(),
          updatedAt:   serverTimestamp(),
        });
        await logActivity('crear_doc', `Creó el documento: ${base.title}`);
        showToast('success', 'Documento creado');
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditDoc(null);
    } catch (err) {
      showToast('error', `Error: ${msgError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Cambiar estado ───────────────────────────────────────────────────────
  const handleStatusChange = async (docId: string, status: DocStatus, title: string) => {
    setStatusMenu(null);
    try {
      await updateDoc(doc(db, 'secretaria_docs', docId), { status, updatedAt: serverTimestamp() });
      await logActivity('cambiar_estado', `Cambió "${title}" a ${STATUS_META[status].label}`);
    } catch (err) {
      showToast('error', `Error: ${msgError(err)}`);
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────────────────
  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`¿Eliminar "${title}"?`)) return;
    setDeleting(id);
    try {
      await deleteDoc(doc(db, 'secretaria_docs', id));
      await logActivity('eliminar_doc', `Eliminó el documento: ${title}`);
      showToast('success', 'Documento eliminado');
    } catch (err) {
      showToast('error', `Error: ${msgError(err)}`);
    } finally {
      setDeleting(null);
    }
  };

  const openEdit = (d: SecDoc) => {
    setEditDoc(d);
    setForm({
      title: d.title, content: d.content, category: d.category, status: d.status,
      notes:   d.notes ?? '',
      dueDate: d.dueDate ? format(d.dueDate, 'yyyy-MM-dd') : '',
    });
    setShowForm(true);
  };

  const filteredDocs = docs.filter(d => {
    const matchStatus = filterStatus === 'all' || d.status === filterStatus;
    const matchSearch = !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.category.toLowerCase().includes(search.toLowerCase()) ||
      d.creatorName?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const countByStatus = (Object.keys(STATUS_META) as DocStatus[]).reduce((acc, s) => {
    acc[s] = docs.filter(d => d.status === s).length;
    return acc;
  }, {} as Record<DocStatus, number>);

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-light shadow-2xl"
          style={{
            background: toast.type === 'success' ? 'rgba(20,30,20,0.97)' : 'rgba(30,15,15,0.97)',
            borderColor: toast.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
            color: toast.type === 'success' ? '#34d399' : '#f87171',
          }}>
          {toast.type === 'success' ? <Check className="w-4 h-4" strokeWidth={1.5} /> : <AlertCircle className="w-4 h-4" strokeWidth={1.5} />}
          {toast.msg}
        </div>
      )}

      {/* ── Modal de creación/edición ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}>
          <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden"
            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900">
              <h2 className="text-white text-base font-light">
                {editDoc ? 'Editar documento' : 'Nuevo documento'}
              </h2>
              <button onClick={() => { setShowForm(false); setEditDoc(null); setForm(EMPTY_FORM); }}
                className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            {/* Form */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-zinc-500 text-xs font-light mb-2 uppercase tracking-wider">Título *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Título del documento"
                    className="w-full px-4 py-3 rounded-2xl text-white text-sm font-light placeholder-zinc-600 outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
                <div>
                  <label className="block text-zinc-500 text-xs font-light mb-2 uppercase tracking-wider">Categoría</label>
                  <div className="relative">
                    <select
                      value={form.category}
                      onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                      className="w-full appearance-none px-4 py-3 pr-10 rounded-2xl text-white text-sm font-light outline-none cursor-pointer"
                      style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
                      {DOC_CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#111', color: '#fff' }}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" strokeWidth={1.5} />
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-500 text-xs font-light mb-2 uppercase tracking-wider">Estado</label>
                  <div className="relative">
                    <select
                      value={form.status}
                      onChange={e => setForm(p => ({ ...p, status: e.target.value as DocStatus }))}
                      className="w-full appearance-none px-4 py-3 pr-10 rounded-2xl text-sm font-light outline-none cursor-pointer"
                      style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', color: STATUS_META[form.status as DocStatus]?.color ?? '#fff' }}>
                      {(Object.keys(STATUS_META) as DocStatus[]).map(s => (
                        <option key={s} value={s} style={{ background: '#111', color: STATUS_META[s].color }}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" strokeWidth={1.5} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-zinc-500 text-xs font-light mb-2 uppercase tracking-wider">Contenido *</label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                    rows={8}
                    placeholder="Redacta el contenido del documento..."
                    className="w-full px-4 py-3 rounded-2xl text-white text-sm font-light placeholder-zinc-600 outline-none resize-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
                <div>
                  <label htmlFor="sec-due" className="block text-zinc-500 text-xs font-light mb-2 uppercase tracking-wider">Fecha límite</label>
                  <input
                    id="sec-due"
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl text-white text-sm font-light outline-none [color-scheme:dark]"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="sec-notes" className="block text-zinc-500 text-xs font-light mb-2 uppercase tracking-wider">Notas internas</label>
                  <textarea
                    id="sec-notes"
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    rows={3}
                    placeholder="Pendientes, a quién se envió, observaciones..."
                    className="w-full px-4 py-3 rounded-2xl text-white text-sm font-light placeholder-zinc-600 outline-none resize-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
              </div>
            </div>
            {/* Footer */}
            <div className="flex gap-3 px-6 py-5 border-t border-zinc-900">
              <button onClick={() => { setShowForm(false); setEditDoc(null); setForm(EMPTY_FORM); }}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl text-sm font-light text-zinc-500 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-2xl text-sm font-light transition-all"
                style={{ background: saving ? '#222' : '#fff', color: saving ? '#555' : '#000', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : editDoc ? 'Actualizar' : 'Crear documento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-xl font-light tracking-wide mb-1">Panel de Secretaría</h1>
          <p className="text-zinc-500 text-sm font-light">{docs.length} documentos registrados</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-light bg-white text-black">
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Nuevo documento
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(STATUS_META) as DocStatus[]).map(status => {
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          return (
            <button key={status}
              onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
              className="rounded-2xl p-4 text-left transition-all"
              style={{
                background: filterStatus === status ? `${meta.color}12` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filterStatus === status ? meta.color + '40' : 'rgba(255,255,255,0.06)'}`,
              }}>
              <Icon className="w-4 h-4 mb-2" style={{ color: meta.color }} strokeWidth={1.5} />
              <p className="text-white text-xl font-light">{countByStatus[status]}</p>
              <p className="text-xs font-light mt-0.5" style={{ color: meta.color }}>{meta.label}</p>
            </button>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {(['documentos', 'actividades'] as Tab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-xl text-sm font-light capitalize transition-all flex items-center justify-center gap-2"
            style={{ background: activeTab === tab ? 'rgba(255,255,255,0.08)' : 'transparent', color: activeTab === tab ? '#fff' : '#555' }}>
            {tab === 'documentos' ? <FileText className="w-4 h-4" strokeWidth={1.5} /> : <Activity className="w-4 h-4" strokeWidth={1.5} />}
            {tab === 'documentos' ? `Documentos (${docs.length})` : `Actividad (${activities.length})`}
          </button>
        ))}
      </div>

      {/* ════ TAB: DOCUMENTOS ════ */}
      {activeTab === 'documentos' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Buscar documentos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm font-light text-white placeholder-zinc-600 outline-none"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            />
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <div className="w-6 h-6 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="py-16 text-center rounded-3xl" style={{ border: '1px dashed rgba(248,113,113,0.25)' }}>
              <AlertCircle className="w-10 h-10 text-red-400/60 mx-auto mb-4" strokeWidth={1} />
              <p className="text-zinc-400 text-sm font-light">{loadError}</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-16 text-center rounded-3xl" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
              <FileText className="w-10 h-10 text-zinc-800 mx-auto mb-4" strokeWidth={1} />
              <p className="text-zinc-500 text-sm font-light">No hay documentos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocs.map(d => {
                const statusMeta = STATUS_META[d.status];
                const StatusIcon = statusMeta.icon;
                return (
                  <div key={d.id} className="rounded-2xl p-5 transition-all"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-white text-sm font-light">{d.title}</h3>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-light"
                            style={{ color: statusMeta.color, background: `${statusMeta.color}14` }}>
                            <StatusIcon className="w-3 h-3" strokeWidth={1.5} />
                            {statusMeta.label}
                          </span>
                          <span className="text-xs text-zinc-600 font-light px-2 py-0.5 rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            {d.category}
                          </span>
                        </div>
                        <p className="text-zinc-500 text-xs font-light line-clamp-2 mb-3">{d.content}</p>
                        <div className="flex items-center gap-3 text-xs text-zinc-700 font-light flex-wrap">
                          {d.dueDate && (() => {
                            // Vencido: fecha pasada y el documento sigue abierto (borrador o en revisión).
                            const vencido = d.dueDate < new Date(new Date().setHours(0, 0, 0, 0)) &&
                              (d.status === 'draft' || d.status === 'review');
                            return (
                              <>
                                <span className="flex items-center gap-1" style={{ color: vencido ? '#f87171' : '#a1a1aa' }}>
                                  <CalendarDays className="w-3 h-3" strokeWidth={1.5} />
                                  {vencido ? 'Venció' : 'Vence'} {format(d.dueDate, 'dd MMM yyyy', { locale: es })}
                                </span>
                                <span>·</span>
                              </>
                            );
                          })()}
                          <span>{d.creatorName}</span>
                          <span>·</span>
                          <span>{format(d.createdAt, 'dd MMM yyyy', { locale: es })}</span>
                          {d.updatedAt > d.createdAt && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" strokeWidth={1.5} />
                                Actualizado {fechaNumerica(d.updatedAt, true)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Cambiar estado rápido */}
                          {/* Se abre con hover y también con clic/toque o teclado (solo hover no servía en táctil) */}
                          <div className="relative group"
                            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setStatusMenu(null); }}
                            onKeyDown={e => { if (e.key === 'Escape') setStatusMenu(null); }}>
                            <button type="button"
                              onClick={() => setStatusMenu(m => (m === d.id ? null : d.id))}
                              aria-label="Cambiar estado" aria-haspopup="menu" aria-expanded={statusMenu === d.id}
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-300"
                              style={{ background: 'rgba(255,255,255,0.04)' }}>
                              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                            <div className={`absolute right-0 top-10 z-20 w-44 rounded-2xl overflow-hidden shadow-2xl transition-opacity ${statusMenu === d.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'}`}
                              role="menu"
                              style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)' }}>
                              {(Object.keys(STATUS_META) as DocStatus[]).filter(s => s !== d.status).map(s => {
                                const m = STATUS_META[s];
                                const Ic = m.icon;
                                return (
                                  <button key={s} type="button" role="menuitem"
                                    onClick={() => handleStatusChange(d.id, s, d.title)}
                                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-xs font-light hover:bg-white/[0.05] transition-colors"
                                    style={{ color: m.color }}>
                                    <Ic className="w-3.5 h-3.5" strokeWidth={1.5} />
                                    {m.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <button onClick={() => openEdit(d)} aria-label={`Editar ${d.title}`}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-300"
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                          {puedeBorrar && (
                            <button onClick={() => handleDelete(d.id, d.title)} disabled={deleting === d.id} aria-label={`Eliminar ${d.title}`}
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-700 hover:text-red-400"
                              style={{ background: 'rgba(255,255,255,0.04)' }}>
                              {deleting === d.id
                                ? <div className="w-3.5 h-3.5 border border-red-700 border-t-transparent rounded-full animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════ TAB: ACTIVIDADES ════ */}
      {activeTab === 'actividades' && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {activities.length === 0 ? (
            <div className="py-16 text-center">
              <Activity className="w-10 h-10 text-zinc-800 mx-auto mb-4" strokeWidth={1} />
              <p className="text-zinc-500 text-sm font-light">{puedeVerActividad ? 'Sin actividad registrada' : 'El historial de actividad solo lo ven CEO y Administración'}</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-900/60">
              {activities.map(a => (
                <div key={a.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Activity className="w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-light">{a.description}</p>
                    <p className="text-zinc-600 text-xs font-light mt-1">
                      {a.userName} · {format(a.createdAt, 'dd MMM yyyy, HH:mm', { locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}