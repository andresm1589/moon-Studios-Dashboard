/** Portable, all-day events. Export is local and never changes workspace tasks. */
export interface CalendarExportTask {
  id: string;
  title: string;
  description?: string;
  date: Date | string | number;
  status: string;
}

const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const localDay = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

/** Normalizes task dates without inventing a deadline for an undated task. */
export function calendarTaskDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    try {
      const date: unknown = value.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? new Date(date.getTime()) : null;
    } catch { return null; }
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  if (!parts) return null;
  const [, yearText, monthText, dayText] = parts;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const monthLengths = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthLengths[month - 1]) return null;
  if (text.length === 10) {
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

// RFC 5545 limits physical lines to 75 octets, including the continuation space.
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      pieces.push(current);
      current = ' ';
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  pieces.push(current);
  return pieces.join('\r\n');
}

export function createCalendarExport(tasks: CalendarExportTask[], exportedAt = new Date()): string {
  const stamp = exportedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const labels: Record<string, string> = { pending: 'Pendiente', 'in-progress': 'En progreso', completed: 'Completada' };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moon Studios//Agenda de equipo//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Moon Studios'];
  for (const task of tasks) {
    const date = calendarTaskDate(task.date);
    if (!date || date.getFullYear() < 1 || date.getFullYear() > 9999) continue;
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(task.id)}@moon-studios`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${localDay(date)}`, `DTEND;VALUE=DATE:${localDay(end)}`, `SUMMARY:${escapeText(task.title)}`, `DESCRIPTION:${escapeText([task.description, `Estado: ${labels[task.status] ?? task.status}`].filter(Boolean).join('\n\n'))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
