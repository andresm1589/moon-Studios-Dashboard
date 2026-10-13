import { Crown, Star, Gem, Rocket, Sprout, Landmark, Banknote } from 'lucide-react';

// ─── Niveles de socio capitalista ────────────────────────────────────────────
// Los mismos montos que usa el portal de clientes (moon-studios.netlify.app).
// Con íconos, nunca emojis: las solicitudes viejas guardaron «🚀 Socio Plata»
// en tierLabel y se limpian al mostrarlas.

export const NIVELES = [
  { id: 'fundador', nombre: 'Socio Fundador', desde: 10000, Icon: Crown },
  { id: 'platino',  nombre: 'Socio Platino',  desde: 5000,  Icon: Star },
  { id: 'oro',      nombre: 'Socio Oro',      desde: 2500,  Icon: Gem },
  { id: 'plata',    nombre: 'Socio Plata',    desde: 1000,  Icon: Rocket },
  { id: 'semilla',  nombre: 'Socio Semilla',  desde: 0,     Icon: Sprout },
] as const;

export type Nivel = typeof NIVELES[number];

export const nivelDe = (monto: number): Nivel => NIVELES.find(n => monto >= n.desde) ?? NIVELES[NIVELES.length - 1];

export const sinEmojis = (t?: string) => (t || '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').trim();

export const METODOS: Record<string, { nombre: string; Icon: typeof Landmark }> = {
  transferencia: { nombre: 'Transferencia', Icon: Landmark },
  efectivo:      { nombre: 'Efectivo',      Icon: Banknote },
};
export const metodoDe = (m: string) => METODOS[m] ?? { nombre: m || '—', Icon: Banknote };

export const dolares = (n: number) => `$${(Number(n) || 0).toLocaleString('es-PE')}`;
