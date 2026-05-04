import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { paths } from "../config.js";
import { readFile, readdir, unlink } from "../storage/fs.js";
import { joinStoragePath } from "../utils/storagePath.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Archive database path
const ARCHIVE_DB_PATH = process.env.ARCHIVE_DB_PATH
  ? path.resolve(process.env.ARCHIVE_DB_PATH)
  : path.join(__dirname, "..", "..", "data", "archive.db");

let archiveDb = null;

// Initialize the archive database
export function initArchiveDb() {
  const dataDir = path.dirname(ARCHIVE_DB_PATH);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  archiveDb = new Database(ARCHIVE_DB_PATH);
  
  // Enable WAL mode for better performance
  archiveDb.pragma("journal_mode = WAL");
  
  // Create archive tables
  archiveDb.exec(`
    -- Trade history
    CREATE TABLE IF NOT EXISTS archived_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      trade_type TEXT NOT NULL,
      trader_name TEXT,
      zone_name TEXT,
      item_class TEXT NOT NULL,
      item_display TEXT,
      quantity INTEGER DEFAULT 1,
      price INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'Roubles',
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP,
      archive_date TEXT NOT NULL
    )
  `);
  
  archiveDb.exec(`
    -- Life events history (deaths, connections, etc.)
    CREATE TABLE IF NOT EXISTS archived_life_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      data TEXT,
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP,
      archive_date TEXT NOT NULL
    )
  `);
  
  archiveDb.exec(`
    -- Item events history (pickups, drops, etc.)
    CREATE TABLE IF NOT EXISTS archived_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      item_class TEXT,
      item_display TEXT,
      quantity INTEGER DEFAULT 1,
      position_x REAL,
      position_y REAL,
      position_z REAL,
      data TEXT,
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP,
      archive_date TEXT NOT NULL
    )
  `);
  
  archiveDb.exec(`
    -- Archive run log
    CREATE TABLE IF NOT EXISTS archive_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_date TEXT NOT NULL,
      trades_archived INTEGER DEFAULT 0,
      life_events_archived INTEGER DEFAULT 0,
      events_archived INTEGER DEFAULT 0,
      files_cleared INTEGER DEFAULT 0,
      duration_ms INTEGER,
      status TEXT DEFAULT 'completed',
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create indexes for common queries
  archiveDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_trades_steam ON archived_trades(steam_id);
    CREATE INDEX IF NOT EXISTS idx_trades_date ON archived_trades(archive_date);
    CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON archived_trades(timestamp);
    CREATE INDEX IF NOT EXISTS idx_trades_item ON archived_trades(item_class);
    
    CREATE INDEX IF NOT EXISTS idx_life_steam ON archived_life_events(steam_id);
    CREATE INDEX IF NOT EXISTS idx_life_date ON archived_life_events(archive_date);
    CREATE INDEX IF NOT EXISTS idx_life_type ON archived_life_events(event_type);
    
    CREATE INDEX IF NOT EXISTS idx_events_steam ON archived_events(steam_id);
    CREATE INDEX IF NOT EXISTS idx_events_date ON archived_events(archive_date);
    CREATE INDEX IF NOT EXISTS idx_events_type ON archived_events(event_type);
  `);
  
  console.log(`Archive database initialized at: ${ARCHIVE_DB_PATH}`);
  return archiveDb;
}

// Get the archive database instance
export function getArchiveDb() {
  if (!archiveDb) {
    initArchiveDb();
  }
  return archiveDb;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasArrayProperty(data, ...keys) {
  return keys.some((key) => Array.isArray(data?.[key]));
}

function normalizePosition(position) {
  if (Array.isArray(position)) {
    return {
      x: toNullableNumber(position[0]),
      y: toNullableNumber(position[1]),
      z: toNullableNumber(position[2]),
    };
  }

  if (typeof position === "string") {
    const parts = position.split(/[,\s]+/).filter(Boolean).map(Number);
    return {
      x: Number.isFinite(parts[0]) ? parts[0] : null,
      y: Number.isFinite(parts[1]) ? parts[1] : null,
      z: Number.isFinite(parts[2]) ? parts[2] : null,
    };
  }

  if (position && typeof position === "object") {
    return {
      x: toNullableNumber(position.x ?? position.X),
      y: toNullableNumber(position.y ?? position.Y),
      z: toNullableNumber(position.z ?? position.Z),
    };
  }

  return { x: null, y: null, z: null };
}

function normalizeTradeType(value) {
  const type = String(value || "").toUpperCase();
  if (type === "BUY" || type === "PURCHASE" || type === "PURCHASED") return "purchase";
  if (type === "SELL" || type === "SALE" || type === "SOLD") return "sale";
  return null;
}

function normalizeTradeRecord(rawTrade, steamId, forcedType = null) {
  if (!rawTrade || typeof rawTrade !== "object") return null;

  const tradeType = normalizeTradeType(forcedType || rawTrade.eventType || rawTrade.tradeType || rawTrade.trade_type);
  const timestamp = firstValue(rawTrade.timestamp, rawTrade.time, rawTrade.createdAt);
  const itemClass = firstValue(rawTrade.itemClassName, rawTrade.itemClass, rawTrade.item_class, rawTrade.className, rawTrade.item);

  if (!tradeType || !timestamp || !itemClass) return null;

  return {
    steam_id: firstValue(rawTrade.playerId, rawTrade.steamId, rawTrade.steam_id, steamId),
    timestamp,
    trade_type: tradeType,
    trader_name: firstValue(rawTrade.traderName, rawTrade.trader_name) || null,
    zone_name: firstValue(rawTrade.traderZone, rawTrade.zoneName, rawTrade.zone_name) || null,
    item_class: itemClass,
    item_display: firstValue(rawTrade.itemDisplayName, rawTrade.itemDisplay, rawTrade.item_display, itemClass) || null,
    quantity: toInteger(rawTrade.quantity, 1) || 1,
    price: toInteger(rawTrade.price, 0),
    currency: firstValue(rawTrade.currency, "Roubles"),
  };
}

function extractTradeRecords(data, steamId) {
  const records = [];

  if (Array.isArray(data?.trades)) {
    for (const trade of data.trades) {
      const record = normalizeTradeRecord(trade, steamId);
      if (record) records.push(record);
    }
  }

  if (Array.isArray(data?.purchases)) {
    for (const purchase of data.purchases) {
      const record = normalizeTradeRecord(purchase, steamId, "PURCHASE");
      if (record) records.push(record);
    }
  }

  if (Array.isArray(data?.sales)) {
    for (const sale of data.sales) {
      const record = normalizeTradeRecord(sale, steamId, "SALE");
      if (record) records.push(record);
    }
  }

  return records;
}

function normalizeLifeEventType(value, fallback = null) {
  const type = String(value || fallback || "").toUpperCase();
  const aliases = {
    DEATH: "DIED",
    DEATHS: "DIED",
    DIED: "DIED",
    CONNECTION: "CONNECTED",
    CONNECTIONS: "CONNECTED",
    CONNECTED: "CONNECTED",
    DISCONNECTION: "DISCONNECTED",
    DISCONNECTIONS: "DISCONNECTED",
    DISCONNECTED: "DISCONNECTED",
    SPAWN: "SPAWNED",
    SPAWNS: "SPAWNED",
    SPAWNED: "SPAWNED",
    RESPAWN: "RESPAWNED",
    RESPAWNED: "RESPAWNED",
  };
  return aliases[type] || type || null;
}

function normalizeLifeEventRecord(rawEvent, steamId, forcedType = null) {
  if (!rawEvent || typeof rawEvent !== "object") return null;

  const timestamp = firstValue(rawEvent.timestamp, rawEvent.time, rawEvent.createdAt);
  const eventType = normalizeLifeEventType(rawEvent.eventType || rawEvent.event_type, forcedType);

  if (!timestamp || !eventType) return null;

  return {
    steam_id: firstValue(rawEvent.playerId, rawEvent.steamId, rawEvent.steam_id, steamId),
    timestamp,
    event_type: eventType,
    data: rawEvent,
  };
}

function extractLifeEventRecords(data, steamId) {
  const records = [];

  if (Array.isArray(data?.events)) {
    for (const event of data.events) {
      const record = normalizeLifeEventRecord(event, steamId);
      if (record) records.push(record);
    }
  }

  const groupedTypes = {
    deaths: "DIED",
    connections: "CONNECTED",
    disconnections: "DISCONNECTED",
    spawns: "SPAWNED",
    respawns: "RESPAWNED",
  };

  for (const [key, type] of Object.entries(groupedTypes)) {
    if (!Array.isArray(data?.[key])) continue;
    for (const event of data[key]) {
      const record = normalizeLifeEventRecord(event, steamId, type);
      if (record) records.push(record);
    }
  }

  return records;
}

function normalizeInventoryEventType(value, fallback = null) {
  const type = String(value || fallback || "").toUpperCase();
  const aliases = {
    PICKUP: "PICKED_UP",
    PICKUPS: "PICKED_UP",
    PICKEDUP: "PICKED_UP",
    PICKED_UP: "PICKED_UP",
    DROP: "DROPPED",
    DROPS: "DROPPED",
    DROPPED: "DROPPED",
    ADD: "ADDED",
    ADDED: "ADDED",
    REMOVE: "REMOVED",
    REMOVED: "REMOVED",
  };
  return aliases[type] || type || null;
}

function normalizeInventoryEventRecord(rawEvent, steamId, forcedType = null) {
  if (!rawEvent || typeof rawEvent !== "object") return null;

  const timestamp = firstValue(rawEvent.timestamp, rawEvent.time, rawEvent.createdAt);
  const eventType = normalizeInventoryEventType(rawEvent.eventType || rawEvent.event_type, forcedType);
  const position = normalizePosition(rawEvent.position);

  if (!timestamp || !eventType) return null;

  return {
    steam_id: firstValue(rawEvent.playerId, rawEvent.steamId, rawEvent.steam_id, steamId),
    timestamp,
    event_type: eventType,
    item_class: firstValue(rawEvent.itemClassName, rawEvent.itemClass, rawEvent.item_class, rawEvent.item, rawEvent.className) || null,
    item_display: firstValue(rawEvent.itemDisplayName, rawEvent.itemDisplay, rawEvent.item_display, rawEvent.displayName) || null,
    quantity: toInteger(firstValue(rawEvent.itemQuantity, rawEvent.quantity), 1) || 1,
    position_x: position.x,
    position_y: position.y,
    position_z: position.z,
    data: rawEvent,
  };
}

function extractInventoryEventRecords(data, steamId) {
  const records = [];

  if (Array.isArray(data?.events)) {
    for (const event of data.events) {
      const record = normalizeInventoryEventRecord(event, steamId);
      if (record) records.push(record);
    }
  }

  const groupedTypes = {
    pickups: "PICKED_UP",
    drops: "DROPPED",
    added: "ADDED",
    removed: "REMOVED",
    crafted: "CRAFTED",
    consumed: "CONSUMED",
    destroyed: "DESTROYED",
  };

  for (const [key, type] of Object.entries(groupedTypes)) {
    if (!Array.isArray(data?.[key])) continue;
    for (const event of data[key]) {
      const record = normalizeInventoryEventRecord(event, steamId, type);
      if (record) records.push(record);
    }
  }

  return records;
}

// Archive trades from JSON files
async function archiveTrades(archiveDate) {
  const db = getArchiveDb();
  const tradesPath = paths.trades;
  let totalArchived = 0;
  const clearableFiles = [];
  const failedFiles = [];

  let files = [];
  try {
    files = (await readdir(tradesPath)).filter((f) => f.endsWith("_trades.json"));
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { archived: 0, files: 0, clearableFiles, failedFiles };
    }
    throw err;
  }
  
  const insertTrade = db.prepare(`
    INSERT INTO archived_trades (steam_id, timestamp, trade_type, trader_name, zone_name, item_class, item_display, quantity, price, currency, archive_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const findExistingTrade = db.prepare(`
    SELECT 1
    FROM archived_trades
    WHERE steam_id = ?
      AND timestamp = ?
      AND trade_type = ?
      AND COALESCE(trader_name, '') = ?
      AND COALESCE(zone_name, '') = ?
      AND item_class = ?
      AND quantity = ?
      AND price = ?
    LIMIT 1
  `);
  
  const insertMany = db.transaction((trades) => {
    let inserted = 0;
    for (const trade of trades) {
      const exists = findExistingTrade.get(
        trade.steam_id,
        trade.timestamp,
        trade.trade_type,
        trade.trader_name || "",
        trade.zone_name || "",
        trade.item_class,
        trade.quantity,
        trade.price
      );

      if (exists) continue;

      insertTrade.run(
        trade.steam_id,
        trade.timestamp,
        trade.trade_type,
        trade.trader_name || null,
        trade.zone_name || null,
        trade.item_class,
        trade.item_display || null,
        trade.quantity || 1,
        trade.price || 0,
        trade.currency || 'Roubles',
        archiveDate
      );
      inserted++;
    }

    return inserted;
  });
  
  for (const file of files) {
    try {
      const filePath = joinStoragePath(tradesPath, file);
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      const steamId = file.replace('_trades.json', '');
      if (!hasArrayProperty(data, "trades", "purchases", "sales")) {
        failedFiles.push(file);
        console.warn(`[Archive] Skipping trade file with unknown schema: ${file}`);
        continue;
      }

      const trades = extractTradeRecords(data, steamId);
      
      if (trades.length > 0) {
        totalArchived += insertMany(trades);
      }

      clearableFiles.push(file);
    } catch (err) {
      failedFiles.push(file);
      console.error(`Error archiving trades from ${file}:`, err.message);
    }
  }
  
  return { archived: totalArchived, files: files.length, clearableFiles, failedFiles };
}

// Archive life events from JSON files
async function archiveLifeEvents(archiveDate) {
  const db = getArchiveDb();
  const lifeEventsPath = paths.lifeEvents;
  let totalArchived = 0;
  const clearableFiles = [];
  const failedFiles = [];

  let files = [];
  try {
    files = (await readdir(lifeEventsPath)).filter((f) => f.endsWith(".json"));
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { archived: 0, files: 0, clearableFiles, failedFiles };
    }
    throw err;
  }
  
  const insertEvent = db.prepare(`
    INSERT INTO archived_life_events (steam_id, timestamp, event_type, data, archive_date)
    VALUES (?, ?, ?, ?, ?)
  `);

  const findExistingEvent = db.prepare(`
    SELECT 1
    FROM archived_life_events
    WHERE steam_id = ?
      AND timestamp = ?
      AND event_type = ?
      AND COALESCE(data, '') = ?
    LIMIT 1
  `);
  
  const insertMany = db.transaction((events) => {
    let inserted = 0;
    for (const event of events) {
      const dataJson = event.data ? JSON.stringify(event.data) : null;
      const exists = findExistingEvent.get(
        event.steam_id,
        event.timestamp,
        event.event_type,
        dataJson || ""
      );

      if (exists) continue;

      insertEvent.run(
        event.steam_id,
        event.timestamp,
        event.event_type,
        dataJson,
        archiveDate
      );
      inserted++;
    }

    return inserted;
  });
  
  for (const file of files) {
    try {
      const filePath = joinStoragePath(lifeEventsPath, file);
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      const steamId = file.replace("_life.json", "").replace(".json", "");
      if (!hasArrayProperty(data, "events", "deaths", "connections", "disconnections", "spawns", "respawns")) {
        failedFiles.push(file);
        console.warn(`[Archive] Skipping life event file with unknown schema: ${file}`);
        continue;
      }

      const events = extractLifeEventRecords(data, steamId);

      if (events.length > 0) {
        totalArchived += insertMany(events);
      }

      clearableFiles.push(file);
    } catch (err) {
      failedFiles.push(file);
      console.error(`Error archiving life events from ${file}:`, err.message);
    }
  }
  
  return { archived: totalArchived, files: files.length, clearableFiles, failedFiles };
}

// Archive item events from JSON files
async function archiveEvents(archiveDate) {
  const db = getArchiveDb();
  const eventsPath = paths.events;
  let totalArchived = 0;
  const clearableFiles = [];
  const failedFiles = [];

  let files = [];
  try {
    files = (await readdir(eventsPath)).filter((f) => f.endsWith(".json"));
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { archived: 0, files: 0, clearableFiles, failedFiles };
    }
    throw err;
  }
  
  const insertEvent = db.prepare(`
    INSERT INTO archived_events (steam_id, timestamp, event_type, item_class, item_display, quantity, position_x, position_y, position_z, data, archive_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const findExistingEvent = db.prepare(`
    SELECT 1
    FROM archived_events
    WHERE steam_id = ?
      AND timestamp = ?
      AND event_type = ?
      AND COALESCE(item_class, '') = ?
      AND quantity = ?
      AND COALESCE(data, '') = ?
    LIMIT 1
  `);
  
  const insertMany = db.transaction((events) => {
    let inserted = 0;
    for (const event of events) {
      const dataJson = event.data ? JSON.stringify(event.data) : null;
      const exists = findExistingEvent.get(
        event.steam_id,
        event.timestamp,
        event.event_type,
        event.item_class || "",
        event.quantity,
        dataJson || ""
      );

      if (exists) continue;

      insertEvent.run(
        event.steam_id,
        event.timestamp,
        event.event_type,
        event.item_class || null,
        event.item_display || null,
        event.quantity || 1,
        event.position_x,
        event.position_y,
        event.position_z,
        dataJson,
        archiveDate
      );
      inserted++;
    }

    return inserted;
  });
  
  for (const file of files) {
    try {
      const filePath = joinStoragePath(eventsPath, file);
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      
      const steamId = file.replace("_events.json", "").replace(".json", "");
      if (!hasArrayProperty(data, "events", "pickups", "drops", "added", "removed", "crafted", "consumed", "destroyed")) {
        failedFiles.push(file);
        console.warn(`[Archive] Skipping inventory event file with unknown schema: ${file}`);
        continue;
      }

      const events = extractInventoryEventRecords(data, steamId);
      
      if (events.length > 0) {
        totalArchived += insertMany(events);
      }

      clearableFiles.push(file);
    } catch (err) {
      failedFiles.push(file);
      console.error(`Error archiving events from ${file}:`, err.message);
    }
  }
  
  return { archived: totalArchived, files: files.length, clearableFiles, failedFiles };
}

// Clear JSON files after archiving. Pass an explicit file list when possible so
// a parse error in one file never causes unrelated data to be deleted.
async function clearJsonFiles(folderPath, filesOrPattern = ".json") {
  let files = [];

  if (Array.isArray(filesOrPattern)) {
    files = filesOrPattern;
  } else {
    try {
      files = (await readdir(folderPath)).filter((f) => f.endsWith(filesOrPattern));
    } catch (err) {
      if (err?.code === "ENOENT") return 0;
      throw err;
    }
  }

  let cleared = 0;

  for (const file of files) {
    try {
      const filePath = joinStoragePath(folderPath, file);
      await unlink(filePath);
      cleared++;
    } catch (err) {
      // If the file disappeared between list and delete, that's fine.
      if (err?.code !== "ENOENT") {
        console.error(`Error deleting ${file}:`, err.message);
      }
    }
  }

  return cleared;
}

// Run the full archive process
export async function runArchive(clearFiles = true) {
  const db = getArchiveDb();
  const startTime = Date.now();
  const archiveDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  const result = {
    archiveDate,
    trades: { archived: 0, files: 0 },
    lifeEvents: { archived: 0, files: 0 },
    events: { archived: 0, files: 0 },
    filesCleared: 0,
    duration: 0,
    status: 'completed',
    error: null
  };
  
  try {
    result.trades = await archiveTrades(archiveDate);
    result.lifeEvents = await archiveLifeEvents(archiveDate);
    result.events = await archiveEvents(archiveDate);
    
    // Clear JSON files if requested
    if (clearFiles) {
      result.filesCleared += await clearJsonFiles(paths.trades, result.trades.clearableFiles);
      result.filesCleared += await clearJsonFiles(paths.lifeEvents, result.lifeEvents.clearableFiles);
      result.filesCleared += await clearJsonFiles(paths.events, result.events.clearableFiles);
    }
    
    result.duration = Date.now() - startTime;
    
    // Log the archive run
    const logRun = db.prepare(`
      INSERT INTO archive_runs (run_date, trades_archived, life_events_archived, events_archived, files_cleared, duration_ms, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    logRun.run(
      archiveDate,
      result.trades.archived,
      result.lifeEvents.archived,
      result.events.archived,
      result.filesCleared,
      result.duration,
      'completed'
    );
    
    console.log(`[Archive] Completed: ${result.trades.archived} trades, ${result.lifeEvents.archived} life events, ${result.events.archived} events archived in ${result.duration}ms`);
    
  } catch (err) {
    result.status = 'error';
    result.error = err.message;
    result.duration = Date.now() - startTime;
    
    // Log the failed run
    const logRun = db.prepare(`
      INSERT INTO archive_runs (run_date, trades_archived, life_events_archived, events_archived, files_cleared, duration_ms, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    logRun.run(
      archiveDate,
      result.trades.archived,
      result.lifeEvents.archived,
      result.events.archived,
      result.filesCleared,
      result.duration,
      'error',
      err.message
    );
    
    console.error(`[Archive] Error:`, err.message);
  }
  
  return result;
}

// Query archived data
export const archiveQueries = {
  // Get archive run history
  getArchiveRuns(limit = 30) {
    const db = getArchiveDb();
    return db.prepare(`
      SELECT * FROM archive_runs 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limit);
  },
  
  // Get archived trades for a player
  getPlayerTrades(steamId, options = {}) {
    const db = getArchiveDb();
    const { limit = 100, offset = 0, startDate, endDate } = options;
    
    let query = `SELECT * FROM archived_trades WHERE steam_id = ?`;
    const params = [steamId];
    
    if (startDate) {
      query += ` AND timestamp >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND timestamp <= ?`;
      params.push(endDate);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    return db.prepare(query).all(...params);
  },
  
  // Get trade statistics
  getTradeStats(options = {}) {
    const db = getArchiveDb();
    const { startDate, endDate, groupBy = 'day' } = options;
    
    let dateFormat = '%Y-%m-%d';
    if (groupBy === 'month') dateFormat = '%Y-%m';
    if (groupBy === 'week') dateFormat = '%Y-W%W';
    
    let query = `
      SELECT 
        strftime('${dateFormat}', timestamp) as period,
        trade_type,
        COUNT(*) as count,
        SUM(quantity) as total_quantity,
        SUM(price) as total_value
      FROM archived_trades
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ` AND timestamp >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND timestamp <= ?`;
      params.push(endDate);
    }
    
    query += ` GROUP BY period, trade_type ORDER BY period DESC`;
    
    return db.prepare(query).all(...params);
  },
  
  // Get top traded items
  getTopItems(options = {}) {
    const db = getArchiveDb();
    const { limit = 20, tradeType, startDate, endDate } = options;
    const normalizedTradeType = tradeType ? (normalizeTradeType(tradeType) || String(tradeType).toLowerCase()) : null;
    
    let query = `
      SELECT 
        item_class,
        item_display,
        trade_type,
        COUNT(*) as trade_count,
        SUM(quantity) as total_quantity,
        SUM(price) as total_value,
        AVG(price) as avg_price
      FROM archived_trades
      WHERE 1=1
    `;
    const params = [];
    
    if (normalizedTradeType) {
      query += ` AND trade_type = ?`;
      params.push(normalizedTradeType);
    }
    if (startDate) {
      query += ` AND timestamp >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND timestamp <= ?`;
      params.push(endDate);
    }
    
    query += ` GROUP BY item_class, trade_type ORDER BY total_value DESC LIMIT ?`;
    params.push(limit);
    
    return db.prepare(query).all(...params);
  },
  
  // Get player life events
  getPlayerLifeEvents(steamId, options = {}) {
    const db = getArchiveDb();
    const { limit = 100, offset = 0, eventType } = options;
    const normalizedEventType = eventType ? normalizeLifeEventType(eventType) : null;
    
    let query = `SELECT * FROM archived_life_events WHERE steam_id = ?`;
    const params = [steamId];
    
    if (normalizedEventType) {
      query += ` AND UPPER(event_type) = ?`;
      params.push(normalizedEventType);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    return db.prepare(query).all(...params);
  },
  
  // Get death statistics
  getDeathStats(options = {}) {
    const db = getArchiveDb();
    const { startDate, endDate, groupBy = 'day' } = options;
    
    let dateFormat = '%Y-%m-%d';
    if (groupBy === 'month') dateFormat = '%Y-%m';
    
    let query = `
      SELECT 
        strftime('${dateFormat}', timestamp) as period,
        COUNT(*) as deaths
      FROM archived_life_events
      WHERE UPPER(event_type) IN ('DIED', 'DEATH')
    `;
    const params = [];
    
    if (startDate) {
      query += ` AND timestamp >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND timestamp <= ?`;
      params.push(endDate);
    }
    
    query += ` GROUP BY period ORDER BY period DESC`;
    
    return db.prepare(query).all(...params);
  },
  
  // Get archive size info
  getArchiveInfo() {
    const db = getArchiveDb();
    
    const trades = db.prepare(`SELECT COUNT(*) as count, MIN(timestamp) as oldest, MAX(timestamp) as newest FROM archived_trades`).get();
    const lifeEvents = db.prepare(`SELECT COUNT(*) as count, MIN(timestamp) as oldest, MAX(timestamp) as newest FROM archived_life_events`).get();
    const events = db.prepare(`SELECT COUNT(*) as count, MIN(timestamp) as oldest, MAX(timestamp) as newest FROM archived_events`).get();
    const runs = db.prepare(`SELECT COUNT(*) as count FROM archive_runs`).get();
    
    // Get file size
    let fileSize = 0;
    try {
      const stats = fs.statSync(ARCHIVE_DB_PATH);
      fileSize = stats.size;
    } catch {
      // Missing archive database is fine during first-run checks.
    }
    
    return {
      database: {
        path: ARCHIVE_DB_PATH,
        sizeBytes: fileSize,
        sizeMB: (fileSize / (1024 * 1024)).toFixed(2)
      },
      trades: {
        count: trades.count,
        oldestRecord: trades.oldest,
        newestRecord: trades.newest
      },
      lifeEvents: {
        count: lifeEvents.count,
        oldestRecord: lifeEvents.oldest,
        newestRecord: lifeEvents.newest
      },
      events: {
        count: events.count,
        oldestRecord: events.oldest,
        newestRecord: events.newest
      },
      archiveRuns: runs.count
    };
  },
  
  // Prune old archived data
  pruneOldData(daysToKeep = 90) {
    const db = getArchiveDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoff = cutoffDate.toISOString();
    
    const deleteTrades = db.prepare(`DELETE FROM archived_trades WHERE timestamp < ?`);
    const deleteLifeEvents = db.prepare(`DELETE FROM archived_life_events WHERE timestamp < ?`);
    const deleteEvents = db.prepare(`DELETE FROM archived_events WHERE timestamp < ?`);
    
    const result = {
      tradesDeleted: deleteTrades.run(cutoff).changes,
      lifeEventsDeleted: deleteLifeEvents.run(cutoff).changes,
      eventsDeleted: deleteEvents.run(cutoff).changes
    };
    
    // Vacuum to reclaim space
    db.exec('VACUUM');
    
    return result;
  }
};

// Schedule daily archive (call this from server.js)
export function scheduleArchive(hour = 4, minute = 0) {
  const now = new Date();
  const scheduledTime = new Date(now);
  scheduledTime.setHours(hour, minute, 0, 0);
  
  // If the time has passed today, schedule for tomorrow
  if (scheduledTime <= now) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }
  
  const delay = scheduledTime.getTime() - now.getTime();
  
  console.log(`[Archive] Scheduled daily archive for ${scheduledTime.toLocaleString()}`);
  
  // Schedule the first run
  setTimeout(() => {
    runArchive(true);
    
    // Then run every 24 hours
    setInterval(() => {
      runArchive(true);
    }, 24 * 60 * 60 * 1000);
  }, delay);
  
  return scheduledTime;
}
