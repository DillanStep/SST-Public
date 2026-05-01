import express from "express";
import { runArchive, archiveQueries, getArchiveDb } from "../db/archiveDb.js";
import { requireAdmin } from "../auth/authMiddleware.js";

const router = express.Router();

// Get archive info/stats
router.get("/info", async (req, res) => {
  try {
    const info = archiveQueries.getArchiveInfo();
    res.json(info);
  } catch (err) {
    console.error("Error getting archive info:", err);
    res.status(500).json({ error: "Failed to get archive info" });
  }
});

// Get archive run history
router.get("/runs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const runs = archiveQueries.getArchiveRuns(limit);
    res.json({ runs });
  } catch (err) {
    console.error("Error getting archive runs:", err);
    res.status(500).json({ error: "Failed to get archive runs" });
  }
});

// Trigger manual archive (admin only)
router.post("/run", requireAdmin, async (req, res) => {
  try {
    const clearFiles = req.body.clearFiles !== false; // Default to true
    console.log(`[Archive] Manual archive triggered by admin (clearFiles: ${clearFiles})`);
    
    const result = await runArchive(clearFiles);
    res.json(result);
  } catch (err) {
    console.error("Error running archive:", err);
    res.status(500).json({ error: "Failed to run archive" });
  }
});

// Prune old data (admin only)
router.post("/prune", requireAdmin, async (req, res) => {
  try {
    const daysToKeep = parseInt(req.body.daysToKeep) || 90;
    console.log(`[Archive] Pruning data older than ${daysToKeep} days`);
    
    const result = archiveQueries.pruneOldData(daysToKeep);
    res.json({ 
      message: `Pruned records older than ${daysToKeep} days`,
      ...result 
    });
  } catch (err) {
    console.error("Error pruning archive:", err);
    res.status(500).json({ error: "Failed to prune archive" });
  }
});

// Get trade statistics
router.get("/trades/stats", async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;
    const stats = archiveQueries.getTradeStats({ startDate, endDate, groupBy });
    res.json({ stats });
  } catch (err) {
    console.error("Error getting trade stats:", err);
    res.status(500).json({ error: "Failed to get trade stats" });
  }
});

// Get top traded items
router.get("/trades/top-items", async (req, res) => {
  try {
    const { limit, tradeType, startDate, endDate } = req.query;
    const items = archiveQueries.getTopItems({ 
      limit: parseInt(limit) || 20, 
      tradeType, 
      startDate, 
      endDate 
    });
    res.json({ items });
  } catch (err) {
    console.error("Error getting top items:", err);
    res.status(500).json({ error: "Failed to get top items" });
  }
});

// Get player's archived trades
router.get("/trades/player/:steamId", async (req, res) => {
  try {
    const { steamId } = req.params;
    const { limit, offset, startDate, endDate } = req.query;
    
    const trades = archiveQueries.getPlayerTrades(steamId, {
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      startDate,
      endDate
    });
    
    res.json({ trades, steamId });
  } catch (err) {
    console.error("Error getting player trades:", err);
    res.status(500).json({ error: "Failed to get player trades" });
  }
});

// Get death statistics
router.get("/deaths/stats", async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;
    const stats = archiveQueries.getDeathStats({ startDate, endDate, groupBy });
    res.json({ stats });
  } catch (err) {
    console.error("Error getting death stats:", err);
    res.status(500).json({ error: "Failed to get death stats" });
  }
});

// Get player's archived life events
router.get("/life-events/player/:steamId", async (req, res) => {
  try {
    const { steamId } = req.params;
    const { limit, offset, eventType } = req.query;
    
    const events = archiveQueries.getPlayerLifeEvents(steamId, {
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      eventType
    });
    
    res.json({ events, steamId });
  } catch (err) {
    console.error("Error getting player life events:", err);
    res.status(500).json({ error: "Failed to get player life events" });
  }
});

export default router;
