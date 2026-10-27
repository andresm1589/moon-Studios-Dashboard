import type { FestEvent, FestTicket } from '@/types/fest';

export const FEST_PUBLIC_URL = 'https://moon-studios-fest.netlify.app';
export const FEST_DATE_FORMAT = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function festDate(value: Date | null | undefined): string {
  return value && Number.isFinite(value.getTime()) ? FEST_DATE_FORMAT.format(value) : 'Por definir';
}

/** datetime-local is always edited in Lima, regardless of the operator's device. */
export function limaInput(value?: Date | null): string {
  return value && Number.isFinite(value.getTime()) ? new Date(value.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16) : '';
}

export function limaDate(value: string): Date {
  return new Date(value ? `${value}:00-05:00` : Number.NaN);
}

export function eventLabel(event: FestEvent, now = new Date()): string {
  if (event.cancelled) return 'Cancelado';
  if (event.publication === 'archived') return 'Archivado';
  if (event.publication === 'draft') return 'Borrador';
  if (now >= event.endsAt) return 'Finalizado';
  if (now >= event.startsAt) return 'En curso';
  if (now < event.registrationOpensAt) return 'Próximamente';
  if (now >= event.registrationClosesAt) return 'Inscripciones cerradas';
  if (event.capacity > 0 && event.registeredCount >= event.capacity) return 'Aforo completo';
  return 'Inscripciones abiertas';
}

export function ticketLabel(ticket: FestTicket): string {
  return ticket.state === 'checked-in' ? 'Ingresó' : ticket.state === 'cancelled' ? 'Cancelado' : 'Por ingresar';
}

/** Every cell is quoted; spreadsheet formulas are neutralized before escaping. */
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
}

export function ticketsCsv(tickets: FestTicket[]): string {
  const rows = [['Código', 'Nombre', 'Apellidos', 'Correo', 'Teléfono', 'Estado', 'Inscripción (Lima)', 'Ingreso (Lima)'], ...tickets.map(ticket => [ticket.code, ticket.firstName, ticket.lastName, ticket.email, ticket.phone, ticketLabel(ticket), festDate(ticket.createdAt), ticket.checkedInAt ? festDate(ticket.checkedInAt) : ''])];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(content: string, name: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
