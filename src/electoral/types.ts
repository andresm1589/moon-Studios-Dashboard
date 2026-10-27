import type { Election, Candidate, VoteRecord, ElectionStatus, ElectoralAccess, ElectoralInvitation, ElectoralAnnouncement, ElectoralSettings } from './electionTypes';
export type { Election, Candidate, VoteRecord, ElectionStatus, ElectoralAccess, ElectoralAccessStatus, ElectoralInvitation, ElectoralAnnouncement, ElectoralSettings } from './electionTypes';

export interface ElectoralIdentity { uid: string; displayName: string; role: string; email?: string; emailVerified?: boolean; photoURL?: string }
export interface ElectionInput { name: string; description: string; startDate: Date; endDate: Date; registrationStartDate?: Date; registrationEndDate?: Date; positions: string[]; departments: string[] }
export interface CandidateInput { electionId: string; name: string; position: string; department: string; proposals: string[]; slogan?: string; party?: string }
export interface AccessRequestInput { voter: boolean; candidate: boolean }
export interface AccessReviewInput { voterStatus?: 'approved' | 'rejected'; candidateStatus?: 'approved' | 'rejected' }
export interface InvitationInput { electionId: string; label: string; email: string; requestedVoter: boolean; requestedCandidate: boolean; expiresAt: Date }
export interface InvitationUpdateInput { label: string; expiresAt: Date }
export interface AnnouncementInput { title: string; body: string; status: ElectoralAnnouncement['status']; electionId: string; pinned: boolean; startsAt: Date; endsAt: Date }
export interface ElectoralSettingsInput { enabled: boolean; closureTitle: string; closureMessage: string; returnYear: number }
export interface ElectionController {
  identity: ElectoralIdentity;
  elections: Election[];
  candidates: Candidate[];
  records: Record<string, VoteRecord>;
  accessRequests: ElectoralAccess[];
  invitations: ElectoralInvitation[];
  announcements: ElectoralAnnouncement[];
  announcementsLoading: boolean;
  announcementsError: string | null;
  settings: ElectoralSettings;
  settingsLoading: boolean;
  settingsError: string | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  canManage: boolean;
  createElection: (input: ElectionInput) => Promise<string>;
  updateElection: (id: string, input: ElectionInput) => Promise<void>;
  setElectionStatus: (id: string, status: ElectionStatus) => Promise<void>;
  deleteElection: (id: string) => Promise<void>;
  restoreElection: (id: string) => Promise<void>;
  createAnnouncement: (input: AnnouncementInput) => Promise<string>;
  updateAnnouncement: (id: string, input: AnnouncementInput) => Promise<void>;
  updateSettings: (input: ElectoralSettingsInput) => Promise<void>;
  requestAccess: (electionId: string, input: AccessRequestInput) => Promise<void>;
  reviewAccess: (id: string, input: AccessReviewInput) => Promise<void>;
  createInvitation: (input: InvitationInput) => Promise<string>;
  updateInvitation: (id: string, input: InvitationUpdateInput) => Promise<void>;
  revokeInvitation: (id: string) => Promise<void>;
  loadInvitation: (id: string) => Promise<ElectoralInvitation>;
  acceptInvitation: (id: string) => Promise<void>;
  registerCandidate: (input: CandidateInput, photo?: File) => Promise<string>;
  reviewCandidate: (id: string, status: 'approved' | 'rejected') => Promise<void>;
  deleteCandidate: (id: string) => Promise<void>;
  castVote: (electionId: string, candidateId: string, position: string) => Promise<void>;
  refresh: () => void;
}
