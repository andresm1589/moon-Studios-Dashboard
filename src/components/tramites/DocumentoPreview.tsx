import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { DocumentoTramite } from '@/lib/tramitesDocumentoModelo';
import { fechaDocumentoTramite, SITIO_VERIFICACION, urlVerificacionPublica } from '@/lib/tramitesDocumentoFormato';
import '@/styles/tramites-documentos.css';

function CodigoConsulta({ documento }: { documento: DocumentoTramite }) {
  const [qr, setQr] = useState<{ url: string; src: string }>();
  const url = urlVerificacionPublica(documento);
  useEffect(() => {
    let current = true;
    void QRCode.toDataURL(url, {
      width: 320, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#171719', light: '#ffffff' },
    }).then(src => { if (current) setQr({ url, src }); }).catch(() => { /* Text and private link remain available. */ });
    return () => { current = false; };
  }, [url]);
  return qr?.url === url
    ? <img className="tr-doc__qr" src={qr.src} alt={`QR para verificar la credencial en ${SITIO_VERIFICACION}`} />
    : <span className="tr-doc__qr tr-doc__qr--loading" aria-label="Preparando código QR">QR</span>;
}

function Marca({ inversa = false }: { inversa?: boolean }) {
  // El mismo logotipo completo que imprime el PDF (lib/tramitesPdf).
  return <div className={`tr-doc__marca${inversa ? ' tr-doc__marca--inversa' : ''}`}>
    <img className="tr-doc__wordmark" src={inversa ? '/brand/moon-completo-blanco.png' : '/brand/moon-completo-oscuro.png'} alt="Moon Studios" width={1314} height={310} />
    {!inversa && <span>PERSONAS Y EQUIPO</span>}
  </div>;
}

export function DocumentoPreview({ documento, borrador = false }: { documento: DocumentoTramite; borrador?: boolean }) {
  const esTarjeta = documento.plantilla === 'credencial';
  return <section className={`tr-doc${esTarjeta ? ' tr-doc--credencial' : ''}`} aria-label={borrador ? 'Vista previa del documento por emitir' : 'Documento emitido'}>
    <div className="tr-doc__aviso">
      <span className="tr-doc__estado">{borrador ? 'VISTA PREVIA' : 'DOCUMENTO EMITIDO'}</span>
      <span>{esTarjeta ? 'Tarjeta CR80 · Frente y reverso' : 'Formato A4 · El PDF pagina el texto completo'}</span>
    </div>
    {esTarjeta ? <div className="tr-doc__tarjetas">
      <article className="tr-doc__tarjeta tr-doc__tarjeta--frente" aria-label="Frente de la credencial">
        <header><Marca inversa /><span>01 / FRENTE</span></header>
        <div className="tr-doc__identidad"><small>NOMBRE DEL TITULAR</small><h3>{documento.destinatarioNombre}</h3></div>
        <div className="tr-doc__duo"><div><small>CARGO</small><strong>{documento.cargo || 'No especificado'}</strong></div><div><small>ÁREA</small><strong>{documento.area || 'No especificada'}</strong></div></div>
        <footer><div><small>CÓDIGO DE EQUIPO</small><strong>{documento.destinatarioCodigo || 'No especificado'}</strong></div><div><small>VIGENTE HASTA</small><strong>{documento.vigenteHasta ? fechaDocumentoTramite(documento.vigenteHasta) : 'Sin fecha establecida'}</strong></div></footer>
      </article>
      <article className="tr-doc__tarjeta tr-doc__tarjeta--reverso" aria-label="Reverso de la credencial">
        <header><strong>{documento.titulo}</strong><span>02 / REVERSO</span></header>
        <div className="tr-doc__consulta"><CodigoConsulta documento={documento} /><div><div><small>REFERENCIA DEL DOCUMENTO</small><strong>{borrador ? 'Se asignará al emitir' : documento.folio}</strong></div><div><small>EMITIDO POR</small><strong>{documento.emitidoPorNombre}</strong></div></div></div>
        <p className="tr-doc__emision">Emisión: {fechaDocumentoTramite(documento.emitidoAt)}</p>
        <footer><strong>Verifícala en {SITIO_VERIFICACION}</strong><p>{documento.contenido}</p></footer>
      </article>
    </div> : <article className="tr-doc__papel">
      <header className="tr-doc__cabecera"><Marca /><div><span>DOCUMENTO INTERNO</span><strong>{borrador ? 'Referencia al emitir' : documento.folio}</strong></div></header>
      <div className="tr-doc__titulo"><span>{documento.plantilla === 'constancia' ? 'CONSTANCIA' : 'RESPUESTA A TU SOLICITUD'}</span><h3>{documento.titulo}</h3></div>
      <dl className="tr-doc__datos"><div className="tr-doc__destinatario"><dt>EMITIDO PARA</dt><dd>{documento.destinatarioNombre}</dd></div><div><dt>CÓDIGO DE EQUIPO</dt><dd>{documento.destinatarioCodigo || 'No especificado'}</dd></div>{documento.cargo && <div><dt>CARGO</dt><dd>{documento.cargo}</dd></div>}{documento.area && <div><dt>ÁREA</dt><dd>{documento.area}</dd></div>}</dl>
      <div className="tr-doc__contenido">{documento.contenido}</div>
      {documento.vigenteHasta && <dl className="tr-doc__datos"><div><dt>VIGENTE HASTA</dt><dd>{fechaDocumentoTramite(documento.vigenteHasta)}</dd></div></dl>}
      <div className="tr-doc__autor"><span>EMITIDO POR</span><strong>{documento.emitidoPorNombre}</strong><p>Fecha de emisión: {fechaDocumentoTramite(documento.emitidoAt)}</p><p>Disponible en el panel privado de Moon Studios. Consulta la solicitud original para revisar su estado e historial.</p></div>
      <footer className="tr-doc__pie"><span>MOON STUDIOS / TRÁMITES</span><span>{borrador ? 'Vista previa' : 'Copia para el titular'}</span></footer>
    </article>}
  </section>;
}

export default DocumentoPreview;
