import { createStorage } from "./storageFactory.js";
import { getServerContext } from "../serverContext.js";

// A tiny wrapper that mimics a subset of `fs/promises` but can be backed by
// local filesystem or remote FTP.
const storageByContextId = new Map();

function getStorage() {
  const context = getServerContext();
  const cacheKey = context?.id || "default";

  if (!storageByContextId.has(cacheKey)) {
    storageByContextId.set(cacheKey, createStorage(context));
  }

  return storageByContextId.get(cacheKey);
}

export async function readFile(filePath, encoding) {
  return getStorage().readFile(filePath, encoding);
}

export async function writeFile(filePath, data, encoding) {
  return getStorage().writeFile(filePath, data, encoding);
}

export async function readdir(dirPath) {
  return getStorage().readdir(dirPath);
}

export async function stat(filePath) {
  return getStorage().stat(filePath);
}

export async function mkdir(dirPath, options) {
  return getStorage().mkdir(dirPath, options);
}

export async function unlink(filePath) {
  return getStorage().unlink(filePath);
}

export function getStorageBackend() {
  return getStorage().backend;
}
