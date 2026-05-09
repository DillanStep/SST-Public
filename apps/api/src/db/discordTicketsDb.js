import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { paths } from "../config.js";
import { getServerContext } from "../serverContext.js";

const dbCache = new Map();

function resolveDbPath(value) {
  const configuredPath = String(value || "").trim() || "./data/discord_tickets.db";
  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath);
}

function nowIso() {
  return new Date().toISOString();
}

function getServerId() {
  return getServerContext()?.id || "default";
}

function mapTicketRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    serverId: row.server_id || "default",
    status: row.status,
    subject: row.subject || "",
    steamId: row.steam_id,
    playerName: row.player_name || "",
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username || "",
    channelId: row.channel_id || "",
    guildId: row.guild_id || "",
    claimedById: row.claimed_by_id || "",
    claimedByName: row.claimed_by_name || "",
    closedById: row.closed_by_id || "",
    closedByName: row.closed_by_name || "",
    closeReason: row.close_reason || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || "",
    messageCount: row.message_count ?? 0,
  };
}

function mapMessageRow(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorType: row.author_type,
    authorId: row.author_id || "",
    authorName: row.author_name || "",
    message: row.message,
    discordMessageId: row.discord_message_id || "",
    createdAt: row.created_at,
  };
}

function initDiscordTicketsDb(dbPath) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS discord_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'open',
      subject TEXT,
      steam_id TEXT NOT NULL,
      player_name TEXT,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT,
      channel_id TEXT UNIQUE,
      guild_id TEXT,
      claimed_by_id TEXT,
      claimed_by_name TEXT,
      closed_by_id TEXT,
      closed_by_name TEXT,
      close_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS discord_ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      author_type TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      message TEXT NOT NULL,
      discord_message_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ticket_id) REFERENCES discord_tickets(id)
    );

    CREATE TABLE IF NOT EXISTS discord_ticket_panels (
      server_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discord_tickets_status ON discord_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_discord_tickets_server_status ON discord_tickets(server_id, status);
    CREATE INDEX IF NOT EXISTS idx_discord_tickets_steam_id ON discord_tickets(steam_id);
    CREATE INDEX IF NOT EXISTS idx_discord_tickets_channel_id ON discord_tickets(channel_id);
    CREATE INDEX IF NOT EXISTS idx_discord_messages_ticket_id ON discord_ticket_messages(ticket_id);
  `);

  const columns = db.prepare("PRAGMA table_info(discord_tickets)").all().map((column) => column.name);
  if (!columns.includes("server_id")) {
    db.exec("ALTER TABLE discord_tickets ADD COLUMN server_id TEXT NOT NULL DEFAULT 'default'");
    db.exec("CREATE INDEX IF NOT EXISTS idx_discord_tickets_server_status ON discord_tickets(server_id, status)");
  }

  return {
    db,
    insertTicket: db.prepare(`
      INSERT INTO discord_tickets (
        server_id, status, subject, steam_id, player_name, discord_user_id, discord_username,
        channel_id, guild_id, created_at, updated_at
      )
      VALUES (@serverId, 'open', @subject, @steamId, @playerName, @discordUserId, @discordUsername,
        @channelId, @guildId, @createdAt, @updatedAt)
    `),
    setChannel: db.prepare(`
      UPDATE discord_tickets
      SET channel_id = @channelId, updated_at = @updatedAt
      WHERE id = @id AND server_id = @serverId
    `),
    getTicketById: db.prepare(`
      SELECT t.*, COUNT(m.id) AS message_count
      FROM discord_tickets t
      LEFT JOIN discord_ticket_messages m ON m.ticket_id = t.id
      WHERE t.id = ? AND t.server_id = ?
      GROUP BY t.id
    `),
    getTicketByChannelId: db.prepare(`
      SELECT t.*, COUNT(m.id) AS message_count
      FROM discord_tickets t
      LEFT JOIN discord_ticket_messages m ON m.ticket_id = t.id
      WHERE t.channel_id = ? AND t.server_id = ?
      GROUP BY t.id
    `),
    listTickets: db.prepare(`
      SELECT t.*, COUNT(m.id) AS message_count
      FROM discord_tickets t
      LEFT JOIN discord_ticket_messages m ON m.ticket_id = t.id
      WHERE t.server_id = ? AND (? = 'all' OR t.status = ?)
      GROUP BY t.id
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 ELSE 1 END,
        t.updated_at DESC
      LIMIT ?
    `),
    insertMessage: db.prepare(`
      INSERT INTO discord_ticket_messages (
        ticket_id, author_type, author_id, author_name, message, discord_message_id, created_at
      )
      VALUES (@ticketId, @authorType, @authorId, @authorName, @message, @discordMessageId, @createdAt)
    `),
    getMessages: db.prepare(`
      SELECT id, ticket_id, author_type, author_id, author_name, message, discord_message_id, created_at
      FROM discord_ticket_messages
      WHERE ticket_id = ?
      ORDER BY created_at ASC, id ASC
    `),
    claimTicket: db.prepare(`
      UPDATE discord_tickets
      SET claimed_by_id = @claimedById,
          claimed_by_name = @claimedByName,
          updated_at = @updatedAt
      WHERE id = @id AND server_id = @serverId AND status = 'open'
    `),
    closeTicket: db.prepare(`
      UPDATE discord_tickets
      SET status = 'closed',
          closed_by_id = @closedById,
          closed_by_name = @closedByName,
          close_reason = @closeReason,
          closed_at = @closedAt,
          updated_at = @closedAt
      WHERE id = @id AND server_id = @serverId AND status != 'closed'
    `),
    touchTicket: db.prepare(`
      UPDATE discord_tickets
      SET updated_at = ?
      WHERE id = ? AND server_id = ?
    `),
    getStats: db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM discord_tickets
      WHERE server_id = ?
    `),
    getPanel: db.prepare(`
      SELECT server_id, channel_id, message_id, updated_at
      FROM discord_ticket_panels
      WHERE server_id = ?
    `),
    upsertPanel: db.prepare(`
      INSERT INTO discord_ticket_panels (server_id, channel_id, message_id, updated_at)
      VALUES (@serverId, @channelId, @messageId, @updatedAt)
      ON CONFLICT(server_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        message_id = excluded.message_id,
        updated_at = excluded.updated_at
    `),
  };
}

function getHandle() {
  const dbPath = resolveDbPath(paths.discordTickets);
  if (!dbCache.has(dbPath)) {
    dbCache.set(dbPath, initDiscordTicketsDb(dbPath));
  }
  return dbCache.get(dbPath);
}

export const discordTicketsDb = {
  createTicket(ticket) {
    const handle = getHandle();
    const timestamp = nowIso();
    const result = handle.insertTicket.run({
      subject: ticket.subject || "",
      serverId: getServerId(),
      steamId: ticket.steamId,
      playerName: ticket.playerName || "",
      discordUserId: ticket.discordUserId,
      discordUsername: ticket.discordUsername || "",
      channelId: ticket.channelId || null,
      guildId: ticket.guildId || "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return this.getTicketById(result.lastInsertRowid);
  },

  setTicketChannel(id, channelId) {
    getHandle().setChannel.run({ id, channelId, serverId: getServerId(), updatedAt: nowIso() });
    return this.getTicketById(id);
  },

  getTicketById(id) {
    return mapTicketRow(getHandle().getTicketById.get(Number(id), getServerId()));
  },

  getTicketByChannelId(channelId) {
    return mapTicketRow(getHandle().getTicketByChannelId.get(String(channelId), getServerId()));
  },

  listTickets({ status = "open", limit = 100 } = {}) {
    const normalizedStatus = status === "closed" || status === "all" ? status : "open";
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return getHandle().listTickets.all(getServerId(), normalizedStatus, normalizedStatus, normalizedLimit).map(mapTicketRow);
  },

  addMessage(message) {
    const handle = getHandle();
    const result = handle.insertMessage.run({
      ticketId: Number(message.ticketId),
      authorType: message.authorType,
      authorId: message.authorId || "",
      authorName: message.authorName || "",
      message: message.message,
      discordMessageId: message.discordMessageId || "",
      createdAt: message.createdAt || nowIso(),
    });
    handle.touchTicket.run(nowIso(), Number(message.ticketId), getServerId());
    return {
      id: result.lastInsertRowid,
      ...message,
      createdAt: message.createdAt || nowIso(),
    };
  },

  getMessages(ticketId) {
    return getHandle().getMessages.all(Number(ticketId)).map(mapMessageRow);
  },

  claimTicket(id, claimedById, claimedByName) {
    getHandle().claimTicket.run({
      id: Number(id),
      serverId: getServerId(),
      claimedById,
      claimedByName,
      updatedAt: nowIso(),
    });
    return this.getTicketById(id);
  },

  closeTicket(id, closedById, closedByName, closeReason = "") {
    getHandle().closeTicket.run({
      id: Number(id),
      serverId: getServerId(),
      closedById,
      closedByName,
      closeReason,
      closedAt: nowIso(),
    });
    return this.getTicketById(id);
  },

  getStats() {
    const row = getHandle().getStats.get(getServerId());
    return {
      total: row?.total || 0,
      open: row?.open || 0,
      closed: row?.closed || 0,
    };
  },

  getPanel() {
    const row = getHandle().getPanel.get(getServerId());
    if (!row) return null;
    return {
      serverId: row.server_id,
      channelId: row.channel_id,
      messageId: row.message_id,
      updatedAt: row.updated_at,
    };
  },

  savePanel(channelId, messageId) {
    const panel = {
      serverId: getServerId(),
      channelId,
      messageId,
      updatedAt: nowIso(),
    };
    getHandle().upsertPanel.run(panel);
    return panel;
  },

  close() {
    for (const handle of dbCache.values()) {
      handle.db.close();
    }
    dbCache.clear();
  },
};

export default discordTicketsDb;
