import { Router } from "express";
import { readFile } from "../storage/fs.js";
import { paths } from "../config.js";

const router = Router();

// Get trades for a specific player
router.get("/:playerId", async (req, res) => {
  try {
    const file = `${paths.trades}/${req.params.playerId}_trades.json`;
    const json = JSON.parse(await readFile(file, "utf8"));
    res.json(json);
  } catch {
    res.status(404).json({ error: "Trades not found" });
  }
});

export default router;
