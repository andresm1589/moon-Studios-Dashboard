import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocFromServer, onSnapshot, query, runTransaction, serverTimestamp,
  Timestamp, where, type DocumentData, type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { FestEmailIndex, FestEvent, FestEventInput, FestTicket, FestVerification, RegistrationInput } from '../../types/fest';
import {
  assertEventId, FEST_COLLECTIONS as C, FestError, getRegistrationStatus, normalizeEvent,
  parseTicketToken, randomTicketToken, registerInTransaction,
} from './model';

export { getFestError } from './model';
export type { FestEvent, FestEventInput, FestTicket, FestVerification, RegistrationInput } from '../../types/fest';

const asDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate();
  return new Date(0);
};

function eventFrom(id: string, value: DocumentData): FestEvent {
  return {
    ...value, id, startsAt: asDate(value.startsAt), endsAt: asDate(value.endsAt),
    registrationOpensAt: asDate(value.registrationOpensAt), registrationClosesAt: asDate(value.registrationClosesAt),
    createdAt: asDate(value.createdAt), updatedAt: asDate(value.updatedAt),
  } as FestEvent;
}

function ticketFrom(id: string, value: DocumentData): FestTicket {
  return { ...value, id, createdAt: asDate(value.createdAt), checkedInAt: value.checkedInAt ? asDate(value.checkedInAt) : null } as FestTicket;
}

function entryFrom(token: string, value: DocumentData): FestVerification {
  return { ...value, token, createdAt: asDate(value.createdAt), checkedInAt: value.checkedInAt ? asDate(value.checkedInAt) : null } as FestVerification;
}

let sessionRequest: Promise<User> | null = null;

/** Mantiene la entrada ligada a esta sesión del navegador; nunca solicita una contraseña. */
export async function ensureAnonymousSession(): Promise<User> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  if (!sessionRequest) sessionRequest = signInAnonymously(auth).then(result => result.user).finally(() => { sessionRequest = null; });
  return sessionRequest;
}

async function requireSignedIn(): Promise<User> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new FestError('unauthenticated', 'Inicia sesión en el dashboard para gestionar Moon Fest.');
  return auth.currentUser;
}

export function watchPublicEvents(onNext: (events: FestEvent[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(db, C.events), where('publication', 'in', ['published', 'archived'])), snapshot => {
    onNext(snapshot.docs.map(item => eventFrom(item.id, item.data())).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()));
  }, onError);
}

export function watchEvents(onNext: (events: FestEvent[]) => void, onError?: (error: Error) => void, includePrivate = true): Unsubscribe {
  if (!includePrivate) return watchPublicEvents(onNext, onError);
  return onSnapshot(collection(db, C.events), snapshot => {
    onNext(snapshot.docs.map(item => eventFrom(item.id, item.data())).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()));
  }, onError);
}

export async function readPublishedEvents(): Promise<FestEvent[]> {
  const { getDocs } = await import('firebase/firestore');
  const snapshot = await getDocs(query(collection(db, C.events), where('publication', 'in', ['published', 'archived'])));
  return snapshot.docs.map(item => eventFrom(item.id, item.data())).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export async function getEvent(id: string): Promise<FestEvent | null> {
  assertEventId(id);
  const snapshot = await getDoc(doc(db, C.events, id));
  return snapshot.exists() ? eventFrom(snapshot.id, snapshot.data()) : null;
}

export async function registerForEvent(eventId: string, input: RegistrationInput): Promise<FestTicket> {
  assertEventId(eventId);
  const user = await ensureAnonymousSession();
  const token = randomTicketToken();
  return runTransaction(db, async transaction => registerInTransaction({
    getEvent: async id => {
      const value = await transaction.get(doc(db, C.events, id));
      return value.exists() ? eventFrom(id, value.data()) : null;
    },
    getTicket: async id => {
      const value = await transaction.get(doc(db, C.tickets, id));
      return value.exists() ? ticketFrom(id, value.data()) : null;
    },
    getEmail: async id => {
      const value = await transaction.get(doc(db, C.emails, id));
      return value.exists() ? { ...value.data(), createdAt: asDate(value.data().createdAt) } as FestEmailIndex : null;
    },
    getVerification: async qrToken => {
      const value = await transaction.get(doc(db, C.entries, qrToken));
      return value.exists() ? entryFrom(qrToken, value.data()) : null;
    },
    createTicket: ticket => {
      const { id, ...data } = ticket;
      transaction.set(doc(db, C.tickets, id), { ...data, createdAt: serverTimestamp() });
    },
    createEmail: (id, index) => transaction.set(doc(db, C.emails, id), { ...index, createdAt: serverTimestamp() }),
    createVerification: entry => {
      const { token: qrToken, ...data } = entry;
      transaction.set(doc(db, C.entries, qrToken), { ...data, createdAt: serverTimestamp() });
    },
    updateEventCount: (id, count, ticketId) => transaction.update(doc(db, C.events, id), { registeredCount: count, counterTicketId: ticketId, updatedAt: serverTimestamp() }),
  }, { eventId, ownerUid: user.uid, input, token, now: new Date() }));
}

export const register = registerForEvent;

/** La baja evita que una sesión anterior entregue sus entradas tras cerrar sesión. */
export function watchMyTickets(onNext: (tickets: FestTicket[]) => void, onError?: (error: Error) => void): Unsubscribe {
  let disposed = false;
  let stop: Unsubscribe | null = null;
  let expectedUid: string | null = null;
  const stopAuth = onAuthStateChanged(auth, user => {
    if (disposed) return;
    stop?.();
    stop = null;
    expectedUid = user?.uid ?? null;
    onNext([]);
    if (!user) return;
    stop = onSnapshot(query(collection(db, C.tickets), where('ownerUid', '==', user.uid)), snapshot => {
      if (!disposed && expectedUid === user.uid && auth.currentUser?.uid === user.uid) onNext(snapshot.docs.map(item => ticketFrom(item.id, item.data())).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    }, error => { if (!disposed && expectedUid === user.uid) onError?.(error); });
  });
  void ensureAnonymousSession().catch(error => { if (!disposed) onError?.(error); });
  return () => { disposed = true; stopAuth(); stop?.(); };
}

export async function getOwnTicket(id: string): Promise<FestTicket | null> {
  const user = await ensureAnonymousSession();
  if (!id.endsWith(`_${user.uid}`) || id.includes('/')) return null;
  const value = await getDoc(doc(db, C.tickets, id));
  return value.exists() && value.data().ownerUid === user.uid ? ticketFrom(id, value.data()) : null;
}

export const retrieveTicket = getOwnTicket;

export async function getVerification(token: string): Promise<FestVerification | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  // El control público no presenta como vigente una copia local sin conexión.
  const value = await getDocFromServer(doc(db, C.entries, token));
  return value.exists() ? entryFrom(token, value.data()) : null;
}

export function watchRegistrations(eventId: string, onNext: (tickets: FestTicket[]) => void, onError?: (error: Error) => void): Unsubscribe {
  assertEventId(eventId);
  return onSnapshot(query(collection(db, C.tickets), where('eventId', '==', eventId)), snapshot => {
    onNext(snapshot.docs.map(item => ticketFrom(item.id, item.data())).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }, onError);
}

export async function getTicketByToken(value: string): Promise<FestTicket | null> {
  await requireSignedIn();
  const token = parseTicketToken(value);
  if (!token) throw new FestError('invalid-ticket', 'Pega el código completo o el enlace QR de la entrada.');
  const entry = await getVerification(token);
  if (!entry) return null;
  const ticket = await getDoc(doc(db, C.tickets, entry.ticketId));
  return ticket.exists() ? ticketFrom(ticket.id, ticket.data()) : null;
}

export async function findTicketByCode(eventId: string, value: string): Promise<FestTicket | null> {
  assertEventId(eventId);
  const ticket = await getTicketByToken(value);
  return ticket?.eventId === eventId ? ticket : null;
}

export async function saveEvent(input: FestEventInput, id?: string): Promise<string> {
  const user = await requireSignedIn();
  const data = normalizeEvent(input);
  const ref = doc(db, C.events, id ?? doc(collection(db, C.events)).id.toLowerCase());
  assertEventId(ref.id);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (id && !snapshot.exists()) throw new FestError('event-not-found', 'El evento ya no existe. Actualiza la lista.');
    const previous = snapshot.exists() ? snapshot.data() : null;
    const registeredCount = previous?.registeredCount ?? 0;
    if (data.capacity > 0 && data.capacity < registeredCount) throw new FestError('capacity-too-low', `El aforo no puede ser menor que las ${registeredCount} entradas vigentes.`);
    transaction.set(ref, {
      ...data, startsAt: Timestamp.fromDate(data.startsAt), endsAt: Timestamp.fromDate(data.endsAt),
      registrationOpensAt: Timestamp.fromDate(data.registrationOpensAt), registrationClosesAt: Timestamp.fromDate(data.registrationClosesAt),
      registeredCount, counterTicketId: previous?.counterTicketId ?? '',
      createdAt: previous?.createdAt ?? serverTimestamp(), createdBy: previous?.createdBy ?? user.uid,
      updatedAt: serverTimestamp(), updatedBy: user.uid,
    });
    return ref.id;
  });
}

export async function archiveEvent(id: string): Promise<void> {
  const user = await requireSignedIn();
  assertEventId(id);
  await runTransaction(db, async transaction => {
    const ref = doc(db, C.events, id);
    const value = await transaction.get(ref);
    if (!value.exists()) throw new FestError('event-not-found', 'El evento ya no existe.');
    transaction.update(ref, { publication: 'archived', updatedAt: serverTimestamp(), updatedBy: user.uid });
  });
}

export async function checkInTicket(ticketId: string): Promise<FestTicket> {
  await requireSignedIn();
  if (ticketId.includes('/')) throw new FestError('invalid-ticket', 'La entrada no es válida.');
  return runTransaction(db, async transaction => {
    const ref = doc(db, C.tickets, ticketId);
    const value = await transaction.get(ref);
    if (!value.exists()) throw new FestError('ticket-not-found', 'No se encontró esta entrada.');
    const ticket = ticketFrom(ticketId, value.data());
    const [eventValue, entryValue] = await Promise.all([
      transaction.get(doc(db, C.events, ticket.eventId)), transaction.get(doc(db, C.entries, ticket.qrToken)),
    ]);
    if (ticket.state === 'checked-in') return ticket;
    if (ticket.state !== 'active') throw new FestError('cancelled-ticket', 'Esta entrada fue cancelada.');
    if (!eventValue.exists() || !entryValue.exists()) throw new FestError('event-not-found', 'No se pudo verificar el evento o la entrada.');
    const event = eventFrom(eventValue.id, eventValue.data());
    const now = new Date();
    if (event.publication !== 'published' || event.cancelled || now < event.startsAt || now > event.endsAt) throw new FestError('outside-event', 'El control de acceso solo está disponible durante el horario del evento publicado.');
    transaction.update(ref, { state: 'checked-in', checkedInAt: serverTimestamp() });
    transaction.update(doc(db, C.entries, ticket.qrToken), { state: 'checked-in', checkedInAt: serverTimestamp() });
    return { ...ticket, state: 'checked-in', checkedInAt: now };
  });
}

/** Solo gestión: conserva la trazabilidad y libera exactamente una plaza. */
export async function cancelTicket(ticketId: string): Promise<void> {
  await requireSignedIn();
  if (ticketId.includes('/')) throw new FestError('invalid-ticket', 'La entrada no es válida.');
  await runTransaction(db, async transaction => {
    const ref = doc(db, C.tickets, ticketId);
    const value = await transaction.get(ref);
    if (!value.exists()) throw new FestError('ticket-not-found', 'No se encontró esta entrada.');
    const ticket = ticketFrom(ticketId, value.data());
    const eventRef = doc(db, C.events, ticket.eventId);
    const [eventValue, entryValue] = await Promise.all([transaction.get(eventRef), transaction.get(doc(db, C.entries, ticket.qrToken))]);
    if (ticket.state === 'cancelled') return;
    if (ticket.state !== 'active') throw new FestError('checked-in-ticket', 'No se puede cancelar una entrada que ya registró su ingreso.');
    if (!eventValue.exists() || !entryValue.exists() || eventValue.data().registeredCount < 1) throw new FestError('invalid-count', 'No se pudo comprobar el aforo. Actualiza el evento.');
    transaction.update(ref, { state: 'cancelled' });
    transaction.update(doc(db, C.entries, ticket.qrToken), { state: 'cancelled' });
    transaction.update(eventRef, { registeredCount: eventValue.data().registeredCount - 1, counterTicketId: ticketId, updatedAt: serverTimestamp() });
  });
}

export { getRegistrationStatus };
