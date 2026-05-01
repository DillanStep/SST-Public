import React, { useEffect, useState, useCallback } from 'react';
import { MapContainer, ImageOverlay, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RefreshCw, Users, Wifi } from 'lucide-react';
import { Card, Badge } from '../ui';
import { getOnlinePlayers } from '../../services/api';
import type { OnlinePlayerData } from '../../types';

const MAP_SIZE = 15360;

// Map bounds for CRS.Simple
const bounds: L.LatLngBoundsExpression = [
  [0, 0],
  [MAP_SIZE, MAP_SIZE]
];

// DayZ world coords to Leaflet map coords
// In CRS.Simple: [lat, lng] where lat=Y (vertical), lng=X (horizontal)
// DayZ: X=East/West, Z=South/North
// No flip needed - Leaflet CRS.Simple Y increases upward like DayZ Z
function dzToMap(x: number, z: number): [number, number] {
  return [z, x];
}

// Component to fit bounds on load
function FitBounds() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds as L.LatLngBoundsExpression);
  }, [map]);
  return null;
}

interface DayZMapProps {
  isConnected: boolean;
  onPlayerSelect?: (playerId: string) => void;
}

export const DayZMap: React.FC<DayZMapProps> = ({ isConnected, onPlayerSelect }) => {
  const [players, setPlayers] = useState<OnlinePlayerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadPlayers = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    try {
      const data = await getOnlinePlayers();
      // Only show online players with valid position data
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

  // Not connected state
  if (!isConnected) {
    return (
      <Card compact title="Live Map" icon={<Users size={20} />}>
        <p className="text-surface-500">Connect to the API to view the live map.</p>
      </Card>
    );
  }

  return (
    <Card
      compact
      title="Live Map"
      icon={<Users size={20} />}
      actions={
        <div className="flex items-center gap-2 sm:gap-3">
          <Badge variant={players.length > 0 ? 'success' : 'default'}>
            <Wifi size={12} className="mr-1" />
            {players.length} Online
          </Badge>
          {lastUpdate && (
            <span className="hidden sm:inline text-xs text-surface-500">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={loadPlayers}
            disabled={loading}
            className="p-1.5 rounded hover:bg-surface-100 transition-colors"
          >
            <RefreshCw size={14} className={`text-surface-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[600px]">
        {/* Player List Sidebar */}
        <div className="w-full lg:w-56 flex-shrink-0 lg:border-r border-surface-200 lg:pr-4 overflow-y-auto max-h-48 lg:max-h-none">
          <h3 className="text-sm font-semibold text-surface-600 mb-2 flex items-center gap-2">
            <Users size={14} />
            Online Players ({players.length})
          </h3>
          {players.length > 0 ? (
            <div className="space-y-2">
              {players.map((player) => (
                <button
                  key={player.playerId}
                  onClick={() => onPlayerSelect?.(player.playerId)}
                  className="w-full text-left bg-surface-50 rounded-lg p-3 border border-surface-200 hover:border-primary-500 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm font-medium text-surface-800 truncate">
                      {player.playerName}
                    </span>
                  </div>
                  <div className="text-xs text-surface-500">
                    Pos: {Math.round(player.position?.x || 0)}, {Math.round(player.position?.z || 0)}
                  </div>
                  <div className="flex gap-2 mt-1 text-xs text-surface-500">
                    <span>HP: {Math.round(player.health)}%</span>
                    <span>Blood: {Math.round(player.blood)}%</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-500">No players online</p>
          )}
        </div>

        {/* Map Container */}
        <div className="flex-1 rounded-lg overflow-hidden border border-surface-200">
          <MapContainer
            crs={L.CRS.Simple}
            bounds={bounds}
            minZoom={-4}
            maxZoom={2}
            zoom={-2}
            style={{ width: '100%', height: '100%', background: '#1a1a2e' }}
            attributionControl={false}
          >
            <FitBounds />
            
            {/* Map Image - you'll need to place this in public/maps/ */}
            <ImageOverlay
              url="/maps/chernarus.jpg"
              bounds={bounds}
            />

            {/* Player Markers */}
            {players.filter(p => p.position).map((player) => (
              <CircleMarker
                key={player.playerId}
                center={dzToMap(player.position?.x || 0, player.position?.z || 0)}
                radius={8}
                pathOptions={{
                  color: '#dc2626',
                  fillColor: '#ef4444',
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-bold text-gray-900">{player.playerName}</div>
                    <div className="text-gray-600 mt-1">
                      Position: {Math.round(player.position?.x || 0)}, {Math.round(player.position?.y || 0)}, {Math.round(player.position?.z || 0)}
                    </div>
                    <div className="text-gray-600">Health: {Math.round(player.health || 0)}%</div>
                    <div className="text-gray-600">Blood: {Math.round(player.blood || 0)}%</div>
                    <div className="text-gray-600">Water: {Math.round(player.water || 0)}%</div>
                    <div className="text-gray-600">Energy: {Math.round(player.energy || 0)}%</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Map Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-surface-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Player</span>
        </div>
        <span>|</span>
        <span>Auto-refresh: 10 seconds</span>
        <span>|</span>
        <span>Click player for details</span>
      </div>
    </Card>
  );
};

export default DayZMap;
