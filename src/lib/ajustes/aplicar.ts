// ─── Configuración → la interfaz ──────────────────────────────────────────────
// El ÚNICO lugar que aplica la configuración del usuario a la página. Antes lo
// hacían dos a la vez (SettingsContext sobre <html> y DashboardLayout sobre
// <body>), con valores distintos para las mismas variables y clases que no
// tenían CSS: varias opciones «se guardaban» pero no hacían nada, o hacían una
// cosa u otra según cuál se ejecutara último.
//
// Las opciones visuales son clases en <html> (ajustes-*); su CSS está en
// index.css, bloque «AJUSTES DEL USUARIO».

import type { Settings } from '@/contexts/SettingsContext';
import { coloresAcento } from './acento';

// ── Fuentes ──────────────────────────────────────────────────────────────────
const gf = (familia: string, pesos = '300;400;500;600;700') =>
  `https://fonts.googleapis.com/css2?family=${familia.replace(/ /g, '+')}:wght@${pesos}&display=swap`;

export const FUENTES = [
  { id: 'DM Sans',           desc: 'La fuente actual — moderna y geométrica',   url: gf('DM Sans') },
  { id: 'Inter',             desc: 'Neutral y altamente legible',               url: gf('Inter') },
  { id: 'Geist',             desc: 'Inspirada en Vercel — minimalista técnica', url: gf('Geist') },
  { id: 'Sora',              desc: 'Redondas y amigables',                      url: gf('Sora') },
  { id: 'Space Grotesk',     desc: 'Compacta y con carácter',                   url: gf('Space Grotesk', '300;400') },
  { id: 'Outfit',            desc: 'Limpia y contemporánea',                    url: gf('Outfit') },
  { id: 'IBM Plex Sans',     desc: 'Técnica y precisa — ideal para dashboards', url: gf('IBM Plex Sans') },
  { id: 'Plus Jakarta Sans', desc: 'Contemporánea con personalidad',            url: gf('Plus Jakarta Sans') },
  { id: 'Figtree',           desc: 'Suave y variable — excelente lectura',      url: gf('Figtree', '300;400') },
  { id: 'Nunito',            desc: 'Redondeada y amigable — gran legibilidad',  url: gf('Nunito') },
] as const;

// «Satoshi» existió en una versión vieja (en realidad cargaba Nunito).
const ALIAS_FUENTE: Record<string, string> = { Satoshi: 'Nunito' };

export function cargarFuente(id: string) {
  const f = FUENTES.find(x => x.id === (ALIAS_FUENTE[id] ?? id));
  if (!f) return;
  const linkId = `gf-${f.id.replace(/\s/g, '-').toLowerCase()}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement('link');
  link.id = linkId; link.rel = 'stylesheet'; link.href = f.url;
  document.head.appendChild(link);
}

// ── Tamaños ──────────────────────────────────────────────────────────────────
// En la raíz (rem): así cambian el texto Y los espacios de Tailwind a la vez.
// El modo compacto baja un escalón todo (texto, márgenes, alturas).
const TAMANOS: Record<string, number> = { xs: 12, sm: 13, md: 14, lg: 16, xl: 18 };

// ── Temas ────────────────────────────────────────────────────────────────────
const alfas = [2, 3, 4, 5, 6, 7, 8, 10, 12, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 75, 80, 85, 90, 95];
function variablesDeTema(oscuro: boolean, contraste: boolean): Record<string, string> {
  const c = oscuro ? '255,255,255' : '0,0,0';
  const v: Record<string, string> = {
    '--bg-main':             'var(--moon-bg)',
    '--bg-sidebar':          'var(--moon-surface)',
    '--bg-header':           'var(--moon-bg)',
    '--border-main':         `rgba(${c},${contraste ? 0.22 : oscuro ? 0.06 : 0.08})`,
    '--border-header':       `rgba(${c},${contraste ? 0.2 : oscuro ? 0.05 : 0.07})`,
    '--text-primary':        'var(--moon-ink)',
    // 0.3/0.4 daban ~2.4:1 de contraste: el menú y las etiquetas casi no se leían.
    '--text-muted':          'var(--moon-muted)',
    '--nav-active-bg':       `rgba(${c},${oscuro ? 0.07 : 0.06})`,
    '--nav-hover-bg':        `rgba(${c},${oscuro ? 0.04 : 0.03})`,
    '--sidebar-card-bg':     `rgba(${c},0.03)`,
    '--sidebar-card-border': `rgba(${c},${contraste ? 0.2 : oscuro ? 0.06 : 0.07})`,
    '--input-bg':            `rgba(${c},${oscuro ? 0.04 : 0.03})`,
    '--btn-bg':              `rgba(${c},${oscuro ? 0.03 : 0.04})`,
    '--btn-border':          `rgba(${c},${contraste ? 0.25 : oscuro ? 0.06 : 0.08})`,
    '--btn-color':           `rgba(${c},${contraste ? 0.85 : oscuro ? 0.46 : 0.56})`,
    '--btn-hover-bg':        `rgba(${c},0.07)`,
    '--btn-hover-border':    `rgba(${c},${oscuro ? 0.12 : 0.14})`,
    '--btn-hover-color':     `rgba(${c},0.75)`,
  };
  for (const a of alfas) v[`--s-a${String(a).padStart(2, '0')}`] = `rgba(${c},${a / 100})`;
  return v;
}

export const prefiereOscuro = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
export const esOscuro = (s: Pick<Settings, 'theme'>) => s.theme === 'dark' || (s.theme === 'system' && prefiereOscuro());

/** Aplica TODA la configuración a la página. Idempotente: se puede llamar siempre. */
export function aplicarAjustes(s: Settings) {
  const raiz = document.documentElement;
  const oscuro = esOscuro(s);
  const contraste = !!s.highContrast;

  // Tema
  raiz.classList.toggle('dark', oscuro);
  raiz.classList.toggle('light', !oscuro);
  raiz.style.colorScheme = oscuro ? 'dark' : 'light';
  for (const [k, v] of Object.entries(variablesDeTema(oscuro, contraste))) raiz.style.setProperty(k, v);

  // Acento. NO en --accent: esa es la variable HSL de shadcn (hsl(var(--accent))),
  // y un hex ahí rompía bg-accent, hover:bg-accent y la selección del Correo.
  const acento = /^#[0-9a-f]{6}$/i.test(s.accentColor ?? '') ? s.accentColor! : '#6366f1';
  raiz.style.setProperty('--accent-user', acento);
  raiz.style.setProperty('--accent-color', acento);
  raiz.style.setProperty('--accent-hover', acento + 'cc');
  raiz.style.setProperty('--settings-accent', acento);
  const colores = coloresAcento(acento, oscuro);
  raiz.style.setProperty('--accent-user-ink', colores.ink);
  raiz.style.setProperty('--accent-on-user', colores.on);

  // Texto: tamaño (y compacto) en la raíz; la fuente, cargada y en la raíz.
  const base = TAMANOS[s.fontSize ?? 'md'] ?? 14;
  raiz.style.fontSize = `${s.compactMode ? base - 1 : base}px`;
  const fuente = ALIAS_FUENTE[s.fontFamily ?? ''] ?? s.fontFamily ?? 'DM Sans';
  cargarFuente(fuente);
  raiz.style.setProperty('--fuente-usuario', `'${fuente}'`);

  // Opciones visuales y de accesibilidad (su CSS está en index.css).
  const sinMovimiento = s.animations === false || !!s.reduceMotion || !!s.screenReader;
  raiz.classList.toggle('ajustes-compacto', !!s.compactMode);
  raiz.classList.toggle('ajustes-sin-movimiento', sinMovimiento);
  raiz.classList.toggle('ajustes-sin-desenfoque', s.blurEffects === false);
  raiz.classList.toggle('ajustes-contraste', contraste);
  raiz.classList.toggle('ajustes-sin-foco', s.focusIndicator === false && !s.screenReader);
  raiz.classList.toggle('ajustes-lector', !!s.screenReader);
  raiz.classList.toggle('sidebar-collapsed', !!s.sidebarCollapsed);

  // El ajuste cambia formatos regionales; la interfaz sigue estando en español.
  raiz.lang = 'es';
  raiz.dataset.locale = s.language || 'es';
  // Antes se ponía aria-live en <html>: convertía toda la página en una región
  // «viva» y el lector anunciaba cualquier cambio. Se quita si quedó puesto.
  raiz.removeAttribute('aria-live');
}
