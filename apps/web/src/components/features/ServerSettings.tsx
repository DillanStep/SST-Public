import React, { useState, useEffect } from 'react';
import { 
  Server, Plus, Trash2, Edit2, Check, X, 
  ExternalLink, Key, Globe, Clock
} from 'lucide-react';
import { Button, Card, Badge } from '../ui';
import { 
  getServers, 
  addServer, 
  updateServer, 
  deleteServer, 
  getActiveServerId,
  setActiveServerId 
} from '../../services/serverManager';
import api from '../../services/api';
import type { ServerConfig } from '../../types';

interface ServerSettingsProps {
  onServerChange?: () => void;
}

export const ServerSettings: React.FC<ServerSettingsProps> = ({ onServerChange }) => {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('http://localhost:3001');
  const [formKey, setFormKey] = useState('');
  const [formError, setFormError] = useState('');
  
  // Testing state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});

  // Load servers
  const loadServers = () => {
    setServers(getServers());
    setActiveId(getActiveServerId());
  };

  useEffect(() => {
    loadServers();
  }, []);

  // Test a server connection
  const testConnection = async (server: ServerConfig) => {
    setTestingId(server.id);
    setTestResults(prev => ({ ...prev, [server.id]: null }));
    
    try {
      const response = await fetch(`${server.apiUrl}/health`, {
        headers: { 'x-api-key': server.apiKey },
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

  // Add new server
  const handleAddServer = () => {
    if (!formName.trim()) {
      setFormError('Server name is required');
      return;
    }
    if (!formUrl.trim()) {
      setFormError('API URL is required');
      return;
    }
    if (!formKey.trim()) {
      setFormError('API key is required');
      return;
    }

    addServer({
      name: formName.trim(),
      apiUrl: formUrl.trim().replace(/\/$/, ''), // Remove trailing slash
      apiKey: formKey.trim(),
    });

    setFormName('');
    setFormUrl('http://localhost:3001');
    setFormKey('');
    setFormError('');
    setShowAddForm(false);
    loadServers();
  };

  // Update existing server
  const handleUpdateServer = (id: string) => {
    if (!formName.trim() || !formUrl.trim() || !formKey.trim()) {
      setFormError('All fields are required');
      return;
    }

    updateServer(id, {
      name: formName.trim(),
      apiUrl: formUrl.trim().replace(/\/$/, ''),
      apiKey: formKey.trim(),
    });

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
        onServerChange?.();
      }
    }
  };

  // Switch active server
  const handleSwitchServer = (id: string) => {
    setActiveServerId(id);
    setActiveId(id);
    api.loadActiveServer();
    onServerChange?.();
  };

  // Start editing a server
  const startEditing = (server: ServerConfig) => {
    setEditingId(server.id);
    setFormName(server.name);
    setFormUrl(server.apiUrl);
    setFormKey(server.apiKey);
    setFormError('');
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null);
    setFormName('');
    setFormUrl('http://localhost:3001');
    setFormKey('');
    setFormError('');
  };

  return (
    <Card compact>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Server className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-surface-800">Server Management</h2>
            <p className="text-xs sm:text-sm text-surface-500">Manage your DayZ server connections</p>
          </div>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)} size="sm">
            <Plus size={16} className="mr-1" />
            Add Server
          </Button>
        )}
      </div>

      {/* Add Server Form */}
      {showAddForm && (
        <div className="mb-6 p-4 bg-surface-50 rounded-lg border border-surface-200">
          <h3 className="font-medium text-surface-800 mb-4">Add New Server</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-800 mb-1">
                Server Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="My DayZ Server"
                className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-surface-800 mb-1">
                API URL
              </label>
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-surface-500" />
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                  className="flex-1 px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-surface-800 mb-1">
                API Key
              </label>
              <div className="flex items-center gap-2">
                <Key size={16} className="text-surface-500" />
                <input
                  type="password"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="Enter API key"
                  className="flex-1 px-3 py-2 rounded-lg border border-surface-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                />
              </div>
            </div>
            
            {formError && (
              <p className="text-sm text-red-500">{formError}</p>
            )}
            
            <div className="flex gap-2">
              <Button onClick={handleAddServer}>
                <Check size={16} className="mr-1" />
                Save Server
              </Button>
              <Button variant="secondary" onClick={() => {
                setShowAddForm(false);
                setFormName('');
                setFormUrl('http://localhost:3001');
                setFormKey('');
                setFormError('');
              }}>
                <X size={16} className="mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

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
  );
};

export default ServerSettings;
