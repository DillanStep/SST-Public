import { AsyncLocalStorage } from "async_hooks";

const serverContextStorage = new AsyncLocalStorage();
const contextsById = new Map();
const aliasesById = new Map();

let defaultContext = null;

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

export function setServerContexts(contexts, defaultId = null) {
  contextsById.clear();
  aliasesById.clear();

  for (const context of contexts || []) {
    if (!context?.id) continue;

    const aliases = new Set([
      context.id,
      context.name,
      context.label,
      ...(Array.isArray(context.aliases) ? context.aliases : []),
    ]);

    contextsById.set(context.id, { ...context, aliases: [...aliases].filter(Boolean) });

    for (const alias of aliases) {
      const normalized = normalizeId(alias);
      if (normalized) aliasesById.set(normalized, context.id);
    }
  }

  const normalizedDefaultId = normalizeId(defaultId);
  const resolvedDefaultId = aliasesById.get(normalizedDefaultId) || contextsById.keys().next().value;
  defaultContext = resolvedDefaultId ? contextsById.get(resolvedDefaultId) : null;
}

export function getDefaultServerContext() {
  return defaultContext;
}

export function getServerContext() {
  return serverContextStorage.getStore() || defaultContext;
}

export function getServerContextById(id) {
  const normalized = normalizeId(id);
  if (!normalized) return defaultContext;
  const resolvedId = aliasesById.get(normalized);
  return resolvedId ? contextsById.get(resolvedId) : null;
}

export function getAllServerContexts() {
  return [...contextsById.values()];
}

export function runWithServerContext(context, fn) {
  return serverContextStorage.run(context || defaultContext, fn);
}

export function getRequestedServerContextId(req) {
  return (
    req.headers["x-sst-server"] ||
    req.headers["x-sst-provider"] ||
    req.query?.serverId ||
    req.query?.server ||
    req.query?.provider ||
    ""
  );
}

export function serverContextMiddleware(req, res, next) {
  const requested = getRequestedServerContextId(req);
  const context = getServerContextById(requested);

  if (!context) {
    return res.status(400).json({
      error: "Unknown SST server profile",
      requested: String(requested || ""),
      profiles: getAllServerContexts().map((item) => item.id),
    });
  }

  return runWithServerContext(context, next);
}
