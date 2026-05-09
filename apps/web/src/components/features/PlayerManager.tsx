import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, RefreshCw, Package, Calendar, Gift, Send, 
  CheckCircle, XCircle, Clock, ChevronLeft, Activity, Search,
  MapPin, Heart, Droplets, Zap, Wifi, WifiOff, X, ArrowDown, ArrowUp,
  DollarSign, Skull, LogIn, LogOut, UserPlus, RotateCw, Backpack, PackagePlus,
  PackageMinus, ShieldPlus, Banknote, Crosshair
} from 'lucide-react';
import L from 'leaflet';
import { MapContainer, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, Button, Badge, Input, Select } from '../ui';
import { InventoryTree } from './InventoryTree';
import { flattenInventory } from './inventoryUtils';
import { PlayerBankPanel } from './PlayerBankPanel';
import { PlayerCombatHeatmap } from './PlayerCombatHeatmap';
import { getCombatReviewCount } from './playerCombatUtils';
import { getDashboard, refreshDashboard, getPlayer, createGrant, getGrantResults, getOnlinePlayers, getPlayerTrades, searchItems, getCategories, deleteItemFromPlayer } from '../../services/api';
import type { DashboardResponse, PlayerData, GrantResult, OnlinePlayerData, PlayerEvent, TradeLog, Item, CategoriesResponse } from '../../types';
import { MapImageLayer } from '../../maps/MapImageLayer';
import { gameToMap, mapRenderKey, paddedMapBounds } from '../../maps/mapConfig';
import { useMapConfig } from '../../maps/useMapConfig';

// Component to center map on a position
const CenterOnPosition: React.FC<{ position: [number, number] }> = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(position, 0);
  }, [map, position]);
  return null;
};

// Format time ago helper
function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'Just now';
}

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface EventVisual {
  label: string;
  icon: React.ReactNode;
  rowClass: string;
  iconClass: string;
  badgeVariant: BadgeVariant;
  markerColor: string;
}

function formatEventTypeLabel(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getItemEventVisual(eventType: string): EventVisual {
  const type = eventType.toUpperCase();

  if (['PICKED_UP', 'PICKUP', 'TAKE', 'TAKEN', 'LOOTED'].includes(type)) {
    return {
      label: 'Looted',
      icon: <Backpack size={15} />,
      rowClass: 'bg-green-50 border-green-200',
      iconClass: 'bg-green-100 text-green-700 border-green-200',
      badgeVariant: 'success',
      markerColor: '#22c55e',
    };
  }

  if (['DROPPED', 'DROP'].includes(type)) {
    return {
      label: 'Dropped',
      icon: <PackageMinus size={15} />,
      rowClass: 'bg-amber-50 border-amber-200',
      iconClass: 'bg-amber-100 text-amber-700 border-amber-200',
      badgeVariant: 'warning',
      markerColor: '#f59e0b',
    };
  }

  if (['ADDED', 'GRANTED', 'SPAWNED'].includes(type)) {
    return {
      label: 'Granted',
      icon: <PackagePlus size={15} />,
      rowClass: 'bg-primary-50 border-primary-200',
      iconClass: 'bg-primary-100 text-primary-700 border-primary-200',
      badgeVariant: 'info',
      markerColor: '#0ea5e9',
    };
  }

  if (['REMOVED', 'REMOVE', 'DELETED', 'DESTROYED'].includes(type)) {
    return {
      label: 'Removed',
      icon: <PackageMinus size={15} />,
      rowClass: 'bg-red-50 border-red-200',
      iconClass: 'bg-red-100 text-red-700 border-red-200',
      badgeVariant: 'error',
      markerColor: '#ef4444',
    };
  }

  if (['EQUIPPED', 'EQUIP', 'ATTACHED', 'ATTACH'].includes(type)) {
    return {
      label: formatEventTypeLabel(eventType),
      icon: <ShieldPlus size={15} />,
      rowClass: 'bg-sky-50 border-sky-200',
      iconClass: 'bg-sky-100 text-sky-700 border-sky-200',
      badgeVariant: 'info',
      markerColor: '#0ea5e9',
    };
  }

  return {
    label: formatEventTypeLabel(eventType),
    icon: <Package size={15} />,
    rowClass: 'bg-surface-50 border-surface-200',
    iconClass: 'bg-surface-100 text-surface-600 border-surface-200',
    badgeVariant: 'default',
    markerColor: '#6b7280',
  };
}

function getLifeEventVisual(eventType: string): EventVisual {
  switch (eventType) {
    case 'DIED':
      return {
        label: 'Died',
        icon: <Skull size={16} />,
        rowClass: 'bg-red-50 border-red-200',
        iconClass: 'bg-red-100 text-red-700 border-red-200',
        badgeVariant: 'error',
        markerColor: '#ef4444',
      };
    case 'SPAWNED':
      return {
        label: 'Spawned',
        icon: <UserPlus size={16} />,
        rowClass: 'bg-green-50 border-green-200',
        iconClass: 'bg-green-100 text-green-700 border-green-200',
        badgeVariant: 'success',
        markerColor: '#22c55e',
      };
    case 'RESPAWNED':
      return {
        label: 'Respawned',
        icon: <RotateCw size={16} />,
        rowClass: 'bg-green-50 border-green-200',
        iconClass: 'bg-green-100 text-green-700 border-green-200',
        badgeVariant: 'success',
        markerColor: '#22c55e',
      };
    case 'CONNECTED':
      return {
        label: 'Connected',
        icon: <LogIn size={16} />,
        rowClass: 'bg-primary-50 border-primary-200',
        iconClass: 'bg-primary-100 text-primary-700 border-primary-200',
        badgeVariant: 'info',
        markerColor: '#0ea5e9',
      };
    case 'DISCONNECTED':
      return {
        label: 'Disconnected',
        icon: <LogOut size={16} />,
        rowClass: 'bg-amber-50 border-amber-200',
        iconClass: 'bg-amber-100 text-amber-700 border-amber-200',
        badgeVariant: 'warning',
        markerColor: '#f59e0b',
      };
    default:
      return {
        label: formatEventTypeLabel(eventType),
        icon: <Activity size={16} />,
        rowClass: 'bg-surface-50 border-surface-200',
        iconClass: 'bg-surface-100 text-surface-600 border-surface-200',
        badgeVariant: 'default',
        markerColor: '#6b7280',
      };
  }
}

// Item type categorization for proper quantity display in events
const STACKABLE_ITEMS = [
  'rag', 'bandage', 'sewing', 'duct_tape', 'fishing_hook', 'fishinghook', 'bone',
  'ammo_', '_ammo', 'mag_', '_mag', 'bullet', 'shell', 'round',
  'nail', 'metal_wire', 'rope', 'bark', 'stick', 'stone', 'feather', 'guts', 'fat', 'pelt',
  'money', 'ruble'
];

const LIQUID_CONTAINERS = [
  'waterbottle', 'canteen', 'pot', 'cauldron', 'barrel', 'jerrycan', 'gascan', 
  'bloodbag', 'saline', 'iv_', '_iv', 'bottle', 'flask', 'canister', 'container',
  'cooking', 'fryingpan'
];

const CONSUMABLE_FOODS = [
  'apple', 'pear', 'plum', 'banana', 'orange', 'kiwi', 'tomato', 'pepper', 'potato', 'zucchini',
  'mushroom', 'berry', 'meat', 'steak', 'fat', 'lard', 'fish', 'carp', 'mackerel', 'sardine',
  'tuna', 'brisket', 'kvass', 'soda', 'cola', 'spite', 'pipsi', 'nota', 'franta',
  'powdered', 'cereal', 'rice', 'oatmeal', 'pasta', 'spaghetti', 'peach', 'bacon', 'tactical',
  'sardines', 'beans', 'unknown', 'dog', 'cat', 'chicken', 'boar', 'deer', 'cow', 'sheep',
  'wolf', 'bear', 'human', 'worm', 'snack', 'chocolate', 'crackers'
];

// Format event quantity smartly based on item type
function formatEventQuantity(className: string, quantity: number): string {
  const lowerName = className.toLowerCase();
  
  // Stackable items - show as count
  if (STACKABLE_ITEMS.some(s => lowerName.includes(s))) {
    return `x${Math.round(quantity)}`;
  }
  
  // Liquid containers - show as ml
  if (LIQUID_CONTAINERS.some(s => lowerName.includes(s))) {
    return `${Math.round(quantity)}ml`;
  }
  
  // Consumable foods - these are typically spawned at 100%, so just show x1
  if (CONSUMABLE_FOODS.some(s => lowerName.includes(s))) {
    return 'x1';
  }
  
  // For large quantities (>100), assume it's consumable internal value
  if (quantity > 100) {
    return 'x1';
  }
  
  // Default: show as count
  return `x${Math.round(quantity)}`;
}

interface PlayerManagerProps {
  isConnected: boolean;
  onSelectItemFromSearch?: () => void;
}

interface PlayerSummary {
  id: string;
  name: string;
  inventoryCount: number;
  eventCount: number;
  lifeEventCount: number;
  isOnline: boolean;
  onlineData?: OnlinePlayerData;
}

type TabType = 'inventory' | 'events' | 'life' | 'combat' | 'trades' | 'bank' | 'grant';

export const PlayerManager: React.FC<PlayerManagerProps> = ({ isConnected }) => {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Selected player state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerDetails, setPlayerDetails] = useState<PlayerData | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('inventory');
  
  // Grant form state
  const [itemClassName, setItemClassName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [health, setHealth] = useState(100);
  const [sending, setSending] = useState(false);
  const [grantResult, setGrantResult] = useState<{ success: boolean; message: string } | null>(null);
  const [grantResults, setGrantResults] = useState<GrantResult[]>([]);
  
  // Online players state
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerData[]>([]);
  
  // Trades state
  const [playerTrades, setPlayerTrades] = useState<TradeLog | null>(null);
  
  // Search filter
  const [searchFilter, setSearchFilter] = useState('');
  
  // Event map popup
  const [selectedEvent, setSelectedEvent] = useState<PlayerEvent | null>(null);
  
  // Item search for grants
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [itemSearchCategory, setItemSearchCategory] = useState('');
  const [itemSearchResults, setItemSearchResults] = useState<Item[]>([]);
  const [itemSearchLoading, setItemSearchLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  
  // Money grant modal
  const [showMoneyModal, setShowMoneyModal] = useState(false);
  const [moneyAmount, setMoneyAmount] = useState(1000);
  const [moneySending, setMoneySending] = useState(false);
  const { mapConfig } = useMapConfig(isConnected);

  // Item delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ className: string; itemPath: string; displayName: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [data, onlineData] = await Promise.all([
        getDashboard(),
        getOnlinePlayers().catch(() => ({ players: [] }))
      ]);
      setDashboard(data);
      setOnlinePlayers(onlineData.players || []);
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
      const [data, onlineData] = await Promise.all([
        refreshDashboard(),
        getOnlinePlayers().catch(() => ({ players: [] }))
      ]);
      setDashboard(data);
      setOnlinePlayers(onlineData.players || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const loadPlayerDetails = async (playerId: string) => {
    setLoadingPlayer(true);
    try {
      const [data, trades] = await Promise.all([
        getPlayer(playerId),
        getPlayerTrades(playerId).catch(() => null)
      ]);
      setPlayerDetails(data);
      setPlayerTrades(trades);
    } catch (err) {
      console.error('Failed to load player:', err);
    } finally {
      setLoadingPlayer(false);
    }
  };

  const loadGrantResults = async () => {
    try {
      const data = await getGrantResults();
      setGrantResults(data.results || []);
    } catch (err) {
      console.error('Failed to load grant results:', err);
    }
  };

  const handleSelectPlayer = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setActiveTab('inventory');
    loadPlayerDetails(playerId);
    loadGrantResults();
  };

  const handleBackToList = () => {
    setSelectedPlayerId(null);
    setPlayerDetails(null);
    setPlayerTrades(null);
    setGrantResult(null);
  };

  const handleGrant = async () => {
    if (!selectedPlayerId || !itemClassName) {
      setGrantResult({ success: false, message: 'Please enter Item Class Name' });
      return;
    }

    setSending(true);
    setGrantResult(null);

    try {
      const response = await createGrant({
        playerId: selectedPlayerId,
        itemClassName,
        quantity,
        health,
      });

      setGrantResult({
        success: true,
        message: `${response.status} - ${itemClassName} x${quantity} queued`,
      });

      setItemClassName('');
      setQuantity(1);
      setHealth(100);

      setTimeout(loadGrantResults, 1000);
    } catch (err) {
      setGrantResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to create grant',
      });
    } finally {
      setSending(false);
    }
  };

  // Open delete confirmation
  const openDeleteConfirm = (className: string, itemPath: string, displayName: string) => {
    setDeleteTarget({ className, itemPath, displayName });
    setDeleteMessage(null);
    setShowDeleteConfirm(true);
  };

  // Handle delete item
  const handleDeleteItem = async () => {
    if (!selectedPlayerId || !deleteTarget) return;

    setDeleting(true);
    setDeleteMessage(null);

    try {
      const response = await deleteItemFromPlayer(selectedPlayerId, {
        itemClassName: deleteTarget.className,
        itemPath: deleteTarget.itemPath,
      });

      setDeleteMessage({
        type: 'success',
        text: response.message || 'Item deletion queued successfully!'
      });

      // Close after short delay and refresh player data
      setTimeout(() => {
        setShowDeleteConfirm(false);
        setDeleteTarget(null);
        setDeleteMessage(null);
        // Refresh player details to update inventory
        if (selectedPlayerId) {
          loadPlayerDetails(selectedPlayerId);
        }
      }, 1500);
    } catch (err) {
      setDeleteMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to queue item deletion'
      });
    } finally {
      setDeleting(false);
    }
  };

  // Load categories on mount
  useEffect(() => {
    if (!isConnected) return;
    const loadCats = async () => {
      try {
        const data: CategoriesResponse = await getCategories();
        setCategories(data.categories);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    loadCats();
  }, [isConnected]);

  // Search items for grant
  const performItemSearch = useCallback(async () => {
    if (!isConnected) return;
    if (!itemSearchQuery && !itemSearchCategory) {
      setItemSearchResults([]);
      return;
    }

    setItemSearchLoading(true);
    try {
      const data = await searchItems({
        q: itemSearchQuery || undefined,
        category: itemSearchCategory || undefined,
        limit: 50,
      });
      setItemSearchResults(data.items);
    } catch (err) {
      console.error('Item search failed:', err);
      setItemSearchResults([]);
    } finally {
      setItemSearchLoading(false);
    }
  }, [isConnected, itemSearchQuery, itemSearchCategory]);

  // Debounced item search
  useEffect(() => {
    const timer = setTimeout(() => {
      performItemSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [performItemSearch]);

  // Select item from search
  const handleSelectSearchItem = (item: Item) => {
    setItemClassName(item.className);
    setItemSearchQuery('');
    setItemSearchCategory('');
    setItemSearchResults([]);
  };

  // Grant money to player
  const handleGrantMoney = async () => {
    if (!selectedPlayerId || moneyAmount <= 0) return;

    setMoneySending(true);
    setGrantResult(null);

    try {
      const response = await createGrant({
        playerId: selectedPlayerId,
        itemClassName: 'ExpansionBanknoteHryvnia',
        quantity: moneyAmount,
        health: 100,
      });

      setGrantResult({
        success: true,
        message: `${response.status} - $${moneyAmount.toLocaleString()} queued`,
      });

      setShowMoneyModal(false);
      setMoneyAmount(1000);

      setTimeout(loadGrantResults, 1000);
    } catch (err) {
      setGrantResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to grant money',
      });
    } finally {
      setMoneySending(false);
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
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [isConnected, loadDashboard]);

  // Build player list with summary info
  const getPlayerList = (): PlayerSummary[] => {
    if (!dashboard?.players) return [];
    
    return Object.entries(dashboard.players).map(([playerId, playerData]) => {
      const invData = playerData.inventory?.players?.[0];
      const invCount = invData?.inventory?.length || 0;
      const playerName = invData?.playerName || 'Unknown Survivor';
      const eventCount = playerData.events?.events?.length || 0;
      const lifeEventCount = playerData.lifeEvents?.events?.length || 0;
      
      // Find online data for this player
      const onlineData = onlinePlayers.find(p => p.playerId === playerId);
      const isOnline = onlineData?.isOnline || false;
      
      return {
        id: playerId,
        name: playerName,
        inventoryCount: invCount,
        eventCount,
        lifeEventCount,
        isOnline,
        onlineData,
      };
    });
  };

  const filteredPlayers = getPlayerList().filter(player => 
    player.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    player.id.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'SUCCESS':
        return <Badge variant="success"><CheckCircle size={12} className="mr-1" /> Success</Badge>;
      case 'FAILED':
        return <Badge variant="error"><XCircle size={12} className="mr-1" /> Failed</Badge>;
      default:
        return <Badge variant="warning"><Clock size={12} className="mr-1" /> Pending</Badge>;
    }
  };

  if (!isConnected) {
    return (
      <Card title="Player Manager" icon={<Users size={20} />}>
        <p className="text-surface-500">Connect to the API to manage players.</p>
      </Card>
    );
  }

  // Player Detail View
  if (selectedPlayerId && playerDetails) {
    const invData = playerDetails.inventory?.players?.[0];
    const playerName = invData?.playerName || 'Unknown Survivor';
    const items = invData?.inventory || [];
    const totalItems = flattenInventory(items).length;
    const itemEvents = playerDetails.events?.events || [];
    const lifeEvents = playerDetails.lifeEvents?.events || [];
    const trades = playerTrades?.trades || [];
    const playerGrants = grantResults.filter(g => g.playerId === selectedPlayerId);
    
    // Get online data for this player
    const selectedOnlineData = onlinePlayers.find(p => p.playerId === selectedPlayerId);
    const isOnline = selectedOnlineData?.isOnline || false;
    const playerBiId = invData?.biId || selectedOnlineData?.biId || playerDetails.online?.biId || '';
    const combatCount = getCombatReviewCount(selectedPlayerId, dashboard?.players);

    const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
      { id: 'inventory', label: 'Inventory', icon: <Package size={16} />, count: totalItems },
      { id: 'events', label: 'Item Events', icon: <Backpack size={16} />, count: itemEvents.length },
      { id: 'life', label: 'Life Events', icon: <Skull size={16} />, count: lifeEvents.length },
      { id: 'combat', label: 'Combat', icon: <Crosshair size={16} />, count: combatCount },
      { id: 'trades', label: 'Trades', icon: <ArrowDown size={16} />, count: trades.length },
      { id: 'bank', label: 'Bank', icon: <Banknote size={16} /> },
      { id: 'grant', label: 'Grant Items', icon: <Gift size={16} /> },
    ];

    return (
      <Card compact>
        {/* Header */}
        <div className="mb-5 rounded-lg border border-surface-200 bg-surface-50 p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToList}
                icon={<ChevronLeft size={16} />}
              >
                Back
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-bold text-surface-900">{playerName}</h2>
                  <Badge variant={isOnline ? 'success' : 'default'}>
                    {isOnline ? <Wifi size={12} className="mr-1" /> : <WifiOff size={12} className="mr-1" />}
                    {isOnline ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <code className="rounded-md bg-white px-2 py-1 text-xs text-primary-600 ring-1 ring-surface-200">
                    Steam {selectedPlayerId}
                  </code>
                  {playerBiId && (
                    <code className="rounded-md bg-white px-2 py-1 text-xs text-surface-600 ring-1 ring-surface-200">
                      BI {playerBiId}
                    </code>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadPlayerDetails(selectedPlayerId)}
              loading={loadingPlayer}
              icon={<RefreshCw size={14} />}
            >
              Refresh
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-lg bg-white p-3 ring-1 ring-surface-200">
              <div className="text-xs text-surface-500">Inventory</div>
              <div className="mt-1 text-lg font-semibold text-surface-900">{totalItems.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-white p-3 ring-1 ring-surface-200">
              <div className="text-xs text-surface-500">Item Events</div>
              <div className="mt-1 text-lg font-semibold text-surface-900">{itemEvents.length.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-white p-3 ring-1 ring-surface-200">
              <div className="text-xs text-surface-500">Life Events</div>
              <div className="mt-1 text-lg font-semibold text-surface-900">{lifeEvents.length.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-white p-3 ring-1 ring-surface-200">
              <div className="text-xs text-surface-500">Trades</div>
              <div className="mt-1 text-lg font-semibold text-surface-900">{trades.length.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-white p-3 ring-1 ring-surface-200">
              <div className="text-xs text-surface-500">Grants</div>
              <div className="mt-1 text-lg font-semibold text-surface-900">{playerGrants.length.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Online Player Status Bar */}
        {selectedOnlineData && isOnline && (
          <div className="bg-surface-50 rounded-lg p-4 border border-surface-200 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-primary-500" />
                <div>
                  <div className="text-xs text-surface-500">Position</div>
                  <div className="text-sm font-medium text-surface-800">
                    {Math.round(selectedOnlineData.position.x)}, {Math.round(selectedOnlineData.position.y)}, {Math.round(selectedOnlineData.position.z)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Heart size={16} className="text-red-500" />
                <div>
                  <div className="text-xs text-surface-500">Health</div>
                  <div className="text-sm font-medium text-surface-800">{Math.round(selectedOnlineData.health)}%</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Droplets size={16} className="text-blue-500" />
                <div>
                  <div className="text-xs text-surface-500">Blood</div>
                  <div className="text-sm font-medium text-surface-800">{Math.round(selectedOnlineData.blood)}%</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Droplets size={16} className="text-cyan-500" />
                <div>
                  <div className="text-xs text-surface-500">Water</div>
                  <div className="text-sm font-medium text-surface-800">{Math.round(selectedOnlineData.water)}%</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-yellow-500" />
                <div>
                  <div className="text-xs text-surface-500">Energy</div>
                  <div className="text-sm font-medium text-surface-800">{Math.round(selectedOnlineData.energy)}%</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-surface-100 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-600 hover:bg-white/70 hover:text-surface-900'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-surface-200 text-surface-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <div>
              {items.length > 0 ? (
                <InventoryTree 
                  items={items} 
                  onGrant={(className) => {
                    setItemClassName(className);
                    setActiveTab('grant');
                  }}
                  onDelete={(className, itemPath, displayName) => {
                    openDeleteConfirm(className, itemPath, displayName);
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-surface-500">
                  <Package size={48} className="mb-4 opacity-50" />
                  <p>No inventory data available</p>
                </div>
              )}
            </div>
          )}

          {/* Item Events Tab */}
          {activeTab === 'events' && (
            <div>
              {itemEvents.length > 0 ? (
                <div className="space-y-1">
                  {/* Sort newest first */}
                  {[...itemEvents].sort((a, b) => 
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                  ).map((event, idx) => {
                    const visual = getItemEventVisual(event.eventType);
                    const itemName = event.itemDisplayName || event.itemClassName || 'Unknown item';
                    const itemClassName = event.itemClassName || itemName;
                    
                    // Check if position is valid (exists and not at origin 0,0,0)
                    const hasPosition = event.position && 
                      event.position.length >= 2 && 
                      (event.position[0] !== 0 || event.position[2] !== 0);
                    const timeAgo = formatTimeAgo(event.timestamp);
                    
                    return (
                      <button
                        key={idx}
                        onClick={() => hasPosition && setSelectedEvent(event)}
                        disabled={!hasPosition}
                        className={`w-full text-left flex items-start gap-3 px-3 py-2 rounded-lg border ${visual.rowClass} ${
                          hasPosition ? 'hover:ring-2 hover:ring-primary-300 cursor-pointer' : 'cursor-default'
                        } transition-all`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${visual.iconClass}`}>
                          {visual.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-surface-800 truncate">
                              {itemName}
                            </span>
                            <Badge variant={visual.badgeVariant} className="shrink-0">
                              {visual.label}
                            </Badge>
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-500">
                            {event.itemDisplayName && event.itemClassName && event.itemDisplayName !== event.itemClassName && (
                              <span className="truncate">{event.itemClassName}</span>
                            )}
                            <span>{formatEventQuantity(itemClassName, event.itemQuantity || 1)}</span>
                            {hasPosition && (
                              <span className="inline-flex items-center gap-1 text-primary-600">
                                <MapPin size={12} />
                                Location
                              </span>
                            )}
                            <span className="text-surface-400">{timeAgo}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-surface-500">
                  <Calendar size={48} className="mb-4 opacity-50" />
                  <p>No item events recorded</p>
                </div>
              )}
            </div>
          )}

          {/* Event Location Modal */}
          {selectedEvent && selectedEvent.position && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedEvent(null)}>
              <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-surface-200">
                  <div className="flex items-center gap-3">
                    <MapPin className="text-primary-500" size={20} />
                    <div>
                      <h3 className="font-semibold text-surface-800">{selectedEvent.itemClassName}</h3>
                      <p className="text-sm text-surface-500">
                        {selectedEvent.eventType} at {new Date(selectedEvent.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedEvent(null)}
                    className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                  >
                    <X size={20} className="text-surface-500" />
                  </button>
                </div>
                <div className="h-96 relative">
                  {/* Actual map showing the location */}
                  <MapContainer
                    key={mapRenderKey(mapConfig)}
                    crs={L.CRS.Simple}
                    center={gameToMap(mapConfig, selectedEvent.position[0], selectedEvent.position[2] || selectedEvent.position[1])}
                    zoom={0}
                    minZoom={-3}
                    maxZoom={2}
                    maxBounds={paddedMapBounds(mapConfig)}
                    style={{ width: '100%', height: '100%', background: '#1a1a2e' }}
                    attributionControl={false}
                  >
                    <MapImageLayer mapConfig={mapConfig} />
                    <CenterOnPosition position={gameToMap(mapConfig, selectedEvent.position[0], selectedEvent.position[2] || selectedEvent.position[1])} />
                    
                    {/* Event marker */}
                    <CircleMarker
                      center={gameToMap(mapConfig, selectedEvent.position[0], selectedEvent.position[2] || selectedEvent.position[1])}
                      radius={12}
                      pathOptions={{
                        color: '#fff',
                        fillColor: getItemEventVisual(selectedEvent.eventType).markerColor,
                        fillOpacity: 0.9,
                        weight: 3,
                      }}
                    />
                  </MapContainer>
                  
                  {/* Coordinates overlay */}
                  <div className="absolute bottom-3 left-3 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-mono">
                    X: {Math.round(selectedEvent.position[0])} | Z: {Math.round(selectedEvent.position[2] || selectedEvent.position[1])}
                  </div>
                </div>
                <div className="p-4 bg-surface-50 border-t border-surface-200">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-surface-500">Quantity: <span className="text-surface-800 font-medium">{formatEventQuantity(selectedEvent.itemClassName || '', selectedEvent.itemQuantity || 1)}</span></span>
                      {selectedEvent.itemHealth !== undefined && (
                        <span className="text-surface-500">Health: <span className="text-surface-800 font-medium">{Math.round(selectedEvent.itemHealth)}%</span></span>
                      )}
                    </div>
                    <Badge variant={getItemEventVisual(selectedEvent.eventType).badgeVariant}>
                      {getItemEventVisual(selectedEvent.eventType).label}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Life Events Tab */}
          {activeTab === 'life' && (
            <div>
              {lifeEvents.length > 0 ? (
                <div className="space-y-2">
                  {lifeEvents.map((event, idx) => {
                    const visual = getLifeEventVisual(event.eventType);
                    const timeAgo = formatTimeAgo(event.timestamp);

                    return (
                      <div 
                        key={idx}
                        className={`rounded-lg px-4 py-3 border flex items-start gap-3 ${visual.rowClass}`}
                      >
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${visual.iconClass}`}>
                          {visual.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={visual.badgeVariant}>
                              {visual.label}
                            </Badge>
                            <span className="font-medium text-surface-800 truncate">{event.playerName}</span>
                          </div>
                          <div className="mt-1 text-sm text-surface-600">
                            {event.eventType === 'DIED' && event.causeOfDeath ? (
                              <span>Cause: <span className="text-red-700">{event.causeOfDeath}</span></span>
                            ) : (
                              <span>{visual.label} event recorded for {event.playerName}</span>
                            )}
                          </div>
                          <div className="text-surface-500 text-sm mt-1">
                            {new Date(event.timestamp).toLocaleString()} - {timeAgo}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-surface-500">
                  <Activity size={48} className="mb-4 opacity-50" />
                  <p>No life events recorded</p>
                </div>
              )}
            </div>
          )}

          {/* Combat Tab */}
          {activeTab === 'combat' && (
            <PlayerCombatHeatmap
              playerId={selectedPlayerId}
              playerName={playerName}
              playerEvents={itemEvents}
              playerLifeEvents={lifeEvents}
              allPlayers={dashboard?.players}
            />
          )}

          {/* Trades Tab */}
          {activeTab === 'trades' && (
            <div>
              {/* Trade Summary */}
              {playerTrades && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{playerTrades.totalPurchases}</div>
                    <div className="text-xs text-green-600">Items Purchased</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-amber-700">{playerTrades.totalSales}</div>
                    <div className="text-xs text-amber-600">Items Sold</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">${playerTrades.totalSpent.toLocaleString()}</div>
                    <div className="text-xs text-red-600">Total Spent</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-700">${playerTrades.totalEarned.toLocaleString()}</div>
                    <div className="text-xs text-blue-600">Total Earned</div>
                  </div>
                </div>
              )}
              
              {trades.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {[...trades].reverse().map((trade, idx) => {
                    const isPurchase = trade.eventType === 'PURCHASE';
                    const timeAgo = formatTimeAgo(trade.timestamp);
                    
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 px-3 py-2 rounded border ${
                          isPurchase ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                        }`}
                      >
                        {isPurchase ? (
                          <ArrowDown size={16} className="text-green-600" />
                        ) : (
                          <ArrowUp size={16} className="text-amber-600" />
                        )}
                        <span className="text-sm font-medium text-surface-800 flex-1 truncate">
                          {trade.itemDisplayName || trade.itemClassName}
                        </span>
                        <span className="text-xs text-surface-500">
                          x{trade.quantity}
                        </span>
                        <span className={`text-sm font-semibold ${isPurchase ? 'text-red-600' : 'text-green-600'}`}>
                          {isPurchase ? '-' : '+'}${trade.price.toLocaleString()}
                        </span>
                        {trade.traderName && (
                          <span className="text-xs text-surface-400 hidden md:inline">
                            @ {trade.traderName}
                          </span>
                        )}
                        <span className="text-xs text-surface-400 w-16 text-right">
                          {timeAgo}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-surface-500">
                  <ArrowDown size={48} className="mb-4 opacity-50" />
                  <p>No trades recorded</p>
                  <p className="text-sm text-surface-400 mt-1">Market transactions will appear here</p>
                </div>
              )}
            </div>
          )}

          {/* Bank Tab */}
          {activeTab === 'bank' && (
            <PlayerBankPanel
              steamId={selectedPlayerId}
              biId={playerBiId}
              playerName={playerName}
            />
          )}

          {/* Grant Items Tab */}
          {activeTab === 'grant' && (
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => setShowMoneyModal(true)}
                  icon={<DollarSign size={16} />}
                >
                  Grant Money
                </Button>
              </div>

              {/* Item Search */}
              <div className="bg-surface-50 rounded-lg p-4 border border-surface-200">
                <h3 className="text-sm font-semibold text-surface-600 mb-4 flex items-center gap-2">
                  <Search size={16} />
                  Search Items
                </h3>
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Search items by name or class..."
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                      icon={<Search size={16} />}
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <Select
                      value={itemSearchCategory}
                      onChange={(e) => setItemSearchCategory(e.target.value)}
                      options={[
                        { value: '', label: 'All Categories' },
                        ...categories.map((cat) => ({ value: cat, label: cat })),
                      ]}
                    />
                  </div>
                </div>

                {itemSearchLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin h-6 w-6 border-3 border-primary-500 border-t-transparent rounded-full" />
                  </div>
                ) : itemSearchResults.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto border border-surface-200 rounded-lg">
                    {itemSearchResults.map((item) => (
                      <div
                        key={item.className}
                        onClick={() => handleSelectSearchItem(item)}
                        className="flex items-center justify-between px-4 py-3 border-b border-surface-200 last:border-b-0 hover:bg-surface-100 cursor-pointer transition-colors"
                      >
                        <div>
                          <code className="text-primary-500 bg-surface-100 px-2 py-0.5 rounded text-sm">
                            {item.className}
                          </code>
                          <span className="text-surface-700 ml-3">{item.displayName}</span>
                        </div>
                        <Badge variant="info">{item.category}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (itemSearchQuery || itemSearchCategory) ? (
                  <div className="text-center py-6 text-surface-500">
                    <Package size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No items found</p>
                  </div>
                ) : null}
              </div>

              {/* Grant Form */}
              <div className="bg-surface-50 rounded-lg p-4 border border-surface-200">
                <h3 className="text-sm font-semibold text-surface-600 mb-4 flex items-center gap-2">
                  <Gift size={16} />
                  Grant Item to {playerName}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Input
                    label="Item Class Name"
                    placeholder="Select from search or type manually"
                    value={itemClassName}
                    onChange={(e) => setItemClassName(e.target.value)}
                  />
                  <Input
                    label="Quantity"
                    type="number"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                  <Input
                    label="Health %"
                    type="number"
                    min={0}
                    max={100}
                    value={health}
                    onChange={(e) => setHealth(parseInt(e.target.value) || 100)}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleGrant}
                    loading={sending}
                    disabled={!itemClassName}
                    icon={<Send size={16} />}
                  >
                    Send Grant
                  </Button>

                  {grantResult && (
                    <div className={`flex items-center gap-2 ${grantResult.success ? 'text-green-600' : 'text-red-600'}`}>
                      {grantResult.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
                      <span>{grantResult.message}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Money Grant Modal */}
              {showMoneyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-surface-800 flex items-center gap-2">
                        <DollarSign size={20} className="text-green-600" />
                        Grant Money to {playerName}
                      </h3>
                      <button
                        onClick={() => setShowMoneyModal(false)}
                        className="p-1 hover:bg-surface-100 rounded"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <p className="text-sm text-surface-600 mb-4">
                      Send Hryvnia Banknotes to this player. The money will appear in their inventory.
                    </p>
                    <div className="mb-4">
                      <Input
                        label="Amount (Hryvnia)"
                        type="number"
                        min={1}
                        max={1000000}
                        value={moneyAmount}
                        onChange={(e) => setMoneyAmount(parseInt(e.target.value) || 1000)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => setShowMoneyModal(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleGrantMoney}
                        loading={moneySending}
                        icon={<Send size={16} />}
                        className="flex-1"
                      >
                        Send ${moneyAmount.toLocaleString()}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Grant History for this player */}
              <div>
                <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                  <CheckCircle size={16} />
                  Grant History ({playerGrants.length})
                </h3>
                {playerGrants.length > 0 ? (
                  <div className="space-y-2">
                    {playerGrants.map((grant, idx) => (
                      <div 
                        key={idx}
                        className="bg-surface-50 rounded-lg px-4 py-3 border border-surface-200 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-surface-800 font-medium">{grant.itemClassName}</span>
                          <span className="text-surface-500 ml-2">x{grant.quantity}</span>
                          <span className="text-surface-500 ml-2">({grant.health}% health)</span>
                        </div>
                        {getResultBadge(grant.result)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-surface-500 text-sm">No grants sent to this player yet</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Delete Item Confirmation Modal - rendered outside tabs */}
        {showDeleteConfirm && deleteTarget && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-surface-800 mb-4 flex items-center gap-2">
                <XCircle size={20} className="text-red-500" />
                Delete Item
              </h3>
              <p className="text-surface-600 mb-4">
                Are you sure you want to delete <strong>{deleteTarget.displayName}</strong> from this player's inventory?
              </p>
              <p className="text-sm text-amber-600 mb-4">
                ⚠️ This will remove the item when the player is online. The request will be queued.
              </p>
              
              {deleteMessage && (
                <div className={`mb-4 p-3 rounded-lg ${
                  deleteMessage.type === 'success' 
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {deleteMessage.text}
                </div>
              )}
              
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget(null);
                    setDeleteMessage(null);
                  }}
                  className="flex-1"
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDeleteItem}
                  loading={deleting}
                  className="flex-1"
                  disabled={deleting || deleteMessage?.type === 'success'}
                >
                  Delete Item
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    );
  }

  // Loading state for player details
  if (selectedPlayerId && loadingPlayer) {
    return (
      <Card compact>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      </Card>
    );
  }

  // Player List View
  const onlineCount = onlinePlayers.filter(p => p.isOnline).length;
  
  return (
    <Card
      compact
      title="Player Manager"
      icon={<Users size={20} />}
      actions={
        <div className="flex items-center gap-2 sm:gap-4">
          <Badge variant={onlineCount > 0 ? 'success' : 'default'}>
            <Wifi size={12} className="mr-1" />
            {onlineCount} Online
          </Badge>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadDashboard}
              loading={loading}
              icon={<RefreshCw size={14} />}
            >
              Reload
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRefresh}
              loading={refreshing}
              icon={<RefreshCw size={14} />}
            >
              Force Refresh
            </Button>
          </div>
        </div>
      }
    >
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Search Filter */}
      <div className="mb-6">
        <Input
          placeholder="Search by name or Steam ID..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          icon={<Search size={16} />}
        />
      </div>

      {/* Player Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin h-10 w-10 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : filteredPlayers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlayers.map((player) => (
            <button
              key={player.id}
              onClick={() => handleSelectPlayer(player.id)}
              className="bg-surface-50 rounded-lg p-4 border border-surface-200 text-left hover:border-primary-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-surface-800 truncate group-hover:text-primary-500 transition-colors">
                      {player.name}
                    </h3>
                    {player.isOnline ? (
                      <Badge variant="success" className="flex-shrink-0">
                        <Wifi size={10} className="mr-1" /> Online
                      </Badge>
                    ) : (
                      <Badge variant="default" className="flex-shrink-0">
                        <WifiOff size={10} className="mr-1" /> Offline
                      </Badge>
                    )}
                  </div>
                  <code className="text-primary-500 bg-surface-100 px-2 py-0.5 rounded text-xs block mt-1 truncate">
                    {player.id}
                  </code>
                </div>
              </div>
              
              {/* Show position if online */}
              {player.isOnline && player.onlineData && (
                <div className="flex items-center gap-1 text-xs text-surface-500 mb-2">
                  <MapPin size={12} />
                  <span>
                    {Math.round(player.onlineData.position.x)}, {Math.round(player.onlineData.position.y)}
                  </span>
                  <span className="mx-1">|</span>
                  <Heart size={12} className="text-red-400" />
                  <span>{Math.round(player.onlineData.health)}%</span>
                </div>
              )}
              
              <div className="flex gap-2 flex-wrap">
                <Badge variant={player.inventoryCount > 0 ? 'success' : 'default'}>
                  <Package size={12} className="mr-1" />
                  {player.inventoryCount} items
                </Badge>
                <Badge variant={player.eventCount > 0 ? 'info' : 'default'}>
                  <Calendar size={12} className="mr-1" />
                  {player.eventCount} events
                </Badge>
                <Badge variant={player.lifeEventCount > 0 ? 'warning' : 'default'}>
                  <Activity size={12} className="mr-1" />
                  {player.lifeEventCount} life
                </Badge>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-surface-500">
          <Users size={48} className="mb-4 opacity-50" />
          <p>{searchFilter ? 'No players match your search' : 'No players found in cache'}</p>
          <p className="text-sm mt-1">Players will appear here when they connect to the server</p>
        </div>
      )}
    </Card>
  );
};

export default PlayerManager;
