// ─── El contenido de un evento de Luna (lo valida el bot) ────────────────────
// Misma forma que src/systems/eventos/motor/contenido.js del bot. El bot es el
// que valida de verdad: si algo no le gusta, responde con el campo y el motivo.

export type RarezaId = 'comun' | 'rara' | 'epica' | 'legendaria' | 'mitica';
export type Como = 'logro' | 'tienda' | 'cofre' | 'top';
export type TipoRegla = 'total' | 'atrapadas' | 'racha' | 'dias' | 'misiones' | 'compras' | 'dia' | 'rareza' | 'bestiario' | 'top';

export interface Rareza { id: RarezaId; nombre: string; color: string; peso: number; premio: [number, number]; cupos: number }
export interface Criatura { id: string; art: string; nombre: string; emoji: string; imagen: string | null; rareza: RarezaId; frase: string; corona?: boolean }
export interface Insignia {
  clave: string; nombre: string; emoji: string; imagen: string | null; rareza: RarezaId; como: Como; desc: string;
  precio?: number; regla?: { tipo: TipoRegla; valor?: number | string };
}
export interface Articulo { id: string; nombre: string; emoji: string; precio: number; tipo: 'monedas' | 'boost' | 'cofre'; desc: string; monedas?: number; boost?: 'xp' | 'moneda'; horas?: number }
export interface Mision { id: string; tipo: 'atrapar' | 'atrapar_rara' | 'accion' | 'mensajes' | 'gastar' | 'cofre'; nombre: string; emoji: string; desc: string; meta: number; premio: number }
export interface DiaBono { fecha: string; mult: number; nombre: string; emoji: string; masCriaturas: boolean }
export interface Contenido {
  tema: { escena: string; color: string; color2: string; fondo: string | null };
  moneda: { nombre: string; singular: string; emoji: string };
  textos: { titulo: string; lema: string; criatura: string; criaturas: string; atrapar: string; emojiAtrapar: string; escapo: string; tienda: string; bestiario: string; despedida: string };
  accion: {
    activa: boolean; sub: string; nombre: string; emoji: string; horas: number; desc: string;
    titulos: { bueno: string; grande: string; malo: string; criatura: string };
    grande: string; criatura: string; buenos: string[]; malos: string[];
  };
  rarezas: Rareza[];
  criaturas: Criatura[];
  insignias: Insignia[];
  articulos: Articulo[];
  misiones: Mision[];
  misionesPorDia: number;
  bonos: { finDeSemana: { activo: boolean; mult: number; nombre: string; emoji: string }; dias: DiaBono[] };
  apariciones: { minutos: number; mensajes: number; autores: number; segundos: number };
}

export interface TipoEvento {
  id: string; nombre: string; emoji: string; comando: string; descripcion: string; prefijo: string;
  fechas: { inicio: string; fin: string }; deFabrica: boolean; modificado: boolean; actualizadoEn: string | null;
  color: string; escena: string; moneda: { nombre: string; singular: string; emoji: string }; ediciones: number;
  contenido?: Contenido;
}

export const ESCENAS: { id: string; nombre: string }[] = [
  { id: 'halloween', nombre: '🎃 Noche de Halloween (luna, murciélagos, calabazas)' },
  { id: 'navidad', nombre: '🎄 Navidad (nieve, pinos con luces, regalos)' },
  { id: 'sanvalentin', nombre: '💘 San Valentín (atardecer rosa, corazones)' },
  { id: 'aniversario', nombre: '🎂 Fiesta (confeti y globos)' },
  { id: 'anionuevo', nombre: '🎆 Año Nuevo (fuegos artificiales y ciudad)' },
  { id: 'noche', nombre: '🌙 Noche estrellada (neutra)' },
];
export const RAREZAS: RarezaId[] = ['comun', 'rara', 'epica', 'legendaria', 'mitica'];
export const NOMBRE_RAREZA: Record<RarezaId, string> = { comun: 'Común', rara: 'Rara', epica: 'Épica', legendaria: 'Legendaria', mitica: 'Mítica' };
export const COMO: { id: Como; nombre: string }[] = [
  { id: 'logro', nombre: 'Logro (se gana sola)' }, { id: 'tienda', nombre: 'Se compra en la tienda' },
  { id: 'cofre', nombre: 'Secreta (sale en el cofre)' }, { id: 'top', nombre: 'Premio del ranking final' },
];
export const REGLAS: { id: TipoRegla; nombre: string; valor: 'numero' | 'fecha' | 'rareza' | null }[] = [
  { id: 'total', nombre: 'Gana N de la moneda en total', valor: 'numero' },
  { id: 'atrapadas', nombre: 'Atrapa N criaturas', valor: 'numero' },
  { id: 'racha', nombre: 'Hace la acción diaria N días seguidos', valor: 'numero' },
  { id: 'dias', nombre: 'Juega en N días distintos', valor: 'numero' },
  { id: 'misiones', nombre: 'Reclama N misiones', valor: 'numero' },
  { id: 'compras', nombre: 'Compra N veces en la tienda', valor: 'numero' },
  { id: 'dia', nombre: 'Juega un día concreto (MM-DD)', valor: 'fecha' },
  { id: 'rareza', nombre: 'Atrapa una de esa rareza o mejor', valor: 'rareza' },
  { id: 'bestiario', nombre: 'Completa el bestiario (sin la mítica)', valor: null },
];
export const TIPOS_MISION: { id: Mision['tipo']; nombre: string }[] = [
  { id: 'atrapar', nombre: 'Atrapar criaturas' }, { id: 'atrapar_rara', nombre: 'Atrapar raras o mejores' },
  { id: 'accion', nombre: 'Hacer la acción diaria' }, { id: 'mensajes', nombre: 'Enviar mensajes' },
  { id: 'gastar', nombre: 'Gastar en la tienda' }, { id: 'cofre', nombre: 'Abrir el cofre' },
];
export const TIPOS_ARTICULO: { id: Articulo['tipo']; nombre: string }[] = [
  { id: 'monedas', nombre: 'Monedas de la economía de Luna' }, { id: 'boost', nombre: 'Potenciador' }, { id: 'cofre', nombre: 'Cofre sorpresa' },
];
export const LIMITES = { criaturas: 30, insignias: 20, articulos: 8, tienda: 9, misiones: 12, bonosDias: 12, frases: 15 };
export const SUBCOMANDOS = ['inicio', 'perfil', 'tienda', 'misiones', 'insignias', 'bestiario', 'ranking', 'configurar'];

/** Un id a partir de un nombre: «Muñeco de nieve» → «muneco_de_nieve». */
export const aId = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'nuevo';

/** Un id que no esté usado en la lista. */
export function idLibre(base: string, usados: string[]) {
  let id = aId(base), n = 2;
  while (usados.includes(id)) id = `${aId(base).slice(0, 21)}_${n++}`;
  return id;
}
