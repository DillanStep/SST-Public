import { Router } from "express";
import { readFile, readdir } from "../storage/fs.js";
import { paths } from "../config.js";
import { positionDb } from "../db/database.js";
import { joinStoragePath } from "../utils/storagePath.js";
import { getOnlinePlayersSnapshot } from "../utils/onlinePlayers.js";

const router = Router();

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const READ_CONCURRENCY = 8;

const ITEM_EVENT_PICKUPS = new Set(["PICKED_UP", "PICKUP", "TAKE", "TAKEN", "LOOTED"]);
const ITEM_EVENT_DROPS = new Set(["DROPPED", "DROP"]);
const ITEM_EVENT_ADDS = new Set(["ADDED", "GRANTED", "SPAWNED"]);
const ITEM_EVENT_REMOVES = new Set(["REMOVED", "REMOVE", "DELETED", "DESTROYED"]);

function asArray(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }

  return [];
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseLimit(value) {
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function toTimestamp(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : null;
}

function updateFirstLast(player, timestamp) {
  const time = toTimestamp(timestamp);
  if (time === null) return;

  if (!player.firstSeenAt || time < new Date(player.firstSeenAt).getTime()) {
    player.firstSeenAt = new Date(time).toISOString();
  }

  if (!player.lastSeenAt || time > new Date(player.lastSeenAt).getTime()) {
    player.lastSeenAt = new Date(time).toISOString();
  }
}

function normalizePlayerId(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).trim();
}

function normalizePlayerName(value, fallback = "Unknown Player") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function getPlayer(players, playerId, playerName = "") {
  const id = normalizePlayerId(playerId);
  if (!id) return null;

  if (!players.has(id)) {
    players.set(id, {
      playerId: id,
      playerName: normalizePlayerName(playerName),
      isOnline: false,
      firstSeenAt: null,
      lastSeenAt: null,
      kills: 0,
      deaths: 0,
      pvpDeaths: 0,
      suicides: 0,
      spawns: 0,
      respawns: 0,
      connects: 0,
      disconnects: 0,
      lifeEvents: 0,
      itemEvents: 0,
      itemsPickedUp: 0,
      itemsDropped: 0,
      itemsAdded: 0,
      itemsRemoved: 0,
      inventoryItems: 0,
      tradeCount: 0,
      purchases: 0,
      sales: 0,
      totalSpent: 0,
      totalEarned: 0,
      activeVehicles: 0,
      destroyedVehicles: 0,
      vehiclePurchases: 0,
      vehicleSpend: 0,
      positionSamples: 0,
      playTimeSeconds: 0,
      currentSessionSeconds: 0,
      longestLifeSeconds: 0,
      score: 0,
      kdRatio: 0,
    });
  }

  const player = players.get(id);
  const name = normalizePlayerName(playerName, "");
  if (name && player.playerName === "Unknown Player") {
    player.playerName = name;
  }

  return player;
}

async function safeReadJson(filePath, fallback = null) {
  try {
    const content = await readFile(filePath, "utf8");
    if (!content || !content.trim()) return fallback;
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function listFiles(dirPath, suffix) {
  try {
    const files = await readdir(dirPath);
    return files.filter((file) => file.endsWith(suffix));
  } catch {
    return [];
  }
}

async function runLimited(items, limit, mapper) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, Math.max(items.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function parseKiller(causeOfDeath) {
  const cause = String(causeOfDeath || "").trim();
  const match = cause.match(/^Player:\s*(.*?)\s*\(([^)]+)\)$/i);
  if (!match) return null;

  return {
    playerName: normalizePlayerName(match[1], "Unknown Player"),
    playerId: normalizePlayerId(match[2]),
  };
}

function countInventoryItems(items) {
  let count = 0;

  for (const item of asArray(items)) {
    count += 1;
    count += countInventoryItems(item?.attachments);
    count += countInventoryItems(item?.cargo);
  }

  return count;
}

function applyItemEvent(player, event) {
  const type = String(event?.eventType || "").toUpperCase();
  player.itemEvents += 1;

  if (ITEM_EVENT_PICKUPS.has(type)) {
    player.itemsPickedUp += 1;
  } else if (ITEM_EVENT_DROPS.has(type)) {
    player.itemsDropped += 1;
  } else if (ITEM_EVENT_ADDS.has(type)) {
    player.itemsAdded += 1;
  } else if (ITEM_EVENT_REMOVES.has(type)) {
    player.itemsRemoved += 1;
  }

  updateFirstLast(player, event?.timestamp);
}

function applyLifeEvent(players, player, event) {
  const type = String(event?.eventType || "").toUpperCase();
  player.lifeEvents += 1;

  if (type === "SPAWNED") player.spawns += 1;
  if (type === "RESPAWNED") player.respawns += 1;
  if (type === "CONNECTED") player.connects += 1;
  if (type === "DISCONNECTED") player.disconnects += 1;

  if (type === "DIED") {
    player.deaths += 1;
    const killer = parseKiller(event?.causeOfDeath);
    if (killer?.playerId) {
      if (killer.playerId === player.playerId) {
        player.suicides += 1;
      } else {
        player.pvpDeaths += 1;
        const killerPlayer = getPlayer(players, killer.playerId, killer.playerName);
        if (killerPlayer) {
          killerPlayer.kills += 1;
          updateFirstLast(killerPlayer, event?.timestamp);
        }
      }
    }
  }

  updateFirstLast(player, event?.timestamp);
}

function calculateSessionStats(player, lifeEvents, onlineData) {
  const events = [...lifeEvents].sort((a, b) => (toTimestamp(a.timestamp) ?? 0) - (toTimestamp(b.timestamp) ?? 0));
  const now = Date.now();
  let connectStartedAt = null;
  let lifeStartedAt = null;

  for (const event of events) {
    const type = String(event?.eventType || "").toUpperCase();
    const time = toTimestamp(event?.timestamp);
    if (time === null) continue;

    if (type === "CONNECTED") {
      connectStartedAt = time;
      if (lifeStartedAt === null) {
        lifeStartedAt = time;
      }
    } else if (type === "DISCONNECTED") {
      if (connectStartedAt !== null && time >= connectStartedAt) {
        player.playTimeSeconds += Math.floor((time - connectStartedAt) / 1000);
      }
      connectStartedAt = null;
    } else if (type === "SPAWNED" || type === "RESPAWNED") {
      lifeStartedAt = time;
    } else if (type === "DIED") {
      if (lifeStartedAt !== null && time >= lifeStartedAt) {
        player.longestLifeSeconds = Math.max(player.longestLifeSeconds, Math.floor((time - lifeStartedAt) / 1000));
      }
      lifeStartedAt = null;
    }
  }

  if (player.isOnline) {
    const onlineStartedAt = toTimestamp(onlineData?.connectedAt) ?? connectStartedAt;
    if (onlineStartedAt !== null && now >= onlineStartedAt) {
      player.currentSessionSeconds = Math.floor((now - onlineStartedAt) / 1000);
      if (connectStartedAt !== null) {
        player.playTimeSeconds += Math.floor((now - connectStartedAt) / 1000);
      } else {
        player.playTimeSeconds += player.currentSessionSeconds;
      }
    }

    if (lifeStartedAt !== null && now >= lifeStartedAt) {
      player.longestLifeSeconds = Math.max(player.longestLifeSeconds, Math.floor((now - lifeStartedAt) / 1000));
    }
  }
}

function applyTrade(player, trade) {
  const type = String(trade?.eventType || "").toUpperCase();
  const quantity = Math.max(1, asNumber(trade?.quantity, 1));
  const price = asNumber(trade?.price, 0);

  player.tradeCount += 1;

  if (type === "PURCHASE") {
    player.purchases += quantity;
    player.totalSpent += price;
  } else if (type === "SALE") {
    player.sales += quantity;
    player.totalEarned += price;
  }

  updateFirstLast(player, trade?.timestamp);
}

function finalizePlayer(player) {
  player.kdRatio = player.deaths > 0 ? Number((player.kills / player.deaths).toFixed(2)) : player.kills;
  player.netTrade = player.totalEarned - player.totalSpent;
  player.totalVehicles = player.activeVehicles + player.destroyedVehicles;
  player.score = Math.max(0, Math.round(
    player.kills * 100 +
    player.itemsPickedUp * 2 +
    player.itemEvents +
    player.tradeCount * 3 +
    player.activeVehicles * 25 +
    Math.floor(player.playTimeSeconds / 300) -
    player.deaths * 10
  ));

  return player;
}

function sortBy(players, key, limit, direction = "desc") {
  const modifier = direction === "asc" ? 1 : -1;
  return [...players]
    .sort((a, b) => {
      const aValue = asNumber(a[key], 0);
      const bValue = asNumber(b[key], 0);
      if (aValue !== bValue) return (aValue - bValue) * modifier;
      return String(a.playerName).localeCompare(String(b.playerName));
    })
    .slice(0, limit);
}

router.get("/", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const players = new Map();
  const lifeEventsByPlayer = new Map();
  const onlineById = new Map();

  try {
    const onlineData = await getOnlinePlayersSnapshot();
    for (const onlinePlayer of asArray(onlineData, ["players"])) {
      const player = getPlayer(players, onlinePlayer?.playerId, onlinePlayer?.playerName);
      if (!player) continue;

      const isOnline = onlinePlayer?.isOnline === 1 || onlinePlayer?.isOnline === true;
      player.isOnline = isOnline;
      onlineById.set(player.playerId, onlinePlayer);
      updateFirstLast(player, onlinePlayer?.lastUpdate || onlineData?.generatedAt);
    }

    const [eventFiles, lifeFiles, tradeFiles, inventoryFiles] = await Promise.all([
      listFiles(paths.events, "_events.json"),
      listFiles(paths.lifeEvents, "_life.json"),
      listFiles(paths.trades, "_trades.json"),
      listFiles(paths.inventories, ".json"),
    ]);

    await runLimited(inventoryFiles, READ_CONCURRENCY, async (file) => {
      const data = await safeReadJson(`${paths.inventories}/${file}`, null);
      const playerId = normalizePlayerId(data?.playerId || file.replace(/\.json$/i, ""));
      const playerName = data?.playerName || data?.players?.[0]?.playerName;
      const player = getPlayer(players, playerId, playerName);
      if (!player) return;

      const inventoryPlayers = asArray(data?.players);
      if (inventoryPlayers.length > 0) {
        for (const inventoryPlayer of inventoryPlayers) {
          const nestedPlayer = getPlayer(players, inventoryPlayer?.playerId || playerId, inventoryPlayer?.playerName || playerName);
          if (nestedPlayer) {
            nestedPlayer.inventoryItems += countInventoryItems(inventoryPlayer?.inventory);
            updateFirstLast(nestedPlayer, data?.generatedAt);
          }
        }
      } else {
        player.inventoryItems += countInventoryItems(data?.inventory);
        updateFirstLast(player, data?.generatedAt);
      }
    });

    await runLimited(eventFiles, READ_CONCURRENCY, async (file) => {
      const data = await safeReadJson(`${paths.events}/${file}`, null);
      const fallbackId = file.replace(/_events\.json$/i, "");
      for (const event of asArray(data, ["events"])) {
        const player = getPlayer(players, event?.playerId || data?.playerId || fallbackId, event?.playerName || data?.playerName);
        if (player) applyItemEvent(player, event);
      }
    });

    await runLimited(lifeFiles, READ_CONCURRENCY, async (file) => {
      const data = await safeReadJson(`${paths.lifeEvents}/${file}`, null);
      const fallbackId = file.replace(/_life\.json$/i, "");
      const playerEvents = [];

      for (const event of asArray(data, ["events"])) {
        const player = getPlayer(players, event?.playerId || data?.playerId || fallbackId, event?.playerName || data?.playerName);
        if (!player) continue;
        playerEvents.push(event);
        applyLifeEvent(players, player, event);
      }

      const owner = getPlayer(players, data?.playerId || fallbackId, data?.playerName);
      if (owner) {
        lifeEventsByPlayer.set(owner.playerId, playerEvents);
      }
    });

    await runLimited(tradeFiles, READ_CONCURRENCY, async (file) => {
      const data = await safeReadJson(`${paths.trades}/${file}`, null);
      const fallbackId = file.replace(/_trades\.json$/i, "");
      for (const trade of asArray(data, ["trades"])) {
        const player = getPlayer(players, trade?.playerId || data?.playerId || fallbackId, trade?.playerName || data?.playerName);
        if (player) applyTrade(player, trade);
      }
    });

    const [trackedVehiclesData, vehiclePurchasesData] = await Promise.all([
      safeReadJson(joinStoragePath(paths.sst, "vehicles", "tracked.json"), []),
      safeReadJson(joinStoragePath(paths.sst, "vehicles", "purchases.json"), []),
    ]);

    for (const vehicle of asArray(trackedVehiclesData, ["vehicles", "tracked", "items"])) {
      const player = getPlayer(players, vehicle?.ownerId, vehicle?.ownerName);
      if (!player) continue;

      const destroyed = vehicle?.isDestroyed === true || vehicle?.isDestroyed === 1 || String(vehicle?.isDestroyed || "").toLowerCase() === "true";
      if (destroyed) {
        player.destroyedVehicles += 1;
      } else {
        player.activeVehicles += 1;
      }
      updateFirstLast(player, vehicle?.lastUpdateTime || vehicle?.purchaseTimestamp);
    }

    for (const purchase of asArray(vehiclePurchasesData, ["purchases", "vehicles", "items"])) {
      const player = getPlayer(players, purchase?.ownerId, purchase?.ownerName);
      if (!player) continue;

      player.vehiclePurchases += 1;
      player.vehicleSpend += asNumber(purchase?.purchasePrice, 0);
      updateFirstLast(player, purchase?.timestamp);
    }

    try {
      for (const trackedPlayer of positionDb.getTrackedPlayers()) {
        const player = getPlayer(players, trackedPlayer.playerId, trackedPlayer.playerName);
        if (!player) continue;

        player.positionSamples = trackedPlayer.positionCount;
        if (trackedPlayer.firstSeen) updateFirstLast(player, trackedPlayer.firstSeen * 1000);
        if (trackedPlayer.lastSeen) updateFirstLast(player, trackedPlayer.lastSeen * 1000);
      }
    } catch {
      // Position history is optional; leaderboard should still work from JSON exports.
    }

    for (const player of players.values()) {
      calculateSessionStats(player, lifeEventsByPlayer.get(player.playerId) || [], onlineById.get(player.playerId));
      finalizePlayer(player);
    }

    const playerList = [...players.values()];
    const summary = playerList.reduce((acc, player) => {
      acc.onlineCount += player.isOnline ? 1 : 0;
      acc.totalKills += player.kills;
      acc.totalDeaths += player.deaths;
      acc.totalItemEvents += player.itemEvents;
      acc.totalTrades += player.tradeCount;
      acc.totalVehicles += player.totalVehicles;
      return acc;
    }, {
      onlineCount: 0,
      totalKills: 0,
      totalDeaths: 0,
      totalItemEvents: 0,
      totalTrades: 0,
      totalVehicles: 0,
    });

    res.json({
      generatedAt: new Date().toISOString(),
      playerCount: playerList.length,
      summary,
      leaderboards: {
        overall: sortBy(playerList, "score", limit),
        kills: sortBy(playerList, "kills", limit),
        deaths: sortBy(playerList, "deaths", limit),
        playTime: sortBy(playerList, "playTimeSeconds", limit),
        longestLife: sortBy(playerList, "longestLifeSeconds", limit),
        loot: sortBy(playerList, "itemsPickedUp", limit),
        trades: sortBy(playerList, "tradeCount", limit),
        wealth: sortBy(playerList, "netTrade", limit),
        vehicles: sortBy(playerList, "totalVehicles", limit),
        online: sortBy(playerList.filter((player) => player.isOnline), "currentSessionSeconds", limit),
      },
      players: sortBy(playerList, "score", MAX_LIMIT),
      retention: {
        note: "Leaderboard totals are based on the current SST JSON exports and local position database. Per-player JSON files keep recent history, so long-running totals may reset when retention limits are reached.",
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to build leaderboard", details: err?.message || String(err) });
  }
});

export default router;
