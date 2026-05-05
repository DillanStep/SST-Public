import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, "../..");
const cachePath = join(apiRoot, "data", "dayz-wiki-item-images.json");
const wikiApiUrl = "https://dayz.fandom.com/api.php";
const defaultCategories = ["Clothing_images"];
const cacheTtlMs = 7 * 24 * 60 * 60 * 1000;

let memoryCache = null;
let refreshPromise = null;

function getCategories() {
  return String(process.env.DAYZ_WIKI_IMAGE_CATEGORIES || "")
    .split(",")
    .map((category) => category.trim().replace(/^Category:/i, ""))
    .filter(Boolean)
    .concat(process.env.DAYZ_WIKI_IMAGE_CATEGORIES ? [] : defaultCategories);
}

function normalizeName(value) {
  return String(value || "")
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d+px[-_\s]*/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(image|icon|inventory|item)\b/gi, " ")
    .replace(/\s+\d+$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function titleToDisplayName(title) {
  return String(title || "")
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d+px[-_\s]*/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+\d+$/g, "")
    .trim();
}

function sourceDetails() {
  return {
    name: "DayZ Wiki",
    url: "https://dayz.fandom.com/wiki/Category:Clothing_images",
    attribution: "DayZ Wiki contributors",
  };
}

async function readCacheFile() {
  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.records)) {
      memoryCache = parsed;
      return parsed;
    }
  } catch {
    // Cache miss is fine; the next lookup will refresh from the wiki API.
  }
  return null;
}

async function writeCacheFile(cache) {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

function buildAliasIndex(records) {
  const index = new Map();
  for (const record of records) {
    for (const alias of record.aliases || []) {
      if (alias && !index.has(alias)) {
        index.set(alias, record);
      }
    }
  }
  return index;
}

function imageRecordFromPage(page, category) {
  const imageInfo = page?.imageinfo?.[0];
  if (!imageInfo?.thumburl && !imageInfo?.url) return null;

  const displayName = titleToDisplayName(page.title);
  const aliases = [
    normalizeName(page.title),
    normalizeName(displayName),
    normalizeName(displayName.replace(/\b(colou?r|variant)\b/gi, "")),
  ].filter(Boolean);

  return {
    id: page.pageid,
    title: page.title,
    displayName,
    category,
    thumbnailUrl: imageInfo.thumburl || imageInfo.url,
    imageUrl: imageInfo.url || imageInfo.thumburl,
    pageUrl: imageInfo.descriptionurl,
    width: imageInfo.width,
    height: imageInfo.height,
    mime: imageInfo.mime,
    aliases: [...new Set(aliases)],
    source: sourceDetails(),
  };
}

async function fetchCategoryImages(category) {
  const records = [];
  let gcmcontinue = null;

  do {
    const params = new URLSearchParams({
      action: "query",
      generator: "categorymembers",
      gcmtitle: `Category:${category}`,
      gcmtype: "file",
      gcmlimit: "500",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: "96",
      format: "json",
      origin: "*",
    });

    if (gcmcontinue) {
      params.set("gcmcontinue", gcmcontinue);
    }

    const response = await fetch(`${wikiApiUrl}?${params.toString()}`, {
      headers: {
        "User-Agent": "SST-DayZ-Management-Suite/1.0 (item image metadata cache)",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`DayZ Wiki image lookup failed with ${response.status}`);
    }

    const data = await response.json();
    for (const page of Object.values(data?.query?.pages || {})) {
      const record = imageRecordFromPage(page, category);
      if (record) {
        records.push(record);
      }
    }

    gcmcontinue = data?.continue?.gcmcontinue || null;
  } while (gcmcontinue);

  return records;
}

async function refreshImageCache() {
  const categories = getCategories();
  const recordsByTitle = new Map();

  for (const category of categories) {
    const records = await fetchCategoryImages(category);
    for (const record of records) {
      recordsByTitle.set(record.title, record);
    }
  }

  const cache = {
    generatedAt: new Date().toISOString(),
    source: sourceDetails(),
    categories,
    records: [...recordsByTitle.values()],
  };

  memoryCache = cache;
  await writeCacheFile(cache);
  return cache;
}

async function getImageCache({ forceRefresh = false } = {}) {
  if (!forceRefresh && memoryCache) {
    const age = Date.now() - new Date(memoryCache.generatedAt || 0).getTime();
    if (age < cacheTtlMs) return memoryCache;
  }

  if (!forceRefresh) {
    const fileCache = await readCacheFile();
    if (fileCache) {
      const age = Date.now() - new Date(fileCache.generatedAt || 0).getTime();
      if (age < cacheTtlMs) return fileCache;
    }
  }

  if (!refreshPromise) {
    refreshPromise = refreshImageCache().finally(() => {
      refreshPromise = null;
    });
  }

  try {
    return await refreshPromise;
  } catch (err) {
    const fallback = memoryCache || await readCacheFile();
    if (fallback) return fallback;
    throw err;
  }
}

function findImageForItem(item, index) {
  const candidates = [
    normalizeName(item?.className),
    normalizeName(item?.displayName),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const exact = index.get(candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    if (candidate.length < 5) continue;
    for (const [alias, record] of index.entries()) {
      if (alias.length < 5) continue;
      if (alias.includes(candidate) || candidate.includes(alias)) {
        return record;
      }
    }
  }

  return null;
}

export async function lookupDayzWikiItemImages(items, options = {}) {
  const uniqueItems = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const className = String(item?.className || "").trim();
    if (!className || seen.has(className.toLowerCase())) continue;
    seen.add(className.toLowerCase());
    uniqueItems.push({
      className,
      displayName: String(item?.displayName || "").trim() || undefined,
    });
  }

  const cache = await getImageCache(options);
  const index = buildAliasIndex(cache.records || []);
  const images = {};

  for (const item of uniqueItems) {
    const match = findImageForItem(item, index);
    images[item.className] = match
      ? {
          className: item.className,
          displayName: item.displayName || match.displayName,
          matchedDisplayName: match.displayName,
          thumbnailUrl: match.thumbnailUrl,
          imageUrl: match.imageUrl,
          pageUrl: match.pageUrl,
          source: match.source,
        }
      : null;
  }

  return {
    generatedAt: cache.generatedAt,
    source: cache.source,
    categories: cache.categories,
    count: Object.values(images).filter(Boolean).length,
    images,
  };
}
