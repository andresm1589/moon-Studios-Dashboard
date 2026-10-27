import { useEffect, useState } from 'react';
import { ArrowUpRight, Ban, Globe, LoaderCircle, Upload } from 'lucide-react';
import { darDeBajaVerificacion, leerVerificacion, publicarVerificacion, PLANTILLAS_VERIFICABLES, type Actor, type EstadoVerificacion, type SolicitudTramite } from '@/lib/tramites';
import { SITIO_VERIFICACION, urlVerificacionPublica } from '@/lib/tramitesDocumentoFormato';

/** Estado del documento en la consulta pública «Información» de la web oficial. */
export function VerificacionPublica({ solicitud, actor, gestiona }: { solicitud: SolicitudTramite; actor: Actor; gestiona: boolean }) {
  const documento = solicitud.documento;
  const verificable = !!documento && (PLANTILLAS_VERIFICABLES as readonly string[]).includes(documento.plantilla);
  const [estado, setEstado] = useState<EstadoVerificacion | undefined>(undefined);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!verificable || !documento) return;
    let activo = true;
    leerVerificacion(documento.destinatarioCodigo, documento.plantilla)
      .then(v => { if (activo) setEstado(v); })
      .catch(() => { if (activo) setError('No se pudo consultar el estado público.'); });
    return () => { activo = false; };
  }, [verificable, documento, version]);
  if (!verificable || !documento) return null;

  const propia = estado?.solicitudId === solicitud.id;
  const texto = estado === undefined ? 'Consultando…'
    : estado === null ? 'Todavía no figura en la consulta pública: se emitió antes de que existiera.'
    : !propia ? 'La consulta muestra una emisión más reciente de este documento.'
    : estado.estado === 'baja' ? 'Dado de baja: la consulta informa que ya no es válido.'
    : `Vigente: cualquiera puede verificarlo en ${SITIO_VERIFICACION} con el ID ${documento.destinatarioCodigo}.`;
  const publicar = async () => {
    setOcupado(true); setError('');
    try { await publicarVerificacion(solicitud, actor); setVersion(v => v + 1); }
    catch (causa) { setError(causa instanceof Error ? causa.message : 'No se pudo publicar.'); }
    finally { setOcupado(false); }
  };
  const darDeBaja = async () => {
    setOcupado(true); setError('');
    try { await darDeBajaVerificacion(solicitud, actor); setConfirmar(false); setVersion(v => v + 1); }
    catch (causa) { setError(causa instanceof Error ? causa.message : 'No se pudo dar de baja.'); }
    finally { setOcupado(false); }
  };

  return <section className={`tr-verificacion${propia && estado?.estado === 'baja' ? ' is-baja' : ''}`} aria-label="Consulta pública">
    <Globe aria-hidden="true" />
    <div><strong>Consulta pública</strong><span>{texto}</span>{error && <span className="tr-verificacion__error" role="alert">{error}</span>}</div>
    <div className="tr-verificacion__acciones">
      <a className="enterprise-action" href={urlVerificacionPublica(documento)} target="_blank" rel="noopener noreferrer">Ver consulta<ArrowUpRight /></a>
      {gestiona && estado === null && <button type="button" className="enterprise-action enterprise-action--primary" disabled={ocupado} onClick={() => void publicar()}>{ocupado ? <LoaderCircle className="tr-spin" /> : <Upload />}Publicar en la consulta</button>}
      {gestiona && propia && estado?.estado === 'vigente' && (confirmar
        ? <><button type="button" className="enterprise-action" disabled={ocupado} onClick={() => setConfirmar(false)}>Cancelar</button>
          <button type="button" className="enterprise-action tr-peligro" disabled={ocupado} onClick={() => void darDeBaja()}>{ocupado ? <LoaderCircle className="tr-spin" /> : <Ban />}Confirmar baja</button></>
        : <button type="button" className="enterprise-action tr-peligro" onClick={() => setConfirmar(true)}><Ban />Dar de baja</button>)}
    </div>
  </section>;
}
