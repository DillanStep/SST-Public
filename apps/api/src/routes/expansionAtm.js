import { randomUUID } from "crypto";
import { Router } from "express";
import { mkdir, readFile, readdir, stat, writeFile } from "../storage/fs.js";
import { joinStoragePath } from "../utils/storagePath.js";
import { paths, features } from "../config.js";

const router = Router();

const ATM_COMMANDS_FILE = "expansion_atm_commands.json";
const ATM_RESULTS_FILE = "expansion_atm_commands_results.json";
const ATM_HISTORY_FILE = "expansion_atm_history.json";
const MAX_ATM_BALANCE = 2147483647;
const MAX_HISTORY_ENTRIES = 5000;
const MAX_REASON_LENGTH = 180;

function isNotFound(err) {
  const code = String(err?.code || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();
  return code === "ENOENT" || message.includes("no such file") || message.includes("not found");
}

function requireExpansion(req, res, next) {
  if (!features.expansionEnabled) {
    return res.status(404).json({
      error: "Expansion mod features are disabled",
      code: "EXPANSION_DISABLED",
      hint: "Set EXPANSION_ENABLED=1 in your .env file to enable Expansion mod features",
    });
  }

  next();
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizePlayerId(playerId) {
  const clean = asString(playerId);
  if (!clean) {
    throw new Error("playerId is required");
  }

  if (clean.includes("/") || clean.includes("\\") || clean.includes("..")) {
    throw new Error("playerId contains invalid path characters");
  }

  return clean;
}

function getAtmFilePath(playerId) {
  return joinStoragePath(paths.expansionAtm, `${sanitizePlayerId(playerId)}.json`);
}

function getApiFilePath(fileName) {
  return joinStoragePath(paths.api, fileName);
}

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getStatIso(fileStat) {
  const modifiedAt = fileStat?.mtimeMs ?? (fileStat?.mtime ? new Date(fileStat.mtime).getTime() : null);
  return Number.isFinite(modifiedAt) ? new Date(modifiedAt).toISOString() : null;
}

function normalizeBalance(value) {
  const balance = Number(value);
  return Number.isFinite(balance) ? Math.max(0, Math.trunc(balance)) : 0;
}

function validateBalance(value) {
  const balance = Number(value);
  if (!Number.isFinite(balance) || !Number.isInteger(balance)) {
    throw new Error("balance must be a whole number");
  }

  if (balance < 0 || balance > MAX_ATM_BALANCE) {
    throw new Error(`balance must be between 0 and ${MAX_ATM_BALANCE}`);
  }

  return balance;
}

function validateCompensationAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error("amount must be a whole number");
  }

  if (amount <= 0 || amount > MAX_ATM_BALANCE) {
    throw new Error(`amount must be between 1 and ${MAX_ATM_BALANCE}`);
  }

  return amount;
}

function normalizeReason(value) {
  const reason = asString(value);
  if (!reason) {
    throw new Error("reason is required");
  }

  return reason.slice(0, MAX_REASON_LENGTH);
}

function mergePlayerMeta(knownPlayers, player) {
  const biId = asString(player?.biId);
  const steamId = asString(player?.steamId || player?.steam64 || player?.playerId);
  const playerName = asString(player?.playerName || player?.name);

  const meta = {
    biId: biId || null,
    steamId: steamId || null,
    playerName: playerName || null,
  };

  for (const key of [biId, steamId].filter(Boolean)) {
    knownPlayers.set(key, {
      ...(knownPlayers.get(key) || {}),
      ...Object.fromEntries(Object.entries(meta).filter(([, value]) => value)),
    });
  }
}

async function readKnownPlayersFromOnline(knownPlayers) {
  try {
    const raw = await readFile(paths.onlinePlayers, "utf8");
    const data = parseJson(raw, {});
    const players = Array.isArray(data?.players) ? data.players : [];
    players.forEach((player) => mergePlayerMeta(knownPlayers, player));
  } catch (err) {
    if (!isNotFound(err)) {
      console.warn(`[Expansion ATM] Could not read online players: ${err?.message || String(err)}`);
    }
  }
}

async function readKnownPlayersFromInventories(knownPlayers) {
  let files = [];
  try {
    files = await readdir(paths.inventories);
  } catch (err) {
    if (!isNotFound(err)) {
      console.warn(`[Expansion ATM] Could not list inventories: ${err?.message || String(err)}`);
    }
    return;
  }

  for (const fileName of files.filter((file) => file.endsWith(".json"))) {
    try {
      const raw = await readFile(joinStoragePath(paths.inventories, fileName), "utf8");
      const data = parseJson(raw, {});
      const players = Array.isArray(data?.players) ? data.players : data?.playerName ? [data] : [];
      players.forEach((player) => mergePlayerMeta(knownPlayers, player));
    } catch (err) {
      if (!isNotFound(err)) {
        console.warn(`[Expansion ATM] Could not read inventory ${fileName}: ${err?.message || String(err)}`);
      }
    }
  }
}

async function buildKnownPlayerMap() {
  const knownPlayers = new Map();
  await readKnownPlayersFromOnline(knownPlayers);
  await readKnownPlayersFromInventories(knownPlayers);
  return knownPlayers;
}

function toAccountResponse({ data, fileName, fileStat, knownPlayers }) {
  const playerId = asString(data?.PlayerID) || fileName.replace(/\.json$/i, "");
  const meta = knownPlayers?.get(playerId) || {};

  return {
    playerId,
    biId: meta.biId || playerId,
    steamId: meta.steamId || null,
    playerName: meta.playerName || null,
    balance: normalizeBalance(data?.MoneyDeposited),
    fileName,
    updatedAt: getStatIso(fileStat),
  };
}

async function readAtmAccount(playerId, knownPlayers = null) {
  const cleanPlayerId = sanitizePlayerId(playerId);
  const fileName = `${cleanPlayerId}.json`;
  const filePath = getAtmFilePath(cleanPlayerId);
  const [raw, fileStat] = await Promise.all([
    readFile(filePath, "utf8"),
    stat(filePath).catch(() => null),
  ]);
  const data = parseJson(raw);

  if (!data || typeof data !== "object") {
    throw new Error(`ATM file is not valid JSON: ${fileName}`);
  }

  return toAccountResponse({ data, fileName, fileStat, knownPlayers });
}

async function readAtmAccountData(playerId) {
  const cleanPlayerId = sanitizePlayerId(playerId);
  const filePath = getAtmFilePath(cleanPlayerId);

  try {
    const raw = await readFile(filePath, "utf8");
    const data = parseJson(raw, {});
    if (!data || typeof data !== "object") {
      throw new Error(`ATM file is not valid JSON: ${cleanPlayerId}.json`);
    }

    return {
      exists: true,
      data,
      previousBalance: normalizeBalance(data.MoneyDeposited),
    };
  } catch (err) {
    if (isNotFound(err)) {
      return {
        exists: false,
        data: {},
        previousBalance: 0,
      };
    }

    throw err;
  }
}

async function writeAtmAccountData(playerId, accountData) {
  await mkdir(paths.expansionAtm, { recursive: true });
  await writeFile(getAtmFilePath(playerId), JSON.stringify(accountData, null, 4), "utf8");
}

async function readAtmResults() {
  try {
    const raw = await readFile(getApiFilePath(ATM_RESULTS_FILE), "utf8");
    const data = parseJson(raw, {});
    return { requests: Array.isArray(data?.requests) ? data.requests : [] };
  } catch (err) {
    if (isNotFound(err)) {
      return { requests: [] };
    }
    throw err;
  }
}

async function readAtmHistory() {
  try {
    const raw = await readFile(getApiFilePath(ATM_HISTORY_FILE), "utf8");
    const data = parseJson(raw, {});
    return { entries: Array.isArray(data?.entries) ? data.entries : [] };
  } catch (err) {
    if (isNotFound(err)) {
      return { entries: [] };
    }
    throw err;
  }
}

async function appendAtmHistory(entry) {
  await mkdir(paths.api, { recursive: true });
  const history = await readAtmHistory();
  history.entries.push(entry);

  while (history.entries.length > MAX_HISTORY_ENTRIES) {
    history.entries.shift();
  }

  await writeFile(getApiFilePath(ATM_HISTORY_FILE), JSON.stringify(history, null, 2), "utf8");
  return entry;
}

async function appendAtmCommand(command) {
  const queuePath = getApiFilePath(ATM_COMMANDS_FILE);
  await mkdir(paths.api, { recursive: true });

  let queue = { requests: [] };
  try {
    const raw = await readFile(queuePath, "utf8");
    const parsed = parseJson(raw, null);
    if (parsed && Array.isArray(parsed.requests)) {
      queue = parsed;
    }
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  queue.requests.push(command);
  await writeFile(queuePath, JSON.stringify(queue, null, 2), "utf8");
  return command;
}

function createAtmCommand(commandType, attrs = {}) {
  return {
    requestId: randomUUID(),
    commandType,
    playerId: attrs.playerId || "",
    balance: Number.isInteger(attrs.balance) ? attrs.balance : 0,
    amount: Number.isInteger(attrs.amount) ? attrs.amount : 0,
    previousBalance: Number.isInteger(attrs.previousBalance) ? attrs.previousBalance : 0,
    reason: attrs.reason || "",
    requestedAt: new Date().toISOString(),
    processed: false,
    status: "pending",
    result: "",
  };
}

function createHistoryEntry({ action, account, previousBalance, balance, amount, reason, command }) {
  const nextBalance = validateBalance(balance);
  const previous = validateBalance(previousBalance);

  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    playerId: account.playerId,
    biId: account.biId,
    steamId: account.steamId || null,
    playerName: account.playerName || null,
    previousBalance: previous,
    balance: nextBalance,
    changeAmount: Number.isInteger(amount) ? amount : nextBalance - previous,
    reason: reason || "",
    requestId: command?.requestId || null,
  };
}

router.use(requireExpansion);

router.get("/", async (req, res) => {
  try {
    const knownPlayers = await buildKnownPlayerMap();
    let files = [];

    try {
      files = await readdir(paths.expansionAtm);
    } catch (err) {
      if (isNotFound(err)) {
        return res.json({
          generatedAt: new Date().toISOString(),
          count: 0,
          path: paths.expansionAtm,
          accounts: [],
        });
      }
      throw err;
    }

    const accounts = [];
    for (const fileName of files.filter((file) => file.endsWith(".json"))) {
      try {
        const filePath = joinStoragePath(paths.expansionAtm, fileName);
        const [raw, fileStat] = await Promise.all([
          readFile(filePath, "utf8"),
          stat(filePath).catch(() => null),
        ]);
        const data = parseJson(raw);

        if (data && typeof data === "object") {
          accounts.push(toAccountResponse({ data, fileName, fileStat, knownPlayers }));
        }
      } catch (err) {
        console.warn(`[Expansion ATM] Could not read ${fileName}: ${err?.message || String(err)}`);
      }
    }

    accounts.sort((a, b) => (b.balance - a.balance) || a.playerId.localeCompare(b.playerId));

    res.json({
      generatedAt: new Date().toISOString(),
      count: accounts.length,
      path: paths.expansionAtm,
      accounts,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to read Expansion ATM balances",
      path: paths.expansionAtm,
      details: err?.message || String(err),
    });
  }
});

router.get("/results", async (req, res) => {
  try {
    res.json(await readAtmResults());
  } catch (err) {
    res.status(500).json({ error: "Failed to read ATM command results", details: err?.message || String(err) });
  }
});

router.post("/reload", async (req, res) => {
  try {
    const command = await appendAtmCommand(createAtmCommand("reloadAtmBalances"));
    res.json({
      success: true,
      command,
      message: "Expansion ATM hot reload queued",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to queue Expansion ATM reload", details: err?.message || String(err) });
  }
});

router.get("/history", async (req, res) => {
  try {
    const playerId = asString(req.query.playerId);
    const history = await readAtmHistory();
    const entries = playerId
      ? history.entries.filter((entry) => entry.playerId === playerId || entry.biId === playerId || entry.steamId === playerId)
      : history.entries;

    res.json({
      generatedAt: new Date().toISOString(),
      count: entries.length,
      entries,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read ATM balance history", details: err?.message || String(err) });
  }
});

router.post("/:playerId/compensate", async (req, res) => {
  try {
    const playerId = sanitizePlayerId(req.params.playerId);
    const amount = validateCompensationAmount(req.body?.amount);
    const reason = normalizeReason(req.body?.reason);
    const current = await readAtmAccountData(playerId);
    const balance = current.previousBalance + amount;

    if (balance > MAX_ATM_BALANCE) {
      return res.status(400).json({
        error: "Failed to compensate ATM balance",
        details: `Compensation would exceed the maximum balance of ${MAX_ATM_BALANCE}`,
      });
    }

    const accountData = {
      ...current.data,
      PlayerID: playerId,
      MoneyDeposited: balance,
    };

    await writeAtmAccountData(playerId, accountData);

    const command = await appendAtmCommand(createAtmCommand("compensateAtmBalance", {
      playerId,
      balance,
      amount,
      previousBalance: current.previousBalance,
      reason,
    }));

    const knownPlayers = await buildKnownPlayerMap();
    const account = toAccountResponse({
      data: accountData,
      fileName: `${playerId}.json`,
      fileStat: { mtime: new Date() },
      knownPlayers,
    });

    const historyEntry = await appendAtmHistory(createHistoryEntry({
      action: "compensate",
      account,
      previousBalance: current.previousBalance,
      balance,
      amount,
      reason,
      command,
    }));

    res.json({
      success: true,
      account,
      command,
      historyEntry,
      message: "Compensation saved and in-game message queued",
    });
  } catch (err) {
    res.status(400).json({
      error: "Failed to compensate ATM balance",
      details: err?.message || String(err),
    });
  }
});

router.get("/:playerId", async (req, res) => {
  try {
    const knownPlayers = await buildKnownPlayerMap();
    res.json({ account: await readAtmAccount(req.params.playerId, knownPlayers) });
  } catch (err) {
    if (isNotFound(err)) {
      return res.status(404).json({ error: "ATM account not found", playerId: req.params.playerId });
    }
    res.status(400).json({ error: "Failed to read ATM account", details: err?.message || String(err) });
  }
});

router.put("/:playerId", async (req, res) => {
  try {
    const playerId = sanitizePlayerId(req.params.playerId);
    const balance = validateBalance(req.body?.balance);
    const reason = asString(req.body?.reason).slice(0, MAX_REASON_LENGTH);
    const current = await readAtmAccountData(playerId);

    const accountData = {
      ...current.data,
      PlayerID: playerId,
      MoneyDeposited: balance,
    };

    await writeAtmAccountData(playerId, accountData);

    const hotReload = req.body?.hotReload !== false;
    const command = hotReload
      ? await appendAtmCommand(createAtmCommand("setAtmBalance", {
        playerId,
        balance,
        amount: balance - current.previousBalance,
        previousBalance: current.previousBalance,
        reason,
      }))
      : null;

    const knownPlayers = await buildKnownPlayerMap();
    const account = toAccountResponse({
      data: accountData,
      fileName: `${playerId}.json`,
      fileStat: { mtime: new Date() },
      knownPlayers,
    });

    const historyEntry = await appendAtmHistory(createHistoryEntry({
      action: "override",
      account,
      previousBalance: current.previousBalance,
      balance,
      amount: balance - current.previousBalance,
      reason,
      command,
    }));

    res.json({
      success: true,
      account,
      command,
      historyEntry,
      message: hotReload
        ? "Balance saved and Expansion ATM hot reload queued"
        : "Balance saved; hot reload was not queued",
    });
  } catch (err) {
    res.status(400).json({
      error: "Failed to update ATM balance",
      details: err?.message || String(err),
    });
  }
});

export default router;
