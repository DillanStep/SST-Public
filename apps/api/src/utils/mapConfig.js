const BUILTIN_MAPS = [
  {
    id: "chernarusplus",
    label: "Chernarus+",
    aliases: ["chernarus", "chernarusplus", "dayzoffline.chernarusplus", "dayzOffline.chernarusplus"],
    worldSizeX: 15360,
    worldSizeZ: 15360,
    imageUrl: "/maps/chernarus.jpg",
    imageWidth: 4096,
    imageHeight: 4096,
  },
  {
    id: "enoch",
    label: "Livonia / Enoch",
    aliases: ["livonia", "enoch", "dayzoffline.enoch", "dayzOffline.enoch"],
    worldSizeX: 12800,
    worldSizeZ: 12800,
    imageUrl: "/maps/livonia.jpg",
    imageWidth: 7222,
    imageHeight: 7223,
  },
  {
    id: "sakhal",
    label: "Sakhal",
    aliases: ["sakhal", "frostline", "dayzoffline.sakhal", "dayzOffline.sakhal"],
    worldSizeX: 12800,
    worldSizeZ: 12800,
    imageUrl: "/maps/sakhal.webp",
    imageWidth: 4096,
    imageHeight: 4096,
  },
  {
    id: "namalsk",
    label: "Namalsk",
    aliases: ["namalsk", "regular.namalsk", "hardcore.namalsk"],
    worldSizeX: 12800,
    worldSizeZ: 12800,
    imageUrl: "/maps/namalsk.jpg",
    imageWidth: 2000,
    imageHeight: 2183,
  },
  {
    id: "deerisle",
    label: "Deer Isle",
    aliases: ["deerisle", "deer_isle", "empty.deerisle"],
    worldSizeX: 16384,
    worldSizeZ: 16384,
    imageUrl: "/maps/deerisle.webp",
    imageWidth: 2048,
    imageHeight: 2048,
  },
  {
    id: "esseker",
    label: "Esseker",
    aliases: ["esseker", "dayzoffline.esseker", "dayzOffline.Esseker"],
    worldSizeX: 12288,
    worldSizeZ: 12288,
    imageUrl: "/maps/esseker.jpg",
    imageWidth: 7008,
    imageHeight: 6880,
  },
  {
    id: "hasima",
    label: "Hasima / Hashima Islands",
    aliases: ["hasima", "hashima", "hashimaislands", "dayzoffline.hasima", "dayzOffline.hasima", "dayzoffline.hashima", "dayzOffline.hashima"],
    worldSizeX: 5120,
    worldSizeZ: 5120,
    imageUrl: "/maps/hasima.jpg",
    imageWidth: 5632,
    imageHeight: 5632,
  },
  {
    id: "custom",
    label: "Custom",
    aliases: ["custom"],
    worldSizeX: 15360,
    worldSizeZ: 15360,
    imageUrl: "",
    imageWidth: 0,
    imageHeight: 0,
  },
];

const BUILTIN_BY_ID = new Map(BUILTIN_MAPS.map((map) => [map.id, map]));

const LEGACY_IMAGE_URLS = new Map([
  ["/maps/livona.jpg", "/maps/livonia.jpg"],
  ["/maps/namalsk.jpg", "/maps/namalsk.jpg"],
  ["/maps/sakhal.jpg", "/maps/sakhal.webp"],
  ["/maps/deerisle.jpg", "/maps/deerisle.webp"],
  ["/maps/deerisle.png", "/maps/deerisle.webp"],
]);

function normalizeMapId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toPositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeMapImageUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return LEGACY_IMAGE_URLS.get(trimmed.toLowerCase()) || trimmed;
}

export function getBuiltinMaps() {
  return BUILTIN_MAPS;
}

export function detectMapPresetFromMissionPath(missionPath) {
  const normalized = String(missionPath || "").replace(/\\/g, "/").toLowerCase();
  const folder = normalized.split("/").filter(Boolean).pop() || normalized;

  for (const map of BUILTIN_MAPS) {
    if (map.id === "custom") continue;
    if (map.aliases.some((alias) => folder === alias.toLowerCase() || normalized.includes(alias.toLowerCase()))) {
      return map.id;
    }
  }

  return "chernarusplus";
}

export function buildMapConfig({ env = {}, missionPath = "" } = {}) {
  const requestedPreset = normalizeMapId(env.MAP_PRESET);
  const detectedPreset = detectMapPresetFromMissionPath(missionPath);
  const presetId = requestedPreset && BUILTIN_BY_ID.has(requestedPreset) ? requestedPreset : detectedPreset;
  const preset = BUILTIN_BY_ID.get(presetId) || BUILTIN_BY_ID.get("chernarusplus");
  const isCustom = preset.id === "custom";

  const worldSizeX = toPositiveNumber(env.MAP_WORLD_SIZE_X, preset.worldSizeX);
  const worldSizeZ = toPositiveNumber(env.MAP_WORLD_SIZE_Z, preset.worldSizeZ);
  const imageUrl = normalizeMapImageUrl(env.MAP_IMAGE_URL) || preset.imageUrl || "";

  return {
    preset: preset.id,
    label: isCustom && env.MAP_LABEL ? String(env.MAP_LABEL).trim() : preset.label,
    detectedPreset,
    missionPath,
    imageUrl,
    defaultImageUrl: preset.imageUrl,
    imageWidth: preset.imageWidth,
    imageHeight: preset.imageHeight,
    worldSizeX,
    worldSizeZ,
    invertX: toBoolean(env.MAP_INVERT_X),
    invertZ: toBoolean(env.MAP_INVERT_Z),
    builtinMaps: BUILTIN_MAPS.map((map) => ({
      id: map.id,
      label: map.label,
      worldSizeX: map.worldSizeX,
      worldSizeZ: map.worldSizeZ,
      imageUrl: map.imageUrl,
      imageWidth: map.imageWidth,
      imageHeight: map.imageHeight,
    })),
  };
}
