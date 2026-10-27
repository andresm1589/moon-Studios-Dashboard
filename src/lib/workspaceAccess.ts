import { ROLE_PERMISSIONS, type UserProfile, type UserRole } from '@/types';

export type AccessStep = 'session' | 'profile' | 'access';
export interface AccessIdentity { uid: string; email: string | null; displayName?: string | null }
export interface AccessChecks {
  currentUid: () => string | null;
  refreshSession: () => Promise<{ expirationTime: string }>;
  readProfile: () => Promise<Record<string, unknown> | null>;
}
export class WorkspaceAccessError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'WorkspaceAccessError'; this.code = code; }
}

/** These checks confirm an existing Firebase sign-in; they never assign roles. */
export async function verifyAccessChecks(identity: AccessIdentity, checks: AccessChecks, onStep?: (step: AccessStep) => void): Promise<UserProfile> {
  const sameUser = () => {
    if (!identity.uid || checks.currentUid() !== identity.uid) throw new WorkspaceAccessError('workspace/session-changed', 'La sesión cambió. Vuelve a iniciar sesión.');
  };
  sameUser();
  onStep?.('session');
  const session = await checks.refreshSession();
  sameUser();
  if (!Number.isFinite(Date.parse(session.expirationTime)) || Date.parse(session.expirationTime) <= Date.now()) {
    throw new WorkspaceAccessError('workspace/session-expired', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  }
  onStep?.('profile');
  const data = await checks.readProfile();
  sameUser();
  if (!data) throw new WorkspaceAccessError('workspace/profile-missing', 'No encontramos tu perfil del equipo. Contacta con administración.');
  onStep?.('access');
  // Legacy profiles may omit the flag. When present, corporate access requires
  // the boolean true, exactly as the server-side membership boundary does.
  if (Object.prototype.hasOwnProperty.call(data, 'isActive') && data.isActive !== true) throw new WorkspaceAccessError('workspace/account-disabled', 'Esta cuenta está desactivada o su estado necesita revisión. Contacta con administración para revisar tu acceso.');
  if (typeof data.role !== 'string' || !Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, data.role)) {
    throw new WorkspaceAccessError('workspace/access-denied', 'Esta cuenta no tiene un rol de acceso al dashboard. Contacta con administración.');
  }
  let createdAt = new Date();
  const value = data.createdAt as { toDate?: () => Date } | undefined;
  if (typeof value?.toDate === 'function') { try { const date = value.toDate(); if (Number.isFinite(date.getTime())) createdAt = date; } catch { /* optional profile metadata */ } }
  else if (data.createdAt instanceof Date && Number.isFinite(data.createdAt.getTime())) createdAt = data.createdAt;
  const text = (value: unknown) => typeof value === 'string' ? value : undefined;
  return {
    uid: identity.uid, email: text(data.email) || identity.email || '',
    displayName: text(data.displayName)?.trim() || identity.displayName?.trim() || 'Equipo Moon',
    role: data.role as UserRole, avatar: text(data.avatar), phone: text(data.phone), bio: text(data.bio), website: text(data.website),
    avatarHistory: Array.isArray(data.avatarHistory) ? data.avatarHistory as UserProfile['avatarHistory'] : [], createdAt,
  };
}

export function accessErrorMessage(error: unknown): string {
  if (error instanceof WorkspaceAccessError) return error.message;
  const code = (error as { code?: string })?.code;
  if (code === 'auth/user-disabled') return 'Esta cuenta está deshabilitada. Contacta con administración.';
  if (['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-not-found'].includes(code || '')) return 'La sesión ya no es válida. Vuelve a iniciar sesión.';
  if (code === 'permission-denied') return 'No pudimos confirmar tu acceso al perfil. Contacta con administración.';
  return 'No pudimos verificar el acceso. Comprueba tu conexión y vuelve a intentarlo.';
}
