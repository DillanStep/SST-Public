import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Globe, Key, Map as MapIcon, RefreshCw, Server, Wifi } from 'lucide-react';
import { Button, Card, Input } from '../ui';
import { addServer, setActiveServerId } from '../../services/serverManager';
import { getMapPresetDefaults, MAP_PRESET_OPTIONS } from '../../maps/mapConfig';

interface AddServerSetupProps {
  onCancel: () => void;
  onSaved: () => void;
}

const normalizeApiUrl = (value: string) => value.trim().replace(/\/+$/, '');

const parsePositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const AddServerSetup: React.FC<AddServerSetupProps> = ({ onCancel, onSaved }) => {
  const defaultMap = getMapPresetDefaults('chernarusplus');
  const [serverName, setServerName] = useState('My DayZ Server');
  const [apiUrl, setApiUrl] = useState('http://localhost:3001');
  const [apiKey, setApiKey] = useState('');
  const [mapPreset, setMapPreset] = useState(defaultMap.id);
  const [mapLabel, setMapLabel] = useState('');
  const [mapImageUrl, setMapImageUrl] = useState(defaultMap.imageUrl);
  const [mapWorldSizeX, setMapWorldSizeX] = useState(String(defaultMap.worldSizeX));
  const [mapWorldSizeZ, setMapWorldSizeZ] = useState(String(defaultMap.worldSizeZ));
  const [mapInvertX, setMapInvertX] = useState(false);
  const [mapInvertZ, setMapInvertZ] = useState(false);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const selectedMap = useMemo(() => getMapPresetDefaults(mapPreset), [mapPreset]);

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
    return '';
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
      const response = await fetch(`${normalizeApiUrl(apiUrl)}/health`, {
        headers: { 'x-api-key': apiKey.trim() },
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

  const handleSave = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const savedServer = addServer({
      name: serverName.trim(),
      apiUrl: normalizeApiUrl(apiUrl),
      apiKey: apiKey.trim(),
      mapPreset,
      mapLabel: mapLabel.trim(),
      mapImageUrl: mapImageUrl.trim(),
      mapWorldSizeX: parsePositiveNumber(mapWorldSizeX, selectedMap.worldSizeX),
      mapWorldSizeZ: parsePositiveNumber(mapWorldSizeZ, selectedMap.worldSizeZ),
      mapInvertX,
      mapInvertZ,
    });

    setActiveServerId(savedServer.id);
    onSaved();
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">Server Name</label>
                <Input
                  type="text"
                  value={serverName}
                  onChange={(event) => setServerName(event.target.value)}
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
                <label className="block text-sm font-medium text-surface-700 mb-2">API Key</label>
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

          <div className="flex flex-col sm:flex-row gap-2 justify-end border-t border-surface-200 pt-6">
            <Button variant="secondary" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
              {testStatus === 'testing' ? (
                <RefreshCw size={16} className="mr-1 animate-spin" />
              ) : (
                <Wifi size={16} className="mr-1" />
              )}
              Test Connection
            </Button>
            <Button onClick={handleSave}>
              <Check size={16} className="mr-1" />
              Save Server
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
