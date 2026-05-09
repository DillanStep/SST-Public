import React, { useMemo } from 'react';
import { AlertTriangle, Crosshair, ShieldCheck, Skull, Target } from 'lucide-react';
import { Badge } from '../ui';
import type { LifeEvent, PlayerData, PlayerEvent } from '../../types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
type BodyZoneId = 'head' | 'neck' | 'chest' | 'stomach' | 'arms' | 'legs';
type CombatRecordKind = 'hit' | 'kill' | 'death';

interface PlayerCombatHeatmapProps {
  playerId: string;
  playerName: string;
  playerEvents: PlayerEvent[];
  playerLifeEvents: LifeEvent[];
  allPlayers?: Record<string, PlayerData>;
}

interface CombatRecord {
  id: string;
  kind: CombatRecordKind;
  timestamp: string;
  targetId?: string;
  targetName?: string;
  weapon?: string;
  damage?: number;
  distance?: number;
  zone?: BodyZoneId;
  source: 'life-event' | 'combat-event';
}

interface KillerRef {
  id?: string;
  name?: string;
}

interface BodyZoneMeta {
  id: BodyZoneId;
  label: string;
  spots: { x: number; y: number; r: number }[];
}

const BODY_ZONES: BodyZoneMeta[] = [
  { id: 'head', label: 'Head', spots: [{ x: 110, y: 48, r: 30 }] },
  { id: 'neck', label: 'Neck', spots: [{ x: 110, y: 88, r: 18 }] },
  { id: 'chest', label: 'Chest', spots: [{ x: 110, y: 138, r: 42 }] },
  { id: 'stomach', label: 'Stomach', spots: [{ x: 110, y: 205, r: 38 }] },
  {
    id: 'arms',
    label: 'Arms',
    spots: [
      { x: 58, y: 170, r: 32 },
      { x: 162, y: 170, r: 32 },
    ],
  },
  {
    id: 'legs',
    label: 'Legs',
    spots: [
      { x: 86, y: 306, r: 38 },
      { x: 134, y: 306, r: 38 },
    ],
  },
];

const BODY_ZONE_ALIASES: Array<{ zone: BodyZoneId; terms: string[] }> = [
  { zone: 'head', terms: ['head', 'brain', 'skull', 'face', 'jaw'] },
  { zone: 'neck', terms: ['neck', 'throat'] },
  { zone: 'chest', terms: ['chest', 'torso', 'spine', 'heart', 'lung', 'lungs', 'rib'] },
  { zone: 'stomach', terms: ['stomach', 'abdomen', 'belly', 'pelvis', 'waist'] },
  { zone: 'arms', terms: ['arm', 'forearm', 'hand', 'shoulder', 'elbow'] },
  { zone: 'legs', terms: ['leg', 'thigh', 'knee', 'foot', 'feet', 'calf'] },
];

const HIT_ZONE_KEYS = [
  'hitZone',
  'bodyPart',
  'targetBodyPart',
  'damageZone',
  'hitSelection',
  'hitComponent',
  'selection',
  'component',
  'targetZone',
  'zone',
];

const WEAPON_KEYS = ['weapon', 'weaponClassName', 'sourceWeapon', 'causeWeapon', 'itemClassName'];
const TARGET_ID_KEYS = ['targetPlayerId', 'victimPlayerId', 'hitPlayerId', 'killedPlayerId'];
const TARGET_NAME_KEYS = ['targetPlayerName', 'victimPlayerName', 'hitPlayerName', 'killedPlayerName'];

function asRecord(event: PlayerEvent | LifeEvent): Record<string, unknown> {
  return event as unknown as Record<string, unknown>;
}

function getStringField(event: PlayerEvent | LifeEvent, keys: string[]): string | undefined {
  const record = asRecord(event);
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getNumberField(event: PlayerEvent | LifeEvent, keys: string[]): number | undefined {
  const record = asRecord(event);
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function normalizeBodyZone(value?: string): BodyZoneId | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const alias of BODY_ZONE_ALIASES) {
    if (alias.terms.some(term => normalized.includes(term))) {
      return alias.zone;
    }
  }

  return undefined;
}

function getBodyZone(event: PlayerEvent | LifeEvent): BodyZoneId | undefined {
  return normalizeBodyZone(getStringField(event, HIT_ZONE_KEYS));
}

function getWeapon(event: PlayerEvent | LifeEvent): string | undefined {
  return getStringField(event, WEAPON_KEYS);
}

function getTargetId(event: PlayerEvent | LifeEvent): string | undefined {
  return getStringField(event, TARGET_ID_KEYS);
}

function getTargetName(event: PlayerEvent | LifeEvent): string | undefined {
  return getStringField(event, TARGET_NAME_KEYS);
}

function parseKillerFromCause(causeOfDeath?: string): KillerRef | null {
  if (!causeOfDeath) return null;
  const match = causeOfDeath.match(/^Player:\s*(.*?)\s*\(([^)]+)\)/i);
  if (!match) return null;

  return {
    name: match[1]?.trim(),
    id: match[2]?.trim(),
  };
}

function getKillerFromLifeEvent(event: LifeEvent): KillerRef | null {
  if (event.targetPlayerId || event.targetPlayerName) {
    return {
      id: event.targetPlayerId,
      name: event.targetPlayerName,
    };
  }

  return parseKillerFromCause(event.causeOfDeath);
}

function isCombatEvent(eventType: string): boolean {
  const type = eventType.toUpperCase();
  return (
    type.includes('HIT') ||
    type.includes('SHOT') ||
    type.includes('DAMAGE') ||
    type.includes('KILL') ||
    type.includes('COMBAT')
  );
}

function getPlayerNameFromData(playerId: string, playerData?: PlayerData): string {
  return (
    playerData?.inventory?.players?.[0]?.playerName ||
    playerData?.lifeEvents?.playerName ||
    playerData?.events?.playerName ||
    playerData?.online?.playerName ||
    playerId
  );
}

function collectConfirmedKills(playerId: string, allPlayers?: Record<string, PlayerData>): CombatRecord[] {
  if (!allPlayers) return [];

  const records: CombatRecord[] = [];

  Object.entries(allPlayers).forEach(([victimId, playerData]) => {
    const victimName = getPlayerNameFromData(victimId, playerData);
    const events = playerData.lifeEvents?.events || [];

    events.forEach((event, index) => {
      if (event.eventType !== 'DIED') return;

      const killer = getKillerFromLifeEvent(event);
      if (!killer?.id || killer.id !== playerId || victimId === playerId) return;

      records.push({
        id: `kill-${victimId}-${event.timestamp}-${index}`,
        kind: 'kill',
        timestamp: event.timestamp,
        targetId: event.playerId || victimId,
        targetName: event.playerName || victimName,
        weapon: getWeapon(event),
        damage: getNumberField(event, ['damage']),
        distance: getNumberField(event, ['distance']),
        zone: getBodyZone(event),
        source: 'life-event',
      });
    });
  });

  return records;
}

function collectDeathsToPlayers(playerId: string, playerLifeEvents: LifeEvent[]): CombatRecord[] {
  return playerLifeEvents.reduce<CombatRecord[]>((records, event, index) => {
    if (event.eventType !== 'DIED') return records;

    const killer = getKillerFromLifeEvent(event);
    if (!killer?.id || killer.id === playerId) return records;

    records.push({
      id: `death-${event.timestamp}-${index}`,
      kind: 'death',
      timestamp: event.timestamp,
      targetId: killer.id,
      targetName: killer.name,
      weapon: getWeapon(event),
      damage: getNumberField(event, ['damage']),
      distance: getNumberField(event, ['distance']),
      zone: getBodyZone(event),
      source: 'life-event',
    });

    return records;
  }, []);
}

function collectCombatTelemetry(playerId: string, playerEvents: PlayerEvent[]): CombatRecord[] {
  return playerEvents.reduce<CombatRecord[]>((records, event, index) => {
    if (!isCombatEvent(event.eventType)) return records;
    if (event.playerId && event.playerId !== playerId) return records;

    records.push({
      id: `combat-${event.timestamp}-${index}`,
      kind: event.eventType.toUpperCase().includes('KILL') ? 'kill' : 'hit',
      timestamp: event.timestamp,
      targetId: getTargetId(event),
      targetName: getTargetName(event),
      weapon: getWeapon(event),
      damage: getNumberField(event, ['damage']),
      distance: getNumberField(event, ['distance']),
      zone: getBodyZone(event),
      source: 'combat-event',
    });

    return records;
  }, []);
}

function sortRecordsByNewest(records: CombatRecord[]): CombatRecord[] {
  return [...records].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
}

function formatDistance(distance?: number): string | null {
  if (typeof distance !== 'number') return null;
  return `${Math.round(distance)}m`;
}

function getReviewState(zoneCounts: Record<BodyZoneId, number>, totalZonedHits: number): {
  label: string;
  variant: BadgeVariant;
  icon: React.ReactNode;
} {
  if (totalZonedHits === 0) {
    return {
      label: 'Telemetry needed',
      variant: 'default',
      icon: <Target size={12} className="mr-1" />,
    };
  }

  const headRate = zoneCounts.head / totalZonedHits;
  if (totalZonedHits >= 8 && headRate >= 0.75) {
    return {
      label: 'High head hit rate',
      variant: 'error',
      icon: <AlertTriangle size={12} className="mr-1" />,
    };
  }

  if (totalZonedHits >= 5 && headRate >= 0.55) {
    return {
      label: 'Review',
      variant: 'warning',
      icon: <AlertTriangle size={12} className="mr-1" />,
    };
  }

  return {
    label: 'Normal',
    variant: 'success',
    icon: <ShieldCheck size={12} className="mr-1" />,
  };
}

export const PlayerCombatHeatmap: React.FC<PlayerCombatHeatmapProps> = ({
  playerId,
  playerName,
  playerEvents,
  playerLifeEvents,
  allPlayers,
}) => {
  const model = useMemo(() => {
    const confirmedKills = collectConfirmedKills(playerId, allPlayers);
    const deathsToPlayers = collectDeathsToPlayers(playerId, playerLifeEvents);
    const combatTelemetry = collectCombatTelemetry(playerId, playerEvents);
    const heatmapRecords = combatTelemetry.length > 0 ? combatTelemetry : confirmedKills;
    const outgoingRecords = [...confirmedKills, ...combatTelemetry];

    const zoneCounts = BODY_ZONES.reduce<Record<BodyZoneId, number>>((counts, zone) => {
      counts[zone.id] = 0;
      return counts;
    }, {} as Record<BodyZoneId, number>);

    heatmapRecords.forEach(record => {
      if (record.zone) {
        zoneCounts[record.zone] += 1;
      }
    });

    const totalZonedHits = Object.values(zoneCounts).reduce((sum, value) => sum + value, 0);
    const unknownZones = heatmapRecords.length - totalZonedHits;
    const maxZoneCount = Math.max(1, ...Object.values(zoneCounts));

    return {
      confirmedKills,
      deathsToPlayers,
      combatTelemetry,
      outgoingRecords,
      heatmapRecords,
      recentRecords: sortRecordsByNewest([...outgoingRecords, ...deathsToPlayers]).slice(0, 10),
      zoneCounts,
      totalZonedHits,
      unknownZones,
      maxZoneCount,
      reviewState: getReviewState(zoneCounts, totalZonedHits),
    };
  }, [allPlayers, playerEvents, playerId, playerLifeEvents]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <section className="xl:col-span-3 rounded-lg border border-surface-200 bg-white overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-surface-200 bg-surface-50">
            <div>
              <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
                <Crosshair size={16} />
                Aim Heatmap
              </h3>
              <p className="text-xs text-surface-500 mt-0.5">{playerName}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={model.totalZonedHits > 0 ? 'info' : 'default'}>
                {model.totalZonedHits > 0 ? `${model.totalZonedHits} mapped hits` : 'No mapped hits'}
              </Badge>
              <Badge variant={model.reviewState.variant}>
                {model.reviewState.icon}
                {model.reviewState.label}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
            <div className="flex min-h-[340px] justify-center rounded-lg bg-surface-50 border border-surface-200 py-4">
              <svg
                viewBox="0 0 220 380"
                role="img"
                aria-label="Player body hit heatmap"
                className="h-80 max-h-full w-full max-w-xs"
              >
                <g fill="#eef2f7" stroke="#94a3b8" strokeWidth="2">
                  <circle cx="110" cy="48" r="28" />
                  <path d="M84 92 Q110 78 136 92 L148 226 Q110 246 72 226 Z" />
                  <path d="M78 108 Q48 132 42 204" fill="none" strokeWidth="16" strokeLinecap="round" />
                  <path d="M142 108 Q172 132 178 204" fill="none" strokeWidth="16" strokeLinecap="round" />
                  <path d="M91 232 Q82 282 78 350" fill="none" strokeWidth="18" strokeLinecap="round" />
                  <path d="M129 232 Q138 282 142 350" fill="none" strokeWidth="18" strokeLinecap="round" />
                </g>

                {BODY_ZONES.flatMap(zone => {
                  const count = model.zoneCounts[zone.id];
                  const intensity = count / model.maxZoneCount;
                  const fill = count > 0
                    ? `rgba(239, 68, 68, ${0.22 + intensity * 0.58})`
                    : 'rgba(148, 163, 184, 0.08)';
                  const stroke = count > 0 ? '#dc2626' : '#cbd5e1';

                  return zone.spots.map((spot, index) => {
                    if (count === 0) return null;

                    return (
                      <g key={`${zone.id}-${index}`}>
                        <circle
                          cx={spot.x}
                          cy={spot.y}
                          r={spot.r}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={2}
                        />
                        <text
                          x={spot.x}
                          y={spot.y + 5}
                          textAnchor="middle"
                          className="fill-white text-sm font-semibold"
                        >
                          {count}
                        </text>
                      </g>
                    );
                  });
                })}
              </svg>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-surface-500">
                    <Skull size={13} />
                    Kills
                  </div>
                  <div className="mt-1 text-xl font-semibold text-surface-900">{model.confirmedKills.length}</div>
                </div>
                <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-surface-500">
                    <Target size={13} />
                    Mapped
                  </div>
                  <div className="mt-1 text-xl font-semibold text-surface-900">{model.totalZonedHits}</div>
                </div>
                <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-surface-500">
                    <Crosshair size={13} />
                    Unmapped
                  </div>
                  <div className="mt-1 text-xl font-semibold text-surface-900">{model.unknownZones}</div>
                </div>
              </div>

              <div className="rounded-lg border border-surface-200 overflow-hidden">
                <div className="px-3 py-2 border-b border-surface-200 bg-surface-50 text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Body Zones
                </div>
                <div className="divide-y divide-surface-200">
                  {BODY_ZONES.map(zone => {
                    const count = model.zoneCounts[zone.id];
                    const width = model.maxZoneCount > 0 ? Math.round((count / model.maxZoneCount) * 100) : 0;

                    return (
                      <div key={zone.id} className="px-3 py-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-surface-700">{zone.label}</span>
                          <span className="text-surface-500">{count}</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-surface-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {model.totalZonedHits === 0 && model.confirmedKills.length === 0 && (
                <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-500">
                  No combat telemetry recorded for this player yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="xl:col-span-2 rounded-lg border border-surface-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 bg-surface-50">
            <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
              <Target size={16} />
              Combat Evidence
            </h3>
            <Badge variant="default">{model.recentRecords.length}</Badge>
          </div>

          {model.recentRecords.length > 0 ? (
            <div className="max-h-[520px] overflow-y-auto divide-y divide-surface-200">
              {model.recentRecords.map(record => (
                <div key={record.id} className="p-3 hover:bg-surface-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-surface-800 truncate">
                        {record.kind === 'death'
                          ? `Killed by ${record.targetName || record.targetId || 'unknown player'}`
                          : `${record.kind === 'kill' ? 'Killed' : 'Hit'} ${record.targetName || record.targetId || 'unknown target'}`}
                      </div>
                      <div className="mt-1 text-xs text-surface-500">
                        {formatDateTime(record.timestamp)}
                      </div>
                    </div>
                    <Badge variant={record.kind === 'death' ? 'error' : record.kind === 'kill' ? 'warning' : 'info'}>
                      {record.zone ? BODY_ZONES.find(zone => zone.id === record.zone)?.label : 'Unknown'}
                    </Badge>
                  </div>
                  {(record.weapon || record.damage || record.distance) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-surface-500">
                      {record.weapon && <span>{record.weapon}</span>}
                      {typeof record.damage === 'number' && <span>{Math.round(record.damage)} damage</span>}
                      {formatDistance(record.distance) && <span>{formatDistance(record.distance)}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[340px] flex-col items-center justify-center px-6 text-center text-surface-500">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-surface-200 bg-surface-50">
                <Crosshair size={24} className="text-surface-400" />
              </div>
              <p className="text-sm font-medium text-surface-700">No player combat found</p>
              <p className="mt-1 max-w-xs text-xs text-surface-500">
                New hits, kills, and deaths will be listed here.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default PlayerCombatHeatmap;
