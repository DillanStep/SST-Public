import { Router } from "express";
import { dirname } from "path";
import { paths, getRuntimeContext } from "../config.js";
import { mkdir, readFile, writeFile } from "../storage/fs.js";

const router = Router();

const MAX_INVENTORY_EVENTS = 100;
const MAX_LIFE_EVENTS = 50;
const MAX_TRADE_EVENTS = 500;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value) {
  return value === undefined || value === null ? "" : String(value);
}

function getTimestamp(body) {
  return asString(body.createdAt || body.timestamp) || new Date().toISOString();
}

function getPosition(body) {
  return [
    toFiniteNumber(body.positionX),
    toFiniteNumber(body.positionY),
    toFiniteNumber(body.positionZ),
  ];
}

function normalizeLifeEventType(eventType, action) {
  const raw = asString(action || eventType).toUpperCase();
  if (raw.includes("DEATH") || raw === "DIED") return "DIED";
  if (raw.includes("RESPAWN")) return "RESPAWNED";
  if (raw.includes("SPAWN")) return "SPAWNED";
  if (raw.includes("DISCONNECT")) return "DISCONNECTED";
  if (raw.includes("CONNECT")) return "CONNECTED";
  return raw || "UNKNOWN";
}

function normalizeTradeEventType(action) {
  const raw = asString(action).toUpperCase();
  if (raw.includes("SALE") || raw.includes("SELL")) return "SALE";
  if (raw.includes("PURCHASE") || raw.includes("BUY")) return "PURCHASE";
  return raw || "TRADE";
}

async function readJsonOrDefault(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function appendInventoryEvent(body, metadata) {
  const playerId = asString(body.steamId);
  const playerName = asString(body.playerName);
  const filePath = `${paths.events}/${playerId}_events.json`;
  const log = await readJsonOrDefault(filePath, {
    playerName,
    playerId,
    events: [],
  });

  log.playerName = log.playerName || playerName;
  log.playerId = log.playerId || playerId;
  log.events = Array.isArray(log.events) ? log.events : [];
  log.events.push({
    timestamp: getTimestamp(body),
    eventType: asString(metadata.action || body.eventType || "InventoryEvent"),
    playerName,
    playerId,
    targetPlayerName: asString(body.targetName),
    targetPlayerId: asString(body.targetSteamId),
    itemClassName: asString(metadata.itemClassName),
    itemDisplayName: asString(metadata.itemDisplayName),
    itemHealth: toFiniteNumber(metadata.itemHealth),
    itemQuantity: toFiniteNumber(metadata.itemQuantity),
    position: getPosition(body),
    weapon: asString(metadata.weapon),
    ammo: asString(metadata.ammo),
    hitZone: asString(metadata.hitZone),
    bodyPart: asString(metadata.bodyPart),
    damageZone: asString(metadata.damageZone),
    hitComponent: asString(metadata.hitComponent),
    damage: toFiniteNumber(metadata.damage),
    distance: toFiniteNumber(metadata.distance),
    speedCoef: toFiniteNumber(metadata.speedCoef),
  });

  while (log.events.length > MAX_INVENTORY_EVENTS) {
    log.events.shift();
  }

  await writeJson(filePath, log);
}

async function appendLifeEvent(body, metadata) {
  const playerId = asString(body.steamId);
  const playerName = asString(body.playerName);
  const filePath = `${paths.lifeEvents}/${playerId}_life.json`;
  const log = await readJsonOrDefault(filePath, {
    playerName,
    playerId,
    events: [],
  });

  log.playerName = log.playerName || playerName;
  log.playerId = log.playerId || playerId;
  log.events = Array.isArray(log.events) ? log.events : [];
  log.events.push({
    timestamp: getTimestamp(body),
    eventType: normalizeLifeEventType(body.eventType, metadata.action),
    playerName,
    playerId,
    targetPlayerName: asString(body.targetName),
    targetPlayerId: asString(body.targetSteamId),
    position: getPosition(body),
    causeOfDeath: asString(metadata.causeOfDeath),
    healthAtDeath: toFiniteNumber(metadata.healthAtDeath, -1),
    weapon: asString(metadata.weapon),
    ammo: asString(metadata.ammo),
    hitZone: asString(metadata.hitZone),
    bodyPart: asString(metadata.bodyPart),
    damageZone: asString(metadata.damageZone),
    hitComponent: asString(metadata.hitComponent),
    damage: toFiniteNumber(metadata.damage),
    distance: toFiniteNumber(metadata.distance),
  });

  while (log.events.length > MAX_LIFE_EVENTS) {
    log.events.shift();
  }

  await writeJson(filePath, log);
}

async function appendTradeEvent(body, metadata) {
  const playerId = asString(body.steamId);
  const playerName = asString(body.playerName);
  const filePath = `${paths.trades}/${playerId}_trades.json`;
  const log = await readJsonOrDefault(filePath, {
    playerName,
    playerId,
    totalPurchases: 0,
    totalSales: 0,
    totalSpent: 0,
    totalEarned: 0,
    trades: [],
  });

  const eventType = normalizeTradeEventType(metadata.action || body.eventType);
  const quantity = Math.max(1, Math.trunc(toFiniteNumber(metadata.quantity, 1)));
  const price = Math.trunc(toFiniteNumber(metadata.price));

  log.playerName = log.playerName || playerName;
  log.playerId = log.playerId || playerId;
  log.trades = Array.isArray(log.trades) ? log.trades : [];
  log.totalPurchases = Number(log.totalPurchases) || 0;
  log.totalSales = Number(log.totalSales) || 0;
  log.totalSpent = Number(log.totalSpent) || 0;
  log.totalEarned = Number(log.totalEarned) || 0;

  log.trades.push({
    timestamp: getTimestamp(body),
    eventType,
    playerName,
    playerId,
    itemClassName: asString(metadata.itemClassName),
    itemDisplayName: asString(metadata.itemDisplayName),
    quantity,
    price,
    traderName: asString(metadata.traderName),
    traderZone: asString(body.location || metadata.traderZone),
    traderPosition: [0, 0, 0],
    playerPosition: getPosition(body),
  });

  if (eventType === "PURCHASE") {
    log.totalPurchases += quantity;
    log.totalSpent += price;
  } else if (eventType === "SALE") {
    log.totalSales += quantity;
    log.totalEarned += price;
  }

  while (log.trades.length > MAX_TRADE_EVENTS) {
    log.trades.shift();
  }

  await writeJson(filePath, log);
}

router.post("/", async (req, res) => {
  const body = asObject(req.body);
  const metadata = asObject(body.metadata);
  const eventType = asString(body.eventType);
  const playerId = asString(body.steamId);
  const playerName = asString(body.playerName);

  if (!eventType || !playerId) {
    return res.status(400).json({
      ok: false,
      error: "eventType and steamId are required.",
    });
  }

  try {
    if (eventType === "InventoryEvent") {
      await appendInventoryEvent(body, metadata);
    } else if (eventType === "TradeEvent") {
      await appendTradeEvent(body, metadata);
    } else {
      await appendLifeEvent(body, metadata);
    }

    const context = getRuntimeContext();
    console.log(`[ModEvent:${context?.id || "default"}] ${eventType} ${playerName || playerId} ${asString(body.summary)}`.trim());

    return res.status(202).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Failed to store mod event.",
      details: err?.message || String(err),
    });
  }
});

export default router;
