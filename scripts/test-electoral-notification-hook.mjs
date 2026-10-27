import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';

// Runs the actual notification hook, electoral mapper, model and publication
// clock with synthetic React/Firestore/browser adapters. Never uses a network.
const root = fileURLToPath(new URL('../src/', import.meta.url));
const NativeDate = Date;
let currentTime = NativeDate.parse('2026-10-18T16:00:00Z'), renderer, timerId = 0;
const timers = new Map(), storage = new Map(), sounds = [], systemNotices = [], writes = [];
class TestDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [currentTime])); } static now() { return currentTime; } }
const date = offset => new TestDate(currentTime + offset);
const browserStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const document = { hidden: false, hasFocus: () => true, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
const setTimer = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: currentTime + Number(delay) }); return id; };
const clearTimer = id => timers.delete(id);
function tick(milliseconds) { const target = currentTime + milliseconds; for (let i = 0; i < 1000; i++) { const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; currentTime = due[1].at; timers.delete(due[0]); due[1].callback(); } currentTime = target; }
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const react = {
  useState(initial) { const owner = renderer, index = owner.cursor++; if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial; return [owner.slots[index], input => { const next = typeof input === 'function' ? input(owner.slots[index]) : input; if (!Object.is(next, owner.slots[index])) { owner.slots[index] = next; owner.dirty = true; } }]; },
  useRef(initial) { const owner = renderer, index = owner.cursor++; return owner.slots[index] ??= { current: initial }; },
  useCallback(callback, deps) { const owner = renderer, index = owner.cursor++, prior = owner.slots[index]; if (!prior || !same(prior.deps, deps)) owner.slots[index] = { callback, deps }; return owner.slots[index].callback; },
  useMemo(callback, deps) { const owner = renderer, index = owner.cursor++, prior = owner.slots[index]; if (!prior || !same(prior.deps, deps)) owner.slots[index] = { value: callback(), deps }; return owner.slots[index].value; },
  useEffect(callback, deps) { const owner = renderer, index = owner.cursor++, prior = owner.effects[index]; if (!prior || !same(prior.deps, deps)) owner.pending.push(() => { prior?.cleanup?.(); owner.effects[index] = { deps, cleanup: callback() }; }); },
  useId: () => 'synthetic-id',
};
const db = {};
const ref = path => ({ path });
const snap = (path, data) => ({ id: path.split('/').at(-1), exists: () => data !== undefined, data: () => data });
const firestore = {
  collection: (_db, path) => ref(path), doc: (_db, ...parts) => ref(parts.join('/')),
  query: (source, ...constraints) => ({ ...source, constraints }), where: (field, operator, value) => ({ field, operator, value }), orderBy: (field, direction) => ({ field, direction }), limit: count => ({ count }),
  onSnapshot(source, next, error) { const listener = { source, next, error, active: true }; db.harness.listeners.push(listener); return () => { listener.active = false; }; },
  updateDoc: async (source, data) => { writes.push({ path: source.path, data }); },
};
const cache = new Map();
async function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const source = await readFile(resolve(root, relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const imports = { react, 'firebase/firestore': firestore, '@/lib/firebase': { db }, '@/lib/notificationSound': { playNotificationSound: (...args) => sounds.push(args) }, '@/lib/pushWeb': { pushWebActivo: () => false }, '@/lib/escritorio': { notificarSistema: (...args) => systemNotices.push(args), enHorasDeSilencio: () => false }, 'react/jsx-runtime': { jsx() {}, jsxs() {} }, 'react-router-dom': {}, 'lucide-react': {}, './electoral-public.css': {} };
  if (relative !== 'electoral/model.ts') { const model = await load('electoral/model.ts'); imports['@/electoral/model'] = model; imports['./model'] = model; }
  if (relative === 'lib/tramitesNotifications.ts') imports['./tramitesDocumentoModelo'] = await load('lib/tramitesDocumentoModelo.ts');
  if (relative === 'hooks/useNotifications.ts') { imports['@/lib/electoralNotifications'] = await load('lib/electoralNotifications.ts'); imports['@/electoral/ElectoralPublicPanel'] = await load('electoral/ElectoralPublicPanel.tsx'); imports['@/lib/tramitesNotifications'] = await load('lib/tramitesNotifications.ts'); }
  const output = {}; Function('require', 'exports', 'Date', 'localStorage', 'document', 'setTimeout', 'clearTimeout', code)(name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; }, output, TestDate, browserStorage, document, setTimer, clearTimer); cache.set(relative, output); return output;
}
const { useNotifications } = await load('hooks/useNotifications.ts');
const enabledCategories = { announcement: true, email: false, thread: false, message: false, task: false, security: false };
const emptyAccountState = () => ({ leidasHasta: 0, leidas: [], ocultasHasta: 0, ocultas: [] });
class Harness {
  constructor(options = {}) { this.slots = []; this.effects = []; this.pending = []; this.listeners = []; this.dirty = false; this.options = { uid: 'voter-a', soundType: 'default', soundVolume: 50, muted: false, escritorio: false, enabledCategories, ...options }; db.harness = this; }
  render(options) { if (options) this.options = { ...this.options, ...options }; this.cursor = 0; renderer = this; try { return this.value = useNotifications(this.options); } finally { renderer = null; } }
  flush(options) { this.render(options); for (let i = 0; i < 30; i++) { this.dirty = false; for (const apply of this.pending.splice(0)) apply(); if (!this.dirty && !this.pending.length) return this.value; this.render(); } throw new Error('Synthetic render did not settle'); }
  emit(path, docs) { const listener = this.listeners.filter(item => item.active && item.source.path === path).at(-1); assert.ok(listener, `Expected active ${path} listener`); listener.next(path.startsWith('users/') ? snap(path, docs) : { docs: docs.map(item => snap(`${path}/${item.id}`, item)) }); return this.flush(); }
  ready() { this.flush(); this.emit(`users/${this.options.uid}`, { notifEstado: emptyAccountState() }); return this; }
  dispose() { for (const effect of this.effects) effect?.cleanup?.(); }
}
const announcement = (id, changes = {}) => ({ id, title: `Comunicado ${id}`, body: 'La dirección informa al electorado.', status: 'published', electionId: '', pinned: true, startsAt: date(-1000), endsAt: date(3600000), updatedAt: date(-1000), createdAt: date(-1000), createdBy: 'ceo', updatedBy: 'ceo', ...changes });
const generalAnnouncement = () => ({ id: 'general', title: 'General', content: 'Inicio del equipo', createdAt: date(-2000) });
let checks = 0, failures = 0;
async function test(name, run) { sounds.length = 0; systemNotices.length = 0; writes.length = 0; storage.clear(); timers.clear(); try { await run(); checks++; } catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); } }
await test('first electoral backlog stays silent even when general announcements load first', () => { const h = new Harness().ready(); h.emit('announcements', [generalAnnouncement()]); assert.equal(sounds.length, 0); h.emit('electoralAnnouncements', [announcement('existing')]); assert.equal(h.value.notifications.filter(item => item.fuente === 'electoral').length, 1); assert.equal(sounds.length, 0); assert.equal(systemNotices.length, 0); h.dispose(); });
await test('later publication is unread, sounds once and uses the electoral notification source', () => { const h = new Harness().ready(); const old = announcement('existing'); h.emit('announcements', [generalAnnouncement()]); h.emit('electoralAnnouncements', [old]); const before = h.value.unreadCount; h.emit('electoralAnnouncements', [old, announcement('new', { startsAt: date(-10), updatedAt: date(-10) })]); const added = h.value.notifications.find(item => item.rawId === 'new'); assert.equal(added.category, 'announcement'); assert.equal(added.fuente, 'electoral'); assert.equal(added.linkTo, '/dashboard/elecciones'); assert.equal(h.value.readIds.has(added.id), false); assert.equal(h.value.unreadCount, before + 1); assert.equal(sounds.length, 1); h.emit('electoralAnnouncements', [old, announcement('new', { startsAt: date(-10), updatedAt: date(-10) })]); assert.equal(sounds.length, 1); h.dispose(); });
await test('withdrawal removes a published electoral notification immediately', () => { const h = new Harness().ready(); h.emit('electoralAnnouncements', [announcement('withdrawn')]); assert.ok(h.value.notifications.some(item => item.rawId === 'withdrawn')); h.emit('electoralAnnouncements', []); assert.equal(h.value.notifications.some(item => item.rawId === 'withdrawn'), false); h.dispose(); });
await test('scheduled announcement appears at its time boundary without another Firestore snapshot', () => { const h = new Harness().ready(); h.emit('announcements', [generalAnnouncement()]); const future = announcement('scheduled', { startsAt: date(1000), endsAt: date(2000) }); h.emit('electoralAnnouncements', [future]); assert.equal(h.value.notifications.some(item => item.rawId === 'scheduled'), false); tick(1025); h.flush(); assert.equal(h.value.notifications.some(item => item.rawId === 'scheduled'), true); assert.equal(sounds.length, 1); tick(1000); h.flush(); assert.equal(h.value.notifications.some(item => item.rawId === 'scheduled'), false); h.dispose(); });
await test('mark read and dismiss persist only to the signed-in user account state', () => { const h = new Harness().ready(); h.emit('electoralAnnouncements', [announcement('read'), announcement('dismiss')]); const read = h.value.notifications.find(item => item.rawId === 'read'), dismissed = h.value.notifications.find(item => item.rawId === 'dismiss'); h.value.markOneRead(read.id); h.flush(); assert.equal(h.value.readIds.has(read.id), true); h.value.dismissOne(dismissed.id); h.flush(); assert.equal(h.value.notifications.some(item => item.id === dismissed.id), false); assert.equal(writes.length, 2); assert.ok(writes.every(write => write.path === 'users/voter-a')); assert.ok(writes.every(write => Object.keys(write.data).join() === 'notifEstado')); assert.ok(writes.at(-1).data.notifEstado.ocultas.includes(dismissed.id)); h.dispose(); });
await test('switching user hides previous data and ignores stale callbacks', () => {
  const h = new Harness().ready(); h.emit('electoralAnnouncements', [announcement('old-account')]);
  const id = h.value.notifications[0].id; h.value.markOneRead(id); h.flush();
  const priorAccount = h.listeners.find(item => item.source.path === 'users/voter-a');
  const priorPrivateSource = h.listeners.find(item => item.source.path === 'notifications');
  const state = h.render({ uid: 'voter-b' });
  assert.deepEqual(state.notifications, []); assert.equal(state.unreadCount, 0); assert.equal(state.readIds.size, 0); assert.equal(state.cargado, false);
  // Call captured callbacks directly to exercise a queued event at the
  // account boundary, including an event delivered after unsubscribe.
  priorAccount.next(snap('users/voter-a', { notifEstado: { ...emptyAccountState(), leidas: [id] } }));
  h.flush(); h.emit('users/voter-b', { notifEstado: emptyAccountState() });
  priorPrivateSource.next({ docs: [snap('notifications/private-old-user', { type: 'login-alert', createdAt: { toDate: () => date(0) }, toUids: ['voter-a'] })] });
  h.flush(); assert.deepEqual(h.value.notifications, []); assert.equal(h.value.readIds.has(id), false); h.dispose();
});
await test('new account without cache cannot inherit the previous read marker', () => { const h = new Harness().ready(); h.emit('electoralAnnouncements', [announcement('shared')]); const id = h.value.notifications[0].id; h.value.markOneRead(id); h.flush(); h.flush({ uid: 'voter-b' }); h.emit('users/voter-b', {}); const initialization = writes.find(write => write.path === 'users/voter-b'); assert.ok(initialization); assert.equal(initialization.data.notifEstado.leidas.includes(id), false); h.dispose(); });
await test('disabled announcement category removes electoral feed and listener', () => { const h = new Harness().ready(); h.emit('electoralAnnouncements', [announcement('hidden')]); const prior = h.listeners.find(item => item.source.path === 'electoralAnnouncements'); h.flush({ enabledCategories: { ...enabledCategories, announcement: false } }); assert.equal(prior.active, false); assert.equal(h.value.notifications.some(item => item.fuente === 'electoral'), false); h.dispose(); });
console.log(`${failures ? 'FAIL' : 'PASS'} ${checks} electoral notification hook checks${failures ? `; ${failures} failures` : ''}. Synthetic runtime only; no network or production data.`);
if (failures) process.exitCode = 1;
