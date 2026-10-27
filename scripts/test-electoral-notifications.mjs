import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Executes the real pure projection. No Firebase, browser, email or OS calls.
const moduleURL = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile = async path => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const modelURL = moduleURL(await compile('../src/electoral/model.ts'));
const helper = (await compile('../src/lib/electoralNotifications.ts')).replaceAll("from '@/electoral/model'", `from '${modelURL}'`);
const { electoralAnnouncementNotifications: project } = await import(moduleURL(helper));
const start = new Date('2026-10-18T15:00:00Z'), end = new Date('2026-10-18T16:00:00Z');
const announcement = { id:'test', title:'Aviso', body:'Información vigente.', status:'published', electionId:'', pinned:true, startsAt:start, endsAt:end, createdAt:new Date('2026-10-18T14:00:00Z'), updatedAt:new Date('2026-10-18T14:30:00Z'), createdBy:'ceo', updatedBy:'ceo' };
let count = 0;
const test = (name, run) => { try { run(); count++; } catch (error) { console.error(name); throw error; } };
test('scheduled announcement activates exactly at inclusive start', () => {
  assert.equal(project([announcement],new Date(start.getTime()-1)).length,0);
  assert.equal(project([announcement],start).length,1);
});
test('end is exclusive and removes the virtual notification', () => {
  assert.equal(project([announcement],new Date(end.getTime()-1)).length,1);
  assert.equal(project([announcement],end).length,0);
});
test('draft and withdrawn never enter notification feed', () => {
  assert.equal(project(['draft','withdrawn'].map(status=>({...announcement,status})),start).length,0);
});
test('read identity is stable across snapshots and fresh Date instances', () => {
  assert.equal(project([announcement],start)[0].id,project([{...announcement,startsAt:new Date(start),updatedAt:new Date(announcement.updatedAt)}],new Date(start))[0].id);
});
test('editing and rescheduling create a distinct readable version', () => {
  const old = project([announcement],start)[0];
  assert.notEqual(old.id,project([{...announcement,updatedAt:new Date(start)}],start)[0].id);
  assert.notEqual(old.id,project([{...announcement,startsAt:new Date(start.getTime()-1)}],start)[0].id);
});
test('scheduled notices use publication time for mark-all-read cutoff', () => {
  assert.equal(project([announcement],start)[0].createdAt.getTime(),start.getTime());
});
test('updated notice uses update timestamp and standard announcement preferences', () => {
  const item=project([{...announcement,updatedAt:new Date(start.getTime()+1000)}],new Date(start.getTime()+2000))[0];
  assert.equal(item.createdAt.getTime(),start.getTime()+1000);
  assert.equal(item.category,'announcement');assert.equal(item.fuente,'electoral');assert.equal(item.linkTo,'/dashboard/elecciones');assert.equal(item.important,true);
});
test('legacy absent update timestamp falls back to valid publication date', () => {
  const item=project([{...announcement,updatedAt:new Date(NaN)}],start)[0];
  assert.equal(item.createdAt.getTime(),start.getTime());assert.equal(item.id.includes('NaN'),false);
});
test('malformed dates and windows are excluded', () => {
  assert.equal(project([{...announcement,startsAt:new Date(NaN)},{...announcement,endsAt:start}],start).length,0);
});
test('input records are not mutated by projection or removal', () => {
  const copy=structuredClone(announcement);project([announcement],start);project([announcement],end);assert.deepEqual(announcement,copy);
});
console.log(`Electoral notifications: ${count} scenarios passed (publication windows, withdrawal, update versions and read identity).`);
