// Moon Studios Conferencias — modelo compartido por el panel.
// Arquitectura y reparto de trabajo: docs/conferencias/ARQUITECTURA.md

export type Modalidad = 'virtual' | 'reunion' | 'presencial' | 'hibrido';
export type EstadoEvento = 'borrador' | 'programado' | 'cancelado' | 'finalizado';
export type RolEquipo = 'organizador' | 'moderador' | 'control';
export type RolInvitado = 'asistente' | 'ponente' | 'moderador';
export type EstadoInvitacion = 'pendiente' | 'aceptada' | 'revocada';

export interface Contadores { invitados: number; aceptadas: number; asistentes: number; ingresos: number }

export interface EventoConf {
  id: string;
  titulo: string; descripcion: string; modalidad: Modalidad;
  inicio: Date; fin: Date; lugar: string; instrucciones: string;
  capacidad: number; ingresoUnico: boolean; salaEspera: boolean; grabacionPermitida: boolean; aperturaMinutos: number;
  salaVirtual: boolean; equipo: Record<string, RolEquipo>; miembros: string[];
  estado: EstadoEvento; contadores: Contadores;
  creadoPorNombre: string; creadoAt: Date | null; actualizadoAt: Date | null;
  /** Sala de una edición de MOON FEST (mismo id que la edición); vacío en eventos privados. */
  festEventoId: string;
}

export interface InvitacionConf {
  id: string; eventoId: string; nombre: string; email: string; rol: RolInvitado; interno: boolean;
  estado: EstadoInvitacion; ownerUid: string | null; codigo: string; version: number;
  ingresos: number; primerIngresoAt: Date | null; ultimoIngresoAt: Date | null;
  envios: number; enviadaAt: Date | null; aceptadaAt: Date | null; creadaAt: Date | null;
}

export interface AsistenciaConf { id: string; invId: string; nombre: string; rol: RolInvitado; via: 'qr' | 'codigo' | 'sala'; at: Date | null; validadoPor: string | null }
export interface AvisoConf { id: string; titulo: string; mensaje: string; autorNombre: string; at: Date | null }
export interface EsperaConf { uid: string; estado: 'esperando' | 'admitido' | 'expulsado'; nombre: string; rol: string; at: Date | null }
export interface RegistroConf { id: string; accion: string; actorUid: string; objetivo?: string | null; motivo?: string; detalle?: string; at: Date | null }

/** Lo que llega del formulario del panel al crear o editar. */
export interface EventoEntrada {
  titulo: string; descripcion: string; modalidad: Modalidad; inicio: string; fin: string; lugar: string; instrucciones: string;
  capacidad: number; ingresoUnico: boolean; salaEspera: boolean; grabacionPermitida: boolean; aperturaMinutos: number;
  equipo?: Record<string, RolEquipo>;
}

export interface InvitadoEntrada { nombre?: string; email?: string; uid?: string; rol: RolInvitado }
export interface InvitacionCreada { id: string; nombre: string; email: string; interno: boolean; enlace: string }

export interface ResultadoValidacion {
  resultado: 'permitido' | 'denegado'; motivo?: string; mensaje: string;
  invitado?: { nombre: string; rol: RolInvitado; interno: boolean };
  ingresos?: number; ultimoIngresoAt?: string | null; apertura?: string | null;
}

export interface SalaLista { estado: 'listo'; url: string; token: string; rol: string; sala: string; grabacionPermitida: boolean }
export type RespuestaSala = SalaLista | { estado: 'esperando' };

export const MODALIDADES: Record<Modalidad, { nombre: string; detalle: string }> = {
  virtual: { nombre: 'Conferencia virtual', detalle: 'Sala de video propia; los ponentes presentan y el público escucha.' },
  reunion: { nombre: 'Reunión privada', detalle: 'Sala de video donde todos pueden hablar y compartir pantalla.' },
  presencial: { nombre: 'Evento presencial', detalle: 'Acceso en la puerta con QR o código.' },
  hibrido: { nombre: 'Evento híbrido', detalle: 'Puerta con QR y sala virtual a la vez.' },
};
export const ESTADOS_EVENTO: Record<EstadoEvento, string> = { borrador: 'Borrador', programado: 'Programado', cancelado: 'Cancelado', finalizado: 'Finalizado' };
export const ROLES_EQUIPO: Record<RolEquipo, { nombre: string; detalle: string }> = {
  organizador: { nombre: 'Organizador', detalle: 'Gestiona el evento, invita y publica avisos.' },
  moderador: { nombre: 'Moderador', detalle: 'Modera la sala y ve la asistencia.' },
  control: { nombre: 'Control de acceso', detalle: 'Solo escanea entradas en la puerta.' },
};
export const ROLES_INVITADO: Record<RolInvitado, string> = { asistente: 'Asistente', ponente: 'Ponente', moderador: 'Moderador' };
export const ESTADOS_INVITACION: Record<EstadoInvitacion, string> = { pendiente: 'Sin activar', aceptada: 'Activa', revocada: 'Revocada' };
export const VIAS: Record<AsistenciaConf['via'], string> = { qr: 'QR', codigo: 'Código', sala: 'Sala virtual' };

export const ACCIONES_AUDITORIA: Record<string, string> = {
  'evento-creado': 'Creó el evento', 'evento-editado': 'Editó el evento', 'evento-programado': 'Programó el evento',
  'evento-borrador': 'Volvió el evento a borrador', 'evento-cancelado': 'Canceló el evento', 'evento-finalizado': 'Finalizó el evento',
  'invitaciones-creadas': 'Creó invitaciones', 'invitacion-revocada': 'Revocó una invitación', 'invitacion-regenerada': 'Regeneró enlace y QR',
  'invitacion-enviada': 'Envió una invitación', 'invitacion-activada': 'Un invitado activó su enlace',
  'acceso-permitido': 'Ingreso permitido', 'acceso-denegado': 'Ingreso denegado', 'aviso-publicado': 'Publicó un aviso',
  'sala-admitir': 'Admitió en la sala', 'sala-rechazar': 'Rechazó en la sala', 'sala-expulsar': 'Expulsó de la sala',
  'sala-readmitir': 'Readmitió en la sala', 'sala-silenciar': 'Silenció a un participante',
};
