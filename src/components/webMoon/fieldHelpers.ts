
export type ContentValue = string | number | boolean | null | ContentValue[] | { [key: string]: ContentValue };
export type ContentPath = (string | number)[];

const labels: Record<string, string> = {
  brand: 'Identidad', name: 'Nombre', tagline: 'Frase de marca', logo: 'Logotipo (URL)', logoUrl: 'Logotipo (URL)',
  eyebrow: 'Etiqueta superior', title: 'Título', titleAccent: 'Palabras destacadas', subtitle: 'Subtítulo', description: 'Descripción',
  hero: 'Portada', about: 'Nosotros', services: 'Servicios', process: 'Cómo trabajamos', projects: 'Proyectos', team: 'Equipo',
  testimonials: 'Testimonios', faq: 'Preguntas frecuentes', contact: 'Contacto', footer: 'Pie de página',
  meta: 'Buscadores y redes', metadata: 'Buscadores y redes', seo: 'Buscadores y redes', sections: 'Secciones de la portada',
  settings: 'Configuración', navigation: 'Navegación', nav: 'Navegación', links: 'Enlaces', socialLinks: 'Redes sociales', socials: 'Redes sociales',
  label: 'Texto', href: 'Destino', url: 'URL', image: 'Imagen (URL)', imageUrl: 'Imagen (URL)', alt: 'Descripción de la imagen',
  enabled: 'Activar', visible: 'Mostrar', motionEnabled: 'Activar animaciones', order: 'Orden', sectionOrder: 'Orden de las secciones',
  button: 'Botón', primaryCta: 'Botón principal', secondaryCta: 'Botón secundario', primary: 'Principal', secondary: 'Secundario',
  cta: 'Llamada a la acción', stats: 'Cifras', items: 'Elementos', value: 'Valor', suffix: 'Sufijo', icon: 'Icono',
  kicker: 'Etiqueta', text: 'Texto', heading: 'Encabezado', body: 'Contenido', bullets: 'Puntos destacados', badges: 'Etiquetas',
  technologies: 'Tecnologías', technology: 'Tecnología', role: 'Cargo', author: 'Autor', company: 'Empresa',
  question: 'Pregunta', answer: 'Respuesta', email: 'Correo', phone: 'Teléfono', whatsapp: 'WhatsApp', whatsappUrl: 'Enlace de WhatsApp',
  discord: 'Discord', discordUrl: 'Enlace de Discord', location: 'Ubicación', copyright: 'Derechos reservados',
  siteTitle: 'Título de la web', siteDescription: 'Descripción de la web', ogImage: 'Imagen para compartir (URL)',
  availability: 'Disponibilidad', available: 'Disponible', status: 'Estado', accent: 'Color destacado', color: 'Color',
  headline: 'Titular', highlightedWord: 'Palabra destacada', marquee: 'Cinta animada', features: 'Características',
  number: 'Número', step: 'Paso', detail: 'Detalle', badge: 'Etiqueta', intro: 'Introducción', note: 'Nota',
  portfolio: 'Portafolio', ecosystem: 'Ecosistema Moon', community: 'Comunidad', partners: 'Aliados',
  titleLine1: 'Título · primera línea', titleLine2: 'Título · segunda línea', titleLine3: 'Título · tercera línea',
  imageAlt: 'Texto alternativo de imagen', canonicalUrl: 'URL canónica', keywords: 'Palabras clave',
  titlePrefix: 'Inicio del título', titleHighlight: 'Texto destacado del título', titleSuffix: 'Final del título',
  highlight: 'Texto destacado', seoTitle: 'Título para buscadores', seoDescription: 'Descripción para buscadores',
  primaryLabel: 'Texto del botón principal', secondaryLabel: 'Texto del botón secundario', orbitLabel: 'Texto de la órbita',
  disciplines: 'Especialidades · cinta animada', extras: 'Servicios adicionales', steps: 'Pasos', download: 'Aplicación',
  webUrl: 'Dashboard web (URL)', repository: 'Repositorio de GitHub', quote: 'Página de cotización', portal: 'Portal de clientes',
  announcement: 'Aviso destacado', motion: 'Animaciones', ctaTitle: 'Título de invitación', ctaDescription: 'Descripción de invitación',
  products: 'Enlaces del ecosistema Moon',
};

export function fieldLabel(key: string): string {
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

export function setContentAt(value: ContentValue, path: ContentPath, next: ContentValue): ContentValue {
  if (!path.length) return next;
  const [head, ...tail] = path;
  if (Array.isArray(value) && typeof head === 'number') {
    const copy = [...value];
    copy[head] = setContentAt(copy[head], tail, next);
    return copy;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const key = String(head);
    return { ...value, [key]: setContentAt(value[key], tail, next) };
  }
  return value;
}

export function newEntry(template: ContentValue): ContentValue {
  if (typeof template === 'string') return '';
  if (typeof template === 'number') return template;
  if (typeof template === 'boolean') return template;
  if (Array.isArray(template)) return [];
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([key, val]) => [key,
      key === 'id' ? `item-${crypto.randomUUID()}` : key === 'icon' ? val : key === 'href' ? '#contacto' : newEntry(val),
    ]));
  }
  return '';
}

