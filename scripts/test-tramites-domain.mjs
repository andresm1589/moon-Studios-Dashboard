import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Ejecuta el modelo entregado, sin Firebase, red ni datos del personal.
const source = await readFile(new URL('../src/lib/tramitesDocumentoModelo.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
let checks = 0;
function test(name, run) { try { run(); checks++; } catch (error) { console.error(`FAIL ${name}`); throw error; } }
const base = { tipoId: 'constancia', tipoNombre: 'Constancia laboral', solicitanteNombre: 'Persona de prueba', solicitanteRol: 'Diseño', respuestas: { area: 'Marca' } };
const draft = model.crearBorradorDocumento(base);
test('constancia uses designed template', () => assert.equal(draft.plantilla, 'constancia'));
test('credential uses designed card template', () => assert.equal(model.crearBorradorDocumento({ ...base, tipoId: 'tarjeta' }).plantilla, 'credencial'));
test('general procedure uses response template', () => assert.equal(model.crearBorradorDocumento({ ...base, tipoId: 'permiso' }).plantilla, 'respuesta'));
test('suggested content names actual applicant', () => assert.match(draft.contenido, /Persona de prueba/));
test('suggested position and area remain editable text', () => assert.deepEqual([draft.cargo, draft.area], ['Diseño', 'Marca']));
test('defaults satisfy document validation', () => assert.equal(model.validarBorradorDocumento(draft), null));
test('general long name produces bounded title', () => assert.equal(model.validarBorradorDocumento(model.crearBorradorDocumento({ ...base, tipoId: 'otro', tipoNombre: 'Trámite '.repeat(20) })), null));
for (const date of ['2028-02-29', '2026-10-18', '1900-01-01', '2200-12-31']) test(`valid calendar ${date}`, () => assert.equal(model.esFechaTramite(date), true));
for (const date of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-1', '0000-01-01', '2201-01-01', '2026-10-18T10:00:00Z', '']) test(`invalid calendar ${date}`, () => assert.equal(model.esFechaTramite(date), false));
for (const [name, patch] of [
  ['unknown template', { plantilla: 'otro' }], ['short title', { titulo: ' A ' }], ['long title', { titulo: 'x'.repeat(101) }], ['empty content', { contenido: '  ' }], ['long content', { contenido: 'x'.repeat(6001) }],
  ['long position', { cargo: 'x'.repeat(101) }], ['long area', { area: 'x'.repeat(101) }], ['invalid expiration', { vigenteHasta: '2026-02-30' }], ['nonstring field', { cargo: 3 }],
]) test(name, () => assert.ok(model.validarBorradorDocumento({ ...draft, ...patch })));
test('optional expiration stays empty', () => assert.equal(model.limpiarBorradorDocumento(draft).vigenteHasta, ''));
test('credential title is limited to its designed format', () => assert.ok(model.validarBorradorDocumento({ ...draft, plantilla: 'credencial', titulo: 'x'.repeat(61) })));
test('credential content is limited without silently truncating it', () => assert.ok(model.validarBorradorDocumento({ ...draft, plantilla: 'credencial', contenido: 'x'.repeat(241) })));
test('a letter retains its complete larger content', () => assert.equal(model.limpiarBorradorDocumento({ ...draft, contenido: 'x'.repeat(6000) }).contenido.length, 6000));
test('draft content is trimmed before persistence', () => assert.equal(model.limpiarBorradorDocumento({ ...draft, contenido: '  Texto final  ' }).contenido, 'Texto final'));
test('bad draft cannot be silently repaired', () => assert.throws(() => model.limpiarBorradorDocumento({ ...draft, titulo: '' })));
const document = { ...draft, version: 1, folio: 'MS-DOC-REQUEST-A', solicitudId: 'request-a', destinatarioUid: 'employee123', destinatarioNombre: 'Persona de prueba', destinatarioCodigo: 'MS-EMPLOYEE', emitidoPor: 'ceo', emitidoPorNombre: 'Dirección de prueba', emitidoAt: new Date('2026-10-18T16:00:00Z') };
test('Date normalizes delivered document', () => assert.equal(model.normalizarDocumento(document).folio, document.folio));
test('Firestore timestamp normalizes delivered document', () => assert.equal(model.normalizarDocumento({ ...document, emitidoAt: { toDate: () => document.emitidoAt } }).emitidoAt.getTime(), document.emitidoAt.getTime()));
test('normalized date is isolated from caller', () => assert.notEqual(model.normalizarDocumento(document).emitidoAt, document.emitidoAt));
for (const [name, patch] of [
  ['pending server timestamp', { emitidoAt: null }], ['invalid date', { emitidoAt: new Date(NaN) }], ['unknown version', { version: 2 }], ['forged folio', { folio: 'MS-DOC-OTHER' }],
  ['forged employee code', { destinatarioCodigo: 'MS-OTHER' }], ['missing recipient', { destinatarioNombre: '' }], ['missing issuer', { emitidoPor: '' }], ['invalid stored content', { contenido: '' }],
]) test(name, () => assert.equal(model.normalizarDocumento({ ...document, ...patch }), undefined));
test('missing document remains absent for historical approvals', () => assert.equal(model.normalizarDocumento(undefined), undefined));
test('throwing timestamp remains undeliverable', () => assert.equal(model.normalizarDocumento({ ...document, emitidoAt: { toDate() { throw new Error('pending'); } } }), undefined));
console.log(`Trámites document domain: ${checks} synthetic checks passed.`);
