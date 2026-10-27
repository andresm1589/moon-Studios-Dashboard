// Audio y video de la sala (LiveKit): elegir micrófono, cámara y salida de audio,
// ver si el micrófono capta la voz y recuperar el sonido si el navegador lo bloquea.
// El mismo archivo vive en el dashboard y en la web (src/conferencias/Dispositivos.tsx).
import { useEffect, useRef, useState } from 'react';
import { StartAudio, useLocalParticipant, useMediaDeviceSelect, useTrackVolume } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, Settings2, Video, Volume2, X } from 'lucide-react';
import { captaLaSalida } from './microfonoReal';

const salidaSoportada = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Dispositivos del sistema de un tipo. No pide permisos: sin ellos los nombres llegan vacíos. */
function useListaDelSistema(kind: MediaDeviceKind, version: unknown) {
  const [lista, setLista] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    let vivo = true;
    const leer = () => { md.enumerateDevices().then(d => { if (vivo) setLista(d.filter(x => x.kind === kind && x.deviceId)); }).catch(() => {}); };
    leer();
    md.addEventListener('devicechange', leer);
    return () => { vivo = false; md.removeEventListener('devicechange', leer); };
  }, [kind, version]);
  return lista;
}

function Selector({ kind, nombre, icono: Icono, version }: { kind: MediaDeviceKind; nombre: string; icono: typeof Mic; version: unknown }) {
  const [error, setError] = useState('');
  // Pedir permisos desde aquí competía con el botón «Micrófono» y Windows podía trabarse:
  // la lista sale del sistema y los nombres aparecen al activar el micrófono o la cámara.
  const { devices: deLiveKit, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, requestPermissions: false });
  const delSistema = useListaDelSistema(kind, version);
  const devices = deLiveKit.length ? deLiveKit : delSistema;
  const valor = devices.some(d => d.deviceId === activeDeviceId) ? activeDeviceId : devices[0]?.deviceId ?? '';
  return <label className="msala__campo">
    <span><Icono size={15} />{nombre}</span>
    <select value={valor} disabled={!devices.length}
      onChange={e => { setError(''); setActiveMediaDevice(e.target.value, kind === 'audiooutput' ? undefined : { exact: true }).catch(() => setError('No se pudo cambiar a ese dispositivo.')); }}>
      {devices.length ? devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || (d.deviceId === 'default' ? `${nombre} predeterminado` : `${nombre} ${i + 1}`)}{kind === 'audioinput' && captaLaSalida(d.label) ? ' — capta el sonido de la computadora' : ''}</option>) : <option value="">Sin dispositivos detectados</option>}
    </select>
    {error && <small className="msala__error">{error}</small>}
  </label>;
}

/** Barra de nivel del micrófono propio: confirma que la voz se está captando. */
function Medidor() {
  const { localParticipant, microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const volumen = useTrackVolume(microphoneTrack ? { participant: localParticipant, publication: microphoneTrack, source: Track.Source.Microphone } : undefined);
  const nivel = Math.min(1, volumen * 4);
  const capta = isMicrophoneEnabled && nivel > 0.08;
  return <div className="msala__campo">
    <span>Nivel de tu micrófono</span>
    <div className="msala__nivel" aria-hidden="true"><i style={{ width: `${Math.round(nivel * 100)}%` }} className={capta ? 'is-ok' : ''} /></div>
    <small role="status">{!isMicrophoneEnabled ? 'Tu micrófono está apagado: actívalo con el botón «Micrófono».' : capta ? 'Se te escucha.' : 'Habla para probar. Si la barra no se mueve, elige otro micrófono.'}</small>
  </div>;
}

/** Botón «Audio y video» del dock con su ventana flotante. `habla`: puede publicar micrófono y cámara. */
export function Dispositivos({ habla }: { habla: boolean }) {
  const [abierto, setAbierto] = useState(false);
  // Al encender micrófono o cámara el sistema ya da los nombres: se vuelve a leer la lista.
  const { isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const version = `${isMicrophoneEnabled}-${isCameraEnabled}`;
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  return <div className="msala__pop-ancla" ref={caja}>
    <button type="button" className="msala__btn msala__btn--ajustes" aria-expanded={abierto} title="Audio y video" onClick={() => setAbierto(v => !v)}><Settings2 size={18} /><span>Audio y video</span></button>
    {abierto && <div className="msala__pop" role="dialog" aria-label="Audio y video">
      <div className="msala__pop-top"><strong>Audio y video</strong>
        <button type="button" className="msala__icono" aria-label="Cerrar" onClick={() => setAbierto(false)}><X size={16} /></button></div>
      {habla && <><Selector kind="audioinput" nombre="Micrófono" icono={Mic} version={version} /><Medidor /><Selector kind="videoinput" nombre="Cámara" icono={Video} version={version} /></>}
      {!isMicrophoneEnabled && habla && <p className="msala__nota">Los nombres de los dispositivos aparecen al activar el micrófono.</p>}
      {salidaSoportada ? <Selector kind="audiooutput" nombre="Altavoz o audífonos" icono={Volume2} version={version} />
        : <p className="msala__nota"><Volume2 size={14} />Este navegador no permite elegir la salida: usa la salida de sonido de tu sistema.</p>}
    </div>}
  </div>;
}

/** Aparece solo si el navegador bloqueó el sonido de la sala; un clic lo activa. */
export function ActivarSonido() {
  return <StartAudio label="Activar el sonido de la sala" className="msala__sonido" />;
}
