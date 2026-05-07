import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, Package, Calendar, Activity, Gift, Send, 
  CheckCircle, XCircle, Clock, Search, ChevronDown, ChevronRight,
  Heart, Navigation
} from 'lucide-react';
import { Button, Badge } from '../ui';
import { getPlayer, getItems, createGrant, getGrantResults, healPlayer } from '../../services/api';
import type { PlayerData, Item, GrantResult, InventoryItem } from '../../types';

interface PlayerModalProps {
  playerId: string;
  playerName: string;
  onClose: () => void;
  onTeleportRequest?: (playerId: string, playerName: string) => void;
}

type TabType = 'inventory' | 'events' | 'life' | 'actions' | 'grant';

// Recursive inventory item component
const InventoryItemRow: React.FC<{
  item: InventoryItem;
  depth?: number;
  onGrant?: (className: string) => void;
}> = ({ item, depth = 0, onGrant }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const hasChildren = (item.attachments?.length || 0) > 0 || (item.cargo?.length || 0) > 0;

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-surface-100 rounded text-sm">
        {hasChildren ? (
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-0.5">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : <span className="w-4" />}
        <span className="flex-1 text-surface-800 truncate">{item.className}</span>
        {item.quantity > 0 && (
          <span className="text-xs text-surface-500">x{item.quantity}</span>
        )}
        {onGrant && (
          <button
            onClick={() => onGrant(item.className)}
            className="text-xs text-primary-500 hover:underline"
          >
            Grant
          </button>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div className="border-l border-surface-200 ml-2">
          {item.attachments?.map((att, i) => (
            <InventoryItemRow key={`att-${i}`} item={att} depth={depth + 1} onGrant={onGrant} />
          ))}
          {item.cargo?.map((c, i) => (
            <InventoryItemRow key={`cargo-${i}`} item={c} depth={depth + 1} onGrant={onGrant} />
          ))}
        </div>
      )}
    </div>
  );
};

export const PlayerModal: React.FC<PlayerModalProps> = ({ playerId, playerName, onClose, onTeleportRequest }) => {
  const [activeTab, setActiveTab] = useState<TabType>('inventory');
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Heal state
  const [healAmount, setHealAmount] = useState(100);
  const [healSending, setHealSending] = useState(false);
  const [healResult, setHealResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Items catalog (loaded once)
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  
  // Grant state
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [health, setHealth] = useState(100);
  const [sending, setSending] = useState(false);
  const [grantResult, setGrantResult] = useState<{ success: boolean; message: string } | null>(null);
  const [grantResults, setGrantResults] = useState<GrantResult[]>([]);

  // Load player data
  const loadPlayerData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPlayer(playerId);
      setPlayerData(data);
    } catch (err) {
      console.error('Failed to load player:', err);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  // Load items catalog once
  const loadItems = useCallback(async () => {
    if (allItems.length > 0) return; // Already loaded
    setItemsLoading(true);
    try {
      const data = await getItems();
      setAllItems(data.items || []);
    } catch (err) {
      console.error('Failed to load items:', err);
    } finally {
      setItemsLoading(false);
    }
  }, [allItems.length]);

  // Load grant results
  const loadGrantResults = useCallback(async () => {
    try {
      const data = await getGrantResults();
      setGrantResults(data.results?.filter(g => g.playerId === playerId) || []);
    } catch (err) {
      console.error('Failed to load grants:', err);
    }
  }, [playerId]);

  useEffect(() => {
    loadPlayerData();
    loadGrantResults();
  }, [loadPlayerData, loadGrantResults]);

  // Load items when grant tab is selected
  useEffect(() => {
    if (activeTab === 'grant') {
      loadItems();
    }
  }, [activeTab, loadItems]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return allItems.slice(0, 50); // Show first 50 if no search
    const search = itemSearch.toLowerCase();
    return allItems
      .filter(item => 
        item.className.toLowerCase().includes(search) ||
        item.displayName?.toLowerCase().includes(search)
      )
      .slice(0, 50);
  }, [allItems, itemSearch]);

  const handleGrant = async () => {
    if (!selectedItem) return;
    
    setSending(true);
    setGrantResult(null);
    
    try {
      await createGrant({
        playerId,
        itemClassName: selectedItem.className,
        quantity,
        health,
      });
      
      setGrantResult({ success: true, message: `${selectedItem.className} x${quantity} queued` });
      setSelectedItem(null);
      setQuantity(1);
      setHealth(100);
      setTimeout(loadGrantResults, 1000);
    } catch (err) {
      setGrantResult({ success: false, message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setSending(false);
    }
  };

  const selectItemForGrant = (className: string) => {
    const item = allItems.find(i => i.className === className);
    if (item) {
      setSelectedItem(item);
      setActiveTab('grant');
    } else {
      // If not in catalog, create a temp item
      setSelectedItem({ className, displayName: className, category: 'Unknown' });
      setActiveTab('grant');
    }
  };

  // Heal player handler
  const handleHeal = async (amount = healAmount) => {
    setHealSending(true);
    setHealResult(null);
    
    try {
      await healPlayer({
        playerId,
        health: amount,
      });
      
      setHealResult({ success: true, message: `Heal command queued (${amount}%)` });
    } catch (err) {
      setHealResult({ success: false, message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setHealSending(false);
    }
  };

  // Teleport handler
  const handleTeleport = () => {
    if (onTeleportRequest) {
      onTeleportRequest(playerId, playerName);
    }
  };

  const invData = playerData?.inventory?.players?.[0];
  const items = invData?.inventory || [];
  const itemEvents = playerData?.events?.events || [];
  const lifeEvents = playerData?.lifeEvents?.events || [];

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'inventory', label: 'Inventory', icon: <Package size={14} />, count: items.length },
    { id: 'events', label: 'Events', icon: <Calendar size={14} />, count: itemEvents.length },
    { id: 'life', label: 'Life', icon: <Activity size={14} />, count: lifeEvents.length },
    { id: 'actions', label: 'Actions', icon: <Heart size={14} /> },
    { id: 'grant', label: 'Grant', icon: <Gift size={14} /> },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50" style={{ zIndex: 10000 }} onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <div>
            <h2 className="text-lg font-bold text-surface-800">{playerName}</h2>
            <code className="text-xs text-primary-500 bg-surface-100 px-2 py-0.5 rounded">{playerId}</code>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
            <X size={20} className="text-surface-600" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-200 px-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-500'
                  : 'border-transparent text-surface-600 hover:text-surface-800'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-surface-200'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {/* Inventory Tab */}
              {activeTab === 'inventory' && (
                <div>
                  {items.length > 0 ? (
                    <div className="space-y-1">
                      {items.map((item, idx) => (
                        <InventoryItemRow 
                          key={idx} 
                          item={item} 
                          onGrant={selectItemForGrant}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-surface-500 py-8">No inventory data</p>
                  )}
                </div>
              )}

              {/* Events Tab */}
              {activeTab === 'events' && (
                <div className="space-y-2">
                  {itemEvents.length > 0 ? (
                    itemEvents.slice(0, 50).map((event, idx) => (
                      <div key={idx} className="flex items-center gap-3 py-2 px-3 bg-surface-50 rounded-lg">
                        <Badge variant={
                          event.eventType === 'PICKUP' ? 'success' :
                          event.eventType === 'DROP' ? 'warning' : 'error'
                        }>
                          {event.eventType}
                        </Badge>
                        <span className="text-sm text-surface-800 flex-1">{event.itemClassName}</span>
                        <span className="text-xs text-surface-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-surface-500 py-8">No events recorded</p>
                  )}
                </div>
              )}

              {/* Life Events Tab */}
              {activeTab === 'life' && (
                <div className="space-y-2">
                  {lifeEvents.length > 0 ? (
                    lifeEvents.map((event, idx) => (
                      <div key={idx} className="flex items-center gap-3 py-2 px-3 bg-surface-50 rounded-lg">
                        <Badge variant={
                          event.eventType === 'DIED' ? 'error' :
                          event.eventType === 'SPAWNED' || event.eventType === 'RESPAWNED' ? 'success' :
                          event.eventType === 'CONNECTED' ? 'info' : 'warning'
                        }>
                          {event.eventType}
                        </Badge>
                        <span className="text-sm text-surface-800 flex-1">
                          {event.causeOfDeath || event.playerName}
                        </span>
                        <span className="text-xs text-surface-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-surface-500 py-8">No life events recorded</p>
                  )}
                </div>
              )}

              {/* Actions Tab (Heal & Teleport) */}
              {activeTab === 'actions' && (
                <div className="space-y-6">
                  {/* Heal Section */}
                  <div className="bg-surface-50 rounded-lg p-4 border border-surface-200">
                    <div className="flex items-center gap-2 mb-4">
                      <Heart className="text-red-500" size={20} />
                      <h4 className="font-medium text-surface-800">Heal Player</h4>
                    </div>
                    
                    <p className="text-sm text-surface-500 mb-4">
                      Restore player's health, blood, hunger, thirst, and shock.
                    </p>
                    
                    <div className="flex items-center gap-4 mb-4">
                      <label className="text-sm text-surface-800">Health Amount:</label>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={healAmount}
                        onChange={(e) => setHealAmount(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium text-surface-800 w-12">{healAmount}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleHeal()}
                        disabled={healSending}
                        className="flex items-center gap-2"
                      >
                        <Heart size={16} />
                        {healSending ? 'Healing...' : 'Heal Player'}
                      </Button>
                      
                      <Button 
                        variant="secondary"
                        onClick={() => { setHealAmount(100); handleHeal(100); }}
                        disabled={healSending}
                      >
                        Full Heal
                      </Button>
                    </div>
                    
                    {healResult && (
                      <div className={`mt-3 flex items-center gap-2 text-sm ${
                        healResult.success ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {healResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {healResult.message}
                      </div>
                    )}
                  </div>
                  
                  {/* Teleport Section */}
                  <div className="bg-surface-50 rounded-lg p-4 border border-surface-200">
                    <div className="flex items-center gap-2 mb-4">
                      <Navigation className="text-green-500" size={20} />
                      <h4 className="font-medium text-surface-800">Teleport Player</h4>
                    </div>
                    
                    <p className="text-sm text-surface-500 mb-4">
                      Click the button below, then click on the map where you want to teleport this player.
                    </p>
                    
                    {onTeleportRequest ? (
                      <Button 
                        onClick={handleTeleport}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                      >
                        <Navigation size={16} />
                        Teleport on Map
                      </Button>
                    ) : (
                      <p className="text-sm text-surface-500 italic">
                        Teleport is only available from the map view.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Grant Tab */}
              {activeTab === 'grant' && (
                <div className="space-y-4">
                  {/* Selected Item */}
                  {selectedItem ? (
                    <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-medium text-surface-800">{selectedItem.displayName || selectedItem.className}</div>
                          <code className="text-xs text-primary-500">{selectedItem.className}</code>
                        </div>
                        <button onClick={() => setSelectedItem(null)} className="text-surface-500 hover:text-surface-800">
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-xs text-surface-500 block mb-1">Quantity</label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={quantity}
                            onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-surface-500 block mb-1">Health %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={health}
                            onChange={e => setHealth(parseInt(e.target.value) || 100)}
                            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <Button onClick={handleGrant} loading={sending} icon={<Send size={14} />} className="w-full">
                        Send Grant
                      </Button>
                      {grantResult && (
                        <div className={`mt-2 flex items-center gap-2 text-sm ${grantResult.success ? 'text-green-600' : 'text-red-600'}`}>
                          {grantResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {grantResult.message}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Item Search */}
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                        <input
                          type="text"
                          placeholder="Search items..."
                          value={itemSearch}
                          onChange={e => setItemSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:border-primary-500"
                        />
                      </div>

                      {/* Items List */}
                      {itemsLoading ? (
                        <div className="text-center py-8 text-surface-500">Loading items...</div>
                      ) : (
                        <div className="border border-surface-200 rounded-lg divide-y divide-surface-100 max-h-64 overflow-y-auto">
                          {filteredItems.map(item => (
                            <button
                              key={item.className}
                              onClick={() => setSelectedItem(item)}
                              className="w-full text-left px-4 py-2.5 hover:bg-surface-50 transition-colors"
                            >
                              <div className="text-sm font-medium text-surface-800">{item.displayName || item.className}</div>
                              <div className="text-xs text-surface-500">{item.className}</div>
                            </button>
                          ))}
                          {filteredItems.length === 0 && (
                            <div className="px-4 py-8 text-center text-surface-500">No items found</div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Grant History */}
                  {grantResults.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-surface-600 mb-2">Recent Grants</h4>
                      <div className="space-y-1">
                        {grantResults.slice(0, 5).map((grant, idx) => (
                          <div key={idx} className="flex items-center justify-between py-2 px-3 bg-surface-50 rounded-lg text-sm">
                            <span className="text-surface-800">{grant.itemClassName} x{grant.quantity}</span>
                            <Badge variant={grant.result === 'SUCCESS' ? 'success' : grant.result === 'FAILED' ? 'error' : 'warning'}>
                              {grant.result === 'SUCCESS' ? <CheckCircle size={10} className="mr-1" /> : 
                               grant.result === 'FAILED' ? <XCircle size={10} className="mr-1" /> : 
                               <Clock size={10} className="mr-1" />}
                              {grant.result || 'Pending'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerModal;
