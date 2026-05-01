import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wifi, WifiOff, ChevronDown, Server, Check, RefreshCw } from 'lucide-react';
import { getHealth, getDashboard } from '../../services/api';
import api from '../../services/api';
import { getActiveServer, getServers, setActiveServerId } from '../../services/serverManager';
import type { ServerConfig } from '../../types';

interface ConnectionBarProps {
  onConnected: () => void;
  onDisconnected: () => void;
  isConnected: boolean;
}

export const ConnectionBar: React.FC<ConnectionBarProps> = ({ 
  onConnected, 
  onDisconnected
}) => {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [activeServer, setActiveServerState] = useState<ServerConfig | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [playerCount, setPlayerCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasAttemptedAutoConnect = useRef(false);

  // Load servers
  const loadServers = useCallback(() => {
    const allServers = getServers();
    const active = getActiveServer();
    setServers(allServers);
    setActiveServerState(active);
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const connect = useCallback(async (server?: ServerConfig) => {
    const serverToUse = server || activeServer;
    if (!serverToUse) return;
    
    setStatus('connecting');

    try {
      // Configure API with server
      api.configure(serverToUse.apiUrl, serverToUse.apiKey);

      // Test health endpoint
      await getHealth();

      // Test authenticated endpoint
      const dashboard = await getDashboard();
      
      setPlayerCount(dashboard.playerCount);
      setStatus('connected');
      onConnected();
    } catch {
      setStatus('error');
      onDisconnected();
    }
  }, [activeServer, onConnected, onDisconnected]);

  // Auto-connect on mount if server is configured
  useEffect(() => {
    if (activeServer && !hasAttemptedAutoConnect.current && status === 'idle') {
      hasAttemptedAutoConnect.current = true;
      connect();
    }
  }, [activeServer, status, connect]);

  const handleServerSelect = async (server: ServerConfig) => {
    setActiveServerId(server.id);
    setActiveServerState(server);
    setDropdownOpen(false);
    setStatus('idle');
    hasAttemptedAutoConnect.current = false;
    
    // Connect to the new server
    await connect(server);
  };

  const handleReconnect = () => {
    setStatus('idle');
    connect();
  };

  if (servers.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm">
        <Server size={16} />
        <span>No servers configured</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" ref={dropdownRef}>
      {/* Server Dropdown */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm transition-colors"
        >
          <Server size={14} />
          <span className="max-w-[150px] truncate">{activeServer?.name || 'Select Server'}</span>
          <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-surface-200 py-1 z-50">
            {servers.map((server) => (
              <button
                key={server.id}
                onClick={() => handleServerSelect(server)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-50 ${
                  server.id === activeServer?.id ? 'bg-primary-50 text-primary-700' : 'text-surface-700'
                }`}
              >
                <Server size={14} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{server.name}</div>
                  <div className="text-xs text-surface-500 truncate">{server.apiUrl}</div>
                </div>
                {server.id === activeServer?.id && (
                  <Check size={14} className="text-primary-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Connection Status / Button */}
      {status === 'connected' ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm">
          <Wifi size={14} />
          <span>{playerCount} players</span>
        </div>
      ) : status === 'connecting' ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 text-surface-600 text-sm">
          <RefreshCw size={14} className="animate-spin" />
          <span>Connecting...</span>
        </div>
      ) : status === 'error' ? (
        <button
          onClick={handleReconnect}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-sm transition-colors"
        >
          <WifiOff size={14} />
          <span>Retry</span>
        </button>
      ) : (
        <button
          onClick={() => connect()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm transition-colors"
        >
          <Wifi size={14} />
          <span>Connect</span>
        </button>
      )}
    </div>
  );
};

export default ConnectionBar;
