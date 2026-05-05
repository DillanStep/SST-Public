import { Router } from "express";
import { readFile, readdir } from "../storage/fs.js";
import { paths } from "../config.js";
import { getServerContext } from "../serverContext.js";
import { consoleUi } from "../utils/consoleUi.js";
import { getOnlinePlayersSnapshot, onlineSnapshotMetadata } from "../utils/onlinePlayers.js";

const router = Router();

const cacheByServerId = new Map();
const refreshPromisesByServerId = new Map();
const REFRESH_INTERVAL_MS = 20000;

function getCacheKey() {
  return getServerContext()?.id || "default";
}

function emptyCache() {
  return {
    players: {},
    grantResults: [],
    recentDeaths: [],
    lastUpdate: null,
    refreshTimeMs: 0,
    onlineCount: 0,
    onlineSource: null,
    playerCount: 0,
  };
}

async function loadPlayerInventory(playerId) {
  try {
    const file = `${paths.inventories}/${playerId}.json`;
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function loadPlayerEvents(playerId) {
  try {
    const file = `${paths.events}/${playerId}_events.json`;
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function loadPlayerLifeEvents(playerId) {
  try {
    const file = `${paths.lifeEvents}/${playerId}_life.json`;
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function loadGrantResults() {
  try {
    const data = JSON.parse(
      await readFile(`${paths.api}/item_grants_results.json`, "utf8")
    );
    return data.requests || [];
  } catch {
    return [];
  }
}

async function discoverPlayerIds(onlinePlayers = []) {
  const playerIds = new Set();

  for (const player of onlinePlayers) {
    if (player?.playerId) {
      playerIds.add(String(player.playerId));
    }
  }

  try {
    const invFiles = await readdir(paths.inventories);
    for (const file of invFiles) {
      if (file.endsWith(".json")) {
        playerIds.add(file.replace(".json", ""));
      }
    }
  } catch {}

  try {
    const eventFiles = await readdir(paths.events);
    for (const file of eventFiles) {
      if (file.endsWith("_events.json")) {
        playerIds.add(file.replace("_events.json", ""));
      }
    }
  } catch {}

  try {
    const lifeFiles = await readdir(paths.lifeEvents);
    for (const file of lifeFiles) {
      if (file.endsWith("_life.json")) {
        playerIds.add(file.replace("_life.json", ""));
      }
    }
  } catch {}

  return Array.from(playerIds);
}

async function refreshCache() {
  const startTime = Date.now();
  const cacheKey = getCacheKey();

  try {
    const onlineSnapshot = await getOnlinePlayersSnapshot();
    const onlinePlayers = Array.isArray(onlineSnapshot.players) ? onlineSnapshot.players : [];
    const onlineById = new Map(
      onlinePlayers
        .filter((player) => player?.playerId)
        .map((player) => [String(player.playerId), player])
    );
    const playerIds = await discoverPlayerIds(onlinePlayers);

    const playerDataPromises = playerIds.map(async (playerId) => {
      const [inventory, events, lifeEvents] = await Promise.all([
        loadPlayerInventory(playerId),
        loadPlayerEvents(playerId),
        loadPlayerLifeEvents(playerId),
      ]);
      return { playerId, inventory, events, lifeEvents, online: onlineById.get(playerId) || null };
    });

    const playerDataResults = await Promise.all(playerDataPromises);
    const players = {};
    const allDeaths = [];

    for (const { playerId, inventory, events, lifeEvents, online } of playerDataResults) {
      players[playerId] = { inventory, events, lifeEvents, online };

      if (lifeEvents?.events) {
        const deaths = lifeEvents.events.filter(e => e.eventType === "DIED");
        allDeaths.push(...deaths);
      }
    }

    allDeaths.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const nextCache = {
      players,
      grantResults: await loadGrantResults(),
      recentDeaths: allDeaths.slice(0, 20),
      lastUpdate: new Date().toISOString(),
      refreshTimeMs: Date.now() - startTime,
      onlineCount: onlinePlayers.filter((player) => player?.isOnline === 1 || player?.isOnline === true).length,
      onlineSource: onlineSnapshotMetadata(onlineSnapshot),
      playerCount: Object.keys(players).length,
    };

    cacheByServerId.set(cacheKey, nextCache);

    consoleUi.update({
      cachePlayers: nextCache.playerCount,
      cacheRefreshMs: nextCache.refreshTimeMs,
      cacheLastUpdate: nextCache.lastUpdate,
      cacheIntervalMs: REFRESH_INTERVAL_MS,
    });

    return nextCache;
  } catch (err) {
    console.error(`[Cache:${cacheKey}] Refresh failed:`, err.message);
    const fallback = cacheByServerId.get(cacheKey) || emptyCache();
    cacheByServerId.set(cacheKey, fallback);
    return fallback;
  }
}

async function getCache({ force = false } = {}) {
  const cacheKey = getCacheKey();
  const current = cacheByServerId.get(cacheKey);
  const lastUpdateMs = current?.lastUpdate ? new Date(current.lastUpdate).getTime() : 0;
  const isStale = !lastUpdateMs || Date.now() - lastUpdateMs > REFRESH_INTERVAL_MS;

  if (!force && current && !isStale) {
    return current;
  }

  if (!refreshPromisesByServerId.has(cacheKey)) {
    refreshPromisesByServerId.set(
      cacheKey,
      refreshCache().finally(() => refreshPromisesByServerId.delete(cacheKey))
    );
  }

  return refreshPromisesByServerId.get(cacheKey);
}

// GET /dashboard - returns all cached data
router.get("/", async (_req, res) => {
  res.json(await getCache());
});

// GET /dashboard/player/:playerId - returns single player from cache
router.get("/player/:playerId", async (req, res) => {
  const cache = await getCache();
  const player = cache.players[req.params.playerId];
  if (!player) {
    return res.status(404).json({ error: "Player not found in cache" });
  }
  res.json({
    playerId: req.params.playerId,
    ...player,
    cacheAge: cache.lastUpdate,
  });
});

// GET /dashboard/grants - returns grant results from cache
router.get("/grants", async (_req, res) => {
  const cache = await getCache();
  res.json({
    results: cache.grantResults,
    cacheAge: cache.lastUpdate,
  });
});

// GET /dashboard/deaths - returns recent deaths from cache
router.get("/deaths", async (_req, res) => {
  const cache = await getCache();
  res.json({
    count: cache.recentDeaths?.length || 0,
    deaths: cache.recentDeaths || [],
    cacheAge: cache.lastUpdate,
  });
});

// POST /dashboard/refresh - force immediate refresh
router.post("/refresh", async (_req, res) => {
  res.json(await getCache({ force: true }));
});

export default router;
