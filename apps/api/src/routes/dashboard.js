import { Router } from "express";
import { readFile, readdir } from "../storage/fs.js";
import { paths } from "../config.js";
import { consoleUi } from "../utils/consoleUi.js";

const router = Router();

// In-memory cache
let cache = {
  players: {},        // playerId -> { inventory, events, lifeEvents }
  grantResults: [],
  recentDeaths: [],
  lastUpdate: null
};

let refreshInterval = null;

// Refresh cache every 20 seconds
const REFRESH_INTERVAL_MS = 20000;

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

async function discoverPlayerIds() {
  const playerIds = new Set();
  
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
  
  try {
    const playerIds = await discoverPlayerIds();
    
    // Load all player data in parallel
    const playerDataPromises = playerIds.map(async (playerId) => {
      const [inventory, events, lifeEvents] = await Promise.all([
        loadPlayerInventory(playerId),
        loadPlayerEvents(playerId),
        loadPlayerLifeEvents(playerId)
      ]);
      return { playerId, inventory, events, lifeEvents };
    });

    const playerDataResults = await Promise.all(playerDataPromises);
    
    // Build players object and collect deaths
    const players = {};
    const allDeaths = [];
    
    for (const { playerId, inventory, events, lifeEvents } of playerDataResults) {
      players[playerId] = { inventory, events, lifeEvents };
      
      // Collect deaths for recent deaths list
      if (lifeEvents?.events) {
        const deaths = lifeEvents.events.filter(e => e.eventType === "DIED");
        allDeaths.push(...deaths);
      }
    }

    // Sort deaths by timestamp descending, keep last 20
    allDeaths.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recentDeaths = allDeaths.slice(0, 20);

    // Load grant results
    const grantResults = await loadGrantResults();

    // Update cache
    cache = {
      players,
      grantResults,
      recentDeaths,
      lastUpdate: new Date().toISOString(),
      refreshTimeMs: Date.now() - startTime,
      playerCount: Object.keys(players).length
    };

    consoleUi.update({
      cachePlayers: cache.playerCount,
      cacheRefreshMs: cache.refreshTimeMs,
      cacheLastUpdate: cache.lastUpdate,
    });
  } catch (err) {
    console.error("[Cache] Refresh failed:", err.message);
  }
}

// Start auto-refresh on module load
async function startAutoRefresh() {
  await refreshCache(); // Initial load
  refreshInterval = setInterval(refreshCache, REFRESH_INTERVAL_MS);
  consoleUi.update({ cacheIntervalMs: REFRESH_INTERVAL_MS });

  if (!consoleUi.isEnabled()) {
    console.log(`[Cache] Auto-refresh started (every ${REFRESH_INTERVAL_MS / 1000}s)`);
  }
}

startAutoRefresh();

// GET /dashboard - returns all cached data
router.get("/", (req, res) => {
  res.json(cache);
});

// GET /dashboard/player/:playerId - returns single player from cache
router.get("/player/:playerId", (req, res) => {
  const player = cache.players[req.params.playerId];
  if (!player) {
    return res.status(404).json({ error: "Player not found in cache" });
  }
  res.json({
    playerId: req.params.playerId,
    ...player,
    cacheAge: cache.lastUpdate
  });
});

// GET /dashboard/grants - returns grant results from cache
router.get("/grants", (req, res) => {
  res.json({
    results: cache.grantResults,
    cacheAge: cache.lastUpdate
  });
});

// GET /dashboard/deaths - returns recent deaths from cache
router.get("/deaths", (req, res) => {
  res.json({
    count: cache.recentDeaths?.length || 0,
    deaths: cache.recentDeaths || [],
    cacheAge: cache.lastUpdate
  });
});

// POST /dashboard/refresh - force immediate refresh
router.post("/refresh", async (req, res) => {
  await refreshCache();
  res.json({ status: "REFRESHED", lastUpdate: cache.lastUpdate });
});

export default router;
