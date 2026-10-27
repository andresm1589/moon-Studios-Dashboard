// Mensajes de los fallos de micrófono o cámara de la sala (ver Dispositivos.tsx).
import { MediaDeviceFailure } from 'livekit-client';

/** Mensaje claro para un fallo de micrófono o cámara. */
export function mensajeDispositivo(failure?: MediaDeviceFailure, kind?: MediaDeviceKind, error?: unknown): string {
  const que = kind === 'videoinput' ? 'la cámara' : 'el micrófono';
  // El nombre técnico (NotReadableError, NotAllowedError…) ayuda a diagnosticar.
  const tecnico = error instanceof Error && error.name ? ` (${error.name})` : '';
  return texto(failure, que) + tecnico;
}

function texto(failure: MediaDeviceFailure | undefined, que: string): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return `El navegador bloqueó ${que}. Permítelo con el candado de la barra de direcciones (en la app de Windows: Configuración → Privacidad → Micrófono/Cámara) y vuelve a activarlo.`;
    case MediaDeviceFailure.NotFound:
      return `No encontramos ${que}. Conéctalo y elígelo en «Audio y video».`;
    case MediaDeviceFailure.DeviceInUse:
      return `Windows no pudo abrir ${que}: otra aplicación lo está usando (Zoom, Discord, OBS, otra pestaña) o se desconectó. Ciérrala o elige otro en «Audio y video» y vuelve a activarlo.`;
    default:
      return `No se pudo usar ${que}. Elige otro dispositivo en «Audio y video».`;
  }
}
