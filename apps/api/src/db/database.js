import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { paths } from '../config.js';

// Create db directory if it doesn't exist
const dbDir = path.dirname(paths.database);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(paths.database);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
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

// Prepared statements for better performance
const insertPosition = db.prepare(`
  INSERT INTO player_positions (player_id, player_name, pos_x, pos_y, pos_z, health, blood, is_alive, is_unconscious, recorded_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getPlayerPositions = db.prepare(`
  SELECT id, player_id, player_name, pos_x, pos_y, pos_z, health, blood, is_alive, is_unconscious, recorded_at, created_at
  FROM player_positions
  WHERE player_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

const getPlayerPositionsInRange = db.prepare(`
  SELECT id, player_id, player_name, pos_x, pos_y, pos_z, health, blood, is_alive, is_unconscious, recorded_at, created_at
  FROM player_positions
  WHERE player_id = ? AND created_at >= ? AND created_at <= ?
  ORDER BY created_at ASC
`);

const getAllPlayersLastPosition = db.prepare(`
  SELECT p.*
  FROM player_positions p
  INNER JOIN (
    SELECT player_id, MAX(created_at) as max_time
    FROM player_positions
    GROUP BY player_id
  ) latest ON p.player_id = latest.player_id AND p.created_at = latest.max_time
  ORDER BY p.created_at DESC
`);

const getDistinctPlayers = db.prepare(`
  SELECT DISTINCT player_id, player_name, 
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen,
    COUNT(*) as position_count
  FROM player_positions
  GROUP BY player_id
  ORDER BY last_seen DESC
`);

const deleteOldPositions = db.prepare(`
  DELETE FROM player_positions
  WHERE created_at < ?
`);

const getPositionStats = db.prepare(`
  SELECT 
    COUNT(*) as total_positions,
    COUNT(DISTINCT player_id) as unique_players,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
  FROM player_positions
`);

// Export database functions
export const positionDb = {
  /**
   * Record a player's position
   */
  recordPosition(playerId, playerName, posX, posY, posZ, health = null, blood = null, isAlive = true, isUnconscious = false, recordedAt = null) {
    const timestamp = recordedAt || new Date().toISOString();
    return insertPosition.run(playerId, playerName, posX, posY, posZ, health, blood, isAlive ? 1 : 0, isUnconscious ? 1 : 0, timestamp);
  },

  /**
   * Batch record multiple positions (for importing from online_players.json)
   */
  recordPositionsBatch(positions) {
    const insertMany = db.transaction((items) => {
      for (const pos of items) {
        insertPosition.run(
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

  /**
   * Get recent positions for a player
   */
  getPlayerPositions(playerId, limit = 100) {
    return getPlayerPositions.all(playerId, limit).map(row => ({
      id: row.id,
      playerId: row.player_id,
      playerName: row.player_name,
      position: { x: row.pos_x, y: row.pos_y, z: row.pos_z },
      health: row.health,
      blood: row.blood,
      isAlive: row.is_alive === 1,
      isUnconscious: row.is_unconscious === 1,
      recordedAt: row.recorded_at,
      timestamp: row.created_at
    }));
  },

  /**
   * Get positions for a player within a time range
   */
  getPlayerPositionsInRange(playerId, startTime, endTime) {
    return getPlayerPositionsInRange.all(playerId, startTime, endTime).map(row => ({
      id: row.id,
      playerId: row.player_id,
      playerName: row.player_name,
      position: { x: row.pos_x, y: row.pos_y, z: row.pos_z },
      health: row.health,
      blood: row.blood,
      isAlive: row.is_alive === 1,
      isUnconscious: row.is_unconscious === 1,
      recordedAt: row.recorded_at,
      timestamp: row.created_at
    }));
  },

  /**
   * Get the last known position of all players
   */
  getAllPlayersLastPosition() {
    return getAllPlayersLastPosition.all().map(row => ({
      id: row.id,
      playerId: row.player_id,
      playerName: row.player_name,
      position: { x: row.pos_x, y: row.pos_y, z: row.pos_z },
      health: row.health,
      blood: row.blood,
      isAlive: row.is_alive === 1,
      isUnconscious: row.is_unconscious === 1,
      recordedAt: row.recorded_at,
      timestamp: row.created_at
    }));
  },

  /**
   * Get list of all players with tracking data
   */
  getTrackedPlayers() {
    return getDistinctPlayers.all().map(row => ({
      playerId: row.player_id,
      playerName: row.player_name,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      positionCount: row.position_count
    }));
  },

  /**
   * Delete positions older than a certain time (for cleanup)
   */
  deleteOldPositions(olderThanTimestamp) {
    return deleteOldPositions.run(olderThanTimestamp);
  },

  /**
   * Get database statistics
   */
  getStats() {
    const stats = getPositionStats.get();
    return {
      totalPositions: stats.total_positions,
      uniquePlayers: stats.unique_players,
      oldestRecord: stats.oldest_record,
      newestRecord: stats.newest_record
    };
  },

  /**
   * Close database connection
   */
  close() {
    db.close();
  }
};

export default db;
