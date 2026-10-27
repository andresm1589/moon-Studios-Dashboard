export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_WARNING_SECONDS = 60;

export type SessionDeadlineState = {
  phase: 'active' | 'warning' | 'expired';
  countdown: number;
  nextCheckIn: number;
};

/** The warning deadline starts when inactivity expires, even in a sleeping tab. */
export function getSessionDeadlineState(now: number, idleDeadline: number): SessionDeadlineState {
  if (now < idleDeadline) {
    return { phase: 'active', countdown: SESSION_WARNING_SECONDS, nextCheckIn: idleDeadline - now };
  }

  const remaining = idleDeadline + SESSION_WARNING_SECONDS * 1000 - now;
  if (remaining <= 0) return { phase: 'expired', countdown: 0, nextCheckIn: 0 };

  return {
    phase: 'warning',
    countdown: Math.ceil(remaining / 1000),
    nextCheckIn: Math.min(1000, remaining),
  };
}
