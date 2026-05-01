import { Router } from "express";
import { readFile, readdir } from "../storage/fs.js";
import { paths } from "../config.js";
import { consoleUi } from "../utils/consoleUi.js";

const router = Router();

// Cache for items (loaded once, refreshed on demand)
let itemsCache = null;
let lastLoaded = null;

// Cache for inventory item counts
let inventoryCountsCache = null;
let inventoryCountsLastLoaded = null;

async function loadItems() {
  try {
    const file = `${paths.api}/server_items.json`;
    const data = JSON.parse(await readFile(file, "utf8"));
    itemsCache = data;
    lastLoaded = new Date().toISOString();
    consoleUi.update({ itemsLoaded: data.itemCount });

    if (!consoleUi.isEnabled()) {
      console.log(`[Items] Loaded ${data.itemCount} items`);
    }
    return data;
  } catch (err) {
    console.error("[Items] Failed to load:", err.message);
    return null;
  }
}

// Load on startup
loadItems();

// GET /items - all items
router.get("/", async (req, res) => {
  if (!itemsCache) {
    await loadItems();
  }
  if (!itemsCache) {
    return res.status(404).json({ error: "Items not found" });
  }
  res.json(itemsCache);
});

// GET /items/search?q=Apple&category=Food - search items
router.get("/search", async (req, res) => {
  if (!itemsCache) {
    await loadItems();
  }
  if (!itemsCache) {
    return res.status(404).json({ error: "Items not found" });
  }

  let results = itemsCache.items;

  // Filter by search query (className or displayName)
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    results = results.filter(item =>
      item.className.toLowerCase().includes(q) ||
      item.displayName.toLowerCase().includes(q)
    );
  }

  // Filter by category
  if (req.query.category) {
    const cat = req.query.category.toLowerCase();
    results = results.filter(item =>
      item.category.toLowerCase() === cat
    );
  }

  // Filter by parent class
  if (req.query.parent) {
    const parent = req.query.parent.toLowerCase();
    results = results.filter(item =>
      item.parentClass.toLowerCase().includes(parent)
    );
  }

  // Limit results (default 100)
  const limit = parseInt(req.query.limit) || 100;
  results = results.slice(0, limit);

  res.json({
    query: req.query,
    count: results.length,
    items: results
  });
});

// GET /items/categories - list all categories
router.get("/categories", async (req, res) => {
  if (!itemsCache) {
    await loadItems();
  }
  if (!itemsCache) {
    return res.status(404).json({ error: "Items not found" });
  }

  const categories = [...new Set(itemsCache.items.map(i => i.category))].sort();
  res.json({ count: categories.length, categories });
});

// GET /items/:className - single item by class name
router.get("/:className", async (req, res) => {
  if (!itemsCache) {
    await loadItems();
  }
  if (!itemsCache) {
    return res.status(404).json({ error: "Items not found" });
  }

  const item = itemsCache.items.find(
    i => i.className.toLowerCase() === req.params.className.toLowerCase()
  );

  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  res.json(item);
});

// POST /items/refresh - reload from file
router.post("/refresh", async (req, res) => {
  await loadItems();
  res.json({ 
    status: "REFRESHED", 
    itemCount: itemsCache?.itemCount || 0,
    lastLoaded 
  });
});

// Helper to recursively count items in inventory (including cargo/attachments)
// Uses itemsCache to check if items are stackable - only count quantity for stackable items
function countItemsInInventory(items, counts) {
  if (!items || !Array.isArray(items)) return;
  
  for (const item of items) {
    const className = item.className?.toLowerCase();
    if (className) {
      // Check if this item is stackable by looking it up in itemsCache
      // Stackable items (like ammo, rags) have canBeStacked=1, use quantity as count
      // Non-stackable items use quantity for freshness/condition, count as 1
      let countToAdd = 1;
      
      if (itemsCache?.items) {
        const itemDef = itemsCache.items.find(i => i.className.toLowerCase() === className);
        if (itemDef && itemDef.canBeStacked === 1 && item.quantity) {
          // Stackable item - use quantity as count
          countToAdd = item.quantity;
        }
      }
      
      counts[className] = (counts[className] || 0) + countToAdd;
    }
    // Check nested cargo
    if (item.cargo) {
      countItemsInInventory(item.cargo, counts);
    }
    // Check attachments
    if (item.attachments) {
      countItemsInInventory(item.attachments, counts);
    }
  }
}

// Load inventory counts from all player inventories
async function loadInventoryCounts() {
  try {
    // Ensure items are loaded so we can check stackability
    if (!itemsCache) {
      await loadItems();
    }
    
    const files = await readdir(paths.inventories);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    
    const counts = {};
    let playerCount = 0;
    
    for (const file of jsonFiles) {
      try {
        const content = await readFile(`${paths.inventories}/${file}`, "utf8");
        const data = JSON.parse(content);
        
        // Handle both single player and multi-player inventory formats
        if (data.players) {
          for (const player of data.players) {
            countItemsInInventory(player.inventory, counts);
            playerCount++;
          }
        } else if (data.inventory) {
          countItemsInInventory(data.inventory, counts);
          playerCount++;
        }
      } catch (err) {
        // Skip files that can't be parsed
      }
    }
    
    inventoryCountsCache = counts;
    inventoryCountsLastLoaded = new Date().toISOString();

    if (!consoleUi.isEnabled()) {
      console.log(`[Items] Loaded inventory counts from ${playerCount} players, ${Object.keys(counts).length} unique items`);
    }
    return { counts, playerCount, uniqueItems: Object.keys(counts).length };
  } catch (err) {
    console.error("[Items] Failed to load inventory counts:", err.message);
    return null;
  }
}

// GET /items/inventory-counts - get count of each item across all player inventories
router.get("/inventory-counts", async (req, res) => {
  // Refresh if older than 30 seconds
  const now = Date.now();
  const cacheAge = inventoryCountsLastLoaded 
    ? now - new Date(inventoryCountsLastLoaded).getTime() 
    : Infinity;
    
  if (!inventoryCountsCache || cacheAge > 30000) {
    await loadInventoryCounts();
  }
  
  if (!inventoryCountsCache) {
    return res.status(500).json({ error: "Failed to load inventory counts" });
  }
  
  res.json({
    lastUpdated: inventoryCountsLastLoaded,
    counts: inventoryCountsCache
  });
});

// POST /items/inventory-counts/refresh - force refresh inventory counts
router.post("/inventory-counts/refresh", async (req, res) => {
  const result = await loadInventoryCounts();
  if (!result) {
    return res.status(500).json({ error: "Failed to load inventory counts" });
  }
  res.json({
    status: "REFRESHED",
    lastUpdated: inventoryCountsLastLoaded,
    playerCount: result.playerCount,
    uniqueItems: result.uniqueItems
  });
});

export default router;
