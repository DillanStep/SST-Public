import "./appConfig.js";
import { existsSync } from "fs";
import { loadProviderConfig } from "./providerConfig.js";
import { getDefaultServerContext, getServerContext, setServerContexts } from "./serverContext.js";
import { listProfileEnvFiles, normalizeEnvProfileId, readEnvVars, resolveEnvPathForWrite } from "./utils/envFile.js";

const PROVIDER_SCOPED_ENV_KEYS = [
  "STORAGE_BACKEND",
  "HOST_PROVIDER",
  "FTP_HOST",
  "FTP_PORT",
  "FTP_USER",
  "FTP_PASSWORD",
  "FTP_SECURE",
  "FTP_ROOT",
  "SFTP_HOST",
  "SFTP_PORT",
  "SFTP_USER",
  "SFTP_PASSWORD",
  "SFTP_ROOT",
  "SST_PATH",
  "INVENTORIES_PATH",
  "EVENTS_PATH",
  "LIFE_EVENTS_PATH",
  "TRADES_PATH",
  "API_PATH",
  "ONLINE_PLAYERS_PATH",
  "ONLINE_PLAYERS_STALE_AFTER_MS",
  "AI_POSITIONS_PATH",
  "AI_POSITIONS_STALE_AFTER_MS",
  "EXPANSION_ENABLED",
  "EXPANSION_TRADERS_PATH",
  "EXPANSION_MARKET_PATH",
  "EXPANSION_ATM_PATH",
  "EXPANSION_AI_PATH",
  "EXPANSION_QUESTS_PATH",
  "MISSION_PATH",
  "TYPES_PATH",
  "MAP_PRESET",
  "MAP_LABEL",
  "MAP_IMAGE_URL",
  "MAP_WORLD_SIZE_X",
  "MAP_WORLD_SIZE_Z",
  "MAP_INVERT_X",
  "MAP_INVERT_Z",
  "PROFILES_PATH",
  "DATABASE_PATH",
  "POSITION_TRACKING_INTERVAL",
  "ARCHIVE_DB_PATH",
  "DISCORD_ENABLED",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "DISCORD_TICKET_CATEGORY_ID",
  "DISCORD_TICKET_PANEL_CHANNEL_ID",
  "DISCORD_STAFF_ROLE_ID",
  "DISCORD_LOG_CHANNEL_ID",
  "DISCORD_COMMAND_NAME",
  "DISCORD_TICKET_CHANNEL_PREFIX",
  "DISCORD_TICKET_DB_PATH",
];

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

function joinPosix(base, ...parts) {
  const cleanBase = normalizeEnvPath(base);
  const cleanParts = parts
    .map((part) => String(part || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);

  if (!cleanBase) return cleanParts.join("/");
  return [cleanBase, ...cleanParts].join("/");
}

function safeFileToken(value) {
  return String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

function pathExists(pathValue) {
  try {
    return Boolean(pathValue) && existsSync(pathValue);
  } catch {
    return false;
  }
}

function firstExistingPath(candidates) {
  return candidates.find(pathExists) || "";
}

function deriveExpansionBasePath(env, profilesPath = "") {
  const normalizedProfilesPath = normalizeEnvPath(profilesPath);
  if (normalizedProfilesPath) {
    return joinPosix(normalizedProfilesPath, "ExpansionMod");
  }

  const explicitBase =
    stripSuffix(env.EXPANSION_ATM_PATH, "/ATM") ||
    stripSuffix(env.EXPANSION_TRADERS_PATH, "/Traders") ||
    stripSuffix(env.EXPANSION_MARKET_PATH, "/Market") ||
    stripSuffix(env.EXPANSION_AI_PATH, "/AI") ||
    stripSuffix(env.EXPANSION_QUESTS_PATH, "/Quests");

  if (explicitBase) return explicitBase;

  return "./profiles/ExpansionMod";
}

function deriveSstBasePath(env) {
  const explicit = normalizeEnvPath(env.SST_PATH);
  if (explicit) return explicit;

  return (
    stripSuffix(env.INVENTORIES_PATH, "/inventories") ||
    stripSuffix(env.EVENTS_PATH, "/events") ||
    stripSuffix(env.LIFE_EVENTS_PATH, "/life_events") ||
    stripSuffix(env.TRADES_PATH, "/trades") ||
    stripSuffix(env.API_PATH, "/api") ||
    (() => {
      const onlinePlayers = normalizeEnvPath(env.ONLINE_PLAYERS_PATH);
      if (!onlinePlayers) return "";
      const apiDir = dirnamePosix(onlinePlayers);
      const base = stripSuffix(apiDir, "/api");
      return base || "";
    })() ||
    ""
  );
}

function deriveMissionPathFromSstPath(env) {
  const sstPath = deriveSstBasePath(env);
  const storageMatch = sstPath.match(/^(.*)\/storage_[^/]+\/SST$/i);
  return storageMatch ? storageMatch[1] : "";
}

function deriveProfilesPath(env, missionPath) {
  const explicit = normalizeEnvPath(env.PROFILES_PATH);
  if (explicit) return explicit;

  if ((env.STORAGE_BACKEND || "local").toLowerCase() !== "local") {
    return "";
  }

  const normalizedMissionPath = normalizeEnvPath(missionPath);
  const marker = "/mpmissions/";
  const markerIndex = normalizedMissionPath.toLowerCase().lastIndexOf(marker);
  if (markerIndex === -1) return "";

  const serverRoot = normalizedMissionPath.slice(0, markerIndex);
  return firstExistingPath([
    joinPosix(serverRoot, "Server1"),
    joinPosix(serverRoot, "profiles"),
    joinPosix(serverRoot, "profile"),
    joinPosix(serverRoot, "config"),
    joinPosix(serverRoot, "logs"),
  ]);
}

function applyEnvObject(target, obj) {
  if (!obj || typeof obj !== "object") return target;

  for (const [key, rawValue] of Object.entries(obj)) {
    if (rawValue === undefined || rawValue === null) continue;
    target[key] = typeof rawValue === "string" ? rawValue : String(rawValue);
  }

  return target;
}

function buildBaseProviderEnv(providerConfig) {
  const env = { ...process.env };

  for (const key of PROVIDER_SCOPED_ENV_KEYS) {
    delete env[key];
  }

  applyEnvObject(env, providerConfig?.env);
  return env;
}

function providerToEnv(providerName, providerConfig, provider) {
  const env = buildBaseProviderEnv(providerConfig);
  env.HOST_PROVIDER = providerName;

  if (provider?.backend) {
    env.STORAGE_BACKEND = String(provider.backend);
  }

  applyEnvObject(env, provider?.env);
  applyEnvObject(env, provider?.paths);

  if (provider?.ftp) {
    if (provider.ftp.host !== undefined) env.FTP_HOST = String(provider.ftp.host);
    if (provider.ftp.port !== undefined) env.FTP_PORT = String(provider.ftp.port);
    if (provider.ftp.username !== undefined) env.FTP_USER = String(provider.ftp.username);
    if (provider.ftp.user !== undefined) env.FTP_USER = String(provider.ftp.user);
    if (provider.ftp.password !== undefined) env.FTP_PASSWORD = String(provider.ftp.password);
    if (provider.ftp.secure !== undefined) env.FTP_SECURE = String(provider.ftp.secure);
    if (provider.ftp.root !== undefined) env.FTP_ROOT = String(provider.ftp.root);
  }

  if (provider?.sftp) {
    if (provider.sftp.host !== undefined) env.SFTP_HOST = String(provider.sftp.host);
    if (provider.sftp.port !== undefined) env.SFTP_PORT = String(provider.sftp.port);
    if (provider.sftp.username !== undefined) env.SFTP_USER = String(provider.sftp.username);
    if (provider.sftp.user !== undefined) env.SFTP_USER = String(provider.sftp.user);
    if (provider.sftp.password !== undefined) env.SFTP_PASSWORD = String(provider.sftp.password);
    if (provider.sftp.root !== undefined) env.SFTP_ROOT = String(provider.sftp.root);
  }

  return env;
}

function buildPaths(env) {
  const derivedBasePath = deriveSstBasePath(env);
  const defaultBasePath = derivedBasePath || "./profiles/SST";
  const defaultMissionPath = normalizeEnvPath(env.MISSION_PATH) || deriveMissionPathFromSstPath(env) || "./mpmissions/dayzOffline.chernarusplus";
  const profilesPathForExpansion = normalizeEnvPath(env.PROFILES_PATH) || deriveProfilesPath(env, defaultMissionPath);
  const defaultProfilesPath = profilesPathForExpansion || "./profiles";
  const defaultExpansionPath = deriveExpansionBasePath(env, profilesPathForExpansion);
  const expansionFromProfiles = Boolean(profilesPathForExpansion);
  const defaultDiscordTicketsDb = `./data/discord_tickets_${safeFileToken(env.SST_PROFILE_ID || env.HOST_PROVIDER || "default")}.db`;

  return {
    // SST base path
    sst: normalizeEnvPath(env.SST_PATH) || defaultBasePath,

    // SST paths
    inventories: normalizeEnvPath(env.INVENTORIES_PATH) || `${defaultBasePath}/inventories`,
    events: normalizeEnvPath(env.EVENTS_PATH) || `${defaultBasePath}/events`,
    lifeEvents: normalizeEnvPath(env.LIFE_EVENTS_PATH) || `${defaultBasePath}/life_events`,
    trades: normalizeEnvPath(env.TRADES_PATH) || `${defaultBasePath}/trades`,
    api: normalizeEnvPath(env.API_PATH) || `${defaultBasePath}/api`,
    onlinePlayers: normalizeEnvPath(env.ONLINE_PLAYERS_PATH) || (env.API_PATH ? `${normalizeEnvPath(env.API_PATH)}/online_players.json` : `${defaultBasePath}/api/online_players.json`),
    aiPositions: normalizeEnvPath(env.AI_POSITIONS_PATH) || (env.API_PATH ? `${normalizeEnvPath(env.API_PATH)}/ai_positions.json` : `${defaultBasePath}/api/ai_positions.json`),

    // Expansion paths
    expansionTraders: expansionFromProfiles ? `${defaultExpansionPath}/Traders` : normalizeEnvPath(env.EXPANSION_TRADERS_PATH) || `${defaultExpansionPath}/Traders`,
    expansionMarket: expansionFromProfiles ? `${defaultExpansionPath}/Market` : normalizeEnvPath(env.EXPANSION_MARKET_PATH) || `${defaultExpansionPath}/Market`,
    expansionAtm: expansionFromProfiles ? `${defaultExpansionPath}/ATM` : normalizeEnvPath(env.EXPANSION_ATM_PATH) || `${defaultExpansionPath}/ATM`,
    expansionAi: expansionFromProfiles ? `${defaultExpansionPath}/AI` : normalizeEnvPath(env.EXPANSION_AI_PATH) || `${defaultExpansionPath}/AI`,
    expansionQuests: expansionFromProfiles ? `${defaultExpansionPath}/Quests` : normalizeEnvPath(env.EXPANSION_QUESTS_PATH) || `${defaultExpansionPath}/Quests`,

    // Mission path (for trader zones and economy type files)
    missionFolder: normalizeEnvPath(env.MISSION_PATH) || defaultMissionPath,

    // Optional base types.xml override. cfgeconomycore.xml additions still load from the mission folder.
    typesXml: normalizeEnvPath(env.TYPES_PATH) || null,

    // Server profiles path (for logs)
    profiles: normalizeEnvPath(env.PROFILES_PATH) || defaultProfilesPath,

    // SQLite database for position tracking
    database: normalizeEnvPath(env.DATABASE_PATH) || `${defaultBasePath}/data/sst_tracking.db`,

    // Local SQLite database for Discord support tickets
    discordTickets: normalizeEnvPath(env.DISCORD_TICKET_DB_PATH) || defaultDiscordTicketsDb,
  };
}

function buildFeatures(env) {
  return {
    expansionEnabled: env.EXPANSION_ENABLED !== "0" && env.EXPANSION_ENABLED !== "false",
    discordEnabled: env.DISCORD_ENABLED === "1" || env.DISCORD_ENABLED === "true",
  };
}

function createRuntimeContext({ id, name, env, provider = null, aliases = [], isDefault = false, envPath = null }) {
  const runtimeEnv = { ...env };
  const runtimePaths = buildPaths(runtimeEnv);
  const runtimeFeatures = buildFeatures(runtimeEnv);
  const backend = (runtimeEnv.STORAGE_BACKEND || provider?.backend || "local").toLowerCase();

  return {
    id,
    name: name || id,
    label: name || id,
    aliases,
    env: runtimeEnv,
    paths: runtimePaths,
    features: runtimeFeatures,
    provider,
    backend,
    isDefault,
    envPath,
  };
}

function titleFromProfileId(profileId) {
  return String(profileId || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Server";
}

function profileEnvFileToContext(profileFile, providerConfig) {
  const profileEnv = readEnvVars(profileFile.path);
  const id = normalizeEnvProfileId(profileEnv.SST_PROFILE_ID || profileFile.id);
  const name = String(profileEnv.SST_PROFILE_NAME || "").trim() || titleFromProfileId(id);
  const env = buildBaseProviderEnv(providerConfig);

  env.HOST_PROVIDER = id;
  applyEnvObject(env, profileEnv);

  return createRuntimeContext({
    id,
    name,
    env,
    provider: {
      backend: profileEnv.STORAGE_BACKEND || "local",
      envPath: profileFile.path,
    },
    aliases: [profileFile.fileName, name],
    envPath: profileFile.path,
  });
}

function buildRuntimeContexts() {
  const providerConfig = loadProviderConfig();
  const activeProviderName = process.env.HOST_PROVIDER || providerConfig?.active || "default";
  const contexts = [];
  const usedIds = new Set();

  if (providerConfig?.providers && typeof providerConfig.providers === "object") {
    for (const [providerName, provider] of Object.entries(providerConfig.providers)) {
      const providerEnv = providerToEnv(providerName, providerConfig, provider);
      const context = createRuntimeContext({
        id: providerName,
        name: providerName,
        env: providerEnv,
        provider,
        aliases: provider?.aliases || [],
        isDefault: providerName === activeProviderName,
      });
      contexts.push(context);
      usedIds.add(context.id);
    }
  } else {
    const context = createRuntimeContext({
      id: "default",
      name: "Default",
      env: process.env,
      provider: null,
      envPath: resolveEnvPathForWrite(),
      isDefault: true,
    });
    contexts.push(context);
    usedIds.add(context.id);
  }

  for (const profileFile of listProfileEnvFiles()) {
    const context = profileEnvFileToContext(profileFile, providerConfig);
    if (usedIds.has(context.id)) continue;
    contexts.push(context);
    usedIds.add(context.id);
  }

  if (contexts.length === 0) {
    contexts.push(createRuntimeContext({
      id: "default",
      name: "Default",
      env: process.env,
      provider: null,
      envPath: resolveEnvPathForWrite(),
      isDefault: true,
    }));
  }

  return { contexts, activeProviderName };
}

let runtimeContexts = [];
let activeProviderName = "default";

export function reloadRuntimeContexts() {
  const nextRuntime = buildRuntimeContexts();
  runtimeContexts = nextRuntime.contexts;
  activeProviderName = nextRuntime.activeProviderName;
  setServerContexts(runtimeContexts, activeProviderName);
  return runtimeContexts;
}

reloadRuntimeContexts();

function currentContext() {
  const context = getServerContext();
  if (!context) {
    throw new Error("No SST server context is configured.");
  }
  return context;
}

export function getRuntimeEnv(key) {
  const context = currentContext();
  return context.env?.[key] ?? process.env[key] ?? "";
}

export function getRuntimeEnvSnapshot() {
  return { ...currentContext().env };
}

export function getRuntimeContext() {
  return currentContext();
}

export function getConfiguredServerProfiles() {
  const defaultId = getDefaultServerContext()?.id;
  return runtimeContexts.map((context) => ({
    id: context.id,
    name: context.name,
    backend: context.backend,
    isDefault: context.id === defaultId,
    aliases: context.aliases,
    envPath: context.envPath || null,
    paths: {
      sst: context.paths.sst,
      api: context.paths.api,
      onlinePlayers: context.paths.onlinePlayers,
      missionFolder: context.paths.missionFolder,
      profiles: context.paths.profiles,
      discordTickets: context.paths.discordTickets,
    },
  }));
}

export const paths = new Proxy({}, {
  get(_target, prop) {
    return currentContext().paths[prop];
  },
  ownKeys() {
    return Reflect.ownKeys(currentContext().paths);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const value = currentContext().paths[prop];
    if (value === undefined) return undefined;
    return { enumerable: true, configurable: true, value };
  },
});

export const features = new Proxy({}, {
  get(_target, prop) {
    return currentContext().features[prop];
  },
  ownKeys() {
    return Reflect.ownKeys(currentContext().features);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const value = currentContext().features[prop];
    if (value === undefined) return undefined;
    return { enumerable: true, configurable: true, value };
  },
});

// Log configuration on startup (helpful for debugging)
export function logConfig() {
  const context = currentContext();
  console.log(`[Config] Active profile: ${context.id} (${context.backend})`);
  console.log("[Config] Paths configured:");
  console.log(`  - Inventories: ${context.paths.inventories}`);
  console.log(`  - Events: ${context.paths.events}`);
  console.log(`  - Life Events: ${context.paths.lifeEvents}`);
  console.log(`  - Trades: ${context.paths.trades}`);
  console.log(`  - API: ${context.paths.api}`);
  console.log(`  - Mission: ${context.paths.missionFolder}`);
  console.log(`  - Base Types.xml: ${context.paths.typesXml || context.paths.missionFolder + "/db/types.xml"}`);
  console.log(`  - Economy Core: ${context.paths.missionFolder}/cfgeconomycore.xml`);
  if (context.features.expansionEnabled) {
    console.log(`  - Expansion Traders: ${context.paths.expansionTraders}`);
    console.log(`  - Expansion Market: ${context.paths.expansionMarket}`);
    console.log(`  - Expansion ATM: ${context.paths.expansionAtm}`);
    console.log(`  - Expansion AI: ${context.paths.expansionAi}`);
    console.log(`  - Expansion Quests: ${context.paths.expansionQuests}`);
  } else {
    console.log("  - Expansion: DISABLED");
  }
  console.log(`  - Profiles: ${context.paths.profiles}`);
  if (context.features.discordEnabled) {
    console.log(`  - Discord Tickets DB: ${context.paths.discordTickets}`);
  }

  if (runtimeContexts.length > 1) {
    console.log(`[Config] Server profiles loaded: ${runtimeContexts.map((item) => item.id).join(", ")}`);
  }
}
