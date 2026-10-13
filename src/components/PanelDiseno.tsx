import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { uploadMediaFile, deleteMediaFile } from '@/lib/supabaseclient';
import { useAuth } from '@/contexts/AuthContext';
import { abrirExterno } from '@/lib/escritorio';
import type { MediaFile, MediaType } from '@/types';
import {
  Upload, Trash2, Search, Image, Film, FileText, File,
  Download, Tag, Grid3X3, List, X, Check, AlertCircle,
  Eye, type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { fechaNumerica } from '@/lib/ajustes/fecha';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMimeType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function msgError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Un <a download> sobre una URL de Supabase (otro origen) no descarga: el
// navegador la abre. Se baja como blob y se guarda con su nombre; si falla
// (CORS, red), se abre en el navegador del sistema.
async function descargarArchivo(url: string, nombre: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    // Se revoca después: algunos WebView aún no leyeron el blob al volver de click().
    setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
  } catch (e) {
    console.error('No se pudo descargar, se abre aparte:', e);
    await abrirExterno(url);
  }
}

const TYPE_ICON: Record<MediaType, LucideIcon> = {
  image: Image, video: Film, document: FileText, other: File,
};
const TYPE_COLOR: Record<MediaType, string> = {
  image: '#a78bfa', video: '#60a5fa', document: '#34d399', other: '#9ca3af',
};
const TYPE_LABEL: Record<MediaType, string> = {
  image: 'Imágenes', video: 'Videos', document: 'Documentos', other: 'Otros',
};

const ACCEPTED = 'image/*,video/*,.pdf,.doc,.docx,.txt,.svg,.figma';
const MAX_SIZE_MB = 50;

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | MediaType;
type Toast = { type: 'success' | 'error'; msg: string } | null;

// En Firestore cada archivo guarda también una descripción (el tipo compartido no la trae).
type DisenoFile = MediaFile & { description?: string };

export default function PanelDiseno() {
  const { currentUser, userProfile, isAdmin } = useAuth();
  // Las reglas de diseno_media solo dejan editar/borrar a CEO, Administración y Diseño
  // (isAdmin ya incluye al CEO). Subir lo puede cualquiera que entre al panel.
  const puedeGestionar = isAdmin || userProfile?.role === 'Diseño';
  const [files,       setFiles]       = useState<DisenoFile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [viewMode,    setViewMode]    = useState<ViewMode>('grid');
  const [filterType,  setFilterType]  = useState<FilterType>('all');
  const [search,      setSearch]      = useState('');
  const [toast,       setToast]       = useState<Toast>(null);
  const [preview,     setPreview]     = useState<DisenoFile | null>(null);
  const [editing,     setEditing]     = useState<DisenoFile | null>(null);
  const [editTags,    setEditTags]    = useState('');
  const [editDesc,    setEditDesc]    = useState('');
  const [savingEdit,  setSavingEdit]  = useState(false);
  const fileRef  = useRef<HTMLInputElement>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cargar archivos desde Firestore ─────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'diseno_media'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
        } as DisenoFile;
      });
      setFiles(docs);
      setLoadError(null);
      setLoading(false);
    }, err => {
      // Sin esto, un error de permisos se veía como una galería vacía.
      console.error('Error cargando archivos:', err);
      setLoadError(err.code === 'permission-denied'
        ? 'No tienes permiso para ver los archivos de diseño.'
        : 'No se pudieron cargar los archivos. Revisa tu conexión e inténtalo de nuevo.');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Un solo temporizador: si no, el de un toast anterior cierra antes de tiempo el nuevo.
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastRef.current) clearTimeout(toastRef.current); }, []);

  // ── Subir archivo ────────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Se limpia ya, para que elegir de nuevo el mismo archivo vuelva a disparar onChange.
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !currentUser || !userProfile) return;

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      showToast('error', `El archivo supera el límite de ${MAX_SIZE_MB}MB`);
      return;
    }

    // El cliente de Supabase no informa el avance de la subida: se muestra un
    // estado "Subiendo…" sin porcentaje en vez de uno inventado.
    setUploading(true);
    let subido: { path: string } | null = null;
    try {
      const result = await uploadMediaFile(file, currentUser.uid);
      subido = result;

      await addDoc(collection(db, 'diseno_media'), {
        name:         file.name,
        originalName: file.name,
        url:          result.url,
        path:         result.path,
        type:         getMimeType(file.type),
        mimeType:     file.type,
        size:         file.size,
        uploadedBy:   currentUser.uid,   // la regla de create exige uploadedBy == uid
        uploaderName: userProfile.displayName ?? '',
        tags:         [],
        description:  '',
        createdAt:    serverTimestamp(),
      });

      showToast('success', `"${file.name}" subido correctamente`);
    } catch (err) {
      // Si falló el registro en Firestore, el archivo ya subido quedaría huérfano en el bucket.
      if (subido) {
        await deleteMediaFile(subido.path).catch(e2 => console.error('No se pudo limpiar el archivo subido:', e2));
      }
      showToast('error', `Error al subir: ${msgError(err)}`);
    } finally {
      setUploading(false);
    }
  };

  // ── Eliminar archivo ─────────────────────────────────────────────────────
  // Primero el registro y después el archivo: si el borrado en Firestore falla,
  // el registro sigue apuntando a un archivo que existe.
  const handleDelete = async (file: DisenoFile) => {
    if (!window.confirm(`¿Eliminar "${file.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(file.id);
    try {
      await deleteDoc(doc(db, 'diseno_media', file.id));
      if (preview?.id === file.id) setPreview(null);
      try {
        await deleteMediaFile(file.path);
        showToast('success', 'Archivo eliminado');
      } catch (err) {
        console.error('Registro borrado pero el archivo quedó en el almacenamiento:', err);
        showToast('error', 'Se quitó de la galería, pero no se pudo borrar el archivo del almacenamiento');
      }
    } catch (err) {
      showToast('error', `Error al eliminar: ${msgError(err)}`);
    } finally {
      setDeleting(null);
    }
  };

  // ── Editar etiquetas y descripción ───────────────────────────────────────
  const openEdit = (file: DisenoFile) => {
    setEditing(file);
    setEditTags(file.tags?.join(', ') ?? '');
    setEditDesc(file.description ?? '');
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const tags = [...new Set(editTags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))];
    const description = editDesc.trim();
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, 'diseno_media', editing.id), { tags, description });
      // El modal de vista previa guarda una copia: se refresca para que muestre lo nuevo.
      setPreview(p => (p && p.id === editing.id ? { ...p, tags, description } : p));
      setEditing(null);
      showToast('success', 'Cambios guardados');
    } catch (err) {
      showToast('error', `Error guardando cambios: ${msgError(err)}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Filtrado ─────────────────────────────────────────────────────────────
  const filtered = files.filter(f => {
    const matchType = filterType === 'all' || f.type === filterType;
    const matchSearch = !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.uploaderName?.toLowerCase().includes(search.toLowerCase()) ||
      f.tags?.some(t => t.toLowerCase().includes(search.toLowerCase())) ||
      f.description?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
  const countByType = (['image', 'video', 'document', 'other'] as MediaType[]).reduce((acc, t) => {
    acc[t] = files.filter(f => f.type === t).length;
    return acc;
  }, {} as Record<MediaType, number>);

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-light shadow-2xl"
          style={{
            background: toast.type === 'success' ? 'rgba(20,30,20,0.97)' : 'rgba(30,15,15,0.97)',
            borderColor: toast.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
            color: toast.type === 'success' ? '#34d399' : '#f87171',
          }}>
          {toast.type === 'success'
            ? <Check className="w-4 h-4" strokeWidth={1.5} />
            : <AlertCircle className="w-4 h-4" strokeWidth={1.5} />}
          {toast.msg}
        </div>
      )}

      {/* ── Preview Modal ── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)' }}
          onClick={() => setPreview(null)}>
          <div className="relative max-w-4xl w-full rounded-3xl overflow-hidden"
            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}>
            {/* Close */}
            <button onClick={() => setPreview(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl bg-black/80 flex items-center justify-center text-zinc-400 hover:text-white">
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
            {/* Content */}
            {preview.type === 'image' && (
              <img src={preview.url} alt={preview.name} className="w-full max-h-[70vh] object-contain" />
            )}
            {preview.type === 'video' && (
              <video src={preview.url} controls className="w-full max-h-[70vh]" />
            )}
            {(preview.type === 'document' || preview.type === 'other') && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-zinc-700 mx-auto mb-4" strokeWidth={1} />
                  <p className="text-white text-sm font-light mb-2">{preview.name}</p>
                  <a href={preview.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-light">
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    Abrir archivo
                  </a>
                </div>
              </div>
            )}
            {/* Info */}
            <div className="px-6 py-4 border-t border-zinc-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-white text-sm font-light mb-1">{preview.name}</p>
                  <p className="text-zinc-500 text-xs font-light">
                    {formatBytes(preview.size)} · Subido por {preview.uploaderName} ·{' '}
                    {format(preview.createdAt, 'dd MMM yyyy, HH:mm', { locale: es })}
                  </p>
                  {preview.description && (
                    <p className="text-zinc-400 text-xs font-light mt-2 whitespace-pre-wrap">{preview.description}</p>
                  )}
                  {(preview.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(preview.tags ?? []).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-lg text-xs font-light text-zinc-400"
                          style={{ background: 'rgba(255,255,255,0.06)' }}>#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {puedeGestionar && (
                    <button onClick={() => openEdit(preview)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-light text-zinc-400 hover:text-white transition-colors"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <Tag className="w-4 h-4" strokeWidth={1.5} />
                      Editar
                    </button>
                  )}
                  <button onClick={() => void descargarArchivo(preview.url, preview.name)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-light text-zinc-400 hover:text-white transition-colors"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    Descargar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Editar etiquetas y descripción ── */}
      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}
          onClick={() => { if (!savingEdit) setEditing(null); }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-zinc-900">
              <h2 className="text-white text-base font-light truncate">Editar «{editing.name}»</h2>
              <button onClick={() => setEditing(null)} disabled={savingEdit}
                className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white flex-shrink-0">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="diseno-edit-tags" className="block text-zinc-500 text-xs font-light mb-2 uppercase tracking-wider">Etiquetas</label>
                <input
                  id="diseno-edit-tags"
                  autoFocus
                  value={editTags}
                  onChange={e => setEditTags(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }}
                  placeholder="logo, campaña, redes (separadas por coma)"
                  className="w-full px-4 py-3 rounded-2xl text-white text-sm font-light placeholder-zinc-600 outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
              <div>
                <label htmlFor="diseno-edit-desc" className="block text-zinc-500 text-xs font-light mb-2 uppercase tracking-wider">Descripción</label>
                <textarea
                  id="diseno-edit-desc"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }}
                  rows={4}
                  placeholder="Para qué es, versión, notas para el equipo…"
                  className="w-full px-4 py-3 rounded-2xl text-white text-sm font-light placeholder-zinc-600 outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-5 border-t border-zinc-900">
              <button onClick={() => setEditing(null)} disabled={savingEdit}
                className="flex-1 py-3 rounded-2xl text-sm font-light text-zinc-500 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                Cancelar
              </button>
              <button onClick={handleSaveEdit} disabled={savingEdit}
                className="flex-1 py-3 rounded-2xl text-sm font-light transition-all"
                style={{ background: savingEdit ? '#222' : '#fff', color: savingEdit ? '#555' : '#000', cursor: savingEdit ? 'not-allowed' : 'pointer' }}>
                {savingEdit ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-xl font-light tracking-wide mb-1">Panel de Diseño</h1>
          <p className="text-zinc-500 text-sm font-light">
            {files.length} archivos · {formatBytes(totalSize)} utilizados
          </p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-light transition-all"
            style={{
              background: uploading ? 'rgba(255,255,255,0.04)' : '#fff',
              color: uploading ? '#555' : '#000',
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}>
            <Upload className="w-4 h-4" strokeWidth={1.5} />
            {uploading ? 'Subiendo…' : 'Subir archivo'}
          </button>
        </div>
      </div>

      {/* Barra de subida: indeterminada, no hay avance real que mostrar */}
      {uploading && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          role="status" aria-live="polite">
          <div className="h-1.5 bg-zinc-900">
            <div className="h-full w-full bg-white/70 rounded-full animate-pulse" />
          </div>
          <p className="text-zinc-500 text-xs font-light px-4 py-2">Subiendo archivo al servidor...</p>
        </div>
      )}

      {/* ── Stats por tipo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['image', 'video', 'document', 'other'] as MediaType[]).map(type => {
          const Icon  = TYPE_ICON[type];
          const color = TYPE_COLOR[type];
          return (
            <button key={type}
              onClick={() => setFilterType(filterType === type ? 'all' : type)}
              className="rounded-2xl p-4 text-left transition-all"
              style={{
                background: filterType === type ? `${color}12` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filterType === type ? color + '40' : 'rgba(255,255,255,0.06)'}`,
              }}>
              <Icon className="w-5 h-5 mb-2" style={{ color }} strokeWidth={1.5} />
              <p className="text-white text-lg font-light">{countByType[type]}</p>
              <p className="text-xs font-light mt-0.5" style={{ color }}>{TYPE_LABEL[type]}</p>
            </button>
          );
        })}
      </div>

      {/* ── Controles ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Buscar por nombre, subidor o etiqueta..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm font-light text-white placeholder-zinc-600 outline-none"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setViewMode('grid')}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: viewMode === 'grid' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'grid' ? '#fff' : '#555' }}>
            <Grid3X3 className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button onClick={() => setViewMode('list')}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: viewMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'list' ? '#fff' : '#555' }}>
            <List className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Galería ── */}
      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <div className="py-20 text-center rounded-3xl" style={{ border: '1px dashed rgba(248,113,113,0.25)' }}>
          <AlertCircle className="w-10 h-10 text-red-400/60 mx-auto mb-4" strokeWidth={1} />
          <p className="text-zinc-400 text-sm font-light">{loadError}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center rounded-3xl" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Image className="w-10 h-10 text-zinc-800 mx-auto mb-4" strokeWidth={1} />
          <p className="text-zinc-500 text-sm font-light mb-1">Sin archivos</p>
          <p className="text-zinc-700 text-xs font-light">Sube imágenes, videos o documentos para empezar</p>
        </div>
      ) : viewMode === 'grid' ? (
        // ── GRID VIEW ──
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(file => {
            const Icon  = TYPE_ICON[file.type];
            const color = TYPE_COLOR[file.type];
            const isDeleting = deleting === file.id;
            return (
              <div key={file.id} className="group relative rounded-2xl overflow-hidden transition-all"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {/* Thumbnail */}
                <div className="aspect-square flex items-center justify-center cursor-pointer"
                  onClick={() => setPreview(file)}>
                  {file.type === 'image' ? (
                    <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : file.type === 'video' ? (
                    <div className="relative w-full h-full">
                      <video src={file.url} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Film className="w-8 h-8 text-white/60" strokeWidth={1.5} />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                      style={{ background: `${color}10` }}>
                      <Icon className="w-12 h-12" style={{ color }} strokeWidth={1} />
                    </div>
                  )}
                </div>

                {/* Overlay de acciones: solo en equipos con hover (mouse). Aparece
                    también con el foco del teclado; invisible no captura clics, para
                    que un toque no dispare un botón que no se ve. */}
                <div className="absolute inset-0 bg-black/70 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity hidden [@media(hover:hover)]:flex items-center justify-center gap-2">
                  <button onClick={() => setPreview(file)} title="Ver" aria-label={`Ver ${file.name}`}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
                    <Eye className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                  <button onClick={() => void descargarArchivo(file.url, file.name)} title="Descargar" aria-label={`Descargar ${file.name}`}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                  {puedeGestionar && (
                    <>
                      <button onClick={() => openEdit(file)} title="Etiquetas y descripción" aria-label={`Editar ${file.name}`}
                        className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
                        <Tag className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <button onClick={() => handleDelete(file)} disabled={isDeleting} title="Eliminar" aria-label={`Eliminar ${file.name}`}
                        className="w-9 h-9 rounded-xl bg-red-900/40 hover:bg-red-900/70 flex items-center justify-center text-red-400 transition-all">
                        {isDeleting
                          ? <div className="w-4 h-4 border border-red-600 border-t-transparent rounded-full animate-spin" />
                          : <Trash2 className="w-4 h-4" strokeWidth={1.5} />}
                      </button>
                    </>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-white text-xs font-light truncate mb-1">{file.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-light" style={{ color }}>{formatBytes(file.size)}</span>
                    <span className="text-zinc-700 text-[10px] font-light">
                      {fechaNumerica(file.createdAt, true)}
                    </span>
                  </div>
                  {/* En pantallas táctiles (sin hover) las acciones quedan siempre a la vista */}
                  <div className="flex [@media(hover:hover)]:hidden items-center gap-1.5 mt-2">
                    <button onClick={() => void descargarArchivo(file.url, file.name)} aria-label={`Descargar ${file.name}`}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400"
                      style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    {puedeGestionar && (
                      <>
                        <button onClick={() => openEdit(file)} aria-label={`Editar ${file.name}`}
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400"
                          style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <Tag className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                        <button onClick={() => handleDelete(file)} disabled={isDeleting} aria-label={`Eliminar ${file.name}`}
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-red-400 ml-auto"
                          style={{ background: 'rgba(255,255,255,0.05)' }}>
                          {isDeleting
                            ? <div className="w-3.5 h-3.5 border border-red-600 border-t-transparent rounded-full animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── LIST VIEW ──
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="divide-y divide-zinc-900/60">
            {filtered.map(file => {
              const Icon  = TYPE_ICON[file.type];
              const color = TYPE_COLOR[file.type];
              const isDeleting = deleting === file.id;
              return (
                <div key={file.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.015] transition-colors">
                  {/* Icon/thumb */}
                  <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}12` }}>
                    {file.type === 'image' ? (
                      <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.5} />
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-light truncate">{file.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-zinc-600 text-xs font-light">{formatBytes(file.size)}</span>
                      <span className="text-zinc-700 text-xs font-light">·</span>
                      <span className="text-zinc-600 text-xs font-light">{file.uploaderName}</span>
                      <span className="text-zinc-700 text-xs font-light">·</span>
                      <span className="text-zinc-700 text-xs font-light">
                        {format(file.createdAt, 'dd MMM yyyy', { locale: es })}
                      </span>
                    </div>
                    {file.description && (
                      <p className="text-zinc-500 text-xs font-light truncate mt-1">{file.description}</p>
                    )}
                    {/* Tags */}
                    {(file.tags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {(file.tags ?? []).map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded-lg text-[10px] font-light text-zinc-500"
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {puedeGestionar && (
                      <button onClick={() => openEdit(file)} title="Etiquetas y descripción" aria-label={`Editar ${file.name}`}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <Tag className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    )}
                    <button onClick={() => setPreview(file)} title="Ver" aria-label={`Ver ${file.name}`}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button onClick={() => void descargarArchivo(file.url, file.name)} title="Descargar" aria-label={`Descargar ${file.name}`}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    {puedeGestionar && (
                      <button onClick={() => handleDelete(file)} disabled={isDeleting} title="Eliminar" aria-label={`Eliminar ${file.name}`}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-700 hover:text-red-400 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {isDeleting
                          ? <div className="w-3.5 h-3.5 border border-red-700 border-t-transparent rounded-full animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer info */}
      <p className="text-center text-zinc-700 text-xs font-light">
        Archivos aceptados: imágenes, videos, PDF, documentos · Máximo {MAX_SIZE_MB}MB por archivo
      </p>
    </div>
  );
}