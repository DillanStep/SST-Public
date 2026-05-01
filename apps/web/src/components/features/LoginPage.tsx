import React, { useState, useEffect } from 'react';
import { Server, LogIn, Eye, EyeOff, AlertCircle, Settings, Check, RefreshCw, ChevronRight } from 'lucide-react';
import { Button, Input } from '../ui';
import { getAuthStatus, login, setupFirstAdmin } from '../../services/auth';
import type { User } from '../../services/auth';
import { getActiveServer, addServer, setActiveServerId, updateServer } from '../../services/serverManager';
import type { ServerConfig, SetupStatusResponse, SetupStoragePayload, SetupTestResponse, StorageBackend } from '../../types';
import { SetupWizard } from './SetupWizard';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuthStatus, setCheckingAuthStatus] = useState(false);
  
  // Animation states
  const [mounted, setMounted] = useState(false);
  
  // Server configuration state
  const [activeServer, setActiveServer] = useState<ServerConfig | null>(null);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverName, setServerName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [serverApiKey, setServerApiKey] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // First-run setup state
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  // Environment setup (files/backend) state
  const [envSetupOpen, setEnvSetupOpen] = useState(false);
  const [envBackend, setEnvBackend] = useState<StorageBackend>('sftp');
  const [envPasteUrl, setEnvPasteUrl] = useState('');
  const [envRemoteRoot, setEnvRemoteRoot] = useState('/');
  const [envSstPath, setEnvSstPath] = useState('');
  const [envHost, setEnvHost] = useState('');
  const [envPort, setEnvPort] = useState('22');
  const [envUser, setEnvUser] = useState('');
  const [envPassword, setEnvPassword] = useState('');
  const [envTestResult, setEnvTestResult] = useState<string | null>(null);
  const [envWorking, setEnvWorking] = useState(false);
  const [allowNoApiKey, setAllowNoApiKey] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  // Auto-detect localhost API on first run
  const tryAutoDetectLocalApi = async () => {
    setAutoDetecting(true);
    const localUrls = ['http://localhost:3001', 'http://127.0.0.1:3001'];
    
    for (const url of localUrls) {
      try {
        const healthResp = await fetch(`${url}/health`, { method: 'GET' });
        if (!healthResp.ok) continue;
        
        // Check /setup/status for first-run mode (no API key required from localhost)
        const setupResp = await fetch(`${url}/setup/status`, { method: 'GET', credentials: 'include' });
        if (setupResp.ok) {
          const setupData = await setupResp.json() as { apiKey?: string; setupRequired?: boolean };
          
          // Auto-configure server with the API key from status
          const autoServer = addServer({
            name: 'Local SST Server',
            apiUrl: url,
            apiKey: setupData.apiKey || '',
          });
          setActiveServerId(autoServer.id);
          setActiveServer(autoServer);
          setServerName('Local SST Server');
          setServerUrl(url);
          setServerApiKey(setupData.apiKey || '');
          setSetupRequired(setupData.setupRequired ?? true);
          setAllowNoApiKey(true);
          setShowServerConfig(false);
          setAutoDetecting(false);
          return true;
        }
      } catch {
        // Failed to connect, try next
      }
    }
    
    setAutoDetecting(false);
    return false;
  };

  useEffect(() => {
    setMounted(true);
    const server = getActiveServer();
    setActiveServer(server);
    
    // Helper to check setup status directly (bypasses API key requirement from localhost)
    const checkSetupDirect = async (url: string) => {
      try {
        const resp = await fetch(`${url}/setup/status`, { method: 'GET', credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json() as { setupRequired?: boolean; apiKey?: string };
          if (data.setupRequired) {
            setSetupRequired(true);
            setAllowNoApiKey(true);
            // Update server with API key if we have one
            if (data.apiKey && server?.id) {
              updateServer(server.id, { apiKey: data.apiKey });
              setActiveServer({ ...server, apiKey: data.apiKey });
            }
            return true;
          }
        }
      } catch {
        // Fall back to normal auth status check
      }
      return false;
    };
    
    if (!server) {
      // No server configured - try to auto-detect localhost API
      tryAutoDetectLocalApi().then((found) => {
        if (!found) {
          setShowServerConfig(true);
        }
      });
    } else {
      setCheckingAuthStatus(true);
      // First try the setup/status endpoint (works from localhost without API key)
      checkSetupDirect(server.apiUrl).then((inSetupMode) => {
        if (!inSetupMode) {
          // Not in setup mode, check normal auth status
          getAuthStatus()
            .then((s) => {
              const required = Boolean(s.setupRequired);
              setSetupRequired(required);
              setAllowNoApiKey(required);
            })
            .catch(() => {
              // Ignore on mount; user can use Test Connection to diagnose
            });
        }
      }).finally(() => setCheckingAuthStatus(false));
    }
  }, []);

  const handleTestConnection = async () => {
    if (!serverUrl.trim()) {
      setError('API URL is required');
      return;
    }

    setTestingConnection(true);
    setConnectionStatus('idle');
    setError(null);

    try {
      const url = serverUrl.trim().replace(/\/$/, '');

      const healthResponse = await fetch(`${url}/health`, { method: 'GET' });
      if (!healthResponse.ok) {
        setConnectionStatus('error');
        setError(`Server returned ${healthResponse.status} on /health`);
        return;
      }

      const statusResponse = await fetch(`${url}/auth/status`, {
        method: 'GET',
        credentials: 'include',
        headers: serverApiKey ? { 'x-api-key': serverApiKey } : {},
      });

      if (!statusResponse.ok) {
        setConnectionStatus('error');
        if (statusResponse.status === 401) {
          setError('Missing API key. Enter your API key to continue.');
        } else if (statusResponse.status === 403) {
          setError('Invalid API key. Check the API key configured on the server.');
        } else {
          setError(`Server returned ${statusResponse.status} on /auth/status`);
        }
        return;
      }

      const statusJson = (await statusResponse.json()) as { setupRequired?: boolean };
      setSetupRequired(Boolean(statusJson.setupRequired));
      setAllowNoApiKey(Boolean(statusJson.setupRequired));
      setConnectionStatus('success');
    } catch {
      setConnectionStatus('error');
      setError('Cannot connect to server. Check the URL and ensure the API is running.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveServer = () => {
    if (!serverName.trim() || !serverUrl.trim()) {
      setError('Server name and API URL are required');
      return;
    }

    if (!serverApiKey.trim() && !allowNoApiKey) {
      setError('API key is required');
      return;
    }

    const url = serverUrl.trim().replace(/\/$/, '');
    const newServer = addServer({
      name: serverName.trim(),
      apiUrl: url,
      apiKey: serverApiKey.trim(),
    });
    
    setActiveServerId(newServer.id);
    setActiveServer(newServer);
    setShowServerConfig(false);
    setError(null);

    setCheckingAuthStatus(true);
    getAuthStatus()
      .then((s) => {
        const required = Boolean(s.setupRequired);
        setSetupRequired(required);
        setAllowNoApiKey(required);
      })
      .catch(() => {
        // Ignore; user can use Test Connection to diagnose
      })
      .finally(() => setCheckingAuthStatus(false));
  };

  const parseEnvUrl = () => {
    const raw = envPasteUrl.trim();
    if (!raw) return;

    try {
      let pathPart = raw;
      if (/^[a-zA-Z]+:\/\//.test(raw)) {
        const u = new URL(raw);
        if (u.hostname) setEnvHost(u.hostname);
        if (u.port) setEnvPort(u.port);
        const userFromUrl = (u.username || '').trim();
        if (userFromUrl) setEnvUser(userFromUrl);
        pathPart = u.pathname;
      }

      pathPart = pathPart.replace(/\\/g, '/');
      if (!pathPart.startsWith('/')) pathPart = `/${pathPart}`;
      pathPart = pathPart.replace(/\/api\/online_players\.json$/, '');
      pathPart = pathPart.replace(/\/api$/, '');

      const parts = pathPart.split('/').filter(Boolean);
      if (parts.length < 2) {
        setEnvTestResult('Could not parse path. Paste something like /104.234.../HostHavocDayZServer/SST');
        return;
      }

      setEnvRemoteRoot(`/${parts[0]}`);
      setEnvSstPath(parts.slice(1).join('/'));
      setEnvTestResult(null);
    } catch {
      setEnvTestResult('Could not parse URL.');
    }
  };

  const callSetupStatus = async (baseUrl: string) => {
    const resp = await fetch(`${baseUrl}/setup/status`, { method: 'GET', credentials: 'include' });
    if (!resp.ok) throw new Error(`Setup status failed (${resp.status})`);
    return resp.json() as Promise<SetupStatusResponse>;
  };

  const handleEnvTest = async () => {
    if (!activeServer) {
      setError('Please configure a server first');
      setShowServerConfig(true);
      return;
    }

    setEnvWorking(true);
    setEnvTestResult(null);
    try {
      const baseUrl = activeServer.apiUrl;
      const payload: SetupStoragePayload = { backend: envBackend, sstPath: envSstPath };
      if (envBackend === 'sftp') {
        payload.sftp = { host: envHost, port: Number(envPort), username: envUser, password: envPassword, root: envRemoteRoot };
      } else if (envBackend === 'ftp') {
        payload.ftp = { host: envHost, port: Number(envPort), username: envUser, password: envPassword, root: envRemoteRoot, secure: true };
      }

      const resp = await fetch(`${baseUrl}/setup/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      const json = text ? (JSON.parse(text) as SetupTestResponse) : {};
      if (!resp.ok) {
        setEnvTestResult(json?.details || json?.error || `Test failed (${resp.status})`);
        return;
      }

      const parsed = json?.parsed;
      const stat = json?.stat;
      setEnvTestResult(
        `OK. Found online_players.json (size ${stat?.size ?? 'n/a'}). onlineCount=${parsed?.onlineCount ?? 'n/a'} players=${parsed?.playersLen ?? 'n/a'}`
      );
    } catch (e) {
      setEnvTestResult(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setEnvWorking(false);
    }
  };

  const handleEnvApply = async () => {
    if (!activeServer) {
      setError('Please configure a server first');
      setShowServerConfig(true);
      return;
    }

    setEnvWorking(true);
    setEnvTestResult(null);
    try {
      const baseUrl = activeServer.apiUrl;
      const payload: SetupStoragePayload = { backend: envBackend, sstPath: envSstPath };
      if (envBackend === 'sftp') {
        payload.sftp = { host: envHost, port: Number(envPort), username: envUser, password: envPassword, root: envRemoteRoot };
      } else if (envBackend === 'ftp') {
        payload.ftp = { host: envHost, port: Number(envPort), username: envUser, password: envPassword, root: envRemoteRoot, secure: true };
      }

      const resp = await fetch(`${baseUrl}/setup/apply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      const json = text ? (JSON.parse(text) as SetupTestResponse) : {};
      if (!resp.ok) {
        setEnvTestResult(json?.details || json?.error || `Apply failed (${resp.status})`);
        return;
      }

      // Grab the API key (local-only during setup) and store it into the active server config.
      const status = await callSetupStatus(baseUrl);
      if (status?.apiKey && activeServer?.id) {
        updateServer(activeServer.id, { apiKey: status.apiKey });
        setActiveServer({ ...activeServer, apiKey: status.apiKey });
      }

      setEnvTestResult('Saved .env. Restart the API to apply storage/path changes.');
    } catch (e) {
      setEnvTestResult(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setEnvWorking(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeServer) {
      setError('Please configure a server first');
      setShowServerConfig(true);
      return;
    }

    if (!setupUsername.trim() || !setupPassword) {
      setError('Username and password are required');
      return;
    }

    if (setupPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (setupPassword !== setupPasswordConfirm) {
      setError('Passwords do not match');
      return;
    }

    setSetupLoading(true);
    setError(null);

    try {
      const response = await setupFirstAdmin(setupUsername.trim(), setupPassword, rememberMe);
      setSetupRequired(false);
      onLogin(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!activeServer) {
      setError('Please configure a server first');
      setShowServerConfig(true);
      return;
    }
    
    if (!username.trim() || !password) {
      setError('Username and password are required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await login(username.trim(), password, rememberMe);
      onLogin(response.user);
    } catch (err) {
      const maybeCode = (err as { code?: unknown } | null)?.code;
      const maybeStatus = (err as { status?: unknown } | null)?.status;

      if (maybeCode === 'SETUP_REQUIRED' || maybeStatus === 409) {
        setSetupRequired(true);
        setError('Initial setup required. Create the first admin account.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle completion of setup wizard
  const handleSetupComplete = (config: { serverName: string; apiKey: string; username: string }) => {
    // Update or create the server config with the new name and API key
    if (activeServer?.id) {
      const updated = updateServer(activeServer.id, { 
        name: config.serverName, 
        apiKey: config.apiKey 
      });
      if (updated) {
        setActiveServer(updated);
      }
    } else if (activeServer?.apiUrl) {
      // No ID but we have an apiUrl - create a new server config
      const newServer = addServer({
        name: config.serverName,
        apiUrl: activeServer.apiUrl,
        apiKey: config.apiKey
      });
      if (newServer) {
        setActiveServerId(newServer.id);
        setActiveServer(newServer);
      }
    }
    // Setup is done, reload to login
    setSetupRequired(false);
    setServerApiKey(config.apiKey);
    setServerName(config.serverName);
    setUsername(config.username);
  };

  // If setup is required and we have an API URL, show the full wizard
  if (setupRequired && activeServer?.apiUrl) {
    return (
      <SetupWizard 
        apiUrl={activeServer.apiUrl} 
        onComplete={handleSetupComplete} 
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Top/Left side - Banner Image on white background */}
      <div 
        className={`lg:w-1/2 xl:w-3/5 bg-white flex flex-col justify-center transition-opacity duration-700 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Banner Image - compact, no extra flex growth */}
        <div className="flex items-center justify-center p-4 lg:p-6">
          <img 
            src="/banners/Banner-03.png" 
            alt="SST Dashboard"
            className="w-full max-w-xl h-auto object-contain"
          />
        </div>
        
        {/* Content below banner - grey text, tighter spacing */}
        <div className="p-4 lg:px-6 lg:pb-6">
          <div className="max-w-xl mx-auto">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-surface-800">SST Dashboard</h1>
            <p className="mt-1 text-base text-surface-500">Server Management System</p>
            
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                  <Server className="w-4 h-4 text-surface-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-700 text-sm">Complete Server Control</h3>
                  <p className="text-xs text-surface-500 mt-0.5">Manage players, vehicles, and economy in one place</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                  <ChevronRight className="w-4 h-4 text-surface-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-700 text-sm">Real-time Monitoring</h3>
                  <p className="text-xs text-surface-500 mt-0.5">Live player tracking and server statistics</p>
                </div>
              </div>
            </div>
            
            <p className="text-xs text-surface-400 mt-6 hidden lg:block">
              © 2026 SST contributors
            </p>
          </div>
        </div>
      </div>

      {/* Right/Bottom side - Login Form on grey background */}
      <div 
        className={`flex-1 flex items-center justify-center p-6 sm:p-12 bg-surface-100 transition-all duration-500 ${
          mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
        }`}
      >
        <div className="w-full max-w-md">
          {/* Mobile Logo - hidden on desktop since banner section shows it */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-700 rounded-2xl shadow-lg mb-4">
              <Server className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-surface-800">SST Dashboard</h1>
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:block mb-10">
            <h2 className="text-3xl font-bold text-surface-800">Welcome back</h2>
            <p className="mt-2 text-surface-500">Sign in to access your server dashboard</p>
          </div>

          {/* Form Container - White card on grey background */}
          <div 
            className={`bg-white rounded-2xl shadow-sm border border-surface-200 p-6 sm:p-8 transition-all duration-300 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '150ms' }}
          >
            {autoDetecting ? (
              /* Auto-detecting local API */
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b border-surface-200">
                  <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center">
                    <RefreshCw size={20} className="text-surface-700 animate-spin" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-surface-800">Detecting Local Server</h3>
                    <p className="text-sm text-surface-500">Looking for SST API on localhost...</p>
                  </div>
                </div>
              </div>
            ) : showServerConfig ? (
              /* Server Configuration Form */
              <div className="space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-surface-200">
                  <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center">
                    <Settings size={20} className="text-surface-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-surface-800">Configure Server</h3>
                    <p className="text-sm text-surface-500">Connect to your DayZ server API</p>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm animate-fade-in">
                    <AlertCircle size={18} className="flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {connectionStatus === 'success' && (
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm animate-fade-in">
                    <Check size={18} className="flex-shrink-0" />
                    <span>Connection successful!</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">
                      Server Name
                    </label>
                    <Input
                      type="text"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      placeholder="My DayZ Server"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-600 mb-2">
                      API URL
                    </label>
                    <Input
                      type="text"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="http://your-server-ip:3001"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setServerUrl('http://localhost:3001');
                          if (!serverName.trim()) setServerName('Local API');
                        }}
                        className="text-xs font-medium text-surface-500 hover:text-surface-700 transition-colors px-2 py-1 rounded-lg hover:bg-surface-100"
                      >
                        Running on your local machine?
                      </button>
                      <span className="text-xs text-surface-400">Sets URL to http://localhost:3001</span>
                    </div>
                    <p className="text-xs text-surface-400 mt-2">
                      The URL where your SST API is running
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-2">
                      API Key
                    </label>
                    <Input
                      type="text"
                      value={serverApiKey}
                      onChange={(e) => setServerApiKey(e.target.value)}
                      placeholder="Enter your API key"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleTestConnection}
                    loading={testingConnection}
                    icon={<RefreshCw size={16} />}
                    className="flex-1"
                  >
                    Test
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSaveServer}
                    icon={<Check size={16} />}
                    className="flex-1"
                  >
                    Save & Continue
                  </Button>
                </div>

                {activeServer && (
                  <button
                    type="button"
                    onClick={() => setShowServerConfig(false)}
                    className="w-full text-sm text-surface-500 hover:text-surface-700 transition-colors mt-4"
                  >
                    Cancel and return to login
                  </button>
                )}
              </div>
            ) : checkingAuthStatus ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b border-surface-200">
                  <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center">
                    <RefreshCw size={20} className="text-surface-700 animate-spin" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-surface-800">Checking server</h3>
                    <p className="text-sm text-surface-500">Detecting whether initial setup is required</p>
                  </div>
                </div>

                {activeServer && (
                  <div className="flex items-center justify-between p-4 bg-surface-50 rounded-xl border border-surface-200">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center flex-shrink-0">
                        <Server size={16} className="text-surface-600" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-surface-800 block truncate">{activeServer.name}</span>
                        <span className="text-xs text-surface-400 truncate block">{activeServer.apiUrl}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowServerConfig(true)}
                      className="text-xs font-medium text-surface-500 hover:text-surface-700 transition-colors flex-shrink-0 px-3 py-1.5 rounded-lg hover:bg-surface-100"
                    >
                      Change
                    </button>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm animate-fade-in">
                    <AlertCircle size={18} className="flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            ) : setupRequired ? (
              /* First-run setup form */
              <form onSubmit={handleSetup} className="space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-surface-200">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Settings size={20} className="text-emerald-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-surface-800">Initial Setup</h3>
                    <p className="text-sm text-surface-500">Create the first admin account</p>
                  </div>
                </div>

                {activeServer && (
                  <div className="flex items-center justify-between p-4 bg-surface-50 rounded-xl border border-surface-200">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center flex-shrink-0">
                        <Server size={16} className="text-surface-600" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-surface-800 block truncate">
                          {activeServer.name}
                        </span>
                        <span className="text-xs text-surface-400 truncate block">
                          {activeServer.apiUrl}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowServerConfig(true)}
                      className="text-xs font-medium text-surface-500 hover:text-surface-700 transition-colors flex-shrink-0 px-3 py-1.5 rounded-lg hover:bg-surface-100"
                    >
                      Change
                    </button>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm animate-fade-in">
                    <AlertCircle size={18} className="flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="p-4 bg-surface-50 rounded-xl border border-surface-200">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-surface-800">Server Files Setup (Optional)</div>
                      <div className="text-xs text-surface-500">
                        Configure SFTP/FTP paths so the API can read SST files.
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEnvSetupOpen((v) => !v)}
                    >
                      {envSetupOpen ? 'Hide' : 'Open'}
                    </Button>
                  </div>

                  {envSetupOpen && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Button
                          type="button"
                          variant={envBackend === 'sftp' ? 'primary' : 'secondary'}
                          onClick={() => {
                            setEnvBackend('sftp');
                            setEnvPort('8822');
                          }}
                        >
                          SFTP
                        </Button>
                        <Button
                          type="button"
                          variant={envBackend === 'ftp' ? 'primary' : 'secondary'}
                          onClick={() => {
                            setEnvBackend('ftp');
                            setEnvPort('21');
                          }}
                        >
                          FTP/FTPS
                        </Button>
                        <Button
                          type="button"
                          variant={envBackend === 'local' ? 'primary' : 'secondary'}
                          onClick={() => setEnvBackend('local')}
                        >
                          Local
                        </Button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-surface-700 mb-2">
                          Paste SFTP/FTP folder URL (optional)
                        </label>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={envPasteUrl}
                            onChange={(e) => setEnvPasteUrl(e.target.value)}
                            placeholder="sftp://user@host:8822/104.234.../HostHavocDayZServer/SST"
                          />
                          <Button type="button" variant="secondary" onClick={parseEnvUrl}>
                            Parse
                          </Button>
                        </div>
                      </div>

                      {envBackend !== 'local' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-surface-700 mb-2">Host</label>
                            <Input type="text" value={envHost} onChange={(e) => setEnvHost(e.target.value)} placeholder="104.234.251.153" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-surface-700 mb-2">Port</label>
                            <Input type="text" value={envPort} onChange={(e) => setEnvPort(e.target.value)} placeholder="8822" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-surface-700 mb-2">Username</label>
                            <Input type="text" value={envUser} onChange={(e) => setEnvUser(e.target.value)} placeholder="sudo" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-surface-700 mb-2">Password</label>
                            <Input type="password" value={envPassword} onChange={(e) => setEnvPassword(e.target.value)} placeholder="(not stored in browser)" />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-surface-700 mb-2">Remote root (prefix)</label>
                          <Input type="text" value={envRemoteRoot} onChange={(e) => setEnvRemoteRoot(e.target.value)} placeholder="/104.234.251.153_2332" />
                          <p className="mt-1 text-xs text-surface-500">For HostHavoc, this is usually the first folder shown.</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-surface-700 mb-2">SST_PATH</label>
                          <Input type="text" value={envSstPath} onChange={(e) => setEnvSstPath(e.target.value)} placeholder="HostHavocDayZServer/SST" />
                          <p className="mt-1 text-xs text-surface-500">Do not start with "/" if you want Remote root applied.</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" disabled={envWorking} onClick={handleEnvTest}>
                          {envWorking ? 'Working…' : 'Test Read'}
                        </Button>
                        <Button type="button" variant="primary" disabled={envWorking} onClick={handleEnvApply}>
                          {envWorking ? 'Working…' : 'Save to API .env'}
                        </Button>
                      </div>

                      {envTestResult && (
                        <div className="text-xs text-surface-700 bg-white border border-surface-200 rounded-lg p-3">
                          {envTestResult}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Admin Username
                  </label>
                  <Input
                    type="text"
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    placeholder="Enter admin username"
                    autoComplete="username"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Password
                  </label>
                  <Input
                    type="password"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Confirm Password
                  </label>
                  <Input
                    type="password"
                    value={setupPasswordConfirm}
                    onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-surface-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-300 text-surface-800 focus:ring-surface-400"
                    />
                    Remember me
                  </label>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full mt-6"
                  loading={setupLoading}
                  icon={<Check size={18} />}
                >
                  Create Admin Account
                </Button>
              </form>
            ) : (
              /* Login Form */
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Active server indicator */}
                {activeServer && (
                  <div 
                    className="flex items-center justify-between p-4 bg-surface-50 rounded-xl border border-surface-200 transition-all hover:border-surface-300"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center flex-shrink-0">
                        <Server size={16} className="text-surface-600" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-surface-800 block truncate">
                          {activeServer.name}
                        </span>
                        <span className="text-xs text-surface-400 truncate block">
                          {activeServer.apiUrl}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowServerConfig(true)}
                      className="text-xs font-medium text-surface-500 hover:text-surface-700 transition-colors flex-shrink-0 px-3 py-1.5 rounded-lg hover:bg-surface-100"
                    >
                      Change
                    </button>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm animate-fade-in">
                    <AlertCircle size={18} className="flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-surface-700 mb-2">
                    Username
                  </label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    autoComplete="username"
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-surface-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-surface-400 hover:text-surface-600 transition-colors rounded-lg hover:bg-surface-100"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-surface-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-300 text-surface-800 focus:ring-surface-400"
                    />
                    Remember me
                  </label>
                </div>

                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-xs">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Security notice: If your PC is compromised, we recommend changing your API key and login details.
                  </span>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full mt-6"
                  loading={loading}
                  icon={<LogIn size={18} />}
                >
                  Sign In
                </Button>
              </form>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-surface-500 mt-6">
            SST Server Management Dashboard
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
