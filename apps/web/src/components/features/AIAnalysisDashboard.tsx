import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle,
  Crosshair,
  FileSearch,
  Gauge,
  Map,
  MapPin,
  Plane,
  Radio,
  RefreshCw,
  Route,
  ShieldAlert,
  Target,
  Users,
} from 'lucide-react';
import { Card, Button } from '../ui';
import { getAIAnalysis } from '../../services/api';
import { MapImageLayer } from '../../maps/MapImageLayer';
import { useMapConfig } from '../../maps/useMapConfig';
import { gameToMap, mapCenter, mapRenderKey, paddedMapBounds, type ActiveMapConfig } from '../../maps/mapConfig';
import type {
  AIAnalysisEventZone,
  AIAnalysisEvents,
  AIAnalysisFactor,
  AIAnalysisFinding,
  AIAnalysisImpact,
  AIAnalysisPatrol,
  AIAnalysisResponse,
  AIAnalysisSeverity,
} from '../../types';

interface AIAnalysisDashboardProps {
  isConnected: boolean;
}

const EMPTY_RECORD: Record<string, number> = {};
const EMPTY_FINDINGS: AIAnalysisFinding[] = [];
const EMPTY_FACTORS: AIAnalysisFactor[] = [];
const EMPTY_PATROLS: AIAnalysisPatrol[] = [];
const EMPTY_EVENT_ZONES: AIAnalysisEventZone[] = [];

const DEFAULT_LIVE: AIAnalysisResponse['live'] = {
  generatedAt: null,
  sourceUpdatedAt: null,
  sourceAgeMs: null,
  staleAfterMs: 0,
  isStale: true,
  aiCount: 0,
  byFaction: EMPTY_RECORD,
  byGroup: EMPTY_RECORD,
  unconscious: 0,
  averageHealth: null,
};

const DEFAULT_METRICS: AIAnalysisResponse['metrics'] = {
  liveAi: 0,
  patrolCount: 0,
  configuredUnits: 0,
  maxGroupSize: 0,
  avgGroupSize: 0,
  factionCount: 0,
  loadoutCount: 0,
  staticPatrols: 0,
  dynamicPatrols: 0,
};

const DEFAULT_CONFIG: AIAnalysisResponse['config'] = {
  expansionEnabled: false,
  expansionBases: [],
  aiSettingsFile: null,
  patrolSettingsFile: null,
  settingsFiles: [],
  loadouts: {
    count: 0,
    names: [],
  },
};

const DEFAULT_DIFFICULTY: AIAnalysisResponse['difficulty'] = {
  score: 0,
  label: 'Unknown',
  factors: EMPTY_FACTORS,
};

const DEFAULT_EVENT_COUNTS = { total: 0, enabled: 0, mapped: 0 };

const DEFAULT_EVENTS: AIAnalysisEvents = {
  summary: {
    airdrops: DEFAULT_EVENT_COUNTS,
    contaminatedAreas: DEFAULT_EVENT_COUNTS,
    roamingLocations: DEFAULT_EVENT_COUNTS,
    patrolRoutes: DEFAULT_EVENT_COUNTS,
    questAiObjectives: DEFAULT_EVENT_COUNTS,
    mapLayers: DEFAULT_EVENT_COUNTS,
    koth: {
      detected: false,
      files: [],
    },
  },
  airdrops: EMPTY_EVENT_ZONES,
  contaminatedAreas: EMPTY_EVENT_ZONES,
  roamingLocations: EMPTY_EVENT_ZONES,
  patrolRoutes: EMPTY_EVENT_ZONES,
  questAiObjectives: EMPTY_EVENT_ZONES,
  koth: {
    detected: false,
    files: [],
  },
  mapLayers: EMPTY_EVENT_ZONES,
};

const numberFormat = new Intl.NumberFormat();

function formatNumber(value: number): string {
  return numberFormat.format(Number.isFinite(value) ? value : 0);
}

function formatAge(ms?: number | null): string {
  if (ms === undefined || ms === null) return 'No heartbeat';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not found';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function severityClasses(severity: AIAnalysisSeverity): string {
  switch (severity) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'ok':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    default:
      return 'border-sky-200 bg-sky-50 text-sky-800';
  }
}

function severityIcon(severity: AIAnalysisSeverity): React.ReactNode {
  switch (severity) {
    case 'critical':
      return <ShieldAlert size={16} />;
    case 'warning':
      return <AlertTriangle size={16} />;
    case 'ok':
      return <CheckCircle size={16} />;
    default:
      return <Activity size={16} />;
  }
}

function impactClasses(impact: AIAnalysisImpact): string {
  switch (impact) {
    case 'high':
      return 'bg-red-500';
    case 'medium':
      return 'bg-amber-500';
    default:
      return 'bg-emerald-500';
  }
}

function difficultyClasses(label: AIAnalysisResponse['difficulty']['label']): string {
  switch (label) {
    case 'Extreme':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'Hard':
      return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'Moderate':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Low':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    default:
      return 'text-surface-600 bg-surface-50 border-surface-200';
  }
}

function sourceName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function formatCoordinate(value?: number | null): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric).toLocaleString() : 'Unmapped';
}

function formatMetaValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Inherited';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : 'Unknown';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function eventTypeClasses(type: AIAnalysisEventZone['type']): string {
  switch (type) {
    case 'airdrop':
      return 'bg-sky-500 text-white';
    case 'contaminated':
      return 'bg-amber-500 text-white';
    case 'patrol':
      return 'bg-rose-500 text-white';
    case 'quest':
      return 'bg-violet-500 text-white';
    case 'koth':
      return 'bg-surface-900 text-white';
    default:
      return 'bg-emerald-500 text-white';
  }
}

function eventTypeLabel(type: AIAnalysisEventZone['type']): string {
  switch (type) {
    case 'airdrop':
      return 'Airdrop';
    case 'contaminated':
      return 'Contaminated';
    case 'patrol':
      return 'Patrol';
    case 'quest':
      return 'Quest AI';
    case 'koth':
      return 'KOTH';
    default:
      return 'Roaming';
  }
}

function eventPointColor(type: AIAnalysisEventZone['type']): string {
  switch (type) {
    case 'airdrop':
      return '#0284c7';
    case 'contaminated':
      return '#d97706';
    case 'patrol':
      return '#e11d48';
    case 'quest':
      return '#7c3aed';
    case 'koth':
      return '#111827';
    default:
      return '#059669';
  }
}

function StatTile({
  icon,
  label,
  value,
  detail,
  accent = 'surface',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  accent?: 'surface' | 'green' | 'blue' | 'amber' | 'red';
}) {
  const accentClass = {
    surface: 'bg-surface-50 text-surface-600',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[accent];

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-surface-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-surface-950">{value}</div>
        </div>
        <div className={`rounded-lg p-2 ${accentClass}`}>{icon}</div>
      </div>
      {detail && <div className="mt-2 text-xs text-surface-500">{detail}</div>}
    </div>
  );
}

function FactorRow({ factor }: { factor: AIAnalysisFactor }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-surface-900">{factor.label}</div>
          <div className="mt-1 text-xs text-surface-500">{factor.detail}</div>
        </div>
        <div className="rounded-full bg-surface-100 px-2 py-1 text-xs font-medium text-surface-700">
          {factor.value}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-100">
        <div
          className={`h-full rounded-full ${impactClasses(factor.impact)}`}
          style={{ width: `${Math.max(4, factor.weight)}%` }}
        />
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: AIAnalysisFinding }) {
  return (
    <div className={`rounded-xl border p-4 ${severityClasses(finding.severity)}`}>
      <div className="flex gap-3">
        <span className="mt-0.5 flex-shrink-0">{severityIcon(finding.severity)}</span>
        <div className="min-w-0">
          <div className="font-semibold">{finding.title}</div>
          <div className="mt-1 text-sm opacity-90">{finding.detail}</div>
          {finding.action && <div className="mt-2 text-xs font-medium opacity-90">{finding.action}</div>}
          {finding.path && (
            <code className="mt-2 block truncate rounded-md bg-white/70 px-2 py-1 text-[11px] text-surface-600">
              {finding.path}
            </code>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-surface-200 bg-surface-50 p-6 text-center">
      <Bot size={34} className="mb-3 text-surface-300" />
      <div className="text-sm font-semibold text-surface-800">{title}</div>
      <div className="mt-1 max-w-md text-sm text-surface-500">{detail}</div>
    </div>
  );
}

function CompositionList({
  title,
  entries,
  total,
}: {
  title: string;
  entries: Array<[string, number]>;
  total: number;
}) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-surface-900">{title}</div>
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-200 p-4 text-sm text-surface-500">
          No live composition data
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(([name, count]) => {
            const percent = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={name} className="rounded-lg border border-surface-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-surface-800">{name}</span>
                  <span className="text-surface-500">{count}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-100">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(4, percent)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const EVENT_LAYER_TYPES: AIAnalysisEventZone['type'][] = [
  'airdrop',
  'roaming',
  'patrol',
  'contaminated',
  'quest',
  'koth',
];

function eventTypeIcon(type: AIAnalysisEventZone['type'], size = 14): React.ReactNode {
  switch (type) {
    case 'airdrop':
      return <Plane size={size} />;
    case 'patrol':
      return <Route size={size} />;
    case 'contaminated':
      return <AlertTriangle size={size} />;
    case 'quest':
      return <Target size={size} />;
    case 'koth':
      return <Crosshair size={size} />;
    default:
      return <Radio size={size} />;
  }
}

function isMappedZone(zone: AIAnalysisEventZone): boolean {
  const hasCenter = Number.isFinite(Number(zone.x)) && Number.isFinite(Number(zone.z));
  const hasWaypoints = Array.isArray(zone.waypoints)
    && zone.waypoints.some((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.z)));
  return hasCenter || hasWaypoints;
}

function getZoneCenter(zone: AIAnalysisEventZone, mapConfig: ActiveMapConfig): [number, number] | null {
  if (Number.isFinite(Number(zone.x)) && Number.isFinite(Number(zone.z))) {
    return gameToMap(mapConfig, Number(zone.x), Number(zone.z));
  }

  const firstWaypoint = zone.waypoints?.find((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.z)));
  return firstWaypoint ? gameToMap(mapConfig, Number(firstWaypoint.x), Number(firstWaypoint.z)) : null;
}

function getWaypointPositions(zone: AIAnalysisEventZone, mapConfig: ActiveMapConfig): [number, number][] {
  return (zone.waypoints || [])
    .filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.z)))
    .map((point) => gameToMap(mapConfig, Number(point.x), Number(point.z)));
}

function formatRadius(value?: number | null): string {
  const radius = Number(value);
  return Number.isFinite(radius) && radius > 0 ? `${formatNumber(Math.round(radius))}m` : 'Inherited';
}

function EventMapLayer({
  layer,
  mapConfig,
  selected,
  onSelect,
}: {
  layer: AIAnalysisEventZone;
  mapConfig: ActiveMapConfig;
  selected: boolean;
  onSelect: (layer: AIAnalysisEventZone) => void;
}) {
  const center = getZoneCenter(layer, mapConfig);
  const route = getWaypointPositions(layer, mapConfig);
  const color = eventPointColor(layer.type);
  const radius = Number(layer.radius);

  if (!center && route.length < 2) return null;

  return (
    <>
      {route.length > 1 && (
        <Polyline
          positions={route}
          pathOptions={{
            color,
            opacity: selected ? 0.95 : 0.7,
            weight: selected ? 5 : 3,
          }}
          eventHandlers={{ click: () => onSelect(layer) }}
        />
      )}

      {center && Number.isFinite(radius) && radius > 0 && (
        <Circle
          center={center}
          radius={radius}
          pathOptions={{
            color,
            fillColor: color,
            fillOpacity: selected ? 0.18 : 0.11,
            opacity: selected ? 0.9 : 0.45,
            weight: selected ? 3 : 1.5,
          }}
          eventHandlers={{ click: () => onSelect(layer) }}
        />
      )}

      {center && (
        <CircleMarker
          center={center}
          radius={selected ? 9 : layer.type === 'roaming' ? 5 : 7}
          pathOptions={{
            color: '#ffffff',
            fillColor: color,
            fillOpacity: layer.enabled ? 0.95 : 0.45,
            opacity: layer.enabled ? 1 : 0.6,
            weight: selected ? 3 : 2,
          }}
          eventHandlers={{ click: () => onSelect(layer) }}
        >
          <Popup>
            <div className="min-w-[190px] text-sm">
              <div className="font-semibold text-surface-900">{layer.name}</div>
              <div className="mt-1 text-xs text-surface-500">{eventTypeLabel(layer.type)}</div>
              <div className="mt-2 space-y-1 text-xs text-surface-600">
                <div>Status: {layer.enabled ? 'Enabled' : 'Disabled'}</div>
                <div>Position: {formatCoordinate(layer.x)}, {formatCoordinate(layer.z)}</div>
                <div>Radius: {formatRadius(layer.radius)}</div>
                {layer.detail && <div>{layer.detail}</div>}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
}

function EventCoverageMap({
  layers,
  mapConfig,
}: {
  layers: AIAnalysisEventZone[];
  mapConfig: ActiveMapConfig;
}) {
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<AIAnalysisEventZone | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Record<AIAnalysisEventZone['type'], boolean>>({
    airdrop: true,
    roaming: true,
    patrol: true,
    contaminated: true,
    quest: true,
    koth: true,
  });

  const mappedLayers = useMemo(() => layers.filter(isMappedZone), [layers]);
  const visibleLayers = useMemo(() => {
    return mappedLayers
      .filter((layer) => visibleTypes[layer.type] !== false)
      .filter((layer) => showDisabled || layer.enabled)
      .slice(0, 900);
  }, [mappedLayers, showDisabled, visibleTypes]);

  const typeCounts = useMemo(() => {
    return EVENT_LAYER_TYPES.map((type) => {
      const typeLayers = mappedLayers.filter((layer) => layer.type === type);
      const visible = visibleLayers.filter((layer) => layer.type === type).length;
      return {
        type,
        total: typeLayers.length,
        enabled: typeLayers.filter((layer) => layer.enabled).length,
        visible,
      };
    });
  }, [mappedLayers, visibleLayers]);

  const activeLayer = selectedLayer && visibleLayers.some((layer) => layer.id === selectedLayer.id)
    ? selectedLayer
    : visibleLayers[0] || null;

  const toggleType = (type: AIAnalysisEventZone['type']) => {
    setVisibleTypes((current) => ({
      ...current,
      [type]: !current[type],
    }));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-surface-200 bg-white">
      <div className="grid min-h-[620px] xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="relative h-[68vh] min-h-[560px] bg-surface-950">
          <MapContainer
            key={mapRenderKey(mapConfig)}
            crs={L.CRS.Simple}
            center={mapCenter(mapConfig)}
            zoom={-2}
            minZoom={-4}
            maxZoom={2}
            maxBounds={paddedMapBounds(mapConfig)}
            style={{ width: '100%', height: '100%', background: '#1a1a2e' }}
            attributionControl={false}
            preferCanvas
          >
            <MapImageLayer mapConfig={mapConfig} />
            {visibleLayers.map((layer) => (
              <EventMapLayer
                key={layer.id}
                layer={layer}
                mapConfig={mapConfig}
                selected={activeLayer?.id === layer.id}
                onSelect={setSelectedLayer}
              />
            ))}
          </MapContainer>

          <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-xl border border-white/15 bg-surface-950/85 px-4 py-3 text-white shadow-xl backdrop-blur">
            <div className="text-sm font-semibold">{mapConfig.label} AI coverage</div>
            <div className="mt-1 text-xs text-white/65">
              {formatNumber(visibleLayers.length)} visible / {formatNumber(mappedLayers.length)} mapped
            </div>
          </div>

          {mappedLayers.length === 0 && (
            <div className="absolute inset-0 z-[600] flex items-center justify-center bg-surface-950/55 p-6">
              <div className="max-w-md rounded-xl border border-white/10 bg-white p-6 text-center shadow-xl">
                <Bot size={34} className="mx-auto mb-3 text-surface-300" />
                <div className="text-sm font-semibold text-surface-900">No mapped AI events</div>
                <div className="mt-1 text-sm text-surface-500">
                  SST found no Expansion event coordinates in the active server profile.
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="flex h-[68vh] min-h-[560px] flex-col border-t border-surface-200 bg-white xl:border-l xl:border-t-0">
          <div className="border-b border-surface-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-surface-900">Map Layers</div>
                <div className="mt-1 text-xs text-surface-500">
                  {formatNumber(mappedLayers.length)} mapped entries
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowDisabled((current) => !current)}
              >
                {showDisabled ? 'All' : 'Enabled'}
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <div className="space-y-2">
              {typeCounts.map((entry) => {
                const enabled = visibleTypes[entry.type] !== false;
                return (
                  <button
                    key={entry.type}
                    type="button"
                    onClick={() => toggleType(entry.type)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      enabled
                        ? 'border-surface-300 bg-surface-50'
                        : 'border-surface-200 bg-white opacity-55'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white"
                          style={{ backgroundColor: eventPointColor(entry.type) }}
                        >
                          {eventTypeIcon(entry.type, 14)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-surface-900">{eventTypeLabel(entry.type)}</div>
                          <div className="text-xs text-surface-500">
                            {formatNumber(entry.visible)} visible / {formatNumber(entry.enabled)} enabled
                          </div>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-100 text-surface-500'
                      }`}>
                        {enabled ? 'On' : 'Off'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
              <div className="text-sm font-semibold text-surface-900">Selected Event</div>
              {activeLayer ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: eventPointColor(activeLayer.type) }}
                      >
                        {eventTypeIcon(activeLayer.type, 14)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-surface-900">{activeLayer.name}</div>
                        <div className="text-xs text-surface-500">{eventTypeLabel(activeLayer.type)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white p-2">
                      <div className="text-surface-500">Status</div>
                      <div className="mt-1 font-semibold text-surface-900">{activeLayer.enabled ? 'Enabled' : 'Disabled'}</div>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <div className="text-surface-500">Radius</div>
                      <div className="mt-1 font-semibold text-surface-900">{formatRadius(activeLayer.radius)}</div>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <div className="text-surface-500">X</div>
                      <div className="mt-1 font-semibold text-surface-900">{formatCoordinate(activeLayer.x)}</div>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <div className="text-surface-500">Z</div>
                      <div className="mt-1 font-semibold text-surface-900">{formatCoordinate(activeLayer.z)}</div>
                    </div>
                  </div>
                  {activeLayer.detail && (
                    <div className="rounded-lg bg-white p-3 text-sm text-surface-600">{activeLayer.detail}</div>
                  )}
                  {activeLayer.meta && Object.keys(activeLayer.meta).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(activeLayer.meta).slice(0, 6).map(([key, value]) => (
                        <span key={key} className="rounded-full bg-white px-2 py-1 text-[11px] text-surface-600">
                          {key}: {formatMetaValue(value)}
                        </span>
                      ))}
                    </div>
                  )}
                  <code className="block truncate rounded-lg bg-white px-2 py-1 text-[11px] text-surface-500" title={activeLayer.sourcePath}>
                    {sourceName(activeLayer.sourcePath)}
                  </code>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-surface-200 bg-white p-4 text-sm text-surface-500">
                  No visible event selected.
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-surface-900">Visible Events</div>
              <div className="space-y-2">
                {visibleLayers.slice(0, 12).map((layer) => (
                  <button
                    key={`${layer.id}:list`}
                    type="button"
                    onClick={() => setSelectedLayer(layer)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      activeLayer?.id === layer.id
                        ? 'border-surface-500 bg-surface-100'
                        : 'border-surface-200 bg-white hover:bg-surface-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-surface-800">{layer.name}</span>
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: eventPointColor(layer.type) }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-surface-500">
                      {eventTypeLabel(layer.type)} · {formatCoordinate(layer.x)}, {formatCoordinate(layer.z)}
                    </div>
                  </button>
                ))}
                {visibleLayers.length === 0 && (
                  <div className="rounded-lg border border-dashed border-surface-200 p-4 text-sm text-surface-500">
                    No events match the current layer filters.
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EventZoneTable({
  title,
  zones,
  emptyDetail,
}: {
  title: string;
  zones: AIAnalysisEventZone[];
  emptyDetail: string;
}) {
  if (zones.length === 0) {
    return <EmptyState title={`No ${title.toLowerCase()}`} detail={emptyDetail} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-surface-200 text-xs uppercase tracking-wide text-surface-500">
          <tr>
            <th className="py-3 pr-4 font-semibold">Name</th>
            <th className="py-3 pr-4 font-semibold">Type</th>
            <th className="py-3 pr-4 font-semibold">Status</th>
            <th className="py-3 pr-4 font-semibold">Position</th>
            <th className="py-3 pr-4 font-semibold">Radius</th>
            <th className="py-3 pr-4 font-semibold">Detail</th>
            <th className="py-3 pr-4 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {zones.slice(0, 24).map((zone) => (
            <tr key={zone.id} className="align-top">
              <td className="py-3 pr-4 font-medium text-surface-900">{zone.name}</td>
              <td className="py-3 pr-4">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${eventTypeClasses(zone.type)}`}>
                  {eventTypeLabel(zone.type)}
                </span>
              </td>
              <td className="py-3 pr-4 text-surface-600">{zone.enabled ? 'Enabled' : 'Disabled'}</td>
              <td className="py-3 pr-4 text-surface-600">
                {formatCoordinate(zone.x)}, {formatCoordinate(zone.z)}
              </td>
              <td className="py-3 pr-4 text-surface-600">{zone.radius ? `${formatNumber(zone.radius)}m` : 'Inherited'}</td>
              <td className="py-3 pr-4 text-surface-600">
                <div>{zone.detail || 'Config entry'}</div>
                {zone.meta && Object.keys(zone.meta).length > 0 && (
                  <div className="mt-1 flex max-w-[360px] flex-wrap gap-1">
                    {Object.entries(zone.meta).slice(0, 3).map(([key, value]) => (
                      <span key={key} className="rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-surface-600">
                        {key}: {formatMetaValue(value)}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="max-w-[240px] py-3 pr-4 text-surface-500">
                <span className="block truncate" title={zone.sourcePath}>{sourceName(zone.sourcePath)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {zones.length > 24 && (
        <div className="mt-3 text-xs text-surface-500">
          Showing 24 of {zones.length} entries.
        </div>
      )}
    </div>
  );
}

function PatrolTable({ patrols }: { patrols: AIAnalysisPatrol[] }) {
  if (patrols.length === 0) {
    return <EmptyState title="No patrols detected" detail="SST could not read patrol entries from the Expansion AI settings files yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-surface-200 text-xs uppercase tracking-wide text-surface-500">
          <tr>
            <th className="py-3 pr-4 font-semibold">Patrol</th>
            <th className="py-3 pr-4 font-semibold">Faction</th>
            <th className="py-3 pr-4 font-semibold">Units</th>
            <th className="py-3 pr-4 font-semibold">Movement</th>
            <th className="py-3 pr-4 font-semibold">Route</th>
            <th className="py-3 pr-4 font-semibold">Type</th>
            <th className="py-3 pr-4 font-semibold">Loadout</th>
            <th className="py-3 pr-4 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {patrols.slice(0, 20).map((patrol, index) => (
            <tr key={`${patrol.sourcePath}-${patrol.name}-${index}`} className="align-top">
              <td className="py-3 pr-4 font-medium text-surface-900">{patrol.name}</td>
              <td className="py-3 pr-4 text-surface-600">{patrol.faction}</td>
              <td className="py-3 pr-4 text-surface-600">
                {patrol.maxUnitCount ? `${patrol.unitCount}-${patrol.maxUnitCount}` : patrol.unitCount}
              </td>
              <td className="py-3 pr-4 text-surface-600">{patrol.speed || patrol.behaviour || 'Default'}</td>
              <td className="py-3 pr-4 text-surface-600">{patrol.waypoints ? `${patrol.waypoints} points` : 'Spawn radius'}</td>
              <td className="py-3 pr-4 text-surface-600">
                <span className="rounded-full bg-surface-100 px-2 py-1 text-xs">
                  {patrol.dynamic ? 'Dynamic' : patrol.type || 'Static'}
                </span>
              </td>
              <td className="py-3 pr-4 text-surface-600">{patrol.loadout || 'Default'}</td>
              <td className="max-w-[240px] py-3 pr-4 text-surface-500">
                <span className="block truncate" title={patrol.sourcePath}>{sourceName(patrol.sourcePath)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {patrols.length > 20 && (
        <div className="mt-3 text-xs text-surface-500">
          Showing 20 of {patrols.length} detected patrols.
        </div>
      )}
    </div>
  );
}

export const AIAnalysisDashboard: React.FC<AIAnalysisDashboardProps> = ({ isConnected }) => {
  const [analysis, setAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { mapConfig } = useMapConfig(isConnected);

  const loadAnalysis = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError('');

    try {
      const data = await getAIAnalysis();
      setAnalysis(data);
    } catch (err) {
      const apiError = err as { response?: { data?: { error?: string; details?: string } }; message?: string };
      setError(apiError.response?.data?.details || apiError.response?.data?.error || apiError.message || 'Failed to load AI analysis.');
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const live = analysis?.live ?? DEFAULT_LIVE;
  const metrics = analysis?.metrics ?? DEFAULT_METRICS;
  const config = analysis?.config ?? DEFAULT_CONFIG;
  const difficulty = analysis?.difficulty ?? DEFAULT_DIFFICULTY;
  const findings = analysis?.findings ?? EMPTY_FINDINGS;
  const patrols = analysis?.patrols ?? EMPTY_PATROLS;
  const events = analysis?.events ?? DEFAULT_EVENTS;
  const settingsFiles = config.settingsFiles ?? [];
  const difficultyFactors = difficulty.factors ?? EMPTY_FACTORS;

  const topFactions = useMemo(() => {
    return Object.entries(live.byFaction || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [live.byFaction]);

  const topGroups = useMemo(() => {
    return Object.entries(live.byGroup || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [live.byGroup]);

  if (!isConnected) {
    return (
      <Card title="AI Analysis" icon={<Bot size={20} />}>
        <EmptyState title="API disconnected" detail="Connect to the SST API to analyse live AI telemetry and Expansion settings." />
      </Card>
    );
  }

  if (!analysis && loading) {
    return (
      <Card title="AI Analysis" icon={<Bot size={20} />}>
        <div className="flex min-h-[280px] items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-surface-600">
            <RefreshCw size={18} className="animate-spin" />
            Reading AI telemetry and Expansion settings...
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card
        title="AI Analysis"
        icon={<Bot size={20} />}
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={loading}
            icon={<RefreshCw size={14} />}
            onClick={() => void loadAnalysis()}
          >
            Refresh
          </Button>
        }
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm text-surface-500">
              Review live AI activity, Expansion difficulty settings, patrol density, and config health.
            </div>
            {analysis && (
              <div className="mt-2 text-xs text-surface-400">
                Analysed {formatDateTime(analysis.generatedAt)}
              </div>
            )}
          </div>
          {analysis && (
            <div className={`inline-flex items-center gap-3 rounded-xl border px-4 py-3 ${difficultyClasses(difficulty.label)}`}>
              <Gauge size={20} />
              <div>
                <div className="text-xs font-medium uppercase tracking-wide">Difficulty</div>
                <div className="text-lg font-semibold">{difficulty.label} ({difficulty.score}/100)</div>
              </div>
            </div>
          )}
        </div>
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
      </Card>

      {analysis && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              icon={<Bot size={18} />}
              label="Live AI"
              value={formatNumber(metrics.liveAi)}
              detail={live.isStale ? 'Telemetry stale' : formatAge(live.sourceAgeMs)}
              accent={live.isStale ? 'amber' : 'green'}
            />
            <StatTile
              icon={<MapPin size={18} />}
              label="Patrols"
              value={formatNumber(metrics.patrolCount)}
              detail={`${formatNumber(metrics.configuredUnits)} configured units`}
              accent="blue"
            />
            <StatTile
              icon={<Users size={18} />}
              label="Largest Group"
              value={formatNumber(metrics.maxGroupSize)}
              detail={`${metrics.avgGroupSize} average size`}
              accent={metrics.maxGroupSize >= 8 ? 'red' : 'surface'}
            />
            <StatTile
              icon={<Crosshair size={18} />}
              label="Factions"
              value={formatNumber(metrics.factionCount)}
              detail={`${metrics.dynamicPatrols} dynamic / ${metrics.staticPatrols} static`}
              accent="surface"
            />
            <StatTile
              icon={<FileSearch size={18} />}
              label="Loadouts"
              value={formatNumber(metrics.loadoutCount)}
              detail={config.expansionEnabled ? 'Expansion enabled' : 'Expansion disabled'}
              accent={config.expansionEnabled ? 'green' : 'amber'}
            />
          </div>

          <Card title="Expansion Event Coverage" icon={<Map size={18} />} compact>
            <EventCoverageMap layers={events.mapLayers} mapConfig={mapConfig} />
          </Card>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <Card title="Review Findings" icon={<ShieldAlert size={18} />} compact>
              <div className="space-y-3">
                {findings.map((finding, index) => (
                  <FindingRow key={`${finding.title}-${index}`} finding={finding} />
                ))}
              </div>
            </Card>

            <Card title="Difficulty Breakdown" icon={<Brain size={18} />} compact>
              <div className="space-y-3">
                {difficultyFactors.map((factor) => (
                  <FactorRow key={factor.label} factor={factor} />
                ))}
                {difficultyFactors.length === 0 && (
                  <EmptyState title="No difficulty factors" detail="SST needs readable AI settings or live AI telemetry before it can estimate difficulty." />
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card title="Live Composition" icon={<Activity size={18} />} compact>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <CompositionList title="By Faction" entries={topFactions} total={live.aiCount} />
                <CompositionList title="By Group" entries={topGroups} total={live.aiCount} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-surface-200 p-3">
                  <div className="text-xs text-surface-500">Average Health</div>
                  <div className="mt-1 text-lg font-semibold text-surface-900">
                    {live.averageHealth === null ? 'Unknown' : `${live.averageHealth}%`}
                  </div>
                </div>
                <div className="rounded-lg border border-surface-200 p-3">
                  <div className="text-xs text-surface-500">Unconscious</div>
                  <div className="mt-1 text-lg font-semibold text-surface-900">{live.unconscious}</div>
                </div>
                <div className="rounded-lg border border-surface-200 p-3">
                  <div className="text-xs text-surface-500">Source Updated</div>
                  <div className="mt-1 text-sm font-semibold text-surface-900">{formatAge(live.sourceAgeMs)}</div>
                </div>
              </div>
            </Card>

            <Card title="Configuration Files" icon={<FileSearch size={18} />} compact>
              <div className="space-y-3">
                {settingsFiles.map((file) => (
                  <div key={file.path} className="rounded-lg border border-surface-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-surface-900">{file.name}</div>
                        <code className="mt-1 block truncate text-[11px] text-surface-400">{file.path}</code>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        file.found && !file.error
                          ? 'bg-emerald-50 text-emerald-700'
                          : file.error
                            ? 'bg-red-50 text-red-700'
                            : 'bg-surface-100 text-surface-500'
                      }`}>
                        {file.found && !file.error ? 'Found' : file.error ? 'Error' : 'Missing'}
                      </span>
                    </div>
                    {file.keys && file.keys.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {file.keys.slice(0, 6).map((key) => (
                          <span key={key} className="rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-surface-600">
                            {key}
                          </span>
                        ))}
                      </div>
                    )}
                    {file.error && <div className="mt-2 text-xs text-red-600">{file.error}</div>}
                  </div>
                ))}
                {settingsFiles.length === 0 && (
                  <EmptyState title="No config files returned" detail="The API did not return AI settings file data. Restart the API after updating SST, then refresh this page." />
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card title="Airdrop Zones" icon={<Plane size={18} />} compact>
              <EventZoneTable
                title="Airdrop zones"
                zones={[...events.airdrops].sort((a, b) => Number(b.meta?.weight || 0) - Number(a.meta?.weight || 0))}
                emptyDetail="No Expansion airdrop mission files were found in the active mission expansion folder."
              />
            </Card>

            <Card title="AI Hotspots" icon={<Radio size={18} />} compact>
              <EventZoneTable
                title="AI hotspots"
                zones={[
                  ...events.patrolRoutes,
                  ...events.roamingLocations
                    .filter((zone) => zone.enabled)
                    .sort((a, b) => (b.radius || 0) - (a.radius || 0))
                    .slice(0, 16),
                  ...events.contaminatedAreas.filter((zone) => zone.enabled),
                  ...events.questAiObjectives,
                ]}
                emptyDetail="No patrol, roaming, contaminated, or quest AI hotspots were mapped."
              />
            </Card>
          </div>

          <Card title="Patrol Balance" icon={<MapPin size={18} />} compact>
            <PatrolTable patrols={patrols} />
          </Card>
        </>
      )}
    </div>
  );
};

export default AIAnalysisDashboard;
