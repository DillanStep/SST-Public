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
const ARCHIVE_DB_PATH = path.join(__dirname, "..", "..", "data", "archive.db");

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

// Archive trades from JSON files
async function archiveTrades(archiveDate) {
  const db = getArchiveDb();
  const tradesPath = paths.trades;
  let totalArchived = 0;

  let files = [];
  try {
    files = (await readdir(tradesPath)).filter((f) => f.endsWith("_trades.json"));
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { archived: 0, files: 0 };
    }
    throw err;
  }
  
  const insertTrade = db.prepare(`
    INSERT INTO archived_trades (steam_id, timestamp, trade_type, trader_name, zone_name, item_class, item_display, quantity, price, currency, archive_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((trades) => {
    for (const trade of trades) {
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
    }
  });
  
  for (const file of files) {
    try {
      const filePath = joinStoragePath(tradesPath, file);
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      const steamId = file.replace('_trades.json', '');
      const trades = [];

      // Process purchases
      if (data.purchases && Array.isArray(data.purchases)) {
        for (const purchase of data.purchases) {
          trades.push({
            steam_id: steamId,
            timestamp: purchase.timestamp,
            trade_type: 'purchase',
            trader_name: purchase.traderName,
            zone_name: purchase.zoneName,
            item_class: purchase.itemClass,
            item_display: purchase.itemDisplay,
            quantity: purchase.quantity || 1,
            price: purchase.price || 0,
            currency: purchase.currency || 'Roubles'
          });
        }
      }
      
      // Process sales
      if (data.sales && Array.isArray(data.sales)) {
        for (const sale of data.sales) {
          trades.push({
            steam_id: steamId,
            timestamp: sale.timestamp,
            trade_type: 'sale',
            trader_name: sale.traderName,
            zone_name: sale.zoneName,
            item_class: sale.itemClass,
            item_display: sale.itemDisplay,
            quantity: sale.quantity || 1,
            price: sale.price || 0,
            currency: sale.currency || 'Roubles'
          });
        }
      }
      
      if (trades.length > 0) {
        insertMany(trades);
        totalArchived += trades.length;
      }
    } catch (err) {
      console.error(`Error archiving trades from ${file}:`, err.message);
    }
  }
  
  return { archived: totalArchived, files: files.length };
}

// Archive life events from JSON files
async function archiveLifeEvents(archiveDate) {
  const db = getArchiveDb();
  const lifeEventsPath = paths.lifeEvents;
  let totalArchived = 0;

  let files = [];
  try {
    files = (await readdir(lifeEventsPath)).filter((f) => f.endsWith(".json"));
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { archived: 0, files: 0 };
    }
    throw err;
  }
  
  const insertEvent = db.prepare(`
    INSERT INTO archived_life_events (steam_id, timestamp, event_type, data, archive_date)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((events) => {
    for (const event of events) {
      insertEvent.run(
        event.steam_id,
        event.timestamp,
        event.event_type,
        event.data ? JSON.stringify(event.data) : null,
        archiveDate
      );
    }
  });
  
  for (const file of files) {
    try {
      const filePath = joinStoragePath(lifeEventsPath, file);
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      const steamId = file.replace(".json", "");
      const events = [];

      // Process each event type
      const eventTypes = ["deaths", "connections", "disconnections", "spawns"];
      for (const eventType of eventTypes) {
        if (data[eventType] && Array.isArray(data[eventType])) {
          for (const event of data[eventType]) {
            events.push({
              steam_id: steamId,
              timestamp: event.timestamp || new Date().toISOString(),
              event_type: eventType.replace(/s$/, ""), // Remove trailing 's'
              data: event,
            });
          }
        }
      }

      if (events.length > 0) {
        insertMany(events);
        totalArchived += events.length;
      }
    } catch (err) {
      console.error(`Error archiving life events from ${file}:`, err.message);
    }
  }
  
  return { archived: totalArchived, files: files.length };
}

// Archive item events from JSON files
async function archiveEvents(archiveDate) {
  const db = getArchiveDb();
  const eventsPath = paths.events;
  let totalArchived = 0;

  let files = [];
  try {
    files = (await readdir(eventsPath)).filter((f) => f.endsWith(".json"));
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { archived: 0, files: 0 };
    }
    throw err;
  }
  
  const insertEvent = db.prepare(`
    INSERT INTO archived_events (steam_id, timestamp, event_type, item_class, item_display, quantity, position_x, position_y, position_z, data, archive_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((events) => {
    for (const event of events) {
      insertEvent.run(
        event.steam_id,
        event.timestamp,
        event.event_type,
        event.item_class || null,
        event.item_display || null,
        event.quantity || 1,
        event.position_x || null,
        event.position_y || null,
        event.position_z || null,
        event.data ? JSON.stringify(event.data) : null,
        archiveDate
      );
    }
  });
  
  for (const file of files) {
    try {
      const filePath = joinStoragePath(eventsPath, file);
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      
      const steamId = file.replace('.json', '');
      const events = [];
      
      // Process each event type
      const eventTypes = ['pickups', 'drops', 'crafted', 'consumed', 'destroyed'];
      for (const eventType of eventTypes) {
        if (data[eventType] && Array.isArray(data[eventType])) {
          for (const event of data[eventType]) {
            events.push({
              steam_id: steamId,
              timestamp: event.timestamp || new Date().toISOString(),
              event_type: eventType.replace(/s$/, ''),
              item_class: event.itemClass || event.item,
              item_display: event.itemDisplay || event.displayName,
              quantity: event.quantity || 1,
              position_x: event.position?.[0] || null,
              position_y: event.position?.[1] || null,
              position_z: event.position?.[2] || null,
              data: event
            });
          }
        }
      }
      
      if (events.length > 0) {
        insertMany(events);
        totalArchived += events.length;
      }
    } catch (err) {
      console.error(`Error archiving events from ${file}:`, err.message);
    }
  }
  
  return { archived: totalArchived, files: files.length };
}

// Clear JSON files after archiving
async function clearJsonFiles(folderPath, pattern = ".json") {
  let files = [];
  try {
    files = (await readdir(folderPath)).filter((f) => f.endsWith(pattern));
  } catch (err) {
    if (err?.code === "ENOENT") return 0;
    throw err;
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
  
  let result = {
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
      const filePath = joinStoragePath(eventsPath, file);
    result.trades = await archiveTrades(archiveDate);
    result.lifeEvents = await archiveLifeEvents(archiveDate);
    result.events = await archiveEvents(archiveDate);
    
    // Clear JSON files if requested
    if (clearFiles) {
      result.filesCleared += await clearJsonFiles(paths.trades, "_trades.json");
      result.filesCleared += await clearJsonFiles(paths.lifeEvents, ".json");
      result.filesCleared += await clearJsonFiles(paths.events, ".json");
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
        SUM(price * quantity) as total_value
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
    
    let query = `
      SELECT 
        item_class,
        item_display,
        trade_type,
        COUNT(*) as trade_count,
        SUM(quantity) as total_quantity,
        SUM(price * quantity) as total_value,
        AVG(price) as avg_price
      FROM archived_trades
      WHERE 1=1
    `;
    const params = [];
    
    if (tradeType) {
      query += ` AND trade_type = ?`;
      params.push(tradeType);
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
    
    let query = `SELECT * FROM archived_life_events WHERE steam_id = ?`;
    const params = [steamId];
    
    if (eventType) {
      query += ` AND event_type = ?`;
      params.push(eventType);
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
      WHERE event_type = 'death'
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
    } catch (e) {}
    
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
  let scheduledTime = new Date(now);
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
