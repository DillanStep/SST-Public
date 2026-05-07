import { getAllServerContexts, runWithServerContext } from "../serverContext.js";
import { paths } from "../config.js";
import { readFile, stat } from "../storage/fs.js";
import { consoleUi } from "./consoleUi.js";

const DEFAULT_INTERVAL_MS = 5000;
const MIN_INTERVAL_MS = 1000;

const monitors = [
  {
    key: "onlinePlayers",
    label: "heartbeat",
    fileName: "online_players.json",
    logMissing: true,
    path: () => paths.onlinePlayers,
    describe: describeOnlinePlayers,
  },
  {
    key: "aiPositions",
    label: "AI positions",
    fileName: "ai_positions.json",
    path: () => paths.aiPositions,
    describe: describeAIPositions,
  },
  {
    key: "serverItems",
    label: "item export",
    fileName: "server_items.json",
    logMissing: true,
    path: () => `${paths.api}/server_items.json`,
    describe: describeServerItems,
  },
  {
    key: "grantResults",
    label: "grant results",
    fileName: "item_grants_results.json",
    path: () => `${paths.api}/item_grants_results.json`,
    describe: (data) => describeRequests(data, "grant result"),
  },
  {
    key: "commandResults",
    label: "command results",
    fileName: "player_commands_results.json",
    path: () => `${paths.api}/player_commands_results.json`,
    describe: (data) => describeRequests(data, "command result"),
  },
  {
    key: "itemDeleteResults",
    label: "item delete results",
    fileName: "item_deletes_results.json",
    path: () => `${paths.api}/item_deletes_results.json`,
    describe: (data) => describeRequests(data, "item delete result"),
  },
  {
    key: "vehicleDeleteResults",
    label: "vehicle delete results",
    fileName: "vehicle_delete_results.json",
    path: () => `${paths.api}/vehicle_delete_results.json`,
    describe: (data) => describeRequests(data, "vehicle delete result"),
  },
  {
    key: "keyGrantResults",
    label: "key grant results",
    fileName: "key_grants_results.json",
    path: () => `${paths.api}/key_grants_results.json`,
    describe: (data) => describeRequests(data, "key grant result"),
  },
  {
    key: "expansionAtmResults",
    label: "Expansion ATM results",
    fileName: "expansion_atm_commands_results.json",
    path: () => `${paths.api}/expansion_atm_commands_results.json`,
    describe: (data) => describeRequests(data, "ATM command result"),
  },
];

const stateByContextId = new Map();
let monitorTimer = null;
let monitorRunning = false;

function getIntervalMs() {
  const configured = Number.parseInt(process.env.SST_MOD_ACTIVITY_INTERVAL_MS || "", 10);
  return Number.isFinite(configured) && configured >= MIN_INTERVAL_MS ? configured : DEFAULT_INTERVAL_MS;
}

function getStatSignature(fileStat) {
  const modifiedAt = fileStat?.mtimeMs ?? (fileStat?.mtime ? new Date(fileStat.mtime).getTime() : null);
  const size = typeof fileStat?.size === "number" ? fileStat.size : 0;
  return `${modifiedAt || 0}:${size}`;
}

function getIsoFromStat(fileStat) {
  const modifiedAt = fileStat?.mtimeMs ?? (fileStat?.mtime ? new Date(fileStat.mtime).getTime() : null);
  return Number.isFinite(modifiedAt) ? new Date(modifiedAt).toISOString() : new Date().toISOString();
}

function isNotFound(err) {
  const code = String(err?.code || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();
  return code === "ENOENT" || message.includes("no such file") || message.includes("not found");
}

function countOnlinePlayers(players) {
  return Array.isArray(players)
    ? players.filter((player) => player?.isOnline === 1 || player?.isOnline === true).length
    : 0;
}

function describeOnlinePlayers(data) {
  const players = Array.isArray(data?.players) ? data.players : [];
  const onlineCount = typeof data?.onlineCount === "number" ? data.onlineCount : countOnlinePlayers(players);
  const version = data?.modVersion || data?.sstVersion || data?.version || "unknown version";
  const generatedAt = data?.generatedAt ? ` generated=${data.generatedAt}` : "";

  return {
    summary: `${onlineCount} online / ${players.length} known, mod ${version}${generatedAt}`,
    onlineCount,
  };
}

function describeServerItems(data) {
  const itemCount = typeof data?.itemCount === "number"
    ? data.itemCount
    : Array.isArray(data?.items)
      ? data.items.length
      : 0;

  return {
    summary: `${itemCount.toLocaleString()} items`,
    itemsLoaded: itemCount,
  };
}

function describeAIPositions(data) {
  const ai = Array.isArray(data?.ai) ? data.ai : [];
  const aiCount = typeof data?.aiCount === "number" ? data.aiCount : ai.length;
  const version = data?.modVersion || data?.sstVersion || data?.version || "unknown version";
  const generatedAt = data?.generatedAt ? ` generated=${data.generatedAt}` : "";

  return {
    summary: `${aiCount.toLocaleString()} AI unit${aiCount === 1 ? "" : "s"}, mod ${version}${generatedAt}`,
  };
}

function describeRequests(data, singularLabel) {
  const requests = Array.isArray(data?.requests) ? data.requests : [];
  const processed = requests.filter((request) => request?.processed === true || request?.status === "completed").length;

  return {
    summary: `${requests.length.toLocaleString()} ${singularLabel}${requests.length === 1 ? "" : "s"}${requests.length ? `, ${processed.toLocaleString()} processed` : ""}`,
  };
}

function parseJsonForLog(raw, monitor) {
  try {
    const data = JSON.parse(raw);
    return monitor.describe(data);
  } catch (err) {
    return {
      summary: `updated, but JSON could not be parsed (${err?.message || "invalid JSON"})`,
    };
  }
}

async function checkMonitor(contextState, monitor, context) {
  const filePath = monitor.path();

  try {
    const fileStat = await stat(filePath);
    const signature = getStatSignature(fileStat);
    const previous = contextState.files.get(monitor.key);

    if (previous?.signature === signature) {
      return;
    }

    const raw = await readFile(filePath, "utf8");
    const details = parseJsonForLog(raw, monitor);
    const firstSeen = !previous?.seen;
    const prefix = `[Mod:${context.id}]`;
    const action = firstSeen ? "found" : "received";
    const updatedAt = getIsoFromStat(fileStat);

    console.log(`${prefix} ${monitor.label} ${action}: ${details.summary}`);

    contextState.files.set(monitor.key, {
      signature,
      seen: true,
      missingLogged: false,
    });

    consoleUi.update({
      modLastActivity: updatedAt,
      modLastFile: monitor.fileName,
      ...(typeof details.onlineCount === "number" ? { modOnlineCount: details.onlineCount } : {}),
      ...(typeof details.itemsLoaded === "number" ? { itemsLoaded: details.itemsLoaded } : {}),
    });
  } catch (err) {
    if (!isNotFound(err)) {
      console.warn(`[Mod:${context.id}] Could not read ${monitor.fileName}: ${err?.message || String(err)}`);
      return;
    }

    const previous = contextState.files.get(monitor.key);
    if (monitor.logMissing && !previous?.missingLogged) {
      console.log(`[Mod:${context.id}] Waiting for ${monitor.fileName} at ${filePath}`);
      contextState.files.set(monitor.key, {
        signature: null,
        seen: false,
        missingLogged: true,
      });
    } else if (!previous) {
      contextState.files.set(monitor.key, {
        signature: null,
        seen: false,
        missingLogged: false,
      });
    }
  }
}

async function pollContext(context) {
  const contextState = stateByContextId.get(context.id) || { files: new Map() };
  stateByContextId.set(context.id, contextState);

  await runWithServerContext(context, async () => {
    for (const monitor of monitors) {
      await checkMonitor(contextState, monitor, context);
    }
  });
}

async function pollAllContexts() {
  if (monitorRunning) return;
  monitorRunning = true;

  try {
    for (const context of getAllServerContexts()) {
      await pollContext(context);
    }
  } catch (err) {
    console.warn(`[Mod] Activity monitor failed: ${err?.message || String(err)}`);
  } finally {
    monitorRunning = false;
  }
}

export function startModActivityMonitor() {
  if (process.env.SST_MOD_ACTIVITY_LOG === "0" || monitorTimer) {
    return;
  }

  const intervalMs = getIntervalMs();
  console.log(`[Mod] Activity monitor enabled (${Math.round(intervalMs / 1000)}s interval)`);
  void pollAllContexts();
  monitorTimer = setInterval(() => {
    void pollAllContexts();
  }, intervalMs);
}
