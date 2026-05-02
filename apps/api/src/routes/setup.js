import { Router } from "express";
import path from "path";

import { userOps } from "../auth/authDb.js";
import { getApiKey } from "../middleware/auth.js";
import { resolveEnvPathForWrite, upsertEnvVar } from "../utils/envFile.js";
import { createSftpStorage } from "../storage/sftpStorage.js";
import { createFtpStorage } from "../storage/ftpStorage.js";
import { createLocalStorage } from "../storage/localStorage.js";
import { resolveRemotePath } from "../storage/pathUtils.js";

const router = Router();

function isLocalRequest(req) {
  const ip = String(req.ip || "");
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("::ffff:127.0.0.1")
  );
}

function requireSetupMode(req, res, next) {
  // Only allow setup endpoints if no users exist yet.
  try {
    const setupRequired = userOps.count() === 0;
    if (!setupRequired) {
      return res.status(409).json({
        error: "Setup already completed.",
        code: "SETUP_ALREADY_COMPLETE",
      });
    }

    if (!isLocalRequest(req)) {
      return res.status(403).json({
        error: "Setup endpoints are only available from localhost until setup is complete.",
        code: "SETUP_LOCAL_ONLY",
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ error: "Failed to validate setup mode", details: err?.message || String(err) });
  }
}

router.use(requireSetupMode);

function normalizePosix(value) {
  if (!value) return "";
  return String(value).trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function normalizeLocalPath(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/");
  if (normalized === "/") return normalized;
  if (/^[a-zA-Z]:\/?$/.test(normalized)) {
    return normalized.endsWith("/") ? normalized : `${normalized}/`;
  }
  return normalized.replace(/\/+$/, "");
}

function isAbsoluteLocalPath(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/");
  return /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/") || normalized.startsWith("//");
}

function parseSstPathFromRemote(remoteRoot, sstPath) {
  // Compute the expected online_players.json path.
  const root = normalizePosix(remoteRoot || "/") || "/";
  const base = normalizePosix(sstPath);
  if (!base) return null;
  const relativeSst = base.startsWith("/") ? base : base; // If it starts with '/', it will ignore root when resolved.

  const apiDir = `${relativeSst}/api`;
  const onlinePlayers = `${apiDir}/online_players.json`;

  return {
    remoteRoot: root,
    sstPath: relativeSst,
    apiDir,
    onlinePlayers,
    resolvedOnlinePlayers: resolveRemotePath(root, onlinePlayers),
  };
}

function parseSstPathFromLocal(sstPath) {
  const base = normalizeLocalPath(sstPath);
  if (!base) return null;
  if (!isAbsoluteLocalPath(base)) {
    throw setupError("Local SST path must be a full path, for example C:/DayZServer/profiles/SST.");
  }

  const apiDir = path.join(base, "api");
  const onlinePlayers = path.join(apiDir, "online_players.json");

  return {
    sstPath: base,
    apiDir,
    onlinePlayers,
    resolvedOnlinePlayers: path.resolve(onlinePlayers),
  };
}

function isNotFoundError(err) {
  const code = String(err?.code || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();
  return code === "ENOENT" || message.includes("no such file") || message.includes("not found");
}

function setupError(message, statusCode = 400, code = undefined) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function normalizeStat(fileStat) {
  return {
    size: typeof fileStat?.size === "number" ? fileStat.size : null,
    mtime: fileStat?.mtime instanceof Date ? fileStat.mtime.toISOString() : fileStat?.mtime || null,
  };
}

function isPlayerOnline(player) {
  return player?.isOnline === 1 || player?.isOnline === true;
}

function parseOnlinePlayers(raw) {
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw setupError("Found online_players.json, but it is not valid JSON.", 422);
  }

  if (Array.isArray(json)) {
    return {
      onlineCount: json.filter(isPlayerOnline).length,
      playersLen: json.length,
    };
  }

  const players = Array.isArray(json?.players) ? json.players : null;
  const onlineCount = typeof json?.onlineCount === "number"
    ? json.onlineCount
    : players
      ? players.filter(isPlayerOnline).length
      : null;

  if (!players && onlineCount === null) {
    throw setupError("Found online_players.json, but it does not look like an SST online players file.", 422);
  }

  return {
    onlineCount,
    playersLen: players ? players.length : null,
  };
}

async function validateOnlinePlayers(storage, parsed) {
  const checkedPath = parsed.resolvedOnlinePlayers || parsed.onlinePlayers;

  let onlineStat;
  try {
    onlineStat = await storage.stat(parsed.onlinePlayers);
  } catch (err) {
    if (isNotFoundError(err)) {
      throw setupError(
        `Could not find SST online players file at '${checkedPath}'. Check that the path points to the DayZ profile SST folder. The @SST server mod must run once with -scrAllowFileWrite first to create $profile:SST/api/online_players.json.`,
        404,
        "ENOENT"
      );
    }
    throw err;
  }

  let raw;
  try {
    raw = await storage.readFile(parsed.onlinePlayers, "utf8");
  } catch (err) {
    if (isNotFoundError(err)) {
      throw setupError(
        `Could not read SST online players file at '${checkedPath}'. Check that the path points to the SST folder.`,
        404,
        "ENOENT"
      );
    }
    throw err;
  }

  return {
    stat: normalizeStat(onlineStat),
    parsed: parseOnlinePlayers(raw),
  };
}

router.get("/status", (req, res) => {
  const envPath = resolveEnvPathForWrite();

  res.json({
    ok: true,
    setupRequired: true,
    apiKey: getApiKey(),
    env: {
      path: envPath,
      storageBackend: process.env.STORAGE_BACKEND || "local",
      sftp: {
        host: process.env.SFTP_HOST || "",
        port: process.env.SFTP_PORT ? Number(process.env.SFTP_PORT) : 22,
        user: process.env.SFTP_USER || "",
        root: process.env.SFTP_ROOT || "/",
      },
      ftp: {
        host: process.env.FTP_HOST || "",
        port: process.env.FTP_PORT ? Number(process.env.FTP_PORT) : 21,
        user: process.env.FTP_USER || "",
        root: process.env.FTP_ROOT || "/",
        secure: process.env.FTP_SECURE || "false",
      },
      paths: {
        sst: process.env.SST_PATH || "",
      },
    },
  });
});

router.post("/test", async (req, res) => {
  const { backend, sftp, ftp, sstPath } = req.body || {};

  const chosenBackend = String(backend || "").toLowerCase();
  if (!chosenBackend || !["local", "ftp", "sftp"].includes(chosenBackend)) {
    return res.status(400).json({ error: "Invalid backend. Use 'local', 'ftp', or 'sftp'." });
  }

  if (!sstPath || typeof sstPath !== "string") {
    return res.status(400).json({ error: "sstPath is required" });
  }

  try {
    if (chosenBackend === "local") {
      const storage = createLocalStorage();
      const parsed = parseSstPathFromLocal(sstPath);
      if (!parsed) return res.status(400).json({ error: "Could not build paths from sstPath" });

      const validation = await validateOnlinePlayers(storage, parsed);

      return res.json({
        ok: true,
        backend: "local",
        resolved: {
          sstPath: parsed.sstPath,
          apiDir: parsed.apiDir,
          onlinePlayers: parsed.onlinePlayers,
          resolvedOnlinePlayers: parsed.resolvedOnlinePlayers,
        },
        ...validation,
      });
    }

    if (chosenBackend === "sftp") {
      const cfg = {
        host: sftp?.host,
        port: sftp?.port,
        username: sftp?.username,
        user: sftp?.username,
        password: sftp?.password,
        root: sftp?.root,
      };

      const storage = createSftpStorage({ backend: "sftp", config: cfg });
      const parsed = parseSstPathFromRemote(cfg.root, sstPath);
      if (!parsed) return res.status(400).json({ error: "Could not build paths from sstPath" });
      const validation = await validateOnlinePlayers(storage, parsed);

      return res.json({
        ok: true,
        backend: "sftp",
        resolved: {
          remoteRoot: cfg.root,
          sstPath,
          onlinePlayers: parsed.onlinePlayers,
          resolvedOnlinePlayers: parsed.resolvedOnlinePlayers,
        },
        ...validation,
      });
    }

    if (chosenBackend === "ftp") {
      const cfg = {
        host: ftp?.host,
        port: ftp?.port,
        username: ftp?.username,
        user: ftp?.username,
        password: ftp?.password,
        secure: ftp?.secure,
        root: ftp?.root,
      };

      const storage = createFtpStorage({ backend: "ftp", config: cfg });
      const parsed = parseSstPathFromRemote(cfg.root, sstPath);
      if (!parsed) return res.status(400).json({ error: "Could not build paths from sstPath" });
      const validation = await validateOnlinePlayers(storage, parsed);

      return res.json({
        ok: true,
        backend: "ftp",
        resolved: {
          remoteRoot: cfg.root,
          sstPath,
          onlinePlayers: parsed.onlinePlayers,
          resolvedOnlinePlayers: parsed.resolvedOnlinePlayers,
        },
        ...validation,
      });
    }

    return res.status(400).json({ error: "Unsupported backend" });
  } catch (err) {
    const statusCode = Number.isInteger(err?.statusCode)
      ? err.statusCode
      : isNotFoundError(err)
        ? 404
        : 500;

    return res.status(statusCode).json({
      ok: false,
      error: "Connection test failed",
      details: err?.message || String(err),
    });
  }
});

router.post("/apply", (req, res) => {
  const { backend, sftp, ftp, sstPath, profilesPath } = req.body || {};

  const chosenBackend = String(backend || "").toLowerCase();
  if (!chosenBackend || !["local", "ftp", "sftp"].includes(chosenBackend)) {
    return res.status(400).json({ error: "Invalid backend. Use 'local', 'ftp', or 'sftp'." });
  }

  if (!sstPath || typeof sstPath !== "string") {
    return res.status(400).json({ error: "sstPath is required" });
  }

  const envPath = resolveEnvPathForWrite();

  try {
    // Always persist API_KEY as well so user doesn't lose it.
    upsertEnvVar(envPath, "API_KEY", getApiKey());

    upsertEnvVar(envPath, "STORAGE_BACKEND", chosenBackend);
    upsertEnvVar(envPath, "SST_PATH", normalizePosix(sstPath));
    
    // Save profiles path if provided
    if (profilesPath && typeof profilesPath === "string" && profilesPath.trim()) {
      upsertEnvVar(envPath, "PROFILES_PATH", normalizePosix(profilesPath));
    }

    if (chosenBackend === "sftp") {
      if (!sftp?.host || !sftp?.port || !sftp?.username || !sftp?.password) {
        return res.status(400).json({ error: "Missing SFTP fields" });
      }
      upsertEnvVar(envPath, "SFTP_HOST", String(sftp.host));
      upsertEnvVar(envPath, "SFTP_PORT", String(sftp.port));
      upsertEnvVar(envPath, "SFTP_USER", String(sftp.username));
      upsertEnvVar(envPath, "SFTP_PASSWORD", String(sftp.password));
      upsertEnvVar(envPath, "SFTP_ROOT", normalizePosix(sftp.root || "/") || "/");
    }

    if (chosenBackend === "ftp") {
      if (!ftp?.host || !ftp?.port || !ftp?.username || !ftp?.password) {
        return res.status(400).json({ error: "Missing FTP fields" });
      }
      upsertEnvVar(envPath, "FTP_HOST", String(ftp.host));
      upsertEnvVar(envPath, "FTP_PORT", String(ftp.port));
      upsertEnvVar(envPath, "FTP_USER", String(ftp.username));
      upsertEnvVar(envPath, "FTP_PASSWORD", String(ftp.password));
      upsertEnvVar(envPath, "FTP_ROOT", normalizePosix(ftp.root || "/") || "/");
      if (ftp.secure !== undefined) {
        upsertEnvVar(envPath, "FTP_SECURE", String(ftp.secure));
      }
    }

    res.json({
      ok: true,
      wroteEnv: true,
      envPath,
      restartRequired: true,
      message: "Saved settings to .env. API will restart automatically.",
    });

    // Schedule API restart after response is sent
    // Give time for the response to be sent and any pending operations to complete
    setTimeout(() => {
      console.log("[Setup] Configuration saved. Restarting API to apply changes...");
      process.exit(0); // Exit cleanly - the launcher script or process manager will restart
    }, 1500);
  } catch (err) {
    res.status(500).json({ error: "Failed to write .env", details: err?.message || String(err) });
  }
});

export default router;
