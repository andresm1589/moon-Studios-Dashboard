import type {
  FestEmailIndex, FestEvent, FestEventInput, FestTicket, FestVerification,
  FestWindowState, RegistrationInput,
} from '../../types/fest';

export const FEST_COLLECTIONS = {
  events: 'moon_fest_eventos',
  tickets: 'moon_fest_registros',
  emails: 'moon_fest_correos',
  entries: 'moon_fest_entradas',
} as const;

export class FestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FestError';
    this.code = code;
  }
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const TOKEN = /^[a-f0-9]{32}$/;
const trim = (v: unknown) => typeof v === 'string' ? v.trim() : '';
function fail(code: string, message: string): never { throw new FestError(code, message); }

export function assertEventId(id: string): void {
  if (!ID.test(id)) fail('invalid-event', 'El evento no es válido.');
}

export function normalizeRegistration(input: RegistrationInput): RegistrationInput {
  const data = {
    firstName: trim(input.firstName).replace(/\s+/g, ' '),
    lastName: trim(input.lastName).replace(/\s+/g, ' '),
    email: trim(input.email).toLowerCase(),
    phone: trim(input.phone),
  };
  if (data.firstName.length < 2 || data.firstName.length > 80) fail('invalid-name', 'Escribe tus nombres, entre 2 y 80 caracteres.');
  if (data.lastName.length < 2 || data.lastName.length > 80) fail('invalid-name', 'Escribe tus apellidos, entre 2 y 80 caracteres.');
  if (data.email.length > 254 || !EMAIL.test(data.email)) fail('invalid-email', 'Escribe un correo electrónico válido.');
  if (data.phone.length < 7 || data.phone.length > 30 || !/^[+\d() .-]+$/.test(data.phone)) fail('invalid-phone', 'Escribe un teléfono válido, entre 7 y 30 caracteres.');
  return data;
}

export function normalizeEvent(input: FestEventInput): FestEventInput {
  const data: FestEventInput = {
    title: trim(input.title), slug: trim(input.slug).toLowerCase(),
    summary: trim(input.summary), description: trim(input.description),
    coverUrl: trim(input.coverUrl), location: trim(input.location),
    format: input.format, streamUrl: trim(input.streamUrl),
    startsAt: input.startsAt, endsAt: input.endsAt,
    registrationOpensAt: input.registrationOpensAt, registrationClosesAt: input.registrationClosesAt,
    capacity: input.capacity, publication: input.publication, cancelled: input.cancelled,
  };
  const fields = [
    ['title', 3, 120, 'título'], ['summary', 10, 240, 'resumen'],
    ['description', 20, 8000, 'descripción'], ['location', 3, 200, 'ubicación'],
  ] as const;
  for (const [key, min, max, label] of fields) {
    if (data[key].length < min || data[key].length > max) fail('invalid-event', `El campo ${label} debe tener entre ${min} y ${max} caracteres.`);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(data.slug)) fail('invalid-event', 'La dirección del evento debe tener entre 3 y 80 letras minúsculas, números o guiones.');
  if (!['presencial', 'virtual', 'hibrido'].includes(data.format)) fail('invalid-event', 'Selecciona la modalidad del evento.');
  if (!['draft', 'published', 'archived'].includes(data.publication) || typeof data.cancelled !== 'boolean') fail('invalid-event', 'Selecciona un estado válido.');
  for (const key of ['coverUrl', 'streamUrl'] as const) {
    if (!data[key]) continue;
    try {
      const url = new URL(data[key]);
      if (url.protocol !== 'https:' || url.username || url.password || data[key].length > 2048) throw new Error();
    } catch { fail('invalid-event', `El enlace ${key === 'coverUrl' ? 'de portada' : 'de transmisión'} debe ser una dirección HTTPS válida.`); }
  }
  if (!Number.isInteger(data.capacity) || data.capacity < 0 || data.capacity > 1_000_000) fail('invalid-event', 'El aforo debe ser un número entero entre 0 y 1 000 000. Usa 0 para no limitarlo.');
  const dates = [data.registrationOpensAt, data.registrationClosesAt, data.startsAt, data.endsAt];
  if (dates.some(date => !(date instanceof Date) || !Number.isFinite(date.getTime()))) fail('invalid-event', 'Completa todas las fechas del evento.');
  if (!(data.registrationOpensAt <= data.registrationClosesAt && data.registrationClosesAt <= data.startsAt && data.startsAt < data.endsAt)) fail('invalid-event', 'Las inscripciones deben cerrar antes del inicio y el evento debe terminar después de comenzar.');
  return data;
}

export function getRegistrationStatus(event: FestEvent, now = new Date()): FestWindowState {
  if (event.publication !== 'published' || event.cancelled) return 'unavailable';
  if (now >= event.endsAt) return 'ended';
  if (now < event.registrationOpensAt) return 'not-open';
  if (now >= event.registrationClosesAt) return 'closed';
  if (event.capacity > 0 && event.registeredCount >= event.capacity) return 'full';
  return 'open';
}

export const registrationStatusLabels: Record<FestWindowState, string> = {
  unavailable: 'Inscripciones no disponibles', 'not-open': 'Próximamente', open: 'Inscripciones abiertas',
  full: 'Aforo completo', closed: 'Inscripciones cerradas', ended: 'Evento finalizado',
};

export function ticketDocumentId(eventId: string, ownerUid: string): string {
  assertEventId(eventId);
  if (!UID.test(ownerUid)) fail('invalid-session', 'Vuelve a abrir la página para recuperar tu sesión.');
  return `${eventId}_${ownerUid}`;
}

export function emailDocumentId(eventId: string, email: string): string {
  assertEventId(eventId);
  const normalized = trim(email).toLowerCase();
  if (!EMAIL.test(normalized) || normalized.length > 254) fail('invalid-email', 'El correo electrónico no es válido.');
  return `${eventId}_${normalized}`;
}

export function randomTicketToken(cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string {
  if (!cryptoProvider?.getRandomValues) fail('secure-context', 'Abre Moon Fest mediante una conexión segura para crear tu entrada.');
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeTicketCode(code: string): string {
  const value = trim(code).replace(/[\s-]/g, '').toUpperCase();
  return /^MF[A-F0-9]{32}$/.test(value) ? `MF-${value.slice(2)}` : '';
}

export function parseTicketToken(value: string): string {
  let candidate = trim(value);
  if (/^https?:\/\//i.test(candidate)) {
    try { candidate = new URL(candidate).pathname.replace(/\/$/, '').split('/').at(-1) ?? ''; }
    catch { return ''; }
  }
  candidate = candidate.replace(/[\s-]/g, '').toLowerCase();
  if (/^mf[a-f0-9]{32}$/.test(candidate)) candidate = candidate.slice(2);
  return TOKEN.test(candidate) ? candidate : '';
}

export function ticketVerificationUrl(token: string, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  if (!TOKEN.test(token)) fail('invalid-ticket', 'La entrada no es válida.');
  return `${origin.replace(/\/$/, '')}/verify/${token}`;
}

export interface RegistrationTransaction {
  getEvent(id: string): Promise<FestEvent | null>;
  getTicket(id: string): Promise<FestTicket | null>;
  getEmail(id: string): Promise<FestEmailIndex | null>;
  getVerification(token: string): Promise<FestVerification | null>;
  createTicket(ticket: FestTicket): void;
  createEmail(id: string, index: FestEmailIndex): void;
  createVerification(entry: FestVerification): void;
  updateEventCount(id: string, count: number, ticketId: string): void;
}

/** Esta misma operación se ejecuta dentro de runTransaction: todos los reads preceden los writes. */
export async function registerInTransaction(tx: RegistrationTransaction, args: {
  eventId: string; ownerUid: string; input: RegistrationInput; token: string; now: Date;
}): Promise<FestTicket> {
  const input = normalizeRegistration(args.input);
  const id = ticketDocumentId(args.eventId, args.ownerUid);
  if (!TOKEN.test(args.token)) fail('invalid-ticket', 'No se pudo crear una entrada segura. Inténtalo otra vez.');
  const emailId = emailDocumentId(args.eventId, input.email);
  const [event, existingTicket, existingEmail, existingToken] = await Promise.all([
    tx.getEvent(args.eventId), tx.getTicket(id), tx.getEmail(emailId), tx.getVerification(args.token),
  ]);
  // Reintentar la misma solicitud devuelve únicamente la entrada de su propietario.
  if (existingTicket) {
    if (existingTicket.state === 'cancelled') fail('cancelled-ticket', 'Tu inscripción fue cancelada. Contacta con la organización.');
    return existingTicket;
  }
  if (existingEmail) fail('email-registered', 'Este correo ya tiene una entrada para el evento. Usa el dispositivo donde te inscribiste o contacta con la organización.');
  if (existingToken) fail('token-collision', 'No se pudo generar la entrada. Inténtalo otra vez.');
  if (!event) fail('event-not-found', 'Este evento ya no está disponible.');
  const status = getRegistrationStatus(event, args.now);
  if (status !== 'open') fail(status, registrationStatusLabels[status]);
  const ticket: FestTicket = {
    id, eventId: event.id, ownerUid: args.ownerUid, ...input,
    qrToken: args.token, code: `MF-${args.token.toUpperCase()}`, state: 'active',
    createdAt: args.now, checkedInAt: null,
  };
  tx.createTicket(ticket);
  tx.createEmail(emailId, { eventId: event.id, ownerUid: args.ownerUid, ticketId: id, email: input.email, createdAt: args.now });
  tx.createVerification({ token: args.token, eventId: event.id, ticketId: id, code: ticket.code, state: 'active', firstName: input.firstName, lastName: input.lastName, createdAt: args.now, checkedInAt: null });
  tx.updateEventCount(event.id, event.registeredCount + 1, id);
  return ticket;
}

export function getFestError(error: unknown): string {
  if (error instanceof FestError) return error.message;
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (/permission-denied|unauthorized/.test(code)) return 'No tienes permiso para completar esta acción o el evento cambió. Actualiza la página e inténtalo nuevamente.';
  if (/operation-not-allowed|admin-restricted-operation/.test(code)) return 'Las inscripciones todavía no están habilitadas. Contacta con Moon Studios.';
  if (/network|unavailable|deadline/.test(code)) return 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.';
  if (/resource-exhausted|too-many-requests/.test(code)) return 'Hay muchas solicitudes. Espera un momento y vuelve a intentarlo.';
  if (/unauthenticated/.test(code)) return 'Tu sesión terminó. Vuelve a abrir la página.';
  if (/failed-precondition/.test(code)) return 'El sistema está terminando su configuración. Vuelve a intentarlo en unos minutos.';
  return 'No se pudo completar la acción. Vuelve a intentarlo; tus datos no se han enviado dos veces.';
}
