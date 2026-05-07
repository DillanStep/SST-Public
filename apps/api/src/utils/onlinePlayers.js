import { getRuntimeEnv, paths } from "../config.js";
import { readFile, stat } from "../storage/fs.js";
import {
  compareVersions,
  getExpectedModProtocolVersion,
  getExpectedModVersion,
  normalizeVersion,
} from "./appVersion.js";

const DEFAULT_STALE_AFTER_MS = 120000;

export function getOnlinePlayersStaleAfterMs() {
  const value = Number.parseInt(getRuntimeEnv("ONLINE_PLAYERS_STALE_AFTER_MS") || "", 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALE_AFTER_MS;
}

function toTimestamp(value) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isPlayerOnline(player) {
  return player?.isOnline === 1 || player?.isOnline === true;
}

function normalizePlayer(player, forceOffline = false) {
  return {
    ...player,
    isOnline: forceOffline ? false : isPlayerOnline(player),
  };
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

export function getModVersionStatus(snapshot) {
  const expectedVersion = getExpectedModVersion();
  const expectedProtocolVersion = getExpectedModProtocolVersion();
  const reportedVersion = firstString(snapshot?.modVersion, snapshot?.sstVersion, snapshot?.version);
  const reportedProtocolVersion = firstString(
    snapshot?.protocolVersion,
    snapshot?.modProtocolVersion,
    snapshot?.sstProtocolVersion
  );

  const hasRuntimeSource = Boolean(snapshot?.sourceUpdatedAt || snapshot?.generatedAt);
  const sourceIsStale = Boolean(snapshot?.isStale);

  let status = "not-reporting";
  let mismatch = false;
  let message = "No fresh SST mod heartbeat has been received yet.";

  if (hasRuntimeSource && sourceIsStale) {
    status = "stale";
    message = "SST mod heartbeat is stale. Start the DayZ server or wait for the next heartbeat.";
  } else if (hasRuntimeSource && !reportedVersion) {
    status = "missing";
    mismatch = true;
    message = "The running SST mod is not reporting a version. Rebuild and deploy the latest @SST package.";
  } else if (reportedVersion) {
    const comparison = compareVersions(reportedVersion, expectedVersion);
    if (comparison < 0) {
      status = "older";
      mismatch = true;
      message = `The running SST mod is older than the expected mod package (${reportedVersion} vs ${expectedVersion}).`;
    } else if (comparison > 0) {
      status = "newer";
      mismatch = true;
      message = `The running SST mod is newer than the expected mod package (${reportedVersion} vs ${expectedVersion}).`;
    } else {
      status = "match";
      message = `The running SST mod matches the expected mod package (${reportedVersion}).`;
    }
  }

  const protocolMismatch = Boolean(
    reportedProtocolVersion &&
    normalizeVersion(reportedProtocolVersion) !== normalizeVersion(expectedProtocolVersion)
  );

  if (!mismatch && protocolMismatch) {
    status = "protocol-mismatch";
    mismatch = true;
    message = `The running SST mod uses protocol ${reportedProtocolVersion}; this API expects ${expectedProtocolVersion}.`;
  }

  return {
    expectedVersion,
    reportedVersion,
    expectedProtocolVersion,
    reportedProtocolVersion,
    status,
    mismatch,
    isCompatible: status === "match" && !protocolMismatch,
    message,
  };
}

export async function getOnlinePlayersSnapshot() {
  const staleAfterMs = getOnlinePlayersStaleAfterMs();

  try {
    const [raw, fileStat] = await Promise.all([
      readFile(paths.onlinePlayers, "utf8"),
      stat(paths.onlinePlayers).catch(() => null),
    ]);
    const data = JSON.parse(raw);
    const players = Array.isArray(data?.players) ? data.players : [];

    const generatedAtMs = toTimestamp(data?.generatedAt);
    const modifiedAtMs = toTimestamp(fileStat?.mtime);
    const sourceUpdatedAtMs = Math.max(generatedAtMs || 0, modifiedAtMs || 0) || null;
    const sourceUpdatedAt = sourceUpdatedAtMs ? new Date(sourceUpdatedAtMs).toISOString() : null;
    const ageMs = sourceUpdatedAtMs ? Math.max(0, Date.now() - sourceUpdatedAtMs) : null;
    const isStale = ageMs === null || ageMs > staleAfterMs;
    const normalizedPlayers = players.map((player) => normalizePlayer(player, isStale));
    const onlineCount = isStale ? 0 : normalizedPlayers.filter(isPlayerOnline).length;

    return {
      ...data,
      generatedAt: data?.generatedAt || sourceUpdatedAt,
      modVersion: data?.modVersion || data?.sstVersion || data?.version || null,
      protocolVersion: data?.protocolVersion || data?.modProtocolVersion || data?.sstProtocolVersion || null,
      sourceUpdatedAt,
      sourceAgeMs: ageMs,
      staleAfterMs,
      isStale,
      onlineCount,
      players: normalizedPlayers,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        generatedAt: null,
        modVersion: null,
        protocolVersion: null,
        sourceUpdatedAt: null,
        sourceAgeMs: null,
        staleAfterMs,
        isStale: true,
        onlineCount: 0,
        players: [],
      };
    }
    throw error;
  }
}

export function onlineSnapshotMetadata(snapshot) {
  return {
    generatedAt: snapshot?.generatedAt || null,
    modVersion: snapshot?.modVersion || null,
    protocolVersion: snapshot?.protocolVersion || null,
    modStatus: getModVersionStatus(snapshot),
    sourceUpdatedAt: snapshot?.sourceUpdatedAt || null,
    sourceAgeMs: snapshot?.sourceAgeMs ?? null,
    staleAfterMs: snapshot?.staleAfterMs ?? getOnlinePlayersStaleAfterMs(),
    isStale: Boolean(snapshot?.isStale),
    onlineCount: snapshot?.onlineCount || 0,
  };
}
