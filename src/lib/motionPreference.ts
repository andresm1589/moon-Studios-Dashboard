import type { Settings } from './ajustes/modelo';

export function motionPreference(settings: Pick<Settings, 'animations' | 'reduceMotion' | 'screenReader'>, systemReduced: boolean | null = false) {
  const reasons: string[] = [];
  if (settings.animations === false) reasons.push('Animaciones desactivadas');
  if (settings.reduceMotion) reasons.push('Reducir movimiento activado');
  if (settings.screenReader) reasons.push('Modo lector de pantalla activado');
  if (systemReduced) reasons.push('El sistema solicita reducir el movimiento');
  return { enabled: reasons.length === 0, reasons };
}
