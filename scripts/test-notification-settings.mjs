import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Real pure notification settings, synthetic clock and permission adapters.
// Does not request an OS/browser permission or touch Firebase/network.
const source = await readFile(new URL('../src/lib/ajustes/notificaciones.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { estaEnHorasDeSilencio: quiet, crearSolicitudPermiso } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const urlModule = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const sourceModule = async relative => ts.transpileModule(await readFile(new URL(relative, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const regionUrl = urlModule(await sourceModule('../src/lib/ajustes/fecha.ts'));
const { usarRegion } = await import(regionUrl);
let desktopCode = await sourceModule('../src/lib/escritorio.ts');
for (const [name, replacement] of Object.entries({ '@tauri-apps/api/core': urlModule('export const isTauri=()=>false;'), '@/lib/ajustes/fecha': regionUrl, '@/lib/ajustes/notificaciones': urlModule(compiled) })) desktopCode = desktopCode.replaceAll(`from '${name}'`, `from '${replacement}'`);
const desktop = await import(urlModule(desktopCode));
let count = 0;
const test = async (name, run) => { try { await run(); count++; } catch (error) { console.error(`FAIL: ${name}`); throw error; } };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

await test('configured time zone changes quiet-hours result for the same instant', () => {
  const instant = new Date('2026-10-15T04:30:00Z');
  assert.equal(quiet('22:00', '08:00', instant, 'America/Lima'), true); // 23:30
  assert.equal(quiet('22:00', '08:00', instant, 'Asia/Tokyo'), false); // 13:30
});
await test('overnight start inclusive and end exclusive in Lima', () => {
  assert.equal(quiet('22:00', '08:00', new Date('2026-10-15T02:59:00Z'), 'America/Lima'), false);
  assert.equal(quiet('22:00', '08:00', new Date('2026-10-15T03:00:00Z'), 'America/Lima'), true);
  assert.equal(quiet('22:00', '08:00', new Date('2026-10-15T12:59:00Z'), 'America/Lima'), true);
  assert.equal(quiet('22:00', '08:00', new Date('2026-10-15T13:00:00Z'), 'America/Lima'), false);
});
await test('same-day windows, midnight and empty windows', () => {
  assert.equal(quiet('09:00', '12:00', new Date('2026-10-15T14:00:00Z'), 'America/Lima'), true);
  assert.equal(quiet('09:00', '12:00', new Date('2026-10-15T17:00:00Z'), 'America/Lima'), false);
  assert.equal(quiet('00:00', '01:00', new Date('2026-10-15T05:00:00Z'), 'America/Lima'), true);
  assert.equal(quiet('00:00', '00:00', new Date('2026-10-15T05:00:00Z'), 'America/Lima'), false);
});
await test('invalid imported hours, dates and zones do not suppress notifications', () => {
  assert.equal(quiet('25:00', '08:00', new Date(), 'America/Lima'), false);
  assert.equal(quiet(undefined, '08:00', new Date(), 'America/Lima'), false);
  assert.equal(quiet('22:00', '08:00', new Date('invalid'), 'America/Lima'), false);
  assert.equal(quiet('22:00', '08:00', new Date(), 'invalid/timezone'), false);
});
await test('fractional time-zone offsets use configured local minutes', () => {
  assert.equal(quiet('09:00', '10:00', new Date('2026-10-15T03:30:00Z'), 'Asia/Kolkata'), true); // 09:00
  assert.equal(quiet('09:00', '10:00', new Date('2026-10-15T04:30:00Z'), 'Asia/Kolkata'), false); // 10:00
});
await test('DST transition uses IANA local time rather than a fixed offset', () => {
  assert.equal(quiet('01:00', '02:00', new Date('2026-11-01T05:30:00Z'), 'America/New_York'), true);
  assert.equal(quiet('01:00', '02:00', new Date('2026-11-01T06:30:00Z'), 'America/New_York'), true);
});
await test('simultaneous callers share one in-flight permission request', async () => {
  const work = deferred(); let calls = 0;
  const request = crearSolicitudPermiso(() => { calls++; return work.promise; });
  const a = request(), b = request();
  assert.equal(calls, 1); assert.equal(a, b); work.resolve(true);
  assert.equal(await a, true); assert.equal(await b, true);
});
await test('denied permission is rechecked after user changes the OS setting', async () => {
  let granted = false, calls = 0;
  const request = crearSolicitudPermiso(() => { calls++; return granted; });
  assert.equal(await request(), false); granted = true;
  assert.equal(await request(), true); assert.equal(calls, 2);
  granted = false; assert.equal(await request(), false); assert.equal(calls, 3);
});
await test('rejected permission request does not poison the next attempt', async () => {
  let calls = 0;
  const request = crearSolicitudPermiso(() => ++calls === 1 ? Promise.reject(new Error('OS unavailable')) : Promise.resolve(true));
  assert.equal(await request(), false); assert.equal(await request(), true); assert.equal(calls, 2);
});
await test('synchronous platform failure is recoverable and call preserves user gesture', async () => {
  let calls = 0;
  const request = crearSolicitudPermiso(() => { if (++calls === 1) throw new Error('unsupported'); return true; });
  const first = request(); assert.equal(calls, 1, 'permission adapter executes synchronously');
  assert.equal(await first, false); assert.equal(await request(), true);
});
await test('actual desktop/web wrapper reads the selected region', () => {
  const now = new Date('2026-10-15T04:30:00Z');
  usarRegion({ zona: 'America/Lima' }); assert.equal(desktop.enHorasDeSilencio('22:00', '08:00', now), true);
  usarRegion({ zona: 'Asia/Tokyo' }); assert.equal(desktop.enHorasDeSilencio('22:00', '08:00', now), false);
});
await test('actual browser permission wrapper rechecks denied, granted and changed permissions', async () => {
  let prompts = 0;
  globalThis.Notification = { permission: 'denied', requestPermission: async () => { prompts++; return 'granted'; } };
  assert.equal(await desktop.pedirPermisoNotificaciones(), false); assert.equal(prompts, 0);
  globalThis.Notification.permission = 'granted'; assert.equal(await desktop.pedirPermisoNotificaciones(), true);
  globalThis.Notification.permission = 'default'; assert.equal(await desktop.pedirPermisoNotificaciones(), true); assert.equal(prompts, 1);
  delete globalThis.Notification;
});
console.log(`Notification settings: ${count} scenarios passed (time zones, boundaries, DST and in-flight permission deduplication).`);
