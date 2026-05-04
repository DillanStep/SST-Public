import React, { useCallback, useEffect, useState } from 'react';
import { 
  Server, Cloud, HardDrive, ChevronRight, ChevronLeft, Check, 
  AlertCircle, RefreshCw, Key, User, Lock, Wifi, 
  CheckCircle2, XCircle, Map as MapIcon
} from 'lucide-react';
import { Button, Input } from '../ui';
import type { SetupStatusResponse, SetupStoragePayload, SetupTestResponse, StorageBackend } from '../../types';
import { detectMapPresetFromMissionPath, getMapPresetDefaults, MAP_PRESET_OPTIONS } from '../../maps/mapConfig';

type HostingType = 'provider' | 'dedicated' | null;
type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

interface SetupWizardProps {
  apiUrl: string;
  onComplete: (config: {
    serverName: string;
    apiKey: string;
    username: string;
  }) => void;
}

const isAbsoluteLocalPath = (value: string) => {
  const trimmed = value.trim().replace(/\\/g, '/');
  return /^[a-zA-Z]:\//.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('//');
};

export const SetupWizard: React.FC<SetupWizardProps> = ({ apiUrl, onComplete }) => {
  // Wizard step (1-5)
  const [step, setStep] = useState(1);
  const defaultMap = getMapPresetDefaults('chernarusplus');
  
  // Step 1: Hosting type
  const [hostingType, setHostingType] = useState<HostingType>(null);
  
  // Step 2: Connection details
  const [backend, setBackend] = useState<StorageBackend>('sftp');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remoteRoot, setRemoteRoot] = useState('/');
  const [sstPath, setSstPath] = useState('');
  const [profilesPath, setProfilesPath] = useState('');
  const [missionPath, setMissionPath] = useState('');
  const [typesPath, setTypesPath] = useState('');
  const [expansionEnabled, setExpansionEnabled] = useState(false);
  const [expansionTradersPath, setExpansionTradersPath] = useState('');
  const [expansionMarketPath, setExpansionMarketPath] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [mapPreset, setMapPreset] = useState(defaultMap.id);
  const [mapLabel, setMapLabel] = useState('');
  const [mapImageUrl, setMapImageUrl] = useState(defaultMap.imageUrl);
  const [mapWorldSizeX, setMapWorldSizeX] = useState(String(defaultMap.worldSizeX));
  const [mapWorldSizeZ, setMapWorldSizeZ] = useState(String(defaultMap.worldSizeZ));
  const [mapInvertX, setMapInvertX] = useState(false);
  const [mapInvertZ, setMapInvertZ] = useState(false);
  const [mapAutoDetectEnabled, setMapAutoDetectEnabled] = useState(true);
  
  // URL paste helper
  const [pasteUrl, setPasteUrl] = useState('');
  
  // Step 3: Connection test
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testDetails, setTestDetails] = useState<{
    onlineCount?: number;
    playersLen?: number;
    fileSize?: number;
  } | null>(null);
  
  // Step 4: API Key
  const [apiKey, setApiKey] = useState('');
  
  // Step 5: Server name and admin
  const [serverName, setServerName] = useState('My DayZ Server');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  
  // General
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const selectedMap = getMapPresetDefaults(mapPreset);

  const runtimeFolderWarning = (
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
      <div className="space-y-2">
        <p className="font-medium">Start the DayZ server with @SST before testing.</p>
        <p>
          The mod creates a runtime folder at $storage:SST after it has loaded. Start DayZ with -scrAllowFileWrite, then point this field at the mission storage SST folder, not the @SST mod package or repo source folder.
        </p>
        <p className="text-xs text-amber-700">
          Expected contents include api/online_players.json, api/server_items.json, inventories/, events/, life_events/, and optional trades/ or vehicles/ data when those features are used.
        </p>
      </div>
    </div>
  );

  const handleMapPresetChange = useCallback((value: string, manual = true) => {
    const nextMap = getMapPresetDefaults(value);
    if (manual) setMapAutoDetectEnabled(false);
    setMapPreset(nextMap.id);
    setMapLabel('');
    setMapImageUrl(nextMap.imageUrl);
    setMapWorldSizeX(String(nextMap.worldSizeX));
    setMapWorldSizeZ(String(nextMap.worldSizeZ));
    setMapInvertX(false);
    setMapInvertZ(false);
  }, []);

  const parseMapSize = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  useEffect(() => {
    if (!mapAutoDetectEnabled) return;

    const detectedPreset = detectMapPresetFromMissionPath(missionPath);
    if (!detectedPreset || detectedPreset === mapPreset) return;

    handleMapPresetChange(detectedPreset, false);
  }, [missionPath, mapPreset, mapAutoDetectEnabled, handleMapPresetChange]);

  useEffect(() => {
    setConnectionStatus('idle');
    setTestResult(null);
    setTestDetails(null);
  }, [
    hostingType,
    backend,
    host,
    port,
    username,
    password,
    remoteRoot,
    sstPath,
    profilesPath,
    missionPath,
    typesPath,
    expansionEnabled,
    expansionTradersPath,
    expansionMarketPath,
    localPath,
  ]);

  // Parse pasted URL (for hosting providers like HostHavoc)
  const parseUrl = () => {
    const raw = pasteUrl.trim();
    if (!raw) return;

    try {
      let pathPart = raw;
      
      // Check if it's a full URL
      if (/^[a-zA-Z]+:\/\//.test(raw)) {
        const u = new URL(raw);
        if (u.hostname) setHost(u.hostname);
        if (u.port) setPort(u.port);
        const userFromUrl = (u.username || '').trim();
        if (userFromUrl) setUsername(userFromUrl);
        pathPart = u.pathname;
      }

      // Clean up path
      pathPart = pathPart.replace(/\\/g, '/');
      if (!pathPart.startsWith('/')) pathPart = `/${pathPart}`;
      // Strip known SST subdirectories so we get the SST root
      pathPart = pathPart.replace(/\/api\/online_players\.json$/i, '');
      pathPart = pathPart.replace(/\/(api|events|inventories|life_events|trades)\/?$/i, '');

      const parts = pathPart.split('/').filter(Boolean);
      if (parts.length >= 2) {
        // First part is the remote root (e.g., 104.234.251.153_2332)
        // Rest is the SST path (e.g., HostHavocDayZServer/SST)
        setRemoteRoot(`/${parts[0]}`);
        setSstPath(parts.slice(1).join('/'));
      } else if (parts.length === 1) {
        // Only one part - treat as SST path with root /
        setRemoteRoot('/');
        setSstPath(parts[0]);
      }
    } catch {
      setError('Could not parse URL. Enter details manually.');
    }
  };

  // Test connection to the server
  const testConnection = async () => {
    setConnectionStatus('testing');
    setTestResult(null);
    setTestDetails(null);
    setError(null);

    try {
      if (hostingType === 'dedicated' && !isAbsoluteLocalPath(localPath)) {
        setConnectionStatus('error');
        setTestResult('Enter the full path to your SST folder, for example C:\\DayZServer\\profiles\\SST.');
        return;
      }

      // Normalize paths - ensure sstPath doesn't include the remoteRoot
      let testSstPath = sstPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const normalizedRoot = remoteRoot.replace(/\\/g, '/').replace(/^\/+/, '');
      
      // If sstPath starts with the remoteRoot prefix, strip it
      if (normalizedRoot && normalizedRoot !== '/' && testSstPath.startsWith(normalizedRoot)) {
        testSstPath = testSstPath.slice(normalizedRoot.length).replace(/^\/+/, '');
      }

      const payload: SetupStoragePayload = {
        backend: hostingType === 'dedicated' ? 'local' : backend, 
        sstPath: hostingType === 'dedicated' ? localPath : testSstPath 
      };
      
      if (hostingType === 'provider') {
        if (backend === 'sftp') {
          payload.sftp = { host, port: Number(port), username, password, root: remoteRoot };
        } else if (backend === 'ftp') {
          payload.ftp = { host, port: Number(port), username, password, root: remoteRoot, secure: true };
        }
      }

      const resp = await fetch(`${apiUrl}/setup/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await resp.json() as SetupTestResponse;
      
      if (!resp.ok) {
        setConnectionStatus('error');
        setTestResult(json?.details || json?.error || `Test failed (${resp.status})`);
        return;
      }

      setConnectionStatus('success');
      setTestDetails({
        onlineCount: json?.parsed?.onlineCount,
        playersLen: json?.parsed?.playersLen,
        fileSize: json?.stat?.size,
      });
      setTestResult('Connection successful! Found SST data files.');
    } catch (e) {
      setConnectionStatus('error');
      setTestResult(e instanceof Error ? e.message : 'Connection failed');
    }
  };

  // Save configuration to API .env
  const saveConfiguration = async () => {
    setWorking(true);
    setError(null);

    try {
      // Normalize paths - ensure sstPath doesn't include the remoteRoot
      let finalSstPath = sstPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const normalizedRoot = remoteRoot.replace(/\\/g, '/').replace(/^\/+/, '');
      
      // If sstPath starts with the remoteRoot prefix, strip it
      if (normalizedRoot && normalizedRoot !== '/' && finalSstPath.startsWith(normalizedRoot)) {
        finalSstPath = finalSstPath.slice(normalizedRoot.length).replace(/^\/+/, '');
      }

      // Normalize profiles path too
      let finalProfilesPath = profilesPath.replace(/\\/g, '/').replace(/^\/+/, '');
      if (normalizedRoot && normalizedRoot !== '/' && finalProfilesPath.startsWith(normalizedRoot)) {
        finalProfilesPath = finalProfilesPath.slice(normalizedRoot.length).replace(/^\/+/, '');
      }

      const normalizeOptionalServerPath = (value: string) => {
        let normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
        if (normalizedRoot && normalizedRoot !== '/' && normalized.startsWith(normalizedRoot)) {
          normalized = normalized.slice(normalizedRoot.length).replace(/^\/+/, '');
        }
        return normalized;
      };

      const payload: SetupStoragePayload = {
        backend: hostingType === 'dedicated' ? 'local' : backend, 
        sstPath: hostingType === 'dedicated' ? localPath : finalSstPath,
        profilesPath: hostingType === 'dedicated' ? profilesPath : finalProfilesPath,
        missionPath: hostingType === 'dedicated' ? missionPath : normalizeOptionalServerPath(missionPath),
        typesPath: hostingType === 'dedicated' ? typesPath : normalizeOptionalServerPath(typesPath),
        expansionEnabled,
        expansionTradersPath: hostingType === 'dedicated' ? expansionTradersPath : normalizeOptionalServerPath(expansionTradersPath),
        expansionMarketPath: hostingType === 'dedicated' ? expansionMarketPath : normalizeOptionalServerPath(expansionMarketPath),
        mapPreset,
        mapLabel: mapLabel.trim(),
        mapImageUrl: mapImageUrl.trim(),
        mapWorldSizeX: parseMapSize(mapWorldSizeX, selectedMap.worldSizeX),
        mapWorldSizeZ: parseMapSize(mapWorldSizeZ, selectedMap.worldSizeZ),
        mapInvertX,
        mapInvertZ,
      };
      
      if (hostingType === 'provider') {
        if (backend === 'sftp') {
          payload.sftp = { host, port: Number(port), username, password, root: remoteRoot };
        } else if (backend === 'ftp') {
          payload.ftp = { host, port: Number(port), username, password, root: remoteRoot, secure: true };
        }
      }

      const resp = await fetch(`${apiUrl}/setup/apply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const json = await resp.json() as SetupTestResponse;
        throw new Error(json?.error || 'Failed to save configuration');
      }

      // Fetch the API key
      const statusResp = await fetch(`${apiUrl}/setup/status`, { 
        method: 'GET', 
        credentials: 'include' 
      });
      
      if (statusResp.ok) {
        const status = await statusResp.json() as SetupStatusResponse;
        if (status?.apiKey) {
          setApiKey(status.apiKey);
        }
      }

      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setWorking(false);
    }
  };

  // Generate a new API key
  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'sst_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setApiKey(key);
  };

  // Create admin account
  const createAdmin = async () => {
    if (adminPassword !== adminPasswordConfirm) {
      setError('Passwords do not match');
      return;
    }
    if (adminPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!adminUsername.trim()) {
      setError('Username is required');
      return;
    }

    setCreatingAdmin(true);
    setError(null);

    try {
      const resp = await fetch(`${apiUrl}/auth/setup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          username: adminUsername.trim(),
          password: adminPassword,
        }),
      });

      if (!resp.ok) {
        const json = await resp.json() as SetupTestResponse;
        throw new Error(json?.error || 'Failed to create admin account');
      }

      // Success! Call the completion handler
      onComplete({
        serverName,
        apiKey,
        username: adminUsername.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create admin');
    } finally {
      setCreatingAdmin(false);
    }
  };

  // Step indicator
  const steps = [
    { num: 1, label: 'Hosting' },
    { num: 2, label: 'Connection' },
    { num: 3, label: 'Verify' },
    { num: 4, label: 'API Key' },
    { num: 5, label: 'Account' },
  ];

  const canProceedStep1 = hostingType !== null;
  const canProceedStep2 = hostingType === 'dedicated' 
    ? isAbsoluteLocalPath(localPath) 
    : (host.trim().length > 0 && sstPath.trim().length > 0);
  const canProceedStep3 = connectionStatus === 'success';
  const canProceedStep4 = apiKey.trim().length > 0;
  const canProceedStep5 = adminUsername.trim().length > 0 && adminPassword.length >= 6 && adminPassword === adminPasswordConfirm;

  return (
    <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/banners/LOGO-mark.png" alt="SST" className="mx-auto mb-4 h-16 w-16 object-contain" />
          <h1 className="text-2xl font-bold text-surface-800">SST Dashboard Setup</h1>
          <p className="text-surface-500 mt-2">Let's configure your DayZ server connection</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((s, i) => (
            <React.Fragment key={s.num}>
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step > s.num 
                    ? 'bg-emerald-500 text-white' 
                    : step === s.num 
                      ? 'bg-surface-700 text-white' 
                      : 'bg-surface-200 text-surface-500'
                }`}>
                  {step > s.num ? <Check size={18} /> : s.num}
                </div>
                <span className={`text-xs mt-1 ${step >= s.num ? 'text-surface-700' : 'text-surface-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-12 h-0.5 mx-2 ${step > s.num ? 'bg-emerald-500' : 'bg-surface-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-8">
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm mb-6">
              <AlertCircle size={18} className="flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
            </div>
          )}

          {/* Step 1: Hosting Type */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-surface-800 mb-2">Where is your DayZ server hosted?</h2>
                <p className="text-surface-500">This helps us configure how to connect to your server files.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setHostingType('provider')}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    hostingType === 'provider'
                      ? 'border-surface-700 bg-surface-50'
                      : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <Cloud size={32} className={hostingType === 'provider' ? 'text-surface-700' : 'text-surface-400'} />
                  <h3 className="font-semibold text-surface-800 mt-3">Hosting Provider</h3>
                  <p className="text-sm text-surface-500 mt-1">
                    HostHavoc, GTXGaming, Nitrado, or similar game server provider
                  </p>
                </button>

                <button
                  onClick={() => setHostingType('dedicated')}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    hostingType === 'dedicated'
                      ? 'border-surface-700 bg-surface-50'
                      : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <HardDrive size={32} className={hostingType === 'dedicated' ? 'text-surface-700' : 'text-surface-400'} />
                  <h3 className="font-semibold text-surface-800 mt-3">Dedicated / Local</h3>
                  <p className="text-sm text-surface-500 mt-1">
                    Your own server, VPS, or running locally on this machine
                  </p>
                </button>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  variant="primary"
                  disabled={!canProceedStep1}
                  onClick={() => {
                    if (hostingType === 'dedicated') setBackend('local');
                    setStep(2);
                  }}
                  icon={<ChevronRight size={18} />}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Connection Details */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-surface-800 mb-2">
                  {hostingType === 'provider' ? 'Server Connection Details' : 'SST Runtime File Location'}
                </h2>
                <p className="text-surface-500">
                  {hostingType === 'provider' 
                    ? 'Enter your SFTP/FTP credentials from your hosting provider.' 
                    : 'Enter the path to the generated SST runtime folder in your DayZ server profiles directory.'}
                </p>
              </div>

              {runtimeFolderWarning}

              {hostingType === 'provider' ? (
                <>
                  {/* Protocol Selection */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setBackend('sftp'); setPort('22'); }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        backend === 'sftp' 
                          ? 'bg-surface-700 text-white' 
                          : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                      }`}
                    >
                      SFTP
                    </button>
                    <button
                      onClick={() => { setBackend('ftp'); setPort('21'); }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        backend === 'ftp' 
                          ? 'bg-surface-700 text-white' 
                          : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                      }`}
                    >
                      FTP
                    </button>
                  </div>

                  {/* URL Paste Helper */}
                  <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                    <label className="block text-sm font-medium text-surface-600 mb-2">
                      Quick Setup: Paste your SFTP URL
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={pasteUrl}
                        onChange={(e) => setPasteUrl(e.target.value)}
                        placeholder="sftp://user@host:port/path/to/SST"
                        className="flex-1"
                      />
                      <Button variant="secondary" onClick={parseUrl}>
                        Parse
                      </Button>
                    </div>
                    <p className="text-xs text-surface-400 mt-2">
                      Example: sftp://sudo@104.234.251.153:8822/104.234.251.153_2332/HostHavocDayZServer/SST
                    </p>
                  </div>

                  {/* Manual Entry */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-600 mb-2">Host</label>
                      <Input
                        type="text"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="104.234.251.153"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-surface-600 mb-2">Port</label>
                      <Input
                        type="text"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder={backend === 'sftp' ? '22' : '21'}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-600 mb-2">Username</label>
                      <Input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Your SFTP username"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-surface-600 mb-2">Password</label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your SFTP password"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-600 mb-2">Remote Root</label>
                      <Input
                        type="text"
                        value={remoteRoot}
                        onChange={(e) => setRemoteRoot(e.target.value)}
                        placeholder="/104.234.251.153_2332"
                      />
                      <p className="text-xs text-surface-400 mt-1">Base path on the server</p>
                    </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">SST Path</label>
                    <Input
                      type="text"
                      value={sstPath}
                        onChange={(e) => setSstPath(e.target.value)}
                        placeholder="HostHavocDayZServer/SST"
                      />
                      <p className="text-xs text-surface-400 mt-1">Path to SST folder from root</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">Profiles Path (Optional)</label>
                    <Input
                      type="text"
                      value={profilesPath}
                      onChange={(e) => setProfilesPath(e.target.value)}
                      placeholder="HostHavocDayZServer/profiles"
                    />
                    <p className="text-xs text-surface-400 mt-1">Path to server profiles folder (for logs). Leave empty to skip log features.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">Mission Files Path (Optional)</label>
                    <Input
                      type="text"
                      value={missionPath}
                      onChange={(e) => setMissionPath(e.target.value)}
                      placeholder="HostHavocDayZServer/mpmissions/dayzOffline.chernarusplus"
                    />
                    <p className="text-xs text-surface-400 mt-1">Folder containing db/types.xml and mission economy files.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">Custom Types.xml Path (Optional)</label>
                    <Input
                      type="text"
                      value={typesPath}
                      onChange={(e) => setTypesPath(e.target.value)}
                      placeholder="HostHavocDayZServer/mpmissions/dayzOffline.chernarusplus/db/types.xml"
                    />
                  </div>

                  <label className="flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm text-surface-700">
                    <input
                      type="checkbox"
                      checked={expansionEnabled}
                      onChange={(e) => setExpansionEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-300"
                    />
                    <span>Enable DayZ Expansion paths</span>
                  </label>

                  {expansionEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-surface-600 mb-2">Expansion Traders Path</label>
                        <Input
                          type="text"
                          value={expansionTradersPath}
                          onChange={(e) => setExpansionTradersPath(e.target.value)}
                          placeholder="HostHavocDayZServer/profiles/ExpansionMod/Traders"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-surface-600 mb-2">Expansion Market Path</label>
                        <Input
                          type="text"
                          value={expansionMarketPath}
                          onChange={(e) => setExpansionMarketPath(e.target.value)}
                          placeholder="HostHavocDayZServer/profiles/ExpansionMod/Market"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Local/Dedicated Setup */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">
                      SST Runtime Folder Path
                    </label>
                    <Input
                      type="text"
                      value={localPath}
                      onChange={(e) => setLocalPath(e.target.value)}
                      placeholder="C:\\DayZServer\\mpmissions\\dayzOffline.chernarusplus\\storage_1\\SST"
                    />
                    <p className="text-xs text-surface-400 mt-2">
                      Enter the full path to the generated SST runtime folder in mission storage.
                    </p>
                    {localPath.trim().length > 0 && !isAbsoluteLocalPath(localPath) && (
                      <p className="text-xs text-red-600 mt-2">
                        Use a full path like C:\DayZServer\mpmissions\dayzOffline.chernarusplus\storage_1\SST, not a placeholder or relative folder name.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">Mission Files Path (Optional)</label>
                    <Input
                      type="text"
                      value={missionPath}
                      onChange={(e) => setMissionPath(e.target.value)}
                      placeholder="C:\\DayZServer\\mpmissions\\dayzOffline.chernarusplus"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">Profiles Path (Optional)</label>
                    <Input
                      type="text"
                      value={profilesPath}
                      onChange={(e) => setProfilesPath(e.target.value)}
                      placeholder="C:\\DayZServer\\Server1"
                    />
                  </div>

                  <label className="flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm text-surface-700">
                    <input
                      type="checkbox"
                      checked={expansionEnabled}
                      onChange={(e) => setExpansionEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-300"
                    />
                    <span>Enable DayZ Expansion paths</span>
                  </label>

                  {expansionEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-surface-600 mb-2">Expansion Traders Path</label>
                        <Input
                          type="text"
                          value={expansionTradersPath}
                          onChange={(e) => setExpansionTradersPath(e.target.value)}
                          placeholder="C:\\DayZServer\\Server1\\ExpansionMod\\Traders"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-surface-600 mb-2">Expansion Market Path</label>
                        <Input
                          type="text"
                          value={expansionMarketPath}
                          onChange={(e) => setExpansionMarketPath(e.target.value)}
                          placeholder="C:\\DayZServer\\Server1\\ExpansionMod\\Market"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <MapIcon size={18} className="text-surface-600" />
                  <h3 className="text-sm font-semibold text-surface-800">Map</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">Map Preset</label>
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
                    <label className="block text-sm font-medium text-surface-600 mb-2">Map Label</label>
                    <Input
                      type="text"
                      value={mapLabel}
                      onChange={(event) => setMapLabel(event.target.value)}
                      placeholder={selectedMap.label}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">Map Image</label>
                    <Input
                      type="text"
                      value={mapImageUrl}
                      onChange={(event) => setMapImageUrl(event.target.value)}
                      placeholder="/maps/chernarus.jpg"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">World Size X</label>
                    <Input
                      type="number"
                      value={mapWorldSizeX}
                      onChange={(event) => setMapWorldSizeX(event.target.value)}
                      placeholder={String(selectedMap.worldSizeX)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">World Size Z</label>
                    <Input
                      type="number"
                      value={mapWorldSizeZ}
                      onChange={(event) => setMapWorldSizeZ(event.target.value)}
                      placeholder={String(selectedMap.worldSizeZ)}
                    />
                  </div>
                  <label className="flex items-center gap-3 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700">
                    <input
                      type="checkbox"
                      checked={mapInvertX}
                      onChange={(event) => setMapInvertX(event.target.checked)}
                      className="h-4 w-4 rounded border-surface-300"
                    />
                    Invert X Axis
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700">
                    <input
                      type="checkbox"
                      checked={mapInvertZ}
                      onChange={(event) => setMapInvertZ(event.target.checked)}
                      className="h-4 w-4 rounded border-surface-300"
                    />
                    Invert Z Axis
                  </label>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={() => setStep(1)} icon={<ChevronLeft size={18} />}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  disabled={!canProceedStep2}
                  onClick={() => setStep(3)}
                  icon={<ChevronRight size={18} />}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Test Connection */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-surface-800 mb-2">Test Connection</h2>
                <p className="text-surface-500">
                  Let's verify we can connect to your server and find the SST files.
                </p>
              </div>

              {/* Connection Summary */}
              <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                <h3 className="font-medium text-surface-700 mb-3">Connection Details</h3>
                {hostingType === 'provider' ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-surface-500">Protocol:</span>
                      <span className="text-surface-700 font-medium">{backend.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">Host:</span>
                      <span className="text-surface-700 font-medium">{host}:{port}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">Username:</span>
                      <span className="text-surface-700 font-medium">{username}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">Remote Root:</span>
                      <span className="text-surface-700 font-medium font-mono text-xs text-right break-all">{remoteRoot}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">SST Path:</span>
                      <span className="text-surface-700 font-medium font-mono text-xs text-right break-all">{sstPath}</span>
                    </div>
                    {profilesPath && (
                      <div className="flex justify-between">
                        <span className="text-surface-500">Profiles Path:</span>
                        <span className="text-surface-700 font-medium font-mono text-xs text-right break-all">{profilesPath}</span>
                      </div>
                    )}
                    {missionPath && (
                      <div className="flex justify-between">
                        <span className="text-surface-500">Mission Path:</span>
                        <span className="text-surface-700 font-medium font-mono text-xs text-right break-all">{missionPath}</span>
                      </div>
                    )}
                    {typesPath && (
                      <div className="flex justify-between">
                        <span className="text-surface-500">Types.xml:</span>
                        <span className="text-surface-700 font-medium font-mono text-xs text-right break-all">{typesPath}</span>
                      </div>
                    )}
                    {expansionEnabled && (
                      <div className="flex justify-between">
                        <span className="text-surface-500">Expansion:</span>
                        <span className="text-surface-700 font-medium">Enabled</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-surface-500">Map:</span>
                      <span className="text-surface-700 font-medium">{mapLabel.trim() || selectedMap.label}</span>
                    </div>
                    <div className="flex justify-between border-t border-surface-200 pt-2 mt-2">
                      <span className="text-surface-500">Full Path:</span>
                      <span className="text-surface-700 font-medium font-mono text-xs text-right break-all">{remoteRoot === '/' ? `/${sstPath}` : `${remoteRoot}/${sstPath}`}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-surface-500">Type:</span>
                      <span className="text-surface-700 font-medium">Local Files</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">Path:</span>
                      <span className="text-surface-700 font-medium text-right break-all">{localPath}</span>
                    </div>
                    {missionPath && (
                      <div className="flex justify-between">
                        <span className="text-surface-500">Mission Path:</span>
                        <span className="text-surface-700 font-medium text-right break-all">{missionPath}</span>
                      </div>
                    )}
                    {profilesPath && (
                      <div className="flex justify-between">
                        <span className="text-surface-500">Profiles Path:</span>
                        <span className="text-surface-700 font-medium text-right break-all">{profilesPath}</span>
                      </div>
                    )}
                    {expansionEnabled && (
                      <div className="flex justify-between">
                        <span className="text-surface-500">Expansion:</span>
                        <span className="text-surface-700 font-medium">Enabled</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-surface-500">Map:</span>
                      <span className="text-surface-700 font-medium">{mapLabel.trim() || selectedMap.label}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Test Button */}
              <div className="flex justify-center">
                <Button
                  variant={connectionStatus === 'success' ? 'primary' : 'secondary'}
                  onClick={testConnection}
                  disabled={connectionStatus === 'testing'}
                  icon={connectionStatus === 'testing' ? <RefreshCw size={18} className="animate-spin" /> : <Wifi size={18} />}
                  className="w-48"
                >
                  {connectionStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>

              {/* Test Result */}
              {connectionStatus !== 'idle' && connectionStatus !== 'testing' && (
                <div className={`rounded-xl p-4 border ${
                  connectionStatus === 'success' 
                    ? 'bg-emerald-50 border-emerald-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-start gap-3">
                    {connectionStatus === 'success' ? (
                      <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={connectionStatus === 'success' ? 'text-emerald-700' : 'text-red-700'}>
                        {testResult}
                      </p>
                      {testDetails && connectionStatus === 'success' && (
                        <div className="mt-2 text-sm text-emerald-600">
                          <p>Online Players: {testDetails.onlineCount ?? 'N/A'}</p>
                          <p>Total Players in File: {testDetails.playersLen ?? 'N/A'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={() => setStep(2)} icon={<ChevronLeft size={18} />}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  disabled={!canProceedStep3 || working}
                  onClick={saveConfiguration}
                  icon={working ? <RefreshCw size={18} className="animate-spin" /> : <ChevronRight size={18} />}
                >
                  {working ? 'Saving...' : 'Save & Continue'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: API Key */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-surface-800 mb-2">API Key</h2>
                <p className="text-surface-500">
                  This key secures communication between the dashboard and the API server.
                </p>
              </div>

              <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                <div className="flex items-center gap-3 mb-3">
                  <Key size={20} className="text-surface-600" />
                  <span className="font-medium text-surface-700">Your API Key</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="API key will appear here"
                    className="flex-1 font-mono text-sm"
                  />
                  <Button variant="secondary" onClick={generateApiKey}>
                    Generate New
                  </Button>
                </div>
                <p className="text-xs text-surface-400 mt-2">
                  This key has been saved to your API .env file. Keep it secret!
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={() => setStep(3)} icon={<ChevronLeft size={18} />}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  disabled={!canProceedStep4}
                  onClick={() => setStep(5)}
                  icon={<ChevronRight size={18} />}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Server Name and Admin Account */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-surface-800 mb-2">Final Setup</h2>
                <p className="text-surface-500">
                  Name your server and create your admin account.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-600 mb-2">
                  <Server size={16} className="inline mr-2" />
                  Server Name
                </label>
                <Input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="My DayZ Server"
                />
                <p className="text-xs text-surface-400 mt-1">
                  This is how you'll identify this server in the dashboard.
                </p>
              </div>

              <div className="border-t border-surface-200 pt-6">
                <h3 className="font-medium text-surface-700 mb-4">Create Admin Account</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">
                      <User size={16} className="inline mr-2" />
                      Username
                    </label>
                    <Input
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="admin"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">
                      <Lock size={16} className="inline mr-2" />
                      Password
                    </label>
                    <Input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Enter a secure password"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">
                      <Lock size={16} className="inline mr-2" />
                      Confirm Password
                    </label>
                    <Input
                      type="password"
                      value={adminPasswordConfirm}
                      onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                      placeholder="Confirm your password"
                    />
                    {adminPasswordConfirm && adminPassword !== adminPasswordConfirm && (
                      <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={() => setStep(4)} icon={<ChevronLeft size={18} />}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  disabled={!canProceedStep5 || creatingAdmin}
                  onClick={createAdmin}
                  icon={creatingAdmin ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                >
                  {creatingAdmin ? 'Creating...' : 'Complete Setup'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-surface-400 text-sm mt-6">
          SST Dashboard by SUDO Gaming
        </p>
      </div>
    </div>
  );
};

export default SetupWizard;
