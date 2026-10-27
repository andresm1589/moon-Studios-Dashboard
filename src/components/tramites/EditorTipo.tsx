import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ICONOS_TRAMITE, LIMITES, TIPOS_CAMPO, idDesdeNombre, validarTipo, type CampoTramite, type TipoTramite } from '@/lib/tramites';
import { ICONO, NOMBRE_ICONO } from './iconosMapa';

const nuevoCampo = (n: number): CampoTramite => ({ id: `campo-${Date.now().toString(36)}-${n}`, etiqueta: '', tipo: 'texto', requerido: false });

/** Crear o editar un tipo de trámite y su formulario. */
export function EditorTipo({ inicial, existentes, puedeSoloCeo, onCerrar, onGuardar }: {
  inicial: TipoTramite | null;
  existentes: string[];
  /** Solo el CEO cambia la marca «Solo CEO»: es un límite para Administración. */
  puedeSoloCeo: boolean;
  onCerrar: () => void;
  onGuardar: (tipo: TipoTramite, nuevo: boolean) => Promise<void>;
}) {
  const nuevo = !inicial;
  const [tipo, setTipo] = useState<TipoTramite>(() => inicial ? structuredClone(inicial) : {
    id: '', nombre: '', descripcion: '', icono: 'general', activo: true, soloCeo: false,
    orden: (existentes.length + 1) * 10, campos: [{ ...nuevoCampo(0), etiqueta: 'Detalle', tipo: 'parrafo', requerido: true }],
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const fijar = (cambio: Partial<TipoTramite>) => { setTipo(t => ({ ...t, ...cambio })); setError(''); };
  const fijarCampo = (i: number, cambio: Partial<CampoTramite>) => fijar({ campos: tipo.campos.map((c, j) => j === i ? { ...c, ...cambio } : c) });
  const mover = (i: number, paso: number) => { const campos = [...tipo.campos]; [campos[i], campos[i + paso]] = [campos[i + paso], campos[i]]; fijar({ campos }); };

  const guardar = async (event: FormEvent) => {
    event.preventDefault();
    let id = tipo.id;
    if (nuevo) {
      const base = idDesdeNombre(tipo.nombre); id = base;
      for (let n = 2; existentes.includes(id); n++) id = `${base}-${n}`;
    }
    const final = { ...tipo, id };
    const problema = validarTipo(final);
    if (problema) { setError(problema); return; }
    setGuardando(true);
    try { await onGuardar(final, nuevo); onCerrar(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : 'No se pudo guardar el trámite.'); }
    finally { setGuardando(false); }
  };

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !guardando) onCerrar(); }}>
      <DialogContent className="tr-dialogo tr-dialogo--ancho">
        <div className="tr-dialogo__cabecera"><div>
          <DialogTitle asChild><h2>{nuevo ? 'Nuevo trámite' : `Editar «${inicial?.nombre}»`}</h2></DialogTitle>
          <DialogDescription>Define el nombre, a quién le toca aprobarlo y qué datos pide el formulario.</DialogDescription>
        </div></div>
        <form className="tr-form" onSubmit={guardar} noValidate>
          <div className="tr-rejilla">
            <label className="tr-campo"><span>Nombre<em>*</em></span>
              <input value={tipo.nombre} maxLength={LIMITES.nombre} onChange={e => fijar({ nombre: e.target.value })} placeholder="Ej. Adelanto de sueldo" /></label>
            <label className="tr-campo"><span>Orden en el catálogo</span>
              <input type="number" min={0} max={999} value={tipo.orden} onChange={e => fijar({ orden: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })} /></label>
          </div>
          <label className="tr-campo"><span>Descripción</span>
            <textarea value={tipo.descripcion} maxLength={LIMITES.descripcion} onChange={e => fijar({ descripcion: e.target.value })} placeholder="Para qué sirve y qué conviene saber antes de pedirlo." /></label>
          <div className="tr-campo"><span>Ícono</span>
            <div className="tr-iconos" role="group" aria-label="Ícono del trámite">
              {ICONOS_TRAMITE.map(icono => { const Icono = ICONO[icono]; return (
                <button key={icono} type="button" aria-pressed={tipo.icono === icono} title={NOMBRE_ICONO[icono]} aria-label={NOMBRE_ICONO[icono]} onClick={() => fijar({ icono })}><Icono strokeWidth={1.5} /></button>
              ); })}
            </div>
          </div>
          <div className="tr-rejilla">
            <label className="tr-check"><input type="checkbox" checked={tipo.activo} onChange={e => fijar({ activo: e.target.checked })} />Disponible para solicitar</label>
            <label className="tr-check" title={puedeSoloCeo ? undefined : 'Solo el CEO puede cambiar esta marca.'}>
              <input type="checkbox" checked={tipo.soloCeo} disabled={!puedeSoloCeo} onChange={e => fijar({ soloCeo: e.target.checked })} />Solo el CEO lo aprueba</label>
          </div>

          <div className="tr-campo"><span>Campos del formulario ({tipo.campos.length}/{LIMITES.campos})</span></div>
          <div className="tr-campos">
            {tipo.campos.map((c, i) => (
              <div key={c.id} className="tr-campo-editor">
                <div className="tr-campo-editor__fila">
                  <input aria-label={`Nombre del campo ${i + 1}`} value={c.etiqueta} maxLength={LIMITES.etiqueta} placeholder="Nombre del campo" onChange={e => fijarCampo(i, { etiqueta: e.target.value })} />
                  <select aria-label={`Tipo del campo ${i + 1}`} value={c.tipo} onChange={e => fijarCampo(i, { tipo: e.target.value as CampoTramite['tipo'] })}>
                    {TIPOS_CAMPO.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="tr-mini" disabled={i === 0} aria-label="Subir campo" onClick={() => mover(i, -1)}><ArrowUp /></button>
                    <button type="button" className="tr-mini" disabled={i === tipo.campos.length - 1} aria-label="Bajar campo" onClick={() => mover(i, 1)}><ArrowDown /></button>
                    <button type="button" className="tr-mini tr-peligro" disabled={tipo.campos.length === 1} aria-label="Quitar campo" onClick={() => fijar({ campos: tipo.campos.filter((_, j) => j !== i) })}><Trash2 /></button>
                  </div>
                </div>
                {c.tipo === 'opcion' && (
                  <textarea aria-label="Opciones, una por línea" placeholder={'Una opción por línea\nPor ejemplo: Normal\nAlta'} value={(c.opciones ?? []).join('\n')}
                    onChange={e => fijarCampo(i, { opciones: e.target.value.split('\n') })} />
                )}
                <div className="tr-campo-editor__pie">
                  <label className="tr-check"><input type="checkbox" checked={c.requerido} onChange={e => fijarCampo(i, { requerido: e.target.checked })} />Obligatorio</label>
                  <input aria-label="Texto de ayuda" style={{ flex: 1, minWidth: 180, minHeight: 34, padding: '6px 10px', border: '1px solid var(--moon-line)', borderRadius: 9, background: 'var(--moon-surface)', color: 'var(--moon-ink)', font: 'inherit', fontSize: 12 }}
                    value={c.ayuda ?? ''} maxLength={160} placeholder="Ayuda opcional bajo el campo" onChange={e => fijarCampo(i, { ayuda: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="enterprise-action" disabled={tipo.campos.length >= LIMITES.campos} onClick={() => fijar({ campos: [...tipo.campos, nuevoCampo(tipo.campos.length)] })}><Plus />Agregar campo</button>

          {error && <p className="tr-alerta" role="alert"><AlertCircle strokeWidth={1.5} />{error}</p>}
          <div className="tr-acciones">
            <button type="button" className="enterprise-action" onClick={onCerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" className="enterprise-action enterprise-action--primary" disabled={guardando}>{guardando ? <LoaderCircle className="tr-spin" /> : <Save />}Guardar trámite</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
