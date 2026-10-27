import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Match the company's timezone: ISO date-only strings must not move to yesterday.
process.env.TZ = 'America/Lima';

const source = await readFile(new URL('../src/lib/calendarExport.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { calendarTaskDate, createCalendarExport } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const output = createCalendarExport([
  { id: 'leap,day\nBEGIN:VEVENT', title: 'Entrega; diseño, versión \\ final', description: 'Primera línea\r\nSegunda línea', date: new Date(2028, 1, 29, 23, 30), status: 'in-progress' },
  { id: 'year-end', title: '🌙 Revisión con el equipo '.repeat(12), date: new Date(2026, 11, 31, 0, 5), status: 'completed' },
  { id: 'bad-date', title: 'Fecha inválida', date: 'not-a-date', status: 'pending' },
], new Date('2026-10-15T12:34:56.789Z'));
const unfolded = output.replace(/\r\n /g, '');
assert.ok(output.endsWith('END:VCALENDAR\r\n'));
assert.equal((unfolded.match(/^BEGIN:VEVENT$/gm) ?? []).length, 2);
assert.ok(unfolded.includes('DTSTAMP:20261015T123456Z'));
assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301'));
assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101'));
assert.ok(unfolded.includes('SUMMARY:Entrega\\; diseño\\, versión \\\\ final'));
assert.ok(unfolded.includes('DESCRIPTION:Primera línea\\nSegunda línea\\n\\nEstado: En progreso'));
assert.ok(unfolded.includes('Estado: Completada'));
assert.ok(unfolded.includes('UID:leap%2Cday%0ABEGIN%3AVEVENT@moon-studios'));
assert.ok(!output.includes('Fecha inválida'));
assert.ok(output.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
assert.ok(unfolded.includes('🌙 Revisión con el equipo '.repeat(12)));
assert.equal((createCalendarExport([], new Date('2026-10-15T12:00:00Z')).match(/^BEGIN:VEVENT$/gm) ?? []).length, 0);
const dateOnly = createCalendarExport([
  { id: 'local', title: 'Fecha sin hora', date: '2026-10-15', status: 'pending' },
  { id: 'leap', title: 'Bisiesto válido', date: '2028-02-29', status: 'pending' },
  { id: 'bad-february', title: 'Imposible febrero', date: '2026-02-30', status: 'pending' },
  { id: 'bad-leap', title: 'Bisiesto imposible', date: '2027-02-29', status: 'pending' },
]);
assert.ok(dateOnly.includes('DTSTART;VALUE=DATE:20261015\r\nDTEND;VALUE=DATE:20261016'));
assert.ok(dateOnly.includes('DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301'));
assert.ok(!dateOnly.includes('Imposible febrero'));
assert.ok(!dateOnly.includes('Bisiesto imposible'));
const sourceDate = new Date('2026-10-15T14:30:00Z');
assert.equal(calendarTaskDate(sourceDate)?.getTime(), sourceDate.getTime());
assert.notEqual(calendarTaskDate(sourceDate), sourceDate);
assert.equal(calendarTaskDate({ date: sourceDate, toDate() { return this.date; } })?.getTime(), sourceDate.getTime());
assert.deepEqual([calendarTaskDate('2026-10-15')?.getFullYear(), calendarTaskDate('2026-10-15')?.getMonth(), calendarTaskDate('2026-10-15')?.getDate()], [2026, 9, 15]);
assert.equal(calendarTaskDate('2026-10-15T09:30:00-05:00')?.toISOString(), '2026-10-15T14:30:00.000Z');
assert.equal(calendarTaskDate(0)?.getTime(), 0);
assert.equal(calendarTaskDate({ toDate() { throw new Error('broken timestamp'); } }), null);
assert.equal(calendarTaskDate({ toDate() { return '2026-10-15'; } }), null);
for (const invalid of [null, undefined, '', false, {}, NaN, Infinity, new Date('invalid'), '2026-02-30T00:00:00Z', 'not-a-date', '10/15/2026']) assert.equal(calendarTaskDate(invalid), null);
console.log('Calendar dates/export: 36 checks passed (Date/Timestamp/ISO/numeric normalization, undated tasks, America/Lima, date-only, invalid dates, leap/year boundaries, escaped injection and UTF-8 folding).');
