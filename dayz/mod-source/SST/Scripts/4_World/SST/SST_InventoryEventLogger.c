/**
 * @file SST_InventoryEventLogger.c
 * @brief Logs player inventory events (drops, pickups, adds/removes) to JSON.
 *
 * Appends lightweight inventory events to per-player JSON logs under
 * $profile:SST/events/ for API/dashboard consumption.
 */

class SST_InventoryEventLogger
{
	protected static ref SST_InventoryEventLogger s_Instance;
	static string EVENTS_FOLDER = SST_RuntimePaths.EVENTS_FOLDER + "/";
	static const float FLUSH_DELAY = 5000.0;

	// Cache of loaded event logs per player
	protected ref map<string, ref SST_PlayerInventoryEventsLog> m_EventLogs;
	protected ref array<string> m_DirtyEventLogIds;
	protected bool m_FlushScheduled;

	void SST_InventoryEventLogger()
	{
		m_EventLogs = new map<string, ref SST_PlayerInventoryEventsLog>();
		m_DirtyEventLogIds = new array<string>();

		// Create events folder
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(EVENTS_FOLDER);
	}

	static SST_InventoryEventLogger GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_InventoryEventLogger();
		return s_Instance;
	}

	static string GetUTCTimestamp()
	{
		int year, month, day, hour, minute, second;
		GetYearMonthDayUTC(year, month, day);
		GetHourMinuteSecondUTC(hour, minute, second);
		return string.Format("%1-%2-%3T%4:%5:%6Z",
			year.ToStringLen(4),
			month.ToStringLen(2),
			day.ToStringLen(2),
			hour.ToStringLen(2),
			minute.ToStringLen(2),
			second.ToStringLen(2));
	}

	// Get quantity for any item type
	static float GetItemQuantity(EntityAI item)
	{
		if (!item)
			return 0;

		Magazine mag = Magazine.Cast(item);
		if (mag)
			return mag.GetAmmoCount();

		ItemBase itemBase = ItemBase.Cast(item);
		if (itemBase)
			return itemBase.GetQuantity();

		return 0;
	}

	// Log an inventory event
	void LogEvent(string eventType, PlayerBase player, EntityAI item, vector position)
	{
		if (!GetGame().IsServer())
			return;

		if (!player || !item)
			return;

		PlayerIdentity identity = player.GetIdentity();
		if (!identity)
			return;

		string playerId = identity.GetPlainId();
		string playerName = identity.GetName();

		// Create event data
		ref SST_InventoryEventData eventData = new SST_InventoryEventData();
		eventData.timestamp = GetUTCTimestamp();
		eventData.eventType = eventType;
		eventData.playerName = playerName;
		eventData.playerId = playerId;
		eventData.itemClassName = item.GetType();
		eventData.itemDisplayName = item.GetDisplayName();
		eventData.itemHealth = item.GetHealth("", "");
		eventData.itemQuantity = GetItemQuantity(item);
		eventData.position = position;

		// Load or create player's event log
		ref SST_PlayerInventoryEventsLog playerLog = GetOrCreatePlayerLog(playerId, playerName);
		playerLog.events.Insert(eventData);

		// Keep only last 100 events per player to prevent file bloat
		while (playerLog.events.Count() > 100)
		{
			playerLog.events.Remove(0);
		}

		MarkPlayerLogDirty(playerId);
		SST_RestEventClient.SendInventoryEvent(eventData);

		// Console log for debugging
		Print("[SST] " + eventType + ": " + playerName + " - " + item.GetDisplayName() + " (" + item.GetType() + ")");
	}

	protected void MarkPlayerLogDirty(string playerId)
	{
		if (m_DirtyEventLogIds.Find(playerId) == -1)
			m_DirtyEventLogIds.Insert(playerId);

		if (!m_FlushScheduled)
		{
			m_FlushScheduled = true;
			GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(FlushDirtyLogs, FLUSH_DELAY, false);
		}
	}

	protected void FlushDirtyLogs()
	{
		for (int i = 0; i < m_DirtyEventLogIds.Count(); i++)
		{
			string playerId = m_DirtyEventLogIds.Get(i);
			if (m_EventLogs.Contains(playerId))
			{
				SavePlayerLog(playerId, m_EventLogs.Get(playerId));
			}
		}

		m_DirtyEventLogIds = new array<string>();
		m_FlushScheduled = false;
	}

	protected ref SST_PlayerInventoryEventsLog GetOrCreatePlayerLog(string playerId, string playerName)
	{
		// Check cache first
		if (m_EventLogs.Contains(playerId))
			return m_EventLogs.Get(playerId);

		// Try to load from file
		string filePath = EVENTS_FOLDER + playerId + "_events.json";
		ref SST_PlayerInventoryEventsLog playerLog;

		if (SST_PersistenceCore.FileExists(filePath))
		{
			string errorMsg;
			if (SST_Persistence<SST_PlayerInventoryEventsLog>.LoadJson(filePath, playerLog, errorMsg))
			{
				m_EventLogs.Set(playerId, playerLog);
				return playerLog;
			}
		}

		// Create new log
		playerLog = new SST_PlayerInventoryEventsLog();
		playerLog.playerName = playerName;
		playerLog.playerId = playerId;
		m_EventLogs.Set(playerId, playerLog);

		return playerLog;
	}

	protected void SavePlayerLog(string playerId, SST_PlayerInventoryEventsLog playerLog)
	{
		string filePath = EVENTS_FOLDER + playerId + "_events.json";
		string errorMsg;

		if (!SST_Persistence<SST_PlayerInventoryEventsLog>.SaveJson(filePath, playerLog, errorMsg))
		{
			Print("[SST] ERROR: Failed to save event log for " + playerId + ": " + errorMsg);
		}
	}

	// Static helper methods for easy calling
	static void LogDropped(PlayerBase player, EntityAI item, vector position)
	{
		GetInstance().LogEvent(SST_InventoryEventType.DROPPED, player, item, position);
	}

	static void LogRemoved(PlayerBase player, EntityAI item, vector position)
	{
		GetInstance().LogEvent(SST_InventoryEventType.REMOVED, player, item, position);
	}

	static void LogPickedUp(PlayerBase player, EntityAI item, vector position)
	{
		GetInstance().LogEvent(SST_InventoryEventType.PICKED_UP, player, item, position);
	}

	static void LogAdded(PlayerBase player, EntityAI item, vector position)
	{
		GetInstance().LogEvent(SST_InventoryEventType.ADDED, player, item, position);
	}
}

class SST_InventoryDirtyTracker
{
	protected static ref array<string> s_DirtyPlayerIds;

	protected static array<string> GetDirtyPlayerIds()
	{
		if (!s_DirtyPlayerIds)
			s_DirtyPlayerIds = new array<string>();

		return s_DirtyPlayerIds;
	}

	static void MarkPlayerDirty(PlayerBase player)
	{
		if (!player || !player.GetIdentity())
			return;

		string playerId = player.GetIdentity().GetPlainId();
		if (playerId == "")
			return;

		array<string> dirtyPlayerIds = GetDirtyPlayerIds();
		if (dirtyPlayerIds.Find(playerId) == -1)
			dirtyPlayerIds.Insert(playerId);
	}

	static bool IsPlayerDirty(string playerId)
	{
		if (playerId == "")
			return false;

		return GetDirtyPlayerIds().Find(playerId) != -1;
	}

	static void ClearPlayerDirty(string playerId)
	{
		array<string> dirtyPlayerIds = GetDirtyPlayerIds();
		int index = dirtyPlayerIds.Find(playerId);
		if (index != -1)
			dirtyPlayerIds.Remove(index);
	}
}

// ============================================================================
// Player Life Event Logger (Death, Spawn, Connect, Disconnect)
// ============================================================================
class SST_PlayerLifeEventLogger
{
	protected static ref SST_PlayerLifeEventLogger s_Instance;
	static string LIFE_EVENTS_FOLDER = SST_RuntimePaths.LIFE_EVENTS_FOLDER + "/";

	protected ref map<string, ref SST_PlayerLifeEventsLog> m_LifeEventLogs;

	void SST_PlayerLifeEventLogger()
	{
		m_LifeEventLogs = new map<string, ref SST_PlayerLifeEventsLog>();

		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(LIFE_EVENTS_FOLDER);
	}

	static SST_PlayerLifeEventLogger GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_PlayerLifeEventLogger();
		return s_Instance;
	}

	void LogLifeEvent(string eventType, PlayerBase player, string causeOfDeath = "", float healthAtDeath = -1, string targetPlayerId = "", string targetPlayerName = "")
	{
		if (!GetGame().IsServer())
			return;

		if (!player)
			return;

		PlayerIdentity identity = player.GetIdentity();
		if (!identity)
			return;

		string playerId = identity.GetPlainId();
		string playerName = identity.GetName();

		ref SST_PlayerLifeEventData eventData = new SST_PlayerLifeEventData();
		eventData.timestamp = SST_InventoryEventLogger.GetUTCTimestamp();
		eventData.eventType = eventType;
		eventData.playerName = playerName;
		eventData.playerId = playerId;
		eventData.targetPlayerId = targetPlayerId;
		eventData.targetPlayerName = targetPlayerName;
		eventData.position = player.GetPosition();
		eventData.causeOfDeath = causeOfDeath;
		eventData.healthAtDeath = healthAtDeath;

		ref SST_PlayerLifeEventsLog playerLog = GetOrCreateLifeLog(playerId, playerName);
		playerLog.events.Insert(eventData);

		// Keep last 50 life events
		while (playerLog.events.Count() > 50)
		{
			playerLog.events.Remove(0);
		}

		SaveLifeLog(playerId, playerLog);
		SST_RestEventClient.SendLifeEvent(eventData);

		Print("[SST] LIFE EVENT - " + eventType + ": " + playerName + " at " + player.GetPosition().ToString());
	}

	protected ref SST_PlayerLifeEventsLog GetOrCreateLifeLog(string playerId, string playerName)
	{
		if (m_LifeEventLogs.Contains(playerId))
			return m_LifeEventLogs.Get(playerId);

		string filePath = LIFE_EVENTS_FOLDER + playerId + "_life.json";
		ref SST_PlayerLifeEventsLog playerLog;

		if (SST_PersistenceCore.FileExists(filePath))
		{
			string errorMsg;
			if (SST_Persistence<SST_PlayerLifeEventsLog>.LoadJson(filePath, playerLog, errorMsg))
			{
				m_LifeEventLogs.Set(playerId, playerLog);
				return playerLog;
			}
		}

		playerLog = new SST_PlayerLifeEventsLog();
		playerLog.playerName = playerName;
		playerLog.playerId = playerId;
		m_LifeEventLogs.Set(playerId, playerLog);

		return playerLog;
	}

	protected void SaveLifeLog(string playerId, SST_PlayerLifeEventsLog playerLog)
	{
		string filePath = LIFE_EVENTS_FOLDER + playerId + "_life.json";
		string errorMsg;

		if (!SST_Persistence<SST_PlayerLifeEventsLog>.SaveJson(filePath, playerLog, errorMsg))
		{
			Print("[SST] ERROR: Failed to save life event log for " + playerId + ": " + errorMsg);
		}
	}

	// Static helpers
	static void LogDeath(PlayerBase player, Object killer)
	{
		string cause = "";
		string targetPlayerId = "";
		string targetPlayerName = "";

		if (killer)
		{
			cause = killer.GetType();
			PlayerBase killerPlayer = PlayerBase.Cast(killer);
			if (killerPlayer && killerPlayer.GetIdentity())
			{
				targetPlayerName = killerPlayer.GetIdentity().GetName();
				targetPlayerId = killerPlayer.GetIdentity().GetPlainId();
				cause = "Player: " + targetPlayerName + " (" + targetPlayerId + ")";
			}
		}
		GetInstance().LogLifeEvent(SST_PlayerLifeEventType.DIED, player, cause, player.GetHealth("", ""), targetPlayerId, targetPlayerName);
	}

	static void LogSpawn(PlayerBase player)
	{
		GetInstance().LogLifeEvent(SST_PlayerLifeEventType.SPAWNED, player);
	}

	static void LogRespawn(PlayerBase player)
	{
		GetInstance().LogLifeEvent(SST_PlayerLifeEventType.RESPAWNED, player);
	}

	static void LogConnect(PlayerBase player)
	{
		GetInstance().LogLifeEvent(SST_PlayerLifeEventType.CONNECTED, player);
	}

	static void LogDisconnect(PlayerBase player)
	{
		GetInstance().LogLifeEvent(SST_PlayerLifeEventType.DISCONNECTED, player);
	}
}

// ============================================================================
// Item Grant API - Processes requests to give items to players
// ============================================================================
class SST_ItemGrantAPI
{
	protected static ref SST_ItemGrantAPI s_Instance;
	static string GRANT_QUEUE_FILE = SST_RuntimePaths.ApiFile("item_grants.json");
	static string GRANT_RESULTS_FILE = SST_RuntimePaths.ApiFile("item_grants_results.json");
	static const float CHECK_INTERVAL = 5000.0; // Check every 5 seconds

	void SST_ItemGrantAPI()
	{
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.API_FOLDER);
	}

	static SST_ItemGrantAPI GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_ItemGrantAPI();
		return s_Instance;
	}

	static void Start()
	{
		GetInstance().Init();
	}

	protected void Init()
	{
		Print("[SST] Item Grant API initialized - checking " + GRANT_QUEUE_FILE + " every 5 seconds");
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessGrantsAndSchedule, 5000, false);
	}

	void ProcessGrantsAndSchedule()
	{
		ProcessPendingGrants();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessGrantsAndSchedule, CHECK_INTERVAL, false);
	}

	void ProcessPendingGrants()
	{
		if (!GetGame().IsServer())
			return;

		if (!SST_PersistenceCore.FileExists(GRANT_QUEUE_FILE))
			return;

		ref SST_ItemGrantQueue grantQueue;
		string errorMsg;

		if (!SST_Persistence<SST_ItemGrantQueue>.LoadJson(GRANT_QUEUE_FILE, grantQueue, errorMsg))
		{
			Print("[SST] ERROR: Failed to load grant queue: " + errorMsg);
			return;
		}

		if (!grantQueue || grantQueue.requests.Count() == 0)
			return;

		bool hasChanges = false;

		foreach (SST_ItemGrantRequest request : grantQueue.requests)
		{
			if (request.processed)
				continue;

			hasChanges = true;
			ProcessSingleGrant(request);
		}

		if (hasChanges)
		{
			// Save updated queue with results
			if (!SST_Persistence<SST_ItemGrantQueue>.SaveJson(GRANT_RESULTS_FILE, grantQueue, errorMsg))
			{
				Print("[SST] ERROR: Failed to save grant results: " + errorMsg);
			}

			// Clear the original queue file
			ref SST_ItemGrantQueue emptyQueue = new SST_ItemGrantQueue();
			SST_Persistence<SST_ItemGrantQueue>.SaveJson(GRANT_QUEUE_FILE, emptyQueue, errorMsg);
		}
	}

	protected void ProcessSingleGrant(SST_ItemGrantRequest request)
	{
		request.processed = true;

		// Find the player
		PlayerBase targetPlayer = FindPlayerBySteamId(request.playerId);
		if (!targetPlayer)
		{
			request.result = "PLAYER_NOT_FOUND";
			Print("[SST] Item Grant FAILED: Player " + request.playerId + " not found online");
			return;
		}

		// Validate item class - check both CfgVehicles and CfgWeapons
		bool validClass = GetGame().ConfigIsExisting("CfgVehicles " + request.itemClassName) || GetGame().ConfigIsExisting("CfgWeapons " + request.itemClassName);
		if (!validClass)
		{
			request.result = "INVALID_ITEM_CLASS";
			Print("[SST] Item Grant FAILED: Invalid item class " + request.itemClassName);
			return;
		}

		// Try to create item in player's inventory
		EntityAI newItem = targetPlayer.GetInventory().CreateInInventory(request.itemClassName);

		if (!newItem)
		{
			// Try spawning at feet if inventory is full
			vector spawnPos = targetPlayer.GetPosition();
			newItem = EntityAI.Cast(GetGame().CreateObjectEx(request.itemClassName, spawnPos, ECE_PLACE_ON_SURFACE));
		}

		if (!newItem)
		{
			request.result = "SPAWN_FAILED";
			Print("[SST] Item Grant FAILED: Could not spawn " + request.itemClassName);
			return;
		}

		// Set health if specified
		if (request.health >= 0 && request.health <= 100)
		{
			float maxHealth = newItem.GetMaxHealth("", "");
			newItem.SetHealth("", "", maxHealth * (request.health / 100.0));
		}

		// Set quantity if applicable
		if (request.quantity > 1)
		{
			Magazine mag = Magazine.Cast(newItem);
			if (mag)
			{
				mag.ServerSetAmmoCount(Math.Min(request.quantity, mag.GetAmmoMax()));
			}
			else
			{
				ItemBase itemBase = ItemBase.Cast(newItem);
				if (itemBase && itemBase.GetQuantityMax() > 0)
				{
					itemBase.SetQuantity(Math.Min(request.quantity, itemBase.GetQuantityMax()));
				}
			}
		}

		request.result = "SUCCESS";
		Print("[SST] Item Grant SUCCESS: " + request.itemClassName + " given to " + targetPlayer.GetIdentity().GetName());

		// Send notification to player
		string itemDisplayName = newItem.GetDisplayName();
		if (itemDisplayName == "")
			itemDisplayName = request.itemClassName;

		string qtyText = "";
		if (request.quantity > 1)
			qtyText = " x" + request.quantity.ToString();

		string notificationTitle = "ADMIN MESSAGE";
		string notificationText = "Item " + itemDisplayName + qtyText + " added to inventory";

		// Send notification (5 second display time)
		NotificationSystem.SendNotificationToPlayerExtended(targetPlayer, 5.0, notificationTitle, notificationText, "set:dayz_gui image:icon_connect");
	}

	protected PlayerBase FindPlayerBySteamId(string steamId)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		foreach (Man man : players)
		{
			if (!man)
				continue;

			PlayerIdentity identity = man.GetIdentity();
			if (identity && identity.GetPlainId() == steamId)
			{
				return PlayerBase.Cast(man);
			}
		}
		return null;
	}
}

// ============================================================================
// Item Delete API - Processes requests to delete items from players
// ============================================================================
class SST_ItemDeleteAPI
{
	protected static ref SST_ItemDeleteAPI s_Instance;
	static string DELETE_QUEUE_FILE = SST_RuntimePaths.ApiFile("item_deletes.json");
	static string DELETE_RESULTS_FILE = SST_RuntimePaths.ApiFile("item_deletes_results.json");
	static const float CHECK_INTERVAL = 5000.0; // Check every 5 seconds

	void SST_ItemDeleteAPI()
	{
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.API_FOLDER);
	}

	static SST_ItemDeleteAPI GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_ItemDeleteAPI();
		return s_Instance;
	}

	static void Start()
	{
		GetInstance().Init();
	}

	protected void Init()
	{
		Print("[SST] Item Delete API initialized - checking " + DELETE_QUEUE_FILE + " every 5 seconds");
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessDeletesAndSchedule, 5000, false);
	}

	void ProcessDeletesAndSchedule()
	{
		ProcessPendingDeletes();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessDeletesAndSchedule, CHECK_INTERVAL, false);
	}

	void ProcessPendingDeletes()
	{
		if (!GetGame().IsServer())
			return;

		if (!SST_PersistenceCore.FileExists(DELETE_QUEUE_FILE))
			return;

		ref SST_ItemDeleteQueue deleteQueue;
		string errorMsg;

		if (!SST_Persistence<SST_ItemDeleteQueue>.LoadJson(DELETE_QUEUE_FILE, deleteQueue, errorMsg))
		{
			Print("[SST] ERROR: Failed to load delete queue: " + errorMsg);
			return;
		}

		if (!deleteQueue || deleteQueue.requests.Count() == 0)
			return;

		bool hasChanges = false;

		foreach (SST_ItemDeleteRequest request : deleteQueue.requests)
		{
			if (request.processed)
				continue;

			hasChanges = true;
			ProcessSingleDelete(request);
		}

		if (hasChanges)
		{
			// Append results to results file
			ref SST_ItemDeleteQueue existingResults = new SST_ItemDeleteQueue();
			if (SST_PersistenceCore.FileExists(DELETE_RESULTS_FILE))
				SST_Persistence<SST_ItemDeleteQueue>.LoadJson(DELETE_RESULTS_FILE, existingResults, errorMsg);

			foreach (SST_ItemDeleteRequest req : deleteQueue.requests)
			{
				existingResults.requests.Insert(req);
			}

			// Keep only last 100 results
			while (existingResults.requests.Count() > 100)
				existingResults.requests.Remove(0);

			SST_Persistence<SST_ItemDeleteQueue>.SaveJson(DELETE_RESULTS_FILE, existingResults, errorMsg);

			// Clear the original queue file
			ref SST_ItemDeleteQueue emptyQueue = new SST_ItemDeleteQueue();
			SST_Persistence<SST_ItemDeleteQueue>.SaveJson(DELETE_QUEUE_FILE, emptyQueue, errorMsg);
		}
	}

	protected void ProcessSingleDelete(SST_ItemDeleteRequest request)
	{
		request.processed = true;
		request.status = "failed";

		Print("[SST] Processing item delete request: " + request.requestId + " for player " + request.playerId);

		// Find the player
		PlayerBase targetPlayer = FindPlayerBySteamId(request.playerId);
		if (!targetPlayer)
		{
			request.result = "Player not online";
			Print("[SST] Item Delete FAILED: Player " + request.playerId + " not found online");
			return;
		}

		// Get player's inventory
		EntityAI item = FindItemByPath(targetPlayer, request.itemPath, request.itemClassName);

		if (!item)
		{
			request.result = "Item not found at path: " + request.itemPath;
			Print("[SST] Item Delete FAILED: Item " + request.itemClassName + " not found at path " + request.itemPath);
			return;
		}

		// Check if it matches the expected class name
		if (item.GetType() != request.itemClassName)
		{
			request.result = "Item mismatch - expected " + request.itemClassName + " but found " + item.GetType();
			Print("[SST] Item Delete FAILED: Item class mismatch");
			return;
		}

		string itemDisplayName = item.GetDisplayName();
		if (itemDisplayName == "")
			itemDisplayName = request.itemClassName;

		// Handle stackable items - reduce quantity or delete
		ItemBase itemBase = ItemBase.Cast(item);
		if (itemBase && request.deleteCount > 0 && request.deleteCount < itemBase.GetQuantity())
		{
			// Just reduce quantity
			float currentQty = itemBase.GetQuantity();
			float newQty = currentQty - request.deleteCount;
			itemBase.SetQuantity(newQty);

			request.status = "completed";
			request.result = "Reduced " + itemDisplayName + " quantity by " + request.deleteCount.ToString() + " (now " + newQty.ToString() + ")";
			Print("[SST] Item Delete SUCCESS: " + request.result);
		}
		else
		{
			// Delete the entire item
			GetGame().ObjectDelete(item);

			request.status = "completed";
			request.result = "Deleted " + itemDisplayName;
			Print("[SST] Item Delete SUCCESS: Deleted " + itemDisplayName + " from " + targetPlayer.GetIdentity().GetName());
		}

		// Send notification to player
		NotificationSystem.SendNotificationToPlayerExtended(targetPlayer, 5.0, "ADMIN ACTION", itemDisplayName + " was removed from your inventory", "set:dayz_gui image:icon_x");
	}

	// Find item by path in player inventory
	// Path format: "slotIndex.cargo|attachments.itemIndex" e.g. "0.cargo.2" or "3.attachments.0.cargo.1"
	protected EntityAI FindItemByPath(PlayerBase player, string path, string expectedClassName)
	{
		if (!player || path == "")
			return null;

		array<string> parts = new array<string>();
		path.Split(".", parts);

		if (parts.Count() < 1)
			return null;

		// Get the player's inventory items using same method as inventory export
		// Use EnumerateInventory then filter to top-level items only
		array<EntityAI> allItems = new array<EntityAI>();
		player.GetInventory().EnumerateInventory(InventoryTraversalType.PREORDER, allItems);

		// Build list of child items to exclude
		ref array<EntityAI> childItems = new array<EntityAI>();
		foreach (EntityAI item : allItems)
		{
			if (!item || item == player)
				continue;

			GameInventory itemInv = item.GetInventory();
			if (itemInv)
			{
				// Mark attachments as children
				int attCount = itemInv.AttachmentCount();
				for (int a = 0; a < attCount; a++)
				{
					EntityAI att = itemInv.GetAttachmentFromIndex(a);
					if (att)
						childItems.Insert(att);
				}

				// Mark cargo items as children
				CargoBase itemCargo = itemInv.GetCargo();
				if (itemCargo)
				{
					int cargoCount = itemCargo.GetItemCount();
					for (int c = 0; c < cargoCount; c++)
					{
						EntityAI cargoItem = itemCargo.GetItem(c);
						if (cargoItem)
							childItems.Insert(cargoItem);
					}
				}
			}
		}

		// Build top-level items list (same order as inventory export)
		array<EntityAI> topLevelItems = new array<EntityAI>();
		foreach (EntityAI topItem : allItems)
		{
			if (!topItem || topItem == player)
				continue;

			// Skip if this is a child of another item
			if (childItems.Find(topItem) != -1)
				continue;

			topLevelItems.Insert(topItem);
		}

		// Parse first part as the root item index
		int rootIndex = parts[0].ToInt();
		if (rootIndex < 0 || rootIndex >= topLevelItems.Count())
		{
			Print("[SST] FindItemByPath: Root index " + rootIndex.ToString() + " out of bounds (have " + topLevelItems.Count().ToString() + " top-level items)");
			return null;
		}

		EntityAI currentItem = topLevelItems[rootIndex];
		Print("[SST] FindItemByPath: Starting at root item " + rootIndex.ToString() + " = " + currentItem.GetType());

		// Navigate deeper into the path
		int partIdx = 1;
		while (partIdx < parts.Count() && currentItem)
		{
			string part = parts[partIdx];

			if (part == "cargo")
			{
				// Next part should be index
				partIdx++;
				if (partIdx >= parts.Count())
					break;

				int cargoIdx = parts[partIdx].ToInt();
				CargoBase cargo = currentItem.GetInventory().GetCargo();
				if (!cargo)
				{
					Print("[SST] FindItemByPath: Item " + currentItem.GetType() + " has no cargo");
					return null;
				}
				if (cargoIdx < 0 || cargoIdx >= cargo.GetItemCount())
				{
					Print("[SST] FindItemByPath: Cargo index " + cargoIdx.ToString() + " out of bounds (have " + cargo.GetItemCount().ToString() + " items)");
					return null;
				}

				currentItem = cargo.GetItem(cargoIdx);
				Print("[SST] FindItemByPath: Navigated to cargo[" + cargoIdx.ToString() + "] = " + currentItem.GetType());
			}
			else if (part == "attachments")
			{
				// Next part should be index
				partIdx++;
				if (partIdx >= parts.Count())
					break;

				int attIdx = parts[partIdx].ToInt();
				int navAttCount = currentItem.GetInventory().AttachmentCount();
				if (attIdx < 0 || attIdx >= navAttCount)
				{
					Print("[SST] FindItemByPath: Attachment index " + attIdx.ToString() + " out of bounds (have " + navAttCount.ToString() + " attachments)");
					return null;
				}

				currentItem = currentItem.GetInventory().GetAttachmentFromIndex(attIdx);
				Print("[SST] FindItemByPath: Navigated to attachment[" + attIdx.ToString() + "] = " + currentItem.GetType());
			}
			else
			{
				Print("[SST] FindItemByPath: Unknown path part: " + part);
				// Unknown path part
				return null;
			}

			partIdx++;
		}

		// Verify the class name matches
		if (currentItem && currentItem.GetType() == expectedClassName)
			return currentItem;

		// If path navigation failed but we have the expected class, search by class name as fallback
		if (!currentItem)
		{
			return FindItemByClassName(player, expectedClassName);
		}

		return currentItem;
	}

	// Fallback: find first item matching class name in player's inventory
	protected EntityAI FindItemByClassName(PlayerBase player, string className)
	{
		array<EntityAI> items = new array<EntityAI>();
		player.GetInventory().EnumerateInventory(InventoryTraversalType.PREORDER, items);

		foreach (EntityAI item : items)
		{
			if (item.GetType() == className)
				return item;
		}

		return null;
	}

	protected PlayerBase FindPlayerBySteamId(string steamId)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		foreach (Man man : players)
		{
			if (!man)
				continue;

			PlayerIdentity identity = man.GetIdentity();
			if (identity && identity.GetPlainId() == steamId)
			{
				return PlayerBase.Cast(man);
			}
		}
		return null;
	}
}

// ============================================================================
// REST Event Client
// ============================================================================
/*
class SST_RestEventSettings
{
	bool enabled;
	string baseUrl;
	string eventsPath;
	string contentType;
	string apiKey;
	bool debug;
	bool logSuccess;
	bool sendLifeEvents;
	bool sendInventoryEvents;
	bool sendTradeEvents;
	int readTimeoutSeconds;
	int connectionTimeoutSeconds;

	void SST_RestEventSettings()
	{
		enabled = true;
		baseUrl = "http://127.0.0.1:5106/";
		eventsPath = "api/events";
		contentType = "application/json";
		apiKey = "";
		debug = false;
		logSuccess = false;
		sendLifeEvents = true;
		sendInventoryEvents = true;
		sendTradeEvents = true;
		readTimeoutSeconds = 10;
		connectionTimeoutSeconds = 10;
	}
}

class SST_ServerEventMetadata
{
	string action;
	string itemClassName;
	string itemDisplayName;
	float itemHealth;
	float itemQuantity;
	int quantity;
	int price;
	string traderName;
	string traderZone;
	string causeOfDeath;
	float healthAtDeath;
}

class SST_ServerEventRequest
{
	string eventType;
	string steamId;
	string playerName;
	string targetSteamId;
	string targetName;
	string location;
	string mapName;
	float positionX;
	float positionY;
	float positionZ;
	string summary;
	string source;
	string correlationId;
	string createdAt;
	ref SST_ServerEventMetadata metadata;
}

class SST_RestEventCallback : RestCallback
{
	protected string m_EventType;
	protected string m_Summary;

	void Init(string eventType, string summary)
	{
		m_EventType = eventType;
		m_Summary = summary;
	}

	override void OnError(int errorCode)
	{
		Print("[SST] REST event failed (" + m_EventType + ") error=" + errorCode.ToString() + " summary=" + m_Summary);
		SST_RestEventClient.GetInstance().ReleaseCallback(this);
	}

	override void OnTimeout()
	{
		Print("[SST] REST event timed out (" + m_EventType + ") summary=" + m_Summary);
		SST_RestEventClient.GetInstance().ReleaseCallback(this);
	}

	override void OnSuccess(string data, int dataSize)
	{
		if (SST_RestEventClient.GetInstance().ShouldLogSuccess())
			Print("[SST] REST event posted (" + m_EventType + ") responseBytes=" + dataSize.ToString());

		SST_RestEventClient.GetInstance().ReleaseCallback(this);
	}
}

class SST_RestEventClient
{
	protected static ref SST_RestEventClient s_Instance;
	static string CONFIG_FILE = SST_RuntimePaths.ApiFile("rest_config.json");

	protected ref SST_RestEventSettings m_Config;
	protected ref JsonSerializer m_Serializer;
	protected ref array<ref SST_RestEventCallback> m_PendingCallbacks;
	protected RestContext m_Context;
	protected bool m_Initialized;

	void SST_RestEventClient()
	{
		m_Serializer = new JsonSerializer();
		m_PendingCallbacks = new array<ref SST_RestEventCallback>();
	}

	static SST_RestEventClient GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_RestEventClient();

		return s_Instance;
	}

	static void Start()
	{
		GetInstance().Init();
	}

	void Init()
	{
		if (m_Initialized)
			return;

		m_Initialized = true;

		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.API_FOLDER);

		m_Config = LoadOrCreateConfig();
		if (!m_Config || !m_Config.enabled)
		{
			Print("[SST] REST event client disabled. Enable it in " + CONFIG_FILE);
			return;
		}

		RestApi api = GetRestApi();
		if (!api)
			api = CreateRestApi();

		if (!api)
		{
			Print("[SST] ERROR: REST event client could not create RestApi");
			return;
		}

		api.SetOption(ERESTOPTION_READOPERATION, ClampTimeout(m_Config.readTimeoutSeconds));
		api.SetOption(ERESTOPTION_CONNECTION, ClampTimeout(m_Config.connectionTimeoutSeconds));
		api.EnableDebug(m_Config.debug);

		m_Config.baseUrl = NormalizeBaseUrl(m_Config.baseUrl);
		m_Config.eventsPath = NormalizeRequestPath(m_Config.eventsPath);

		m_Context = api.GetRestContext(m_Config.baseUrl);
		if (!m_Context)
		{
			Print("[SST] ERROR: REST event client could not create RestContext for " + m_Config.baseUrl);
			return;
		}

		m_Context.SetHeader(BuildHeader());
		Print("[SST] REST event client ready: " + m_Config.baseUrl + m_Config.eventsPath);
	}

	bool ShouldLogSuccess()
	{
		return m_Config && m_Config.logSuccess;
	}

	bool ShouldSendLifeEvents()
	{
		if (!m_Initialized)
			Init();

		return m_Config && m_Config.enabled && m_Config.sendLifeEvents;
	}

	bool ShouldSendInventoryEvents()
	{
		if (!m_Initialized)
			Init();

		return m_Config && m_Config.enabled && m_Config.sendInventoryEvents;
	}

	bool ShouldSendTradeEvents()
	{
		if (!m_Initialized)
			Init();

		return m_Config && m_Config.enabled && m_Config.sendTradeEvents;
	}

	void ReleaseCallback(SST_RestEventCallback callback)
	{
		if (!m_PendingCallbacks || !callback)
			return;

		int index = m_PendingCallbacks.Find(callback);
		if (index != -1)
			m_PendingCallbacks.Remove(index);
	}

	protected ref SST_RestEventSettings LoadOrCreateConfig()
	{
		ref SST_RestEventSettings config;
		string errorMsg;

		if (SST_PersistenceCore.FileExists(CONFIG_FILE))
		{
			if (SST_Persistence<SST_RestEventSettings>.LoadJson(CONFIG_FILE, config, errorMsg) && config)
				return config;

			Print("[SST] WARNING: Failed to load REST config, creating default: " + errorMsg);
		}

		config = new SST_RestEventSettings();
		if (!SST_Persistence<SST_RestEventSettings>.SaveJson(CONFIG_FILE, config, errorMsg))
			Print("[SST] WARNING: Failed to save default REST config: " + errorMsg);

		return config;
	}

	protected int ClampTimeout(int timeoutSeconds)
	{
		if (timeoutSeconds < 3)
			return 3;

		if (timeoutSeconds > 120)
			return 120;

		return timeoutSeconds;
	}

	protected string NormalizeBaseUrl(string baseUrl)
	{
		if (baseUrl == "")
			baseUrl = "http://127.0.0.1:5106/";

		int length = baseUrl.Length();
		if (length > 0 && baseUrl.Get(length - 1) != "/")
			baseUrl = baseUrl + "/";

		return baseUrl;
	}

	protected string NormalizeRequestPath(string requestPath)
	{
		if (requestPath == "")
			requestPath = "api/events";

		while (requestPath.Length() > 0 && requestPath.Get(0) == "/")
		{
			requestPath = requestPath.Substring(1, requestPath.Length() - 1);
		}

		return requestPath;
	}

	protected string BuildHeader()
	{
		string header = m_Config.contentType;
		if (header == "")
			header = "application/json";

		if (m_Config.apiKey != "")
			header = header + "\r\nX-SST-Api-Key: " + m_Config.apiKey;

		return header;
	}

	protected void SendEvent(SST_ServerEventRequest serverEvent)
	{
		if (!GetGame().IsServer())
			return;

		if (!m_Initialized)
			Init();

		if (!m_Config || !m_Config.enabled || !m_Context)
			return;

		string payload;
		if (!m_Serializer.WriteToString(serverEvent, false, payload))
		{
			Print("[SST] ERROR: Failed to serialize REST event " + serverEvent.eventType);
			return;
		}

		ref SST_RestEventCallback callback = new SST_RestEventCallback();
		callback.Init(serverEvent.eventType, serverEvent.summary);
		m_PendingCallbacks.Insert(callback);

		int state = m_Context.POST(callback, m_Config.eventsPath, payload);
		if (state >= EREST_ERROR)
		{
			Print("[SST] ERROR: REST event POST refused (" + serverEvent.eventType + ") state=" + state.ToString());
			ReleaseCallback(callback);
		}
	}

	protected static ref SST_ServerEventRequest CreateBaseEvent(string eventType, string steamId, string playerName, vector position, string createdAt)
	{
		ref SST_ServerEventRequest serverEvent = new SST_ServerEventRequest();
		serverEvent.eventType = eventType;
		serverEvent.steamId = steamId;
		serverEvent.playerName = playerName;
		serverEvent.positionX = position[0];
		serverEvent.positionY = position[1];
		serverEvent.positionZ = position[2];
		serverEvent.createdAt = createdAt;
		serverEvent.source = "dayz-mod";
		serverEvent.metadata = new SST_ServerEventMetadata();
		return serverEvent;
	}

	protected static string MapLifeEventType(string eventType)
	{
		if (eventType == SST_PlayerLifeEventType.DIED)
			return "PlayerDeath";

		if (eventType == SST_PlayerLifeEventType.SPAWNED)
			return "PlayerSpawned";

		if (eventType == SST_PlayerLifeEventType.RESPAWNED)
			return "PlayerRespawned";

		if (eventType == SST_PlayerLifeEventType.CONNECTED)
			return "PlayerConnected";

		if (eventType == SST_PlayerLifeEventType.DISCONNECTED)
			return "PlayerDisconnected";

		return "PlayerLifeEvent";
	}

	static void SendInventoryEvent(SST_InventoryEventData eventData)
	{
		if (!eventData)
			return;

		SST_RestEventClient client = GetInstance();
		if (!client.ShouldSendInventoryEvents())
			return;

		ref SST_ServerEventRequest serverEvent = CreateBaseEvent("InventoryEvent", eventData.playerId, eventData.playerName, eventData.position, eventData.timestamp);
		serverEvent.summary = eventData.playerName + " " + eventData.eventType + " " + eventData.itemDisplayName;
		serverEvent.metadata.action = eventData.eventType;
		serverEvent.metadata.itemClassName = eventData.itemClassName;
		serverEvent.metadata.itemDisplayName = eventData.itemDisplayName;
		serverEvent.metadata.itemHealth = eventData.itemHealth;
		serverEvent.metadata.itemQuantity = eventData.itemQuantity;

		client.SendEvent(serverEvent);
	}

	static void SendLifeEvent(SST_PlayerLifeEventData eventData)
	{
		if (!eventData)
			return;

		SST_RestEventClient client = GetInstance();
		if (!client.ShouldSendLifeEvents())
			return;

		ref SST_ServerEventRequest serverEvent = CreateBaseEvent(MapLifeEventType(eventData.eventType), eventData.playerId, eventData.playerName, eventData.position, eventData.timestamp);
		serverEvent.targetSteamId = eventData.targetPlayerId;
		serverEvent.targetName = eventData.targetPlayerName;
		serverEvent.summary = eventData.playerName + " " + eventData.eventType;
		if (eventData.causeOfDeath != "")
			serverEvent.summary = serverEvent.summary + " - " + eventData.causeOfDeath;

		serverEvent.metadata.action = eventData.eventType;
		serverEvent.metadata.causeOfDeath = eventData.causeOfDeath;
		serverEvent.metadata.healthAtDeath = eventData.healthAtDeath;

		client.SendEvent(serverEvent);
	}

	static void SendTradeEvent(SST_TradeEventData tradeData)
	{
		if (!tradeData)
			return;

		SST_RestEventClient client = GetInstance();
		if (!client.ShouldSendTradeEvents())
			return;

		ref SST_ServerEventRequest serverEvent = CreateBaseEvent("TradeEvent", tradeData.playerId, tradeData.playerName, tradeData.playerPosition, tradeData.timestamp);
		serverEvent.location = tradeData.traderZone;
		serverEvent.summary = tradeData.playerName + " " + tradeData.eventType + " " + tradeData.itemDisplayName + " x" + tradeData.quantity.ToString();
		serverEvent.metadata.action = tradeData.eventType;
		serverEvent.metadata.itemClassName = tradeData.itemClassName;
		serverEvent.metadata.itemDisplayName = tradeData.itemDisplayName;
		serverEvent.metadata.quantity = tradeData.quantity;
		serverEvent.metadata.price = tradeData.price;
		serverEvent.metadata.traderName = tradeData.traderName;
		serverEvent.metadata.traderZone = tradeData.traderZone;

		client.SendEvent(serverEvent);
	}
}

*/

// ============================================================================
// Mod PlayerBase to track death and spawn events
// ============================================================================
modded class PlayerBase
{
	protected bool m_SST_HasLoggedSpawn = false;

	override void EEKilled(Object killer)
	{
		// Log death before calling super (which may clear some data)
		if (GetGame().IsServer())
		{
			SST_PlayerLifeEventLogger.LogDeath(this, killer);
		}

		super.EEKilled(killer);
	}

	// Called when player connects/spawns
	override void OnConnect()
	{
		super.OnConnect();

		if (GetGame().IsServer() && !m_SST_HasLoggedSpawn)
		{
			m_SST_HasLoggedSpawn = true;
			// This is a new spawn - player just created
			SST_PlayerLifeEventLogger.LogSpawn(this);
		}
	}

	// Called when player reconnects with existing character
	override void OnReconnect()
	{
		super.OnReconnect();

		// Already logged on connect, this is a reconnect
		// Don't log as spawn, just mark as has logged
		m_SST_HasLoggedSpawn = true;
	}
}

// ============================================================================
// Mod ItemBase to track inventory changes
// ============================================================================
modded class ItemBase
{
	override void EEItemLocationChanged(notnull InventoryLocation oldLoc, notnull InventoryLocation newLoc)
	{
		super.EEItemLocationChanged(oldLoc, newLoc);

		// Only run on server
		if (!GetGame().IsServer())
			return;

		// Get old and new owners (players)
		PlayerBase oldPlayer = null;
		PlayerBase newPlayer = null;

		if (oldLoc.GetParent())
			oldPlayer = PlayerBase.Cast(oldLoc.GetParent().GetHierarchyRootPlayer());

		if (newLoc.GetParent())
			newPlayer = PlayerBase.Cast(newLoc.GetParent().GetHierarchyRootPlayer());

		vector itemPos = GetPosition();

		// Item left a player's inventory
		if (oldPlayer && !newPlayer)
		{
			SST_InventoryDirtyTracker.MarkPlayerDirty(oldPlayer);

			// Check if dropped to ground
			if (newLoc.GetType() == InventoryLocationType.GROUND)
			{
				SST_InventoryEventLogger.LogDropped(oldPlayer, this, itemPos);
			}
			else
			{
				// Removed but not to ground (put in storage, vehicle, etc.)
				SST_InventoryEventLogger.LogRemoved(oldPlayer, this, itemPos);
			}
		}
		// Item entered a player's inventory
		else if (!oldPlayer && newPlayer)
		{
			SST_InventoryDirtyTracker.MarkPlayerDirty(newPlayer);

			// Check if picked up from ground
			if (oldLoc.GetType() == InventoryLocationType.GROUND)
			{
				SST_InventoryEventLogger.LogPickedUp(newPlayer, this, itemPos);
			}
			else
			{
				// Added from somewhere else (storage, vehicle, etc.)
				SST_InventoryEventLogger.LogAdded(newPlayer, this, itemPos);
			}
		}
		// Item transferred between players
		else if (oldPlayer && newPlayer && oldPlayer != newPlayer)
		{
			SST_InventoryDirtyTracker.MarkPlayerDirty(oldPlayer);
			SST_InventoryDirtyTracker.MarkPlayerDirty(newPlayer);

			SST_InventoryEventLogger.LogRemoved(oldPlayer, this, itemPos);
			SST_InventoryEventLogger.LogAdded(newPlayer, this, itemPos);
		}
	}
}
