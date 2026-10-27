export type FestPublication = 'draft' | 'published' | 'archived';
export type FestFormat = 'presencial' | 'virtual' | 'hibrido';
export type FestTicketState = 'active' | 'checked-in' | 'cancelled';
export type FestWindowState = 'unavailable' | 'not-open' | 'open' | 'full' | 'closed' | 'ended';

export interface FestEventInput {
  title: string;
  slug: string;
  summary: string;
  description: string;
  coverUrl: string;
  location: string;
  format: FestFormat;
  streamUrl: string;
  startsAt: Date;
  endsAt: Date;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  capacity: number;
  publication: FestPublication;
  cancelled: boolean;
}

export interface FestEvent extends FestEventInput {
  id: string;
  registeredCount: number;
  counterTicketId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface RegistrationInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface FestTicket extends RegistrationInput {
  id: string;
  eventId: string;
  ownerUid: string;
  code: string;
  qrToken: string;
  state: FestTicketState;
  createdAt: Date;
  checkedInAt: Date | null;
}

/** El enlace QR solo revela estos datos. Nunca contiene correo ni teléfono. */
export interface FestVerification {
  token: string;
  eventId: string;
  ticketId: string;
  code: string;
  state: FestTicketState;
  firstName: string;
  lastName: string;
  createdAt: Date;
  checkedInAt: Date | null;
}

export interface FestEmailIndex {
  eventId: string;
  ownerUid: string;
  ticketId: string;
  email: string;
  createdAt: Date;
}
