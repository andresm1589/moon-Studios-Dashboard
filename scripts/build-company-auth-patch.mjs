import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const baselinePath = resolve(process.argv[2] || root + '/.moon-qa/elections-v3/baseline.rules');
const outputPath = resolve(process.argv[3] || root + '/firebase/company-auth.rules.patch.json');
const baseline = (await readFile(baselinePath, 'utf8')).replace(/\r\n/g, '\n');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const staffPaths = [
  '/discord/{document}', '/tasks/{taskId}', '/announcements/{announcementId}',
  '/forms/{formId}', '/activityLogs/{logId}', '/userActivityLogs/{logId}',
  '/userSessions/{sessionId}', '/sessions/{sessionId}', '/taskReports/{reportId}',
  '/correos/{correoId}', '/mensajeria/{mensajeId}', '/hilos/{hiloId}',
  '/notifications/{notifId}', '/contabilidad_transacciones/{docId}',
  '/contabilidad_facturas/{docId}', '/contabilidad_presupuestos/{docId}',
  '/contabilidad_sueldos/{docId}', '/contabilidad_config/{docId}',
  '/contabilidad_asientos/{docId}', '/dashboard_banners/{docId}',
  '/dashboard_config/{docId}', '/contracts/{contractId}', '/conferences/{conferenceId}',
  '/userInvitations/{email}', '/diseno_media/{docId}', '/secretaria_docs/{docId}',
  '/dev_projects/{projectId}', '/dev_changelog/{changeId}', '/dev_tasks/{taskId}',
  '/system_logs/{logId}', '/libro_diario/{entryId}', '/maintenance/{docId}',
  '/maintenance/history/records/{recordId}', '/uptime_snapshots/{dateDoc}', '/bug_reports/{reportId}',
];
// These mixed public/private blocks retain every public operation verbatim.
// Only existing authenticated administrative checks gain an active staff guard.
const publicAdminPaths = [
  '/correos_panel_moonstudios/{correoId}', '/moon_studios_fest_2026/{registroId}',
  '/config/{docId}', '/clientes/{clienteId}', '/moonStudios/equipo/items/{itemId}',
  '/moonStudios/portfolio/items/{itemId}',
];
function block(path) {
  const marker = '    match ' + path + ' {';
  const start = baseline.indexOf(marker);
  if (start < 0 || baseline.indexOf(marker, start + 1) >= 0) throw new Error('Expected exactly one match block: ' + path);
  let depth = 0, end = start + marker.length - 1;
  for (; end < baseline.length; end++) {
    if (baseline[end] === '{') depth++;
    if (baseline[end] === '}' && --depth === 0) { end++; break; }
  }
  if (depth !== 0) throw new Error('Unclosed match block: ' + path);
  return baseline.slice(start, end);
}
function functionBlock(name) {
  const marker = '    function ' + name + '() {';
  const start = baseline.indexOf(marker);
  if (start < 0 || baseline.indexOf(marker, start + 1) >= 0) throw new Error('Expected exactly one function: ' + name);
  let depth = 0, end = start + marker.length - 1;
  for (; end < baseline.length; end++) {
    if (baseline[end] === '{') depth++;
    if (baseline[end] === '}' && --depth === 0) { end++; break; }
  }
  return baseline.slice(start, end);
}
const helpers = `    // Corporate membership is independent of a Firebase or electoral sign-in.
    // Missing isActive preserves current staff; explicit false/nonboolean denies.
    function moonCompanyStaff() {
      return request.auth != null
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación']
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('isActive', true) == true;
    }
    function moonCompanyCEO() {
      return moonCompanyStaff()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO';
    }
    function moonCompanyAdmin() {
      return moonCompanyStaff()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['CEO', 'Administración'];
    }
    function moonSelfProfileUpdate(userId) {
      let changed = request.resource.data.diff(resource.data).affectedKeys();
      return request.auth != null && request.auth.uid == userId
        && resource.data.get('isActive', true) == true
        && changed.hasOnly(['name', 'displayName', 'phone', 'bio', 'website', 'avatar', 'avatarHistory', 'settings', 'dispositivos', 'isFirstLogin'])
        && (!changed.hasAny(['isFirstLogin']) || request.resource.data.isFirstLogin == false);
    }

`;
const users = `    match /users/{userId} {
      // The public customer portal may create a client profile; employment
      // roles are assigned only through an active corporate operator.
      allow create: if (request.auth != null && request.auth.uid == userId
          && request.resource.data.keys().hasOnly(['uid', 'name', 'email', 'role', 'createdAt'])
          && request.resource.data.keys().hasAll(['uid', 'name', 'email', 'role', 'createdAt'])
          && request.resource.data.uid == userId && request.resource.data.role == 'client'
          && request.resource.data.email == request.auth.token.get('email', null)
          && request.resource.data.email is string
          && request.resource.data.name is string
          && request.resource.data.name.size() >= 2 && request.resource.data.name.size() <= 320
          && request.resource.data.createdAt == request.time)
        || moonCompanyCEO()
        || (moonCompanyAdmin() && request.resource.data.role == 'Empleado');
      // Includes the authenticated account's missing profile for verification.
      allow get: if request.auth != null && request.auth.uid == userId;
      // Corporate UI uses this directory for assignment and internal messages.
      allow get, list: if moonCompanyStaff();
      allow update: if moonSelfProfileUpdate(userId) || moonCompanyCEO();
      allow delete: if moonCompanyCEO();
    }`;
const replacements = [];
function add(path, before, after) {
  if (before === after) throw new Error('Expected an intentional change: ' + path);
  replacements.push({ path, before, after, beforeSha256: sha256(before), afterSha256: sha256(after) });
}
add('/users/{userId}', block('/users/{userId}'), users);
for (const path of staffPaths) {
  const before = block(path);
  let after = before.replaceAll('request.auth != null', 'moonCompanyStaff()');
  if (path === '/hilos/{hiloId}') after = after.replaceAll('allow get: if true;', 'allow get: if moonCompanyStaff();').replaceAll('allow list: if true;', 'allow list: if moonCompanyStaff();');
  add(path, before, after);
}
for (const path of publicAdminPaths) {
  const before = block(path);
  // clientes contains legitimate self-create/read/update paths. Harden only
  // the already role-restricted management branches, preserving own access.
  const after = path === '/clientes/{clienteId}'
    ? before.replaceAll('if request.auth != null &&\n        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role', 'if moonCompanyStaff() &&\n        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role')
    : before.replaceAll('request.auth != null', 'moonCompanyStaff()');
  add(path, before, after);
}
for (const name of ['canManageMoonPortal', 'canManageMoonWebsite']) {
  const before = functionBlock(name);
  add('function:' + name, before, before.replace('request.auth != null', 'moonCompanyStaff()'));
}
const marker = '    // ===== COLECCIÓN: USERS =====';
if (baseline.split(marker).length !== 2) throw new Error('Corporate helper insertion marker is not unique.');
let composed = baseline.replace(marker, helpers + marker);
for (const replacement of replacements) {
  if (composed.split(replacement.before).length !== 2) throw new Error('Patch does not apply uniquely: ' + replacement.path);
  composed = composed.replace(replacement.before, replacement.after);
}
const unchangedMarkers = ['    // ===== SISTEMA ELECTORAL =====', '    match /allies/{allyId} {', '    match /incidents/{incidentId} {', '    match /_system/{docId} {'];
for (const path of ['/allies/{allyId}', '/incidents/{incidentId}', '/_system/{docId}']) {
  if (!composed.includes(block(path))) throw new Error('Public baseline must remain unchanged: ' + path);
}
for (const marker of unchangedMarkers) if (composed.split(marker).length !== 2) throw new Error('Unrelated marker changed: ' + marker);
await mkdir(resolve(outputPath, '..'), { recursive: true });
const patch = {
  schemaVersion: 1, scope: 'corporate-auth-boundary-v1',
  sourceNormalizedSha256: sha256(baseline),
  helpersInsertion: { beforeMarker: marker, text: helpers, textSha256: sha256(helpers) },
  replacements, composedCompanyOnlySha256: sha256(composed),
  preservedPublicBlocks: ['/allies/{allyId}', '/incidents/{incidentId}', '/_system/{docId}'],
  rationale: 'A Firebase or electoral login does not grant corporate membership. Existing Spanish company roles and public client/CMS operations retain their intentional paths.',
};
await writeFile(outputPath, JSON.stringify(patch, null, 2) + '\n', 'utf8');
console.log('Created ' + replacements.length + ' explicit corporate replacements; public portal/customer paths retained. No deployment or data writes.');
