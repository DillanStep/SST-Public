import { Router } from "express";
import { readFile, writeFile } from "../storage/fs.js";
import { paths } from "../config.js";

const router = Router();
const commandFile = `${paths.api}/player_commands.json`;
const resultsFile = `${paths.api}/player_commands_results.json`;

// Heal a player
router.post("/heal", async (req, res) => {
  const command = {
    playerId: req.body.playerId,
    commandType: "heal",
    value: req.body.health ?? 100,
    posX: 0,
    posY: 0,
    posZ: 0,
    processed: false,
    result: ""
  };

  let data = { requests: [] };
  try {
    data = JSON.parse(await readFile(commandFile, "utf8"));
    if (!data.requests) data.requests = [];
  } catch {}

  data.requests.push(command);
  await writeFile(commandFile, JSON.stringify(data, null, 2));

  res.json({ status: "QUEUED", command });
});

// Teleport a player
router.post("/teleport", async (req, res) => {
  const { playerId, x, y, z } = req.body;
  
  if (!playerId) {
    return res.status(400).json({ error: "playerId is required" });
  }
  
  if (x === undefined || z === undefined) {
    return res.status(400).json({ error: "x and z coordinates are required" });
  }

  const command = {
    playerId,
    commandType: "teleport",
    value: 0,
    posX: x,
    posY: y ?? 0, // Let the mod calculate surface Y if 0
    posZ: z,
    processed: false,
    result: ""
  };

  let data = { requests: [] };
  try {
    data = JSON.parse(await readFile(commandFile, "utf8"));
    if (!data.requests) data.requests = [];
  } catch {}

  data.requests.push(command);
  await writeFile(commandFile, JSON.stringify(data, null, 2));

  res.json({ status: "QUEUED", command });
});

// Get command results
router.get("/results", async (_, res) => {
  try {
    const results = JSON.parse(await readFile(resultsFile, "utf8"));
    res.json(results);
  } catch {
    res.json({ requests: [] });
  }
});

// Get pending commands
router.get("/pending", async (_, res) => {
  try {
    const data = JSON.parse(await readFile(commandFile, "utf8"));
    res.json(data);
  } catch {
    res.json({ requests: [] });
  }
});

// Send a message to a specific player
router.post("/message", async (req, res) => {
  const { playerId, message, messageType } = req.body;
  
  if (!playerId) {
    return res.status(400).json({ error: "playerId is required" });
  }
  
  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "message is required" });
  }

  const command = {
    playerId,
    commandType: "message",
    value: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
    message: message.trim(),
    messageType: messageType || "notification", // "notification", "chat", or "both"
    processed: false,
    result: ""
  };

  let data = { requests: [] };
  try {
    data = JSON.parse(await readFile(commandFile, "utf8"));
    if (!data.requests) data.requests = [];
  } catch {}

  data.requests.push(command);
  await writeFile(commandFile, JSON.stringify(data, null, 2));

  res.json({ status: "QUEUED", command });
});

// Broadcast a message to all players
router.post("/broadcast", async (req, res) => {
  const { message, messageType } = req.body;
  
  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "message is required" });
  }

  const command = {
    playerId: "all",
    commandType: "broadcast",
    value: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
    message: message.trim(),
    messageType: messageType || "notification", // "notification", "chat", or "both"
    processed: false,
    result: ""
  };

  let data = { requests: [] };
  try {
    data = JSON.parse(await readFile(commandFile, "utf8"));
    if (!data.requests) data.requests = [];
  } catch {}

  data.requests.push(command);
  await writeFile(commandFile, JSON.stringify(data, null, 2));

  res.json({ status: "QUEUED", command });
});

export default router;
