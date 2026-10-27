// La sala activa vive por encima de las páginas (SalaActivaProvider): la llamada
// no se corta al navegar por el dashboard. Las páginas solo dicen «entrar» y
// marcan con <HuecoSala /> dónde se ve la sala completa.
import { createContext, useContext } from 'react';
import type { EventoConf } from '@/lib/conferencias/tipos';

export interface SalaActiva { evento: EventoConf; puedeModerar: boolean; volverA: string }

export interface ContextoSala {
  activa: SalaActiva | null;
  /** La sala completa se muestra en su página; si no, queda la ventanita. */
  expandida: boolean;
  entrar: (evento: EventoConf, puedeModerar: boolean) => void;
  minimizar: () => void;
  expandir: () => void;
  registrarHueco: (el: HTMLElement | null) => void;
}

export const SalaActivaContext = createContext<ContextoSala>({
  activa: null, expandida: false, entrar: () => {}, minimizar: () => {}, expandir: () => {}, registrarHueco: () => {},
});

export const useSalaActiva = () => useContext(SalaActivaContext);
