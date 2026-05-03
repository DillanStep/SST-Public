import express from "express";
import { mkdir, readFile, stat, writeFile } from "../storage/fs.js";
import { paths } from "../config.js";
import { joinStoragePath } from "../utils/storagePath.js";

const router = express.Router();

// Helper to safely read and parse JSON files
const safeReadJson = async (filePath, defaultValue = []) => {
  try {
    const content = await readFile(filePath, "utf8");
    if (!content || content.trim() === "") {
      return defaultValue;
    }
    return JSON.parse(content);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error(`[Vehicles] Error reading ${filePath}:`, err.message);
    }
    return defaultValue;
  }
};

const asArray = (data, possibleKeys = []) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  for (const key of possibleKeys) {
    if (Array.isArray(data[key])) return data[key];
  }

  return [];
};

const asString = (value, fallback = "") => {
  if (value === undefined || value === null) return fallback;
  return String(value);
};

const asNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeBoolean = (value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0" || normalized === "") return false;
  }

  return Boolean(value);
};

const parseBooleanQuery = (value) => {
  if (value === undefined) return undefined;
  return normalizeBoolean(value);
};

const normalizePosition = (position) => {
  let values = null;

  if (Array.isArray(position)) {
    values = position;
  } else if (typeof position === "string") {
    values = position.trim().split(/[,\s]+/);
  } else if (position && typeof position === "object") {
    values = [
      position.x ?? position.X ?? position[0],
      position.y ?? position.Y ?? position[1],
      position.z ?? position.Z ?? position[2]
    ];
  }

  if (!values || values.length < 3) return null;

  const x = asNumber(values[0]);
  const y = asNumber(values[1]);
  const z = asNumber(values[2]);

  if (x === null || y === null || z === null) return null;
  return [x, y, z];
};

const normalizeTrackedVehicle = (vehicle) => {
  const lastPosition = normalizePosition(vehicle?.lastPosition);
  const purchasePrice = asNumber(vehicle?.purchasePrice);

  return {
    ...vehicle,
    vehicleId: asString(vehicle?.vehicleId),
    vehicleClassName: asString(vehicle?.vehicleClassName, "Unknown vehicle"),
    vehicleDisplayName: asString(vehicle?.vehicleDisplayName, ""),
    ownerId: asString(vehicle?.ownerId),
    ownerName: asString(vehicle?.ownerName, "Unknown owner"),
    keyClassName: asString(vehicle?.keyClassName, "ExpansionCarKey"),
    purchaseTimestamp: asString(vehicle?.purchaseTimestamp),
    lastPosition: lastPosition ?? undefined,
    isDestroyed: normalizeBoolean(vehicle?.isDestroyed),
    purchasePrice: purchasePrice ?? vehicle?.purchasePrice
  };
};

const normalizePurchase = (purchase) => {
  const purchasePosition = normalizePosition(purchase?.purchasePosition);
  const purchasePrice = asNumber(purchase?.purchasePrice);

  return {
    ...purchase,
    vehicleId: asString(purchase?.vehicleId),
    vehicleClassName: asString(purchase?.vehicleClassName, "Unknown vehicle"),
    vehicleDisplayName: asString(purchase?.vehicleDisplayName, ""),
    ownerId: asString(purchase?.ownerId),
    ownerName: asString(purchase?.ownerName, "Unknown owner"),
    keyClassName: asString(purchase?.keyClassName, "ExpansionCarKey"),
    timestamp: asString(purchase?.timestamp),
    purchasePosition: purchasePosition ?? undefined,
    purchasePrice: purchasePrice ?? purchase?.purchasePrice
  };
};

const getTrackedVehicles = async () => {
  const trackedFile = joinStoragePath(paths.sst, "vehicles", "tracked.json");
  const data = await safeReadJson(trackedFile, []);
  return asArray(data, ["vehicles", "tracked", "items"]).map(normalizeTrackedVehicle);
};

const getVehiclePurchases = async () => {
  const purchasesFile = joinStoragePath(paths.sst, "vehicles", "purchases.json");
  const data = await safeReadJson(purchasesFile, []);
  return asArray(data, ["purchases", "vehicles", "items"]).map(normalizePurchase);
};

const exists = async (filePath) => {
  try {
    await stat(filePath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
};

const ensureDirectories = async () => {
  await mkdir(paths.api, { recursive: true });
  await mkdir(joinStoragePath(paths.sst, "vehicles"), { recursive: true });
};

// GET /vehicles - List all tracked vehicles
router.get("/", async (req, res) => {
  try {
    const vehicleList = await getTrackedVehicles();
    
    // Optional filtering
    const { ownerId, className, destroyed } = req.query;
    
    let filtered = vehicleList;
    
    if (ownerId) {
      filtered = filtered.filter(v => v.ownerId === ownerId);
    }
    
    if (className) {
      const classNameQuery = String(className).toLowerCase();
      filtered = filtered.filter(v => 
        v.vehicleClassName.toLowerCase().includes(classNameQuery)
      );
    }
    
    if (destroyed !== undefined) {
      const isDestroyed = parseBooleanQuery(destroyed);
      filtered = filtered.filter(v => v.isDestroyed === isDestroyed);
    }
    
    res.json({
      vehicles: filtered,
      count: filtered.length,
      totalTracked: vehicleList.length
    });
  } catch (err) {
    console.error(`[Vehicles] Error in GET /vehicles:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// IMPORTANT: Define specific routes BEFORE dynamic /:vehicleId route
// ============================================================================

// GET /vehicles/delete-results/all - Get vehicle deletion results
router.get("/delete-results/all", async (req, res) => {
  try {
    const resultsFile = joinStoragePath(paths.api, "vehicle_delete_results.json");
    const data = await safeReadJson(resultsFile, { requests: [] });
    const results = Array.isArray(data.requests) ? data.requests : [];
    
    res.json({
      results,
      count: results.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /vehicles/purchases/all - List all vehicle purchases
router.get("/purchases/all", async (req, res) => {
  try {
    await ensureDirectories();
    
    const purchaseList = await getVehiclePurchases();
    
    // Optional filtering
    const { ownerId, className, limit } = req.query;
    
    let filtered = purchaseList;
    
    if (ownerId) {
      filtered = filtered.filter(p => p.ownerId === ownerId);
    }
    
    if (className) {
      const classNameQuery = String(className).toLowerCase();
      filtered = filtered.filter(p => 
        p.vehicleClassName.toLowerCase().includes(classNameQuery)
      );
    }
    
    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    
    if (limit) {
      const parsedLimit = Number.parseInt(limit, 10);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        filtered = filtered.slice(0, parsedLimit);
      }
    }
    
    res.json({
      purchases: filtered,
      count: filtered.length,
      totalPurchases: purchaseList.length
    });
  } catch (err) {
    console.error(`[Vehicles] Error in GET /vehicles/purchases/all:`, err);
    res.status(500).json({ error: err.message });
  }
});

// GET /vehicles/key-results/all - Get key generation results
router.get("/key-results/all", async (req, res) => {
  try {
    const resultsFile = joinStoragePath(paths.api, "key_grants_results.json");
    const data = await safeReadJson(resultsFile, { requests: [] });
    const results = Array.isArray(data.requests) ? data.requests : [];
    
    res.json({
      results,
      count: results.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /vehicles/by-owner/:ownerId - Get all vehicles owned by a player
router.get("/by-owner/:ownerId", async (req, res) => {
  try {
    const { ownerId } = req.params;
    
    const vehicles = await getTrackedVehicles();
    const owned = vehicles.filter(v => v.ownerId === ownerId);
    
    res.json({
      ownerId,
      vehicles: owned,
      count: owned.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /vehicles/positions/all - Get all vehicle positions for map display
router.get("/positions/all", async (req, res) => {
  try {
    const vehicles = await getTrackedVehicles();
    
    // Extract just position data for map display
    const positions = vehicles
      .filter(v => !v.isDestroyed && normalizePosition(v.lastPosition))
      .map(v => ({
        vehicleId: v.vehicleId,
        className: v.vehicleClassName,
        displayName: v.vehicleDisplayName,
        position: normalizePosition(v.lastPosition),
        lastUpdate: v.lastUpdateTime,
        ownerName: v.ownerName,
        ownerId: v.ownerId
      }));
    
    res.json({
      positions,
      count: positions.length,
      lastUpdate: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Dynamic routes MUST come after specific routes
// ============================================================================

// GET /vehicles/:vehicleId - Get specific vehicle details
router.get("/:vehicleId", async (req, res) => {
  try {
    const { vehicleId } = req.params;
    
    const vehicles = await getTrackedVehicles();
    
    if (vehicles.length === 0) {
      return res.status(404).json({ error: "No vehicles tracked yet" });
    }
    
    const vehicle = vehicles.find(v => v.vehicleId === vehicleId);
    
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /vehicles/:vehicleId - Queue vehicle for deletion in-game
router.delete("/:vehicleId", async (req, res) => {
  try {
    await ensureDirectories();
    
    const { vehicleId } = req.params;
    
    // Validate vehicleId format (should be A-B-C-D where values can be negative)
    const idMatch = vehicleId.match(/^(-?\d+)-(-?\d+)-(-?\d+)-(-?\d+)$/);
    if (!idMatch) {
      return res.status(400).json({ 
        error: "Invalid vehicleId format. Expected: A-B-C-D (four integers, can be negative)" 
      });
    }
    
    // Check if vehicle exists in tracked list
    const trackedFile = joinStoragePath(paths.sst, "vehicles", "tracked.json");
    let vehicleInfo = null;
    
    if (await exists(trackedFile)) {
      const vehicles = await getTrackedVehicles();
      vehicleInfo = vehicles.find(v => v.vehicleId === vehicleId);
    }
    
    if (!vehicleInfo) {
      return res.status(404).json({ error: "Vehicle not found in tracking list" });
    }
    
    // Create the deletion request
    const request = {
      requestId: `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      vehicleId,
      vehicleClassName: vehicleInfo.vehicleClassName,
      vehicleDisplayName: vehicleInfo.vehicleDisplayName,
      status: "pending",
      result: null,
      requestedAt: new Date().toISOString()
    };
    
    // Load existing queue or create new one
    const queueFile = joinStoragePath(paths.api, "vehicle_delete.json");
    const queue = await safeReadJson(queueFile, { requests: [] });
    if (!Array.isArray(queue.requests)) queue.requests = [];
    
    queue.requests.push(request);
    
    // Save queue
    await writeFile(queueFile, JSON.stringify(queue, null, 2), "utf8");
    
    console.log(`[Vehicles] Vehicle deletion queued: ${request.requestId} for ${vehicleId}`);
    
    res.json({
      status: "queued",
      message: "Vehicle deletion request queued. The vehicle will be destroyed when the server processes it.",
      requestId: request.requestId,
      vehicleId,
      vehicleDisplayName: vehicleInfo.vehicleDisplayName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /vehicles/generate-key - Queue a key generation request
router.post("/generate-key", async (req, res) => {
  try {
    await ensureDirectories();
    
    const { playerId, vehicleId, keyClassName, isMasterKey } = req.body;
    
    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }
    
    if (!vehicleId) {
      return res.status(400).json({ error: "vehicleId is required" });
    }
    
    // Validate vehicleId format (should be A-B-C-D where values can be negative)
    // Use regex to properly handle negative numbers: matches like "123-456-789--123" (last is -123)
    const idMatch = vehicleId.match(/^(-?\d+)-(-?\d+)-(-?\d+)-(-?\d+)$/);
    if (!idMatch) {
      return res.status(400).json({ 
        error: "Invalid vehicleId format. Expected: A-B-C-D (four integers, can be negative)" 
      });
    }
    
    // Check if vehicle exists in tracked list
    const vehicles = await getTrackedVehicles();
    const vehicle = vehicles.find(v => v.vehicleId === vehicleId);
    
    if (!vehicle) {
      console.log(`[Vehicles] Warning: Vehicle ${vehicleId} not in tracked list`);
    }
    
    // Create the request
    const request = {
      requestId: `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId,
      vehicleId,
      keyClassName: keyClassName || "ExpansionCarKey",
      isMasterKey: isMasterKey || false,
      status: "pending",
      result: null
    };
    
    // Load existing queue or create new one
    const queueFile = joinStoragePath(paths.api, "key_grants.json");
    const queue = await safeReadJson(queueFile, { requests: [] });
    if (!Array.isArray(queue.requests)) queue.requests = [];
    
    queue.requests.push(request);
    
    // Save queue
    await writeFile(queueFile, JSON.stringify(queue, null, 2), "utf8");
    
    console.log(`[Vehicles] Key generation queued: ${request.requestId} for vehicle ${vehicleId}`);
    
    res.json({
      status: "queued",
      message: "Key generation request queued. The key will be created when the player is online.",
      requestId: request.requestId,
      vehicleId,
      playerId,
      keyClassName: request.keyClassName,
      isMasterKey: request.isMasterKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
