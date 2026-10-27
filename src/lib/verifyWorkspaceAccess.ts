import { getIdTokenResult, type User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { verifyAccessChecks, WorkspaceAccessError, type AccessStep } from './workspaceAccess';

function withDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new WorkspaceAccessError('workspace/timeout', 'La verificación está tardando más de lo esperado. Comprueba tu conexión y vuelve a intentarlo.')), 15000); })]).finally(() => clearTimeout(timer));
}

export function verifyWorkspaceAccess(user: User, onStep?: (step: AccessStep) => void) {
  return verifyAccessChecks(user, {
    currentUid: () => auth.currentUser?.uid ?? null,
    refreshSession: () => withDeadline(getIdTokenResult(user, true)),
    readProfile: async () => { const snapshot = await withDeadline(getDocFromServer(doc(db, 'users', user.uid))); return snapshot.exists() ? snapshot.data() : null; },
  }, onStep);
}
