import { Router } from "express";
import { readFile, writeFile } from "../storage/fs.js";
import { paths } from "../config.js";

const router = Router();
const deleteQueueFile = `${paths.api}/item_deletes.json`;
const deleteResultsFile = `${paths.api}/item_deletes_results.json`;

router.get("/:playerId", async (req, res) => {
  try {
    const file = `${paths.inventories}/${req.params.playerId}.json`;
    const json = JSON.parse(await readFile(file, "utf8"));
    res.json(json);
  } catch {
    res.status(404).json({ error: "Inventory not found" });
  }
});

// Delete item from player inventory
router.delete("/:playerId/item", async (req, res) => {
  try {
    const { itemClassName, itemPath, deleteCount = 0 } = req.body;
    
    if (!itemClassName) {
      return res.status(400).json({ error: "itemClassName is required" });
    }
    
    if (!itemPath) {
      return res.status(400).json({ error: "itemPath is required" });
    }
    
    const request = {
      requestId: `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId: req.params.playerId,
      itemClassName,
      itemPath,
      deleteCount: parseInt(deleteCount) || 0,
      requestedAt: new Date().toISOString(),
      processed: false,
      status: "pending",
      result: ""
    };
    
    // Load existing queue or create new
    let queue = { requests: [] };
    try {
      queue = JSON.parse(await readFile(deleteQueueFile, "utf8"));
      if (!queue.requests) queue.requests = [];
    } catch {}
    
    queue.requests.push(request);
    await writeFile(deleteQueueFile, JSON.stringify(queue, null, 2));
    
    res.json({
      status: "queued",
      message: "Item deletion request queued. It will be processed when the player is online.",
      request
    });
  } catch (err) {
    console.error("Error queuing item deletion:", err);
    res.status(500).json({ error: "Failed to queue item deletion" });
  }
});

// Get delete results
router.get("/delete-results/all", async (req, res) => {
  try {
    const results = JSON.parse(await readFile(deleteResultsFile, "utf8"));
    res.json(results);
  } catch {
    res.json({ requests: [] });
  }
});

export default router;
