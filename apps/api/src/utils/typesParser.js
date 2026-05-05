import { readFile, readdir, stat } from "../storage/fs.js";
import { getRuntimeContext } from "../config.js";
import { joinStoragePath } from "./storagePath.js";

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

// Cache per active server profile/path set. A single API process can serve
// multiple DayZ servers, so this must not be global-only.
const typesCacheByKey = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function normalizeSourceKey(pathValue) {
  return String(pathValue || "").replace(/\\/g, "/").toLowerCase();
}

function sourceFileName(pathValue) {
  const normalized = String(pathValue || "").replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || normalized;
}

function currentTypesConfig() {
  const context = getRuntimeContext();
  const missionPath = context.paths?.missionFolder || "";
  const customTypesPath = context.paths?.typesXml || "";
  const cacheKey = [
    context.id || "default",
    context.backend || "",
    missionPath,
    customTypesPath,
  ].join("|");

  return { context, missionPath, customTypesPath, cacheKey };
}

function createLoadSummary(context, missionPath, customTypesPath) {
  return {
    profile: context?.id || "default",
    missionPath: missionPath || null,
    customTypesPath: customTypesPath || null,
    sourceFiles: [],
    duplicateItems: 0,
    missingFiles: [],
    errors: [],
    economyCore: null,
    totalItems: 0,
    loadedAt: null,
  };
}

function stripXmlComments(xmlContent) {
  return String(xmlContent || "").replace(/<!--[\s\S]*?-->/g, "");
}

function parseXmlAttributes(attributeText) {
  const attrs = {};
  const attrRegex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;

  while ((match = attrRegex.exec(attributeText || "")) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
  }

  return attrs;
}

function normalizeRefPart(value) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Parse cfgeconomycore.xml and return the explicit type file references.
 *
 * DayZ economy core files declare extra economy files as:
 * <ce folder="ModTypes/LBMaster">
 *   <file name="LBMaster_Key_Types.xml" type="types" />
 * </ce>
 */
export function parseEconomyCoreTypeRefs(xmlContent) {
  const refs = [];
  const content = stripXmlComments(xmlContent);
  const ceRegex = /<ce\b([^>]*)>([\s\S]*?)<\/ce>/gi;
  let ceMatch;

  while ((ceMatch = ceRegex.exec(content)) !== null) {
    const ceAttrs = parseXmlAttributes(ceMatch[1]);
    const folder = normalizeRefPart(ceAttrs.folder);
    const body = ceMatch[2] || "";
    const fileRegex = /<file\b([^>]*)\/?>/gi;
    let fileMatch;

    while ((fileMatch = fileRegex.exec(body)) !== null) {
      const fileAttrs = parseXmlAttributes(fileMatch[1]);
      const type = String(fileAttrs.type || "").trim().toLowerCase();
      const fileName = normalizeRefPart(fileAttrs.name);

      if (type !== "types" || !fileName) continue;

      refs.push({
        folder,
        fileName,
        type,
        relativePath: folder ? joinStoragePath(folder, fileName) : fileName,
      });
    }
  }

  return refs;
}

/**
 * Parse types.xml file and extract spawn data
 * @param {string} xmlContent - Raw XML content
 * @returns {Map} Map of className -> spawn data
 */
function parseTypesXml(xmlContent) {
  const types = new Map();
  
  // Simple regex-based parser for types.xml
  // Match each <type name="...">...</type> block
  const typeRegex = /<type\b([^>]*)>([\s\S]*?)<\/type>/gi;
  
  let match;
  while ((match = typeRegex.exec(xmlContent)) !== null) {
    const typeAttrs = parseXmlAttributes(match[1]);
    const className = typeAttrs.name;
    if (!className) continue;

    const content = match[2];
    
    // Extract values
    const nominal = parseInt(extractValue(content, 'nominal')) || 0;
    const min = parseInt(extractValue(content, 'min')) || 0;
    const lifetime = parseInt(extractValue(content, 'lifetime')) || 0;
    const restock = parseInt(extractValue(content, 'restock')) || 0;
    const cost = parseInt(extractValue(content, 'cost')) || 0;
    const quantmin = parseInt(extractValue(content, 'quantmin')) || -1;
    const quantmax = parseInt(extractValue(content, 'quantmax')) || -1;
    
    // Extract category
    const categoryMatch = content.match(/<category\b([^>]*)\/?>/i);
    const category = categoryMatch ? parseXmlAttributes(categoryMatch[1]).name || null : null;
    
    // Extract usage locations
    const usageMatches = content.matchAll(/<usage\b([^>]*)\/?>/gi);
    const usage = [...usageMatches]
      .map(m => parseXmlAttributes(m[1]).name)
      .filter(Boolean);
    
    // Extract tier values
    const valueMatches = content.matchAll(/<value\b([^>]*)\/?>/gi);
    const tiers = [...valueMatches]
      .map(m => parseXmlAttributes(m[1]).name)
      .filter(Boolean);
    
    // Extract flags
    const flagsMatch = content.match(/<flags\b([^>]*)\/?>/i);
    const flags = {};
    if (flagsMatch) {
      const flagPairs = parseXmlAttributes(flagsMatch[1]);
      for (const [key, value] of Object.entries(flagPairs)) {
        flags[key] = value === "1" || value === "true";
      }
    }
    
    // Calculate spawn rating (0-100 scale based on nominal)
    // Higher nominal = more common
    let spawnRating = 'unknown';
    let spawnScore = 0;
    
    if (nominal === 0) {
      spawnRating = 'none';
      spawnScore = 0;
    } else if (nominal <= 2) {
      spawnRating = 'extremely_rare';
      spawnScore = 5;
    } else if (nominal <= 5) {
      spawnRating = 'very_rare';
      spawnScore = 15;
    } else if (nominal <= 10) {
      spawnRating = 'rare';
      spawnScore = 25;
    } else if (nominal <= 20) {
      spawnRating = 'uncommon';
      spawnScore = 40;
    } else if (nominal <= 50) {
      spawnRating = 'common';
      spawnScore = 60;
    } else if (nominal <= 100) {
      spawnRating = 'very_common';
      spawnScore = 80;
    } else {
      spawnRating = 'abundant';
      spawnScore = 100;
    }
    
    types.set(className.toLowerCase(), {
      className,
      nominal,
      min,
      lifetime,
      restock,
      cost,
      quantmin,
      quantmax,
      category,
      usage,
      tiers,
      flags,
      spawnRating,
      spawnScore,
      // Is this item meant to spawn?
      spawns: nominal > 0 && !flags.crafted,
      // Effective spawn rate considering restock
      effectiveSpawnRate: restock > 0 ? nominal / (restock / 3600) : nominal
    });
  }
  
  return types;
}

function extractValue(content, tagName) {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Load a type XML file into the merged catalogue and record load metadata.
 * Later files win for duplicate class names, matching DayZ's additive mod model.
 */
async function loadTypesFile({
  allTypes,
  sourcePath,
  label,
  kind,
  summary,
  seenSourcePaths,
  ref = null,
}) {
  if (!sourcePath) return false;

  const sourceKey = normalizeSourceKey(sourcePath);
  if (seenSourcePaths.has(sourceKey)) return false;
  seenSourcePaths.add(sourceKey);

  const sourceInfo = {
    path: sourcePath,
    label: label || sourceFileName(sourcePath),
    kind,
    ref,
  };

  if (!(await exists(sourcePath))) {
    summary.missingFiles.push({
      ...sourceInfo,
      message: "File was referenced but not found",
    });
    console.warn(`[Types] Missing ${sourceInfo.label}: ${sourcePath}`);
    return false;
  }

  try {
    const content = await readFile(sourcePath, "utf-8");
    const types = parseTypesXml(content);
    let duplicateItems = 0;

    for (const [key, value] of types) {
      if (allTypes.has(key)) duplicateItems++;
      allTypes.set(key, {
        ...value,
        source: {
          path: sourcePath,
          label: sourceInfo.label,
          kind,
        },
      });
    }

    summary.duplicateItems += duplicateItems;
    summary.sourceFiles.push({
      ...sourceInfo,
      itemCount: types.size,
      duplicateItems,
    });

    console.log(`[Types] Loaded ${types.size} items from ${sourceInfo.label}`);
    return true;
  } catch (err) {
    summary.errors.push({
      ...sourceInfo,
      message: err?.message || String(err),
    });
    console.error(`[Types] Error loading ${sourceInfo.label}:`, err?.message || err);
    return false;
  }
}

function cacheTypesData(cacheKey, allTypes, summary) {
  summary.totalItems = allTypes.size;
  summary.loadedAt = new Date().toISOString();
  typesCacheByKey.set(cacheKey, {
    data: allTypes,
    summary,
    time: Date.now(),
  });

  console.log(`[Types] Total items loaded: ${allTypes.size} from ${summary.sourceFiles.length} file(s)`);
  return allTypes;
}

/**
 * Load all configured economy type XML files for the active server profile.
 *
 * Sources, in order:
 * - TYPES_PATH if configured, otherwise MISSION_PATH/db/types.xml
 * - Legacy extra *types*.xml files in MISSION_PATH/db
 * - Explicit <file type="types"> entries from MISSION_PATH/cfgeconomycore.xml
 */
export async function loadTypesData(forceRefresh = false) {
  const { context, missionPath, customTypesPath, cacheKey } = currentTypesConfig();
  const cached = typesCacheByKey.get(cacheKey);

  if (!forceRefresh && cached && (Date.now() - cached.time) < CACHE_DURATION) {
    return cached.data;
  }
  
  const allTypes = new Map();
  const summary = createLoadSummary(context, missionPath, customTypesPath);
  const seenSourcePaths = new Set();
  let loadedMainTypes = false;

  if (customTypesPath) {
    loadedMainTypes = await loadTypesFile({
      allTypes,
      sourcePath: customTypesPath,
      label: "TYPES_PATH",
      kind: "custom",
      summary,
      seenSourcePaths,
    });
  }
  
  if (!missionPath || !(await exists(missionPath))) {
    console.warn('[Types] Mission path not configured or not found:', missionPath);
    return cacheTypesData(cacheKey, allTypes, summary);
  }
  
  // Primary db/types.xml
  const mainTypesPath = joinStoragePath(missionPath, 'db', 'types.xml');
  if (!loadedMainTypes) {
    await loadTypesFile({
      allTypes,
      sourcePath: mainTypesPath,
      label: "db/types.xml",
      kind: "mission",
      summary,
      seenSourcePaths,
    });
  }
  
  // Backward-compatible support for extra type files placed directly in db/.
  // cfgeconomycore.xml references below are preferred because they are explicit.
  const dbPath = joinStoragePath(missionPath, 'db');
  if (await exists(dbPath)) {
    try {
      const files = await readdir(dbPath);
      for (const file of files) {
        const fileLower = String(file).toLowerCase();
        if (fileLower.endsWith('.xml') && fileLower !== 'types.xml' && fileLower.includes('types')) {
          await loadTypesFile({
            allTypes,
            sourcePath: joinStoragePath(dbPath, file),
            label: `db/${file}`,
            kind: "mission-db-extra",
            summary,
            seenSourcePaths,
          });
        }
      }
    } catch (err) {
      summary.errors.push({
        path: dbPath,
        label: "db",
        kind: "mission-db-extra",
        message: err?.message || String(err),
      });
    }
  }
  
  // Parse cfgeconomycore.xml to find explicitly listed mod type files.
  const economyCorePath = joinStoragePath(missionPath, 'cfgeconomycore.xml');
  summary.economyCore = {
    path: economyCorePath,
    found: false,
    typeFileRefs: 0,
    loadedFileRefs: 0,
  };

  if (await exists(economyCorePath)) {
    summary.economyCore.found = true;

    try {
      const economyContent = await readFile(economyCorePath, 'utf-8');
      const refs = parseEconomyCoreTypeRefs(economyContent);
      summary.economyCore.typeFileRefs = refs.length;

      for (const ref of refs) {
        const loaded = await loadTypesFile({
          allTypes,
          sourcePath: joinStoragePath(missionPath, ref.relativePath),
          label: ref.relativePath,
          kind: "cfgeconomycore",
          summary,
          seenSourcePaths,
          ref,
        });

        if (loaded) {
          summary.economyCore.loadedFileRefs++;
        }
      }
    } catch (err) {
      summary.errors.push({
        path: economyCorePath,
        label: "cfgeconomycore.xml",
        kind: "cfgeconomycore",
        message: err?.message || String(err),
      });
      console.error("[Types] Error loading cfgeconomycore.xml:", err?.message || err);
    }
  }
  
  return cacheTypesData(cacheKey, allTypes, summary);
}

/**
 * Get metadata for the active profile's loaded type files.
 */
export async function getTypesLoadSummary(forceRefresh = false) {
  const { cacheKey } = currentTypesConfig();
  await loadTypesData(forceRefresh);
  return typesCacheByKey.get(cacheKey)?.summary || null;
}

/**
 * Get spawn data for a specific item
 */
export async function getItemSpawnData(className) {
  const types = await loadTypesData();
  return types.get(className.toLowerCase()) || null;
}

/**
 * Get spawn statistics summary
 */
export async function getSpawnStats() {
  const types = await loadTypesData();
  const loadSummary = await getTypesLoadSummary();
  
  const stats = {
    totalItems: types.size,
    spawningItems: 0,
    categories: {},
    spawnRatings: {
      none: 0,
      extremely_rare: 0,
      very_rare: 0,
      rare: 0,
      uncommon: 0,
      common: 0,
      very_common: 0,
      abundant: 0
    },
    sourceFileCount: loadSummary?.sourceFiles?.length || 0,
    sources: loadSummary?.sourceFiles || [],
    economyCore: loadSummary?.economyCore || null,
    duplicateItems: loadSummary?.duplicateItems || 0,
    missingFiles: loadSummary?.missingFiles || [],
    errors: loadSummary?.errors || [],
  };
  
  for (const item of types.values()) {
    if (item.spawns) stats.spawningItems++;
    
    if (item.category) {
      stats.categories[item.category] = (stats.categories[item.category] || 0) + 1;
    }
    
    if (item.spawnRating && stats.spawnRatings[item.spawnRating] !== undefined) {
      stats.spawnRatings[item.spawnRating]++;
    }
  }
  
  return stats;
}

/**
 * Analyze price vs spawn rate to identify potential issues
 * @param {Object} itemTradeData - Trade data with className, avgPrice, purchases, sales
 * @param {Object} spawnData - Spawn data from loaded economy type files
 * @returns {Object|null} Analysis result
 */
export function analyzeSpawnVsPrice(itemTradeData, spawnData) {
  if (!spawnData || !itemTradeData) return null;
  
  const { avgPrice, purchases, sales } = itemTradeData;
  const { nominal, spawnRating, spawnScore, category } = spawnData;
  
  // Calculate expected price tier based on rarity
  // Rare items should be expensive, common items should be cheap
  let expectedPriceTier = 'medium';
  let priceIssue = null;
  let severity = 'info';
  
  // Price expectations by spawn rating
  const priceExpectations = {
    'extremely_rare': { minPrice: 5000, tier: 'very_high', description: 'extremely rare item' },
    'very_rare': { minPrice: 2000, tier: 'high', description: 'very rare item' },
    'rare': { minPrice: 500, tier: 'medium_high', description: 'rare item' },
    'uncommon': { minPrice: 100, tier: 'medium', description: 'uncommon item' },
    'common': { maxPrice: 500, tier: 'low', description: 'common item' },
    'very_common': { maxPrice: 200, tier: 'very_low', description: 'very common item' },
    'abundant': { maxPrice: 100, tier: 'minimal', description: 'abundant item' }
  };
  
  const expectation = priceExpectations[spawnRating];
  
  if (expectation) {
    // Check if price is too high for common items
    if (expectation.maxPrice && avgPrice > expectation.maxPrice) {
      const overpricedBy = avgPrice - expectation.maxPrice;
      const overpricePercent = Math.round((overpricedBy / expectation.maxPrice) * 100);
      
      priceIssue = {
        type: 'overpriced_common',
        message: `This ${expectation.description} (nominal: ${nominal}) is selling for $${avgPrice}, but spawns frequently. Consider lowering to ~$${expectation.maxPrice} or less.`,
        suggestedMaxPrice: expectation.maxPrice,
        overpricePercent
      };
      severity = overpricePercent > 200 ? 'critical' : overpricePercent > 100 ? 'warning' : 'info';
    }
    // Check if price is too low for rare items
    else if (expectation.minPrice && avgPrice < expectation.minPrice) {
      const underpricedBy = expectation.minPrice - avgPrice;
      const underpricePercent = Math.round((underpricedBy / avgPrice) * 100);
      
      priceIssue = {
        type: 'underpriced_rare',
        message: `This ${expectation.description} (nominal: ${nominal}) is only selling for $${avgPrice}. For its rarity, consider raising to ~$${expectation.minPrice} or more.`,
        suggestedMinPrice: expectation.minPrice,
        underpricePercent
      };
      severity = underpricePercent > 500 ? 'critical' : underpricePercent > 200 ? 'warning' : 'info';
    }
  }
  
  return {
    className: itemTradeData.className,
    displayName: itemTradeData.displayName,
    currentPrice: avgPrice,
    spawnData: {
      nominal,
      spawnRating,
      spawnScore,
      category
    },
    priceIssue,
    severity,
    // Score: how well price matches rarity (100 = perfect, 0 = completely mismatched)
    priceRarityAlignment: calculatePriceRarityScore(avgPrice, spawnScore)
  };
}

/**
 * Calculate how well price aligns with rarity
 * High spawn (common) + low price = good alignment
 * Low spawn (rare) + high price = good alignment
 * High spawn + high price = bad (overpriced)
 * Low spawn + low price = bad (underpriced)
 */
function calculatePriceRarityScore(price, spawnScore) {
  // Normalize price to 0-100 scale (assume max price is ~20000)
  const priceScore = Math.min(100, (price / 200)); // $20k = 100, $0 = 0
  
  // Ideal: inverse relationship
  // Common items (high spawnScore) should have low priceScore
  // Rare items (low spawnScore) should have high priceScore
  const idealPriceScore = 100 - spawnScore;
  
  // Calculate alignment (0-100, 100 = perfect match)
  const difference = Math.abs(priceScore - idealPriceScore);
  const alignment = Math.max(0, 100 - difference);
  
  return Math.round(alignment);
}

export default {
  loadTypesData,
  getTypesLoadSummary,
  getItemSpawnData,
  getSpawnStats,
  analyzeSpawnVsPrice,
  parseEconomyCoreTypeRefs,
};
