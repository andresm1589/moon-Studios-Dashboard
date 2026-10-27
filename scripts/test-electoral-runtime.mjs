import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Executes the shipped hooks with a small React lifecycle and in-memory
// Firestore adapter. There is no network, account creation or production write.
const sourceRoot = resolve(process.argv[2] || fileURLToPath(new URL('../src/electoral', import.meta.url)));
let renderer;
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const react = {
  useState(initial) { const owner = renderer, index = owner.cursor++; if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial; return [owner.slots[index], value => { owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value; }]; },
  useRef(initial) { const owner = renderer, index = owner.cursor++; return owner.slots[index] ??= { current: initial }; },
  useCallback(callback, deps) { const owner = renderer, index = owner.cursor++, prior = owner.slots[index]; if (!prior || !same(prior.deps, deps)) owner.slots[index] = { callback, deps }; return owner.slots[index].callback; },
  useEffect(callback, deps) { const owner = renderer, index = owner.cursor++, prior = owner.effects[index]; if (!prior || !same(prior.deps, deps)) owner.pending.push(() => { prior?.cleanup?.(); owner.effects[index] = { deps, cleanup: callback() }; }); },
};
const missing = Symbol('missing'), deletion = Symbol('delete-field');
function snapshot(path, data = missing, metadata = {}) { return { id: path.split('/').at(-1), exists: () => data !== missing, data: () => data, metadata: { fromCache: false, hasPendingWrites: false, ...metadata } }; }
function reference(db, path, kind = 'doc', constraints = []) { return { db, path, kind, constraints, id: path.split('/').at(-1) }; }
const firestore = {
  collection: (db, path) => reference(db, path, 'collection'),
  doc: (first, ...parts) => first.kind === 'collection' ? reference(first.db, `${first.path}/${parts[0] || `Generated${String(++first.db.runtime.counter).padStart(20, '0')}`}`) : reference(first, parts.join('/')),
  query: (source, ...constraints) => ({ ...source, constraints }),
  where: (field, operator, value) => ({ field, operator, value }),
  onSnapshot(source, ...args) { const [next, error] = typeof args[0] === 'object' ? args.slice(1) : args; const listener = { source, next, error, active: true }; source.db.runtime.listeners.push(listener); return () => { listener.active = false; }; },
  getDocFromServer: async ref => snapshot(ref.path, ref.db.runtime.docs.get(ref.path) ?? missing),
  serverTimestamp: () => new Date(), deleteField: () => deletion,
  async runTransaction(db, run) {
    const writes = [], transaction = { get: async ref => { db.runtime.reads.push(ref.path); return snapshot(ref.path, db.runtime.docs.get(ref.path) ?? missing); }, set: (ref, data, options) => writes.push({ kind: 'set', ref, data, options }), update: (ref, data) => writes.push({ kind: 'update', ref, data }), delete: ref => writes.push({ kind: 'delete', ref }) };
    const result = await run(transaction); db.runtime.commit(writes); return result;
  },
  writeBatch(db) { const writes = []; return { set: (ref, data) => writes.push({ kind: 'set', ref, data }), commit: async () => db.runtime.commit(writes) }; },
};
const modules = new Map();
async function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = await readFile(resolve(sourceRoot, `${name}.ts`), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = { react, 'firebase/firestore': firestore };
  if (name !== 'model') imports['./model'] = await load('model');
  if (name === 'useElectionSystem') imports['./useElectoralPublicState'] = await load('useElectoralPublicState');
  const output = {}; Function('require', 'exports', 'setTimeout', 'clearTimeout', code)(key => { if (!(key in imports)) throw new Error(`Unexpected runtime import ${key}`); return imports[key]; }, output, callback => { const timer = { callback, active: true }; renderer.timers.push(timer); return timer; }, timer => { timer.active = false; }); modules.set(name, output); return output;
}
const { useElectoralPublicState } = await load('useElectoralPublicState');
const { useElectionSystem } = await load('useElectionSystem');
class HookHarness {
  constructor(hook, options = {}) { this.hook = hook; this.slots = []; this.effects = []; this.pending = []; this.listeners = []; this.timers = []; this.docs = new Map(); this.writes = []; this.reads = []; this.counter = 0; this.db = { runtime: this }; this.options = { db: this.db, ...options }; }
  render(options) { if (options) this.options = { ...this.options, ...options }; this.cursor = 0; renderer = this; try { return this.value = this.hook(this.options); } finally { renderer = null; } }
  effectsNow() { renderer = this; try { for (const apply of this.pending.splice(0)) apply(); } finally { renderer = null; } }
  emit(listener) {
    const { source } = listener; if (!listener.active) return;
    if (source.kind === 'doc') listener.next(snapshot(source.path, this.docs.get(source.path) ?? missing));
    else {
      const docs = [...this.docs].filter(([path]) => path.startsWith(`${source.path}/`) && path.split('/').length === 2).filter(([, data]) => source.constraints.every(({ field, operator, value }) => operator === '==' ? data[field] === value : operator === 'in' ? value.includes(data[field]) : false)).map(([path, data]) => snapshot(path, data));
      listener.next({ docs });
    }
  }
  settle() { this.render(); this.effectsNow(); for (const listener of this.listeners) this.emit(listener); return this.render(); }
  commit(writes) { this.writes.push(...writes); for (const write of writes) { if (write.kind === 'delete') this.docs.delete(write.ref.path); else { const data = write.kind === 'update' || write.options?.merge ? { ...this.docs.get(write.ref.path), ...write.data } : { ...write.data }; for (const [key, value] of Object.entries(data)) if (value === deletion) delete data[key]; this.docs.set(write.ref.path, data); } } }
  dispose() { for (const effect of this.effects) effect?.cleanup?.(); }
}
let checks = 0;
async function test(name, run) { try { await run(); checks++; } catch (error) { console.error(`FAIL ${name}`); throw error; } }
const closure = { enabled: false, closureTitle: 'Elecciones cerradas', closureMessage: 'Nos vemos pronto.', returnYear: 2028 };
const general = 'electoralSettings/general';
await test('settings start blocked while waiting for a server snapshot', () => { const h = new HookHarness(useElectoralPublicState); const state = h.render(); assert.equal(state.settingsLoading, true); assert.equal(state.settings.enabled, false); });
await test('missing settings document opens legacy installations after load', () => { const h = new HookHarness(useElectoralPublicState); const state = h.settle(); assert.equal(state.settingsLoading, false); assert.equal(state.settings.enabled, true); assert.equal(state.settingsError, null); });
await test('cached missing configuration cannot open before server confirmation', () => { const h = new HookHarness(useElectoralPublicState); h.render(); h.effectsNow(); const listener = h.listeners.find(item => item.source.path === general); renderer = h; listener.next(snapshot(general, missing, { fromCache: true })); renderer = null; const state = h.render(); assert.equal(state.settings.enabled, false); assert.equal(state.settingsLoading, true); });
await test('server verification deadline exposes a connection error while blocking participation', () => { const h = new HookHarness(useElectoralPublicState); h.render(); h.effectsNow(); h.timers.find(timer => timer.active).callback(); const state = h.render(); assert.equal(state.settings.enabled, false); assert.equal(state.settingsLoading, false); assert.match(state.settingsError, /servidor/); });
await test('a pending local reopen does not enable participation', () => { const h = new HookHarness(useElectoralPublicState); h.docs.set(general, closure); h.settle(); const listener = h.listeners.find(item => item.source.path === general); renderer = h; listener.next(snapshot(general, { ...closure, enabled: true }, { hasPendingWrites: true })); renderer = null; const state = h.render(); assert.equal(state.settings.enabled, false); assert.equal(state.settingsLoading, true); listener.next(snapshot(general, { ...closure, enabled: true })); assert.equal(h.render().settings.enabled, true); });
await test('invalid settings display a repair error and remain blocked', () => { const h = new HookHarness(useElectoralPublicState); h.docs.set(general, { ...closure, enabled: 'true' }); const state = h.settle(); assert.equal(state.settings.enabled, false); assert.ok(state.settingsError); });
await test('listener failure clears an earlier open state', () => { const h = new HookHarness(useElectoralPublicState); h.settle(); const listener = h.listeners.find(item => item.source.path === general); listener.error({ code: 'unavailable' }); const state = h.render(); assert.equal(state.settings.enabled, false); assert.equal(state.settingsLoading, false); assert.ok(state.settingsError); });
await test('retry resets loading, resubscribes, and can reopen after recovery', () => { const h = new HookHarness(useElectoralPublicState); h.settle(); const prior = h.listeners.find(item => item.source.path === general); prior.error({ code: 'unavailable' }); h.render().refresh(); h.render(); h.effectsNow(); assert.equal(prior.active, false); assert.equal(h.render().settingsLoading, true); h.docs.set(general, { ...closure, enabled: true }); h.emit(h.listeners.filter(item => item.source.path === general).at(-1)); const state = h.render(); assert.equal(state.settingsError, null); assert.equal(state.settings.enabled, true); });
await test('CEO downgrade hides private announcement drafts before effects run', () => { const h = new HookHarness(useElectoralPublicState, { canManage: true }); h.docs.set('electoralAnnouncements/draft', { title: 'CEO draft', status: 'draft' }); assert.equal(h.settle().announcements.length, 1); const state = h.render({ canManage: false }); assert.deepEqual(state.announcements, []); assert.equal(state.announcementsLoading, true); h.effectsNow(); for (const listener of h.listeners) h.emit(listener); assert.deepEqual(h.render().announcements, []); });
await test('late CEO snapshots cannot leak drafts following role change', () => { const h = new HookHarness(useElectoralPublicState, { canManage: true }); h.settle(); const prior = h.listeners.find(item => item.source.path === 'electoralAnnouncements'); h.render({ canManage: false }); h.effectsNow(); prior.next({ docs: [snapshot('electoralAnnouncements/secret', { status: 'draft' })] }); assert.deepEqual(h.render().announcements, []); });
await test('omitting announcements unsubscribes and immediately clears prior data', () => { const h = new HookHarness(useElectoralPublicState); h.docs.set('electoralAnnouncements/public', { status: 'published' }); h.settle(); const prior = h.listeners.find(item => item.source.path === 'electoralAnnouncements'); const state = h.render({ includeAnnouncements: false }); assert.deepEqual(state.announcements, []); assert.equal(state.announcementsLoading, false); h.effectsNow(); assert.equal(prior.active, false); });
await test('announcement failure clears stale notices and exposes an error', () => { const h = new HookHarness(useElectoralPublicState); h.docs.set('electoralAnnouncements/public', { status: 'published' }); h.settle(); h.listeners.find(item => item.source.path === 'electoralAnnouncements').error({ code: 'permission-denied' }); const state = h.render(); assert.deepEqual(state.announcements, []); assert.ok(state.announcementsError); });
await test('switching Firebase sources hides prior open availability immediately', () => { const h = new HookHarness(useElectoralPublicState); h.settle(); const state = h.render({ db: { runtime: h } }); assert.equal(state.settingsLoading, true); assert.equal(state.settings.enabled, false); });

const instant = new Date(), earlier = new Date(instant.getTime() - 3600000), later = new Date(instant.getTime() + 3600000), end = new Date(instant.getTime() + 7200000);
const identity = { uid: 'ceo', displayName: 'CEO', role: 'CEO', email: 'ceo@example.test', emailVerified: true };
const election = { id: 'process', name: 'Proceso de prueba', description: '', status: 'active', registrationStartDate: earlier, registrationEndDate: later, startDate: later, endDate: end, positions: ['Presidencia'], departments: [], totalVotes: 0, createdBy: identity.uid, createdAt: earlier };
const access = { uid: identity.uid, electionId: election.id, displayName: 'CEO', email: identity.email, photoURL: '', requestedVoter: true, requestedCandidate: true, voterStatus: 'approved', candidateStatus: 'approved', createdAt: earlier, updatedAt: earlier };
const candidate = { uid: 'applicant', electionId: election.id, name: 'Persona', position: 'Presidencia', positionIndex: 0, department: '', proposals: ['Mejorar procesos'], status: 'pending', votes: 0, createdAt: earlier };
const invitationId = 'Abcdef0123456789Abcdef';
function controller(open = false) { const h = new HookHarness(useElectionSystem, { identity }); h.docs.set(general, { ...closure, enabled: open }); h.docs.set('elections/process', election); h.docs.set('electoralAccess/ceo_process', access); h.docs.set('candidates/candidate', candidate); h.docs.set(`electoralInvitations/${invitationId}`, { electionId: election.id, label: 'Invitación', email: '', requestedVoter: true, requestedCandidate: false, expiresAt: later, status: 'active', createdBy: identity.uid, createdAt: earlier, updatedAt: earlier }); h.settle(); return h; }
const mutationCalls = {
  requestAccess: state => state.requestAccess('process', { voter: true, candidate: false }),
  reviewAccess: state => state.reviewAccess('ceo_process', { voterStatus: 'rejected' }),
  createInvitation: state => state.createInvitation({ electionId: election.id, label: 'Nueva invitación', email: '', requestedVoter: true, requestedCandidate: false, expiresAt: later }),
  acceptInvitation: state => state.acceptInvitation(invitationId),
  registerCandidate: state => state.registerCandidate({ electionId: election.id, name: 'Persona', position: 'Presidencia', department: '', proposals: ['Mejorar procesos'] }),
  reviewCandidate: state => state.reviewCandidate('candidate', 'approved'),
  castVote: state => state.castVote('process', 'candidate', 'Presidencia'),
};
for (const [name, run] of Object.entries(mutationCalls)) await test(`closed system blocks ${name} even for CEO`, async () => { const h = controller(); await assert.rejects(run(h.value), /Elecciones cerradas/); assert.equal(h.writes.length, 0); if (name !== 'registerCandidate') assert.ok(h.reads.includes(general)); });
for (const [name, run] of Object.entries(mutationCalls)) await test(`concurrent closure blocks ${name} despite earlier open UI`, async () => { const h = controller(true); h.docs.set(general, closure); await assert.rejects(run(h.value), /Elecciones cerradas/); assert.equal(h.writes.length, 0); assert.ok(h.reads.includes(general)); });
await test('closed system leaves CEO process creation available', async () => { const h = controller(); const id = await h.value.createElection(election); assert.equal(h.docs.get(`elections/${id}`).status, 'draft'); });
await test('process trash preserves votes, records and audits; restore archives safely', async () => { const h = controller(); h.docs.set('elections/process', { ...election, totalVotes: 7 }); h.docs.set('votes/private-record', { voterId: 'person', electionId: 'process' }); await h.value.deleteElection('process'); let stored = h.docs.get('elections/process'); assert.equal(stored.status, 'deleted'); assert.equal(stored.previousStatus, 'active'); assert.equal(stored.totalVotes, 7); assert.equal(stored.deletedBy, identity.uid); assert.ok(stored.deletedAt instanceof Date); assert.ok(h.docs.has('votes/private-record')); await h.value.restoreElection('process'); stored = h.docs.get('elections/process'); assert.equal(stored.status, 'archived'); assert.equal(stored.totalVotes, 7); for (const key of ['previousStatus', 'deletedAt', 'deletedBy']) assert.equal(key in stored, false); assert.ok(h.writes.some(write => write.data?.action === 'ELECTION_DELETED')); assert.ok(h.writes.some(write => write.data?.action === 'ELECTION_RESTORED')); });
await test('closed system permits revocation of outstanding invitations', async () => { const h = controller(); await h.value.revokeInvitation(invitationId); assert.equal(h.docs.get(`electoralInvitations/${invitationId}`).status, 'revoked'); });
await test('closed system permits editing closure and reopening', async () => { const h = controller(); await h.value.updateSettings({ ...closure, enabled: true, returnYear: 2029 }); assert.equal(h.docs.get(general).enabled, true); assert.equal(h.docs.get(general).updatedBy, identity.uid); });
await test('reopening permits new voter requests again with pending approval', async () => { const h = controller(); h.docs.delete('electoralAccess/ceo_process'); h.docs.set(general, { ...closure, enabled: true }); await h.value.requestAccess('process', { voter: true, candidate: false }); const stored = h.docs.get('electoralAccess/ceo_process'); assert.equal(stored.voterStatus, 'pending'); assert.equal(stored.requestedVoter, true); assert.equal(stored.candidateStatus, 'none'); });
await test('missing global settings permits legacy voter requests', async () => { const h = controller(); h.docs.delete('electoralAccess/ceo_process'); h.docs.delete(general); await h.value.requestAccess('process', { voter: true, candidate: false }); assert.equal(h.docs.get('electoralAccess/ceo_process').voterStatus, 'pending'); });
await test('malformed global configuration blocks transactions with stale open UI', async () => { const h = controller(true); h.docs.set(general, { enabled: true }); await assert.rejects(h.value.createInvitation({ electionId: election.id, label: 'Invitación', email: '', requestedVoter: true, requestedCandidate: false, expiresAt: later }), /Elecciones cerradas/); assert.equal(h.writes.length, 0); });
await test('closed system permits publishing a general professional announcement', async () => { const h = controller(); const id = await h.value.createAnnouncement({ title: 'Aviso de cierre', body: 'La siguiente convocatoria se anunciará en este panel.', status: 'published', electionId: '', pinned: true, startsAt: earlier, endsAt: end }); assert.equal(h.docs.get(`electoralAnnouncements/${id}`).status, 'published'); });
await test('identity change hides old CEO datasets before resubscription', () => { const h = controller(true); assert.equal(h.value.elections.length, 1); const state = h.render({ identity: { uid: 'guest', displayName: 'Invitado', role: 'external' } }); assert.deepEqual(state.elections, []); assert.deepEqual(state.candidates, []); assert.deepEqual(state.accessRequests, []); assert.deepEqual(state.invitations, []); assert.equal(state.canManage, false); assert.equal(state.loading, true); });
await test('late private snapshots are ignored after identity changes', () => { const h = controller(true); const prior = h.listeners.find(item => item.source.path === 'elections'); h.render({ identity: { uid: 'guest', displayName: 'Invitado', role: 'external' } }); h.effectsNow(); prior.next({ docs: [snapshot('elections/secret', { ...election, status: 'draft' })] }); assert.deepEqual(h.render().elections, []); });
console.log(`PASS ${checks} electoral hook and transaction checks. In-memory adapters only; no network or data writes.`);
