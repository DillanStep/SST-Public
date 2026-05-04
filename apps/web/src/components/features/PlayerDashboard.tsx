import React, { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Clock, Zap, Package, Calendar, Eye, Skull, Activity, MessageSquare, Send, Radio, X } from 'lucide-react';
import { Card, Button, Badge, Select } from '../ui';
import { getDashboard, refreshDashboard, getPlayer, sendMessageToPlayer, broadcastMessage } from '../../services/api';
import type { DashboardResponse, PlayerData } from '../../types';

interface PlayerDashboardProps {
  isConnected: boolean;
}

export const PlayerDashboard: React.FC<PlayerDashboardProps> = ({ isConnected }) => {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [playerDetails, setPlayerDetails] = useState<PlayerData | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  
  // Message state
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messagePlayer, setMessagePlayer] = useState<{ id: string; name: string } | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState<'notification' | 'chat' | 'both'>('notification');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await getDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      const data = await refreshDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const handleViewPlayer = async (playerId: string) => {
    setSelectedPlayer(playerId);
    setLoadingPlayer(true);
    
    try {
      const data = await getPlayer(playerId);
      setPlayerDetails(data);
    } catch (err) {
      console.error('Failed to load player:', err);
    } finally {
      setLoadingPlayer(false);
    }
  };

  const openMessageModal = (playerId: string, playerName: string) => {
    setMessagePlayer({ id: playerId, name: playerName });
    setMessageText('');
    setShowMessageModal(true);
  };

  const handleSendMessage = async () => {
    if (!messagePlayer || !messageText.trim()) return;
    
    setSendingMessage(true);
    try {
      await sendMessageToPlayer({
        playerId: messagePlayer.id,
        message: messageText.trim(),
        messageType,
      });
      setShowMessageModal(false);
      setMessagePlayer(null);
      setMessageText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    
    setSendingMessage(true);
    try {
      await broadcastMessage({
        message: broadcastText.trim(),
        messageType,
      });
      setShowBroadcastModal(false);
      setBroadcastText('');
    } catch (err) {
      console.error('Failed to broadcast:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      loadDashboard();
    }
  }, [isConnected, loadDashboard]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(() => {
      loadDashboard();
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected, loadDashboard]);

  if (!isConnected) {
    return (
      <Card compact title="Dashboard" icon={<Users size={20} />}>
        <p className="text-lilac">Connect to the API to view the dashboard.</p>
      </Card>
    );
  }

  return (
    <Card
      compact
      title="Dashboard"
      icon={<Users size={20} />}
      actions={
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBroadcastModal(true)}
            icon={<MessageSquare size={14} />}
          >
            <span className="hidden sm:inline">Broadcast</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadDashboard}
            loading={loading}
            icon={<RefreshCw size={14} />}
          >
            <span className="hidden sm:inline">Reload</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRefresh}
            loading={refreshing}
            icon={<Zap size={14} />}
          >
            <span className="hidden sm:inline">Force Refresh</span>
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {!dashboard && !loading && !error && (
        <p className="text-lilac">Loading dashboard...</p>
      )}

      {dashboard && (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-4">
            <div className="bg-surface-50 rounded-lg p-3 sm:p-4 border border-surface-300">
              <div className="flex items-center gap-2 text-dark-400 text-xs sm:text-sm mb-1">
                <Users size={14} />
                <span>Players</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amethyst">{dashboard.playerCount}</div>
            </div>
            
            <div className="bg-surface-50 rounded-lg p-3 sm:p-4 border border-surface-300">
              <div className="flex items-center gap-2 text-dark-400 text-xs sm:text-sm mb-1">
                <Clock size={14} />
                <span>Last Update</span>
              </div>
              <div className="text-xs sm:text-sm font-medium text-amethyst">
                {new Date(dashboard.lastUpdate).toLocaleTimeString()}
              </div>
            </div>
            
            <div className="bg-surface-50 rounded-lg p-3 sm:p-4 border border-surface-300">
              <div className="flex items-center gap-2 text-dark-400 text-xs sm:text-sm mb-1">
                <Zap size={14} />
                <span>Refresh Time</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amethyst">{dashboard.refreshTimeMs}ms</div>
            </div>
            
            <div className="bg-surface-50 rounded-lg p-3 sm:p-4 border border-surface-300">
              <div className="flex items-center gap-2 text-dark-400 text-xs sm:text-sm mb-1">
                <Package size={14} />
                <span>Grant Results</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amethyst">{dashboard.grantResults?.length || 0}</div>
            </div>

            <div className="bg-red-50 rounded-lg p-3 sm:p-4 border border-red-200">
              <div className="flex items-center gap-2 text-red-600 text-xs sm:text-sm mb-1">
                <Skull size={14} />
                <span>Recent Deaths</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-red-700">{dashboard.recentDeaths?.length || 0}</div>
            </div>
          </div>

          {/* Recent Deaths Section */}
          {dashboard.recentDeaths && dashboard.recentDeaths.length > 0 && (
            <div className="mb-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-dark-400 mb-2">
                <Skull size={16} className="text-red-600" />
                Recent Deaths
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {dashboard.recentDeaths.slice(0, 6).map((death, idx) => (
                  <div 
                    key={idx}
                    className="bg-red-50 rounded-lg p-2 sm:p-3 border border-red-200"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-amethyst font-medium text-sm">{death.playerName}</div>
                        <div className="text-lilac text-xs mt-1">
                          {new Date(death.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="error">DIED</Badge>
                    </div>
                    {death.causeOfDeath && (
                      <div className="mt-2 text-sm text-dark-400">
                        Cause: <span className="text-red-700">{death.causeOfDeath}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Player List */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-300">
                  <th className="py-3 px-4 text-left text-sm font-semibold text-dark-400">Player</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-dark-400">Inventory</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-dark-400">Item Events</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-dark-400">Life Events</th>
                  <th className="py-3 px-4 text-right text-sm font-semibold text-dark-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.players && Object.entries(dashboard.players).map(([playerId, playerData]) => {
                  // Get inventory count from the nested structure
                  const invData = playerData.inventory?.players?.[0];
                  const invCount = invData?.inventory?.length || 0;
                  const playerName = invData?.playerName || playerData.online?.playerName || playerId.substring(0, 12) + '...';
                  const isOnline = playerData.online?.isOnline;
                  const eventCount = playerData.events?.events?.length || 0;
                  const lifeEventCount = playerData.lifeEvents?.events?.length || 0;
                  
                  return (
                    <tr 
                      key={playerId} 
                      className="border-b border-surface-200 hover:bg-surface-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-amethyst font-medium">{playerName}</span>
                            {isOnline && <Badge variant="success">Online</Badge>}
                          </div>
                          <code className="text-primary-500 bg-surface-100 px-2 py-0.5 rounded text-xs">
                            {playerId}
                          </code>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={invCount > 0 ? 'success' : 'default'}>
                          {invCount} items
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={eventCount > 0 ? 'info' : 'default'}>
                          {eventCount} events
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={lifeEventCount > 0 ? 'warning' : 'default'}>
                          {lifeEventCount} life
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openMessageModal(playerId, playerName)}
                            icon={<MessageSquare size={14} />}
                            title="Send message to player"
                          >
                            Msg
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewPlayer(playerId)}
                            icon={<Eye size={14} />}
                          >
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!dashboard.players || Object.keys(dashboard.players).length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-lilac">
                      No players found in cache
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Player Details Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-amethyst/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-surface-300 shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <h3 className="text-lg font-semibold text-amethyst">
                Player: {selectedPlayer}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedPlayer(null);
                  setPlayerDetails(null);
                }}
              >
                Close
              </Button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {loadingPlayer ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                </div>
              ) : playerDetails ? (
                <div className="space-y-6">
                  {/* Inventory */}
                  <div>
                    {(() => {
                      const invData = playerDetails.inventory?.players?.[0];
                      const items = invData?.inventory || [];
                      return (
                        <>
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-dark-400 mb-3">
                            <Package size={16} />
                            Inventory ({items.length} items)
                            {invData?.playerName && (
                              <span className="text-lilac font-normal">- {invData.playerName}</span>
                            )}
                          </h4>
                          {items.length ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {items.slice(0, 20).map((item, idx) => (
                                <div 
                                  key={idx}
                                  className="bg-surface-50 rounded px-3 py-2 text-sm border border-surface-200"
                                >
                                  <div className="text-amethyst font-medium truncate">{item.className}</div>
                                  <div className="text-lilac text-xs">Qty: {item.quantity}</div>
                                </div>
                              ))}
                              {items.length > 20 && (
                                <div className="bg-surface-50 rounded px-3 py-2 text-sm text-lilac border border-surface-200">
                                  +{items.length - 20} more...
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-lilac text-sm">No inventory data</p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Item Events */}
                  <div>
                    {(() => {
                      const events = playerDetails.events?.events || [];
                      return (
                        <>
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-dark-400 mb-3">
                            <Calendar size={16} />
                            Item Events ({events.length})
                          </h4>
                          {events.length ? (
                            <div className="space-y-2">
                              {events.slice(0, 10).map((event, idx) => (
                                <div 
                                  key={idx}
                                  className="bg-surface-50 rounded px-3 py-2 text-sm flex items-start gap-3 border border-surface-200"
                                >
                                  <Badge 
                                    variant={
                                      event.eventType === 'PICKUP' ? 'success' : 
                                      event.eventType === 'DROP' ? 'warning' : 
                                      event.eventType === 'REMOVE' ? 'error' : 'info'
                                    }
                                  >
                                    {event.eventType}
                                  </Badge>
                                  <div className="flex-1">
                                    <div className="text-amethyst font-medium">{event.itemClassName} x{event.itemQuantity || 1}</div>
                                    <div className="text-lilac text-xs mt-1">{event.timestamp}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-lilac text-sm">No item events recorded</p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Life Events */}
                  <div>
                    {(() => {
                      const events = playerDetails.lifeEvents?.events || [];
                      return (
                        <>
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-dark-400 mb-3">
                            <Activity size={16} />
                            Life Events ({events.length})
                          </h4>
                          {events.length ? (
                            <div className="space-y-2">
                              {events.slice(0, 10).map((event, idx) => (
                                <div 
                                  key={idx}
                                  className="bg-surface-50 rounded px-3 py-2 text-sm flex items-start gap-3 border border-surface-200"
                                >
                                  <Badge 
                                    variant={
                                      event.eventType === 'DIED' ? 'error' : 
                                      (event.eventType === 'SPAWNED' || event.eventType === 'RESPAWNED') ? 'success' : 
                                      event.eventType === 'CONNECTED' ? 'info' : 
                                      event.eventType === 'DISCONNECTED' ? 'warning' : 'default'
                                    }
                                  >
                                    {event.eventType}
                                  </Badge>
                                  <div className="flex-1">
                                    <div className="text-dark-400">
                                      {event.eventType === 'DIED' && event.causeOfDeath && (
                                        <span>Cause: {event.causeOfDeath}</span>
                                      )}
                                      {event.eventType !== 'DIED' && (
                                        <span>{event.playerName}</span>
                                      )}
                                    </div>
                                    <div className="text-lilac text-xs mt-1">{event.timestamp}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-lilac text-sm">No life events recorded</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <p className="text-lilac">Failed to load player details</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message Player Modal */}
      {showMessageModal && messagePlayer && (
        <div className="fixed inset-0 bg-amethyst/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-surface-300 shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-surface-200">
              <h3 className="font-semibold text-amethyst flex items-center gap-2">
                <MessageSquare size={20} />
                Message Player
              </h3>
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setMessagePlayer(null);
                  setMessageText('');
                }}
                className="p-1 hover:bg-surface-100 rounded-full transition-colors"
              >
                <X size={20} className="text-lilac" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">Sending to:</label>
                <div className="text-amethyst font-medium">{messagePlayer.name}</div>
                <div className="text-xs text-lilac">{messagePlayer.id}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">Message Type</label>
                <Select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value as 'notification' | 'chat' | 'both')}
                  options={[
                    { value: 'notification', label: 'Notification (popup)' },
                    { value: 'chat', label: 'Chat message' },
                    { value: 'both', label: 'Both (popup + chat)' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">Message</label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Enter your message..."
                  className="w-full px-3 py-2 border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-velvet/20 focus:border-velvet min-h-[100px] resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowMessageModal(false);
                    setMessagePlayer(null);
                    setMessageText('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !messageText.trim()}
                  icon={<Send size={14} />}
                >
                  {sendingMessage ? 'Sending...' : 'Send Message'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-amethyst/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-surface-300 shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-surface-200">
              <h3 className="font-semibold text-amethyst flex items-center gap-2">
                <Radio size={20} />
                Server Broadcast
              </h3>
              <button
                onClick={() => {
                  setShowBroadcastModal(false);
                  setBroadcastText('');
                }}
                className="p-1 hover:bg-surface-100 rounded-full transition-colors"
              >
                <X size={20} className="text-lilac" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-surface-50 border border-surface-200 rounded-md p-3">
                <p className="text-sm text-dark-400">
                  This message will be sent to <strong>all players</strong> currently on the server.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">Message Type</label>
                <Select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value as 'notification' | 'chat' | 'both')}
                  options={[
                    { value: 'notification', label: 'Notification (popup)' },
                    { value: 'chat', label: 'Chat message' },
                    { value: 'both', label: 'Both (popup + chat)' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">Broadcast Message</label>
                <textarea
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  placeholder="Enter broadcast message..."
                  className="w-full px-3 py-2 border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-velvet/20 focus:border-velvet min-h-[100px] resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowBroadcastModal(false);
                    setBroadcastText('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBroadcast}
                  disabled={sendingMessage || !broadcastText.trim()}
                  icon={<Radio size={14} />}
                >
                  {sendingMessage ? 'Broadcasting...' : 'Broadcast'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default PlayerDashboard;
