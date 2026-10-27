import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
import { panelInk } from '@/lib/panelColors';
import '@/styles/enterprise-sections.css';
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabaseclient';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, where, orderBy, Timestamp, arrayUnion, arrayRemove
} from 'firebase/firestore';
import {  AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Mail, Send, Inbox, FileText, Trash2, Plus, Search,
  Paperclip, X, Reply, Forward, Image, File, Download, Eye, Star,
  RefreshCw, ArrowLeft, Menu,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/* ── Tipos ──────────────────────────────────────────────────────────────────── */
interface Attachment { url: string; name: string; type: string; size: number; }
interface Correo {
  id: string; fromUid: string; fromName: string; fromAvatar?: string; fromRole: string;
  toUid: string; toName: string; toAvatar?: string; subject: string; body: string;
  attachments: Attachment[]; createdAt: any; read: boolean; starred: boolean;
  deleted: boolean; deletedBy?: string; draft: boolean; replyToId?: string;
  replyToSubject?: string; forwarded?: boolean;
  // Estado por persona (antes era uno solo para los dos: si el destinatario
  // borraba o destacaba un correo, también cambiaba para el remitente).
  starredBy?: string[]; trashedBy?: string[]; purgedBy?: string[];
  // Un borrador guarda su destinatario acá y deja toUid vacío: con toUid el
  // borrador ya le llegaba al destinatario (su escucha lo recibía).
  draftToUid?: string;
}

/* ── Estado por persona, compatible con los correos viejos ── */
const destacado  = (m: Correo, uid: string) => m.starredBy ? m.starredBy.includes(uid) : !!m.starred;
const enPapelera = (m: Correo, uid: string) => m.trashedBy ? m.trashedBy.includes(uid) : (!!m.deleted && m.deletedBy === uid);
const borradoDef = (m: Correo, uid: string) => !!m.purgedBy?.includes(uid);
type Folder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'starred';

const CORREOS_BUCKET = 'correos';

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const formatSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

const formatDate = (ts: any) => {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return format(date, 'HH:mm');
  if (diff < 604800000) return format(date, 'EEE', { locale: es });
  return format(date, 'd MMM', { locale: es });
};

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════════════════════ */
const CorreoComponent: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid || '';

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [correos, setCorreos] = useState<Correo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<Folder>('inbox');
  const [selectedMail, setSelectedMail] = useState<Correo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerFile, setViewerFile] = useState<Attachment | null>(null);
  const [newMailAlert, setNewMailAlert] = useState(false);
  // Mobile: show sidebar drawer
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  // Mobile view state: 'list' | 'detail'
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  const prevUnreadRef = useRef(0);

  const [composeTo, setComposeTo] = useState<UserProfile | null>(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeAttachments, setComposeAttachments] = useState<Attachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const subjectEmojiRef = useRef<HTMLInputElement>(null);
  const bodyEmojiRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { getAllUsers().then(d => setUsers(d as UserProfile[])).catch(e => console.error('usuarios:', e)); }, []);

  useEffect(() => {
    if (!uid) return;
    const merge = (prev: Correo[], incoming: Correo[]) => {
      const ids = new Set(incoming.map(m => m.id));
      return [...prev.filter(m => !ids.has(m.id)), ...incoming].sort((a, b) => {
        const ta = a.createdAt?.toDate?.() ?? new Date(a.createdAt);
        const tb = b.createdAt?.toDate?.() ?? new Date(b.createdAt);
        return tb.getTime() - ta.getTime();
      });
    };
    const qIn = query(collection(db, 'correos'), where('toUid', '==', uid), orderBy('createdAt', 'desc'));
    const qOut = query(collection(db, 'correos'), where('fromUid', '==', uid), orderBy('createdAt', 'desc'));
    const alFallar = (e: Error) => { console.error('correos:', e); toast.error('No se pudieron cargar los correos'); setLoading(false); };
    const u1 = onSnapshot(qIn, snap => { setCorreos(p => merge(p, snap.docs.map(d => ({ id: d.id, ...d.data() } as Correo)))); setLoading(false); }, alFallar);
    const u2 = onSnapshot(qOut, snap => { setCorreos(p => merge(p, snap.docs.map(d => ({ id: d.id, ...d.data() } as Correo)))); setLoading(false); }, alFallar);
    return () => { u1(); u2(); };
  }, [uid]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node))
        setShowUserDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n' && !showCompose) { e.preventDefault(); resetCompose(); setShowCompose(true); }
      if (e.key === 'Escape' && showCompose) { setShowCompose(false); resetCompose(); }
      if (e.key === 'Escape' && !showCompose && selectedMail) { setSelectedMail(null); setMobileView('list'); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [showCompose, selectedMail]);

  useEffect(() => {
    if (!selectedMail) return;
    const updated = correos.find(m => m.id === selectedMail.id);
    if (updated) setSelectedMail(updated);
  }, [correos]);

  const folderMails = correos.filter(m => {
    if (!uid || borradoDef(m, uid)) return false;
    const papelera = enPapelera(m, uid);
    if (activeFolder === 'trash') return papelera;
    if (papelera) return false;
    if (activeFolder === 'inbox') return m.toUid === uid && !m.draft;
    if (activeFolder === 'sent') return m.fromUid === uid && !m.draft;
    if (activeFolder === 'drafts') return m.fromUid === uid && m.draft;
    if (activeFolder === 'starred') return (m.toUid === uid || m.fromUid === uid) && !m.draft && destacado(m, uid);
    return false;
  }).filter(m => {
    if (onlyUnread && !(m.toUid === uid && !m.read && !m.draft)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.subject?.toLowerCase().includes(q) || m.body?.toLowerCase().includes(q) ||
      m.fromName?.toLowerCase().includes(q) || m.toName?.toLowerCase().includes(q);
  }).sort((a, b) => {
    const time = (value: Correo['createdAt']) => value?.toMillis?.() ?? (new Date(value ?? 0).getTime() || 0);
    return oldestFirst ? time(a.createdAt) - time(b.createdAt) : time(b.createdAt) - time(a.createdAt);
  });

  const visible = (m: Correo) => !!uid && !enPapelera(m, uid) && !borradoDef(m, uid);
  const unreadCount = correos.filter(m => m.toUid === uid && !m.read && !m.draft && visible(m)).length;
  const draftCount = correos.filter(m => m.fromUid === uid && m.draft && visible(m)).length;

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setNewMailAlert(true);
      const t = setTimeout(() => setNewMailAlert(false), 4000);
      prevUnreadRef.current = unreadCount;
      return () => clearTimeout(t);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const markRead = async (mail: Correo) => {
    if (mail.toUid === uid && !mail.read) await updateDoc(doc(db, 'correos', mail.id), { read: true });
    setSelectedMail({ ...mail, read: true });
    setMobileView('detail');
  };

  const toggleStar = async (mail: Correo, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!uid) return;
    const ya = destacado(mail, uid);
    try {
      await updateDoc(doc(db, 'correos', mail.id), {
        starredBy: ya ? arrayRemove(uid) : arrayUnion(uid),
        // El flag viejo era compartido: se apaga para que no marque al otro.
        ...(mail.starredBy ? {} : { starred: false }),
      });
    } catch (err) { console.error(err); toast.error('No se pudo destacar el correo'); }
  };

  const getSupabasePath = (url: string) => {
    try { return decodeURIComponent(new URL(url).pathname.split(`/correos/`)[1] || ''); }
    catch { return ''; }
  };

  // ¿Algún otro correo cargado usa este adjunto? (reenvíos comparten la URL)
  const adjuntoEnUso = (url: string, salvo: Set<string>) =>
    correos.some(m => !salvo.has(m.id) && m.attachments?.some(a => a.url === url));

  // Borrado definitivo, solo para ti. El documento (y sus adjuntos) se
  // elimina de verdad cuando la otra persona también lo borró.
  const borrarDefinitivo = async (mails: Correo[]) => {
    if (!uid) return;
    const eliminados = new Set<string>();
    for (const mail of mails) {
      const otro = mail.fromUid === uid ? mail.toUid : mail.fromUid;
      const otroYaLoBorro = !otro || otro === uid || !!mail.purgedBy?.includes(otro) || mail.draft;
      try {
        if (otroYaLoBorro) {
          const paths = (mail.attachments ?? [])
            .filter(a => !adjuntoEnUso(a.url, new Set([mail.id, ...eliminados])))
            .map(a => getSupabasePath(a.url)).filter(Boolean);
          if (paths.length > 0) await supabase.storage.from(CORREOS_BUCKET).remove(paths);
          await deleteDoc(doc(db, 'correos', mail.id));
          eliminados.add(mail.id);
        } else {
          await updateDoc(doc(db, 'correos', mail.id), { purgedBy: arrayUnion(uid) });
        }
      } catch (err) { console.error(err); toast.error('No se pudo eliminar un correo'); }
    }
    if (eliminados.size) setCorreos(p => p.filter(m => !eliminados.has(m.id)));
  };

  const deleteMail = async (mail: Correo) => {
    if (!uid) return;
    if (enPapelera(mail, uid)) {
      if (!confirm('¿Eliminar permanentemente?')) return;
      await borrarDefinitivo([mail]);
    } else {
      try {
        await updateDoc(doc(db, 'correos', mail.id), { trashedBy: arrayUnion(uid) });
      } catch (err) { console.error(err); toast.error('No se pudo mover a la papelera'); }
    }
    setSelectedMail(null);
    setMobileView('list');
  };

  const restoreMail = async (mail: Correo) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'correos', mail.id), {
        trashedBy: arrayRemove(uid),
        ...(mail.deleted && mail.deletedBy === uid ? { deleted: false, deletedBy: null } : {}),
      });
    } catch (err) { console.error(err); toast.error('No se pudo restaurar el correo'); }
  };

  const emptyTrash = async () => {
    if (!uid) return;
    const trash = correos.filter(m => enPapelera(m, uid) && !borradoDef(m, uid));
    if (!trash.length || !confirm(`¿Eliminar permanentemente ${trash.length} correo(s)?`)) return;
    await borrarDefinitivo(trash);
    setSelectedMail(null);
  };

  const compressImage = (file: File, maxKB = 400): Promise<File> => new Promise(resolve => {
    if (!file.type.startsWith('image/') || file.size < maxKB * 1024) { resolve(file); return; }
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1200 / img.width, 1200 / img.height, 1);
      canvas.width = img.width * ratio; canvas.height = img.height * ratio;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) { resolve(file); return; }
        const c = new Blob([blob], { type: 'image/jpeg' }) as any;
        c.name = file.name; c.lastModified = Date.now(); resolve(c as File);
      }, 'image/jpeg', 0.82);
    };
    img.src = objectUrl;
  });

  const handleFileUpload = async (files: FileList) => {
    setUploadingFiles(true);
    const newAtts: Attachment[] = [];
    for (const file of Array.from(files)) {
      const c = await compressImage(file);
      const path = `${uid}/${Date.now()}_correo_${c.name}`;
      const { error } = await supabase.storage.from(CORREOS_BUCKET).upload(path, c, { upsert: true });
      if (!error) {
        const { data } = supabase.storage.from(CORREOS_BUCKET).getPublicUrl(path);
        newAtts.push({ url: data.publicUrl, name: c.name, type: c.type, size: c.size });
      } else {
        toast.error(`No se pudo adjuntar ${file.name}: ${error.message}`);
      }
    }
    setComposeAttachments(p => [...p, ...newAtts]);
    setUploadingFiles(false);
  };

  const handleSend = async (asDraft = false) => {
    if (!asDraft && (!composeTo || !composeSubject.trim() || !composeBody.trim())) {
      alert('Completa destinatario, asunto y mensaje'); return;
    }
    setSendingMail(true);
    try {
      const payload = {
        fromUid: uid, fromName: userProfile?.displayName || '', fromAvatar: userProfile?.avatar || '',
        fromRole: userProfile?.role || '',
        toUid: asDraft ? '' : composeTo?.uid || '', draftToUid: asDraft ? composeTo?.uid || '' : '',
        toName: composeTo?.displayName || '',
        toAvatar: composeTo?.avatar || '', subject: composeSubject, body: composeBody,
        attachments: composeAttachments, createdAt: Timestamp.now(), read: false, starred: false,
        deleted: false, draft: asDraft, forwarded: false,
      };
      if (editingDraftId) await updateDoc(doc(db, 'correos', editingDraftId), payload);
      else await addDoc(collection(db, 'correos'), payload);
      resetCompose(); setShowCompose(false);
    } catch (e) { console.error(e); alert('Error al enviar'); }
    finally { setSendingMail(false); }
  };

  const resetCompose = () => { setComposeTo(null); setComposeSubject(''); setComposeBody(''); setComposeAttachments([]); setUserSearch(''); setEditingDraftId(null); };
  const openReply = (mail: Correo) => { setComposeTo(users.find(u => u.uid === mail.fromUid) || null); setComposeSubject(`Re: ${mail.subject}`); setComposeBody(`\n\n--- Mensaje original de ${mail.fromName} ---\n${mail.body}`); setComposeAttachments([]); setEditingDraftId(null); setShowCompose(true); };
  const openForward = (mail: Correo) => { setComposeTo(null); setComposeSubject(`Fwd: ${mail.subject}`); setComposeBody(`\n\n--- Reenviado de ${mail.fromName} ---\n${mail.body}`); setComposeAttachments(mail.attachments || []); setEditingDraftId(null); setShowCompose(true); };
  const openDraft = (mail: Correo) => { setComposeTo(users.find(u => u.uid === (mail.draftToUid || mail.toUid)) || null); setComposeSubject(mail.subject); setComposeBody(mail.body); setComposeAttachments(mail.attachments || []); setEditingDraftId(mail.id); setShowCompose(true); };
  const handleDownload = async (att: Attachment) => {
    const res = await fetch(att.url); const blob = await res.blob();
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = att.name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const filteredUsers = users.filter(u => u.uid !== uid && (
    u.displayName?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  ));

  const FOLDERS = [
    { id: 'inbox', label: 'Bandeja de entrada', icon: Inbox, badge: unreadCount },
    { id: 'sent', label: 'Enviados', icon: Send, badge: 0 },
    { id: 'starred', label: 'Destacados', icon: Star, badge: 0 },
    { id: 'drafts', label: 'Borradores', icon: FileText, badge: draftCount },
    { id: 'trash', label: 'Papelera', icon: Trash2, badge: 0 },
  ] as const;

  const emptyStates: Record<Folder, { icon: React.ElementType; title: string; sub: string }> = {
    inbox: { icon: Inbox, title: 'Bandeja vacía', sub: 'No tienes correos nuevos' },
    sent: { icon: Send, title: 'Nada enviado aún', sub: 'Los correos enviados aparecerán aquí' },
    drafts: { icon: FileText, title: 'Sin borradores', sub: 'Guarda un correo como borrador' },
    trash: { icon: Trash2, title: 'Papelera vacía', sub: 'Los correos eliminados aparecerán aquí' },
    starred: { icon: Star, title: 'Sin destacados', sub: 'Marca correos con estrella' },
  };

  const Avatar = ({ src, name, size = 'md' }: { src?: string; name?: string; size?: 'sm' | 'md' | 'lg' }) => {
    const sizeMap = {
      sm: 'w-6 h-6 rounded-lg text-[10px]',
      md: 'w-9 h-9 rounded-xl text-sm',
      lg: 'w-11 h-11 rounded-2xl text-base',
    };
    return (
      <div className={`${sizeMap[size]} flex-shrink-0 overflow-hidden flex items-center justify-center correo-avatar`}>
        {src
          ? <img src={src} alt={name} className="w-full h-full object-cover" />
          : <span className="font-light" style={{ color: 'var(--correo-text-primary)' }}>{name?.[0]?.toUpperCase()}</span>}
      </div>
    );
  };

  const handleFolderSelect = (folderId: Folder) => {
    setActiveFolder(folderId);
    setOnlyUnread(false);
    setSelectedMail(null);
    setMobileView('list');
    setShowMobileSidebar(false);
  };

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <section className="moon-module moon-module--correo">
      <header className="enterprise-mail-heading">
        <div><span className="enterprise-kicker"><span aria-hidden="true" />Equipo · Comunicación interna</span><h1 className="moon-page-title">Correo del equipo</h1><p>{unreadCount} sin leer · {draftCount} borradores guardados</p></div>
        <button type="button" className="enterprise-action enterprise-action--primary" title="Redactar (Ctrl + Alt + N)" onClick={() => { resetCompose(); setShowCompose(true); }}><Plus />Redactar</button>
      </header>
      <style>{`
        /* ── Correo theme tokens ── */
        :root,
        html.dark {
          --correo-bg: hsl(var(--background));
          --correo-surface: hsl(var(--card));
          --correo-surface-hover: hsl(var(--muted));
          --correo-border: hsl(var(--border));
          --correo-text-primary: hsl(var(--foreground));
          --correo-text-secondary: hsl(var(--muted-foreground));
          --correo-text-muted: hsl(var(--muted-foreground));
          --correo-input-bg: hsl(var(--muted));
          --correo-selected-bg: hsl(var(--accent));
          --correo-unread-bg: hsl(var(--card));
          --correo-unread-dot: hsl(var(--foreground));
          --correo-sidebar-bg: hsl(var(--card));
          --correo-divider: hsl(var(--border));
          --correo-compose-bg: hsl(var(--card));
          --correo-badge-bg: hsl(var(--foreground));
          --correo-badge-text: hsl(var(--background));
          --correo-btn-primary-bg: hsl(var(--foreground));
          --correo-btn-primary-text: hsl(var(--background));
          --correo-overlay: rgba(0,0,0,0.5);
          --correo-shadow: 0 20px 60px rgba(0,0,0,0.3);
          --correo-shadow-sm: 0 4px 16px rgba(0,0,0,0.15);
        }
        html.light {
          --correo-bg: #f4f4f5;
          --correo-surface: #ffffff;
          --correo-surface-hover: #f0f0f1;
          --correo-border: #e4e4e7;
          --correo-text-primary: #09090b;
          --correo-text-secondary: #71717a;
          --correo-text-muted: #6b6b75;
          --correo-input-bg: #f4f4f5;
          --correo-selected-bg: #f0f0f1;
          --correo-unread-bg: #fafafa;
          --correo-unread-dot: #18181b;
          --correo-sidebar-bg: #ffffff;
          --correo-divider: #e4e4e7;
          --correo-compose-bg: #ffffff;
          --correo-badge-bg: #18181b;
          --correo-badge-text: #ffffff;
          --correo-btn-primary-bg: #18181b;
          --correo-btn-primary-text: #ffffff;
          --correo-overlay: rgba(0,0,0,0.3);
          --correo-shadow: 0 20px 60px rgba(0,0,0,0.12);
          --correo-shadow-sm: 0 4px 16px rgba(0,0,0,0.06);
        }

        /* ── Avatar token ── */
        .correo-avatar {
          background: var(--correo-input-bg);
          border: 1px solid var(--correo-border);
        }

        /* ── Mail item hover ── */
        .correo-mail-item { transition: background 0.15s ease; }
        .correo-mail-item:hover { background: var(--correo-surface-hover) !important; }

        /* ── Folder button ── */
        .correo-folder-btn { transition: all 0.15s ease; }
        .correo-folder-btn:hover { background: var(--correo-surface-hover) !important; }

        /* ── Input themed ── */
        .correo-input {
          background: var(--correo-input-bg) !important;
          border: 1px solid var(--correo-border) !important;
          color: var(--correo-text-primary) !important;
        }
        .correo-input:focus { outline: none; border-color: var(--accent-color, #6366f1) !important; }
        .correo-input::placeholder { color: var(--correo-text-muted) !important; }

        /* ── Scrollbar ── */
        .correo-scroll::-webkit-scrollbar { width: 3px; height: 3px; }
        .correo-scroll::-webkit-scrollbar-track { background: transparent; }
        .correo-scroll::-webkit-scrollbar-thumb { background: var(--correo-border); border-radius: 4px; }

        /* ── Mobile overlay ── */
        .correo-mobile-overlay {
          position: fixed; inset: 0; z-index: 40;
          background: var(--correo-overlay);
          backdrop-filter: blur(4px);
          animation: correoFadeIn 0.2s ease;
        }
        .correo-mobile-sidebar {
          position: fixed; left: 0; top: 0; bottom: 0; z-index: 50;
          width: 280px;
          background: var(--correo-sidebar-bg);
          border-right: 1px solid var(--correo-border);
          box-shadow: var(--correo-shadow);
          animation: correoSlideRight 0.25s cubic-bezier(0.34,1.56,0.64,1);
          display: flex; flex-direction: column;
        }

        /* ── Animations ── */
        @keyframes correoFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes correoSlideRight { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        @keyframes correoSlideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes correoMailIn { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
        @keyframes correoDetailIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }

        .correo-mail-anim { animation: correoMailIn 0.15s ease forwards; }
        .correo-detail-anim { animation: correoDetailIn 0.2s ease forwards; }
        .correo-up-anim { animation: correoSlideUp 0.2s ease forwards; }

        /* ── Responsive ── */
        @media (max-width: 1099px) {
          .correo-desktop-only { display: none !important; }
        }
        @media (min-width: 1100px) {
          .correo-mobile-only { display: none !important; }
        }

        /* ── Alert banner ── */
        .correo-alert {
          position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
          z-index: 50; display: flex; align-items: center; gap: 8px;
          padding: 8px 16px; border-radius: 100px;
          background: var(--correo-btn-primary-bg);
          color: var(--correo-btn-primary-text);
          border: 1px solid var(--correo-border);
          font-size: 12px; font-weight: 300;
          box-shadow: var(--correo-shadow-sm);
          white-space: nowrap; cursor: pointer;
          animation: correoSlideUp 0.2s ease;
        }
      `}</style>

      {/* ── Mobile sidebar overlay ── */}
      <AnimatePresence>
        {showMobileSidebar && (
          <>
            <div className="correo-mobile-overlay correo-mobile-only" onClick={() => setShowMobileSidebar(false)} />
            <div className="correo-mobile-sidebar correo-mobile-only">
              {/* Mobile sidebar header */}
              <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--correo-border)' }}>
                <span className="text-sm font-light flex items-center gap-2" style={{ color: 'var(--correo-text-primary)' }}>
                  <Mail className="w-4 h-4" /> Correo
                </span>
                <button onClick={() => setShowMobileSidebar(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--correo-surface-hover)', color: 'var(--correo-text-secondary)', border: 'none' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Compose btn mobile */}
              <div className="p-3 border-b" style={{ borderColor: 'var(--correo-border)' }}>
                <button onClick={() => { resetCompose(); setShowCompose(true); setShowMobileSidebar(false); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-light"
                  style={{ background: 'var(--correo-btn-primary-bg)', color: 'var(--correo-btn-primary-text)', border: 'none' }}>
                  <Plus className="w-4 h-4" strokeWidth={1.5} /> Redactar
                </button>
              </div>
              {/* Folders mobile */}
              <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto correo-scroll">
                {FOLDERS.map(item => (
                  <button key={item.id}
                    onClick={() => handleFolderSelect(item.id as Folder)}
                    className="correo-folder-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-light"
                    style={{
                      background: activeFolder === item.id ? 'var(--correo-selected-bg)' : 'transparent',
                      color: panelInk(activeFolder === item.id ? 'var(--correo-text-primary)' : 'var(--correo-text-secondary)'),
                      border: 'none',
                    }}>
                    <item.icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--correo-badge-bg)', color: 'var(--correo-badge-text)' }}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
              {/* Quick contacts mobile */}
              <div className="p-3 border-t" style={{ borderColor: 'var(--correo-border)' }}>
                <p className="text-[9px] uppercase tracking-widest font-light mb-2" style={{ color: 'var(--correo-text-muted)' }}>Contactos</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto correo-scroll">
                  {users.filter(u => u.uid !== uid).map(u => (
                    <button key={u.uid}
                      onClick={() => { setComposeTo(u); setComposeSubject(''); setComposeBody(''); setComposeAttachments([]); setEditingDraftId(null); setShowCompose(true); setShowMobileSidebar(false); }}
                      className="correo-folder-btn w-full flex items-center gap-2 px-2 py-1.5 rounded-xl"
                      style={{ background: 'transparent', border: 'none' }}>
                      <Avatar src={u.avatar} name={u.displayName} size="sm" />
                      <span className="text-xs font-light truncate" style={{ color: 'var(--correo-text-secondary)' }}>{u.displayName}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Layout ── */}
      <div data-moon-reveal="card" className="moon-panel flex rounded-2xl overflow-hidden border relative"
        style={{
          background: 'var(--correo-bg)',
          borderColor: 'var(--correo-border)',
          height: '100%',
        }}>

        {/* New mail banner */}
        <AnimatePresence>
          {newMailAlert && (
            <div className="correo-alert" onClick={() => { setActiveFolder('inbox'); setNewMailAlert(false); }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--correo-btn-primary-text)', animation: 'pulse 2s infinite' }} />
              Nuevo correo recibido
              <button onClick={e => { e.stopPropagation(); setNewMailAlert(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 0, marginLeft: 4, color: 'inherit' }}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </AnimatePresence>

        {/* ── Desktop Sidebar ── */}
        <aside className="correo-desktop-only w-52 flex-shrink-0 flex flex-col border-r"
          style={{ background: 'var(--correo-sidebar-bg)', borderColor: 'var(--correo-border)' }}>
          <div className="p-3 border-b" style={{ borderColor: 'var(--correo-border)' }}>
            <button onClick={() => { resetCompose(); setShowCompose(true); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90"
              style={{ background: 'var(--correo-btn-primary-bg)', color: 'var(--correo-btn-primary-text)', border: 'none' }}>
              <Plus className="w-4 h-4" strokeWidth={1.5} /> Redactar
            </button>
          </div>
          <nav className="flex-1 py-2 px-2 space-y-0.5">
            {FOLDERS.map(item => (
              <button key={item.id}
                onClick={() => handleFolderSelect(item.id as Folder)}
                className="correo-folder-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-light"
                style={{
                  background: activeFolder === item.id ? 'var(--correo-selected-bg)' : 'transparent',
                  color: panelInk(activeFolder === item.id ? 'var(--correo-text-primary)' : 'var(--correo-text-secondary)'),
                  border: 'none',
                }}>
                <item.icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.badge > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--correo-badge-bg)', color: 'var(--correo-badge-text)' }}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          {/* Quick contacts */}
          <div className="p-3 border-t" style={{ borderColor: 'var(--correo-border)' }}>
            <p className="text-[9px] uppercase tracking-widest font-light mb-2" style={{ color: 'var(--correo-text-muted)' }}>Contactos</p>
            <div className="space-y-0.5 max-h-36 overflow-y-auto correo-scroll">
              {users.filter(u => u.uid !== uid).map(u => (
                <button key={u.uid}
                  onClick={() => { setComposeTo(u); setComposeSubject(''); setComposeBody(''); setComposeAttachments([]); setEditingDraftId(null); setShowCompose(true); }}
                  className="correo-folder-btn w-full flex items-center gap-2 px-2 py-1.5 rounded-xl"
                  style={{ background: 'transparent', border: 'none' }}>
                  <Avatar src={u.avatar} name={u.displayName} size="sm" />
                  <span className="text-xs font-light truncate" style={{ color: 'var(--correo-text-secondary)' }}>{u.displayName}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Mail List Panel ── */}
        <div className={`enterprise-mail-list flex flex-col border-r ${
          // Desktop: always visible if no mail selected, or w-72 if selected
          // Mobile: visible only when mobileView === 'list'
          selectedMail
            ? 'correo-desktop-only md:flex md:w-72 md:flex-shrink-0'
            : 'flex-1 md:flex-none md:w-72 md:flex-shrink-0'
        } ${mobileView === 'detail' ? 'correo-mobile-only' : ''}`}
          style={{
            borderColor: 'var(--correo-border)',
            background: 'var(--correo-surface)',
            // Mobile: full width when shown
            ...(mobileView === 'list' ? { display: 'flex', flexDirection: 'column' } : {}),
          }}>

          {/* Toolbar */}
          <div className="enterprise-mail-toolbar flex items-center gap-2 border-b flex-shrink-0"
            style={{ borderColor: 'var(--correo-border)' }}>
            {/* Mobile menu button */}
            <button onClick={() => setShowMobileSidebar(true)}
              aria-label="Abrir carpetas del correo" className="correo-mobile-only w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--correo-surface-hover)', color: 'var(--correo-text-secondary)', border: 'none' }}>
              <Menu className="w-4 h-4" />
            </button>

            {/* Folder name */}
            <span className="text-sm font-light flex-1 truncate"
              style={{ color: 'var(--correo-text-primary)' }}>
              {FOLDERS.find(f => f.id === activeFolder)?.label}
            </span>

            {activeFolder === 'trash' && folderMails.length > 0 && (
              <button onClick={emptyTrash}
                className="flex items-center gap-1 text-xs font-light px-2.5 py-1 rounded-lg"
                style={{ color: panelInk('#f87171'), background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
                <Trash2 className="w-3 h-3" strokeWidth={1.5} /> Vaciar
              </button>
            )}

            {/* Search */}
            <div className="enterprise-mail-search relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--correo-text-muted)' }} strokeWidth={1.5} />
              <input
                value={searchQuery}
                aria-label="Buscar en el correo"
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="correo-input pl-7 pr-3 py-1.5 rounded-xl text-xs font-light outline-none"
              />
            </div>
          </div>

          <div className="enterprise-mail-options" aria-label="Opciones del correo">
            {activeFolder === 'inbox' && <button type="button" aria-pressed={onlyUnread} onClick={() => setOnlyUnread(v => !v)}>Solo sin leer</button>}
            <button type="button" aria-pressed={oldestFirst} onClick={() => setOldestFirst(v => !v)}>{oldestFirst ? 'Antiguos primero' : 'Recientes primero'}</button>
            {(searchQuery || onlyUnread) && <button type="button" onClick={() => { setSearchQuery(''); setOnlyUnread(false); }}>Limpiar</button>}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto correo-scroll">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--correo-text-muted)' }} />
              </div>
            ) : folderMails.length === 0 ? (
              (() => {
                const e = emptyStates[activeFolder];
                return (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center correo-up-anim">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'var(--correo-surface-hover)', border: `1px solid var(--correo-border)` }}>
                      <e.icon className="w-5 h-5" style={{ color: 'var(--correo-text-muted)' }} strokeWidth={1} />
                    </div>
                    <p className="text-sm font-light mb-1" style={{ color: 'var(--correo-text-primary)' }}>{e.title}</p>
                    <p className="text-xs font-light" style={{ color: 'var(--correo-text-secondary)' }}>{e.sub}</p>
                  </div>
                );
              })()
            ) : (
              <div>
                {folderMails.map((mail, idx) => {
                  const isUnread = mail.toUid === uid && !mail.read;
                  const isSelected = selectedMail?.id === mail.id;
                  const av = mail.fromUid === uid ? mail.toAvatar : mail.fromAvatar;
                  const nm = mail.fromUid === uid ? mail.toName : mail.fromName;
                  return (
                    <div data-moon-reveal="row" key={mail.id}
                      className="correo-mail-item px-3 py-3 cursor-pointer border-b relative"
                      style={{
                        borderBottomColor: 'var(--correo-divider)',
                        background: isSelected
                          ? 'var(--correo-selected-bg)'
                          : isUnread
                            ? 'var(--correo-unread-bg)'
                            : 'transparent',
                        borderLeft: `2px solid ${isSelected ? 'var(--correo-text-primary)' : 'transparent'}`,
                        animationDelay: `${idx * 0.02}s`,
                      }}
                      onClick={() => {
                        if (mail.draft) { openDraft(mail); return; }
                        markRead(mail);
                      }}>
                      <div className="flex items-start gap-2.5">
                        <Avatar src={av} name={nm} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-sm truncate font-light"
                              style={{ color: panelInk(isUnread ? 'var(--correo-text-primary)' : 'var(--correo-text-secondary)'), fontWeight: isUnread ? 400 : 300 }}>
                              {nm}
                            </span>
                            <span className="text-[10px] font-light flex-shrink-0"
                              style={{ color: 'var(--correo-text-muted)' }}>
                              {formatDate(mail.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs truncate mb-0.5 font-light"
                            style={{ color: panelInk(isUnread ? 'var(--correo-text-primary)' : 'var(--correo-text-muted)') }}>
                            {mail.draft && <span style={{ color: panelInk('#eab308'), marginRight: 4 }}>[Borrador]</span>}
                            <EmojiText text={mail.subject || '(Sin asunto)'} size={16} />
                          </p>
                          <p className="text-[11px] font-light truncate"
                            style={{ color: 'var(--correo-text-muted)' }}>
                            <EmojiText text={mail.body?.replace(/\n/g, ' ') ?? ''} size={16} />
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {isUnread && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--correo-unread-dot)' }} />}
                            {uid && destacado(mail, uid) && <Star className="w-3 h-3 moon-panel-tone-amber fill-yellow-400" />}
                            {mail.attachments?.length > 0 && <Paperclip className="w-3 h-3" style={{ color: 'var(--correo-text-muted)' }} />}
                            {mail.forwarded && <Forward className="w-3 h-3" style={{ color: 'var(--correo-text-muted)' }} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Detail Panel ── */}
        <AnimatePresence mode="wait">
          {selectedMail ? (
            <div key="detail"
              className={`flex-1 flex flex-col overflow-hidden min-w-0 correo-detail-anim ${mobileView === 'list' ? 'correo-mobile-only' : ''}`}
              style={{ background: 'var(--correo-bg)' }}>
              {/* Toolbar */}
              <div className="h-12 flex items-center gap-2 px-4 border-b flex-shrink-0"
                style={{ borderColor: 'var(--correo-border)' }}>
                <button
                  onClick={() => { setSelectedMail(null); setMobileView('list'); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all correo-folder-btn"
                  style={{ color: 'var(--correo-text-secondary)', background: 'transparent', border: 'none' }}>
                  <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <div className="flex-1" />
                {/* Action buttons */}
                {[
                  { icon: Star, color: (uid && destacado(selectedMail, uid)) ? '#facc15' : 'var(--correo-text-secondary)', fn: () => toggleStar(selectedMail), title: 'Destacar' },
                  { icon: Reply, color: 'var(--correo-text-secondary)', fn: () => openReply(selectedMail), title: 'Responder' },
                  { icon: Forward, color: 'var(--correo-text-secondary)', fn: () => openForward(selectedMail), title: 'Reenviar' },
                  ...(activeFolder === 'trash' ? [{ icon: RefreshCw, color: 'var(--correo-text-secondary)', fn: () => restoreMail(selectedMail), title: 'Restaurar' }] : []),
                ].map(({ icon: Icon, color, fn, title }, i) => (
                  <button key={i} onClick={fn} title={title}
                    className="correo-folder-btn w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ color: panelInk(color), background: 'transparent', border: 'none' }}>
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ fill: Icon === Star && (uid && destacado(selectedMail, uid)) ? '#facc15' : 'none' }} />
                  </button>
                ))}
                <button onClick={() => deleteMail(selectedMail)}
                  className="correo-folder-btn w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ color: 'var(--correo-text-secondary)', background: 'transparent', border: 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--correo-text-secondary)'}>
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 md:p-7 correo-scroll">
                <h1 className="moon-page-title text-lg md:text-xl font-light mb-4 md:mb-5 leading-snug"
                  style={{ color: 'var(--correo-text-primary)' }}>
                  <EmojiText text={selectedMail.subject || '(Sin asunto)'} />
                </h1>

                <div className="flex items-start gap-3 mb-5 pb-4 md:pb-5 border-b"
                  style={{ borderColor: 'var(--correo-divider)' }}>
                  <Avatar src={selectedMail.fromAvatar} name={selectedMail.fromName} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-sm font-light" style={{ color: 'var(--correo-text-primary)' }}>{selectedMail.fromName}</span>
                        <span className="text-xs font-light ml-2" style={{ color: 'var(--correo-text-secondary)' }}>
                          {users.find(u => u.uid === selectedMail.fromUid)?.email}
                        </span>
                      </div>
                      <span className="text-[11px] font-light flex-shrink-0" style={{ color: 'var(--correo-text-muted)' }}>
                        {selectedMail.createdAt?.toDate
                          ? format(selectedMail.createdAt.toDate(), "d 'de' MMMM 'a las' HH:mm", { locale: es })
                          : ''}
                      </span>
                    </div>
                    <p className="text-xs font-light mt-0.5" style={{ color: 'var(--correo-text-secondary)' }}>
                      Para: <span style={{ color: 'var(--correo-text-primary)' }}>{selectedMail.toName}</span>
                    </p>
                    {selectedMail.fromRole && (
                      <span className="text-[11px] font-light" style={{ color: 'var(--correo-text-muted)' }}>{selectedMail.fromRole}</span>
                    )}
                  </div>
                </div>

                <p className="text-sm font-light leading-relaxed whitespace-pre-wrap mb-6 md:mb-8"
                  style={{ color: 'var(--correo-text-secondary)' }}>
                  <EmojiText text={selectedMail.body} />
                </p>

                {selectedMail.attachments?.length > 0 && (
                  <div className="space-y-3 mb-6 md:mb-8">
                    <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: 'var(--correo-text-muted)' }}>
                      {selectedMail.attachments.length} adjunto{selectedMail.attachments.length !== 1 ? 's' : ''}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedMail.attachments.map((att, i) => (
                        <div data-moon-reveal="card" key={i} className="moon-panel rounded-2xl overflow-hidden border"
                          style={{ background: 'var(--correo-surface)', borderColor: 'var(--correo-border)' }}>
                          {att.type.startsWith('image/') ? (
                            <div className="aspect-video overflow-hidden cursor-pointer"
                              onClick={() => { setViewerFile(att); setShowViewer(true); }}>
                              <img src={att.url} alt={att.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                            </div>
                          ) : (
                            <div className="aspect-video flex items-center justify-center"
                              style={{ background: 'var(--correo-surface-hover)' }}>
                              <File className="w-10 h-10" style={{ color: 'var(--correo-text-muted)' }} strokeWidth={1} />
                            </div>
                          )}
                          <div className="p-2.5 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-light truncate" style={{ color: 'var(--correo-text-primary)' }}>{att.name}</p>
                              <p className="text-[10px] font-light" style={{ color: 'var(--correo-text-muted)' }}>{formatSize(att.size)}</p>
                            </div>
                            <div className="flex gap-1">
                              {att.type.startsWith('image/') && (
                                <button onClick={() => { setViewerFile(att); setShowViewer(true); }}
                                  className="correo-folder-btn w-7 h-7 rounded-lg flex items-center justify-center"
                                  style={{ color: 'var(--correo-text-secondary)', background: 'transparent', border: 'none' }}>
                                  <Eye className="w-3 h-3" strokeWidth={1.5} />
                                </button>
                              )}
                              <button onClick={() => handleDownload(att)}
                                className="correo-folder-btn w-7 h-7 rounded-lg flex items-center justify-center"
                                style={{ color: 'var(--correo-text-secondary)', background: 'transparent', border: 'none' }}>
                                <Download className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reply/Forward buttons */}
                <div className="flex gap-2 pt-4 border-t" style={{ borderColor: 'var(--correo-divider)' }}>
                  {[
                    { icon: Reply, label: 'Responder', fn: () => openReply(selectedMail) },
                    { icon: Forward, label: 'Reenviar', fn: () => openForward(selectedMail) },
                  ].map(({ icon: Icon, label, fn }) => (
                    <button key={label} onClick={fn}
                      className="correo-folder-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-light border"
                      style={{ borderColor: 'var(--correo-border)', color: 'var(--correo-text-secondary)', background: 'transparent' }}>
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div key="empty"
              className="correo-desktop-only flex-1 flex-col items-center justify-center text-center correo-up-anim"
              style={{ display: 'flex' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'var(--correo-surface-hover)', border: `1px solid var(--correo-border)` }}>
                <Mail className="w-7 h-7" style={{ color: 'var(--correo-text-muted)' }} strokeWidth={1} />
              </div>
              <p className="text-sm font-light" style={{ color: 'var(--correo-text-secondary)' }}>Selecciona un correo para leerlo</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Compose Dialog ── */}
      <Dialog open={showCompose} onOpenChange={o => { if (!o) resetCompose(); setShowCompose(o); }}>
        <DialogContent
          className="p-0 gap-0 overflow-hidden"
          style={{
            background: 'var(--correo-compose-bg)',
            border: `1px solid var(--correo-border)`,
            borderRadius: '20px',
            maxWidth: 'min(672px, 96vw)',
            width: '100%',
            boxShadow: 'var(--correo-shadow)',
          }}>
          <DialogHeader className="px-5 py-4 border-b" style={{ borderColor: 'var(--correo-border)' }}>
            <DialogTitle className="font-light text-base" style={{ color: 'var(--correo-text-primary)' }}>
              {editingDraftId ? 'Editar borrador' : 'Nuevo correo'}
            </DialogTitle>
          </DialogHeader>

          <div className="divide-y" style={{ borderColor: 'var(--correo-border)' }}>
            {/* To */}
            <div className="flex items-center gap-3 px-5 py-3" ref={userDropdownRef}>
              <span className="text-xs font-light w-14 flex-shrink-0" style={{ color: 'var(--correo-text-secondary)' }}>Para</span>
              {composeTo ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{ background: 'var(--correo-surface-hover)', border: `1px solid var(--correo-border)` }}>
                  <Avatar src={composeTo.avatar} name={composeTo.displayName} size="sm" />
                  <span className="text-sm font-light" style={{ color: 'var(--correo-text-primary)' }}>{composeTo.displayName}</span>
                  <button onClick={() => setComposeTo(null)}
                    style={{ color: 'var(--correo-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex-1 relative">
                  <input
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                    onFocus={() => setShowUserDropdown(true)}
                    placeholder="Buscar usuario..."
                    className="w-full bg-transparent text-sm font-light outline-none"
                    style={{ color: 'var(--correo-text-primary)' }}
                  />
                  {showUserDropdown && filteredUsers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto mt-1 border correo-scroll"
                      style={{ background: 'var(--correo-compose-bg)', borderColor: 'var(--correo-border)', boxShadow: 'var(--correo-shadow)' }}>
                      {filteredUsers.map(u => (
                        <button key={u.uid}
                          onClick={() => { setComposeTo(u); setUserSearch(''); setShowUserDropdown(false); }}
                          className="correo-folder-btn w-full flex items-center gap-3 px-3 py-2.5 text-left"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                          <Avatar src={u.avatar} name={u.displayName} />
                          <div>
                            <p className="text-sm font-light" style={{ color: 'var(--correo-text-primary)' }}>{u.displayName}</p>
                            <p className="text-xs font-light" style={{ color: 'var(--correo-text-secondary)' }}>{u.email}</p>
                          </div>
                          <span className="ml-auto text-xs font-light" style={{ color: 'var(--correo-text-muted)' }}>{u.role}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="text-xs font-light w-14 flex-shrink-0" style={{ color: 'var(--correo-text-secondary)' }}>Asunto</span>
              <input
                ref={subjectEmojiRef}
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder="Escribe el asunto..."
                className="flex-1 bg-transparent text-sm font-light outline-none"
                style={{ color: 'var(--correo-text-primary)' }}
              />
              <EmojiButton value={composeSubject} onChange={setComposeSubject} inputRef={subjectEmojiRef} disabled={sendingMail} unicodeOnly label="Añadir emoji al asunto" />
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <textarea
                ref={bodyEmojiRef}
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder="Escribe tu mensaje aquí..."
                rows={8}
                maxLength={5000}
                className="w-full bg-transparent text-sm font-light outline-none resize-none leading-relaxed"
                style={{ color: 'var(--correo-text-primary)', minHeight: '160px' }}
              />
              <div className="flex justify-between items-center mt-1">
                <EmojiButton value={composeBody} onChange={setComposeBody} inputRef={bodyEmojiRef} maxLength={5000} disabled={sendingMail} unicodeOnly label="Añadir emoji al correo" />
                <span className="text-xs font-light" style={{ color: panelInk(composeBody.length > 4500 ? '#f87171' : 'var(--correo-text-muted)') }}>
                  {composeBody.length} / 5000
                </span>
              </div>
            </div>

            {/* Attachments */}
            {composeAttachments.length > 0 && (
              <div className="px-5 py-3 flex flex-wrap gap-2">
                {composeAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                    style={{ background: 'var(--correo-surface-hover)', borderColor: 'var(--correo-border)' }}>
                    {att.type.startsWith('image/') ? <Image className="w-3 h-3" style={{ color: 'var(--correo-text-secondary)' }} /> : <File className="w-3 h-3" style={{ color: 'var(--correo-text-secondary)' }} />}
                    <span className="text-xs font-light max-w-[120px] truncate" style={{ color: 'var(--correo-text-primary)' }}>{att.name}</span>
                    <span className="text-xs font-light" style={{ color: 'var(--correo-text-muted)' }}>{formatSize(att.size)}</span>
                    <button onClick={() => setComposeAttachments(p => p.filter((_, j) => j !== i))}
                      style={{ color: 'var(--correo-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--correo-text-secondary)'}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t flex-wrap gap-2"
            style={{ background: 'var(--correo-surface-hover)', borderColor: 'var(--correo-border)' }}>
            <div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleFileUpload(e.target.files)} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFiles}
                className="correo-folder-btn flex items-center gap-2 text-sm font-light px-3 py-2 rounded-xl"
                style={{ color: 'var(--correo-text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                {uploadingFiles ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" strokeWidth={1.5} />}
                <span className="hidden sm:inline">{uploadingFiles ? 'Subiendo...' : 'Adjuntar'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleSend(true)} disabled={sendingMail}
                className="correo-folder-btn px-3 py-2 rounded-xl text-sm font-light"
                style={{ color: 'var(--correo-text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <span className="hidden sm:inline">Guardar borrador</span>
                <FileText className="w-4 h-4 sm:hidden" />
              </button>
              <button onClick={() => handleSend(false)} disabled={sendingMail || !composeTo}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40 transition-all"
                style={{ background: 'var(--correo-btn-primary-bg)', color: 'var(--correo-btn-primary-text)', border: 'none', cursor: 'pointer' }}>
                {sendingMail
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> <span className="hidden sm:inline">Enviando...</span></>
                  : <><Send className="w-3.5 h-3.5" strokeWidth={1.5} /> <span className="hidden sm:inline">Enviar</span></>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── File viewer ── */}
      <Dialog open={showViewer} onOpenChange={setShowViewer}>
        <DialogContent showCloseButton={false}
          className="p-0 overflow-hidden"
          style={{
            background: 'var(--correo-compose-bg)',
            border: `1px solid var(--correo-border)`,
            borderRadius: '20px',
            maxWidth: 'min(56rem, 96vw)',
            width: '100%',
            boxShadow: 'var(--correo-shadow)',
          }}>
          {viewerFile && (
            <div className="flex flex-col" style={{ maxHeight: '90vh' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'var(--correo-border)' }}>
                <span className="font-light text-sm truncate" style={{ color: 'var(--correo-text-primary)' }}>{viewerFile.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDownload(viewerFile)}
                    className="correo-folder-btn w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ color: 'var(--correo-text-secondary)', background: 'transparent', border: 'none' }}>
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => setShowViewer(false)}
                    className="correo-folder-btn w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ color: 'var(--correo-text-secondary)', background: 'transparent', border: 'none' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                {viewerFile.type.startsWith('image/') && (
                  <img src={viewerFile.url} alt={viewerFile.name} className="max-w-full max-h-full object-contain rounded-xl" />
                )}
                {viewerFile.type === 'application/pdf' && (
                  <iframe src={viewerFile.url} className="w-full border-0 rounded-xl" style={{ height: '75vh' }} title={viewerFile.name} />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default CorreoComponent;
