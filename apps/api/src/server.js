import "./appConfig.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFile, stat, getStorageBackend } from "./storage/fs.js";

import { requireApiKey, getApiKey, getApiKeyMeta } from "./middleware/auth.js";
import { positionDb } from "./db/database.js";
import { initArchiveDb, scheduleArchive } from "./db/archiveDb.js";
import { paths, features, logConfig } from "./config.js";
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
import commandRoutes from "./routes/commands.js";
import expansionRoutes from "./routes/expansion.js";
import logsRoutes from "./routes/logs.js";
import positionsRoutes from "./routes/positions.js";
import archiveRoutes from "./routes/archive.js";
import vehiclesRoutes from "./routes/vehicles.js";
import updateRoutes from "./routes/updates.js";
import { readEnvVars, resolveEnvPathForWrite, upsertEnvVar } from "./utils/envFile.js";
import { buildMapConfig, detectMapPresetFromMissionPath, getBuiltinMaps } from "./utils/mapConfig.js";

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
  "EXPANSION_ENABLED",
  "EXPANSION_TRADERS_PATH",
  "EXPANSION_MARKET_PATH",
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
];

const CONFIG_ENV_KEY_SET = new Set(CONFIG_ENV_KEYS);
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
  "EXPANSION_TRADERS_PATH",
  "EXPANSION_MARKET_PATH",
  "MISSION_PATH",
  "TYPES_PATH",
  "PROFILES_PATH",
  "AUTH_DB_PATH",
  "DATABASE_PATH",
  "ARCHIVE_DB_PATH",
]);

const NUMBER_ENV_KEYS = new Set([
  "PORT",
  "FTP_PORT",
  "SFTP_PORT",
  "POSITION_TRACKING_INTERVAL",
  "ARCHIVE_HOUR",
  "ARCHIVE_MINUTE",
  "MAP_WORLD_SIZE_X",
  "MAP_WORLD_SIZE_Z",
]);

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
    ARCHIVE_HOUR: "4",
    ARCHIVE_MINUTE: "0",
    MAP_INVERT_X: "0",
    MAP_INVERT_Z: "0",
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
    addSuggestion(suggestions, "DATABASE_PATH", joinConfigPath(sstPath, "data", "sst_tracking.db"));
  }

  const storageMatch = sstPath.match(/^(.*)\/storage_[^/]+\/SST$/i);
  const missionPath = normalizeConfigPath(env.MISSION_PATH) || (storageMatch ? storageMatch[1] : "");
  if (missionPath) {
    addSuggestion(suggestions, "MISSION_PATH", missionPath);
    addSuggestion(suggestions, "TYPES_PATH", normalizeConfigPath(env.TYPES_PATH) || joinConfigPath(missionPath, "db", "types.xml"));
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

  const expansionBase = normalizeConfigPath(env.EXPANSION_TRADERS_PATH)
    ? dirnameConfigPath(env.EXPANSION_TRADERS_PATH)
    : profilesPath
      ? joinConfigPath(profilesPath, "ExpansionMod")
      : serverRoot
        ? firstExistingPath([
          joinConfigPath(serverRoot, "Server1", "ExpansionMod"),
          joinConfigPath(serverRoot, "profiles", "ExpansionMod"),
        ])
        : "";

  const expansionTraders = normalizeConfigPath(env.EXPANSION_TRADERS_PATH) || (expansionBase ? joinConfigPath(expansionBase, "Traders") : "");
  const expansionMarket = normalizeConfigPath(env.EXPANSION_MARKET_PATH) || (expansionBase ? joinConfigPath(expansionBase, "Market") : "");
  if (expansionTraders) {
    addSuggestion(suggestions, "EXPANSION_TRADERS_PATH", expansionTraders);
  }
  if (expansionMarket) {
    addSuggestion(suggestions, "EXPANSION_MARKET_PATH", expansionMarket);
  }

  suggestions.EXPANSION_ENABLED = env.EXPANSION_ENABLED || (pathExists(expansionTraders) || pathExists(expansionMarket) ? "1" : "0");

  if (!env.ARCHIVE_DB_PATH) {
    addSuggestion(suggestions, "ARCHIVE_DB_PATH", normalizeConfigPath(join(__dirname, "..", "data", "archive.db")));
  }
  if (!env.AUTH_DB_PATH) {
    addSuggestion(suggestions, "AUTH_DB_PATH", normalizeConfigPath(join(__dirname, "..", "data", "auth.db")));
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

  if (PATH_ENV_KEYS.has(key)) {
    normalized = normalized.replace(/\\/g, "/").replace(/\/+$/, "");
    if ((key === "FTP_ROOT" || key === "SFTP_ROOT") && !normalized) {
      normalized = "/";
    }
  }

  return normalized;
}

function getConfigEnvSnapshot() {
  const envPath = resolveEnvPathForWrite();
  const fileVars = readEnvVars(envPath);
  const env = {};

  for (const key of CONFIG_ENV_KEYS) {
    env[key] = fileVars[key] ?? process.env[key] ?? "";
  }

  if (!env.API_KEY) {
    env.API_KEY = getApiKey();
  }

  return { envPath, env };
}

// Configure CORS to allow requests from any origin (or specify your dashboard URL)
const corsOptions = {
  origin: process.env.CORS_ORIGIN || true, // Set CORS_ORIGIN in .env for production
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  credentials: true, // Important for cookies
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Serve static web client from ../web/dist if it exists (production build)
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDistPath = join(__dirname, "../../web/dist");
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
}

// Health check - no auth required
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
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
  const { envPath, env } = getConfigEnvSnapshot();
  const suggestions = buildConfigSuggestions(env);

  const response = {
    envPath,
    env,
    suggestions,
    storage: {
      backend,
      // Helpful non-secret hints for remote backends
      sftp: backend === "sftp" ? {
        host: process.env.SFTP_HOST || null,
        port: process.env.SFTP_PORT ? Number(process.env.SFTP_PORT) : null,
        root: process.env.SFTP_ROOT || null,
        user: process.env.SFTP_USER || null,
      } : null,
      ftp: backend === "ftp" || backend === "ftps" ? {
        host: process.env.FTP_HOST || null,
        port: process.env.FTP_PORT ? Number(process.env.FTP_PORT) : null,
        root: process.env.FTP_ROOT || null,
        user: process.env.FTP_USER || null,
        secure: typeof process.env.FTP_SECURE === "string" ? process.env.FTP_SECURE : null,
      } : null,
    },
    map: buildMapConfig({ env, missionPath: paths.missionFolder }),
    paths: {
      inventories: paths.inventories,
      events: paths.events,
      lifeEvents: paths.lifeEvents,
      trades: paths.trades,
      api: paths.api,
      onlinePlayers: paths.onlinePlayers,
      expansionTraders: features.expansionEnabled ? paths.expansionTraders : null,
      expansionMarket: features.expansionEnabled ? paths.expansionMarket : null,
      missionFolder: paths.missionFolder,
      typesXml: paths.typesXml || `${paths.missionFolder}/db/types.xml`,
      profiles: paths.profiles,
      database: paths.database,
    },
    features: {
      expansionEnabled: features.expansionEnabled,
    },
    checks: {
      onlinePlayers: { path: paths.onlinePlayers, ok: false, stat: null, error: null },
      apiDir: { path: paths.api, ok: false, stat: null, error: null },
    },
    server: {
      port: PORT,
      host: HOST,
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

app.get("/map/config", requireAuth, requireApiKey, (req, res) => {
  const { env } = getConfigEnvSnapshot();
  res.json(buildMapConfig({ env, missionPath: paths.missionFolder }));
});

app.put("/config", requireApiKey, requireAuth, requireAdmin, (req, res) => {
  const updates = req.body?.env;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return res.status(400).json({ error: "env object is required" });
  }

  const { envPath, env: currentEnv } = getConfigEnvSnapshot();
  const updated = [];

  try {
    for (const [key, value] of Object.entries(updates)) {
      if (!CONFIG_ENV_KEY_SET.has(key)) {
        return res.status(400).json({ error: `Unsupported env key: ${key}` });
      }

      const normalized = normalizeEnvSetting(key, value);
      if ((currentEnv[key] ?? "") === normalized) {
        continue;
      }

      upsertEnvVar(envPath, key, normalized);
      updated.push(key);
    }

    res.json({
      ok: true,
      envPath,
      updated,
      restartRequired: updated.length > 0,
      restartInMs: updated.length > 0 ? 1500 : 0,
      message: updated.length > 0
        ? "Saved settings to .env. Restarting API to apply changes."
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
app.use("/commands", requireAuth, requireApiKey, commandRoutes);
app.use("/expansion", requireAuth, requireApiKey, expansionRoutes);
app.use("/logs", requireAuth, requireApiKey, logsRoutes);
app.use("/positions", requireAuth, requireApiKey, positionsRoutes);
app.use("/archive", requireAuth, requireApiKey, archiveRoutes);
app.use("/vehicles", requireAuth, requireApiKey, vehiclesRoutes);
app.use("/updates", requireAuth, requireApiKey, requireAdmin, updateRoutes);

// SPA fallback: serve index.html for any non-API routes (client-side routing)
if (existsSync(webDistPath)) {
  app.get("*", (req, res, next) => {
    // Skip API routes and actual file requests
    if (req.path.startsWith("/api") || req.path.includes(".")) {
      return next();
    }
    res.sendFile(join(webDistPath, "index.html"));
  });
}

// Position tracking interval (capture player positions every 30 seconds)
const POSITION_TRACKING_INTERVAL = parseInt(process.env.POSITION_TRACKING_INTERVAL) || 30000;

async function capturePlayerPositions() {
  try {
    const data = await readFile(paths.onlinePlayers, "utf-8");
    const onlineData = JSON.parse(data);
    
    if (!onlineData.players || onlineData.players.length === 0) {
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
setInterval(capturePlayerPositions, POSITION_TRACKING_INTERVAL);

// Initialize auth database and start server
async function startServer() {
  try {
    // Init pinned console UI early so any startup banners are visible
    consoleUi.init({
      status: "STARTING",
      host: HOST,
      port: PORT,
      storage: process.env.STORAGE_BACKEND || "local",
    });

    // Log configuration (unless we're using the pinned console UI)
    if (!consoleUi.isEnabled()) {
      logConfig();
    }
    
    // Initialize auth database (creates tables and optional bootstrap admin if enabled)
    await initAuthDb();
    
    // Initialize archive database
    initArchiveDb();
    
    // Schedule daily archive at 4:00 AM (configurable via env)
    const archiveHour = parseInt(process.env.ARCHIVE_HOUR) || 4;
    const archiveMinute = parseInt(process.env.ARCHIVE_MINUTE) || 0;
    scheduleArchive(archiveHour, archiveMinute);

    app.listen(PORT, HOST, () => {
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
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
