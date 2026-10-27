import { useRef, useState } from 'react';
import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
import { AlertCircle, Check, Download, Eye, FileCheck2, Hourglass, LoaderCircle, LockKeyhole, Send, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fechaHora } from '@/lib/ajustes/fecha';
import { codigoEmpleado, ESTADOS_TRAMITE, LIMITES, type Actor, type EstadoTramite, type SolicitudTramite, type TipoTramite } from '@/lib/tramites';
import { crearBorradorDocumento, validarBorradorDocumento, type BorradorDocumentoTramite } from '@/lib/tramitesDocumentoModelo';
import { IconoTipo } from './iconos';
import { DocumentoPreview } from './DocumentoPreview';
import { VerificacionPublica } from './VerificacionPublica';
import { DocumentoEditor } from './DocumentoEditor';

type Resolucion = Exclude<EstadoTramite, 'pendiente' | 'cancelado'>;
export function EstadoTramiteChip({ estado }: { estado: EstadoTramite }) {
  return <span className={`tr-estado tr-estado--${estado}`}>{ESTADOS_TRAMITE[estado]}</span>;
}

export function DetalleTramite({ solicitud, tipo, propia, bloqueo, actor, abrirDocumento = false, onCerrar, onCancelar, onEliminar, onResolver, onEmitir }: {
  solicitud: SolicitudTramite; tipo?: TipoTramite; propia: boolean; bloqueo?: string | null; actor: Actor;
  abrirDocumento?: boolean; onCerrar: () => void; onCancelar: () => Promise<void>; onEliminar: () => Promise<void>;
  onResolver: (estado: Resolucion, comentario: string, documento?: BorradorDocumentoTramite) => Promise<void>;
  onEmitir: (documento: BorradorDocumentoTramite) => Promise<void>;
}) {
  const [comentario, setComentario] = useState(solicitud.comentario || '');
  const commentEmojiRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [incluirDocumento, setIncluirDocumento] = useState(solicitud.tipoId === 'tarjeta' || solicitud.tipoId === 'constancia' || tipo?.icono === 'tarjeta' || tipo?.icono === 'constancia');
  const [borrador, setBorrador] = useState(() => crearBorradorDocumento(solicitud));
  const [mostrarDocumento, setMostrarDocumento] = useState(abrirDocumento && !!solicitud.documento);
  const [preparandoDocumento, setPreparandoDocumento] = useState(false);
  const [confirmar, setConfirmar] = useState<'aprobar' | 'emitir' | 'cancelar' | 'eliminar' | null>(null);
  const abierta = solicitud.estado === 'pendiente' || solicitud.estado === 'en_revision';
  const puedeEmitir = bloqueo === null && solicitud.estado === 'aprobado' && !solicitud.documento;
  const puedeEliminar = bloqueo === null && !abierta;
  const baja = confirmar === 'eliminar' && !!solicitud.documento && (solicitud.documento.plantilla === 'credencial' || solicitud.documento.plantilla === 'constancia');
  const campos = solicitud.camposRespuesta?.length ? solicitud.camposRespuesta.map(c => ({ id: c.id, etiqueta: c.etiqueta, valor: c.valor }))
    : Object.entries(solicitud.respuestas).map(([id, valor]) => ({ id, etiqueta: tipo?.campos.find(c => c.id === id)?.etiqueta ?? id, valor }));
  const correr = async (clave: string, accion: () => Promise<void>, cerrar = true) => {
    if (ocupado) return;
    setOcupado(clave); setError('');
    try { await accion(); if (cerrar) onCerrar(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : 'No se pudo guardar el cambio.'); setConfirmar(null); }
    finally { setOcupado(null); }
  };
  const prepararConfirmacion = (accion: 'aprobar' | 'emitir') => {
    const problema = (accion === 'emitir' || incluirDocumento) ? validarBorradorDocumento(borrador) : null;
    if (problema) { setError(problema); return; }
    setError(''); setConfirmar(accion);
  };
  const descargar = () => correr('descargar', async () => {
    if (!solicitud.documento) throw new Error('Todavía no hay un documento emitido.');
    const { descargarDocumentoTramite } = await import('@/lib/tramitesPdf');
    await descargarDocumentoTramite(solicitud.documento);
  }, false);
  return <Dialog open onOpenChange={abierto => { if (!abierto && !ocupado) onCerrar(); }}>
    <DialogContent className={`tr-dialogo${mostrarDocumento || (bloqueo === null && (abierta || puedeEmitir)) ? ' tr-dialogo--documento' : ''}`} showCloseButton={!ocupado}>
      <div className="tr-dialogo__cabecera"><IconoTipo icono={tipo?.icono ?? 'general'} /><div>
        <DialogTitle asChild><h2>{solicitud.tipoNombre}</h2></DialogTitle>
        <DialogDescription>{propia ? 'Tu solicitud' : `${solicitud.solicitanteNombre} · ${solicitud.solicitanteRol}`} · {fechaHora(solicitud.createdAt)}</DialogDescription>
      </div></div>
      <div className="tr-expediente-ref"><EstadoTramiteChip estado={solicitud.estado} /><span>EXPEDIENTE {solicitud.id.toUpperCase()}</span></div>
      <ol className="tr-progreso" aria-label="Seguimiento de la solicitud">
        <li className="is-done"><span>01</span><div><strong>Enviada</strong><small>{fechaHora(solicitud.createdAt)}</small></div></li>
        <li className={solicitud.estado !== 'pendiente' && solicitud.estado !== 'cancelado' ? 'is-done' : ''}><span>02</span><div><strong>Revisión</strong><small>{abierta ? 'Validación del equipo' : ESTADOS_TRAMITE[solicitud.estado]}</small></div></li>
        <li className={solicitud.documento ? 'is-done' : ''}><span>03</span><div><strong>{solicitud.documento ? 'Documento entregado' : 'Entrega'}</strong><small>{solicitud.documento ? fechaHora(solicitud.documento.emitidoAt) : 'En tu panel, cuando se emita'}</small></div></li>
      </ol>
      {solicitud.documento && <div className="tr-entrega-disponible"><FileCheck2 /><div><strong>Tu documento está listo</strong><span>{solicitud.documento.titulo} · {solicitud.documento.folio}</span></div>
        <button className="enterprise-action" type="button" aria-pressed={mostrarDocumento} onClick={() => setMostrarDocumento(v => !v)}><Eye />{mostrarDocumento ? 'Ver solicitud' : 'Ver documento'}</button>
        <button className="enterprise-action enterprise-action--primary" type="button" disabled={!!ocupado} onClick={() => void descargar()}>{ocupado === 'descargar' ? <LoaderCircle className="tr-spin" /> : <Download />}Descargar PDF</button>
      </div>}
      {solicitud.documento && <VerificacionPublica solicitud={solicitud} actor={actor} gestiona={bloqueo === null} />}
      {mostrarDocumento && solicitud.documento ? <DocumentoPreview documento={solicitud.documento} /> : !preparandoDocumento && !confirmar ? <>
        <dl className="tr-detalle"><div><dt>Solicitante</dt><dd>{solicitud.solicitanteNombre}<br /><small className="moon-panel-muted">{codigoEmpleado(solicitud.solicitanteUid)} · {solicitud.solicitanteRol}</small></dd></div>
          <div><dt>Atendido por</dt><dd>{solicitud.resueltoPorNombre || 'Pendiente de asignación'}{solicitud.resueltoAt && <small className="tr-dato-secundario">{fechaHora(solicitud.resueltoAt)}</small>}</dd></div>
          {solicitud.soloCeo && <div className="tr-ancho"><dt>Aprobación</dt><dd>Este trámite lo resuelve el CEO.</dd></div>}
        </dl>
        <div className="tr-form">{campos.filter(c => c.valor.trim()).map(c => <div key={c.id} className="tr-respuesta"><strong>{c.etiqueta}</strong>{c.valor}</div>)}
          {solicitud.comentario && <div className="tr-respuesta"><strong>Respuesta de {solicitud.resueltoPorNombre || 'la dirección'}</strong><EmojiText text={solicitud.comentario} /></div>}
        </div>
        {bloqueo === null && (abierta || puedeEmitir) && <>
          {abierta && <label className="tr-campo"><span>Respuesta para {solicitud.solicitanteNombre.split(' ')[0] || 'la persona'}</span>
            <textarea ref={commentEmojiRef} value={comentario} disabled={!!ocupado} maxLength={LIMITES.comentario} onChange={e => { setComentario(e.target.value); setError(''); }} placeholder="Indica la respuesta o los siguientes pasos. Obligatorio si rechazas." />
          </label>}
          {abierta && <EmojiButton value={comentario} onChange={value => { setComentario(value); setError(''); }} inputRef={commentEmojiRef} maxLength={LIMITES.comentario} disabled={!!ocupado} unicodeOnly label="Añadir emoji a la respuesta del trámite" />}
          {abierta && <label className="tr-incluir-documento"><input type="checkbox" checked={incluirDocumento} disabled={!!ocupado} onChange={e => setIncluirDocumento(e.target.checked)} /><span><strong>Entregar un documento al aprobar</strong><small>PDF o tarjeta con el diseño de Moon Studios, disponible en la cuenta del empleado.</small></span></label>}
        </>}
        {propia && solicitud.estado === 'aprobado' && !solicitud.documento && <p className="tr-nota"><Hourglass />Tu solicitud fue aprobada. Si requiere un documento, la dirección podrá emitirlo aquí y aparecerá en «Mis documentos».</p>}
        {typeof bloqueo === 'string' && (abierta || solicitud.estado === 'aprobado') && <p className="tr-nota"><LockKeyhole />{bloqueo}</p>}
      </> : null}
      {preparandoDocumento && !confirmar && <DocumentoEditor solicitud={solicitud} actor={actor} valor={borrador} onChange={setBorrador} disabled={!!ocupado} />}
      {error && <p className="tr-alerta" role="alert"><AlertCircle />{error}</p>}
      {confirmar ? <div className="tr-confirmacion" role="group" aria-label="Confirmar operación"><div><h3>{confirmar === 'eliminar' ? '¿Eliminar esta solicitud?' : confirmar === 'cancelar' ? '¿Cancelar esta solicitud?' : confirmar === 'emitir' || incluirDocumento ? 'Todo listo para entregar' : '¿Aprobar esta solicitud?'}</h3>
        <p>{confirmar === 'eliminar' ? `Se borrará el expediente y desaparecerá de la bandeja y de la cuenta de ${solicitud.solicitanteNombre}.${solicitud.documento ? ' Su documento ya no se podrá descargar.' : ''}${baja ? ' La consulta pública informará que dejó de ser válido.' : ''} No se puede deshacer.` : confirmar === 'cancelar' ? 'La solicitud quedará cancelada y conservará su historial.' : confirmar === 'emitir' || incluirDocumento ? 'Se guardará una versión definitiva en la cuenta del empleado. Revisa los datos: el documento emitido no se edita.' : 'El empleado recibirá tu respuesta en su panel.'}</p></div>
        {confirmar !== 'cancelar' && confirmar !== 'eliminar' && (confirmar === 'emitir' || incluirDocumento) && <dl className="tr-resumen-entrega"><div><dt>Para</dt><dd>{solicitud.solicitanteNombre}</dd></div><div><dt>Documento</dt><dd>{borrador.titulo}</dd></div><div><dt>Entrega</dt><dd>En «Mis documentos», dentro de su cuenta</dd></div></dl>}
        <div className="tr-acciones"><button className="enterprise-action" type="button" disabled={!!ocupado} onClick={() => setConfirmar(null)}>Volver a revisar</button>
          <button className={`enterprise-action ${confirmar === 'eliminar' ? 'tr-peligro' : 'enterprise-action--primary'}`} type="button" disabled={!!ocupado} onClick={() => void correr('confirmar', () => confirmar === 'eliminar' ? onEliminar() : confirmar === 'cancelar' ? onCancelar() : confirmar === 'emitir' ? onEmitir(borrador) : onResolver('aprobado', comentario, incluirDocumento ? borrador : undefined))}>
            {ocupado ? <LoaderCircle className="tr-spin" /> : confirmar === 'eliminar' ? <Trash2 /> : <Send />}{confirmar === 'eliminar' ? 'Sí, eliminar' : confirmar === 'cancelar' ? 'Sí, cancelar solicitud' : confirmar === 'emitir' || incluirDocumento ? 'Emitir y enviar al empleado' : 'Confirmar aprobación'}
          </button></div>
      </div> : <div className="tr-acciones">
        {propia && solicitud.estado === 'pendiente' && !preparandoDocumento && <button type="button" className="enterprise-action tr-peligro tr-izq" disabled={!!ocupado} onClick={() => setConfirmar('cancelar')}><X />Cancelar solicitud</button>}
        {puedeEliminar && !preparandoDocumento && <button type="button" className="enterprise-action tr-peligro tr-izq" disabled={!!ocupado} onClick={() => { setError(''); setConfirmar('eliminar'); }}><Trash2 />Eliminar</button>}
        {preparandoDocumento && <><button type="button" className="enterprise-action" disabled={!!ocupado} onClick={() => setPreparandoDocumento(false)}>Volver a la solicitud</button><button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado} onClick={() => prepararConfirmacion(puedeEmitir ? 'emitir' : 'aprobar')}><Send />Continuar con la entrega</button></>}
        {bloqueo === null && abierta && !mostrarDocumento && !preparandoDocumento && <>
          {solicitud.estado === 'pendiente' && <button type="button" className="enterprise-action" disabled={!!ocupado} onClick={() => void correr('revision', () => onResolver('en_revision', comentario))}><Hourglass />En revisión</button>}
          <button type="button" className="enterprise-action tr-peligro" disabled={!!ocupado} onClick={() => void correr('rechazar', () => onResolver('rechazado', comentario))}><X />Rechazar</button>
          <button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado} onClick={() => incluirDocumento ? setPreparandoDocumento(true) : prepararConfirmacion('aprobar')}><Check />{incluirDocumento ? 'Preparar documento' : 'Aprobar solicitud'}</button>
        </>}
        {puedeEmitir && !mostrarDocumento && !preparandoDocumento && <button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado} onClick={() => setPreparandoDocumento(true)}><Send />Preparar documento</button>}
        <button type="button" className="enterprise-action" disabled={!!ocupado} onClick={onCerrar}>Cerrar</button>
      </div>}
    </DialogContent>
  </Dialog>;
}
