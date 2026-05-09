import "./appConfig.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "path";
import { homedir, platform } from "os";
import { fileURLToPath } from "url";
import { stat, getStorageBackend } from "./storage/fs.js";

import { requireApiKey, getApiKey, getApiKeyMeta } from "./middleware/auth.js";
import { positionDb } from "./db/database.js";
import { initArchiveDb, scheduleArchive } from "./db/archiveDb.js";
import {
  getConfiguredServerProfiles,
  getRuntimeContext,
  getRuntimeEnvSnapshot,
  paths,
  features,
  logConfig,
  reloadRuntimeContexts,
} from "./config.js";
import { getAllServerContexts, runWithServerContext, serverContextMiddleware } from "./serverContext.js";
import { initAuthDb } from "./auth/authDb.js";
import { userOps } from "./auth/authDb.js";
import { requireAuth, requireAdmin } from "./auth/authMiddleware.js";
import authRoutes from "./auth/authRoutes.js";
import userRoutes from "./auth/userRoutes.js";
import setupRoutes from "./routes/setup.js";
import { consoleUi } from "./utils/consoleUi.js";
import inventoryRoutes from "./routes/inventory.js";
import eventRoutes from "./routes/events.js";
import lifeEventRoutes from "./routes/life-events.js";
import tradeRoutes from "./routes/trades.js";
import economyRoutes from "./routes/economy.js";
import grantRoutes from "./routes/grants.js";
import dashboardRoutes from "./routes/dashboard.js";
import itemsRoutes from "./routes/items.js";
import onlineRoutes from "./routes/online.js";
import aiRoutes from "./routes/ai.js";
import commandRoutes from "./routes/commands.js";
import expansionAtmRoutes from "./routes/expansionAtm.js";
import expansionQuestsRoutes from "./routes/expansionQuests.js";
import expansionRoutes from "./routes/expansion.js";
import logsRoutes from "./routes/logs.js";
import positionsRoutes from "./routes/positions.js";
import archiveRoutes from "./routes/archive.js";
import vehiclesRoutes from "./routes/vehicles.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import updateRoutes from "./routes/updates.js";
import discordRoutes from "./routes/discord.js";
import { listProfileEnvFiles, normalizeEnvProfileId, readEnvVars, resolveEnvPathForWrite, upsertEnvVar } from "./utils/envFile.js";
import { buildMapConfig, detectMapPresetFromMissionPath, getBuiltinMaps } from "./utils/mapConfig.js";
import { getOnlinePlayersSnapshot } from "./utils/onlinePlayers.js";
import { startModActivityMonitor } from "./utils/modActivityMonitor.js";
import { startDiscordBots } from "./services/discordBot.js";

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0"; // Listen on all interfaces

const CONFIG_ENV_KEYS = [
  "PORT",
  "HOST",
  "STORAGE_BACKEND",
  "SST_API_PROVIDER_CONFIG",
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
  "API_KEY",
  "JWT_SECRET",
  "SST_AUTO_CREATE_ADMIN",
  "INITIAL_ADMIN_USERNAME",
  "INITIAL_ADMIN_PASSWORD",
  "CORS_ORIGIN",
  "SST_DISABLE_UPDATE_CHECK",
  "SST_UPDATE_REPO",
  "SST_ALLOW_REMOTE_UPDATE",
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
  "AUTH_DB_PATH",
  "DATABASE_PATH",
  "POSITION_TRACKING_INTERVAL",
  "ARCHIVE_HOUR",
  "ARCHIVE_MINUTE",
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

const CONFIG_ENV_KEY_SET = new Set(CONFIG_ENV_KEYS);
const PROFILE_SCOPED_ENV_KEYS = new Set([
  "STORAGE_BACKEND",
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
]);
const PATH_ENV_KEYS = new Set([
  "SST_API_PROVIDER_CONFIG",
  "FTP_ROOT",
  "SFTP_ROOT",
  "SST_PATH",
  "INVENTORIES_PATH",
  "EVENTS_PATH",
  "LIFE_EVENTS_PATH",
  "TRADES_PATH",
  "API_PATH",
  "ONLINE_PLAYERS_PATH",
  "AI_POSITIONS_PATH",
  "EXPANSION_TRADERS_PATH",
  "EXPANSION_MARKET_PATH",
  "EXPANSION_ATM_PATH",
  "EXPANSION_AI_PATH",
  "EXPANSION_QUESTS_PATH",
  "MISSION_PATH",
  "TYPES_PATH",
  "PROFILES_PATH",
  "AUTH_DB_PATH",
  "DATABASE_PATH",
  "ARCHIVE_DB_PATH",
  "DISCORD_TICKET_DB_PATH",
]);

const NUMBER_ENV_KEYS = new Set([
  "PORT",
  "FTP_PORT",
  "SFTP_PORT",
  "POSITION_TRACKING_INTERVAL",
  "ONLINE_PLAYERS_STALE_AFTER_MS",
  "AI_POSITIONS_STALE_AFTER_MS",
  "ARCHIVE_HOUR",
  "ARCHIVE_MINUTE",
  "MAP_WORLD_SIZE_X",
  "MAP_WORLD_SIZE_Z",
]);

const DISCORD_ID_ENV_KEYS = new Set([
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "DISCORD_TICKET_CATEGORY_ID",
  "DISCORD_TICKET_PANEL_CHANNEL_ID",
  "DISCORD_STAFF_ROLE_ID",
  "DISCORD_LOG_CHANNEL_ID",
]);

const DISCORD_REUSABLE_ENV_KEYS = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "DISCORD_TICKET_CATEGORY_ID",
  "DISCORD_TICKET_PANEL_CHANNEL_ID",
  "DISCORD_STAFF_ROLE_ID",
  "DISCORD_LOG_CHANNEL_ID",
  "DISCORD_COMMAND_NAME",
  "DISCORD_TICKET_CHANNEL_PREFIX",
];

function normalizeConfigPath(value) {
  if (!value) return "";
  return String(value).trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function joinConfigPath(base, ...parts) {
  const cleanBase = normalizeConfigPath(base);
  const cleanParts = parts
    .map((part) => String(part || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);

  if (!cleanBase) return cleanParts.join("/");
  return [cleanBase, ...cleanParts].join("/");
}

function dirnameConfigPath(value) {
  const normalized = normalizeConfigPath(value);
  if (!normalized) return "";
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized.startsWith("/") ? "/" : "";
  return normalized.slice(0, idx);
}

function safeConfigFileToken(value) {
  return String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

function normalizeDiscordId(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const matches = text.match(/\d{16,22}/g);
  return matches?.[matches.length - 1] || text;
}

function pathExists(value) {
  try {
    return Boolean(value) && existsSync(value);
  } catch {
    return false;
  }
}

function firstExistingPath(candidates) {
  return candidates.find(pathExists) || "";
}

function addSuggestion(suggestions, key, value) {
  const normalized = PATH_ENV_KEYS.has(key) ? normalizeConfigPath(value) : String(value ?? "").trim();
  if (normalized) {
    suggestions[key] = normalized;
  }
}

function collectReusableDiscordSettings(activeEnvPath = "") {
  const candidates = [];
  const seenPaths = new Set();

  const addEnvFile = (filePath) => {
    if (!filePath || seenPaths.has(filePath)) return;
    seenPaths.add(filePath);
    candidates.push(readEnvVars(filePath));
  };

  const globalEnvPath = resolveEnvPathForWrite();
  addEnvFile(globalEnvPath);

  for (const profileFile of listProfileEnvFiles()) {
    if (profileFile.path === activeEnvPath) continue;
    addEnvFile(profileFile.path);
  }

  const reusable = {};
  for (const key of DISCORD_REUSABLE_ENV_KEYS) {
    for (const candidate of candidates) {
      const value = String(candidate?.[key] ?? "").trim();
      if (value) {
        reusable[key] = value;
        break;
      }
    }
  }

  return reusable;
}

function buildConfigSuggestions(env) {
  const suggestions = {
    PORT: "3001",
    HOST: "0.0.0.0",
    STORAGE_BACKEND: env.STORAGE_BACKEND || "local",
    FTP_PORT: "21",
    FTP_SECURE: "true",
    FTP_ROOT: "/",
    SFTP_PORT: "22",
    SFTP_ROOT: "/",
    SST_AUTO_CREATE_ADMIN: "0",
    SST_DISABLE_UPDATE_CHECK: "0",
    SST_UPDATE_REPO: "DillanStep/SST-Public",
    SST_ALLOW_REMOTE_UPDATE: "0",
    POSITION_TRACKING_INTERVAL: "30000",
    ONLINE_PLAYERS_STALE_AFTER_MS: "120000",
    AI_POSITIONS_STALE_AFTER_MS: "120000",
    ARCHIVE_HOUR: "4",
    ARCHIVE_MINUTE: "0",
    MAP_INVERT_X: "0",
    MAP_INVERT_Z: "0",
    DISCORD_ENABLED: "0",
    DISCORD_COMMAND_NAME: "ticket",
    DISCORD_TICKET_CHANNEL_PREFIX: "ticket",
  };

  const sstPath = normalizeConfigPath(env.SST_PATH || paths.sst);
  if (sstPath) {
    addSuggestion(suggestions, "SST_PATH", sstPath);
    addSuggestion(suggestions, "INVENTORIES_PATH", joinConfigPath(sstPath, "inventories"));
    addSuggestion(suggestions, "EVENTS_PATH", joinConfigPath(sstPath, "events"));
    addSuggestion(suggestions, "LIFE_EVENTS_PATH", joinConfigPath(sstPath, "life_events"));
    addSuggestion(suggestions, "TRADES_PATH", joinConfigPath(sstPath, "trades"));
    addSuggestion(suggestions, "API_PATH", joinConfigPath(sstPath, "api"));
    addSuggestion(suggestions, "ONLINE_PLAYERS_PATH", joinConfigPath(sstPath, "api", "online_players.json"));
    addSuggestion(suggestions, "AI_POSITIONS_PATH", joinConfigPath(sstPath, "api", "ai_positions.json"));
    addSuggestion(suggestions, "DATABASE_PATH", joinConfigPath(sstPath, "data", "sst_tracking.db"));
  }

  const storageMatch = sstPath.match(/^(.*)\/storage_[^/]+\/SST$/i);
  const missionPath = normalizeConfigPath(env.MISSION_PATH) || (storageMatch ? storageMatch[1] : "");
  if (missionPath) {
    addSuggestion(suggestions, "MISSION_PATH", missionPath);
    if (env.TYPES_PATH) {
      addSuggestion(suggestions, "TYPES_PATH", normalizeConfigPath(env.TYPES_PATH));
    }
  }

  const mapPreset = (env.MAP_PRESET || (missionPath ? detectMapPresetFromMissionPath(missionPath) : "chernarusplus"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const mapDefaults = getBuiltinMaps().find((map) => map.id === mapPreset) || getBuiltinMaps()[0];
  addSuggestion(suggestions, "MAP_PRESET", mapDefaults.id);
  addSuggestion(suggestions, "MAP_IMAGE_URL", mapDefaults.imageUrl);
  addSuggestion(suggestions, "MAP_WORLD_SIZE_X", String(mapDefaults.worldSizeX));
  addSuggestion(suggestions, "MAP_WORLD_SIZE_Z", String(mapDefaults.worldSizeZ));

  const serverRoot = missionPath.toLowerCase().includes("/mpmissions/")
    ? missionPath.slice(0, missionPath.toLowerCase().lastIndexOf("/mpmissions/"))
    : "";

  let profilesPath = normalizeConfigPath(env.PROFILES_PATH);
  if (!profilesPath && serverRoot && (env.STORAGE_BACKEND || "local") === "local") {
    profilesPath = firstExistingPath([
      joinConfigPath(serverRoot, "Server1"),
      joinConfigPath(serverRoot, "profiles"),
      joinConfigPath(serverRoot, "profile"),
      joinConfigPath(serverRoot, "config"),
      joinConfigPath(serverRoot, "logs"),
    ]);
  }
  if (profilesPath) {
    addSuggestion(suggestions, "PROFILES_PATH", profilesPath);
  }

  const expansionBase = (() => {
    if (profilesPath) return joinConfigPath(profilesPath, "ExpansionMod");

    const expansionAtmPath = normalizeConfigPath(env.EXPANSION_ATM_PATH);
    const expansionTradersPath = normalizeConfigPath(env.EXPANSION_TRADERS_PATH);
    const expansionMarketPath = normalizeConfigPath(env.EXPANSION_MARKET_PATH);
    const expansionAiPath = normalizeConfigPath(env.EXPANSION_AI_PATH);
    const expansionQuestsPath = normalizeConfigPath(env.EXPANSION_QUESTS_PATH);

    if (expansionAtmPath) return dirnameConfigPath(expansionAtmPath);
    if (expansionTradersPath) return dirnameConfigPath(expansionTradersPath);
    if (expansionMarketPath) return dirnameConfigPath(expansionMarketPath);
    if (expansionAiPath) return dirnameConfigPath(expansionAiPath);
    if (expansionQuestsPath) return dirnameConfigPath(expansionQuestsPath);
    if (serverRoot) {
      return firstExistingPath([
        joinConfigPath(serverRoot, "Server1", "ExpansionMod"),
        joinConfigPath(serverRoot, "profiles", "ExpansionMod"),
      ]);
    }

    return "";
  })();

  const expansionTraders = profilesPath && expansionBase
    ? joinConfigPath(expansionBase, "Traders")
    : normalizeConfigPath(env.EXPANSION_TRADERS_PATH) || (expansionBase ? joinConfigPath(expansionBase, "Traders") : "");
  const expansionMarket = profilesPath && expansionBase
    ? joinConfigPath(expansionBase, "Market")
    : normalizeConfigPath(env.EXPANSION_MARKET_PATH) || (expansionBase ? joinConfigPath(expansionBase, "Market") : "");
  const expansionAtm = profilesPath && expansionBase
    ? joinConfigPath(expansionBase, "ATM")
    : normalizeConfigPath(env.EXPANSION_ATM_PATH) || (expansionBase ? joinConfigPath(expansionBase, "ATM") : "");
  const expansionAi = profilesPath && expansionBase
    ? joinConfigPath(expansionBase, "AI")
    : normalizeConfigPath(env.EXPANSION_AI_PATH) || (expansionBase ? joinConfigPath(expansionBase, "AI") : "");
  const expansionQuests = profilesPath && expansionBase
    ? joinConfigPath(expansionBase, "Quests")
    : normalizeConfigPath(env.EXPANSION_QUESTS_PATH) || (expansionBase ? joinConfigPath(expansionBase, "Quests") : "");
  if (expansionTraders) {
    addSuggestion(suggestions, "EXPANSION_TRADERS_PATH", expansionTraders);
  }
  if (expansionMarket) {
    addSuggestion(suggestions, "EXPANSION_MARKET_PATH", expansionMarket);
  }
  if (expansionAtm) {
    addSuggestion(suggestions, "EXPANSION_ATM_PATH", expansionAtm);
  }
  if (expansionAi) {
    addSuggestion(suggestions, "EXPANSION_AI_PATH", expansionAi);
  }
  if (expansionQuests) {
    addSuggestion(suggestions, "EXPANSION_QUESTS_PATH", expansionQuests);
  }

  suggestions.EXPANSION_ENABLED = env.EXPANSION_ENABLED || (pathExists(expansionTraders) || pathExists(expansionMarket) || pathExists(expansionAtm) || pathExists(expansionAi) || pathExists(expansionQuests) ? "1" : "0");

  if (!env.ARCHIVE_DB_PATH) {
    addSuggestion(suggestions, "ARCHIVE_DB_PATH", normalizeConfigPath(join(__dirname, "..", "data", "archive.db")));
  }
  if (!env.AUTH_DB_PATH) {
    addSuggestion(suggestions, "AUTH_DB_PATH", normalizeConfigPath(join(__dirname, "..", "data", "auth.db")));
  }
  if (!env.DISCORD_TICKET_DB_PATH) {
    const profileToken = safeConfigFileToken(env.SST_PROFILE_ID || env.HOST_PROVIDER || getRuntimeContext().id || "default");
    addSuggestion(suggestions, "DISCORD_TICKET_DB_PATH", normalizeConfigPath(join(__dirname, "..", "data", `discord_tickets_${profileToken}.db`)));
  }

  const reusableDiscord = collectReusableDiscordSettings(getRuntimeContext().envPath);
  for (const key of DISCORD_REUSABLE_ENV_KEYS) {
    if (!String(env[key] ?? "").trim() && reusableDiscord[key]) {
      addSuggestion(suggestions, key, reusableDiscord[key]);
    }
  }

  return suggestions;
}

function normalizeEnvSetting(key, value) {
  const raw = value === undefined || value === null ? "" : String(value);
  let normalized = raw.replace(/[\r\n]/g, "").trim();

  if (key === "STORAGE_BACKEND") {
    normalized = normalized.toLowerCase();
    if (normalized && !["local", "ftp", "sftp"].includes(normalized)) {
      throw new Error("STORAGE_BACKEND must be local, ftp, or sftp.");
    }
  }

  if (key === "MAP_PRESET") {
    normalized = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const validPresets = new Set(getBuiltinMaps().map((map) => map.id));
    if (normalized && !validPresets.has(normalized)) {
      throw new Error(`MAP_PRESET must be one of: ${[...validPresets].join(", ")}.`);
    }
  }

  if (NUMBER_ENV_KEYS.has(key) && normalized && !/^\d+$/.test(normalized)) {
    throw new Error(`${key} must be a whole number.`);
  }

  if (DISCORD_ID_ENV_KEYS.has(key)) {
    normalized = normalizeDiscordId(normalized);
    if (normalized && !/^\d{16,22}$/.test(normalized)) {
      throw new Error(`${key} must be a Discord numeric ID. Right-click in Discord and use Copy ID, or paste a Discord link.`);
    }
  }

  if (PATH_ENV_KEYS.has(key)) {
    normalized = normalized.replace(/\\/g, "/").replace(/\/+$/, "");
    if ((key === "FTP_ROOT" || key === "SFTP_ROOT") && !normalized) {
      normalized = "/";
    }
  }

  return normalized;
}

function getConfigEnvSnapshot() {
  const runtimeContext = getRuntimeContext();
  const globalEnvPath = resolveEnvPathForWrite();
  const envPath = runtimeContext.envPath || globalEnvPath;
  const profileFileVars = readEnvVars(envPath);
  const globalFileVars = envPath === globalEnvPath ? profileFileVars : readEnvVars(globalEnvPath);
  const runtimeEnv = getRuntimeEnvSnapshot();
  const env = {};

  for (const key of CONFIG_ENV_KEYS) {
    if (runtimeContext.envPath && PROFILE_SCOPED_ENV_KEYS.has(key)) {
      env[key] = profileFileVars[key] ?? runtimeEnv[key] ?? "";
      continue;
    }

    env[key] = globalFileVars[key] ?? runtimeEnv[key] ?? process.env[key] ?? "";
  }

  if (!env.API_KEY) {
    env.API_KEY = getApiKey();
  }

  return { envPath, globalEnvPath, env };
}

// Configure CORS to allow requests from any origin (or specify your dashboard URL)
const corsOptions = {
  origin: process.env.CORS_ORIGIN || true, // Set CORS_ORIGIN in .env for production
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-SST-Server", "X-SST-Provider"],
  credentials: true, // Important for cookies
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Serve static web client from ../web/dist if it exists (production build)
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDistPath = join(__dirname, "../../web/dist");
const webIndexPath = join(webDistPath, "index.html");

function setWebStaticCacheHeaders(res, assetPath) {
  const normalizedPath = assetPath.replace(/\\/g, "/");

  if (normalizedPath.endsWith("/index.html")) {
    res.setHeader("Cache-Control", "no-store");
    return;
  }

  if (normalizedPath.includes("/assets/")) {
    res.setHeader("Cache-Control", "no-cache");
  }
}

function sendWebIndex(req, res, next) {
  if (!existsSync(webIndexPath)) {
    return next();
  }

  res.setHeader("Cache-Control", "no-store");
  return res.sendFile(webIndexPath);
}

function commonPrefixLength(first, second) {
  const maxLength = Math.min(first.length, second.length);
  let length = 0;

  while (length < maxLength && first[length] === second[length]) {
    length += 1;
  }

  return length;
}

function findCurrentHashedAsset(requestedFile) {
  const match = /^(.+)\.(js|css)$/.exec(requestedFile);
  if (!match) return null;

  const assetsPath = join(webDistPath, "assets");
  if (!existsSync(assetsPath)) return null;

  const [, requestedBase, extension] = match;
  const suffix = `.${extension}`;

  const candidates = readdirSync(assetsPath)
    .filter((fileName) => fileName.endsWith(suffix))
    .map((fileName) => {
      const fullPath = join(assetsPath, fileName);
      const score = commonPrefixLength(requestedBase, fileName.slice(0, -suffix.length));

      return {
        fullPath,
        score,
        modifiedAt: statSync(fullPath).mtimeMs,
      };
    })
    .filter((candidate) => candidate.score > 0 && requestedBase.slice(0, candidate.score).includes("-"))
    .sort((a, b) => b.score - a.score || b.modifiedAt - a.modifiedAt);

  return candidates[0]?.fullPath || null;
}

function sendWebAssetFallback(req, res) {
  const requestedFile = basename(req.params[0] || "");
  const replacementPath = findCurrentHashedAsset(requestedFile);

  if (replacementPath) {
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(replacementPath);
  }

  return res
    .status(404)
    .type("text/plain")
    .send("Web asset not found. Rebuild apps/web and restart the SST API.");
}

if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath, {
    index: false,
    setHeaders: setWebStaticCacheHeaders,
  }));
  app.get("/", sendWebIndex);
  app.get("/assets/*", sendWebAssetFallback);
} else {
  console.warn(`[Web] Built dashboard not found at ${webDistPath}. Run the web build before using the API server as the dashboard host.`);
}

function getBundledModInfo() {
  const candidates = [
    resolve(__dirname, "../../..", "dayz", "server-mod", "@SST"),
    resolve(__dirname, "../../..", "@SST"),
  ];
  const modPath = candidates.find((candidate) => existsSync(join(candidate, "Addons", "SST.pbo"))) || candidates[0];
  const pboPath = join(modPath, "Addons", "SST.pbo");
  const exists = existsSync(modPath) && existsSync(pboPath);
  const pboSize = exists ? statSync(pboPath).size : 0;

  return {
    name: "@SST",
    path: modPath,
    exists,
    pboPath,
    pboSize,
    launchParameter: "-serverMod=@SST",
  };
}

function isPathInside(childPath, parentPath) {
  const rel = relative(parentPath, childPath);
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}

function getLocalBrowseRoots() {
  if (platform() === "win32") {
    const roots = [];
    for (let code = 67; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:/`;
      if (existsSync(drive)) {
        roots.push({ name: drive, path: drive, type: "directory" });
      }
    }
    return roots;
  }

  return [{ name: "/", path: "/", type: "directory" }];
}

function normalizeBrowsePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-zA-Z]:$/.test(raw)) return `${raw}/`;
  return raw.replace(/\\/g, "/");
}

function resolveBrowseStartPath(rawPath) {
  const requested = normalizeBrowsePath(rawPath);
  const fallbacks = [
    requested,
    requested ? dirname(requested) : "",
    paths.sst,
    paths.missionFolder,
    homedir(),
    process.cwd(),
  ].filter(Boolean);

  for (const candidate of fallbacks) {
    try {
      const resolved = resolve(candidate);
      const candidateStat = statSync(resolved);
      return candidateStat.isDirectory() ? resolved : dirname(resolved);
    } catch {
      // Try the next fallback.
    }
  }

  return "";
}

function getParentBrowsePath(currentPath) {
  const parentPath = dirname(currentPath);
  return parentPath && parentPath !== currentPath ? parentPath : "";
}

function listBrowseEntries(currentPath, mode) {
  const entries = readdirSync(currentPath, { withFileTypes: true })
    .map((entry) => {
      const entryPath = join(currentPath, entry.name);
      const isDirectory = entry.isDirectory();
      const isFile = entry.isFile();

      if (!isDirectory && mode === "folder") {
        return null;
      }

      if (!isDirectory && !isFile) {
        return null;
      }

      try {
        const entryStat = statSync(entryPath);
        return {
          name: entry.name,
          path: entryPath,
          type: isDirectory ? "directory" : "file",
          size: isFile ? entryStat.size : null,
          modifiedAt: entryStat.mtime instanceof Date ? entryStat.mtime.toISOString() : null,
        };
      } catch {
        return {
          name: entry.name,
          path: entryPath,
          type: isDirectory ? "directory" : "file",
          size: null,
          modifiedAt: null,
        };
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return entries.slice(0, 500);
}

function getEnvWritePathForKey(key, runtimeContext) {
  if (runtimeContext?.envPath && PROFILE_SCOPED_ENV_KEYS.has(key)) {
    return runtimeContext.envPath;
  }

  return resolveEnvPathForWrite();
}

function describeEnvFiles(pathsToDescribe) {
  return [...new Set(pathsToDescribe)].map((filePath) => basename(filePath)).join(", ");
}

function upsertIfPresent(envPath, key, value) {
  const rawValue = value === undefined || value === null ? "" : String(value).trim();
  if (!rawValue) return false;
  upsertEnvVar(envPath, key, rawValue);
  return true;
}

// Health check - no auth required
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.post("/servers/profiles", requireApiKey, requireAuth, requireAdmin, (req, res) => {
  const serverName = String(req.body?.name || req.body?.serverName || "").trim();
  const profileId = normalizeEnvProfileId(req.body?.profile || serverName, "");

  if (!serverName) {
    return res.status(400).json({ error: "Server name is required." });
  }

  if (!profileId) {
    return res.status(400).json({ error: "API profile is required." });
  }

  const envPath = resolveEnvPathForWrite(profileId);

  try {
    upsertEnvVar(envPath, "SST_PROFILE_ID", profileId);
    upsertEnvVar(envPath, "SST_PROFILE_NAME", serverName);
    upsertEnvVar(envPath, "STORAGE_BACKEND", String(req.body?.storageBackend || "local"));

    upsertIfPresent(envPath, "MAP_PRESET", req.body?.mapPreset);
    upsertIfPresent(envPath, "MAP_LABEL", req.body?.mapLabel);
    upsertIfPresent(envPath, "MAP_IMAGE_URL", req.body?.mapImageUrl);
    upsertIfPresent(envPath, "MAP_WORLD_SIZE_X", req.body?.mapWorldSizeX);
    upsertIfPresent(envPath, "MAP_WORLD_SIZE_Z", req.body?.mapWorldSizeZ);

    if (req.body?.mapInvertX !== undefined) {
      upsertEnvVar(envPath, "MAP_INVERT_X", req.body.mapInvertX ? "1" : "0");
    }

    if (req.body?.mapInvertZ !== undefined) {
      upsertEnvVar(envPath, "MAP_INVERT_Z", req.body.mapInvertZ ? "1" : "0");
    }

    reloadRuntimeContexts();

    res.json({
      ok: true,
      profile: {
        id: profileId,
        name: serverName,
        envPath,
      },
      profiles: getConfiguredServerProfiles(),
      message: `Created ${basename(envPath)} for ${serverName}.`,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to create server profile",
      details: err?.message || String(err),
    });
  }
});

app.use(serverContextMiddleware);

app.get("/servers", requireApiKey, (req, res) => {
  res.json({
    active: getRuntimeContext().id,
    profiles: getConfiguredServerProfiles(),
  });
});

function isLocalRequest(req) {
  const ip = String(req.ip || "");
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function maybeRequireApiKey(req, res, next) {
  // During first-run setup (no users), allow localhost to access setup/auth endpoints
  // without an API key so the dashboard can guide the user.
  try {
    if (isLocalRequest(req) && userOps.count() === 0) {
      return next();
    }
  } catch {
    // fall through to normal auth
  }
  return requireApiKey(req, res, next);
}

// First-run environment setup (localhost only, only when no users exist)
app.use("/setup", setupRoutes);

// Config check - admin only, shows configured paths
app.get("/config", requireApiKey, requireAuth, requireAdmin, (req, res) => {
  const backend = getStorageBackend();
  const runtimeContext = getRuntimeContext();
  const { envPath, env } = getConfigEnvSnapshot();
  const suggestions = buildConfigSuggestions(env);

  const response = {
    envPath,
    profile: runtimeContext.id,
    env,
    suggestions,
    storage: {
      backend,
      // Helpful non-secret hints for remote backends
      sftp: backend === "sftp" ? {
        host: env.SFTP_HOST || null,
        port: env.SFTP_PORT ? Number(env.SFTP_PORT) : null,
        root: env.SFTP_ROOT || null,
        user: env.SFTP_USER || null,
      } : null,
      ftp: backend === "ftp" || backend === "ftps" ? {
        host: env.FTP_HOST || null,
        port: env.FTP_PORT ? Number(env.FTP_PORT) : null,
        root: env.FTP_ROOT || null,
        user: env.FTP_USER || null,
        secure: typeof env.FTP_SECURE === "string" ? env.FTP_SECURE : null,
      } : null,
    },
    map: buildMapConfig({ env, missionPath: paths.missionFolder }),
    mod: getBundledModInfo(),
    paths: {
      inventories: paths.inventories,
      events: paths.events,
      lifeEvents: paths.lifeEvents,
      trades: paths.trades,
      api: paths.api,
      onlinePlayers: paths.onlinePlayers,
      expansionTraders: features.expansionEnabled ? paths.expansionTraders : null,
      expansionMarket: features.expansionEnabled ? paths.expansionMarket : null,
      expansionAtm: features.expansionEnabled ? paths.expansionAtm : null,
      expansionAi: features.expansionEnabled ? paths.expansionAi : null,
      missionFolder: paths.missionFolder,
      typesXml: paths.typesXml || `${paths.missionFolder}/db/types.xml`,
      profiles: paths.profiles,
      database: paths.database,
      discordTickets: paths.discordTickets,
    },
    features: {
      expansionEnabled: features.expansionEnabled,
      discordEnabled: features.discordEnabled,
    },
    checks: {
      onlinePlayers: { path: paths.onlinePlayers, ok: false, stat: null, error: null },
      apiDir: { path: paths.api, ok: false, stat: null, error: null },
    },
    server: {
      port: PORT,
      host: HOST,
      profile: runtimeContext.id,
      profiles: getConfiguredServerProfiles(),
    },
  };

  // Run lightweight checks (best effort) so you can confirm SFTP/FTP paths quickly.
  Promise.allSettled([
    stat(paths.onlinePlayers),
    stat(paths.api),
  ]).then((results) => {
    const [onlineStat, apiStat] = results;

    if (onlineStat.status === "fulfilled") {
      response.checks.onlinePlayers.ok = true;
      response.checks.onlinePlayers.stat = onlineStat.value;
    } else {
      response.checks.onlinePlayers.error = String(onlineStat.reason?.message || onlineStat.reason);
    }

    if (apiStat.status === "fulfilled") {
      response.checks.apiDir.ok = true;
      response.checks.apiDir.stat = apiStat.value;
    } else {
      response.checks.apiDir.error = String(apiStat.reason?.message || apiStat.reason);
    }

    res.json(response);
  });
});

app.get("/config/browse", requireApiKey, requireAuth, requireAdmin, (req, res) => {
  if (!isLocalRequest(req) && process.env.SST_ALLOW_REMOTE_UPDATE !== "1") {
    return res.status(403).json({ error: "Path browsing is only available from localhost." });
  }

  const mode = req.query.mode === "file" ? "file" : "folder";
  const roots = getLocalBrowseRoots();
  const requestedPath = normalizeBrowsePath(req.query.path);
  const currentPath = resolveBrowseStartPath(requestedPath);

  if (!currentPath) {
    return res.json({
      mode,
      requestedPath,
      currentPath: "",
      parentPath: "",
      roots,
      entries: roots,
    });
  }

  try {
    res.json({
      mode,
      requestedPath,
      currentPath,
      parentPath: getParentBrowsePath(currentPath),
      roots,
      entries: listBrowseEntries(currentPath, mode),
    });
  } catch (err) {
    res.status(400).json({
      error: "Failed to browse path",
      details: err?.message || String(err),
      mode,
      requestedPath,
      currentPath,
      parentPath: getParentBrowsePath(currentPath),
      roots,
      entries: [],
    });
  }
});

app.get("/mod", requireApiKey, requireAuth, requireAdmin, (req, res) => {
  res.json(getBundledModInfo());
});

app.post("/mod/copy", requireApiKey, requireAuth, requireAdmin, (req, res) => {
  if (!isLocalRequest(req) && process.env.SST_ALLOW_REMOTE_UPDATE !== "1") {
    return res.status(403).json({ error: "Mod copy is only allowed from localhost." });
  }

  const destination = String(req.body?.destination || "").trim();
  if (!destination) {
    return res.status(400).json({ error: "destination is required" });
  }

  const modInfo = getBundledModInfo();
  if (!modInfo.exists) {
    return res.status(404).json({ error: "@SST mod folder was not found", path: modInfo.path });
  }

  try {
    const destinationRoot = resolve(destination);
    const targetPath = basename(destinationRoot).toLowerCase() === "@sst"
      ? destinationRoot
      : join(destinationRoot, "@SST");

    if (
      targetPath.toLowerCase() === modInfo.path.toLowerCase()
      || isPathInside(targetPath, modInfo.path)
    ) {
      return res.status(400).json({ error: "Choose a destination outside the bundled @SST folder." });
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(modInfo.path, targetPath, { recursive: true, force: true, errorOnExist: false });

    res.json({
      sourcePath: modInfo.path,
      destinationPath: targetPath,
      message: `Copied @SST to ${targetPath}`,
    });
  } catch (err) {
    res.status(400).json({ error: "Failed to copy @SST mod", details: err?.message || String(err) });
  }
});

app.get("/map/config", requireAuth, requireApiKey, (req, res) => {
  const { env } = getConfigEnvSnapshot();
  res.json(buildMapConfig({ env, missionPath: paths.missionFolder }));
});

app.put("/config", requireApiKey, requireAuth, requireAdmin, (req, res) => {
  const updates = req.body?.env;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return res.status(400).json({ error: "env object is required" });
  }

  const runtimeContext = getRuntimeContext();
  const { envPath, env: currentEnv } = getConfigEnvSnapshot();
  const updated = [];
  const updatedEnvPaths = [];

  try {
    for (const [key, value] of Object.entries(updates)) {
      if (!CONFIG_ENV_KEY_SET.has(key)) {
        return res.status(400).json({ error: `Unsupported env key: ${key}` });
      }

      const normalized = normalizeEnvSetting(key, value);
      if ((currentEnv[key] ?? "") === normalized) {
        continue;
      }

      const writePath = getEnvWritePathForKey(key, runtimeContext);
      upsertEnvVar(writePath, key, normalized);
      updated.push(key);
      updatedEnvPaths.push(writePath);
    }

    const savedFiles = describeEnvFiles(updatedEnvPaths);
    res.json({
      ok: true,
      envPath,
      updated,
      restartRequired: updated.length > 0,
      restartInMs: updated.length > 0 ? 1500 : 0,
      message: updated.length > 0
        ? `Saved settings to ${savedFiles}. Restarting API to apply changes.`
        : "No settings changed.",
    });

    if (updated.length > 0) {
      setTimeout(() => {
        console.log("[Config] Settings saved from dashboard. Restarting API to apply changes...");
        process.exit(0);
      }, 1500);
    }
  } catch (err) {
    res.status(400).json({ error: "Failed to save configuration", details: err?.message || String(err) });
  }
});

// Auth routes - no session required (login/logout)
app.use("/auth", maybeRequireApiKey, authRoutes);

// User management routes - requires session auth
app.use("/users", requireApiKey, userRoutes);

// All API routes require both session auth AND API key for extra security
// Session auth ensures user is logged into dashboard
// API key ensures the request is authorized for this server
app.use("/inventory", requireAuth, requireApiKey, inventoryRoutes);
app.use("/events", requireAuth, requireApiKey, eventRoutes);
app.use("/life-events", requireAuth, requireApiKey, lifeEventRoutes);
app.use("/trades", requireAuth, requireApiKey, tradeRoutes);
app.use("/economy", requireAuth, requireApiKey, economyRoutes);
app.use("/grants", requireAuth, requireApiKey, grantRoutes);
app.use("/dashboard", requireAuth, requireApiKey, dashboardRoutes);
app.use("/items", requireAuth, requireApiKey, itemsRoutes);
app.use("/online", requireAuth, requireApiKey, onlineRoutes);
app.use("/ai", requireAuth, requireApiKey, aiRoutes);
app.use("/commands", requireAuth, requireApiKey, commandRoutes);
app.use("/expansion/atm", requireAuth, requireApiKey, expansionAtmRoutes);
app.use("/expansion/quests", requireAuth, requireApiKey, requireAdmin, expansionQuestsRoutes);
app.use("/expansion", requireAuth, requireApiKey, expansionRoutes);
app.use("/logs", requireAuth, requireApiKey, logsRoutes);
app.use("/positions", requireAuth, requireApiKey, positionsRoutes);
app.use("/archive", requireAuth, requireApiKey, archiveRoutes);
app.use("/vehicles", requireAuth, requireApiKey, vehiclesRoutes);
app.use("/leaderboard", requireAuth, requireApiKey, leaderboardRoutes);
app.use("/updates", requireAuth, requireApiKey, requireAdmin, updateRoutes);
app.use("/discord", requireAuth, requireApiKey, requireAdmin, discordRoutes);

// SPA fallback: serve index.html for any non-API routes (client-side routing)
if (existsSync(webDistPath)) {
  app.get("*", (req, res, next) => {
    // Skip API routes and actual file requests
    if (req.path.startsWith("/api") || req.path.includes(".")) {
      return next();
    }
    sendWebIndex(req, res, next);
  });
}

// Position tracking interval (capture player positions every 30 seconds)
const POSITION_TRACKING_INTERVAL = parseInt(process.env.POSITION_TRACKING_INTERVAL) || 30000;

async function capturePlayerPositionsForCurrentContext() {
  try {
    const onlineData = await getOnlinePlayersSnapshot();
    
    if (onlineData.isStale || !onlineData.players || onlineData.players.length === 0) {
      return;
    }
    
    // Filter to only online players
    const positions = onlineData.players
      .filter(p => p.isOnline === 1 || p.isOnline === true)
      .map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        posX: p.posX || 0,
        posY: p.posY || 0,
        posZ: p.posZ || 0,
        health: p.health,
        blood: p.blood,
        isAlive: p.isAlive === 1 || p.isAlive === true,
        isUnconscious: p.isUnconscious === 1 || p.isUnconscious === true,
        recordedAt: onlineData.generatedAt || new Date().toISOString()
      }));
    
    if (positions.length > 0) {
      positionDb.recordPositionsBatch(positions);
      console.log(`[Position Tracker] Recorded ${positions.length} player positions`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[Position Tracker] Error:', error.message);
    }
  }
}

// Start position tracking
async function capturePlayerPositions() {
  for (const context of getAllServerContexts()) {
    await runWithServerContext(context, capturePlayerPositionsForCurrentContext);
  }
}

setInterval(capturePlayerPositions, POSITION_TRACKING_INTERVAL);

// Initialize auth database and start server
async function startServer() {
  try {
    // Init pinned console UI early so any startup banners are visible
    consoleUi.init({
      status: "STARTING",
      host: HOST,
      port: PORT,
      storage: getRuntimeContext().backend || "local",
    });

    // Log configuration (unless we're using the pinned console UI)
    if (!consoleUi.isEnabled()) {
      logConfig();
    }
    
    // Initialize auth database (creates tables and optional bootstrap admin if enabled)
    await initAuthDb();
    
    // Initialize archive database
    initArchiveDb();
    startModActivityMonitor();
    await startDiscordBots();
    
    // Schedule daily archive at 4:00 AM (configurable via env)
    const archiveHour = parseInt(process.env.ARCHIVE_HOUR) || 4;
    const archiveMinute = parseInt(process.env.ARCHIVE_MINUTE) || 0;
    scheduleArchive(archiveHour, archiveMinute);

    const server = app.listen(PORT, HOST, () => {
      consoleUi.update({ status: "API RUNNING" });

      const apiKeyMeta = getApiKeyMeta();
      if (apiKeyMeta?.generated) {
        const persistedNote = apiKeyMeta.persistedPath
          ? `Saved to: ${apiKeyMeta.persistedPath}`
          : "(Could not write to .env; set API_KEY manually)";

        console.log("═".repeat(72));
        console.log("API_KEY was missing - generated a new key.");
        console.log(persistedNote);
        console.log(`API_KEY=${getApiKey()}`);
        console.log("═".repeat(72));
      }

      if (!consoleUi.isEnabled()) {
        console.log(`SST Node API running on http://${HOST}:${PORT}`);
        console.log(`Position tracking enabled (every ${POSITION_TRACKING_INTERVAL / 1000}s)`);
        console.log(`Authentication enabled - login required`);
      }
    });

    server.on("error", (err) => {
      if (err?.code === "EADDRINUSE") {
        console.error(`[Startup] Port ${PORT} is already in use. SST is probably already running at http://localhost:${PORT}`);
        process.exit(1);
      }

      console.error("[Startup] Failed to start API listener:", err?.message || err);
      process.exit(1);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
