import { readFile, readdir, stat } from "../storage/fs.js";
import { features, paths } from "../config.js";
import { joinStoragePath } from "./storagePath.js";
import { getOnlinePlayersSnapshot } from "./onlinePlayers.js";
import { normalizeSteamId } from "./playerLookup.js";

const ATM_HISTORY_FILE = "expansion_atm_history.json";
const RECENT_LIMIT = 6;

function isNotFound(err) {
  const code = String(err?.code || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();
  return code === "ENOENT" || message.includes("no such file") || message.includes("not found");
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function toNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getStatIso(fileStat) {
  const modifiedAt = fileStat?.mtimeMs ?? (fileStat?.mtime ? new Date(fileStat.mtime).getTime() : null);
  return Number.isFinite(modifiedAt) ? new Date(modifiedAt).toISOString() : null;
}

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readJsonWithMeta(pathValue) {
  try {
    const [raw, fileStat] = await Promise.all([
      readFile(pathValue, "utf8"),
      stat(pathValue).catch(() => null),
    ]);

    return {
      exists: true,
      data: parseJson(raw, null),
      updatedAt: getStatIso(fileStat),
    };
  } catch (err) {
    if (isNotFound(err)) {
      return { exists: false, data: null, updatedAt: null };
    }
    throw err;
  }
}

function sortRecent(items) {
  return [...items].sort((a, b) => {
    const bTime = new Date(b?.timestamp || b?.createdAt || b?.updatedAt || 0).getTime();
    const aTime = new Date(a?.timestamp || a?.createdAt || a?.updatedAt || 0).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

function compactEvent(event) {
  if (!event || typeof event !== "object") return null;

  return {
    timestamp: firstText(event.timestamp, event.createdAt, event.updatedAt),
    type: firstText(event.eventType, event.type, event.action, event.commandType),
    playerName: firstText(event.playerName, event.name),
    item: firstText(event.itemDisplayName, event.itemClassName, event.className, event.item),
    weapon: firstText(event.weapon, event.ammo),
    target: firstText(event.targetPlayerName, event.targetPlayerId),
    trader: firstText(event.traderName, event.traderZone),
    reason: firstText(event.causeOfDeath, event.reason, event.result),
    quantity: toNumber(event.quantity, null),
    price: toNumber(event.price, null),
    amount: toNumber(event.amount ?? event.changeAmount, null),
    balance: toNumber(event.balance, null),
  };
}

function compactRecent(items, limit = RECENT_LIMIT) {
  if (!Array.isArray(items)) return [];
  return sortRecent(items).slice(0, limit).map(compactEvent).filter(Boolean);
}

function normalizePosition(value) {
  if (Array.isArray(value) && value.length >= 3) {
    return {
      x: toNumber(value[0], 0),
      y: toNumber(value[1], 0),
      z: toNumber(value[2], 0),
    };
  }

  if (value && typeof value === "object") {
    return {
      x: toNumber(value.x ?? value.X, 0),
      y: toNumber(value.y ?? value.Y, 0),
      z: toNumber(value.z ?? value.Z, 0),
    };
  }

  return null;
}

function countInventoryItems(items) {
  if (!Array.isArray(items)) return 0;

  return items.reduce((count, item) => {
    return count
      + 1
      + countInventoryItems(item?.attachments)
      + countInventoryItems(item?.cargo);
  }, 0);
}

function flattenInventory(items, target = []) {
  if (!Array.isArray(items)) return target;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    target.push({
      className: firstText(item.className, item.type),
      displayName: firstText(item.displayName, item.className, item.type),
      slotName: firstText(item.slotName),
      quantity: toNumber(item.quantity, null),
      quantityMax: toNumber(item.quantityMax, null),
      health: toNumber(item.health, null),
    });
    flattenInventory(item.attachments, target);
    flattenInventory(item.cargo, target);
  }

  return target;
}

function getInventoryPlayer(data, steamId) {
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data.players)) {
    return data.players.find((player) => String(player?.playerId || player?.steamId || "") === steamId)
      || data.players[0]
      || null;
  }

  return data;
}

function buildInventorySummary(file, steamId) {
  const player = getInventoryPlayer(file.data, steamId);
  const inventory = Array.isArray(player?.inventory) ? player.inventory : [];
  const flatItems = flattenInventory(inventory);
  const equippedCount = inventory.length;

  return {
    exists: file.exists,
    updatedAt: file.updatedAt,
    generatedAt: firstText(file.data?.generatedAt),
    playerName: firstText(player?.playerName, player?.name, file.data?.playerName),
    biId: firstText(player?.biId, player?.biID, player?.playerBohemiaId, file.data?.biId),
    itemCount: countInventoryItems(inventory),
    equippedCount,
    sample: flatItems.slice(0, 10),
  };
}

function buildEventSummary(file, key) {
  const events = Array.isArray(file.data?.[key]) ? file.data[key] : [];
  const deaths = events.filter((event) => String(event?.eventType || "").toUpperCase() === "DIED").length;

  return {
    exists: file.exists,
    updatedAt: file.updatedAt,
    count: events.length,
    deaths,
    recent: compactRecent(events),
  };
}

function buildTradeSummary(file) {
  const trades = Array.isArray(file.data?.trades) ? file.data.trades : [];

  return {
    exists: file.exists,
    updatedAt: file.updatedAt,
    count: trades.length,
    purchases: toNumber(file.data?.totalPurchases, trades.filter((trade) => trade?.eventType === "PURCHASE").length),
    sales: toNumber(file.data?.totalSales, trades.filter((trade) => trade?.eventType === "SALE").length),
    totalSpent: toNumber(file.data?.totalSpent, 0),
    totalEarned: toNumber(file.data?.totalEarned, 0),
    recent: compactRecent(trades),
  };
}

function buildOnlineSummary(snapshot, steamId) {
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const player = players.find((item) => String(item?.playerId || item?.steamId || "") === steamId);

  if (!player) {
    return {
      found: false,
      isOnline: false,
      isStale: Boolean(snapshot?.isStale),
      generatedAt: snapshot?.generatedAt || null,
      sourceUpdatedAt: snapshot?.sourceUpdatedAt || null,
    };
  }

  return {
    found: true,
    isOnline: Boolean(player.isOnline) && !snapshot?.isStale,
    isStale: Boolean(snapshot?.isStale),
    generatedAt: snapshot?.generatedAt || null,
    sourceUpdatedAt: snapshot?.sourceUpdatedAt || null,
    playerName: firstText(player.playerName, player.name),
    biId: firstText(player.biId, player.biID),
    connectedAt: firstText(player.connectedAt),
    lastUpdate: firstText(player.lastUpdate),
    position: normalizePosition(player.position),
    health: toNumber(player.health, null),
    blood: toNumber(player.blood, null),
    water: toNumber(player.water, null),
    energy: toNumber(player.energy, null),
    isAlive: player.isAlive !== false,
    isUnconscious: Boolean(player.isUnconscious),
  };
}

function normalizeAtmAccount({ data, fileName, updatedAt, known }) {
  const playerId = firstText(data?.PlayerID, fileName?.replace(/\.json$/i, ""));
  const balance = toNumber(data?.MoneyDeposited, 0);

  return {
    playerId,
    biId: firstText(known?.biId, playerId),
    steamId: firstText(known?.steamId),
    playerName: firstText(known?.playerName),
    balance,
    fileName,
    updatedAt,
  };
}

async function readAtmAccountById(playerId, known) {
  if (!playerId) return null;

  const fileName = `${playerId}.json`;
  const file = await readJsonWithMeta(joinStoragePath(paths.expansionAtm, fileName));
  if (!file.exists || !file.data || typeof file.data !== "object") return null;

  return normalizeAtmAccount({
    data: file.data,
    fileName,
    updatedAt: file.updatedAt,
    known,
  });
}

async function scanAtmAccount(identifiers, known) {
  let files = [];
  try {
    files = await readdir(paths.expansionAtm);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }

  for (const fileName of files.filter((file) => file.endsWith(".json"))) {
    const file = await readJsonWithMeta(joinStoragePath(paths.expansionAtm, fileName));
    if (!file.exists || !file.data || typeof file.data !== "object") continue;

    const playerId = firstText(file.data.PlayerID, fileName.replace(/\.json$/i, ""));
    if (identifiers.has(playerId)) {
      return normalizeAtmAccount({
        data: file.data,
        fileName,
        updatedAt: file.updatedAt,
        known,
      });
    }
  }

  return null;
}

async function readAtmHistory(identifiers) {
  const file = await readJsonWithMeta(joinStoragePath(paths.api, ATM_HISTORY_FILE));
  const entries = Array.isArray(file.data?.entries) ? file.data.entries : [];
  const filtered = entries.filter((entry) => {
    return identifiers.has(firstText(entry.playerId))
      || identifiers.has(firstText(entry.biId))
      || identifiers.has(firstText(entry.steamId));
  });

  return {
    count: filtered.length,
    recent: compactRecent(filtered, 8),
  };
}

async function buildBankSummary({ steamId, biId, playerName }) {
  if (!features.expansionEnabled) {
    return { enabled: false, account: null, historyCount: 0, recentHistory: [] };
  }

  const identifiers = new Set([steamId, biId].filter(Boolean));
  const known = { steamId, biId, playerName };
  let account = null;

  for (const id of identifiers) {
    account = await readAtmAccountById(id, known);
    if (account) break;
  }

  if (!account) {
    account = await scanAtmAccount(identifiers, known);
  }

  if (account?.playerId) identifiers.add(account.playerId);
  if (account?.biId) identifiers.add(account.biId);
  if (account?.steamId) identifiers.add(account.steamId);

  const history = await readAtmHistory(identifiers);

  return {
    enabled: true,
    account,
    historyCount: history.count,
    recentHistory: history.recent,
  };
}

function pickBestPlayerName({ playerMatch, online, inventory, lifeEvents, itemEvents, trades }) {
  return firstText(
    playerMatch?.playerName,
    online?.playerName,
    inventory?.playerName,
    lifeEvents?.recent?.[0]?.playerName,
    itemEvents?.recent?.[0]?.playerName,
    trades?.recent?.[0]?.playerName
  );
}

export async function buildPlayerSupportContext(rawSteamId, playerMatch = null) {
  const steamId = normalizeSteamId(rawSteamId);
  if (!steamId) {
    return {
      steamId: String(rawSteamId || "").trim(),
      matched: false,
      playerName: "",
      biId: "",
    };
  }

  const [onlineSnapshot, inventoryFile, itemEventsFile, lifeEventsFile, tradesFile] = await Promise.all([
    getOnlinePlayersSnapshot().catch(() => null),
    readJsonWithMeta(`${paths.inventories}/${steamId}.json`),
    readJsonWithMeta(`${paths.events}/${steamId}_events.json`),
    readJsonWithMeta(`${paths.lifeEvents}/${steamId}_life.json`),
    readJsonWithMeta(`${paths.trades}/${steamId}_trades.json`),
  ]);

  const online = buildOnlineSummary(onlineSnapshot, steamId);
  const inventory = buildInventorySummary(inventoryFile, steamId);
  const itemEvents = buildEventSummary(itemEventsFile, "events");
  const lifeEvents = buildEventSummary(lifeEventsFile, "events");
  const trades = buildTradeSummary(tradesFile);
  const playerName = pickBestPlayerName({ playerMatch, online, inventory, lifeEvents, itemEvents, trades });
  const biId = firstText(online.biId, inventory.biId, playerMatch?.biId);
  const bank = await buildBankSummary({ steamId, biId, playerName }).catch((err) => ({
    enabled: features.expansionEnabled,
    account: null,
    historyCount: 0,
    recentHistory: [],
    error: err?.message || String(err),
  }));

  return {
    steamId,
    matched: Boolean(playerMatch?.matched || online.found || inventory.exists || lifeEvents.exists || itemEvents.exists || trades.exists),
    playerName,
    biId,
    online,
    inventory,
    itemEvents,
    lifeEvents,
    trades,
    bank,
  };
}
