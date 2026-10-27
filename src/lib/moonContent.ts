/** Shared CMS contract. Keep identical in the public website and dashboard. */
export const MOON_CONTENT_VERSION = 1;
export const MOON_PUBLISHED_PATH = ['moonStudios', 'web'] as const;
export const MOON_DRAFT_PATH = ['moonStudios', 'webDraft'] as const;
export const MOON_PREVIEW_READY = 'MOON_PREVIEW_READY';
export const MOON_PREVIEW_CONTENT = 'MOON_PREVIEW_CONTENT';
export type MoonSectionId = 'inicio' | 'estudio' | 'servicios' | 'proyectos' | 'proceso' | 'equipo' | 'app' | 'faq' | 'contacto';
export interface MoonHeading { eyebrow: string; title: string; highlight: string; description: string }
export interface MoonValue { id: string; icon: string; title: string; description: string }
export interface MoonService extends MoonValue { bullets: string[] }
export type MoonStep = MoonValue;
export interface MoonContent {
  version: number;
  brand: { name: string; logo: string; tagline: string; seoTitle: string; seoDescription: string; ogImage: string };
  hero: MoonHeading & { primaryLabel: string; secondaryLabel: string; orbitLabel: string; disciplines: string[] };
  about: MoonHeading & { secondary: string; stats: { id: string; value: string; label: string }[]; values: MoonValue[] };
  services: MoonHeading & { items: MoonService[]; extras: string[] };
  process: MoonHeading & { steps: MoonStep[] };
  portfolio: MoonHeading;
  team: MoonHeading;
  download: MoonHeading & { webUrl: string; repository: string };
  faq: MoonHeading & { items: { id: string; question: string; answer: string }[] };
  contact: MoonHeading & { email: string; phone: string; location: string };
  footer: { ctaTitle: string; ctaDescription: string; tagline: string; copyright: string; products: { id: string; label: string; url: string }[] };
  quote: MoonHeading & { primaryLabel: string; secondaryLabel: string; steps: MoonStep[] };
  portal: { title: string; description: string };
  socials: { id: string; label: string; url: string }[];
  sections: { id: MoonSectionId; label: string; visible: boolean }[];
  announcement: { enabled: boolean; text: string; label: string; url: string };
  motion: { enabled: boolean };
}

const LEGACY_LOGO = 'https://ufvebjscabomuayqtyyo.supabase.co/storage/v1/object/public/ANDRE/moonstudios_logotipo_500x500_negro.png';
const LOGO = 'https://moon-studios.netlify.app/brand/moon-wordmark.svg';
const OG_IMAGE = 'https://moon-studios.netlify.app/brand/moon-symbol-original.png';
export const DEFAULT_MOON_CONTENT: MoonContent = {
  version: MOON_CONTENT_VERSION,
  brand: { name: 'Moon Studios', logo: LOGO, tagline: 'Estudio digital · Callao, Perú', seoTitle: 'Moon Studios — Desarrollo web y bots de Discord', seoDescription: 'Diseño, desarrollo web y bots de Discord desde Callao, Perú. Creamos productos digitales con identidad y proyectos a medida.', ogImage: OG_IMAGE },
  hero: { eyebrow: 'Estudio digital · Callao, Perú', title: 'Tu próxima gran idea.', highlight: 'En otra órbita.', description: 'Diseñamos y desarrollamos sitios web, bots de Discord y experiencias digitales. De la primera idea al último detalle, lo hacemos contigo.', primaryLabel: 'Explorar proyectos', secondaryLabel: 'Hablemos de tu idea', orbitLabel: 'Ideas que se convierten en experiencias', disciplines: ['Diseño de producto', 'Desarrollo web', 'Bots de Discord', 'Experiencias digitales'] },
  about: { eyebrow: '01 / El estudio', title: 'Pequeños detalles.', highlight: 'Grandes experiencias.', description: 'Moon Studios es un estudio creativo de diseño y desarrollo. Creemos en la belleza de lo simple y en el poder de los detalles.', secondary: 'Trabajamos de cerca con cada cliente para construir soluciones únicas, que reflejen su visión y conecten con su gente.', stats: [{ id: 'proyectos', value: '15+', label: 'proyectos entregados' }, { id: 'clientes', value: '10+', label: 'clientes' }, { id: 'experiencia', value: '3', label: 'años creando' }, { id: 'aliados', value: '12', label: 'aliados' }], values: [{ id: 'calidad', icon: 'Gem', title: 'Calidad', description: 'Cada pixel y cada línea de código pasan por nuestro estándar. Cuidamos lo que ves y lo que hay detrás.' }, { id: 'innovacion', icon: 'Lightbulb', title: 'Innovación', description: 'Tecnología actual y diseño con intención para que tu proyecto pueda seguir creciendo.' }, { id: 'compromiso', icon: 'HeartHandshake', title: 'Compromiso', description: 'Trabajamos contigo en cada etapa, también después del lanzamiento.' }] },
  services: { eyebrow: '02 / Lo que hacemos', title: 'Ideas ambiciosas.', highlight: 'Soluciones a medida.', description: 'Elige qué quieres construir. Nosotros conectamos el diseño, el código y los detalles.', items: [{ id: 'web', icon: 'Code2', title: 'Desarrollo web', description: 'Sitios y aplicaciones rápidas, claras y fáciles de usar, creadas alrededor de tu marca y tus objetivos.', bullets: ['Webs corporativas y landing pages', 'Tiendas online', 'Aplicaciones web con panel', 'React, TypeScript y Vite'] }, { id: 'discord', icon: 'Bot', title: 'Bots de Discord', description: 'Bots a medida que automatizan, moderan y le dan vida a tu servidor. Experiencia que también aplicamos en Luna NET.', bullets: ['Moderación y seguridad', 'Comandos y sistemas propios', 'Economía, eventos y música', 'Panel web e integraciones'] }], extras: ['Apps de escritorio', 'Paneles de gestión', 'Integraciones con APIs'] },
  process: { eyebrow: '04 / Nuestro proceso', title: 'Del primer «¿y si…?»', highlight: 'a hacerlo realidad.', description: 'Un recorrido claro, con espacio para conversar, probar y mejorar juntos.', steps: [{ id: 'idea', icon: 'MessagesSquare', title: 'Conversamos', description: 'Entendemos tu idea, tu público y lo que necesitas lograr.' }, { id: 'diseno', icon: 'PenTool', title: 'Diseñamos', description: 'Te mostramos cómo se verá y funcionará antes de programar.' }, { id: 'codigo', icon: 'Code2', title: 'Desarrollamos', description: 'Construimos por etapas y te enseñamos el avance.' }, { id: 'lanzamiento', icon: 'Rocket', title: 'Lanzamos', description: 'Publicamos y ajustamos lo que haga falta.' }, { id: 'soporte', icon: 'LifeBuoy', title: 'Acompañamos', description: 'Soporte y mejoras después del lanzamiento.' }] },
  portfolio: { eyebrow: '03 / Trabajo seleccionado', title: 'Hecho en', highlight: 'Moon Studios.', description: 'Productos propios y proyectos para marcas y comunidades. Explora cada uno para conocer su historia.' },
  team: { eyebrow: '05 / Nuestro equipo', title: 'Personas detrás', highlight: 'de cada pixel.', description: 'Las ideas toman forma cuando se unen distintas maneras de pensar y crear.' },
  download: { eyebrow: '06 / Moon en tu escritorio', title: 'Tu espacio de trabajo.', highlight: 'Siempre a mano.', description: 'El dashboard de Moon Studios reúne las herramientas del equipo en una aplicación para Windows.', webUrl: 'https://moon-studios-dashboard.netlify.app', repository: 'pandita1589/moon-Studios-Dashboard' },
  faq: { eyebrow: '07 / Antes de empezar', title: 'Una buena pregunta.', highlight: 'Un buen comienzo.', description: 'Lo que puedes querer saber antes de contarnos tu idea.', items: [{ id: 'empezar', question: '¿Cómo empezamos un proyecto?', answer: 'Cuéntanos tu idea desde el formulario de contacto o solicita una cotización en el Portal de clientes. Revisaremos el alcance y te responderemos con una propuesta.' }, { id: 'plazos', question: '¿Cuánto tarda y cuánto cuesta?', answer: 'Depende del alcance, las funciones y los materiales disponibles. Definimos los tiempos y el presupuesto contigo antes de comenzar.' }, { id: 'seguimiento', question: '¿Puedo seguir el estado de mi solicitud?', answer: 'Sí. En el Portal de clientes puedes crear cotizaciones y tickets, adjuntar referencias y consultar su estado y las respuestas del equipo.' }, { id: 'soporte', question: '¿Puedo pedir cambios después del lanzamiento?', answer: 'Puedes contactarnos para solicitar soporte o nuevas mejoras. Revisaremos qué necesitas y acordaremos el alcance de los cambios.' }] },
  contact: { eyebrow: '08 / Contacto', title: 'Todo empieza', highlight: 'con una conversación.', description: 'Un proyecto nuevo, una consulta o una idea a medio dibujar. Cuéntanos y le damos forma.', email: 'studios.soporteplaykia@gmail.com', phone: '+51 916 053 628', location: 'Callao, Perú' },
  footer: { ctaTitle: '¿Listo para tu próxima órbita?', ctaDescription: 'Cuéntanos qué quieres construir. Lo diseñamos, lo programamos y lo acompañamos.', tagline: 'Diseño, código y un poco de luna. Hecho con cariño desde Callao, Perú.', copyright: 'Todos los derechos reservados.', products: [{ id: 'luna-net', label: 'Luna NET', url: 'https://luna-net.nellyx.xyz' }, { id: 'dashboard-web', label: 'Versión web del dashboard', url: 'https://moon-studios-dashboard.netlify.app' }] },
  quote: { eyebrow: 'Cotizaciones', title: 'Cuéntanos tu idea.', highlight: 'Te armamos la propuesta.', description: 'Pide tu cotización desde el Portal de clientes: tu pedido queda guardado y puedes seguir su estado.', primaryLabel: 'Ir al Portal de clientes', secondaryLabel: 'Prefiero escribir', steps: [{ id: 'cuenta', icon: 'UserPlus', title: 'Crea tu cuenta', description: 'Entra al Portal de clientes con tu correo.' }, { id: 'solicitud', icon: 'FileText', title: 'Pide la cotización', description: 'Elige «Solicitar cotización» y cuéntanos tu idea. Puedes adjuntar una referencia.' }, { id: 'respuesta', icon: 'MessagesSquare', title: 'Te respondemos', description: 'Revisamos tu pedido y te enviamos una propuesta con alcance, tiempos y precio.' }, { id: 'empezar', icon: 'Rocket', title: 'Empezamos', description: 'Si te convence, arrancamos. Sigues el estado de tu solicitud desde el portal.' }] },
  portal: { title: 'Portal de clientes', description: 'Tus ideas, solicitudes y conversaciones con Moon Studios, en un solo lugar.' },
  socials: [{ id: 'discord', label: 'Discord', url: 'https://discord.gg/z7G7F7WpUD' }, { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/moon_studios.1589' }, { id: 'github', label: 'GitHub', url: 'https://github.com/moonstudios-code' }],
  sections: [{ id: 'inicio', label: 'Inicio', visible: true }, { id: 'estudio', label: 'Estudio', visible: true }, { id: 'servicios', label: 'Servicios', visible: true }, { id: 'proyectos', label: 'Proyectos', visible: true }, { id: 'proceso', label: 'Proceso', visible: true }, { id: 'equipo', label: 'Equipo', visible: true }, { id: 'app', label: 'App', visible: true }, { id: 'faq', label: 'Preguntas', visible: true }, { id: 'contacto', label: 'Contacto', visible: true }],
  announcement: { enabled: false, text: '', label: 'Conocer más', url: '/cotizar' },
  motion: { enabled: true },
};

/** Disallow executable/data URLs. Blank stays blank; callers can omit its link. */
export function safeUrl(value: unknown, fallback = '', options: { contact?: boolean; internal?: boolean } = {}): string {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (!url) return '';
  // Control characters and backslashes must never alter a URL's scheme or origin.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f\\]/.test(url)) return fallback;
  if (options.internal !== false && (/^\/(?!\/)/.test(url) || /^#[a-zA-Z][\w-]*$/.test(url))) return url;
  if (options.contact && /^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|tel:\+?[\d()-]+)$/i.test(url)) return url;
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : fallback; } catch { return fallback; }
}

function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
/** Type-directed merging: missing fields inherit, intentional empty strings/arrays persist. */
function mergeShape(template: unknown, value: unknown): unknown {
  if (typeof template === 'string') return typeof value === 'string' ? value.slice(0, 10000) : template;
  if (typeof template === 'boolean') return typeof value === 'boolean' ? value : template;
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : template;
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return structuredClone(template);
    return value.slice(0, 60).filter(v => typeof template[0] === 'string' ? typeof v === 'string' : record(v)).map((v, i) => {
      const result = mergeShape(template[0], v);
      if (record(result) && 'id' in result) result.id = record(v) && typeof v.id === 'string' && v.id ? v.id.slice(0, 80) : `item-${i + 1}`;
      return result;
    });
  }
  if (record(template)) return Object.fromEntries(Object.entries(template).map(([key, base]) => [key, mergeShape(base, record(value) ? value[key] : undefined)]));
  return template;
}

export function normalizeMoonContent(value: unknown): MoonContent {
  const content = mergeShape(DEFAULT_MOON_CONTENT, value) as MoonContent;
  content.version = MOON_CONTENT_VERSION;
  const seen = new Set<string>();
  content.sections = content.sections.filter(s => DEFAULT_MOON_CONTENT.sections.some(d => d.id === s.id) && !seen.has(s.id) && !!seen.add(s.id));
  // New sections stay discoverable when loading older content versions.
  for (const section of DEFAULT_MOON_CONTENT.sections) if (!seen.has(section.id)) content.sections.push({ ...section });
  content.brand.logo = content.brand.logo === LEGACY_LOGO ? LOGO : safeUrl(content.brand.logo);
  content.brand.ogImage = content.brand.ogImage === LEGACY_LOGO ? OG_IMAGE : safeUrl(content.brand.ogImage);
  content.download.webUrl = safeUrl(content.download.webUrl, '', { internal: false });
  content.download.repository = /^[\w.-]+\/[\w.-]+$/.test(content.download.repository) ? content.download.repository : DEFAULT_MOON_CONTENT.download.repository;
  content.socials = content.socials.map(s => ({ ...s, url: safeUrl(s.url, '', { internal: false }) }));
  content.footer.products = content.footer.products.map(p => ({ ...p, url: safeUrl(p.url) }));
  content.announcement.url = safeUrl(content.announcement.url);
  for (const items of [content.about.stats, content.about.values, content.services.items, content.process.steps, content.faq.items, content.quote.steps, content.socials, content.footer.products]) {
    const ids = new Set<string>();
    for (const item of items) {
      const baseId = item.id;
      let suffix = 1;
      while (ids.has(item.id)) item.id = `${baseId}-${suffix++}`;
      ids.add(item.id);
    }
  }
  return content;
}

export function validateMoonContent(value: MoonContent): string[] {
  const errors: string[] = [];
  if (!value.brand.name.trim()) errors.push('Escribe el nombre del estudio.');
  if (!value.brand.seoTitle.trim()) errors.push('Escribe un título para los buscadores.');
  if (value.sections.some(s => s.id === 'inicio' && s.visible) && !value.hero.title.trim()) errors.push('Escribe un título para la portada.');
  if (!value.sections.some(s => s.visible)) errors.push('Deja al menos una sección visible.');
  if (value.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact.email)) errors.push('Revisa el correo de contacto.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(value.download.repository)) errors.push('El repositorio debe tener el formato usuario/repositorio.');
  for (const [label, url, options] of [
    ['Logo', value.brand.logo, {}], ['Imagen para compartir', value.brand.ogImage, {}], ['Dashboard web', value.download.webUrl, { internal: false }], ['Aviso', value.announcement.url, {}],
    ...value.socials.map(s => [`Enlace ${s.label}`, s.url, { internal: false }]),
    ...value.footer.products.map(p => [`Producto ${p.label}`, p.url, {}]),
  ] as [string, string, { internal?: boolean }][]) if (url && !safeUrl(url, '', options)) errors.push(`${label}: utiliza una URL http/https válida.`);
  return errors;
}
