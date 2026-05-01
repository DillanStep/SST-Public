import { Router } from "express";
import { readFile, readdir, writeFile } from "../storage/fs.js";
import { joinStoragePath } from "../utils/storagePath.js";
import { paths, features } from "../config.js";

const router = Router();

// Middleware to check if Expansion is enabled
function requireExpansion(req, res, next) {
  if (!features.expansionEnabled) {
    return res.status(404).json({ 
      error: "Expansion mod features are disabled",
      code: "EXPANSION_DISABLED",
      hint: "Set EXPANSION_ENABLED=1 in your .env file to enable Expansion mod features"
    });
  }
  next();
}

// Apply to all routes
router.use(requireExpansion);

// Helper to clean up localization strings like "#STR_EXPANSION_MARKET_CATEGORY_AMMO"
function cleanDisplayName(name, fallbackFileName) {
  if (!name || name.startsWith("#STR_")) {
    // Use filename without extension as fallback
    if (fallbackFileName) {
      return fallbackFileName
        .replace(/\.json$/i, "")
        .replace(/([A-Z])/g, " $1") // Add space before capitals
        .replace(/[-_]/g, " ") // Replace dashes/underscores with spaces
        .trim();
    }
    // Or clean up the STR key
    if (name) {
      return name
        .replace("#STR_EXPANSION_MARKET_CATEGORY_", "")
        .replace("#STR_EXPANSION_MARKET_TRADER_", "")
        .replace("#STR_EXPANSION_", "")
        .replace("#STR_", "")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase()); // Title case
    }
    return fallbackFileName || "Unknown";
  }
  return name;
}

// ============================================================================
// TRADER ZONES - Located in mission folder under expansion/traderzones/
// ============================================================================

// GET all trader zones
router.get("/zones", async (req, res) => {
  try {
    const zonesPath = joinStoragePath(paths.missionFolder, "expansion", "traderzones");
    const files = await readdir(zonesPath);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    
    const zones = [];
    for (const file of jsonFiles) {
      try {
        const content = await readFile(joinStoragePath(zonesPath, file), "utf8");
        const zone = JSON.parse(content);
        zones.push({
          fileName: file,
          ...zone
        });
      } catch (err) {
        console.error(`Error reading zone file ${file}:`, err.message);
      }
    }
    
    res.json({ zones });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single trader zone
router.get("/zones/:fileName", async (req, res) => {
  try {
    const zonesPath = joinStoragePath(paths.missionFolder, "expansion", "traderzones");
    const filePath = joinStoragePath(zonesPath, req.params.fileName);
    const content = await readFile(filePath, "utf8");
    res.json(JSON.parse(content));
  } catch (err) {
    res.status(404).json({ error: `Zone not found: ${err.message}` });
  }
});

// PUT update trader zone
router.put("/zones/:fileName", async (req, res) => {
  try {
    const zonesPath = joinStoragePath(paths.missionFolder, "expansion", "traderzones");
    const filePath = joinStoragePath(zonesPath, req.params.fileName);
    
    // Validate the data has required fields
    const zone = req.body;
    if (!zone.m_DisplayName || !zone.Position || !zone.Radius) {
      return res.status(400).json({ error: "Missing required fields: m_DisplayName, Position, Radius" });
    }
    
    await writeFile(filePath, JSON.stringify(zone, null, 4), "utf8");
    res.json({ success: true, message: `Zone ${req.params.fileName} updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// TRADERS - Located in ExpansionMod/Traders/
// Define what items each trader sells and their categories
// ============================================================================

// GET all traders
router.get("/traders", async (req, res) => {
  try {
    const files = await readdir(paths.expansionTraders);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    
    const traders = [];
    for (const file of jsonFiles) {
      try {
        const content = await readFile(joinStoragePath(paths.expansionTraders, file), "utf8");
        const trader = JSON.parse(content);
        traders.push({
          fileName: file,
          displayName: cleanDisplayName(trader.DisplayName, file),
          traderIcon: trader.TraderIcon,
          categories: trader.Categories || [],
          itemCount: trader.Items ? Object.keys(trader.Items).length : 0
        });
      } catch (err) {
        console.error(`Error reading trader file ${file}:`, err.message);
      }
    }
    
    res.json({ traders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single trader (full data)
router.get("/traders/:fileName", async (req, res) => {
  try {
    const filePath = joinStoragePath(paths.expansionTraders, req.params.fileName);
    const content = await readFile(filePath, "utf8");
    res.json(JSON.parse(content));
  } catch (err) {
    res.status(404).json({ error: `Trader not found: ${err.message}` });
  }
});

// PUT update trader
router.put("/traders/:fileName", async (req, res) => {
  try {
    const filePath = joinStoragePath(paths.expansionTraders, req.params.fileName);
    const trader = req.body;
    
    await writeFile(filePath, JSON.stringify(trader, null, 4), "utf8");
    res.json({ success: true, message: `Trader ${req.params.fileName} updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MARKET - Located in ExpansionMod/Market/
// Define pricing for items
// ============================================================================

// GET all market categories (summary)
router.get("/market", async (req, res) => {
  try {
    const files = await readdir(paths.expansionMarket);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    
    const categories = [];
    for (const file of jsonFiles) {
      try {
        const content = await readFile(joinStoragePath(paths.expansionMarket, file), "utf8");
        const category = JSON.parse(content);
        categories.push({
          fileName: file,
          displayName: cleanDisplayName(category.DisplayName, file),
          icon: category.Icon,
          color: category.Color,
          itemCount: category.Items ? category.Items.length : 0,
          isExchange: category.IsExchange
        });
      } catch (err) {
        console.error(`Error reading market file ${file}:`, err.message);
      }
    }
    
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single market category (full data with items)
router.get("/market/:fileName", async (req, res) => {
  try {
    const filePath = joinStoragePath(paths.expansionMarket, req.params.fileName);
    const content = await readFile(filePath, "utf8");
    const category = JSON.parse(content);
    // Clean the display name for the response
    category.DisplayName = cleanDisplayName(category.DisplayName, req.params.fileName);
    res.json(category);
  } catch (err) {
    res.status(404).json({ error: `Market category not found: ${err.message}` });
  }
});

// PUT update market category
router.put("/market/:fileName", async (req, res) => {
  try {
    const filePath = joinStoragePath(paths.expansionMarket, req.params.fileName);
    const category = req.body;
    
    await writeFile(filePath, JSON.stringify(category, null, 4), "utf8");
    res.json({ success: true, message: `Market category ${req.params.fileName} updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update single item in market category
router.put("/market/:fileName/item/:className", async (req, res) => {
  try {
    const filePath = joinStoragePath(paths.expansionMarket, req.params.fileName);
    const content = await readFile(filePath, "utf8");
    const category = JSON.parse(content);
    
    const itemIndex = category.Items.findIndex(
      item => item.ClassName.toLowerCase() === req.params.className.toLowerCase()
    );
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: `Item ${req.params.className} not found in ${req.params.fileName}` });
    }
    
    // Update only the fields provided
    category.Items[itemIndex] = {
      ...category.Items[itemIndex],
      ...req.body
    };
    
    await writeFile(filePath, JSON.stringify(category, null, 4), "utf8");
    res.json({ 
      success: true, 
      message: `Item ${req.params.className} updated`,
      item: category.Items[itemIndex]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add item to market category
router.post("/market/:fileName/item", async (req, res) => {
  try {
    const filePath = joinStoragePath(paths.expansionMarket, req.params.fileName);
    const content = await readFile(filePath, "utf8");
    const category = JSON.parse(content);
    
    const newItem = req.body;
    if (!newItem.ClassName) {
      return res.status(400).json({ error: "ClassName is required" });
    }
    
    // Check if item already exists
    const exists = category.Items.some(
      item => item.ClassName.toLowerCase() === newItem.ClassName.toLowerCase()
    );
    if (exists) {
      return res.status(400).json({ error: `Item ${newItem.ClassName} already exists` });
    }
    
    // Add with defaults
    const item = {
      ClassName: newItem.ClassName,
      MaxPriceThreshold: newItem.MaxPriceThreshold || 1000,
      MinPriceThreshold: newItem.MinPriceThreshold || 500,
      SellPricePercent: newItem.SellPricePercent ?? -1.0,
      MaxStockThreshold: newItem.MaxStockThreshold || 100,
      MinStockThreshold: newItem.MinStockThreshold || 1,
      QuantityPercent: newItem.QuantityPercent ?? -1,
      SpawnAttachments: newItem.SpawnAttachments || [],
      Variants: newItem.Variants || []
    };
    
    category.Items.push(item);
    await writeFile(filePath, JSON.stringify(category, null, 4), "utf8");
    
    res.json({ 
      success: true, 
      message: `Item ${newItem.ClassName} added to ${req.params.fileName}`,
      item
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE item from market category
router.delete("/market/:fileName/item/:className", async (req, res) => {
  try {
    const filePath = joinStoragePath(paths.expansionMarket, req.params.fileName);
    const content = await readFile(filePath, "utf8");
    const category = JSON.parse(content);
    
    const itemIndex = category.Items.findIndex(
      item => item.ClassName.toLowerCase() === req.params.className.toLowerCase()
    );
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: `Item ${req.params.className} not found` });
    }
    
    category.Items.splice(itemIndex, 1);
    await writeFile(filePath, JSON.stringify(category, null, 4), "utf8");
    
    res.json({ 
      success: true, 
      message: `Item ${req.params.className} removed from ${req.params.fileName}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

// Search for an item across all market files
router.get("/market-search/:className", async (req, res) => {
  try {
    const className = req.params.className.toLowerCase();
    const files = await readdir(paths.expansionMarket);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    
    const results = [];
    
    for (const file of jsonFiles) {
      try {
        const content = await readFile(joinStoragePath(paths.expansionMarket, file), "utf8");
        const category = JSON.parse(content);
        
        const item = category.Items?.find(
          i => i.ClassName.toLowerCase() === className
        );
        
        if (item) {
          results.push({
            fileName: file,
            categoryName: cleanDisplayName(category.DisplayName, file),
            item: item
          });
        }
      } catch (err) {
        console.error(`Error searching ${file}:`, err.message);
      }
    }
    
    res.json({ 
      className: req.params.className,
      found: results.length > 0,
      results 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply a price change to an item (finds it automatically)
router.post("/apply-price", async (req, res) => {
  try {
    const { className, newBuyPrice, newSellPrice, newSellPercent } = req.body;
    
    if (!className) {
      return res.status(400).json({ error: "className is required" });
    }
    
    const classNameLower = className.toLowerCase();
    const files = await readdir(paths.expansionMarket);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    
    let updated = false;
    let updatedFile = null;
    let oldValues = null;
    let newValues = null;
    
    for (const file of jsonFiles) {
      try {
        const filePath = joinStoragePath(paths.expansionMarket, file);
        const content = await readFile(filePath, "utf8");
        const category = JSON.parse(content);
        
        const itemIndex = category.Items?.findIndex(
          i => i.ClassName.toLowerCase() === classNameLower
        );
        
        if (itemIndex !== -1 && itemIndex !== undefined) {
          const item = category.Items[itemIndex];
          oldValues = {
            MaxPriceThreshold: item.MaxPriceThreshold,
            MinPriceThreshold: item.MinPriceThreshold,
            SellPricePercent: item.SellPricePercent
          };
          
          // Apply new prices
          if (newBuyPrice !== undefined) {
            // MaxPriceThreshold is the buy price (what players pay)
            item.MaxPriceThreshold = Math.round(newBuyPrice);
            // MinPriceThreshold is usually lower, adjust proportionally
            const ratio = oldValues.MinPriceThreshold / oldValues.MaxPriceThreshold;
            item.MinPriceThreshold = Math.round(newBuyPrice * ratio);
          }
          
          if (newSellPrice !== undefined) {
            // Calculate sell percent based on new sell price
            const buyPrice = item.MaxPriceThreshold;
            item.SellPricePercent = (newSellPrice / buyPrice) * 100;
          } else if (newSellPercent !== undefined) {
            item.SellPricePercent = newSellPercent;
          }
          
          newValues = {
            MaxPriceThreshold: item.MaxPriceThreshold,
            MinPriceThreshold: item.MinPriceThreshold,
            SellPricePercent: item.SellPricePercent
          };
          
          // Write back
          await writeFile(filePath, JSON.stringify(category, null, 4), "utf8");
          updated = true;
          updatedFile = file;
          break;
        }
      } catch (err) {
        console.error(`Error processing ${file}:`, err.message);
      }
    }
    
    if (!updated) {
      return res.status(404).json({ 
        error: `Item ${className} not found in any market file` 
      });
    }
    
    res.json({
      success: true,
      message: `Price updated for ${className}`,
      file: updatedFile,
      oldValues,
      newValues
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply multiple price changes at once
router.post("/apply-prices-bulk", async (req, res) => {
  try {
    const { changes } = req.body;
    
    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: "changes array is required" });
    }
    
    // Load all market files into memory
    const files = await readdir(paths.expansionMarket);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    
    const marketData = new Map();
    for (const file of jsonFiles) {
      try {
        const content = await readFile(joinStoragePath(paths.expansionMarket, file), "utf8");
        marketData.set(file, JSON.parse(content));
      } catch {}
    }
    
    const results = [];
    const filesToWrite = new Set();
    
    for (const change of changes) {
      const { className, newBuyPrice, newSellPrice, newSellPercent } = change;
      
      if (!className) {
        results.push({ className: 'unknown', success: false, error: 'No className provided' });
        continue;
      }
      
      const classNameLower = className.toLowerCase();
      let found = false;
      
      for (const [file, category] of marketData) {
        const itemIndex = category.Items?.findIndex(
          i => i.ClassName.toLowerCase() === classNameLower
        );
        
        if (itemIndex !== -1 && itemIndex !== undefined) {
          const item = category.Items[itemIndex];
          const oldPrice = item.MaxPriceThreshold;
          
          if (newBuyPrice !== undefined) {
            const ratio = item.MinPriceThreshold / item.MaxPriceThreshold;
            item.MaxPriceThreshold = Math.round(newBuyPrice);
            item.MinPriceThreshold = Math.round(newBuyPrice * ratio);
          }
          
          if (newSellPrice !== undefined) {
            item.SellPricePercent = (newSellPrice / item.MaxPriceThreshold) * 100;
          } else if (newSellPercent !== undefined) {
            item.SellPricePercent = newSellPercent;
          }
          
          filesToWrite.add(file);
          results.push({
            className,
            success: true,
            file,
            oldPrice,
            newPrice: item.MaxPriceThreshold
          });
          found = true;
          break;
        }
      }
      
      if (!found) {
        results.push({ className, success: false, error: 'Not found in market files' });
      }
    }
    
    // Write all modified files
    for (const file of filesToWrite) {
      const filePath = joinStoragePath(paths.expansionMarket, file);
      await writeFile(filePath, JSON.stringify(marketData.get(file), null, 4), "utf8");
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    res.json({
      success: true,
      message: `Applied ${successCount} price changes (${failCount} failed)`,
      filesModified: [...filesToWrite],
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all expansion data at once
router.get("/all", async (req, res) => {
  try {
    // Get zones
    const zonesPath = joinStoragePath(paths.missionFolder, "expansion", "traderzones");
    let zones = [];
    try {
      const zoneFiles = await readdir(zonesPath);
      for (const file of zoneFiles.filter(f => f.endsWith(".json"))) {
        try {
          const content = await readFile(joinStoragePath(zonesPath, file), "utf8");
          zones.push({ fileName: file, ...JSON.parse(content) });
        } catch {}
      }
    } catch {}
    
    // Get traders
    let traders = [];
    try {
      const traderFiles = await readdir(paths.expansionTraders);
      for (const file of traderFiles.filter(f => f.endsWith(".json"))) {
        try {
          const content = await readFile(joinStoragePath(paths.expansionTraders, file), "utf8");
          const trader = JSON.parse(content);
          traders.push({
            fileName: file,
            displayName: cleanDisplayName(trader.DisplayName, file),
            traderIcon: trader.TraderIcon,
            categories: trader.Categories || [],
            itemCount: trader.Items ? Object.keys(trader.Items).length : 0
          });
        } catch {}
      }
    } catch {}
    
    // Get market categories
    let market = [];
    try {
      const marketFiles = await readdir(paths.expansionMarket);
      for (const file of marketFiles.filter(f => f.endsWith(".json"))) {
        try {
          const content = await readFile(joinStoragePath(paths.expansionMarket, file), "utf8");
          const category = JSON.parse(content);
          market.push({
            fileName: file,
            displayName: cleanDisplayName(category.DisplayName, file),
            icon: category.Icon,
            itemCount: category.Items ? category.Items.length : 0
          });
        } catch {}
      }
    } catch {}
    
    res.json({ zones, traders, market });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
