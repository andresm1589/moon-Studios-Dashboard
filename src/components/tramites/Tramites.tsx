import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowDownToLine, ArrowUpRight, Check, ChevronRight, ClipboardList, CreditCard, Download, Eye, FileCheck2, FilePenLine, Files, Inbox, LayoutGrid, LoaderCircle, Plus, RefreshCw, Search, Send, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandLogo } from '@/components/BrandLogo';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fechaHora } from '@/lib/ajustes/fecha';
import { exportWorkspaceCsv } from '@/lib/workspaceExport';
import { cancelarTramite, eliminarTramite, cargarTramitesBase, codigoEmpleado, escucharSolicitudes, escucharTipos, guardarTipo, emitirDocumentoTramite,
  resolverTramite, solicitarTramite, ESTADOS_TRAMITE, type Actor, type EstadoTramite, type SolicitudTramite, type TipoTramite } from '@/lib/tramites';
import { crearBorradorDocumento, documentoDeVista, type BorradorDocumentoTramite, type DocumentoTramite, type PlantillaDocumentoTramite } from '@/lib/tramitesDocumentoModelo';
import { IconoTipo } from './iconos';
import { FormularioTramite } from './FormularioTramite';
import { DetalleTramite, EstadoTramiteChip } from './DetalleTramite';
import { EditorTipo } from './EditorTipo';
import { DocumentoPreview } from './DocumentoPreview';
import '@/styles/enterprise-sections.css';
import '@/styles/tramites.css';
import '@/styles/tramites-centro.css';

type Vista = 'solicitar' | 'mios' | 'documentos' | 'bandeja' | 'catalogo';
type FiltroEstado = 'abiertos' | 'todos' | EstadoTramite;
type Resolucion = Exclude<EstadoTramite, 'pendiente' | 'cancelado'>;
const ABIERTOS: EstadoTramite[] = ['pendiente', 'en_revision'];
const CHIPS: Record<FiltroEstado, string> = { abiertos: 'Por atender', todos: 'Todos', pendiente: 'Pendientes', en_revision: 'En revisión', aprobado: 'Aprobados', rechazado: 'Rechazados', cancelado: 'Cancelados' };
const mensaje = (e: unknown) => e instanceof Error && /permission/i.test(e.message) ? 'No tienes permiso para consultar esta información.' : 'No se pudo cargar la información. Revisa tu conexión y vuelve a intentar.';

export interface TramitesController {
  actor: Actor; isCEO: boolean; revisa: boolean; editaCatalogo: boolean;
  tipos: TipoTramite[] | null; mias: SolicitudTramite[] | null; todas: SolicitudTramite[] | null; error: string;
  refrescar: () => void;
  solicitar: (tipo: TipoTramite, respuestas: Record<string, string>) => Promise<string>;
  cancelar: (solicitud: SolicitudTramite) => Promise<void>;
  eliminar: (solicitud: SolicitudTramite) => Promise<void>;
  resolver: (solicitud: SolicitudTramite, estado: Resolucion, comentario: string, documento?: BorradorDocumentoTramite) => Promise<void>;
  emitir: (solicitud: SolicitudTramite, documento: BorradorDocumentoTramite) => Promise<void>;
  guardarTipo: (tipo: TipoTramite, nuevo: boolean) => Promise<void>;
  cargarBase: () => Promise<void>;
}
type Feed<T> = { clave: string; datos: T[] | null; error: string };

export default function Tramites() {
  const { userProfile, isCEO, userRole, accesoAdmin } = useAuth();
  const uid = userProfile?.uid || '';
  const revisa = isCEO || (userRole === 'Administración' && accesoAdmin?.tramites.resolver === true);
  const editaCatalogo = isCEO || (userRole === 'Administración' && accesoAdmin?.tramites.catalogo === true);
  const [intento, setIntento] = useState(0);
  const clave = `${uid}:${userRole}:${intento}`;
  const claveBandeja = `${clave}:${revisa}`;
  const actual = useRef(clave);
  useLayoutEffect(() => { actual.current = clave; }, [clave]);
  const [tipos, setTipos] = useState<Feed<TipoTramite>>({ clave: '', datos: null, error: '' });
  const [mias, setMias] = useState<Feed<SolicitudTramite>>({ clave: '', datos: null, error: '' });
  const [todas, setTodas] = useState<Feed<SolicitudTramite>>({ clave: '', datos: null, error: '' });
  useEffect(() => {
    if (!uid) return;
    let activa = true;
    const off = escucharTipos(datos => { if (activa && actual.current === clave) setTipos({ clave, datos, error: '' }); }, e => { if (activa && actual.current === clave) setTipos({ clave, datos: null, error: mensaje(e) }); });
    return () => { activa = false; off(); };
  }, [uid, clave]);
  useEffect(() => {
    if (!uid) return;
    let activa = true;
    const off = escucharSolicitudes(uid, false, datos => { if (activa && actual.current === clave) setMias({ clave, datos, error: '' }); }, e => { if (activa && actual.current === clave) setMias({ clave, datos: null, error: mensaje(e) }); });
    return () => { activa = false; off(); };
  }, [uid, clave]);
  useEffect(() => {
    if (!uid || !revisa) return;
    let activa = true;
    const off = escucharSolicitudes(uid, true, datos => { if (activa && actual.current === clave) setTodas({ clave: claveBandeja, datos, error: '' }); }, e => { if (activa && actual.current === clave) setTodas({ clave: claveBandeja, datos: null, error: mensaje(e) }); });
    return () => { activa = false; off(); };
  }, [uid, revisa, clave, claveBandeja]);
  if (!userProfile || !userRole) return null;
  const actor: Actor = { uid, nombre: userProfile.displayName || userProfile.email || 'Personal Moon Studios', rol: userRole };
  const vigente = () => { if (actual.current !== clave) throw new Error('La sesión cambió. Abre nuevamente la solicitud.'); };
  const controller: TramitesController = {
    actor, isCEO, revisa, editaCatalogo,
    tipos: tipos.clave === clave ? tipos.datos : null, mias: mias.clave === clave ? mias.datos : null,
    todas: revisa && todas.clave === claveBandeja ? todas.datos : null,
    error: [tipos, mias, ...(revisa ? [todas] : [])].filter(f => f.clave === clave || f.clave === claveBandeja).map(f => f.error).filter(Boolean).join(' '),
    refrescar: () => setIntento(n => n + 1),
    solicitar: (t, r) => { vigente(); return solicitarTramite(t, r, actor); },
    cancelar: s => { vigente(); return cancelarTramite(s.id); },
    eliminar: s => { vigente(); return eliminarTramite(s, actor); },
    resolver: (s, e, c, d) => { vigente(); return resolverTramite(s, e, c, actor, d); },
    emitir: (s, d) => { vigente(); return emitirDocumentoTramite(s, d, actor); },
    guardarTipo: (t, n) => { vigente(); return guardarTipo(t, n, actor); },
    cargarBase: () => { vigente(); return cargarTramitesBase(actor); },
  };
  return <TramitesPanel key={`${uid}:${userRole}`} controller={controller} />;
}

export function TramitesPanel({ controller: c }: { controller: TramitesController }) {
  const { actor, isCEO, revisa, editaCatalogo, tipos, mias, todas } = c;
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState(''), [aviso, setAviso] = useState('');
  const [formulario, setFormulario] = useState<TipoTramite | null>(null);
  const [editor, setEditor] = useState<TipoTramite | 'nuevo' | null>(null);
  const [filtro, setFiltro] = useState<FiltroEstado>('abiertos');
  const [tipoFiltro, setTipoFiltro] = useState('todos'), [busqueda, setBusqueda] = useState('');
  const [busquedaDocumentos, setBusquedaDocumentos] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [plantilla, setPlantilla] = useState<DocumentoTramite | null>(null);
  const vista = (params.get('vista') as Vista) || (revisa ? 'bandeja' : 'solicitar'), detalleId = params.get('id');
  useEffect(() => { if (!aviso) return; const t = window.setTimeout(() => setAviso(''), 6000); return () => window.clearTimeout(t); }, [aviso]);
  const cambiarVista = (v: Vista) => { setParams(p => { const n = new URLSearchParams(p); n.set('vista', v); n.delete('id'); return n; }); setBusqueda(''); setError(''); };
  const abrirDetalle = (id: string | null) => setParams(p => { const n = new URLSearchParams(p); if (id) n.set('id', id); else n.delete('id'); return n; }, { replace: !id });
  const tipoDe = (id: string) => tipos?.find(t => t.id === id);
  const bandeja = useMemo(() => revisa ? todas || [] : [], [revisa, todas]);
  const mias_ = mias || [];
  const documentos = mias_.filter(s => s.estado === 'aprobado' && s.documento);
  const porAtender = bandeja.filter(s => ABIERTOS.includes(s.estado) && (isCEO || (!s.soloCeo && s.solicitanteUid !== actor.uid)));
  const detalle = detalleId ? [...bandeja, ...mias_].find(s => s.id === detalleId) : undefined;
  const pestañas: { v: Vista; nombre: string; icono: typeof Inbox; n?: number; ver: boolean }[] = [
    { v: 'solicitar', nombre: 'Solicitar', icono: LayoutGrid, ver: true },
    { v: 'mios', nombre: 'Mis trámites', icono: ClipboardList, n: mias_.filter(s => ABIERTOS.includes(s.estado)).length, ver: true },
    { v: 'documentos', nombre: 'Mis documentos', icono: Files, n: documentos.length, ver: true },
    { v: 'bandeja', nombre: 'Bandeja', icono: Inbox, n: porAtender.length, ver: revisa },
    { v: 'catalogo', nombre: 'Catálogo', icono: SlidersHorizontal, ver: editaCatalogo },
  ];
  const vistaActual = pestañas.some(p => p.v === vista && p.ver) ? vista : 'solicitar';
  const filtradas = bandeja.filter(s => (filtro === 'todos' || (filtro === 'abiertos' ? ABIERTOS.includes(s.estado) : s.estado === filtro))
    && (tipoFiltro === 'todos' || s.tipoId === tipoFiltro) && (!busqueda.trim() || `${s.id} ${s.solicitanteNombre} ${s.tipoNombre} ${codigoEmpleado(s.solicitanteUid)} ${s.solicitanteRol}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))));
  const conteo = (f: FiltroEstado) => f === 'todos' ? bandeja.length : f === 'abiertos' ? bandeja.filter(s => ABIERTOS.includes(s.estado)).length : bandeja.filter(s => s.estado === f).length;
  const bloqueoPara = (s: SolicitudTramite) => !revisa ? undefined : !isCEO && s.soloCeo ? 'Este trámite está reservado para el CEO.' : !isCEO && s.solicitanteUid === actor.uid ? 'Otra persona de la dirección debe resolver tu solicitud.' : null;
  const accion = async (clave: string, trabajo: () => Promise<void>, exito?: string) => {
    if (ocupado) return; setOcupado(clave); setError('');
    try { await trabajo(); if (exito) setAviso(exito); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); } finally { setOcupado(''); }
  };
  const descargar = (s: SolicitudTramite) => accion(s.id, async () => {
    if (!s.documento) throw new Error('No hay un documento disponible.');
    const { descargarDocumentoTramite } = await import('@/lib/tramitesPdf'); await descargarDocumentoTramite(s.documento);
  });
  const exportar = () => exportWorkspaceCsv('tramites', ['ID', 'Trámite', 'Solicitante', 'ID Moon', 'Rol', 'Estado', 'Presentado', 'Atendido por', 'Respuesta', 'Documento'],
    filtradas.map(s => [s.id, s.tipoNombre, s.solicitanteNombre, codigoEmpleado(s.solicitanteUid), s.solicitanteRol, ESTADOS_TRAMITE[s.estado], fechaHora(s.createdAt), s.resueltoPorNombre || '', s.comentario, s.documento?.folio || '']));
  const verDiseño = (p: PlantillaDocumentoTramite) => {
    const s: SolicitudTramite = { id: 'vista-previa', tipoId: p === 'credencial' ? 'tarjeta' : p, tipoNombre: p === 'credencial' ? 'Tarjeta Moon Studios' : 'Constancia', solicitanteUid: actor.uid,
      solicitanteNombre: actor.nombre, solicitanteRol: actor.rol, respuestas: {}, estado: 'pendiente', comentario: '', soloCeo: false, createdAt: new Date(), updatedAt: new Date() };
    const b = { ...crearBorradorDocumento(s), plantilla: p };
    if (p === 'respuesta') { b.titulo = 'Documento de respuesta'; b.contenido = 'Aquí se incluirá la respuesta de la dirección a tu solicitud, con los detalles de la aprobación y los siguientes pasos.'; }
    setPlantilla(documentoDeVista(s, b, actor));
  };
  const fila = (s: SolicitudTramite, propia: boolean) => <button key={s.id} type="button" className="tr-fila" data-moon-reveal="row" onClick={() => abrirDetalle(s.id)}>
    <IconoTipo icono={tipoDe(s.tipoId)?.icono || 'general'} /><span className="tr-fila__texto"><strong>{propia ? s.tipoNombre : `${s.solicitanteNombre} · ${s.tipoNombre}`}</strong>
      <span>{propia ? s.documento ? `Documento listo · ${s.documento.folio}` : s.comentario || `Presentado el ${fechaHora(s.createdAt)}` : `${codigoEmpleado(s.solicitanteUid)} · ${s.solicitanteRol} · ${fechaHora(s.createdAt)}`}</span></span>
    <span className="tr-fila__lado"><EstadoTramiteChip estado={s.estado} />{s.documento && <span className="tr-sello"><FileCheck2 />PDF disponible</span>}{s.soloCeo && !propia && <span className="tr-sello"><ShieldCheck />Solo CEO</span>}</span><ChevronRight className="tr-fila__flecha" />
  </button>;
  const cargando = (texto: string) => <p className="tr-cargando"><LoaderCircle className="tr-spin" />{texto}</p>;
  return <div className="moon-module moon-module--tramites tr-page tr-centro">
    {vistaActual === 'solicitar' ? <header className="tr-hero" data-moon-reveal="card"><div className="tr-hero__texto"><span className="tr-eyebrow">PERSONAS / TRÁMITES</span><h1>¿Qué necesitas<br /><em>hoy?</em></h1><p>Solicita, sigue el proceso y recibe tus documentos. Tu tarjeta Moon Studios y lo que necesitas, en un solo lugar.</p>
      <div className="tr-hero__acciones"><span className="tr-guia-inicio">Elige un trámite abajo para comenzar.</span><button className="enterprise-action" type="button" onClick={() => cambiarVista('documentos')}><ArrowDownToLine />Mis documentos</button></div>
    </div><div className="tr-hero__tarjeta" aria-label="Identidad de tu espacio de trabajo"><BrandLogo variant="light" /><span>UN EQUIPO. UNA ÓRBITA.</span><strong>{actor.nombre}</strong><div><span>{actor.rol}</span><code>{codigoEmpleado(actor.uid)}</code></div><small>Tu espacio de trámites</small><ArrowUpRight className="tr-hero__orbita" /></div></header> : <header className="tr-cabecera-simple"><div><span className="tr-eyebrow">MOON STUDIOS / PERSONAS</span><h1>Trámites y documentos</h1></div><button type="button" className="enterprise-action enterprise-action--primary" onClick={() => cambiarVista('solicitar')}><Plus />Nueva solicitud</button></header>}
    {vistaActual === 'solicitar' && <div className="tr-resumen" aria-label="Resumen de trámites">
      <button type="button" onClick={() => cambiarVista('mios')}><span><Send />En seguimiento</span><strong>{mias_.filter(s => ABIERTOS.includes(s.estado)).length.toString().padStart(2, '0')}</strong><small>Solicitudes abiertas</small></button>
      <button type="button" onClick={() => cambiarVista('documentos')}><span><FileCheck2 />Listos para ti</span><strong>{documentos.length.toString().padStart(2, '0')}</strong><small>Documentos emitidos</small></button>
      <button type="button" onClick={() => cambiarVista(revisa ? 'bandeja' : 'mios')}><span>{revisa ? <Inbox /> : <Check />}{revisa ? 'Bandeja del equipo' : 'Resueltas'}</span><strong>{(revisa ? porAtender.length : mias_.filter(s => !ABIERTOS.includes(s.estado)).length).toString().padStart(2, '0')}</strong><small>{revisa ? 'Solicitudes por atender' : 'Respuestas recibidas'}</small></button>
    </div>}
    <nav className="tr-tabs" aria-label="Secciones de trámites">{pestañas.filter(p => p.ver).map(({ v, nombre, icono: Icono, n }) => <button key={v} type="button" aria-current={vistaActual === v ? 'page' : undefined} onClick={() => cambiarVista(v)}><Icono />{nombre}{!!n && <span className="tr-count">{n}</span>}</button>)}</nav>
    {aviso && <p className="tr-nota" role="status"><Check />{aviso}</p>}
    {(error || c.error) && <div className="tr-alerta" role="alert"><AlertCircle /><span>{error || c.error}</span>{c.error && <button type="button" className="enterprise-action" onClick={c.refrescar}><RefreshCw />Reintentar</button>}</div>}
    {vistaActual === 'solicitar' && <section className="tr-seccion" aria-label="Trámites disponibles"><div className="tr-intro"><div><span className="tr-eyebrow">01 / ¿QUÉ NECESITAS?</span><h2>Un trámite, sin vueltas.</h2><p>Elige una opción. La dirección revisará tu solicitud y te responderá aquí.</p></div></div>
      {tipos === null ? !c.error && cargando('Cargando los trámites disponibles…') : tipos.filter(t => t.activo && t.campos.length).length ? <div className="tr-catalogo">{tipos.filter(t => t.activo && t.campos.length).map((t, i) => <article className="tr-tipo tr-tipo--nuevo" data-moon-reveal="card" key={t.id}>
        <div className="tr-tipo__superior"><IconoTipo icono={t.icono} /><span>{String(i + 1).padStart(2, '0')}</span></div><h3>{t.nombre}</h3><p>{t.descripcion}</p>
        <div className="tr-tipo__pie"><span>{t.soloCeo ? 'Revisión del CEO' : 'Revisión del equipo'}</span><button type="button" className="enterprise-action" onClick={() => setFormulario(t)}>Solicitar<ArrowUpRight /></button></div>
      </article>)}</div> : <div className="tr-vacio"><ClipboardList /><h3>El catálogo está por abrir</h3><p>{editaCatalogo ? 'Activa los trámites base para que el equipo pueda solicitar documentos, permisos y su tarjeta.' : 'La dirección todavía no publicó los trámites disponibles.'}</p>{editaCatalogo && <button className="enterprise-action enterprise-action--primary" type="button" disabled={!!ocupado} onClick={() => void accion('base', c.cargarBase, 'Catálogo base disponible. Conservamos los trámites que ya existían.')}>{ocupado === 'base' ? <LoaderCircle className="tr-spin" /> : <Plus />}Activar trámites base</button>}</div>}
      <details className="tr-disenos"><summary>Ver diseños de PDF y tarjeta<ChevronRight /></summary><div className="tr-intro"><div><span className="tr-eyebrow">DISEÑADOS EN MOON</span><h2>Documentos con nuestra identidad.</h2><p>Las plantillas ya están listas en el panel. La dirección las personaliza al aprobar tu solicitud.</p></div></div>
        <div className="tr-disenos__grid">{([{ p: 'constancia', title: 'Constancia', desc: 'Documento A4 con referencia de emisión.', Icon: FileCheck2 }, { p: 'credencial', title: 'Tarjeta Moon Studios', desc: 'Frente y reverso en tamaño credencial.', Icon: CreditCard }, { p: 'respuesta', title: 'Respuesta del equipo', desc: 'La resolución de tu trámite en PDF.', Icon: FilePenLine }] as const).map(({ p, title, desc, Icon }) => <button key={p} type="button" className={`tr-diseno tr-diseno--${p}`} onClick={() => verDiseño(p)}><Icon /><strong>{title}</strong><span>{desc}</span><small>Ver diseño<Eye /></small></button>)}</div>
      </details>
    </section>}
    {vistaActual === 'mios' && <section className="tr-seccion"><div className="tr-intro"><div><h2>Cada solicitud, a la vista.</h2><p>Abre tu expediente para consultar la respuesta y descargar lo que te entregaron.</p></div></div>{mias === null ? !c.error && cargando('Consultando tus solicitudes…') : mias_.length ? <div className="tr-lista">{mias_.map(s => fila(s, true))}</div> : <div className="tr-vacio"><ClipboardList /><h3>Este es el inicio</h3><p>Tu próxima solicitud aparecerá aquí con su seguimiento.</p><button className="enterprise-action" type="button" onClick={() => cambiarVista('solicitar')}>Elegir trámite</button></div>}</section>}
    {vistaActual === 'documentos' && <section className="tr-seccion"><div className="tr-intro"><div><span className="tr-eyebrow">TU ARCHIVO PERSONAL</span><h2>Listos. Cuando los necesites.</h2><p>Tus documentos emitidos por la dirección, disponibles para volver a descargarlos.</p></div><label className="tr-buscar"><Search /><input type="search" aria-label="Buscar mis documentos" placeholder="Buscar documento o folio…" value={busquedaDocumentos} onChange={e => setBusquedaDocumentos(e.target.value)} /></label></div>
      {mias === null ? !c.error && cargando('Abriendo tu archivo personal…') : documentos.length ? <div className="tr-documentos-grid">{documentos.filter(s => `${s.documento!.titulo} ${s.documento!.folio}`.toLocaleLowerCase('es').includes(busquedaDocumentos.trim().toLocaleLowerCase('es'))).map(s => <article className={`tr-documento-card${s.documento!.plantilla === 'credencial' ? ' is-card' : ''}`} key={s.id} data-moon-reveal="card"><div className="tr-documento-card__arte"><BrandLogo variant={s.documento!.plantilla === 'credencial' ? 'light' : 'dark'} /><span>{s.documento!.plantilla === 'credencial' ? 'TARJETA DE EQUIPO' : 'DOCUMENTO MOON STUDIOS'}</span><strong>{s.documento!.plantilla === 'credencial' ? s.documento!.destinatarioNombre : s.documento!.titulo}</strong><small>{s.documento!.destinatarioCodigo}</small></div>
        <div className="tr-documento-card__datos"><span className="tr-sello"><FileCheck2 />Emitido</span><h3>{s.documento!.titulo}</h3><p>{fechaHora(s.documento!.emitidoAt)}</p><code>{s.documento!.folio}</code><div><button type="button" className="enterprise-action" onClick={() => abrirDetalle(s.id)}><Eye />Ver</button><button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado} onClick={() => void descargar(s)}>{ocupado === s.id ? <LoaderCircle className="tr-spin" /> : <Download />}Descargar PDF</button></div></div>
      </article>)}</div> : <div className="tr-vacio"><Files /><h3>Tu archivo está listo para recibir</h3><p>Cuando la dirección emita tu constancia, tarjeta o documento, aparecerá aquí. Puedes seguir las solicitudes en «Mis trámites».</p><button className="enterprise-action" type="button" onClick={() => cambiarVista('mios')}>Ver mis trámites</button></div>}
      {documentos.length > 0 && !documentos.some(s => `${s.documento!.titulo} ${s.documento!.folio}`.toLocaleLowerCase('es').includes(busquedaDocumentos.trim().toLocaleLowerCase('es'))) && <p className="tr-nota">No hay documentos con esa búsqueda.</p>}
    </section>}
    {vistaActual === 'bandeja' && <section className="tr-seccion"><div className="tr-intro"><div><h2>Del pedido a la entrega.</h2><p>Revisa solicitudes y prepara el PDF o la tarjeta para cada persona.</p></div><button className="enterprise-action" type="button" disabled={!filtradas.length} onClick={exportar}><Download />Exportar CSV</button></div>
      <div className="tr-chips" role="group" aria-label="Filtrar por estado">{(['abiertos', 'aprobado', 'rechazado', 'todos'] as FiltroEstado[]).map(f => <button className="tr-chip" type="button" key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{CHIPS[f]}<strong>{conteo(f)}</strong></button>)}</div>
      <div className="tr-filtros"><label className="tr-buscar"><Search /><input type="search" aria-label="Buscar en la bandeja" placeholder="Buscar persona, ID o trámite…" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label><select className="tr-select" aria-label="Tipo de trámite" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}><option value="todos">Todos los trámites</option>{(tipos || []).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
      {todas === null ? !c.error && cargando('Cargando la bandeja del equipo…') : filtradas.length ? <div className="tr-lista">{filtradas.map(s => fila(s, false))}</div> : <div className="tr-vacio"><Inbox /><h3>Todo al día por aquí</h3><p>No hay solicitudes con estos filtros.</p></div>}
    </section>}
    {vistaActual === 'catalogo' && <section className="tr-seccion"><div className="tr-intro"><div><h2>Lo que tu equipo puede pedir.</h2><p>Personaliza los formularios. Desactiva una opción para ocultarla y conservar su historial.{!isCEO && ' Solo el CEO cambia los trámites reservados.'}</p></div><button className="enterprise-action enterprise-action--primary" type="button" onClick={() => setEditor('nuevo')}><Plus />Nuevo trámite</button></div>
      {tipos === null ? !c.error && cargando('Cargando catálogo…') : <div className="tr-gestion">{tipos.map(t => <div key={t.id} className={`tr-gestion__fila${t.activo ? '' : ' is-off'}`}><IconoTipo icono={t.icono} /><div><strong>{t.nombre}</strong><span>{t.campos.length} campos · {t.activo ? 'Disponible' : 'Oculto'}{t.soloCeo ? ' · Solo CEO' : ''}</span></div><div className="tr-gestion__acciones"><label className="tr-switch"><input type="checkbox" checked={t.activo} disabled={!!ocupado} aria-label={`${t.nombre} disponible`} onChange={e => { const activo = e.target.checked; void accion(t.id, () => c.guardarTipo({ ...t, activo }, false), activo ? 'Trámite disponible.' : 'Trámite oculto. Conservamos su historial.'); }} /><span /></label><button className="enterprise-action" type="button" onClick={() => setEditor(t)}><FilePenLine />Editar</button></div></div>)}<button className="enterprise-action" type="button" disabled={!!ocupado} onClick={() => void accion('base', c.cargarBase, 'Se agregaron los trámites base que faltaban.')}>{ocupado === 'base' ? <LoaderCircle className="tr-spin" /> : <Plus />}Agregar trámites base que faltan</button></div>}
    </section>}
    <footer className="tr-pie"><ShieldCheck /><p>Tu solicitud y tus documentos pertenecen a tu cuenta. La dirección autorizada atiende cada expediente.</p><span>MOON / PEOPLE</span></footer>
    {formulario && <FormularioTramite key={formulario.id} tipo={formulario} onCerrar={() => setFormulario(null)} onEnviar={async respuestas => { const id = await c.solicitar(formulario, respuestas); setFormulario(null); setAviso('Solicitud enviada. Puedes seguirla aquí y recibir el documento en tu panel.'); setParams({ vista: 'mios', id }); }} />}
    {detalle && <DetalleTramite key={detalle.id} solicitud={detalle} tipo={tipoDe(detalle.tipoId)} propia={detalle.solicitanteUid === actor.uid} bloqueo={bloqueoPara(detalle)} actor={actor} abrirDocumento={vistaActual === 'documentos'} onCerrar={() => abrirDetalle(null)}
      onCancelar={async () => { await c.cancelar(detalle); setAviso('Solicitud cancelada. Conservamos su historial.'); }}
      onEliminar={async () => { await c.eliminar(detalle); setAviso('Solicitud eliminada.'); }}
      onResolver={async (e, comentario, documento) => { await c.resolver(detalle, e, comentario, documento); setAviso(documento ? 'Solicitud aprobada y documento entregado al empleado.' : e === 'en_revision' ? 'La solicitud está en revisión.' : e === 'aprobado' ? 'Solicitud aprobada. El empleado verá tu respuesta.' : 'Respuesta enviada al empleado.'); }}
      onEmitir={async documento => { await c.emitir(detalle, documento); setAviso('Documento entregado. El empleado puede descargarlo en «Mis documentos».'); }} />}
    {detalleId && !detalle && mias !== null && (!revisa || todas !== null) && <p className="tr-nota" role="status">Este expediente no está disponible para tu cuenta.<button className="enterprise-action" type="button" onClick={() => abrirDetalle(null)}>Cerrar aviso</button></p>}
    {editor && <EditorTipo inicial={editor === 'nuevo' ? null : editor} existentes={(tipos || []).map(t => t.id)} puedeSoloCeo={isCEO} onCerrar={() => setEditor(null)} onGuardar={async (t, nuevo) => { await c.guardarTipo(t, nuevo); setAviso('Catálogo actualizado.'); }} />}
    {plantilla && <Dialog open onOpenChange={v => { if (!v) setPlantilla(null); }}><DialogContent className="tr-dialogo tr-dialogo--documento"><DialogTitle>Diseño Moon Studios</DialogTitle><DialogDescription>Vista de plantilla. La dirección completará y emitirá el documento al resolver la solicitud.</DialogDescription><DocumentoPreview documento={plantilla} borrador /><button className="enterprise-action" type="button" onClick={() => setPlantilla(null)}>Cerrar vista previa</button></DialogContent></Dialog>}
  </div>;
}
