import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, writeBatch, runTransaction,
  serverTimestamp, Timestamp, type DocumentData, type Transaction,
} from 'firebase/firestore';
import { auth, db, logActivity } from '@/lib/firebase';
import { ROLE_PERMISSIONS, type Permission, type UserRole } from '@/types';
import { esFechaTramite, limpiarBorradorDocumento, normalizarDocumento, type BorradorDocumentoTramite, type DocumentoTramite } from './tramitesDocumentoModelo';
export { crearBorradorDocumento, validarBorradorDocumento, normalizarDocumento } from './tramitesDocumentoModelo';
export type { BorradorDocumentoTramite, DocumentoTramite, PlantillaDocumentoTramite } from './tramitesDocumentoModelo';

// ─── Trámites del personal ───────────────────────────────────────────────────
// El catálogo (`tramites_tipos`) lo personalizan el CEO y Administración; las
// solicitudes (`tramites_solicitudes`) las crea cada persona y las resuelve
// quien tenga permiso. Las reglas de Firestore repiten estos límites.

export type CampoTipo = 'texto' | 'parrafo' | 'fecha' | 'numero' | 'opcion';
export type IconoTramite = 'vacaciones' | 'permiso' | 'tarjeta' | 'datos' | 'constancia' | 'equipos' | 'dinero' | 'general';
export type EstadoTramite = 'pendiente' | 'en_revision' | 'aprobado' | 'rechazado' | 'cancelado';

export interface CampoTramite { id: string; etiqueta: string; tipo: CampoTipo; requerido: boolean; opciones?: string[]; ayuda?: string }
export interface RespuestaCampoTramite { id: string; etiqueta: string; tipo: CampoTipo; valor: string }
export interface TipoTramite {
  id: string; nombre: string; descripcion: string; icono: IconoTramite; campos: CampoTramite[];
  activo: boolean; soloCeo: boolean; orden: number; updatedAt?: Date;
}
export interface SolicitudTramite {
  id: string; tipoId: string; tipoNombre: string;
  solicitanteUid: string; solicitanteNombre: string; solicitanteRol: string;
  respuestas: Record<string, string>; estado: EstadoTramite; comentario: string; soloCeo: boolean;
  camposRespuesta?: RespuestaCampoTramite[]; documento?: DocumentoTramite;
  resueltoPor?: string; resueltoPorNombre?: string; resueltoAt?: Date; createdAt: Date; updatedAt: Date;
}

export const ICONOS_TRAMITE: IconoTramite[] = ['vacaciones', 'permiso', 'tarjeta', 'datos', 'constancia', 'equipos', 'dinero', 'general'];
export const TIPOS_CAMPO: { valor: CampoTipo; etiqueta: string }[] = [
  { valor: 'texto', etiqueta: 'Texto corto' }, { valor: 'parrafo', etiqueta: 'Párrafo' },
  { valor: 'fecha', etiqueta: 'Fecha' }, { valor: 'numero', etiqueta: 'Número' }, { valor: 'opcion', etiqueta: 'Lista de opciones' },
];
export const ESTADOS_TRAMITE: Record<EstadoTramite, string> = {
  pendiente: 'Pendiente', en_revision: 'En revisión', aprobado: 'Aprobado', rechazado: 'Rechazado', cancelado: 'Cancelado',
};
export const LIMITES = { nombre: 80, descripcion: 400, campos: 12, etiqueta: 80, opciones: 15, opcion: 60, respuesta: 1500, comentario: 1000 };

const campo = (id: string, etiqueta: string, tipo: CampoTipo, requerido: boolean, extra: Partial<CampoTramite> = {}): CampoTramite => ({ id, etiqueta, tipo, requerido, ...extra });

/** Trámites base. Se cargan una sola vez, cuando quien gestiona abre un catálogo vacío. */
export const TRAMITES_BASE: TipoTramite[] = [
  { id: 'vacaciones', nombre: 'Vacaciones', icono: 'vacaciones', orden: 10, activo: true, soloCeo: false,
    descripcion: 'Solicita días de descanso. Indica el periodo y quién cubre tus pendientes.',
    campos: [campo('desde', 'Primer día de vacaciones', 'fecha', true), campo('hasta', 'Último día de vacaciones', 'fecha', true),
      campo('reemplazo', '¿Quién cubre tus pendientes?', 'texto', false), campo('comentario', 'Comentario', 'parrafo', false)] },
  { id: 'permiso', nombre: 'Permiso o licencia', icono: 'permiso', orden: 20, activo: true, soloCeo: false,
    descripcion: 'Ausencias puntuales: citas médicas, estudios, trámites personales o duelo.',
    campos: [campo('motivo', 'Tipo de permiso', 'opcion', true, { opciones: ['Personal', 'Médico', 'Estudios', 'Duelo', 'Otro'] }),
      campo('fecha', 'Fecha', 'fecha', true), campo('duracion', 'Duración', 'texto', true, { ayuda: 'Por ejemplo: 3 horas, medio día, 2 días.' }),
      campo('detalle', 'Detalle', 'parrafo', true)] },
  { id: 'tarjeta', nombre: 'Tarjeta Moon Studios', icono: 'tarjeta', orden: 30, activo: true, soloCeo: false,
    descripcion: 'Emisión, reposición o actualización de tu credencial de Moon Studios.',
    campos: [campo('gestion', 'Gestión', 'opcion', true, { opciones: ['Primera emisión', 'Reposición por pérdida', 'Reposición por daño', 'Actualizar datos de la tarjeta'] }),
      campo('entrega', 'Formato', 'opcion', true, { opciones: ['Digital (PDF)', 'Impresa'] }), campo('detalle', 'Detalle', 'parrafo', false)] },
  { id: 'datos-personal', nombre: 'Actualización de datos del personal', icono: 'datos', orden: 40, activo: true, soloCeo: false,
    descripcion: 'Corrige o actualiza un dato de tu ficha de personal.',
    campos: [campo('dato', 'Dato a corregir', 'opcion', true, { opciones: ['Nombre', 'Teléfono', 'Correo personal', 'Dirección', 'Contacto de emergencia', 'Fecha de nacimiento', 'Otro'] }),
      campo('actual', 'Valor actual', 'texto', false), campo('nuevo', 'Valor correcto', 'texto', true), campo('sustento', 'Comentario o sustento', 'parrafo', false)] },
  { id: 'constancia', nombre: 'Constancia laboral', icono: 'constancia', orden: 50, activo: true, soloCeo: true,
    descripcion: 'Documento emitido por la dirección que acredita tu vínculo con Moon Studios.',
    campos: [campo('proposito', 'Para qué la necesitas', 'opcion', true, { opciones: ['Trámite bancario', 'Visa o viaje', 'Estudios', 'Otro'] }),
      campo('dirigido', 'Dirigida a', 'texto', false, { ayuda: 'Entidad o persona, si corresponde.' }),
      campo('formato', 'Formato', 'opcion', true, { opciones: ['Digital (PDF)', 'Impresa'] })] },
  { id: 'equipos-accesos', nombre: 'Equipos y accesos', icono: 'equipos', orden: 60, activo: true, soloCeo: false,
    descripcion: 'Hardware, licencias, accesos a plataformas o soporte técnico.',
    campos: [campo('necesidad', 'Qué necesitas', 'opcion', true, { opciones: ['Equipo o hardware', 'Software o licencia', 'Acceso a una plataforma', 'Soporte técnico'] }),
      campo('urgencia', 'Urgencia', 'opcion', true, { opciones: ['Normal', 'Alta'] }), campo('detalle', 'Detalle', 'parrafo', true)] },
];

// ─── Límites de Administración ───────────────────────────────────────────────
// Documento `moon_acceso/administracion`: solo el CEO lo escribe. Define qué
// módulos ve Administración y qué puede hacer con los trámites.

export type ModuloDelegable = 'admin' | 'roles' | 'webs' | 'diseno' | 'secretaria' | 'programacion' | 'conferencias';
export interface AccesoAdministracion {
  modulos: Record<ModuloDelegable, boolean>;
  tramites: { resolver: boolean; catalogo: boolean };
  updatedAt?: Date; updatedByName?: string;
}
export const MODULOS_DELEGABLES: { clave: ModuloDelegable; nombre: string; detalle: string; ruta: string }[] = [
  { clave: 'admin', nombre: 'Panel Admin y Usuarios', detalle: 'Registros de actividad, auditoría, estadísticas y directorio de cuentas.', ruta: '/dashboard/admin' },
  { clave: 'roles', nombre: 'Gestión de roles', detalle: 'Directorio por rol y matriz de permisos. Cambiar roles sigue siendo del CEO.', ruta: '/dashboard/roles' },
  { clave: 'webs', nombre: 'Webs', detalle: 'Contenido de la web oficial y portal de clientes.', ruta: '/dashboard/webs' },
  { clave: 'diseno', nombre: 'Diseño', detalle: 'Biblioteca de recursos y entregas del área de diseño.', ruta: '/dashboard/diseno' },
  { clave: 'secretaria', nombre: 'Secretaría', detalle: 'Documentos, actas y su flujo de revisión.', ruta: '/dashboard/secretaria' },
  { clave: 'programacion', nombre: 'Programación', detalle: 'Proyectos, versiones y tareas de desarrollo.', ruta: '/dashboard/programacion' },
  { clave: 'conferencias', nombre: 'Conferencias', detalle: 'Crear eventos, invitar, controlar el acceso y moderar las salas.', ruta: '/dashboard/conferencias' },
];
/** Lo que nunca se delega: queda solo para el CEO. */
export const SOLO_CEO = ['Panel CEO y cambio de roles', 'Contabilidad', 'Eliminar cuentas', 'Dirección electoral', 'Estos límites de acceso', 'Trámites marcados «Solo CEO»'];

export const accesoPorDefecto = (): AccesoAdministracion => ({
  modulos: { admin: true, roles: true, webs: true, diseno: false, secretaria: false, programacion: false, conferencias: true },
  tramites: { resolver: true, catalogo: true },
});

/** Permisos reales de Administración según los límites vigentes. */
export function permisosAdministracion(acceso: AccesoAdministracion): Permission[] {
  const modulos = (Object.keys(acceso.modulos) as ModuloDelegable[]).filter(clave => acceso.modulos[clave]);
  return [...modulos, ...(acceso.tramites.resolver || acceso.tramites.catalogo ? ['tramites_gestion' as const] : []), 'acceso'];
}
export const permisosDeRol = (rol: UserRole, acceso: AccesoAdministracion | null): Permission[] =>
  rol === 'Administración' ? permisosAdministracion(acceso ?? accesoPorDefecto()) : ROLE_PERMISSIONS[rol] ?? [];

const fecha = (valor: unknown): Date | undefined => valor instanceof Timestamp ? valor.toDate() : valor instanceof Date && Number.isFinite(valor.getTime()) ? valor : undefined;
const bool = (valor: unknown, defecto: boolean) => typeof valor === 'boolean' ? valor : defecto;

export function normalizarAcceso(data: DocumentData | undefined): AccesoAdministracion {
  const base = accesoPorDefecto();
  if (!data) return base;
  const modulos = { ...base.modulos };
  for (const clave of Object.keys(modulos) as ModuloDelegable[]) modulos[clave] = bool(data.modulos?.[clave], base.modulos[clave]);
  return {
    modulos,
    tramites: { resolver: bool(data.tramites?.resolver, true), catalogo: bool(data.tramites?.catalogo, true) },
    updatedAt: fecha(data.updatedAt), updatedByName: typeof data.updatedByName === 'string' ? data.updatedByName : undefined,
  };
}

export function escucharAcceso(listo: (acceso: AccesoAdministracion) => void, error?: (e: Error) => void) {
  return onSnapshot(doc(db, 'moon_acceso', 'administracion'), snap => listo(normalizarAcceso(snap.exists() ? snap.data() : undefined)), error);
}

export async function guardarAcceso(acceso: AccesoAdministracion, uid: string, nombre: string) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'moon_acceso', 'administracion'), {
    modulos: acceso.modulos, tramites: acceso.tramites,
    updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: nombre.slice(0, 120),
  });
  await batch.commit();
  await logActivity('ADMIN_ACCESS_UPDATED', { modulos: acceso.modulos, tramites: acceso.tramites }, uid, nombre, { module: 'admin', level: 'warning', description: 'Actualizó los límites de acceso de Administración' }).catch(console.error);
}

// ─── Identificador visible de cada persona ───────────────────────────────────
/** Código corto que también aparece en la credencial (REF: MS-XXXXXXXX). */
export const codigoEmpleado = (uid: string) => `MS-${uid.slice(0, 8).toUpperCase()}`;

// ─── Lectura ─────────────────────────────────────────────────────────────────
function normalizarTipo(id: string, d: DocumentData): TipoTramite {
  const campos: CampoTramite[] = Array.isArray(d.campos) ? d.campos.filter((c: unknown): c is CampoTramite => !!c && typeof (c as CampoTramite).id === 'string').map((c: CampoTramite) => ({
    id: c.id, etiqueta: String(c.etiqueta ?? ''), tipo: (TIPOS_CAMPO.some(t => t.valor === c.tipo) ? c.tipo : 'texto'), requerido: !!c.requerido,
    opciones: Array.isArray(c.opciones) ? c.opciones.map(String) : undefined, ayuda: typeof c.ayuda === 'string' ? c.ayuda : undefined,
  })) : [];
  return {
    id, nombre: String(d.nombre ?? ''), descripcion: String(d.descripcion ?? ''), icono: ICONOS_TRAMITE.includes(d.icono) ? d.icono : 'general',
    campos, activo: d.activo !== false, soloCeo: d.soloCeo === true, orden: typeof d.orden === 'number' ? d.orden : 999, updatedAt: fecha(d.updatedAt),
  };
}
function normalizarSolicitud(id: string, d: DocumentData): SolicitudTramite {
  return {
    id, tipoId: String(d.tipoId ?? ''), tipoNombre: String(d.tipoNombre ?? 'Trámite'),
    solicitanteUid: String(d.solicitanteUid ?? ''), solicitanteNombre: String(d.solicitanteNombre ?? ''), solicitanteRol: String(d.solicitanteRol ?? ''),
    respuestas: d.respuestas && typeof d.respuestas === 'object' ? Object.fromEntries(Object.entries(d.respuestas).map(([k, v]) => [k, String(v ?? '')])) : {},
    camposRespuesta: Array.isArray(d.camposRespuesta) ? d.camposRespuesta.filter((c: unknown): c is RespuestaCampoTramite => !!c && typeof c === 'object' && typeof (c as RespuestaCampoTramite).id === 'string' && typeof (c as RespuestaCampoTramite).etiqueta === 'string' && TIPOS_CAMPO.some(t => t.valor === (c as RespuestaCampoTramite).tipo) && typeof (c as RespuestaCampoTramite).valor === 'string').map((c: RespuestaCampoTramite) => ({ id: c.id, etiqueta: c.etiqueta, tipo: c.tipo, valor: c.valor })) : undefined,
    documento: normalizarDocumento(d.documento),
    estado: (d.estado in ESTADOS_TRAMITE ? d.estado : 'pendiente') as EstadoTramite, comentario: String(d.comentario ?? ''), soloCeo: d.soloCeo === true,
    resueltoPor: d.resueltoPor, resueltoPorNombre: d.resueltoPorNombre, resueltoAt: fecha(d.resueltoAt),
    createdAt: fecha(d.createdAt) ?? new Date(0), updatedAt: fecha(d.updatedAt) ?? fecha(d.createdAt) ?? new Date(0),
  };
}

export function escucharTipos(listo: (tipos: TipoTramite[]) => void, error: (e: Error) => void) {
  return onSnapshot(collection(db, 'tramites_tipos'), snap => listo(snap.docs.map(d => normalizarTipo(d.id, d.data())).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))), error);
}
/** Quien revisa ve todo; los demás, solo lo suyo (así lo exigen las reglas). */
export function escucharSolicitudes(uid: string, todas: boolean, listo: (items: SolicitudTramite[]) => void, error: (e: Error) => void) {
  const fuente = todas ? collection(db, 'tramites_solicitudes') : query(collection(db, 'tramites_solicitudes'), where('solicitanteUid', '==', uid));
  return onSnapshot(fuente, snap => listo(snap.docs.map(d => normalizarSolicitud(d.id, d.data())).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())), error);
}

// ─── Escritura ───────────────────────────────────────────────────────────────
export interface Actor { uid: string; nombre: string; rol: UserRole }

const datosTipo = (t: TipoTramite) => ({
  nombre: t.nombre.trim(), descripcion: t.descripcion.trim(), icono: t.icono, activo: t.activo, soloCeo: t.soloCeo, orden: Math.round(t.orden),
  campos: t.campos.map(c => ({ id: c.id, etiqueta: c.etiqueta.trim(), tipo: c.tipo, requerido: c.requerido,
    ...(c.tipo === 'opcion' ? { opciones: (c.opciones ?? []).map(o => o.trim()).filter(Boolean) } : {}), ...(c.ayuda?.trim() ? { ayuda: c.ayuda.trim() } : {}) })),
});

export function validarTipo(t: TipoTramite): string | null {
  if (!t || typeof t.nombre !== 'string' || typeof t.descripcion !== 'string' || !Array.isArray(t.campos)) return 'Revisa los datos del trámite.';
  if (!/^[a-z0-9-]{2,40}$/.test(t.id)) return 'El identificador del trámite no es válido.';
  if (t.nombre.trim().length < 3 || t.nombre.trim().length > LIMITES.nombre) return `El nombre debe tener entre 3 y ${LIMITES.nombre} caracteres.`;
  if (t.descripcion.length > LIMITES.descripcion) return `La descripción admite hasta ${LIMITES.descripcion} caracteres.`;
  if (!ICONOS_TRAMITE.includes(t.icono) || typeof t.activo !== 'boolean' || typeof t.soloCeo !== 'boolean' || !Number.isFinite(t.orden) || t.orden < 0 || t.orden > 999) return 'Revisa las opciones del trámite.';
  if (!t.campos.length) return 'Agrega al menos un campo al formulario.';
  if (t.campos.length > LIMITES.campos) return `Un trámite admite hasta ${LIMITES.campos} campos.`;
  const ids = new Set<string>();
  for (const c of t.campos) {
    if (!c || typeof c.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(c.id) || ids.has(c.id)) return 'Cada campo necesita un identificador válido y único.';
    ids.add(c.id);
    if (typeof c.etiqueta !== 'string' || !TIPOS_CAMPO.some(tipo => tipo.valor === c.tipo) || typeof c.requerido !== 'boolean') return 'Revisa los campos del formulario.';
    if (!c.etiqueta.trim()) return 'Cada campo necesita un nombre.';
    if (c.etiqueta.length > LIMITES.etiqueta) return `El nombre de un campo admite hasta ${LIMITES.etiqueta} caracteres.`;
    if (c.ayuda !== undefined && (typeof c.ayuda !== 'string' || c.ayuda.length > LIMITES.descripcion)) return 'La ayuda de cada campo admite hasta 400 caracteres.';
    if (c.tipo === 'opcion') {
      if (!Array.isArray(c.opciones) || c.opciones.some(o => typeof o !== 'string')) return `Revisa las opciones de «${c.etiqueta}».`;
      const opciones = (c.opciones ?? []).map(o => o.trim()).filter(Boolean);
      if (opciones.length < 2) return `«${c.etiqueta}» necesita al menos dos opciones.`;
      if (opciones.length > LIMITES.opciones || opciones.some(o => o.length > LIMITES.opcion)) return `Revisa las opciones de «${c.etiqueta}».`;
      if (new Set(opciones).size !== opciones.length) return `Las opciones de «${c.etiqueta}» no pueden repetirse.`;
    }
  }
  return null;
}

export const idDesdeNombre = (nombre: string) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'tramite';

export async function guardarTipo(tipo: TipoTramite, nuevo: boolean, actor: Actor) {
  const error = validarTipo(tipo); if (error) throw new Error(error);
  const ref = doc(db, 'tramites_tipos', tipo.id);
  await runTransaction(db, async tx => {
    const actual = await tx.get(ref);
    const perfil = await perfilActual(tx, actor.uid);
    const acceso = await tx.get(doc(db, 'moon_acceso', 'administracion'));
    validarSesion(actor.uid);
    if (perfil.rol !== 'CEO' && !(perfil.rol === 'Administración' && normalizarAcceso(acceso.exists() ? acceso.data() : undefined).tramites.catalogo)) throw new Error('No tienes permiso para editar el catálogo de trámites.');
    if (nuevo && actual.exists()) throw new Error('Ya existe un trámite con ese identificador. Cambia el nombre.');
    if (!nuevo && !actual.exists()) throw new Error('Este trámite ya no existe.');
    if (!nuevo && perfil.rol !== 'CEO' && actual.data()?.soloCeo !== tipo.soloCeo) throw new Error('Solo el CEO puede cambiar quién aprueba este trámite.');
    const sello = { updatedAt: serverTimestamp(), updatedBy: actor.uid };
    if (nuevo) tx.set(ref, { ...datosTipo(tipo), ...sello, createdAt: serverTimestamp(), createdBy: actor.uid });
    else { const previo = actual.data() ?? {}; tx.set(ref, { ...datosTipo(tipo), ...sello, createdAt: previo.createdAt, createdBy: previo.createdBy }); }
  });
  await logActivity(nuevo ? 'TRAMITE_TYPE_CREATED' : 'TRAMITE_TYPE_UPDATED', { tipoId: tipo.id }, actor.uid, actor.nombre, { module: 'admin', description: `${nuevo ? 'Creó' : 'Actualizó'} el trámite «${tipo.nombre}»` }).catch(console.error);
}

export async function cargarTramitesBase(actor: Actor) {
  // Una transacción evita que dos administradores se pisen al inicializar y
  // nunca reemplaza un formulario ya personalizado, aunque esté desactivado.
  await runTransaction(db, async tx => {
    const perfil = await perfilActual(tx, actor.uid);
    const acceso = await tx.get(doc(db, 'moon_acceso', 'administracion'));
    if (perfil.rol !== 'CEO' && !(perfil.rol === 'Administración' && normalizarAcceso(acceso.exists() ? acceso.data() : undefined).tramites.catalogo)) throw new Error('No tienes permiso para inicializar el catálogo.');
    const actuales = await Promise.all(TRAMITES_BASE.map(tipo => tx.get(doc(db, 'tramites_tipos', tipo.id))));
    validarSesion(actor.uid);
    TRAMITES_BASE.forEach((tipo, index) => {
      if (!actuales[index].exists()) tx.set(doc(db, 'tramites_tipos', tipo.id), { ...datosTipo(tipo), createdAt: serverTimestamp(), createdBy: actor.uid, updatedAt: serverTimestamp(), updatedBy: actor.uid });
    });
  });
}

export function validarRespuestas(tipo: TipoTramite, respuestas: Record<string, string>): string | null {
  if (!respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas)) return 'Revisa las respuestas del formulario.';
  if (Object.keys(respuestas).some(key => !tipo.campos.some(c => c.id === key))) return 'El formulario cambió. Abre de nuevo el trámite para revisar sus campos.';
  for (const c of tipo.campos) {
    if (respuestas[c.id] !== undefined && typeof respuestas[c.id] !== 'string') return `Revisa «${c.etiqueta}».`;
    const valor = (respuestas[c.id] ?? '').trim();
    if (c.requerido && !valor) return `Completa «${c.etiqueta}».`;
    if (valor.length > LIMITES.respuesta) return `«${c.etiqueta}» es demasiado largo.`;
    if (valor && c.tipo === 'numero' && !Number.isFinite(Number(valor))) return `«${c.etiqueta}» debe ser un número.`;
    if (valor && c.tipo === 'fecha' && !esFechaTramite(valor)) return `«${c.etiqueta}» debe ser una fecha válida.`;
    if (valor && c.tipo === 'opcion' && !(c.opciones ?? []).includes(valor)) return `Elige una opción válida en «${c.etiqueta}».`;
  }
  const desde = respuestas.desde, hasta = respuestas.hasta;
  if (tipo.id === 'vacaciones' && desde && hasta && hasta < desde) return 'El último día no puede ser anterior al primero.';
  return null;
}

/** A quién avisar de una solicitud nueva: el CEO y, si puede resolverla, Administración. */
export async function revisoresPara(tipo: TipoTramite): Promise<string[]> {
  try {
    const [personas, acceso] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', 'in', ['CEO', 'Administración']))),
      getDoc(doc(db, 'moon_acceso', 'administracion')),
    ]);
    const resuelveAdmin = !tipo.soloCeo && normalizarAcceso(acceso.exists() ? acceso.data() : undefined).tramites.resolver;
    return personas.docs.filter(d => d.data().isActive !== false && (d.data().role === 'CEO' || resuelveAdmin)).map(d => d.id).slice(0, 40);
  } catch (error) {
    console.error('[tramites] revisores', error);
    return [];
  }
}

function validarSesion(uid: string) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('La sesión cambió. Vuelve a abrir el panel de trámites.');
}

function nombrePerfil(data: DocumentData): string {
  const nombre = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  const correo = typeof data.email === 'string' ? data.email.trim() : '';
  return (nombre || correo || 'Equipo Moon').slice(0, 120);
}

function perfilCorporativo(data: DocumentData | undefined): { nombre: string; rol: UserRole } {
  if (!data || (Object.prototype.hasOwnProperty.call(data, 'isActive') && data.isActive !== true)
    || typeof data.role !== 'string' || !Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, data.role)) {
    throw new Error('La persona necesita una cuenta activa del equipo de Moon Studios.');
  }
  return { nombre: nombrePerfil(data), rol: data.role as UserRole };
}

async function perfilActual(tx: Transaction, uid: string) {
  validarSesion(uid);
  const snap = await tx.get(doc(db, 'users', uid));
  validarSesion(uid);
  return perfilCorporativo(snap.exists() ? snap.data() : undefined);
}

async function comprobarResolucion(tx: Transaction, solicitud: SolicitudTramite, actor: Actor) {
  const perfil = await perfilActual(tx, actor.uid);
  const acceso = await tx.get(doc(db, 'moon_acceso', 'administracion'));
  validarSesion(actor.uid);
  const administra = perfil.rol === 'Administración' && normalizarAcceso(acceso.exists() ? acceso.data() : undefined).tramites.resolver;
  if (perfil.rol !== 'CEO' && (!administra || solicitud.soloCeo || solicitud.solicitanteUid === actor.uid)) {
    throw new Error('No tienes permiso para resolver esta solicitud.');
  }
  return perfil;
}

function documentoParaGuardar(solicitud: SolicitudTramite, borrador: BorradorDocumentoTramite, destinatario: { nombre: string }, emisor: { nombre: string }, actorUid: string) {
  const datos = limpiarBorradorDocumento(borrador);
  return {
    ...datos, version: 1, folio: `MS-DOC-${solicitud.id.toUpperCase()}`, solicitudId: solicitud.id,
    destinatarioUid: solicitud.solicitanteUid, destinatarioNombre: destinatario.nombre, destinatarioCodigo: codigoEmpleado(solicitud.solicitanteUid),
    emitidoPor: actorUid, emitidoPorNombre: emisor.nombre, emitidoAt: serverTimestamp(),
  };
}

// ─── Consulta pública «Información» (web oficial) ───────────────────────────
// La tarjeta y la constancia dejan un registro público mínimo en
// moon_verificacion/{código}_{plantilla}: solo lo impreso en el documento.
// Las reglas exigen que sea copia exacta de una emisión de la misma operación.
export const PLANTILLAS_VERIFICABLES = ['credencial', 'constancia'] as const;
export type EstadoVerificacion = { estado: 'vigente' | 'baja'; solicitudId: string; bajaAt?: Date } | null;
export const idVerificacion = (codigo: string, plantilla: string) => `${codigo}_${plantilla}`;
const esVerificable = (plantilla: string) => (PLANTILLAS_VERIFICABLES as readonly string[]).includes(plantilla);

function registrarVerificacion(tx: Transaction, emitido: ReturnType<typeof documentoParaGuardar>) {
  if (!esVerificable(emitido.plantilla)) return;
  tx.set(doc(db, 'moon_verificacion', idVerificacion(emitido.destinatarioCodigo, emitido.plantilla)), {
    codigo: emitido.destinatarioCodigo, plantilla: emitido.plantilla, titulo: emitido.titulo, nombre: emitido.destinatarioNombre,
    cargo: emitido.cargo, area: emitido.area, folio: emitido.folio, vigenteHasta: emitido.vigenteHasta,
    emitidoAt: serverTimestamp(), estado: 'vigente', solicitudId: emitido.solicitudId,
  });
}

export async function leerVerificacion(codigo: string, plantilla: string): Promise<EstadoVerificacion> {
  const snap = await getDoc(doc(db, 'moon_verificacion', idVerificacion(codigo, plantilla)));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { estado: d.estado === 'baja' ? 'baja' : 'vigente', solicitudId: String(d.solicitudId ?? ''), bajaAt: fecha(d.bajaAt) };
}

/** Publica en la consulta un documento emitido antes de que existiera (copia exacta, misma fecha). */
export async function publicarVerificacion(s: SolicitudTramite, actor: Actor) {
  const ref = doc(db, 'tramites_solicitudes', s.id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esta solicitud ya no existe.');
    const actual = normalizarSolicitud(snap.id, snap.data());
    // Se usan los valores tal como están guardados: la fecha de emisión debe coincidir al nanosegundo.
    const original = snap.data().documento;
    if (actual.estado !== 'aprobado' || !actual.documento || !original) throw new Error('La solicitud no tiene un documento emitido.');
    if (!esVerificable(original.plantilla)) throw new Error('Solo la tarjeta y la constancia aparecen en la consulta pública.');
    const vref = doc(db, 'moon_verificacion', idVerificacion(original.destinatarioCodigo, original.plantilla));
    const previo = await tx.get(vref);
    await comprobarResolucion(tx, actual, actor);
    if (previo.exists()) {
      const antes = previo.data().emitidoAt, ahora = original.emitidoAt;
      if (!(antes instanceof Timestamp) || !(ahora instanceof Timestamp) || antes.toMillis() >= ahora.toMillis())
        throw new Error(previo.data().solicitudId === s.id ? 'Este documento ya figura en la consulta pública.' : 'La consulta ya muestra una emisión más reciente de este documento.');
    }
    validarSesion(actor.uid);
    tx.set(vref, {
      codigo: original.destinatarioCodigo, plantilla: original.plantilla, titulo: original.titulo, nombre: original.destinatarioNombre,
      cargo: original.cargo, area: original.area, folio: original.folio, vigenteHasta: original.vigenteHasta,
      emitidoAt: original.emitidoAt, estado: 'vigente', solicitudId: s.id,
    });
  });
  await logActivity('TRAMITE_DOCUMENT_PUBLISHED', { solicitudId: s.id }, actor.uid, actor.nombre, { module: 'admin', description: `Publicó en la consulta pública: «${s.documento?.titulo ?? s.tipoNombre}» de ${s.solicitanteNombre}` }).catch(console.error);
}

/** Deja de validar el documento en la consulta pública (no lo borra: informa la baja). */
export async function darDeBajaVerificacion(s: SolicitudTramite, actor: Actor) {
  if (!s.documento || !esVerificable(s.documento.plantilla)) throw new Error('Este documento no aparece en la consulta pública.');
  const ref = doc(db, 'moon_verificacion', idVerificacion(s.documento.destinatarioCodigo, s.documento.plantilla));
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    await comprobarResolucion(tx, s, actor);
    if (!snap.exists() || snap.data().solicitudId !== s.id) throw new Error('La consulta pública ya muestra otra emisión de este documento.');
    if (snap.data().estado !== 'vigente') throw new Error('Este documento ya está dado de baja.');
    validarSesion(actor.uid);
    tx.update(ref, { estado: 'baja', bajaAt: serverTimestamp() });
  });
  await logActivity('TRAMITE_DOCUMENT_REVOKED', { solicitudId: s.id }, actor.uid, actor.nombre, { module: 'admin', level: 'warning', description: `Dio de baja en la consulta pública: «${s.documento.titulo}» de ${s.solicitanteNombre}` }).catch(console.error);
}

/** Elimina una solicitud ya resuelta. Si su tarjeta o constancia figura vigente en la consulta pública, la da de baja en la misma operación. */
export async function eliminarTramite(s: SolicitudTramite, actor: Actor) {
  const ref = doc(db, 'tramites_solicitudes', s.id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esta solicitud ya no existe.');
    const actual = normalizarSolicitud(snap.id, snap.data());
    const d = actual.documento;
    const vref = d && esVerificable(d.plantilla) ? doc(db, 'moon_verificacion', idVerificacion(d.destinatarioCodigo, d.plantilla)) : null;
    const verificacion = vref ? await tx.get(vref) : null;
    await comprobarResolucion(tx, actual, actor);
    if (!['aprobado', 'rechazado', 'cancelado'].includes(actual.estado)) throw new Error('Solo se eliminan las solicitudes ya resueltas o canceladas.');
    validarSesion(actor.uid);
    if (vref && verificacion?.exists() && verificacion.data().solicitudId === s.id && verificacion.data().estado === 'vigente')
      tx.update(vref, { estado: 'baja', bajaAt: serverTimestamp() });
    tx.delete(ref);
  });
  await logActivity('TRAMITE_DELETED', { solicitudId: s.id, estado: s.estado }, actor.uid, actor.nombre, { module: 'admin', level: 'warning', description: `Eliminó «${s.tipoNombre}» de ${s.solicitanteNombre}` }).catch(console.error);
}

/** El catálogo y la identidad se vuelven a leer dentro de la misma transacción. */
export async function solicitarTramite(tipo: TipoTramite, respuestas: Record<string, string>, actor: Actor) {
  const ref = doc(collection(db, 'tramites_solicitudes'));
  await runTransaction(db, async tx => {
    const actual = await tx.get(doc(db, 'tramites_tipos', tipo.id));
    const perfil = await perfilActual(tx, actor.uid);
    if (!actual.exists()) throw new Error('Este trámite ya no está disponible. Elige otro del catálogo.');
    const vigente = normalizarTipo(actual.id, actual.data());
    if (!vigente.activo) throw new Error('Este trámite está desactivado. Elige otro del catálogo.');
    const errorTipo = validarTipo(vigente); if (errorTipo) throw new Error('El formulario necesita una revisión de Administración antes de recibir solicitudes.');
    const error = validarRespuestas(vigente, respuestas); if (error) throw new Error(error);
    const camposRespuesta = vigente.campos.map(c => ({ id: c.id, etiqueta: c.etiqueta, tipo: c.tipo, valor: (respuestas[c.id] ?? '').trim() }));
    const limpias = Object.fromEntries(camposRespuesta.map(c => [c.id, c.valor]));
    validarSesion(actor.uid);
    tx.set(ref, {
      tipoId: vigente.id, tipoNombre: vigente.nombre, solicitanteUid: actor.uid, solicitanteNombre: perfil.nombre, solicitanteRol: perfil.rol,
      respuestas: limpias, camposRespuesta, estado: 'pendiente', comentario: '', soloCeo: vigente.soloCeo, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
  // La campana escucha el registro confirmado: no necesita copias por persona.
  return ref.id;
}

export async function cancelarTramite(id: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para cancelar tu solicitud.');
  await runTransaction(db, async tx => {
    const ref = doc(db, 'tramites_solicitudes', id), snap = await tx.get(ref);
    await perfilActual(tx, uid);
    if (!snap.exists()) throw new Error('Esta solicitud ya no existe.');
    const solicitud = normalizarSolicitud(snap.id, snap.data());
    if (solicitud.solicitanteUid !== uid) throw new Error('Solo puedes cancelar tus propias solicitudes.');
    // Igual que las reglas: solo se cancela lo que nadie empezó a atender.
    if (solicitud.estado !== 'pendiente') throw new Error('La dirección ya está atendiendo esta solicitud y no se puede cancelar.');
    validarSesion(uid);
    tx.update(ref, { estado: 'cancelado', updatedAt: serverTimestamp() });
  });
}

export async function resolverTramite(s: SolicitudTramite, estado: Exclude<EstadoTramite, 'pendiente' | 'cancelado'>, comentario: string, actor: Actor, documento?: BorradorDocumentoTramite) {
  if (!['en_revision', 'aprobado', 'rechazado'].includes(estado)) throw new Error('El estado de revisión no es válido.');
  if (comentario.length > LIMITES.comentario) throw new Error(`El comentario admite hasta ${LIMITES.comentario} caracteres.`);
  if (estado === 'rechazado' && !comentario.trim()) throw new Error('Explica el motivo del rechazo: la persona lo verá.');
  if (documento && estado !== 'aprobado') throw new Error('El documento solo se entrega al aprobar la solicitud.');
  if (documento) limpiarBorradorDocumento(documento);
  await runTransaction(db, async tx => {
    const ref = doc(db, 'tramites_solicitudes', s.id), snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esta solicitud ya no existe.');
    const actual = normalizarSolicitud(snap.id, snap.data());
    const emisor = await comprobarResolucion(tx, actual, actor);
    const destinatarioSnap = documento ? await tx.get(doc(db, 'users', actual.solicitanteUid)) : undefined;
    if (actual.estado !== 'pendiente' && actual.estado !== 'en_revision') throw new Error('Otra persona ya resolvió o canceló esta solicitud. Actualiza la bandeja.');
    if (actual.estado === estado) throw new Error('Esta solicitud ya está en revisión.');
    if (snap.data().documento !== undefined) throw new Error('Esta solicitud ya tiene un documento emitido.');
    const destinatario = documento ? perfilCorporativo(destinatarioSnap?.exists() ? destinatarioSnap.data() : undefined) : undefined;
    validarSesion(actor.uid);
    const emitido = documento && destinatario ? documentoParaGuardar(actual, documento, destinatario, emisor, actor.uid) : undefined;
    tx.update(ref, {
      estado, comentario: comentario.trim(), resueltoPor: actor.uid, resueltoPorNombre: emisor.nombre,
      resueltoAt: serverTimestamp(), updatedAt: serverTimestamp(),
      ...(emitido ? { documento: emitido } : {}),
    });
    if (emitido) registrarVerificacion(tx, emitido);
  });
  await logActivity('TRAMITE_RESOLVED', { solicitudId: s.id, estado }, actor.uid, actor.nombre, { module: 'admin', description: `${ESTADOS_TRAMITE[estado]}: «${s.tipoNombre}» de ${s.solicitanteNombre}` }).catch(console.error);
}

/** Entrega un documento a una aprobación histórica que todavía no lo tenía. */
export async function emitirDocumentoTramite(s: SolicitudTramite, borrador: BorradorDocumentoTramite, actor: Actor) {
  limpiarBorradorDocumento(borrador);
  await runTransaction(db, async tx => {
    const ref = doc(db, 'tramites_solicitudes', s.id), snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esta solicitud ya no existe.');
    const actual = normalizarSolicitud(snap.id, snap.data());
    const emisor = await comprobarResolucion(tx, actual, actor);
    const destinatarioSnap = await tx.get(doc(db, 'users', actual.solicitanteUid));
    if (actual.estado !== 'aprobado') throw new Error('Aprueba la solicitud antes de emitir su documento.');
    if (snap.data().documento !== undefined) throw new Error('El documento ya fue emitido. Puedes descargar el original desde la solicitud.');
    const destinatario = perfilCorporativo(destinatarioSnap.exists() ? destinatarioSnap.data() : undefined);
    validarSesion(actor.uid);
    const emitido = documentoParaGuardar(actual, borrador, destinatario, emisor, actor.uid);
    tx.update(ref, { documento: emitido, updatedAt: serverTimestamp() });
    registrarVerificacion(tx, emitido);
  });
  await logActivity('TRAMITE_DOCUMENT_ISSUED', { solicitudId: s.id }, actor.uid, actor.nombre, { module: 'admin', description: `Emitió el documento de «${s.tipoNombre}»` }).catch(console.error);
}
