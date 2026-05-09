import { Router } from "express";
import { discordTicketsDb } from "../db/discordTicketsDb.js";
import {
  claimTicketFromDashboard,
  closeTicketFromDashboard,
  getDiscordBotStatus,
  publishTicketPanel,
  sendTicketReply,
} from "../services/discordBot.js";
import { findServerPlayerBySteamId } from "../utils/playerLookup.js";
import { buildPlayerSupportContext } from "../utils/playerSupportContext.js";

const router = Router();

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 100;
  return Math.max(1, Math.min(Math.trunc(limit), 500));
}

async function enrichTicket(ticket, options = {}) {
  if (!ticket) return null;
  const playerMatch = await findServerPlayerBySteamId(ticket.steamId);
  const enriched = {
    ...ticket,
    playerMatch,
  };

  if (options.includePlayerContext) {
    enriched.playerContext = await buildPlayerSupportContext(ticket.steamId, playerMatch);
  }

  return enriched;
}

router.get("/status", (_req, res) => {
  res.json({
    bot: getDiscordBotStatus(),
    stats: discordTicketsDb.getStats(),
    panel: discordTicketsDb.getPanel(),
  });
});

router.get("/tickets", async (req, res) => {
  const status = ["open", "closed", "all"].includes(String(req.query.status))
    ? String(req.query.status)
    : "open";
  const tickets = discordTicketsDb.listTickets({
    status,
    limit: parseLimit(req.query.limit),
  });

  res.json({
    tickets: await Promise.all(tickets.map(enrichTicket)),
    stats: discordTicketsDb.getStats(),
    bot: getDiscordBotStatus(),
    panel: discordTicketsDb.getPanel(),
  });
});

router.post("/panel/publish", async (req, res) => {
  try {
    const panel = await publishTicketPanel({ channelId: req.body?.channelId });
    res.json({
      ok: true,
      panel,
      bot: getDiscordBotStatus(),
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to publish ticket panel." });
  }
});

router.get("/tickets/:id", async (req, res) => {
  const ticket = discordTicketsDb.getTicketById(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: "Ticket not found." });
  }

  res.json({
    ticket: await enrichTicket(ticket, { includePlayerContext: true }),
    messages: discordTicketsDb.getMessages(ticket.id),
    bot: getDiscordBotStatus(),
  });
});

router.post("/tickets/:id/reply", async (req, res) => {
  try {
    const ticket = await sendTicketReply(req.params.id, req.body?.message, req.user?.username || "SST Admin");
    res.json({
      ok: true,
      ticket: await enrichTicket(ticket, { includePlayerContext: true }),
      messages: discordTicketsDb.getMessages(ticket.id),
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to reply to ticket." });
  }
});

router.post("/tickets/:id/claim", async (req, res) => {
  try {
    const ticket = await claimTicketFromDashboard(req.params.id, req.user?.id, req.user?.username || "SST Admin");
    res.json({
      ok: true,
      ticket: await enrichTicket(ticket, { includePlayerContext: true }),
      messages: discordTicketsDb.getMessages(ticket.id),
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to claim ticket." });
  }
});

router.post("/tickets/:id/close", async (req, res) => {
  try {
    const ticket = await closeTicketFromDashboard(
      req.params.id,
      req.user?.id,
      req.user?.username || "SST Admin",
      req.body?.reason
    );
    res.json({
      ok: true,
      ticket: await enrichTicket(ticket, { includePlayerContext: true }),
      messages: discordTicketsDb.getMessages(ticket.id),
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to close ticket." });
  }
});

export default router;
