import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { MapContainer, ImageOverlay, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Car, RefreshCw, MapPin, Key, User, Clock, X, ChevronLeft, ChevronRight,
  DollarSign, AlertTriangle, CheckCircle, Loader, Search, Trash2
} from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import {
  getVehicles, getVehiclePositions, generateVehicleKey, getKeyGenerationResults, deleteVehicle
} from '../../services/api';
import type { TrackedVehicle, VehiclePosition, KeyGenerationResult, KeyGenerationRequest } from '../../types';

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

type Vector3 = [number, number, number];

function toFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePosition(position: unknown): Vector3 | null {
  let values: unknown[] | null = null;

  if (Array.isArray(position)) {
    values = position;
  } else if (typeof position === 'string') {
    values = position.trim().split(/[,\s]+/);
  } else if (position && typeof position === 'object') {
    const vector = position as Record<string, unknown>;
    values = [
      vector.x ?? vector.X ?? vector['0'],
      vector.y ?? vector.Y ?? vector['1'],
      vector.z ?? vector.Z ?? vector['2'],
    ];
  }

  if (!values || values.length < 3) return null;

  const x = toFiniteNumber(values[0]);
  const y = toFiniteNumber(values[1]);
  const z = toFiniteNumber(values[2]);

  if (x === null || y === null || z === null) return null;
  return [x, y, z];
}

function isVehicleDestroyed(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }

  return Boolean(value);
}

function getVehicleName(vehicle: Pick<TrackedVehicle, 'vehicleClassName' | 'vehicleDisplayName'> | Pick<VehiclePosition, 'className' | 'displayName'>): string {
  if ('vehicleClassName' in vehicle) {
    return vehicle.vehicleDisplayName || vehicle.vehicleClassName || 'Unknown vehicle';
  }

  return vehicle.displayName || vehicle.className || 'Unknown vehicle';
}

function formatPosition(position: unknown, includeY = false): string {
  const vector = normalizePosition(position);
  if (!vector) return 'Unknown';

  if (includeY) {
    return `${Math.round(vector[0])}, ${Math.round(vector[1])}, ${Math.round(vector[2])}`;
  }

  return `${Math.round(vector[0])}, ${Math.round(vector[2])}`;
}

function formatPrice(value: unknown): string {
  const number = toFiniteNumber(value);
  if (number !== null) return number.toLocaleString();
  return String(value || 'Unknown');
}

// Vehicle marker component
const VehicleMarker = memo(({
  vehicle,
  onClick
}: {
  vehicle: VehiclePosition;
  onClick: () => void;
}) => {
  const vehiclePosition = normalizePosition(vehicle.position);
  if (!vehiclePosition) return null;

  const position = dzToMap(vehiclePosition[0], vehiclePosition[2]);

  return (
    <CircleMarker
      center={position}
      radius={10}
      pathOptions={{
        color: '#059669',
        fillColor: '#10b981',
        fillOpacity: 0.9,
        weight: 2,
      }}
      eventHandlers={{
        click: onClick
      }}
    >
      <Popup>
        <div className="text-sm min-w-[180px]">
          <div className="font-bold text-gray-900 flex items-center gap-2">
            <Car size={14} />
            {getVehicleName(vehicle)}
          </div>
          <div className="text-gray-600 mt-1 text-xs">
            Owner: {vehicle.ownerName || 'Unknown owner'}
          </div>
          <div className="text-gray-500 text-xs mt-1">
            <MapPin size={10} className="inline mr-1" />
            {formatPosition(vehiclePosition)}
          </div>
          <button
            onClick={onClick}
            className="mt-2 w-full text-center text-xs bg-emerald-600 text-white py-1 rounded hover:bg-emerald-700"
          >
            View Details
          </button>
        </div>
      </Popup>
    </CircleMarker>
  );
});

VehicleMarker.displayName = 'VehicleMarker';

// Component to set initial map view
function SetView() {
  const map = useMap();
  useEffect(() => {
    map.setView([MAP_SIZE / 2, MAP_SIZE / 2], -2);
  }, [map]);
  return null;
}

interface VehicleDashboardProps {
  isConnected: boolean;
}

export const VehicleDashboard: React.FC<VehicleDashboardProps> = ({ isConnected }) => {
  const [vehicles, setVehicles] = useState<TrackedVehicle[]>([]);
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [keyResults, setKeyResults] = useState<KeyGenerationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showDestroyed, setShowDestroyed] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState('');

  // Selected vehicle for detail view
  const [selectedVehicle, setSelectedVehicle] = useState<TrackedVehicle | null>(null);

  // Key generation modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyVehicle, setKeyVehicle] = useState<TrackedVehicle | null>(null);
  const [keyPlayerId, setKeyPlayerId] = useState('');
  const [keyClassName, setKeyClassName] = useState('ExpansionCarKey');
  const [isMasterKey, setIsMasterKey] = useState(false);
  const [keyGenerating, setKeyGenerating] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteVehicleTarget, setDeleteVehicleTarget] = useState<TrackedVehicle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load vehicles and positions
  const loadData = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    setError(null);

    try {
      const [vehiclesData, positionsData, resultsData] = await Promise.all([
        getVehicles({ destroyed: showDestroyed ? undefined : false }),
        getVehiclePositions(),
        getKeyGenerationResults()
      ]);

      setVehicles(Array.isArray(vehiclesData.vehicles) ? vehiclesData.vehicles : []);
      setPositions((Array.isArray(positionsData.positions) ? positionsData.positions : []).filter(vehicle => normalizePosition(vehicle.position)));
      setKeyResults(Array.isArray(resultsData.results) ? resultsData.results : []);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle data');
    } finally {
      setLoading(false);
    }
  }, [isConnected, showDestroyed]);

  // Initial load and refresh
  useEffect(() => {
    if (isConnected) {
      loadData();
    }
  }, [isConnected, loadData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [isConnected, loadData]);

  // Filter vehicles
  const filteredVehicles = useMemo(() => {
    let result = vehicles;

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(v =>
        [
          v.vehicleClassName,
          v.vehicleDisplayName,
          v.ownerName,
          v.vehicleId,
        ].some(value => String(value || '').toLowerCase().includes(query))
      );
    }

    if (ownerFilter) {
      result = result.filter(v => v.ownerId === ownerFilter);
    }

    return result;
  }, [vehicles, searchQuery, ownerFilter]);

  // Get unique owners for filter dropdown
  const uniqueOwners = useMemo(() => {
    const owners = new Map<string, string>();
    vehicles.forEach(v => {
      if (v.ownerId && !owners.has(v.ownerId)) {
        owners.set(v.ownerId, v.ownerName || 'Unknown owner');
      }
    });
    return Array.from(owners.entries()).map(([id, name]) => ({ id, name }));
  }, [vehicles]);

  // Open key generation modal
  const openKeyModal = (vehicle: TrackedVehicle) => {
    setKeyVehicle(vehicle);
    setKeyPlayerId(vehicle.ownerId || '');
    setKeyClassName(vehicle.keyClassName || 'ExpansionCarKey');
    setIsMasterKey(false);
    setKeyMessage(null);
    setShowKeyModal(true);
  };

  // Generate key
  const handleGenerateKey = async () => {
    if (!keyVehicle || !keyPlayerId) return;

    setKeyGenerating(true);
    setKeyMessage(null);

    try {
      const request: KeyGenerationRequest = {
        playerId: keyPlayerId.trim(),
        vehicleId: keyVehicle.vehicleId,
        keyClassName,
        isMasterKey
      };

      const response = await generateVehicleKey(request);

      setKeyMessage({
        type: 'success',
        text: response.message || 'Key generation request queued successfully!'
      });

      // Refresh key results after a moment
      setTimeout(() => {
        getKeyGenerationResults().then(data => setKeyResults(Array.isArray(data.results) ? data.results : []));
      }, 2000);
    } catch (err) {
      setKeyMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to generate key'
      });
    } finally {
      setKeyGenerating(false);
    }
  };

  // Delete vehicle handler - now queues deletion for server processing
  const handleDeleteVehicle = async () => {
    if (!deleteVehicleTarget) return;

    setDeleting(true);
    setDeleteMessage(null);

    try {
      const response = await deleteVehicle(deleteVehicleTarget.vehicleId);
      
      // Immediately remove from local state (optimistic update)
      setVehicles(prev => prev.filter(v => v.vehicleId !== deleteVehicleTarget.vehicleId));
      setPositions(prev => prev.filter(p => p.vehicleId !== deleteVehicleTarget.vehicleId));
      
      setDeleteMessage({
        type: 'success',
        text: response.message || 'Vehicle deletion queued successfully!'
      });
      
      // Close confirmation after short delay
      setTimeout(() => {
        setShowDeleteConfirm(false);
        setDeleteVehicleTarget(null);
        setSelectedVehicle(null);
        setDeleteMessage(null);
      }, 1500);
    } catch (err) {
      setDeleteMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to queue vehicle deletion'
      });
    } finally {
      setDeleting(false);
    }
  };

  // Open delete confirmation
  const openDeleteConfirm = (vehicle: TrackedVehicle) => {
    setDeleteVehicleTarget(vehicle);
    setDeleteMessage(null); // Clear any previous message
    setShowDeleteConfirm(true);
  };

  // Format timestamp
  const formatTime = (timestamp?: string) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
  };

  if (!isConnected) {
    return (
      <Card compact title="Vehicle Tracker" icon={<Car size={20} />}>
        <p className="text-lilac">Connect to the API to view tracked vehicles.</p>
      </Card>
    );
  }

  return (
    <div className="h-full flex relative">
      {/* Sidebar */}
      <div className={`absolute top-0 left-0 h-full z-[1000] transition-all duration-300 ${sidebarOpen ? 'w-80' : 'w-0'
        }`}>
        <div className={`h-full bg-white shadow-xl flex flex-col ${sidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-surface-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-surface-800 flex items-center gap-2">
                <Car size={20} />
                Vehicle Tracker
              </h2>
              <button onClick={loadData} disabled={loading} className="p-1.5 hover:bg-surface-100 rounded">
                <RefreshCw size={16} className={`text-surface-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={vehicles.length > 0 ? 'success' : 'default'}>
                <Car size={10} className="mr-1" />
                {vehicles.length} Tracked
              </Badge>
              <Badge variant={positions.length > 0 ? 'info' : 'default'}>
                <MapPin size={10} className="mr-1" />
                {positions.length} On Map
              </Badge>
              {lastUpdate && (
                <span className="text-xs text-surface-500">
                  {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="p-3 border-b border-surface-200 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search vehicles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All Owners</option>
                {uniqueOwners.map(owner => (
                  <option key={owner.id} value={owner.id}>{owner.name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowDestroyed(!showDestroyed)}
                className={`px-2 py-1.5 text-xs rounded-lg ${showDestroyed ? 'bg-red-500 text-white' : 'bg-surface-200 text-surface-600'}`}
              >
                {showDestroyed ? 'Show All' : 'Hide Destroyed'}
              </button>
            </div>
          </div>

          {/* Vehicle List */}
          <div className="flex-1 overflow-y-auto p-2">
            {error && (
              <div className="text-center py-4 text-red-500 text-sm">
                <AlertTriangle size={24} className="mx-auto mb-2" />
                {error}
              </div>
            )}

            {loading && vehicles.length === 0 ? (
              <div className="text-center py-8">
                <Loader size={32} className="mx-auto mb-2 animate-spin text-primary-500" />
                <p className="text-surface-500 text-sm">Loading vehicles...</p>
              </div>
            ) : filteredVehicles.length > 0 ? (
              <div className="space-y-2">
                {filteredVehicles.map((vehicle) => {
                  const destroyed = isVehicleDestroyed(vehicle.isDestroyed);
                  const position = normalizePosition(vehicle.lastPosition);

                  return (
                    <button
                      key={vehicle.vehicleId}
                      onClick={() => setSelectedVehicle(vehicle)}
                      className={`w-full text-left rounded-lg p-3 border transition-colors ${destroyed
                          ? 'bg-red-50 border-red-200 hover:border-red-400'
                          : 'bg-surface-50 border-surface-200 hover:border-primary-500'
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Car size={16} className={destroyed ? 'text-red-500' : 'text-emerald-500'} />
                        <span className="font-medium text-surface-800 truncate flex-1">
                          {getVehicleName(vehicle)}
                        </span>
                        {destroyed && (
                          <Badge variant="error">Destroyed</Badge>
                        )}
                      </div>

                      <div className="text-xs text-surface-500 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <User size={10} />
                          <span>{vehicle.ownerName || 'Unknown owner'}</span>
                        </div>
                        {position && (
                          <div className="flex items-center gap-1">
                            <MapPin size={10} />
                            <span>{formatPosition(position)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Key size={10} />
                          <span className="truncate">{vehicle.keyClassName || 'ExpansionCarKey'}</span>
                          {(vehicle.additionalKeys?.length ?? 0) > 0 && (
                            <Badge variant="info" className="ml-1 text-[10px] px-1 py-0">
                              +{vehicle.additionalKeys!.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-surface-500 text-sm">
                <Car size={32} className="mx-auto mb-2 opacity-50" />
                {searchQuery || ownerFilter ? 'No vehicles match filters' : 'No tracked vehicles'}
              </div>
            )}
          </div>

          {/* Key Generation Results */}
          {keyResults.length > 0 && (
            <div className="p-3 border-t border-surface-200">
              <h3 className="text-sm font-medium text-surface-700 mb-2 flex items-center gap-2">
                <Key size={14} />
                Recent Key Requests
              </h3>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {keyResults.slice(0, 5).map((result) => (
                  <div key={result.requestId} className="text-xs flex items-center gap-2 p-1.5 bg-surface-50 rounded">
                    {result.status === 'success' ? (
                      <CheckCircle size={12} className="text-green-500" />
                    ) : result.status === 'failed' ? (
                      <AlertTriangle size={12} className="text-red-500" />
                    ) : (
                      <Loader size={12} className="text-yellow-500 animate-spin" />
                    )}
                    <span className="truncate flex-1">{result.vehicleId}</span>
                    <span className="text-surface-400">{result.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`absolute top-4 bg-white shadow-lg rounded-r-lg p-2 z-[1001] transition-all ${sidebarOpen ? 'left-80' : 'left-0'
            }`}
        >
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

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
          <ImageOverlay
            url="/maps/chernarus.jpg"
            bounds={bounds}
          />

          {/* Vehicle markers */}
          {positions.map((vehicle, index) => (
            <VehicleMarker
              key={vehicle.vehicleId || `${vehicle.className || 'vehicle'}-${index}`}
              vehicle={vehicle}
              onClick={() => {
                const fullVehicle = vehicles.find(v => v.vehicleId === vehicle.vehicleId);
                if (fullVehicle) setSelectedVehicle(fullVehicle);
              }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Vehicle Detail Modal */}
      {selectedVehicle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-surface-800 flex items-center gap-2">
                <Car size={20} />
                Vehicle Details
              </h3>
              <button onClick={() => setSelectedVehicle(null)} className="p-1 hover:bg-surface-100 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Vehicle Info */}
              <div>
                <h4 className="font-medium text-surface-800 mb-2">
                  {getVehicleName(selectedVehicle)}
                </h4>
                <div className="text-sm text-surface-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-surface-500">Vehicle ID:</span>
                    <span className="font-mono text-xs">{selectedVehicle.vehicleId || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Class Name:</span>
                    <span>{selectedVehicle.vehicleClassName || 'Unknown vehicle'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Status:</span>
                    <Badge variant={isVehicleDestroyed(selectedVehicle.isDestroyed) ? 'error' : 'success'}>
                      {isVehicleDestroyed(selectedVehicle.isDestroyed) ? 'Destroyed' : 'Active'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Owner Info */}
              <div className="p-3 bg-surface-50 rounded-lg">
                <h5 className="text-sm font-medium text-surface-700 mb-2 flex items-center gap-2">
                  <User size={14} />
                  Owner Information
                </h5>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-surface-500">Name:</span>
                    <span>{selectedVehicle.ownerName || 'Unknown owner'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Player ID:</span>
                    <span className="font-mono text-xs">{selectedVehicle.ownerId || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              {/* Position */}
              {(() => {
                const position = normalizePosition(selectedVehicle.lastPosition);
                if (!position) return null;

                return (
                  <div className="p-3 bg-surface-50 rounded-lg">
                    <h5 className="text-sm font-medium text-surface-700 mb-2 flex items-center gap-2">
                      <MapPin size={14} />
                      Last Known Position
                    </h5>
                    <div className="text-sm">
                      <span className="font-mono">{formatPosition(position, true)}</span>
                      {selectedVehicle.lastUpdateTime && (
                        <div className="text-xs text-surface-500 mt-1">
                          <Clock size={10} className="inline mr-1" />
                          Updated: {formatTime(selectedVehicle.lastUpdateTime)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Purchase Info */}
              <div className="p-3 bg-surface-50 rounded-lg">
                <h5 className="text-sm font-medium text-surface-700 mb-2 flex items-center gap-2">
                  <DollarSign size={14} />
                  Purchase Information
                </h5>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-surface-500">Key Type:</span>
                    <span>{selectedVehicle.keyClassName || 'ExpansionCarKey'}</span>
                  </div>
                  {selectedVehicle.purchasePrice !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-surface-500">Price:</span>
                      <span>{formatPrice(selectedVehicle.purchasePrice)}</span>
                    </div>
                  )}
                  {selectedVehicle.traderName && (
                    <div className="flex justify-between">
                      <span className="text-surface-500">Trader:</span>
                      <span>{selectedVehicle.traderName}</span>
                    </div>
                  )}
                  {selectedVehicle.traderZone && (
                    <div className="flex justify-between">
                      <span className="text-surface-500">Zone:</span>
                      <span>{selectedVehicle.traderZone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-surface-500">Purchased:</span>
                    <span className="text-xs">{formatTime(selectedVehicle.purchaseTimestamp)}</span>
                  </div>
                </div>
              </div>

              {/* Keys Section */}
              <div className="p-3 bg-surface-50 rounded-lg">
                <h5 className="text-sm font-medium text-surface-700 mb-2 flex items-center gap-2">
                  <Key size={14} />
                  Keys ({(selectedVehicle.keyData ? 1 : 0) + (selectedVehicle.additionalKeys?.length || 0)})
                </h5>
                <div className="space-y-2">
                  {/* Original Key */}
                  {selectedVehicle.keyData && (
                    <div className="text-xs p-2 bg-white rounded border border-surface-200">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="success">Original</Badge>
                        <span className="text-surface-600">{selectedVehicle.keyClassName || 'ExpansionCarKey'}</span>
                      </div>
                      <div className="font-mono text-[10px] text-surface-400">
                        {selectedVehicle.keyData.persistentIdA}-{selectedVehicle.keyData.persistentIdB}-{selectedVehicle.keyData.persistentIdC}-{selectedVehicle.keyData.persistentIdD}
                      </div>
                    </div>
                  )}
                  {/* Additional Keys */}
                  {selectedVehicle.additionalKeys?.map((key, idx) => (
                    <div key={idx} className="text-xs p-2 bg-white rounded border border-surface-200">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="info">Copy #{idx + 1}</Badge>
                        <span className="text-surface-600">{selectedVehicle.keyClassName || 'ExpansionCarKey'}</span>
                      </div>
                      <div className="font-mono text-[10px] text-surface-400">
                        {key.persistentIdA}-{key.persistentIdB}-{key.persistentIdC}-{key.persistentIdD}
                      </div>
                    </div>
                  ))}
                  {!selectedVehicle.keyData && (!selectedVehicle.additionalKeys || selectedVehicle.additionalKeys.length === 0) && (
                    <div className="text-xs text-surface-400 italic">No key data available</div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    openKeyModal(selectedVehicle);
                    setSelectedVehicle(null);
                  }}
                  disabled={isVehicleDestroyed(selectedVehicle.isDestroyed)}
                >
                  <Key size={16} className="mr-2" />
                  Generate Key
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSelectedVehicle(null)}
                >
                  Close
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    openDeleteConfirm(selectedVehicle);
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Generation Modal */}
      {showKeyModal && keyVehicle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-surface-800 flex items-center gap-2">
                <Key size={20} />
                Generate Vehicle Key
              </h3>
              <button onClick={() => setShowKeyModal(false)} className="p-1 hover:bg-surface-100 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Vehicle Info */}
              <div className="p-3 bg-surface-50 rounded-lg">
                <div className="text-sm">
                  <div className="font-medium">{getVehicleName(keyVehicle)}</div>
                  <div className="text-xs text-surface-500 font-mono mt-1">{keyVehicle.vehicleId || 'Unknown'}</div>
                </div>
              </div>

              {/* Player ID */}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Player ID (recipient)
                </label>
                <input
                  type="text"
                  value={keyPlayerId}
                  onChange={(e) => setKeyPlayerId(e.target.value)}
                  placeholder="Player ID to receive the key"
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <p className="text-xs text-surface-500 mt-1">
                  The key will be given to this player when they are online.
                </p>
              </div>

              {/* Key Class */}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Key Type
                </label>
                <select
                  value={keyClassName}
                  onChange={(e) => setKeyClassName(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                >
                  <option value="ExpansionCarKey">Car Key</option>
                  <option value="ExpansionKeyChain">Key Chain</option>
                </select>
              </div>

              {/* Master Key Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="masterKey"
                  checked={isMasterKey}
                  onChange={(e) => setIsMasterKey(e.target.checked)}
                  className="w-4 h-4 rounded border-surface-300 text-primary-500 focus:ring-primary-500"
                />
                <label htmlFor="masterKey" className="text-sm text-surface-700">
                  Generate as Master Key
                </label>
              </div>

              {/* Message */}
              {keyMessage && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${keyMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                  {keyMessage.type === 'success' ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  <span className="text-sm">{keyMessage.text}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleGenerateKey}
                  disabled={keyGenerating || !keyPlayerId.trim()}
                >
                  {keyGenerating ? (
                    <>
                      <Loader size={16} className="mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key size={16} className="mr-2" />
                      Generate Key
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowKeyModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteVehicleTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2001] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                <Trash2 size={20} />
                Delete Vehicle
              </h3>
              <button onClick={() => setShowDeleteConfirm(false)} className="p-1 hover:bg-surface-100 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="p-4">
              <div className="mb-4">
                <p className="text-surface-700 mb-2">
                  Are you sure you want to remove this vehicle from tracking?
                </p>
                <div className="p-3 bg-surface-50 rounded-lg">
                  <div className="font-medium text-surface-800">
                    {getVehicleName(deleteVehicleTarget)}
                  </div>
                  <div className="text-xs text-surface-500 mt-1">
                    Owner: {deleteVehicleTarget.ownerName || 'Unknown owner'}
                  </div>
                  <div className="text-xs font-mono text-surface-400 mt-1">
                    {deleteVehicleTarget.vehicleId || 'Unknown'}
                  </div>
                </div>
              </div>

              <p className="text-sm text-surface-500 mb-4">
                <strong>Warning:</strong> This will permanently destroy the vehicle in the game world and remove it from tracking.
              </p>

              {/* Delete Message */}
              {deleteMessage && (
                <div className={`p-3 rounded-lg mb-4 ${deleteMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  <div className="flex items-center gap-2">
                    {deleteMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                    <span className="text-sm">{deleteMessage.text}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={handleDeleteVehicle}
                  disabled={deleting || deleteMessage?.type === 'success'}
                >
                  {deleting ? (
                    <>
                      <Loader size={16} className="mr-2 animate-spin" />
                      Queueing...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} className="mr-2" />
                      Destroy Vehicle
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteVehicleTarget(null);
                    setDeleteMessage(null);
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleDashboard;
