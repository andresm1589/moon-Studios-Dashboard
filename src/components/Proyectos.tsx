import { panelInk } from '@/lib/panelColors';
import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
/**
 * Proyectos.tsx — Panel de Proyectos de la empresa
 * ─────────────────────────────────────────────────────────────────
 * • TODOS los usuarios pueden ver los proyectos
 * • CEO / Administración / Programación pueden crear y editar
 *   (igual que las reglas de Firestore); eliminar, solo CEO / Administración
 * • Cada proyecto tiene: portada (Supabase), datos básicos, estado,
 *   prioridad, progreso, miembros, links, etiquetas, stack,
 *   y un sistema de BLOQUES de contenido rico (texto, idea, árbol,
 *   esquema, lista, imagen, enlace, divider).
 * • Colección Firestore: dev_projects
 * • Bucket Supabase:     project-covers
 * ─────────────────────────────────────────────────────────────────
 */

import React, {
  useState, useEffect, useRef, useCallback, Fragment,
} from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query, orderBy,
  getDocs, where, writeBatch,
} from 'firebase/firestore';
import { db, subscribeToUsers } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/lib/supabaseclient';
import {
  Plus, Loader2, Trash2, Pencil, X, Upload,
   ChevronRight,
  FolderKanban, CalendarDays, Users2,
  Link2, ExternalLink, CheckCircle2, Clock, AlertCircle,
  Github, Globe, BookOpen, Layers,
  PlusCircle, Save, Search, Package, Archive,
  Play, Pause, Lightbulb, AlignLeft, List,
  GitBranch, Minus, Image as ImageIcon,
  GripVertical, Sparkles, Code2, Star, ChevronUp, ChevronDown,
  LayoutGrid, LayoutList,
  ArrowUpRight, Flag, Hash, Workflow,
} from 'lucide-react';
import { leerCamposComunes, escribirCamposComunes } from '@/lib/devProjects';
import WorkViewToolbar from './work/WorkViewToolbar';
import { exportWorkspaceCsv } from '@/lib/workspaceExport';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived' | 'cancelled';
type Priority      = 'low' | 'medium' | 'high' | 'critical';
type BlockType =
  | 'text' | 'idea' | 'tree' | 'schema' | 'list'
  | 'image' | 'link' | 'divider' | 'code' | 'note';

interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
}

interface Block {
  id: string;
  type: BlockType;
  title?: string;
  content?: string;       // text / idea / note / code
  items?: string[];       // list
  tree?: TreeNode[];      // tree
  url?: string;           // link / image
  linkLabel?: string;     // link
  order: number;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  coverUrl?: string;
  coverPath?: string;
  color?: string;          // color de acento del proyecto
  tags: string[];
  repoUrl?: string;
  liveUrl?: string;
  docsUrl?: string;
  leadName?: string;
  lead?: string;
  members: string[];
  startDate?: string;
  endDate?: string;
  blocks: Block[];
  progress: number;
  tech: string[];
  pinned?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET = 'project-covers';

const STATUS_CFG: Record<ProjectStatus, { label: string; color: string; icon: React.FC<any> }> = {
  planning:  { label: 'Planificación', color: '#a78bfa', icon: Clock        },
  active:    { label: 'Activo',        color: '#34d399', icon: Play         },
  paused:    { label: 'Pausado',       color: '#fb923c', icon: Pause        },
  completed: { label: 'Completado',    color: '#60a5fa', icon: CheckCircle2 },
  archived:  { label: 'Archivado',     color: '#6b7280', icon: Archive      },
  // Estado que pone Programación. Sin esta entrada, un proyecto cancelado allá
  // rompía esta pantalla (STATUS_CFG[status] era undefined).
  cancelled: { label: 'Cancelado',     color: '#f87171', icon: X            },
};

const PRIORITY_CFG: Record<Priority, { label: string; color: string }> = {
  low:      { label: 'Baja',    color: '#34d399' },
  medium:   { label: 'Media',   color: '#fbbf24' },
  high:     { label: 'Alta',    color: '#fb923c' },
  critical: { label: 'Crítica', color: '#f87171' },
};

const BLOCK_CFG: Record<BlockType, { label: string; icon: React.FC<any>; color: string }> = {
  text:    { label: 'Texto',    icon: AlignLeft,   color: '#60a5fa' },
  idea:    { label: 'Idea',     icon: Lightbulb,   color: '#fbbf24' },
  tree:    { label: 'Árbol',    icon: GitBranch,   color: '#34d399' },
  schema:  { label: 'Esquema',  icon: Workflow,    color: '#a78bfa' },
  list:    { label: 'Lista',    icon: List,        color: '#fb923c' },
  image:   { label: 'Imagen',   icon: ImageIcon,   color: '#ec4899' },
  link:    { label: 'Enlace',   icon: Link2,       color: '#38bdf8' },
  divider: { label: 'Divisor',  icon: Minus,       color: '#6b7280' },
  code:    { label: 'Código',   icon: Code2,       color: '#818cf8' },
  note:    { label: 'Nota',     icon: Sparkles,    color: '#f472b6' },
};

const PROJECT_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e',
  '#f97316','#eab308','#22c55e','#14b8a6','#0ea5e9','#64748b',
];

const BLANK_PROJECT: Omit<Project, 'id'> = {
  name: '', description: '', status: 'planning', priority: 'medium',
  tags: [], members: [], blocks: [], progress: 0, tech: [],
  color: '#6366f1', leadName: '', repoUrl: '', liveUrl: '', docsUrl: '',
  startDate: '', endDate: '', pinned: false,
};

const genId = () => Math.random().toString(36).slice(2, 10);

type UsuarioLite = { uid: string; displayName?: string; email?: string };

// `members` guarda uids (igual que Programación); aquí se muestran nombres.
const nombreDe = (users: UsuarioLite[], uid: string) => {
  const u = users.find(x => x.uid === uid);
  return u?.displayName || u?.email || 'Usuario no encontrado';
};

// ─── Supabase helpers mejorados ───────────────────────────────────────────────

async function uploadCover(file: File, pid: string): Promise<{ url: string; path: string }> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  if (!allowed.includes(ext)) throw new Error('Formato de imagen no permitido');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede superar 5MB');

  const path = `${pid}/${Date.now()}_${genId()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Error al subir imagen: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('No se pudo obtener la URL pública');

  return { url: `${data.publicUrl}?t=${Date.now()}`, path };
}

async function deleteCover(path?: string): Promise<void> {
  if (!path) return;
  const cleanPath = path.split('?')[0];
  const { error } = await supabase.storage.from(BUCKET).remove([cleanPath]);
  if (error) console.warn('No se pudo eliminar la imagen de Supabase:', error.message);
}

// ─── Small reusable components ────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: ProjectStatus; tiny?: boolean }> = ({ status, tiny }) => {
  const { label, color, icon: Icon } = STATUS_CFG[status] ?? STATUS_CFG.planning;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: tiny ? 3 : 4,
      padding: tiny ? '1px 7px' : '3px 9px', borderRadius: 20,
      fontSize: tiny ? 9 : 10, fontWeight: 400,
      background: `${color}18`, border: `1px solid ${color}28`, color: panelInk(color),
    }}>
      <Icon size={tiny ? 8 : 9} strokeWidth={2} />
      {label}
    </span>
  );
};

const PriorityPip: React.FC<{ priority: Priority }> = ({ priority }) => {
  // Un documento sin prioridad (o con una desconocida) rompía la tarjeta.
  const { color, label } = PRIORITY_CFG[priority] ?? PRIORITY_CFG.medium;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--moon-muted)' }}>
      <Flag size={9} style={{ color: panelInk(color) }} strokeWidth={2} />
      {label}
    </span>
  );
};

const ProgressBar: React.FC<{ value: number; color: string; h?: number }> = ({ value, color, h = 3 }) => (
  <div style={{ height: h, borderRadius: h, background: 'var(--moon-surface-raised)', overflow: 'hidden' }}>
    <div style={{
      height: '100%', width: `${Math.max(0, Math.min(100, value))}%`,
      background: color, borderRadius: h,
      transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
    }} />
  </div>
);

// ─── Tree renderer ────────────────────────────────────────────────────────────

const TreeNodeView: React.FC<{ node: TreeNode; depth?: number; accent: string }> = ({ node, depth = 0, accent }) => (
  <div style={{ marginLeft: depth * 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
      {node.children.length > 0 && <ChevronRight size={10} style={{ color: panelInk(accent), flexShrink: 0 }} />}
      {node.children.length === 0 && <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1px solid ${accent}50`, flexShrink: 0 }} />}
      <span style={{ fontSize: 12, color: 'var(--moon-ink)' }}>{node.label}</span>
    </div>
    {node.children.map(child => (
      <TreeNodeView key={child.id} node={child} depth={depth + 1} accent={accent} />
    ))}
  </div>
);

// ─── Tree editor ──────────────────────────────────────────────────────────────

const TreeEditor: React.FC<{
  tree: TreeNode[];
  onChange: (t: TreeNode[]) => void;
  accent: string;
}> = ({ tree, onChange, accent }) => {
  const [input, setInput] = useState('');
  const addRoot = () => {
    if (!input.trim()) return;
    onChange([...tree, { id: genId(), label: input.trim(), children: [] }]);
    setInput('');
  };
  const addChild = (parentId: string, label: string) => {
    const add = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(n => n.id === parentId
        ? { ...n, children: [...n.children, { id: genId(), label, children: [] }] }
        : { ...n, children: add(n.children) });
    onChange(add(tree));
  };
  const removeNode = (id: string) => {
    const remove = (nodes: TreeNode[]): TreeNode[] =>
      nodes.filter(n => n.id !== id).map(n => ({ ...n, children: remove(n.children) }));
    onChange(remove(tree));
  };

  const NodeRow: React.FC<{ node: TreeNode; depth: number }> = ({ node, depth }) => {
    const [childInput, setChildInput] = useState('');
    const [addingChild, setAddingChild] = useState(false);
    return (
      <div style={{ marginLeft: depth * 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0' }}>
          <ChevronRight size={10} style={{ color: panelInk(accent), flexShrink: 0, opacity: node.children.length ? 1 : 0.3 }} />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--moon-ink)' }}>{node.label}</span>
          <button onClick={() => setAddingChild(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: 4, color: panelInk(accent), fontSize: 10, display: 'flex', alignItems: 'center' }}>
            <Plus size={10} />
          </button>
          <button onClick={() => removeNode(node.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: 4, color: panelInk('#f87171'), fontSize: 10 }}>
            <X size={10} />
          </button>
        </div>
        {addingChild && (
          <div style={{ marginLeft: 14, display: 'flex', gap: 4, paddingBottom: 4 }}>
            <input
              value={childInput}
              onChange={e => setChildInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addChild(node.id, childInput.trim()); setChildInput(''); setAddingChild(false); } }}
              placeholder="Hijo…"
              autoFocus
              style={{ flex: 1, background: 'var(--moon-surface-raised)', border: '1px solid var(--moon-line)', borderRadius: 6, padding: '3px 7px', fontSize: 11, color: 'var(--moon-ink)', outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={() => { addChild(node.id, childInput.trim()); setChildInput(''); setAddingChild(false); }} style={{ padding: '3px 7px', borderRadius: 6, fontSize: 10, background: `${accent}18`, border: `1px solid ${accent}30`, color: panelInk(accent), cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
          </div>
        )}
        {node.children.map(c => <NodeRow key={c.id} node={c} depth={depth + 1} />)}
      </div>
    );
  };

  return (
    <div>
      {tree.map(n => <NodeRow key={n.id} node={n} depth={0} />)}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addRoot()}
          placeholder="Nodo raíz…"
          style={{ flex: 1, background: 'var(--moon-surface-raised)', border: '1px solid var(--moon-line)', borderRadius: 7, padding: '5px 9px', fontSize: 12, color: 'var(--moon-ink)', outline: 'none', fontFamily: 'inherit' }}
        />
        <button onClick={addRoot} style={{ padding: '5px 12px', borderRadius: 7, background: `${accent}14`, border: `1px solid ${accent}28`, color: panelInk(accent), fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
          Añadir
        </button>
      </div>
    </div>
  );
};

// ─── Block renderers (view mode) ──────────────────────────────────────────────

const BlockView: React.FC<{ block: Block; accent: string }> = ({ block, accent }) => {
  const bd = 'var(--moon-line)';
  const cfg = BLOCK_CFG[block.type];

  if (block.type === 'divider') return (
    <div style={{ height: 1, background: bd, margin: '4px 0' }} />
  );

  return (
    <div style={{
      background: 'var(--moon-surface)', border: `1px solid ${bd}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Block header */}
      <div style={{
        padding: '9px 14px',
        borderBottom: (block.type as string) === 'divider' ? 'none' : `1px solid ${bd}`,
        display: 'flex', alignItems: 'center', gap: 7,
        background: `${cfg.color}06`,
      }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <cfg.icon size={11} style={{ color: panelInk(cfg.color) }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--moon-muted)', letterSpacing: '0.03em' }}>
          {block.title || cfg.label}
        </span>
      </div>

      {/* Block content */}
      <div style={{ padding: '12px 14px' }}>
        {(block.type === 'text' || block.type === 'note') && (
          <p style={{ fontSize: 13, color: 'var(--moon-ink)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
            <EmojiText text={block.content || ''} />
          </p>
        )}
        {block.type === 'idea' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fbbf2418', border: '1px solid #fbbf2428', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <Lightbulb size={13} style={{ color: panelInk('#fbbf24') }} />
            </div>
            <p style={{ fontSize: 13, color: 'var(--moon-ink)', lineHeight: 1.65, margin: 0, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
              <EmojiText text={block.content || ''} />
            </p>
          </div>
        )}
        {block.type === 'code' && (
          <pre style={{ fontSize: 12, color: panelInk('#a5b4fc'), margin: 0, overflowX: 'auto', fontFamily: 'monospace', lineHeight: 1.6, background: 'rgba(99,102,241,0.06)', borderRadius: 8, padding: '10px 12px' }}>
            {block.content}
          </pre>
        )}
        {block.type === 'list' && (block.items || []).length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(block.items || []).map((item, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--moon-ink)' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: accent, flexShrink: 0, marginTop: 6 }} />
                {item}
              </li>
            ))}
          </ul>
        )}
        {block.type === 'tree' && (block.tree || []).length > 0 && (
          <div>
            {(block.tree || []).map(n => (
              <TreeNodeView key={n.id} node={n} accent={accent} />
            ))}
          </div>
        )}
        {block.type === 'schema' && (
          <div>
            {block.content && (
              <p style={{ fontSize: 12, color: 'var(--moon-muted)', lineHeight: 1.6, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{block.content}</p>
            )}
            {(block.items || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(block.items || []).map((item, i) => (
                  <Fragment key={i}>
                    <div style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${accent}30`, background: `${accent}0a`, fontSize: 12, color: panelInk(accent) }}>{item}</div>
                    {i < (block.items || []).length - 1 && (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <ArrowUpRight size={12} style={{ color: 'var(--moon-muted)' }} />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        )}
        {block.type === 'image' && block.url && (
          <img src={block.url} alt={block.title || 'image'} style={{ width: '100%', borderRadius: 8, maxHeight: 320, objectFit: 'cover' }} />
        )}
        {block.type === 'link' && block.url && (
          <a href={block.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: panelInk(accent), textDecoration: 'none' }}>
            <Link2 size={13} />
            {block.linkLabel || block.url}
            <ExternalLink size={10} style={{ opacity: 0.6 }} />
          </a>
        )}
      </div>
    </div>
  );
};

// ─── Block editor ─────────────────────────────────────────────────────────────

const BlockEditor: React.FC<{
  block: Block;
  onChange: (b: Block) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  accent: string;
  inputStyle: React.CSSProperties;
}> = ({ block, onChange, onDelete, onMoveUp, onMoveDown, accent, inputStyle }) => {
  const cfg = BLOCK_CFG[block.type];
  const [listInput, setListInput] = useState('');
  const contentEmojiRef = useRef<HTMLTextAreaElement>(null);
  const [itemEdit, setItemEdit] = useState<{ idx: number; val: string } | null>(null);

  const addListItem = () => {
    if (!listInput.trim()) return;
    onChange({ ...block, items: [...(block.items || []), listInput.trim()] });
    setListInput('');
  };

  return (
    <div style={{
      background: 'var(--moon-surface)', border: `1px solid var(--moon-line)`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--moon-line)', display: 'flex', alignItems: 'center', gap: 7, background: `${cfg.color}06` }}>
        <GripVertical size={12} style={{ color: 'var(--moon-muted)', cursor: 'grab' }} />
        <div style={{ width: 20, height: 20, borderRadius: 5, background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <cfg.icon size={10} style={{ color: panelInk(cfg.color) }} />
        </div>
        <input
          value={block.title || ''}
          onChange={e => onChange({ ...block, title: e.target.value })}
          placeholder={cfg.label}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 11, fontWeight: 500, color: 'var(--moon-muted)', fontFamily: 'inherit', letterSpacing: '0.03em' }}
        />
        {/* Flechas además del arrastre: el drag de HTML5 no funciona con el dedo. */}
        <button onClick={onMoveUp} disabled={!onMoveUp} title="Subir bloque" aria-label="Subir bloque" style={{ background: 'none', border: 'none', cursor: onMoveUp ? 'pointer' : 'default', padding: 2, color: 'var(--moon-muted)', display: 'flex', opacity: onMoveUp ? 1 : 0.3 }}>
          <ChevronUp size={12} />
        </button>
        <button onClick={onMoveDown} disabled={!onMoveDown} title="Bajar bloque" aria-label="Bajar bloque" style={{ background: 'none', border: 'none', cursor: onMoveDown ? 'pointer' : 'default', padding: 2, color: 'var(--moon-muted)', display: 'flex', opacity: onMoveDown ? 1 : 0.3 }}>
          <ChevronDown size={12} />
        </button>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: panelInk('#f87171'), display: 'flex' }}>
          <Trash2 size={12} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 12 }}>
        {block.type === 'divider' && (
          <p style={{ fontSize: 11, color: 'var(--moon-muted)', margin: 0, textAlign: 'center' }}>— Separador —</p>
        )}

        {(block.type === 'text' || block.type === 'note' || block.type === 'idea') && (
          <>
            <textarea
              ref={contentEmojiRef}
              value={block.content || ''}
              onChange={e => onChange({ ...block, content: e.target.value })}
              placeholder={block.type === 'idea' ? 'Escribe tu idea aquí…' : block.type === 'note' ? 'Nota o comentario…' : 'Escribe el contenido…'}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontSize: 13 }}
            />
            <EmojiButton value={block.content || ''} onChange={content => onChange({ ...block, content })} inputRef={contentEmojiRef} label="Añadir emoji a la nota del proyecto" />
          </>
        )}

        {block.type === 'code' && (
          <textarea
            value={block.content || ''}
            onChange={e => onChange({ ...block, content: e.target.value })}
            placeholder="// código, pseudocódigo, snippets…"
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', fontSize: 12, fontFamily: 'monospace' }}
          />
        )}

        {block.type === 'list' && (
          <div>
            {(block.items || []).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                {itemEdit?.idx === i ? (
                  <input
                    value={itemEdit.val}
                    onChange={e => setItemEdit({ idx: i, val: e.target.value })}
                    onBlur={() => {
                      const items = [...(block.items || [])];
                      items[i] = itemEdit.val;
                      onChange({ ...block, items });
                      setItemEdit(null);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { const items = [...(block.items || [])]; items[i] = itemEdit!.val; onChange({ ...block, items }); setItemEdit(null); } }}
                    autoFocus
                    style={{ flex: 1, background: 'var(--moon-surface-raised)', border: `1px solid ${accent}40`, borderRadius: 5, padding: '2px 7px', fontSize: 12, color: 'var(--moon-ink)', outline: 'none', fontFamily: 'inherit' }}
                  />
                ) : (
                  <span onClick={() => setItemEdit({ idx: i, val: item })} style={{ flex: 1, fontSize: 12, color: 'var(--moon-ink)', cursor: 'text' }}>{item}</span>
                )}
                <button onClick={() => onChange({ ...block, items: (block.items || []).filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: panelInk('#f87171'), padding: 2, display: 'flex' }}><X size={10} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={listInput} onChange={e => setListInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addListItem()} placeholder="Nuevo ítem…" style={{ ...inputStyle, fontSize: 12 }} />
              <button onClick={addListItem} style={{ padding: '0 12px', borderRadius: 8, background: `${accent}14`, border: `1px solid ${accent}28`, color: panelInk(accent), cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, flexShrink: 0 }}>+</button>
            </div>
          </div>
        )}

        {block.type === 'tree' && (
          <TreeEditor tree={block.tree || []} onChange={t => onChange({ ...block, tree: t })} accent={accent} />
        )}

        {block.type === 'schema' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={block.content || ''}
              onChange={e => onChange({ ...block, content: e.target.value })}
              placeholder="Descripción del esquema…"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontSize: 12 }}
            />
            <div>
              <p style={{ fontSize: 10, color: 'var(--moon-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nodos del esquema</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                {(block.items || []).map((item, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 7, fontSize: 11, background: `${accent}10`, border: `1px solid ${accent}25`, color: panelInk(accent) }}>
                    {item}
                    <button onClick={() => onChange({ ...block, items: (block.items || []).filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: panelInk(accent), display: 'flex', padding: 0 }}><X size={8} /></button>
                  </span>
                ))}
              </div>
              {/* add node */}
              {(() => {
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const [ni, setNi] = useState('');
                return (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={ni} onChange={e => setNi(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ni.trim()) { onChange({ ...block, items: [...(block.items || []), ni.trim()] }); setNi(''); } }} placeholder="Nodo…" style={{ ...inputStyle, fontSize: 12 }} />
                    <button onClick={() => { if (ni.trim()) { onChange({ ...block, items: [...(block.items || []), ni.trim()] }); setNi(''); } }} style={{ padding: '0 12px', borderRadius: 8, background: `${accent}14`, border: `1px solid ${accent}28`, color: panelInk(accent), cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, flexShrink: 0 }}>+</button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {block.type === 'image' && (
          <input
            value={block.url || ''}
            onChange={e => onChange({ ...block, url: e.target.value })}
            placeholder="URL de la imagen…"
            style={inputStyle}
          />
        )}

        {block.type === 'link' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input value={block.url || ''} onChange={e => onChange({ ...block, url: e.target.value })} placeholder="URL…" style={inputStyle} />
            <input value={block.linkLabel || ''} onChange={e => onChange({ ...block, linkLabel: e.target.value })} placeholder="Etiqueta (opcional)" style={inputStyle} />
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const Proyectos: React.FC = () => {
  const { userProfile, isCEO, isAdmin } = useAuth();
  const { settings } = useSettings();
  const accent = settings.accentColor || '#6366f1';
  // Igual que las reglas de dev_projects: escriben CEO/Administración/Programación,
  // borran solo CEO/Administración (isAdmin ya incluye al CEO).
  const canEdit   = isCEO || isAdmin || userProfile?.role === 'Programación';
  const canDelete = isAdmin;

  // ── State ──────────────────────────────────────────────────────────────────
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [users,         setUsers]         = useState<UsuarioLite[]>([]);
  const [search,        setSearch]        = useState('');
  const [filterStatus,  setFilterStatus]  = useState<ProjectStatus | 'all'>('all');
  const [projectFocus, setProjectFocus] = useState<'all' | 'mine' | 'priority' | 'deadline'>('all');
  const [projectOrder, setProjectOrder] = useState<'recent' | 'name' | 'progress' | 'deadline'>('recent');
  const [viewMode,      setViewMode]      = useState<'grid' | 'list'>('grid');
  const [toast,         setToast]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Detail drawer
  const [activeProject, setActiveProject] = useState<string | null>(null);

  // Create/edit modal
  const [modalOpen,     setModalOpen]     = useState(false);
  const [form,          setForm]          = useState<Partial<Project> & { id?: string }>(BLANK_PROJECT);
  const [coverPreview,  setCoverPreview]  = useState<string | null>(null);
  const [pendingCover,  setPendingCover]  = useState<File | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [uploadingCover,setUploadingCover]= useState(false);
  const [tagInput,      setTagInput]      = useState('');
  const [techInput,     setTechInput]     = useState('');
  const [formTab,       setFormTab]       = useState<'info' | 'blocks'>('info');
  const [delConfirm,    setDelConfirm]    = useState<string | null>(null);

  const coverRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Firestore ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'dev_projects'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data(), ...leerCamposComunes(d.data()) } as unknown as Project)));
      setLoadError(null);
      setLoading(false);
    }, err => {
      // Antes caía en "Aún no hay proyectos", como si la lista estuviera vacía.
      console.error('dev_projects:', err);
      setLoadError('No se pudieron cargar los proyectos. Revisa tu conexión o tus permisos.');
      setLoading(false);
    });
  }, []);

  // Para elegir y mostrar miembros (se guardan sus uids).
  useEffect(() => subscribeToUsers(
    u => setUsers(u as UsuarioLite[]),
    err => console.error('users:', err),
  ), []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = projects.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q ||
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q));
    const matchS = filterStatus === 'all' || p.status === filterStatus;
    const open = !['completed', 'archived', 'cancelled'].includes(p.status);
    const limit = p.endDate ? new Date(`${p.endDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    const inFocus = projectFocus === 'all'
      || (projectFocus === 'mine' && ((p.members || []).includes(userProfile?.uid ?? '') || p.lead === userProfile?.uid))
      || (projectFocus === 'priority' && open && ['high', 'critical'].includes(p.priority))
      || (projectFocus === 'deadline' && open && limit <= Date.now() + 7 * 86_400_000);
    return matchQ && matchS && inFocus;
  }).sort((a, b) => {
    if (projectOrder === 'name') return a.name.localeCompare(b.name, 'es');
    if (projectOrder === 'progress') return (b.progress || 0) - (a.progress || 0);
    if (projectOrder === 'deadline') return (a.endDate || '9999').localeCompare(b.endDate || '9999');
    return 0; // Firestore already supplies the latest created projects first.
  });

  const pinned   = filtered.filter(p => p.pinned);
  const unpinned = filtered.filter(p => !p.pinned);

  const activeProjectData = projects.find(p => p.id === activeProject) ?? null;

  // ── Open create ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ ...BLANK_PROJECT });
    setCoverPreview(null); setPendingCover(null);
    setTagInput(''); setTechInput(''); setFormTab('info');
    setModalOpen(true);
  };

  // ── Open edit ──────────────────────────────────────────────────────────────
  const openEdit = (p: Project) => {
    setForm({ ...p });
    setCoverPreview(p.coverUrl || null); setPendingCover(null);
    setTagInput(''); setTechInput(''); setFormTab('info');
    setModalOpen(true);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
  if (!form.name?.trim()) { showToast('error', 'El nombre es obligatorio'); return; }
  setSaving(true);

  let uploadedPath: string | null = null; // rastrea si subimos imagen nueva

  try {
    let coverUrl  = form.coverUrl  ?? '';
    let coverPath = form.coverPath ?? '';

    // ── 1. Subir imagen nueva si hay una pendiente ──────────────────
    if (pendingCover) {
      setUploadingCover(true);
      const pid = form.id || genId();

      try {
        const res = await uploadCover(pendingCover, pid);
        uploadedPath = res.path; // guardamos para rollback si algo falla
        coverUrl  = res.url;
        coverPath = res.path;
      } catch (uploadErr: any) {
        showToast('error', uploadErr.message ?? 'Error al subir la imagen');
        setSaving(false);
        setUploadingCover(false);
        return; // no continúa si falló la subida
      } finally {
        setUploadingCover(false);
      }
    }

    const payload = {
      name:        form.name?.trim() ?? '',
      description: form.description?.trim() ?? '',
      status:      form.status   ?? 'planning',
      priority:    form.priority ?? 'medium',
      color:       form.color    ?? '#6366f1',
      coverUrl,
      coverPath,
      tags:        form.tags     ?? [],
      tech:        form.tech     ?? [],
      repoUrl:     form.repoUrl?.trim()  ?? '',
      liveUrl:     form.liveUrl?.trim()  ?? '',
      docsUrl:     form.docsUrl?.trim()  ?? '',
      leadName:    form.leadName?.trim() ?? '',
      members:     form.members  ?? [],
      startDate:   form.startDate ?? '',
      endDate:     form.endDate   ?? '',
      blocks:      form.blocks    ?? [],
      progress:    form.progress  ?? 0,
      pinned:      form.pinned    ?? false,
      updatedAt:   serverTimestamp(),
    };

    // ── 2. Guardar en Firestore ─────────────────────────────────────
    try {
      if (form.id) {
        await updateDoc(doc(db, 'dev_projects', form.id), escribirCamposComunes(payload));
        // La portada anterior se borra DESPUÉS de guardar (si falla el guardado
        // el documento seguiría apuntando a ella) y se compara con la del
        // documento, no con el formulario: "quitar portada" vacía form.coverPath
        // y la imagen vieja se quedaba en Supabase para siempre.
        const anterior = projects.find(x => x.id === form.id)?.coverPath;
        if (anterior && anterior !== coverPath) await deleteCover(anterior);
        showToast('success', 'Proyecto actualizado');
      } else {
        const ref = await addDoc(collection(db, 'dev_projects'), {
          ...escribirCamposComunes(payload),
          createdAt: serverTimestamp(),
        });
        showToast('success', 'Proyecto creado');
        setActiveProject(ref.id);
      }

      uploadedPath = null; // éxito — ya no hay que hacer rollback
      setModalOpen(false);

    } catch (firestoreErr: any) {
      // ── 3. ROLLBACK: si Firestore falló, borramos la imagen subida ──
      if (uploadedPath) {
        await deleteCover(uploadedPath);
        uploadedPath = null;
      }
      throw firestoreErr; // re-lanza para el catch exterior
    }

  } catch (e: any) {
    showToast('error', e.message ?? 'Error al guardar el proyecto');
  } finally {
    setSaving(false);
    setUploadingCover(false);
  }
};

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
  const p = projects.find(x => x.id === id);
  try {
    // ── 1. Primero eliminar de Firestore ────────────────────────────
    await deleteDoc(doc(db, 'dev_projects', id));

    // ── 2. Solo si Firestore tuvo éxito, borrar imagen de Supabase ──
    if (p?.coverPath) {
      await deleteCover(p.coverPath);
    }

    // ── 3. Sus tareas de Programación (dev_tasks) quedaban huérfanas ──
    let tareasOk = true;
    try {
      const snap = await getDocs(query(collection(db, 'dev_tasks'), where('projectId', '==', id)));
      for (let i = 0; i < snap.docs.length; i += 450) {   // un batch admite 500
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error('Borrando tareas del proyecto:', err);
      tareasOk = false;
    }

    if (activeProject === id) setActiveProject(null);
    if (tareasOk) showToast('success', 'Proyecto eliminado');
    else showToast('error', 'Proyecto eliminado, pero no se pudieron borrar sus tareas');

  } catch (e: any) {
    showToast('error', e.message ?? 'Error al eliminar el proyecto');
  } finally {
    setDelConfirm(null);
  }
};

  // ── Block helpers ──────────────────────────────────────────────────────────
  const addBlock = (type: BlockType) => {
    const block: Block = {
      id: genId(), type,
      title: '', content: '',
      items: [], tree: [],
      // max+1 y no length: tras borrar un bloque, length repetía un order existente.
      order: (form.blocks ?? []).reduce((m, b) => Math.max(m, b.order ?? 0), -1) + 1,
    };
    setForm(f => ({ ...f, blocks: [...(f.blocks ?? []), block] }));
  };

  const updateBlock = (id: string, updated: Block) =>
    setForm(f => ({ ...f, blocks: (f.blocks ?? []).map(b => b.id === id ? updated : b) }));

  const deleteBlock = (id: string) =>
    setForm(f => ({ ...f, blocks: (f.blocks ?? []).filter(b => b.id !== id) }));

  const moveBlock = (id: string, dir: -1 | 1) => {
    setForm(f => {
      // Los bloques se pintan ordenados por `order`, no por su posición en el
      // array: intercambiar posiciones no movía nada. Se ordena, se intercambia
      // y se renumera el `order`.
      const blocks = [...(f.blocks ?? [])].sort((a, b) => a.order - b.order);
      const idx = blocks.findIndex(b => b.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= blocks.length) return f;
      [blocks[idx], blocks[next]] = [blocks[next], blocks[idx]];
      return { ...f, blocks: blocks.map((b, i) => ({ ...b, order: i })) };
    });
  };

  // ── Tag / tech helpers ─────────────────────────────────────────────────────
  const addTag = () => {
    const t = tagInput.trim();
    if (!t || (form.tags ?? []).includes(t)) { setTagInput(''); return; }
    setForm(f => ({ ...f, tags: [...(f.tags ?? []), t] }));
    setTagInput('');
  };
  const addTech = () => {
    const t = techInput.trim();
    if (!t || (form.tech ?? []).includes(t)) { setTechInput(''); return; }
    setForm(f => ({ ...f, tech: [...(f.tech ?? []), t] }));
    setTechInput('');
  };

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--moon-surface)',
    border: '1px solid var(--moon-line)', borderRadius: 10,
    padding: '9px 12px', fontSize: 13,
    color: 'var(--moon-ink)', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--moon-muted)', marginBottom: 5, display: 'block', fontWeight: 500,
  };
  const bd = 'var(--moon-line)';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="moon-module moon-module--proyectos" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding: '10px 16px', borderRadius: 12, fontSize: 13,
          background: toast.type === 'success' ? `${accent}18` : 'rgba(239,68,68,0.12)',
          border: `1px solid ${toast.type === 'success' ? accent + '40' : 'rgba(239,68,68,0.3)'}`,
          color: panelInk(toast.type === 'success' ? accent : '#f87171'),
          backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {toast.text}
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div data-moon-reveal="heading" className="moon-module-heading moon-work-page-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: `${accent}18`, border: `1px solid ${accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderKanban size={16} style={{ color: panelInk(accent) }} />
          </div>
          <div>
            <span className="moon-work-kicker">VISIÓN DE LA EMPRESA</span>
            <h1 className="moon-page-title" style={{ fontSize: 'clamp(24px, 2.6vw, 34px)', fontWeight: 600, color: 'var(--moon-ink)', margin: 0, letterSpacing: '-0.01em' }}>Proyectos</h1>
            <p style={{ fontSize: 11, color: 'var(--moon-muted)', margin: 0 }}>
              Iniciativas, responsables y entregas · {projects.length} proyecto{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--moon-surface)', border: `1px solid ${bd}`, borderRadius: 9, overflow: 'hidden' }}>
            {(['grid', 'list'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: '6px 10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: viewMode === v ? 'var(--moon-surface-raised)' : 'transparent',
                color: panelInk(viewMode === v ? 'var(--moon-ink)' : 'var(--moon-muted)'),
                display: 'flex', alignItems: 'center',
              }}>
                {v === 'grid' ? <LayoutGrid size={13} /> : <LayoutList size={13} />}
              </button>
            ))}
          </div>
          {canEdit && (
            <button className="moon-panel-action" onClick={openCreate} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 10, fontSize: 13, cursor: 'pointer',
              background: accent, border: 'none', color: 'var(--accent-on-user, var(--moon-accent-ink))', fontFamily: 'inherit',
            }}>
              <Plus size={13} /> Nuevo proyecto
            </button>
          )}
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto', paddingBottom: 2 }}>
        {(Object.entries(STATUS_CFG) as [ProjectStatus, typeof STATUS_CFG[ProjectStatus]][]).map(([key, cfg]) => {
          const count = projects.filter(p => p.status === key).length;
          const Icon  = cfg.icon;
          const active = filterStatus === key;
          return (
            <button data-moon-reveal="metric" key={key} onClick={() => setFilterStatus(active ? 'all' : key)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 10,
              border: active ? `1px solid ${cfg.color}35` : `1px solid ${bd}`,
              background: active ? `${cfg.color}10` : 'var(--moon-surface)',
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>
              <Icon size={11} style={{ color: panelInk(cfg.color) }} />
              <span style={{ fontSize: 11, color: panelInk(active ? cfg.color : 'var(--moon-muted)') }}>{cfg.label}</span>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: `${cfg.color}18`, color: panelInk(cfg.color) }}>{count}</span>
            </button>
          );
        })}
      </div>

      <WorkViewToolbar label="Cartera de proyectos" description="Prioriza entregas, revisa tu participación y comparte la vista con el equipo."
        count={filtered.length} total={projects.length} loading={loading}
        onReset={search || filterStatus !== 'all' || projectFocus !== 'all' || projectOrder !== 'recent' ? () => { setSearch(''); setFilterStatus('all'); setProjectFocus('all'); setProjectOrder('recent'); } : undefined}
        onExport={() => exportWorkspaceCsv('moon-proyectos', ['Proyecto', 'Estado', 'Prioridad', 'Avance %', 'Fecha límite', 'Etiquetas'], filtered.map(p => [p.name, STATUS_CFG[p.status]?.label || p.status, PRIORITY_CFG[p.priority]?.label || p.priority, p.progress || 0, p.endDate, (p.tags || []).join(', ')]))}>
        <label>Enfoque<select value={projectFocus} onChange={e => setProjectFocus(e.target.value as typeof projectFocus)}><option value="all">Toda la cartera</option><option value="mine">Donde participo</option><option value="priority">Prioridad alta o crítica</option><option value="deadline">Vencidos y próximos 7 días</option></select></label>
        <label>Ordenar por<select value={projectOrder} onChange={e => setProjectOrder(e.target.value as typeof projectOrder)}><option value="recent">Más recientes</option><option value="name">Nombre A–Z</option><option value="progress">Mayor avance</option><option value="deadline">Fecha límite</option></select></label>
      </WorkViewToolbar>

      {/* ── Search ───────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 20, width: '100%' }}>
        <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--moon-muted)', pointerEvents: 'none' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, descripción, etiqueta…"
          aria-label="Buscar proyectos"
          style={{ ...inputStyle, paddingLeft: 32, fontSize: 12 }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--moon-muted)', display: 'flex' }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── Projects ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
          <Loader2 size={24} style={{ color: panelInk(accent) }} className="animate-spin" />
        </div>
      ) : loadError ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: 18, gap: 12, textAlign: 'center' }}>
          <AlertCircle size={32} style={{ color: panelInk('#f87171') }} />
          <p style={{ fontSize: 14, color: panelInk('#f87171'), margin: 0 }}>{loadError}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', border: `1px dashed ${bd}`, borderRadius: 18, gap: 12 }}>
          <Package size={32} style={{ color: 'var(--moon-muted)' }} />
          <p style={{ fontSize: 14, color: 'var(--moon-muted)', margin: 0 }}>
            {search || filterStatus !== 'all' || projectFocus !== 'all' ? 'Sin resultados con ese filtro' : 'Aún no hay proyectos'}
          </p>
          {canEdit && !search && filterStatus === 'all' && projectFocus === 'all' && (
            <button onClick={openCreate} style={{ padding: '7px 16px', borderRadius: 10, fontSize: 12, cursor: 'pointer', background: `${accent}14`, border: `1px solid ${accent}28`, color: panelInk(accent), fontFamily: 'inherit' }}>
              Crear el primer proyecto
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Pinned */}
          {pinned.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Star size={11} style={{ color: panelInk('#fbbf24') }} />
                <span style={{ fontSize: 10, color: 'var(--moon-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Destacados</span>
              </div>
              <ProjectGrid
                projects={pinned} viewMode={viewMode} accent={accent}
                canEdit={canEdit} canDelete={canDelete}
                onOpen={id => setActiveProject(id)}
                onEdit={openEdit}
                onDelete={id => setDelConfirm(id)}
                delConfirm={delConfirm}
                onDelConfirm={handleDelete}
                onDelCancel={() => setDelConfirm(null)}
              />
            </div>
          )}

          {/* All / remaining */}
          {unpinned.length > 0 && (
            <div>
              {pinned.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Hash size={11} style={{ color: 'var(--moon-muted)' }} />
                  <span style={{ fontSize: 10, color: 'var(--moon-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Todos los proyectos</span>
                </div>
              )}
              <ProjectGrid
                projects={unpinned} viewMode={viewMode} accent={accent}
                canEdit={canEdit} canDelete={canDelete}
                onOpen={id => setActiveProject(id)}
                onEdit={openEdit}
                onDelete={id => setDelConfirm(id)}
                delConfirm={delConfirm}
                onDelConfirm={handleDelete}
                onDelCancel={() => setDelConfirm(null)}
              />
            </div>
          )}
        </>
      )}

      {/* ── Detail panel (right drawer) ───────────────────────────────────────── */}
      {activeProjectData && (
        <DetailPanel
          project={activeProjectData}
          accent={accent}
          canEdit={canEdit}
          users={users}
          onClose={() => setActiveProject(null)}
          onEdit={openEdit}
        />
      )}

      {/* ── Create / Edit modal ───────────────────────────────────────────────── */}
      {modalOpen && (
        <ProjectModal
          form={form} setForm={setForm}
          formTab={formTab} setFormTab={setFormTab}
          coverPreview={coverPreview}
          onCoverClick={() => coverRef.current?.click()}
          onRemoveCover={() => { setCoverPreview(null); setPendingCover(null); setForm(f => ({ ...f, coverUrl: '', coverPath: '' })); }}
          onCoverChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            setPendingCover(file);
            const r = new FileReader();
            r.onload = ev => setCoverPreview(ev.target?.result as string);
            r.readAsDataURL(file);
            e.target.value = '';
          }}
          coverRef={coverRef}
          saving={saving} uploadingCover={uploadingCover}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          accent={accent}
          tagInput={tagInput} setTagInput={setTagInput} onAddTag={addTag}
          onRemoveTag={t => setForm(f => ({ ...f, tags: (f.tags ?? []).filter(x => x !== t) }))}
          techInput={techInput} setTechInput={setTechInput} onAddTech={addTech}
          onRemoveTech={t => setForm(f => ({ ...f, tech: (f.tech ?? []).filter(x => x !== t) }))}
          onAddBlock={addBlock}
          onUpdateBlock={updateBlock}
          onDeleteBlock={deleteBlock}
          onMoveBlock={moveBlock}
          users={users}
          inputStyle={inputStyle} labelStyle={labelStyle}
        />
      )}
    </div>
  );
};

// ─── ProjectGrid ──────────────────────────────────────────────────────────────

interface GridProps {
  projects: Project[];
  viewMode: 'grid' | 'list';
  accent: string;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: (id: string) => void;
  onEdit: (p: Project) => void;
  onDelete: (id: string) => void;
  delConfirm: string | null;
  onDelConfirm: (id: string) => void;
  onDelCancel: () => void;
}
const ProjectGrid: React.FC<GridProps> = ({ projects, viewMode, accent, canEdit, canDelete, onOpen, onEdit, onDelete, delConfirm, onDelConfirm, onDelCancel }) => (
  <div style={viewMode === 'grid'
    // min(288px, 100%): en pantallas angostas la tarjeta se encoge en vez de desbordar.
    ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(288px, 100%), 1fr))', gap: 12 }
    : { display: 'flex', flexDirection: 'column', gap: 8 }
  }>
    {projects.map(p => (
      <ProjectCard key={p.id} project={p} viewMode={viewMode} accent={accent}
        canEdit={canEdit} canDelete={canDelete} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete}
        delConfirm={delConfirm} onDelConfirm={onDelConfirm} onDelCancel={onDelCancel} />
    ))}
  </div>
);

// ─── ProjectCard ──────────────────────────────────────────────────────────────

const ProjectCard: React.FC<{
  project: Project; viewMode: 'grid' | 'list'; accent: string;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: (id: string) => void;
  onEdit: (p: Project) => void;
  onDelete: (id: string) => void;
  delConfirm: string | null;
  onDelConfirm: (id: string) => void;
  onDelCancel: () => void;
}> = ({ project, viewMode, canEdit, canDelete, onOpen, onEdit, onDelete, delConfirm, onDelConfirm, onDelCancel }) => {
  const color = project.color || '#6366f1';
  const bd    = 'var(--moon-line)';
  const [hov, setHov] = useState(false);

  if (viewMode === 'list') return (
    <div data-moon-reveal="row" className="moon-project-row"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', flexWrap: 'wrap',
        background: 'var(--moon-surface)',
        border: `1px solid ${hov ? color + '30' : bd}`,
        borderRadius: 12, cursor: 'pointer', transition: 'border-color 0.2s',
      }}
      onClick={() => onOpen(project.id)}
    >
      {/* Color dot */}
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {project.coverUrl
          ? <img src={project.coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 9 }} />
          : <FolderKanban size={15} style={{ color: panelInk(color) }} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--moon-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
          {project.pinned && <Star size={9} style={{ color: panelInk('#fbbf24'), flexShrink: 0 }} />}
        </div>
        <p style={{ fontSize: 11, color: 'var(--moon-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><EmojiText text={project.description || ''} /></p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <StatusBadge status={project.status} tiny />
        <PriorityPip priority={project.priority} />
        <div style={{ width: 80 }}>
          <ProgressBar value={project.progress} color={color} />
        </div>
        <span style={{ fontSize: 10, color: panelInk(color), minWidth: 28, textAlign: 'right' }}>{project.progress}%</span>
        {canEdit && (
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(project)} style={{ padding: '4px 8px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)', fontFamily: 'inherit', display: 'flex' }}><Pencil size={11} /></button>
            {!canDelete ? null : delConfirm === project.id ? (
              <>
                <button onClick={() => onDelConfirm(project.id)} style={{ padding: '4px 8px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: panelInk('#f87171'), fontFamily: 'inherit' }}>Sí</button>
                <button onClick={onDelCancel} style={{ padding: '4px 8px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)', fontFamily: 'inherit' }}>No</button>
              </>
            ) : (
              <button onClick={() => onDelete(project.id)} style={{ padding: '4px 8px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: panelInk('#f87171'), fontFamily: 'inherit', display: 'flex' }}><Trash2 size={11} /></button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Grid card
  return (
    <div data-moon-reveal="card" className="moon-project-card"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--moon-surface)',
        border: `1px solid ${hov ? color + '30' : bd}`,
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: hov ? `0 4px 24px ${color}12` : 'none',
      }}
    >
      {/* Cover / color header */}
      <div className="moon-project-cover" style={{ height: 148, position: 'relative', overflow: 'hidden', background: `${color}14` }}
        onClick={() => onOpen(project.id)}>
        {project.coverUrl
          ? <img src={project.coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FolderKanban size={28} style={{ color: panelInk(`${color}50`) }} />
            </div>
          )
        }
        {/* overlay gradient */}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 40%, ${color}10)` }} />
        {/* status badge */}
        <div style={{ position: 'absolute', top: 9, right: 9 }}><StatusBadge status={project.status} tiny /></div>
        {project.pinned && <Star size={11} style={{ color: panelInk('#fbbf24'), position: 'absolute', top: 10, left: 10 }} />}
      </div>

      {/* Body */}
      <div className="moon-project-body" style={{ padding: 20 }} onClick={() => onOpen(project.id)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--moon-ink)', margin: 0, lineHeight: 1.35, letterSpacing: '-.025em' }}>{project.name}</h3>
          <PriorityPip priority={project.priority} />
        </div>
        {project.description && (
          <p style={{ fontSize: 12, color: 'var(--moon-muted)', margin: '7px 0 16px', lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            <EmojiText text={project.description || ''} />
          </p>
        )}
        {/* Tags */}
        {(project.tags ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
            {project.tags.slice(0, 3).map(t => (
              <span key={t} style={{ padding: '1px 7px', borderRadius: 6, fontSize: 9, background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)' }}>{t}</span>
            ))}
            {project.tags.length > 3 && <span style={{ fontSize: 9, color: 'var(--moon-muted)', padding: '1px 3px' }}>+{project.tags.length - 3}</span>}
          </div>
        )}
        {/* Progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--moon-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Progreso</span>
            <span style={{ fontSize: 10, color: panelInk(color) }}>{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} color={color} h={3} />
        </div>
        {/* Blocks count */}
        {(project.blocks ?? []).length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Layers size={9} style={{ color: 'var(--moon-muted)' }} />
            <span style={{ fontSize: 9, color: 'var(--moon-muted)' }}>{project.blocks.length} bloque{project.blocks.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      {canEdit && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }} onClick={e => e.stopPropagation()}>
          {delConfirm === project.id ? (
            <>
              <span style={{ fontSize: 11, color: 'var(--moon-muted)', flex: 1 }}>¿Eliminar?</span>
              <button onClick={() => onDelConfirm(project.id)} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: panelInk('#f87171'), fontFamily: 'inherit' }}>Sí</button>
              <button onClick={onDelCancel} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)', fontFamily: 'inherit' }}>No</button>
            </>
          ) : (
            <>
              <button onClick={() => onEdit(project)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)', fontFamily: 'inherit' }}><Pencil size={10} /> Editar</button>
              {/* Las reglas solo dejan borrar a CEO/Administración. */}
              {canDelete && <button onClick={() => onDelete(project.id)} style={{ padding: '5px 8px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: panelInk('#f87171'), fontFamily: 'inherit', display: 'flex' }}><Trash2 size={10} /></button>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── DetailPanel ──────────────────────────────────────────────────────────────

const DetailPanel: React.FC<{
  project: Project; accent: string; canEdit: boolean;
  users: UsuarioLite[];
  onClose: () => void; onEdit: (p: Project) => void;
}> = ({ project, accent, canEdit, users, onClose, onEdit }) => {
  const color = project.color || accent;
  const bd    = 'var(--moon-line)';

  return (
    <div style={{ position: 'fixed', top: 'var(--titlebar-offset, 0px)', right: 0, bottom: 0, left: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}>
      {/* Overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 580, height: '100%',
        background: 'var(--moon-surface)', borderLeft: `1px solid ${bd}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        animation: 'notifDrawerIn 0.28s cubic-bezier(0.22,1,0.36,1) forwards',
      }} onClick={e => e.stopPropagation()}>

        {/* Cover */}
        <div style={{ position: 'relative', height: project.coverUrl ? 180 : 90, flexShrink: 0, overflow: 'hidden', background: `${color}14` }}>
          {project.coverUrl && <img src={project.coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 30%, var(--moon-surface))` }} />
          {/* close + edit */}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
            {canEdit && (
              <button onClick={() => onEdit(project)} style={{ height: 30, padding: '0 10px', borderRadius: 8, background: `${color}20`, border: `1px solid ${color}30`, color: panelInk(color), fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                <Pencil size={11} /> Editar
              </button>
            )}
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--moon-surface)', border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--moon-muted)' }}>
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 22px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Title */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h2 style={{ fontSize: 22, fontWeight: 300, color: 'var(--moon-ink)', margin: 0, letterSpacing: '-0.01em' }}>{project.name}</h2>
              {project.pinned && <Star size={13} style={{ color: panelInk('#fbbf24') }} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge status={project.status} />
              <PriorityPip priority={project.priority} />
            </div>
          </div>

          {project.description && (
            <p style={{ fontSize: 13, color: 'var(--moon-muted)', lineHeight: 1.65, margin: 0 }}><EmojiText text={project.description || ''} /></p>
          )}

          {/* Progress */}
          <div style={{ background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--moon-muted)' }}>Progreso</span>
              <span style={{ fontSize: 14, fontWeight: 300, color: panelInk(color) }}>{project.progress}%</span>
            </div>
            <ProgressBar value={project.progress} color={color} h={5} />
          </div>

          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {[
              { label: 'Responsable', value: project.leadName || '—', icon: Users2 },
              { label: 'Inicio',      value: project.startDate || '—', icon: CalendarDays },
              { label: 'Fin est.',    value: project.endDate   || '—', icon: CalendarDays },
              { label: 'Stack',       value: (project.tech || []).join(', ') || '—', icon: Layers },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ background: 'var(--moon-surface)', border: `1px solid ${bd}`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <Icon size={10} style={{ color: panelInk(color) }} />
                  <span style={{ fontSize: 9, color: 'var(--moon-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--moon-ink)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Miembros */}
          {(project.members ?? []).length > 0 && (
            <div>
              <span style={{ fontSize: 9, color: 'var(--moon-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 7 }}>Miembros</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {project.members.map(uid => (
                  <span key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 8, fontSize: 11, background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)' }}>
                    <Users2 size={10} /> {nombreDe(users, uid)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {(project.tags ?? []).length > 0 && (
            <div>
              <span style={{ fontSize: 9, color: 'var(--moon-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 7 }}>Etiquetas</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {project.tags.map(t => (
                  <span key={t} style={{ padding: '3px 9px', borderRadius: 8, fontSize: 11, background: `${color}12`, border: `1px solid ${color}25`, color: panelInk(color) }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Links */}
          {(project.repoUrl || project.liveUrl || project.docsUrl) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {project.repoUrl && <ExternalLinkBtn href={project.repoUrl} icon={Github} label="Repositorio" />}
              {project.liveUrl && <ExternalLinkBtn href={project.liveUrl} icon={Globe}  label="Live" />}
              {project.docsUrl && <ExternalLinkBtn href={project.docsUrl} icon={BookOpen} label="Docs" />}
            </div>
          )}

          {/* Blocks */}
          {(project.blocks ?? []).length > 0 && (
            <div>
              <span style={{ fontSize: 9, color: 'var(--moon-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
                Contenido — {project.blocks.length} bloque{project.blocks.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...(project.blocks)].sort((a, b) => a.order - b.order).map(block => (
                  <BlockView key={block.id} block={block} accent={color} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ExternalLinkBtn: React.FC<{ href: string; icon: React.FC<any>; label: string }> = ({ href, icon: Icon, label }) => (
  <a href={href} target="_blank" rel="noreferrer" style={{
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
    borderRadius: 9, fontSize: 12, textDecoration: 'none',
    background: 'var(--moon-surface-raised)', border: '1px solid var(--moon-line)', color: 'var(--moon-muted)',
  }}>
    <Icon size={12} /> {label} <ExternalLink size={9} style={{ opacity: 0.5 }} />
  </a>
);

// ─── ProjectModal ─────────────────────────────────────────────────────────────

interface ModalProps {
  form: Partial<Project> & { id?: string };
  setForm: React.Dispatch<React.SetStateAction<any>>;
  formTab: 'info' | 'blocks';
  setFormTab: (t: 'info' | 'blocks') => void;
  coverPreview: string | null;
  onCoverClick: () => void;
  onRemoveCover: () => void;
  onCoverChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  coverRef: React.RefObject<HTMLInputElement | null>;
  saving: boolean; uploadingCover: boolean;
  onSave: () => void; onClose: () => void;
  accent: string;
  tagInput: string; setTagInput: (v: string) => void; onAddTag: () => void;
  onRemoveTag: (t: string) => void;
  techInput: string; setTechInput: (v: string) => void; onAddTech: () => void;
  onRemoveTech: (t: string) => void;
  onAddBlock: (type: BlockType) => void;
  onUpdateBlock: (id: string, b: Block) => void;
  onDeleteBlock: (id: string) => void;
  onMoveBlock: (id: string, dir: -1 | 1) => void;
  users: UsuarioLite[];
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}

// ─── Custom Select ────────────────────────────────────────────────────────────

const CustomSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; color?: string; icon?: React.FC<any> }[];
  accent: string;
  style?: React.CSSProperties;
}> = ({ value, onChange, options, accent, style }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const bd = 'var(--moon-line)';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <style>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes optionIn {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>

      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          background: 'var(--moon-surface)',
          border: `1px solid ${open ? accent + '50' : bd}`,
          color: 'var(--moon-ink)', fontSize: 13,
          transition: 'border-color 0.2s, box-shadow 0.2s',
          boxShadow: open ? `0 0 0 3px ${accent}12` : 'none',
          outline: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {selected?.icon && (
            <span style={{ width: 18, height: 18, borderRadius: 5, background: `${selected.color || accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <selected.icon size={10} style={{ color: panelInk(selected.color || accent) }} />
            </span>
          )}
          {selected?.color && !selected?.icon && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: selected.color, flexShrink: 0 }} />
          )}
          {selected?.label ?? '—'}
        </span>
        <ChevronRight
          size={12}
          style={{
            color: 'var(--moon-muted)',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 600,
          background: 'var(--moon-surface)',
          border: `1px solid ${bd}`,
          borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.15)',
          animation: 'dropdownIn 0.2s cubic-bezier(0.22,1,0.36,1) forwards',
        }}>
          {options.map((opt, i) => {
            const isActive = opt.value === value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, textAlign: 'left',
                  background: isActive ? `${opt.color || accent}12` : 'transparent',
                  color: panelInk(isActive ? (opt.color || accent) : 'var(--moon-ink)'),
                  transition: 'background 0.15s',
                  animation: `optionIn 0.18s ease ${i * 0.03}s both`,
                  borderBottom: i < options.length - 1 ? `1px solid var(--moon-line)` : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--moon-surface-raised)';
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {Icon && (
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: `${opt.color || accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={11} style={{ color: panelInk(opt.color || accent) }} />
                  </span>
                )}
                {opt.color && !Icon && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isActive && (
                  <CheckCircle2 size={12} style={{ color: panelInk(opt.color || accent), flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Custom Date Input ────────────────────────────────────────────────────────

const CustomDateInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  accent: string;
  inputStyle: React.CSSProperties;
}> = ({ value, onChange, placeholder = 'dd/mm/aaaa', accent, inputStyle }) => {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect light/dark for colorScheme
  const isLight = document.documentElement.classList.contains('light');

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--moon-surface)',
          border: `1px solid ${focused ? accent + '50' : 'var(--moon-line)'}`,
          borderRadius: 10, overflow: 'hidden',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          boxShadow: focused ? `0 0 0 3px ${accent}12` : 'none',
          cursor: 'pointer',
        }}
        onClick={() => inputRef.current?.showPicker?.()}
      >
        <CalendarDays
          size={13}
          style={{ color: panelInk(focused ? accent : 'var(--moon-muted)'), margin: '0 10px', flexShrink: 0, transition: 'color 0.2s' }}
        />
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{
            ...inputStyle,
            border: 'none',
            borderRadius: 0,
            background: 'transparent',
            paddingLeft: 0,
            boxShadow: 'none',
            colorScheme: isLight ? 'light' : 'dark',
            flex: 1,
            cursor: 'pointer',
          }}
        />
      </div>
    </div>
  );
};

const ProjectModal: React.FC<ModalProps> = ({
  form, setForm, formTab, setFormTab,
  coverPreview, onCoverClick, onRemoveCover, onCoverChange, coverRef,
  saving, uploadingCover, onSave, onClose, accent,
  tagInput, setTagInput, onAddTag, onRemoveTag,
  techInput, setTechInput, onAddTech, onRemoveTech,
  onAddBlock, onUpdateBlock, onDeleteBlock, onMoveBlock,
  users, inputStyle, labelStyle,
}) => {
  const isEdit = !!form.id;
  const descriptionEmojiRef = useRef<HTMLTextAreaElement>(null);
  const bd = 'var(--moon-line)';
  const color = form.color || accent;
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const dragItem = useRef<number | null>(null);
const dragOver = useRef<number | null>(null);
const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  return (
    <div style={{ position: 'fixed', top: 'var(--titlebar-offset, 0px)', right: 0, bottom: 0, left: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 780, maxHeight: '96vh', background: 'var(--moon-surface)', border: `1px solid ${bd}`, borderRadius: 22, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }}
        onClick={e => e.stopPropagation()}>

        {/* Modal header */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isEdit ? <Pencil size={13} style={{ color: panelInk(color) }} /> : <Plus size={13} style={{ color: panelInk(color) }} />}
            </div>
            <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--moon-ink)' }}>
              {isEdit ? 'Editar proyecto' : 'Nuevo proyecto'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--moon-muted)', display: 'flex' }}>
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${bd}`, flexShrink: 0 }}>
          {(['info', 'blocks'] as const).map(t => (
            <button key={t} onClick={() => setFormTab(t)} style={{
              flex: 1, padding: '11px 0', fontSize: 12, fontWeight: 400, cursor: 'pointer',
              background: 'none', border: 'none', fontFamily: 'inherit',
              color: panelInk(formTab === t ? color : 'var(--moon-muted)'),
              borderBottom: `2px solid ${formTab === t ? color : 'transparent'}`,
              transition: 'all 0.2s',
            }}>
              {t === 'info' ? '✦  Información' : '⬡  Bloques de contenido'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>

          {formTab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Cover */}
              <div>
                <label style={labelStyle}>Imagen de portada</label>
                {coverPreview ? (
  <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: 160 }}>
    <img src={coverPreview} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s ease' }} />
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.5))' }} />
    {uploadingCover && (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'var(--moon-media-shade)', backdropFilter: 'blur(4px)' }}>
        <Loader2 size={22} style={{ color: 'var(--moon-media-ink)', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em' }}>Subiendo imagen…</span>
        <div style={{ width: 120, height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: color, borderRadius: 2, animation: 'uploadBar 1.4s ease-in-out infinite' }} />
        </div>
      </div>
    )}
    <button onClick={onRemoveCover} style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, background: 'var(--moon-media-shade)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--moon-media-ink)', backdropFilter: 'blur(4px)', transition: 'all 0.15s ease' }}>
      <X size={13} />
    </button>
    <button onClick={onCoverClick} style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'var(--moon-media-shade)', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', color: 'rgba(255,255,255,0.85)', fontSize: 11, backdropFilter: 'blur(4px)' }}>
      <Upload size={11} /> Cambiar
    </button>
  </div>
) : (
  <button onClick={onCoverClick} style={{ width: '100%', height: 120, borderRadius: 14, border: `2px dashed ${uploadingCover ? color : bd}`, background: uploadingCover ? `${color}08` : 'var(--moon-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'var(--moon-muted)', transition: 'all 0.2s ease', position: 'relative', overflow: 'hidden' }}>
    {uploadingCover ? (
      <>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, transparent, ${color}15, transparent)`, animation: 'shimmer 1.4s ease-in-out infinite' }} />
        <Loader2 size={20} style={{ color: panelInk(color), animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 11, color: panelInk(color), letterSpacing: '0.06em' }}>Subiendo imagen…</span>
        <div style={{ width: 100, height: 2, borderRadius: 2, background: `${color}25`, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: color, borderRadius: 2, animation: 'uploadBar 1.4s ease-in-out infinite' }} />
        </div>
      </>
    ) : (
      <>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Upload size={16} style={{ color: 'var(--moon-muted)' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--moon-muted)', display: 'block' }}>Subir imagen de portada</span>
          <span style={{ fontSize: 10, color: 'var(--moon-muted)' }}>JPG, PNG, WEBP · Máx. 5MB</span>
        </div>
      </>
    )}
  </button>
)}
                <input ref={coverRef} type="file" accept="image/*" onChange={onCoverChange} style={{ display: 'none' }} />
              </div>

              {/* Color picker */}
              <div>
                <label style={labelStyle}>Color del proyecto</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PROJECT_COLORS.map(c => (
                    <button key={c} onClick={() => setForm((f: any) => ({ ...f, color: c }))} style={{
                      width: 26, height: 26, borderRadius: 8, background: c, border: `2px solid ${form.color === c ? '#fff' : 'transparent'}`,
                      cursor: 'pointer', boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none', transition: 'all 0.15s',
                    }} />
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label style={labelStyle}>Nombre *</label>
                <input value={form.name || ''} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="Nombre del proyecto" style={inputStyle} />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Descripción</label>
                <textarea ref={descriptionEmojiRef} value={form.description || ''} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="Descripción breve del proyecto…" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                <EmojiButton value={form.description || ''} onChange={description => setForm((f: any) => ({ ...f, description }))} inputRef={descriptionEmojiRef} disabled={saving} label="Añadir emoji a la descripción del proyecto" />
              </div>

              {/* Status + Priority */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
  <div>
    <label style={labelStyle}>Estado</label>
    <CustomSelect
      value={form.status || 'planning'}
      onChange={v => setForm((f: any) => ({ ...f, status: v }))}
      accent={color}
      options={Object.entries(STATUS_CFG).map(([k, v]) => ({
        value: k,
        label: v.label,
        color: v.color,
        icon: v.icon,
      }))}
    />
  </div>
  <div>
    <label style={labelStyle}>Prioridad</label>
    <CustomSelect
      value={form.priority || 'medium'}
      onChange={v => setForm((f: any) => ({ ...f, priority: v }))}
      accent={color}
      options={Object.entries(PRIORITY_CFG).map(([k, v]) => ({
        value: k,
        label: v.label,
        color: v.color,
      }))}
    />
  </div>
</div>
             

              {/* Progress */}
              <div>
                <label style={labelStyle}>Progreso: {form.progress ?? 0}%</label>
                <input type="range" min={0} max={100} value={form.progress ?? 0} onChange={e => setForm((f: any) => ({ ...f, progress: Number(e.target.value) }))} style={{ width: '100%', accentColor: color }} />
              </div>

              {/* Dates */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
  <div>
    <label style={labelStyle}>Fecha inicio</label>
    <CustomDateInput
      value={form.startDate || ''}
      onChange={v => setForm((f: any) => ({ ...f, startDate: v }))}
      accent={color}
      inputStyle={inputStyle}
    />
  </div>
  <div>
    <label style={labelStyle}>Fecha fin estimada</label>
    <CustomDateInput
      value={form.endDate || ''}
      onChange={v => setForm((f: any) => ({ ...f, endDate: v }))}
      accent={color}
      inputStyle={inputStyle}
    />
  </div>
</div>

              {/* Lead */}
              <div>
                <label style={labelStyle}>Responsable</label>
                <input value={form.leadName || ''} onChange={e => setForm((f: any) => ({ ...f, leadName: e.target.value }))} placeholder="Nombre del responsable" style={inputStyle} />
              </div>

              {/* Miembros: uids, igual que guarda Programación */}
              <div>
                <label style={labelStyle}>Miembros</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {users.length === 0 && (form.members ?? []).length === 0 && (
                    <span style={{ fontSize: 11, color: 'var(--moon-muted)' }}>No hay usuarios para mostrar</span>
                  )}
                  {/* Miembros guardados que ya no están en la lista: se pueden quitar */}
                  {(form.members ?? []).filter(uid => !users.some(u => u.uid === uid)).map(uid => (
                    <button key={uid} type="button"
                      onClick={() => setForm((f: Partial<Project>) => ({ ...f, members: (f.members ?? []).filter(m => m !== uid) }))}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', background: `${color}12`, border: `1px solid ${color}25`, color: panelInk(color) }}>
                      {nombreDe(users, uid)} <X size={9} />
                    </button>
                  ))}
                  {users.map(u => {
                    const sel = (form.members ?? []).includes(u.uid);
                    return (
                      <button key={u.uid} type="button"
                        onClick={() => setForm((f: Partial<Project>) => ({
                          ...f,
                          members: sel ? (f.members ?? []).filter(m => m !== u.uid) : [...(f.members ?? []), u.uid],
                        }))}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 8, fontSize: 11,
                          cursor: 'pointer', fontFamily: 'inherit',
                          background: sel ? `${color}12` : 'var(--moon-surface-raised)',
                          border: `1px solid ${sel ? color + '25' : bd}`,
                          color: panelInk(sel ? color : 'var(--moon-muted)'),
                        }}>
                        {sel && <CheckCircle2 size={9} />}
                        {u.displayName || u.email || u.uid}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label style={labelStyle}>Etiquetas</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onAddTag())} placeholder="Añadir etiqueta…" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={onAddTag} style={{ padding: '0 13px', borderRadius: 9, background: `${color}14`, border: `1px solid ${color}28`, color: panelInk(color), cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', flexShrink: 0 }}>+</button>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(form.tags ?? []).map((t: string) => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 8, fontSize: 11, background: `${color}12`, border: `1px solid ${color}25`, color: panelInk(color) }}>
                      {t}<button onClick={() => onRemoveTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: panelInk(color), display: 'flex', padding: 0 }}><X size={9} /></button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Tech */}
              <div>
                <label style={labelStyle}>Tecnologías / Stack</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
                  <input value={techInput} onChange={e => setTechInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onAddTech())} placeholder="React, Node, Figma…" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={onAddTech} style={{ padding: '0 13px', borderRadius: 9, background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', flexShrink: 0 }}>+</button>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(form.tech ?? []).map((t: string) => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 8, fontSize: 11, background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)' }}>
                      {t}<button onClick={() => onRemoveTech(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--moon-muted)', display: 'flex', padding: 0 }}><X size={9} /></button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div>
                <label style={labelStyle}>Enlaces</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { key: 'repoUrl', icon: Github, ph: 'URL del repositorio' },
                    { key: 'liveUrl', icon: Globe,  ph: 'URL en producción' },
                    { key: 'docsUrl', icon: BookOpen, ph: 'URL de documentación' },
                  ].map(({ key, icon: Icon, ph }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon size={13} style={{ color: 'var(--moon-muted)', flexShrink: 0 }} />
                      <input
                        value={(form as any)[key] || ''}
                        onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                        placeholder={ph} style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Pinned */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setForm((f: any) => ({ ...f, pinned: !f.pinned }))} style={{
                  width: 36, height: 20, borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: form.pinned ? color : 'var(--moon-surface-raised)',
                  transition: 'background 0.2s', position: 'relative', flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: 2, left: form.pinned ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--moon-muted)' }}>Destacar proyecto</span>
                <Star size={11} style={{ color: panelInk(form.pinned ? '#fbbf24' : 'var(--moon-muted)') }} />
              </div>
            </div>
          )}

          {formTab === 'blocks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Block picker */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--moon-muted)' }}>
                    {(form.blocks ?? []).length} bloque{(form.blocks ?? []).length !== 1 ? 's' : ''} — arrastra o usa las flechas para reordenar
                  </span>
                  <button onClick={() => setShowBlockPicker(v => !v)} style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9,
                    fontSize: 12, cursor: 'pointer', background: `${color}14`,
                    border: `1px solid ${color}28`, color: panelInk(color), fontFamily: 'inherit',
                  }}>
                    <PlusCircle size={12} /> Añadir bloque
                  </button>
                </div>

                {showBlockPicker && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 7, padding: 14, background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, borderRadius: 12, marginBottom: 12 }}>
                    {(Object.entries(BLOCK_CFG) as [BlockType, typeof BLOCK_CFG[BlockType]][]).map(([type, cfg]) => (
                      <button key={type} onClick={() => { onAddBlock(type); setShowBlockPicker(false); }} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        background: 'var(--moon-surface)', border: `1px solid ${bd}`,
                        color: 'var(--moon-muted)', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${cfg.color}40`; (e.currentTarget as HTMLElement).style.background = `${cfg.color}08`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = bd; (e.currentTarget as HTMLElement).style.background = 'var(--moon-surface)'; }}
                      >
                        <cfg.icon size={16} style={{ color: panelInk(cfg.color) }} />
                        <span style={{ fontSize: 10, textAlign: 'center' }}>{cfg.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(form.blocks ?? []).length === 0 ? (
  <div style={{ padding: '32px 20px', border: `1px dashed ${bd}`, borderRadius: 12, textAlign: 'center' }}>
    <Layers size={22} style={{ color: 'var(--moon-muted)', marginBottom: 8 }} />
    <p style={{ fontSize: 12, color: 'var(--moon-muted)', margin: 0 }}>
      Añade bloques de contenido — texto, ideas, árboles, esquemas y más
    </p>
  </div>
) : (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {[...(form.blocks ?? [])].sort((a: Block, b: Block) => a.order - b.order).map((block: Block, idx: number) => (
      <div
        key={block.id}
        draggable
        onDragStart={() => {
          dragItem.current = idx;
          setDraggingIdx(idx);
        }}
        onDragEnter={() => { dragOver.current = idx; }}
        onDragOver={e => e.preventDefault()}
        onDragEnd={() => {
          if (dragItem.current === null || dragOver.current === null) return;
          if (dragItem.current === dragOver.current) {
            dragItem.current = null;
            dragOver.current = null;
            setDraggingIdx(null);
            return;
          }
          setForm((f: any) => {
            const blocks = [...(f.blocks ?? [])].sort((a: Block, b: Block) => a.order - b.order);
            const dragged = blocks.splice(dragItem.current!, 1)[0];
            blocks.splice(dragOver.current!, 0, dragged);
            // reasignar order
            return { ...f, blocks: blocks.map((b, i) => ({ ...b, order: i })) };
          });
          dragItem.current = null;
          dragOver.current = null;
          setDraggingIdx(null);
        }}
        style={{
          opacity: draggingIdx === idx ? 0.4 : 1,
          transform: draggingIdx === idx ? 'scale(0.98)' : 'scale(1)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          cursor: 'grab',
        }}
      >
        <BlockEditor
          block={block}
          onChange={b => onUpdateBlock(block.id, b)}
          onDelete={() => onDeleteBlock(block.id)}
          onMoveUp={idx > 0 ? () => onMoveBlock(block.id, -1) : undefined}
          onMoveDown={idx < (form.blocks ?? []).length - 1 ? () => onMoveBlock(block.id, 1) : undefined}
          accent={color}
          inputStyle={inputStyle}
        />
      </div>
    ))}
  </div>
)}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${bd}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, cursor: 'pointer', background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: 'var(--moon-muted)', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button className="moon-panel-action" onClick={onSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer', background: accent, border: 'none', color: 'var(--accent-on-user, var(--moon-accent-ink))', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isEdit ? 'Guardar cambios' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Proyectos;
