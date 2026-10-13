// src/services/discordApi.ts
//
// Cliente de la API del bot Luna NET. Antes usaba una x-api-key estática
// (compartida con el dashboard público de Luna NET, donde quedaba expuesta
// en el bundle JS) — el backend ya no acepta esa key. Ahora se autentica con
// el ID token de Firebase de la sesión de staff ya iniciada en este portal
// (CEO/Administración), que el backend verifica contra el proyecto Firebase
// de Moon Studios directamente.

import { auth } from '@/lib/firebase';

const API_URL = 'https://api.lunanet.nellyx.xyz';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const handleResponse = async (response: Response) => {
  const json = await response.json().catch(() => ({ error: 'Error desconocido' }));
  if (!response.ok) throw new Error(json.error || `Error ${response.status}`);
  return json.data !== undefined ? json.data : json;
};

// ─── Bot ──────────────────────────────────────────────────────────────────────

export const getBotStatus = async () => {
  const res = await fetch(`${API_URL}/api/bot/status`, { headers: await getAuthHeaders() });
  return handleResponse(res);
};

export const getServers = async () => {
  const res = await fetch(`${API_URL}/api/bot/servers`, { headers: await getAuthHeaders() });
  return handleResponse(res);
};

// No hay "iniciar bot" por API: el bot corre como proceso siempre activo en el
// hosting (Pterodactyl). La vieja startBot() llamaba a /api/bot/start, que
// nunca existió, y además mandaba el token del bot desde el navegador.

export const sendBotMessage = async (guildId: string, channelId: string, message: string) => {
  const res = await fetch(`${API_URL}/api/bot/send-message`, {
    method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ guildId, channelId, message }),
  });
  return handleResponse(res);
};

export const getServerChannels = async (guildId: string) => {
  const res = await fetch(`${API_URL}/api/bot/servers/${guildId}/channels`, { headers: await getAuthHeaders() });
  return handleResponse(res);
};

// Catálogo de slash commands — público, no requiere auth
export const getBotCommands = async (guildId?: string) => {
  const params = guildId ? `?guildId=${guildId}` : '';
  const res = await fetch(`${API_URL}/api/bot/commands${params}`);
  return handleResponse(res);
};

export const updateBotProfile = async (username: string) => {
  const res = await fetch(`${API_URL}/api/bot/profile`, {
    method: 'PATCH', headers: await getAuthHeaders(), body: JSON.stringify({ username }),
  });
  return handleResponse(res);
};

// La ruta exige sesión de staff (requireOwnerOrStaff): sin el token contestaba
// siempre 401 "Token requerido".
export const getBotInvite = async () => {
  const res = await fetch(`${API_URL}/api/bot/invite`, { headers: await getAuthHeaders() });
  return handleResponse(res);
};

export const getMaintenanceMode = async () => {
  const res = await fetch(`${API_URL}/api/bot/maintenance`, { headers: await getAuthHeaders() });
  return handleResponse(res);
};

export const setMaintenanceMode = async (enabled: boolean, reason = '') => {
  const res = await fetch(`${API_URL}/api/bot/maintenance`, {
    method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ enabled, reason }),
  });
  return handleResponse(res);
};

export const getAuditLog = async (guildId: string, limit = 20, type?: number) => {
  const params = new URLSearchParams({ guildId, limit: String(limit) });
  if (type !== undefined) params.set('type', String(type));
  const res = await fetch(`${API_URL}/api/bot/audit?${params}`, { headers: await getAuthHeaders() });
  return handleResponse(res);
};

// ─── Público (sin auth) ───────────────────────────────────────────────────────

export const getPublicStatus = async () => {
  const res = await fetch(`${API_URL}/api/public/status`);
  return handleResponse(res);
};

export const getUptimeHistory = async () => {
  const res = await fetch(`${API_URL}/api/public/uptime`);
  return handleResponse(res);
};

export const getPublicIncidents = async () => {
  const res = await fetch(`${API_URL}/api/public/incidents`);
  return handleResponse(res);
};

// ─── Incidentes (staff) ────────────────────────────────────────────────────────

export const createIncident = async (title: string, impact: string, message?: string) => {
  const res = await fetch(`${API_URL}/api/incidents`, {
    method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ title, impact, message }),
  });
  return handleResponse(res);
};

export const updateIncident = async (id: string, status: string, message: string) => {
  const res = await fetch(`${API_URL}/api/incidents/${id}`, {
    method: 'PATCH', headers: await getAuthHeaders(), body: JSON.stringify({ status, message }),
  });
  return handleResponse(res);
};

export const deleteIncident = async (id: string) => {
  const res = await fetch(`${API_URL}/api/incidents/${id}`, {
    method: 'DELETE', headers: await getAuthHeaders(),
  });
  return handleResponse(res);
};

// ─── Premium ──────────────────────────────────────────────────────────────────

export const getPremiumStatus = async (discordId: string) => {
  const res = await fetch(`${API_URL}/api/premium/${discordId}`, { headers: await getAuthHeaders() });
  return handleResponse(res);
};

export const activatePremium = async (discordId: string, plan: string, days: number) => {
  const res = await fetch(`${API_URL}/api/premium/activate`, {
    method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ discordId, plan, days }),
  });
  return handleResponse(res);
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const deleteAuthUser = async (uid: string) => {
  const res = await fetch(`${API_URL}/api/users/${uid}`, {
    method: 'DELETE', headers: await getAuthHeaders(),
  });
  return handleResponse(res);
};

// ─── Emojis del bot (Bot de Discord → Emojis) ────────────────────────────────
// Los emojis de todo el bot por grupo; los cambios se guardan en Firestore y se
// aplican al momento. Los emojis propios se suben a la aplicación del bot.

export interface EmojiBot {
  clave: string; valor: string; base: string; antes: string;
  origen: 'fabrica' | 'archivo' | 'panel'; discord: boolean; disponible: boolean; url: string | null;
}
export interface GrupoEmojis { id: string; nombre: string; items: EmojiBot[] }
export interface EmojiPropio { id: string; nombre: string; animado: boolean; codigo: string; url: string; origen: string; borrable: boolean }
export interface DatosEmojis {
  grupos: GrupoEmojis[]; propios: EmojiPropio[]; limiteAplicacion: number; enAplicacion: number;
  actualizado: { en: string; por: string } | null;
}

export const getEmojis = async (): Promise<DatosEmojis> => {
  const res = await fetch(`${API_URL}/api/bot/emojis`, { headers: await getAuthHeaders() });
  // Un bot sin esta versión todavía responde 404.
  if (res.status === 404) throw new Error('El bot todavía no tiene el panel de emojis: falta subir y reiniciar el bot.');
  return handleResponse(res);
};

/** `valor` null: vuelve al emoji de antes (el del archivo o el de fábrica). */
export const setEmoji = async (grupo: string, clave: string, valor: string | null): Promise<EmojiBot> => {
  const res = await fetch(`${API_URL}/api/bot/emojis/${encodeURIComponent(grupo)}/${encodeURIComponent(clave)}`, {
    method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify({ valor }),
  });
  return handleResponse(res);
};

export const subirEmojiPropio = async (imagen: File, nombre: string): Promise<EmojiPropio> => {
  const { Authorization } = await getAuthHeaders();
  const datos = new FormData();
  datos.append('nombre', nombre);
  datos.append('imagen', imagen);
  const res = await fetch(`${API_URL}/api/bot/emojis/propios`, {
    method: 'POST', body: datos, headers: Authorization ? { Authorization } : {},
  });
  return handleResponse(res);
};

export const borrarEmojiPropio = async (id: string) => {
  const res = await fetch(`${API_URL}/api/bot/emojis/propios/${id}`, { method: 'DELETE', headers: await getAuthHeaders() });
  return handleResponse(res);
};
