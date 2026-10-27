import { parseTicketToken } from '@/lib/fest/model';

/** A dashboard deep link accepts one opaque token; it never carries an action. */
export function entryTokenFromQuery(search: string): string {
  const values = new URLSearchParams(search).getAll('entrada');
  if (values.length !== 1 || !/^[a-fA-F0-9]{32}$/.test(values[0])) return '';
  return parseTicketToken(values[0]);
}

/** Reuses a read during effect replay; an explicit retry uses a new key. */
export function createEntryReader<T>(read: (token: string) => Promise<T>): (key: string, token: string) => Promise<T> {
  let current: { key: string; promise: Promise<T> } | null = null;
  return (key, token) => {
    if (current?.key !== key) current = { key, promise: Promise.resolve().then(() => read(token)) };
    return current.promise;
  };
}
