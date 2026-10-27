import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, type DocumentSnapshot } from 'firebase/firestore';
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock3, Download, Eye, Globe, LayoutTemplate, Loader2, Monitor, RefreshCw, Save, Send, Smartphone, Sparkles, Upload } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_MOON_CONTENT, MOON_DRAFT_PATH, MOON_PREVIEW_CONTENT, MOON_PREVIEW_READY, MOON_PUBLISHED_PATH,
  normalizeMoonContent, validateMoonContent, type MoonContent,
} from '@/lib/moonContent';
import { ContentFields } from './webMoon/ContentFields';
import { setContentAt, type ContentPath, type ContentValue } from './webMoon/fieldHelpers';
import './webMoon/styles.css';

const GROUPS: { id: string; label: string; keys: (keyof MoonContent)[] }[] = [
  { id: 'brand', label: 'Identidad y SEO', keys: ['brand'] },
  { id: 'hero', label: 'Portada', keys: ['hero'] },
  { id: 'about', label: 'Estudio', keys: ['about'] },
  { id: 'services', label: 'Servicios', keys: ['services'] },
  { id: 'portfolio', label: 'Portafolio', keys: ['portfolio'] },
  { id: 'process', label: 'Proceso', keys: ['process'] },
  { id: 'team', label: 'Equipo', keys: ['team'] },
  { id: 'download', label: 'Aplicación', keys: ['download'] },
  { id: 'faq', label: 'Preguntas', keys: ['faq'] },
  { id: 'contact', label: 'Contacto y pie', keys: ['contact', 'footer', 'socials'] },
  { id: 'quote', label: 'Cotización y portal', keys: ['quote', 'portal'] },
  { id: 'layout', label: 'Secciones y movimiento', keys: ['sections', 'announcement', 'motion'] },
];

const publishedRef = doc(db, ...MOON_PUBLISHED_PATH);
const draftRef = doc(db, ...MOON_DRAFT_PATH);
type StoredContent = { content: MoonContent; revision: number; updatedAt: string | null };
type Recovery = { content: MoonContent; draftRevision: number; publishedRevision: number };

/** Keep editable strings (including invalid URLs) until the user corrects them. */
function editableContent(value: unknown): MoonContent {
  const restore = (base: unknown, raw: unknown): unknown => {
    if (typeof base === 'string') return typeof raw === 'string' ? raw : base;
    if (Array.isArray(base)) return base.map((item, index) => restore(item, Array.isArray(raw) ? raw[index] : undefined));
    if (base && typeof base === 'object') {
      const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      return Object.fromEntries(Object.entries(base).map(([key, item]) => [key, key === 'id' ? item : restore(item, source[key])]));
    }
    return base;
  };
  return restore(normalizeMoonContent(value), value) as MoonContent;
}

function readDocument(snapshot: DocumentSnapshot): StoredContent {
  if (!snapshot.exists()) return { content: structuredClone(DEFAULT_MOON_CONTENT), revision: 0, updatedAt: null };
  const data = snapshot.data();
  if (!data.content || typeof data.content !== 'object' || Array.isArray(data.content)) throw new Error('El documento guardado no tiene un contenido válido. Revisa la configuración de la web.');
  return {
    content: normalizeMoonContent(data.content),
    revision: Number.isInteger(data.revision) && data.revision >= 0 ? data.revision : 0,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }) : null,
  };
}

function errorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied')) return 'Tu sesión no tiene permiso para administrar el contenido en Firestore. Revisa las reglas del proyecto y tu rol.';
  if (code.includes('unavailable') || code.includes('network')) return 'No se pudo conectar con Firestore. Revisa tu conexión y vuelve a intentarlo. Tus cambios siguen aquí.';
  return error instanceof Error ? error.message : 'No se pudo completar la operación. Tus cambios siguen aquí.';
}

function configuredPreview(): URL | null {
  try {
    const url = new URL(import.meta.env.VITE_MOON_WEB_URL || 'https://moon-studios.netlify.app');
    const local = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    if (url.username || url.password) return null;
    return url;
  } catch { return null; }
}

export function WebMoonPanel({ ir, onDirtyChange }: { ir?: (tab: string) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const { currentUser, puede } = useAuth();
  const permitted = puede('webs');
  const [content, setContent] = useState<MoonContent>(() => structuredClone(DEFAULT_MOON_CONTENT));
  const [baseline, setBaseline] = useState(() => JSON.stringify(DEFAULT_MOON_CONTENT));
  const [publishedSignature, setPublishedSignature] = useState(() => JSON.stringify(DEFAULT_MOON_CONTENT));
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setLoaded] = useState(false);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [operation, setOperation] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recovered, setRecovered] = useState(false);
  const [activeGroup, setActiveGroup] = useState('hero');
  const [showPreview, setShowPreview] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [previewPath, setPreviewPath] = useState('/');
  const [previewReady, setPreviewReady] = useState(false);
  const [previewSlow, setPreviewSlow] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewContainerWidth, setPreviewContainerWidth] = useState(800);
  const [draftMeta, setDraftMeta] = useState({ revision: 0, updatedAt: null as string | null });
  const [publishedMeta, setPublishedMeta] = useState({ revision: 0, updatedAt: null as string | null });
  const [remoteRevisions, setRemoteRevisions] = useState({ draft: 0, published: 0 });
  const [revisionBase, setRevisionBase] = useState({ draft: 0, published: 0 });
  const contentRef = useRef(content);
  const savedContent = useRef(content);
  const mounted = useRef(true);
  const loadSequence = useRef(0);
  const iframe = useRef<HTMLIFrameElement>(null);
  const previewContainer = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const storageKey = `moon-web-editor:${currentUser?.uid || 'anonymous'}`;
  const loaded = hasLoaded && loadedUid === currentUser?.uid;
  const serialized = JSON.stringify(content);
  const dirty = loaded && serialized !== baseline;
  const pendingPublication = loaded && serialized !== publishedSignature;
  const busy = loading || operation !== null;
  const conflict = loaded && (remoteRevisions.draft !== revisionBase.draft || remoteRevisions.published !== revisionBase.published);
  const previewBase = useMemo(() => configuredPreview(), []);
  const previewSrc = useMemo(() => {
    if (!previewBase) return '';
    const url = new URL(previewPath, previewBase);
    url.searchParams.set('moon-preview', '1');
    return url.href;
  }, [previewBase, previewPath]);
  const previewLogicalWidth = previewWidth === 'mobile' ? 390 : 1280;
  const previewScale = Math.min(1, previewContainerWidth / previewLogicalWidth);

  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);

  const load = useCallback(async (restoreLocal = true) => {
    const sequence = ++loadSequence.current;
    await Promise.resolve();
    if (!mounted.current || sequence !== loadSequence.current) return;
    if (!permitted || !currentUser) { setLoading(false); return; }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const timeout = new Promise<never>((_, reject) => { setTimeout(() => reject(new Error('Firestore tardó demasiado en responder. Reintenta para cargar el contenido antes de guardar.')), 15000); });
      const [publishedSnapshot, draftSnapshot] = await Promise.race([
        Promise.all([getDocFromServer(publishedRef), getDocFromServer(draftRef)]), timeout,
      ]);
      if (!mounted.current || sequence !== loadSequence.current) return;
      const published = readDocument(publishedSnapshot);
      const draft = draftSnapshot.exists() ? readDocument(draftSnapshot) : { ...published, revision: 0, updatedAt: null };
      let next = draft.content;
      let base = { draft: draft.revision, published: published.revision };
      savedContent.current = draft.content;
      setBaseline(JSON.stringify(draft.content));
      setPublishedSignature(JSON.stringify(published.content));
      setDraftMeta({ revision: draft.revision, updatedAt: draft.updatedAt });
      setPublishedMeta({ revision: published.revision, updatedAt: published.updatedAt });
      setRemoteRevisions({ draft: draft.revision, published: published.revision });
      setRecovered(false);
      if (restoreLocal) {
        try {
          const raw = sessionStorage.getItem(storageKey);
          if (raw) {
            const recovery = JSON.parse(raw) as Recovery;
            if (recovery.content && typeof recovery.content === 'object') {
              next = editableContent(recovery.content);
              const savedOnSameRevision = recovery.draftRevision === draft.revision && recovery.publishedRevision === published.revision;
              if (!savedOnSameRevision) {
                base = { draft: recovery.draftRevision, published: recovery.publishedRevision };
                setNotice('Recuperamos tus cambios locales, pero otro administrador actualizó la web. Exporta tus cambios y recarga antes de volver a guardarlos.');
              } else setNotice('Recuperamos tus cambios sin guardar de esta sesión. Puedes continuar editándolos.');
              setRecovered(true);
            }
          }
        } catch { /* A malformed local recovery must not hide the server content. */ }
      }
      setRevisionBase(base);
      setContent(next);
      setLoadedUid(currentUser.uid);
      setLoaded(true);
    } catch (e) { if (mounted.current && sequence === loadSequence.current) setError(errorMessage(e)); }
    finally { if (mounted.current && sequence === loadSequence.current) setLoading(false); }
  }, [currentUser, permitted, storageKey]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; loadSequence.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!permitted || !currentUser || !loaded) return;
    const observe = (ref: typeof publishedRef, key: 'draft' | 'published') => onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      const revision = snapshot.exists() ? Number(snapshot.data().revision || 0) : 0;
      setRemoteRevisions(previous => ({ ...previous, [key]: revision }));
    }, e => setError(errorMessage(e)));
    const stopDraft = observe(draftRef, 'draft');
    const stopPublished = observe(publishedRef, 'published');
    return () => { stopDraft(); stopPublished(); };
  }, [currentUser, loaded, permitted]);

  useEffect(() => {
    if (!loaded || loading || operation) return;
    try {
      if (dirty) sessionStorage.setItem(storageKey, JSON.stringify({ content, draftRevision: revisionBase.draft, publishedRevision: revisionBase.published } satisfies Recovery));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Browser storage may be disabled; Firestore still works. */ }
  }, [content, dirty, loaded, loading, operation, revisionBase, storageKey]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const sendPreview = useCallback(() => {
    if (previewBase && iframe.current?.contentWindow) iframe.current.contentWindow.postMessage({ type: MOON_PREVIEW_CONTENT, content: normalizeMoonContent(contentRef.current) }, previewBase.origin);
  }, [previewBase]);

  useEffect(() => {
    if (!showPreview || !previewBase) return;
    const ready = (event: MessageEvent) => {
      if (event.origin !== previewBase.origin || event.source !== iframe.current?.contentWindow || !event.data || event.data.type !== MOON_PREVIEW_READY) return;
      setPreviewReady(true);
      setPreviewSlow(false);
      sendPreview();
    };
    window.addEventListener('message', ready);
    return () => window.removeEventListener('message', ready);
  }, [previewBase, sendPreview, showPreview]);

  useEffect(() => { if (previewReady && showPreview) sendPreview(); }, [content, previewReady, sendPreview, showPreview]);
  useEffect(() => {
    if (!showPreview) return;
    const timeout = window.setTimeout(() => setPreviewSlow(true), 12000);
    return () => window.clearTimeout(timeout);
  }, [previewSrc, showPreview, previewKey]);

  useEffect(() => {
    if (!showPreview || !previewContainer.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setPreviewContainerWidth(width);
    });
    observer.observe(previewContainer.current);
    return () => observer.disconnect();
  }, [showPreview]);

  const change = (path: ContentPath, next: ContentValue) => {
    setContent(previous => setContentAt(previous as unknown as ContentValue, path, next) as unknown as MoonContent);
    setNotice('');
    setError('');
  };

  const save = async (publish: boolean) => {
    if (!permitted || !currentUser || !loaded || busy) return;
    const validation = validateMoonContent(content);
    if (validation.length) { setError(validation.join(' ')); return; }
    if (conflict) { setError('Hay una versión más reciente. Exporta tus cambios si quieres conservarlos y recarga antes de guardar.'); return; }
    const next = normalizeMoonContent(content);
    const expected = { ...revisionBase };
    setOperation(publish ? 'publish' : 'draft');
    setError('');
    setNotice('');
    try {
      const revisions = await runTransaction(db, async transaction => {
        const [currentDraft, currentPublished] = await Promise.all([transaction.get(draftRef), transaction.get(publishedRef)]);
        const draftRevision = currentDraft.exists() ? Number(currentDraft.data().revision || 0) : 0;
        const publishedRevision = currentPublished.exists() ? Number(currentPublished.data().revision || 0) : 0;
        if (draftRevision !== expected.draft || publishedRevision !== expected.published) throw new Error('Otro administrador cambió el contenido mientras editabas. Exporta tus cambios y recarga para revisar la nueva versión.');
        const update = { content: next, updatedAt: serverTimestamp(), updatedBy: currentUser.uid };
        transaction.set(draftRef, { ...update, revision: draftRevision + 1 });
        if (publish) transaction.set(publishedRef, { ...update, revision: publishedRevision + 1 });
        return { draft: draftRevision + 1, published: publishedRevision + (publish ? 1 : 0) };
      });
      if (!mounted.current) return;
      setRevisionBase(revisions);
      const updatedAt = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
      setRemoteRevisions(revisions);
      setDraftMeta({ revision: revisions.draft, updatedAt });
      if (publish) setPublishedMeta({ revision: revisions.published, updatedAt });
      if (publish) setPublishedSignature(JSON.stringify(next));
      setContent(next);
      savedContent.current = next;
      setBaseline(JSON.stringify(next));
      setRecovered(false);
      try { sessionStorage.removeItem(storageKey); } catch { /* optional recovery cache */ }
      setNotice(publish ? 'Contenido publicado. La web conectada recibirá los cambios en tiempo real.' : 'Borrador guardado. Puedes seguir trabajando y publicarlo cuando esté listo.');
    } catch (e) { if (mounted.current) setError(errorMessage(e)); }
    finally { if (mounted.current) setOperation(null); }
  };

  const reload = () => {
    if (dirty && !window.confirm('¿Recargar y reemplazar los cambios sin guardar con el último contenido del servidor? Puedes exportarlos antes de continuar.')) return;
    try { sessionStorage.removeItem(storageKey); } catch { /* optional recovery cache */ }
    void load(false);
  };

  const resetPreview = () => { setPreviewReady(false); setPreviewSlow(false); };

  const discard = () => {
    if (!window.confirm('¿Descartar los cambios sin guardar y recuperar el último borrador cargado?')) return;
    setContent(structuredClone(savedContent.current));
    setRecovered(false);
    setError('');
    setNotice('Cambios descartados. Recuperamos el último contenido cargado.');
  };

  const exportContent = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'moon-studios-contenido.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importContent = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 512000) { setError('El archivo JSON debe pesar menos de 500 KB.'); return; }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('brand' in parsed) || !('hero' in parsed)) throw new Error('Selecciona un JSON de contenido Moon Studios exportado desde este editor.');
      // Validate URL strings before normalizing, so invalid destinations cannot disappear silently.
      const candidate = editableContent(parsed);
      const validation = validateMoonContent(candidate);
      if (validation.length) throw new Error(validation.join(' '));
      if (dirty && !window.confirm('¿Reemplazar tus cambios actuales con el contenido del archivo importado?')) return;
      setContent(normalizeMoonContent(candidate));
      setNotice('Contenido importado para revisión. Guárdalo como borrador o publícalo cuando esté listo.');
      setError('');
    } catch (e) { setError(errorMessage(e)); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  };

  if (!permitted) return <div className="mc-note mc-note-error"><AlertCircle /><span>Tu rol no tiene permiso para administrar las webs.</span></div>;
  const group = GROUPS.find(item => item.id === activeGroup) || GROUPS[0];
  const visibleContent = Object.fromEntries(group.keys.map(key => [key, content[key]])) as unknown as ContentValue;
  const visibleDefaults = Object.fromEntries(group.keys.map(key => [key, DEFAULT_MOON_CONTENT[key]])) as unknown as ContentValue;

  return <div className="mc">
    <div className="mc-top"><div><div className="mc-overline"><Sparkles />Moon Studios / Editor web</div><h2>Tu web, desde aquí.</h2><p>Edita el contenido, revisa el resultado y decide cuándo publicarlo.</p></div><div className="mc-actions">
      <button type="button" className="wb-btn" disabled={!loaded || busy} onClick={() => { resetPreview(); setShowPreview(previous => !previous); }}><Eye />{showPreview ? 'Ocultar vista previa' : 'Vista previa'}</button>
      <button type="button" className="wb-btn" disabled={!loaded || busy || conflict || (!dirty && draftMeta.revision > 0)} onClick={() => void save(false)}>{operation === 'draft' ? <Loader2 className="animate-spin" /> : <Save />}Guardar borrador</button>
      <button type="button" className="wb-btn wb-btn-fuerte" disabled={!loaded || busy || conflict || (!pendingPublication && publishedMeta.revision > 0)} onClick={() => void save(true)}>{operation === 'publish' ? <Loader2 className="animate-spin" /> : <Send />}Publicar</button>
    </div></div>
    <div className="mc-status" role="status"><span className={dirty || pendingPublication ? 'mc-dirty' : ''}>{dirty || pendingPublication ? <Clock3 /> : <CheckCircle2 />}{dirty ? 'Cambios sin guardar' : pendingPublication ? 'Borrador pendiente de publicar' : loaded ? 'Sin cambios pendientes' : 'Esperando conexión'}</span><span><Save />Borrador {draftMeta.revision > 0 ? `v${draftMeta.revision}` : 'sin guardar'}{draftMeta.updatedAt ? ` · ${draftMeta.updatedAt}` : ''}</span><span><Globe />Web {publishedMeta.revision > 0 ? `v${publishedMeta.revision}` : 'contenido inicial'}{publishedMeta.updatedAt ? ` · ${publishedMeta.updatedAt}` : ''}</span></div>
    {error && <div className="mc-note mc-note-error" role="alert"><AlertCircle /><span>{error}</span></div>}
    {notice && <div className={`mc-note${recovered ? '' : ' mc-note-success'}`} role="status"><CheckCircle2 /><span>{notice}</span></div>}
    {conflict && <div className="mc-note mc-note-error" role="alert"><AlertCircle /><span>Hay cambios de otro administrador. Exporta tu versión y recarga antes de guardar para evitar reemplazar su trabajo.</span></div>}
    {loading && <div className="mc-loading"><Loader2 className="animate-spin" /><span>Cargando borrador y publicación desde Firestore…</span></div>}
    {!loading && !loaded && <div className="mc-loading"><p>No pudimos cargar el contenido. Tus ediciones se habilitarán al conectar.</p><button className="wb-btn" type="button" onClick={() => void load()}><RefreshCw />Reintentar conexión</button></div>}
    {loaded && !loading && <>
      <div className="mc-tool-row"><p className="mc-caption">El borrador es privado. «Publicar» actualiza la web que ve el público.</p><div className="mc-actions"><button className="wb-btn" type="button" disabled={busy} onClick={reload}><RefreshCw />Recargar</button><button className="wb-btn" type="button" disabled={busy || !dirty} onClick={discard}>Descartar</button></div></div>
      <div className="mc-tabs" role="tablist" aria-label="Contenido de la web">{GROUPS.map(item => <button type="button" role="tab" key={item.id} id={`moon-tab-${item.id}`} aria-selected={item.id === activeGroup} aria-controls="moon-editor-panel" onClick={() => setActiveGroup(item.id)}>{item.id === 'layout' && <LayoutTemplate />}{item.label}</button>)}</div>
      <div className={`mc-layout${showPreview ? ' mc-with-preview' : ''}`}><div role="tabpanel" id="moon-editor-panel" aria-labelledby={`moon-tab-${activeGroup}`}><ContentFields value={visibleContent} defaults={visibleDefaults} onChange={change} disabled={busy} />
        {(activeGroup === 'portfolio' || activeGroup === 'team') && <div className="mc-external-editors"><p className="mc-caption">Los {activeGroup === 'portfolio' ? 'proyectos' : 'integrantes'} se administran en su módulo y se muestran directamente en la web.</p><button type="button" className="wb-btn" onClick={() => ir?.(activeGroup === 'portfolio' ? 'portafolio' : 'equipo')}>Editar {activeGroup === 'portfolio' ? 'proyectos' : 'integrantes'}<ArrowUpRight /></button></div>}
        {activeGroup === 'layout' && <p className="mc-preview-hint">Las flechas cambian el orden de las secciones de Inicio. «Mostrar» controla su visibilidad y los enlaces de navegación. Las animaciones también respetan la preferencia de movimiento reducido de cada visitante.</p>}
      </div>{showPreview && <div className="mc-preview-area"><div className="mc-tool-row"><label className="mc-field"><span>Página para revisar</span><select className="wb-btn" value={previewPath} onChange={e => { resetPreview(); setPreviewPath(e.target.value); }}><option value="/">Inicio</option><option value="/proyectos">Proyectos</option><option value="/cotizar">Cotizar</option><option value="/registro">Portal</option></select></label><button className="wb-btn" type="button" onClick={() => { resetPreview(); setPreviewKey(value => value + 1); }}><RefreshCw />Actualizar vista</button></div>
        <div className="mc-preview"><div className="mc-browser"><span>{previewBase?.hostname || 'URL de vista previa inválida'} · {previewReady ? 'Vista de tus cambios' : 'Esperando conexión'}</span><div className="mc-preview-controls"><button type="button" aria-label="Vista de escritorio" aria-pressed={previewWidth === 'desktop'} onClick={() => setPreviewWidth('desktop')}><Monitor /></button><button type="button" aria-label="Vista móvil" aria-pressed={previewWidth === 'mobile'} onClick={() => setPreviewWidth('mobile')}><Smartphone /></button></div></div><div className="mc-preview-scroll" ref={previewContainer}><div style={{ width: previewLogicalWidth * previewScale, height: 850 * previewScale, margin: '0 auto', position: 'relative' }}>{previewSrc && <iframe ref={iframe} key={previewKey} src={previewSrc} title="Vista previa del contenido Moon Studios" style={{ width: previewLogicalWidth, height: 850, transform: `scale(${previewScale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }} sandbox="allow-scripts allow-same-origin allow-popups allow-downloads" referrerPolicy="strict-origin" />}</div></div></div>
        {previewSlow && !previewReady && <div className="mc-note mc-note-error"><AlertCircle /><span>La web todavía no conectó la vista previa. Comprueba que la versión nueva esté desplegada y que su origen del dashboard esté autorizado. El editor conserva tus cambios.</span></div>}
        <p className="mc-preview-hint">La vista previa muestra tus cambios sin publicarlos cuando la web devuelve la confirmación de conexión. Si todavía no está conectada, el iframe muestra la versión pública.</p>
      </div>}</div>
      <div className="mc-transfer"><p className="mc-caption">Respaldo de contenido para importar, compartir o conservar otra versión.</p><button className="wb-btn" type="button" onClick={exportContent}><Download />Exportar JSON</button><button className="wb-btn" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload />Importar JSON</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => void importContent(e.target.files?.[0])} /></div>
    </>}
  </div>;
}
