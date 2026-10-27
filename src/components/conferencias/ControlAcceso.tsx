import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, Eye, Keyboard, LoaderCircle, ScanLine, ShieldAlert, XCircle } from 'lucide-react';
import * as api from '@/lib/conferencias/api';
import { ROLES_INVITADO, type EventoConf, type ResultadoValidacion } from '@/lib/conferencias/tipos';
import { hora } from '@/lib/ajustes/fecha';
import { mensajeError } from './util';

interface Lectura { r: ResultadoValidacion; at: Date; registrada: boolean }

/**
 * Puerta del evento. El QR solo es un identificador firmado: el servidor
 * decide si la invitación vale, si es de este evento, si está en horario y si
 * ya se usó. Dos lectores no pueden aceptar a la vez la misma entrada.
 */
export function ControlAcceso({ evento }: { evento: EventoConf }) {
  const video = useRef<HTMLVideoElement>(null);
  const controles = useRef<{ stop: () => void } | null>(null);
  const ultimo = useRef({ texto: '', at: 0 });
  const ocupadoRef = useRef(false);
  const generacionCamara = useRef(0);
  const registrarRef = useRef(true);
  const montado = useRef(true);
  const [camara, setCamara] = useState<'apagada' | 'iniciando' | 'activa' | 'error'>('apagada');
  const [errorCamara, setErrorCamara] = useState('');
  const [codigo, setCodigo] = useState('');
  const [registrar, setRegistrar] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [historial, setHistorial] = useState<Lectura[]>([]);
  const [error, setError] = useState('');

  const comprobar = useCallback(async (datos: { qr?: string; codigo?: string }) => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true; setOcupado(true); setError(''); setLectura(null);
    const registrada = registrarRef.current;
    try {
      const r = await api.validar(evento.id, { ...datos, registrar: registrada });
      if (!montado.current) return;
      const l = { r, at: new Date(), registrada };
      setLectura(l); setHistorial(h => [l, ...h].slice(0, 12));
      navigator.vibrate?.(r.resultado === 'permitido' ? 80 : [60, 60, 60]);
    } catch (e) { if (montado.current) setError(mensajeError(e)); }
    finally { ocupadoRef.current = false; if (montado.current) setOcupado(false); }
  }, [evento.id]);

  const apagar = useCallback(() => { generacionCamara.current++; try { controles.current?.stop(); } catch { /* ya detenida */ } controles.current = null; if (montado.current) setCamara('apagada'); }, []);

  const encender = async () => {
    if (!video.current) return;
    const generacion = ++generacionCamara.current;
    setCamara('iniciando'); setErrorCamara('');
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (!montado.current || generacion !== generacionCamara.current || !video.current) return;
      const lector = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
      const control = await lector.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, res => {
        if (!res || !montado.current || generacion !== generacionCamara.current) return;
        const texto = res.getText();
        const ahora = Date.now();
        // La misma credencial frente a la cámara no se envía dos veces seguidas.
        if (texto === ultimo.current.texto && ahora - ultimo.current.at < 4000) return;
        ultimo.current = { texto, at: ahora };
        void comprobar({ qr: texto });
      });
      if (!montado.current || generacion !== generacionCamara.current) { control.stop(); return; }
      controles.current = control;
      setCamara('activa');
    } catch (e) {
      if (!montado.current || generacion !== generacionCamara.current) return;
      setCamara('error');
      setErrorCamara(e instanceof Error && /Permission|NotAllowed/i.test(e.name + e.message) ? 'Permite el acceso a la cámara para escanear.' : 'No se encontró una cámara disponible. Usa el código manual.');
    }
  };
  useEffect(() => { montado.current = true; return () => { montado.current = false; apagar(); }; }, [apagar]);

  const r = lectura?.r;
  return <div className="cf-door"><div className="cf-door-mode"><div><span className="cf-eyebrow">PUNTO DE ACCESO</span><h3>Una entrada, una verificación.</h3><p>Confirma el nombre de la persona antes de permitirle entrar.</p></div><div className="cf-segmented"><button type="button" disabled={ocupado} aria-pressed={!registrar} onClick={() => { setRegistrar(false); registrarRef.current = false; }}><Eye />Solo consultar</button><button type="button" disabled={ocupado} aria-pressed={registrar} onClick={() => { setRegistrar(true); registrarRef.current = true; }}><ScanLine />Registrar ingreso</button></div></div>
    <p className="cf-nota"><ShieldAlert />{registrar ? 'Modo ingreso: una credencial válida registra la asistencia y consume el acceso único.' : 'Modo consulta: comprueba el estado de la credencial sin registrar asistencia.'}</p><div className="cf-puerta">
    <div className="cf-form">
      <div className="cf-camara">
        <video ref={video} muted playsInline aria-label="Vista de la cámara" />
        {camara !== 'activa' && <div className="cf-camara__placeholder"><ScanLine /><strong>El siguiente encuentro<br />empieza en la puerta.</strong><span>Activa la cámara o usa un código.</span></div>}
        {camara === 'activa' && <div className="cf-camara__marco" aria-hidden="true" />}
        <span className="cf-camara__estado">{camara === 'activa' ? (ocupado ? 'Validando…' : 'Apunta al código QR') : camara === 'iniciando' ? 'Encendiendo cámara…' : 'Cámara apagada'}</span>
      </div>
      {errorCamara && <p className="cf-alerta" role="alert"><CameraOff />{errorCamara}</p>}
      <div className="cf-acciones" style={{ justifyContent: 'flex-start' }}>
        {camara === 'activa' || camara === 'iniciando' ? <button type="button" className="enterprise-action" onClick={apagar}><CameraOff />{camara === 'iniciando' ? 'Cancelar cámara' : 'Apagar cámara'}</button>
          : <button type="button" className="enterprise-action enterprise-action--primary" onClick={() => void encender()}><Camera />Escanear con la cámara</button>}
      </div>
      <form className="cf-filtros" onSubmit={ev => { ev.preventDefault(); if (codigo.trim()) void comprobar({ codigo }); }}>
        <label className="cf-campo" style={{ flex: '1 1 200px' }}><span><Keyboard style={{ width: 14, height: 14, display: 'inline', verticalAlign: '-2px' }} /> Código manual</span>
          <input className="cf-codigo" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="ABCD-2345" maxLength={12} autoComplete="off" spellCheck={false} /></label>
        <button type="submit" className="enterprise-action enterprise-action--primary" style={{ alignSelf: 'end' }} disabled={ocupado || !codigo.trim()}>{ocupado && <LoaderCircle className="cf-spin" />}{registrar ? 'Validar e ingresar' : 'Consultar código'}</button>
      </form>
    </div>

    <div className="cf-form" aria-live="polite">
      {ocupado && !r && <div className="cf-resultado"><LoaderCircle className="cf-spin" />Validando…</div>}
      {error && <p className="cf-alerta" role="alert"><ShieldAlert />{error}</p>}
      {r ? <div className={`cf-resultado ${r.resultado === 'permitido' ? 'cf-resultado--ok' : 'cf-resultado--no'}`}>
        {r.resultado === 'permitido' ? <CheckCircle2 /> : <XCircle />}
        <span className="cf-eyebrow">{r.resultado === 'permitido' ? (lectura?.registrada ? 'Ingreso registrado' : 'Consulta: credencial válida') : 'Acceso denegado'}</span>
        {r.invitado && <strong>{r.invitado.nombre}</strong>}
        {r.invitado && <span className="cf-muted">{ROLES_INVITADO[r.invitado.rol]}{r.invitado.interno ? ' · Equipo Moon Studios' : ''}</span>}
        <span>{r.mensaje}</span>
        {r.motivo === 'ya-ingreso' && r.ultimoIngresoAt && <span className="cf-muted">Ingresó a las {hora(new Date(r.ultimoIngresoAt))}.</span>}
        {r.motivo === 'todavia-no' && r.apertura && <span className="cf-muted">El acceso abre a las {hora(new Date(r.apertura))}.</span>}
        {r.resultado === 'permitido' && <span className="cf-muted">Comprueba que la persona coincide con el nombre.</span>}
      </div> : !ocupado && <div className="cf-vacio"><Camera /><h3>Listo para validar</h3><p>Escanea el QR de la invitación o escribe su código.</p></div>}
      {historial.length > 0 && <div className="cf-panel" style={{ padding: 12 }}>
        <h3>Últimas lecturas</h3>
        <ul className="cf-avisos" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{historial.map((h, i) => <li key={i} className="cf-persona">
          {h.r.resultado === 'permitido' ? <CheckCircle2 style={{ width: 16 }} /> : <XCircle style={{ width: 16, color: 'var(--moon-danger)' }} />}
          <div>{h.r.invitado?.nombre ?? 'Credencial no válida'}<small>{h.registrada ? 'Ingreso' : 'Consulta'} · {h.r.mensaje}</small></div><time className="cf-muted">{hora(h.at)}</time></li>)}</ul>
      </div>}
    </div>
  </div></div>;
}
