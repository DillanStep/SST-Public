import React, { useState, useEffect } from 'react';
import { Key, CheckCircle, XCircle, Wifi, Server, Settings } from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import { getHealth, getDashboard } from '../../services/api';
import api from '../../services/api';
import { getActiveServer, getServers } from '../../services/serverManager';
import type { ServerConfig } from '../../types';

interface ApiConfigProps {
  onConnected: () => void;
}

export const ApiConfig: React.FC<ApiConfigProps> = ({ onConnected }) => {
  const [activeServer, setActiveServer] = useState<ServerConfig | null>(null);
  const [hasServers, setHasServers] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [playerCount, setPlayerCount] = useState(0);

  useEffect(() => {
    const server = getActiveServer();
    setActiveServer(server);
    setHasServers(getServers().length > 0);
  }, []);

  const testConnection = async () => {
    if (!activeServer) return;
    
    setStatus('loading');
    setStatusMessage('Testing connection...');

    try {
      // Configure API with active server
      api.configure(activeServer.apiUrl, activeServer.apiKey);

      // First test health endpoint
      await getHealth();

      // Then test authenticated endpoint
      const dashboard = await getDashboard();
      
      setPlayerCount(dashboard.playerCount);
      setStatus('connected');
      setStatusMessage(`Connected to ${activeServer.name}`);
      onConnected();
    } catch (err) {
      setStatus('error');
      if (err instanceof Error) {
        if (err.message.includes('401') || err.message.includes('403')) {
          setStatusMessage('Invalid API key');
        } else if (err.message.includes('Network Error') || err.message.includes('ECONNREFUSED')) {
          setStatusMessage('Cannot connect to API server. Is it running?');
        } else {
          setStatusMessage(err.message);
        }
      } else {
        setStatusMessage('Connection failed');
      }
    }
  };

  // If no servers configured, show setup prompt
  if (!hasServers) {
    return (
      <Card 
        compact
        title="Server Setup Required" 
        icon={<Server size={20} />}
        className="card-hover"
      >
        <div className="text-center py-4">
          <Server size={40} className="mx-auto mb-3 text-surface-500 opacity-50" />
          <p className="text-surface-500 mb-3">No servers configured yet.</p>
          <p className="text-sm text-dark-400 mb-3">
            Go to Settings to add your first DayZ server connection.
          </p>
          <Badge variant="info">
            <Settings size={12} className="mr-1" />
            Click "Settings" in the sidebar
          </Badge>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      compact
      title="Server Connection" 
      icon={<Server size={20} />}
      className="card-hover"
    >
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium text-surface-800">{activeServer?.name}</span>
            <Badge variant="default" className="text-xs truncate max-w-[200px]">
              {activeServer?.apiUrl}
            </Badge>
          </div>
          <div className="text-sm text-surface-500 flex items-center gap-1">
            <Key size={12} />
            <span className="font-mono">••••••••{activeServer?.apiKey.slice(-4)}</span>
          </div>
        </div>
        <Button
          onClick={testConnection}
          loading={status === 'loading'}
          disabled={!activeServer}
          icon={<Wifi size={16} />}
          size="sm"
        >
          Connect
        </Button>
      </div>

      {status !== 'idle' && (
        <div className={`mt-3 flex items-center gap-2 text-sm ${
          status === 'connected' ? 'text-green-600' : 
          status === 'error' ? 'text-red-600' : 
          'text-surface-500'
        }`}>
          {status === 'connected' && <CheckCircle size={16} />}
          {status === 'error' && <XCircle size={16} />}
          {status === 'loading' && (
            <div className="animate-spin h-4 w-4 border-2 border-surface-400 border-t-transparent rounded-full" />
          )}
          <span>{statusMessage}</span>
          {status === 'connected' && (
            <span className="ml-2 px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs border border-green-200">
              {playerCount} players
            </span>
          )}
        </div>
      )}

      <p className="mt-3 text-xs sm:text-sm text-dark-400">
        Manage your servers in the Settings tab. Switch between multiple DayZ servers easily.
      </p>
    </Card>
  );
};

export default ApiConfig;
