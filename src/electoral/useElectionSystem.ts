import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, deleteField, doc, getDocFromServer, onSnapshot, query, where, runTransaction, serverTimestamp, writeBatch, type Firestore, type DocumentReference, type Query, type DocumentData, type Transaction } from 'firebase/firestore';
import type { Candidate, Election, VoteRecord, ElectoralAccess, ElectoralInvitation } from './electionTypes';
import type { ElectionController, ElectoralIdentity } from './types';
import { canManageElections, canParticipateInElections, canTransitionElection, electoralAccessId, electoralCandidateId, electoralVoteId, getRegistrationWindow, normalizeCandidate, normalizeElection, normalizeVoteRecord, normalizeElectoralAccess, normalizeElectoralInvitation, validateAccessRequest, validateAccessReview, validateAccessForCandidate, validateAccessForVote, validateCandidateInput, validateElectionInput, validateElectionUpdate, validateInvitationInput, validateInvitationUpdate, validateInvitationAcceptance, validateVote, normalizeElectoralSettings, validateElectoralParticipation, validateElectionDeletion, validateElectionRestore, validateAnnouncementInput, validateElectoralSettingsInput, validateCandidateDeletion } from './model';
import { useElectoralPublicState } from './useElectoralPublicState';

interface ElectionSystemOptions {
  db: Firestore;
  identity: ElectoralIdentity;
  uploadPhoto?: (file: File, electionId: string) => Promise<string>;
}
function explain(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied')) return 'Tu cuenta no tiene permiso para esta operación electoral. Actualiza la sesión o consulta con el responsable.';
  if (code.includes('unavailable') || code.includes('deadline')) return 'No se pudo conectar con el sistema electoral. Revisa tu conexión y vuelve a intentar.';
  return error instanceof Error ? error.message : 'No se pudo completar la operación. Vuelve a intentar.';
}

/** Native workspace adapter. Identity must come from verified Firebase auth/profile. */
export function useElectionSystem({ db, identity, uploadPhoto }: ElectionSystemOptions): ElectionController {
  const [elections, setElections] = useState<Election[]>([]), [candidates, setCandidates] = useState<Candidate[]>([]);
  const [records, setRecords] = useState<Record<string, VoteRecord>>({});
  const [accessRequests, setAccessRequests] = useState<ElectoralAccess[]>([]);
  const [invitations, setInvitations] = useState<ElectoralInvitation[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const busyRef = useRef(false), runningUid = useRef<string | null>(null), identityRef = useRef(identity), generation = useRef(0);
  const loadedIdentity = useRef(`${identity.uid}|${identity.role}`);
  identityRef.current = identity;
  const canManage = canManageElections(identity.role);
  const { settings, settingsLoading, settingsError, announcements, announcementsLoading, announcementsError, refresh: refreshPublicState } = useElectoralPublicState({ db, canManage });

  useEffect(() => {
    const current = ++generation.current;
    let stopped = false, electionsReady = false, accessReady = false, invitationsReady = !canManage;
    const candidateSources = new Map<string, Candidate[]>(), candidateReady = new Set<string>();
    const candidateSourceCount = canManage ? 1 : 2;
    const recordSubscriptions = new Map<string, () => void>();
    const valid = () => !stopped && generation.current === current && identityRef.current.uid === identity.uid && identityRef.current.role === identity.role;
    loadedIdentity.current = `${identity.uid}|${identity.role}`;
    setElections([]); setCandidates([]); setRecords({}); setAccessRequests([]); setInvitations([]); setError(null); setLoading(true); setBusy(busyRef.current && runningUid.current === identity.uid);
    if (!identity.uid || !canParticipateInElections(identity.role)) {
      setError('Inicia sesión con una cuenta verificada para consultar las elecciones.'); setLoading(false);
      return () => { stopped = true; };
    }
    const failed = (cause: unknown) => { if (valid()) { setError(explain(cause)); setLoading(false); } };
    const ready = () => { if (valid() && electionsReady && accessReady && invitationsReady && candidateReady.size === candidateSourceCount) setLoading(false); };
    const electionsQuery = canManage ? collection(db, 'elections') : query(collection(db, 'elections'), where('status', 'in', ['active', 'closed', 'archived']));
    const unsubscribeElections = onSnapshot(electionsQuery, snapshot => {
      if (!valid()) return;
      const next = snapshot.docs.map(item => normalizeElection(item.id, item.data())).sort((a, b) => (b.createdAt.getTime() || 0) - (a.createdAt.getTime() || 0));
      setElections(next); electionsReady = true; ready();
      const ids = new Set(next.map(item => item.id));
      for (const [id, unsubscribe] of recordSubscriptions) {
        if (!ids.has(id)) { unsubscribe(); recordSubscriptions.delete(id); setRecords(previous => { const copy = { ...previous }; delete copy[id]; return copy; }); }
      }
      for (const election of next) {
        if (recordSubscriptions.has(election.id)) continue;
        const unsubscribe = onSnapshot(doc(db, 'voteRecords', `${identity.uid}_${election.id}`), record => {
          if (!valid()) return;
          setRecords(previous => {
            const copy = { ...previous };
            if (record.exists() && record.data().voterId === identity.uid && record.data().electionId === election.id) copy[election.id] = normalizeVoteRecord(record.data());
            else delete copy[election.id];
            return copy;
          });
        }, failed);
        recordSubscriptions.set(election.id, unsubscribe);
      }
    }, failed);
    const listenCandidates = (source: string, sourceQuery: Query<DocumentData>) => onSnapshot(sourceQuery, snapshot => {
      if (!valid()) return;
      candidateSources.set(source, snapshot.docs.map(item => normalizeCandidate(item.id, item.data())));
      const merged = new Map<string, Candidate>();
      for (const items of candidateSources.values()) for (const candidate of items) merged.set(candidate.id, candidate);
      setCandidates([...merged.values()].sort((a, b) => (b.createdAt.getTime() || 0) - (a.createdAt.getTime() || 0)));
      candidateReady.add(source); ready();
    }, failed);
    const candidateSubscriptions = canManage
      ? [listenCandidates('all', collection(db, 'candidates'))]
      : [listenCandidates('approved', query(collection(db, 'candidates'), where('status', '==', 'approved'))), listenCandidates('own', query(collection(db, 'candidates'), where('uid', '==', identity.uid)))];
    const accessQuery = canManage ? collection(db, 'electoralAccess') : query(collection(db, 'electoralAccess'), where('uid', '==', identity.uid));
    const unsubscribeAccess = onSnapshot(accessQuery, snapshot => {
      if (!valid()) return;
      setAccessRequests(snapshot.docs.map(item => normalizeElectoralAccess(item.id, item.data())).sort((a, b) => (b.updatedAt.getTime() || 0) - (a.updatedAt.getTime() || 0)));
      accessReady = true; ready();
    }, failed);
    // Only CEO sessions subscribe to the private invitation list. Recipients read one known link.
    const unsubscribeInvitations = canManage ? onSnapshot(collection(db, 'electoralInvitations'), snapshot => {
      if (!valid()) return;
      setInvitations(snapshot.docs.map(item => normalizeElectoralInvitation(item.id, item.data())).sort((a, b) => (b.createdAt.getTime() || 0) - (a.createdAt.getTime() || 0)));
      invitationsReady = true; ready();
    }, failed) : () => undefined;
    return () => { stopped = true; unsubscribeElections(); unsubscribeAccess(); unsubscribeInvitations(); for (const unsubscribe of candidateSubscriptions) unsubscribe(); for (const unsubscribe of recordSubscriptions.values()) unsubscribe(); };
  }, [db, identity.uid, identity.role, revision, canManage]);

  const perform = async <T,>(operation: (actor: ElectoralIdentity) => Promise<T>, manager = false): Promise<T> => {
    if (busyRef.current) throw new Error('Espera a que termine la operación actual.');
    const actor = identityRef.current;
    if (!actor.uid || !canParticipateInElections(actor.role)) throw new Error('Necesitas iniciar sesión con una cuenta verificada para continuar.');
    if (manager && !canManageElections(actor.role)) throw new Error('Esta operación corresponde al CEO de Moon Studios.');
    busyRef.current = true; runningUid.current = actor.uid; setBusy(true); setError(null);
    try {
      return await operation(actor);
    } catch (cause) {
      const message = explain(cause);
      if (identityRef.current.uid === actor.uid) setError(message);
      throw new Error(message);
    } finally {
      busyRef.current = false; runningUid.current = null;
      if (identityRef.current.uid === actor.uid) setBusy(false);
    }
  };
  const audit = (actor: ElectoralIdentity, action: string, details: Record<string, unknown>) => ({ action, userId: actor.uid, userName: actor.displayName.trim().slice(0, 160) || 'Participante', details, timestamp: serverTimestamp() });
  const auditRef = (): DocumentReference => doc(collection(db, 'auditLogs'));
  // Read in the same transaction so a concurrent global closure retries and
  // rejects the operation, even for the CEO acting as a participant.
  const assertParticipationOpen = async (transaction: Transaction): Promise<void> => {
    const snapshot = await transaction.get(doc(db, 'electoralSettings', 'general'));
    validateElectoralParticipation(normalizeElectoralSettings(snapshot.exists() ? snapshot.data() : null));
  };

  const createElection: ElectionController['createElection'] = input => perform(async actor => {
    const clean = validateElectionInput(input), reference = doc(collection(db, 'elections'));
    const batch = writeBatch(db);
    batch.set(reference, { ...clean, status: 'draft', createdBy: actor.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), totalVotes: 0 });
    batch.set(auditRef(), audit(actor, 'ELECTION_CREATED', { electionId: reference.id, name: clean.name }));
    await batch.commit(); return reference.id;
  }, true);

  const updateElection: ElectionController['updateElection'] = (id, input) => perform(async actor => {
    const reference = doc(db, 'elections', id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('La elección ya no existe.');
      const previous = normalizeElection(id, snapshot.data());
      const hasApplications = candidates.some(candidate => candidate.electionId === id);
      const clean = validateElectionUpdate(previous, input, new Date(), hasApplications);
      transaction.update(reference, { ...clean, updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'ELECTION_UPDATED', { electionId: id, name: clean.name }));
    });
  }, true);

  const setElectionStatus: ElectionController['setElectionStatus'] = (id, status) => perform(async actor => {
    const reference = doc(db, 'elections', id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('La elección ya no existe.');
      const election = normalizeElection(id, snapshot.data());
      if (!canTransitionElection(election.status, status)) throw new Error('Ese cambio de estado no está permitido. Las elecciones cerradas conservan su historial.');
      if (status === election.status) return;
      if (status === 'active') {
        validateElectionInput({ ...election, registrationStartDate: election.registrationStartDate ?? election.createdAt, registrationEndDate: election.registrationEndDate ?? election.startDate });
        if (new Date() >= election.endDate) throw new Error('Actualiza las fechas antes de abrir la elección.');
      }
      transaction.update(reference, { status, updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'ELECTION_STATUS_CHANGED', { electionId: id, from: election.status, to: status }));
    });
  }, true);

  const requestAccess: ElectionController['requestAccess'] = (electionId, input) => perform(async actor => {
    const reference = doc(db, 'electoralAccess', electoralAccessId(actor.uid, electionId));
    await runTransaction(db, async transaction => {
      await assertParticipationOpen(transaction);
      const electionSnapshot = await transaction.get(doc(db, 'elections', electionId)), accessSnapshot = await transaction.get(reference);
      if (!electionSnapshot.exists()) throw new Error('El proceso electoral ya no está disponible.');
      const election = normalizeElection(electionId, electionSnapshot.data()), now = new Date();
      if (election.status !== 'active' || !Number.isFinite(election.endDate.getTime()) || now >= election.endDate) throw new Error('Solo puedes solicitar acceso a una convocatoria publicada cuyo plazo no haya terminado.');
      const previous = accessSnapshot.exists() ? normalizeElectoralAccess(reference.id, accessSnapshot.data()) : null;
      if (previous && (previous.uid !== actor.uid || previous.electionId !== electionId)) throw new Error('La solicitud no coincide con tu cuenta y proceso.');
      const permissions = validateAccessRequest(input, previous);
      if (permissions.requestedCandidate && !previous?.requestedCandidate && !getRegistrationWindow(election, now).canRegister) throw new Error('El permiso para postular se solicita durante el plazo de postulaciones publicado.');
      if (identityRef.current.uid !== actor.uid || identityRef.current.role !== actor.role) throw new Error('La sesión cambió. Vuelve a iniciar la operación.');
      const email = (actor.email ?? '').trim().slice(0, 320);
      if (previous) transaction.update(reference, { ...permissions, email, updatedAt: serverTimestamp() });
      else transaction.set(reference, { uid: actor.uid, electionId, displayName: actor.displayName.trim().slice(0, 160) || 'Participante', email, photoURL: actor.photoURL?.startsWith('https://') ? actor.photoURL.slice(0, 2048) : '', ...permissions, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'ELECTORAL_ACCESS_REQUESTED', { electionId, accessId: reference.id, voter: input.voter, candidate: input.candidate }));
    });
  });

  const reviewAccess: ElectionController['reviewAccess'] = (id, input) => perform(async actor => {
    const reference = doc(db, 'electoralAccess', id);
    await runTransaction(db, async transaction => {
      await assertParticipationOpen(transaction);
      const accessSnapshot = await transaction.get(reference);
      if (!accessSnapshot.exists()) throw new Error('La solicitud electoral ya no existe.');
      const previous = normalizeElectoralAccess(id, accessSnapshot.data());
      const electionSnapshot = await transaction.get(doc(db, 'elections', previous.electionId));
      if (!electionSnapshot.exists()) throw new Error('El proceso electoral ya no existe.');
      const election = normalizeElection(previous.electionId, electionSnapshot.data());
      if (election.status !== 'active' || !Number.isFinite(election.endDate.getTime()) || new Date() >= election.endDate) throw new Error('Los permisos se revisan durante un proceso publicado cuyo plazo no haya terminado.');
      const decisions = validateAccessReview(input, previous);
      if (decisions.candidateStatus !== previous.candidateStatus && (!Number.isFinite(election.startDate.getTime()) || new Date() >= election.startDate)) throw new Error('El permiso para postular solo se puede resolver antes del inicio de votación. Los permisos de votante se revisan hasta el cierre del proceso.');
      transaction.update(reference, { ...decisions, updatedAt: serverTimestamp(), reviewedAt: serverTimestamp(), reviewedBy: actor.uid });
      transaction.set(auditRef(), audit(actor, 'ELECTORAL_ACCESS_REVIEWED', { electionId: previous.electionId, accessId: id, ...decisions }));
    });
  }, true);

  const invitationReference = (id: string): DocumentReference => {
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(id)) throw new Error('El enlace de invitación no es válido.');
    return doc(db, 'electoralInvitations', id);
  };

  const createInvitation: ElectionController['createInvitation'] = input => perform(async actor => {
    const reference = doc(collection(db, 'electoralInvitations'));
    await runTransaction(db, async transaction => {
      await assertParticipationOpen(transaction);
      const electionSnapshot = await transaction.get(doc(db, 'elections', input.electionId));
      if (!electionSnapshot.exists()) throw new Error('El proceso electoral ya no existe.');
      const clean = validateInvitationInput(input, normalizeElection(electionSnapshot.id, electionSnapshot.data()));
      if (identityRef.current.uid !== actor.uid || identityRef.current.role !== actor.role) throw new Error('La sesión cambió. Vuelve a iniciar la operación.');
      transaction.set(reference, { ...clean, status: 'active', createdBy: actor.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'INVITATION_CREATED', { electionId: clean.electionId, invitationId: reference.id }));
    });
    return reference.id;
  }, true);

  const updateInvitation: ElectionController['updateInvitation'] = (id, input) => perform(async actor => {
    const reference = invitationReference(id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('La invitación ya no existe.');
      const invitation = normalizeElectoralInvitation(id, snapshot.data());
      const electionSnapshot = await transaction.get(doc(db, 'elections', invitation.electionId));
      if (!electionSnapshot.exists()) throw new Error('El proceso electoral ya no existe.');
      const clean = validateInvitationUpdate(input, invitation, normalizeElection(electionSnapshot.id, electionSnapshot.data()));
      if (identityRef.current.uid !== actor.uid || identityRef.current.role !== actor.role) throw new Error('La sesión cambió. Vuelve a iniciar la operación.');
      transaction.update(reference, { ...clean, updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'INVITATION_UPDATED', { electionId: invitation.electionId, invitationId: id }));
    });
  }, true);

  const revokeInvitation: ElectionController['revokeInvitation'] = id => perform(async actor => {
    const reference = invitationReference(id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('La invitación ya no existe.');
      const invitation = normalizeElectoralInvitation(id, snapshot.data());
      if (invitation.status !== 'active') throw new Error('Solo puedes revocar una invitación que todavía no se aceptó.');
      if (identityRef.current.uid !== actor.uid || identityRef.current.role !== actor.role) throw new Error('La sesión cambió. Vuelve a iniciar la operación.');
      transaction.update(reference, { status: 'revoked', updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'INVITATION_REVOKED', { electionId: invitation.electionId, invitationId: id }));
    });
  }, true);

  const loadInvitation: ElectionController['loadInvitation'] = async id => {
    const actor = identityRef.current;
    if (!actor.uid || !canParticipateInElections(actor.role)) throw new Error('Inicia sesión para consultar tu invitación.');
    try {
      const snapshot = await getDocFromServer(invitationReference(id));
      if (identityRef.current.uid !== actor.uid || identityRef.current.role !== actor.role) throw new Error('La sesión cambió. Vuelve a abrir tu invitación.');
      if (!snapshot.exists()) throw new Error('Esta invitación no existe o ya no está disponible.');
      return normalizeElectoralInvitation(snapshot.id, snapshot.data());
    } catch (cause) { throw new Error(explain(cause)); }
  };

  const acceptInvitation: ElectionController['acceptInvitation'] = id => perform(async actor => {
    const reference = invitationReference(id);
    await runTransaction(db, async transaction => {
      await assertParticipationOpen(transaction);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('Esta invitación ya no está disponible.');
      const invitation = normalizeElectoralInvitation(id, snapshot.data());
      const accessReference = doc(db, 'electoralAccess', electoralAccessId(actor.uid, invitation.electionId));
      const electionSnapshot = await transaction.get(doc(db, 'elections', invitation.electionId)), accessSnapshot = await transaction.get(accessReference);
      if (!electionSnapshot.exists()) throw new Error('El proceso electoral ya no existe.');
      const previous = accessSnapshot.exists() ? normalizeElectoralAccess(accessSnapshot.id, accessSnapshot.data()) : null;
      const permissions = validateInvitationAcceptance(invitation, normalizeElection(electionSnapshot.id, electionSnapshot.data()), actor, previous);
      if (identityRef.current.uid !== actor.uid || identityRef.current.role !== actor.role) throw new Error('La sesión cambió. Vuelve a iniciar la operación.');
      if (!previous) {
        transaction.set(accessReference, { uid: actor.uid, electionId: invitation.electionId, displayName: actor.displayName.trim().slice(0, 160) || 'Participante', email: (actor.email ?? '').trim().slice(0, 320), photoURL: actor.photoURL?.startsWith('https://') ? actor.photoURL.slice(0, 2048) : '', ...permissions, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      } else if (permissions.requestedVoter !== previous.requestedVoter || permissions.requestedCandidate !== previous.requestedCandidate || permissions.voterStatus !== previous.voterStatus || permissions.candidateStatus !== previous.candidateStatus) {
        transaction.update(accessReference, { ...permissions, email: (actor.email ?? '').trim().slice(0, 320), updatedAt: serverTimestamp() });
      }
      transaction.update(reference, { status: 'accepted', acceptedBy: actor.uid, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'INVITATION_ACCEPTED', { electionId: invitation.electionId, invitationId: id, accessId: accessReference.id }));
    });
  });

  const registerCandidate: ElectionController['registerCandidate'] = (input, photo) => perform(async actor => {
    if (settingsLoading || settingsError) throw new Error(settingsError || 'Espera mientras se verifica la disponibilidad electoral.');
    validateElectoralParticipation(settings);
    const election = elections.find(item => item.id === input.electionId);
    if (!election) throw new Error('Selecciona una elección disponible.');
    const clean = validateCandidateInput(input, election);
    validateAccessForCandidate(accessRequests.find(access => access.uid === actor.uid && access.electionId === election.id), actor.uid, election.id);
    // Legacy random IDs remain readable; all new nominations use a unique ID.
    if (candidates.some(candidate => candidate.uid === actor.uid && candidate.electionId === input.electionId && candidate.position === input.position)) throw new Error('Ya tienes una postulación para este cargo. Consulta la decisión del CEO.');
    let photoURL = actor.photoURL?.startsWith('https://') ? actor.photoURL : '';
    if (photo) {
      if (photo.size > 4 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) throw new Error('Usa una fotografía JPG, PNG o WebP de hasta 4 MB.');
      if (!uploadPhoto) throw new Error('La carga de fotografías no está disponible.');
      photoURL = await uploadPhoto(photo, election.id);
    }
    const positionIndex = election.positions.indexOf(clean.position), reference = doc(db, 'candidates', electoralCandidateId(actor.uid, election.id, positionIndex));
    await runTransaction(db, async transaction => {
      await assertParticipationOpen(transaction);
      const electionSnapshot = await transaction.get(doc(db, 'elections', election.id)), accessSnapshot = await transaction.get(doc(db, 'electoralAccess', electoralAccessId(actor.uid, election.id))), existing = await transaction.get(reference);
      if (!electionSnapshot.exists()) throw new Error('El proceso electoral ya no existe.');
      const currentElection = normalizeElection(election.id, electionSnapshot.data());
      const currentInput = validateCandidateInput(clean, currentElection);
      validateAccessForCandidate(accessSnapshot.exists() ? normalizeElectoralAccess(accessSnapshot.id, accessSnapshot.data()) : null, actor.uid, election.id);
      if (currentElection.positions.indexOf(currentInput.position) !== positionIndex) throw new Error('Los cargos cambiaron. Actualiza la página antes de postular.');
      if (existing.exists()) throw new Error('Ya tienes una postulación para este cargo. Consulta la decisión del CEO.');
      if (identityRef.current.uid !== actor.uid || identityRef.current.role !== actor.role) throw new Error('La sesión cambió. Vuelve a iniciar la operación.');
      transaction.set(reference, { ...currentInput, positionIndex, uid: actor.uid, photoURL, status: 'pending', votes: 0, createdAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'CANDIDATE_REGISTERED', { electionId: election.id, candidateId: reference.id, position: currentInput.position }));
    });
    return reference.id;
  });

  const reviewCandidate: ElectionController['reviewCandidate'] = (id, status) => perform(async actor => {
    const reference = doc(db, 'candidates', id);
    await runTransaction(db, async transaction => {
      await assertParticipationOpen(transaction);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('La candidatura ya no existe.');
      const candidate = normalizeCandidate(id, snapshot.data());
      const electionSnapshot = await transaction.get(doc(db, 'elections', candidate.electionId));
      if (!electionSnapshot.exists()) throw new Error('El proceso electoral ya no existe.');
      const election = normalizeElection(candidate.electionId, electionSnapshot.data());
      if (election.status !== 'active' || !Number.isFinite(election.startDate.getTime()) || new Date() >= election.startDate || candidate.votes > 0) throw new Error('Las candidaturas solo se revisan en una convocatoria publicada antes del inicio de votación.');
      if (status === candidate.status) return;
      if (status === 'approved') {
        const accessSnapshot = await transaction.get(doc(db, 'electoralAccess', electoralAccessId(candidate.uid, candidate.electionId)));
        validateAccessForCandidate(accessSnapshot.exists() ? normalizeElectoralAccess(accessSnapshot.id, accessSnapshot.data()) : null, candidate.uid, candidate.electionId);
      }
      transaction.update(reference, { status, approvedAt: serverTimestamp(), approvedBy: actor.uid });
      transaction.set(auditRef(), audit(actor, status === 'approved' ? 'CANDIDATE_APPROVED' : 'CANDIDATE_REJECTED', { electionId: candidate.electionId, candidateId: id }));
    });
  }, true);

  const castVote: ElectionController['castVote'] = (electionId, candidateId, position) => perform(async actor => {
    const electionReference = doc(db, 'elections', electionId), candidateReference = doc(db, 'candidates', candidateId), recordReference = doc(db, 'voteRecords', `${actor.uid}_${electionId}`), accessReference = doc(db, 'electoralAccess', electoralAccessId(actor.uid, electionId));
    await runTransaction(db, async transaction => {
      await assertParticipationOpen(transaction);
      const electionSnapshot = await transaction.get(electionReference), candidateSnapshot = await transaction.get(candidateReference), recordSnapshot = await transaction.get(recordReference), accessSnapshot = await transaction.get(accessReference);
      if (!electionSnapshot.exists() || !candidateSnapshot.exists()) throw new Error('La elección o candidatura ya no está disponible.');
      const election = normalizeElection(electionId, electionSnapshot.data()), candidate = normalizeCandidate(candidateId, candidateSnapshot.data());
      validateAccessForVote(accessSnapshot.exists() ? normalizeElectoralAccess(accessSnapshot.id, accessSnapshot.data()) : null, actor.uid, electionId);
      const previous = recordSnapshot.exists() ? normalizeVoteRecord(recordSnapshot.data()) : null;
      if (previous && (previous.voterId !== actor.uid || previous.electionId !== electionId)) throw new Error('El registro de participación no coincide con tu cuenta.');
      const positionIndex = validateVote(election, candidate, previous, position), voteId = electoralVoteId(actor.uid, electionId, positionIndex), voteReference = doc(db, 'votes', voteId);
      if (identityRef.current.uid !== actor.uid || identityRef.current.role !== actor.role) throw new Error('La sesión cambió. Inicia sesión de nuevo.');
      transaction.set(voteReference, { voterId: actor.uid, candidateId, electionId, position, positionIndex, timestamp: serverTimestamp() });
      transaction.update(candidateReference, { votes: candidate.votes + 1 });
      transaction.update(electionReference, { totalVotes: election.totalVotes + 1 });
      transaction.set(recordReference, { voterId: actor.uid, electionId, positionsVoted: [...(previous?.positionsVoted ?? []), position], votedAt: serverTimestamp(), lastVoteId: voteId, lastCandidateId: candidateId, lastPositionIndex: positionIndex }, { merge: true });
    });
  });

  const deleteElection: ElectionController['deleteElection'] = id => perform(async actor => {
    const reference = doc(db, 'elections', id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('El proceso ya no existe.');
      const previousStatus = validateElectionDeletion(normalizeElection(id, snapshot.data()));
      transaction.update(reference, { status: 'deleted', previousStatus, deletedAt: serverTimestamp(), deletedBy: actor.uid, updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'ELECTION_DELETED', { electionId: id, from: previousStatus }));
    });
  }, true);

  const restoreElection: ElectionController['restoreElection'] = id => perform(async actor => {
    const reference = doc(db, 'elections', id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('El proceso ya no existe.');
      const status = validateElectionRestore(normalizeElection(id, snapshot.data()));
      transaction.update(reference, { status, previousStatus: deleteField(), deletedAt: deleteField(), deletedBy: deleteField(), updatedAt: serverTimestamp() });
      transaction.set(auditRef(), audit(actor, 'ELECTION_RESTORED', { electionId: id }));
    });
  }, true);

  const createAnnouncement: ElectionController['createAnnouncement'] = input => perform(async actor => {
    const reference = doc(collection(db, 'electoralAnnouncements'));
    await runTransaction(db, async transaction => {
      const electionSnapshot = input.electionId ? await transaction.get(doc(db, 'elections', input.electionId)) : null;
      const election = electionSnapshot?.exists() ? normalizeElection(electionSnapshot.id, electionSnapshot.data()) : null;
      const clean = validateAnnouncementInput(input, election);
      transaction.set(reference, { ...clean, createdAt: serverTimestamp(), createdBy: actor.uid, updatedAt: serverTimestamp(), updatedBy: actor.uid });
      transaction.set(auditRef(), audit(actor, 'ANNOUNCEMENT_CREATED', { announcementId: reference.id, electionId: clean.electionId, status: clean.status }));
    });
    return reference.id;
  }, true);

  const updateAnnouncement: ElectionController['updateAnnouncement'] = (id, input) => perform(async actor => {
    const reference = doc(db, 'electoralAnnouncements', id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('El comunicado ya no existe.');
      const electionSnapshot = input.electionId ? await transaction.get(doc(db, 'elections', input.electionId)) : null;
      const election = electionSnapshot?.exists() ? normalizeElection(electionSnapshot.id, electionSnapshot.data()) : null;
      const clean = validateAnnouncementInput(input, election);
      transaction.update(reference, { ...clean, updatedAt: serverTimestamp(), updatedBy: actor.uid });
      transaction.set(auditRef(), audit(actor, 'ANNOUNCEMENT_UPDATED', { announcementId: id, electionId: clean.electionId, status: clean.status }));
    });
  }, true);

  const updateSettings: ElectionController['updateSettings'] = input => perform(async actor => {
    const clean = validateElectoralSettingsInput(input), batch = writeBatch(db);
    batch.set(doc(db, 'electoralSettings', 'general'), { ...clean, updatedAt: serverTimestamp(), updatedBy: actor.uid });
    batch.set(auditRef(), audit(actor, 'SETTINGS_UPDATED', { enabled: clean.enabled, returnYear: clean.returnYear }));
    await batch.commit();
  }, true);

  const deleteCandidate: ElectionController['deleteCandidate'] = id => perform(async actor => {
    const reference = doc(db, 'candidates', id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('La candidatura ya no existe.');
      const candidate = normalizeCandidate(id, snapshot.data());
      const electionSnapshot = candidate.electionId ? await transaction.get(doc(db, 'elections', candidate.electionId)) : null;
      const election = electionSnapshot?.exists() ? normalizeElection(candidate.electionId, electionSnapshot.data()) : null;
      validateCandidateDeletion(candidate, election, new Date());
      transaction.delete(reference);
      transaction.set(auditRef(), audit(actor, 'CANDIDATE_DELETED', { electionId: candidate.electionId, candidateId: id, position: candidate.position, name: candidate.name.slice(0, 160) }));
    });
  }, true);

  const refresh = useCallback(() => { setRevision(value => value + 1); refreshPublicState(); }, [refreshPublicState]);
  const sameIdentity = loadedIdentity.current === `${identity.uid}|${identity.role}`;
  return { identity, elections: sameIdentity ? elections : [], candidates: sameIdentity ? candidates : [], records: sameIdentity ? records : {}, accessRequests: sameIdentity ? accessRequests : [], invitations: sameIdentity && canManage ? invitations : [], announcements: sameIdentity ? announcements : [], announcementsLoading: sameIdentity ? announcementsLoading : true, announcementsError: sameIdentity ? announcementsError : null, settings, settingsLoading, settingsError, loading: sameIdentity ? loading : true, error: sameIdentity ? error : null, busy: busy && runningUid.current === identity.uid, canManage, createElection, updateElection, setElectionStatus, deleteElection, restoreElection, createAnnouncement, updateAnnouncement, updateSettings, requestAccess, reviewAccess, createInvitation, updateInvitation, revokeInvitation, loadInvitation, acceptInvitation, registerCandidate, reviewCandidate, deleteCandidate, castVote, refresh };
}

