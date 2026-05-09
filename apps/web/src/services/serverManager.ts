import type { ServerConfig } from '../types';
import { getBootstrapApiUrls, getDefaultApiUrl } from './apiBase';

const STORAGE_KEY = 'sst-servers';
const ACTIVE_SERVER_KEY = 'sst-active-server';

export const SERVER_CONFIG_CHANGED_EVENT = 'sst:servers-changed';
export const ACTIVE_SERVER_CHANGED_EVENT = 'sst:active-server-changed';

export interface ActiveServerChangedDetail {
  serverId: string | null;
  server: ServerConfig | null;
  contextKey: string;
}

interface HostedBootstrapServer {
  id?: string;
  name?: string;
  apiUrl?: string;
  apiKey?: string;
  apiProfile?: string;
  mapPreset?: string;
  mapLabel?: string;
  mapImageUrl?: string;
  mapWorldSizeX?: number;
  mapWorldSizeZ?: number;
  mapInvertX?: boolean;
  mapInvertZ?: boolean;
}

interface HostedBootstrapResponse {
  apiUrl?: string;
  apiKey?: string;
  active?: string;
  servers?: HostedBootstrapServer[];
}

const emitServerConfigChanged = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SERVER_CONFIG_CHANGED_EVENT));
};

const emitActiveServerChanged = (serverId: string | null): void => {
  if (typeof window === 'undefined') return;
  const server = serverId ? getServers().find(item => item.id === serverId) || null : null;
  window.dispatchEvent(new CustomEvent<ActiveServerChangedDetail>(ACTIVE_SERVER_CHANGED_EVENT, {
    detail: {
      serverId,
      server,
      contextKey: getServerContextKey(server),
    },
  }));
};

// Generate a unique ID
const generateId = (): string => {
  return `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const normalizeApiUrl = (value?: string | null): string => {
  return String(value || '').trim().replace(/\/+$/, '');
};

// Get all saved servers
export const getServers = (): ServerConfig[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
};

// Save all servers
const saveServers = (servers: ServerConfig[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  emitServerConfigChanged();
};

// Get active server ID
export const getActiveServerId = (): string | null => {
  return localStorage.getItem(ACTIVE_SERVER_KEY);
};

// Set active server ID
export const setActiveServerId = (id: string | null): void => {
  if (id) {
    localStorage.setItem(ACTIVE_SERVER_KEY, id);
    // Update last used timestamp
    const servers = getServers();
    const updated = servers.map(s => 
      s.id === id ? { ...s, lastUsed: new Date().toISOString() } : s
    );
    saveServers(updated);
  } else {
    localStorage.removeItem(ACTIVE_SERVER_KEY);
  }
  emitActiveServerChanged(id);
};

// Get the active server config
export const getActiveServer = (): ServerConfig | null => {
  const activeId = getActiveServerId();
  if (!activeId) return null;
  
  const servers = getServers();
  return servers.find(s => s.id === activeId) || null;
};

export const getServerContextKey = (server: ServerConfig | null = getActiveServer()): string => {
  if (!server) return 'no-server';

  return [
    server.id,
    server.apiUrl.trim().replace(/\/+$/, '').toLowerCase(),
    server.apiProfile?.trim() || 'default',
    server.mapPreset || '',
    server.mapLabel || '',
    server.mapImageUrl || '',
    String(server.mapWorldSizeX || ''),
    String(server.mapWorldSizeZ || ''),
    server.mapInvertX ? 'invert-x' : '',
    server.mapInvertZ ? 'invert-z' : '',
    server.lastUsed || '',
  ].join('|');
};

// Add a new server
export const addServer = (config: Omit<ServerConfig, 'id' | 'createdAt'>): ServerConfig => {
  const servers = getServers();
  
  const newServer: ServerConfig = {
    ...config,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  
  servers.push(newServer);
  saveServers(servers);
  
  // If this is the first server, make it active
  if (servers.length === 1) {
    setActiveServerId(newServer.id);
  }
  
  return newServer;
};

// Update an existing server
export const updateServer = (id: string, updates: Partial<Omit<ServerConfig, 'id' | 'createdAt'>>): ServerConfig | null => {
  const servers = getServers();
  const index = servers.findIndex(s => s.id === id);
  
  if (index === -1) return null;
  
  servers[index] = {
    ...servers[index],
    ...updates,
  };
  
  saveServers(servers);
  return servers[index];
};

// Delete a server
export const deleteServer = (id: string): boolean => {
  const servers = getServers();
  const filtered = servers.filter(s => s.id !== id);
  
  if (filtered.length === servers.length) return false;
  
  saveServers(filtered);
  
  // If we deleted the active server, clear active or set to first available
  if (getActiveServerId() === id) {
    if (filtered.length > 0) {
      setActiveServerId(filtered[0].id);
    } else {
      setActiveServerId(null);
    }
  }
  
  return true;
};

// Migrate old single-server config to new multi-server format
export const migrateOldConfig = (): void => {
  const servers = getServers();
  if (servers.length > 0) return; // Already migrated
  
  // Check for old config
  const oldApiKey = localStorage.getItem('sst-api-key');
  const oldApiUrl = localStorage.getItem('sst-api-url');
  
  if (oldApiKey) {
    const migratedServer = addServer({
      name: 'Default Server',
      apiUrl: oldApiUrl || getDefaultApiUrl(),
      apiKey: oldApiKey,
    });
    
    setActiveServerId(migratedServer.id);
    
    // Clean up old keys
    localStorage.removeItem('sst-api-key');
    localStorage.removeItem('sst-api-url');
  }
};

function toServerConfig(raw: HostedBootstrapServer, fallbackApiUrl: string, fallbackApiKey: string): ServerConfig | null {
  const apiUrl = normalizeApiUrl(raw.apiUrl || fallbackApiUrl);
  const apiKey = String(raw.apiKey || fallbackApiKey || '').trim();
  const id = String(raw.id || raw.apiProfile || raw.name || '').trim();

  if (!apiUrl || !apiKey || !id) return null;

  return {
    id: `hosted-${id}`,
    name: String(raw.name || raw.apiProfile || id).trim() || 'SST Server',
    apiUrl,
    apiKey,
    apiProfile: String(raw.apiProfile || '').trim(),
    mapPreset: raw.mapPreset,
    mapLabel: raw.mapLabel,
    mapImageUrl: raw.mapImageUrl,
    mapWorldSizeX: raw.mapWorldSizeX,
    mapWorldSizeZ: raw.mapWorldSizeZ,
    mapInvertX: raw.mapInvertX,
    mapInvertZ: raw.mapInvertZ,
    createdAt: new Date().toISOString(),
  };
}

function getServerIdentity(server: Pick<ServerConfig, 'apiUrl' | 'apiProfile'>): string {
  return `${normalizeApiUrl(server.apiUrl).toLowerCase()}|${String(server.apiProfile || '').trim().toLowerCase()}`;
}

function mergeHostedServers(hostedServers: ServerConfig[], activeHostedId?: string): ServerConfig[] {
  const existingServers = getServers();
  const existingByIdentity = new Map(existingServers.map(server => [getServerIdentity(server), server]));
  let changed = false;

  const merged = existingServers.map(server => {
    const hosted = hostedServers.find(candidate => getServerIdentity(candidate) === getServerIdentity(server));
    if (!hosted) return server;

    const nextServer: ServerConfig = {
      ...server,
      apiUrl: hosted.apiUrl,
      apiKey: hosted.apiKey,
      apiProfile: hosted.apiProfile,
      mapPreset: hosted.mapPreset,
      mapLabel: hosted.mapLabel,
      mapImageUrl: hosted.mapImageUrl,
      mapWorldSizeX: hosted.mapWorldSizeX,
      mapWorldSizeZ: hosted.mapWorldSizeZ,
      mapInvertX: hosted.mapInvertX,
      mapInvertZ: hosted.mapInvertZ,
    };

    if (JSON.stringify(nextServer) !== JSON.stringify(server)) {
      changed = true;
    }

    return nextServer;
  });

  for (const hosted of hostedServers) {
    if (existingByIdentity.has(getServerIdentity(hosted))) continue;
    merged.push(hosted);
    changed = true;
  }

  if (changed) {
    saveServers(merged);
  }

  const activeId = getActiveServerId();
  const hasActive = activeId ? merged.some(server => server.id === activeId) : false;
  if (!hasActive && merged.length > 0) {
    const active = activeHostedId
      ? merged.find(server => server.apiProfile === activeHostedId || server.id === `hosted-${activeHostedId}`)
      : null;
    setActiveServerId((active || merged[0]).id);
  }

  return merged;
}

let hostedBootstrapPromise: Promise<ServerConfig[]> | null = null;

export async function bootstrapHostedServers(): Promise<ServerConfig[]> {
  if (hostedBootstrapPromise) return hostedBootstrapPromise;

  hostedBootstrapPromise = (async () => {
    for (const baseUrl of getBootstrapApiUrls()) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 4000);

      try {
        const response = await fetch(`${baseUrl}/client/bootstrap`, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) continue;

        const data = (await response.json()) as HostedBootstrapResponse;
        const fallbackApiUrl = normalizeApiUrl(data.apiUrl || baseUrl);
        const fallbackApiKey = String(data.apiKey || '').trim();
        const servers = (data.servers || [])
          .map(server => toServerConfig(server, fallbackApiUrl, fallbackApiKey))
          .filter((server): server is ServerConfig => Boolean(server));

        if (servers.length === 0) continue;

        return mergeHostedServers(servers, data.active);
      } catch {
        // Try the next bootstrap URL.
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    return getServers();
  })();

  try {
    return await hostedBootstrapPromise;
  } finally {
    hostedBootstrapPromise = null;
  }
}

// Export all functions as a manager object too
export const serverManager = {
  getServers,
  getActiveServerId,
  setActiveServerId,
  getActiveServer,
  getServerContextKey,
  addServer,
  updateServer,
  deleteServer,
  migrateOldConfig,
  bootstrapHostedServers,
};

export default serverManager;
