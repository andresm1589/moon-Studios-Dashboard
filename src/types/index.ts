// ── Roles ─────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'CEO'
  | 'Administración'
  | 'Empleado'
  | 'Contador'
  | 'Diseño'
  | 'Secretaría'
  | 'Programación';

// ── Permisos ──────────────────────────────────────────────────────────────────

export type Permission =
  | 'roles'
  | 'admin'
  | 'diseno'
  | 'secretaria'
  | 'programacion'
  | 'contador'
  | 'webs'
  | 'ceo'
  | 'tramites_gestion'
  | 'acceso'
  | 'conferencias';

// Quién ve qué panel. El menú lateral, las rutas y la tabla de "Gestión Roles"
// leen de acá: antes cada uno tenía su propio `role === '…'` y el CEO se
// quedaba fuera de Admin, Roles, Contador, Programación, Diseño y Secretaría
// aunque este mapa ya decía que los tenía.
// Administración: esta lista es solo el valor de respaldo. Lo que ve de verdad
// lo decide el CEO en «Acceso de Administración» (lib/tramites, permisosAdministracion).
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  CEO:            ['roles', 'admin', 'diseno', 'secretaria', 'programacion', 'contador', 'webs', 'ceo', 'tramites_gestion', 'acceso', 'conferencias'],
  Administración: ['admin', 'roles', 'webs', 'tramites_gestion', 'acceso', 'conferencias'],
  Diseño:         ['diseno'],
  Secretaría:     ['secretaria'],
  Programación:   ['programacion'],
  Contador:       ['contador'],
  Empleado:       [],
};

/**
 * Cuenta del equipo de Moon Studios. En `users` también viven las cuentas de
 * clientes e invitados (rol `client`: portal web, MOON FEST, app): son otro
 * sistema y nunca aparecen en los directorios, listas ni asignaciones del equipo.
 */
export const esRolDelEquipo = (role: unknown): role is UserRole =>
  typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);

export const tienePermiso = (role: string | null | undefined, permiso: Permission): boolean =>
  !!role && (ROLE_PERMISSIONS[role as UserRole]?.includes(permiso) ?? false);

// ── Logs / Auditoría ─────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warning' | 'error' | 'success';

export interface SystemLog {
  level:      LogLevel;
  module:     string;
  message:    string;
  userName?:  string;
  userId?:    string;
  metadata?:  Record<string, unknown>;
}

// ── Panel Diseño ─────────────────────────────────────────────────────────────

export type MediaType = 'image' | 'video' | 'document' | 'other';

export interface MediaFile {
  id:           string;
  name:         string;
  url:          string;
  path:         string;
  type:         MediaType;
  mimeType?:    string;
  size:         number;
  uploaderUid:  string;
  uploaderName: string;
  tags?:        string[];
  createdAt:    Date;
}

// ── Panel Secretaría ─────────────────────────────────────────────────────────

export type DocStatus = 'draft' | 'review' | 'approved' | 'archived';

export interface SecretaryDocument {
  id:           string;
  title:        string;
  content:      string;
  category:     string;
  status:       DocStatus;
  notes?:       string;
  creatorUid?:  string;
  creatorName?: string;
  createdAt:    Date;
  updatedAt:    Date;
}

export interface ActivityRecord {
  id:          string;
  description: string;
  userName:    string;
  userId?:     string;
  createdAt:   Date;
  metadata?:   Record<string, unknown>;
}

// ── Panel Programación ───────────────────────────────────────────────────────

// Proyectos usa 'archived' y Programación 'cancelled'; los dos paneles aceptan ambos.
export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'cancelled' | 'archived';

export type ChangeType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'hotfix';

export interface Project {
  id:           string;
  name:         string;
  description?: string;
  status:       ProjectStatus;
  version:      string;
  stack?:       string[];
  repository?:  string;
  priority?:    string;
  deadline?:    string;
  progress?:    number;
  lead?:        string;
  leadName?:    string;
  members?:     string[];
  createdAt:    Date;
  updatedAt?:   Date;
}

export interface VersionChange {
  id:           string;
  projectId:    string;
  version:      string;
  type:         ChangeType;
  title:        string;
  description?: string;
  breaking?:    boolean;
  author?:      string;
  authorName?:  string;
  createdAt:    Date;
}

// ── Usuario / Auth ────────────────────────────────────────────────────────────

export interface UserProfile {
  uid:            string;
  email:          string;
  displayName:    string;
  role:           UserRole;
  avatar?:        string;
  phone?:         string;
  bio?:           string;
  website?:       string;
  avatarHistory?: { url: string; path: string; uploadedAt: string }[];
  createdAt:      Date;
}

// ── Tareas ────────────────────────────────────────────────────────────────────

export interface Task {
  id:          string;
  title:       string;
  description: string;
  date:        Date;
  assignedTo?: string;
  priority:    'low' | 'medium' | 'high';
  status:      'pending' | 'in-progress' | 'completed';
  createdBy:   string;
}

// ── Anuncios ──────────────────────────────────────────────────────────────────

export interface Announcement {
  id:        string;
  title:     string;
  content:   string;
  createdBy: string;
  createdAt: Date;
  important: boolean;
}

// ── Notificaciones ────────────────────────────────────────────────────────────

export interface Notification {
  id:        string;
  title:     string;
  message:   string;
  userId:    string;
  read:      boolean;
  createdAt: Date;
}

// ── Discord ───────────────────────────────────────────────────────────────────

export interface DiscordServer {
  id:          string;
  name:        string;
  icon?:       string;
  memberCount: number;
  region:      string;
}

export interface DiscordBotData {
  servers:       DiscordServer[];
  totalUsers:    number;
  totalCommands: number;
  commandsList:  DiscordCommand[];
  status:        'online' | 'offline' | 'maintenance';
  uptime:        string;
  lastUpdated:   Date;
}

export interface DiscordCommand {
  name:        string;
  description: string;
  usage:       string;
  category:    string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalUsers:         number;
  totalTasks:         number;
  completedTasks:     number;
  pendingTasks:       number;
  announcementsCount: number;
}