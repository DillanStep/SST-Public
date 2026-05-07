import readline from "readline";

function getPanelHeight() {
  // +1 so the cursor lands on a fresh line below the separator.
  return panelLines().length + 1;
}

function isEnabled() {
  // Only enable for interactive terminals unless explicitly disabled.
  if (process.env.SST_CONSOLE_UI === "0") return false;
  return Boolean(process.stdout?.isTTY);
}

let state = {
  title: "SST API",
  status: "STARTING",
  host: process.env.HOST || "0.0.0.0",
  port: process.env.PORT || "3001",
  storage: process.env.STORAGE_BACKEND || "local",
  startedAt: Date.now(),

  itemsLoaded: null,
  cachePlayers: null,
  cacheRefreshMs: null,
  cacheLastUpdate: null,
  cacheIntervalMs: null,
  modLastActivity: null,
  modLastFile: null,
  modOnlineCount: null,
};

let hasInit = false;

function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatUptime() {
  const seconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function bannerLines() {
  return [
    "  _____ _____ _____   ___  ______ _____ ",
    " /  ___/  ___|_   _| / _ \\ | ___ \\_   _|",
    " \\ `--.\\ `--.  | |  / /_\\ \\| |_/ / | |  ",
    "  `--. \\`--. \\ | |  |  _  ||  __/  | |  ",
    " /\\__/ /\\__/ /_| |_ | | | || |    _| |_ ",
    " \\____/\\____/ \\___/ \\_| |_/\\_|    \\___/ ",
  ];
}

function panelLines() {
  const host = state.host;
  const port = state.port;

  const healthUrl = `http://localhost:${port}/health`;

  const items = typeof state.itemsLoaded === "number" ? state.itemsLoaded.toLocaleString() : "—";
  const cachePlayers = typeof state.cachePlayers === "number" ? state.cachePlayers.toLocaleString() : "—";

  const cacheMs = formatDuration(state.cacheRefreshMs);
  const cacheInterval = typeof state.cacheIntervalMs === "number" ? `${Math.round(state.cacheIntervalMs / 1000)}s` : "—";

  const lastUpdate = state.cacheLastUpdate ? String(state.cacheLastUpdate) : "—";
  const modOnline = typeof state.modOnlineCount === "number" ? state.modOnlineCount.toLocaleString() : "—";
  const modLastActivity = state.modLastActivity
    ? `${state.modLastActivity}${state.modLastFile ? ` (${state.modLastFile})` : ""}`
    : "—";

  return [
    ...bannerLines(),
    "",
    `  Status: ${state.status}   Uptime: ${formatUptime()}`,
    `  Listening: ${host}:${port}   Health: ${healthUrl}`,
    `  Storage: ${state.storage}   Cache Interval: ${cacheInterval}`,
    `  Items: ${items}   Players Cached: ${cachePlayers}   Last Refresh: ${cacheMs}`,
    `  Cache Updated: ${lastUpdate}`,
    `  Mod Online: ${modOnline}   Last Mod Write: ${modLastActivity}`,
    "  " + "─".repeat(58),
  ];
}

function saveCursor() {
  // xterm-compatible save
  process.stdout.write("\x1b7");
}

function restoreCursor() {
  // xterm-compatible restore
  process.stdout.write("\x1b8");
}

function render() {
  if (!isEnabled()) return;

  const lines = panelLines();
  saveCursor();
  for (let row = 0; row < lines.length; row++) {
    readline.cursorTo(process.stdout, 0, row);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(lines[row]);
  }
  restoreCursor();
}

function init(initial = {}) {
  if (!isEnabled()) return;
  state = { ...state, ...initial };

  // Clear screen + move cursor home
  process.stdout.write("\x1b[2J\x1b[H");
  hasInit = true;

  render();

  // Place cursor below the panel so regular logs start underneath it.
  readline.cursorTo(process.stdout, 0, getPanelHeight());
}

function update(partial = {}) {
  state = { ...state, ...partial };
  if (!hasInit && isEnabled()) {
    init();
    return;
  }
  render();
}

export const consoleUi = {
  isEnabled,
  init,
  update,
};
