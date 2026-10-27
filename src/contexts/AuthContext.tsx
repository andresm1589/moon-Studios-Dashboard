import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, registerSession, subscribeCurrentSession, touchSession, logoutUser, logUserActivity } from '@/lib/firebase';
import { verifyWorkspaceAccess } from '@/lib/verifyWorkspaceAccess';
import { accessErrorMessage, WorkspaceAccessError, type AccessStep } from '@/lib/workspaceAccess';
import { tienePermiso, type Permission, type UserRole, type UserProfile } from '@/types';
import { escucharAcceso, permisosDeRol, type AccesoAdministracion } from '@/lib/tramites';

interface AuthContextType {
  currentUser: User | null; userProfile: UserProfile | null; userRole: UserRole | null;
  isCEO: boolean; isAdmin: boolean; isEmployee: boolean; canEdit: boolean; loading: boolean;
  refreshProfile: () => Promise<void>;
  verifyAccess: (onStep?: (step: AccessStep) => void) => Promise<UserProfile>;
  accessError: string | null;
  isContador: boolean; isProgramacion: boolean; puede: (permiso: Permission) => boolean;
  /** Límites que el CEO fija para Administración (solo se cargan para CEO y Administración). */
  accesoAdmin: AccesoAdministracion | null;
}
const AuthContext = createContext<AuthContextType>({
  currentUser: null, userProfile: null, userRole: null, isCEO: false, isAdmin: false, isEmployee: false,
  canEdit: false, loading: true, refreshProfile: async () => {}, verifyAccess: async () => { throw new Error('No hay una sesión iniciada.'); },
  accessError: null, isContador: false, isProgramacion: false, puede: () => false, accesoAdmin: null,
});
export const useAuth = () => useContext(AuthContext);
interface VerificationJob { uid: string; step: AccessStep; listeners: Set<(step: AccessStep) => void>; promise: Promise<UserProfile> }

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const active = useRef(true);
  const pending = useRef<VerificationJob | null>(null);
  const recent = useRef<{ uid: string; profile: UserProfile; at: number } | null>(null);

  const runVerification = useCallback((user: User, onStep?: (step: AccessStep) => void, force = false): Promise<UserProfile> => {
    const existing = pending.current;
    if (existing?.uid === user.uid) {
      if (onStep) { existing.listeners.add(onStep); onStep(existing.step); }
      return existing.promise.finally(() => { if (onStep) existing.listeners.delete(onStep); });
    }
    const cached = recent.current;
    if (!force && cached?.uid === user.uid && Date.now() - cached.at < 10_000 && auth.currentUser?.uid === user.uid) {
      onStep?.('access');
      return Promise.resolve(cached.profile);
    }
    const job: VerificationJob = { uid: user.uid, step: 'session', listeners: new Set(onStep ? [onStep] : []), promise: Promise.resolve(null as unknown as UserProfile) };
    pending.current = job;
    // A profile refresh checks the server again without unmounting the current
    // page. A failed check still clears the profile and closes protected access.
    if (active.current) { if (recent.current?.uid !== user.uid) setLoading(true); setAccessError(null); }
    job.promise = verifyWorkspaceAccess(user, step => { job.step = step; for (const listener of job.listeners) listener(step); })
      .then(profile => {
        if (pending.current !== job || auth.currentUser?.uid !== user.uid) throw new WorkspaceAccessError('workspace/session-changed', 'La sesión cambió. Vuelve a iniciar sesión.');
        recent.current = { uid: user.uid, profile, at: Date.now() };
        if (active.current) { setUserProfile(profile); setAccessError(null); }
        return profile;
      })
      .catch(error => {
        if (active.current && pending.current === job && auth.currentUser?.uid === user.uid) {
          recent.current = null; setUserProfile(null); setAccessError(accessErrorMessage(error));
        }
        throw error instanceof WorkspaceAccessError ? error : new WorkspaceAccessError('workspace/verification-failed', accessErrorMessage(error));
      })
      .finally(() => {
        job.listeners.clear();
        if (pending.current === job) { pending.current = null; if (active.current) setLoading(false); }
      });
    return job.promise;
  }, []);
  const verifyAccess = useCallback((onStep?: (step: AccessStep) => void) => {
    const user = auth.currentUser;
    if (!user) return Promise.reject(new Error('No hay una sesión iniciada.'));
    return runVerification(user, onStep);
  }, [runVerification]);
  const refreshProfile = useCallback(async () => {
    const user = auth.currentUser;
    if (user) await runVerification(user, undefined, true);
  }, [runVerification]);

  useEffect(() => {
    active.current = true;
    let previousUid: string | null = null;
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!active.current) return;
      setCurrentUser(user);
      if (!user) {
        pending.current = null; recent.current = null;
        setUserProfile(null); setAccessError(null); previousUid = null; setLoading(false); return;
      }
      // Login can start its check before the auth observer fires. Keep that
      // same-account request so the welcome screen and route gate share it.
      const sameAccount = (pending.current?.uid ?? recent.current?.uid) === user.uid;
      if (!sameAccount) { pending.current = null; recent.current = null; setUserProfile(null); }
      setAccessError(null);
      if (recent.current?.uid !== user.uid) setLoading(true);
      void runVerification(user, undefined, true).then(() => {
        if (!active.current || auth.currentUser?.uid !== user.uid) return;
        if (previousUid !== user.uid) {
          if (previousUid !== null || document.visibilityState === 'visible') void logUserActivity(user.uid, 'login', 'Inicio de sesión').catch(console.error);
        }
        previousUid = user.uid;
      }).catch(() => { /* The access screen and route gate expose a retry action. */ });
    });
    return () => { active.current = false; unsubscribe(); };
  }, [runVerification]);

  const authenticatedUid = currentUser?.uid;
  const verifiedUid = userProfile?.uid;
  useEffect(() => {
    if (!authenticatedUid || authenticatedUid !== verifiedUid || auth.currentUser?.uid !== authenticatedUid) return;
    const uid = authenticatedUid;
    let disposed = false;
    let registering = false;
    let stopSession: (() => void) | null = null;
    const registerAndWatch = () => {
      if (disposed || registering || stopSession || auth.currentUser?.uid !== uid) return;
      registering = true;
      void registerSession(uid).then(() => {
        if (disposed || auth.currentUser?.uid !== uid) return;
        stopSession = subscribeCurrentSession(uid, () => {
          if (!disposed && auth.currentUser?.uid === uid) void logoutUser().catch(console.error);
        });
      }).catch(console.error).finally(() => { registering = false; });
    };
    // Verification may succeed on an explicit retry, not only in the initial
    // auth observer. Retry a failed registration after connectivity returns.
    registerAndWatch();
    // Al volver a la ventana, el dispositivo figura como usado ahora.
    const alVolver = () => { if (document.visibilityState === 'visible') void touchSession(uid); };
    window.addEventListener('online', registerAndWatch);
    document.addEventListener('visibilitychange', alVolver);
    return () => { disposed = true; stopSession?.(); window.removeEventListener('online', registerAndWatch); document.removeEventListener('visibilitychange', alVolver); };
  }, [authenticatedUid, verifiedUid]);

  const userRole = userProfile?.role || null;
  const isCEO = userRole === 'CEO';
  const isAdmin = userRole === 'Administración' || isCEO;

  // Administración ve lo que el CEO le habilita. Mientras llega el documento
  // la sesión sigue «cargando», así una ruta permitida no rebota al inicio.
  const [acceso, setAcceso] = useState<{ uid: string; valor: AccesoAdministracion | null } | null>(null);
  const leeAcceso = isAdmin && !!verifiedUid;
  useEffect(() => {
    if (!leeAcceso || !verifiedUid) return;
    return escucharAcceso(valor => setAcceso({ uid: verifiedUid, valor }), error => { console.error('[acceso]', error); setAcceso({ uid: verifiedUid, valor: null }); });
  }, [leeAcceso, verifiedUid]);
  const accesoAdmin = acceso && acceso.uid === verifiedUid ? acceso.valor : null;
  const esperandoAcceso = userRole === 'Administración' && (!acceso || acceso.uid !== verifiedUid);
  const puede = (permiso: Permission) => userRole === 'Administración'
    ? permisosDeRol('Administración', accesoAdmin).includes(permiso)
    : tienePermiso(userRole, permiso);

  return <AuthContext.Provider value={{
    currentUser, userProfile, userRole, isCEO, isAdmin, isEmployee: userRole === 'Empleado' || isAdmin,
    canEdit: isAdmin, loading: loading || esperandoAcceso, refreshProfile, verifyAccess, accessError,
    isContador: tienePermiso(userRole, 'contador'), isProgramacion: tienePermiso(userRole, 'programacion'),
    puede, accesoAdmin,
  }}>{children}</AuthContext.Provider>;
};
