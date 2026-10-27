import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionDeadlineState, SESSION_IDLE_MS, SESSION_WARNING_SECONDS } from '@/lib/sessionDeadline';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

interface UseAutoLogoutResult {
  showWarning: boolean;
  countdown: number;
  handleStayActive: () => void;
}

/** Thirty minutes idle, then sixty seconds to explicitly keep the session alive. */
export function useAutoLogout(isAuthenticated: boolean, onLogout: () => Promise<void>): UseAutoLogoutResult {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(SESSION_WARNING_SECONDS);
  const logoutRef = useRef(onLogout);
  const keepAliveRef = useRef<(() => void) | null>(null);

  useEffect(() => { logoutRef.current = onLogout; }, [onLogout]);

  useEffect(() => {
    setShowWarning(false);
    setCountdown(SESSION_WARNING_SECONDS);
    if (!isAuthenticated) return;

    let idleDeadline = Date.now() + SESSION_IDLE_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let warningVisible = false;
    let logoutStarted = false;
    let disposed = false;

    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const synchronize = () => {
      clearTimer();
      if (disposed || logoutStarted) return;

      const state = getSessionDeadlineState(Date.now(), idleDeadline);
      if (state.phase === 'expired') {
        // Mark this before calling the async handler: focus, activity and a late
        // timeout may all arrive together when a sleeping window wakes up.
        logoutStarted = true;
        setCountdown(0);
        setShowWarning(false);
        try {
          void Promise.resolve(logoutRef.current()).catch(error => {
            console.error('No se pudo completar el cierre automático de sesión.', error);
          });
        } catch (error) {
          console.error('No se pudo completar el cierre automático de sesión.', error);
        }
        return;
      }

      warningVisible = state.phase === 'warning';
      setShowWarning(warningVisible);
      setCountdown(state.countdown);
      timer = setTimeout(synchronize, state.nextCheckIn);
    };

    const onActivity = () => {
      if (disposed || logoutStarted || warningVisible) return;
      const now = Date.now();
      // Activity cannot revive an already expired idle period if the browser
      // postponed its timer in the background. Only the explicit button can.
      if (now >= idleDeadline) {
        synchronize();
        return;
      }
      // Do not allocate a timeout for every mousemove. The existing timeout
      // reads the latest deadline and reschedules itself when necessary.
      idleDeadline = now + SESSION_IDLE_MS;
    };

    const keepAlive = () => {
      if (disposed || logoutStarted) return;
      if (getSessionDeadlineState(Date.now(), idleDeadline).phase === 'expired') {
        synchronize();
        return;
      }
      idleDeadline = Date.now() + SESSION_IDLE_MS;
      synchronize();
    };

    keepAliveRef.current = keepAlive;
    synchronize();
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, onActivity, { passive: true, capture: true }));
    window.addEventListener('focus', synchronize);
    document.addEventListener('visibilitychange', synchronize);

    return () => {
      disposed = true;
      clearTimer();
      if (keepAliveRef.current === keepAlive) keepAliveRef.current = null;
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, onActivity, true));
      window.removeEventListener('focus', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
    };
  }, [isAuthenticated]);

  const handleStayActive = useCallback(() => { keepAliveRef.current?.(); }, []);
  return { showWarning, countdown, handleStayActive };
}
