import { getRuntimeEnv, paths } from "../config.js";
import { readFile, stat } from "../storage/fs.js";

const DEFAULT_STALE_AFTER_MS = 120000;

export function getAiPositionsStaleAfterMs() {
  const value = Number.parseInt(getRuntimeEnv("AI_POSITIONS_STALE_AFTER_MS") || "", 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALE_AFTER_MS;
}

function toTimestamp(value) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function normalizeBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0" || text === "") return false;
  }
  return Boolean(value);
}

function isNotFound(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "ENOENT" || message.includes("no such file") || message.includes("not found");
}

function readAIArray(data) {
  if (Array.isArray(data?.ai)) return data.ai;
  if (Array.isArray(data?.units)) return data.units;
  if (Array.isArray(data?.positions)) return data.positions;
  return [];
}

function normalizeAI(unit) {
  return {
    ...unit,
    isAlive: normalizeBoolean(unit?.isAlive),
    isUnconscious: normalizeBoolean(unit?.isUnconscious),
  };
}

export async function getAiPositionsSnapshot() {
  const staleAfterMs = getAiPositionsStaleAfterMs();

  try {
    const [raw, fileStat] = await Promise.all([
      readFile(paths.aiPositions, "utf8"),
      stat(paths.aiPositions).catch(() => null),
    ]);

    const data = JSON.parse(raw);
    const generatedAtMs = toTimestamp(data?.generatedAt);
    const modifiedAtMs = toTimestamp(fileStat?.mtime);
    const sourceUpdatedAtMs = Math.max(generatedAtMs || 0, modifiedAtMs || 0) || null;
    const sourceUpdatedAt = sourceUpdatedAtMs ? new Date(sourceUpdatedAtMs).toISOString() : null;
    const sourceAgeMs = sourceUpdatedAtMs ? Math.max(0, Date.now() - sourceUpdatedAtMs) : null;
    const isStale = sourceAgeMs === null || sourceAgeMs > staleAfterMs;
    const ai = isStale ? [] : readAIArray(data).map(normalizeAI);

    return {
      ...data,
      generatedAt: data?.generatedAt || sourceUpdatedAt,
      modVersion: data?.modVersion || data?.sstVersion || data?.version || null,
      protocolVersion: data?.protocolVersion || data?.modProtocolVersion || data?.sstProtocolVersion || null,
      sourceUpdatedAt,
      sourceAgeMs,
      staleAfterMs,
      isStale,
      aiCount: ai.length,
      ai,
    };
  } catch (error) {
    if (isNotFound(error)) {
      return {
        generatedAt: null,
        modVersion: null,
        protocolVersion: null,
        sourceUpdatedAt: null,
        sourceAgeMs: null,
        staleAfterMs,
        isStale: true,
        aiCount: 0,
        ai: [],
      };
    }
    throw error;
  }
}

export function aiSnapshotMetadata(snapshot) {
  return {
    generatedAt: snapshot?.generatedAt || null,
    modVersion: snapshot?.modVersion || null,
    protocolVersion: snapshot?.protocolVersion || null,
    sourceUpdatedAt: snapshot?.sourceUpdatedAt || null,
    sourceAgeMs: snapshot?.sourceAgeMs ?? null,
    staleAfterMs: snapshot?.staleAfterMs ?? getAiPositionsStaleAfterMs(),
    isStale: Boolean(snapshot?.isStale),
    aiCount: snapshot?.aiCount || 0,
  };
}
