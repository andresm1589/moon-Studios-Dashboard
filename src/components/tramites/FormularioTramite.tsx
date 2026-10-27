import { useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Info, LoaderCircle, Send, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LIMITES, validarRespuestas, type CampoTramite, type TipoTramite } from '@/lib/tramites';
import { IconoTipo } from './iconos';

export function FormularioTramite({ tipo, onCerrar, onEnviar }: {
  tipo: TipoTramite; onCerrar: () => void; onEnviar: (respuestas: Record<string, string>) => Promise<void>;
}) {
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [revision, setRevision] = useState(false);
  const bloqueo = useRef(false);
  const fijar = (id: string, valor: string) => { setRespuestas(r => ({ ...r, [id]: valor })); setError(''); };
  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (bloqueo.current) return;
    const problema = validarRespuestas(tipo, respuestas);
    if (problema) { setError(problema); setRevision(false); return; }
    if (!revision) { setRevision(true); setError(''); return; }
    bloqueo.current = true; setEnviando(true);
    try { await onEnviar(respuestas); }
    catch (causa) { setError(causa instanceof Error ? causa.message : 'No se pudo enviar. Tus datos siguen aquí para volver a intentar.'); }
    finally { bloqueo.current = false; setEnviando(false); }
  };
  const control = (c: CampoTramite) => {
    const comun = { id: `tr-${c.id}`, value: respuestas[c.id] ?? '', required: c.requerido, disabled: enviando };
    if (c.tipo === 'parrafo') return <textarea {...comun} maxLength={LIMITES.respuesta} onChange={e => fijar(c.id, e.target.value)} placeholder="Escribe aquí…" />;
    if (c.tipo === 'opcion') return <select {...comun} onChange={e => fijar(c.id, e.target.value)}><option value="">Selecciona una opción</option>{(c.opciones ?? []).map(o => <option key={o} value={o}>{o}</option>)}</select>;
    return <input {...comun} type={c.tipo === 'fecha' ? 'date' : c.tipo === 'numero' ? 'number' : 'text'} maxLength={c.tipo === 'texto' ? 300 : undefined} onChange={e => fijar(c.id, e.target.value)} />;
  };
  return <Dialog open onOpenChange={v => { if (!v && !enviando) onCerrar(); }}><DialogContent className="tr-dialogo" showCloseButton={!enviando}>
    <div className="tr-dialogo__cabecera"><IconoTipo icono={tipo.icono} /><div><DialogTitle asChild><h2>{tipo.nombre}</h2></DialogTitle><DialogDescription>{revision ? 'Comprueba los datos antes de enviar tu solicitud.' : tipo.descripcion || 'Completa estos datos para comenzar.'}</DialogDescription></div></div>
    <ol className="tr-pasos-form" aria-label="Pasos de la solicitud"><li aria-current={!revision ? 'step' : undefined}><span>{revision ? <Check /> : '1'}</span>Completa los datos</li><li aria-current={revision ? 'step' : undefined}><span>2</span>Revisa y envía</li></ol>
    <form className="tr-form" onSubmit={enviar} noValidate>
      {tipo.soloCeo && <p className="tr-nota"><ShieldCheck />Este trámite lo revisa el CEO.</p>}
      {revision ? <div className="tr-resumen-envio"><h3>Esto es lo que enviaremos</h3><dl>{tipo.campos.filter(c => (respuestas[c.id] || '').trim()).map(c => <div key={c.id}><dt>{c.etiqueta}</dt><dd>{respuestas[c.id].trim()}</dd></div>)}</dl><p>Podrás consultar la respuesta en «Mis trámites». Si emiten un documento, estará en «Mis documentos».</p></div>
      : <>{tipo.campos.map(c => <label key={c.id} className="tr-campo" htmlFor={`tr-${c.id}`}><span>{c.etiqueta}{c.requerido ? <em aria-label="obligatorio">*</em> : <small>Opcional</small>}</span>{control(c)}{c.ayuda && <small>{c.ayuda}</small>}</label>)}<p className="tr-nota"><Info />No necesitas preparar el diseño. La dirección emitirá el PDF o la tarjeta desde este panel.</p></>}
      {error && <p className="tr-alerta" role="alert"><AlertCircle />{error}</p>}
      <div className="tr-acciones"><button type="button" className="enterprise-action" disabled={enviando} onClick={() => revision ? setRevision(false) : onCerrar()}>{revision && <ArrowLeft />}{revision ? 'Corregir datos' : 'Cancelar'}</button><button type="submit" className="enterprise-action enterprise-action--primary" disabled={enviando}>{enviando ? <LoaderCircle className="tr-spin" /> : revision ? <Send /> : <ArrowRight />}{enviando ? 'Enviando…' : revision ? 'Enviar solicitud' : 'Revisar solicitud'}</button></div>
    </form>
  </DialogContent></Dialog>;
}
