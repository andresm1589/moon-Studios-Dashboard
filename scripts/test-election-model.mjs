import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Runs the shipped domain functions in memory, without Firebase, accounts,
// simulated UI votes or network access. Run sync-elections.mjs first.
const source = await readFile(process.argv[2] ? pathToFileURL(resolve(process.argv[2])) : new URL('../src/electoral/model.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
let checks = 0;
function test(name, run) { try { run(); checks++; } catch (error) { console.error(`FAIL ${name}`); throw error; } }
const now = new Date('2026-10-16T16:00:00Z');
const election = { id: 'process-a', name: 'Comité de equipo', description: '', registrationStartDate: new Date('2026-10-16T12:00:00Z'), registrationEndDate: new Date('2026-10-16T15:00:00Z'), startDate: new Date('2026-10-16T15:00:00Z'), endDate: new Date('2026-10-16T17:00:00Z'), status: 'active', positions: ['Presidencia', 'Secretaría'], departments: [], createdBy: 'manager', createdAt: new Date('2026-10-16T12:00:00Z'), totalVotes: 0 };
const candidate = { id: 'candidate-a', uid: 'applicant', name: 'Candidatura A', photoURL: '', position: 'Presidencia', department: '', proposals: ['Mejorar procesos.'], status: 'approved', electionId: 'process-a', votes: 0, createdAt: now };
test('exact CEO role grants administration', () => assert.equal(model.canManageElections('CEO'), true));
for (const role of ['ceo', 'superadmin', 'admin', 'moderator', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación', 'employee', 'candidate', 'external']) test(`participant ${role} has no administration`, () => { assert.equal(model.canParticipateInElections(role), true); assert.equal(model.canManageElections(role), false); });
for (const role of ['client', '', 'Unknown', 'CEO ', 'ADMIN']) test(`unknown role ${role} denied`, () => assert.equal(model.canParticipateInElections(role), false));
test('valid open window', () => assert.equal(model.getElectionWindow(election, now).canVote, true));
test('opening instant included', () => assert.equal(model.getElectionWindow(election, election.startDate).canVote, true));
test('closing instant excluded', () => assert.equal(model.getElectionWindow(election, election.endDate).canVote, false));
test('future active process scheduled', () => assert.equal(model.getElectionWindow(election, new Date('2026-10-16T14:00:00Z')).state, 'scheduled'));
for (const status of ['draft', 'closed', 'archived']) test(`${status} blocks voting`, () => assert.equal(model.getElectionWindow({ ...election, status }, now).canVote, false));
test('invalid date blocks voting', () => assert.equal(model.getElectionWindow({ ...election, endDate: new Date(NaN) }, now).canVote, false));
test('reversed dates block voting', () => assert.equal(model.getElectionWindow({ ...election, endDate: election.startDate }, now).canVote, false));
test('candidate matches election and position', () => assert.equal(model.validateVote(election, candidate, null, 'Presidencia', now), 0));
for (const mutation of [{ electionId: 'other' }, { position: 'Secretaría' }, { status: 'pending' }, { status: 'rejected' }]) test(`invalid candidate ${JSON.stringify(mutation)}`, () => assert.throws(() => model.validateVote(election, { ...candidate, ...mutation }, null, 'Presidencia', now)));
test('unlisted position rejected', () => assert.throws(() => model.validateVote(election, candidate, null, 'Gerencia', now)));
test('legacy participation record prevents duplicate', () => assert.throws(() => model.validateVote(election, candidate, { voterId: 'employee', electionId: election.id, positionsVoted: ['Presidencia'], votedAt: now }, 'Presidencia', now)));
test('another position remains available', () => assert.equal(model.validateVote(election, candidate, { voterId: 'employee', electionId: election.id, positionsVoted: ['Secretaría'], votedAt: now }, 'Presidencia', now), 0));
test('ballot identifier deterministic per position', () => { assert.equal(model.electoralVoteId('user', election.id, 0), 'user_process-a_0'); assert.notEqual(model.electoralVoteId('user', election.id, 0), model.electoralVoteId('user', election.id, 1)); });
test('zero votes do not produce a winner', () => assert.equal(model.getPositionResults([candidate], 'Presidencia').winner, null));
test('tie is reported without arbitrary winner', () => { const result = model.getPositionResults([{ ...candidate, votes: 2 }, { ...candidate, id: 'b', name: 'Otra', votes: 2 }], 'Presidencia'); assert.equal(result.tied, true); assert.equal(result.winner, null); assert.equal(result.totalVotes, 4); });
test('approved ranking derives real percentages', () => { const result = model.getPositionResults([{ ...candidate, votes: 3 }, { ...candidate, id: 'b', votes: 1 }, { ...candidate, id: 'c', status: 'pending', votes: 50 }], 'Presidencia'); assert.equal(result.winner.id, candidate.id); assert.equal(result.candidates[0].percentage, 75); assert.equal(result.totalVotes, 4); });
test('no candidates is a valid empty state', () => assert.equal(model.getPositionResults([], 'Presidencia').totalVotes, 0));
const nominationElection = { ...election, registrationStartDate: new Date('2026-10-16T14:00:00Z'), registrationEndDate: new Date('2026-10-16T18:00:00Z'), startDate: new Date('2026-10-16T18:00:00Z'), endDate: new Date('2026-10-16T20:00:00Z'), departments: ['General'] };
const nomination = { electionId: election.id, name: '  Persona candidata  ', position: 'Presidencia', department: 'General', proposals: ['  Mejorar procesos  ', ''], slogan: '', party: '' };
test('nomination trims and removes empty proposals', () => { const result = model.validateCandidateInput(nomination, nominationElection, now); assert.equal(result.name, 'Persona candidata'); assert.deepEqual(result.proposals, ['Mejorar procesos']); });
for (const status of ['draft', 'closed', 'archived']) test(`nominations frozen when ${status}`, () => assert.throws(() => model.validateCandidateInput(nomination, { ...nominationElection, status }, now)));
test('expired process rejects nomination', () => assert.throws(() => model.validateCandidateInput(nomination, { ...nominationElection, endDate: new Date('2000-01-01') }, now)));
test('invalid deadline rejects nomination', () => assert.throws(() => model.validateCandidateInput(nomination, { ...nominationElection, endDate: new Date(NaN) }, now)));
for (const mutation of [{ electionId: 'other' }, { position: 'Gerencia' }, { department: 'Otra área' }, { name: 'A' }, { proposals: [] }, { proposals: ['x'.repeat(1001)] }, { proposals: Array(11).fill('Propuesta') }, { slogan: 'x'.repeat(251) }]) test(`invalid nomination ${Object.keys(mutation)[0]}`, () => assert.throws(() => model.validateCandidateInput({ ...nomination, ...mutation }, nominationElection, now)));
test('election input trimmed with preserved date values', () => { const result = model.validateElectionInput({ ...election, name: '  Elección de equipo  ' }, now); assert.equal(result.name, 'Elección de equipo'); assert.equal(result.startDate.getTime(), election.startDate.getTime()); });
for (const mutation of [{ name: '' }, { positions: [] }, { positions: ['Cargo', 'cargo'] }, { endDate: election.startDate }, { positions: Array.from({ length: 21 }, (_, index) => `Cargo ${index}`) }, { description: 'x'.repeat(3001) }]) test(`invalid configuration ${Object.keys(mutation)[0]}`, () => assert.throws(() => model.validateElectionInput({ ...election, ...mutation }, now)));
for (const [from, to, allowed] of [['draft', 'active', true], ['active', 'closed', true], ['closed', 'archived', true], ['draft', 'archived', true], ['closed', 'active', false], ['archived', 'draft', false], ['active', 'draft', false]]) test(`status ${from} -> ${to}`, () => assert.equal(model.canTransitionElection(from, to), allowed));
test('Firestore dates and invalid counters normalize safely', () => { const normalized = model.normalizeElection('real-id', { ...election, id: 'forged-id', createdAt: { toDate: () => now }, totalVotes: -20 }); assert.equal(normalized.id, 'real-id'); assert.equal(normalized.createdAt, now); assert.equal(normalized.totalVotes, 0); });
test('record data is isolated and copied', () => { const original = ['Presidencia']; const record = model.normalizeVoteRecord({ voterId: 'person', electionId: election.id, positionsVoted: original, votedAt: now }); original.push('Secretaría'); assert.deepEqual(record.positionsVoted, ['Presidencia']); });

test('new dates default to now through vote start', () => { const result = model.validateElectionInput({ ...nominationElection, registrationStartDate: undefined, registrationEndDate: undefined }, now); assert.equal(result.registrationStartDate.getTime(), now.getTime()); assert.equal(result.registrationEndDate.getTime(), nominationElection.startDate.getTime()); });
for (const mutation of [{ registrationStartDate: new Date(NaN) }, { registrationEndDate: new Date(NaN) }, { registrationStartDate: nominationElection.registrationEndDate }, { registrationEndDate: new Date('2026-10-16T19:00:00Z') }]) test(`invalid registration order ${JSON.stringify(mutation)}`, () => assert.throws(() => model.validateElectionInput({ ...nominationElection, ...mutation }, now)));
test('postulation opens on its exact first instant', () => assert.equal(model.getRegistrationWindow(nominationElection, nominationElection.registrationStartDate).canRegister, true));
test('postulation closes on its exact last instant', () => assert.equal(model.getRegistrationWindow(nominationElection, nominationElection.registrationEndDate).canRegister, false));
test('postulation cannot overrun voting start', () => assert.equal(model.getRegistrationWindow({ ...nominationElection, registrationEndDate: new Date('2026-10-16T19:00:00Z') }, now).state, 'invalid'));
test('future postulation date remains scheduled', () => assert.equal(model.getRegistrationWindow(nominationElection, new Date('2026-10-16T13:59:59Z')).state, 'scheduled'));
test('legacy registration falls back to createdAt and vote start', () => assert.equal(model.getRegistrationWindow({ ...nominationElection, registrationStartDate: undefined, registrationEndDate: undefined }, now).canRegister, true));
test('invalid client clock fails closed', () => { assert.equal(model.getRegistrationWindow(nominationElection, new Date(NaN)).canRegister, false); assert.equal(model.getElectionWindow(election, new Date(NaN)).canVote, false); });

test('draft admits full editing', () => assert.equal(model.getElectionEditMode({ ...nominationElection, status: 'draft' }, now), 'full'));
test('published future admits schedule editing', () => assert.equal(model.getElectionEditMode(nominationElection, now), 'schedule'));
test('opening instant locks schedule', () => assert.equal(model.getElectionEditMode(nominationElection, nominationElection.startDate), 'details'));
for (const status of ['closed', 'archived']) test(`${status} cannot be edited`, () => assert.equal(model.getElectionEditMode({ ...nominationElection, status }, now), 'none'));
test('draft with historic votes cannot be edited', () => assert.equal(model.getElectionEditMode({ ...nominationElection, status: 'draft', totalVotes: 1 }, now), 'none'));
test('future process with votes cannot reschedule', () => assert.equal(model.getElectionEditMode({ ...nominationElection, totalVotes: 1 }, now), 'details'));
test('future published schedule can be corrected', () => assert.equal(model.validateElectionUpdate(nominationElection, { ...nominationElection, endDate: new Date('2026-10-16T21:00:00Z') }, now).endDate.getUTCHours(), 21));
test('published cargos immutable before start', () => assert.throws(() => model.validateElectionUpdate(nominationElection, { ...nominationElection, positions: ['Otro cargo'] }, now)));
test('published areas immutable before start', () => assert.throws(() => model.validateElectionUpdate(nominationElection, { ...nominationElection, departments: ['Otra área'] }, now)));
test('draft with old nominations preserves positions', () => assert.throws(() => model.validateElectionUpdate({ ...nominationElection, status: 'draft' }, { ...nominationElection, positions: ['Otro cargo'] }, now, true)));
test('draft without nominations may change positions', () => assert.deepEqual(model.validateElectionUpdate({ ...nominationElection, status: 'draft' }, { ...nominationElection, positions: ['Otro cargo'] }, now).positions, ['Otro cargo']));
test('published schedule cannot be moved into past', () => assert.throws(() => model.validateElectionUpdate(nominationElection, { ...nominationElection, registrationEndDate: now, startDate: now }, now)));
test('active name/description can be corrected', () => { const result = model.validateElectionUpdate(election, { ...election, name: '  Nombre corregido  ', description: ' Texto corregido ' }, now); assert.equal(result.name, 'Nombre corregido'); assert.equal(result.description, 'Texto corregido'); });
for (const mutation of [{ startDate: new Date('2026-10-16T14:00:00Z') }, { endDate: new Date('2026-10-16T19:00:00Z') }, { registrationStartDate: new Date('2026-10-16T13:00:00Z') }, { registrationEndDate: new Date('2026-10-16T14:00:00Z') }, { positions: ['Otro cargo'] }, { departments: ['Otra área'] }]) test(`running process blocks ${Object.keys(mutation)[0]} mutation`, () => assert.throws(() => model.validateElectionUpdate(election, { ...election, ...mutation }, now)));
test('legacy process metadata can be corrected without introducing dates', () => { const legacy = { ...election, registrationStartDate: undefined, registrationEndDate: undefined }; const result = model.validateElectionUpdate(legacy, { ...legacy, name: 'Nombre nuevo' }, now); assert.equal(result.registrationStartDate, undefined); assert.equal(result.name, 'Nombre nuevo'); });

const access = { id: 'person_process-a', uid: 'person', electionId: election.id, displayName: 'Persona', email: '', photoURL: '', requestedVoter: true, requestedCandidate: true, voterStatus: 'approved', candidateStatus: 'approved', createdAt: now, updatedAt: now };
test('external may request rights but is not CEO', () => { assert.equal(model.canParticipateInElections('external'), true); assert.equal(model.canManageElections('external'), false); });
test('first voter request grants no voting privilege', () => assert.deepEqual(model.validateAccessRequest({ voter: true, candidate: false }), { requestedVoter: true, requestedCandidate: false, voterStatus: 'pending', candidateStatus: 'none' }));
test('first candidacy request is independently pending', () => assert.deepEqual(model.validateAccessRequest({ voter: false, candidate: true }), { requestedVoter: false, requestedCandidate: true, voterStatus: 'none', candidateStatus: 'pending' }));
test('both permissions can be requested together', () => { const result = model.validateAccessRequest({ voter: true, candidate: true }); assert.equal(result.voterStatus, 'pending'); assert.equal(result.candidateStatus, 'pending'); });
test('empty permission request rejected', () => assert.throws(() => model.validateAccessRequest({ voter: false, candidate: false })));
test('duplicate request cannot overwrite CEO approval', () => assert.throws(() => model.validateAccessRequest({ voter: true, candidate: true }, access)));
test('rejected request cannot reset its own decision', () => assert.throws(() => model.validateAccessRequest({ voter: true, candidate: false }, { ...access, voterStatus: 'rejected' })));
test('adding new permission preserves approved first permission', () => { const result = model.validateAccessRequest({ voter: false, candidate: true }, { ...access, requestedCandidate: false, candidateStatus: 'none' }); assert.equal(result.voterStatus, 'approved'); assert.equal(result.candidateStatus, 'pending'); });
test('CEO can revoke future voting while preserving candidate eligibility', () => assert.deepEqual(model.validateAccessReview({ voterStatus: 'rejected' }, access), { voterStatus: 'rejected', candidateStatus: 'approved' }));
test('CEO can reconsider prior rejected access', () => assert.equal(model.validateAccessReview({ voterStatus: 'approved' }, { ...access, voterStatus: 'rejected' }).voterStatus, 'approved'));
test('CEO cannot approve an unrequested permission', () => assert.throws(() => model.validateAccessReview({ candidateStatus: 'approved' }, { ...access, requestedCandidate: false, candidateStatus: 'none' })));
test('empty CEO decision rejected', () => assert.throws(() => model.validateAccessReview({}, access)));
test('pending is not a CEO approval decision', () => assert.throws(() => model.validateAccessReview({ voterStatus: 'pending' }, access)));
for (const [name, candidateAccess] of [['missing', null], ['pending', { ...access, voterStatus: 'pending' }], ['rejected', { ...access, voterStatus: 'rejected' }], ['another uid', { ...access, uid: 'other' }], ['another election', { ...access, electionId: 'other' }], ['candidate only', { ...access, voterStatus: 'none' }]]) test(`${name} cannot vote`, () => assert.throws(() => model.validateAccessForVote(candidateAccess, 'person', election.id)));
test('only matching voter approval grants vote eligibility', () => assert.doesNotThrow(() => model.validateAccessForVote(access, 'person', election.id)));
for (const [name, candidateAccess] of [['missing', null], ['pending', { ...access, candidateStatus: 'pending' }], ['rejected', { ...access, candidateStatus: 'rejected' }], ['another uid', { ...access, uid: 'other' }], ['another election', { ...access, electionId: 'other' }], ['voter only', { ...access, candidateStatus: 'none' }]]) test(`${name} cannot nominate`, () => assert.throws(() => model.validateAccessForCandidate(candidateAccess, 'person', election.id)));
test('only matching candidate approval grants nomination eligibility', () => assert.doesNotThrow(() => model.validateAccessForCandidate(access, 'person', election.id)));
test('new candidature identifiers unique per election cargo', () => { assert.equal(model.electoralCandidateId('person', election.id, 0), 'person_process-a_0'); assert.notEqual(model.electoralCandidateId('person', election.id, 0), model.electoralCandidateId('person', election.id, 1)); });
test('access uses one deterministic document per person/process', () => assert.equal(model.electoralAccessId('person', election.id), 'person_process-a'));
test('malformed access status never normalizes into approval', () => { const result = model.normalizeElectoralAccess('real', { ...access, id: 'forged', voterStatus: 'CEO', requestedCandidate: 'true' }); assert.equal(result.id, 'real'); assert.equal(result.voterStatus, 'none'); assert.equal(result.requestedCandidate, false); });
test('normalization preserves explicit registration instants', () => { const result = model.normalizeElection(election.id, nominationElection); assert.equal(result.registrationStartDate.getTime(), nominationElection.registrationStartDate.getTime()); assert.equal(result.registrationEndDate.getTime(), nominationElection.registrationEndDate.getTime()); });

test('candidate dossiers preserve safe documents without unsafe protocols or credentials', () => {
  const result = model.normalizeCandidate('real', { ...candidate, documents: [' https://example.test/cv.pdf ', 'javascript:alert(1)', 'http://example.test/plain.pdf', 'data:text/html,hello', '/relative.pdf', 'https://user:pass@example.test/secret.pdf', 12, 'https://example.test/' + 'x'.repeat(2049)] });
  assert.deepEqual(result.documents, ['https://example.test/cv.pdf']);
});
test('missing legacy candidate documents normalize to an empty list', () => assert.deepEqual(model.normalizeCandidate('legacy', candidate).documents, []));

const invitationInput = { electionId: nominationElection.id, label: '  Invitación al equipo  ', email: '  Persona@Example.test  ', requestedVoter: true, requestedCandidate: true, expiresAt: new Date('2026-10-16T17:00:00Z') };
const invitation = { id: 'Abcdef0123456789Abcde', ...invitationInput, label: 'Invitación al equipo', email: 'persona@example.test', status: 'active', createdBy: 'manager', createdAt: now, updatedAt: now };
const invitee = { uid: 'person', displayName: 'Persona', role: 'external', email: 'PERSONA@example.test', emailVerified: true };
test('invitation trims label and normalizes recipient email', () => {
  const result = model.validateInvitationInput(invitationInput, nominationElection, now);
  assert.equal(result.label, 'Invitación al equipo'); assert.equal(result.email, 'persona@example.test'); assert.equal(result.expiresAt.getTime(), invitationInput.expiresAt.getTime());
});
test('shared invitation may omit email binding', () => assert.equal(model.validateInvitationInput({ ...invitationInput, email: '' }, nominationElection, now).email, ''));
for (const mutation of [{ electionId: 'other' }, { label: 'A' }, { label: 'x'.repeat(161) }, { email: 'a@b' }, { email: 'a b@example.test' }, { email: 'x'.repeat(321) }, { requestedVoter: false, requestedCandidate: false }, { requestedVoter: 'true' }, { requestedCandidate: 1 }, { expiresAt: new Date(NaN) }, { expiresAt: now }, { expiresAt: new Date(now.getTime() - 1) }, { expiresAt: new Date('2026-10-16T20:00:00.001Z') }, { expiresAt: new Date('2026-10-16T18:00:00.001Z') }]) test(`invalid invitation input ${JSON.stringify(mutation)}`, () => assert.throws(() => model.validateInvitationInput({ ...invitationInput, ...mutation }, nominationElection, now)));
for (const status of ['draft', 'closed', 'archived']) test(`cannot invite to ${status} process`, () => assert.throws(() => model.validateInvitationInput(invitationInput, { ...nominationElection, status }, now)));
test('cannot invite to elapsed process', () => assert.throws(() => model.validateInvitationInput(invitationInput, nominationElection, nominationElection.endDate)));
test('invalid client clock blocks invitation creation', () => assert.throws(() => model.validateInvitationInput(invitationInput, nominationElection, new Date(NaN))));
test('candidate invitation can expire at exact registration closure', () => assert.equal(model.validateInvitationInput({ ...invitationInput, expiresAt: nominationElection.registrationEndDate }, nominationElection, now).expiresAt.getTime(), nominationElection.registrationEndDate.getTime()));
test('voter invitation may remain valid through exact process end', () => assert.equal(model.validateInvitationInput({ ...invitationInput, requestedCandidate: false, expiresAt: nominationElection.endDate }, nominationElection, now).expiresAt.getTime(), nominationElection.endDate.getTime()));
test('legacy candidate invitation expiry uses vote start', () => assert.doesNotThrow(() => model.validateInvitationInput(invitationInput, { ...nominationElection, registrationStartDate: undefined, registrationEndDate: undefined }, now)));
test('invalid process deadline blocks invitation creation', () => assert.throws(() => model.validateInvitationInput(invitationInput, { ...nominationElection, endDate: new Date(NaN) }, now)));

test('active invitation can correct name and expiry', () => {
  const result = model.validateInvitationUpdate({ label: '  Nuevo nombre  ', expiresAt: nominationElection.registrationEndDate }, invitation, nominationElection, now);
  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'label']); assert.equal(result.label, 'Nuevo nombre');
});
for (const status of ['accepted', 'revoked']) test(`${status} invitation history cannot be rewritten`, () => assert.throws(() => model.validateInvitationUpdate({ label: 'Nuevo nombre', expiresAt: invitation.expiresAt }, { ...invitation, status }, nominationElection, now)));
test('invitation update cannot change process via forged input', () => assert.throws(() => model.validateInvitationUpdate({ label: 'Nuevo nombre', expiresAt: invitation.expiresAt }, { ...invitation, electionId: 'other' }, nominationElection, now)));
test('candidate invitation cannot extend beyond postulations', () => assert.throws(() => model.validateInvitationUpdate({ label: 'Nuevo nombre', expiresAt: nominationElection.endDate }, invitation, nominationElection, now)));
test('unclaimed expired invitation can be extended by CEO before process closure', () => assert.doesNotThrow(() => model.validateInvitationUpdate({ label: 'Nueva vigencia', expiresAt: invitation.expiresAt }, { ...invitation, expiresAt: new Date(now.getTime() - 1) }, nominationElection, now)));

test('invitation exact expiry is excluded', () => assert.equal(model.getInvitationState(invitation, invitation.expiresAt), 'expired'));
test('invalid invitation expiry fails closed', () => assert.equal(model.getInvitationState({ ...invitation, expiresAt: new Date(NaN) }, now), 'expired'));
test('invalid invitation clock fails closed', () => assert.equal(model.getInvitationState(invitation, new Date(NaN)), 'expired'));
for (const status of ['accepted', 'revoked']) test(`${status} state retains its history after expiry`, () => assert.equal(model.getInvitationState({ ...invitation, status }, nominationElection.endDate), status));
test('normalization rejects unknown invitation status', () => assert.equal(model.normalizeElectoralInvitation('real', { ...invitation, id: 'forged', status: 'approved' }).status, 'revoked'));
test('invitation normalization binds document ID and converts Firestore timestamps', () => {
  const normalized = model.normalizeElectoralInvitation('real', { ...invitation, id: 'forged', email: ' PERSONA@EXAMPLE.TEST ', acceptedAt: { toDate: () => now }, acceptedBy: 'person' });
  assert.equal(normalized.id, 'real'); assert.equal(normalized.email, 'persona@example.test'); assert.equal(normalized.acceptedAt, now); assert.equal(normalized.acceptedBy, 'person');
});
test('invitation rights normalize strictly as booleans', () => { const normalized = model.normalizeElectoralInvitation('real', { ...invitation, requestedVoter: 'true', requestedCandidate: 1 }); assert.equal(normalized.requestedVoter, false); assert.equal(normalized.requestedCandidate, false); });

test('accepted invitation requests both rights without granting approval', () => assert.deepEqual(model.validateInvitationAcceptance(invitation, nominationElection, invitee, null, now), { requestedVoter: true, requestedCandidate: true, voterStatus: 'pending', candidateStatus: 'pending' }));
test('invitation never overwrites previous approval', () => assert.deepEqual(model.validateInvitationAcceptance(invitation, nominationElection, invitee, access, now), { requestedVoter: true, requestedCandidate: true, voterStatus: 'approved', candidateStatus: 'approved' }));
test('invitation never resets previous rejection', () => assert.deepEqual(model.validateInvitationAcceptance(invitation, nominationElection, invitee, { ...access, voterStatus: 'rejected', candidateStatus: 'rejected' }, now), { requestedVoter: true, requestedCandidate: true, voterStatus: 'rejected', candidateStatus: 'rejected' }));
test('invitation can add candidacy request while preserving voter decision', () => assert.deepEqual(model.validateInvitationAcceptance(invitation, nominationElection, invitee, { ...access, requestedCandidate: false, candidateStatus: 'none' }, now), { requestedVoter: true, requestedCandidate: true, voterStatus: 'approved', candidateStatus: 'pending' }));
test('voter-only invitation leaves candidate right unrequested', () => assert.deepEqual(model.validateInvitationAcceptance({ ...invitation, requestedCandidate: false }, nominationElection, invitee, null, now), { requestedVoter: true, requestedCandidate: false, voterStatus: 'pending', candidateStatus: 'none' }));
test('candidate-only invitation leaves voter right unrequested', () => assert.deepEqual(model.validateInvitationAcceptance({ ...invitation, requestedVoter: false }, nominationElection, invitee, null, now), { requestedVoter: false, requestedCandidate: true, voterStatus: 'none', candidateStatus: 'pending' }));
for (const mutation of [{ uid: '' }, { role: 'CEO ' }, { email: 'other@example.test' }, { email: '' }, { emailVerified: false }, { emailVerified: undefined }]) test(`bound invitation rejects invalid identity ${JSON.stringify(mutation)}`, () => assert.throws(() => model.validateInvitationAcceptance(invitation, nominationElection, { ...invitee, ...mutation }, null, now)));
test('open invitation permits authenticated guest without email', () => assert.doesNotThrow(() => model.validateInvitationAcceptance({ ...invitation, email: '' }, nominationElection, { ...invitee, email: '', emailVerified: false }, null, now)));
for (const status of ['accepted', 'revoked']) test(`${status} invitation cannot be reused`, () => assert.throws(() => model.validateInvitationAcceptance({ ...invitation, status }, nominationElection, invitee, null, now)));
test('expired invitation cannot be accepted', () => assert.throws(() => model.validateInvitationAcceptance({ ...invitation, expiresAt: now }, nominationElection, invitee, null, now)));
test('invitation cannot target another process', () => assert.throws(() => model.validateInvitationAcceptance({ ...invitation, electionId: 'other' }, nominationElection, invitee, null, now)));
for (const status of ['draft', 'closed', 'archived']) test(`cannot accept invitation for ${status} process`, () => assert.throws(() => model.validateInvitationAcceptance(invitation, { ...nominationElection, status }, invitee, null, now)));
test('voter invitation stops at exact process end even with malformed later expiry', () => assert.throws(() => model.validateInvitationAcceptance({ ...invitation, requestedCandidate: false, expiresAt: new Date('2026-10-17T00:00:00Z') }, nominationElection, invitee, null, nominationElection.endDate)));
test('shortening process invalidates an invitation whose expiry is now outside it', () => assert.throws(() => model.validateInvitationAcceptance({ ...invitation, requestedCandidate: false, expiresAt: nominationElection.endDate }, { ...nominationElection, endDate: new Date('2026-10-16T19:00:00Z') }, invitee, null, now)));
test('shortening postulations invalidates a candidate invitation with a later expiry', () => assert.throws(() => model.validateInvitationAcceptance(invitation, { ...nominationElection, registrationEndDate: new Date('2026-10-16T16:30:00Z') }, invitee, null, now)));
test('candidate invitation cannot be accepted before registration opens', () => assert.throws(() => model.validateInvitationAcceptance(invitation, nominationElection, invitee, null, new Date('2026-10-16T13:59:59Z'))));
test('candidate invitation cannot bypass closed registration using previous rights', () => assert.throws(() => model.validateInvitationAcceptance({ ...invitation, expiresAt: new Date('2026-10-16T19:00:00Z') }, nominationElection, invitee, access, nominationElection.registrationEndDate)));
test('voter-only invitation remains usable during voting', () => assert.doesNotThrow(() => model.validateInvitationAcceptance({ ...invitation, requestedCandidate: false, expiresAt: nominationElection.endDate }, nominationElection, invitee, null, nominationElection.startDate)));
test('invitation cannot merge another account access', () => assert.throws(() => model.validateInvitationAcceptance(invitation, nominationElection, invitee, { ...access, uid: 'other' }, now)));
test('invitation cannot merge another process access', () => assert.throws(() => model.validateInvitationAcceptance(invitation, nominationElection, invitee, { ...access, electionId: 'other' }, now)));
test('invitation acceptance cannot omit both rights', () => assert.throws(() => model.validateInvitationAcceptance({ ...invitation, requestedVoter: false, requestedCandidate: false }, nominationElection, invitee, null, now)));

const closure = { enabled: false, closureTitle: 'Elecciones cerradas', closureMessage: 'Nos vemos en la próxima edición.', returnYear: 2028 };
test('absent settings preserve existing open installations', () => { const result = model.resolveElectoralSettings(null, now); assert.equal(result.settings.enabled, true); assert.equal(result.error, null); });
test('default return year uses Lima at the year boundary', () => assert.equal(model.defaultElectoralSettings(new Date('2027-01-01T02:00:00Z')).returnYear, 2027));
test('closed settings preserve the editable message and next year', () => { const result = model.resolveElectoralSettings(closure, now); assert.deepEqual(result.settings, closure); assert.equal(result.error, null); });
test('valid reopening clears the configuration error', () => { const result = model.resolveElectoralSettings({ ...closure, enabled: true }, now); assert.equal(result.settings.enabled, true); assert.equal(result.error, null); });
for (const mutation of [{ enabled: 'true' }, { enabled: 1 }, { enabled: undefined }, { closureTitle: '' }, { closureTitle: 'x'.repeat(161) }, { closureMessage: '' }, { closureMessage: 'x'.repeat(2001) }, { returnYear: '2028' }, { returnYear: 1999 }, { returnYear: 2201 }, { returnYear: 2028.5 }]) test(`malformed settings fail closed ${JSON.stringify(mutation)}`, () => { const result = model.resolveElectoralSettings({ ...closure, ...mutation }, now); assert.equal(result.settings.enabled, false); assert.ok(result.error); assert.throws(() => model.validateElectoralSettingsInput({ ...closure, ...mutation })); });
test('settings normalization ignores forged role metadata', () => assert.equal(model.normalizeElectoralSettings({ ...closure, enabled: true, role: 'CEO' }, now).role, undefined));
test('closure applies to every caller with a clear editable message', () => assert.throws(() => model.validateElectoralParticipation(closure), /Elecciones cerradas.*Nos vemos.*2028/));
test('reopening permits participation validation again', () => assert.doesNotThrow(() => model.validateElectoralParticipation({ ...closure, enabled: true })));

const announcementInput = { title: '  Comunicado electoral  ', body: '  Consulta el calendario oficial.  ', status: 'published', electionId: nominationElection.id, pinned: true, startsAt: new Date(now.getTime() - 1000), endsAt: new Date(now.getTime() + 1000) };
const announcement = { id: 'notice-a', ...announcementInput, createdAt: now, createdBy: 'manager', updatedAt: now, updatedBy: 'manager' };
test('announcement validation trims text and checks its existing parent', () => { const result = model.validateAnnouncementInput(announcementInput, nominationElection); assert.equal(result.title, 'Comunicado electoral'); assert.equal(result.body, 'Consulta el calendario oficial.'); });
test('general announcement can omit a process', () => assert.equal(model.validateAnnouncementInput({ ...announcementInput, electionId: '' }).electionId, ''));
for (const mutation of [{ title: 'Hi' }, { title: 'x'.repeat(161) }, { body: '' }, { body: 'x'.repeat(4001) }, { status: 'active' }, { pinned: 'true' }, { startsAt: new Date(NaN) }, { endsAt: new Date(NaN) }, { endsAt: announcementInput.startsAt }, { endsAt: new Date(announcementInput.startsAt.getTime() - 1) }]) test(`invalid announcement ${JSON.stringify(mutation)}`, () => assert.throws(() => model.validateAnnouncementInput({ ...announcementInput, ...mutation }, nominationElection)));
test('announcement cannot target a missing process', () => assert.throws(() => model.validateAnnouncementInput(announcementInput, null)));
test('announcement cannot target a different process', () => assert.throws(() => model.validateAnnouncementInput(announcementInput, { ...nominationElection, id: 'different' })));
test('announcement cannot target a deleted process', () => assert.throws(() => model.validateAnnouncementInput(announcementInput, { ...nominationElection, status: 'deleted' })));
test('draft process cannot publish a linked announcement', () => assert.throws(() => model.validateAnnouncementInput(announcementInput, { ...nominationElection, status: 'draft' })));
test('draft announcement may be prepared with a draft process', () => assert.doesNotThrow(() => model.validateAnnouncementInput({ ...announcementInput, status: 'draft' }, { ...nominationElection, status: 'draft' })));
test('published announcement begins at its exact start', () => assert.equal(model.isAnnouncementVisible(announcement, announcement.startsAt), true));
test('published announcement expires at its exact end', () => assert.equal(model.isAnnouncementVisible(announcement, announcement.endsAt), false));
test('future announcement remains hidden', () => assert.equal(model.isAnnouncementVisible(announcement, new Date(announcement.startsAt.getTime() - 1)), false));
for (const status of ['draft', 'withdrawn']) test(`${status} announcement remains hidden`, () => assert.equal(model.isAnnouncementVisible({ ...announcement, status }, now), false));
test('invalid announcement clock fails closed', () => assert.equal(model.isAnnouncementVisible(announcement, new Date(NaN)), false));
test('invalid stored announcement deadline remains hidden', () => assert.equal(model.isAnnouncementVisible(model.normalizeElectoralAnnouncement(announcement.id, { ...announcement, endsAt: 'not-a-date' }), now), false));
test('unrecognized announcement status normalizes to withdrawn', () => assert.equal(model.normalizeElectoralAnnouncement(announcement.id, { ...announcement, status: 'active' }).status, 'withdrawn'));

for (const status of ['draft', 'active', 'closed', 'archived']) test(`deleting ${status} process preserves its source status`, () => assert.equal(model.validateElectionDeletion({ ...election, status }), status));
test('already deleted process cannot be deleted twice', () => assert.throws(() => model.validateElectionDeletion({ ...election, status: 'deleted' })));
test('trash blocks voting, registration and editing', () => { const deleted = { ...nominationElection, status: 'deleted' }; assert.equal(model.getElectionWindow(deleted, now).canVote, false); assert.equal(model.getRegistrationWindow(deleted, now).canRegister, false); assert.equal(model.getElectionEditMode(deleted, now), 'none'); });
test('deleted process cannot receive invitations', () => assert.throws(() => model.validateInvitationInput(invitationInput, { ...nominationElection, status: 'deleted' }, now)));
test('deleted process invitations cannot be consumed', () => assert.throws(() => model.validateInvitationAcceptance(invitation, { ...nominationElection, status: 'deleted' }, invitee, null, now)));
test('restore always archives rather than reopening an active ballot', () => assert.equal(model.validateElectionRestore({ ...election, status: 'deleted', previousStatus: 'active' }), 'archived'));
for (const status of ['draft', 'active', 'closed', 'archived']) test(`cannot restore nondeleted ${status} process`, () => assert.throws(() => model.validateElectionRestore({ ...election, status })));
test('trash metadata preserves audit identity and date', () => { const result = model.normalizeElection('real', { ...election, status: 'deleted', previousStatus: 'active', deletedAt: { toDate: () => now }, deletedBy: 'real-ceo' }); assert.equal(result.previousStatus, 'active'); assert.equal(result.deletedAt, now); assert.equal(result.deletedBy, 'real-ceo'); });
console.log(`PASS ${checks} electoral domain checks. No data writes or network access.`);
