// Algunos equipos tienen como micrófono predeterminado un dispositivo que graba
// la SALIDA de audio («Mezcla estéreo», Voicemeeter, cables virtuales…): en la
// sala se oye lo que suena en la computadora y no la voz. Aquí se detectan.
// El mismo archivo vive en el dashboard y en la web (src/conferencias/microfonoReal.ts).

const CAPTA_LA_SALIDA = /mezcla est[eé]reo|stereo ?mix|what ?u ?hear|loopback|wave ?out|cable output|voicemeeter|vb-?audio|virtual cable|sonido del sistema|monitor of/i;

/** El dispositivo de entrada graba el sonido de la computadora, no un micrófono. */
export const captaLaSalida = (label: string) => CAPTA_LA_SALIDA.test(label);

/**
 * Si el micrófono activo capta la salida de audio, devuelve un micrófono real
 * al que cambiar (o null si no hay otro). `activoId` puede ser «default».
 */
export async function buscarMicrofonoReal(activoId: string | undefined): Promise<{ activo: MediaDeviceInfo; real: MediaDeviceInfo | null } | null> {
  const entradas = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId);
  const activo = entradas.find(d => d.deviceId === (activoId || 'default')) ?? entradas.find(d => d.deviceId === 'default');
  if (!activo || !captaLaSalida(activo.label)) return null;
  const real = entradas.find(d => d.deviceId !== 'default' && d.deviceId !== 'communications' && !captaLaSalida(d.label)) ?? null;
  return { activo, real };
}
