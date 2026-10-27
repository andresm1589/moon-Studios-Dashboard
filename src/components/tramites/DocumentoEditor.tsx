import { useState } from 'react';
import { Eye, FilePenLine } from 'lucide-react';
import type { Actor, SolicitudTramite } from '@/lib/tramites';
import { documentoDeVista, type BorradorDocumentoTramite, type PlantillaDocumentoTramite } from '@/lib/tramitesDocumentoModelo';
import { DocumentoPreview } from './DocumentoPreview';

export function DocumentoEditor({ solicitud, actor, valor, onChange, disabled }: {
  solicitud: SolicitudTramite; actor: Actor; valor: BorradorDocumentoTramite;
  onChange: (valor: BorradorDocumentoTramite) => void; disabled: boolean;
}) {
  const [vista, setVista] = useState<'editar' | 'preview'>('preview');
  const fijar = (campo: keyof BorradorDocumentoTramite, texto: string) => onChange({ ...valor, [campo]: texto });
  return <section className="tr-emision" aria-label="Preparar documento">
    <div className="tr-intro"><div><h3>Revisa el documento</h3><p>La plantilla ya está preparada. Puedes personalizarla antes de entregar.</p></div>
      <div className="tr-segmentos" role="group" aria-label="Vista del documento">
        <button type="button" aria-pressed={vista === 'preview'} onClick={() => setVista('preview')}><Eye />Vista previa</button>
        <button type="button" aria-pressed={vista === 'editar'} onClick={() => setVista('editar')}><FilePenLine />Personalizar</button>
      </div>
    </div>
    {vista === 'preview' ? <DocumentoPreview documento={documentoDeVista(solicitud, valor, actor)} borrador /> : <div className="tr-form">
      <label className="tr-campo"><span>Diseño del documento</span><select value={valor.plantilla} disabled={disabled} onChange={e => fijar('plantilla', e.target.value as PlantillaDocumentoTramite)}>
        <option value="constancia">Constancia · A4</option><option value="credencial">Tarjeta Moon Studios · dos caras</option><option value="respuesta">Documento de respuesta · A4</option>
      </select></label>
      <label className="tr-campo"><span>Título</span><input value={valor.titulo} maxLength={valor.plantilla === 'credencial' ? 60 : 100} disabled={disabled} onChange={e => fijar('titulo', e.target.value)} /></label>
      <div className="tr-rejilla">
        <label className="tr-campo"><span>Cargo</span><input value={valor.cargo} maxLength={100} disabled={disabled} onChange={e => fijar('cargo', e.target.value)} /></label>
        <label className="tr-campo"><span>Área · opcional</span><input value={valor.area} maxLength={100} disabled={disabled} onChange={e => fijar('area', e.target.value)} /></label>
      </div>
      <label className="tr-campo"><span>Vigencia hasta · opcional</span><input type="date" value={valor.vigenteHasta} disabled={disabled} onChange={e => fijar('vigenteHasta', e.target.value)} /><small>Deja vacío si el documento no tiene una fecha de vencimiento.</small></label>
      <label className="tr-campo"><span>{valor.plantilla === 'credencial' ? 'Indicaciones del reverso' : 'Contenido del documento'}</span>
        <textarea className="tr-contenido-documento" value={valor.contenido} maxLength={valor.plantilla === 'credencial' ? 240 : 6000} disabled={disabled} onChange={e => fijar('contenido', e.target.value)} />
        <small>{valor.contenido.length.toLocaleString('es-PE')} / {valor.plantilla === 'credencial' ? '240' : '6.000'} caracteres. La emisión queda registrada a tu nombre.</small>
      </label>
    </div>}
  </section>;
}
