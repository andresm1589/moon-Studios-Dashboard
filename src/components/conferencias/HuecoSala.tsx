import { ArrowLeft } from 'lucide-react';
import { useSalaActiva } from './salaActiva';

/** Lugar de la sala completa en la página: la sala (siempre conectada) se dibuja encima. */
export function HuecoSala() {
  const { activa, registrarHueco, minimizar } = useSalaActiva();
  return <div className="cf">
    <button type="button" className="cf-volver" onClick={minimizar} title="La llamada sigue en una ventanita mientras usas el resto">
      <ArrowLeft />Volver a Conferencias · la llamada sigue
    </button>
    {activa && <div ref={registrarHueco} className="msala-hueco" aria-label={`Sala: ${activa.evento.titulo}`} />}
  </div>;
}
