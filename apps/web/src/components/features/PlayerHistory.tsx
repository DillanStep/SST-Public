import React, { useMemo, useState, useEffect, useCallback } from 'react';
import L from 'leaflet';
import { MapContainer, ImageOverlay, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import { 
  History, Users, MapPin, Play, Pause, RefreshCw, 
  ChevronLeft, ChevronRight, Wifi, Eye
} from 'lucide-react';
import { Button, Badge, Select } from '../ui';
import { 
  getTrackedPlayers, 
  getPlayerPositionsInRange,
  getPositionStats,
  getOnlinePlayers
} from '../../services/api';
import type { TrackedPlayer, PlayerPosition, PositionStatsResponse, OnlinePlayerData } from '../../types';
import 'leaflet/dist/leaflet.css';

interface PlayerHistoryProps {
  isConnected: boolean;
}

const MAP_SIZE = 15360;
const MAX_PATH_POINTS_PER_PLAYER = 8000;

const downsamplePositions = (positions: PlayerPosition[], maxPoints: number): PlayerPosition[] => {
  if (positions.length <= maxPoints) return positions;

  const stride = Math.ceil(positions.length / maxPoints);
  const sampled: PlayerPosition[] = [];

  for (let i = 0; i < positions.length; i += stride) {
    sampled.push(positions[i]);
  }

  // Ensure we keep the last point so the "latest" marker is accurate.
  const last = positions[positions.length - 1];
  if (sampled.length === 0 || sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }

  return sampled;
};

// Map bounds for CRS.Simple
const CHERNARUS_BOUNDS: L.LatLngBoundsExpression = [
  [0, 0],
  [MAP_SIZE, MAP_SIZE]
];

// Convert DayZ game coordinates to Leaflet map coordinates
// DayZ: X is east-west, Z is north-south
// Leaflet CRS.Simple: [lat, lng] where lat is Y and lng is X
const gameToMap = (x: number, z: number): [number, number] => {
  return [z, x]; // [lat, lng] = [z, x]
};

// Time range presets
const TIME_RANGES = [
  { value: '1h', label: 'Last 1 Hour', seconds: 3600 },
  { value: '3h', label: 'Last 3 Hours', seconds: 10800 },
  { value: '6h', label: 'Last 6 Hours', seconds: 21600 },
  { value: '12h', label: 'Last 12 Hours', seconds: 43200 },
  { value: '24h', label: 'Last 24 Hours', seconds: 86400 },
  { value: '3d', label: 'Last 3 Days', seconds: 259200 },
  { value: '7d', label: 'Last 7 Days', seconds: 604800 },
];

// Path color generator
const getPathColor = (index: number): string => {
  const colors = [
    '#0ea5e9', // Light blue (primary)
    '#22c55e', // Green
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
  ];
  return colors[index % colors.length];
};

// Map component to handle center changes
const MapController: React.FC<{ center: [number, number] | null }> = ({ center }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  
  return null;
};

// Initial view setter
const SetView: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    map.setView([MAP_SIZE / 2, MAP_SIZE / 2], -2);
  }, [map]);
  return null;
};

export const PlayerHistory: React.FC<PlayerHistoryProps> = ({ isConnected }) => {
  const [players, setPlayers] = useState<TrackedPlayer[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playerPaths, setPlayerPaths] = useState<Map<string, PlayerPosition[]>>(new Map());
  const [stats, setStats] = useState<PositionStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('3h');
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTimeMs, setPlaybackTimeMs] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(10); // seconds advanced per tick
  
  // Live tracking state
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerData[]>([]);
  const [showLivePositions, setShowLivePositions] = useState(true);
  const liveRefreshInterval = 5; // seconds

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of players) {
      map.set(player.playerId, player.playerName || player.playerId.slice(0, 8));
    }
    return map;
  }, [players]);

  const upperBound = useCallback((arr: number[], value: number): number => {
    let low = 0;
    let high = arr.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (arr[mid] <= value) low = mid + 1;
      else high = mid;
    }
    return low;
  }, []);

  const playbackMetaByPlayerId = useMemo(() => {
    const map = new Map<string, { times: number[]; positions: PlayerPosition[] }>();
    for (const [playerId, positions] of playerPaths.entries()) {
      const times: number[] = [];
      const validPositions: PlayerPosition[] = [];

      for (const pos of positions) {
        const t = Date.parse(pos.recordedAt);
        if (Number.isFinite(t)) {
          times.push(t);
          validPositions.push(pos);
        }
      }

      if (times.length > 0) {
        map.set(playerId, { times, positions: validPositions });
      }
    }
    return map;
  }, [playerPaths]);

  const playbackBounds = useMemo(() => {
    let start: number | null = null;
    let end: number | null = null;

    for (const meta of playbackMetaByPlayerId.values()) {
      const s = meta.times[0];
      const e = meta.times[meta.times.length - 1];
      if (start === null || s < start) start = s;
      if (end === null || e > end) end = e;
    }

    return { start, end };
  }, [playbackMetaByPlayerId]);

  const currentIndexByPlayerId = useMemo(() => {
    const map = new Map<string, number>();
    if (playbackTimeMs === null) return map;

    for (const [playerId, meta] of playbackMetaByPlayerId.entries()) {
      const idx = upperBound(meta.times, playbackTimeMs) - 1;
      if (idx >= 0) map.set(playerId, Math.min(idx, meta.positions.length - 1));
    }

    return map;
  }, [playbackMetaByPlayerId, playbackTimeMs, upperBound]);

  // Precompute Leaflet points once per loaded path set.
  // This avoids re-mapping every point on every playback tick.
  const pathPointsByPlayerId = useMemo(() => {
    const map = new Map<string, [number, number][]>();
    for (const [playerId, positions] of playerPaths.entries()) {
      map.set(playerId, positions.map(p => gameToMap(p.position.x, p.position.z)));
    }
    return map;
  }, [playerPaths]);

  // Load tracked players and stats
  const loadData = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [playersData, statsData] = await Promise.all([
        getTrackedPlayers(),
        getPositionStats()
      ]);
      setPlayers(playersData.players);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  // Load paths for selected players
  const loadPlayerPaths = useCallback(async () => {
    if (selectedPlayers.length === 0) {
      setPlayerPaths(new Map());
      return;
    }
    
    setLoadingPaths(true);
    
    try {
      const range = TIME_RANGES.find(r => r.value === timeRange);
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - (range?.seconds || 10800);
      
      const newPaths = new Map<string, PlayerPosition[]>();
      
      await Promise.all(
        selectedPlayers.map(async (playerId) => {
          const data = await getPlayerPositionsInRange(playerId, startTime, endTime);
          if (data.positions.length > 0) {
            newPaths.set(playerId, downsamplePositions(data.positions, MAX_PATH_POINTS_PER_PLAYER));
          }
        })
      );
      
      setPlayerPaths(newPaths);
      
      // Center map on first player's last position
      if (newPaths.size > 0) {
        const firstPath = newPaths.values().next().value;
        if (firstPath && firstPath.length > 0) {
          const lastPos = firstPath[firstPath.length - 1];
          setMapCenter(gameToMap(lastPos.position.x, lastPos.position.z));
        }
      }
    } catch (err) {
      console.error('Failed to load paths:', err);
    } finally {
      setLoadingPaths(false);
    }
  }, [selectedPlayers, timeRange]);

  // Load online players for live tracking
  const loadOnlinePlayers = useCallback(async () => {
    if (!isConnected || !showLivePositions) return;
    
    try {
      const data = await getOnlinePlayers();
      setOnlinePlayers(data.players.filter(p => p.isOnline));
    } catch (err) {
      console.error('Failed to load online players:', err);
    }
  }, [isConnected, showLivePositions]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadPlayerPaths();
  }, [loadPlayerPaths]);

  // Live position refresh
  useEffect(() => {
    if (!showLivePositions || !isConnected) return;
    
    loadOnlinePlayers();
    const interval = setInterval(loadOnlinePlayers, liveRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [showLivePositions, isConnected, liveRefreshInterval, loadOnlinePlayers]);

  // Playback animation
  useEffect(() => {
    if (!isPlaying) return;
    if (selectedPlayers.length === 0) return;
    if (playbackBounds.start === null || playbackBounds.end === null) return;

    const startBound = playbackBounds.start;
    const endBound = playbackBounds.end;

    if (playbackTimeMs === null) {
      setPlaybackTimeMs(startBound);
      return;
    }

    const interval = setInterval(() => {
      setPlaybackTimeMs((prev) => {
        if (prev === null) return startBound;
        const next = prev + playbackSpeed * 1000;
        if (next >= endBound) {
          setIsPlaying(false);
          return endBound;
        }
        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isPlaying, selectedPlayers.length, playbackBounds.start, playbackBounds.end, playbackSpeed, playbackTimeMs]);

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers(prev => 
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
    setPlaybackTimeMs(null);
    setIsPlaying(false);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-50">
        <div className="text-center">
          <History size={48} className="mx-auto mb-4 text-surface-500 opacity-50" />
          <p className="text-surface-500">Connect to the API to view player history.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex relative">
      {/* Sidebar */}
      <div className={`absolute top-0 left-0 h-full z-[1000] transition-all duration-300 ${
        sidebarOpen ? 'w-80' : 'w-0'
      }`}>
        <div className={`h-full bg-white shadow-xl flex flex-col ${sidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-surface-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-surface-800 flex items-center gap-2">
                <History size={20} />
                Player History
              </h2>
              <button onClick={loadData} disabled={loading} className="p-1.5 hover:bg-surface-100 rounded">
                <RefreshCw size={16} className={`text-surface-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            {/* Time Range Selector */}
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              options={TIME_RANGES.map(r => ({ value: r.value, label: r.label }))}
              className="w-full mb-3"
            />
            
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-surface-50 p-2 rounded">
                  <div className="flex items-center gap-1 text-surface-500 mb-1">
                    <MapPin size={12} />
                    <span>Positions</span>
                  </div>
                  <span className="font-semibold text-surface-800">{stats.totalPositions.toLocaleString()}</span>
                </div>
                <div className="bg-surface-50 p-2 rounded">
                  <div className="flex items-center gap-1 text-surface-500 mb-1">
                    <Users size={12} />
                    <span>Players</span>
                  </div>
                  <span className="font-semibold text-surface-800">{stats.uniquePlayers}</span>
                </div>
              </div>
            )}
          </div>

          {/* Live Toggle & Playback Controls */}
          <div className="p-3 border-b border-surface-200 space-y-2">
            {/* Live tracking toggle */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLivePositions}
                  onChange={(e) => setShowLivePositions(e.target.checked)}
                  className="rounded border-surface-300 text-primary-500 focus:ring-primary-500"
                />
                <Wifi size={14} className="text-green-500" />
                <span className="text-surface-600">Live Positions</span>
              </label>
              <Badge variant={showLivePositions ? 'success' : 'default'}>
                {onlinePlayers.length} online
              </Badge>
            </div>
            
            {/* Playback controls */}
            {selectedPlayers.length > 0 && playerPaths.size > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (isPlaying) {
                        setIsPlaying(false);
                      } else {
                        if (playbackBounds.start !== null) {
                          setPlaybackTimeMs(playbackBounds.start);
                        }
                        setIsPlaying(true);
                      }
                    }}
                    icon={isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    className="flex-1"
                  >
                    {isPlaying ? 'Pause' : 'Play Path'}
                  </Button>

                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value) || 10)}
                    className="text-xs bg-white border border-surface-200 rounded px-2 py-1 text-surface-700"
                    title="Playback speed (seconds per tick)"
                  >
                    <option value={2}>Slow</option>
                    <option value={10}>Normal</option>
                    <option value={30}>Fast</option>
                    <option value={60}>Very Fast</option>
                  </select>
                </div>
                
                {/* Playback progress bar */}
                {playbackTimeMs !== null && playbackBounds.start !== null && playbackBounds.end !== null && (
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-surface-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary-500 transition-all duration-200"
                        style={{
                          width: `${Math.min(100, ((playbackTimeMs - playbackBounds.start) / (playbackBounds.end - playbackBounds.start)) * 100)}%`
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-surface-500">
                      <span>{new Date(playbackTimeMs).toLocaleTimeString()}</span>
                      <span>{new Date(playbackBounds.end).toLocaleTimeString()}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Player List */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-xs font-medium text-surface-500 uppercase mb-2">
              Tracked Players ({players.length})
            </div>
            
            {loading ? (
              <div className="text-center py-4 text-surface-500 text-sm">
                <RefreshCw size={20} className="mx-auto mb-2 animate-spin" />
                Loading players...
              </div>
            ) : players.length === 0 ? (
              <div className="text-center py-8 text-surface-500 text-sm">
                <Users size={32} className="mx-auto mb-2 opacity-50" />
                No tracked players yet
              </div>
            ) : (
              <div className="space-y-2">
                {players.map((player) => {
                  const isSelected = selectedPlayers.includes(player.playerId);
                  const pathColor = isSelected 
                    ? getPathColor(selectedPlayers.indexOf(player.playerId))
                    : '#a3a3a3';
                  
                  return (
                    <button
                      key={player.playerId}
                      onClick={() => togglePlayer(player.playerId)}
                      className={`w-full text-left rounded-lg p-3 border transition-colors ${
                        isSelected
                          ? 'bg-primary-50 border-primary-300'
                          : 'bg-surface-50 hover:bg-surface-100 border-surface-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: pathColor }}
                        />
                        <span className="font-medium text-surface-800 truncate flex-1">
                          {player.playerName || player.playerId.slice(0, 8)}
                        </span>
                        {isSelected && (
                          <Eye size={14} className="text-primary-500 flex-shrink-0" />
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 ml-5">
                        <Badge variant="default" className="text-xs">
                          {player.positionCount} pts
                        </Badge>
                        <span className="text-xs text-surface-500">
                          {formatDuration(Math.floor(Date.now() / 1000) - player.lastSeen)} ago
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Legend */}
          <div className="p-3 border-t border-surface-200 text-xs text-surface-500 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span>Start Point</span>
              <span className="mx-2">|</span>
              <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
              <span>End Point</span>
            </div>
            {showLivePositions && (
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 border border-white shadow" />
                <span>Live (Alive)</span>
                <span className="mx-2">|</span>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white shadow" />
                <span>Live (Dead)</span>
              </div>
            )}
            <div className="text-surface-400">
              Click players to show/hide their paths
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`absolute top-4 bg-white shadow-lg rounded-r-lg p-2 z-[1001] transition-all ${
            sidebarOpen ? 'left-80' : 'left-0'
          }`}
        >
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1001] bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl">
          {error}
        </div>
      )}

      {/* Loading Paths Indicator */}
      {loadingPaths && (
        <div className="absolute top-4 right-4 z-[1001] bg-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <RefreshCw size={16} className="animate-spin text-primary-500" />
          <span className="text-sm text-surface-600">Loading paths...</span>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 h-full">
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
          <MapController center={mapCenter} />
          
          <ImageOverlay
            url="/maps/chernarus.jpg"
            bounds={CHERNARUS_BOUNDS}
          />
          
          {/* Draw paths for each selected player */}
          {Array.from(playerPaths.entries()).map(([playerId, positions], pathIndex) => {
            const color = getPathColor(pathIndex);
            const pathPoints = pathPointsByPlayerId.get(playerId) || [];
            const meta = playbackMetaByPlayerId.get(playerId);
            const idx = currentIndexByPlayerId.get(playerId);
            
            return (
              <React.Fragment key={playerId}>
                {/* Path line */}
                <Polyline
                  positions={pathPoints}
                  color={color}
                  weight={3}
                  opacity={0.8}
                />
                
                {/* Start marker */}
                {positions.length > 0 && (
                  <CircleMarker
                    center={gameToMap(positions[0].position.x, positions[0].position.z)}
                    radius={8}
                    fillColor="#22c55e"
                    color="#fff"
                    weight={2}
                    fillOpacity={1}
                  >
                    <Popup>
                      <div className="text-sm min-w-[150px]">
                        <strong className="text-gray-900">Start</strong><br />
                        <span className="text-gray-700">{playerNameById.get(playerId) || playerId.slice(0, 8)}</span><br />
                        <span className="text-xs text-gray-500">{new Date(positions[0].recordedAt).toLocaleString()}</span>
                      </div>
                    </Popup>
                  </CircleMarker>
                )}
                
                {/* Current/End marker */}
                {positions.length > 0 && (() => {
                  // Determine current playback position or use latest
                  const playbackPos = (playbackTimeMs !== null && idx !== undefined && meta && meta.positions[idx])
                    ? meta.positions[idx]
                    : null;
                  const displayPos = playbackPos || positions[positions.length - 1];
                  const isAnimating = playbackPos !== null;
                  
                  return (
                    <CircleMarker
                      center={gameToMap(displayPos.position.x, displayPos.position.z)}
                      radius={10}
                      fillColor={color}
                      color="#fff"
                      weight={3}
                      fillOpacity={1}
                    >
                      <Popup>
                        <div className="text-sm min-w-[150px]">
                          <strong className="text-gray-900">{isAnimating ? 'Current' : 'Latest'}</strong><br />
                          <span className="text-gray-700">{playerNameById.get(playerId) || playerId.slice(0, 8)}</span><br />
                          <span className="text-xs text-gray-500">
                            {new Date(displayPos.recordedAt).toLocaleString()}
                          </span>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })()}
              </React.Fragment>
            );
          })}
          
          {/* Live player positions */}
          {showLivePositions && onlinePlayers.map((player) => (
            <CircleMarker
              key={`live-${player.playerId}`}
              center={gameToMap(player.position.x, player.position.z)}
              radius={10}
              fillColor={player.isAlive ? '#22c55e' : '#ef4444'}
              color="#fff"
              weight={3}
              fillOpacity={0.9}
            >
              <Popup>
                <div className="text-sm min-w-[150px]">
                  <strong className="text-gray-900">{player.playerName}</strong>
                  <div className="text-xs text-gray-500 mt-1">
                    Position: {Math.round(player.position.x)}, {Math.round(player.position.z)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                    <div>HP: {Math.round(player.health)}%</div>
                    <div>Blood: {Math.round(player.blood)}</div>
                  </div>
                  <div className="mt-2 text-xs">
                    {player.isAlive ? (
                      <span className="text-green-600 font-medium">● Alive</span>
                    ) : (
                      <span className="text-red-600 font-medium">● Dead</span>
                    )}
                    {player.isUnconscious && <span className="text-amber-600 ml-2">● Unconscious</span>}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Selected Players Legend - Bottom Right */}
      {selectedPlayers.length > 0 && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white rounded-lg shadow-lg p-3 max-w-xs">
          <div className="text-xs font-medium text-surface-500 uppercase mb-2">Selected Paths</div>
          <div className="space-y-1">
            {selectedPlayers.map((playerId, index) => {
              const path = playerPaths.get(playerId);
              return (
                <div key={playerId} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getPathColor(index) }}
                  />
                  <span className="text-surface-700 truncate">
                    {playerNameById.get(playerId) || playerId.slice(0, 8)}
                  </span>
                  {path && (
                    <span className="text-xs text-surface-400 ml-auto">
                      {path.length} pts
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerHistory;
