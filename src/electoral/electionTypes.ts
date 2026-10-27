export type UserRole = 'superadmin' | 'admin' | 'moderator' | 'employee' | 'candidate' | 'ceo';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  department?: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  discordId?: string;
}

export type CandidateStatus = 'pending' | 'approved' | 'rejected';

export interface Candidate {
  id: string;
  uid: string;
  name: string;
  photoURL: string;
  position: string;
  positionIndex?: number;
  department: string;
  proposals: string[];
  party?: string;
  slogan?: string;
  documents?: string[];
  status: CandidateStatus;
  electionId: string;
  votes: number;
  createdAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

export type ElectionStatus = 'draft' | 'active' | 'closed' | 'archived' | 'deleted';

export interface Election {
  id: string;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  registrationStartDate?: Date;
  registrationEndDate?: Date;
  status: ElectionStatus;
  positions: string[];
  departments: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
  totalVotes: number;
  participationRate?: number;
  previousStatus?: Exclude<ElectionStatus, 'deleted'>;
  deletedAt?: Date;
  deletedBy?: string;
}

export interface ElectoralAnnouncement {
  id: string;
  title: string;
  body: string;
  status: 'draft' | 'published' | 'withdrawn';
  electionId: string;
  pinned: boolean;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface ElectoralSettings {
  enabled: boolean;
  closureTitle: string;
  closureMessage: string;
  returnYear: number;
  updatedAt?: Date;
  updatedBy?: string;
}

export type ElectoralAccessStatus = 'none' | 'pending' | 'approved' | 'rejected';

/** Electoral permissions are independent of company employment roles. */
export interface ElectoralAccess {
  id: string;
  uid: string;
  electionId: string;
  displayName: string;
  email: string;
  photoURL: string;
  requestedVoter: boolean;
  requestedCandidate: boolean;
  voterStatus: ElectoralAccessStatus;
  candidateStatus: ElectoralAccessStatus;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

/** A private, single-use invitation requests rights; it never grants approval. */
export interface ElectoralInvitation {
  id: string;
  electionId: string;
  label: string;
  email: string;
  requestedVoter: boolean;
  requestedCandidate: boolean;
  status: 'active' | 'accepted' | 'revoked';
  expiresAt: Date;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
}

export interface Vote {
  id: string;
  voterId: string;
  candidateId: string;
  electionId: string;
  position: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface VoteRecord {
  voterId: string;
  electionId: string;
  positionsVoted: string[];
  votedAt: Date;
}

export interface ElectionResult {
  electionId: string;
  position: string;
  candidates: {
    candidateId: string;
    name: string;
    photoURL: string;
    votes: number;
    percentage: number;
  }[];
  totalVotes: number;
  winner?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userName: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  headId?: string;
  isActive: boolean;
}

export interface Position {
  id: string;
  name: string;
  description?: string;
  department?: string;
  level: 'company' | 'department';
  isActive: boolean;
}
