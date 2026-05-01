import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { MapContainer, ImageOverlay, CircleMarker, Popup, useMap, useMapEvents, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  RefreshCw, Users, Wifi, ChevronLeft, ChevronRight, 
  Heart, Droplets, Zap, MapPin, X, Navigation, Store
} from 'lucide-react';
import { Badge, Button } from '../ui';
import { PlayerModal } from './PlayerModal';
import { getOnlinePlayers, teleportPlayer, getTraderZones } from '../../services/api';
import type { OnlinePlayerData, TraderZone } from '../../types';

const MAP_SIZE = 15360;

// Map bounds for CRS.Simple
const bounds: L.LatLngBoundsExpression = [
  [0, 0],
  [MAP_SIZE, MAP_SIZE]
];

// DayZ world coords to Leaflet map coords
function dzToMap(x: number, z: number): [number, number] {
  return [z, x];
}

// Leaflet map coords to DayZ world coords
function mapToDz(lat: number, lng: number): { x: number; z: number } {
  return { x: lng, z: lat };
}

// Custom crosshair icon for teleport target
const crosshairIcon = L.divIcon({
  className: 'teleport-crosshair',
  html: '<div style="width: 24px; height: 24px; border: 3px solid #16a34a; border-radius: 50%; background: rgba(22, 163, 74, 0.3); position: relative;"><div style="position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; background: #16a34a; border-radius: 50%; transform: translate(-50%, -50%);"></div></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Map click handler component
interface MapClickHandlerProps {
  enabled: boolean;
  onMapClick: (lat: number, lng: number) => void;
}

const MapClickHandler: React.FC<MapClickHandlerProps> = ({ enabled, onMapClick }) => {
  useMapEvents({
    click: (e) => {
      if (enabled) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
};

// Memoized player marker to prevent re-renders
const PlayerMarker = memo(({ 
  player, 
  onClick 
}: { 
  player: OnlinePlayerData; 
  onClick: () => void;
}) => {
  const position = dzToMap(player.position?.x || 0, player.position?.z || 0);
  
  return (
    <CircleMarker
      center={position}
      radius={8}
      pathOptions={{
        color: '#dc2626',
        fillColor: '#ef4444',
        fillOpacity: 0.9,
        weight: 2,
      }}
      eventHandlers={{
        click: onClick
      }}
    >
      <Popup>
        <div className="text-sm min-w-[150px]">
          <div className="font-bold text-gray-900">{player.playerName}</div>
          <div className="text-gray-600 mt-1 text-xs">
            {Math.round(player.position?.x || 0)}, {Math.round(player.position?.z || 0)}
          </div>
          <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
            <div>HP: {Math.round(player.health || 0)}%</div>
            <div>Blood: {Math.round(player.blood || 0)}</div>
          </div>
          <button 
            onClick={onClick}
            className="mt-2 w-full text-center text-xs bg-indigo-600 text-white py-1 rounded hover:bg-indigo-700"
          >
            Manage Player
          </button>
        </div>
      </Popup>
    </CircleMarker>
  );
});

PlayerMarker.displayName = 'PlayerMarker';

// Component to set initial view
function SetView() {
  const map = useMap();
  useEffect(() => {
    map.setView([MAP_SIZE / 2, MAP_SIZE / 2], -2);
  }, [map]);
  return null;
}

interface FullPageMapProps {
  isConnected: boolean;
}

export const FullPageMap: React.FC<FullPageMapProps> = ({ isConnected }) => {
  const [players, setPlayers] = useState<OnlinePlayerData[]>([]);
  const [traderZones, setTraderZones] = useState<TraderZone[]>([]);
  const [showTraderZones, setShowTraderZones] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);
  
  // Teleport mode state
  const [teleportMode, setTeleportMode] = useState<{ playerId: string; playerName: string } | null>(null);
  const [teleportTarget, setTeleportTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [teleportSending, setTeleportSending] = useState(false);

  // Load trader zones once on mount
  useEffect(() => {
    if (!isConnected) return;
    
    const loadZones = async () => {
      try {
        const data = await getTraderZones();
        setTraderZones(data.zones || []);
      } catch (err) {
        console.error('Failed to load trader zones:', err);
      }
    };
    
    loadZones();
  }, [isConnected]);

  const loadPlayers = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    try {
      const data = await getOnlinePlayers();
      setPlayers(data.players?.filter(p => p.isOnline && p.position) || []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to load online players:', err);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  // Initial load and auto-refresh every 10 seconds
  useEffect(() => {
    if (!isConnected) return;
    loadPlayers();
    const interval = setInterval(loadPlayers, 10000);
    return () => clearInterval(interval);
  }, [isConnected, loadPlayers]);

  // Handle map click for teleport
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (teleportMode) {
      setTeleportTarget({ lat, lng });
    }
  }, [teleportMode]);

  // Confirm teleport
  const confirmTeleport = useCallback(async () => {
    if (!teleportMode || !teleportTarget) return;
    
    const dzCoords = mapToDz(teleportTarget.lat, teleportTarget.lng);
    setTeleportSending(true);
    
    try {
      await teleportPlayer({
        playerId: teleportMode.playerId,
        x: dzCoords.x,
        z: dzCoords.z,
      });
      
      // Clear teleport mode
      setTeleportMode(null);
      setTeleportTarget(null);
      
      // Refresh players after a short delay to see the new position
      setTimeout(loadPlayers, 3000);
    } catch (err) {
      console.error('Failed to teleport player:', err);
    } finally {
      setTeleportSending(false);
    }
  }, [teleportMode, teleportTarget, loadPlayers]);

  // Cancel teleport mode
  const cancelTeleport = useCallback(() => {
    setTeleportMode(null);
    setTeleportTarget(null);
  }, []);

  // Handle opening player modal (can pass teleport request back)
  const handleOpenPlayerModal = useCallback((playerId: string, playerName: string) => {
    setSelectedPlayer({ id: playerId, name: playerName });
  }, []);

  // Handle teleport request from modal
  const handleTeleportRequest = useCallback((playerId: string, playerName: string) => {
    setSelectedPlayer(null); // Close modal
    setTeleportMode({ playerId, playerName });
    setTeleportTarget(null);
  }, []);

  // Memoize players to prevent unnecessary re-renders
  const memoizedPlayers = useMemo(() => players, [players]);

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-50">
        <div className="text-center">
          <MapPin size={48} className="mx-auto mb-4 text-surface-500 opacity-50" />
          <p className="text-surface-500">Connect to the API to view the live map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex relative">
      {/* Sidebar */}
      <div className={`absolute top-0 left-0 h-full z-[1000] transition-all duration-300 ${
        sidebarOpen ? 'w-72' : 'w-0'
      }`}>
        <div className={`h-full bg-white shadow-xl flex flex-col ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-surface-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-surface-800 flex items-center gap-2">
                <Users size={20} />
                Live Map
              </h2>
              <button onClick={loadPlayers} disabled={loading} className="p-1.5 hover:bg-surface-100 rounded">
                <RefreshCw size={16} className={`text-surface-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={memoizedPlayers.length > 0 ? 'success' : 'default'}>
                <Wifi size={10} className="mr-1" />
                {memoizedPlayers.length} Online
              </Badge>
              {lastUpdate && (
                <span className="text-xs text-surface-500">
                  {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          {/* Player List */}
          <div className="flex-1 overflow-y-auto p-2">
            {memoizedPlayers.length > 0 ? (
              <div className="space-y-2">
                {memoizedPlayers.map((player) => (
                  <button
                    key={player.playerId}
                    onClick={() => setSelectedPlayer({ id: player.playerId, name: player.playerName })}
                    className="w-full text-left bg-surface-50 rounded-lg p-3 border border-surface-200 hover:border-primary-500 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="font-medium text-surface-800 truncate flex-1">
                        {player.playerName}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-surface-500 mb-2">
                      <MapPin size={10} />
                      <span>{Math.round(player.position?.x || 0)}, {Math.round(player.position?.z || 0)}</span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-1 text-xs">
                      <div className="flex items-center gap-0.5 text-red-500">
                        <Heart size={10} />
                        <span>{Math.round(player.health || 0)}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-blue-500">
                        <Droplets size={10} />
                        <span>{Math.round((player.blood || 0) / 50)}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-cyan-500">
                        <Droplets size={10} />
                        <span>{Math.round(player.water || 0)}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-yellow-500">
                        <Zap size={10} />
                        <span>{Math.round(player.energy || 0)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-surface-500 text-sm">
                <Users size={32} className="mx-auto mb-2 opacity-50" />
                No players online
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-surface-200 text-xs text-surface-500 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span>Player</span>
              <span className="mx-2">|</span>
              <span>Auto-refresh: 10s</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600" />
                <span>Trader Zones ({traderZones.length})</span>
              </div>
              <button
                onClick={() => setShowTraderZones(!showTraderZones)}
                className={`px-2 py-0.5 rounded text-xs ${showTraderZones ? 'bg-primary-500 text-white' : 'bg-surface-200 text-surface-600'}`}
              >
                {showTraderZones ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`absolute top-4 bg-white shadow-lg rounded-r-lg p-2 z-[1001] transition-all ${
            sidebarOpen ? 'left-72' : 'left-0'
          }`}
        >
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      {/* Teleport Mode Banner */}
      {teleportMode && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1001] bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-4">
          <Navigation size={20} className="animate-pulse" />
          <div>
            <div className="font-bold">Teleport Mode Active</div>
            <div className="text-sm opacity-90">
              Click on the map to teleport <span className="font-semibold">{teleportMode.playerName}</span>
            </div>
          </div>
          {teleportTarget && (
            <div className="ml-4 pl-4 border-l border-green-400">
              <div className="text-sm">Target: {Math.round(mapToDz(teleportTarget.lat, teleportTarget.lng).x)}, {Math.round(mapToDz(teleportTarget.lat, teleportTarget.lng).z)}</div>
              <div className="flex gap-2 mt-1">
                <Button 
                  size="sm" 
                  onClick={confirmTeleport} 
                  disabled={teleportSending}
                  className="bg-white text-green-700 hover:bg-green-50"
                >
                  {teleportSending ? 'Teleporting...' : 'Confirm'}
                </Button>
              </div>
            </div>
          )}
          <button 
            onClick={cancelTeleport}
            className="ml-2 p-1 hover:bg-green-500 rounded"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Map */}
      <div className={`flex-1 h-full ${teleportMode ? 'cursor-crosshair' : ''}`}>
        <MapContainer
          crs={L.CRS.Simple}
          center={[MAP_SIZE / 2, MAP_SIZE / 2]}
          zoom={-2}
          minZoom={-4}
          maxZoom={2}
          maxBounds={[[-1000, -1000], [MAP_SIZE + 1000, MAP_SIZE + 1000]]}
          style={{ width: '100%', height: '100%', background: '#1a1a2e' }}
          attributionControl={false}
          preferCanvas={true}
        >
          <SetView />
          <MapClickHandler enabled={!!teleportMode} onMapClick={handleMapClick} />
          
          <ImageOverlay
            url="/maps/chernarus.jpg"
            bounds={bounds}
          />

          {/* Trader Zones */}
          {showTraderZones && traderZones.map((zone) => {
            const position = dzToMap(zone.Position[0], zone.Position[2]);
            return (
              <Circle
                key={zone.fileName}
                center={position}
                radius={zone.Radius}
                pathOptions={{
                  color: '#10b981',
                  fillColor: '#10b981',
                  fillOpacity: 0.15,
                  weight: 2,
                  dashArray: '5, 5',
                }}
              >
                <Popup>
                  <div className="text-sm min-w-[150px]">
                    <div className="font-bold text-gray-900 flex items-center gap-1">
                      <Store size={14} />
                      {zone.m_DisplayName}
                    </div>
                    <div className="text-gray-600 mt-1 text-xs space-y-1">
                      <div>Radius: {zone.Radius}m</div>
                      <div>Position: {Math.round(zone.Position[0])}, {Math.round(zone.Position[2])}</div>
                      {zone.BuyPricePercent !== 100 && (
                        <div>Buy: {zone.BuyPricePercent}%</div>
                      )}
                      {zone.SellPricePercent !== -1 && (
                        <div>Sell: {zone.SellPricePercent}%</div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Circle>
            );
          })}

          {/* Teleport target marker */}
          {teleportTarget && (
            <Marker 
              position={[teleportTarget.lat, teleportTarget.lng]} 
              icon={crosshairIcon}
            />
          )}

          {memoizedPlayers.filter(p => p.position).map((player) => (
            <PlayerMarker
              key={player.playerId}
              player={player}
              onClick={() => handleOpenPlayerModal(player.playerId, player.playerName)}
            />
          ))}
        </MapContainer>
      </div>

      {/* Player Modal */}
      {selectedPlayer && (
        <PlayerModal
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          onClose={() => setSelectedPlayer(null)}
          onTeleportRequest={handleTeleportRequest}
        />
      )}
    </div>
  );
};

export default FullPageMap;
