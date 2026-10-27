// Configuración → Notificaciones → «Avisos en este dispositivo».
// Muestra el estado real del permiso (antes el interruptor aparecía activado
// aunque el navegador nunca lo hubiera concedido), permite pedirlo con un clic,
// probar el aviso y, en la app de Windows, seguir activa en la bandeja.
import { useEffect, useState, type CSSProperties, type ElementType, type FC } from 'react';
import { BellRing, CheckCircle2, Loader2, MonitorSmartphone, Power, Send, ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { esEscritorio, notificarSistema, pedirPermisoNotificaciones } from '@/lib/escritorio';
import { activarPushWeb, probarPushWeb, pushWebActivo, pushWebSoportado } from '@/lib/pushWeb';
import { cambiarInicioConWindows, guardarSegundoPlano, inicioConWindows, seguirEnSegundoPlano } from '@/lib/segundoPlano';
import { playNotificationSound, type SoundType } from '@/lib/notificationSound';

type Permiso = 'granted' | 'denied' | 'default' | 'sin-soporte';
type RowLike = FC<{ label: string; desc: string; icon: ElementType; color: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean; bd: string }>;

const permisoActual = (): Permiso => (esEscritorio() ? 'granted' : typeof Notification === 'undefined' ? 'sin-soporte' : Notification.permission);

export function AvisosDispositivo({ Row, cardStyle, sectionTitle, bd, showMsg, sonido, volumen, alActivar }: {
  Row: RowLike; cardStyle: CSSProperties; sectionTitle: CSSProperties; bd: string;
  showMsg: (tipo: 'success' | 'error', texto: string) => void; sonido: SoundType; volumen: number; alActivar: () => void;
}) {
  const app = esEscritorio();
  const [permiso, setPermiso] = useState<Permiso>(permisoActual);
  const [push, setPush] = useState(pushWebActivo);
  const [ocupado, setOcupado] = useState<'' | 'permiso' | 'probar'>('');
  const [segundo, setSegundo] = useState(seguirEnSegundoPlano);
  const [inicio, setInicio] = useState(false);
  useEffect(() => { if (app) void inicioConWindows().then(setInicio); }, [app]);
  // Si se cambia el permiso desde el candado del navegador, se refleja al volver.
  useEffect(() => {
    const volver = () => { if (document.visibilityState === 'visible') { setPermiso(permisoActual()); setPush(pushWebActivo()); } };
    document.addEventListener('visibilitychange', volver);
    return () => document.removeEventListener('visibilitychange', volver);
  }, []);

  const permitir = async () => {
    setOcupado('permiso');
    try {
      const ok = await pedirPermisoNotificaciones();
      setPermiso(permisoActual());
      if (ok) {
        alActivar();
        if (auth.currentUser) setPush(await activarPushWeb(auth.currentUser));
        window.dispatchEvent(new Event('moon-permiso-notificaciones'));
        showMsg('success', 'Avisos activados en este navegador');
      } else showMsg('error', 'El navegador no dio permiso. Revisa el candado de la barra de direcciones → Notificaciones.');
    } finally { setOcupado(''); }
  };

  const probar = async () => {
    setOcupado('probar');
    try {
      if (!app && push && auth.currentUser) {
        const n = await probarPushWeb(auth.currentUser);
        showMsg('success', `Aviso de prueba enviado a ${n} dispositivo${n === 1 ? '' : 's'} de tu cuenta.`);
      } else {
        playNotificationSound(sonido, volumen);
        await notificarSistema('Prueba de moon Studios', 'Así se ven tus avisos en este dispositivo.');
        showMsg('success', 'Aviso de prueba mostrado');
      }
    } catch (e) { showMsg('error', e instanceof Error ? e.message : 'No se pudo enviar la prueba.'); }
    finally { setOcupado(''); }
  };

  const estado = app ? { ok: true, texto: 'Windows mostrará los avisos de moon Studios con su sonido.' }
    : permiso === 'granted' ? { ok: true, texto: push ? 'Recibes avisos aunque la pestaña esté cerrada.' : 'Recibes avisos mientras el panel está abierto.' }
    : permiso === 'denied' ? { ok: false, texto: 'Bloqueados en este navegador. Haz clic en el candado de la barra de direcciones → Notificaciones → Permitir, y vuelve aquí.' }
    : permiso === 'sin-soporte' ? { ok: false, texto: 'Este navegador no admite avisos del sistema.' }
    : { ok: false, texto: 'Todavía no diste permiso: sin él, el navegador no muestra ningún aviso.' };

  const boton: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, border: `1px solid ${bd}`, background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8571rem', cursor: 'pointer' };
  return <div className="aj-card" style={cardStyle}>
    <div style={sectionTitle}>Avisos en este dispositivo</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0 12px', borderBottom: `1px solid ${bd}` }}>
      {estado.ok ? <CheckCircle2 size={18} style={{ color: '#34d399', flex: 'none', marginTop: 1 }} /> : <ShieldAlert size={18} style={{ color: '#fbbf24', flex: 'none', marginTop: 1 }} />}
      <div style={{ flex: 1, fontSize: '0.8571rem', color: 'var(--text-secondary, var(--text-primary))', lineHeight: 1.55 }}>
        <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{app ? 'App de Windows' : estado.ok ? 'Navegador con permiso' : 'Avisos sin activar'}</strong>{estado.texto}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {!app && permiso === 'default' && pushWebSoportado() && <button type="button" style={{ ...boton, background: 'var(--accent-user, #6366f1)', color: '#fff', borderColor: 'transparent' }} disabled={!!ocupado} onClick={() => void permitir()}>
            {ocupado === 'permiso' ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}Permitir avisos</button>}
          {(app || permiso === 'granted') && <button type="button" style={boton} disabled={!!ocupado} onClick={() => void probar()}>
            {ocupado === 'probar' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Probar aviso</button>}
        </div>
      </div>
    </div>
    {app && <>
      <Row label="Seguir activa al cerrar la ventana" desc="Queda junto al reloj y te sigue avisando. Para salir del todo: clic derecho en el ícono → Salir por completo." icon={MonitorSmartphone} color="#60a5fa"
        checked={segundo} onChange={v => { guardarSegundoPlano(v); setSegundo(v); showMsg('success', v ? 'Al cerrar, moon Studios seguirá en la bandeja' : 'Al cerrar, la app se cerrará del todo'); }} bd={bd} />
      <Row label="Abrir al iniciar Windows" desc="Arranca oculta en la bandeja para que no te pierdas ningún aviso." icon={Power} color="#34d399"
        checked={inicio} onChange={async v => {
          try { setInicio(await cambiarInicioConWindows(v)); showMsg('success', v ? 'moon Studios se abrirá al iniciar Windows' : 'Ya no se abrirá al iniciar Windows'); }
          catch { showMsg('error', 'No se pudo cambiar el inicio con Windows.'); }
        }} last bd={bd} />
    </>}
  </div>;
}
