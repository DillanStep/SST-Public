import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { userOps, sessionOps, auditOps } from "./authDb.js";
import { resolveEnvPathForWrite, upsertEnvVar } from "../utils/envFile.js";

const router = Router();

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  const generated = crypto.randomBytes(48).toString("hex");
  try {
    upsertEnvVar(resolveEnvPathForWrite(), "JWT_SECRET", generated);
  } catch {
    // The generated secret is still safe for this process; sessions will reset on restart.
  }
  return generated;
}

const JWT_SECRET = getJwtSecret();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Auth status (requires API key at the app mount)
router.get("/status", (req, res) => {
  try {
    const userCount = userOps.count();
    res.json({
      ok: true,
      hasUsers: userCount > 0,
      setupRequired: userCount === 0,
    });
  } catch (err) {
    console.error("Auth status error:", err);
    res.status(500).json({ error: "Failed to get auth status" });
  }
});

// Login
router.post("/login", (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    
    // If there are no users yet, instruct client to run setup
    if (userOps.count() === 0) {
      return res.status(409).json({
        error: "No users exist yet. Run initial setup to create an admin account.",
        code: "SETUP_REQUIRED",
      });
    }

    const user = userOps.verifyPassword(username, password);
    
    if (!user) {
      auditOps.log(null, "LOGIN_FAILED", `Failed login attempt for: ${username}`, req.ip);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    
    // Store session
    const expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();
    sessionOps.create(user.id, token, expiresAt, req.ip, req.get("User-Agent"));
    
    // Log successful login
    auditOps.log(user.id, "LOGIN_SUCCESS", null, req.ip);
    
    // Set HTTP-only cookie (for same-origin requests)
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: SESSION_DURATION
    });
    
    // Return token in response body for cross-origin requests
    res.json({
      success: true,
      token, // Include token for Bearer auth
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// First-run setup: create initial admin user (only allowed when no users exist)
router.post("/setup", (req, res) => {
  try {
    if (userOps.count() > 0) {
      return res.status(409).json({
        error: "Setup already completed.",
        code: "SETUP_ALREADY_COMPLETE",
      });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const trimmedUsername = String(username).trim();
    if (!trimmedUsername) {
      return res.status(400).json({ error: "Username is required" });
    }

    const userId = userOps.create(trimmedUsername, String(password), "admin");
    auditOps.log(userId, "SETUP_ADMIN_CREATED", `Initial admin created: ${trimmedUsername}`, req.ip);

    // Create JWT token + session so setup immediately logs in
    const token = jwt.sign(
      { userId, username: trimmedUsername, role: "admin" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    const expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();
    sessionOps.create(userId, token, expiresAt, req.ip, req.get("User-Agent"));

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: SESSION_DURATION,
    });

    res.status(201).json({
      success: true,
      token,
      user: { id: userId, username: trimmedUsername, role: "admin" },
    });
  } catch (err) {
    console.error("Setup error:", err);
    res.status(500).json({ error: "Setup failed" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  try {
    const token = req.cookies?.auth_token;
    
    if (token) {
      const session = sessionOps.getByToken(token);
      if (session) {
        auditOps.log(session.user_id, "LOGOUT", null, req.ip);
      }
      sessionOps.delete(token);
    }
    
    res.clearCookie("auth_token");
    res.json({ success: true });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Logout failed" });
  }
});

// Check session / get current user
router.get("/me", (req, res) => {
  try {
    const token = req.cookies?.auth_token;
    
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      res.clearCookie("auth_token");
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    
    // Check session exists and user is active
    const session = sessionOps.getByToken(token);
    if (!session || !session.is_active) {
      res.clearCookie("auth_token");
      return res.status(401).json({ error: "Session expired or user inactive" });
    }
    
    res.json({
      user: {
        id: decoded.userId,
        username: decoded.username,
        role: decoded.role
      }
    });
  } catch (err) {
    console.error("Auth check error:", err);
    res.status(500).json({ error: "Auth check failed" });
  }
});

// Change password (for current user)
router.post("/change-password", (req, res) => {
  try {
    const token = req.cookies?.auth_token;
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password required" });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    
    // Verify current password
    const user = userOps.getByUsername(decoded.username);
    const verified = userOps.verifyPassword(decoded.username, currentPassword);
    
    if (!verified) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    
    // Update password
    userOps.updatePassword(user.id, newPassword);
    
    // Invalidate all other sessions
    sessionOps.deleteAllForUser(user.id);
    
    // Create new session
    const newToken = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    
    const expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();
    sessionOps.create(user.id, newToken, expiresAt, req.ip, req.get("User-Agent"));
    
    res.cookie("auth_token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_DURATION
    });
    
    auditOps.log(user.id, "PASSWORD_CHANGED", null, req.ip);
    
    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
export { JWT_SECRET };
