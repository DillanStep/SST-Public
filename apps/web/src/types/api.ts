// API Types for SST Node API

// Server Configuration for multi-server support
export interface ServerConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  apiProfile?: string;
  mapPreset?: string;
  mapLabel?: string;
  mapImageUrl?: string;
  mapWorldSizeX?: number;
  mapWorldSizeZ?: number;
  mapInvertX?: boolean;
  mapInvertZ?: boolean;
  createdAt: string;
  lastUsed?: string;
}

export type StorageBackend = 'sftp' | 'ftp' | 'local';

export interface RemoteStorageConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  root: string;
  secure?: boolean;
}

export interface SetupStoragePayload {
  backend: StorageBackend;
  sstPath: string;
  profilesPath?: string;
  missionPath?: string;
  typesPath?: string;
  expansionEnabled?: boolean;
  expansionTradersPath?: string;
  expansionMarketPath?: string;
  mapPreset?: string;
  mapLabel?: string;
  mapImageUrl?: string;
  mapWorldSizeX?: number;
  mapWorldSizeZ?: number;
  mapInvertX?: boolean;
  mapInvertZ?: boolean;
  sftp?: RemoteStorageConfig;
  ftp?: RemoteStorageConfig;
}

export interface SetupTestResponse {
  details?: string;
  error?: string;
  parsed?: {
    onlineCount?: number;
    playersLen?: number;
  };
  stat?: {
    size?: number;
  };
}

export interface SetupStatusResponse {
  apiKey?: string;
}

export type RuntimeEnvValues = Record<string, string>;

export interface RuntimeConfigResponse {
  envPath: string;
  profile?: string;
  env: RuntimeEnvValues;
  suggestions?: RuntimeEnvValues;
  map?: ServerMapConfig;
  storage?: {
    backend: string;
  };
  checks?: {
    onlinePlayers?: {
      ok: boolean;
      error?: string | null;
      path?: string;
    };
    apiDir?: {
      ok: boolean;
      error?: string | null;
      path?: string;
    };
  };
}

export interface MapPresetOption {
  id: string;
  label: string;
  worldSizeX: number;
  worldSizeZ: number;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface ServerMapConfig {
  preset: string;
  label: string;
  detectedPreset: string;
  missionPath: string;
  imageUrl: string;
  defaultImageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  worldSizeX: number;
  worldSizeZ: number;
  invertX: boolean;
  invertZ: boolean;
  builtinMaps: MapPresetOption[];
}

export interface RuntimeConfigUpdateResponse {
  ok: boolean;
  envPath: string;
  updated: string[];
  restartRequired: boolean;
  restartInMs: number;
  message: string;
}

export interface InventoryItem {
  className: string;
  displayName?: string;
  quantity: number;
  quantityMax?: number;
  health?: number;
  slot?: number;
  slotName?: string;
  attachments?: InventoryItem[];
  cargo?: InventoryItem[];
}

export interface PlayerInventory {
  generatedAt?: string;
  playerCount?: number;
  players?: {
    playerName: string;
    playerId: string;
    biId: string;
    inventory: InventoryItem[];
  }[];
}

export interface PlayerEvent {
  timestamp: string;
  eventType: string;
  playerName?: string;
  playerId?: string;
  itemClassName?: string;
  itemDisplayName?: string;
  itemHealth?: number;
  itemQuantity?: number;
  position?: number[];
}

export interface PlayerEventsLog {
  playerName?: string;
  playerId?: string;
  events: PlayerEvent[];
}

export interface LifeEvent {
  timestamp: string;
  eventType: 'SPAWNED' | 'RESPAWNED' | 'DIED' | 'CONNECTED' | 'DISCONNECTED';
  playerName: string;
  playerId: string;
  position?: number[];
  causeOfDeath?: string;
  healthAtDeath?: number;
}

export interface LifeEventsLog {
  playerName?: string;
  playerId?: string;
  events: LifeEvent[];
}

// Trade Types
export interface TradeEvent {
  timestamp: string;
  eventType: 'PURCHASE' | 'SALE';
  playerName: string;
  playerId: string;
  itemClassName: string;
  itemDisplayName?: string;
  quantity: number;
  price: number;
  traderName?: string;
  traderZone?: string;
  traderPosition?: number[];
  playerPosition?: number[];
}

export interface TradeLog {
  playerName: string;
  playerId: string;
  totalPurchases: number;
  totalSales: number;
  totalSpent: number;
  totalEarned: number;
  trades: TradeEvent[];
}

// Economy Dashboard Types
export interface EconomyItemStats {
  className: string;
  displayName: string;
  purchases: number;
  sales: number;
  totalSpent: number;
  totalEarned: number;
  quantity: number;
  avgPrice: number;
  lastSeen: string;
}

export interface EconomyTraderStats {
  name: string;
  transactions: number;
  revenue: number;
  purchases: number;
  sales: number;
}

export interface EconomyZoneStats {
  name: string;
  transactions: number;
  revenue: number;
}

export interface EconomyDailyTrendPoint {
  date: string;
  transactions: number;
  purchases: number;
  sales: number;
  moneySpent: number;
  moneyEarned: number;
  netFlow: number;
  cumulativeNetFlow: number;
  avgTransactionValue: number;
}

export interface EconomyForecastPoint {
  date: string;
  predictedTransactions: number;
  predictedMoneySpent: number;
  predictedMoneyEarned: number;
  predictedNetFlow: number;
  predictedCumulativeNetFlow: number;
}

export interface EconomyRiskSignal {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
}

export interface EconomyMarketForecast {
  confidence: number;
  trend: {
    transactionsSlope: number;
    moneySpentSlope: number;
    moneyEarnedSlope: number;
    direction: 'growing' | 'cooling' | 'steady';
  };
  next7Days: EconomyForecastPoint[];
  riskSignals: EconomyRiskSignal[];
}

export interface EconomyItemForecast {
  className: string;
  displayName: string;
  totalVolume: number;
  avgPrice: number;
  purchases: number;
  sales: number;
  demandScore: number;
  trendDirection: 'up' | 'down' | 'flat';
  trendSlope: number;
  predictedDailyVolume: number;
  confidence: number;
}

export interface EconomySummary {
  totalTransactions: number;
  totalPurchases: number;
  totalSales: number;
  totalMoneySpent: number;
  totalMoneyEarned: number;
  netMoneyFlow: number;
  uniqueTraders: number;
  uniqueItems: number;
  avgTransactionValue: number;
  purchaseToSaleRatio: number;
  economyHealth: number;
  dataAgeDays: number;
  hasMinimumData: boolean;
  oldestTransaction: string | null;
  newestTransaction: string | null;
}

export interface SpawnInfo {
  nominal: number;
  spawnRating: 'none' | 'extremely_rare' | 'very_rare' | 'rare' | 'uncommon' | 'common' | 'very_common' | 'abundant';
  spawnScore: number;
  category: string | null;
  spawns: boolean;
  source?: {
    path: string;
    label: string;
    kind: string;
  } | null;
}

export interface PriceRecommendation {
  className: string;
  displayName: string;
  currentAvgPrice: number;
  purchases: number;
  sales: number;
  totalVolume: number;
  buyRatio: number;
  recommendation: 'increase_buy_price' | 'decrease_sell_price' | 'balanced_high_volume' | 'overpriced_common' | 'underpriced_rare';
  reason: string;
  severity: 'info' | 'warning' | 'critical';
  suggestedChange: number;
  suggestedPrice: number;
  spawnInfo?: SpawnInfo;
  priceRarityAlignment?: number;
}

export type EconomyFilterPeriod = 'week' | 'month' | 'all' | 'custom';

export interface EconomyFilterParams {
  period?: EconomyFilterPeriod;
  startDate?: string;
  endDate?: string;
}

export interface EconomyFilter {
  period: EconomyFilterPeriod;
  startDate: string | null;
  endDate: string | null;
}

export interface TypesSourceRef {
  folder: string;
  fileName: string;
  type: string;
  relativePath: string;
}

export interface TypesSourceInfo {
  path: string;
  label: string;
  kind: string;
  itemCount: number;
  duplicateItems?: number;
  ref?: TypesSourceRef | null;
}

export interface TypesLoadIssue {
  path: string;
  label: string;
  kind: string;
  message: string;
  ref?: TypesSourceRef | null;
}

export interface EconomyCoreStats {
  path: string;
  found: boolean;
  typeFileRefs: number;
  loadedFileRefs: number;
}

export interface EconomySpawnStats {
  totalItems: number;
  spawningItems: number;
  categories: Record<string, number>;
  spawnRatings: Record<string, number>;
  sourceFileCount: number;
  sources: TypesSourceInfo[];
  economyCore: EconomyCoreStats | null;
  duplicateItems: number;
  missingFiles: TypesLoadIssue[];
  errors: TypesLoadIssue[];
}

export interface EconomyResponse {
  summary: EconomySummary;
  filter: EconomyFilter;
  dataSources?: {
    archivedTrades: number;
    jsonFiles: number;
    totalTradesProcessed: number;
    typeFiles?: number;
    economyCoreTypeFiles?: number;
  };
  spawnStats?: EconomySpawnStats;
  topItemsByVolume: EconomyItemStats[];
  topItemsBySpending: EconomyItemStats[];
  topSoldItems: EconomyItemStats[];
  topTraders: EconomyTraderStats[];
  topZones: EconomyZoneStats[];
  hourlyActivity: number[];
  dailyTrend?: EconomyDailyTrendPoint[];
  marketForecast?: EconomyMarketForecast;
  itemForecasts?: EconomyItemForecast[];
  recentTransactions: (TradeEvent & { playerId: string })[];
  priceRecommendations: PriceRecommendation[];
  generatedAt: string;
}

export interface PlayerData {
  inventory: PlayerInventory | null;
  events: PlayerEventsLog | null;
  lifeEvents: LifeEventsLog | null;
  online?: OnlinePlayerData | null;
}

export interface DashboardResponse {
  players: Record<string, PlayerData>;
  grantResults: GrantResult[];
  recentDeaths: LifeEvent[];
  lastUpdate: string;
  refreshTimeMs: number;
  onlineCount?: number;
  onlineSource?: {
    generatedAt: string | null;
    modVersion?: string | null;
    protocolVersion?: string | null;
    modStatus?: ModVersionStatus;
    sourceUpdatedAt: string | null;
    sourceAgeMs: number | null;
    staleAfterMs: number;
    isStale: boolean;
    onlineCount: number;
  };
  playerCount: number;
}

export interface ModVersionStatus {
  expectedVersion: string;
  reportedVersion: string | null;
  expectedProtocolVersion: string;
  reportedProtocolVersion: string | null;
  status: 'match' | 'older' | 'newer' | 'missing' | 'protocol-mismatch' | 'stale' | 'not-reporting' | 'error';
  mismatch: boolean;
  isCompatible: boolean;
  message: string;
}

export interface LeaderboardPlayer {
  playerId: string;
  playerName: string;
  isOnline: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  kills: number;
  deaths: number;
  pvpDeaths: number;
  suicides: number;
  spawns: number;
  respawns: number;
  connects: number;
  disconnects: number;
  lifeEvents: number;
  itemEvents: number;
  itemsPickedUp: number;
  itemsDropped: number;
  itemsAdded: number;
  itemsRemoved: number;
  inventoryItems: number;
  tradeCount: number;
  purchases: number;
  sales: number;
  totalSpent: number;
  totalEarned: number;
  netTrade: number;
  activeVehicles: number;
  destroyedVehicles: number;
  totalVehicles: number;
  vehiclePurchases: number;
  vehicleSpend: number;
  positionSamples: number;
  playTimeSeconds: number;
  currentSessionSeconds: number;
  longestLifeSeconds: number;
  score: number;
  kdRatio: number;
}

export type LeaderboardKey =
  | 'overall'
  | 'kills'
  | 'deaths'
  | 'playTime'
  | 'longestLife'
  | 'loot'
  | 'trades'
  | 'wealth'
  | 'vehicles'
  | 'online';

export interface PlayerLeaderboardResponse {
  generatedAt: string;
  playerCount: number;
  summary: {
    onlineCount: number;
    totalKills: number;
    totalDeaths: number;
    totalItemEvents: number;
    totalTrades: number;
    totalVehicles: number;
  };
  leaderboards: Record<LeaderboardKey, LeaderboardPlayer[]>;
  players: LeaderboardPlayer[];
  retention?: {
    note?: string;
  };
}

export interface Item {
  className: string;
  displayName: string;
  category: string;
  parentClass?: string;
  canBeStacked?: number;
  maxQuantity?: number;
}

export interface ItemImageLookupItem {
  className: string;
  displayName?: string;
}

export interface ItemImageInfo {
  className: string;
  displayName?: string;
  matchedDisplayName: string;
  thumbnailUrl: string;
  imageUrl: string;
  pageUrl?: string;
  source?: {
    name: string;
    url: string;
    attribution: string;
  };
}

export interface ItemImageLookupResponse {
  generatedAt: string;
  source?: {
    name: string;
    url: string;
    attribution: string;
  };
  categories?: string[];
  count: number;
  images: Record<string, ItemImageInfo | null>;
}

export interface ItemSearchResult {
  items: Item[];
  count: number;
  query?: string;
  category?: string;
}

export interface CategoriesResponse {
  categories: string[];
  count: number;
}

export interface GrantRequest {
  playerId: string;
  itemClassName: string;
  quantity: number;
  health?: number;
}

export interface GrantResult {
  playerId: string;
  itemClassName: string;
  quantity: number;
  health: number;
  processed: boolean;
  result: string;
}

export interface GrantResponse {
  status: string;
  grant: GrantRequest;
}

// Item Delete Types
export interface ItemDeleteRequest {
  playerId: string;
  itemClassName: string;
  itemPath: string;
  deleteCount?: number;
}

export interface ItemDeleteResponse {
  status: string;
  message: string;
  request: {
    requestId: string;
    playerId: string;
    itemClassName: string;
    itemPath: string;
    deleteCount: number;
    requestedAt: string;
    processed: boolean;
    status: string;
    result: string;
  };
}

export interface ItemDeleteResult {
  requestId: string;
  playerId: string;
  itemClassName: string;
  itemPath: string;
  deleteCount: number;
  requestedAt: string;
  processed: boolean;
  status: 'pending' | 'completed' | 'failed';
  result: string;
}

export interface ItemDeleteResultsResponse {
  requests: ItemDeleteResult[];
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface ApiError {
  error: string;
  message?: string;
}

export interface LifeEventsResponse {
  count: number;
  events: LifeEvent[];
}

export interface DeathsResponse {
  count: number;
  deaths: LifeEvent[];
}

// Online Player Tracking Types
export interface OnlinePlayerData {
  playerId: string;
  playerName: string;
  biId: string;
  isOnline: boolean;
  connectedAt: string;
  lastUpdate: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  health: number;
  blood: number;
  water: number;
  energy: number;
  isAlive: boolean;
  isUnconscious: boolean;
}

export interface OnlinePlayersResponse {
  generatedAt: string | null;
  modVersion?: string | null;
  protocolVersion?: string | null;
  modStatus?: ModVersionStatus;
  sourceUpdatedAt?: string | null;
  sourceAgeMs?: number | null;
  staleAfterMs?: number;
  isStale?: boolean;
  onlineCount: number;
  players: OnlinePlayerData[];
}

export interface PlayerLocationsResponse {
  timestamp: string | null;
  modVersion?: string | null;
  protocolVersion?: string | null;
  modStatus?: ModVersionStatus;
  sourceUpdatedAt?: string | null;
  sourceAgeMs?: number | null;
  staleAfterMs?: number;
  isStale?: boolean;
  onlineCount: number;
  locations: {
    playerId: string;
    playerName: string;
    x: number;
    y: number;
    z: number;
    isAlive: boolean;
  }[];
}

// Player Command Types (heal, teleport, message)
export interface HealRequest {
  playerId: string;
  health?: number; // 0-100, defaults to 100
}

export interface TeleportRequest {
  playerId: string;
  x: number;
  y?: number; // Optional, mod will calculate surface Y if not provided
  z: number;
}

export interface MessageRequest {
  playerId: string;
  message: string;
  messageType?: 'notification' | 'chat' | 'both'; // defaults to 'notification'
}

export interface BroadcastRequest {
  message: string;
  messageType?: 'notification' | 'chat' | 'both'; // defaults to 'notification'
}

export interface CommandResult {
  playerId: string;
  commandType: 'heal' | 'teleport' | 'message' | 'broadcast';
  value?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  message?: string;
  messageType?: string;
  processed: boolean;
  result: string;
}

export interface CommandResponse {
  status: string;
  command: {
    playerId: string;
    commandType: string;
    value: number;
    posX: number;
    posY: number;
    posZ: number;
    message?: string;
    messageType?: string;
  };
}

export interface CommandResultsResponse {
  requests: CommandResult[];
}

// ============================================================================
// Expansion Mod Types
// ============================================================================

// Trader Zone (from mission folder)
export interface TraderZone {
  fileName: string;
  m_Version: number;
  m_DisplayName: string;
  Position: [number, number, number]; // [x, y, z]
  Radius: number;
  BuyPricePercent: number;
  SellPricePercent: number;
  Stock: Record<string, number>;
}

export interface TraderZonesResponse {
  zones: TraderZone[];
}

// Trader (from ExpansionMod/Traders)
export interface TraderSummary {
  fileName: string;
  displayName: string;
  traderIcon: string;
  categories: string[];
  itemCount: number;
}

export interface Trader {
  m_Version: number;
  DisplayName: string;
  MinRequiredReputation: number;
  MaxRequiredReputation: number;
  RequiredFaction: string;
  RequiredCompletedQuestID: number;
  TraderIcon: string;
  Currencies: string[];
  DisplayCurrencyValue: number;
  DisplayCurrencyName: string;
  UseCategoryOrder: number;
  Categories: string[];
  Items: Record<string, number>; // className -> enabled (0 or 1)
}

export interface TradersResponse {
  traders: TraderSummary[];
}

// Market Category (from ExpansionMod/Market)
export interface MarketCategorySummary {
  fileName: string;
  displayName: string;
  icon: string;
  color?: string;
  itemCount: number;
  isExchange?: number;
}

export interface MarketItem {
  ClassName: string;
  MaxPriceThreshold: number;
  MinPriceThreshold: number;
  SellPricePercent: number;
  MaxStockThreshold: number;
  MinStockThreshold: number;
  QuantityPercent: number;
  SpawnAttachments: string[];
  Variants: string[];
}

export interface MarketCategory {
  m_Version: number;
  DisplayName: string;
  Icon: string;
  Color: string;
  IsExchange: number;
  InitStockPercent: number;
  Items: MarketItem[];
}

export interface MarketCategoriesResponse {
  categories: MarketCategorySummary[];
}

// Price change request/response types
export interface PriceChange {
  className: string;
  newBuyPrice?: number;
  newSellPrice?: number;
  newSellPercent?: number;
}

export interface MarketSearchResult {
  className: string;
  found: boolean;
  results: {
    fileName: string;
    categoryName: string;
    item: MarketItem;
  }[];
}

export interface ApplyPriceResult {
  success: boolean;
  message: string;
  file?: string;
  oldValues?: {
    MaxPriceThreshold: number;
    MinPriceThreshold: number;
    SellPricePercent: number;
  };
  newValues?: {
    MaxPriceThreshold: number;
    MinPriceThreshold: number;
    SellPricePercent: number;
  };
}

export interface ApplyPricesBulkResult {
  success: boolean;
  message: string;
  filesModified: string[];
  results: {
    className: string;
    success: boolean;
    file?: string;
    oldPrice?: number;
    newPrice?: number;
    error?: string;
  }[];
}

// Bulk expansion data response
export interface ExpansionDataResponse {
  zones: TraderZone[];
  traders: TraderSummary[];
  market: MarketCategorySummary[];
}

// Inventory Counts (how many of each item across all player inventories)
export interface InventoryCountsResponse {
  lastUpdated: string;
  counts: Record<string, number>; // className (lowercase) -> count
}

// ============================================================================
// Server Logs Types
// ============================================================================

export interface LogFileInfo {
  fileName: string;
  size: number;
  modified: string;
  created: string;
  date: string | null;
}

export interface LogListResponse {
  type: string;
  count: number;
  total: number;
  logs: LogFileInfo[];
}

export interface LogContentResponse {
  fileName: string;
  type: string;
  size: number;
  modified: string;
  created: string;
  content: string;
  totalLines: number;
  truncated: boolean;
  skippedLines?: number;
}

export interface LatestScriptLogResponse extends LogContentResponse {
  cachedAt: string;
  cacheAgeMs: number;
}

export interface LatestCrashLogResponse extends LogContentResponse {
  totalCrashLogs: number;
}

export interface LatestRptLogResponse extends LogContentResponse {
  totalRptLogs: number;
}

export interface LogSummary {
  count: number;
  newest: string | null;
  newestDate: string | null;
}

export interface LogSummaryResponse {
  summary: {
    script: LogSummary;
    crash: LogSummary;
    rpt: LogSummary;
    error: LogSummary;
    adm: LogSummary;
  };
}

// Position Tracking Types
export interface PlayerPosition {
  id: number;
  playerId: string;
  playerName: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  health: number | null;
  blood: number | null;
  isAlive: boolean;
  isUnconscious: boolean;
  recordedAt: string;
  timestamp: number;
}

export interface TrackedPlayer {
  playerId: string;
  playerName: string;
  firstSeen: number;
  lastSeen: number;
  positionCount: number;
}

export interface PositionStatsResponse {
  totalPositions: number;
  uniquePlayers: number;
  oldestRecord: number | null;
  newestRecord: number | null;
}

export interface TrackedPlayersResponse {
  players: TrackedPlayer[];
  count: number;
}

export interface LatestPositionsResponse {
  positions: PlayerPosition[];
  count: number;
}

export interface PlayerPositionsResponse {
  playerId: string;
  positions: PlayerPosition[];
  count: number;
}

export interface PlayerPositionsRangeResponse {
  playerId: string;
  positions: PlayerPosition[];
  count: number;
  range: {
    start: number;
    end: number;
  };
}

export interface SnapshotResponse {
  success: boolean;
  message: string;
  count: number;
  timestamp?: string;
}

// ============================================================================
// Vehicle Tracking Types
// ============================================================================

export interface VehicleKeyData {
  persistentIdA: number;
  persistentIdB: number;
  persistentIdC: number;
  persistentIdD: number;
}

export interface TrackedVehicle {
  vehicleId: string;           // A-B-C-D format
  vehicleClassName: string;
  vehicleDisplayName?: string;
  ownerId: string;
  ownerName: string;
  keyClassName: string;
  purchaseTimestamp: string;
  traderName?: string;
  traderZone?: string;
  purchasePrice?: number;
  lastPosition?: number[] | string | { x?: number; y?: number; z?: number; X?: number; Y?: number; Z?: number };
  lastUpdateTime?: string;
  isDestroyed: boolean | number | string;
  keyData?: VehicleKeyData;           // Original key
  additionalKeys?: VehicleKeyData[];  // Additional keys generated
}

export interface VehiclePurchase {
  vehicleId: string;
  vehicleClassName: string;
  vehicleDisplayName?: string;
  ownerId: string;
  ownerName: string;
  keyClassName: string;
  timestamp: string;
  traderName?: string;
  traderZone?: string;
  purchasePrice?: number;
}

export interface VehiclePosition {
  vehicleId: string;
  className: string;
  displayName?: string;
  position?: number[] | string | { x?: number; y?: number; z?: number; X?: number; Y?: number; Z?: number };
  lastUpdate?: string;
  ownerName: string;
  ownerId: string;
}

export interface VehiclesResponse {
  vehicles: TrackedVehicle[];
  count: number;
  totalTracked?: number;
}

export interface VehicleResponse {
  vehicle: TrackedVehicle;
}

export interface VehiclePurchasesResponse {
  purchases: VehiclePurchase[];
  count: number;
  totalPurchases?: number;
}

export interface VehiclePositionsResponse {
  positions: VehiclePosition[];
  count: number;
  lastUpdate?: string;
}

export interface KeyGenerationRequest {
  playerId: string;
  vehicleId: string;
  keyClassName?: string;
  isMasterKey?: boolean;
}

export interface KeyGenerationResponse {
  status: 'queued' | 'success' | 'failed';
  message: string;
  requestId: string;
  vehicleId: string;
  playerId: string;
  keyClassName: string;
  isMasterKey: boolean;
}

export interface KeyGenerationResult {
  requestId: string;
  playerId: string;
  vehicleId: string;
  keyClassName: string;
  isMasterKey: boolean;
  status: 'pending' | 'success' | 'failed';
  result?: string;
  processedAt?: string;
}

export interface KeyResultsResponse {
  results: KeyGenerationResult[];
  count: number;
}

// Vehicle Delete Types
export interface VehicleDeleteResponse {
  status: 'queued' | 'success' | 'failed';
  message: string;
  requestId: string;
  vehicleId: string;
  vehicleDisplayName?: string;
}

export interface VehicleDeleteResult {
  requestId: string;
  vehicleId: string;
  vehicleClassName?: string;
  vehicleDisplayName?: string;
  status: 'pending' | 'completed' | 'failed';
  result?: string;
  requestedAt?: string;
}

export interface VehicleDeleteResultsResponse {
  results: VehicleDeleteResult[];
  count: number;
}
