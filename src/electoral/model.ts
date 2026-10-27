import type { Candidate, Election, ElectionStatus, VoteRecord, ElectoralAccess, ElectoralAccessStatus, ElectoralInvitation, ElectoralAnnouncement, ElectoralSettings } from './electionTypes';
import type { AccessRequestInput, AccessReviewInput, CandidateInput, ElectionInput, ElectoralIdentity, InvitationInput, InvitationUpdateInput, AnnouncementInput, ElectoralSettingsInput } from './types';

export const ELECTORAL_MANAGER_ROLES = ['CEO'] as const;
export const ELECTORAL_STAFF_ROLES = [...ELECTORAL_MANAGER_ROLES, 'ceo', 'superadmin', 'admin', 'moderator', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación', 'employee', 'candidate'] as const;
export const canManageElections = (role: string): boolean => (ELECTORAL_MANAGER_ROLES as readonly string[]).includes(role);
/** Authentication establishes identity; per-process approval establishes voting rights. */
export const canParticipateInElections = (role: string): boolean => role === 'external' || (ELECTORAL_STAFF_ROLES as readonly string[]).includes(role);

export function electoralDate(value: unknown): Date {
  if (value instanceof Date) return new Date(value.getTime());
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const converted: unknown = value.toDate();
    if (converted instanceof Date) return converted;
  }
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date(Number.NaN);
}
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const count = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const accessStatus = (value: unknown): ElectoralAccessStatus => ['none', 'pending', 'approved', 'rejected'].includes(text(value)) ? value as ElectoralAccessStatus : 'none';
const validDate = (value: Date): boolean => Number.isFinite(value.getTime());
const safeDocumentURL = (value: string): boolean => {
  try { const url = new URL(value); return value.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
};

export function normalizeElection(id: string, data: Record<string, unknown>): Election {
  const status: ElectionStatus = ['draft', 'active', 'closed', 'archived', 'deleted'].includes(text(data.status)) ? data.status as ElectionStatus : 'draft';
  const previousStatus = ['draft', 'active', 'closed', 'archived'].includes(text(data.previousStatus)) ? data.previousStatus as Exclude<ElectionStatus, 'deleted'> : undefined;
  return { id, name: text(data.name), description: text(data.description), startDate: electoralDate(data.startDate), endDate: electoralDate(data.endDate), ...(data.registrationStartDate !== undefined ? { registrationStartDate: electoralDate(data.registrationStartDate) } : {}), ...(data.registrationEndDate !== undefined ? { registrationEndDate: electoralDate(data.registrationEndDate) } : {}), status, positions: strings(data.positions), departments: strings(data.departments), createdBy: text(data.createdBy), createdAt: electoralDate(data.createdAt), updatedAt: electoralDate(data.updatedAt), totalVotes: count(data.totalVotes), ...(previousStatus ? { previousStatus } : {}), ...(data.deletedAt !== undefined ? { deletedAt: electoralDate(data.deletedAt) } : {}), ...(typeof data.deletedBy === 'string' ? { deletedBy: data.deletedBy } : {}) };
}
export function normalizeCandidate(id: string, data: Record<string, unknown>): Candidate {
  return { id, uid: text(data.uid), name: text(data.name), photoURL: text(data.photoURL), position: text(data.position), ...(typeof data.positionIndex === 'number' && Number.isInteger(data.positionIndex) ? { positionIndex: data.positionIndex } : {}), department: text(data.department), proposals: strings(data.proposals), party: text(data.party), slogan: text(data.slogan), documents: strings(data.documents).map(value => value.trim()).filter(safeDocumentURL), status: data.status === 'approved' || data.status === 'rejected' ? data.status : 'pending', electionId: text(data.electionId), votes: count(data.votes), createdAt: electoralDate(data.createdAt), approvedAt: electoralDate(data.approvedAt), approvedBy: text(data.approvedBy) };
}
export function normalizeVoteRecord(data: Record<string, unknown>): VoteRecord {
  return { voterId: text(data.voterId), electionId: text(data.electionId), positionsVoted: strings(data.positionsVoted), votedAt: electoralDate(data.votedAt) };
}
export function normalizeElectoralAccess(id: string, data: Record<string, unknown>): ElectoralAccess {
  return { id, uid: text(data.uid), electionId: text(data.electionId), displayName: text(data.displayName), email: text(data.email), photoURL: text(data.photoURL), requestedVoter: data.requestedVoter === true, requestedCandidate: data.requestedCandidate === true, voterStatus: accessStatus(data.voterStatus), candidateStatus: accessStatus(data.candidateStatus), createdAt: electoralDate(data.createdAt), updatedAt: electoralDate(data.updatedAt), ...(data.reviewedAt !== undefined ? { reviewedAt: electoralDate(data.reviewedAt) } : {}), ...(typeof data.reviewedBy === 'string' ? { reviewedBy: data.reviewedBy } : {}) };
}
export function normalizeElectoralInvitation(id: string, data: Record<string, unknown>): ElectoralInvitation {
  return { id, electionId: text(data.electionId), label: text(data.label), email: text(data.email).trim().toLowerCase(), requestedVoter: data.requestedVoter === true, requestedCandidate: data.requestedCandidate === true, status: data.status === 'active' || data.status === 'accepted' ? data.status : 'revoked', expiresAt: electoralDate(data.expiresAt), createdAt: electoralDate(data.createdAt), createdBy: text(data.createdBy), updatedAt: electoralDate(data.updatedAt), ...(data.acceptedAt !== undefined ? { acceptedAt: electoralDate(data.acceptedAt) } : {}), ...(typeof data.acceptedBy === 'string' ? { acceptedBy: data.acceptedBy } : {}) };
}

export function getInvitationState(invitation: ElectoralInvitation, now = new Date()): 'active' | 'accepted' | 'revoked' | 'expired' {
  if (invitation.status === 'accepted' || invitation.status === 'revoked') return invitation.status;
  return !validDate(now) || !validDate(invitation.expiresAt) || now >= invitation.expiresAt ? 'expired' : 'active';
}

export function defaultElectoralSettings(now = new Date()): ElectoralSettings {
  const year = validDate(now) ? Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Lima', year: 'numeric' }).format(now)) : new Date().getFullYear();
  return { enabled: true, closureTitle: 'Elecciones cerradas', closureMessage: 'Nos vemos en la próxima edición.', returnYear: Math.max(2000, Math.min(2200, year + 1)) };
}

export function normalizeElectoralSettings(data: Record<string, unknown> | null, now = new Date()): ElectoralSettings {
  return resolveElectoralSettings(data, now).settings;
}

/** An absent document keeps existing installations open. Invalid stored data
 *  must never silently reopen a system that the CEO has closed. */
export function resolveElectoralSettings(data: Record<string, unknown> | null, now = new Date()): { settings: ElectoralSettings; error: string | null } {
  const fallback = defaultElectoralSettings(now);
  if (data === null) return { settings: fallback, error: null };
  let settings: ElectoralSettings;
  let error: string | null = null;
  try { settings = validateElectoralSettingsInput({ enabled: data.enabled as boolean, closureTitle: text(data.closureTitle), closureMessage: text(data.closureMessage), returnYear: data.returnYear as number }); }
  catch { settings = { ...fallback, enabled: false }; error = 'La configuración electoral no es válida. La participación permanece bloqueada hasta que el CEO la corrija.'; }
  const updatedAt = electoralDate(data.updatedAt);
  return { settings: { ...settings, ...(validDate(updatedAt) ? { updatedAt } : {}), ...(typeof data.updatedBy === 'string' ? { updatedBy: data.updatedBy } : {}) }, error };
}

export function normalizeElectoralAnnouncement(id: string, data: Record<string, unknown>): ElectoralAnnouncement {
  return { id, title: text(data.title), body: text(data.body), status: data.status === 'draft' || data.status === 'published' ? data.status : 'withdrawn', electionId: text(data.electionId), pinned: data.pinned === true, startsAt: electoralDate(data.startsAt), endsAt: electoralDate(data.endsAt), createdAt: electoralDate(data.createdAt), createdBy: text(data.createdBy), updatedAt: electoralDate(data.updatedAt), updatedBy: text(data.updatedBy) };
}

export function isAnnouncementVisible(announcement: ElectoralAnnouncement, now = new Date()): boolean {
  return announcement.status === 'published' && validDate(now) && validDate(announcement.startsAt) && validDate(announcement.endsAt) && announcement.startsAt < announcement.endsAt && announcement.startsAt <= now && now < announcement.endsAt;
}

export function validateElectoralParticipation(settings: ElectoralSettings): void {
  if (settings.enabled !== true) throw new Error(`${settings.closureTitle}. ${settings.closureMessage} Próxima edición: ${settings.returnYear}.`);
}

export function validateElectionDeletion(election: Election): Exclude<ElectionStatus, 'deleted'> {
  if (election.status === 'deleted') throw new Error('Este proceso ya está en la papelera.');
  return election.status;
}

export function validateElectionRestore(election: Election): 'archived' {
  if (election.status !== 'deleted') throw new Error('Solo puedes restaurar procesos de la papelera.');
  return 'archived';
}

/** Mirrors the Firestore rule: a nomination file without votes can be deleted,
 *  except an approved option while its ballot is open. Returns why not, or null. */
export function candidateDeletionBlock(candidate: Candidate, election: Election | null | undefined, now: Date = new Date()): string | null {
  if (candidate.votes > 0) return 'Tiene votos registrados: el expediente forma parte del resultado y se conserva.';
  if (candidate.status === 'approved' && election && election.status === 'active' && validDate(now)
    && validDate(election.startDate) && validDate(election.endDate) && election.startDate <= now && now < election.endDate) {
    return 'Es una opción aprobada con la votación abierta. Retírala después del cierre.';
  }
  return null;
}
export function validateCandidateDeletion(candidate: Candidate, election: Election | null | undefined, now: Date = new Date()): void {
  const block = candidateDeletionBlock(candidate, election, now);
  if (block) throw new Error(block);
}

type WindowState = 'draft' | 'scheduled' | 'open' | 'closed' | 'archived' | 'deleted' | 'invalid';
export function getElectionWindow(election: Election, now: Date = new Date()): { canVote: boolean; state: WindowState; label: string } {
  if (election.status === 'deleted') return { canVote: false, state: 'deleted', label: 'En la papelera' };
  if (election.status === 'archived') return { canVote: false, state: 'archived', label: 'Archivada' };
  if (election.status === 'closed') return { canVote: false, state: 'closed', label: 'Finalizada' };
  if (election.status === 'draft') return { canVote: false, state: 'draft', label: 'En preparación' };
  if (!validDate(now) || !validDate(election.startDate) || !validDate(election.endDate) || election.endDate <= election.startDate) return { canVote: false, state: 'invalid', label: 'Revisar fechas' };
  if (now < election.startDate) return { canVote: false, state: 'scheduled', label: 'Programada' };
  if (now >= election.endDate) return { canVote: false, state: 'closed', label: 'Plazo finalizado' };
  return { canVote: true, state: 'open', label: 'Votación abierta' };
}
export function getRegistrationWindow(election: Election, now: Date = new Date()): { canRegister: boolean; state: WindowState; label: string } {
  if (election.status === 'deleted') return { canRegister: false, state: 'deleted', label: 'Convocatoria en la papelera' };
  if (election.status === 'draft') return { canRegister: false, state: 'draft', label: 'Convocatoria sin publicar' };
  if (election.status === 'archived') return { canRegister: false, state: 'archived', label: 'Convocatoria archivada' };
  if (election.status === 'closed') return { canRegister: false, state: 'closed', label: 'Postulaciones finalizadas' };
  const start = election.registrationStartDate ?? election.createdAt, end = election.registrationEndDate ?? election.startDate;
  if (!validDate(now) || !validDate(start) || !validDate(end) || !validDate(election.startDate) || !validDate(election.endDate) || start >= end || end > election.startDate || election.startDate >= election.endDate) return { canRegister: false, state: 'invalid', label: 'Revisar plazo de postulación' };
  if (now < start) return { canRegister: false, state: 'scheduled', label: 'Postulaciones programadas' };
  if (now >= end || now >= election.startDate) return { canRegister: false, state: 'closed', label: 'Postulaciones finalizadas' };
  return { canRegister: true, state: 'open', label: 'Postulaciones abiertas' };
}
export function getElectionEditMode(election: Election, now: Date = new Date()): 'full' | 'schedule' | 'details' | 'none' {
  if (election.status === 'draft' && election.totalVotes === 0) return 'full';
  if (election.status !== 'active' || !validDate(now) || !validDate(election.startDate)) return 'none';
  return now < election.startDate && election.totalVotes === 0 ? 'schedule' : 'details';
}

function bounded(value: string, label: string, minimum: number, maximum: number): string {
  const clean = value.trim();
  if (clean.length < minimum || clean.length > maximum) throw new Error(`${label}: usa entre ${minimum} y ${maximum} caracteres.`);
  return clean;
}

export function validateElectoralSettingsInput(input: ElectoralSettingsInput): ElectoralSettingsInput {
  if (typeof input.enabled !== 'boolean') throw new Error('Selecciona si la participación electoral está habilitada.');
  if (!Number.isInteger(input.returnYear) || input.returnYear < 2000 || input.returnYear > 2200) throw new Error('El año de la próxima edición debe estar entre 2000 y 2200.');
  return { enabled: input.enabled, closureTitle: bounded(input.closureTitle, 'Título de cierre', 3, 160), closureMessage: bounded(input.closureMessage, 'Mensaje de cierre', 1, 2000), returnYear: input.returnYear };
}

export function validateAnnouncementInput(input: AnnouncementInput, election?: Election | null): AnnouncementInput {
  if (!['draft', 'published', 'withdrawn'].includes(input.status)) throw new Error('Selecciona un estado válido para el anuncio.');
  if (typeof input.pinned !== 'boolean') throw new Error('Indica si el anuncio debe aparecer destacado.');
  const electionId = bounded(input.electionId, 'Proceso del anuncio', 0, 1500);
  if (electionId && (!election || election.id !== electionId || election.status === 'deleted')) throw new Error('Selecciona un proceso existente que no esté en la papelera.');
  if (electionId && input.status === 'published' && election?.status === 'draft') throw new Error('Publica el proceso antes de publicar un anuncio vinculado a él.');
  const startsAt = electoralDate(input.startsAt), endsAt = electoralDate(input.endsAt);
  if (!validDate(startsAt) || !validDate(endsAt) || startsAt >= endsAt) throw new Error('El anuncio debe tener un inicio y un cierre posteriores en orden válido.');
  return { title: bounded(input.title, 'Título del anuncio', 3, 160), body: bounded(input.body, 'Contenido del anuncio', 1, 4000), status: input.status, electionId, pinned: input.pinned, startsAt, endsAt };
}

function validateInvitationDeadline(expiresAt: Date, election: Election, requestedCandidate: boolean, now: Date): Date {
  const clean = electoralDate(expiresAt), candidateEnd = election.registrationEndDate ?? election.startDate;
  if (election.status !== 'active' || !validDate(now) || !validDate(election.endDate) || now >= election.endDate) throw new Error('Las invitaciones solo se gestionan para un proceso publicado cuyo plazo no haya terminado.');
  if (!validDate(clean) || clean <= now || clean > election.endDate) throw new Error('La invitación debe vencer en el futuro y antes o al cierre del proceso.');
  if (requestedCandidate && (!validDate(candidateEnd) || clean > candidateEnd || candidateEnd > election.startDate)) throw new Error('Una invitación para postular debe vencer como máximo al cierre de postulaciones.');
  return clean;
}

export function validateInvitationInput(input: InvitationInput, election: Election, now = new Date()): InvitationInput {
  if (input.electionId !== election.id) throw new Error('La invitación no pertenece a este proceso.');
  if (typeof input.requestedVoter !== 'boolean' || typeof input.requestedCandidate !== 'boolean' || (!input.requestedVoter && !input.requestedCandidate)) throw new Error('Selecciona si invitas a votar, postular o solicitar ambos permisos.');
  const label = bounded(input.label, 'Nombre de la invitación', 2, 160), email = bounded(input.email, 'Correo de la invitación', 0, 320).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido o deja el campo vacío para compartir el enlace.');
  return { electionId: election.id, label, email, requestedVoter: input.requestedVoter, requestedCandidate: input.requestedCandidate, expiresAt: validateInvitationDeadline(input.expiresAt, election, input.requestedCandidate, now) };
}

export function validateInvitationUpdate(input: InvitationUpdateInput, invitation: ElectoralInvitation, election: Election, now = new Date()): InvitationUpdateInput {
  if (invitation.status !== 'active' || invitation.electionId !== election.id) throw new Error('Las invitaciones aceptadas o revocadas conservan su historial.');
  return { label: bounded(input.label, 'Nombre de la invitación', 2, 160), expiresAt: validateInvitationDeadline(input.expiresAt, election, invitation.requestedCandidate, now) };
}

/** Merges requested rights without resetting a decision or requiring duplicate requests. */
export function validateInvitationAcceptance(invitation: ElectoralInvitation, election: Election, identity: ElectoralIdentity, previous: ElectoralAccess | null = null, now = new Date()): Pick<ElectoralAccess, 'requestedVoter' | 'requestedCandidate' | 'voterStatus' | 'candidateStatus'> {
  if (!identity.uid || !canParticipateInElections(identity.role)) throw new Error('Inicia sesión con una cuenta verificada para aceptar la invitación.');
  if (getInvitationState(invitation, now) !== 'active') throw new Error('Esta invitación venció, ya fue aceptada o fue revocada.');
  if (invitation.electionId !== election.id || election.status !== 'active' || !validDate(election.endDate) || now >= election.endDate) throw new Error('El proceso de esta invitación ya no admite solicitudes.');
  // A CEO may shorten the calendar after issuing a link. Recheck its whole
  // deadline against the current process, just as the server does on claim.
  validateInvitationDeadline(invitation.expiresAt, election, invitation.requestedCandidate, now);
  if (!invitation.requestedVoter && !invitation.requestedCandidate) throw new Error('La invitación no contiene permisos para solicitar.');
  if (invitation.email && (identity.emailVerified !== true || invitation.email !== (identity.email ?? '').trim().toLowerCase())) throw new Error('Inicia sesión con el correo verificado al que se dirigió esta invitación.');
  if (invitation.requestedCandidate && !getRegistrationWindow(election, now).canRegister) throw new Error('Acepta la invitación durante el plazo de postulaciones publicado.');
  if (previous && (previous.uid !== identity.uid || previous.electionId !== election.id)) throw new Error('La solicitud no coincide con tu cuenta y proceso.');
  return {
    requestedVoter: Boolean(previous?.requestedVoter || invitation.requestedVoter),
    requestedCandidate: Boolean(previous?.requestedCandidate || invitation.requestedCandidate),
    voterStatus: invitation.requestedVoter && (!previous || previous.voterStatus === 'none') ? 'pending' : previous?.voterStatus ?? 'none',
    candidateStatus: invitation.requestedCandidate && (!previous || previous.candidateStatus === 'none') ? 'pending' : previous?.candidateStatus ?? 'none',
  };
}
function uniqueList(values: string[], label: string, maximum: number): string[] {
  const clean = values.map(value => bounded(value, label, 1, 100));
  if (clean.some(value => /[\r\n]/.test(value))) throw new Error(`${label}: escribe una opción por línea.`);
  if (clean.length > maximum || new Set(clean.map(value => value.toLocaleLowerCase('es'))).size !== clean.length) throw new Error(`${label}: elimina los duplicados y usa hasta ${maximum} opciones.`);
  return clean;
}
export function validateElectionInput(input: ElectionInput, now = new Date()): ElectionInput & { registrationStartDate: Date; registrationEndDate: Date } {
  const name = bounded(input.name, 'Nombre de la elección', 3, 160), description = bounded(input.description, 'Descripción', 0, 3000);
  const startDate = electoralDate(input.startDate), endDate = electoralDate(input.endDate), registrationStartDate = electoralDate(input.registrationStartDate ?? now), registrationEndDate = electoralDate(input.registrationEndDate ?? startDate);
  if (![registrationStartDate, registrationEndDate, startDate, endDate].every(validDate) || registrationStartDate >= registrationEndDate || registrationEndDate > startDate || startDate >= endDate) throw new Error('Ordena las fechas: inicio de postulaciones, cierre de postulaciones, inicio de votación y cierre de votación. El cierre de postulaciones puede coincidir con el inicio de votación.');
  const positions = uniqueList(input.positions, 'Cargos', 20), departments = uniqueList(input.departments, 'Áreas', 30);
  if (positions.length === 0) throw new Error('Agrega al menos un cargo.');
  return { name, description, startDate, endDate, registrationStartDate, registrationEndDate, positions, departments };
}
export function validateElectionUpdate(previous: Election, input: ElectionInput, now = new Date(), hasApplications = false): ElectionInput {
  const mode = getElectionEditMode(previous, now);
  if (mode === 'none') throw new Error('Este proceso conserva su historial y ya no admite cambios.');
  const effectiveInput = { ...input, registrationStartDate: input.registrationStartDate ?? previous.registrationStartDate ?? previous.createdAt, registrationEndDate: input.registrationEndDate ?? previous.registrationEndDate ?? previous.startDate };
  if (mode === 'details') {
    const protectedDates: Array<[Date, Date]> = [[input.startDate, previous.startDate], [input.endDate, previous.endDate], [effectiveInput.registrationStartDate, previous.registrationStartDate ?? previous.createdAt], [effectiveInput.registrationEndDate, previous.registrationEndDate ?? previous.startDate]];
    if (protectedDates.some(([next, old]) => electoralDate(next).getTime() !== old.getTime()) || JSON.stringify(input.positions) !== JSON.stringify(previous.positions) || JSON.stringify(input.departments) !== JSON.stringify(previous.departments)) throw new Error('La votación ya comenzó. Solo puedes corregir el nombre y la descripción; el calendario, los cargos y las áreas se conservan.');
    return { name: bounded(input.name, 'Nombre de la elección', 3, 160), description: bounded(input.description, 'Descripción', 0, 3000), startDate: previous.startDate, endDate: previous.endDate, positions: [...previous.positions], departments: [...previous.departments], ...(previous.registrationStartDate ? { registrationStartDate: previous.registrationStartDate } : {}), ...(previous.registrationEndDate ? { registrationEndDate: previous.registrationEndDate } : {}) };
  }
  const clean = validateElectionInput(effectiveInput, now);
  if ((mode === 'schedule' || hasApplications) && (JSON.stringify(previous.positions) !== JSON.stringify(clean.positions) || JSON.stringify(previous.departments) !== JSON.stringify(clean.departments))) throw new Error('El proceso publicado o con candidaturas debe conservar sus cargos y áreas. Puedes corregir el calendario antes del inicio de votación.');
  if (mode === 'schedule' && clean.startDate <= now) throw new Error('Para modificar el calendario, el nuevo inicio de votación debe estar en el futuro.');
  return clean;
}
export function validateCandidateInput(input: CandidateInput, election: Election, now = new Date()): CandidateInput {
  if (!getRegistrationWindow(election, now).canRegister) throw new Error('Las postulaciones solo se reciben en el plazo publicado y antes del inicio de votación.');
  if (!election.positions.includes(input.position) || input.electionId !== election.id) throw new Error('El cargo no pertenece a esta elección.');
  const proposals = input.proposals.map(value => value.trim()).filter(Boolean);
  if (!proposals.length || proposals.length > 10 || proposals.some(value => value.length > 1000)) throw new Error('Agrega entre 1 y 10 propuestas de hasta 1000 caracteres.');
  const department = bounded(input.department, 'Área', 0, 100);
  if (election.departments.length && !election.departments.includes(department)) throw new Error('Selecciona una de las áreas convocadas.');
  return { electionId: input.electionId, position: input.position, name: bounded(input.name, 'Nombre', 2, 160), department, proposals, slogan: bounded(input.slogan ?? '', 'Lema', 0, 250), party: bounded(input.party ?? '', 'Lista o equipo', 0, 120) };
}
export function validateAccessRequest(input: AccessRequestInput, previous?: ElectoralAccess | null): Pick<ElectoralAccess, 'requestedVoter' | 'requestedCandidate' | 'voterStatus' | 'candidateStatus'> {
  if (!input.voter && !input.candidate) throw new Error('Selecciona si quieres votar, postular o solicitar ambos permisos.');
  const requestedVoter = Boolean(previous?.requestedVoter || input.voter), requestedCandidate = Boolean(previous?.requestedCandidate || input.candidate);
  const voterStatus = input.voter && (!previous || previous.voterStatus === 'none') ? 'pending' : previous?.voterStatus ?? 'none';
  const candidateStatus = input.candidate && (!previous || previous.candidateStatus === 'none') ? 'pending' : previous?.candidateStatus ?? 'none';
  if (previous && previous.requestedVoter === requestedVoter && previous.requestedCandidate === requestedCandidate && previous.voterStatus === voterStatus && previous.candidateStatus === candidateStatus) throw new Error('Tu solicitud ya está registrada. La decisión corresponde al CEO; no necesitas enviarla otra vez.');
  return { requestedVoter, requestedCandidate, voterStatus, candidateStatus };
}
export function validateAccessReview(input: AccessReviewInput, previous: ElectoralAccess): Pick<ElectoralAccess, 'voterStatus' | 'candidateStatus'> {
  if (input.voterStatus === undefined && input.candidateStatus === undefined) throw new Error('Selecciona al menos una decisión de acceso.');
  if ((input.voterStatus !== undefined && !['approved', 'rejected'].includes(input.voterStatus)) || (input.candidateStatus !== undefined && !['approved', 'rejected'].includes(input.candidateStatus))) throw new Error('La decisión debe aprobar o rechazar el permiso solicitado.');
  if ((input.voterStatus !== undefined && !previous.requestedVoter) || (input.candidateStatus !== undefined && !previous.requestedCandidate)) throw new Error('Solo puedes resolver permisos que la persona haya solicitado.');
  return { voterStatus: input.voterStatus ?? previous.voterStatus, candidateStatus: input.candidateStatus ?? previous.candidateStatus };
}
function approvedAccess(access: ElectoralAccess | null | undefined, uid: string, electionId: string, type: 'voter' | 'candidate'): void {
  if (!access || access.uid !== uid || access.electionId !== electionId || (type === 'voter' ? access.voterStatus : access.candidateStatus) !== 'approved') throw new Error(type === 'voter' ? 'Necesitas la aprobación del CEO como votante de este proceso.' : 'Necesitas la aprobación del CEO para postular en este proceso.');
}
export const validateAccessForVote = (access: ElectoralAccess | null | undefined, uid: string, electionId: string): void => approvedAccess(access, uid, electionId, 'voter');
export const validateAccessForCandidate = (access: ElectoralAccess | null | undefined, uid: string, electionId: string): void => approvedAccess(access, uid, electionId, 'candidate');
export function validateVote(election: Election, candidate: Candidate, record: VoteRecord | null, position: string, now = new Date()): number {
  if (!getElectionWindow(election, now).canVote) throw new Error('La elección no está abierta para votar.');
  const index = election.positions.indexOf(position);
  if (index < 0 || candidate.electionId !== election.id || candidate.position !== position || candidate.status !== 'approved') throw new Error('La candidatura no corresponde a este cargo y elección.');
  if (record?.positionsVoted.includes(position)) throw new Error('Ya registraste tu voto para este cargo.');
  return index;
}
export const electoralAccessId = (uid: string, electionId: string): string => `${uid}_${electionId}`;
export const electoralCandidateId = (uid: string, electionId: string, positionIndex: number): string => `${uid}_${electionId}_${positionIndex}`;
export const electoralVoteId = (uid: string, electionId: string, positionIndex: number): string => `${uid}_${electionId}_${positionIndex}`;
export function canTransitionElection(previous: ElectionStatus, next: ElectionStatus): boolean {
  return previous === next || (previous === 'draft' && ['active', 'archived'].includes(next)) || (previous === 'active' && next === 'closed') || (previous === 'closed' && next === 'archived');
}
export function getPositionResults(candidates: Candidate[], position: string) {
  const ranked = candidates.filter(candidate => candidate.status === 'approved' && candidate.position === position).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, 'es'));
  const totalVotes = ranked.reduce((sum, candidate) => sum + candidate.votes, 0);
  const leaders = totalVotes > 0 ? ranked.filter(candidate => candidate.votes === ranked[0]?.votes) : [];
  return { position, candidates: ranked.map(candidate => ({ ...candidate, percentage: totalVotes ? candidate.votes / totalVotes * 100 : 0 })), totalVotes, leaders, tied: leaders.length > 1, winner: leaders.length === 1 ? leaders[0] : null };
}
