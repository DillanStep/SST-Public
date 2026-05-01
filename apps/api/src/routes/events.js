import { Router } from "express";
import { readFile } from "../storage/fs.js";
import { paths } from "../config.js";

const router = Router();

router.get("/:playerId", async (req, res) => {
  try {
    const file = `${paths.events}/${req.params.playerId}_events.json`;
    const json = JSON.parse(await readFile(file, "utf8"));
    res.json(json);
  } catch {
    res.status(404).json({ error: "Events not found" });
  }
});

export default router;
