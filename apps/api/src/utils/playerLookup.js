import { readFile } from "../storage/fs.js";
import { paths } from "../config.js";
import { getOnlinePlayersSnapshot } from "./onlinePlayers.js";

export function normalizeSteamId(value) {
  const steamId = String(value || "").trim();
  return /^\d{17}$/.test(steamId) ? steamId : "";
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function nameFromEventList(events, steamId) {
  if (!Array.isArray(events)) return "";

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || typeof event !== "object") continue;

    if (String(event.playerId || event.steamId || "") === steamId) {
      const name = firstText(event.playerName, event.name);
      if (name) return name;
    }

    if (String(event.targetPlayerId || "") === steamId) {
      const name = firstText(event.targetPlayerName);
      if (name) return name;
    }
  }

  return "";
}

async function readJson(pathValue) {
  try {
    return JSON.parse(await readFile(pathValue, "utf8"));
  } catch {
    return null;
  }
}

async function findOnlinePlayerName(steamId) {
  try {
    const snapshot = await getOnlinePlayersSnapshot();
    const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
    const player = players.find((item) => String(item?.playerId || item?.steamId || "") === steamId);
    return firstText(player?.playerName, player?.name);
  } catch {
    return "";
  }
}

export async function findServerPlayerBySteamId(rawSteamId) {
  const steamId = normalizeSteamId(rawSteamId);
  if (!steamId) {
    return {
      steamId: String(rawSteamId || "").trim(),
      matched: false,
      playerName: "",
    };
  }

  const onlineName = await findOnlinePlayerName(steamId);
  if (onlineName) {
    return { steamId, matched: true, playerName: onlineName, source: "online" };
  }

  const inventory = await readJson(`${paths.inventories}/${steamId}.json`);
  const inventoryName = firstText(
    inventory?.playerName,
    inventory?.name,
    Array.isArray(inventory?.players) ? inventory.players[0]?.playerName : ""
  );
  if (inventoryName || inventory) {
    return { steamId, matched: true, playerName: inventoryName, source: "inventory" };
  }

  const life = await readJson(`${paths.lifeEvents}/${steamId}_life.json`);
  const lifeName = firstText(life?.playerName, nameFromEventList(life?.events, steamId));
  if (lifeName || life) {
    return { steamId, matched: true, playerName: lifeName, source: "life_events" };
  }

  const itemEvents = await readJson(`${paths.events}/${steamId}_events.json`);
  const eventName = firstText(itemEvents?.playerName, nameFromEventList(itemEvents?.events, steamId));
  if (eventName || itemEvents) {
    return { steamId, matched: true, playerName: eventName, source: "item_events" };
  }

  return {
    steamId,
    matched: false,
    playerName: "",
  };
}
