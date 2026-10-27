import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Executes the real pure validators and sync queue. Synthetic adapters only:
// no Firebase, credentials, account creation, network or production writes.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function compile(path, imports = {}) {
  let code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, target] of Object.entries(imports)) code = code.replaceAll(`from '${name}'`, `from '${target}'`).replaceAll(`from "${name}"`, `from '${target}'`);
  return moduleUrl(code);
}
const modelUrl = await compile('../src/lib/ajustes/modelo.ts');
const { defaultSettings, limpiarCambios, normalizarAjustes, leerCacheAjustes, claveCacheAjustes } = await import(modelUrl);
const { SincronizadorAjustes } = await import(await compile('../src/lib/ajustes/sincronizar.ts', { './modelo': modelUrl }));
const accentUrl = await compile('../src/lib/ajustes/acento.ts');
const { coloresAcento, contrasteColores } = await import(accentUrl);
let count = 0;
const test = async (name, run) => { try { await run(); count++; } catch (error) { console.error(`FAIL: ${name}`); throw error; } };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness({ uid = 'qa-a', write = async () => {}, cache = { settings: { ...defaultSettings }, pending: {} }, online = () => true, debounceMs = 1_000_000, retryMs = 1_000_000 } = {}) {
  const views = [], persisted = [], writes = [], errors = [];
  const sync = new SincronizadorAjustes({ uid, cache, online, debounceMs, retryMs,
    write: async (owner, patch) => { writes.push({ uid: owner, patch: { ...patch } }); await write(owner, patch); },
    persist: (owner, value) => persisted.push({ uid: owner, value: structuredClone(value) }),
    changed: value => views.push(structuredClone(value)), failed: error => errors.push(error),
  });
  return { sync, views, persisted, writes, errors, last: () => views.at(-1), cache: () => persisted.at(-1)?.value };
}

await test('all defaults survive validation', () => assert.deepEqual(normalizarAjustes(defaultSettings), defaultSettings));
await test('malformed imports cannot write unknown fields, types or enum values', () => {
  assert.deepEqual(limpiarCambios({ theme: 'sepia', timezone: 'invalid/timezone', language: 'xx', animations: 'false', notificationSound: 'alarm', fontSize: 'huge', dateFormat: 'raw', role: 'CEO', fontFamily: "url('https://invalid')", accentColor: 'red', quietFrom: '25:10', quietTo: '9:00', notificationVolume: NaN }), {});
});
await test('volume is finite and bounded, including zero', () => {
  assert.equal(limpiarCambios({ notificationVolume: -7 }).notificationVolume, 0);
  assert.equal(limpiarCambios({ notificationVolume: 9 }).notificationVolume, 1);
  assert.equal(limpiarCambios({ notificationVolume: 0 }).notificationVolume, 0);
  assert.deepEqual(limpiarCambios({ notificationVolume: Infinity }), {});
});
await test('time, locale and font compatibility are normalized', () => assert.deepEqual(limpiarCambios({ quietFrom: '00:00', quietTo: '23:59', language: 'fr', timezone: 'Europe/Paris', fontFamily: 'Satoshi' }), { quietFrom: '00:00', quietTo: '23:59', language: 'fr', timezone: 'Europe/Paris', fontFamily: 'Nunito' }));
await test('cache is isolated per user and guest; old global cache is never inherited', () => {
  const items = new Map([
    ['ajustes-cache', JSON.stringify({ theme: 'light' })],
    [claveCacheAjustes('qa-a'), JSON.stringify({ settings: { theme: 'light' }, pending: { animations: false } })],
  ]);
  const storage = { getItem: key => items.get(key) ?? null };
  assert.equal(leerCacheAjustes(storage, 'qa-a').settings.theme, 'light');
  assert.equal(leerCacheAjustes(storage, 'qa-b').settings.theme, 'dark');
  assert.equal(leerCacheAjustes(storage, null).settings.theme, 'dark');
  assert.deepEqual(leerCacheAjustes(storage, 'qa-a').pending, { animations: false });
  assert.notEqual(claveCacheAjustes('guest'), claveCacheAjustes(null));
});
await test('corrupt or inaccessible cache falls back safely', () => {
  assert.deepEqual(leerCacheAjustes({ getItem: () => '{broken' }, 'qa-a'), { settings: defaultSettings, pending: {} });
  assert.deepEqual(leerCacheAjustes({ getItem: () => { throw new Error('blocked'); } }, 'qa-a'), { settings: defaultSettings, pending: {} });
});
await test('edits before profile arrives wait without being lost', async () => {
  const h = harness(); h.sync.update({ theme: 'light' }); await h.sync.flush();
  assert.equal(h.writes.length, 0); assert.equal(h.last().settings.theme, 'light');
  h.sync.receive({ theme: 'dark', fontSize: 'lg' }); await h.sync.flush();
  assert.deepEqual(h.writes, [{ uid: 'qa-a', patch: { theme: 'light' } }]);
  assert.equal(h.last().settings.fontSize, 'lg'); assert.equal(h.last().estado, 'guardado'); h.sync.dispose();
});
await test('cache-only snapshot is not labelled as cloud synchronized', () => {
  const h = harness(); h.sync.receive({ theme: 'light' }, true); assert.equal(h.last().sincronizado, false);
  h.sync.receive({ theme: 'light' }, false); assert.equal(h.last().sincronizado, true); h.sync.dispose();
});
await test('rapid edits coalesce and only touched settings are written', async () => {
  const h = harness(); h.sync.receive(defaultSettings);
  h.sync.update({ theme: 'light' }); h.sync.update({ theme: 'dark', fontSize: 'xl' }); await h.sync.flush();
  assert.deepEqual(h.writes, [{ uid: 'qa-a', patch: { theme: 'dark', fontSize: 'xl' } }]); h.sync.dispose();
});
await test('snapshots do not roll back an in-flight edit; newer edits serialize', async () => {
  const first = deferred(); let calls = 0;
  const h = harness({ write: () => ++calls === 1 ? first.promise : Promise.resolve() });
  h.sync.receive(defaultSettings); h.sync.update({ theme: 'light' }); const saving = h.sync.flush();
  h.sync.receive({ ...defaultSettings, theme: 'dark' }); assert.equal(h.last().settings.theme, 'light');
  h.sync.update({ theme: 'dark', animations: false });
  assert.equal(h.writes.length, 1); first.resolve(); await saving;
  assert.deepEqual(h.writes.map(w => w.patch), [{ theme: 'light' }, { theme: 'dark', animations: false }]);
  assert.equal(h.last().settings.theme, 'dark'); assert.equal(h.last().estado, 'guardado'); assert.deepEqual(h.cache().pending, {}); h.sync.dispose();
});
await test('failure retains the newest value and a manual retry saves it', async () => {
  const first = deferred(); let calls = 0;
  const h = harness({ write: () => ++calls === 1 ? first.promise : Promise.resolve() });
  h.sync.receive(defaultSettings); h.sync.update({ theme: 'light', fontSize: 'sm' }); const saving = h.sync.flush();
  h.sync.update({ theme: 'dark', fontSize: 'xl' }); first.reject(new Error('offline')); await saving;
  assert.equal(h.last().estado, 'error'); assert.deepEqual(h.cache().pending, { theme: 'dark', fontSize: 'xl' });
  await h.sync.flush(); assert.equal(h.last().estado, 'guardado'); assert.deepEqual(h.writes[1].patch, { theme: 'dark', fontSize: 'xl' }); h.sync.dispose();
});
await test('disconnected edits persist and recover when retried online', async () => {
  let online = false; const h = harness({ online: () => online });
  h.sync.receive(defaultSettings); h.sync.update({ notifications: false }); await h.sync.flush();
  assert.equal(h.writes.length, 0); assert.equal(h.last().estado, 'error'); assert.equal(h.cache().pending.notifications, false);
  online = true; await h.sync.flush(); assert.equal(h.writes.length, 1); assert.equal(h.last().estado, 'guardado'); h.sync.dispose();
});
await test('disposing user A cannot write, retry or emit into user B', async () => {
  const work = deferred(); const a = harness({ uid: 'qa-a', write: () => work.promise });
  a.sync.receive(defaultSettings); a.sync.update({ accentColor: '#000000' }); const old = a.sync.flush(); a.sync.dispose();
  const emitted = a.views.length, stored = a.persisted.length;
  const b = harness({ uid: 'qa-b' }); b.sync.receive(defaultSettings); b.sync.update({ theme: 'light' }); await b.sync.flush();
  work.reject(new Error('late account A failure')); await old;
  assert.equal(a.views.length, emitted); assert.equal(a.persisted.length, stored);
  assert.equal(b.last().settings.accentColor, defaultSettings.accentColor); assert.equal(b.last().settings.theme, 'light');
  assert.ok(a.writes.every(w => w.uid === 'qa-a')); assert.ok(b.writes.every(w => w.uid === 'qa-b')); b.sync.dispose();
});
await test('pending changes survive closing the app and reopening the same account', async () => {
  const a = harness(); a.sync.receive(defaultSettings); a.sync.update({ reduceMotion: true }); const savedCache = a.cache(); a.sync.dispose();
  const reopened = harness({ cache: savedCache }); reopened.sync.receive(defaultSettings); await reopened.sync.flush();
  assert.deepEqual(reopened.writes[0].patch, { reduceMotion: true }); assert.equal(reopened.last().settings.reduceMotion, true); reopened.sync.dispose();
});
await test('permission errors stay visible without an immediate retry loop', async () => {
  const h = harness({ write: async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); } });
  h.sync.receive(defaultSettings); h.sync.update({ theme: 'light' }); await h.sync.flush();
  assert.equal(h.writes.length, 1); assert.equal(h.last().estado, 'error'); assert.equal(h.cache().pending.theme, 'light'); h.sync.dispose();
});
await test('invalid runtime updates never reach persistence', async () => {
  const h = harness(); h.sync.receive(defaultSettings); h.sync.update({ role: 'CEO', theme: 'invalid', notificationVolume: NaN }); await h.sync.flush();
  assert.equal(h.writes.length, 0); h.sync.dispose();
});
await test('edits after a failed profile read retain the error and retry affordance', async () => {
  const h = harness(); h.sync.receiveError(new Error('profile read unavailable'));
  h.sync.update({ theme: 'light' }); await h.sync.flush();
  assert.equal(h.last().estado, 'error'); assert.equal(h.last().sincronizado, false);
  assert.equal(h.cache().pending.theme, 'light'); assert.equal(h.writes.length, 0);
  h.sync.receive(defaultSettings); await h.sync.flush();
  assert.equal(h.last().estado, 'guardado'); assert.equal(h.writes[0].patch.theme, 'light'); h.sync.dispose();
});
await test('accent text and text on fills retain contrast for every offered accent and extremes', () => {
  for (const color of ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#ffffff', '#000000', '#777777']) {
    for (const dark of [true, false]) {
      const { ink, on } = coloresAcento(color, dark);
      for (const bg of dark ? ['#0c0d0e', '#1d1f21'] : ['#ffffff', '#f3f3f0']) assert.ok(contrasteColores(ink, bg) >= 4.5, `${color}, ${ink}, ${bg}`);
      assert.ok(contrasteColores(color, on) >= 4.5, `${color}, ${on}`);
    }
  }
});

await test('visual settings apply and restore actual root classes and CSS variables', async () => {
  const css = new Map(), classes = new Set(), links = new Map();
  let osDark = false;
  const root = { style: { setProperty: (key, value) => css.set(key, value) }, dataset: {}, classList: { toggle: (key, enabled) => enabled ? classes.add(key) : classes.delete(key) }, removeAttribute: () => {} };
  globalThis.document = { documentElement: root, getElementById: id => links.get(id), createElement: () => ({}), head: { appendChild: el => links.set(el.id, el) } };
  globalThis.window = { matchMedia: () => ({ matches: osDark }) };
  const { aplicarAjustes, esOscuro } = await import(await compile('../src/lib/ajustes/aplicar.ts', { './acento': accentUrl }));
  aplicarAjustes({ ...defaultSettings, theme: 'system', fontSize: 'xl', fontFamily: 'Inter', compactMode: true, accentColor: '#ffffff', animations: false, blurEffects: false, highContrast: true, screenReader: true, focusIndicator: false, language: 'en' });
  assert.ok(classes.has('light')); assert.equal(esOscuro({ theme: 'system' }), false);
  assert.equal(root.style.fontSize, '17px'); assert.equal(css.get('--fuente-usuario'), "'Inter'");
  for (const c of ['ajustes-compacto', 'ajustes-sin-movimiento', 'ajustes-sin-desenfoque', 'ajustes-contraste', 'ajustes-lector']) assert.ok(classes.has(c));
  assert.equal(classes.has('ajustes-sin-foco'), false, 'screen-reader mode always retains focus');
  assert.equal(root.lang, 'es'); assert.equal(root.dataset.locale, 'en');
  assert.equal(css.has('--accent'), false, 'shadcn HSL accent must not receive a hex value');
  assert.ok(links.has('gf-inter')); assert.match(links.get('gf-inter').href, /500;600;700/);
  osDark = true; aplicarAjustes({ ...defaultSettings, theme: 'system' });
  assert.ok(classes.has('dark')); assert.equal(classes.has('light'), false); assert.equal(esOscuro({ theme: 'system' }), true);
  assert.equal(root.style.fontSize, '14px');
  for (const c of ['ajustes-compacto', 'ajustes-sin-movimiento', 'ajustes-sin-desenfoque', 'ajustes-contraste', 'ajustes-lector']) assert.equal(classes.has(c), false);
  delete globalThis.document; delete globalThis.window;
});

console.log(`Settings sync: ${count} scenarios passed (validation, per-account cache, serialized writes, offline recovery, lifecycle, contrast, visual application).`);
