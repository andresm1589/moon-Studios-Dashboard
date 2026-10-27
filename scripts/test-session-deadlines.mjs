import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile only the pure clock calculation; no app, login or backend is started.
const source = await readFile(new URL('../src/lib/sessionDeadline.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { getSessionDeadlineState: state, SESSION_IDLE_MS, SESSION_WARNING_SECONDS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const start = 1_700_000_000_000;
const idleDeadline = start + SESSION_IDLE_MS;

assert.equal(SESSION_IDLE_MS, 30 * 60 * 1000);
assert.equal(SESSION_WARNING_SECONDS, 60);
assert.deepEqual(state(start, idleDeadline), { phase: 'active', countdown: 60, nextCheckIn: 30 * 60 * 1000 });
assert.deepEqual(state(idleDeadline - 1, idleDeadline), { phase: 'active', countdown: 60, nextCheckIn: 1 });
assert.deepEqual(state(idleDeadline, idleDeadline), { phase: 'warning', countdown: 60, nextCheckIn: 1000 });
assert.equal(state(idleDeadline + 1000, idleDeadline).countdown, 59);
// A delayed callback must not grant an extra sixty seconds after waking up.
assert.deepEqual(state(idleDeadline + 27_500, idleDeadline), { phase: 'warning', countdown: 33, nextCheckIn: 1000 });
assert.deepEqual(state(idleDeadline + 59_999, idleDeadline), { phase: 'warning', countdown: 1, nextCheckIn: 1 });
assert.deepEqual(state(idleDeadline + 60_000, idleDeadline), { phase: 'expired', countdown: 0, nextCheckIn: 0 });
assert.deepEqual(state(idleDeadline + 120_000, idleDeadline), { phase: 'expired', countdown: 0, nextCheckIn: 0 });
// Explicit continuation establishes a fresh idle deadline at the current time.
const resumed = idleDeadline + 20_000;
assert.deepEqual(state(resumed, resumed + SESSION_IDLE_MS), { phase: 'active', countdown: 60, nextCheckIn: SESSION_IDLE_MS });

console.log('Session deadlines: 11 checks passed (idle boundary, delayed tab, expiry and continuation).');
