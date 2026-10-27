// ─── Constantes y utilidades de los editores de la web de Luna ──────────────
// (separadas de ui.tsx para que ese archivo exporte solo componentes)

export type Lang = 'es' | 'en' | 'pt' | 'ja';
export type LunaFetch = (path: string, opts?: RequestInit) => Promise<{ success: boolean; data?: unknown; error?: string }>;

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'es', label: 'Español' }, { id: 'en', label: 'English' }, { id: 'pt', label: 'Português' }, { id: 'ja', label: '日本語' },
];
export const WEB = 'https://luna-net.nellyx.xyz';

export const bd = 'hsl(var(--border))';
export const sf = 'hsl(var(--card))';
export const sc = 'hsl(var(--secondary))';
export const mt = 'hsl(var(--muted-foreground))';
export const tenue = 'var(--moon-muted)';

export const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
export const fechaHora = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' })
  : '';
export const aSlug = (s: string, max = 80) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
export const mensajeError = (e: unknown, porDefecto: string) => (e instanceof Error ? e.message : porDefecto);
