import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveEnvPathForWrite() {
  const explicitPath = process.env.SST_API_ENV_PATH
    ? path.resolve(process.env.SST_API_ENV_PATH)
    : null;

  const candidates = [
    explicitPath,
    path.resolve(process.cwd(), ".env"),
    // default: apps/api/.env (relative to this file)
    path.resolve(__dirname, "..", "..", ".env"),
  ].filter(Boolean);

  return candidates.find((p) => fs.existsSync(p)) || candidates[candidates.length - 1];
}

export function readEnvVars(filePath) {
  let existing = "";
  try {
    if (fs.existsSync(filePath)) {
      existing = fs.readFileSync(filePath, "utf8");
    }
  } catch {
    existing = "";
  }

  const values = {};
  for (const rawLine of existing.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

export function upsertEnvVar(filePath, key, value) {
  let existing = "";
  try {
    if (fs.existsSync(filePath)) {
      existing = fs.readFileSync(filePath, "utf8");
    }
  } catch {
    existing = "";
  }

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineRegex = new RegExp(`^${escapedKey}=.*$`, "m");

  const nextLine = `${key}=${value}`;
  let next;

  if (lineRegex.test(existing)) {
    next = existing.replace(lineRegex, nextLine);
  } else {
    const needsNewline = existing.length > 0 && !existing.endsWith("\n");
    next = `${existing}${needsNewline ? "\n" : ""}${nextLine}\n`;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next, "utf8");
}
