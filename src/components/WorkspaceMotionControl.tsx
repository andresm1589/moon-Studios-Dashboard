import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Orbit, Pause, Play, RotateCcw } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { motionPreference } from '@/lib/motionPreference';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './workspace-motion-control.css';

/** Reports the effective state, including settings that override the main switch. */
export function WorkspaceMotionControl({ panel = false }: { panel?: boolean }) {
  const [open, setOpen] = useState(false);
  const { settings, updateSettings, estado } = useSettings();
  const systemReduced = useReducedMotion();
  const { enabled, reasons } = motionPreference(settings, systemReduced);
  const controls = <div className="moon-motion-controls">
    <p className="moon-motion-controls-status"><span className={enabled ? 'is-active' : ''} />{enabled ? 'Animaciones activas' : 'Movimiento reducido'}</p>
    <p className="moon-motion-controls-copy">{enabled ? 'Entradas de tarjetas, cambios de sección, indicadores y órbitas del inicio.' : reasons.join('. ') + '.'}</p>
    {!enabled && <p className="moon-motion-controls-copy">Activar las animaciones completas desactiva «Reducir movimiento» y «Modo lector de pantalla». Se mantiene la preferencia de movimiento del sistema.</p>}
    <div className="moon-motion-controls-actions">
      {enabled ? <>
        <button type="button" onClick={() => { window.dispatchEvent(new Event('moon:replay-motion')); setOpen(false); }}><RotateCcw size={15} /> Repetir animación de entrada</button>
        <button type="button" onClick={() => void updateSettings({ animations: false })}><Pause size={15} /> Pausar animaciones</button>
      </> : <button type="button" className="is-primary" onClick={() => void updateSettings({ animations: true, reduceMotion: false, screenReader: false })}><Play size={15} /> Activar animaciones completas</button>}
    </div>
    {systemReduced && <p className="moon-motion-controls-copy">Para ver el movimiento completo, activa también las animaciones en la configuración de accesibilidad de tu sistema.</p>}
    <small role="status">{estado === 'guardando' ? 'Guardando preferencia…' : estado === 'error' ? 'Pendiente de sincronizar. Tu preferencia se conserva en este dispositivo.' : 'Preferencia guardada'}</small>
  </div>;
  if (panel) return <section className="moon-motion-controls-panel" aria-label="Estado del movimiento del dashboard">{controls}</section>;
  return <>
    <button type="button" className={`moon-shell-icon-button moon-motion-control-trigger${enabled ? ' is-running' : ''}`} onClick={() => setOpen(true)} aria-label={`Movimiento: ${enabled ? 'animaciones activas' : 'animaciones desactivadas'}`} title={enabled ? 'Animaciones activas' : reasons.join('. ')}><Orbit size={18} /><span /></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="moon-motion-controls-dialog"><DialogTitle>Movimiento del dashboard</DialogTitle><DialogDescription>Comprueba qué está activando o deteniendo las animaciones de tu espacio.</DialogDescription>{controls}</DialogContent></Dialog>
  </>;
}
