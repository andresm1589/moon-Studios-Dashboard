// ─── Fechas y horas según la configuración del usuario ──────────────────────
// Zona horaria, formato de fecha (DD/MM, MM/DD o AAAA/MM/DD) e idioma salen de
// Configuración → Accesibilidad → Idioma y región. SettingsProvider llama a
// usarRegion() cada vez que cambian, así estas funciones sirven también fuera
// de React (utilidades, exportaciones).

export type FormatoFecha = 'dmy' | 'mdy' | 'ymd';
interface Region { zona: string; formato: FormatoFecha; idioma: string }

let region: Region = { zona: 'America/Lima', formato: 'dmy', idioma: 'es' };
const LOCALES: Record<string, string> = { es: 'es-PE', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR' };

export function usarRegion(r: Partial<Region>) {
  region = { ...region, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) } as Region;
}
export const regionActual = () => region;
export const localeActual = () => LOCALES[region.idioma] ?? region.idioma ?? 'es-PE';

const aFecha = (d: Date | number | string | { toDate: () => Date } | null | undefined): Date | null => {
  if (d === null || d === undefined) return null;
  if (typeof d === 'object' && 'toDate' in d) return d.toDate();
  const f = d instanceof Date ? d : new Date(d);
  return isNaN(f.getTime()) ? null : f;
};

function partes(f: Date, zona: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(f).map(x => [x.type, x.value]));
  return { a: p.year, m: p.month, d: p.day, h: p.hour === '24' ? '00' : p.hour, min: p.minute, s: p.second };
}

/** «12/10/2026» (o en el orden elegido). `corta`: año con dos cifras. */
export function fechaNumerica(d: Parameters<typeof aFecha>[0], corta = false): string {
  const f = aFecha(d);
  if (!f) return '—';
  const { a, m, d: dia } = partes(f, region.zona);
  const ano = corta ? a.slice(2) : a;
  return region.formato === 'mdy' ? `${m}/${dia}/${ano}` : region.formato === 'ymd' ? `${ano}/${m}/${dia}` : `${dia}/${m}/${ano}`;
}

/** «12/10» o «10/12» sin el año. */
export function diaMes(d: Parameters<typeof aFecha>[0]): string {
  const f = aFecha(d);
  if (!f) return '—';
  const { m, d: dia } = partes(f, region.zona);
  return region.formato === 'mdy' ? `${m}/${dia}` : region.formato === 'ymd' ? `${m}/${dia}` : `${dia}/${m}`;
}

/** «14:05» (o con segundos) en la zona horaria elegida. */
export function hora(d: Parameters<typeof aFecha>[0], conSegundos = false): string {
  const f = aFecha(d);
  if (!f) return '—';
  const { h, min, s } = partes(f, region.zona);
  return conSegundos ? `${h}:${min}:${s}` : `${h}:${min}`;
}

/** «12/10/2026 14:05». */
export const fechaHora = (d: Parameters<typeof aFecha>[0], conSegundos = false) => {
  const f = aFecha(d);
  return f ? `${fechaNumerica(f)} ${hora(f, conSegundos)}` : '—';
};

/** Fecha con palabras («12 oct 2026»), en el idioma y la zona elegidos. */
export function fechaLarga(d: Parameters<typeof aFecha>[0], opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  const f = aFecha(d);
  return f ? f.toLocaleDateString(localeActual(), { timeZone: region.zona, ...opciones }) : '—';
}
