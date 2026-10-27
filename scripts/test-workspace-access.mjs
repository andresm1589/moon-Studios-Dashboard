import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Load the actual TypeScript contract in memory. No Firebase SDK, credentials,
// network, filesystem writes or production account is involved in this suite.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function compile(relative, imports = {}) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, replacement] of Object.entries(imports)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(from\\s+)(['"])${escaped}\\2`, 'g');
    assert.match(code, pattern, `${relative} imports ${name}`);
    code = code.replace(pattern, `$1${JSON.stringify(replacement)}`);
  }
  return moduleUrl(code);
}

const typesUrl = await compile('../src/types/index.ts');
const { ROLE_PERMISSIONS, tienePermiso } = await import(typesUrl);
const accessUrl = await compile('../src/lib/workspaceAccess.ts', { '@/types': typesUrl });
const { verifyAccessChecks, WorkspaceAccessError, accessErrorMessage } = await import(accessUrl);
const identity = { uid: 'qa-user-a', email: 'qa-a@example.invalid', displayName: 'Cuenta A' };
const validExpiration = () => ({ expirationTime: new Date(Date.now() + 3_600_000).toISOString() });
const validProfile = role => ({ role, displayName: 'Nombre del perfil', email: 'perfil@example.invalid' });
let count = 0;
async function test(name, run) {
  try { await run(); count++; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
function harness({ uid = identity.uid, profile = validProfile('Empleado'), expiration = validExpiration() } = {}) {
  const events = [];
  const calls = { refresh: 0, profile: 0 };
  const state = { uid };
  const checks = {
    currentUid: () => state.uid,
    refreshSession: async () => { calls.refresh++; events.push('refresh'); return expiration; },
    readProfile: async () => { calls.profile++; events.push('read'); return profile; },
  };
  return { checks, calls, events, state, step: step => events.push(step) };
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error instanceof WorkspaceAccessError && error.code === code);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

await test('fresh session and server profile are checked in order', async () => {
  const h = harness();
  const result = await verifyAccessChecks(identity, h.checks, h.step);
  assert.deepEqual(h.events, ['session', 'refresh', 'profile', 'read', 'access']);
  assert.deepEqual(h.calls, { refresh: 1, profile: 1 });
  assert.equal(result.uid, identity.uid);
  assert.equal(result.role, 'Empleado');
});

for (const role of Object.keys(ROLE_PERMISSIONS)) {
  await test(`existing team role is accepted: ${role}`, async () => {
    const h = harness({ profile: validProfile(role) });
    const result = await verifyAccessChecks(identity, h.checks);
    assert.equal(result.role, role);
    for (const permission of ROLE_PERMISSIONS.CEO) {
      assert.equal(tienePermiso(result.role, permission), ROLE_PERMISSIONS[role].includes(permission));
    }
  });
}

for (const role of ['', 'CEO ', 'ceo', 'Cliente', 'Socio', '__proto__', 'constructor', 'toString', null, undefined, 42, {}, ['CEO']]) {
  await test(`unknown or malformed role never grants access: ${JSON.stringify(role)}`, async () => {
    const h = harness({ profile: validProfile(role) });
    await rejectsCode(verifyAccessChecks(identity, h.checks), 'workspace/access-denied');
  });
}

await test('missing profile denies access without an assigned fallback role', async () => {
  const h = harness({ profile: null });
  await rejectsCode(verifyAccessChecks(identity, h.checks), 'workspace/profile-missing');
  assert.deepEqual(h.calls, { refresh: 1, profile: 1 });
});

for (const role of Object.keys(ROLE_PERMISSIONS)) {
  await test(`disabled corporate profile is rejected: ${role}`, async () => {
    const h = harness({ profile: { ...validProfile(role), isActive: false } });
    await rejectsCode(verifyAccessChecks(identity, h.checks), 'workspace/account-disabled');
  });
  await test(`explicitly active corporate profile is accepted: ${role}`, async () => {
    const h = harness({ profile: { ...validProfile(role), isActive: true } });
    const result = await verifyAccessChecks(identity, h.checks);
    assert.equal(result.role, role);
  });
}

for (const role of ['CEO', 'Empleado']) {
  for (const isActive of [null, 0, 1, 'true', 'false', '', {}, [], undefined]) {
    await test(`malformed active flag cannot grant ${role} access: ${JSON.stringify(isActive)}`, async () => {
      const h = harness({ profile: { ...validProfile(role), isActive } });
      await rejectsCode(verifyAccessChecks(identity, h.checks), 'workspace/account-disabled');
    });
  }
}

for (const expirationTime of ['', 'not-a-date', '1970-01-01T00:00:00.000Z', new Date(Date.now() - 60_000).toISOString()]) {
  await test(`expired or malformed token stops before a profile read: ${expirationTime}`, async () => {
    const h = harness({ expiration: { expirationTime } });
    await rejectsCode(verifyAccessChecks(identity, h.checks, h.step), 'workspace/session-expired');
    assert.equal(h.calls.profile, 0);
    assert.deepEqual(h.events, ['session', 'refresh']);
  });
}

for (const uid of ['', null, 'qa-user-b']) {
  await test(`changed or absent identity is rejected before refresh: ${uid}`, async () => {
    const h = harness({ uid });
    await rejectsCode(verifyAccessChecks(identity, h.checks), 'workspace/session-changed');
    assert.deepEqual(h.calls, { refresh: 0, profile: 0 });
  });
}
await test('an empty requested uid cannot match an empty session', async () => {
  const h = harness({ uid: '' });
  await rejectsCode(verifyAccessChecks({ ...identity, uid: '' }, h.checks), 'workspace/session-changed');
  assert.equal(h.calls.refresh, 0);
});

for (const code of ['auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-not-found', 'auth/network-request-failed']) {
  await test(`refresh failure is propagated and cannot read a profile: ${code}`, async () => {
    const h = harness();
    const original = Object.assign(new Error('Synthetic refresh failure'), { code });
    h.checks.refreshSession = async () => { h.calls.refresh++; throw original; };
    await assert.rejects(verifyAccessChecks(identity, h.checks), error => error === original);
    assert.equal(h.calls.profile, 0);
  });
}

await test('signing out while refresh is pending does not read the former profile', async () => {
  const h = harness();
  const wait = deferred();
  h.checks.refreshSession = () => wait.promise;
  const verification = verifyAccessChecks(identity, h.checks);
  const rejected = rejectsCode(verification, 'workspace/session-changed');
  h.state.uid = null;
  wait.resolve(validExpiration());
  await rejected;
  assert.equal(h.calls.profile, 0);
});

await test('an account switch during refresh cannot win against the new account', async () => {
  const h = harness();
  const wait = deferred();
  h.checks.refreshSession = () => wait.promise;
  const stale = rejectsCode(verifyAccessChecks(identity, h.checks), 'workspace/session-changed');
  h.state.uid = 'qa-user-b';
  const next = harness({ uid: h.state.uid, profile: validProfile('Diseño') });
  const current = await verifyAccessChecks({ ...identity, uid: h.state.uid }, next.checks);
  wait.resolve(validExpiration());
  await stale;
  assert.equal(current.uid, 'qa-user-b');
  assert.equal(current.role, 'Diseño');
  assert.equal(h.calls.profile, 0);
});

for (const nextUid of [null, 'qa-user-b']) {
  await test(`identity is checked again after profile response: ${nextUid}`, async () => {
    const h = harness();
    const wait = deferred();
    const started = deferred();
    h.checks.readProfile = () => { h.calls.profile++; started.resolve(); return wait.promise; };
    const rejected = rejectsCode(verifyAccessChecks(identity, h.checks, h.step), 'workspace/session-changed');
    await started.promise;
    h.state.uid = nextUid;
    wait.resolve(validProfile('CEO'));
    await rejected;
    assert.equal(h.events.includes('access'), false);
  });
}

await test('a failed server read remains failed instead of falling back to cached profile', async () => {
  const h = harness();
  const failure = Object.assign(new Error('Synthetic profile failure'), { code: 'unavailable' });
  h.checks.readProfile = async () => { throw failure; };
  await assert.rejects(verifyAccessChecks(identity, h.checks, h.step), error => error === failure);
  assert.equal(h.events.includes('access'), false);
});

await test('network failure can be retried with new session and profile checks', async () => {
  const h = harness();
  let offline = true;
  h.checks.refreshSession = async () => {
    h.calls.refresh++;
    if (offline) throw Object.assign(new Error('Synthetic offline state'), { code: 'auth/network-request-failed' });
    return validExpiration();
  };
  await assert.rejects(verifyAccessChecks(identity, h.checks));
  assert.equal(h.calls.profile, 0);
  offline = false;
  const result = await verifyAccessChecks(identity, h.checks);
  assert.equal(result.uid, identity.uid);
  assert.deepEqual(h.calls, { refresh: 2, profile: 1 });
});

await test('server profile read can be retried after a transient failure', async () => {
  const h = harness();
  let offline = true;
  h.checks.readProfile = async () => {
    h.calls.profile++;
    if (offline) throw Object.assign(new Error('Synthetic unavailable profile server'), { code: 'unavailable' });
    return validProfile('Programación');
  };
  await assert.rejects(verifyAccessChecks(identity, h.checks));
  offline = false;
  const result = await verifyAccessChecks(identity, h.checks);
  assert.equal(result.role, 'Programación');
  assert.deepEqual(h.calls, { refresh: 2, profile: 2 });
});

await test('profile metadata cannot replace the authenticated uid', async () => {
  const h = harness({ profile: { ...validProfile('Contador'), uid: 'someone-else', displayName: '  Nombre real  ', permissions: ['ceo'] } });
  const result = await verifyAccessChecks(identity, h.checks);
  assert.equal(result.uid, identity.uid);
  assert.equal(result.displayName, 'Nombre real');
  assert.equal(result.role, 'Contador');
  assert.equal(tienePermiso(result.role, 'ceo'), false);
  assert.equal('permissions' in result, false);
});

await test('optional metadata uses safe fallbacks without inventing a role', async () => {
  const h = harness({ profile: { role: 'Empleado', email: {}, displayName: null, avatarHistory: null, createdAt: { toDate: () => { throw new Error('Bad date'); } } } });
  const result = await verifyAccessChecks(identity, h.checks);
  assert.equal(result.email, identity.email);
  assert.equal(result.displayName, identity.displayName);
  assert.deepEqual(result.avatarHistory, []);
  assert.ok(Number.isFinite(result.createdAt.getTime()));
});

await test('known access errors retain clear, actionable messages', async () => {
  const custom = new WorkspaceAccessError('workspace/profile-missing', 'Perfil faltante.');
  assert.equal(accessErrorMessage(custom), custom.message);
  assert.match(accessErrorMessage({ code: 'auth/user-disabled' }), /deshabilitada/);
  for (const code of ['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-not-found']) assert.match(accessErrorMessage({ code }), /iniciar sesión/);
  assert.match(accessErrorMessage({ code: 'permission-denied' }), /administración/);
  assert.match(accessErrorMessage(new Error('Do not expose technical information')), /conexión/);
});

// Exercise the real adapter with inert SDK modules as well: the checks above
// would be insufficient if the adapter silently chose a cache or an old token.
const authStubUrl = moduleUrl(`export const state={currentUser:{uid:'qa-user-a'},calls:[]};export async function getIdTokenResult(user,force){state.calls.push({uid:user.uid,force});return {expirationTime:new Date(Date.now()+3600000).toISOString()}}`);
const firestoreStubUrl = moduleUrl(`export const state={calls:[]};export const doc=(db,collection,uid)=>({collection,uid});export async function getDocFromServer(ref){state.calls.push(ref);return {exists:()=>true,data:()=>({role:'Empleado',displayName:'Perfil sintético'})}}`);
const firebaseStubUrl = moduleUrl(`import {state} from ${JSON.stringify(authStubUrl)};export const auth={get currentUser(){return state.currentUser}};export const db={};`);
const adapterUrl = await compile('../src/lib/verifyWorkspaceAccess.ts', {
  'firebase/auth': authStubUrl,
  'firebase/firestore': firestoreStubUrl,
  '@/lib/firebase': firebaseStubUrl,
  './workspaceAccess': accessUrl,
});
const { verifyWorkspaceAccess } = await import(adapterUrl);
const authStub = await import(authStubUrl);
const firestoreStub = await import(firestoreStubUrl);
await test('real adapter forces token refresh and reads the server document for the same uid', async () => {
  const profile = await verifyWorkspaceAccess(identity);
  assert.deepEqual(authStub.state.calls, [{ uid: identity.uid, force: true }]);
  assert.deepEqual(firestoreStub.state.calls, [{ collection: 'users', uid: identity.uid }]);
  assert.equal(profile.uid, identity.uid);
});
await test('real adapter rejects a different current account without any SDK operation', async () => {
  authStub.state.currentUser = { uid: 'qa-user-b' };
  await rejectsCode(verifyWorkspaceAccess(identity), 'workspace/session-changed');
  assert.equal(authStub.state.calls.length, 1);
  assert.equal(firestoreStub.state.calls.length, 1);
});

console.log(`Workspace access: ${count} checks passed. Real role map, forced refresh, server profile, account races, disabled/expired sessions, denial and network retries verified with synthetic dependencies only.`);
