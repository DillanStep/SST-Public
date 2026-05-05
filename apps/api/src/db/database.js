import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { paths } from "../config.js";

const dbCache = new Map();

function mapPositionRow(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    playerName: row.player_name,
    position: { x: row.pos_x, y: row.pos_y, z: row.pos_z },
    health: row.health,
    blood: row.blood,
    isAlive: row.is_alive === 1,
    isUnconscious: row.is_unconscious === 1,
    recordedAt: row.recorded_at,
    timestamp: row.created_at,
  };
}

function initPositionDb(dbPath) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS player_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      player_name TEXT,
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      pos_z REAL NOT NULL,
      health REAL,
      blood REAL,
      is_alive INTEGER DEFAULT 1,
      is_unconscious INTEGER DEFAULT 0,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_positions_player_id ON player_positions(player_id);
    CREATE INDEX IF NOT EXISTS idx_positions_created_at ON player_positions(created_at);
    CREATE INDEX IF NOT EXISTS idx_positions_player_time ON player_positions(player_id, created_at);
  `);

  return {
    db,
    insertPosition: db.prepare(`
      INSERT INTO player_positions (player_id, player_name, pos_x, pos_y, pos_z, health, blood, is_alive, is_unconscious, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getPlayerPositions: db.prepare(`
      SELECT id, player_id, player_name, pos_x, pos_y, pos_z, health, blood, is_alive, is_unconscious, recorded_at, created_at
      FROM player_positions
      WHERE player_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `),
    getPlayerPositionsInRange: db.prepare(`
      SELECT id, player_id, player_name, pos_x, pos_y, pos_z, health, blood, is_alive, is_unconscious, recorded_at, created_at
      FROM player_positions
      WHERE player_id = ? AND created_at >= ? AND created_at <= ?
      ORDER BY created_at ASC
    `),
    getAllPlayersLastPosition: db.prepare(`
      SELECT p.*
      FROM player_positions p
      INNER JOIN (
        SELECT player_id, MAX(created_at) as max_time
        FROM player_positions
        GROUP BY player_id
      ) latest ON p.player_id = latest.player_id AND p.created_at = latest.max_time
      ORDER BY p.created_at DESC
    `),
    getDistinctPlayers: db.prepare(`
      SELECT DISTINCT player_id, player_name,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen,
        COUNT(*) as position_count
      FROM player_positions
      GROUP BY player_id
      ORDER BY last_seen DESC
    `),
    deleteOldPositions: db.prepare(`
      DELETE FROM player_positions
      WHERE created_at < ?
    `),
    getPositionStats: db.prepare(`
      SELECT
        COUNT(*) as total_positions,
        COUNT(DISTINCT player_id) as unique_players,
        MIN(created_at) as oldest_record,
        MAX(created_at) as newest_record
      FROM player_positions
    `),
  };
}

function getPositionDbHandle() {
  const dbPath = paths.database;

  if (!dbCache.has(dbPath)) {
    dbCache.set(dbPath, initPositionDb(dbPath));
  }

  return dbCache.get(dbPath);
}

export const positionDb = {
  recordPosition(playerId, playerName, posX, posY, posZ, health = null, blood = null, isAlive = true, isUnconscious = false, recordedAt = null) {
    const handle = getPositionDbHandle();
    const timestamp = recordedAt || new Date().toISOString();
    return handle.insertPosition.run(playerId, playerName, posX, posY, posZ, health, blood, isAlive ? 1 : 0, isUnconscious ? 1 : 0, timestamp);
  },

  recordPositionsBatch(positions) {
    const handle = getPositionDbHandle();
    const insertMany = handle.db.transaction((items) => {
      for (const pos of items) {
        handle.insertPosition.run(
          pos.playerId,
          pos.playerName,
          pos.posX,
          pos.posY,
          pos.posZ,
          pos.health ?? null,
          pos.blood ?? null,
          pos.isAlive ? 1 : 0,
          pos.isUnconscious ? 1 : 0,
          pos.recordedAt || new Date().toISOString()
        );
      }
    });
    return insertMany(positions);
  },

  getPlayerPositions(playerId, limit = 100) {
    return getPositionDbHandle().getPlayerPositions.all(playerId, limit).map(mapPositionRow);
  },

  getPlayerPositionsInRange(playerId, startTime, endTime) {
    return getPositionDbHandle().getPlayerPositionsInRange.all(playerId, startTime, endTime).map(mapPositionRow);
  },

  getAllPlayersLastPosition() {
    return getPositionDbHandle().getAllPlayersLastPosition.all().map(mapPositionRow);
  },

  getTrackedPlayers() {
    return getPositionDbHandle().getDistinctPlayers.all().map(row => ({
      playerId: row.player_id,
      playerName: row.player_name,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      positionCount: row.position_count,
    }));
  },

  deleteOldPositions(olderThanTimestamp) {
    return getPositionDbHandle().deleteOldPositions.run(olderThanTimestamp);
  },

  getStats() {
    const stats = getPositionDbHandle().getPositionStats.get();
    return {
      totalPositions: stats.total_positions,
      uniquePlayers: stats.unique_players,
      oldestRecord: stats.oldest_record,
      newestRecord: stats.newest_record,
    };
  },

  close() {
    for (const handle of dbCache.values()) {
      handle.db.close();
    }
    dbCache.clear();
  },
};

export default positionDb;
