import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Ejecuta las funciones que entrega la aplicación contra un adaptador de
// transacciones en memoria. No conecta a Firebase ni crea trámites reales.
let runtime;
const missing = Symbol('missing');
class Timestamp { constructor(date = new Date('2026-10-18T16:00:00Z')) { this.date = date; } toDate() { return new Date(this.date.getTime()); } }
const auth = { currentUser: null }, db = {};
const ref = (path, kind = 'doc', constraints = []) => ({ path, kind, constraints, id: path.split('/').at(-1) });
const snap = (path, value = missing) => ({ id: path.split('/').at(-1), exists: () => value !== missing, data: () => value });
const firestore = {
  Timestamp, serverTimestamp: () => new Timestamp(),
  collection: (_db, path) => ref(path, 'collection'),
  doc: (first, ...parts) => first.kind === 'collection' ? ref(`${first.path}/${parts[0] || `Request${++runtime.counter}`}`) : ref(parts.join('/')),
  where: (field, operator, value) => ({ field, operator, value }), query: (source, ...constraints) => ({ ...source, constraints }),
  async getDoc(source) { return snap(source.path, runtime.docs.get(source.path) ?? missing); },
  async getDocs(source) { return { docs: [...runtime.docs].filter(([path]) => path.startsWith(`${source.path}/`)).filter(([, data]) => source.constraints.every(({ field, operator, value }) => operator === '==' ? data[field] === value : value.includes(data[field]))).map(([path, data]) => snap(path, data)) }; },
  onSnapshot(source, next, error) { const listener = { source, next, error }; runtime.listeners.push(listener); return () => {}; },
  async runTransaction(_db, callback) {
    const execute = async () => {
      const writes = [];
      const tx = {
        async get(source) { assert.equal(writes.length, 0, 'Firestore reads must precede all transaction writes'); runtime.reads.push(source.path); const data = runtime.docs.get(source.path) ?? missing; runtime.afterRead?.(source.path); return snap(source.path, data); },
        set: (source, data) => writes.push({ kind: 'set', source, data }), update: (source, data) => writes.push({ kind: 'update', source, data }),
      };
      await callback(tx); return writes;
    };
    let writes = await execute();
    if (runtime.retry) { const retry = runtime.retry; runtime.retry = null; retry(); writes = await execute(); }
    runtime.commit(writes);
  },
  writeBatch() { const writes = []; return { set: (source, data) => writes.push({ kind: 'set', source, data }), update: (source, data) => writes.push({ kind: 'update', source, data }), commit: async () => runtime.commit(writes) }; },
};
const loaded = new Map();
async function load(path) {
  if (loaded.has(path)) return loaded.get(path);
  const source = await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = { 'firebase/firestore': firestore, '@/lib/firebase': { auth, db, logActivity: (...args) => { runtime.logs.push(args); return runtime.logFailure ? Promise.reject(new Error('synthetic audit unavailable')) : Promise.resolve(); } } };
  if (path === 'lib/tramites') { imports['@/types'] = await load('types/index'); imports['./tramitesDocumentoModelo'] = await load('lib/tramitesDocumentoModelo'); }
  const output = {};
  Function('require', 'exports', code)(key => { if (!(key in imports)) throw new Error(`Unexpected import: ${key}`); return imports[key]; }, output);
  loaded.set(path, output); return output;
}
const domain = await load('lib/tramites'), model = await load('lib/tramitesDocumentoModelo');
const employee = { uid: 'employee123', nombre: 'Untrusted UI name', rol: 'CEO' };
const ceo = { uid: 'ceo', nombre: 'Untrusted issuer', rol: 'Empleado' };
const admin = { uid: 'admin', nombre: 'Administration', rol: 'Administración' };
const profile = (role = 'Empleado', displayName = '  Persona del perfil  ', extra = {}) => ({ role, displayName, email: 'profile@example.test', isActive: true, ...extra });
function fresh() {
  runtime = {
    docs: new Map(), writes: [], reads: [], logs: [], listeners: [], counter: 0,
    commit(writes) { if (this.commitFailure) throw new Error('synthetic network failure'); this.writes.push(...writes); for (const write of writes) this.docs.set(write.source.path, write.kind === 'update' ? { ...this.docs.get(write.source.path), ...write.data } : write.data); },
  };
  auth.currentUser = { uid: employee.uid };
  runtime.docs.set(`users/${employee.uid}`, profile()); runtime.docs.set('users/ceo', profile('CEO', '  Dirección real  ')); runtime.docs.set('users/admin', profile('Administración', 'Administración real'));
  for (const type of domain.TRAMITES_BASE) runtime.docs.set(`tramites_tipos/${type.id}`, { ...type });
  return runtime;
}
function seedRequest(extra = {}) {
  const data = { tipoId: 'tarjeta', tipoNombre: 'Tarjeta Moon Studios', solicitanteUid: employee.uid, solicitanteNombre: 'Nombre histórico', solicitanteRol: 'Empleado', respuestas: { gestion: 'Primera emisión', entrega: 'Digital (PDF)' }, estado: 'pendiente', comentario: '', soloCeo: false, createdAt: new Timestamp(), updatedAt: new Timestamp(), ...extra };
  runtime.docs.set('tramites_solicitudes/existing', data); return { id: 'existing', ...data };
}
const draft = model.crearBorradorDocumento({ tipoId: 'tarjeta', tipoNombre: 'Tarjeta Moon Studios', solicitanteNombre: 'Nombre histórico', solicitanteRol: 'Empleado' });
const card = () => domain.TRAMITES_BASE.find(item => item.id === 'tarjeta');
const answers = { gestion: 'Primera emisión', entrega: 'Digital (PDF)' };
let checks = 0;
async function test(name, run) { fresh(); try { await run(); checks++; } catch (error) { console.error(`FAIL ${name}`); throw error; } }
await test('request persists once using actual profile rather than UI identity', async () => {
  const id = await domain.solicitarTramite(card(), answers, employee, ['arbitrary-notification-target']); const saved = runtime.docs.get(`tramites_solicitudes/${id}`);
  assert.equal(saved.solicitanteNombre, 'Persona del perfil'); assert.equal(saved.solicitanteRol, 'Empleado'); assert.equal(saved.estado, 'pendiente'); assert.equal(runtime.writes.length, 1); assert.ok(runtime.writes.every(write => !write.source.path.startsWith('notifications/')));
});
await test('snapshot preserves labels, order and optional empty values', async () => { const id = await domain.solicitarTramite(card(), answers, employee); const saved = runtime.docs.get(`tramites_solicitudes/${id}`); assert.deepEqual(saved.camposRespuesta.map(c => [c.id, c.etiqueta, c.valor]), [['gestion', 'Gestión', 'Primera emisión'], ['entrega', 'Formato', 'Digital (PDF)'], ['detalle', 'Detalle', '']]); assert.equal(saved.respuestas.detalle, ''); assert.deepEqual(Object.keys(saved.respuestas), saved.camposRespuesta.map(c => c.id)); });
await test('fresh catalog determines name and CEO visibility', async () => { runtime.docs.set('tramites_tipos/tarjeta', { ...card(), nombre: 'Credencial vigente', soloCeo: true }); const id = await domain.solicitarTramite(card(), answers, employee); const saved = runtime.docs.get(`tramites_solicitudes/${id}`); assert.equal(saved.tipoNombre, 'Credencial vigente'); assert.equal(saved.soloCeo, true); });
await test('fresh required field rejects stale form', async () => { runtime.docs.set('tramites_tipos/tarjeta', { ...card(), campos: [...card().campos, { id: 'nuevo', etiqueta: 'Dato nuevo', tipo: 'texto', requerido: true }] }); await assert.rejects(domain.solicitarTramite(card(), answers, employee), /Dato nuevo/); assert.equal(runtime.writes.length, 0); });
await test('fresh changed option rejects stale choice', async () => { runtime.docs.set('tramites_tipos/tarjeta', { ...card(), campos: card().campos.map(c => c.id === 'entrega' ? { ...c, opciones: ['Presencial', 'Correo'] } : c) }); await assert.rejects(domain.solicitarTramite(card(), answers, employee), /opción válida/); });
await test('deactivated catalog type cannot receive requests', async () => { runtime.docs.set('tramites_tipos/tarjeta', { ...card(), activo: false }); await assert.rejects(domain.solicitarTramite(card(), answers, employee), /desactivado/); });
await test('deleted catalog type cannot receive requests', async () => { runtime.docs.delete('tramites_tipos/tarjeta'); await assert.rejects(domain.solicitarTramite(card(), answers, employee), /no está disponible/); });
await test('unknown removed field cannot be smuggled into answers', async () => { await assert.rejects(domain.solicitarTramite(card(), { ...answers, extra: 'private' }, employee), /formulario cambió/); });
await test('request network failure has no partial writes', async () => { runtime.commitFailure = true; await assert.rejects(domain.solicitarTramite(card(), answers, employee), /network failure/); assert.equal(runtime.writes.length, 0); });
await test('transaction retry retains ID and writes only once', async () => { runtime.retry = () => runtime.docs.set('tramites_tipos/tarjeta', { ...card(), nombre: 'Nombre actualizado' }); const id = await domain.solicitarTramite(card(), answers, employee); assert.equal(runtime.writes.length, 1); assert.equal(runtime.docs.get(`tramites_solicitudes/${id}`).tipoNombre, 'Nombre actualizado'); assert.equal(runtime.counter, 1); });
await test('retry revalidates newly disabled catalog and commits nothing', async () => { runtime.retry = () => runtime.docs.set('tramites_tipos/tarjeta', { ...card(), activo: false }); await assert.rejects(domain.solicitarTramite(card(), answers, employee), /desactivado/); assert.equal(runtime.writes.length, 0); });
for (const mutation of [{ isActive: false }, { isActive: 'true' }, { role: 'external' }, { role: 'ceo' }]) await test(`noncorporate requester blocked ${JSON.stringify(mutation)}`, async () => { runtime.docs.set(`users/${employee.uid}`, profile('Empleado', 'Persona', mutation)); await assert.rejects(domain.solicitarTramite(card(), answers, employee), /cuenta activa/); });
await test('legacy active profile missing flag remains corporate', async () => { const data = profile(); delete data.isActive; runtime.docs.set(`users/${employee.uid}`, data); await domain.solicitarTramite(card(), answers, employee); assert.equal(runtime.writes.length, 1); });
await test('request rejects account switch while loading profile', async () => { runtime.afterRead = path => { if (path === `users/${employee.uid}`) auth.currentUser = { uid: 'someone-else' }; }; await assert.rejects(domain.solicitarTramite(card(), answers, employee), /sesión cambió/); assert.equal(runtime.writes.length, 0); });
await test('base initialization preserves all existing custom catalog records', async () => { auth.currentUser = { uid: ceo.uid }; const custom = { ...card(), nombre: 'Mi tarjeta personalizada', activo: false }; runtime.docs.set('tramites_tipos/tarjeta', custom); await domain.cargarTramitesBase(ceo); assert.equal(runtime.docs.get('tramites_tipos/tarjeta'), custom); assert.equal(runtime.writes.length, 0); });
await test('base initialization only fills genuinely missing IDs', async () => { auth.currentUser = { uid: ceo.uid }; runtime.docs.delete('tramites_tipos/constancia'); await domain.cargarTramitesBase(ceo); assert.deepEqual(runtime.writes.map(w => w.source.path), ['tramites_tipos/constancia']); });
await test('employee cannot initialize catalog by faking actor CEO', async () => { await assert.rejects(domain.cargarTramitesBase(employee), /permiso/); });
await test('administration catalog delegation is rechecked', async () => { auth.currentUser = { uid: admin.uid }; runtime.docs.set('moon_acceso/administracion', { tramites: { catalogo: false } }); await assert.rejects(domain.cargarTramitesBase(admin), /permiso/); });
await test('catalog save preserves original creation metadata', async () => { auth.currentUser = { uid: ceo.uid }; const original = new Timestamp(new Date('2020-01-01')); runtime.docs.set('tramites_tipos/tarjeta', { ...card(), createdBy: 'founder', createdAt: original }); await domain.guardarTipo({ ...card(), nombre: 'Tarjeta renovada' }, false, ceo); const saved = runtime.docs.get('tramites_tipos/tarjeta'); assert.equal(saved.createdBy, 'founder'); assert.equal(saved.createdAt, original); });
await test('cancel only reads the current request and changes allowed fields', async () => { seedRequest(); await domain.cancelarTramite('existing'); const write = runtime.writes.at(-1); assert.deepEqual(Object.keys(write.data).sort(), ['estado', 'updatedAt']); assert.equal(write.data.estado, 'cancelado'); });
for (const state of ['en_revision', 'aprobado', 'rechazado', 'cancelado']) await test(`already ${state} cannot be canceled`, async () => { seedRequest({ estado: state }); await assert.rejects(domain.cancelarTramite('existing'), /cancelar|atendiendo|resuelta/); });
await test('other employee request cannot be canceled', async () => { seedRequest({ solicitanteUid: 'another' }); await assert.rejects(domain.cancelarTramite('existing'), /propias/); });
await test('CEO can review using authentic current issuer profile', async () => { const request = seedRequest(); auth.currentUser = { uid: ceo.uid }; await domain.resolverTramite(request, 'en_revision', '  Revisando  ', ceo); const saved = runtime.docs.get('tramites_solicitudes/existing'); assert.equal(saved.resueltoPorNombre, 'Dirección real'); assert.equal(saved.comentario, 'Revisando'); });
await test('stale UI request cannot overwrite completed review', async () => { const request = seedRequest(); runtime.docs.set('tramites_solicitudes/existing', { ...request, estado: 'cancelado' }); auth.currentUser = { uid: ceo.uid }; await assert.rejects(domain.resolverTramite(request, 'aprobado', '', ceo), /ya resolvió o canceló/); });
await test('review state cannot be resubmitted as a new update', async () => { const request = seedRequest({ estado: 'en_revision' }); auth.currentUser = { uid: ceo.uid }; await assert.rejects(domain.resolverTramite(request, 'en_revision', '', ceo), /ya está en revisión/); });
await test('rejection requires reason and creates no document', async () => { const request = seedRequest(); auth.currentUser = { uid: ceo.uid }; await assert.rejects(domain.resolverTramite(request, 'rechazado', ' ', ceo), /motivo/); await domain.resolverTramite(request, 'rechazado', 'Motivo informado', ceo); assert.equal(runtime.docs.get('tramites_solicitudes/existing').documento, undefined); });
await test('document only accompanies an approval', async () => { const request = seedRequest(); auth.currentUser = { uid: ceo.uid }; await assert.rejects(domain.resolverTramite(request, 'en_revision', '', ceo, draft), /solo se entrega al aprobar/); });
await test('approval and document delivery are one atomic write', async () => { const request = seedRequest(); auth.currentUser = { uid: ceo.uid }; await domain.resolverTramite(request, 'aprobado', '', ceo, draft); const saved = runtime.docs.get('tramites_solicitudes/existing'); assert.equal(runtime.writes.filter(w => w.source.path.startsWith('tramites_solicitudes/')).length, 1); assert.equal(saved.estado, 'aprobado'); const publico = runtime.writes.filter(w => w.source.path.startsWith('moon_verificacion/')); assert.equal(publico.length, 1, 'La tarjeta o constancia deja su registro público en la misma transacción'); assert.equal(publico[0].source.path, `moon_verificacion/MS-EMPLOYEE_${draft.plantilla}`); assert.deepEqual(Object.keys(publico[0].data).sort(), ['area', 'cargo', 'codigo', 'emitidoAt', 'estado', 'folio', 'nombre', 'plantilla', 'solicitudId', 'titulo', 'vigenteHasta']); assert.equal(publico[0].data.nombre, 'Persona del perfil'); assert.equal(publico[0].data.estado, 'vigente'); assert.equal(runtime.writes.length, 2); assert.equal(saved.documento.destinatarioNombre, 'Persona del perfil'); assert.equal(saved.documento.emitidoPorNombre, 'Dirección real'); assert.equal(saved.documento.folio, 'MS-DOC-EXISTING'); assert.equal(saved.documento.destinatarioCodigo, 'MS-EMPLOYEE'); assert.ok(model.normalizarDocumento(saved.documento)); });
await test('historical approved request can receive its first document', async () => { const request = seedRequest({ estado: 'aprobado', resueltoPor: 'original-reviewer' }); auth.currentUser = { uid: ceo.uid }; await domain.emitirDocumentoTramite(request, draft, ceo); const saved = runtime.docs.get('tramites_solicitudes/existing'); assert.equal(saved.resueltoPor, 'original-reviewer'); assert.equal(saved.documento.solicitudId, 'existing'); assert.deepEqual(Object.keys(runtime.writes[0].data).sort(), ['documento', 'updatedAt']); });
for (const state of ['pendiente', 'en_revision', 'rechazado', 'cancelado']) await test(`cannot emit for ${state}`, async () => { const request = seedRequest({ estado: state }); auth.currentUser = { uid: ceo.uid }; await assert.rejects(domain.emitirDocumentoTramite(request, draft, ceo), /Aprueba/); });
await test('second issuance cannot replace an issued document', async () => { const request = seedRequest({ estado: 'aprobado' }); auth.currentUser = { uid: ceo.uid }; await domain.emitirDocumentoTramite(request, draft, ceo); const original = runtime.docs.get('tramites_solicitudes/existing').documento; await assert.rejects(domain.emitirDocumentoTramite(request, { ...draft, contenido: 'Reemplazo' }, ceo), /ya fue emitido/); assert.equal(runtime.docs.get('tramites_solicitudes/existing').documento, original); });
await test('malformed stored document also blocks replacement', async () => { const request = seedRequest({ estado: 'aprobado', documento: { version: 9 } }); auth.currentUser = { uid: ceo.uid }; await assert.rejects(domain.emitirDocumentoTramite(request, draft, ceo), /ya fue emitido/); });
for (const mutation of [{ isActive: false }, { isActive: 'true' }, { role: 'external' }]) await test(`cannot issue to inactive or external profile ${JSON.stringify(mutation)}`, async () => { const request = seedRequest(); runtime.docs.set(`users/${employee.uid}`, profile('Empleado', 'Persona', mutation)); auth.currentUser = { uid: ceo.uid }; await assert.rejects(domain.resolverTramite(request, 'aprobado', '', ceo, draft), /cuenta activa/); assert.equal(runtime.writes.length, 0); });
await test('administrator can issue delegated request for someone else', async () => { const request = seedRequest(); auth.currentUser = { uid: admin.uid }; await domain.resolverTramite(request, 'aprobado', '', admin, draft); assert.equal(runtime.docs.get('tramites_solicitudes/existing').documento.emitidoPor, 'admin'); });
await test('administrator delegation revoked after UI load blocks review', async () => { const request = seedRequest(); auth.currentUser = { uid: admin.uid }; runtime.docs.set('moon_acceso/administracion', { tramites: { resolver: false } }); await assert.rejects(domain.resolverTramite(request, 'aprobado', '', admin, draft), /permiso/); });
await test('administrator cannot review own request', async () => { const request = seedRequest({ solicitanteUid: 'admin' }); auth.currentUser = { uid: admin.uid }; await assert.rejects(domain.resolverTramite(request, 'aprobado', '', admin, draft), /permiso/); });
await test('administrator cannot review CEO-only request', async () => { const request = seedRequest({ soloCeo: true }); auth.currentUser = { uid: admin.uid }; await assert.rejects(domain.resolverTramite(request, 'aprobado', '', admin, draft), /permiso/); });
await test('CEO can issue own request as existing corporate permission allows', async () => { const request = seedRequest({ solicitanteUid: 'ceo', soloCeo: true }); auth.currentUser = { uid: ceo.uid }; await domain.resolverTramite(request, 'aprobado', '', ceo, draft); assert.equal(runtime.docs.get('tramites_solicitudes/existing').documento.destinatarioUid, 'ceo'); });
await test('fake UI CEO cannot review employee account', async () => { const request = seedRequest({ solicitanteUid: 'someone-else' }); await assert.rejects(domain.resolverTramite(request, 'aprobado', '', employee), /permiso/); });
await test('issuance transaction retry detects another issued original', async () => { const request = seedRequest({ estado: 'aprobado' }); auth.currentUser = { uid: ceo.uid }; runtime.retry = () => runtime.docs.set('tramites_solicitudes/existing', { ...request, documento: { version: 1, folio: 'already-issued' } }); await assert.rejects(domain.emitirDocumentoTramite(request, draft, ceo), /ya fue emitido/); assert.equal(runtime.writes.length, 0); });
await test('issuer account switch during recipient read prevents delivery', async () => { const request = seedRequest(); auth.currentUser = { uid: ceo.uid }; runtime.afterRead = path => { if (path === `users/${employee.uid}`) auth.currentUser = { uid: 'another' }; }; await assert.rejects(domain.resolverTramite(request, 'aprobado', '', ceo, draft), /sesión cambió/); assert.equal(runtime.writes.length, 0); });
await test('audit failure after approval does not fail or duplicate its committed delivery', async () => { const request = seedRequest(); auth.currentUser = { uid: ceo.uid }; runtime.logFailure = true; const original = console.error; console.error = () => {}; try { await domain.resolverTramite(request, 'aprobado', '', ceo, draft); } finally { console.error = original; } assert.equal(runtime.writes.filter(w => w.source.path.startsWith('tramites_solicitudes/')).length, 1); assert.equal(runtime.docs.get('tramites_solicitudes/existing').estado, 'aprobado'); });
await test('listeners normalize original delivered document and captured labels', () => { const request = seedRequest(); auth.currentUser = { uid: ceo.uid }; let items; domain.escucharSolicitudes(ceo.uid, true, value => { items = value; }, error => { throw error; }); const listener = runtime.listeners.at(-1); listener.next({ docs: [snap('tramites_solicitudes/existing', { ...request, camposRespuesta: [{ id: 'detalle', etiqueta: 'Etiqueta original', tipo: 'texto', valor: 'Conservado' }] })] }); assert.equal(items[0].camposRespuesta[0].etiqueta, 'Etiqueta original'); assert.equal(items[0].documento, undefined); });
for (const [name, type, input] of [
  ['required', card(), {}], ['bad option', card(), { ...answers, entrega: 'Unknown' }], ['long answer', card(), { ...answers, detalle: 'x'.repeat(1501) }],
  ['nonstring answer', card(), { ...answers, detalle: 42 }], ['invalid calendar', domain.TRAMITES_BASE[0], { desde: '2026-02-31', hasta: '2026-03-01' }], ['reversed dates', domain.TRAMITES_BASE[0], { desde: '2026-10-20', hasta: '2026-10-19' }],
]) await test(`answer validator rejects ${name}`, () => assert.ok(domain.validarRespuestas(type, input)));
await test('valid vacation dates accepted', () => assert.equal(domain.validarRespuestas(domain.TRAMITES_BASE[0], { desde: '2026-10-20', hasta: '2026-10-21' }), null));
await test('duplicated catalog field IDs rejected before saving', () => assert.ok(domain.validarTipo({ ...card(), campos: [card().campos[0], card().campos[0]] })));
await test('duplicated options rejected before saving', () => assert.ok(domain.validarTipo({ ...card(), campos: [{ ...card().campos[0], opciones: ['Uno', 'Uno'] }] })));
console.log(`Trámites runtime: ${checks} synthetic checks passed.`);
