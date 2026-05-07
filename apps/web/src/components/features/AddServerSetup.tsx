import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Globe, Key, Map as MapIcon, RefreshCw, Server, Wifi } from 'lucide-react';
import { Button, Card, Input } from '../ui';
import api from '../../services/api';
import { addServer, getActiveServer, getServers, setActiveServerId, updateServer } from '../../services/serverManager';
import { copyAuthTokenToServer, getAuthToken } from '../../services/auth';
import { getMapPresetDefaults, MAP_PRESET_OPTIONS } from '../../maps/mapConfig';

interface AddServerSetupProps {
  onCancel: () => void;
  onSaved: () => void;
}

const normalizeApiUrl = (value: string) => value.trim().replace(/\/+$/, '');

const generateApiKey = () => {
  const bytes = new Uint8Array(32);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

const parsePositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const slugifyProfileName = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const buildUniqueProfileName = (serverName: string) => {
  const base = slugifyProfileName(serverName) || 'server';
  const usedProfiles = new Set(
    getServers()
      .map(server => server.apiProfile)
      .filter(Boolean)
      .map(profile => slugifyProfileName(profile || ''))
  );

  let candidate = base;
  let suffix = 2;
  while (usedProfiles.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

export const AddServerSetup: React.FC<AddServerSetupProps> = ({ onCancel, onSaved }) => {
  const defaultMap = getMapPresetDefaults('chernarusplus');
  const activeServer = getActiveServer();
  const [serverName, setServerName] = useState('My DayZ Server');
  const [apiUrl, setApiUrl] = useState(activeServer?.apiUrl || 'http://localhost:3001');
  const [apiProfile, setApiProfile] = useState(() => buildUniqueProfileName('My DayZ Server'));
  const [apiProfileEdited, setApiProfileEdited] = useState(false);
  const [apiKey, setApiKey] = useState(activeServer?.apiKey || '');
  const [mapPreset, setMapPreset] = useState(defaultMap.id);
  const [mapLabel, setMapLabel] = useState('');
  const [mapImageUrl, setMapImageUrl] = useState(defaultMap.imageUrl);
  const [mapWorldSizeX, setMapWorldSizeX] = useState(String(defaultMap.worldSizeX));
  const [mapWorldSizeZ, setMapWorldSizeZ] = useState(String(defaultMap.worldSizeZ));
  const [mapInvertX, setMapInvertX] = useState(false);
  const [mapInvertZ, setMapInvertZ] = useState(false);
  const [error, setError] = useState('');
  const [keyMessage, setKeyMessage] = useState(activeServer ? 'Using the current API key for this API URL.' : '');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [savingServer, setSavingServer] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const selectedMap = useMemo(() => getMapPresetDefaults(mapPreset), [mapPreset]);
  const normalizedProfile = slugifyProfileName(apiProfile || serverName) || 'server';
  const envFileName = `${normalizedProfile}.env`;

  const handleServerNameChange = (value: string) => {
    setServerName(value);
    if (!apiProfileEdited) {
      setApiProfile(buildUniqueProfileName(value));
    }
  };

  const handleMapPresetChange = (value: string) => {
    const nextMap = getMapPresetDefaults(value);
    setMapPreset(nextMap.id);
    setMapLabel('');
    setMapImageUrl(nextMap.imageUrl);
    setMapWorldSizeX(String(nextMap.worldSizeX));
    setMapWorldSizeZ(String(nextMap.worldSizeZ));
    setMapInvertX(false);
    setMapInvertZ(false);
  };

  const validate = () => {
    if (!serverName.trim()) return 'Server name is required';
    if (!apiUrl.trim()) return 'API URL is required';
    if (!apiKey.trim()) return 'API key is required';
    if (!normalizedProfile) return 'API profile is required';
    return '';
  };

  const handleGenerateApiKey = () => {
    setApiKey(generateApiKey());
    setKeyMessage('Generated a new key in the form. Save it to the API .env before using it for connections.');
    setError('');
    setTestStatus('idle');
  };

  const handleGenerateAndSaveApiKey = async () => {
    const currentActiveServer = getActiveServer();
    if (!currentActiveServer) {
      setError('Connect to an existing API as an admin before saving a generated key to .env.');
      return;
    }

    if (normalizeApiUrl(currentActiveServer.apiUrl) !== normalizeApiUrl(apiUrl)) {
      setError('API key saving is only available for the currently connected API URL.');
      return;
    }

    const nextKey = generateApiKey();
    setApiKey(nextKey);
    setSavingApiKey(true);
    setError('');
    setKeyMessage('');

    try {
      api.loadActiveServer();
      const result = await api.updateRuntimeConfig({ API_KEY: nextKey });
      for (const server of getServers()) {
        if (normalizeApiUrl(server.apiUrl) === normalizeApiUrl(currentActiveServer.apiUrl)) {
          updateServer(server.id, { apiKey: nextKey });
        }
      }
      api.configure(currentActiveServer.apiUrl, nextKey, currentActiveServer.apiProfile);
      setKeyMessage(result.restartRequired
        ? 'Saved API_KEY to .env. The API is restarting; retry the connection after it comes back.'
        : 'API_KEY already matched .env.');
      setTestStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key to .env');
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleTestConnection = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setTestStatus('testing');
    try {
      const response = await fetch(`${normalizeApiUrl(apiUrl)}/servers`, {
        headers: {
          'x-api-key': apiKey.trim(),
        },
      });
      setTestStatus(response.ok ? 'success' : 'error');
      if (!response.ok) {
        setError(`Connection failed: API returned ${response.status}`);
      }
    } catch (err) {
      setTestStatus('error');
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const createProfileOnApi = async () => {
    const token = getAuthToken();
    const response = await fetch(`${normalizeApiUrl(apiUrl)}/servers/profiles`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        name: serverName.trim(),
        profile: normalizedProfile,
        mapPreset,
        mapLabel: mapLabel.trim(),
        mapImageUrl: mapImageUrl.trim(),
        mapWorldSizeX: parsePositiveNumber(mapWorldSizeX, selectedMap.worldSizeX),
        mapWorldSizeZ: parsePositiveNumber(mapWorldSizeZ, selectedMap.worldSizeZ),
        mapInvertX,
        mapInvertZ,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data?.details === 'string'
        ? data.details
        : typeof data?.error === 'string'
          ? data.error
          : `Failed to create ${envFileName} (${response.status})`;
      throw new Error(message);
    }

    return data;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingServer(true);
    setError('');

    try {
      const profileResult = await createProfileOnApi();
      const savedProfile = profileResult?.profile?.id || normalizedProfile;

      const savedServer = addServer({
        name: serverName.trim(),
        apiUrl: normalizeApiUrl(apiUrl),
        apiKey: apiKey.trim(),
        apiProfile: savedProfile,
        mapPreset,
        mapLabel: mapLabel.trim(),
        mapImageUrl: mapImageUrl.trim(),
        mapWorldSizeX: parsePositiveNumber(mapWorldSizeX, selectedMap.worldSizeX),
        mapWorldSizeZ: parsePositiveNumber(mapWorldSizeZ, selectedMap.worldSizeZ),
        mapInvertX,
        mapInvertZ,
      });

      copyAuthTokenToServer(savedServer.id);
      setActiveServerId(savedServer.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to create ${envFileName}`);
    } finally {
      setSavingServer(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card compact>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Server className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-surface-800">Set Up New Server</h2>
              <p className="text-xs sm:text-sm text-surface-500">Add another SST API connection and map profile</p>
            </div>
          </div>
          <Button variant="secondary" onClick={onCancel} size="sm">
            <ArrowLeft size={16} className="mr-1" />
            Back
          </Button>
        </div>

        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-surface-500" />
              <h3 className="text-sm font-semibold text-surface-800">Connection</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">Server Name</label>
                <Input
                  type="text"
                  value={serverName}
                  onChange={(event) => handleServerNameChange(event.target.value)}
                  placeholder="My DayZ Server"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">API URL</label>
                <Input
                  type="text"
                  value={apiUrl}
                  onChange={(event) => setApiUrl(event.target.value)}
                  placeholder="http://localhost:3001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">API Profile / Env File</label>
                <Input
                  type="text"
                  value={apiProfile}
                  onChange={(event) => {
                    setApiProfileEdited(true);
                    setApiProfile(event.target.value);
                  }}
                  placeholder="my-dayz-server"
                />
                <p className="mt-2 text-xs text-surface-400">
                  Creates {envFileName} on this API.
                </p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-surface-700">API Key</label>
                  <button
                    type="button"
                    onClick={handleGenerateApiKey}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    Generate
                  </button>
                </div>
                <div className="relative">
                  <Key size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Enter API key"
                    className="w-full rounded-lg border border-surface-300 py-2 pl-9 pr-3 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateAndSaveApiKey}
                    loading={savingApiKey}
                  >
                    Generate & Save to API .env
                  </Button>
                </div>
                <p className="mt-2 text-xs text-surface-400">
                  Same API URL? Reuse the current key. Generate & Save rotates the shared API key.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-surface-200 pt-6">
            <div className="flex items-center gap-2">
              <MapIcon size={18} className="text-surface-500" />
              <h3 className="text-sm font-semibold text-surface-800">Map</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">Map Preset</label>
                <select
                  value={mapPreset}
                  onChange={(event) => handleMapPresetChange(event.target.value)}
                  className="w-full rounded-lg border border-surface-300 px-3 py-2 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                >
                  {MAP_PRESET_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">Map Label</label>
                <Input
                  type="text"
                  value={mapLabel}
                  onChange={(event) => setMapLabel(event.target.value)}
                  placeholder={selectedMap.label}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">Map Image</label>
                <Input
                  type="text"
                  value={mapImageUrl}
                  onChange={(event) => setMapImageUrl(event.target.value)}
                  placeholder="/maps/chernarus.jpg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">World Size X</label>
                <Input
                  type="number"
                  value={mapWorldSizeX}
                  onChange={(event) => setMapWorldSizeX(event.target.value)}
                  placeholder={String(selectedMap.worldSizeX)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">World Size Z</label>
                <Input
                  type="number"
                  value={mapWorldSizeZ}
                  onChange={(event) => setMapWorldSizeZ(event.target.value)}
                  placeholder={String(selectedMap.worldSizeZ)}
                />
              </div>
              <label className="flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-700">
                <input
                  type="checkbox"
                  checked={mapInvertX}
                  onChange={(event) => setMapInvertX(event.target.checked)}
                  className="h-4 w-4 rounded border-surface-300"
                />
                Invert X Axis
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-700">
                <input
                  type="checkbox"
                  checked={mapInvertZ}
                  onChange={(event) => setMapInvertZ(event.target.checked)}
                  className="h-4 w-4 rounded border-surface-300"
                />
                Invert Z Axis
              </label>
            </div>
          </section>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {testStatus === 'success' && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Connection OK</p>
          )}

          {keyMessage && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{keyMessage}</p>
          )}

          <div className="flex flex-col sm:flex-row gap-2 justify-end border-t border-surface-200 pt-6">
            <Button variant="secondary" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
              {testStatus === 'testing' ? (
                <RefreshCw size={16} className="mr-1 animate-spin" />
              ) : (
                <Wifi size={16} className="mr-1" />
              )}
              Test Connection
            </Button>
            <Button onClick={handleSave} loading={savingServer}>
              <Check size={16} className="mr-1" />
              Save Server
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
