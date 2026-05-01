import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { resolveEnvPathForWrite, upsertEnvVar } from "../utils/envFile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - stored in the API directory
const DB_PATH = path.join(__dirname, "..", "..", "data", "auth.db");

let db = null;

// Initialize the database
export async function initAuthDb() {
  const dataDir = path.dirname(DB_PATH);
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  db = new Database(DB_PATH);
  
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login TEXT,
      is_active INTEGER DEFAULT 1
    )
  `);
  
  // Create sessions table for tracking active sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Create audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Optional: bootstrap an initial admin if no users exist
  const userCountRow = db.prepare("SELECT COUNT(1) AS count FROM users").get();
  const userCount = userCountRow?.count ?? 0;

  const autoCreateAdminRaw = process.env.SST_AUTO_CREATE_ADMIN;
  const autoCreateAdmin =
    autoCreateAdminRaw === "1" ||
    autoCreateAdminRaw === "true" ||
    autoCreateAdminRaw === "yes";

  if (userCount === 0) {
    if (autoCreateAdmin) {
      const username = (process.env.INITIAL_ADMIN_USERNAME || "admin").trim();
      const password =
        process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(16).toString("hex");

      const hashedPassword = bcrypt.hashSync(password, 12);
      db.prepare(`
        INSERT INTO users (username, password, role)
        VALUES (?, ?, ?)
      `).run(username, hashedPassword, "admin");

      // Persist to .env so the user can find it later
      try {
        const envPath = resolveEnvPathForWrite();
        upsertEnvVar(envPath, "INITIAL_ADMIN_USERNAME", username);
        upsertEnvVar(envPath, "INITIAL_ADMIN_PASSWORD", password);
      } catch {
        // Non-fatal
      }

      console.log("═".repeat(72));
      console.log("No users existed - bootstrapped initial admin account.");
      console.log(`INITIAL_ADMIN_USERNAME=${username}`);
      console.log(`INITIAL_ADMIN_PASSWORD=${password}`);
      console.log("(Change this password immediately after login.)");
      console.log("═".repeat(72));
    } else {
      console.log("[Auth] No users exist yet. Use POST /auth/setup to create the first admin.");
      console.log("       Or set SST_AUTO_CREATE_ADMIN=1 to auto-bootstrap credentials.");
    }
  }
  
  console.log("Auth database initialized at:", DB_PATH);
  return db;
}

// Get database instance
export function getAuthDb() {
  if (!db) {
    throw new Error("Auth database not initialized. Call initAuthDb() first.");
  }
  return db;
}

// User operations
export const userOps = {
  // Count all users
  count() {
    const row = getAuthDb().prepare("SELECT COUNT(1) AS count FROM users").get();
    return row?.count ?? 0;
  },

  // Get user by username
  getByUsername(username) {
    return getAuthDb().prepare("SELECT * FROM users WHERE username = ?").get(username);
  },
  
  // Get user by ID
  getById(id) {
    return getAuthDb().prepare("SELECT id, username, role, created_at, updated_at, last_login, is_active FROM users WHERE id = ?").get(id);
  },
  
  // Get all users (without passwords)
  getAll() {
    return getAuthDb().prepare("SELECT id, username, role, created_at, updated_at, last_login, is_active FROM users ORDER BY username").all();
  },
  
  // Create user
  create(username, password, role = "viewer") {
    const hashedPassword = bcrypt.hashSync(password, 12);
    const result = getAuthDb().prepare(`
      INSERT INTO users (username, password, role) 
      VALUES (?, ?, ?)
    `).run(username, hashedPassword, role);
    return result.lastInsertRowid;
  },
  
  // Update user
  update(id, updates) {
    const allowedFields = ["username", "role", "is_active"];
    const setClause = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (setClause.length === 0) return false;
    
    setClause.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);
    
    const result = getAuthDb().prepare(`
      UPDATE users SET ${setClause.join(", ")} WHERE id = ?
    `).run(...values);
    
    return result.changes > 0;
  },
  
  // Update password
  updatePassword(id, newPassword) {
    const hashedPassword = bcrypt.hashSync(newPassword, 12);
    const result = getAuthDb().prepare(`
      UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(hashedPassword, id);
    return result.changes > 0;
  },
  
  // Delete user
  delete(id) {
    const result = getAuthDb().prepare("DELETE FROM users WHERE id = ?").run(id);
    return result.changes > 0;
  },
  
  // Verify password
  verifyPassword(username, password) {
    const user = this.getByUsername(username);
    if (!user || !user.is_active) return null;
    
    if (bcrypt.compareSync(password, user.password)) {
      // Update last login
      getAuthDb().prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
      return { id: user.id, username: user.username, role: user.role };
    }
    return null;
  }
};

// Session operations
export const sessionOps = {
  // Create session
  create(userId, token, expiresAt, ipAddress, userAgent) {
    getAuthDb().prepare(`
      INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, token, expiresAt, ipAddress, userAgent);
  },
  
  // Get session by token
  getByToken(token) {
    return getAuthDb().prepare(`
      SELECT s.*, u.username, u.role, u.is_active 
      FROM sessions s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);
  },
  
  // Delete session
  delete(token) {
    getAuthDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  },
  
  // Delete all sessions for user
  deleteAllForUser(userId) {
    getAuthDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  },
  
  // Clean expired sessions
  cleanExpired() {
    getAuthDb().prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  }
};

// Audit log operations
export const auditOps = {
  log(userId, action, details, ipAddress) {
    getAuthDb().prepare(`
      INSERT INTO audit_log (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(userId, action, details, ipAddress);
  },
  
  getRecent(limit = 100) {
    return getAuthDb().prepare(`
      SELECT a.*, u.username 
      FROM audit_log a 
      LEFT JOIN users u ON a.user_id = u.id 
      ORDER BY a.created_at DESC 
      LIMIT ?
    `).all(limit);
  }
};
