import { Router } from "express";
import { readFile, writeFile } from "../storage/fs.js";
import { paths } from "../config.js";

const router = Router();
const grantFile = `${paths.api}/item_grants.json`;

router.post("/", async (req, res) => {
  const grant = {
    playerId: req.body.playerId,
    itemClassName: req.body.itemClassName,
    quantity: req.body.quantity ?? 1,
    health: req.body.health ?? 100,
    processed: false,
    result: ""
  };

  let data = { requests: [] };
  try {
    data = JSON.parse(await readFile(grantFile, "utf8"));
    if (!data.requests) data.requests = [];
  } catch {}

  data.requests.push(grant);
  await writeFile(grantFile, JSON.stringify(data, null, 2));

  res.json({ status: "QUEUED", grant });
});

router.get("/results", async (_, res) => {
  try {
    const results = JSON.parse(
      await readFile(`${paths.api}/item_grants_results.json`, "utf8")
    );
    res.json(results);
  } catch {
    res.status(404).json({ error: "No results yet" });
  }
});

export default router;
