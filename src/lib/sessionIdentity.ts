export interface SessionKeyStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/** The legacy global `sessionKey` has no known owner and is never migrated. */
export function sessionStorageKeyFor(uid: string): string {
  if (!uid) throw new Error('No hay una cuenta para identificar la sesión.');
  return `moon-session:${encodeURIComponent(uid)}`;
}

/** One tab identifier per account, also usable when browser storage is denied. */
export class TabSessionKeys {
  private readonly memory = new Map<string, string>();
  private readonly storage: () => SessionKeyStorage;
  private readonly generate: () => string;
  constructor(storage: () => SessionKeyStorage, generate: () => string) { this.storage = storage; this.generate = generate; }

  read(uid: string): string | null {
    const key = sessionStorageKeyFor(uid);
    try {
      const stored = this.storage().getItem(key);
      if (stored?.trim()) { this.memory.set(uid, stored); return stored; }
    } catch { /* A private or locked browser can still identify this tab in memory. */ }
    return this.memory.get(uid) ?? null;
  }

  ensure(uid: string): string {
    const existing = this.read(uid);
    if (existing) return existing;
    const value = this.generate();
    this.memory.set(uid, value);
    try { this.storage().setItem(sessionStorageKeyFor(uid), value); }
    catch { /* Keep the per-account in-memory identifier when storage is denied. */ }
    return value;
  }
}

export interface SessionPresence {
  exists: boolean;
  fromCache: boolean;
  hasPendingWrites: boolean;
}

/** Cached/offline snapshots and another account must never sign this account out. */
export function createSessionRemovalGuard(uid: string, currentUid: () => string | null, onRemoved: () => void, confirmedInitially = false) {
  let confirmed = confirmedInitially;
  let ended = false;
  return (presence: SessionPresence) => {
    if (ended || currentUid() !== uid || presence.fromCache || presence.hasPendingWrites) return;
    if (presence.exists) { confirmed = true; return; }
    if (confirmed) { ended = true; onRemoved(); }
  };
}
