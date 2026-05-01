import "./appConfig.js";

function normalizeEnvPath(value) {
  if (!value) return "";
  // Normalize Windows separators to POSIX style (important for SFTP/FTP)
  return String(value).trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function stripSuffix(pathValue, suffix) {
  if (!pathValue) return "";
  const p = normalizeEnvPath(pathValue);
  return p.endsWith(suffix) ? p.slice(0, -suffix.length) : "";
}

function dirnamePosix(pathValue) {
  const p = normalizeEnvPath(pathValue);
  if (!p) return "";
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return p.startsWith("/") ? "/" : "";
  return p.slice(0, idx);
}

function deriveSstBasePath() {
  const explicit = normalizeEnvPath(process.env.SST_PATH);
  if (explicit) return explicit;

  return (
    stripSuffix(process.env.INVENTORIES_PATH, "/inventories") ||
    stripSuffix(process.env.EVENTS_PATH, "/events") ||
    stripSuffix(process.env.LIFE_EVENTS_PATH, "/life_events") ||
    stripSuffix(process.env.TRADES_PATH, "/trades") ||
    stripSuffix(process.env.API_PATH, "/api") ||
    (() => {
      const onlinePlayers = normalizeEnvPath(process.env.ONLINE_PLAYERS_PATH);
      if (!onlinePlayers) return "";
      const apiDir = dirnamePosix(onlinePlayers);
      const base = stripSuffix(apiDir, "/api");
      return base || "";
    })() ||
    ""
  );
}

// Default base paths - MUST be configured in .env for your server
// These defaults will NOT work - you must set SST_PATH in your .env file
const derivedBasePath = deriveSstBasePath();
const defaultBasePath = derivedBasePath || "./profiles/SST";
const defaultExpansionPath = normalizeEnvPath(process.env.EXPANSION_TRADERS_PATH)?.replace(/\/Traders$/, "") || "./profiles/ExpansionMod";
const defaultMissionPath = normalizeEnvPath(process.env.MISSION_PATH) || "./mpmissions/dayzOffline.chernarusplus";
const defaultProfilesPath = normalizeEnvPath(process.env.PROFILES_PATH) || "./profiles";

// .env values take priority, then fall back to defaults
export const paths = {
  // SST base path
  sst: normalizeEnvPath(process.env.SST_PATH) || defaultBasePath,
  
  // SST paths
  inventories: normalizeEnvPath(process.env.INVENTORIES_PATH) || `${defaultBasePath}/inventories`,
  events: normalizeEnvPath(process.env.EVENTS_PATH) || `${defaultBasePath}/events`,
  lifeEvents: normalizeEnvPath(process.env.LIFE_EVENTS_PATH) || `${defaultBasePath}/life_events`,
  trades: normalizeEnvPath(process.env.TRADES_PATH) || `${defaultBasePath}/trades`,
  api: normalizeEnvPath(process.env.API_PATH) || `${defaultBasePath}/api`,
  onlinePlayers: normalizeEnvPath(process.env.ONLINE_PLAYERS_PATH) || (process.env.API_PATH ? `${normalizeEnvPath(process.env.API_PATH)}/online_players.json` : `${defaultBasePath}/api/online_players.json`),
  
  // Expansion paths
  expansionTraders: normalizeEnvPath(process.env.EXPANSION_TRADERS_PATH) || `${defaultExpansionPath}/Traders`,
  expansionMarket: normalizeEnvPath(process.env.EXPANSION_MARKET_PATH) || `${defaultExpansionPath}/Market`,
  
  // Mission path (for trader zones and types.xml)
  missionFolder: normalizeEnvPath(process.env.MISSION_PATH) || defaultMissionPath,
  
  // Types.xml path - can override if not in standard db/ folder
  // If not set, will look in MISSION_PATH/db/types.xml
  typesXml: normalizeEnvPath(process.env.TYPES_PATH) || null,
  
  // Server profiles path (for logs)
  profiles: normalizeEnvPath(process.env.PROFILES_PATH) || defaultProfilesPath,
  
  // SQLite database for position tracking
  database: normalizeEnvPath(process.env.DATABASE_PATH) || `${defaultBasePath}/data/sst_tracking.db`
};

// Feature flags
export const features = {
  // Expansion mod support - set to false if not using DayZ Expansion
  expansionEnabled: process.env.EXPANSION_ENABLED !== '0' && process.env.EXPANSION_ENABLED !== 'false',
};

// Log configuration on startup (helpful for debugging)
export function logConfig() {
  console.log('[Config] Paths configured:');
  console.log(`  - Inventories: ${paths.inventories}`);
  console.log(`  - Events: ${paths.events}`);
  console.log(`  - Life Events: ${paths.lifeEvents}`);
  console.log(`  - Trades: ${paths.trades}`);
  console.log(`  - API: ${paths.api}`);
  console.log(`  - Mission: ${paths.missionFolder}`);
  console.log(`  - Types.xml: ${paths.typesXml || paths.missionFolder + '/db/types.xml'}`);
  if (features.expansionEnabled) {
    console.log(`  - Expansion Traders: ${paths.expansionTraders}`);
    console.log(`  - Expansion Market: ${paths.expansionMarket}`);
  } else {
    console.log(`  - Expansion: DISABLED`);
  }
  console.log(`  - Profiles: ${paths.profiles}`);
}

