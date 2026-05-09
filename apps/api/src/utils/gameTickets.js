import { mkdir, readFile, readdir, writeFile } from "../storage/fs.js";
import { paths } from "../config.js";
import { getServerContext } from "../serverContext.js";
import { joinStoragePath } from "./storagePath.js";

const GAME_TICKET_PREFIX = "game";
const OPEN_STATUSES = new Set(["open", "in_progress"]);
const CLOSED_STATUSES = new Set(["resolved", "closed"]);

function nowIso() {
  return new Date().toISOString();
}

function ticketsDir() {
  return joinStoragePath(paths.api, "tickets");
}

function isNotFound(error) {
  return error?.code === "ENOENT" || String(error?.message || "").toLowerCase().includes("no such file");
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "in_progress" || status === "resolved" || status === "closed") return status;
  return "open";
}

function encodeGameTicketId(playerId, ticketId) {
  return `${GAME_TICKET_PREFIX}:${encodeURIComponent(String(playerId || ""))}:${encodeURIComponent(String(ticketId || ""))}`;
}

function decodeGameTicketId(id) {
  const parts = String(id || "").split(":");
  if (parts.length < 3 || parts[0] !== GAME_TICKET_PREFIX) {
    throw new Error("Invalid in-game ticket id.");
  }

  return {
    playerId: decodeURIComponent(parts[1]),
    ticketId: decodeURIComponent(parts.slice(2).join(":")),
  };
}

export function isGameTicketId(id) {
  return String(id || "").startsWith(`${GAME_TICKET_PREFIX}:`);
}

function statusMatches(ticket, filter) {
  if (filter === "all") return true;
  if (filter === "closed") return CLOSED_STATUSES.has(ticket.status);
  return OPEN_STATUSES.has(ticket.status);
}

function gameTicketPath(playerId) {
  return joinStoragePath(ticketsDir(), `${playerId}.json`);
}

function mapGameTicket(entry, file, fallbackPlayerId, sourceFile) {
  const playerId = firstText(entry?.playerId, file?.playerId, fallbackPlayerId);
  const playerName = firstText(entry?.playerName, file?.playerName);
  const ticketId = firstText(entry?.ticketId, "ticket");
  const status = normalizeStatus(entry?.status);
  const comments = Array.isArray(entry?.comments) ? entry.comments : [];
  const updatedAt = firstText(entry?.updatedAt, entry?.createdAt);

  return {
    id: encodeGameTicketId(playerId, ticketId),
    source: "game",
    sourceLabel: "In-game",
    externalId: ticketId,
    serverId: getServerContext()?.id || "default",
    status,
    subject: String(entry?.subject || "").trim(),
    steamId: playerId,
    playerName,
    discordUserId: "",
    discordUsername: "",
    channelId: "",
    guildId: "",
    claimedById: "",
    claimedByName: claimedByFromComments(comments),
    closedById: "",
    closedByName: closedByFromComments(comments),
    closeReason: closeReasonFromComments(comments),
    createdAt: firstText(entry?.createdAt, updatedAt),
    updatedAt,
    closedAt: CLOSED_STATUSES.has(status) ? updatedAt : "",
    messageCount: (entry?.body ? 1 : 0) + comments.length,
    body: String(entry?.body || ""),
    sourceFile,
  };
}

function claimedByFromComments(comments) {
  const comment = [...comments].reverse().find((item) => {
    const author = String(item?.author || "").toLowerCase();
    const content = String(item?.content || "").toLowerCase();
    return author === "system" && content.startsWith("claimed by ");
  });
  if (!comment) return "";
  return String(comment.content || "").replace(/^claimed by\s+/i, "").replace(/\.$/, "").trim();
}

function closedByFromComments(comments) {
  const comment = [...comments].reverse().find((item) => {
    const author = String(item?.author || "").toLowerCase();
    const content = String(item?.content || "").toLowerCase();
    return author === "system" && content.startsWith("closed by ");
  });
  if (!comment) return "";
  const match = String(comment.content || "").match(/^closed by\s+(.+?)(?:\.|$)/i);
  return match?.[1]?.trim() || "";
}

function closeReasonFromComments(comments) {
  const comment = [...comments].reverse().find((item) => {
    const author = String(item?.author || "").toLowerCase();
    const content = String(item?.content || "").toLowerCase();
    return author === "system" && content.includes("Reason:");
  });
  if (!comment) return "";
  const match = String(comment.content || "").match(/Reason:\s*(.+)$/i);
  return match?.[1]?.trim() || "";
}

function mapComment(comment, ticket, index) {
  const author = String(comment?.author || "system").trim();
  const lowerAuthor = author.toLowerCase();
  let authorType = "player";
  let authorName = ticket.playerName || "Player";

  if (lowerAuthor === "system") {
    authorType = "system";
    authorName = "SST";
  } else if (lowerAuthor.startsWith("admin:")) {
    authorType = "admin";
    authorName = author.slice("admin:".length).trim() || "SST Admin";
  } else if (lowerAuthor === "admin") {
    authorType = "admin";
    authorName = "SST Admin";
  } else if (author) {
    authorName = author;
  }

  return {
    id: `${ticket.id}:comment:${index}`,
    ticketId: ticket.id,
    authorType,
    authorId: author,
    authorName,
    message: String(comment?.content || ""),
    discordMessageId: "",
    createdAt: firstText(comment?.timestamp, ticket.updatedAt, ticket.createdAt),
  };
}

export function getGameTicketMessages(ticket, rawEntry) {
  const messages = [];

  if (ticket.body) {
    messages.push({
      id: `${ticket.id}:body`,
      ticketId: ticket.id,
      authorType: "player",
      authorId: ticket.steamId,
      authorName: ticket.playerName || "Player",
      message: ticket.body,
      discordMessageId: "",
      createdAt: ticket.createdAt,
    });
  }

  const comments = Array.isArray(rawEntry?.comments) ? rawEntry.comments : [];
  comments.forEach((comment, index) => {
    messages.push(mapComment(comment, ticket, index + 1));
  });

  return messages.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
}

async function readJsonFile(pathValue) {
  return JSON.parse(await readFile(pathValue, "utf8"));
}

async function readTicketFiles() {
  let names = [];
  try {
    names = await readdir(ticketsDir());
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }

  const files = [];
  for (const name of names) {
    if (!String(name).toLowerCase().endsWith(".json")) continue;

    const filePath = joinStoragePath(ticketsDir(), name);
    try {
      const json = await readJsonFile(filePath);
      files.push({
        name,
        path: filePath,
        playerId: String(name).replace(/\.json$/i, ""),
        json,
      });
    } catch (error) {
      console.warn(`[Tickets] Skipping unreadable in-game ticket file ${filePath}: ${error?.message || error}`);
    }
  }

  return files;
}

export async function listGameTickets({ status = "open", limit = 200 } = {}) {
  const files = await readTicketFiles();
  const tickets = [];

  for (const file of files) {
    const entries = Array.isArray(file.json?.tickets) ? file.json.tickets : [];
    for (const entry of entries) {
      const ticket = mapGameTicket(entry, file.json, file.playerId, file.name);
      if (statusMatches(ticket, status)) tickets.push(ticket);
    }
  }

  return tickets
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, limit);
}

export async function getGameTicketStats() {
  const files = await readTicketFiles();
  const stats = { total: 0, open: 0, closed: 0 };

  for (const file of files) {
    const entries = Array.isArray(file.json?.tickets) ? file.json.tickets : [];
    for (const entry of entries) {
      const status = normalizeStatus(entry?.status);
      stats.total += 1;
      if (CLOSED_STATUSES.has(status)) stats.closed += 1;
      else stats.open += 1;
    }
  }

  return stats;
}

async function loadGameTicketForMutation(id) {
  const { playerId, ticketId } = decodeGameTicketId(id);
  const pathValue = gameTicketPath(playerId);
  const file = await readJsonFile(pathValue);
  const tickets = Array.isArray(file?.tickets) ? file.tickets : [];
  const index = tickets.findIndex((ticket) => String(ticket?.ticketId || "") === ticketId);

  if (index === -1) {
    const error = new Error("Ticket not found.");
    error.status = 404;
    throw error;
  }

  return {
    path: pathValue,
    file: {
      ...file,
      playerId: firstText(file?.playerId, playerId),
      tickets,
    },
    entry: tickets[index],
    index,
    sourceFile: `${playerId}.json`,
  };
}

async function saveGameTicketFile(pathValue, file) {
  await mkdir(ticketsDir(), { recursive: true }).catch((error) => {
    if (!isNotFound(error)) throw error;
  });
  await writeFile(pathValue, JSON.stringify(file, null, 2), "utf8");
}

function addComment(entry, author, content, timestamp = nowIso()) {
  if (!Array.isArray(entry.comments)) entry.comments = [];
  entry.comments.push({
    author,
    content,
    timestamp,
  });
  entry.updatedAt = timestamp;
}

function mutationResult(record) {
  const ticket = mapGameTicket(record.entry, record.file, record.file.playerId, record.sourceFile);
  return {
    ticket,
    messages: getGameTicketMessages(ticket, record.entry),
  };
}

export async function getGameTicket(id) {
  const record = await loadGameTicketForMutation(id);
  return mutationResult(record);
}

export async function addGameTicketReply(id, message, adminName = "SST Admin") {
  const text = String(message || "").trim();
  if (!text) throw new Error("Reply message is required.");

  const record = await loadGameTicketForMutation(id);
  if (CLOSED_STATUSES.has(normalizeStatus(record.entry?.status))) {
    throw new Error("Cannot reply to a closed ticket.");
  }

  addComment(record.entry, `admin:${adminName}`, text);
  await saveGameTicketFile(record.path, record.file);
  return mutationResult(record);
}

export async function claimGameTicket(id, adminName = "SST Admin") {
  const record = await loadGameTicketForMutation(id);
  if (CLOSED_STATUSES.has(normalizeStatus(record.entry?.status))) {
    throw new Error("Cannot claim a closed ticket.");
  }

  record.entry.status = "in_progress";
  addComment(record.entry, "system", `Claimed by ${adminName}.`);
  await saveGameTicketFile(record.path, record.file);
  return mutationResult(record);
}

export async function closeGameTicket(id, adminName = "SST Admin", reason = "Closed from SST dashboard") {
  const record = await loadGameTicketForMutation(id);
  record.entry.status = "closed";
  addComment(record.entry, "system", `Closed by ${adminName}. Reason: ${String(reason || "").trim() || "Closed from SST dashboard"}`);
  await saveGameTicketFile(record.path, record.file);
  return mutationResult(record);
}
