import type { InvitadoEntrada } from '@/lib/conferencias/tipos';

const CORREO = /[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/;

/** «Nombre, correo», «Nombre <correo>» o «Nombre ; correo», uno por línea. */
export function leerLista(texto: string): { invitados: InvitadoEntrada[]; errores: string[] } {
  const invitados: InvitadoEntrada[] = [], errores: string[] = [];
  const correos = new Set<string>();
  texto.split(/\r?\n/).map(l => l.trim()).forEach((linea, i) => {
    if (!linea) return;
    const email = linea.match(CORREO)?.[0];
    const nombre = linea.replace(CORREO, '').replace(/[<>,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!email) errores.push(`Línea ${i + 1}: falta el correo.`);
    else if (nombre.length < 2) errores.push(`Línea ${i + 1}: falta el nombre.`);
    else if (nombre.length > 120) errores.push(`Línea ${i + 1}: el nombre supera 120 caracteres.`);
    else if (email.length > 254) errores.push(`Línea ${i + 1}: el correo es demasiado largo.`);
    else if (correos.has(email.toLowerCase())) errores.push(`Línea ${i + 1}: el correo está repetido.`);
    else { correos.add(email.toLowerCase()); invitados.push({ nombre, email: email.toLowerCase(), rol: 'asistente' }); }
  });
  return { invitados, errores };
}

