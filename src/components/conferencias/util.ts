import { fechaHora, fechaLarga, hora } from '@/lib/ajustes/fecha';
import type { EventoConf } from '@/lib/conferencias/tipos';

export const mensajeError = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo completar la operación.');

export const normalizarBusqueda = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
export const zonaFormulario = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora del dispositivo';

export function validarFechas(inicio: string, fin: string) {
  const a = new Date(inicio), b = new Date(fin);
  if (!inicio || !fin || !Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 'Indica una fecha y hora válidas para el inicio y el final.';
  return b <= a ? 'El evento debe terminar después de comenzar.' : '';
}

/** Intercambio local con el calendario del usuario; no crea registros ni envía invitaciones. */
export function descargarCalendario(evento: EventoConf) {
  const escapar = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const fecha = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const contenido = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moon Studios//Conferencias//ES', 'BEGIN:VEVENT',
    `UID:${escapar(evento.id)}@moon-studios`, `DTSTAMP:${fecha(new Date())}`, `DTSTART:${fecha(evento.inicio)}`, `DTEND:${fecha(evento.fin)}`,
    `SUMMARY:${escapar(evento.titulo)}`, `DESCRIPTION:${escapar(evento.instrucciones || evento.descripcion)}`, `LOCATION:${escapar(evento.lugar || 'Sala virtual de Moon Studios')}`,
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/calendar;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: `moon-${evento.id}.ics` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `<input type="datetime-local">` conserva la hora local del dispositivo. */
export function aInputLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const deInputLocal = (v: string) => new Date(v).toISOString();

export type Momento = 'proximo' | 'abierto' | 'en-curso' | 'terminado';
/** Situación temporal de un evento programado. */
export function momento(e: EventoConf, ahora = new Date()): Momento {
  if (ahora > e.fin) return 'terminado';
  if (ahora >= e.inicio) return 'en-curso';
  if (ahora >= new Date(e.inicio.getTime() - e.aperturaMinutos * 60000)) return 'abierto';
  return 'proximo';
}
export const MOMENTOS: Record<Momento, string> = { proximo: 'Próximo', abierto: 'Acceso abierto', 'en-curso': 'En curso', terminado: 'Terminado' };

export const rangoEvento = (e: EventoConf) =>
  e.inicio.toDateString() === e.fin.toDateString() ? `${fechaHora(e.inicio)} – ${hora(e.fin)}` : `${fechaHora(e.inicio)} – ${fechaHora(e.fin)}`;
export const diaEvento = (e: EventoConf) => ({ dia: e.inicio.getDate(), mes: fechaLarga(e.inicio, { month: 'short' }).replace('.', '') });

export async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

/** CSV sin fórmulas inyectables (Excel ejecuta celdas que empiezan con = + - @). */
export function descargarCsv(nombre: string, columnas: string[], filas: (string | number)[][]) {
  const celda = (v: string | number) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [columnas, ...filas].map(f => f.map(celda).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
