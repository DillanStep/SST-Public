import React, { useState, useCallback, useEffect } from 'react';
import { 
  Server, Plus, Trash2, Edit2, Check, X, 
  ExternalLink, Key, Globe, Clock, Save, RefreshCw, SlidersHorizontal, Map as MapIcon
} from 'lucide-react';
import { Button, Card, Badge } from '../ui';
import {
  ACTIVE_SERVER_CHANGED_EVENT,
  SERVER_CONFIG_CHANGED_EVENT,
  getServers, 
  updateServer, 
  deleteServer, 
  getActiveServerId,
  setActiveServerId 
} from '../../services/serverManager';
import api from '../../services/api';
import { clearAuthTokenForServer } from '../../services/auth';
import type { RuntimeEnvValues, ServerConfig } from '../../types';
import { getMapPresetDefaults, MAP_PRESET_OPTIONS } from '../../maps/mapConfig';
import { AddServerSetup } from './AddServerSetup';

interface ServerSettingsProps {
  onServerChange?: () => void;
}

type EnvFieldType = 'text' | 'password' | 'number' | 'select' | 'toggle';

interface EnvField {
  key: string;
  label: string;
  type?: EnvFieldType;
  options?: { value: string; label: string }[];
}

interface EnvGroup {
  title: string;
  fields: EnvField[];
}

const ENV_GROUPS: EnvGroup[] = [
  {
    title: 'Server',
    fields: [
      { key: 'PORT', label: 'API Port', type: 'number' },
      { key: 'HOST', label: 'API Host' },
      { key: 'CORS_ORIGIN', label: 'CORS Origin' },
    ],
  },
  {
    title: 'Storage',
    fields: [
      {
        key: 'STORAGE_BACKEND',
        label: 'Storage Backend',
        type: 'select',
        options: [
          { value: 'local', label: 'Local' },
          { value: 'sftp', label: 'SFTP' },
          { value: 'ftp', label: 'FTP' },
        ],
      },
      { key: 'SST_PATH', label: 'SST Runtime Path' },
      { key: 'SST_API_PROVIDER_CONFIG', label: 'Provider Config Path' },
      { key: 'HOST_PROVIDER', label: 'Host Provider' },
    ],
  },
  {
    title: 'SFTP',
    fields: [
      { key: 'SFTP_HOST', label: 'Host' },
      { key: 'SFTP_PORT', label: 'Port', type: 'number' },
      { key: 'SFTP_USER', label: 'Username' },
      { key: 'SFTP_PASSWORD', label: 'Password', type: 'password' },
      { key: 'SFTP_ROOT', label: 'Remote Root' },
    ],
  },
  {
    title: 'FTP',
    fields: [
      { key: 'FTP_HOST', label: 'Host' },
      { key: 'FTP_PORT', label: 'Port', type: 'number' },
      { key: 'FTP_USER', label: 'Username' },
      { key: 'FTP_PASSWORD', label: 'Password', type: 'password' },
      { key: 'FTP_SECURE', label: 'FTPS', type: 'toggle' },
      { key: 'FTP_ROOT', label: 'Remote Root' },
    ],
  },
  {
    title: 'Data Paths',
    fields: [
      { key: 'INVENTORIES_PATH', label: 'Inventories Path' },
      { key: 'EVENTS_PATH', label: 'Item Events Path' },
      { key: 'LIFE_EVENTS_PATH', label: 'Life Events Path' },
      { key: 'TRADES_PATH', label: 'Trades Path' },
      { key: 'API_PATH', label: 'API Queue Path' },
      { key: 'ONLINE_PLAYERS_PATH', label: 'Online Players File' },
      { key: 'ONLINE_PLAYERS_STALE_AFTER_MS', label: 'Online Stale Timeout (ms)', type: 'number' },
    ],
  },
  {
    title: 'Mission & Expansion',
    fields: [
      { key: 'MISSION_PATH', label: 'Mission Files Path' },
      { key: 'TYPES_PATH', label: 'Main Types.xml Override' },
      { key: 'EXPANSION_ENABLED', label: 'DayZ Expansion', type: 'toggle' },
      { key: 'EXPANSION_TRADERS_PATH', label: 'Expansion Traders Path' },
      { key: 'EXPANSION_MARKET_PATH', label: 'Expansion Market Path' },
    ],
  },
  {
    title: 'Map',
    fields: [
      { key: 'MAP_PRESET', label: 'Map Preset', type: 'select', options: MAP_PRESET_OPTIONS },
      { key: 'MAP_LABEL', label: 'Custom Map Label' },
      { key: 'MAP_IMAGE_URL', label: 'Map Image URL or Public Path' },
      { key: 'MAP_WORLD_SIZE_X', label: 'World Size X', type: 'number' },
      { key: 'MAP_WORLD_SIZE_Z', label: 'World Size Z', type: 'number' },
      { key: 'MAP_INVERT_X', label: 'Invert X Axis', type: 'toggle' },
      { key: 'MAP_INVERT_Z', label: 'Invert Z Axis', type: 'toggle' },
    ],
  },
  {
    title: 'Logs & Tracking',
    fields: [
      { key: 'PROFILES_PATH', label: 'Profiles Path' },
      { key: 'AUTH_DB_PATH', label: 'Auth Database Path' },
      { key: 'DATABASE_PATH', label: 'Position Database Path' },
      { key: 'POSITION_TRACKING_INTERVAL', label: 'Position Interval (ms)', type: 'number' },
      { key: 'ARCHIVE_HOUR', label: 'Archive Hour', type: 'number' },
      { key: 'ARCHIVE_MINUTE', label: 'Archive Minute', type: 'number' },
      { key: 'ARCHIVE_DB_PATH', label: 'Archive Database Path' },
    ],
  },
  {
    title: 'Security & Updates',
    fields: [
      { key: 'API_KEY', label: 'API Key', type: 'password' },
      { key: 'JWT_SECRET', label: 'JWT Secret', type: 'password' },
      { key: 'SST_AUTO_CREATE_ADMIN', label: 'Auto Create Admin', type: 'toggle' },
      { key: 'INITIAL_ADMIN_USERNAME', label: 'Initial Admin Username' },
      { key: 'INITIAL_ADMIN_PASSWORD', label: 'Initial Admin Password', type: 'password' },
      { key: 'SST_DISABLE_UPDATE_CHECK', label: 'Disable Update Checks', type: 'toggle' },
      { key: 'SST_UPDATE_REPO', label: 'Update Repo' },
      { key: 'SST_ALLOW_REMOTE_UPDATE', label: 'Allow Remote Updates', type: 'toggle' },
    ],
  },
];

const isToggleOn = (value: string | undefined) => value === '1' || value === 'true';

const fillMissingEnvValues = (
  values: RuntimeEnvValues,
  suggestions: RuntimeEnvValues = {}
) => {
  const nextValues = { ...values };
  let filledCount = 0;

  for (const [key, suggestedValue] of Object.entries(suggestions)) {
    const currentValue = String(nextValues[key] ?? '').trim();
    const normalizedSuggestion = String(suggestedValue ?? '').trim();

    if (!currentValue && normalizedSuggestion) {
      nextValues[key] = normalizedSuggestion;
      filledCount += 1;
    }
  }

  return { values: nextValues, filledCount };
};

export const ServerSettings: React.FC<ServerSettingsProps> = ({ onServerChange }) => {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('http://localhost:3001');
  const [formProfile, setFormProfile] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formError, setFormError] = useState('');
  
  // Testing state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});

  // Active API .env state
  const [envValues, setEnvValues] = useState<RuntimeEnvValues>({});
  const [envSuggestions, setEnvSuggestions] = useState<RuntimeEnvValues>({});
  const [envPath, setEnvPath] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [openEnvGroups, setOpenEnvGroups] = useState<Record<string, boolean>>({});

  // Load servers
  const loadServers = useCallback(() => {
    setServers(getServers());
    setActiveId(getActiveServerId());
  }, []);

  const loadRuntimeConfig = useCallback(async () => {
    if (!getActiveServerId()) {
      setEnvValues({});
      setEnvSuggestions({});
      setEnvPath('');
      return;
    }

    setConfigLoading(true);
    setConfigError('');
    setConfigMessage('');

    try {
      api.loadActiveServer();
      const config = await api.getRuntimeConfig();
      const suggestions = config.suggestions || {};
      const filled = fillMissingEnvValues(config.env || {}, suggestions);
      setEnvValues(filled.values);
      setEnvSuggestions(suggestions);
      setEnvPath(config.envPath || '');
      if (filled.filledCount > 0) {
        setConfigMessage(`Auto-filled ${filled.filledCount} unset settings from known server paths. Review them, then Save .env to persist.`);
      }
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to load server settings');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  useEffect(() => {
    loadRuntimeConfig();
  }, [activeId, loadRuntimeConfig]);

  useEffect(() => {
    window.addEventListener(SERVER_CONFIG_CHANGED_EVENT, loadServers);
    window.addEventListener(ACTIVE_SERVER_CHANGED_EVENT, loadServers);

    return () => {
      window.removeEventListener(SERVER_CONFIG_CHANGED_EVENT, loadServers);
      window.removeEventListener(ACTIVE_SERVER_CHANGED_EVENT, loadServers);
    };
  }, [loadServers]);

  // Test a server connection
  const testConnection = async (server: ServerConfig) => {
    setTestingId(server.id);
    setTestResults(prev => ({ ...prev, [server.id]: null }));
    
    try {
      const response = await fetch(`${server.apiUrl}/servers`, {
        headers: {
          'x-api-key': server.apiKey,
          ...(server.apiProfile ? { 'x-sst-server': server.apiProfile } : {}),
        },
      });
      
      if (response.ok) {
        setTestResults(prev => ({ ...prev, [server.id]: 'success' }));
      } else {
        setTestResults(prev => ({ ...prev, [server.id]: 'error' }));
      }
    } catch {
      setTestResults(prev => ({ ...prev, [server.id]: 'error' }));
    } finally {
      setTestingId(null);
    }
  };

  // Update existing server
  const handleUpdateServer = (id: string) => {
    if (!formName.trim() || !formUrl.trim() || !formKey.trim()) {
      setFormError('All fields are required');
      return;
    }

    const currentServer = servers.find(server => server.id === id);
    const nextApiUrl = formUrl.trim().replace(/\/$/, '');
    const nextApiProfile = formProfile.trim();
    const apiUrlChanged = Boolean(
      currentServer &&
      (currentServer.apiUrl !== nextApiUrl || (currentServer.apiProfile || '') !== nextApiProfile)
    );

    updateServer(id, {
      name: formName.trim(),
      apiUrl: nextApiUrl,
      apiProfile: nextApiProfile,
      apiKey: formKey.trim(),
    });

    if (apiUrlChanged) {
      clearAuthTokenForServer(id);
    }

    setEditingId(null);
    setFormError('');
    loadServers();
    
    // If we updated the active server, reload its config
    if (id === activeId) {
      api.loadActiveServer();
      onServerChange?.();
    }
  };

  // Delete a server
  const handleDeleteServer = (id: string) => {
    if (confirm('Are you sure you want to delete this server?')) {
      deleteServer(id);
      loadServers();
      
      if (id === activeId) {
        api.loadActiveServer();
      }
    }
  };

  // Switch active server
  const handleSwitchServer = (id: string) => {
    setActiveServerId(id);
    setActiveId(id);
    api.loadActiveServer();
  };

  // Start editing a server
  const startEditing = (server: ServerConfig) => {
    setEditingId(server.id);
    setFormName(server.name);
    setFormUrl(server.apiUrl);
    setFormProfile(server.apiProfile || '');
    setFormKey(server.apiKey);
    setFormError('');
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null);
    setFormName('');
    setFormUrl('http://localhost:3001');
    setFormProfile('');
    setFormKey('');
    setFormError('');
  };

  const updateEnvValue = (key: string, value: string) => {
    setEnvValues(prev => ({ ...prev, [key]: value }));
    setConfigMessage('');
    setConfigError('');
  };

  const updateMapPresetEnvValue = (value: string) => {
    if (!value) {
      updateEnvValue('MAP_PRESET', '');
      return;
    }

    const defaults = getMapPresetDefaults(value);
    setEnvValues(prev => ({
      ...prev,
      MAP_PRESET: defaults.id,
      MAP_LABEL: defaults.id === 'custom' ? prev.MAP_LABEL || '' : '',
      MAP_IMAGE_URL: defaults.imageUrl,
      MAP_WORLD_SIZE_X: String(defaults.worldSizeX),
      MAP_WORLD_SIZE_Z: String(defaults.worldSizeZ),
      MAP_INVERT_X: '0',
      MAP_INVERT_Z: '0',
    }));
    setConfigMessage(`${defaults.label} map defaults applied. Review them, then Save .env to persist.`);
    setConfigError('');
  };

  const autoFillRuntimeConfig = () => {
    const filled = fillMissingEnvValues(envValues, envSuggestions);
    setEnvValues(filled.values);
    setConfigError('');
    setConfigMessage(
      filled.filledCount > 0
        ? `Auto-filled ${filled.filledCount} blank settings. Review them, then Save .env to persist.`
        : 'No blank settings needed auto-fill.'
    );
  };

  const saveRuntimeConfig = async () => {
    setConfigSaving(true);
    setConfigError('');
    setConfigMessage('');

    try {
      const result = await api.updateRuntimeConfig(envValues);
      const activeServer = servers.find(server => server.id === activeId);

      if (activeServer && envValues.API_KEY && envValues.API_KEY !== activeServer.apiKey) {
        updateServer(activeServer.id, { apiKey: envValues.API_KEY });
        api.configure(activeServer.apiUrl, envValues.API_KEY, activeServer.apiProfile);
        loadServers();
      }

      setConfigMessage(result.message || 'Settings saved.');
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to save server settings');
    } finally {
      setConfigSaving(false);
    }
  };

  const renderEnvField = (field: EnvField) => {
    const value = envValues[field.key] ?? '';

    if (field.type === 'toggle') {
      return (
        <label key={field.key} className="flex items-center justify-between gap-3 rounded-lg border border-surface-200 bg-white px-3 py-2">
          <span>
            <span className="block text-sm font-medium text-surface-700">{field.label}</span>
            <code className="text-[11px] text-surface-400">{field.key}</code>
          </span>
          <input
            type="checkbox"
            checked={isToggleOn(value)}
            onChange={(e) => updateEnvValue(field.key, e.target.checked ? '1' : '0')}
            className="h-4 w-4 rounded border-surface-300"
          />
        </label>
      );
    }

    if (field.type === 'select') {
      return (
        <label key={field.key} className="block">
          <span className="block text-sm font-medium text-surface-700 mb-1">{field.label}</span>
          <select
            value={value}
            onChange={(e) => {
              if (field.key === 'MAP_PRESET') {
                updateMapPresetEnvValue(e.target.value);
                return;
              }
              updateEnvValue(field.key, e.target.value);
            }}
            className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
          >
            <option value="">Default</option>
            {field.options?.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <code className="text-[11px] text-surface-400">{field.key}</code>
        </label>
      );
    }

    return (
      <label key={field.key} className="block">
        <span className="block text-sm font-medium text-surface-700 mb-1">{field.label}</span>
        <input
          type={field.type || 'text'}
          value={value}
          onChange={(e) => updateEnvValue(field.key, e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
        />
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <code className="text-[11px] text-surface-400">{field.key}</code>
          {!value && envSuggestions[field.key] && (
            <span className="truncate text-[11px] text-surface-400">
              Suggested: {envSuggestions[field.key]}
            </span>
          )}
        </span>
      </label>
    );
  };

  const handleEnvGroupToggle = (title: string, isOpen: boolean) => {
    setOpenEnvGroups(prev => (
      prev[title] === isOpen ? prev : { ...prev, [title]: isOpen }
    ));
  };

  if (showAddForm) {
    return (
      <AddServerSetup
        onCancel={() => setShowAddForm(false)}
        onSaved={() => {
          setShowAddForm(false);
          loadServers();
          api.loadActiveServer();
          onServerChange?.();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
    <Card compact>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Server className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-surface-800">Server Management</h2>
            <p className="text-xs sm:text-sm text-surface-500">Manage one SST API connection per DayZ server</p>
          </div>
        </div>
        <Button onClick={() => setShowAddForm(true)} size="sm">
          <Plus size={16} className="mr-1" />
          Add Server
        </Button>
      </div>

      <p className="mb-4 text-xs sm:text-sm text-surface-500">
        Hosting multiple servers? Use one API URL with different API profiles, or separate API URLs if you still run split instances.
      </p>

      {/* Server List */}
      {servers.length > 0 ? (
        <div className="space-y-3">
          {servers.map((server) => (
            <div
              key={server.id}
              className={`p-4 rounded-lg border-2 transition-colors ${
                activeId === server.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-surface-200 bg-white hover:border-surface-300'
              }`}
            >
              {editingId === server.id ? (
                // Edit mode
                <div className="space-y-3">
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Server Name"
                    className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 outline-none"
                  />
                  <input
                    type="text"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="API URL"
                    className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 outline-none"
                  />
                  <input
                    type="text"
                    value={formProfile}
                    onChange={(e) => setFormProfile(e.target.value)}
                    placeholder="API Profile (optional)"
                    className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 outline-none"
                  />
                  <input
                    type="password"
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                    placeholder="API Key"
                    className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 outline-none"
                  />
                  {formError && <p className="text-sm text-red-500">{formError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleUpdateServer(server.id)}>
                      <Check size={14} className="mr-1" />
                      Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={cancelEditing}>
                      <X size={14} className="mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // Display mode
                <>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Server size={18} className={activeId === server.id ? 'text-primary-600' : 'text-surface-500'} />
                      <span className="font-medium text-surface-800">{server.name}</span>
                      {activeId === server.id && (
                        <Badge variant="success">Active</Badge>
                      )}
                      {testResults[server.id] === 'success' && (
                        <Badge variant="success">Connected</Badge>
                      )}
                      {testResults[server.id] === 'error' && (
                        <Badge variant="error">Failed</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEditing(server)}
                        className="p-1.5 text-surface-500 hover:text-surface-800 hover:bg-surface-100 rounded"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteServer(server.id)}
                        className="p-1.5 text-surface-500 hover:text-red-500 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-sm text-surface-500 space-y-1 mb-3">
                    <div className="flex items-center gap-2">
                      <Globe size={12} />
                      <span className="font-mono text-xs">{server.apiUrl}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Key size={12} />
                      <span className="font-mono text-xs">••••••••{server.apiKey.slice(-4)}</span>
                    </div>
                    {server.apiProfile && (
                      <div className="flex items-center gap-2 text-xs">
                        <SlidersHorizontal size={12} />
                        <span className="font-mono">{server.apiProfile}</span>
                      </div>
                    )}
                    {server.mapPreset && (
                      <div className="flex items-center gap-2 text-xs">
                        <MapIcon size={12} />
                        <span>{server.mapLabel || getMapPresetDefaults(server.mapPreset).label}</span>
                      </div>
                    )}
                    {server.lastUsed && (
                      <div className="flex items-center gap-2 text-xs">
                        <Clock size={12} />
                        <span>Last used: {new Date(server.lastUsed).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {activeId !== server.id && (
                      <Button 
                        size="sm" 
                        onClick={() => handleSwitchServer(server.id)}
                      >
                        Switch to this server
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={() => testConnection(server)}
                      disabled={testingId === server.id}
                    >
                      <ExternalLink size={14} className="mr-1" />
                      {testingId === server.id ? 'Testing...' : 'Test Connection'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-surface-500">
          <Server size={48} className="mx-auto mb-4 opacity-50" />
          <p className="mb-2">No servers configured</p>
          <p className="text-sm">Add a server to get started</p>
        </div>
      )}
    </Card>
    <Card compact>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-surface-100 rounded-lg">
            <SlidersHorizontal className="h-5 w-5 text-surface-700" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-surface-800">Active Server .env</h2>
            <p className="text-xs sm:text-sm text-surface-500">Edit runtime settings for the selected SST API instance</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={loadRuntimeConfig} loading={configLoading}>
            <RefreshCw size={14} className="mr-1" />
            Reload
          </Button>
          <Button size="sm" variant="secondary" onClick={autoFillRuntimeConfig} disabled={!activeId || configLoading}>
            <Check size={14} className="mr-1" />
            Auto-fill blanks
          </Button>
          <Button size="sm" onClick={saveRuntimeConfig} loading={configSaving} disabled={!activeId || configLoading}>
            <Save size={14} className="mr-1" />
            Save .env
          </Button>
        </div>
      </div>

      {envPath && (
        <div className="mb-4 text-xs text-surface-500">
          Writing to <code className="rounded bg-surface-100 px-1.5 py-0.5">{envPath}</code>
        </div>
      )}

      {configError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {configError}
        </div>
      )}

      {configMessage && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {configMessage}
        </div>
      )}

      {!activeId ? (
        <div className="text-center py-10 text-surface-500">
          <Server size={40} className="mx-auto mb-3 opacity-50" />
          <p>Select or add a server before editing its runtime settings.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ENV_GROUPS.map((group, index) => (
            <details
              key={group.title}
              open={openEnvGroups[group.title] ?? index < 2}
              onToggle={(event) => handleEnvGroupToggle(group.title, event.currentTarget.open)}
              className="rounded-lg border border-surface-200 bg-surface-50"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-surface-800">
                {group.title}
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-surface-200 p-4">
                {group.fields.map(renderEnvField)}
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
    </div>
  );
};

export default ServerSettings;
