import type { ServerConfig, ServerMapConfig } from '../types';

export interface ActiveMapConfig {
  preset: string;
  label: string;
  detectedPreset: string;
  missionPath: string;
  imageUrl: string;
  defaultImageUrl: string;
  worldSizeX: number;
  worldSizeZ: number;
  invertX: boolean;
  invertZ: boolean;
}

export interface MapPresetDefinition {
  id: string;
  label: string;
  worldSizeX: number;
  worldSizeZ: number;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  aliases: string[];
}

export const MAP_PRESETS: MapPresetDefinition[] = [
  {
    id: 'chernarusplus',
    label: 'Chernarus+',
    worldSizeX: 15360,
    worldSizeZ: 15360,
    imageUrl: '/maps/chernarus.jpg',
    imageWidth: 4096,
    imageHeight: 4096,
    aliases: ['chernarus', 'chernarusplus', 'dayzoffline.chernarusplus'],
  },
  {
    id: 'enoch',
    label: 'Livonia / Enoch',
    worldSizeX: 12800,
    worldSizeZ: 12800,
    imageUrl: '/maps/livonia.jpg',
    imageWidth: 7222,
    imageHeight: 7223,
    aliases: ['enoch', 'livonia', 'dayzoffline.enoch'],
  },
  {
    id: 'sakhal',
    label: 'Sakhal',
    worldSizeX: 12800,
    worldSizeZ: 12800,
    imageUrl: '/maps/sakhal.webp',
    imageWidth: 4096,
    imageHeight: 4096,
    aliases: ['sakhal', 'frostline', 'dayzoffline.sakhal'],
  },
  {
    id: 'namalsk',
    label: 'Namalsk',
    worldSizeX: 12800,
    worldSizeZ: 12800,
    imageUrl: '/maps/namalsk.jpg',
    imageWidth: 2000,
    imageHeight: 2183,
    aliases: ['namalsk', 'regular.namalsk', 'hardcore.namalsk'],
  },
  {
    id: 'deerisle',
    label: 'Deer Isle',
    worldSizeX: 16384,
    worldSizeZ: 16384,
    imageUrl: '/maps/deerisle.webp',
    imageWidth: 2048,
    imageHeight: 2048,
    aliases: ['deerisle', 'deer_isle', 'empty.deerisle'],
  },
  {
    id: 'esseker',
    label: 'Esseker',
    worldSizeX: 12288,
    worldSizeZ: 12288,
    imageUrl: '/maps/esseker.jpg',
    imageWidth: 7008,
    imageHeight: 6880,
    aliases: ['esseker', 'dayzoffline.esseker'],
  },
  {
    id: 'hasima',
    label: 'Hasima / Hashima Islands',
    worldSizeX: 5120,
    worldSizeZ: 5120,
    imageUrl: '/maps/hasima.jpg',
    imageWidth: 5632,
    imageHeight: 5632,
    aliases: ['hasima', 'hashima', 'hashimaislands', 'dayzoffline.hasima', 'dayzoffline.hashima'],
  },
  {
    id: 'custom',
    label: 'Custom Map',
    worldSizeX: 15360,
    worldSizeZ: 15360,
    imageUrl: '',
    imageWidth: 0,
    imageHeight: 0,
    aliases: ['custom'],
  },
];

export const MAP_PRESET_OPTIONS = MAP_PRESETS.map(({ id, label }) => ({ value: id, label }));

export const DEFAULT_MAP_PRESET = MAP_PRESETS[0];

const LEGACY_IMAGE_URLS: Record<string, string> = {
  '/maps/livona.jpg': '/maps/livonia.jpg',
  '/maps/namalsk.jpg': '/maps/namalsk.jpg',
  '/maps/sakhal.jpg': '/maps/sakhal.webp',
  '/maps/deerisle.jpg': '/maps/deerisle.webp',
  '/maps/deerisle.png': '/maps/deerisle.webp',
};

export const DEFAULT_MAP_CONFIG: ActiveMapConfig = {
  preset: 'chernarusplus',
  label: 'Chernarus+',
  detectedPreset: 'chernarusplus',
  missionPath: '',
  imageUrl: '/maps/chernarus.jpg',
  defaultImageUrl: '/maps/chernarus.jpg',
  worldSizeX: 15360,
  worldSizeZ: 15360,
  invertX: false,
  invertZ: false,
};

export function getMapPresetDefaults(preset?: string | null): MapPresetDefinition {
  if (!preset) return DEFAULT_MAP_PRESET;
  const normalized = preset.toLowerCase().replace(/[^a-z0-9]/g, '');
  return MAP_PRESETS.find(map => map.id === normalized || map.aliases.some(alias => alias.replace(/[^a-z0-9]/g, '') === normalized))
    || DEFAULT_MAP_PRESET;
}

export function normalizeMapImageUrl(value?: string | null): string {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  return LEGACY_IMAGE_URLS[trimmed.toLowerCase()] || trimmed;
}

export function detectMapPresetFromMissionPath(missionPath: string): string | null {
  const normalized = missionPath.toLowerCase().replace(/[^a-z0-9]/g, '');
  const detected = MAP_PRESETS.find(map => map.id !== 'custom' && map.aliases.some(alias => normalized.includes(alias.replace(/[^a-z0-9]/g, ''))));
  return detected?.id || null;
}

const positiveNumberOrFallback = (value: unknown, fallback: number): number => {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
};

export function getServerMapOverride(server?: ServerConfig | null): Partial<ServerMapConfig> | null {
  if (!server?.mapPreset) return null;

  const defaults = getMapPresetDefaults(server.mapPreset);
  return {
    preset: defaults.id,
    label: server.mapLabel?.trim() || defaults.label,
    detectedPreset: defaults.id,
    imageUrl: normalizeMapImageUrl(server.mapImageUrl) || defaults.imageUrl,
    defaultImageUrl: defaults.imageUrl,
    worldSizeX: positiveNumberOrFallback(server.mapWorldSizeX, defaults.worldSizeX),
    worldSizeZ: positiveNumberOrFallback(server.mapWorldSizeZ, defaults.worldSizeZ),
    invertX: Boolean(server.mapInvertX),
    invertZ: Boolean(server.mapInvertZ),
  };
}

export function resolveMapConfig(config?: Partial<ServerMapConfig> | null): ActiveMapConfig {
  if (!config) return DEFAULT_MAP_CONFIG;

  const presetDefaults = getMapPresetDefaults(config.preset || config.detectedPreset);

  return {
    preset: config.preset || presetDefaults.id,
    label: config.label || presetDefaults.label,
    detectedPreset: config.detectedPreset || config.preset || presetDefaults.id,
    missionPath: config.missionPath || '',
    imageUrl: normalizeMapImageUrl(config.imageUrl) || presetDefaults.imageUrl,
    defaultImageUrl: normalizeMapImageUrl(config.defaultImageUrl) || presetDefaults.imageUrl,
    worldSizeX: positiveNumberOrFallback(config.worldSizeX, presetDefaults.worldSizeX),
    worldSizeZ: positiveNumberOrFallback(config.worldSizeZ, presetDefaults.worldSizeZ),
    invertX: Boolean(config.invertX),
    invertZ: Boolean(config.invertZ),
  };
}

export function mapBounds(mapConfig: ActiveMapConfig): [[number, number], [number, number]] {
  return [
    [0, 0],
    [mapConfig.worldSizeZ, mapConfig.worldSizeX],
  ];
}

export function mapCenter(mapConfig: ActiveMapConfig): [number, number] {
  return [mapConfig.worldSizeZ / 2, mapConfig.worldSizeX / 2];
}

export function paddedMapBounds(mapConfig: ActiveMapConfig, padding = 1000): [[number, number], [number, number]] {
  return [
    [-padding, -padding],
    [mapConfig.worldSizeZ + padding, mapConfig.worldSizeX + padding],
  ];
}

export function gameToMap(mapConfig: ActiveMapConfig, x: number, z: number): [number, number] {
  const mapX = mapConfig.invertX ? mapConfig.worldSizeX - x : x;
  const mapZ = mapConfig.invertZ ? mapConfig.worldSizeZ - z : z;
  return [mapZ, mapX];
}

export function mapToGame(mapConfig: ActiveMapConfig, lat: number, lng: number): { x: number; z: number } {
  const x = mapConfig.invertX ? mapConfig.worldSizeX - lng : lng;
  const z = mapConfig.invertZ ? mapConfig.worldSizeZ - lat : lat;
  return { x, z };
}

export function mapRenderKey(mapConfig: ActiveMapConfig): string {
  return [
    mapConfig.preset,
    mapConfig.worldSizeX,
    mapConfig.worldSizeZ,
    mapConfig.invertX ? 'ix' : 'nx',
    mapConfig.invertZ ? 'iz' : 'nz',
    mapConfig.imageUrl || 'grid',
  ].join(':');
}
