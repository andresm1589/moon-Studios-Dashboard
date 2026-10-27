// Pruebas y despliegue del bloque «TRÁMITES Y ACCESO» de las reglas de Firestore.
//
//   node scripts/test-tramites-rules-v2.mjs            → compone y prueba (no despliega nada)
//   node scripts/test-tramites-rules-v2.mjs --deploy   → prueba y, si todo pasa, publica
//
// Toma las reglas ACTIVAS en producción y solo reemplaza (o inserta antes del
// sistema electoral) el bloque de firebase/tramites.rules.fragment. Comprueba que
// el resto del archivo quede idéntico. Las pruebas usan la Rules API con datos
// simulados: nunca lee ni escribe documentos de la base.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROYECTO = 'moon-studios-16102025';
const API = 'https://firebaserules.googleapis.com/v1/';
const QA = join(RAIZ, '.moon-qa', 'tramites-v2');
const EXPECTED_BASELINE = 'projects/moon-studios-16102025/rulesets/59302133-fad8-4c47-b768-714c76af1c3f';
const FRAGMENTO = readFileSync(join(RAIZ, 'firebase', 'tramites.rules.fragment'), 'utf8');
const REGION = /^[ \t]*\/\/ ===== MOON STUDIOS - TRÁMITES Y ACCESO =====[\s\S]*?^[ \t]*\/\/ ===== FIN TRÁMITES Y ACCESO =====\r?\n(?:\r?\n)?/m;
const ELECTORAL = '    // ===== SISTEMA ELECTORAL =====';
const desplegar = process.argv.includes('--deploy');
const soloCapturas = process.argv.includes('--capture-only');
if (desplegar && soloCapturas) throw new Error('El despliegue exige la suite completa.');
const sha = texto => createHash('sha256').update(texto).digest('hex');
mkdirSync(QA, { recursive: true });

const token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: true }).trim();
if (!token) throw new Error('No hay una sesión de Google Cloud.');
const cabeceras = { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROYECTO, 'Content-Type': 'application/json; charset=utf-8' };
async function api(ruta, opciones = {}) {
  const lectura = !opciones.method || opciones.method === 'GET' || ruta.endsWith(':test');
  for(let intento=0;;intento++) {
    try {
      const respuesta = await fetch(API + ruta, { ...opciones, headers: cabeceras });
      if(lectura && intento<2 && (respuesta.status===429 || respuesta.status>=500)) {
        await respuesta.body?.cancel();
        await new Promise(resolve=>setTimeout(resolve,500*(intento+1)));
        continue;
      }
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(`${ruta}: ${respuesta.status} ${JSON.stringify(cuerpo.error ?? cuerpo).slice(0, 400)}`);
      return cuerpo;
    } catch(error) {
      if(!lectura || intento>=2 || !['ECONNRESET','ETIMEDOUT','UND_ERR_SOCKET','ENOTFOUND'].includes(error.cause?.code)) throw error;
      await new Promise(resolve=>setTimeout(resolve,500*(intento+1)));
    }
  }
}

// ─── Composición ─────────────────────────────────────────────────────────────
// Colecciones permitidas en el bloque: límites, catálogo, solicitudes y la consulta pública.
const COLECCIONES = ['/moon_acceso/{docId}', '/tramites_tipos/{tipoId}', '/tramites_solicitudes/{solicitudId}', '/moon_verificacion/{verifId}',
  // Moon Studios Conferencias (solo lectura desde clientes)
  '/moon_conf_eventos/{eventoId}', '/conf_invitaciones/{invId}', '/asistencia/{asistenciaId}', '/avisos/{avisoId}', '/espera/{uid}',
  '/auditoria/{registroId}', '/moon_conf_accesos/{accesoId}', '/moon_conf_servidor/{docId}'];
const encontradas = [...FRAGMENTO.matchAll(/match (\/[^\s]+) \{/g)].map(m => m[1]);
if (encontradas.length !== COLECCIONES.length || encontradas.some(m => !COLECCIONES.includes(m)) || !REGION.test(FRAGMENTO)) throw new Error('Fragmento fuera del alcance de trámites.');
const release = await api(`projects/${PROYECTO}/releases/cloud.firestore`);
const ruleset = await api(release.rulesetName);
const activo = ruleset.source.files.find(f => f.name === 'firestore.rules')?.content;
if (!activo || ruleset.source.files.length !== 1) throw new Error('Se esperaba un único firestore.rules activo.');
// Se admite una publicación posterior de Trámites si mantiene intacta la base
// corporativa/electoral revisada. Nunca se recompone desde una copia local.
const baseRevisada = release.rulesetName === EXPECTED_BASELINE ? ruleset : await api(EXPECTED_BASELINE);
const contenidoBase = baseRevisada.source.files.find(f => f.name === 'firestore.rules')?.content;
if (!contenidoBase || activo.replace(REGION, '') !== contenidoBase.replace(REGION, '')) {
  throw new Error('Las reglas activas cambiaron fuera de Trámites respecto de la base v5 revisada.');
}
let propuesto;
if (REGION.test(activo)) propuesto = activo.replace(REGION, () => FRAGMENTO);
else {
  const i = activo.indexOf(ELECTORAL);
  if (i < 0 || activo.indexOf(ELECTORAL, i + 1) >= 0) throw new Error('No se encontró un único inicio del bloque electoral.');
  propuesto = activo.slice(0, i) + FRAGMENTO + activo.slice(i);
}
const fuera = texto => texto.replace(REGION, '');
if (fuera(propuesto) !== fuera(activo)) throw new Error('La composición cambia reglas fuera del bloque de trámites.');
writeFileSync(join(QA, 'activo.rules'), activo);
writeFileSync(join(QA, 'baseline-release.json'),JSON.stringify(release,null,2));
writeFileSync(join(QA, 'propuesto.rules'), propuesto);
console.log(`Reglas activas: ${release.rulesetName}. Solo cambia el bloque de trámites.`);

// ─── Casos ───────────────────────────────────────────────────────────────────
const T = '2026-10-18T12:00:00Z', ANTES = '2026-10-17T09:00:00Z';
const PREFIJO = '/databases/(default)/documents/';
const usuarios = {
  'users/ceo': { role: 'CEO', displayName:'CEO' }, 'users/admin': { role: 'Administración', displayName:'Revisor' }, 'users/admin2': { role: 'Administración', displayName:'Revisor' },
  'users/emp': { role: 'Empleado', displayName:'Persona' }, 'users/disenio': { role: 'Diseño', displayName:'Persona' }, 'users/inactivo': { role: 'Empleado', isActive: false }, 'users/cliente': { role: 'client' },
};
const tipo = (extra = {}) => ({ nombre: 'Vacaciones', descripcion: 'Días de descanso.', icono: 'vacaciones', campos: [{ id: 'desde', etiqueta: 'Desde', tipo: 'fecha', requerido: true }],
  activo: true, soloCeo: false, orden: 10, createdAt: ANTES, createdBy: 'ceo', updatedAt: ANTES, updatedBy: 'ceo', ...extra });
const tipos = {
  'tramites_tipos/vacaciones': tipo(),
  'tramites_tipos/constancia': tipo({ nombre: 'Constancia laboral', icono: 'constancia', soloCeo: true }),
  'tramites_tipos/oculto': tipo({ nombre: 'Trámite oculto', activo: false }),
  'tramites_tipos/fantasma': null,
};
const acceso = (resolver, catalogo) => ({ modulos: { admin: true, roles: true, webs: true, diseno: false, secretaria: false, programacion: false }, tramites: { resolver, catalogo }, updatedAt: ANTES, updatedBy: 'ceo', updatedByName: 'CEO' });
const SIN_LIMITES = { 'moon_acceso/administracion': null };
const RESTRINGIDO = { 'moon_acceso/administracion': acceso(false, false) };

const casos = [], etiquetas = [];
function caso(etiqueta, ruta, metodo, esperado, { uid, actual = null, nuevo = null, mundo = {} } = {}) {
  const docs = { ...usuarios, ...tipos, ...SIN_LIMITES, ...mundo };
  if (actual !== undefined) docs[ruta] = actual;
  const pedido = { path: PREFIJO + ruta, method: metodo, time: T, auth: uid ? { uid, token: { email: `${uid}@example.com` } } : null };
  if (metodo === 'create' || metodo === 'update') pedido.resource = { data: nuevo };
  const c = { expectation: esperado, request: pedido, expressionReportLevel: 'NONE', functionMocks: [] };
  if (actual) c.resource = { data: actual };
  for (const [r, valor] of Object.entries(docs)) for (const fn of ['get', 'getAfter', 'exists', 'existsAfter']) {
    c.functionMocks.push({ function: fn, args: [{ exactValue: PREFIJO + r }],
      result: fn.startsWith('exists') ? { value: valor !== null } : valor === null ? { undefined: {} } : { value: { data: valor } } });
  }
  casos.push(c); etiquetas.push(etiqueta);
}

// Límites de Administración
const accesoNuevo = (extra = {}) => ({ ...acceso(true, false), updatedAt: T, updatedBy: 'ceo', ...extra });
for (const uid of ['emp', 'admin', 'ceo']) caso(`${uid} lee los límites`, 'moon_acceso/administracion', 'get', 'ALLOW', { uid, actual: acceso(true, true) });
for (const uid of [null, 'cliente', 'inactivo']) caso(`${uid ?? 'anónimo'} no lee los límites`, 'moon_acceso/administracion', 'get', 'DENY', { uid, actual: acceso(true, true) });
caso('nadie lista los límites', 'moon_acceso/administracion', 'list', 'DENY', { uid: 'ceo', actual: acceso(true, true) });
caso('CEO crea los límites', 'moon_acceso/administracion', 'create', 'ALLOW', { uid: 'ceo', nuevo: accesoNuevo() });
caso('CEO actualiza los límites', 'moon_acceso/administracion', 'update', 'ALLOW', { uid: 'ceo', actual: acceso(true, true), nuevo: accesoNuevo() });
for (const uid of ['admin', 'emp']) {
  caso(`${uid} no crea límites`, 'moon_acceso/administracion', 'create', 'DENY', { uid, nuevo: accesoNuevo({ updatedBy: uid }) });
  caso(`${uid} no cambia límites`, 'moon_acceso/administracion', 'update', 'DENY', { uid, actual: acceso(false, false), nuevo: accesoNuevo({ updatedBy: uid }) });
}
caso('límites: otro documento', 'moon_acceso/otro', 'create', 'DENY', { uid: 'ceo', nuevo: accesoNuevo() });
caso('límites: clave extra', 'moon_acceso/administracion', 'create', 'DENY', { uid: 'ceo', nuevo: accesoNuevo({ extra: true }) });
caso('límites: módulo desconocido', 'moon_acceso/administracion', 'create', 'DENY', { uid: 'ceo', nuevo: accesoNuevo({ modulos: { ...acceso(1, 1).modulos, contador: true } }) });
caso('límites: falta un módulo', 'moon_acceso/administracion', 'create', 'DENY', { uid: 'ceo', nuevo: accesoNuevo({ modulos: { admin: true, roles: true, webs: true, diseno: false, secretaria: false } }) });
caso('límites: valor no booleano', 'moon_acceso/administracion', 'create', 'DENY', { uid: 'ceo', nuevo: accesoNuevo({ tramites: { resolver: 'sí', catalogo: false } }) });
caso('límites: firma ajena', 'moon_acceso/administracion', 'create', 'DENY', { uid: 'ceo', nuevo: accesoNuevo({ updatedBy: 'admin' }) });
caso('límites: hora falsa', 'moon_acceso/administracion', 'create', 'DENY', { uid: 'ceo', nuevo: accesoNuevo({ updatedAt: ANTES }) });
caso('nadie borra los límites', 'moon_acceso/administracion', 'delete', 'DENY', { uid: 'ceo', actual: acceso(true, true) });

// Catálogo
const tipoNuevo = (uid, extra = {}) => tipo({ nombre: 'Adelanto de sueldo', icono: 'dinero', createdAt: T, createdBy: uid, updatedAt: T, updatedBy: uid, ...extra });
for (const uid of ['emp', 'disenio', 'admin']) caso(`${uid} ve el catálogo`, 'tramites_tipos/vacaciones', 'list', 'ALLOW', { uid, actual: tipos['tramites_tipos/vacaciones'] });
for (const uid of [null, 'cliente', 'inactivo']) caso(`${uid ?? 'anónimo'} no ve el catálogo`, 'tramites_tipos/vacaciones', 'get', 'DENY', { uid, actual: tipos['tramites_tipos/vacaciones'] });
caso('Administración crea un trámite (por defecto)', 'tramites_tipos/adelanto', 'create', 'ALLOW', { uid: 'admin', nuevo: tipoNuevo('admin') });
caso('Administración sin permiso de catálogo no crea', 'tramites_tipos/adelanto', 'create', 'DENY', { uid: 'admin', nuevo: tipoNuevo('admin'), mundo: RESTRINGIDO });
caso('CEO crea aunque Administración esté limitada', 'tramites_tipos/adelanto', 'create', 'ALLOW', { uid: 'ceo', nuevo: tipoNuevo('ceo'), mundo: RESTRINGIDO });
caso('empleado no crea trámites', 'tramites_tipos/adelanto', 'create', 'DENY', { uid: 'emp', nuevo: tipoNuevo('emp') });
const invalidos = { 'nombre corto': { nombre: 'Ad' }, 'ícono desconocido': { icono: 'cohete' }, 'sin campos': { campos: [] }, 'orden decimal': { orden: 1.5 },
  'orden negativo': { orden: -1 }, 'clave extra': { color: 'rojo' }, 'autor ajeno': { createdBy: 'ceo' }, 'activo no booleano': { activo: 'sí' }, 'descripción larga': { descripcion: 'x'.repeat(401) } };
for (const [nombre, extra] of Object.entries(invalidos)) caso(`trámite inválido: ${nombre}`, 'tramites_tipos/adelanto', 'create', 'DENY', { uid: 'admin', nuevo: tipoNuevo('admin', extra) });
caso('identificador inválido', 'tramites_tipos/MalID', 'create', 'DENY', { uid: 'admin', nuevo: tipoNuevo('admin') });
const edicion = (uid, extra = {}) => tipo({ updatedAt: T, updatedBy: uid, descripcion: 'Nueva descripción.', ...extra });
caso('Administración edita el formulario', 'tramites_tipos/vacaciones', 'update', 'ALLOW', { uid: 'admin', actual: tipos['tramites_tipos/vacaciones'], nuevo: edicion('admin') });
caso('Administración no marca «Solo CEO»', 'tramites_tipos/vacaciones', 'update', 'DENY', { uid: 'admin', actual: tipos['tramites_tipos/vacaciones'], nuevo: edicion('admin', { soloCeo: true }) });
caso('Administración no quita «Solo CEO»', 'tramites_tipos/constancia', 'update', 'DENY', { uid: 'admin', actual: tipos['tramites_tipos/constancia'], nuevo: { ...edicion('admin'), nombre: 'Constancia laboral', icono: 'constancia', soloCeo: false } });
caso('CEO cambia «Solo CEO»', 'tramites_tipos/vacaciones', 'update', 'ALLOW', { uid: 'ceo', actual: tipos['tramites_tipos/vacaciones'], nuevo: edicion('ceo', { soloCeo: true }) });
caso('edición no reescribe la creación', 'tramites_tipos/vacaciones', 'update', 'DENY', { uid: 'ceo', actual: tipos['tramites_tipos/vacaciones'], nuevo: edicion('ceo', { createdAt: T }) });
caso('Administración limitada no edita', 'tramites_tipos/vacaciones', 'update', 'DENY', { uid: 'admin', actual: tipos['tramites_tipos/vacaciones'], nuevo: edicion('admin'), mundo: RESTRINGIDO });
caso('CEO borra un trámite', 'tramites_tipos/vacaciones', 'delete', 'ALLOW', { uid: 'ceo', actual: tipos['tramites_tipos/vacaciones'] });
caso('Administración no borra trámites', 'tramites_tipos/vacaciones', 'delete', 'DENY', { uid: 'admin', actual: tipos['tramites_tipos/vacaciones'] });

// Solicitudes
const pedido = (uid, extra = {}) => ({ camposRespuesta:[{id:'desde',etiqueta:'Desde',tipo:'fecha',valor:'2026-11-02'}], tipoId: 'vacaciones', tipoNombre: 'Vacaciones', solicitanteUid: uid, solicitanteNombre: usuarios[`users/${uid}`]?.displayName ?? 'Persona', solicitanteRol: usuarios[`users/${uid}`]?.role ?? 'Empleado',
  respuestas: { desde: '2026-11-02' }, estado: 'pendiente', comentario: '', soloCeo: false, createdAt: T, updatedAt: T, ...extra });
const guardado = (uid, extra = {}) => ({ ...pedido(uid), createdAt: ANTES, updatedAt: ANTES, ...extra });
const R = 'tramites_solicitudes/s1';
for (const uid of ['emp', 'disenio', 'admin', 'ceo']) caso(`${uid} solicita un trámite`, R, 'create', 'ALLOW', { uid, nuevo: pedido(uid) });
caso('solicitud de un trámite «Solo CEO»', R, 'create', 'ALLOW', { uid: 'emp', nuevo: pedido('emp', { tipoId: 'constancia', tipoNombre: 'Constancia laboral', soloCeo: true }) });
const malas = {
  'a nombre de otra persona': { solicitanteUid: 'admin' }, 'ya aprobada': { estado: 'aprobado' }, 'con comentario': { comentario: 'ok' },
  'rol falso': { solicitanteRol: 'CEO' }, 'nombre del trámite falso': { tipoNombre: 'Bono' }, 'trámite oculto': { tipoId: 'oculto', tipoNombre: 'Trámite oculto' },
  'trámite inexistente': { tipoId: 'fantasma' }, 'quita «Solo CEO»': { tipoId: 'constancia', tipoNombre: 'Constancia laboral', soloCeo: false },
  'clave extra': { prioridad: 'alta' }, 'hora falsa': { createdAt: ANTES }, 'sin nombre': { solicitanteNombre: '' },
  'demasiadas respuestas': { respuestas: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`c${i}`, 'x'])) },
};
for (const [nombre, extra] of Object.entries(malas)) caso(`solicitud inválida: ${nombre}`, R, 'create', 'DENY', { uid: 'emp', nuevo: pedido('emp', extra) });
for (const uid of [null, 'inactivo', 'cliente']) caso(`${uid ?? 'anónimo'} no solicita`, R, 'create', 'DENY', { uid, nuevo: pedido(uid ?? 'emp') });
caso('empleado ve lo suyo', R, 'get', 'ALLOW', { uid: 'emp', actual: guardado('emp') });
caso('empleado lista lo suyo', R, 'list', 'ALLOW', { uid: 'emp', actual: guardado('emp') });
caso('empleado no ve lo ajeno', R, 'get', 'DENY', { uid: 'disenio', actual: guardado('emp') });
caso('Administración ve la bandeja', R, 'list', 'ALLOW', { uid: 'admin', actual: guardado('emp') });
caso('Administración sin permiso no ve lo ajeno', R, 'list', 'DENY', { uid: 'admin', actual: guardado('emp'), mundo: RESTRINGIDO });
caso('CEO ve la bandeja', R, 'list', 'ALLOW', { uid: 'ceo', actual: guardado('emp'), mundo: RESTRINGIDO });

caso('empleado cancela lo pendiente', R, 'update', 'ALLOW', { uid: 'emp', actual: guardado('emp'), nuevo: guardado('emp', { estado: 'cancelado', updatedAt: T }) });
caso('no cancela lo que ya se atiende', R, 'update', 'DENY', { uid: 'emp', actual: guardado('emp', { estado: 'en_revision' }), nuevo: guardado('emp', { estado: 'cancelado', updatedAt: T }) });
caso('empleado no se aprueba solo', R, 'update', 'DENY', { uid: 'emp', actual: guardado('emp'), nuevo: guardado('emp', { estado: 'aprobado', updatedAt: T }) });
caso('empleado no cambia respuestas', R, 'update', 'DENY', { uid: 'emp', actual: guardado('emp'), nuevo: guardado('emp', { estado: 'cancelado', respuestas: { desde: '2026-12-01' }, updatedAt: T }) });
caso('empleado no cancela lo ajeno', R, 'update', 'DENY', { uid: 'disenio', actual: guardado('emp'), nuevo: guardado('emp', { estado: 'cancelado', updatedAt: T }) });

const resuelta = (base, uid, estado, extra = {}) => ({ ...base, estado, comentario: 'Aprobado del 2 al 6.', resueltoPor: uid, resueltoPorNombre: usuarios[`users/${uid}`]?.displayName ?? 'Revisor', resueltoAt: T, updatedAt: T, ...extra });
const abierta = guardado('emp');
caso('Administración aprueba', R, 'update', 'ALLOW', { uid: 'admin', actual: abierta, nuevo: resuelta(abierta, 'admin', 'aprobado') });
caso('Administración pasa a revisión', R, 'update', 'ALLOW', { uid: 'admin', actual: abierta, nuevo: resuelta(abierta, 'admin', 'en_revision', { comentario: '' }) });
caso('rechazo con motivo', R, 'update', 'ALLOW', { uid: 'admin', actual: abierta, nuevo: resuelta(abierta, 'admin', 'rechazado') });
caso('rechazo sin motivo', R, 'update', 'DENY', { uid: 'admin', actual: abierta, nuevo: resuelta(abierta, 'admin', 'rechazado', { comentario: '' }) });
caso('aprueba lo que estaba en revisión', R, 'update', 'ALLOW', { uid: 'ceo', actual: { ...abierta, estado: 'en_revision', comentario: '', resueltoPor: 'admin', resueltoPorNombre: 'A', resueltoAt: ANTES }, nuevo: resuelta(abierta, 'ceo', 'aprobado') });
const reservada = guardado('emp', { tipoId: 'constancia', tipoNombre: 'Constancia laboral', soloCeo: true });
caso('Administración no resuelve lo «Solo CEO»', R, 'update', 'DENY', { uid: 'admin', actual: reservada, nuevo: resuelta(reservada, 'admin', 'aprobado') });
caso('CEO resuelve lo «Solo CEO»', R, 'update', 'ALLOW', { uid: 'ceo', actual: reservada, nuevo: resuelta(reservada, 'ceo', 'aprobado') });
const propiaAdmin = guardado('admin');
caso('Administración no resuelve lo propio', R, 'update', 'DENY', { uid: 'admin', actual: propiaAdmin, nuevo: resuelta(propiaAdmin, 'admin', 'aprobado') });
caso('otra persona de Administración sí', R, 'update', 'ALLOW', { uid: 'admin2', actual: propiaAdmin, nuevo: resuelta(propiaAdmin, 'admin2', 'aprobado') });
const propiaCeo = guardado('ceo');
caso('el CEO resuelve lo propio', R, 'update', 'ALLOW', { uid: 'ceo', actual: propiaCeo, nuevo: resuelta(propiaCeo, 'ceo', 'aprobado') });
caso('Administración limitada no resuelve', R, 'update', 'DENY', { uid: 'admin', actual: abierta, nuevo: resuelta(abierta, 'admin', 'aprobado'), mundo: RESTRINGIDO });
caso('no se reabre lo cerrado', R, 'update', 'DENY', { uid: 'ceo', actual: guardado('emp', { estado: 'aprobado' }), nuevo: resuelta(abierta, 'ceo', 'rechazado') });
caso('revisor no cambia respuestas', R, 'update', 'DENY', { uid: 'admin', actual: abierta, nuevo: resuelta(abierta, 'admin', 'aprobado', { respuestas: { desde: '2026-12-24' } }) });
caso('revisor no firma por otro', R, 'update', 'DENY', { uid: 'admin', actual: abierta, nuevo: resuelta(abierta, 'ceo', 'aprobado') });
caso('revisor no cancela', R, 'update', 'DENY', { uid: 'admin', actual: abierta, nuevo: resuelta(abierta, 'admin', 'cancelado') });
caso('empleado no resuelve lo ajeno', R, 'update', 'DENY', { uid: 'disenio', actual: abierta, nuevo: resuelta(abierta, 'disenio', 'aprobado') });
for (const uid of ['ceo', 'emp']) caso(`${uid} no borra solicitudes`, R, 'delete', 'DENY', { uid, actual: abierta });

// Nuevos casos de documentos y capturas.
// Este archivo se incrusta como casos sintéticos en el comando v2.
const documento = (uid = 'admin', extra = {}) => ({
  version: 1, plantilla: 'constancia', titulo: 'Constancia de vínculo', contenido: 'Se acredita el vínculo de esta persona con Moon Studios.',
  cargo: 'Empleado', area: 'General', vigenteHasta: '', folio: 'MS-DOC-S1', solicitudId: 's1',
  destinatarioUid: 'emp', destinatarioNombre: 'Persona', destinatarioCodigo: 'MS-EMP',
  emitidoPor: uid, emitidoPorNombre: usuarios[`users/${uid}`]?.displayName ?? 'Revisor', emitidoAt: T, ...extra,
});
for (const uid of ['admin', 'ceo']) for (const plantilla of ['constancia', 'credencial', 'respuesta']) {
  caso(`${uid} aprueba y emite ${plantilla}`, R, 'update', 'ALLOW', {uid,actual:abierta,nuevo:resuelta(abierta,uid,'aprobado',{documento:documento(uid,{plantilla})})});
}
const aprobada = resuelta(abierta, 'admin', 'aprobado', { updatedAt:ANTES,resueltoAt:ANTES });
for (const uid of ['admin','ceo']) caso(`${uid} emite aprobado histórico`,R,'update','ALLOW',{uid,actual:aprobada,nuevo:{...aprobada,documento:documento(uid),updatedAt:T}});
const conDocumento = {...aprobada,documento:documento('admin',{emitidoAt:ANTES})};
for (const uid of ['admin','ceo','emp']) for (const [nombre,mutacion] of Object.entries({
  'cambia contenido':{documento:documento(uid,{contenido:'Otro contenido'})},
  'quita documento':{documento:undefined}, 'sustituye autor':{documento:documento(uid)},
  'reabre solicitud':{estado:'en_revision'},'reescribe resolución':{comentario:'Nuevo comentario'},
})) {
  const nuevo={...conDocumento,...mutacion,updatedAt:T}; if(mutacion.documento===undefined&&nombre==='quita documento') delete nuevo.documento;
  caso(`${uid} no ${nombre} emitido`,R,'update','DENY',{uid,actual:conDocumento,nuevo});
}
const documentosInvalidos={
  'versión desconocida':{version:2},'versión texto':{version:'1'},'plantilla desconocida':{plantilla:'cheque'},
  'sin título':{titulo:''},'título corto':{titulo:'AA'},'título largo':{titulo:'x'.repeat(101)},
  'sin contenido':{contenido:''},'contenido largo':{contenido:'x'.repeat(6001)},'contenido objeto':{contenido:{}},
  'cargo largo':{cargo:'x'.repeat(101)},'área larga':{area:'x'.repeat(101)},'cargo null':{cargo:null},
  'fecha mala':{vigenteHasta:'mañana'},'mes inválido':{vigenteHasta:'2026-13-01'},'día inválido':{vigenteHasta:'2026-01-32'},
  'folio falso':{folio:'MS-DOC-OTRO'},'id falso':{solicitudId:'otro'},'destinatario ajeno':{destinatarioUid:'ceo'},
  'nombre falso':{destinatarioNombre:'Otra persona'},'código falso':{destinatarioCodigo:'MS-CEO'},
  'emisor ajeno':{emitidoPor:'ceo'},'nombre emisor falso':{emitidoPorNombre:'El CEO'},'hora falsa':{emitidoAt:ANTES},
  'campo extra':{html:'<script>'},
};
for(const [nombre,extra]of Object.entries(documentosInvalidos))for(const previo of ['abierta','aprobada']){
  const actual=previo==='abierta'?abierta:aprobada;
  const nuevo=previo==='abierta'?resuelta(actual,'admin','aprobado',{documento:documento('admin',extra)}):{...actual,documento:documento('admin',extra),updatedAt:T};
  caso(`documento inválido ${nombre} / ${previo}`,R,'update','DENY',{uid:'admin',actual,nuevo});
}
for(const clave of Object.keys(documento())){
  const incompleto=documento();delete incompleto[clave];
  caso(`documento requiere ${clave}`,R,'update','DENY',{uid:'admin',actual:aprobada,nuevo:{...aprobada,documento:incompleto,updatedAt:T}});
}
for(const estado of ['pendiente','en_revision','rechazado','cancelado']) {
  const actual=guardado('emp',{estado});
  caso(`no emite después de ${estado}`,R,'update','DENY',{uid:'admin',actual,nuevo:{...actual,documento:documento(),updatedAt:T}});
}
for(const estado of ['en_revision','rechazado'])caso(`no adjunta documento al ${estado}`,R,'update','DENY',{uid:'admin',actual:abierta,nuevo:resuelta(abierta,'admin',estado,{documento:documento()})});
caso('empleado no se autoemite',R,'update','DENY',{uid:'emp',actual:aprobada,nuevo:{...aprobada,documento:documento('emp'),updatedAt:T}});
caso('empleado no emite a otro',R,'update','DENY',{uid:'disenio',actual:aprobada,nuevo:{...aprobada,documento:documento('disenio'),updatedAt:T}});
caso('admin limitado no emite',R,'update','DENY',{uid:'admin',actual:aprobada,nuevo:{...aprobada,documento:documento(),updatedAt:T},mundo:RESTRINGIDO});
caso('admin no emite solo CEO',R,'update','DENY',{uid:'admin',actual:{...aprobada,soloCeo:true},nuevo:{...aprobada,soloCeo:true,documento:documento(),updatedAt:T}});
caso('CEO emite solo CEO',R,'update','ALLOW',{uid:'ceo',actual:{...aprobada,soloCeo:true},nuevo:{...aprobada,soloCeo:true,documento:documento('ceo'),updatedAt:T},mundo:RESTRINGIDO});
for(const role of ['ceo','admin','client','candidate','employee','superadmin','Empleado','Diseño']) {
  caso(`rol ${role} no emite`,R,'update','DENY',{uid:'intruso',actual:aprobada,nuevo:{...aprobada,documento:documento('intruso',{emitidoPorNombre:'Persona'}),updatedAt:T},mundo:{'users/intruso':{role,displayName:'Persona'}}});
}
for(const [nombre,perfil]of Object.entries({inactivo:{role:'Empleado',displayName:'Persona',isActive:false},cliente:{role:'client',displayName:'Persona'},ceominuscula:{role:'ceo',displayName:'Persona'},booleanomal:{role:'Empleado',displayName:'Persona',isActive:'sí'},ausente:null})){
  caso(`destinatario ${nombre} no recibe documento`,R,'update','DENY',{uid:'ceo',actual:aprobada,nuevo:{...aprobada,documento:documento('ceo'),updatedAt:T},mundo:{'users/emp':perfil}});
}
for(const [nombre,perfil,n]of [
 ['email',{role:'Empleado',displayName:' ',email:'  empleado@example.com  '},'empleado@example.com'],
 ['fallback',{role:'Empleado'},'Equipo Moon'],['nombre largo',{role:'Empleado',displayName:'x'.repeat(140)},'x'.repeat(120)],
 ['trim',{role:'Empleado',displayName:'  Persona  '},'Persona'],['isActive verdadero',{role:'Empleado',displayName:'Persona',isActive:true},'Persona'],
]){
  caso(`identidad destinatario ${nombre}`,R,'update','ALLOW',{uid:'admin',actual:aprobada,nuevo:{...aprobada,documento:documento('admin',{destinatarioNombre:n}),updatedAt:T},mundo:{'users/emp':perfil}});
}
const propiaAprobada={...aprobada,solicitanteUid:'admin',solicitanteNombre:'Revisor'};
caso('admin no emite propia aprobada',R,'update','DENY',{uid:'admin',actual:propiaAprobada,nuevo:{...propiaAprobada,documento:documento('admin',{destinatarioUid:'admin',destinatarioNombre:'Revisor',destinatarioCodigo:'MS-ADMIN'}),updatedAt:T}});
const propiaCEO={...aprobada,solicitanteUid:'ceo',solicitanteNombre:'CEO'};
caso('CEO exacto emite documento propio',R,'update','ALLOW',{uid:'ceo',actual:propiaCEO,nuevo:{...propiaCEO,documento:documento('ceo',{destinatarioUid:'ceo',destinatarioNombre:'CEO',destinatarioCodigo:'MS-CEO'}),updatedAt:T}});
for(const uid of ['emp','ceo'])caso(`${uid} lee documento emitido permitido`,R,'get','ALLOW',{uid,actual:conDocumento});
for(const uid of ['disenio',null,'cliente','inactivo'])caso(`${uid??'anónimo'} no lee documento ajeno`,R,'get','DENY',{uid,actual:conDocumento});
caso('no se agrega documento al crear solicitud',R,'create','DENY',{uid:'emp',nuevo:pedido('emp',{documento:documento('emp')})});
caso('captura requerida nuevas solicitudes',R,'create','DENY',{uid:'emp',nuevo:Object.fromEntries(Object.entries(pedido('emp')).filter(([k])=>k!=='camposRespuesta'))});
for(const [nombre,extra]of Object.entries({
 'lista vacía':{camposRespuesta:[]},'lista demasiado larga':{camposRespuesta:Array(13).fill({id:'desde',etiqueta:'Desde',tipo:'fecha',valor:'2026-11-02'})},
 'tipo no lista':{camposRespuesta:{}},'id falso':{camposRespuesta:[{id:'otra',etiqueta:'Desde',tipo:'fecha',valor:'2026-11-02'}]},
 'etiqueta falsa':{camposRespuesta:[{id:'desde',etiqueta:'Bonificación',tipo:'fecha',valor:'2026-11-02'}]},
 'tipo falso':{camposRespuesta:[{id:'desde',etiqueta:'Desde',tipo:'texto',valor:'2026-11-02'}]},
 'valor distinto':{camposRespuesta:[{id:'desde',etiqueta:'Desde',tipo:'fecha',valor:'2026-12-01'}]},
 'campo extra':{camposRespuesta:[{id:'desde',etiqueta:'Desde',tipo:'fecha',valor:'2026-11-02',extra:true}]},
 'respuesta objeto':{respuestas:{desde:{fecha:'2026-11-02'}}},'respuesta extra':{respuestas:{desde:'2026-11-02',pago:'9999'}},
 'respuesta vacía campo requerido':{respuestas:{},camposRespuesta:[{id:'desde',etiqueta:'Desde',tipo:'fecha',valor:''}]},
 'fecha inválida':{respuestas:{desde:'2026-13-01'},camposRespuesta:[{id:'desde',etiqueta:'Desde',tipo:'fecha',valor:'2026-13-01'}]},
}))caso(`captura inválida ${nombre}`,R,'create','DENY',{uid:'emp',nuevo:pedido('emp',extra)});
for(const cuantos of [1,4,12]){
 const campos=Array.from({length:cuantos},(_,i)=>({id:`c${i}`,etiqueta:`Campo ${i}`,tipo:'texto',requerido:true}));
 const respuestas=Object.fromEntries(campos.map(c=>[c.id,'x'.repeat(1500)]));
 const capturas=campos.map(c=>({id:c.id,etiqueta:c.etiqueta,tipo:c.tipo,valor:respuestas[c.id]}));
 caso(`captura completa ${cuantos} campos máximos`,R,'create','ALLOW',{uid:'emp',nuevo:pedido('emp',{respuestas,camposRespuesta:capturas}),mundo:{'tramites_tipos/vacaciones':tipo({campos})}});
 for(const i of [0,cuantos-1]){
  const malas=structuredClone(capturas);malas[i].valor=33;
  caso(`captura valida el campo ${i} de ${cuantos}`,R,'create','DENY',{uid:'emp',nuevo:pedido('emp',{respuestas,camposRespuesta:malas}),mundo:{'tramites_tipos/vacaciones':tipo({campos})}});
 }
}
for(const cuantos of [4,12])for(const [nombre,tipoCampo,valor,requerido]of [['fechas','fecha','2026-12-31',true],['opciones','opcion','Elegida',true],['opcionales vacíos','texto','',false],['párrafos multilínea','parrafo','x'+'\n'.repeat(1498)+'x',true]]){
 const campos=Array.from({length:cuantos},(_,i)=>({id:`c${i}`,etiqueta:`Campo ${i}`,tipo:tipoCampo,requerido,...(tipoCampo==='opcion'?{opciones:['Elegida','Otra']}:{} )}));
 const respuestas=Object.fromEntries(campos.map(c=>[c.id,valor]));
 const capturas=campos.map(c=>({id:c.id,etiqueta:c.etiqueta,tipo:c.tipo,valor}));
 caso(`captura completa ${cuantos} ${nombre}`,R,'create','ALLOW',{uid:'emp',nuevo:pedido('emp',{respuestas,camposRespuesta:capturas}),mundo:{'tramites_tipos/vacaciones':tipo({campos})}});
}
for(const [fecha,esperado]of [['1900-01-01','ALLOW'],['2200-12-31','ALLOW'],['2000-02-29','ALLOW'],['2004-02-29','ALLOW'],['2196-02-29','ALLOW'],['2026-02-29','DENY'],['1900-02-29','DENY'],['2100-02-29','DENY'],['2200-02-29','DENY'],['2026-04-31','DENY'],['1899-12-31','DENY'],['2201-01-01','DENY']]){
 caso(`fecha calendario ${fecha}`,R,'create',esperado,{uid:'emp',nuevo:pedido('emp',{respuestas:{desde:fecha},camposRespuesta:[{id:'desde',etiqueta:'Desde',tipo:'fecha',valor:fecha}]})});
 caso(`vigencia calendario ${fecha}`,R,'update',esperado,{uid:'admin',actual:aprobada,nuevo:{...aprobada,documento:documento('admin',{vigenteHasta:fecha}),updatedAt:T}});
}
for(const [nombre,valor]of [['valor no string',45],['valor1501','x'.repeat(1501)],['valor null',null],['valor lista',[]]]){
 caso(`captura rechaza ${nombre}`,R,'create','DENY',{uid:'emp',nuevo:pedido('emp',{respuestas:{desde:valor},camposRespuesta:[{id:'desde',etiqueta:'Desde',tipo:'fecha',valor}]})});
}
for(const resolver of [false,true])for(const catalogo of [false,true]){
 const mundo={'moon_acceso/administracion':acceso(resolver,catalogo)};
 caso(`delegación resolver=${resolver} catálogo=${catalogo}: catálogo`, 'tramites_tipos/adelanto','create',catalogo?'ALLOW':'DENY',{uid:'admin',nuevo:tipoNuevo('admin'),mundo});
 caso(`delegación resolver=${resolver} catálogo=${catalogo}: revisión`,R,'update',resolver?'ALLOW':'DENY',{uid:'admin',actual:abierta,nuevo:resuelta(abierta,'admin','aprobado'),mundo});
 caso(`delegación resolver=${resolver} catálogo=${catalogo}: emisión`,R,'update',resolver?'ALLOW':'DENY',{uid:'admin',actual:aprobada,nuevo:{...aprobada,documento:documento('admin'),updatedAt:T},mundo});
 caso(`delegación resolver=${resolver} catálogo=${catalogo}: privacidad`,R,'get',resolver?'ALLOW':'DENY',{uid:'admin',actual:conDocumento,mundo});
}
for(const role of ['ceo','admin','Invitado','guest','voter','external']){
 const mundo={'users/exterior':{role,displayName:'Visitante'}};
 caso(`sin membresía ${role} no solicita`,R,'create','DENY',{uid:'exterior',nuevo:pedido('exterior',{solicitanteNombre:'Visitante',solicitanteRol:role}),mundo});
 caso(`sin membresía ${role} no lee documento`,R,'get','DENY',{uid:'exterior',actual:conDocumento,mundo});
}
for(const uid of ['ceo','admin'])for(const isActive of [false,'true',1]){
 const mundo={[`users/${uid}`]:{...usuarios[`users/${uid}`],isActive}};
 caso(`revisor ${uid} inactivo=${JSON.stringify(isActive)} no emite`,R,'update','DENY',{uid,actual:aprobada,nuevo:{...aprobada,documento:documento(uid),updatedAt:T},mundo});
}
// Compatibilidad con el cliente v69: conserva la captura de los opcionales,
// aunque su mapa de respuestas omita las cadenas vacías.
for(const cuantos of [4,12])for(const [nombre,tipoCampo,valor]of [['fechas','fecha','2026-12-31'],['opciones','opcion','Elegida'],['números','numero','-123.5'],['textos','texto','Proyecto Moon']]){
 const campos=Array.from({length:cuantos},(_,i)=>({id:`c${i}`,etiqueta:`Campo ${i}`,tipo:tipoCampo,requerido:i%2===0,...(tipoCampo==='opcion'?{opciones:['Elegida','Otra']}:{} )}));
 const capturas=campos.map(c=>({id:c.id,etiqueta:c.etiqueta,tipo:c.tipo,valor:c.requerido?valor:''}));
 const respuestas=Object.fromEntries(capturas.filter(c=>c.valor).map(c=>[c.id,c.valor]));
 const mundo={'tramites_tipos/vacaciones':tipo({campos})};
 caso(`captura completa v69 ${cuantos} ${nombre} opcionales omitidos`,R,'create','ALLOW',{uid:'emp',nuevo:pedido('emp',{respuestas,camposRespuesta:capturas}),mundo});
 caso(`captura completa v70 ${cuantos} ${nombre} opcionales explícitos`,R,'create','ALLOW',{uid:'emp',nuevo:pedido('emp',{respuestas:Object.fromEntries(capturas.map(c=>[c.id,c.valor])),camposRespuesta:capturas}),mundo});
 caso(`v69 ${cuantos} ${nombre} no admite respuestas extra`,R,'create','DENY',{uid:'emp',nuevo:pedido('emp',{respuestas:{...respuestas,extra:'Introducida'},camposRespuesta:capturas}),mundo});
 const incompletas={...respuestas};delete incompletas.c0;
 caso(`v69 ${cuantos} ${nombre} exige requerido omitido`,R,'create','DENY',{uid:'emp',nuevo:pedido('emp',{respuestas:incompletas,camposRespuesta:capturas}),mundo});
}
for(const cuantos of [4,12]){
 const campos=Array.from({length:cuantos},(_,i)=>({id:`c${i}`,etiqueta:`Campo ${i}`,tipo:'numero',requerido:true}));
 const respuestas=Object.fromEntries(campos.map(c=>[c.id,'1.7976931348623157e308']));
 caso(`captura completa ${cuantos} números finitos máximos`,R,'create','ALLOW',{uid:'emp',nuevo:pedido('emp',{respuestas,camposRespuesta:campos.map(c=>({id:c.id,etiqueta:c.etiqueta,tipo:c.tipo,valor:respuestas[c.id]}))}),mundo:{'tramites_tipos/vacaciones':tipo({campos})}});
}
for(const [tipoCampo,valor,esperado]of [
 ['opcion','Inventada','DENY'],['opcion','Elegida','ALLOW'],['numero','no-es-numero','DENY'],['numero','NaN','DENY'],['numero','Infinity','DENY'],['numero','-Infinity','DENY'],['numero','1e309','DENY'],['numero','-1e309','DENY'],
 ['numero','-0','ALLOW'],['numero','.25','ALLOW'],['numero','3.','ALLOW'],['numero','1e-300','ALLOW'],['numero','1e308','ALLOW'],
 ['texto','  \t\n  ','DENY'],['parrafo','  \t\n  ','DENY'],['opcion','  \t\n  ','DENY'],['numero','  \t\n  ','DENY'],['fecha','  \t\n  ','DENY'],
]){
 const c={id:'desde',etiqueta:'Desde',tipo:tipoCampo,requerido:true,...(tipoCampo==='opcion'?{opciones:['Elegida','Otra']}:{} )};
 caso(`integridad ${tipoCampo} valor ${JSON.stringify(valor)}`,R,'create',esperado,{uid:'emp',nuevo:pedido('emp',{respuestas:{desde:valor},camposRespuesta:[{id:c.id,etiqueta:c.etiqueta,tipo:c.tipo,valor}]}),mundo:{'tramites_tipos/vacaciones':tipo({campos:[c]})}});
}
for(const cuantos of [4,12])for(const clave of ['','extra','__proto__']){
 const campos=Array.from({length:cuantos},(_,i)=>({id:`c${i}`,etiqueta:`Campo ${i}`,tipo:'texto',requerido:i%2===0}));
 const capturas=campos.map(c=>({id:c.id,etiqueta:c.etiqueta,tipo:c.tipo,valor:c.requerido?'Proyecto Moon':''}));
 const completas=Object.fromEntries(capturas.map(c=>[c.id,c.valor]));
 delete completas.c1;
 const respuestas=Object.fromEntries([...Object.entries(completas),[clave,'Respuesta ajena']]);
 caso(`mapa ${cuantos} completo no sustituye opcional con clave ${JSON.stringify(clave)}`,R,'create','DENY',{uid:'emp',nuevo:pedido('emp',{respuestas,camposRespuesta:capturas}),mundo:{'tramites_tipos/vacaciones':tipo({campos})}});
 if(clave==='extra'){
  const nulas=structuredClone(capturas);nulas[1].valor=null;
  caso(`mapa ${cuantos} completo no sustituye opcional con captura null`,R,'create','DENY',{uid:'emp',nuevo:pedido('emp',{respuestas,camposRespuesta:nulas}),mundo:{'tramites_tipos/vacaciones':tipo({campos})}});
 }
}
for(const valor of ['\u00a0','\u1680','\u2000','\u2028','\u2029','\u202f','\u205f','\u3000','\ufeff']){
 const c={id:'desde',etiqueta:'Desde',tipo:'texto',requerido:true};
 caso(`requerido rechaza espacio Unicode ${valor.codePointAt(0).toString(16)}`,R,'create','DENY',{uid:'emp',nuevo:pedido('emp',{respuestas:{desde:valor},camposRespuesta:[{id:c.id,etiqueta:c.etiqueta,tipo:c.tipo,valor}]}),mundo:{'tramites_tipos/vacaciones':tipo({campos:[c]})}});
}
const legacy={...abierta};delete legacy.camposRespuesta;
caso('lectura solicitud legacy sin captura',R,'get','ALLOW',{uid:'emp',actual:legacy});
caso('resolución solicitud legacy sin captura',R,'update','ALLOW',{uid:'admin',actual:legacy,nuevo:resuelta(legacy,'admin','aprobado',{documento:documento()})});
caso('no cambia snapshots al resolver',R,'update','DENY',{uid:'admin',actual:abierta,nuevo:resuelta(abierta,'admin','aprobado',{camposRespuesta:[]})});
caso('no cambia firma histórica al emitir',R,'update','DENY',{uid:'ceo',actual:aprobada,nuevo:{...aprobada,documento:documento('ceo'),resueltoPor:'ceo',updatedAt:T}});

for(const [nombre,extra]of Object.entries({'título largo credencial':{titulo:'x'.repeat(61)},'texto largo credencial':{contenido:'x'.repeat(241)}}))caso(nombre,R,'update','DENY',{uid:'admin',actual:aprobada,nuevo:{...aprobada,documento:documento('admin',{plantilla:'credencial',...extra}),updatedAt:T}});
// Consulta pública «Información»: moon_verificacion/{codigo}_{plantilla}
const V = 'moon_verificacion/MS-EMP_constancia';
const emitida = (extra = {}) => ({ ...aprobada, documento: documento('admin', extra), updatedAt: T });
const verif = (extra = {}) => ({ codigo: 'MS-EMP', plantilla: 'constancia', titulo: 'Constancia de vínculo', nombre: 'Persona', cargo: 'Empleado', area: 'General',
  folio: 'MS-DOC-S1', vigenteHasta: '', emitidoAt: T, estado: 'vigente', solicitudId: 's1', ...extra });
const conEmision = (extra = {}, mas = {}) => ({ 'tramites_solicitudes/s1': emitida(extra), 'tramites_solicitudes/s2': null, ...mas });
for (const uid of ['admin', 'ceo']) caso(`${uid} publica la verificación de una constancia`, V, 'create', 'ALLOW', { uid, nuevo: verif(), mundo: conEmision() });
caso('publica la verificación de la tarjeta', 'moon_verificacion/MS-EMP_credencial', 'create', 'ALLOW', { uid: 'admin', nuevo: verif({ plantilla: 'credencial', titulo: 'Credencial de Moon Studios', vigenteHasta: '2027-12-31' }), mundo: conEmision({ plantilla: 'credencial', titulo: 'Credencial de Moon Studios', vigenteHasta: '2027-12-31' }) });
caso('una nueva emisión reemplaza la anterior', V, 'update', 'ALLOW', { uid: 'admin', actual: verif({ emitidoAt: ANTES, folio: 'MS-DOC-VIEJA', solicitudId: 'vieja' }), nuevo: verif(), mundo: conEmision() });
caso('reemisión reactiva una baja', V, 'update', 'ALLOW', { uid: 'ceo', actual: { ...verif({ emitidoAt: ANTES }), estado: 'baja', bajaAt: ANTES }, nuevo: verif(), mundo: conEmision() });
for (const uid of [null, 'cliente', 'emp', 'inactivo']) caso(`${uid ?? 'anónimo'} lee la verificación pública`, V, 'get', 'ALLOW', { uid, actual: verif() });
caso('nadie lista el padrón de verificaciones', V, 'list', 'DENY', { uid: 'ceo', actual: verif() });
caso('nadie borra una verificación', V, 'delete', 'DENY', { uid: 'ceo', actual: verif() });
for (const uid of [null, 'cliente', 'emp', 'inactivo']) caso(`${uid ?? 'anónimo'} no publica verificaciones`, V, 'create', 'DENY', { uid, nuevo: verif(), mundo: conEmision() });
caso('Administración limitada no publica', V, 'create', 'DENY', { uid: 'admin', nuevo: verif(), mundo: conEmision({}, RESTRINGIDO) });
caso('no publica respuestas privadas', 'moon_verificacion/MS-EMP_respuesta', 'create', 'DENY', { uid: 'admin', nuevo: verif({ plantilla: 'respuesta' }), mundo: conEmision({ plantilla: 'respuesta' }) });
caso('no publica sin una emisión en la misma operación', V, 'create', 'DENY', { uid: 'admin', nuevo: verif(), mundo: conEmision({ emitidoAt: ANTES }) });
caso('no publica sin documento', V, 'create', 'DENY', { uid: 'admin', nuevo: verif(), mundo: { 'tramites_solicitudes/s1': aprobada, 'tramites_solicitudes/s2': null } });
caso('no publica para otra solicitud', V, 'create', 'DENY', { uid: 'admin', nuevo: verif({ solicitudId: 's2' }), mundo: conEmision() });
caso('no publica con otro identificador', 'moon_verificacion/MS-OTRO_constancia', 'create', 'DENY', { uid: 'admin', nuevo: verif(), mundo: conEmision() });
const verifMalas = { 'nombre distinto': { nombre: 'Otra Persona' }, 'cargo distinto': { cargo: 'Gerente' }, 'área distinta': { area: 'Finanzas' },
  'título distinto': { titulo: 'Diploma' }, 'folio distinto': { folio: 'MS-DOC-X' }, 'vigencia distinta': { vigenteHasta: '2030-01-01' }, 'código distinto': { codigo: 'MS-CEO' },
  'plantilla distinta': { plantilla: 'credencial' }, 'hora falsa': { emitidoAt: ANTES }, 'nace dada de baja': { estado: 'baja' },
  'con correo': { correo: 'persona@example.com' }, 'con UID': { uid: 'emp' }, 'sin folio': { folio: undefined } };
for (const [n, extra] of Object.entries(verifMalas)) { const nuevo = verif(extra); if ('folio' in extra && extra.folio === undefined) delete nuevo.folio; caso(`verificación inválida: ${n}`, V, 'create', 'DENY', { uid: 'admin', nuevo, mundo: conEmision() }); }
const vigenteGuardada = verif({ emitidoAt: ANTES });
caso('Administración da de baja', V, 'update', 'ALLOW', { uid: 'admin', actual: vigenteGuardada, nuevo: { ...vigenteGuardada, estado: 'baja', bajaAt: T } });
caso('CEO da de baja', V, 'update', 'ALLOW', { uid: 'ceo', actual: vigenteGuardada, nuevo: { ...vigenteGuardada, estado: 'baja', bajaAt: T } });
caso('el empleado no da de baja', V, 'update', 'DENY', { uid: 'emp', actual: vigenteGuardada, nuevo: { ...vigenteGuardada, estado: 'baja', bajaAt: T } });
caso('la baja no cambia otros datos', V, 'update', 'DENY', { uid: 'admin', actual: vigenteGuardada, nuevo: { ...vigenteGuardada, estado: 'baja', bajaAt: T, nombre: 'Otro' } });
caso('la baja lleva la hora real', V, 'update', 'DENY', { uid: 'admin', actual: vigenteGuardada, nuevo: { ...vigenteGuardada, estado: 'baja', bajaAt: ANTES } });
caso('no se reactiva sin emitir', V, 'update', 'DENY', { uid: 'admin', actual: { ...vigenteGuardada, estado: 'baja', bajaAt: ANTES }, nuevo: { ...vigenteGuardada } });
caso('Administración limitada no da de baja', V, 'update', 'DENY', { uid: 'admin', actual: vigenteGuardada, nuevo: { ...vigenteGuardada, estado: 'baja', bajaAt: T }, mundo: RESTRINGIDO });

// Publicación de documentos anteriores a la consulta pública
const historica = (extra = {}) => verif({ emitidoAt: ANTES, ...extra });
const solicitudHistorica = (extra = {}, sol = {}) => ({ 'tramites_solicitudes/s1': { ...aprobada, documento: documento('admin', { emitidoAt: ANTES, ...extra }), ...sol }, 'tramites_solicitudes/s2': null });
for (const uid of ['admin', 'ceo']) caso(`${uid} publica un documento ya emitido`, V, 'create', 'ALLOW', { uid, nuevo: historica(), mundo: solicitudHistorica() });
caso('publica una tarjeta ya emitida', 'moon_verificacion/MS-EMP_credencial', 'create', 'ALLOW', { uid: 'ceo', nuevo: historica({ plantilla: 'credencial', titulo: 'Credencial de Moon Studios' }), mundo: solicitudHistorica({ plantilla: 'credencial', titulo: 'Credencial de Moon Studios' }) });
caso('reemplaza un registro más antiguo', V, 'update', 'ALLOW', { uid: 'admin', actual: verif({ emitidoAt: '2026-10-01T09:00:00Z', folio: 'MS-DOC-VIEJA', solicitudId: 'vieja' }), nuevo: historica(), mundo: solicitudHistorica() });
caso('no revierte una baja publicando lo mismo', V, 'update', 'DENY', { uid: 'admin', actual: { ...historica(), estado: 'baja', bajaAt: T }, nuevo: historica(), mundo: solicitudHistorica() });
caso('no pisa una emisión más reciente', V, 'update', 'DENY', { uid: 'admin', actual: verif({ emitidoAt: T, folio: 'MS-DOC-NUEVA', solicitudId: 'nueva' }), nuevo: historica(), mundo: solicitudHistorica() });
caso('no publica con fecha distinta a la emisión', V, 'create', 'DENY', { uid: 'admin', nuevo: historica({ emitidoAt: T }), mundo: solicitudHistorica() });
caso('no publica si la solicitud no está aprobada', V, 'create', 'DENY', { uid: 'admin', nuevo: historica(), mundo: solicitudHistorica({}, { estado: 'rechazado' }) });
caso('no publica respuestas anteriores', 'moon_verificacion/MS-EMP_respuesta', 'create', 'DENY', { uid: 'admin', nuevo: historica({ plantilla: 'respuesta' }), mundo: solicitudHistorica({ plantilla: 'respuesta' }) });
for (const [n, extra] of Object.entries({ 'nombre distinto': { nombre: 'Otra Persona' }, 'cargo distinto': { cargo: 'Gerente' }, 'vigencia distinta': { vigenteHasta: '2030-01-01' }, 'con correo': { correo: 'x@example.com' } }))
  caso(`documento anterior inválido: ${n}`, V, 'create', 'DENY', { uid: 'admin', nuevo: historica(extra), mundo: solicitudHistorica() });
for (const uid of [null, 'emp', 'cliente']) caso(`${uid ?? 'anónimo'} no publica documentos anteriores`, V, 'create', 'DENY', { uid, nuevo: historica(), mundo: solicitudHistorica() });
caso('Administración limitada no publica anteriores', V, 'create', 'DENY', { uid: 'admin', nuevo: historica(), mundo: { ...solicitudHistorica(), ...RESTRINGIDO } });

// Eliminar solicitudes ya resueltas
const VC = 'moon_verificacion/MS-EMP_credencial';
const conTarjeta = { ...aprobada, documento: documento('admin', { plantilla: 'credencial', emitidoAt: ANTES }) };
const sinRegistro = { [V]: null, [VC]: null };
for (const uid of ['admin', 'ceo']) for (const estado of ['aprobado', 'rechazado', 'cancelado'])
  caso(`${uid} elimina una solicitud ${estado}`, R, 'delete', 'ALLOW', { uid, actual: { ...aprobada, estado }, mundo: sinRegistro });
for (const estado of ['pendiente', 'en_revision']) caso(`no elimina una solicitud ${estado}`, R, 'delete', 'DENY', { uid: 'ceo', actual: { ...aprobada, estado }, mundo: sinRegistro });
for (const uid of [null, 'emp', 'cliente', 'inactivo']) caso(`${uid ?? 'anónimo'} no elimina solicitudes`, R, 'delete', 'DENY', { uid, actual: aprobada, mundo: sinRegistro });
caso('el empleado no elimina la suya resuelta', R, 'delete', 'DENY', { uid: 'emp', actual: guardado('emp', { estado: 'aprobado' }), mundo: sinRegistro });
caso('Administración limitada no elimina', R, 'delete', 'DENY', { uid: 'admin', actual: aprobada, mundo: { ...sinRegistro, ...RESTRINGIDO } });
caso('Administración no elimina lo «Solo CEO»', R, 'delete', 'DENY', { uid: 'admin', actual: { ...aprobada, soloCeo: true }, mundo: sinRegistro });
caso('CEO elimina lo «Solo CEO»', R, 'delete', 'ALLOW', { uid: 'ceo', actual: { ...aprobada, soloCeo: true }, mundo: sinRegistro });
caso('Administración no elimina lo propio', R, 'delete', 'DENY', { uid: 'admin', actual: { ...aprobada, solicitanteUid: 'admin' }, mundo: sinRegistro });
caso('elimina una tarjeta que no figura en la consulta', R, 'delete', 'ALLOW', { uid: 'admin', actual: conTarjeta, mundo: sinRegistro });
caso('no elimina una tarjeta vigente en la consulta', R, 'delete', 'DENY', { uid: 'admin', actual: conTarjeta, mundo: { [VC]: verif({ plantilla: 'credencial', emitidoAt: ANTES }) } });
caso('elimina una tarjeta dada de baja en la misma operación', R, 'delete', 'ALLOW', { uid: 'admin', actual: conTarjeta, mundo: { [VC]: { ...verif({ plantilla: 'credencial', emitidoAt: ANTES }), estado: 'baja', bajaAt: T } } });
caso('elimina si la consulta muestra otra emisión', R, 'delete', 'ALLOW', { uid: 'ceo', actual: conTarjeta, mundo: { [VC]: verif({ plantilla: 'credencial', solicitudId: 'nueva' }) } });
caso('no elimina una constancia vigente en la consulta', R, 'delete', 'DENY', { uid: 'ceo', actual: { ...aprobada, documento: documento('admin', { emitidoAt: ANTES }) }, mundo: { [V]: verif({ emitidoAt: ANTES }) } });
caso('elimina una respuesta privada', R, 'delete', 'ALLOW', { uid: 'admin', actual: { ...aprobada, documento: documento('admin', { plantilla: 'respuesta', emitidoAt: ANTES }) }, mundo: sinRegistro });

// Moon Studios Conferencias: solo lectura; escribe la API de Luna NET.
const CE = 'moon_conf_eventos/ev1';
const eventoConf = { titulo: 'MOON FEST', equipo: { org: 'organizador', mod: 'moderador', puerta: 'control' }, miembros: ['org', 'mod', 'puerta'] };
const invConf = (uid, rol = 'asistente') => ({ eventoId: 'ev1', nombre: 'Invitado', email: 'x@y.co', rol, ownerUid: uid, estado: 'aceptada' });
const accesoConf = (uid, invId) => ({ uid, eventoId: 'ev1', invId });
const UIDS_CONF = ['ceo', 'admin', 'admin2', 'emp', 'disenio', 'inactivo', 'cliente', 'org', 'mod', 'puerta', 'invX', 'invY', 'invM'];
const mundoConf = (extra = {}) => ({
  [CE]: eventoConf, 'users/org': { role: 'Programación', displayName: 'Org' }, 'users/mod': { role: 'Secretaría', displayName: 'Mod' },
  'users/puerta': { role: 'Empleado', displayName: 'Puerta' }, 'users/invX': null, 'users/invY': null, 'users/invM': null,
  ...Object.fromEntries(UIDS_CONF.map(u => [`moon_conf_accesos/ev1_${u}`, null])),
  'moon_conf_accesos/ev1_invX': accesoConf('invX', 'iX'), 'moon_conf_accesos/ev1_invY': accesoConf('invY', 'iY'), 'moon_conf_accesos/ev1_invM': accesoConf('invM', 'iM'),
  [`${CE}/conf_invitaciones/iX`]: invConf('invX'), [`${CE}/conf_invitaciones/iY`]: invConf('invY'), [`${CE}/conf_invitaciones/iM`]: invConf('invM', 'moderador'),
  ...extra,
});
const SIN_CONF = { 'moon_acceso/administracion': { ...acceso(true, true), modulos: { ...acceso(true, true).modulos, conferencias: false } } };
const conf = (etiqueta, ruta, metodo, esperado, uid, actual, extra = {}) => caso(`conferencias: ${etiqueta}`, ruta, metodo, esperado, { uid, actual, mundo: mundoConf(extra) });
for (const uid of ['ceo', 'admin', 'org', 'mod', 'puerta', 'invX']) conf(`${uid} ve el evento`, CE, 'get', 'ALLOW', uid, eventoConf);
for (const uid of [null, 'emp', 'disenio', 'cliente', 'inactivo']) conf(`${uid ?? 'anónimo'} no ve el evento`, CE, 'get', 'DENY', uid, eventoConf);
conf('Administración sin el módulo no ve el evento', CE, 'get', 'DENY', 'admin', eventoConf, SIN_CONF);
conf('el CEO ve el evento aunque Administración no tenga el módulo', CE, 'get', 'ALLOW', 'ceo', eventoConf, SIN_CONF);
conf('el equipo lista sus eventos', CE, 'list', 'ALLOW', 'puerta', eventoConf);
conf('la dirección lista todos', CE, 'list', 'ALLOW', 'admin', eventoConf);
for (const uid of ['emp', 'invX']) conf(`${uid} no lista eventos`, CE, 'list', 'DENY', uid, eventoConf);
for (const metodo of ['create', 'update', 'delete']) caso(`conferencias: nadie escribe eventos desde el cliente (${metodo})`, CE, metodo, 'DENY', { uid: 'ceo', actual: metodo === 'create' ? null : eventoConf, nuevo: metodo === 'delete' ? null : eventoConf, mundo: mundoConf() });
const IX = `${CE}/conf_invitaciones/iX`;
for (const uid of ['ceo', 'admin', 'org', 'mod']) conf(`${uid} ve la lista de invitados`, IX, 'list', 'ALLOW', uid, invConf('invX'));
for (const uid of ['puerta', 'emp', 'invX', 'invY', null]) conf(`${uid ?? 'anónimo'} no lista invitados`, IX, 'list', 'DENY', uid, invConf('invX'));
conf('el invitado ve su invitación', IX, 'get', 'ALLOW', 'invX', invConf('invX'));
conf('un invitado no ve la de otro', IX, 'get', 'DENY', 'invY', invConf('invX'));
conf('el control de puerta no ve invitaciones', IX, 'get', 'DENY', 'puerta', invConf('invX'));
caso('conferencias: nadie crea invitaciones desde el cliente', `${CE}/conf_invitaciones/nueva`, 'create', 'DENY', { uid: 'ceo', nuevo: invConf('ceo'), mundo: mundoConf() });
caso('conferencias: el invitado no edita su invitación', IX, 'update', 'DENY', { uid: 'invX', actual: invConf('invX'), nuevo: { ...invConf('invX'), rol: 'moderador' }, mundo: mundoConf() });
const AS = `${CE}/asistencia/a1`, asis = { invId: 'iX', nombre: 'Invitado', via: 'qr' };
for (const [uid, r] of [['org', 'ALLOW'], ['mod', 'ALLOW'], ['puerta', 'DENY'], ['invX', 'DENY'], ['emp', 'DENY']]) conf(`asistencia: ${uid}`, AS, 'list', r, uid, asis);
const AV = `${CE}/avisos/v1`, aviso = { titulo: 'Hola', mensaje: 'Bienvenidos' };
for (const [uid, r] of [['invX', 'ALLOW'], ['puerta', 'ALLOW'], ['ceo', 'ALLOW'], ['emp', 'DENY'], [null, 'DENY'], ['cliente', 'DENY']]) conf(`avisos: ${uid ?? 'anónimo'}`, AV, 'list', r, uid, aviso);
caso('conferencias: nadie publica avisos desde el cliente', AV, 'create', 'DENY', { uid: 'ceo', nuevo: aviso, mundo: mundoConf() });
const ES = `${CE}/espera/invX`, espera = { estado: 'esperando', nombre: 'Invitado' };
conf('sala de espera: el invitado ve su estado', ES, 'get', 'ALLOW', 'invX', espera);
conf('sala de espera: otro invitado no lo ve', ES, 'get', 'DENY', 'invY', espera);
for (const [uid, r] of [['mod', 'ALLOW'], ['org', 'ALLOW'], ['invM', 'ALLOW'], ['invX', 'DENY'], ['puerta', 'DENY'], ['emp', 'DENY']]) conf(`sala de espera: ${uid} lista`, ES, 'list', r, uid, espera);
caso('conferencias: nadie se admite solo', ES, 'update', 'DENY', { uid: 'invX', actual: espera, nuevo: { ...espera, estado: 'admitido' }, mundo: mundoConf() });
const AU = `${CE}/auditoria/r1`, registro = { accion: 'acceso-permitido' };
for (const [uid, r] of [['ceo', 'ALLOW'], ['org', 'ALLOW'], ['mod', 'DENY'], ['puerta', 'DENY'], ['invX', 'DENY']]) conf(`auditoría: ${uid}`, AU, 'list', r, uid, registro);
const AC = 'moon_conf_accesos/ev1_invX';
conf('accesos: el invitado ve los suyos', AC, 'list', 'ALLOW', 'invX', accesoConf('invX', 'iX'));
conf('accesos: nadie ve los de otro', AC, 'get', 'DENY', 'invY', accesoConf('invX', 'iX'));
conf('accesos: ni la dirección los escribe', AC, 'create', 'DENY', 'ceo', null);
caso('conferencias: nadie se da acceso a sí mismo', 'moon_conf_accesos/ev1_emp', 'create', 'DENY', { uid: 'emp', nuevo: accesoConf('emp', 'iX'), mundo: mundoConf() });
for (const metodo of ['get', 'list']) conf(`la clave del servidor es inaccesible (${metodo})`, 'moon_conf_servidor/clave', metodo, 'DENY', 'ceo', { valor: 'x' });
caso('límites: CEO delega «Conferencias»', 'moon_acceso/administracion', 'update', 'ALLOW', { uid: 'ceo', actual: acceso(true, true), nuevo: accesoNuevo({ modulos: { ...acceso(1, 1).modulos, conferencias: false } }) });
caso('límites: «Conferencias» no booleano', 'moon_acceso/administracion', 'update', 'DENY', { uid: 'ceo', actual: acceso(true, true), nuevo: accesoNuevo({ modulos: { ...acceso(1, 1).modulos, conferencias: 'sí' } }) });

// ─── Ejecución ───────────────────────────────────────────────────────────────
if (soloCapturas) for(let i=casos.length-1;i>=0;i--) if(!etiquetas[i].startsWith('captura completa')) {casos.splice(i,1);etiquetas.splice(i,1);}
if(process.argv.includes('--trace')) casos.forEach(c=>c.expressionReportLevel='FULL');
const resultados = [];
const lotes = [];
for(let i=0;i<casos.length;i+=50) lotes.push(casos.slice(i,i+50));
const respuestasLotes = await Promise.allSettled(lotes.map(testCases=>api(`projects/${PROYECTO}:test`, { method: 'POST', body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: propuesto }] }, testSuite: { testCases } }) })));
for(const respuesta of respuestasLotes) {
  if(respuesta.status!=='fulfilled') throw respuesta.reason;
  const lote=respuesta.value;
  const errores = (lote.issues ?? []).filter(x => x.severity === 'ERROR');
  if (errores.length) { console.error(JSON.stringify(errores, null, 2)); throw new Error('Las reglas no compilan.'); }
  resultados.push(...lote.testResults);
}
if(soloCapturas) writeFileSync(join(QA,'capture-report.json'),JSON.stringify(resultados,null,2));
const fallas = resultados.map((r, i) => ({ r, i })).filter(({ r }) => r.state !== 'SUCCESS');
for (const { r, i } of fallas) console.log(`FALLA · ${etiquetas[i]} (esperado ${casos[i].expectation})`, JSON.stringify(r.debugMessages ?? r.errorPosition ?? '').slice(0, 300));
writeFileSync(join(QA, 'resultados-reglas.json'), JSON.stringify(resultados.map((resultado,i)=>({etiqueta:etiquetas[i],esperado:casos[i].expectation,...resultado})), null, 2));
writeFileSync(join(QA, 'resultado.json'), JSON.stringify({ ruleset: release.rulesetName, baselineRevisada:EXPECTED_BASELINE, casos: etiquetas.length, fallas: fallas.map(f => etiquetas[f.i]), propuestoSha256: sha(propuesto), fragmentoSha256: sha(FRAGMENTO), outsideSha256:sha(fuera(propuesto)), outsideActivoSha256:sha(fuera(activo)), outsideBaselineSha256:sha(fuera(contenidoBase)), exteriorByteExacto:fuera(propuesto)===fuera(activo)&&fuera(activo)===fuera(contenidoBase), electoralSha256:sha(propuesto.slice(propuesto.indexOf(ELECTORAL),propuesto.indexOf('    // ===== COLECCIÓN: CLIENTES ====='))), at: new Date().toISOString() }, null, 2));
if (fallas.length || resultados.length !== casos.length) throw new Error(`${fallas.length} de ${casos.length} casos fallaron.`);
console.log(`Pasaron ${casos.length} casos de trámites y acceso. No se leyó ni escribió ningún dato.`);

if (!desplegar) process.exit(0);
// ─── Despliegue ──────────────────────────────────────────────────────────────
const ahora = await api(`projects/${PROYECTO}/releases/cloud.firestore`);
if (ahora.rulesetName !== release.rulesetName) throw new Error('Las reglas de producción cambiaron durante la prueba. Vuelve a ejecutar.');
const nuevo = await api(`projects/${PROYECTO}/rulesets`, { method: 'POST', body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: propuesto }] } }) });
const previo = await api(`projects/${PROYECTO}/releases/cloud.firestore`);
if (previo.rulesetName !== release.rulesetName) throw new Error('Las reglas de producción cambiaron. No se publicó nada.');
const publicado = await api(`projects/${PROYECTO}/releases/cloud.firestore`, { method: 'PATCH', body: JSON.stringify({ release: { name: `projects/${PROYECTO}/releases/cloud.firestore`, rulesetName: nuevo.name }, updateMask: 'rulesetName' }) });
if (publicado.rulesetName !== nuevo.name) throw new Error('La publicación no quedó activa.');
writeFileSync(join(QA, 'desplegado.json'), JSON.stringify({ anterior: release.rulesetName, nuevo: nuevo.name, casos: casos.length, propuestoSha256: sha(propuesto), at: publicado.updateTime }, null, 2));
console.log(`Publicado ${nuevo.name}. El anterior (${release.rulesetName}) queda para revertir.`);
