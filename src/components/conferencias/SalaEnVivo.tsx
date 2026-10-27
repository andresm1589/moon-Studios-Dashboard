// Sala en vivo de Moon Studios (LiveKit): escenario, panel de chat y personas y
// dock de controles. Solo presentación y controles de la sala: el pase (token)
// y la moderación los resuelve la API de Luna NET a través de las props.
// El mismo archivo vive en el dashboard y en la web (src/conferencias/SalaEnVivo.tsx).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  CarouselLayout, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, TrackRefContext, TrackToggle, VideoTrack,
  isTrackReference, useChat, useConnectionState, useDisconnectButton, useIsMuted, useIsSpeaking, useLocalParticipantPermissions,
  useLocalParticipant, useParticipants, useRoomContext, useTrackRefContext, useTracks,
} from '@livekit/components-react';
import { ConnectionState, DisconnectReason, MediaDeviceFailure, Track } from 'livekit-client';
import '@livekit/components-styles';
import { AlertCircle, Circle, Maximize2, MessageSquare, MicOff, Minimize2, PhoneOff, PictureInPicture2, Send, UserCheck, UserX, Users, X, LayoutGrid, PanelTop, Pin, Smile, Search, ShieldCheck } from 'lucide-react';
import { ActivarSonido, Dispositivos } from './Dispositivos';
import { mensajeDispositivo } from './mensajeDispositivo';
import { buscarMicrofonoReal } from './microfonoReal';
import { EmojiText } from '@/components/discord/EmojiText';
import { EmojiButton } from '@/components/discord/EmojiButton';
import './sala.css';

export type AccionSala = 'admitir' | 'rechazar' | 'expulsar' | 'silenciar';
export interface EnEspera { uid: string; nombre: string; rol: string }
const ROL: Record<string, string> = { anfitrion: 'Anfitrión', moderador: 'Moderador', ponente: 'Ponente', asistente: 'Asistente' };
const iniciales = (nombre: string) => nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || 'M';
const rolDe = (metadata?: string) => { try { return (JSON.parse(metadata || '{}') as { rol?: string }).rol ?? ''; } catch { return ''; } };
const esPantallaAngosta = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;

const EMOJIS_RAPIDOS = ['👍', '👏', '❤️', '😂', '🎉', '✨'];
const ConversacionContext = createContext<ReturnType<typeof useChat> | null>(null);
function Conversacion({ children }: { children: React.ReactNode }) { const chat = useChat(); return <ConversacionContext.Provider value={chat}>{children}</ConversacionContext.Provider>; }
function useConversacion() { const chat = useContext(ConversacionContext); if (!chat) throw new Error('El chat debe estar dentro de la sala.'); return chat; }

/** Ventana flotante (app de Windows): la sala sigue visible encima de las demás apps. */
export interface Flotante { activo: boolean; alternar: () => void }

/**
 * `modo` cambia solo la presentación: la conexión (LiveKitRoom) es la misma, así
 * que pasar de la sala completa a la ventanita y volver no corta la llamada.
 * `onSalir` llega con un motivo si la sala te sacó; `onCaida`, si se perdió la
 * conexión (internet, suspensión): quien la usa vuelve a pedir el pase y reconecta.
 */
export default function SalaEnVivo({ titulo, rol, grabacion, url, token, modera, esperando, moderar, onSalir, onCaida, modo = 'completa', onMinimizar, onExpandir, flotante }: {
  titulo: string; rol: string; grabacion: boolean; url: string; token: string;
  modera: boolean; esperando: EnEspera[]; moderar: (uid: string, accion: AccionSala) => Promise<void>;
  onSalir: (motivo?: string) => void; onCaida?: () => void;
  modo?: 'completa' | 'mini'; onMinimizar?: () => void; onExpandir?: () => void; flotante?: Flotante;
}) {
  const [panel, setPanel] = useState<'chat' | 'personas' | null>(() => (esPantallaAngosta() ? null : 'chat'));
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'error' | 'info' } | null>(null);
  const avisar = useCallback((texto: string, tipo: 'error' | 'info' = 'error') => setAviso({ texto, tipo }), []);
  // Quien modera ve llegar a la sala de espera aunque tenga el panel cerrado.
  const [vistos, setVistos] = useState(esperando.length);
  if (esperando.length !== vistos) {
    setVistos(esperando.length);
    if (modera && esperando.length > vistos) setPanel('personas');
  }
  const alternar = (p: 'chat' | 'personas') => setPanel(actual => (actual === p ? null : p));
  const alDesconectar = (motivo?: DisconnectReason) => {
    if (motivo === undefined || motivo === DisconnectReason.CLIENT_INITIATED) return onSalir();
    if (motivo === DisconnectReason.PARTICIPANT_REMOVED) return onSalir('La organización te retiró de la sala.');
    if (motivo === DisconnectReason.DUPLICATE_IDENTITY) return onSalir('Entraste a esta sala desde otra ventana o dispositivo.');
    if (motivo === DisconnectReason.ROOM_DELETED || motivo === DisconnectReason.ROOM_CLOSED) return onSalir('La sala se cerró.');
    if (onCaida) onCaida(); else onSalir('Se perdió la conexión con la sala.');
  };
  const mini = modo === 'mini';
  return <LiveKitRoom serverUrl={url} token={token} connect video={false} audio={false} onDisconnected={alDesconectar}
    onMediaDeviceFailure={(f, k) => avisar(mensajeDispositivo(f, k))} data-lk-theme="default" className={`msala${mini ? ' msala--mini' : ''}`}>
    <MicrofonoReal avisar={avisar} />
    <DesbloquearAudio />
    <RoomAudioRenderer />
    <ActivarSonido />
    <Conversacion>{mini ? <Mini titulo={titulo} onExpandir={onExpandir} flotante={flotante} aviso={aviso?.texto} /> : <>
    <Cabecera titulo={titulo} rol={rol} grabacion={grabacion} onMinimizar={onMinimizar} flotante={flotante} />
    {aviso && <div className={`msala__aviso${aviso.tipo === 'info' ? ' msala__aviso--info' : ''}`} role={aviso.tipo === 'info' ? 'status' : 'alert'}><AlertCircle size={18} /><p>{aviso.texto}</p><button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso"><X size={16} /></button></div>}
    <div className={`msala__cuerpo${panel ? ' con-panel' : ''}`}>
      <Escenario />
      {panel && <aside className="msala__panel" aria-label={panel === 'chat' ? 'Chat' : 'Personas'}>
        <div className="msala__panel-top">
          <div className="msala__seg" role="tablist">
            <button type="button" role="tab" aria-selected={panel === 'chat'} onClick={() => setPanel('chat')}><MessageSquare size={15} />Chat</button>
            <button type="button" role="tab" aria-selected={panel === 'personas'} onClick={() => setPanel('personas')}><Users size={15} />Personas{modera && esperando.length > 0 && <span className="msala__badge">{esperando.length}</span>}</button>
          </div>
          <button type="button" className="msala__icono" aria-label="Cerrar panel" onClick={() => setPanel(null)}><X size={17} /></button>
        </div>
        {panel === 'chat' ? <Chat /> : <Personas rol={rol} modera={modera} esperando={esperando} moderar={moderar} />}
      </aside>}
    </div>
    <Dock panel={panel} alternar={alternar} esperando={modera ? esperando.length : 0}
      onFallo={(kind, e) => avisar(mensajeDispositivo(MediaDeviceFailure.getFailure(e), kind, e))} />
    </>}</Conversacion>
  </LiveKitRoom>;
}

/**
 * Los navegadores bloquean el sonido hasta que la persona interactúa con la
 * página: sin esto, quien escucha no oye nada hasta pulsar «Activar el sonido».
 * Se intenta al conectar (vale el clic de «Entrar a la sala») y con cualquier
 * clic o tecla posterior.
 */
function DesbloquearAudio() {
  const room = useRoomContext();
  const conexion = useConnectionState();
  useEffect(() => {
    if (conexion === ConnectionState.Connected && !room.canPlaybackAudio) void room.startAudio().catch(() => {});
  }, [conexion, room]);
  useEffect(() => {
    const intentar = () => { if (!room.canPlaybackAudio) void room.startAudio().catch(() => {}); };
    document.addEventListener('pointerdown', intentar, true);
    document.addEventListener('keydown', intentar, true);
    return () => { document.removeEventListener('pointerdown', intentar, true); document.removeEventListener('keydown', intentar, true); };
  }, [room]);
  return null;
}

/**
 * Al encender el micrófono: si el elegido graba el sonido de la computadora
 * («Mezcla estéreo» y similares), se cambia a un micrófono real y se avisa.
 */
function MicrofonoReal({ avisar }: { avisar: (texto: string, tipo?: 'error' | 'info') => void }) {
  const room = useRoomContext();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const revisando = useRef(false);
  useEffect(() => {
    if (!isMicrophoneEnabled || revisando.current) return;
    revisando.current = true;
    void (async () => {
      try {
        const r = await buscarMicrofonoReal(room.getActiveDevice('audioinput'));
        if (!r) return;
        if (r.real && await room.switchActiveDevice('audioinput', r.real.deviceId, true)) {
          avisar(`«${r.activo.label}» graba el sonido de la computadora, no tu voz. Cambiamos a «${r.real.label}». Puedes elegir otro en «Audio y video».`, 'info');
        } else {
          avisar(`Tu micrófono es «${r.activo.label}», que graba el sonido de la computadora y no tu voz. Conecta un micrófono o elige otro en «Audio y video».`);
        }
      } catch { /* sin acceso a la lista: se queda el elegido */ }
      finally { revisando.current = false; }
    })();
  }, [isMicrophoneEnabled, room, avisar]);
  return null;
}

function useEstadoConexion() {
  const conexion = useConnectionState();
  const enVivo = conexion === ConnectionState.Connected;
  return { enVivo, estado: enVivo ? 'En vivo' : conexion === ConnectionState.Reconnecting ? 'Reconectando…' : conexion === ConnectionState.Connecting ? 'Conectando…' : 'Desconectado' };
}

/** La sala en una ventanita: quien habla (o la pantalla compartida) y los controles básicos. */
function Mini({ titulo, onExpandir, flotante, aviso }: { titulo: string; onExpandir?: () => void; flotante?: Flotante; aviso?: string }) {
  const pistas = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const destacado = pistas.find(t => t.source === Track.Source.ScreenShare && isTrackReference(t))
    ?? pistas.find(t => t.participant.isSpeaking && !t.participant.isLocal)
    ?? pistas.find(t => !t.participant.isLocal) ?? pistas[0];
  const habla = !!useLocalParticipantPermissions()?.canPublish;
  const participantes = useParticipants();
  const { enVivo, estado } = useEstadoConexion();
  const { buttonProps } = useDisconnectButton({});
  return <>
    <div className="msala-mini__top" data-tauri-drag-region>
      <span className={`msala__vivo${enVivo ? ' is-on' : ''}`} data-tauri-drag-region><i />{estado}</span>
      <strong title={titulo} data-tauri-drag-region>{titulo}</strong>
      <span className="msala-mini__n" title={`${participantes.length} en la sala`}><Users size={13} />{participantes.length}</span>
    </div>
    <div className="msala-mini__video">
      {destacado && <TrackRefContext.Provider value={destacado}><Mosaico /></TrackRefContext.Provider>}
      {aviso && <p className="msala-mini__aviso" role="alert">{aviso}</p>}
    </div>
    <div className="msala-mini__barra">
      {habla && <TrackToggle source={Track.Source.Microphone} showIcon className="msala__btn msala__btn--mini" title="Micrófono" />}
      {habla && <TrackToggle source={Track.Source.Camera} showIcon className="msala__btn msala__btn--mini" title="Cámara" />}
      {flotante && <button type="button" className="msala__btn msala__btn--mini" aria-pressed={flotante.activo} title={flotante.activo ? 'Salir de la ventana flotante' : 'Ventana flotante encima de todo'} onClick={flotante.alternar}><PictureInPicture2 size={17} /></button>}
      {onExpandir && <button type="button" className="msala__btn msala__btn--mini" title="Volver a la sala completa" onClick={onExpandir}><Maximize2 size={17} /></button>}
      <button type="button" {...buttonProps} className="msala__btn msala__btn--mini msala__btn--salir" title="Salir de la sala"><PhoneOff size={17} /></button>
    </div>
  </>;
}

function Cabecera({ titulo, rol, grabacion, onMinimizar, flotante }: { titulo: string; rol: string; grabacion: boolean; onMinimizar?: () => void; flotante?: Flotante }) {
  const { enVivo, estado } = useEstadoConexion();
  return <header className="msala__top">
    <div className="msala__identidad"><img src="/brand/moon-marca-blanco.png" width="32" height="32" alt="" /><div><span>MOON STUDIOS <b>/</b> CONFERENCIAS</span><h2 title={titulo}>{titulo}</h2></div></div>
    <div className="msala__chips"><span className={`msala__vivo${enVivo ? ' is-on' : ''}`} role="status"><i />{estado}</span><span className="msala__chip msala__rol"><ShieldCheck size={13} />{ROL[rol] ?? rol}</span>
      {grabacion && <span className="msala__chip msala__chip--rec" title="La organización permite grabar; esto no indica que se esté grabando ahora."><Circle size={8} />Puede grabarse</span>}
      {flotante && <button type="button" className="msala__icono" title="La sala queda encima de las demás apps" aria-label="Ventana flotante" aria-pressed={flotante.activo} onClick={flotante.alternar}><PictureInPicture2 size={18} /></button>}
      {onMinimizar && <button type="button" className="msala__icono" title="Continúa la llamada mientras usas el dashboard" aria-label="Minimizar la sala" onClick={onMinimizar}><Minimize2 size={18} /></button>}
    </div>
  </header>;
}

function Escenario() {
  const pistas = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const participantes = useParticipants();
  const [vista, setVista] = useState<'auto' | 'mosaico' | 'enfoque'>('auto');
  const [fijado, setFijado] = useState('');
  const pantalla = pistas.find(t => t.source === Track.Source.ScreenShare && isTrackReference(t));
  const elegido = pistas.find(t => t.participant.identity === fijado && t.source === Track.Source.Camera);
  const destacado = vista === 'mosaico' ? undefined : elegido ?? pantalla ?? (vista === 'enfoque' ? pistas.find(t => t.participant.isSpeaking && !t.participant.isLocal) ?? pistas.find(t => !t.participant.isLocal) ?? pistas[0] : undefined);
  const fijar = (id: string) => { setFijado(id === fijado ? '' : id); setVista(id === fijado ? 'auto' : 'enfoque'); };
  return <main className="msala__escenario" aria-label="Escenario de la reunión">
    <div className="msala__escenario-barra"><div><Users size={14} /><span>{participantes.length} {participantes.length === 1 ? 'persona' : 'personas'} en la sala</span>{pantalla && <span className="msala__presentando">Pantalla compartida</span>}</div><div className="msala__vistas" role="group" aria-label="Vista de participantes"><button type="button" aria-pressed={!destacado} title="Vista de mosaico" onClick={() => { setVista('mosaico'); setFijado(''); }}><LayoutGrid size={15} /><span>Mosaico</span></button><button type="button" aria-pressed={!!destacado} title="Vista de enfoque" onClick={() => setVista('enfoque')}><PanelTop size={15} /><span>Enfoque</span></button></div></div>
    <div className="msala__lienzo">{!pistas.length ? <div className="msala__escenario-vacio"><div className="msala__orbita-vacia"><Users size={34} /></div><h3>Un espacio para encontrarnos.</h3><p>Los participantes aparecerán aquí al conectarse.</p></div>
      : destacado ? <div className="msala__enfoque"><div className="msala__destacado"><TrackRefContext.Provider value={destacado}><Mosaico onFijar={fijar} fijado={fijado} /></TrackRefContext.Provider></div>{pistas.length > 1 && <CarouselLayout tracks={pistas.filter(t => t !== destacado)} className="lk-carousel msala__tira"><Mosaico onFijar={fijar} fijado={fijado} /></CarouselLayout>}</div>
      : <GridLayout tracks={pistas} className="msala__grilla"><Mosaico onFijar={fijar} fijado={fijado} /></GridLayout>}<ReaccionesVisibles />
    </div>
    <div className="msala__escenario-pie"><span><ShieldCheck size={12} />Acceso personal de Moon Studios</span><span>La conversación es de este encuentro</span></div>
  </main>;
}

/** Mosaico: el video solo aparece cuando LiveKit dispone de una pista activa. */
function Mosaico({ onFijar, fijado = '' }: { onFijar?: (id: string) => void; fijado?: string } = {}) {
  const ref = useTrackRefContext(); const p = ref.participant;
  const habla = useIsSpeaking(p); const camaraApagada = useIsMuted(ref);
  const micApagado = useIsMuted({ participant: p, source: Track.Source.Microphone });
  const conVideo = isTrackReference(ref) && !camaraApagada;
  const nombre = p.name || p.identity || 'Participante'; const rol = rolDe(p.metadata);
  const tono = [...p.identity].reduce((v, c) => v + c.charCodeAt(0), 0) % 5;
  return <ParticipantTile className={`msala__mosaico msala__mosaico--tono-${tono}${habla ? ' is-hablando' : ''}${ref.source === Track.Source.ScreenShare ? ' is-pantalla' : ''}`} disableSpeakingIndicator>
    {conVideo ? <VideoTrack trackRef={ref} className="msala__video" /> : <div className="msala__avatar"><span>{iniciales(nombre)}</span><small>{p.isLocal ? 'Tu cámara está apagada' : 'Cámara apagada'}</small></div>}
    <div className="msala__tile-superior">{rol && rol !== 'asistente' && <span>{ROL[rol] ?? rol}</span>}{onFijar && <button type="button" className={`msala__fijar${fijado === p.identity ? ' is-fijado' : ''}`} aria-pressed={fijado === p.identity} aria-label={`${fijado === p.identity ? 'Dejar de enfocar' : 'Enfocar'} a ${nombre}`} title={fijado === p.identity ? 'Dejar de enfocar' : 'Enfocar participante'} onClick={e => { e.stopPropagation(); onFijar(p.identity); }}><Pin size={14} /></button>}</div>
    <div className="msala__nombre"><span>{nombre}{p.isLocal ? ' (tú)' : ''}</span><span className="msala__estado-mic">{micApagado ? <MicOff size={14} aria-label="Micrófono apagado" /> : habla ? <span className="msala__voz" aria-label="Hablando"><i /><i /><i /></span> : null}</span></div>
  </ParticipantTile>;
}

/** Los emojis rápidos son mensajes por el chat existente, sin otro protocolo. */
function ReaccionesRapidas() {
  const { send, isSending } = useConversacion();
  const [abierto, setAbierto] = useState(false); const [error, setError] = useState('');
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: PointerEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', cerrar); document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('pointerdown', cerrar); document.removeEventListener('keydown', tecla); };
  }, [abierto]);
  async function enviarEmoji(emoji: string) { if (isSending) return; setError(''); try { await send(emoji); setAbierto(false); } catch { setError('No se pudo enviar el emoji. Inténtalo de nuevo.'); } }
  return <div className="msala__reacciones-ancla" ref={caja}><button type="button" className="msala__btn" aria-expanded={abierto} aria-label="Emojis rápidos para el chat" title="Enviar un emoji al chat" onClick={() => setAbierto(!abierto)}><Smile size={20} /><span>Emojis</span></button>{abierto && <div className="msala__reacciones" role="dialog" aria-label="Enviar un emoji al chat"><strong>Exprésate en el encuentro</strong><p>Se envía como mensaje al chat de la sala.</p><div>{EMOJIS_RAPIDOS.map(emoji => <button type="button" key={emoji} aria-label={`Enviar ${emoji} al chat`} disabled={isSending} onClick={() => void enviarEmoji(emoji)}><EmojiText text={emoji} size={28} /></button>)}</div>{error && <p role="alert">{error}</p>}</div>}</div>;
}

function ReaccionesVisibles() {
  const { chatMessages } = useConversacion(); const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { setAhora(Date.now()); const timer = window.setTimeout(() => setAhora(Date.now()), 5500); return () => clearTimeout(timer); }, [chatMessages]);
  const ultimas = chatMessages.filter(m => EMOJIS_RAPIDOS.includes(m.message.trim()) && m.timestamp > ahora - 5000 && m.timestamp <= ahora + 2000).slice(-5);
  return <div className="msala__reacciones-visibles" aria-hidden="true">{ultimas.map((m, i) => <span key={m.id ?? m.timestamp} style={{ right: 24 + i * 55 }}><EmojiText text={m.message.trim()} size={36} /><small>{m.from?.name?.split(' ')[0] || 'Participante'}</small></span>)}</div>;
}

function Dock({ panel, alternar, esperando, onFallo }: { panel: 'chat' | 'personas' | null; alternar: (p: 'chat' | 'personas') => void; esperando: number; onFallo: (kind: MediaDeviceKind, e: Error) => void }) {
  const habla = !!useLocalParticipantPermissions()?.canPublish; const { buttonProps } = useDisconnectButton({});
  return <footer className="msala__dock"><div className="msala__dock-grupo msala__dock-medios">{habla ? <><TrackToggle source={Track.Source.Microphone} showIcon className="msala__btn" aria-label="Activar o desactivar micrófono" title="Micrófono" onDeviceError={e => onFallo('audioinput', e)}><span>Micrófono</span></TrackToggle><TrackToggle source={Track.Source.Camera} showIcon className="msala__btn" aria-label="Activar o desactivar cámara" title="Cámara" onDeviceError={e => onFallo('videoinput', e)}><span>Cámara</span></TrackToggle><TrackToggle source={Track.Source.ScreenShare} showIcon captureOptions={{ audio: true }} className="msala__btn" aria-label="Compartir o dejar de compartir pantalla" title="Compartir pantalla"><span>Presentar</span></TrackToggle></> : <span className="msala__oyente"><ShieldCheck size={16} />Estás como oyente</span>}<Dispositivos habla={habla} /></div>
    <div className="msala__dock-grupo msala__dock-social"><ReaccionesRapidas /><button type="button" className="msala__btn" aria-pressed={panel === 'chat'} aria-label="Chat de la sala" title="Chat de la sala" onClick={() => alternar('chat')}><MessageSquare size={20} /><span>Chat</span></button><button type="button" className="msala__btn" aria-pressed={panel === 'personas'} aria-label={`Participantes${esperando ? `, ${esperando} en espera` : ''}`} title="Participantes" onClick={() => alternar('personas')}><Users size={20} /><span>Personas</span>{esperando > 0 && <b className="msala__badge">{esperando}</b>}</button><span className="msala__dock-divisor" /><button type="button" {...buttonProps} className="msala__btn msala__btn--salir" title="Salir de la sala" aria-label="Salir de la sala"><PhoneOff size={20} /><span>Salir</span></button></div>
  </footer>;
}

function Chat() {
  const { chatMessages, send, isSending } = useConversacion();
  const [texto, setTexto] = useState(''); const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null); const mensajes = useRef<HTMLDivElement>(null); const seguir = useRef(true);
  useEffect(() => { const el = mensajes.current; if (el && seguir.current) el.scrollTop = el.scrollHeight; }, [chatMessages.length]);
  const enviar = async (e: React.FormEvent) => { e.preventDefault(); const t = texto.trim(); if (!t || isSending) return; setError(''); try { await send(t.slice(0, 1000)); setTexto(''); seguir.current = true; } catch { setError('No se pudo enviar. Tu mensaje sigue aquí; vuelve a intentarlo.'); } };
  return <div className="msala__chat"><div className="msala__chat-nota"><ShieldCheck size={13} /><p>Solo lo ven quienes están en esta sala. Los mensajes no se guardan al cerrar la conexión.</p></div><div className="msala__mensajes" role="log" aria-label="Mensajes de la sala" aria-live="polite" aria-relevant="additions" ref={mensajes} onScroll={() => { const e = mensajes.current; if (e) seguir.current = e.scrollHeight - e.scrollTop - e.clientHeight < 100; }}>
    {chatMessages.length ? chatMessages.map(m => <div key={m.id ?? m.timestamp} className={`msala__msg${m.from?.isLocal ? ' is-propio' : ''}`}><span className="msala__msg-avatar">{iniciales(m.from?.name || 'Participante')}</span><div><header><strong>{m.from?.isLocal ? 'Tú' : m.from?.name || 'Participante'}</strong><time>{new Date(m.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</time></header><p><EmojiText text={m.message} size={21} /></p></div></div>) : <div className="msala__vacio"><MessageSquare size={29} /><h3>La conversación empieza aquí.</h3><p>Comparte una idea, una pregunta o un emoji con las personas de la sala.</p></div>}</div>
    {error && <p className="msala__error" role="alert">{error}</p>}<form className="msala__compositor" onSubmit={e => void enviar(e)}><div className="msala__escribir"><span className="msala-sr-only">Mensaje para la sala</span><input ref={input} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe al encuentro…" maxLength={1000} aria-label="Mensaje para la sala" /><EmojiButton value={texto} onChange={setTexto} inputRef={input} maxLength={1000} disabled={isSending} theme="dark" label="Añadir emoji al mensaje" /><button className="msala__enviar" type="submit" aria-label="Enviar mensaje" disabled={isSending || !texto.trim()}><Send size={18} /></button></div><small>Enter para enviar <span>{texto.length}/1000</span></small></form>
  </div>;
}


function Personas({ rol, modera, esperando, moderar }: { rol: string; modera: boolean; esperando: EnEspera[]; moderar: (uid: string, accion: AccionSala) => Promise<void> }) {
  const participantes = useParticipants();
  const [ocupado, setOcupado] = useState('');
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState('');
  const accion = async (uid: string, a: AccionSala) => {
    setOcupado(`${a}-${uid}`); setError('');
    try { await moderar(uid, a); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción.'); } finally { setOcupado(''); }
  };
  const ordenados = useMemo(() => [...participantes].sort((a, b) => Number(b.isLocal) - Number(a.isLocal)), [participantes]);
  return <div className="msala__personas"><label className="msala__buscar-personas"><Search size={16} /><input type="search" aria-label="Buscar participantes" placeholder="Buscar en la sala…" value={buscar} onChange={e => setBuscar(e.target.value)} /></label>
    {error && <p className="msala__error">{error}</p>}
    {modera && esperando.length > 0 && <section>
      <h3>Sala de espera <span>{esperando.length}</span></h3>
      {esperando.map(e => <div key={e.uid} className="msala__persona">
        <span className="msala__mini">{iniciales(e.nombre)}</span>
        <div><strong>{e.nombre}</strong><small>{ROL[e.rol] ?? e.rol}</small></div>
        <button type="button" className="msala__accion msala__accion--ok" disabled={!!ocupado} onClick={() => void accion(e.uid, 'admitir')}><UserCheck size={15} />Admitir</button>
        <button type="button" className="msala__icono" title="Rechazar" aria-label={`Rechazar a ${e.nombre}`} disabled={!!ocupado} onClick={() => void accion(e.uid, 'rechazar')}><X size={15} /></button>
      </div>)}
    </section>}
    <section>
      <h3>En la sala <span>{participantes.length}</span></h3>
      {ordenados.filter(p => (p.name || '').toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es'))).map(p => {
        const r = rolDe(p.metadata);
        const nombre = p.name || 'Participante';
        return <div key={p.identity} className="msala__persona">
          <span className={`msala__mini${p.isSpeaking ? ' is-hablando' : ''}`}>{iniciales(nombre)}</span>
          <div><strong>{nombre}{p.isLocal && ' (tú)'}</strong><small>{ROL[r] ?? 'Participante'}{p.isScreenShareEnabled ? ' · presentando' : ''}</small></div>
          {!p.isMicrophoneEnabled && <MicOff size={15} className="msala__tenue" aria-label="Micrófono apagado" />}
          {modera && !p.isLocal && rol !== 'asistente' && <>
            {p.isMicrophoneEnabled && <button type="button" className="msala__icono" title="Silenciar" aria-label={`Silenciar a ${nombre}`} disabled={!!ocupado} onClick={() => void accion(p.identity, 'silenciar')}><MicOff size={15} /></button>}
            <button type="button" className="msala__icono msala__icono--peligro" title="Expulsar y bloquear" aria-label={`Expulsar a ${nombre}`} disabled={!!ocupado} onClick={() => void accion(p.identity, 'expulsar')}><UserX size={15} /></button>
          </>}
        </div>;
      })}
    </section>
  </div>;
}
