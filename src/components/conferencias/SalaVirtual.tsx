import { useEffect, useState } from 'react';
import { AlertCircle, Hourglass, LoaderCircle, RefreshCw, UserX, WifiOff } from 'lucide-react';
import * as api from '@/lib/conferencias/api';
import { escucharEspera, escucharMiEspera } from '@/lib/conferencias/datos';
import { auth } from '@/lib/firebase';
import type { EsperaConf, EventoConf, SalaLista } from '@/lib/conferencias/tipos';
import { mensajeError } from './util';
import SalaEnVivo, { type Flotante } from './SalaEnVivo';
import './sala.css';

const DEFINITIVOS = ['expulsado', 'cancelado', 'finalizado', 'terminado', 'sin-permiso', 'no-encontrado', 'sin-sala'];

/**
 * Sala de video propia sobre LiveKit. El token lo emite la API de Luna NET solo
 * a quien tiene acceso vigente (y, con sala de espera, solo después de que un
 * moderador lo admita); sus permisos dependen del rol. La presentación vive en
 * SalaEnVivo (compartida con la web). Si se cae la conexión (internet, PC
 * suspendida), pide un pase nuevo y vuelve a entrar sola.
 */
export default function SalaVirtual({ evento, puedeModerar, onSalir, modo = 'completa', onMinimizar, onExpandir, flotante }: {
  evento: EventoConf; puedeModerar: boolean; onSalir: (motivo?: string) => void;
  modo?: 'completa' | 'mini'; onMinimizar?: () => void; onExpandir?: () => void; flotante?: Flotante;
}) {
  const [sala, setSala] = useState<SalaLista | null>(null);
  const [estado, setEstado] = useState<'pidiendo' | 'esperando' | 'expulsado' | 'error' | 'reconectando'>('pidiendo');
  const [error, setError] = useState('');
  const uid = auth.currentUser?.uid ?? '';
  const [espera, setEspera] = useState<EsperaConf[]>([]);
  const modera = puedeModerar || sala?.rol === 'anfitrion' || sala?.rol === 'moderador';
  useEffect(() => (modera ? escucharEspera(evento.id, setEspera, () => {}) : undefined), [modera, evento.id]);

  const solicitar = () => api.entrarSala(evento.id).then(r => { if (r.estado === 'esperando') setEstado('esperando'); else setSala(r); })
    .catch(e => { setError(mensajeError(e)); setEstado((e as api.ErrorConf).codigo === 'expulsado' ? 'expulsado' : 'error'); });
  const pedir = (reintento = false) => {
    if (reintento) { setEstado('pidiendo'); setError(''); }
    return solicitar();
  };
  useEffect(() => { void solicitar(); }, [evento.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // En la sala de espera se escucha la decisión del moderador.
  useEffect(() => {
    if (estado !== 'esperando' || !uid) return;
    return escucharMiEspera(evento.id, uid, e => { if (e === 'admitido') void pedir(); else if (e === 'expulsado') setEstado('expulsado'); }, () => {});
  }, [estado, evento.id, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Conexión perdida: reintenta con espera creciente, y al instante si vuelve internet o la app.
  useEffect(() => {
    if (estado !== 'reconectando') return;
    let intento = 0, temporizador = 0, activo = true;
    const probar = () => {
      window.clearTimeout(temporizador);
      api.entrarSala(evento.id).then(r => { if (!activo) return; if (r.estado === 'esperando') setEstado('esperando'); else { setSala(r); setEstado('pidiendo'); } })
        .catch(e => {
          if (!activo) return;
          const codigo = (e as api.ErrorConf).codigo ?? '';
          if (DEFINITIVOS.includes(codigo)) { setError(mensajeError(e)); setEstado(codigo === 'expulsado' ? 'expulsado' : 'error'); return; }
          intento += 1;
          temporizador = window.setTimeout(probar, Math.min(30_000, 2_000 * 2 ** intento));
        });
    };
    const ya = () => { if (document.visibilityState === 'visible' && navigator.onLine) probar(); };
    temporizador = window.setTimeout(probar, 1_500);
    window.addEventListener('online', ya);
    document.addEventListener('visibilitychange', ya);
    return () => { activo = false; window.clearTimeout(temporizador); window.removeEventListener('online', ya); document.removeEventListener('visibilitychange', ya); };
  }, [estado, evento.id]);

  if (!sala) {
    const mini = modo === 'mini';
    return <section className={`msala-previo${mini ? ' msala-previo--mini' : ''}`}><div className="msala-previo__caja">
      {estado === 'pidiendo' && <><span className="msala-previo__icono"><LoaderCircle className="cf-spin" /></span><h3>Conectando con la sala…</h3><p>{evento.titulo}</p></>}
      {estado === 'reconectando' && <><span className="msala-previo__icono"><WifiOff /></span><h3>Reconectando…</h3><p>Se perdió la conexión. Volvemos a entrar solos en cuanto haya internet.</p></>}
      {estado === 'esperando' && <><span className="msala-previo__icono"><Hourglass /></span><h3>Estás en la sala de espera</h3><p>Un moderador te dará acceso en breve. Puedes seguir usando el dashboard.</p></>}
      {estado === 'expulsado' && <><span className="msala-previo__icono"><UserX /></span><h3>No puedes entrar a esta sala</h3><p>La organización retiró tu acceso.</p></>}
      {estado === 'error' && <><span className="msala-previo__icono msala-previo__icono--error"><AlertCircle /></span><h3>No se pudo entrar</h3><p>{error}</p></>}
      <div className="msala-previo__acciones">
        {estado === 'error' && <button type="button" className="msala-previo__btn" onClick={() => void pedir(true)}><RefreshCw size={15} />Reintentar</button>}
        {mini && onExpandir && estado !== 'expulsado' && <button type="button" className="msala-previo__btn msala-previo__btn--suave" onClick={onExpandir}>Abrir</button>}
        <button type="button" className="msala-previo__btn msala-previo__btn--suave" onClick={() => onSalir()}>{estado === 'esperando' || estado === 'reconectando' || estado === 'pidiendo' ? 'Cancelar' : 'Cerrar'}</button>
      </div>
    </div></section>;
  }

  return <SalaEnVivo key={sala.token} titulo={evento.titulo} rol={sala.rol} grabacion={sala.grabacionPermitida} url={sala.url} token={sala.token}
    modera={modera} esperando={espera.filter(e => e.estado === 'esperando')}
    moderar={async (id, accion) => { await api.moderarSala(evento.id, id, accion); }}
    onSalir={onSalir} onCaida={() => { setSala(null); setEstado('reconectando'); }}
    modo={modo} onMinimizar={onMinimizar} onExpandir={onExpandir} flotante={flotante} />;
}
