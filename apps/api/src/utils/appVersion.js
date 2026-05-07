import { createRequire } from "module";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json");

export const APP_VERSION = packageJson.version || "0.0.0";
export const BUNDLED_MOD_VERSION =
  packageJson.sst?.modVersion || packageJson.sstModVersion || APP_VERSION;
export const EXPECTED_MOD_VERSION = process.env.SST_EXPECTED_MOD_VERSION || BUNDLED_MOD_VERSION;
export const EXPECTED_MOD_PROTOCOL_VERSION = process.env.SST_EXPECTED_MOD_PROTOCOL_VERSION || "1";

export function normalizeVersion(version) {
  return String(version || "")
    .trim()
    .replace(/^v/i, "")
    .split("-")[0];
}

export function compareVersions(current, latest) {
  const left = normalizeVersion(current).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(latest).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const a = left[index] || 0;
    const b = right[index] || 0;
    if (a < b) return -1;
    if (a > b) return 1;
  }

  return 0;
}

export function getCurrentVersion() {
  return APP_VERSION;
}

export function getExpectedModVersion() {
  return EXPECTED_MOD_VERSION;
}

export function getExpectedModProtocolVersion() {
  return EXPECTED_MOD_PROTOCOL_VERSION;
}
