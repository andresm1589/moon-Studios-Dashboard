import { useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Copy, LoaderCircle, Mail, Send, ShieldCheck, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import * as api from '@/lib/conferencias/api';
import { ROLES_INVITADO, type InvitacionConf, type InvitacionCreada, type InvitadoEntrada, type RolInvitado } from '@/lib/conferencias/tipos';
import type { Persona } from './EventoEditor';
import { copiar, mensajeError } from './util';
import { leerLista } from './invitacionesUi';

export function InvitarDialog({ eventoId, personal, existentes, capacidadRestante, onCerrar }: {
  eventoId: string; personal: Persona[]; existentes: InvitacionConf[]; capacidadRestante: number | null; onCerrar: () => void;
}) {
  const [modo, setModo] = useState<'equipo' | 'externos'>('equipo');
  const [rol, setRol] = useState<RolInvitado>('asistente');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [lista, setLista] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ creadas: InvitacionCreada[]; omitidos: { nombre: string; motivo: string }[] } | null>(null);
  const [enviadas, setEnviadas] = useState<Set<string>>(new Set());
  const [copiado, setCopiado] = useState('');
  const [revisando, setRevisando] = useState(false);
  const bloqueo = useRef(false);

  const yaInvitados = useMemo(() => new Set(existentes.filter(i => i.estado !== 'revocada').map(i => i.ownerUid).filter(Boolean)), [existentes]);
  const disponibles = personal.filter(p => !yaInvitados.has(p.uid) && `${p.nombre} ${p.role}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')));
  const externos = leerLista(lista);
  const cantidad = modo === 'equipo' ? seleccion.size : externos.invitados.length;

  const crear = async () => {
    if (bloqueo.current) return;
    const invitados: InvitadoEntrada[] = modo === 'equipo' ? [...seleccion].map(uid => ({ uid, rol })) : externos.invitados.map(i => ({ ...i, rol }));
    if (!invitados.length) return setError(modo === 'equipo' ? 'Elige al menos una persona.' : 'Escribe al menos un invitado: «Nombre, correo».');
    if (modo === 'externos' && externos.errores.length) return setError(externos.errores[0]);
    if (invitados.length > 200) return setError('Puedes crear hasta 200 invitaciones por grupo. Divide la lista para continuar.');
    if (capacidadRestante !== null && invitados.length > capacidadRestante) return setError(`Quedan ${capacidadRestante} lugares en el aforo.`);
    if (!revisando) { setError(''); setRevisando(true); return; }
    bloqueo.current = true;
    setOcupado('crear'); setError('');
    try { setResultado(await api.invitar(eventoId, invitados)); } catch (e) { setError(mensajeError(e)); } finally { bloqueo.current = false; setOcupado(null); }
  };
  const enviar = async (ids: string[]) => {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setError('');
    for (const id of ids) {
      setOcupado(id);
      try { await api.enviarInvitacion(eventoId, id); setEnviadas(p => new Set(p).add(id)); }
      catch (e) { setError(mensajeError(e)); break; }
    }
    setOcupado(null);
    bloqueo.current = false;
  };
  const copiarEnlace = async (c: InvitacionCreada) => { if (await copiar(c.enlace)) { setCopiado(c.id); setTimeout(() => setCopiado(''), 1800); } else setError('No se pudo copiar el enlace. Puedes seleccionarlo y copiarlo manualmente.'); };

  return <Dialog open onOpenChange={v => { if (!v && !ocupado) onCerrar(); }}>
    <DialogContent className="cf-dialog max-w-2xl max-h-[92vh] overflow-y-auto">
      <span className="cf-eyebrow">INVITACIONES / {resultado ? 'CREADAS' : revisando ? 'REVISAR' : 'DESTINATARIOS'}</span>
      <DialogTitle>{resultado ? 'El encuentro ya tiene invitados.' : revisando ? 'Todo listo para invitar.' : 'Las personas hacen el encuentro.'}</DialogTitle>
      <DialogDescription>{resultado ? 'Los enlaces privados se muestran solo ahora. Envíalos o cópialos antes de cerrar.' : 'El equipo ve la invitación en su panel. Los externos reciben un enlace personal que se activa con su correo.'}</DialogDescription>
      {!resultado ? <div className="cf-form">
        {!revisando ? <><div className="cf-tabs" aria-label="Tipo de invitados">
          <button type="button" aria-current={modo === 'equipo' ? 'page' : undefined} onClick={() => setModo('equipo')}><Users />Equipo de Moon Studios</button>
          <button type="button" aria-current={modo === 'externos' ? 'page' : undefined} onClick={() => setModo('externos')}><Mail />Invitados externos</button>
        </div>
        {modo === 'equipo' ? <>
          <input className="cf-input" type="search" placeholder="Buscar por nombre o rol…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar personas" />
          <div className="cf-enlaces">{disponibles.length ? disponibles.map(p => <label key={p.uid} className="cf-interruptor">
            <input type="checkbox" checked={seleccion.has(p.uid)} onChange={e => setSeleccion(s => { const n = new Set(s); if (e.target.checked) n.add(p.uid); else n.delete(p.uid); return n; })} />
            <span>{p.nombre}<small>{p.role}</small></span></label>) : <p className="cf-muted">No hay más personas para invitar.</p>}</div>
          <button type="button" className="enterprise-action" disabled={!disponibles.length} onClick={() => setSeleccion(new Set([...seleccion, ...disponibles.map(p => p.uid)]))}>Seleccionar los {disponibles.length} visibles</button>
        </> : <label className="cf-campo"><span>Un invitado por línea: «Nombre, correo»</span>
          <textarea value={lista} onChange={e => { setLista(e.target.value); setError(''); }} rows={7} placeholder={'Ana Torres, ana@empresa.com\nLuis Rojas <luis@correo.com>'} />
          <small className="cf-muted">{externos.invitados.length} válidos{externos.errores.length ? ` · ${externos.errores.length} con errores` : ''}. Hasta 200 por vez.</small>
        </label>}
        <label className="cf-campo"><span>Rol de {cantidad === 1 ? 'la persona invitada' : 'las personas invitadas'}</span>
          <select value={rol} onChange={e => setRol(e.target.value as RolInvitado)}>{(Object.keys(ROLES_INVITADO) as RolInvitado[]).map(r => <option key={r} value={r}>{ROLES_INVITADO[r]}</option>)}</select>
        </label>
        </> : <div className="cf-review"><span className="cf-review__icon"><Users /></span><h3>{cantidad} {cantidad === 1 ? 'invitación personal' : 'invitaciones personales'}</h3><p>{modo === 'equipo' ? 'Equipo de Moon Studios' : 'Invitados externos'} · {ROLES_INVITADO[rol]}</p>
          <div className="cf-review-people">{modo === 'equipo' ? [...seleccion].map(uid => <span key={uid}>{personal.find(p => p.uid === uid)?.nombre || 'Miembro del equipo'}</span>) : externos.invitados.map(i => <span key={i.email}>{i.nombre}<small>{i.email}</small></span>)}</div>
          {capacidadRestante !== null && <p className="cf-muted">Aforo disponible antes de crear: {capacidadRestante} lugares. El servidor vuelve a comprobar el cupo al guardar.</p>}</div>}
        <p className="cf-nota"><ShieldCheck />Cada invitación tiene su propio QR y código. Puedes revocarla o regenerarla en cualquier momento; las anteriores dejan de valer.</p>
        {error && <p className="cf-alerta" role="alert"><AlertCircle />{error}</p>}
        <div className="cf-acciones">
          <button type="button" className="enterprise-action" disabled={!!ocupado} onClick={revisando ? () => setRevisando(false) : onCerrar}>{revisando ? <><ArrowLeft />Corregir lista</> : 'Cancelar'}</button>
          <button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado || !cantidad} onClick={() => void crear()}>{ocupado && <LoaderCircle className="cf-spin" />}{revisando ? `Crear ${cantidad} ${cantidad === 1 ? 'invitación' : 'invitaciones'}` : <>Revisar invitaciones<ArrowRight /></>}</button>
        </div>
      </div> : <div className="cf-form">
        <div className="cf-send-summary"><span><strong>{resultado.creadas.length}</strong>Creadas</span><span><strong>{enviadas.size}</strong>Enviadas</span><span><strong>{resultado.omitidos.length}</strong>Omitidas</span></div>
        {resultado.omitidos.length > 0 && <div className="cf-nota"><AlertCircle /><div><strong>Estas personas no se agregaron</strong>{resultado.omitidos.map((o, i) => <p key={i}>{o.nombre}: {o.motivo}</p>)}</div></div>}
        <div className="cf-enlaces">{resultado.creadas.map(c => <div key={c.id} className="cf-enlace">
          <div style={{ minWidth: 0 }}><strong>{c.nombre}</strong> <span className="cf-muted">{c.interno ? '· equipo' : `· ${c.email}`}</span><code>{c.interno ? 'Verá la invitación en su panel.' : c.enlace}</code></div>
          <div className="cf-acciones-fila">
            {!c.interno && <button type="button" className="cf-icono" aria-label={`Copiar el enlace de ${c.nombre}`} onClick={() => void copiarEnlace(c)}>{copiado === c.id ? <Check /> : <Copy />}</button>}
            <button type="button" className="cf-icono" disabled={!!ocupado || enviadas.has(c.id)} aria-label={`Enviar la invitación a ${c.nombre}`} onClick={() => void enviar([c.id])}>{ocupado === c.id ? <LoaderCircle className="cf-spin" /> : enviadas.has(c.id) ? <Check /> : <Send />}</button>
          </div>
        </div>)}</div>
        {error && <p className="cf-alerta" role="alert"><AlertCircle />{error}</p>}
        <div className="cf-acciones">
          <button type="button" className="enterprise-action" disabled={!!ocupado || resultado.creadas.every(c => enviadas.has(c.id))} onClick={() => void enviar(resultado.creadas.filter(c => !enviadas.has(c.id)).map(c => c.id))}><Send />Enviar todas ({resultado.creadas.filter(c => !enviadas.has(c.id)).length})</button>
          <button type="button" className="enterprise-action enterprise-action--primary" disabled={!!ocupado} onClick={onCerrar}>Listo</button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
