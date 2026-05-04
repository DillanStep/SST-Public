import type { ServerConfig } from '../types';

const STORAGE_KEY = 'sst-servers';
const ACTIVE_SERVER_KEY = 'sst-active-server';

export const SERVER_CONFIG_CHANGED_EVENT = 'sst:servers-changed';
export const ACTIVE_SERVER_CHANGED_EVENT = 'sst:active-server-changed';

const emitServerConfigChanged = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SERVER_CONFIG_CHANGED_EVENT));
};

const emitActiveServerChanged = (serverId: string | null): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTIVE_SERVER_CHANGED_EVENT, { detail: { serverId } }));
};

// Generate a unique ID
const generateId = (): string => {
  return `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      apiUrl: oldApiUrl || 'http://localhost:3001',
      apiKey: oldApiKey,
    });
    
    setActiveServerId(migratedServer.id);
    
    // Clean up old keys
    localStorage.removeItem('sst-api-key');
    localStorage.removeItem('sst-api-url');
  }
};

// Export all functions as a manager object too
export const serverManager = {
  getServers,
  getActiveServerId,
  setActiveServerId,
  getActiveServer,
  addServer,
  updateServer,
  deleteServer,
  migrateOldConfig,
};

export default serverManager;
