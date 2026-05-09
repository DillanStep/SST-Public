import axios, { AxiosInstance } from 'axios';
import type {
  DashboardResponse,
  PlayerData,
  ItemSearchResult,
  ItemImageLookupItem,
  ItemImageLookupResponse,
  CategoriesResponse,
  Item,
  GrantRequest,
  GrantResponse,
  GrantResult,
  ItemDeleteRequest,
  ItemDeleteResponse,
  ItemDeleteResultsResponse,
  HealthResponse,
  LifeEventsResponse,
  DeathsResponse,
  LifeEventsLog,
  TradeLog,
  EconomyResponse,
  EconomyFilterParams,
  OnlinePlayersResponse,
  OnlinePlayerData,
  PlayerLocationsResponse,
  AIPositionsResponse,
  AIAnalysisResponse,
  HealRequest,
  TeleportRequest,
  MessageRequest,
  BroadcastRequest,
  CommandResponse,
  CommandResultsResponse,
  InventoryCountsResponse,
  // Expansion types
  TraderZone,
  TraderZonesResponse,
  TradersResponse,
  Trader,
  MarketCategoriesResponse,
  MarketCategory,
  MarketItem,
  ExpansionDataResponse,
  PriceChange,
  MarketSearchResult,
  ApplyPriceResult,
  ApplyPricesBulkResult,
  ExpansionAtmAccountsResponse,
  ExpansionAtmCompensateResponse,
  ExpansionAtmHistoryResponse,
  ExpansionAtmResultsResponse,
  ExpansionAtmReloadResponse,
  ExpansionAtmUpdateResponse,
  // Log types
  LogListResponse,
  LogContentResponse,
  LatestScriptLogResponse,
  LatestCrashLogResponse,
  LatestRptLogResponse,
  LogSummaryResponse,
  // Position tracking types
  PositionStatsResponse,
  TrackedPlayersResponse,
  LatestPositionsResponse,
  PlayerPositionsResponse,
  PlayerPositionsRangeResponse,
  SnapshotResponse,
  // Vehicle tracking types
  VehiclesResponse,
  TrackedVehicle,
  VehiclePurchasesResponse,
  VehiclePositionsResponse,
  VehicleDeleteResponse,
  VehicleDeleteResultsResponse,
  KeyGenerationRequest,
  KeyGenerationResponse,
  KeyResultsResponse,
  RuntimeConfigResponse,
  RuntimeConfigUpdateResponse,
  RuntimeEnvValues,
  CreateServerProfileRequest,
  CreateServerProfileResponse,
  ConfigBrowseMode,
  ConfigBrowseResponse,
  ServerMapConfig,
  PlayerLeaderboardResponse,
  SstModCopyResponse,
  SstModInfoResponse,
  DiscordTicketActionResponse,
  DiscordTicketDetailResponse,
  DiscordTicketPanelResponse,
  DiscordTicketsResponse,
  ExpansionQuestConfig,
  ExpansionQuestDetailResponse,
  ExpansionQuestListResponse,
  ExpansionQuestNpcConfig,
  ExpansionQuestNpcDetailResponse,
  ExpansionQuestObjectiveConfig,
  ExpansionQuestObjectiveDetailResponse,
  ExpansionQuestSaveResponse,
  ExpansionQuestTemplatesResponse,
} from '../types';
import { getActiveServer, getServers, migrateOldConfig } from './serverManager';
import { getAuthToken } from './auth';
import { getDefaultApiUrl } from './apiBase';

// Default API base URL
const DEFAULT_API_URL = getDefaultApiUrl();

class SstApi {
  private client: AxiosInstance;
  private apiKey: string = '';
  private baseUrl: string = DEFAULT_API_URL;
  private apiProfile: string = '';

  constructor() {
    // Migrate old single-server config if needed
    migrateOldConfig();

    this.client = axios.create({
      baseURL: DEFAULT_API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Send cookies with requests for auth
    });

    // Add request interceptor to include Bearer token for cross-origin auth
    this.client.interceptors.request.use((config) => {
      const activeServer = getActiveServer();
      if (activeServer) {
        this.baseUrl = activeServer.apiUrl;
        this.apiKey = activeServer.apiKey;
        this.apiProfile = activeServer.apiProfile?.trim() || '';

        config.baseURL = activeServer.apiUrl;
        config.headers['x-api-key'] = activeServer.apiKey;

        if (this.apiProfile) {
          config.headers['x-sst-server'] = this.apiProfile;
        } else {
          delete config.headers['x-sst-server'];
        }
      }

      const token = getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        config.withCredentials = true;
      } else if (getServers().length > 1) {
        config.withCredentials = false;
      }
      return config;
    });

    // Load active server config
    this.loadActiveServer();
  }

  // Load configuration from active server
  loadActiveServer(): boolean {
    const activeServer = getActiveServer();
    if (activeServer) {
      this.configure(activeServer.apiUrl, activeServer.apiKey, activeServer.apiProfile);
      return true;
    }
    return false;
  }

  // Configure API with URL and key
  configure(url: string, key: string, profile: string = '') {
    this.baseUrl = url;
    this.apiKey = key;
    this.apiProfile = profile.trim();
    this.client.defaults.baseURL = url;
    this.client.defaults.headers.common['x-api-key'] = key;
    if (this.apiProfile) {
      this.client.defaults.headers.common['x-sst-server'] = this.apiProfile;
    } else {
      delete this.client.defaults.headers.common['x-sst-server'];
    }
  }

  // Set just the API key (for backward compatibility)
  setApiKey(key: string) {
    this.apiKey = key;
    this.client.defaults.headers.common['x-api-key'] = key;
  }

  // Set just the base URL
  setBaseUrl(url: string) {
    this.baseUrl = url;
    this.client.defaults.baseURL = url;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getApiProfile(): string {
    return this.apiProfile;
  }

  clearConfig() {
    this.apiKey = '';
    this.baseUrl = DEFAULT_API_URL;
    this.apiProfile = '';
    delete this.client.defaults.headers.common['x-api-key'];
    delete this.client.defaults.headers.common['x-sst-server'];
    this.client.defaults.baseURL = DEFAULT_API_URL;
  }

  // Health check - no auth required
  async getHealth(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/health');
    return response.data;
  }

  async getRuntimeConfig(): Promise<RuntimeConfigResponse> {
    const response = await this.client.get<RuntimeConfigResponse>('/config');
    return response.data;
  }

  async updateRuntimeConfig(env: RuntimeEnvValues): Promise<RuntimeConfigUpdateResponse> {
    const response = await this.client.put<RuntimeConfigUpdateResponse>('/config', { env });
    return response.data;
  }

  async createServerProfile(payload: CreateServerProfileRequest): Promise<CreateServerProfileResponse> {
    const response = await this.client.post<CreateServerProfileResponse>('/servers/profiles', payload);
    return response.data;
  }

  async browseConfigPath(path?: string, mode: ConfigBrowseMode = 'folder'): Promise<ConfigBrowseResponse> {
    const response = await this.client.get<ConfigBrowseResponse>('/config/browse', {
      params: { path, mode },
    });
    return response.data;
  }

  async getMapConfig(): Promise<ServerMapConfig> {
    const response = await this.client.get<ServerMapConfig>('/map/config');
    return response.data;
  }

  async getSstModInfo(): Promise<SstModInfoResponse> {
    const response = await this.client.get<SstModInfoResponse>('/mod');
    return response.data;
  }

  async copySstMod(destination: string): Promise<SstModCopyResponse> {
    const response = await this.client.post<SstModCopyResponse>('/mod/copy', { destination });
    return response.data;
  }

  // Dashboard endpoints
  async getDashboard(): Promise<DashboardResponse> {
    const response = await this.client.get<DashboardResponse>('/dashboard');
    return response.data;
  }

  async getPlayer(playerId: string): Promise<PlayerData> {
    const response = await this.client.get<PlayerData>(`/dashboard/player/${playerId}`);
    return response.data;
  }

  async getGrantResults(): Promise<{ results: GrantResult[] }> {
    const response = await this.client.get<{ results: GrantResult[] }>('/dashboard/grants');
    return response.data;
  }

  async getRecentDeaths(): Promise<DeathsResponse> {
    const response = await this.client.get<DeathsResponse>('/dashboard/deaths');
    return response.data;
  }

  async refreshDashboard(): Promise<DashboardResponse> {
    const response = await this.client.post<DashboardResponse>('/dashboard/refresh');
    return response.data;
  }

  async getLeaderboard(limit?: number): Promise<PlayerLeaderboardResponse> {
    const response = await this.client.get<PlayerLeaderboardResponse>('/leaderboard', {
      params: limit ? { limit } : undefined,
    });
    return response.data;
  }

  // Direct file read endpoints
  async getPlayerInventory(playerId: string): Promise<{ inventory: PlayerData['inventory'] }> {
    const response = await this.client.get(`/inventory/${playerId}`);
    return response.data;
  }

  async getPlayerEvents(playerId: string): Promise<{ events: PlayerData['events'] }> {
    const response = await this.client.get(`/events/${playerId}`);
    return response.data;
  }

  async getPlayerLifeEvents(playerId: string): Promise<LifeEventsLog> {
    const response = await this.client.get<LifeEventsLog>(`/life-events/${playerId}`);
    return response.data;
  }

  async getPlayerTrades(playerId: string): Promise<TradeLog> {
    const response = await this.client.get<TradeLog>(`/trades/${playerId}`);
    return response.data;
  }

  async getEconomyStats(params?: EconomyFilterParams): Promise<EconomyResponse> {
    const response = await this.client.get<EconomyResponse>('/economy', { params });
    return response.data;
  }

  async getAllLifeEvents(params?: { type?: string; playerId?: string; limit?: number }): Promise<LifeEventsResponse> {
    const response = await this.client.get<LifeEventsResponse>('/life-events', { params });
    return response.data;
  }

  // Items endpoints
  async getItems(): Promise<{ items: Item[]; count: number }> {
    const response = await this.client.get('/items');
    return response.data;
  }

  async searchItems(params: {
    q?: string;
    category?: string;
    limit?: number;
  }): Promise<ItemSearchResult> {
    const response = await this.client.get<ItemSearchResult>('/items/search', { params });
    return response.data;
  }

  async getCategories(): Promise<CategoriesResponse> {
    const response = await this.client.get<CategoriesResponse>('/items/categories');
    return response.data;
  }

  async getItem(className: string): Promise<Item> {
    const response = await this.client.get<Item>(`/items/${className}`);
    return response.data;
  }

  async lookupItemImages(items: ItemImageLookupItem[]): Promise<ItemImageLookupResponse> {
    const response = await this.client.post<ItemImageLookupResponse>('/items/images/lookup', { items });
    return response.data;
  }

  async getInventoryCounts(): Promise<InventoryCountsResponse> {
    const response = await this.client.get<InventoryCountsResponse>('/items/inventory-counts');
    return response.data;
  }

  async refreshInventoryCounts(): Promise<InventoryCountsResponse> {
    const response = await this.client.post<InventoryCountsResponse>('/items/inventory-counts/refresh');
    return response.data;
  }

  // Grants endpoints
  async createGrant(grant: GrantRequest): Promise<GrantResponse> {
    const response = await this.client.post<GrantResponse>('/grants', grant);
    return response.data;
  }

  async getGrantResultsFromApi(): Promise<{ results: GrantResult[] }> {
    const response = await this.client.get('/grants/results');
    return response.data;
  }

  // Item Delete endpoints
  async deleteItemFromPlayer(playerId: string, request: Omit<ItemDeleteRequest, 'playerId'>): Promise<ItemDeleteResponse> {
    const response = await this.client.delete<ItemDeleteResponse>(`/inventory/${playerId}/item`, {
      data: request
    });
    return response.data;
  }

  async getItemDeleteResults(): Promise<ItemDeleteResultsResponse> {
    const response = await this.client.get<ItemDeleteResultsResponse>('/inventory/delete-results/all');
    return response.data;
  }

  // Online player tracking endpoints
  async getOnlinePlayers(): Promise<OnlinePlayersResponse> {
    const response = await this.client.get<OnlinePlayersResponse>('/online');
    return response.data;
  }

  async getActiveOnlinePlayers(): Promise<OnlinePlayersResponse> {
    const response = await this.client.get<OnlinePlayersResponse>('/online/active');
    return response.data;
  }

  async getPlayerOnlineStatus(playerId: string): Promise<OnlinePlayerData | null> {
    const response = await this.client.get<{ player: OnlinePlayerData | null }>(`/online/${playerId}`);
    return response.data.player;
  }

  async getAllPlayerLocations(): Promise<PlayerLocationsResponse> {
    const response = await this.client.get<PlayerLocationsResponse>('/online/locations/all');
    return response.data;
  }

  async getAIPositions(): Promise<AIPositionsResponse> {
    const response = await this.client.get<AIPositionsResponse>('/ai/positions');
    return response.data;
  }

  async getAIAnalysis(): Promise<AIAnalysisResponse> {
    const response = await this.client.get<AIAnalysisResponse>('/ai/analysis');
    return response.data;
  }

  // Player Commands (heal, teleport)
  async healPlayer(request: HealRequest): Promise<CommandResponse> {
    const response = await this.client.post<CommandResponse>('/commands/heal', request);
    return response.data;
  }

  async teleportPlayer(request: TeleportRequest): Promise<CommandResponse> {
    const response = await this.client.post<CommandResponse>('/commands/teleport', request);
    return response.data;
  }

  async getCommandResults(): Promise<CommandResultsResponse> {
    const response = await this.client.get<CommandResultsResponse>('/commands/results');
    return response.data;
  }

  async sendMessageToPlayer(request: MessageRequest): Promise<CommandResponse> {
    const response = await this.client.post<CommandResponse>('/commands/message', request);
    return response.data;
  }

  async broadcastMessage(request: BroadcastRequest): Promise<CommandResponse> {
    const response = await this.client.post<CommandResponse>('/commands/broadcast', request);
    return response.data;
  }

  // ============================================================================
  // Expansion Mod Methods
  // ============================================================================

  // Trader Zones
  async getTraderZones(): Promise<TraderZonesResponse> {
    const response = await this.client.get<TraderZonesResponse>('/expansion/zones');
    return response.data;
  }

  async getTraderZone(fileName: string): Promise<TraderZone> {
    const response = await this.client.get<TraderZone>(`/expansion/zones/${fileName}`);
    return response.data;
  }

  async updateTraderZone(fileName: string, zone: Partial<TraderZone>): Promise<{ success: boolean; message: string }> {
    const response = await this.client.put(`/expansion/zones/${fileName}`, zone);
    return response.data;
  }

  // Traders
  async getTraders(): Promise<TradersResponse> {
    const response = await this.client.get<TradersResponse>('/expansion/traders');
    return response.data;
  }

  async getTrader(fileName: string): Promise<Trader> {
    const response = await this.client.get<Trader>(`/expansion/traders/${fileName}`);
    return response.data;
  }

  async updateTrader(fileName: string, trader: Trader): Promise<{ success: boolean; message: string }> {
    const response = await this.client.put(`/expansion/traders/${fileName}`, trader);
    return response.data;
  }

  // Market
  async getMarketCategories(): Promise<MarketCategoriesResponse> {
    const response = await this.client.get<MarketCategoriesResponse>('/expansion/market');
    return response.data;
  }

  async getMarketCategory(fileName: string): Promise<MarketCategory> {
    const response = await this.client.get<MarketCategory>(`/expansion/market/${fileName}`);
    return response.data;
  }

  async updateMarketCategory(fileName: string, category: MarketCategory): Promise<{ success: boolean; message: string }> {
    const response = await this.client.put(`/expansion/market/${fileName}`, category);
    return response.data;
  }

  async updateMarketItem(fileName: string, className: string, item: Partial<MarketItem>): Promise<{ success: boolean; message: string; item: MarketItem }> {
    const response = await this.client.put(`/expansion/market/${fileName}/item/${className}`, item);
    return response.data;
  }

  async addMarketItem(fileName: string, item: Partial<MarketItem>): Promise<{ success: boolean; message: string; item: MarketItem }> {
    const response = await this.client.post(`/expansion/market/${fileName}/item`, item);
    return response.data;
  }

  async deleteMarketItem(fileName: string, className: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/expansion/market/${fileName}/item/${className}`);
    return response.data;
  }

  // Search for an item across all market files
  async searchMarketItem(className: string): Promise<MarketSearchResult> {
    const response = await this.client.get<MarketSearchResult>(`/expansion/market-search/${className}`);
    return response.data;
  }

  // Apply a single price change
  async applyPriceChange(change: PriceChange): Promise<ApplyPriceResult> {
    const response = await this.client.post<ApplyPriceResult>('/expansion/apply-price', change);
    return response.data;
  }

  // Apply multiple price changes at once
  async applyPriceChangesBulk(changes: PriceChange[]): Promise<ApplyPricesBulkResult> {
    const response = await this.client.post<ApplyPricesBulkResult>('/expansion/apply-prices-bulk', { changes });
    return response.data;
  }

  async getExpansionAtmBalances(): Promise<ExpansionAtmAccountsResponse> {
    const response = await this.client.get<ExpansionAtmAccountsResponse>('/expansion/atm');
    return response.data;
  }

  async updateExpansionAtmBalance(playerId: string, balance: number, hotReload = true): Promise<ExpansionAtmUpdateResponse> {
    const encodedPlayerId = encodeURIComponent(playerId);
    const response = await this.client.put<ExpansionAtmUpdateResponse>(`/expansion/atm/${encodedPlayerId}`, {
      balance,
      hotReload,
    });
    return response.data;
  }

  async compensateExpansionAtmBalance(playerId: string, amount: number, reason: string): Promise<ExpansionAtmCompensateResponse> {
    const encodedPlayerId = encodeURIComponent(playerId);
    const response = await this.client.post<ExpansionAtmCompensateResponse>(`/expansion/atm/${encodedPlayerId}/compensate`, {
      amount,
      reason,
    });
    return response.data;
  }

  async reloadExpansionAtmBalances(): Promise<ExpansionAtmReloadResponse> {
    const response = await this.client.post<ExpansionAtmReloadResponse>('/expansion/atm/reload');
    return response.data;
  }

  async getExpansionAtmResults(): Promise<ExpansionAtmResultsResponse> {
    const response = await this.client.get<ExpansionAtmResultsResponse>('/expansion/atm/results');
    return response.data;
  }

  async getExpansionAtmHistory(playerId?: string): Promise<ExpansionAtmHistoryResponse> {
    const response = await this.client.get<ExpansionAtmHistoryResponse>('/expansion/atm/history', {
      params: playerId ? { playerId } : undefined,
    });
    return response.data;
  }

  // Bulk data
  async getExpansionData(): Promise<ExpansionDataResponse> {
    const response = await this.client.get<ExpansionDataResponse>('/expansion/all');
    return response.data;
  }

  async getExpansionQuests(): Promise<ExpansionQuestListResponse> {
    const response = await this.client.get<ExpansionQuestListResponse>('/expansion/quests');
    return response.data;
  }

  async getExpansionQuestTemplates(): Promise<ExpansionQuestTemplatesResponse> {
    const response = await this.client.get<ExpansionQuestTemplatesResponse>('/expansion/quests/templates');
    return response.data;
  }

  async getExpansionQuest(fileName: string): Promise<ExpansionQuestDetailResponse> {
    const response = await this.client.get<ExpansionQuestDetailResponse>(`/expansion/quests/quest/${encodeURIComponent(fileName)}`);
    return response.data;
  }

  async createExpansionQuest(quest: ExpansionQuestConfig, fileName?: string): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.post<ExpansionQuestSaveResponse>('/expansion/quests/quest', { quest, fileName });
    return response.data;
  }

  async saveExpansionQuest(fileName: string, quest: ExpansionQuestConfig): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.put<ExpansionQuestSaveResponse>(`/expansion/quests/quest/${encodeURIComponent(fileName)}`, { quest });
    return response.data;
  }

  async deleteExpansionQuest(fileName: string): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.delete<ExpansionQuestSaveResponse>(`/expansion/quests/quest/${encodeURIComponent(fileName)}`);
    return response.data;
  }

  async getExpansionQuestObjective(type: number, fileName: string): Promise<ExpansionQuestObjectiveDetailResponse> {
    const response = await this.client.get<ExpansionQuestObjectiveDetailResponse>(`/expansion/quests/objective/${type}/${encodeURIComponent(fileName)}`);
    return response.data;
  }

  async createExpansionQuestObjective(objective: ExpansionQuestObjectiveConfig, fileName?: string): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.post<ExpansionQuestSaveResponse>('/expansion/quests/objective', { objective, fileName });
    return response.data;
  }

  async saveExpansionQuestObjective(type: number, fileName: string, objective: ExpansionQuestObjectiveConfig): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.put<ExpansionQuestSaveResponse>(`/expansion/quests/objective/${type}/${encodeURIComponent(fileName)}`, { objective });
    return response.data;
  }

  async deleteExpansionQuestObjective(type: number, fileName: string): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.delete<ExpansionQuestSaveResponse>(`/expansion/quests/objective/${type}/${encodeURIComponent(fileName)}`);
    return response.data;
  }

  async getExpansionQuestNpc(fileName: string): Promise<ExpansionQuestNpcDetailResponse> {
    const response = await this.client.get<ExpansionQuestNpcDetailResponse>(`/expansion/quests/npc/${encodeURIComponent(fileName)}`);
    return response.data;
  }

  async createExpansionQuestNpc(npc: ExpansionQuestNpcConfig, fileName?: string): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.post<ExpansionQuestSaveResponse>('/expansion/quests/npc', { npc, fileName });
    return response.data;
  }

  async saveExpansionQuestNpc(fileName: string, npc: ExpansionQuestNpcConfig): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.put<ExpansionQuestSaveResponse>(`/expansion/quests/npc/${encodeURIComponent(fileName)}`, { npc });
    return response.data;
  }

  async deleteExpansionQuestNpc(fileName: string): Promise<ExpansionQuestSaveResponse> {
    const response = await this.client.delete<ExpansionQuestSaveResponse>(`/expansion/quests/npc/${encodeURIComponent(fileName)}`);
    return response.data;
  }

  // ============================================================================
  // Server Logs API
  // ============================================================================

  async getLogSummary(): Promise<LogSummaryResponse> {
    const response = await this.client.get<LogSummaryResponse>('/logs/summary');
    return response.data;
  }

  async getLogList(type: string, limit?: number): Promise<LogListResponse> {
    const response = await this.client.get<LogListResponse>(`/logs/list/${type}`, {
      params: limit ? { limit } : undefined
    });
    return response.data;
  }

  async getLogContent(type: string, fileName: string, lines?: number): Promise<LogContentResponse> {
    const response = await this.client.get<LogContentResponse>(`/logs/read/${type}/${fileName}`, {
      params: lines ? { lines } : undefined
    });
    return response.data;
  }

  async getLatestScriptLog(lines?: number): Promise<LatestScriptLogResponse> {
    const response = await this.client.get<LatestScriptLogResponse>('/logs/latest/script', {
      params: lines ? { lines } : undefined
    });
    return response.data;
  }

  async getLatestCrashLog(): Promise<LatestCrashLogResponse> {
    const response = await this.client.get<LatestCrashLogResponse>('/logs/latest/crash');
    return response.data;
  }

  async getLatestRptLog(lines?: number): Promise<LatestRptLogResponse> {
    const response = await this.client.get<LatestRptLogResponse>('/logs/latest/rpt', {
      params: lines ? { lines } : undefined
    });
    return response.data;
  }

  // Position Tracking Methods
  async getPositionStats(): Promise<PositionStatsResponse> {
    const response = await this.client.get<PositionStatsResponse>('/positions/stats');
    return response.data;
  }

  async getTrackedPlayers(): Promise<TrackedPlayersResponse> {
    const response = await this.client.get<TrackedPlayersResponse>('/positions/players');
    return response.data;
  }

  async getLatestPositions(): Promise<LatestPositionsResponse> {
    const response = await this.client.get<LatestPositionsResponse>('/positions/latest');
    return response.data;
  }

  async getPlayerPositions(playerId: string, limit?: number): Promise<PlayerPositionsResponse> {
    const response = await this.client.get<PlayerPositionsResponse>(`/positions/${playerId}`, {
      params: limit ? { limit } : undefined
    });
    return response.data;
  }

  async getPlayerPositionsInRange(playerId: string, start: number, end: number): Promise<PlayerPositionsRangeResponse> {
    const response = await this.client.get<PlayerPositionsRangeResponse>(`/positions/${playerId}/range`, {
      params: { start, end }
    });
    return response.data;
  }

  async capturePositionSnapshot(): Promise<SnapshotResponse> {
    const response = await this.client.post<SnapshotResponse>('/positions/snapshot');
    return response.data;
  }

  // ============================================================================
  // Vehicle Tracking Methods
  // ============================================================================

  async getVehicles(params?: { ownerId?: string; className?: string; destroyed?: boolean }): Promise<VehiclesResponse> {
    const response = await this.client.get<VehiclesResponse>('/vehicles', { params });
    return response.data;
  }

  async getVehicle(vehicleId: string): Promise<TrackedVehicle> {
    const response = await this.client.get<TrackedVehicle>(`/vehicles/${vehicleId}`);
    return response.data;
  }

  async getVehiclePurchases(params?: { ownerId?: string; className?: string; limit?: number }): Promise<VehiclePurchasesResponse> {
    const response = await this.client.get<VehiclePurchasesResponse>('/vehicles/purchases/all', { params });
    return response.data;
  }

  async getVehiclesByOwner(ownerId: string): Promise<VehiclesResponse> {
    const response = await this.client.get<VehiclesResponse>(`/vehicles/by-owner/${ownerId}`);
    return response.data;
  }

  async getVehiclePositions(): Promise<VehiclePositionsResponse> {
    const response = await this.client.get<VehiclePositionsResponse>('/vehicles/positions/all');
    return response.data;
  }

  async generateVehicleKey(request: KeyGenerationRequest): Promise<KeyGenerationResponse> {
    const response = await this.client.post<KeyGenerationResponse>('/vehicles/generate-key', request);
    return response.data;
  }

  async deleteVehicle(vehicleId: string): Promise<VehicleDeleteResponse> {
    const response = await this.client.delete<VehicleDeleteResponse>(`/vehicles/${encodeURIComponent(vehicleId)}`);
    return response.data;
  }

  async getDeleteResults(): Promise<VehicleDeleteResultsResponse> {
    const response = await this.client.get<VehicleDeleteResultsResponse>('/vehicles/delete-results/all');
    return response.data;
  }

  async getKeyGenerationResults(): Promise<KeyResultsResponse> {
    const response = await this.client.get<KeyResultsResponse>('/vehicles/key-results/all');
    return response.data;
  }

  // ============================================================================
  // Discord Support Tickets
  // ============================================================================

  async getDiscordStatus(): Promise<Pick<DiscordTicketsResponse, 'bot' | 'stats'>> {
    const response = await this.client.get<Pick<DiscordTicketsResponse, 'bot' | 'stats'>>('/discord/status');
    return response.data;
  }

  async getDiscordTickets(params?: { status?: 'open' | 'closed' | 'all'; limit?: number }): Promise<DiscordTicketsResponse> {
    const response = await this.client.get<DiscordTicketsResponse>('/discord/tickets', { params });
    return response.data;
  }

  async getDiscordTicket(ticketId: number | string): Promise<DiscordTicketDetailResponse> {
    const encodedTicketId = encodeURIComponent(String(ticketId));
    const response = await this.client.get<DiscordTicketDetailResponse>(`/discord/tickets/${encodedTicketId}`);
    return response.data;
  }

  async replyDiscordTicket(ticketId: number | string, message: string): Promise<DiscordTicketActionResponse> {
    const encodedTicketId = encodeURIComponent(String(ticketId));
    const response = await this.client.post<DiscordTicketActionResponse>(`/discord/tickets/${encodedTicketId}/reply`, { message });
    return response.data;
  }

  async claimDiscordTicket(ticketId: number | string): Promise<DiscordTicketActionResponse> {
    const encodedTicketId = encodeURIComponent(String(ticketId));
    const response = await this.client.post<DiscordTicketActionResponse>(`/discord/tickets/${encodedTicketId}/claim`);
    return response.data;
  }

  async closeDiscordTicket(ticketId: number | string, reason: string): Promise<DiscordTicketActionResponse> {
    const encodedTicketId = encodeURIComponent(String(ticketId));
    const response = await this.client.post<DiscordTicketActionResponse>(`/discord/tickets/${encodedTicketId}/close`, { reason });
    return response.data;
  }

  async publishDiscordTicketPanel(channelId?: string): Promise<DiscordTicketPanelResponse> {
    const response = await this.client.post<DiscordTicketPanelResponse>('/discord/panel/publish', { channelId });
    return response.data;
  }
}

// Export singleton instance
export const api = new SstApi();

// Export individual functions for convenience
export const setApiKey = (key: string) => api.setApiKey(key);
export const getApiKey = () => api.getApiKey();

export const getHealth = () => api.getHealth();
export const getRuntimeConfig = () => api.getRuntimeConfig();
export const updateRuntimeConfig = (env: RuntimeEnvValues) => api.updateRuntimeConfig(env);
export const createServerProfile = (payload: CreateServerProfileRequest) => api.createServerProfile(payload);
export const browseConfigPath = (path?: string, mode?: ConfigBrowseMode) => api.browseConfigPath(path, mode);
export const getMapConfig = () => api.getMapConfig();
export const getDashboard = () => api.getDashboard();
export const getPlayer = (playerId: string) => api.getPlayer(playerId);
export const refreshDashboard = () => api.refreshDashboard();
export const getLeaderboard = (limit?: number) => api.getLeaderboard(limit);
export const getPlayerInventory = (playerId: string) => api.getPlayerInventory(playerId);
export const getPlayerEvents = (playerId: string) => api.getPlayerEvents(playerId);
export const getPlayerLifeEvents = (playerId: string) => api.getPlayerLifeEvents(playerId);
export const getPlayerTrades = (playerId: string) => api.getPlayerTrades(playerId);
export const getEconomyStats = (params?: EconomyFilterParams) => api.getEconomyStats(params);
export const getAllLifeEvents = (params?: { type?: string; playerId?: string; limit?: number }) => api.getAllLifeEvents(params);
export const getRecentDeaths = () => api.getRecentDeaths();
export const getItems = () => api.getItems();
export const searchItems = (params: { q?: string; category?: string; limit?: number }) => 
  api.searchItems(params);
export const getCategories = () => api.getCategories();
export const getItem = (className: string) => api.getItem(className);
export const lookupItemImages = (items: ItemImageLookupItem[]) => api.lookupItemImages(items);
export const getInventoryCounts = () => api.getInventoryCounts();
export const refreshInventoryCounts = () => api.refreshInventoryCounts();
export const createGrant = (grant: GrantRequest) => api.createGrant(grant);
export const getGrantResults = () => api.getGrantResults();
export const getOnlinePlayers = () => api.getOnlinePlayers();
export const getActiveOnlinePlayers = () => api.getActiveOnlinePlayers();
export const getPlayerOnlineStatus = (playerId: string) => api.getPlayerOnlineStatus(playerId);
export const getAllPlayerLocations = () => api.getAllPlayerLocations();
export const getAIPositions = () => api.getAIPositions();
export const getAIAnalysis = () => api.getAIAnalysis();
export const healPlayer = (request: HealRequest) => api.healPlayer(request);
export const teleportPlayer = (request: TeleportRequest) => api.teleportPlayer(request);
export const getCommandResults = () => api.getCommandResults();
export const sendMessageToPlayer = (request: MessageRequest) => api.sendMessageToPlayer(request);
export const broadcastMessage = (request: BroadcastRequest) => api.broadcastMessage(request);

// Expansion exports
export const getTraderZones = () => api.getTraderZones();
export const getTraderZone = (fileName: string) => api.getTraderZone(fileName);
export const updateTraderZone = (fileName: string, zone: Partial<TraderZone>) => api.updateTraderZone(fileName, zone);
export const getTraders = () => api.getTraders();
export const getTrader = (fileName: string) => api.getTrader(fileName);
export const updateTrader = (fileName: string, trader: Trader) => api.updateTrader(fileName, trader);
export const getMarketCategories = () => api.getMarketCategories();
export const getMarketCategory = (fileName: string) => api.getMarketCategory(fileName);
export const updateMarketCategory = (fileName: string, category: MarketCategory) => api.updateMarketCategory(fileName, category);
export const updateMarketItem = (fileName: string, className: string, item: Partial<MarketItem>) => api.updateMarketItem(fileName, className, item);
export const addMarketItem = (fileName: string, item: Partial<MarketItem>) => api.addMarketItem(fileName, item);
export const deleteMarketItem = (fileName: string, className: string) => api.deleteMarketItem(fileName, className);
export const searchMarketItem = (className: string) => api.searchMarketItem(className);
export const applyPriceChange = (change: PriceChange) => api.applyPriceChange(change);
export const applyPriceChangesBulk = (changes: PriceChange[]) => api.applyPriceChangesBulk(changes);
export const getExpansionAtmBalances = () => api.getExpansionAtmBalances();
export const updateExpansionAtmBalance = (playerId: string, balance: number, hotReload = true) => api.updateExpansionAtmBalance(playerId, balance, hotReload);
export const compensateExpansionAtmBalance = (playerId: string, amount: number, reason: string) => api.compensateExpansionAtmBalance(playerId, amount, reason);
export const reloadExpansionAtmBalances = () => api.reloadExpansionAtmBalances();
export const getExpansionAtmResults = () => api.getExpansionAtmResults();
export const getExpansionAtmHistory = (playerId?: string) => api.getExpansionAtmHistory(playerId);
export const getExpansionData = () => api.getExpansionData();
export const getExpansionQuests = () => api.getExpansionQuests();
export const getExpansionQuestTemplates = () => api.getExpansionQuestTemplates();
export const getExpansionQuest = (fileName: string) => api.getExpansionQuest(fileName);
export const createExpansionQuest = (quest: ExpansionQuestConfig, fileName?: string) => api.createExpansionQuest(quest, fileName);
export const saveExpansionQuest = (fileName: string, quest: ExpansionQuestConfig) => api.saveExpansionQuest(fileName, quest);
export const deleteExpansionQuest = (fileName: string) => api.deleteExpansionQuest(fileName);
export const getExpansionQuestObjective = (type: number, fileName: string) => api.getExpansionQuestObjective(type, fileName);
export const createExpansionQuestObjective = (objective: ExpansionQuestObjectiveConfig, fileName?: string) => api.createExpansionQuestObjective(objective, fileName);
export const saveExpansionQuestObjective = (type: number, fileName: string, objective: ExpansionQuestObjectiveConfig) => api.saveExpansionQuestObjective(type, fileName, objective);
export const deleteExpansionQuestObjective = (type: number, fileName: string) => api.deleteExpansionQuestObjective(type, fileName);
export const getExpansionQuestNpc = (fileName: string) => api.getExpansionQuestNpc(fileName);
export const createExpansionQuestNpc = (npc: ExpansionQuestNpcConfig, fileName?: string) => api.createExpansionQuestNpc(npc, fileName);
export const saveExpansionQuestNpc = (fileName: string, npc: ExpansionQuestNpcConfig) => api.saveExpansionQuestNpc(fileName, npc);
export const deleteExpansionQuestNpc = (fileName: string) => api.deleteExpansionQuestNpc(fileName);

// Logs exports
export const getLogSummary = () => api.getLogSummary();
export const getLogList = (type: string, limit?: number) => api.getLogList(type, limit);
export const getLogContent = (type: string, fileName: string, lines?: number) => api.getLogContent(type, fileName, lines);
export const getLatestScriptLog = (lines?: number) => api.getLatestScriptLog(lines);
export const getLatestCrashLog = () => api.getLatestCrashLog();
export const getLatestRptLog = (lines?: number) => api.getLatestRptLog(lines);

// Position tracking exports
export const getPositionStats = () => api.getPositionStats();
export const getTrackedPlayers = () => api.getTrackedPlayers();
export const getLatestPositions = () => api.getLatestPositions();
export const getPlayerPositions = (playerId: string, limit?: number) => api.getPlayerPositions(playerId, limit);
export const getPlayerPositionsInRange = (playerId: string, start: number, end: number) => api.getPlayerPositionsInRange(playerId, start, end);
export const capturePositionSnapshot = () => api.capturePositionSnapshot();

// Vehicle tracking exports
export const getVehicles = (params?: { ownerId?: string; className?: string; destroyed?: boolean }) => api.getVehicles(params);
export const getVehicle = (vehicleId: string) => api.getVehicle(vehicleId);
export const getVehiclePurchases = (params?: { ownerId?: string; className?: string; limit?: number }) => api.getVehiclePurchases(params);
export const getVehiclesByOwner = (ownerId: string) => api.getVehiclesByOwner(ownerId);
export const getVehiclePositions = () => api.getVehiclePositions();
export const generateVehicleKey = (request: KeyGenerationRequest) => api.generateVehicleKey(request);
export const deleteVehicle = (vehicleId: string) => api.deleteVehicle(vehicleId);
export const getDeleteResults = () => api.getDeleteResults();
export const getKeyGenerationResults = () => api.getKeyGenerationResults();

// Discord support exports
export const getDiscordStatus = () => api.getDiscordStatus();
export const getDiscordTickets = (params?: { status?: 'open' | 'closed' | 'all'; limit?: number }) => api.getDiscordTickets(params);
export const getDiscordTicket = (ticketId: number | string) => api.getDiscordTicket(ticketId);
export const replyDiscordTicket = (ticketId: number | string, message: string) => api.replyDiscordTicket(ticketId, message);
export const claimDiscordTicket = (ticketId: number | string) => api.claimDiscordTicket(ticketId);
export const closeDiscordTicket = (ticketId: number | string, reason: string) => api.closeDiscordTicket(ticketId, reason);
export const publishDiscordTicketPanel = (channelId?: string) => api.publishDiscordTicketPanel(channelId);

// Item delete exports
export const deleteItemFromPlayer = (playerId: string, request: Omit<ItemDeleteRequest, 'playerId'>) => api.deleteItemFromPlayer(playerId, request);
export const getItemDeleteResults = () => api.getItemDeleteResults();

export default api;
