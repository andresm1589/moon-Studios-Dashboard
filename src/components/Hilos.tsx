import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import '@/styles/enterprise-sections.css';
import { useAuth } from '@/contexts/AuthContext';
import { db, subscribeToUsers } from '@/lib/firebase';
import { supabase } from '@/lib/supabaseclient';
import {
  collection, addDoc, updateDoc, doc,
  onSnapshot, query, orderBy, where, Timestamp,
  increment, getDoc, writeBatch, limit,
  getDocs, deleteField, setDoc, deleteDoc,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { urlPublica, abrirExterno } from '@/lib/escritorio';
import { claveMiRespuesta } from '@/hooks/useNotifications';
import { motion, AnimatePresence, useScroll, useSpring } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  GitBranch, Plus, Search, Paperclip, X, Send,
  File, Download, Eye, Trash2, Pin,
  Lock, Unlock, MessageSquare, RefreshCw,
  Hash, Smile, ArrowLeft, MoreHorizontal,
  AlertCircle, BookOpen, Palette, Code, Megaphone,
  Bell, BellOff, Share2, Edit3, Check, Copy,
  Filter, ExternalLink, Archive, Sparkles,
  ChevronDown, QrCode, ArchiveRestore, FileText,
  Image as ImageIcon, Menu
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { useSettings } from '@/contexts/SettingsContext';

/* ═══════════════════════════════
   TIPOS
═══════════════════════════════ */
interface Attachment {
  id: string; url: string; name: string; type: string;
  size: number; thumbnailUrl?: string;
}
interface Reply {
  id: string; hiloId: string; authorUid: string; authorName: string;
  authorAvatar?: string; authorRole: string; body: string;
  attachments: Attachment[]; reactions: Record<string, string[]>;
  createdAt: any; edited?: boolean; editedAt?: any;
  parentId?: string | null; mentions?: string[];
}
interface Hilo {
  id: string; title: string; body: string; authorUid: string;
  authorName: string; authorAvatar?: string; authorRole: string;
  category: string; tags: string[]; attachments: Attachment[];
  createdAt: any; updatedAt: any; pinned: boolean; locked: boolean;
  deleted: boolean; archived: boolean; replyCount: number;
  viewCount: number; reactions: Record<string, string[]>;
  subscribers: string[]; lastReplyAt?: any; isAnnouncement?: boolean;
  edited?: boolean; editedAt?: any;
}
interface UserPresence {
  uid: string; displayName: string; avatar?: string;
  lastSeen: Timestamp | null; isOnline: boolean;
}
/** Lo mínimo de cada usuario para el autocompletado de @menciones. */
interface UsuarioMencion { uid: string; displayName: string; avatar?: string; }

/* ═══════════════════════════════
   CONSTANTES
═══════════════════════════════ */
const HILOS_BUCKET = 'hilos';
const REPLIES_PER_PAGE = 20;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const CATEGORIES = [
  { id: 'general',    label: 'General',    icon: Hash,        color: 'moon-panel-muted',   bg: 'bg-zinc-400/10' },
  { id: 'anuncios',   label: 'Anuncios',   icon: Megaphone,   color: 'moon-panel-tone-amber', bg: 'bg-yellow-500/10' },
  { id: 'diseno',     label: 'Diseño',     icon: Palette,     color: 'moon-panel-tone-pink',   bg: 'bg-pink-500/10' },
  { id: 'desarrollo', label: 'Desarrollo', icon: Code,        color: 'moon-panel-tone-blue',   bg: 'bg-blue-400/10' },
  { id: 'recursos',   label: 'Recursos',   icon: BookOpen,    color: 'moon-panel-tone-green',  bg: 'bg-green-400/10' },
  { id: 'importante', label: 'Importante', icon: AlertCircle, color: 'moon-panel-tone-red',    bg: 'bg-red-400/10' },
];

const REACTIONS = ['👍','❤️','😂','😮','🎉','👏','🔥','💡','❓','✅'];

// Presencia: latido mientras el hilo está abierto y ventana para darlo por
// conectado (un latido perdido no lo saca de la lista).
const PRESENCE_HEARTBEAT_MS = 30_000;
const PRESENCE_ONLINE_MS    = 75_000;
const PRESENCE_TICK_MS      = 15_000;
const MAX_MENTION_SUGGESTIONS = 6;

/* ═══════════════════════════════
   HELPERS
═══════════════════════════════ */
const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024; const sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
const formatRelative = (ts: any) => {
  if (!ts) return '';
  try { const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return formatDistanceToNow(d, { addSuffix: true, locale: es }); }
  catch { return ''; }
};
const formatFull = (ts: any) => {
  if (!ts) return '';
  try { const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return format(d, "d 'de' MMM 'a las' HH:mm", { locale: es }); }
  catch { return ''; }
};
// Texto legible para un error de Firestore. El de índice faltante trae en su
// mensaje el enlace para crearlo, así que se muestra completo.
const mensajeErrorFirestore = (e: unknown): string => {
  const code = (e as { code?: string })?.code;
  const msg = (e as { message?: string })?.message || String(e);
  if (code === 'failed-precondition') return `Falta un índice de Firestore para esta consulta. ${msg}`;
  if (code === 'permission-denied') return 'No tienes permiso para ver esto.';
  if (code === 'unavailable') return 'Sin conexión con el servidor. Revisa tu internet.';
  return msg;
};
const getCategoryInfo = (id: string) => CATEGORIES.find(c => c.id === id) ?? CATEGORIES[0];
const generateId = () => Math.random().toString(36).substr(2, 9);
const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf') return FileText;
  return File;
};
// Vista previa directa del archivo. Antes los documentos pasaban por el visor
// de Google Docs, que recibía la URL pública del adjunto.
type TipoVista = 'imagen' | 'pdf' | 'texto' | 'ninguna';
const tipoVista = (att: Attachment): TipoVista => {
  if (att.type.startsWith('image/')) return 'imagen';
  if (att.type === 'application/pdf' || /\.pdf$/i.test(att.name)) return 'pdf';
  if (att.type === 'text/plain' || /\.txt$/i.test(att.name)) return 'texto';
  return 'ninguna';
};

// Minúsculas y sin tildes: "@jose" encuentra a "José".
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "@" + lo escrito hasta el cursor (letras con tilde, números, _ . -).
const MENCION_EN_CURSOR = /(^|\s)@([\p{L}\p{N}_.-]*)$/u;

/**
 * uids mencionados en el texto: busca "@Nombre completo" de cada usuario.
 * Los nombres largos van primero y se tachan al encontrarse, para que
 * "@Ana María" no cuente también como "@Ana".
 */
const extraerMenciones = (texto: string, usuarios: UsuarioMencion[]): string[] => {
  let resto = normalizar(texto);
  const encontrados: string[] = [];
  const porLargo = [...usuarios]
    .filter(u => u.displayName?.trim())
    .sort((a, b) => b.displayName.length - a.displayName.length);
  for (const u of porLargo) {
    const nombre = '@' + normalizar(u.displayName.trim());
    let i = resto.indexOf(nombre);
    let hallado = false;
    while (i !== -1) {
      const sig = resto.charAt(i + nombre.length);
      // Que el nombre termine ahí (no "@Ana" dentro de "@Anabel").
      if (!sig || !/[\p{L}\p{N}_]/u.test(sig)) {
        hallado = true;
        resto = resto.slice(0, i) + ' '.repeat(nombre.length) + resto.slice(i + nombre.length);
      }
      i = resto.indexOf(nombre, i + 1);
    }
    if (hallado) encontrados.push(u.uid);
  }
  return encontrados;
};

/* ═══════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════ */
const HilosComponent: React.FC = () => {
  // isAdmin del contexto = CEO o Administración (el rol 'Moderador' que había
  // en la lista local no existe).
  const { currentUser, userProfile, isAdmin } = useAuth();
  const uid = currentUser?.uid || '';

  /* ─── State principal ─── */
  const [hilos, setHilos] = useState<Hilo[]>([]);
  const [archivedHilos, setArchivedHilos] = useState<Hilo[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [_loadingArchived, setLoadingArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedHilo, setSelectedHilo] = useState<Hilo | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated'|'created'|'popular'>('updated');
  const [filterStatus, setFilterStatus] = useState<'all'|'open'|'closed'>('all');
  const [interestFilter, setInterestFilter] = useState<'all' | 'mine' | 'subscribed'>('all');

  /* ─── Mobile UI ─── */
  const [showSidebar, setShowSidebar] = useState(false);

  /* ─── Compose state ─── */
  const [showNewHilo, setShowNewHilo] = useState(false);
  const [editingHilo, setEditingHilo] = useState<Hilo | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newTags, setNewTags] = useState('');
  const [newAttachments, setNewAttachments] = useState<Attachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isAnnouncement, setIsAnnouncement] = useState(false);

  /* ─── Reply state ─── */
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [uploadingReply, setUploadingReply] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [editingReply, setEditingReply] = useState<Reply | null>(null);

  /* ─── UI State ─── */
  const [viewerFile, setViewerFile] = useState<Attachment | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const [presencia, setPresencia] = useState<{ hiloId?: string; docs: UserPresence[] }>({ docs: [] });
  const [ahoraPresencia, setAhoraPresencia] = useState(() => Date.now());
  const [usuarios, setUsuarios] = useState<UsuarioMencion[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  // Dónde empieza el "@" que se está completando y dónde está el cursor.
  const [mentionStart, setMentionStart] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);

  /* ─── Errores de carga (antes solo iban a la consola) ─── */
  const [errorHilos, setErrorHilos] = useState<string | null>(null);
  const [errorArchivados, setErrorArchivados] = useState<string | null>(null);
  const [errorReplies, setErrorReplies] = useState<{ hiloId: string; msg: string } | null>(null);

  /* ─── Refs ─── */
  const fileNewRef = useRef<HTMLInputElement>(null);
  const fileReplyRef = useRef<HTMLInputElement>(null);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const replyTextRef = useRef<HTMLTextAreaElement>(null);
  const newBodyEmojiRef = useRef<HTMLTextAreaElement>(null);
  const newTitleEmojiRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ─── Scroll progress ─── */
  const { scrollYProgress } = useScroll({ container: containerRef });
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  /* ═══════════════════════════════
     FIRESTORE — hilos realtime
  ═══════════════════════════════ */
  useEffect(() => {
    let q = query(
      collection(db, 'hilos'),
      where('deleted', '==', false),
      where('archived', '==', false),
      orderBy('pinned', 'desc')
    );
    if (sortBy === 'updated') q = query(q, orderBy('updatedAt', 'desc'));
    else if (sortBy === 'created') q = query(q, orderBy('createdAt', 'desc'));
    else if (sortBy === 'popular') q = query(q, orderBy('viewCount', 'desc'));

    const unsub = onSnapshot(q, snap => {
      setHilos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Hilo)));
      setErrorHilos(null);
      setLoading(false);
    }, error => {
      // Antes el fallo (p. ej. índice compuesto sin crear) dejaba la lista
      // vacía como si no hubiera hilos.
      console.error('Error hilos:', error);
      setErrorHilos(mensajeErrorFirestore(error));
      setLoading(false);
    });
    return () => unsub();
  }, [sortBy]);

  /* ─── Usuarios para el autocompletado de menciones ─── */
  useEffect(() => subscribeToUsers(
    lista => setUsuarios(lista
      .map(u => ({ uid: String(u.uid), displayName: String(u.displayName ?? ''), avatar: u.avatar ? String(u.avatar) : undefined }))
      .filter(u => u.displayName.trim())),
    e => console.error('Error usuarios (menciones):', e),
  ), []);

  /* ─── FIX: Sync selectedHilo desde hilos activos O archivados ─── */
  useEffect(() => {
    if (!selectedHilo) return;
    const fromActive = hilos.find(h => h.id === selectedHilo.id);
    if (fromActive) { setSelectedHilo(fromActive); return; }
    const fromArchived = archivedHilos.find(h => h.id === selectedHilo.id);
    if (fromArchived) setSelectedHilo(fromArchived);
  }, [hilos, archivedHilos, selectedHilo?.id]);

  /* ═══════════════════════════════
     FIRESTORE — hilos archivados (on demand)
     FIX: query separada para admin y no-admin con índices correctos
  ═══════════════════════════════ */
  useEffect(() => {
    if (!showArchived) return;
    setLoadingArchived(true);

    const q = isAdmin
      ? query(
          collection(db, 'hilos'),
          where('deleted', '==', false),
          where('archived', '==', true),
          orderBy('updatedAt', 'desc')
        )
      : query(
          collection(db, 'hilos'),
          where('deleted', '==', false),
          where('archived', '==', true),
          where('authorUid', '==', uid),
          orderBy('updatedAt', 'desc')
        );

    const unsub = onSnapshot(q, snap => {
      setArchivedHilos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Hilo)));
      setErrorArchivados(null);
      setLoadingArchived(false);
    }, error => {
      console.error('Error archived:', error);
      setErrorArchivados(mensajeErrorFirestore(error));
      setLoadingArchived(false);
    });
    return () => unsub();
  }, [showArchived, isAdmin, uid]);

  /* ═══════════════════════════════
     FIRESTORE — replies paginados
  ═══════════════════════════════ */
  // En vivo: antes se leían una sola vez, así que la respuesta que acababas de
  // publicar (y las de los demás) no aparecía hasta volver a abrir el hilo.
  // "Cargar más" amplía el límite de la misma escucha.
  // Las páginas van ligadas al hilo abierto: al cambiar de hilo se vuelve a 1.
  const [paginas, setPaginas] = useState<{ hiloId?: string; n: number }>({ n: 1 });
  const paginasReplies = paginas.hiloId === selectedHilo?.id ? paginas.n : 1;
  const loadReplies = useCallback((hiloId: string, loadMore = false) => {
    if (!loadMore) return;
    setLoadingMore(true);
    setPaginas(p => ({ hiloId, n: (p.hiloId === hiloId ? p.n : 1) + 1 }));
  }, []);

  useEffect(() => {
    if (!selectedHilo) { setReplies([]); return; }
    setLoadingReplies(true);
    const tope = REPLIES_PER_PAGE * paginasReplies;
    const q = query(
      collection(db, 'hilos', selectedHilo.id, 'replies'),
      orderBy('createdAt', 'asc'),
      limit(tope)
    );
    const hiloId = selectedHilo.id;
    return onSnapshot(q, snap => {
      setReplies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reply)));
      setHasMoreReplies(snap.docs.length >= tope);
      setErrorReplies(null);
      setLoadingReplies(false); setLoadingMore(false);
    }, error => {
      console.error('Error loading replies:', error);
      setErrorReplies({ hiloId, msg: mensajeErrorFirestore(error) });
      setLoadingReplies(false); setLoadingMore(false);
    });
  }, [selectedHilo?.id, paginasReplies]);

  /* ─── viewCount ─── */
  useEffect(() => {
    if (!selectedHilo) return;
    const viewedKey = `viewed_${selectedHilo.id}`;
    if (!sessionStorage.getItem(viewedKey)) {
      updateDoc(doc(db, 'hilos', selectedHilo.id), { viewCount: increment(1) }).catch(() => {});
      sessionStorage.setItem(viewedKey, 'true');
    }
  }, [selectedHilo?.id]);

  /* ═══════════════════════════════
     PRESENCIA
  ═══════════════════════════════ */
  // Antes lastSeen se escribía una sola vez, el corte de "5 min" quedaba fijo
  // en la hora de suscripción y nadie se borraba al salir: la lista crecía con
  // gente que ya no estaba. Ahora: latido cada 30 s mientras el hilo está
  // abierto, "conectado" se recalcula contra la hora actual y al salir se
  // borra el documento propio (las reglas permiten escribir solo el tuyo).
  const hiloAbiertoId = selectedHilo?.id;
  const miNombre = userProfile?.displayName || '';
  const miAvatar = userProfile?.avatar || '';
  // Configuración → Privacidad → «Mostrar cuando estoy en línea»: apagado, no se publica la presencia.
  const { settings } = useSettings();
  const mostrarEnLinea = settings.showOnline !== false;

  useEffect(() => {
    if (!hiloAbiertoId) return;
    const presenceRef = collection(db, 'hilos', hiloAbiertoId, 'presence');
    return onSnapshot(presenceRef, snap => {
      setPresencia({ hiloId: hiloAbiertoId, docs: snap.docs.map(d => ({ ...(d.data() as UserPresence), uid: d.id })) });
    }, error => console.error('Error presencia:', error));
  }, [hiloAbiertoId]);

  useEffect(() => {
    if (!hiloAbiertoId || !uid) return;
    const miRef = doc(db, 'hilos', hiloAbiertoId, 'presence', uid);
    if (!mostrarEnLinea) { deleteDoc(miRef).catch(() => {}); return; }
    const latido = () => setDoc(miRef, {
      uid, displayName: miNombre, avatar: miAvatar,
      lastSeen: Timestamp.now(), isOnline: true,
    }, { merge: true }).catch(console.error);
    void latido();
    const t = setInterval(latido, PRESENCE_HEARTBEAT_MS);
    // Al volver a la pestaña se avisa enseguida (el intervalo se ralentiza en segundo plano).
    const alVolver = () => { if (document.visibilityState === 'visible') void latido(); };
    document.addEventListener('visibilitychange', alVolver);
    const salir = () => { deleteDoc(miRef).catch(() => {}); };
    window.addEventListener('pagehide', salir);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('pagehide', salir);
      salir();
    };
  }, [hiloAbiertoId, uid, miNombre, miAvatar, mostrarEnLinea]);

  // Reloj para que quien deja de latir salga de la lista sin recargar.
  useEffect(() => {
    if (!hiloAbiertoId) return;
    const tick = () => setAhoraPresencia(Date.now());
    // Primer tick enseguida: la hora guardada puede ser de hace mucho.
    const t0 = setTimeout(tick, 0);
    const t = setInterval(tick, PRESENCE_TICK_MS);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [hiloAbiertoId]);

  const onlineUsers = useMemo(() => {
    if (!hiloAbiertoId || presencia.hiloId !== hiloAbiertoId) return [];
    return presencia.docs.filter(p => {
      const visto = p.lastSeen?.toMillis?.() ?? 0;
      return p.isOnline !== false && ahoraPresencia - visto < PRESENCE_ONLINE_MS;
    });
  }, [presencia, hiloAbiertoId, ahoraPresencia]);

  /* ═══════════════════════════════
     COMPRESIÓN / THUMBNAIL
  ═══════════════════════════════ */
  const compressImage = useCallback(async (file: File, maxKB = 800): Promise<File | Blob> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < maxKB * 1024) { resolve(file); return; }
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const maxDim = 1920;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (h / w) * maxDim; w = maxDim; }
          else { w = (w / h) * maxDim; h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) { resolve(file); return; }
          resolve(blob.size < file.size ? blob : file);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }, []);

  // La miniatura se sube al bucket como archivo aparte. Antes se guardaba como
  // data URL base64 dentro del documento de Firestore, inflándolo (límite 1 MB
  // por documento y cada lectura del hilo la descargaba entera).
  const generateThumbnail = useCallback(async (file: File): Promise<Blob | undefined> => {
    if (!file.type.startsWith('image/')) return undefined;
    return new Promise((resolve) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300; canvas.height = 300;
        const ctx = canvas.getContext('2d');
        const size = Math.min(img.width, img.height);
        const x = (img.width - size) / 2, y = (img.height - size) / 2;
        ctx?.drawImage(img, x, y, size, size, 0, 0, 300, 300);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(blob => resolve(blob ?? undefined), 'image/jpeg', 0.6);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(undefined); };
      img.src = objectUrl;
    });
  }, []);

  /* ═══════════════════════════════
     UPLOAD
  ═══════════════════════════════ */
  const uploadFiles = useCallback(async (
    files: FileList,
    setAtts: React.Dispatch<React.SetStateAction<Attachment[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const oversized = Array.from(files).filter(f => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      alert(`Archivos que superan ${MAX_FILE_SIZE_MB}MB:\n${oversized.map(f => f.name).join('\n')}`);
      return;
    }
    setUploading(true);
    const result: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        const compressed = await compressImage(file);
        const compressedSize = (compressed as Blob).size;
        if (compressedSize === 0) continue;
        const attachmentId = generateId();
        const fileType = compressed.type || file.type || 'application/octet-stream';
        const path = `${uid}/${Date.now()}_${attachmentId}_${file.name}`;
        const { error, data } = await supabase.storage
          .from(HILOS_BUCKET).upload(path, compressed, { upsert: true, cacheControl: '3600', contentType: fileType });
        if (error) { alert(`Error al subir "${file.name}": ${error.message}`); continue; }
        if (data) {
          const { data: { publicUrl } } = supabase.storage.from(HILOS_BUCKET).getPublicUrl(path);
          const attachment: Attachment = { id: attachmentId, url: publicUrl, name: file.name, type: fileType, size: compressedSize };
          const thumbBlob = file.type.startsWith('image/') ? await generateThumbnail(file) : undefined;
          if (thumbBlob) {
            const thumbPath = `${uid}/thumbs/${Date.now()}_${attachmentId}.jpg`;
            const { error: thumbErr } = await supabase.storage
              .from(HILOS_BUCKET).upload(thumbPath, thumbBlob, { upsert: true, cacheControl: '3600', contentType: 'image/jpeg' });
            // Si la miniatura falla, la grilla usa la imagen completa: no se bloquea el adjunto.
            if (!thumbErr) attachment.thumbnailUrl = supabase.storage.from(HILOS_BUCKET).getPublicUrl(thumbPath).data.publicUrl;
            else console.error('Error subiendo miniatura:', thumbErr.message);
          }
          result.push(attachment);
        }
      } catch (err) { alert(`Error inesperado al subir "${file.name}"`); }
    }
    setAtts(prev => [...prev, ...result]);
    setUploading(false);
  }, [uid, compressImage, generateThumbnail]);

  /* ─── Storage path ─── */
  const getSupabasePath = useCallback((url: string) => {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split(`/${HILOS_BUCKET}/`);
      return parts.length > 1 ? decodeURIComponent(parts[1]) : '';
    } catch { return ''; }
  }, []);

  const deleteAttachments = useCallback(async (attachments: Attachment[]) => {
    if (!attachments?.length) return;
    // Incluye las miniaturas subidas al bucket (las viejas en base64 no tienen ruta).
    const paths = attachments
      .flatMap(a => [a.url, a.thumbnailUrl].filter((u): u is string => !!u && !u.startsWith('data:')))
      .map(getSupabasePath).filter(Boolean);
    if (paths.length) {
      const { error } = await supabase.storage.from(HILOS_BUCKET).remove(paths);
      if (error) console.error('Error eliminando archivos:', error.message);
    }
  }, [getSupabasePath]);

  /* ═══════════════════════════════
     CRUD HILOS
  ═══════════════════════════════ */
  const handleCreateHilo = useCallback(async () => {
    if (!newTitle.trim() || !newBody.trim()) { alert('Título y contenido son obligatorios'); return; }
    setSubmitting(true);
    try {
      const tags = newTags.split(/[,#]/).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
      const hiloData = {
        title: newTitle.trim(), body: newBody.trim(),
        authorUid: uid, authorName: userProfile?.displayName || '',
        authorAvatar: userProfile?.avatar || null, authorRole: userProfile?.role || '',
        category: newCategory, tags, attachments: newAttachments,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(), lastReplyAt: Timestamp.now(),
        pinned: false, locked: false, deleted: false, archived: false,
        replyCount: 0, viewCount: 0, reactions: {}, subscribers: [uid],
        isAnnouncement: isAnnouncement && isAdmin
      };
      const docRef = await addDoc(collection(db, 'hilos'), hiloData);
      await addDoc(collection(db, 'notifications'), {
        type: 'new_hilo', hiloId: docRef.id, category: newCategory,
        title: newTitle.trim(), authorName: userProfile?.displayName || '',
        createdAt: Timestamp.now(), readBy: []
      });
      resetNewHilo(); setShowNewHilo(false);
      setSelectedHilo({ id: docRef.id, ...hiloData } as Hilo);
    } catch (e) { console.error(e); alert('Error al crear el hilo'); }
    finally { setSubmitting(false); }
  }, [newTitle, newBody, newCategory, newTags, newAttachments, uid, userProfile, isAdmin, isAnnouncement]);

  const handleUpdateHilo = useCallback(async () => {
    if (!editingHilo || !newTitle.trim() || !newBody.trim()) return;
    setSubmitting(true);
    try {
      const tags = newTags.split(/[,#]/).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
      await updateDoc(doc(db, 'hilos', editingHilo.id), {
        title: newTitle.trim(), body: newBody.trim(), category: newCategory,
        tags, attachments: newAttachments, updatedAt: Timestamp.now(),
        edited: true, editedAt: Timestamp.now()
      });
      setEditingHilo(null); resetNewHilo(); setShowNewHilo(false);
    } catch (e) { console.error(e); alert('Error al actualizar el hilo'); }
    finally { setSubmitting(false); }
  }, [editingHilo, newTitle, newBody, newCategory, newTags, newAttachments]);

  const resetNewHilo = useCallback(() => {
    setNewTitle(''); setNewBody(''); setNewCategory('general');
    setNewTags(''); setNewAttachments([]); setIsAnnouncement(false); setEditingHilo(null);
  }, []);

  const startEditHilo = useCallback((hilo: Hilo) => {
    setEditingHilo(hilo); setNewTitle(hilo.title); setNewBody(hilo.body);
    setNewCategory(hilo.category); setNewTags(hilo.tags.join(', '));
    setNewAttachments(hilo.attachments); setIsAnnouncement(hilo.isAnnouncement || false);
    setShowNewHilo(true);
  }, []);

  /* ═══════════════════════════════
     CRUD REPLIES
  ═══════════════════════════════ */
  // Una notificación por respuesta con los destinatarios en `toUids`. Se
  // conservan los campos de antes (mentionedUsers ahora lleva los nombres).
  // Si falla, la respuesta ya está publicada: solo se registra el error.
  const notificarMenciones = useCallback(async (mentionUids: string[], replyId: string) => {
    if (!selectedHilo) return;
    const destinatarios = mentionUids.filter(m => m !== uid);
    if (destinatarios.length === 0) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        type: 'mention', hiloId: selectedHilo.id, hiloTitle: selectedHilo.title, replyId,
        toUids: destinatarios,
        mentionedUsers: destinatarios.map(m => usuarios.find(u => u.uid === m)?.displayName || m),
        authorUid: uid, authorName: userProfile?.displayName || '',
        createdAt: Timestamp.now(), readBy: []
      });
    } catch (e) { console.error('Error notificando menciones:', e); }
  }, [selectedHilo, uid, usuarios, userProfile?.displayName]);

  const handleReply = useCallback(async () => {
    if (!selectedHilo || !replyBody.trim()) return;
    if (selectedHilo.locked && !isAdmin) { alert('Este hilo está cerrado'); return; }
    setSubmittingReply(true);
    try {
      // Antes `@(\w+)` guardaba trozos de nombre (cortaba en tildes y espacios)
      // y la notificación no tenía destinatario. Ahora: uids de los usuarios
      // cuyo "@Nombre" aparece en el texto.
      const mentions = extraerMenciones(replyBody, usuarios);
      const replyData = {
        hiloId: selectedHilo.id, authorUid: uid,
        authorName: userProfile?.displayName || '',
        authorAvatar: userProfile?.avatar || null, authorRole: userProfile?.role || '',
        body: replyBody.trim(), attachments: replyAttachments,
        reactions: {}, createdAt: Timestamp.now(), edited: false,
        parentId: replyingTo?.id || null, mentions
      };
      const batch = writeBatch(db);
      const replyRef = doc(collection(db, 'hilos', selectedHilo.id, 'replies'));
      batch.set(replyRef, replyData);
      const ahora = Timestamp.now();
      batch.update(doc(db, 'hilos', selectedHilo.id), {
        replyCount: increment(1), updatedAt: ahora, lastReplyAt: ahora,
        // Quien responde queda siguiendo el hilo (las reglas lo permiten).
        subscribers: arrayUnion(uid),
      });
      try { localStorage.setItem(claveMiRespuesta(uid, selectedHilo.id), String(ahora.toMillis())); } catch { /* sin storage */ }
      await batch.commit();
      await notificarMenciones(mentions, replyRef.id);
      setReplyBody(''); setReplyAttachments([]); setReplyingTo(null); setShowMentions(false);
    } catch (e) { console.error(e); alert('Error al responder'); }
    finally { setSubmittingReply(false); }
  }, [selectedHilo, replyBody, replyAttachments, uid, userProfile, isAdmin, replyingTo, usuarios, notificarMenciones]);

  const handleUpdateReply = useCallback(async () => {
    if (!selectedHilo || !editingReply || !replyBody.trim()) return;
    try {
      const mentions = extraerMenciones(replyBody, usuarios);
      await updateDoc(doc(db, 'hilos', selectedHilo.id, 'replies', editingReply.id), {
        body: replyBody.trim(), attachments: replyAttachments,
        edited: true, editedAt: Timestamp.now(), mentions
      });
      // Solo se avisa a quien se agregó al editar, no otra vez a los de antes.
      const previas = new Set(editingReply.mentions ?? []);
      await notificarMenciones(mentions.filter(m => !previas.has(m)), editingReply.id);
      setEditingReply(null); setReplyBody(''); setReplyAttachments([]); setShowMentions(false);
    } catch (e) { console.error(e); alert('Error al editar respuesta'); }
  }, [selectedHilo, editingReply, replyBody, replyAttachments, usuarios, notificarMenciones]);

  const startEditReply = useCallback((reply: Reply) => {
    setEditingReply(reply); setReplyBody(reply.body);
    setReplyAttachments(reply.attachments); replyTextRef.current?.focus();
  }, []);

  /* ─── Reacciones ─── */
  const toggleReaction = useCallback(async (targetId: string, emoji: string, isReply: boolean) => {
    if (!selectedHilo) return;
    const ref = isReply
      ? doc(db, 'hilos', selectedHilo.id, 'replies', targetId)
      : doc(db, 'hilos', targetId);
    try {
      const docSnap = await getDoc(ref);
      if (!docSnap.exists()) return;
      const current = docSnap.data().reactions?.[emoji] || [];
      const hasReacted = current.includes(uid);
      const updated = hasReacted ? current.filter((u: string) => u !== uid) : [...current, uid];
      await updateDoc(ref, {
        [`reactions.${emoji}`]: updated.length > 0 ? updated : deleteField()
      });
    } catch (error) { console.error('Reaction error:', error); }
  }, [selectedHilo, uid]);

  /* ─── Acciones admin ─── */
  // Las acciones avisan si fallan (antes la promesa rechazada se perdía sin aviso).
  const togglePin = useCallback(async (hilo: Hilo) => {
    const updateData: Record<string, any> = { pinned: !hilo.pinned };
    if (!hilo.pinned) updateData.pinnedAt = Timestamp.now();
    else updateData.pinnedAt = deleteField();
    try { await updateDoc(doc(db, 'hilos', hilo.id), updateData); }
    catch (e) { console.error(e); alert('No se pudo fijar/desfijar el hilo'); }
  }, []);

  const toggleLock = useCallback(async (hilo: Hilo) => {
    try { await updateDoc(doc(db, 'hilos', hilo.id), { locked: !hilo.locked }); }
    catch (e) { console.error(e); alert('No se pudo cambiar el estado del hilo'); }
  }, []);

  const archiveHilo = useCallback(async (hilo: Hilo) => {
    if (!confirm('¿Archivar este hilo? Podrás recuperarlo después.')) return;
    try {
      await updateDoc(doc(db, 'hilos', hilo.id), { archived: true, archivedAt: Timestamp.now() });
      setSelectedHilo(null);
    } catch (e) { console.error(e); alert('No se pudo archivar el hilo'); }
  }, []);

  const unarchiveHilo = useCallback(async (hilo: Hilo) => {
    try {
      await updateDoc(doc(db, 'hilos', hilo.id), { archived: false, archivedAt: deleteField() });
      setSelectedHilo(null);
    } catch (e) { console.error(e); alert('No se pudo desarchivar el hilo'); }
  }, []);

  const deleteHilo = useCallback(async (hilo: Hilo) => {
    if (!confirm(`¿Eliminar permanentemente "${hilo.title}"?`)) return;
    try {
      await deleteAttachments(hilo.attachments);
      const repliesSnap = await getDocs(collection(db, 'hilos', hilo.id, 'replies'));
      const allReplyAtts = repliesSnap.docs.flatMap(d => (d.data().attachments || []) as Attachment[]);
      if (allReplyAtts.length > 0) await deleteAttachments(allReplyAtts);
      const batch = writeBatch(db);
      repliesSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'hilos', hilo.id));
      await batch.commit();
      setSelectedHilo(null);
    } catch (error) { console.error(error); alert('Error al eliminar el hilo'); }
  }, [deleteAttachments]);

  const deleteReply = useCallback(async (reply: Reply) => {
    if (!selectedHilo || !confirm('¿Eliminar esta respuesta?')) return;
    try {
      await deleteAttachments(reply.attachments);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'hilos', selectedHilo.id, 'replies', reply.id));
      batch.update(doc(db, 'hilos', selectedHilo.id), { replyCount: increment(-1) });
      await batch.commit();
      setReplies(prev => prev.filter(r => r.id !== reply.id));
    } catch (error) { console.error(error); alert('Error al eliminar la respuesta'); }
  }, [selectedHilo, deleteAttachments]);

  const toggleSubscription = useCallback(async (hilo: Hilo) => {
    const isSubscribed = hilo.subscribers?.includes(uid);
    // arrayUnion/arrayRemove: reescribir la lista entera pisaba a quien se
    // suscribía al mismo tiempo.
    try {
      await updateDoc(doc(db, 'hilos', hilo.id), {
        subscribers: isSubscribed ? arrayRemove(uid) : arrayUnion(uid),
      });
    } catch (e) { console.error(e); alert('No se pudo cambiar la suscripción'); }
  }, [uid]);

  /* ─── Utilities ─── */
  const handleDownload = useCallback(async (att: Attachment) => {
    try {
      const res = await fetch(att.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = att.name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { void abrirExterno(att.url); }
  }, []);

  const getShareUrl = useCallback((hiloId: string) =>
    urlPublica(`/hilos/observe/${hiloId}`), []);

  const copyLink = useCallback((hiloId: string) => {
    navigator.clipboard.writeText(getShareUrl(hiloId));
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000);
  }, [getShareUrl]);

  const shareHilo = useCallback(async (hilo: Hilo) => {
    const url = getShareUrl(hilo.id);
    if (navigator.share) {
      try { await navigator.share({ title: hilo.title, text: hilo.body.slice(0, 100) + '...', url }); return; }
      catch { /* fallback */ }
    }
    setShowShareModal(true);
  }, [getShareUrl]);

  /* ─── Filtros ─── */
  const filteredHilos = useMemo(() => {
    const list = showArchived ? archivedHilos : hilos;
    return list.filter(h => {
      const matchCat = showArchived || activeCategory === 'all' || h.category === activeCategory;
      const matchSearch = !searchQuery || (
        h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.tags.some(t => t.includes(searchQuery.toLowerCase()))
      );
      const matchStatus = filterStatus === 'all' ||
        (filterStatus === 'open' ? !h.locked : h.locked);
      const matchInterest = interestFilter === 'all' || (interestFilter === 'mine' ? h.authorUid === uid : h.subscribers?.includes(uid));
      return matchCat && matchSearch && matchStatus && matchInterest;
    });
  }, [hilos, archivedHilos, showArchived, activeCategory, searchQuery, filterStatus, interestFilter, uid]);

  /* ═══════════════════════════════
     SUB-COMPONENTES
  ═══════════════════════════════ */
  const AttachmentGrid = useCallback(({ attachments, onRemove }: {
    attachments: Attachment[];
    onRemove?: (i: number) => void;
  }) => {
    if (!attachments?.length) return null;
    return (
      <div className={`grid gap-2 mt-3 ${
        attachments.length === 1 ? 'grid-cols-1 max-w-md' :
        attachments.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
      }`}>
        {attachments.map((att, i) => (
          <motion.div key={att.id || i}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg overflow-hidden border moon-panel-border moon-panel-surface group relative"
          >
            {att.type.startsWith('image/') ? (
              <div className="relative aspect-video cursor-pointer" onClick={() => setViewerFile(att)}>
                <img src={att.thumbnailUrl || att.url} alt={att.name}
                  className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" loading="lazy" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity moon-media-overlay bg-black/40">
                  <Eye className="w-6 h-6 moon-panel-ink" />
                </div>
                {onRemove && (
                  <button onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                    className="absolute top-2 right-2 p-1 moon-media-overlay bg-black/60 rounded-full moon-panel-ink opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2.5">
                <div className="w-8 h-8 moon-panel-raised rounded-lg flex items-center justify-center flex-shrink-0">
                  {(() => { const I = getFileIcon(att.type); return <I className="w-4 h-4 moon-panel-muted" />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="moon-panel-ink text-xs font-medium truncate">{att.name}</p>
                  <p className="moon-panel-muted text-xs">{formatSize(att.size)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setViewerFile(att)}
                    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDownload(att)}
                    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded transition-colors">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {onRemove && (
                    <button onClick={() => onRemove(i)}
                      className="p-1.5 moon-panel-muted hover:text-red-400 moon-panel-hover rounded transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    );
  }, [handleDownload]);

  const ReactionBar = useCallback(({ reactions, targetId, isReply }: {
    reactions: Record<string, string[]>;
    targetId: string;
    isReply: boolean;
  }) => {
    const totalReactions = Object.values(reactions || {}).reduce((a, b) => a + b.length, 0);
    const isOpen = showEmojiPicker === targetId;
    return (
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        {REACTIONS.filter(e => reactions?.[e]?.length > 0).map(emoji => (
          <motion.button key={emoji} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={() => toggleReaction(targetId, emoji, isReply)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all border ${
              reactions[emoji]?.includes(uid)
                ? 'moon-panel-raised moon-panel-border moon-panel-ink'
                : 'moon-panel-border moon-panel-muted hover:border-zinc-600 moon-panel-hover'
            }`}>
            <EmojiText text={emoji} size={18} />
            <span className="font-medium tabular-nums">{reactions[emoji].length}</span>
          </motion.button>
        ))}
        <div className="relative" style={{ isolation: 'isolate' }}>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={() => setShowEmojiPicker(isOpen ? null : targetId)}
            className={`w-6 h-6 flex items-center justify-center rounded-full border transition-all ${
              isOpen ? 'moon-panel-border moon-panel-raised moon-panel-muted'
                     : 'moon-panel-border moon-panel-muted hover:border-zinc-600 moon-panel-hover'
            }`}>
            <Smile className="w-3.5 h-3.5" />
          </motion.button>
          <AnimatePresence>
            {isOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(null)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: 6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 mb-2 z-50 moon-panel-surface border moon-panel-border rounded-xl p-2 shadow-2xl shadow-black/60"
                  style={{ minWidth: '164px' }}
                >
                  <div className="grid grid-cols-5 gap-1">
                    {REACTIONS.map(emoji => (
                      <button key={emoji}
                        onClick={() => { toggleReaction(targetId, emoji, isReply); setShowEmojiPicker(null); }}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-base transition-all hover:scale-110 active:scale-95 ${
                          reactions?.[emoji]?.includes(uid) ? 'moon-panel-raised ring-1 ring-zinc-500' : 'moon-panel-hover'
                        }`}>
                        <EmojiText text={emoji} size={22} />
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        {totalReactions > 0 && (
          <span className="moon-panel-muted text-xs">
            {totalReactions} {totalReactions === 1 ? 'reacción' : 'reacciones'}
          </span>
        )}
      </div>
    );
  }, [uid, toggleReaction, showEmojiPicker]);

  const Avatar = useCallback(({ src, name, size = 'md', isOnline }: {
    src?: string; name: string; size?: 'sm'|'md'|'lg'|'xl'; isOnline?: boolean;
  }) => {
    const sizes = { sm: 'w-6 h-6 text-xs', md: 'w-8 h-8 text-sm', lg: 'w-10 h-10 text-base', xl: 'w-12 h-12 text-lg' };
    return (
      <div className="relative flex-shrink-0">
        <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center overflow-hidden ring-2 ring-zinc-900`}>
          {src ? <img src={src} className="w-full h-full object-cover" alt={name} loading="lazy" />
               : <span className="moon-panel-ink font-medium">{name?.[0]?.toUpperCase()}</span>}
        </div>
        {isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 moon-panel-border rounded-full" />}
      </div>
    );
  }, []);

  /* ─── Menciones: autocompletado con la lista de usuarios ─── */
  // Antes filtraba solo a los conectados al hilo y con una búsqueda que nunca
  // cambiaba; además insertaba el nombre sin "@" y no reemplazaba lo escrito.
  const sugerenciasMencion = useMemo(() => {
    if (!showMentions) return [];
    const q = normalizar(mentionQuery);
    return usuarios
      .filter(u => u.uid !== uid && normalizar(u.displayName).includes(q))
      .slice(0, MAX_MENTION_SUGGESTIONS);
  }, [showMentions, mentionQuery, usuarios, uid]);

  // Detecta si el cursor está justo después de "@algo" y abre/cierra la lista.
  const actualizarMencion = useCallback((texto: string, cursor: number) => {
    const m = MENCION_EN_CURSOR.exec(texto.slice(0, cursor));
    if (m) {
      setShowMentions(true);
      setMentionQuery(m[2]);
      setMentionStart(cursor - m[2].length - 1);
      setCursorPosition(cursor);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  }, []);

  const insertarMencion = useCallback((user: UsuarioMencion) => {
    const before = replyBody.slice(0, mentionStart);
    const after = replyBody.slice(cursorPosition);
    const insertado = `@${user.displayName} `;
    setReplyBody(before + insertado + after);
    setShowMentions(false);
    const pos = before.length + insertado.length;
    // Devuelve el foco con el cursor después del nombre insertado.
    requestAnimationFrame(() => {
      const ta = replyTextRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(pos, pos); }
    });
  }, [replyBody, mentionStart, cursorPosition]);

  /* ─── Sidebar content (reutilizable) ─── */
  const SidebarContent = useCallback(() => (
  <div className="flex flex-col h-full overflow-hidden">
    {/* Botón nuevo hilo */}
    <div className="p-3 border-b moon-panel-border flex-shrink-0">
      <Button onClick={() => { setShowNewHilo(true); setShowSidebar(false); }}
        className="w-full moon-panel-primary hover:opacity-90 font-medium gap-2 text-sm">
        <Plus className="w-4 h-4" /> Nuevo hilo
      </Button>
    </div>

    {/* Nav + Stats juntos, scrolleables */}
    <div className="flex-1 overflow-y-auto">
      <nav className="py-2 px-2 space-y-0.5">
        <button
          onClick={() => { setActiveCategory('all'); setShowArchived(false); setShowSidebar(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            !showArchived && activeCategory === 'all'
              ? 'moon-panel-raised moon-panel-ink' : 'moon-panel-muted moon-panel-hover moon-panel-hover'
          }`}>
          <GitBranch className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          <span className="flex-1 text-left">Todos los hilos</span>
          <span className="moon-panel-muted text-xs moon-panel-surface px-1.5 py-0.5 rounded-full">{hilos.length}</span>
        </button>

        {CATEGORIES.map(cat => {
          const count = hilos.filter(h => h.category === cat.id).length;
          const isActive = !showArchived && activeCategory === cat.id;
          return (
            <button key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setShowArchived(false); setShowSidebar(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'moon-panel-raised moon-panel-ink' : 'moon-panel-muted moon-panel-hover moon-panel-hover'
              }`}>
              <cat.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'moon-panel-ink' : cat.color}`} strokeWidth={1.5} />
              <span className="flex-1 text-left">{cat.label}</span>
              {count > 0 && <span className="moon-panel-muted text-xs moon-panel-surface px-1.5 py-0.5 rounded-full">{count}</span>}
            </button>
          );
        })}

        <div className="border-t moon-panel-border my-1.5" />

        <button
          onClick={() => { setShowArchived(true); setSelectedHilo(null); setShowSidebar(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            showArchived ? 'moon-panel-raised moon-panel-ink' : 'moon-panel-muted moon-panel-hover moon-panel-hover'
          }`}>
          <Archive className={`w-4 h-4 flex-shrink-0 ${showArchived ? 'moon-panel-ink' : 'moon-panel-muted'}`} strokeWidth={1.5} />
          <span className="flex-1 text-left">Archivados</span>
          {archivedHilos.length > 0 && (
            <span className="moon-panel-muted text-xs moon-panel-surface px-1.5 py-0.5 rounded-full">{archivedHilos.length}</span>
          )}
        </button>
      </nav>

      {/* Estadísticas — justo debajo del nav, sin gap */}
      <div className="px-3 pt-1 pb-4">
        <div className="rounded-lg moon-panel-surface border moon-panel-border p-3 space-y-2">
          <span className="moon-panel-muted text-[10px] font-semibold uppercase tracking-wider">Estadísticas</span>
          {[
            { label: 'Activos hoy', val: hilos.filter(h => { const d = h.updatedAt?.toDate?.() || new Date(h.updatedAt); return d > new Date(Date.now() - 86400000); }).length },
            { label: 'Fijados', val: hilos.filter(h => h.pinned).length },
            { label: 'Cerrados', val: hilos.filter(h => h.locked).length },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="moon-panel-muted text-xs">{s.label}</span>
              <span className="moon-panel-muted text-xs font-medium tabular-nums">{s.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
), [hilos, archivedHilos, activeCategory, showArchived]);

  /* ═══════════════════════════════
     RENDER PRINCIPAL
  ═══════════════════════════════ */
  return (
    <div className="moon-module moon-module--hilos h-[calc(100vh-4rem)] flex moon-panel-surface rounded-xl border moon-panel-border overflow-hidden relative">
      {/* Progress bar */}
      <motion.div className="absolute top-0 left-0 right-0 h-0.5 bg-white origin-left z-50"
        style={{ scaleX }} />

      {/* ══════════════════════
          SIDEBAR — Desktop (siempre visible) / Mobile (drawer overlay)
      ══════════════════════ */}

      {/* Overlay móvil */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 moon-media-overlay bg-black/60 z-40 xl:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar desktop */}
      <aside className="hidden xl:flex w-56 flex-shrink-0 border-r moon-panel-border flex-col moon-panel-surface overflow-hidden h-full">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile drawer */}
      <AnimatePresence>
        {showSidebar && (
          <motion.aside
            initial={{ x: -224 }} animate={{ x: 0 }} exit={{ x: -224 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 w-56 z-50 flex flex-col moon-panel-surface border-r moon-panel-border xl:hidden overflow-hidden"
          >
            <div className="flex items-center justify-between p-3 border-b moon-panel-border">
              <h1 className="moon-panel-ink font-medium text-base">Hilos del equipo</h1>
              <button onClick={() => setShowSidebar(false)}
                className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ══════════════════════
          LISTA DE HILOS
          En móvil: oculta cuando hay hilo seleccionado
      ══════════════════════ */}
      <div className={`enterprise-hilo-list flex-col border-r moon-panel-border moon-panel-surface
        ${selectedHilo ? 'hidden xl:flex xl:w-80' : 'flex flex-1 xl:flex-none xl:w-80'}
      `}>
        {/* Header lista */}
        <div className="enterprise-hilo-toolbar flex items-center gap-2 border-b moon-panel-border flex-shrink-0 moon-panel-surface">
          {/* Hamburger solo en móvil */}
          <button onClick={() => setShowSidebar(true)}
            className="xl:hidden p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors flex-shrink-0">
            <Menu className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="moon-panel-ink font-medium text-sm flex items-center gap-1.5 truncate">
              {showArchived && <Archive className="w-3.5 h-3.5 moon-panel-muted flex-shrink-0" />}
              <span className="truncate">
                {showArchived ? 'Archivados' : activeCategory === 'all' ? 'Todos los hilos' : getCategoryInfo(activeCategory).label}
              </span>
            </h2>
            <p className="moon-panel-muted text-xs">{filteredHilos.length} hilos</p>
          </div>

          <div className="enterprise-hilo-tools items-center gap-1.5 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 moon-panel-muted" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                aria-label="Buscar hilos" placeholder="Título, tema o persona…" className="moon-panel-surface border moon-panel-border rounded-lg pl-7 pr-2 py-1.5 text-sm moon-panel-ink focus:outline-none transition-colors" />
            </div>
            <button aria-label="Mostrar filtros de hilos" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-lg transition-colors ${showFilters ? 'moon-panel-raised moon-panel-ink' : 'moon-panel-muted moon-panel-hover'}`}>
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="enterprise-hilo-quick" role="group" aria-label="Participación en hilos">
          {([{ id: 'all', label: 'Todos' }, { id: 'mine', label: 'Mis hilos' }, { id: 'subscribed', label: 'Siguiendo' }] as const).map(item => <button type="button" key={item.id} aria-pressed={interestFilter === item.id} onClick={() => setInterestFilter(item.id)}>{item.label}</button>)}
          {(searchQuery || interestFilter !== 'all' || filterStatus !== 'all') && <button type="button" onClick={() => { setSearchQuery(''); setInterestFilter('all'); setFilterStatus('all'); }}>Limpiar</button>}
        </div>

        {/* Filtros */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="border-b moon-panel-border overflow-hidden">
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="moon-panel-muted text-xs">Ordenar:</span>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                    className="moon-panel-surface border moon-panel-border rounded text-xs moon-panel-muted px-2 py-1 focus:outline-none flex-1">
                    <option value="updated">Última actividad</option>
                    <option value="created">Más recientes</option>
                    <option value="popular">Más vistos</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="moon-panel-muted text-xs">Estado:</span>
                  <div className="flex moon-panel-surface rounded-lg p-0.5 flex-1">
                    {(['all','open','closed'] as const).map(s => (
                      <button key={s} onClick={() => setFilterStatus(s)}
                        className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                          filterStatus === s ? 'moon-panel-raised moon-panel-ink' : 'moon-panel-muted moon-panel-hover'
                        }`}>
                        {s === 'all' ? 'Todos' : s === 'open' ? 'Abiertos' : 'Cerrados'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista hilos */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-5 h-5 animate-spin moon-panel-muted" />
              <p className="moon-panel-muted text-xs">Cargando hilos...</p>
            </div>
          ) : (showArchived ? errorArchivados : errorHilos) ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7 moon-panel-tone-red" strokeWidth={1.5} />
              </div>
              <p className="moon-panel-muted text-sm font-medium mb-1">No se pudieron cargar los hilos</p>
              <p className="moon-panel-muted text-xs break-words select-text max-w-full">
                {showArchived ? errorArchivados : errorHilos}
              </p>
            </div>
          ) : filteredHilos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="w-14 h-14 moon-panel-surface rounded-full flex items-center justify-center mb-4">
                {showArchived
                  ? <Archive className="w-7 h-7 moon-panel-muted" strokeWidth={1.5} />
                  : <GitBranch className="w-7 h-7 moon-panel-muted" strokeWidth={1.5} />}
              </div>
              <p className="moon-panel-muted text-sm font-medium mb-1">
                {showArchived ? 'Sin hilos archivados' : 'No hay hilos'}
              </p>
              <p className="moon-panel-muted text-xs">
                {showArchived ? 'Los hilos archivados aparecerán aquí' : 'Crea el primero con el botón de arriba'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-900/50">
              {filteredHilos.map((hilo, index) => {
                const cat = getCategoryInfo(hilo.category);
                const isSelected = selectedHilo?.id === hilo.id;
                const isUnread = hilo.lastReplyAt &&
                  new Date(hilo.lastReplyAt?.toDate?.() || hilo.lastReplyAt) > new Date(Date.now() - 86400000);
                return (
                  <motion.div key={hilo.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => setSelectedHilo(hilo)}
                    className={`px-3 py-3.5 cursor-pointer transition-all moon-panel-hover relative group border-l-2 ${
                      isSelected ? 'moon-panel-surface border-l-white' : 'border-l-transparent'
                    } ${isUnread && !isSelected ? 'moon-panel-surface' : ''}`}>
                    {isUnread && !isSelected && (
                      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    )}
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${cat.bg}`}>
                        <cat.icon className={`w-3 h-3 ${cat.color}`} strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5 mb-1">
                          <h3 className={`text-sm font-medium leading-tight line-clamp-2 ${
                            isSelected ? 'moon-panel-ink' : 'moon-panel-muted group-moon-panel-hover'}`}>
                            <EmojiText text={hilo.title} />
                          </h3>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {hilo.pinned && <Pin className="w-3 h-3 moon-panel-tone-amber fill-yellow-500" />}
                            {hilo.locked && <Lock className="w-3 h-3 moon-panel-muted" />}
                            {hilo.archived && <Archive className="w-3 h-3 moon-panel-muted" />}
                          </div>
                        </div>
                        <p className="moon-panel-muted text-xs line-clamp-1 mb-2"><EmojiText text={hilo.body} /></p>
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <Avatar src={hilo.authorAvatar} name={hilo.authorName} size="sm" />
                            <span className="moon-panel-muted truncate max-w-[70px]">{hilo.authorName}</span>
                          </div>
                          <span className="moon-panel-muted flex items-center gap-0.5">
                            <MessageSquare className="w-3 h-3" />{hilo.replyCount}
                          </span>
                          <span className="moon-panel-muted flex items-center gap-0.5">
                            <Eye className="w-3 h-3" />{hilo.viewCount}
                          </span>
                          <span className="moon-panel-muted ml-auto text-[10px]">{formatRelative(hilo.updatedAt)}</span>
                        </div>
                        {hilo.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {hilo.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="moon-panel-muted text-[10px] moon-panel-surface border moon-panel-border px-1.5 py-0.5 rounded">#{tag}</span>
                            ))}
                            {hilo.tags.length > 2 && <span className="moon-panel-muted text-[10px]">+{hilo.tags.length - 2}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════
          DETALLE DEL HILO
          En móvil: ocupa toda la pantalla
      ══════════════════════ */}
      <AnimatePresence mode="wait">
        {selectedHilo ? (
          <motion.div key={selectedHilo.id}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col moon-panel-surface min-w-0" ref={containerRef}>

            {/* Header detalle */}
            <div className="h-14 flex items-center gap-2 px-3 sm:px-4 border-b moon-panel-border flex-shrink-0 moon-panel-surface backdrop-blur-md sticky top-0 z-10">
              <button onClick={() => setSelectedHilo(null)}
                className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="moon-page-title moon-panel-ink font-medium text-sm truncate"><EmojiText text={selectedHilo.title} /></h2>
                <div className="flex items-center gap-1.5 text-xs moon-panel-muted">
                  <span className="truncate max-w-[120px]">por {selectedHilo.authorName}</span>
                  <span>•</span>
                  <span className="flex-shrink-0">{formatRelative(selectedHilo.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {onlineUsers.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1 mr-1 px-2 py-1 moon-panel-surface rounded-full">
                    <div className="flex -space-x-2">
                      {onlineUsers.slice(0, 3).map(u => <Avatar key={u.uid} src={u.avatar} name={u.displayName} size="sm" />)}
                    </div>
                    {onlineUsers.length > 3 && <span className="moon-panel-muted text-xs ml-1">+{onlineUsers.length - 3}</span>}
                  </div>
                )}
                <button onClick={() => toggleSubscription(selectedHilo)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    selectedHilo.subscribers?.includes(uid) ? 'moon-panel-tone-blue bg-blue-400/10' : 'moon-panel-muted moon-panel-hover moon-panel-hover'
                  }`}>
                  {selectedHilo.subscribers?.includes(uid) ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </button>
                <button onClick={() => shareHilo(selectedHilo)}
                  className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors">
                  <Share2 className="w-4 h-4" />
                </button>
                {(isAdmin || selectedHilo.authorUid === uid) && (
                  <div className="relative group">
                    <button className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-48 moon-panel-surface border moon-panel-border rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 py-1">
  {/* Todas las opciones disponibles para admin O autor */}
  {(isAdmin || selectedHilo.authorUid === uid) && (
    <>
      <button onClick={() => togglePin(selectedHilo)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm moon-panel-muted moon-panel-hover transition-colors text-left">
        <Pin className="w-4 h-4" />{selectedHilo.pinned ? 'Desfijar' : 'Fijar'}
      </button>
      <button onClick={() => toggleLock(selectedHilo)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm moon-panel-muted moon-panel-hover transition-colors text-left">
        {selectedHilo.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        {selectedHilo.locked ? 'Abrir hilo' : 'Cerrar hilo'}
      </button>
      <div className="border-t moon-panel-border my-1" />
      {showArchived ? (
        <button onClick={() => unarchiveHilo(selectedHilo)}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm moon-panel-muted moon-panel-hover transition-colors text-left">
          <ArchiveRestore className="w-4 h-4" />Desarchivar
        </button>
      ) : (
        <button onClick={() => archiveHilo(selectedHilo)}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm moon-panel-muted moon-panel-hover transition-colors text-left">
          <Archive className="w-4 h-4" />Archivar
        </button>
      )}
      <div className="border-t moon-panel-border my-1" />
      <button onClick={() => startEditHilo(selectedHilo)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm moon-panel-muted moon-panel-hover transition-colors text-left">
        <Edit3 className="w-4 h-4" />Editar hilo
      </button>
      <button onClick={() => deleteHilo(selectedHilo)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm moon-panel-tone-red hover:bg-red-400/10 transition-colors text-left">
        <Trash2 className="w-4 h-4" />Eliminar hilo
      </button>
    </>
  )}
</div>
                  </div>
                )}
              </div>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto">
              {/* Mensaje original */}
              <div className="px-4 sm:px-6 py-5 border-b moon-panel-border">
                <div className="flex gap-3 sm:gap-4">
                  <Avatar src={selectedHilo.authorAvatar} name={selectedHilo.authorName} size="lg"
                    isOnline={onlineUsers.some(u => u.uid === selectedHilo.authorUid)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="moon-panel-ink font-medium text-sm">{selectedHilo.authorName}</span>
                      <span className="moon-panel-muted text-xs px-2 py-0.5 moon-panel-surface rounded-full">{selectedHilo.authorRole}</span>
                      <span className="moon-panel-muted text-xs ml-auto">{formatFull(selectedHilo.createdAt)}</span>
                      {selectedHilo.edited && <span className="moon-panel-muted text-xs">(editado)</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {(() => {
                        const cat = getCategoryInfo(selectedHilo.category);
                        return (
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cat.bg} ${cat.color} border moon-panel-border`}>
                            <cat.icon className="w-3 h-3" />{cat.label}
                          </span>
                        );
                      })()}
                      {selectedHilo.isAnnouncement && (
                        <span className="flex items-center gap-1 moon-panel-tone-amber text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                          <Sparkles className="w-3 h-3" />Anuncio
                        </span>
                      )}
                      {selectedHilo.archived && (
                        <span className="flex items-center gap-1 moon-panel-muted text-xs px-2 py-0.5 rounded-full bg-zinc-500/10 border moon-panel-border">
                          <Archive className="w-3 h-3" />Archivado
                        </span>
                      )}
                      {selectedHilo.tags?.map(tag => (
                        <span key={tag} className="moon-panel-muted text-xs px-2 py-0.5 moon-panel-surface border moon-panel-border rounded-full">#{tag}</span>
                      ))}
                    </div>
                    <MarkdownRenderer content={selectedHilo.body} />
                    <AttachmentGrid attachments={selectedHilo.attachments} />
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t moon-panel-border flex-wrap">
                      <div className="flex items-center gap-3 text-xs moon-panel-muted">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{selectedHilo.viewCount.toLocaleString()} vistas</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{selectedHilo.replyCount} respuestas</span>
                      </div>
                      <ReactionBar reactions={selectedHilo.reactions || {}} targetId={selectedHilo.id} isReply={false} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Replies */}
              <div className="px-4 sm:px-6 py-4">
                {loadingReplies ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <RefreshCw className="w-5 h-5 animate-spin moon-panel-muted" />
                    <p className="moon-panel-muted text-xs">Cargando respuestas...</p>
                  </div>
                ) : errorReplies && errorReplies.hiloId === selectedHilo.id ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="w-6 h-6 moon-panel-tone-red mb-3" />
                    <p className="moon-panel-muted text-sm font-medium mb-1">No se pudieron cargar las respuestas</p>
                    <p className="moon-panel-muted text-xs break-words select-text">{errorReplies.msg}</p>
                  </div>
                ) : replies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 moon-panel-surface rounded-full flex items-center justify-center mb-3">
                      <MessageSquare className="w-6 h-6 moon-panel-muted" />
                    </div>
                    <p className="moon-panel-muted text-sm font-medium mb-1">Sin respuestas aún</p>
                    <p className="moon-panel-muted text-xs">Sé el primero en compartir tu opinión</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-5">
                      {replies.map((reply, idx) => (
                        <motion.div key={reply.id}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }} className="group">
                          {reply.parentId && (
                            <div className="flex items-center gap-2 mb-2 ml-10 text-xs moon-panel-muted">
                              <ArrowLeft className="w-3 h-3 rotate-[-45deg]" />
                              <span>Respondiendo a <span className="moon-panel-muted">
                                {replies.find(r => r.id === reply.parentId)?.authorName || 'mensaje'}
                              </span></span>
                            </div>
                          )}
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <Avatar src={reply.authorAvatar} name={reply.authorName}
                                isOnline={onlineUsers.some(u => u.uid === reply.authorUid)} />
                              {idx < replies.length - 1 && <div className="w-px flex-1 moon-panel-raised mt-2" />}
                            </div>
                            <div className="flex-1 min-w-0 pb-5">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="moon-panel-muted font-medium text-sm">{reply.authorName}</span>
                                <span className="moon-panel-muted text-xs">{reply.authorRole}</span>
                                <span className="moon-panel-muted text-xs ml-auto opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                                  {formatFull(reply.createdAt)}
                                </span>
                                {reply.edited && <span className="moon-panel-muted text-xs">(editado)</span>}
                              </div>
                              <MarkdownRenderer content={reply.body} className="opacity-90" />
                              <AttachmentGrid attachments={reply.attachments} />
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <ReactionBar reactions={reply.reactions || {}} targetId={reply.id} isReply={true} />
                                <button onClick={() => setReplyingTo(reply)}
                                  className="moon-panel-muted moon-panel-hover text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <ArrowLeft className="w-3 h-3 rotate-[-45deg]" />Responder
                                </button>
                                {(isAdmin || reply.authorUid === uid) && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                                    <button onClick={() => startEditReply(reply)} className="p-1 moon-panel-muted moon-panel-hover rounded">
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => deleteReply(reply)} className="p-1 moon-panel-muted hover:text-red-400 rounded">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {hasMoreReplies && (
                      <div className="flex justify-center py-4">
                        <button onClick={() => loadReplies(selectedHilo.id, true)} disabled={loadingMore}
                          className="flex items-center gap-2 px-4 py-2 moon-panel-surface moon-panel-hover moon-panel-muted text-sm rounded-lg transition-colors disabled:opacity-50">
                          {loadingMore ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                          Cargar más respuestas
                        </button>
                      </div>
                    )}
                    <div ref={repliesEndRef} />
                  </>
                )}
              </div>
            </div>

            {/* Caja de reply */}
            <div className="border-t moon-panel-border moon-panel-surface flex-shrink-0">
              {selectedHilo.locked && !isAdmin ? (
                <div className="flex items-center justify-center gap-2 px-4 py-3 moon-panel-muted moon-panel-surface">
                  <Lock className="w-4 h-4" />
                  <span className="text-sm">Este hilo está cerrado</span>
                </div>
              ) : (
                <div className="p-3 sm:p-4">
                  {replyingTo && (
                    <div className="flex items-center justify-between px-3 py-2 mb-2 moon-panel-surface rounded-lg border moon-panel-border">
                      <div className="flex items-center gap-2 text-xs moon-panel-muted min-w-0">
                        <ArrowLeft className="w-3 h-3 rotate-[-45deg] flex-shrink-0" />
                        <span className="truncate">Respondiendo a <span className="moon-panel-muted">{replyingTo.authorName}</span></span>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="moon-panel-muted moon-panel-hover flex-shrink-0 ml-2">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {editingReply && (
                    <div className="flex items-center justify-between px-3 py-2 mb-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <div className="flex items-center gap-2 text-xs moon-panel-tone-blue">
                        <Edit3 className="w-3 h-3" /><span>Editando mensaje</span>
                      </div>
                      <button onClick={() => { setEditingReply(null); setReplyBody(''); setReplyAttachments([]); }}
                        className="moon-panel-muted moon-panel-hover">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <AttachmentGrid attachments={replyAttachments}
                    onRemove={i => setReplyAttachments(prev => prev.filter((_, idx) => idx !== i))} />
                  <div className="flex gap-2 sm:gap-3 mt-2">
                    <Avatar src={userProfile?.avatar} name={userProfile?.displayName || ''} />
                    <div className="flex-1 relative min-w-0">
                      {/* Sugerencias de @mención: fuera de la caja con overflow-hidden para que no se recorten */}
                      {showMentions && sugerenciasMencion.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          className="absolute bottom-full left-0 mb-2 moon-panel-surface border moon-panel-border rounded-xl p-2 min-w-[200px] max-w-full shadow-2xl z-30">
                          {sugerenciasMencion.map((user, i) => (
                            <button key={user.uid} type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => insertarMencion(user)}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                                i === mentionIndex ? 'moon-panel-raised' : 'moon-panel-hover'}`}>
                              <Avatar src={user.avatar} name={user.displayName} size="sm"
                                isOnline={onlineUsers.some(o => o.uid === user.uid)} />
                              <span className="moon-panel-muted text-sm truncate">{user.displayName}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                      <div className="moon-panel-surface border moon-panel-border rounded-xl overflow-hidden focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700 transition-all">
                        <textarea ref={replyTextRef} value={replyBody}
                          onChange={e => {
                            setReplyBody(e.target.value);
                            actualizarMencion(e.target.value, e.target.selectionStart);
                          }}
                          // Mover el cursor (clic, flechas) también abre/cierra la lista.
                          onSelect={e => actualizarMencion(e.currentTarget.value, e.currentTarget.selectionStart)}
                          onBlur={() => setShowMentions(false)}
                          onKeyDown={e => {
                            if (showMentions && sugerenciasMencion.length > 0) {
                              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % sugerenciasMencion.length); return; }
                              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + sugerenciasMencion.length) % sugerenciasMencion.length); return; }
                              if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
                                e.preventDefault();
                                insertarMencion(sugerenciasMencion[Math.min(mentionIndex, sugerenciasMencion.length - 1)]);
                                return;
                              }
                              if (e.key === 'Escape') { e.preventDefault(); setShowMentions(false); return; }
                            }
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              editingReply ? handleUpdateReply() : handleReply();
                            }
                          }}
                          placeholder={replyingTo ? `Respondiendo a ${replyingTo.authorName}...` : 'Escribe una respuesta... (Ctrl+Enter para enviar)'}
                          rows={3} maxLength={5000}
                          className="w-full bg-transparent moon-panel-ink text-sm focus:outline-none resize-none placeholder:text-zinc-600 leading-relaxed px-3 py-2.5"
                        />
                        <div className="flex items-center justify-between px-2.5 py-2 border-t moon-panel-border">
                          <div className="flex items-center gap-1">
  <EmojiButton value={replyBody} onChange={setReplyBody} inputRef={replyTextRef} maxLength={5000} disabled={submittingReply} label="Añadir emoji a la respuesta" />
  <input ref={fileReplyRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt"
    className="hidden"
    onChange={e => e.target.files && uploadFiles(e.target.files, setReplyAttachments, setUploadingReply)} />
  <button onClick={() => fileReplyRef.current?.click()} disabled={uploadingReply}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors">
    {uploadingReply ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
  </button>
  <button onClick={() => setReplyBody(p => p + '**texto**')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs font-bold transition-colors" title="Negrita">B</button>
  <button onClick={() => setReplyBody(p => p + '*texto*')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs italic transition-colors" title="Cursiva">I</button>
  <button onClick={() => setReplyBody(p => p + '\n# ')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs font-semibold transition-colors" title="Título">#</button>
  <button onClick={() => setReplyBody(p => p + '\n- ')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs transition-colors" title="Lista">•</button>
  <button onClick={() => setReplyBody(p => p + '\n```js\n\n```')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs font-mono transition-colors" title="Código">{`</>`}</button>
  <button onClick={() => setReplyBody(p => p + '\n> ')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs transition-colors" title="Cita">❝</button>
</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs hidden sm:block transition-colors ${replyBody.length > 4500 ? 'moon-panel-tone-red' : 'moon-panel-muted'}`}>
                              {replyBody.length}/5000
                            </span>
                            <button
                              onClick={editingReply ? handleUpdateReply : handleReply}
                              disabled={submittingReply || !replyBody.trim()}
                              className="flex items-center gap-1.5 moon-panel-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium px-3 py-1.5 rounded-lg">
                              {submittingReply ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                : editingReply ? <Check className="w-3.5 h-3.5" />
                                : <Send className="w-3.5 h-3.5" />}
                              <span className="hidden sm:inline">{editingReply ? 'Guardar' : 'Enviar'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="hidden xl:flex flex-1 flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 moon-panel-surface rounded-full flex items-center justify-center mb-5 relative">
              <GitBranch className="w-10 h-10 moon-panel-muted" strokeWidth={1} />
            </div>
            <h3 className="moon-panel-muted font-medium text-base mb-2">Selecciona un hilo</h3>
            <p className="moon-panel-muted text-sm max-w-xs">Elige una conversación o crea una nueva</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════
          MODAL NUEVO/EDITAR HILO
      ══════════════════════ */}
      <Dialog open={showNewHilo} onOpenChange={open => { if (!open) { resetNewHilo(); setEditingHilo(null); } setShowNewHilo(open); }}>
        <DialogContent className="moon-panel-surface moon-panel-border moon-panel-ink w-[95vw] max-w-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 py-4 border-b moon-panel-border">
            <DialogTitle className="font-medium text-sm flex items-center gap-2">
              <GitBranch className="w-4 h-4 moon-panel-muted" />
              {editingHilo ? 'Editar hilo' : 'Nuevo hilo'}
            </DialogTitle>
            <DialogDescription className="sr-only">{editingHilo ? 'Editar el hilo' : 'Crear un nuevo hilo'}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b moon-panel-border">
              <label className="moon-panel-muted text-xs font-medium uppercase tracking-wider mb-3 block">Categoría</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setNewCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      newCategory === cat.id ? 'moon-panel-raised moon-panel-border moon-panel-ink' : 'moon-panel-border moon-panel-muted hover:border-zinc-700 moon-panel-hover'
                    }`}>
                    <cat.icon className={`w-3.5 h-3.5 ${newCategory === cat.id ? 'moon-panel-ink' : cat.color}`} strokeWidth={1.5} />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 sm:px-6 py-4 border-b moon-panel-border">
              <input ref={newTitleEmojiRef} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título descriptivo..."
                maxLength={200} className="w-full bg-transparent moon-panel-ink text-base sm:text-lg font-medium focus:outline-none placeholder:text-zinc-700" />
              <div className="flex justify-end mt-1">
                <EmojiButton value={newTitle} onChange={setNewTitle} inputRef={newTitleEmojiRef} maxLength={200} disabled={submitting} label="Añadir emoji al título del hilo" />
                <span className="moon-panel-muted text-xs">{newTitle.length}/200</span>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-4 border-b moon-panel-border">
              <textarea ref={newBodyEmojiRef} value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="Describe tu tema en detalle..."
                rows={8} maxLength={10000} className="w-full bg-transparent moon-panel-muted text-sm focus:outline-none resize-none placeholder:text-zinc-700 leading-relaxed" />
              <div className="flex justify-between items-center mt-2">
                <div className="flex flex-wrap gap-1">
  <EmojiButton value={newBody} onChange={setNewBody} inputRef={newBodyEmojiRef} maxLength={10000} disabled={submitting} label="Añadir emoji al hilo" />
  <button onClick={() => setNewBody(p => p + '**texto**')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs font-bold transition-colors" title="Negrita">B</button>
  <button onClick={() => setNewBody(p => p + '*texto*')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs italic transition-colors" title="Cursiva">I</button>
  <button onClick={() => setNewBody(p => p + '\n# ')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs font-semibold transition-colors" title="Título">#</button>
  <button onClick={() => setNewBody(p => p + '\n- ')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs transition-colors" title="Lista">•</button>
  <button onClick={() => setNewBody(p => p + '\n```js\n\n```')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs font-mono transition-colors" title="Código">{`</>`}</button>
  <button onClick={() => setNewBody(p => p + '\n> ')}
    className="p-1.5 moon-panel-muted moon-panel-hover moon-panel-hover rounded text-xs transition-colors" title="Cita">❝</button>
</div>
                <span className={`text-xs ${newBody.length > 9000 ? 'moon-panel-tone-red' : 'moon-panel-muted'}`}>{newBody.length}/10000</span>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-3 border-b moon-panel-border">
              <div className="flex items-center gap-3">
                <Hash className="w-4 h-4 moon-panel-muted flex-shrink-0" />
                <input value={newTags} onChange={e => setNewTags(e.target.value)}
                  placeholder="Tags separados por comas (máx. 5)"
                  className="flex-1 bg-transparent moon-panel-muted text-sm focus:outline-none placeholder:text-zinc-700" />
              </div>
            </div>
            {isAdmin && (
              <div className="px-4 sm:px-6 py-3 border-b moon-panel-border">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={isAnnouncement} onChange={e => setIsAnnouncement(e.target.checked)}
                    className="w-4 h-4 rounded moon-panel-border moon-panel-surface" />
                  <span className="text-sm moon-panel-muted">Marcar como anuncio</span>
                  <Sparkles className="w-4 h-4 moon-panel-tone-amber" />
                </label>
              </div>
            )}
            {newAttachments.length > 0 && (
              <div className="px-4 sm:px-6 py-3 border-b moon-panel-border moon-panel-surface">
                <AttachmentGrid attachments={newAttachments}
                  onRemove={i => setNewAttachments(prev => prev.filter((_, idx) => idx !== i))} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t moon-panel-border">
            <div>
              <input ref={fileNewRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" className="hidden"
                onChange={e => e.target.files && uploadFiles(e.target.files, setNewAttachments, setUploadingFiles)} />
              <button onClick={() => fileNewRef.current?.click()} disabled={uploadingFiles}
                className="flex items-center gap-2 moon-panel-muted moon-panel-hover text-sm transition-colors px-2 py-1.5 rounded-lg moon-panel-hover">
                {uploadingFiles ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                <span className="hidden sm:inline">{uploadingFiles ? 'Subiendo...' : 'Adjuntar'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => { resetNewHilo(); setEditingHilo(null); setShowNewHilo(false); }}
                className="moon-panel-muted moon-panel-hover text-sm">Cancelar</Button>
              <Button onClick={editingHilo ? handleUpdateHilo : handleCreateHilo}
                disabled={submitting || !newTitle.trim() || !newBody.trim()}
                className="moon-panel-primary hover:opacity-90 font-medium gap-2 text-sm">
                {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" />Guardando...</>
                  : editingHilo ? <><Check className="w-4 h-4" />Guardar</>
                  : <><Send className="w-4 h-4" />Publicar</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════
          VISOR DE ARCHIVOS
      ══════════════════════ */}
      <Dialog open={!!viewerFile} onOpenChange={open => !open && setViewerFile(null)}>
        <DialogContent showCloseButton={false} className="moon-panel-surface moon-panel-border w-[95vw] !max-w-5xl p-0 overflow-hidden">
          <DialogDescription className="sr-only">Vista previa del archivo</DialogDescription>
          {viewerFile && (
            <div className="flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-4 py-3 border-b moon-panel-border">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 moon-panel-surface rounded-lg flex-shrink-0">
                    <File className="w-4 h-4 moon-panel-muted" />
                  </div>
                  <div className="min-w-0">
                    <p className="moon-panel-ink text-sm font-medium truncate">{viewerFile.name}</p>
                    <p className="moon-panel-muted text-xs">{formatSize(viewerFile.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleDownload(viewerFile)}
                    className="p-2 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => void abrirExterno(viewerFile.url)} title="Abrir fuera de la app"
                    className="p-2 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors inline-flex">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewerFile(null)}
                    className="p-2 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 moon-panel-surface overflow-auto">
                {tipoVista(viewerFile) === 'imagen' ? (
                  <img src={viewerFile.url} alt={viewerFile.name}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl" />
                ) : tipoVista(viewerFile) === 'pdf' ? (
                  <iframe src={`${viewerFile.url}#toolbar=1`} className="w-full h-[70vh] border-0 rounded-lg" title={viewerFile.name} />
                ) : tipoVista(viewerFile) === 'texto' ? (
                  <iframe src={viewerFile.url} className="w-full h-[70vh] border-0 rounded-lg bg-white" title={viewerFile.name} />
                ) : (
                  // Word, Excel, etc.: sin visor de terceros; se abre o se descarga.
                  <div className="text-center py-12">
                    <File className="w-14 h-14 moon-panel-muted mx-auto mb-4" />
                    <p className="moon-panel-muted text-sm mb-4">Vista previa no disponible para este tipo de archivo</p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      <button onClick={() => void abrirExterno(viewerFile.url)}
                        className="px-4 py-2 moon-panel-raised moon-panel-hover moon-panel-ink text-sm rounded-lg transition-colors inline-flex items-center gap-2">
                        <ExternalLink className="w-4 h-4" />Abrir
                      </button>
                      <button onClick={() => handleDownload(viewerFile)}
                        className="px-4 py-2 moon-panel-raised moon-panel-hover moon-panel-ink text-sm rounded-lg transition-colors inline-flex items-center gap-2">
                        <Download className="w-4 h-4" />Descargar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════
          MODAL COMPARTIR
      ══════════════════════ */}
      <Dialog open={showShareModal} onOpenChange={open => { setShowShareModal(open); if (!open) setShowQR(false); }}>
        <DialogContent className="moon-panel-surface moon-panel-border moon-panel-ink w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium flex items-center gap-2">
              <Share2 className="w-4 h-4" />Compartir hilo
            </DialogTitle>
            <DialogDescription className="moon-panel-muted text-sm">
              Cualquiera con este enlace podrá leer el hilo sin login.
            </DialogDescription>
          </DialogHeader>
          {selectedHilo && (
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="moon-panel-muted text-xs font-medium uppercase tracking-wider mb-2 block">Enlace público</label>
                <div className="flex items-center gap-2 p-3 moon-panel-surface rounded-lg border moon-panel-border">
                  <input type="text" value={getShareUrl(selectedHilo.id)} readOnly
                    className="flex-1 bg-transparent text-xs moon-panel-muted focus:outline-none min-w-0" />
                  <button onClick={() => copyLink(selectedHilo.id)}
                    className={`p-2 rounded-lg transition-all flex-shrink-0 ${linkCopied ? 'moon-panel-tone-green bg-green-400/10' : 'moon-panel-muted moon-panel-hover moon-panel-hover'}`}>
                    {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {linkCopied && <p className="moon-panel-tone-green text-xs mt-1.5 flex items-center gap-1"><Check className="w-3 h-3" />Enlace copiado</p>}
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Eye className="w-4 h-4 moon-panel-tone-blue mt-0.5 flex-shrink-0" />
                <div>
                  <p className="moon-panel-tone-blue text-xs font-medium">Modo lectura</p>
                  <p className="text-blue-400/70 text-xs mt-0.5">El visitante puede leer el hilo y comentarios. Para participar necesita iniciar sesión.</p>
                </div>
              </div>
              <div>
                <button onClick={() => setShowQR(!showQR)}
                  className="flex items-center gap-2 moon-panel-muted moon-panel-hover text-sm transition-colors">
                  <QrCode className="w-4 h-4" />
                  {showQR ? 'Ocultar QR' : 'Mostrar QR'}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showQR ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showQR && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-3 flex flex-col items-center gap-3 p-4 moon-panel-surface rounded-xl border moon-panel-border">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getShareUrl(selectedHilo.id))}&bgcolor=18181b&color=ffffff&margin=2`}
                          alt="QR Code" className="w-40 h-40 rounded-lg" loading="lazy" />
                        <p className="moon-panel-muted text-xs">Escanea con la cámara del móvil</p>
                        <a href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(getShareUrl(selectedHilo.id))}&bgcolor=18181b&color=ffffff&margin=2`}
                          download={`qr-hilo-${selectedHilo.id}.png`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 moon-panel-muted moon-panel-hover text-xs transition-colors">
                          <Download className="w-3.5 h-3.5" />Descargar QR
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ═══════════════════════════════
   OBSERVER VIEW — Vista pública sin login
═══════════════════════════════ */
export const HilosObserverView: React.FC<{ hiloId: string }> = ({ hiloId }) => {
  const [hilo, setHilo] = useState<Hilo | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState<Attachment | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'hilos', hiloId));
        if (!snap.exists() || snap.data().deleted) {
          setError('Este hilo no existe o fue eliminado.'); setLoading(false); return;
        }
        setHilo({ id: snap.id, ...snap.data() } as Hilo);
        const rSnap = await getDocs(query(collection(db, 'hilos', hiloId, 'replies'), orderBy('createdAt', 'asc'), limit(20)));
        setReplies(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Reply)));
      } catch (err) {
        console.error('Observer load error:', err);
        setError('No se pudo cargar el hilo.');
      } finally { setLoading(false); }
    };
    load();
  }, [hiloId]);

  if (loading) return (
    <div className="min-h-screen moon-panel-surface flex items-center justify-center">
      <RefreshCw className="w-8 h-8 animate-spin moon-panel-muted" />
    </div>
  );
  if (error || !hilo) return (
    <div className="min-h-screen moon-panel-surface flex flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertCircle className="w-12 h-12 moon-panel-tone-red" />
      <p className="moon-panel-muted text-lg font-medium">{error || 'Hilo no encontrado'}</p>
      <a href="/" className="px-4 py-2 moon-panel-primary rounded-lg text-sm font-medium hover:opacity-90">Ir al inicio</a>
    </div>
  );

  const cat = getCategoryInfo(hilo.category);
  return (
    <div className="min-h-screen moon-panel-surface">
      <div className="sticky top-0 z-50 moon-panel-surface backdrop-blur border-b moon-panel-border px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs moon-panel-muted min-w-0">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">Modo <span className="font-medium moon-panel-muted">lectura</span></span>
        </div>
        <a href="/login" className="flex-shrink-0 px-3 py-1.5 moon-panel-primary rounded-lg text-xs font-medium hover:opacity-90 transition-colors">
          Iniciar sesión →
        </a>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div data-moon-reveal="card" className="moon-panel-surface rounded-xl border moon-panel-border p-4 sm:p-6 mb-5">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${cat.bg} ${cat.color} border moon-panel-border`}>
              <cat.icon className="w-3 h-3" />{cat.label}
            </span>
            {hilo.isAnnouncement && (
              <span className="flex items-center gap-1 moon-panel-tone-amber text-xs px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                <Sparkles className="w-3 h-3" />Anuncio
              </span>
            )}
            {hilo.tags?.map(tag => (
              <span key={tag} className="moon-panel-muted text-xs px-2 py-0.5 moon-panel-raised border moon-panel-border rounded-full">#{tag}</span>
            ))}
          </div>
          <h1 className="moon-panel-ink text-lg sm:text-xl font-semibold mb-3"><EmojiText text={hilo.title} /></h1>
          <div className="flex items-center gap-2 mb-4 text-xs moon-panel-muted flex-wrap">
            <span className="font-medium moon-panel-muted">{hilo.authorName}</span>
            <span>•</span><span>{hilo.authorRole}</span>
            <span>•</span><span>{formatFull(hilo.createdAt)}</span>
            {hilo.edited && <span>(editado)</span>}
          </div>
          <p className="moon-panel-muted text-sm leading-relaxed whitespace-pre-wrap mb-4"><EmojiText text={hilo.body} /></p>
          {hilo.attachments?.length > 0 && (
            <div className={`grid gap-2 mt-4 ${hilo.attachments.length === 1 ? 'grid-cols-1 max-w-md' : 'grid-cols-2'}`}>
              {hilo.attachments.map(att => (
                <div key={att.id} className="rounded-lg overflow-hidden border moon-panel-border moon-panel-raised">
                  {att.type.startsWith('image/') ? (
                    <div className="relative aspect-video cursor-pointer" onClick={() => setViewerFile(att)}>
                      <img src={att.thumbnailUrl || att.url} alt={att.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 moon-media-overlay bg-black/40 transition-opacity"><Eye className="w-6 h-6 moon-panel-ink" /></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3">
                      <File className="w-5 h-5 moon-panel-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="moon-panel-ink text-xs font-medium truncate">{att.name}</p>
                        <p className="moon-panel-muted text-xs">{formatSize(att.size)}</p>
                      </div>
                      <button onClick={() => setViewerFile(att)} className="p-1.5 moon-panel-muted moon-panel-hover rounded transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t moon-panel-border text-xs moon-panel-muted">
            <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{hilo.viewCount} vistas</span>
            <span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />{hilo.replyCount} respuestas</span>
          </div>
        </div>
        <div className="space-y-3 mb-8">
          <h2 className="moon-panel-muted text-sm font-medium">{replies.length} {replies.length === 1 ? 'respuesta' : 'respuestas'}</h2>
          {replies.map(reply => (
            <div data-moon-reveal="row" key={reply.id} className="moon-panel-surface rounded-xl border moon-panel-border p-4">
              <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                <span className="font-medium moon-panel-muted">{reply.authorName}</span>
                <span className="moon-panel-muted">{reply.authorRole}</span>
                <span className="moon-panel-muted ml-auto">{formatFull(reply.createdAt)}</span>
              </div>
              <MarkdownRenderer content={reply.body} className="opacity-90" />
            </div>
          ))}
          {hilo.replyCount > 20 && (
            <p className="text-center moon-panel-muted text-xs py-2">
              Inicia sesión para ver las {hilo.replyCount} respuestas completas
            </p>
          )}
        </div>
        <div className="text-center">
          <p className="moon-panel-muted text-sm mb-3">¿Quieres participar en esta discusión?</p>
          <a href="/login" className="inline-flex items-center gap-2 px-6 py-2.5 moon-panel-primary rounded-lg font-medium text-sm hover:opacity-90 transition-colors">
            Iniciar sesión
          </a>
        </div>
      </div>
      {/* Visor observer */}
      <Dialog open={!!viewerFile} onOpenChange={open => !open && setViewerFile(null)}>
        <DialogContent showCloseButton={false} className="moon-panel-surface moon-panel-border w-[95vw] !max-w-5xl p-0 overflow-hidden">
          <DialogDescription className="sr-only">Vista previa del archivo</DialogDescription>
          {viewerFile && (
            <div className="flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-4 py-3 border-b moon-panel-border">
                <p className="moon-panel-ink text-sm font-medium truncate">{viewerFile.name}</p>
                <button onClick={() => setViewerFile(null)} className="p-2 moon-panel-muted moon-panel-hover moon-panel-hover rounded-lg ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 p-4 moon-panel-surface overflow-auto">
                {tipoVista(viewerFile) === 'imagen' ? (
                  <img src={viewerFile.url} alt={viewerFile.name} className="max-w-full max-h-[70vh] object-contain rounded-lg mx-auto block" />
                ) : tipoVista(viewerFile) === 'pdf' ? (
                  <iframe src={viewerFile.url} className="w-full h-[70vh] border-0 rounded-lg" title={viewerFile.name} />
                ) : tipoVista(viewerFile) === 'texto' ? (
                  <iframe src={viewerFile.url} className="w-full h-[70vh] border-0 rounded-lg bg-white" title={viewerFile.name} />
                ) : (
                  // Sin visor de Google: se ofrece abrir el archivo directamente.
                  <div className="text-center py-12">
                    <File className="w-14 h-14 moon-panel-muted mx-auto mb-4" />
                    <p className="moon-panel-muted text-sm mb-4">Vista previa no disponible para este tipo de archivo</p>
                    <button onClick={() => void abrirExterno(viewerFile.url)}
                      className="px-4 py-2 moon-panel-raised moon-panel-hover moon-panel-ink text-sm rounded-lg transition-colors inline-flex items-center gap-2">
                      <Download className="w-4 h-4" />Abrir / descargar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HilosComponent;
