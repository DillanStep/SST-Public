import { readFile, readdir, stat } from "../storage/fs.js";
import { paths } from "../config.js";
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

// Cache for types data
let typesCache = null;
let typesCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Parse types.xml file and extract spawn data
 * @param {string} xmlContent - Raw XML content
 * @returns {Map} Map of className -> spawn data
 */
function parseTypesXml(xmlContent) {
  const types = new Map();
  
  // Simple regex-based parser for types.xml
  // Match each <type name="...">...</type> block
  const typeRegex = /<type\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/type>/gi;
  
  let match;
  while ((match = typeRegex.exec(xmlContent)) !== null) {
    const className = match[1];
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
    const categoryMatch = content.match(/<category\s+name="([^"]+)"/i);
    const category = categoryMatch ? categoryMatch[1] : null;
    
    // Extract usage locations
    const usageMatches = content.matchAll(/<usage\s+name="([^"]+)"/gi);
    const usage = [...usageMatches].map(m => m[1]);
    
    // Extract tier values
    const valueMatches = content.matchAll(/<value\s+name="([^"]+)"/gi);
    const tiers = [...valueMatches].map(m => m[1]);
    
    // Extract flags
    const flagsMatch = content.match(/<flags\s+([^>]+)/i);
    const flags = {};
    if (flagsMatch) {
      const flagContent = flagsMatch[1];
      const flagPairs = flagContent.matchAll(/(\w+)="([^"]+)"/g);
      for (const [, key, value] of flagPairs) {
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
 * Load all types.xml files from mission folder
 * Searches db/ folder and any cfgeconomycore.xml referenced folders
 * Can be overridden with TYPES_PATH in .env
 */
export async function loadTypesData(forceRefresh = false) {
  // Check cache
  if (!forceRefresh && typesCache && (Date.now() - typesCacheTime) < CACHE_DURATION) {
    return typesCache;
  }
  
  const allTypes = new Map();
  const missionPath = paths.missionFolder;
  const customTypesPath = paths.typesXml; // Custom override path
  
  // If custom TYPES_PATH is set, use that directly
  if (customTypesPath && (await exists(customTypesPath))) {
    try {
      const content = await readFile(customTypesPath, 'utf-8');
      const types = parseTypesXml(content);
      for (const [key, value] of types) {
        allTypes.set(key, value);
      }
      console.log(`[Types] Loaded ${types.size} items from custom path: ${customTypesPath}`);
      
      // Update cache
      typesCache = allTypes;
      typesCacheTime = Date.now();
      return allTypes;
    } catch (err) {
      console.error('[Types] Error loading custom types.xml:', err.message);
    }
  }
  
  if (!missionPath || !(await exists(missionPath))) {
    console.warn('[Types] Mission path not configured or not found:', missionPath);
    return allTypes;
  }
  
  // Primary db/types.xml
  const mainTypesPath = joinStoragePath(missionPath, 'db', 'types.xml');
  if (await exists(mainTypesPath)) {
    try {
      const content = await readFile(mainTypesPath, 'utf-8');
      const types = parseTypesXml(content);
      for (const [key, value] of types) {
        allTypes.set(key, value);
      }
      console.log(`[Types] Loaded ${types.size} items from main types.xml`);
    } catch (err) {
      console.error('[Types] Error loading main types.xml:', err.message);
    }
  }
  
  // Look for additional types files in db/ folder
  const dbPath = joinStoragePath(missionPath, 'db');
  if (await exists(dbPath)) {
    try {
      const files = await readdir(dbPath);
      for (const file of files) {
        if (file.endsWith('.xml') && file !== 'types.xml' && file.toLowerCase().includes('types')) {
          try {
            const content = await readFile(joinStoragePath(dbPath, file), 'utf-8');
            const types = parseTypesXml(content);
            for (const [key, value] of types) {
              allTypes.set(key, value);
            }
            console.log(`[Types] Loaded ${types.size} items from ${file}`);
          } catch (err) {
            console.error(`[Types] Error loading ${file}:`, err.message);
          }
        }
      }
    } catch {}
  }
  
  // Parse cfgeconomycore.xml to find additional CE folders
  const economyCorePath = joinStoragePath(missionPath, 'cfgeconomycore.xml');
  if (await exists(economyCorePath)) {
    try {
      const economyContent = await readFile(economyCorePath, 'utf-8');
      // Look for folder references: <ce folder="...">
      const folderMatches = economyContent.matchAll(/<ce\s+folder="([^"]+)"/gi);
      
      for (const match of folderMatches) {
        const folder = match[1];
        const folderPath = joinStoragePath(missionPath, folder);
        
        if (await exists(folderPath)) {
          try {
            const files = await readdir(folderPath);
            for (const file of files) {
              if (file.toLowerCase().includes('types') && file.endsWith('.xml')) {
                try {
                  const content = await readFile(joinStoragePath(folderPath, file), 'utf-8');
                  const types = parseTypesXml(content);
                  for (const [key, value] of types) {
                    allTypes.set(key, value);
                  }
                  console.log(`[Types] Loaded ${types.size} items from ${folder}/${file}`);
                } catch (err) {
                  console.error(`[Types] Error loading ${folder}/${file}:`, err.message);
                }
              }
            }
          } catch {}
        }
      }
    } catch {}
  }
  
  // Update cache
  typesCache = allTypes;
  typesCacheTime = Date.now();
  
  console.log(`[Types] Total items loaded: ${allTypes.size}`);
  return allTypes;
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
    }
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
 * @param {Object} spawnData - Spawn data from types.xml
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
  getItemSpawnData,
  getSpawnStats,
  analyzeSpawnVsPrice
};
