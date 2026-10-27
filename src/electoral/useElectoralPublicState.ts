import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import type { ElectoralAnnouncement, ElectoralSettings } from './electionTypes';
import { defaultElectoralSettings, normalizeElectoralAnnouncement, resolveElectoralSettings } from './model';

export interface ElectoralPublicStateOptions {
  db: Firestore;
  includeAnnouncements?: boolean;
  /** Must come from the verified stored CEO role; Firestore enforces access. */
  canManage?: boolean;
}

const closedSettings = (): ElectoralSettings => ({ ...defaultElectoralSettings(), enabled: false });
function connectionError(error: unknown, subject: string): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return code.includes('permission-denied')
    ? `No se pudo consultar ${subject}. Actualiza tu sesión o solicita ayuda al responsable.`
    : `No se pudo conectar para consultar ${subject}. Revisa tu conexión y vuelve a intentar.`;
}

/** Public availability is shared by the pre-login page and both workspaces.
 *  No optimistic open state is exposed while the server is being checked. */
export function useElectoralPublicState({ db, includeAnnouncements = true, canManage = false }: ElectoralPublicStateOptions) {
  const [revision, setRevision] = useState(0);
  const [settingsState, setSettingsState] = useState<{ db: Firestore; settings: ElectoralSettings; loading: boolean; error: string | null }>({ db, settings: closedSettings(), loading: true, error: null });
  const policy = `${includeAnnouncements ? 'included' : 'omitted'}:${canManage ? 'ceo' : 'public'}`;
  const [announcementState, setAnnouncementState] = useState<{ db: Firestore; policy: string; announcements: ElectoralAnnouncement[]; loading: boolean; error: string | null }>({ db, policy, announcements: [], loading: includeAnnouncements, error: null });
  const policyRef = useRef(policy);
  policyRef.current = policy;

  useEffect(() => {
    let stopped = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const clearDeadline = () => { if (deadline !== undefined) clearTimeout(deadline); deadline = undefined; };
    const waitForServer = () => {
      setSettingsState({ db, settings: closedSettings(), loading: true, error: null });
      if (deadline === undefined) deadline = setTimeout(() => {
        deadline = undefined;
        if (!stopped) setSettingsState({ db, settings: closedSettings(), loading: false, error: 'No se pudo verificar la disponibilidad electoral con el servidor. La participación permanece bloqueada; revisa tu conexión y vuelve a intentar.' });
      }, 15_000);
    };
    waitForServer();
    const unsubscribe = onSnapshot(doc(db, 'electoralSettings', 'general'), { includeMetadataChanges: true }, snapshot => {
      if (stopped) return;
      // A cached missing document is not evidence that the CEO left the
      // system open. Nor may a pending local settings write reopen it early.
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) { waitForServer(); return; }
      clearDeadline();
      const result = resolveElectoralSettings(snapshot.exists() ? snapshot.data() : null);
      setSettingsState({ db, ...result, loading: false });
    }, cause => {
      clearDeadline();
      if (!stopped) setSettingsState({ db, settings: closedSettings(), loading: false, error: connectionError(cause, 'la disponibilidad electoral') });
    });
    return () => { stopped = true; clearDeadline(); unsubscribe(); };
  }, [db, revision]);

  useEffect(() => {
    let stopped = false;
    setAnnouncementState({ db, policy, announcements: [], loading: includeAnnouncements, error: null });
    if (!includeAnnouncements) return () => { stopped = true; };
    const source = canManage ? collection(db, 'electoralAnnouncements') : query(collection(db, 'electoralAnnouncements'), where('status', '==', 'published'));
    const unsubscribe = onSnapshot(source, snapshot => {
      if (stopped || policyRef.current !== policy) return;
      const announcements = snapshot.docs.map(item => normalizeElectoralAnnouncement(item.id, item.data())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.startsAt.getTime() || 0) - (a.startsAt.getTime() || 0));
      setAnnouncementState({ db, policy, announcements, loading: false, error: null });
    }, cause => {
      if (!stopped && policyRef.current === policy) setAnnouncementState({ db, policy, announcements: [], loading: false, error: connectionError(cause, 'los comunicados electorales') });
    });
    return () => { stopped = true; unsubscribe(); };
  }, [db, revision, policy, includeAnnouncements, canManage]);

  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const sameSettingsSource = settingsState.db === db;
  // A role downgrade hides CEO drafts immediately, before effect cleanup runs.
  const sameAnnouncementSource = announcementState.db === db && announcementState.policy === policy;
  return {
    settings: sameSettingsSource ? settingsState.settings : closedSettings(),
    settingsLoading: !sameSettingsSource || settingsState.loading,
    settingsError: sameSettingsSource ? settingsState.error : null,
    announcements: sameAnnouncementSource ? announcementState.announcements : [],
    announcementsLoading: includeAnnouncements && (!sameAnnouncementSource || announcementState.loading),
    announcementsError: sameAnnouncementSource ? announcementState.error : null,
    refresh,
  };
}
