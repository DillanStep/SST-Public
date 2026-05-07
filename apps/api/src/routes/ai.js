import express from "express";
import { aiSnapshotMetadata, getAiPositionsSnapshot } from "../utils/aiPositions.js";

const router = express.Router();

function asString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function transformAI(unit) {
  const aiId = asString(unit?.aiId || unit?.id || unit?.unitId, "unknown-ai");
  const typeName = asString(unit?.typeName || unit?.className, "Expansion AI");
  const displayName = asString(unit?.displayName || unit?.name, typeName);

  return {
    aiId,
    displayName,
    typeName,
    faction: asString(unit?.faction),
    groupName: asString(unit?.groupName || unit?.groupId),
    lastUpdate: asString(unit?.lastUpdate),
    position: {
      x: asNumber(unit?.posX ?? unit?.position?.x),
      y: asNumber(unit?.posY ?? unit?.position?.y),
      z: asNumber(unit?.posZ ?? unit?.position?.z),
    },
    health: asNumber(unit?.health),
    isAlive: unit?.isAlive !== false,
    isUnconscious: unit?.isUnconscious === true,
  };
}

async function getTransformedSnapshot() {
  const data = await getAiPositionsSnapshot();
  const ai = (data.ai || []).map(transformAI);

  return {
    ...aiSnapshotMetadata(data),
    aiCount: ai.length,
    ai,
  };
}

router.get("/", async (req, res) => {
  try {
    res.json(await getTransformedSnapshot());
  } catch (error) {
    res.status(500).json({ error: "Failed to read AI positions", details: error.message });
  }
});

router.get("/positions", async (req, res) => {
  try {
    res.json(await getTransformedSnapshot());
  } catch (error) {
    res.status(500).json({ error: "Failed to read AI positions", details: error.message });
  }
});

router.get("/positions/all", async (req, res) => {
  try {
    res.json(await getTransformedSnapshot());
  } catch (error) {
    res.status(500).json({ error: "Failed to read AI positions", details: error.message });
  }
});

export default router;
