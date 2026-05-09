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
import {
  addGameTicketReply,
  claimGameTicket,
  closeGameTicket,
  getGameTicket,
  getGameTicketStats,
  isGameTicketId,
  listGameTickets,
} from "../utils/gameTickets.js";

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

function mergeStats(discordStats, gameStats) {
  return {
    total: discordStats.total + gameStats.total,
    open: discordStats.open + gameStats.open,
    closed: discordStats.closed + gameStats.closed,
    sources: {
      discord: discordStats,
      game: gameStats,
    },
  };
}

function sortTickets(tickets) {
  return tickets.sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

async function safeGameStats() {
  try {
    return await getGameTicketStats();
  } catch (err) {
    console.warn(`[Tickets] Failed to load in-game ticket stats: ${err?.message || err}`);
    return { total: 0, open: 0, closed: 0 };
  }
}

async function safeGameTickets(options) {
  try {
    return await listGameTickets(options);
  } catch (err) {
    console.warn(`[Tickets] Failed to load in-game tickets: ${err?.message || err}`);
    return [];
  }
}

router.get("/status", async (_req, res) => {
  const gameStats = await safeGameStats();
  const discordStats = discordTicketsDb.getStats();

  res.json({
    bot: getDiscordBotStatus(),
    stats: mergeStats(discordStats, gameStats),
    panel: discordTicketsDb.getPanel(),
  });
});

router.get("/tickets", async (req, res) => {
  const status = ["open", "closed", "all"].includes(String(req.query.status))
    ? String(req.query.status)
    : "open";
  const limit = parseLimit(req.query.limit);
  const discordTickets = discordTicketsDb.listTickets({
    status,
    limit,
  });
  const [gameTickets, gameStats] = await Promise.all([
    safeGameTickets({ status, limit }),
    safeGameStats(),
  ]);
  const tickets = sortTickets([...discordTickets, ...gameTickets]).slice(0, limit);
  const discordStats = discordTicketsDb.getStats();

  res.json({
    tickets: await Promise.all(tickets.map(enrichTicket)),
    stats: mergeStats(discordStats, gameStats),
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
  if (isGameTicketId(req.params.id)) {
    try {
      const result = await getGameTicket(req.params.id);
      return res.json({
        ticket: await enrichTicket(result.ticket, { includePlayerContext: true }),
        messages: result.messages,
        bot: getDiscordBotStatus(),
      });
    } catch (err) {
      return res.status(err?.status || 404).json({ error: err?.message || "Ticket not found." });
    }
  }

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
    if (isGameTicketId(req.params.id)) {
      const result = await addGameTicketReply(req.params.id, req.body?.message, req.user?.username || "SST Admin");
      return res.json({
        ok: true,
        ticket: await enrichTicket(result.ticket, { includePlayerContext: true }),
        messages: result.messages,
      });
    }

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
    if (isGameTicketId(req.params.id)) {
      const result = await claimGameTicket(req.params.id, req.user?.username || "SST Admin");
      return res.json({
        ok: true,
        ticket: await enrichTicket(result.ticket, { includePlayerContext: true }),
        messages: result.messages,
      });
    }

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
    if (isGameTicketId(req.params.id)) {
      const result = await closeGameTicket(
        req.params.id,
        req.user?.username || "SST Admin",
        req.body?.reason
      );
      return res.json({
        ok: true,
        ticket: await enrichTicket(result.ticket, { includePlayerContext: true }),
        messages: result.messages,
      });
    }

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
