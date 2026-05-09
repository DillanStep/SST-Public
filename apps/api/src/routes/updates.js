import { Router } from "express";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { getRuntimeEnvSnapshot } from "../config.js";
import { compareVersions, getCurrentVersion, normalizeVersion } from "../utils/appVersion.js";
import { getModVersionStatus, getOnlinePlayersSnapshot } from "../utils/onlinePlayers.js";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, "../..");
const repoRoot = resolve(apiRoot, "../..");
const dataDir = join(apiRoot, "data");
const updateStatePath = join(dataDir, "update-state.json");
const updaterScriptPath = join(repoRoot, "tools", "updater", "Update-SST.ps1");
const updaterBatchPath = join(repoRoot, "tools", "updater", "Update-SST.bat");

const defaultUpdateRepo = "DillanStep/SST-Public";

function getRuntimeSetting(key) {
  try {
    const snapshot = getRuntimeEnvSnapshot();
    const value = snapshot?.[key];
    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  } catch {
    // Fall back to process.env during early boot or if runtime context is unavailable.
  }

  return String(process.env[key] || "").trim();
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeUpdateRepo(value) {
  let text = String(value || "").trim();
  if (!text) {
    return "";
  }

  text = text
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/releases\/.*$/i, "")
    .replace(/\/tags\/.*$/i, "");

  const parts = text.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }

  return text;
}

function getUpdateRepo() {
  return normalizeUpdateRepo(getRuntimeSetting("SST_UPDATE_REPO")) || defaultUpdateRepo;
}

function getUpdateSource() {
  const repo = getUpdateRepo();
  const customApiUrl = getRuntimeSetting("SST_UPDATE_API_URL");
  return {
    repo,
    apiUrl: customApiUrl || `https://api.github.com/repos/${repo}/releases/latest`,
    hasCustomApiUrl: Boolean(customApiUrl),
  };
}

function isLocalRequest(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || "");
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

async function fetchJsonRelease(apiUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "SST-Dashboard-Updater",
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Update check failed with HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLatestReleaseRedirect(repo) {
  const latestBaseUrl = `https://github.com/${repo}/releases/latest`;
  const latestUrl = `${latestBaseUrl}?sst=${Date.now()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(latestUrl, {
      redirect: "manual",
      headers: {
        Accept: "text/html",
        "User-Agent": "SST-Dashboard-Updater",
      },
      signal: controller.signal,
    });

    const location = response.headers.get("location") || response.url;
    const redirectedUrl = new URL(location, latestBaseUrl);
    const match = redirectedUrl.pathname.match(/\/releases\/tag\/([^/]+)/);
    const tagName = match ? decodeURIComponent(match[1]) : "";

    if (!tagName) {
      throw new Error(`Could not resolve latest release tag from ${latestBaseUrl}`);
    }

    return {
      tag_name: tagName,
      name: tagName,
      html_url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tagName)}`,
      published_at: null,
      body: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLatestRelease() {
  const source = getUpdateSource();

  try {
    return await fetchJsonRelease(source.apiUrl);
  } catch (err) {
    if (source.hasCustomApiUrl) {
      throw err;
    }

    return fetchLatestReleaseRedirect(source.repo);
  }
}

function releaseToStatus(currentVersion, release) {
  const updateRepo = getUpdateRepo();

  if (!release) {
    return {
      ok: true,
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      release: null,
      message: "No published releases found.",
    };
  }

  const latestVersion = normalizeVersion(release.tag_name || release.name);
  const tagName = release.tag_name || `v${latestVersion}`;

  return {
    ok: true,
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(currentVersion, latestVersion) < 0,
    release: {
      tagName,
      name: release.name || tagName,
      url: release.html_url || `https://github.com/${updateRepo}/releases/tag/${tagName}`,
      publishedAt: release.published_at || null,
      notes: String(release.body || "").slice(0, 4000),
      archiveUrl: `https://github.com/${updateRepo}/archive/refs/tags/${tagName}.zip`,
    },
  };
}

async function getRuntimeModStatus() {
  try {
    const snapshot = await getOnlinePlayersSnapshot();
    return {
      ...getModVersionStatus(snapshot),
      sourceUpdatedAt: snapshot?.sourceUpdatedAt || null,
      sourceAgeMs: snapshot?.sourceAgeMs ?? null,
      staleAfterMs: snapshot?.staleAfterMs ?? null,
      isStale: Boolean(snapshot?.isStale),
    };
  } catch (err) {
    return {
      ...getModVersionStatus(null),
      status: "error",
      mismatch: false,
      isCompatible: false,
      error: err?.message || String(err),
      message: "Could not read the SST mod heartbeat.",
      sourceUpdatedAt: null,
      sourceAgeMs: null,
      staleAfterMs: null,
      isStale: true,
    };
  }
}

async function attachRuntimeStatus(status) {
  return {
    ...status,
    mod: await getRuntimeModStatus(),
  };
}

async function readUpdateState() {
  try {
    const raw = await readFile(updateStatePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return {
      status: "idle",
      message: null,
      updatedAt: null,
    };
  }
}

async function writeUpdateState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(updateStatePath, JSON.stringify(state, null, 2), "utf8");
}

function quoteCmdArg(value) {
  const text = String(value);
  if (text.includes("\"")) {
    throw new Error(`Updater argument cannot contain quotes: ${text}`);
  }
  return `"${text}"`;
}

router.get("/status", async (req, res) => {
  if (isEnabled(getRuntimeSetting("SST_DISABLE_UPDATE_CHECK"))) {
    const currentVersion = getCurrentVersion();
    return res.json(await attachRuntimeStatus({
      ok: true,
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      disabled: true,
    }));
  }

  try {
    const currentVersion = getCurrentVersion();
    const release = await fetchLatestRelease();
    return res.json(await attachRuntimeStatus(releaseToStatus(currentVersion, release)));
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

router.get("/install/status", async (req, res) => {
  const state = await readUpdateState();
  res.json({ ok: true, ...state });
});

router.post("/install", async (req, res) => {
  if (!isLocalRequest(req) && !isEnabled(getRuntimeSetting("SST_ALLOW_REMOTE_UPDATE"))) {
    return res.status(403).json({
      ok: false,
      error: "Updates can only be installed from the machine running SST. Set SST_ALLOW_REMOTE_UPDATE=1 to override.",
    });
  }

  if (!existsSync(updaterBatchPath)) {
    return res.status(500).json({
      ok: false,
      error: `Updater batch script not found at ${updaterBatchPath}`,
    });
  }

  if (!existsSync(updaterScriptPath)) {
    return res.status(500).json({
      ok: false,
      error: `Updater script not found at ${updaterScriptPath}`,
    });
  }

  try {
    const currentVersion = getCurrentVersion();
    const release = await fetchLatestRelease();
    const status = releaseToStatus(currentVersion, release);

    if (!status.updateAvailable) {
      return res.json({ ok: true, status: "current", message: "SST is already up to date.", update: status });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logDir = join(repoRoot, "logs");
    const logPath = join(logDir, `update-${timestamp}.log`);

    const state = {
      status: "starting",
      message: `Starting update to ${status.release.tagName}.`,
      currentVersion,
      targetVersion: status.latestVersion,
      targetTag: status.release.tagName,
      releaseUrl: status.release.url,
      archiveUrl: status.release.archiveUrl,
      logPath,
      runnerPath: updaterBatchPath,
      updatedAt: new Date().toISOString(),
    };
    await writeUpdateState(state);

    const command = [
      "call",
      quoteCmdArg(updaterBatchPath),
      "--repo-root",
      quoteCmdArg(repoRoot),
      "--archive-url",
      quoteCmdArg(status.release.archiveUrl),
      "--target-tag",
      quoteCmdArg(status.release.tagName),
      "--state-path",
      quoteCmdArg(updateStatePath),
      "--log-path",
      quoteCmdArg(logPath),
    ].join(" ");

    const child = spawn(command, {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: true,
    });
    child.on("error", async (err) => {
      try {
        await writeUpdateState({
          ...state,
          status: "failed",
          message: `Could not launch updater: ${err?.message || String(err)}`,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Nothing useful to do if even the status file cannot be written.
      }
    });
    child.unref();

    return res.status(202).json({ ok: true, status: "started", ...state });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

export default router;
