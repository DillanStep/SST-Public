/**
 * @file SudoServerTools_Init.c
 * @brief Mission-side initialization and scheduled exporters for SST.
 *
 * Contains mission/server lifecycle hooks and scheduled jobs that export server
 * state to JSON under $storage:SST/ for consumption by the SST API/dashboard.
 */

class SST_InventoryExporter
{
	protected static ref SST_InventoryExporter s_Instance;
	protected bool m_Initialized;
	protected int m_ExportRunCount;

	static const float EXPORT_INTERVAL = 30000.0; // 30 seconds in milliseconds
	static const int FORCE_FULL_EXPORT_EVERY = 10; // Refresh all players every 5 minutes
	static string EXPORT_FOLDER = SST_RuntimePaths.INVENTORIES_FOLDER + "/";

	static SST_InventoryExporter GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_InventoryExporter();
		return s_Instance;
	}

	static void Start()
	{
		GetInstance().Init();
	}

	protected void Init()
	{
		if (m_Initialized)
			return;

		m_Initialized = true;
		Print("[SST] InventoryExporter initializing...");

		// Create export directories
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(EXPORT_FOLDER);

		// Initial export after short delay
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ExportAndScheduleNext, 5000, false);
		Print("[SST] Inventory Export scheduled - initial delay 5s, then every 30s");
	}

	void ExportAndScheduleNext()
	{
		ExportAllPlayerInventories();
		// Schedule next export
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ExportAndScheduleNext, EXPORT_INTERVAL, false);
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

	// Get the slot name from slot ID
	static string GetSlotName(int slotId)
	{
		if (slotId < 0)
			return "";
		return InventorySlots.GetSlotName(slotId);
	}

	// Get quantity for any item type (handles magazines differently)
	static float GetItemQuantity(EntityAI item)
	{
		if (!item)
			return 0;

		// Check if it's a magazine (ammo)
		Magazine mag = Magazine.Cast(item);
		if (mag)
			return mag.GetAmmoCount();

		// Regular item quantity
		ItemBase itemBase = ItemBase.Cast(item);
		if (itemBase)
			return itemBase.GetQuantity();

		return 0;
	}

	// Get max quantity for any item type
	static float GetItemQuantityMax(EntityAI item)
	{
		if (!item)
			return 0;

		Magazine mag = Magazine.Cast(item);
		if (mag)
			return mag.GetAmmoMax();

		ItemBase itemBase = ItemBase.Cast(item);
		if (itemBase)
			return itemBase.GetQuantityMax();

		return 0;
	}

	// Convert EntityAI to SST_InventoryItemData (recursive for attachments/cargo)
	static ref SST_InventoryItemData ConvertItemToData(EntityAI item, int slotId = -1)
	{
		if (!item)
			return null;

		ref SST_InventoryItemData itemData = new SST_InventoryItemData();

		// Basic item info
		itemData.className = item.GetType();
		itemData.displayName = item.GetDisplayName();
		itemData.health = item.GetHealth("", "");
		itemData.quantity = GetItemQuantity(item);
		itemData.quantityMax = GetItemQuantityMax(item);
		itemData.slot = slotId;
		itemData.slotName = GetSlotName(slotId);

		// Process attachments
		GameInventory inventory = item.GetInventory();
		if (inventory)
		{
			int attachmentCount = inventory.AttachmentCount();
			for (int i = 0; i < attachmentCount; i++)
			{
				EntityAI attachment = inventory.GetAttachmentFromIndex(i);
				if (attachment)
				{
					// Get the slot this attachment is in
					InventoryLocation loc = new InventoryLocation();
					if (attachment.GetInventory().GetCurrentInventoryLocation(loc))
					{
						ref SST_InventoryItemData attachmentData = ConvertItemToData(attachment, loc.GetSlot());
						if (attachmentData)
							itemData.attachments.Insert(attachmentData);
					}
				}
			}

			// Process cargo
			CargoBase cargo = inventory.GetCargo();
			if (cargo)
			{
				int cargoCount = cargo.GetItemCount();
				for (int j = 0; j < cargoCount; j++)
				{
					EntityAI cargoItem = cargo.GetItem(j);
					if (cargoItem)
					{
						ref SST_InventoryItemData cargoData = ConvertItemToData(cargoItem, -1);
						if (cargoData)
							itemData.cargo.Insert(cargoData);
					}
				}
			}
		}

		return itemData;
	}

	// Export inventory for a single player
	static ref SST_PlayerInventoryData ExportPlayerInventory(Man player)
	{
		if (!player)
			return null;

		PlayerIdentity identity = player.GetIdentity();
		if (!identity)
			return null;

		ref SST_PlayerInventoryData playerData = new SST_PlayerInventoryData();
		playerData.playerName = identity.GetName();
		playerData.playerId = identity.GetPlainId(); // Steam64
		playerData.biId = identity.GetId();          // BI ID

		// Get player's inventory
		GameInventory playerInventory = player.GetInventory();
		if (!playerInventory)
			return playerData;

		// Get all items using EnumerateInventory
		array<EntityAI> allItems = new array<EntityAI>();
		playerInventory.EnumerateInventory(InventoryTraversalType.PREORDER, allItems);

		// We need to track what we've already processed to avoid duplicates
		// EnumerateInventory returns items recursively, but we want top-level items only
		// Then we'll recursively get their attachments/cargo in ConvertItemToData

		// Build an array of items that are children of other items
		ref array<EntityAI> childItems = new array<EntityAI>();

		foreach (EntityAI item : allItems)
		{
			if (!item)
				continue;

			// Skip the player entity itself
			if (item == player)
				continue;

			GameInventory itemInv = item.GetInventory();
			if (itemInv)
			{
				// Mark all attachments as children
				int attCount = itemInv.AttachmentCount();
				for (int a = 0; a < attCount; a++)
				{
					EntityAI att = itemInv.GetAttachmentFromIndex(a);
					if (att)
						childItems.Insert(att);
				}

				// Mark all cargo items as children
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

		// Now process only top-level items (items not marked as children)
		foreach (EntityAI topItem : allItems)
		{
			if (!topItem)
				continue;

			// Skip the player entity
			if (topItem == player)
				continue;

			// Skip items that are children of other items
			if (childItems.Find(topItem) != -1)
				continue;

			// Get the slot ID for this item
			int slotId = -1;
			InventoryLocation itemLoc = new InventoryLocation();
			if (topItem.GetInventory() && topItem.GetInventory().GetCurrentInventoryLocation(itemLoc))
			{
				if (itemLoc.GetType() == InventoryLocationType.ATTACHMENT)
					slotId = itemLoc.GetSlot();
			}

			ref SST_InventoryItemData itemData = ConvertItemToData(topItem, slotId);
			if (itemData)
				playerData.inventory.Insert(itemData);
		}

		return playerData;
	}

	static string BuildItemSignature(SST_InventoryItemData item)
	{
		if (!item)
			return "";

		string signature = item.className + "|" + item.health.ToString() + "|" + item.quantity.ToString() + "|" + item.slot.ToString();

		for (int i = 0; i < item.attachments.Count(); i++)
		{
			signature = signature + "|A:" + BuildItemSignature(item.attachments.Get(i));
		}

		for (int j = 0; j < item.cargo.Count(); j++)
		{
			signature = signature + "|C:" + BuildItemSignature(item.cargo.Get(j));
		}

		return signature;
	}

	static string BuildPlayerInventorySignature(SST_PlayerInventoryData playerData)
	{
		if (!playerData)
			return "";

		string signature = playerData.playerId + "|" + playerData.inventory.Count().ToString();

		for (int i = 0; i < playerData.inventory.Count(); i++)
		{
			signature = signature + "|" + BuildItemSignature(playerData.inventory.Get(i));
		}

		return signature;
	}

	void ExportAllPlayerInventories()
	{
		if (!GetGame() || !GetGame().IsServer())
			return;

		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		m_ExportRunCount++;
		bool forceFullExport = m_ExportRunCount == 1 || (m_ExportRunCount % FORCE_FULL_EXPORT_EVERY) == 0;
		int exportedCount = 0;
		string timestamp = GetUTCTimestamp();

		foreach (Man man : players)
		{
			if (!man)
				continue;

			PlayerIdentity identity = man.GetIdentity();
			if (!identity)
				continue;

			string playerId = identity.GetPlainId();
			if (!forceFullExport && !SST_InventoryDirtyTracker.IsPlayerDirty(playerId))
				continue;

			ref SST_PlayerInventoryData playerInvData = ExportPlayerInventory(man);
			if (playerInvData)
			{
				// Create individual file for each player using their Steam64 ID
				string playerFilePath = EXPORT_FOLDER + playerInvData.playerId + ".json";

				// Wrap in export data structure with timestamp
				ref SST_InventoryExportData exportData = new SST_InventoryExportData();
				exportData.generatedAt = timestamp;
				exportData.playerCount = 1;
				exportData.players.Insert(playerInvData);

				string errorMsg;
				string signature = BuildPlayerInventorySignature(playerInvData);
				if (!SST_PersistenceCore.ShouldWrite(playerFilePath, signature))
				{
					SST_InventoryDirtyTracker.ClearPlayerDirty(playerInvData.playerId);
					continue;
				}

				if (SST_Persistence<SST_InventoryExportData>.SaveJsonIfChanged(playerFilePath, exportData, signature, errorMsg))
				{
					SST_InventoryDirtyTracker.ClearPlayerDirty(playerInvData.playerId);
					exportedCount++;
				}
				else
				{
					Print("[SST] ERROR: Failed to write inventory for " + playerInvData.playerName + ": " + errorMsg);
				}
			}
		}

		if (exportedCount > 0)
			Print("[SST] Inventory Export complete - " + exportedCount.ToString() + " players");
	}
}

// ============================================================================
// Server Item List Exporter - Generates list of all spawnable items
// ============================================================================
class SST_ServerItemListExporter
{
	protected static ref SST_ServerItemListExporter s_Instance;
	static string ITEM_LIST_FILE = SST_RuntimePaths.ApiFile("server_items.json");

	static SST_ServerItemListExporter GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_ServerItemListExporter();
		return s_Instance;
	}

	static void Export()
	{
		GetInstance().ExportItemList();
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

	// Determine item category based on parent classes
	protected string GetItemCategory(string className)
	{
		// Get full inheritance chain for pattern matching
		string inheritanceChain = GetInheritanceChain(className);

		// Check for weapons - look in inheritance chain
		if (inheritanceChain.Contains("Weapon_Base") || inheritanceChain.Contains("Rifle_Base") || inheritanceChain.Contains("Pistol_Base") || inheritanceChain.Contains("Launcher_Base") || inheritanceChain.Contains("BoltActionRifle_Base") || inheritanceChain.Contains("RifleSingleShot_Base") || inheritanceChain.Contains("RifleBoltFree_Base"))
			return "Weapons";

		// Check for magazines
		if (inheritanceChain.Contains("Magazine_Base") || inheritanceChain.Contains("Mag_"))
			return "Magazines";

		// Check for ammunition
		if (inheritanceChain.Contains("Ammunition_Base") || inheritanceChain.Contains("AmmoBox"))
			return "Ammunition";

		// Check for clothing
		if (inheritanceChain.Contains("Clothing_Base"))
			return "Clothing";

		// Check for containers
		if (inheritanceChain.Contains("Container_Base"))
			return "Containers";

		// Check for food
		if (inheritanceChain.Contains("Edible_Base"))
			return "Food";

		// Check for drinks
		if (inheritanceChain.Contains("Bottle_Base"))
			return "Drinks";

		// Check for vehicles
		if (inheritanceChain.Contains("Car") || inheritanceChain.Contains("CarScript") || inheritanceChain.Contains("Boat") || inheritanceChain.Contains("Helicopter"))
			return "Vehicles";

		// Check for general items
		if (inheritanceChain.Contains("InventoryItem") || inheritanceChain.Contains("ItemBase"))
			return "Items";

		return "Other";
	}

	// Get the full inheritance chain as a searchable string
	protected string GetInheritanceChain(string className)
	{
		string chain = className;
		string currentClass = className;
		int maxIterations = 30;

		while (maxIterations > 0)
		{
			string parentPath = "CfgVehicles " + currentClass;
			if (!GetGame().ConfigIsExisting(parentPath))
				break;

			string parentClass;
			GetGame().ConfigGetBaseName(parentPath, parentClass);

			if (parentClass == "" || parentClass == currentClass)
				break;

			chain = chain + "|" + parentClass;
			currentClass = parentClass;
			maxIterations--;
		}

		return chain;
	}

	// Helper to add items from a config path to the item list
	protected void AddItemsFromConfig(string configPath, ref SST_ServerItemList itemList)
	{
		int classCount = GetGame().ConfigGetChildrenCount(configPath);

		for (int i = 0; i < classCount; i++)
		{
			string className;
			GetGame().ConfigGetChildName(configPath, i, className);

			if (className == "")
				continue;

			string fullPath = configPath + " " + className;

			// Skip if not actually a config entry
			if (!GetGame().ConfigIsExisting(fullPath))
				continue;

			// Check scope - must be 2 (public) to be spawnable
			int scope = GetGame().ConfigGetInt(fullPath + " scope");
			if (scope < 2)
				continue;

			// Get display name
			string displayName;
			GetGame().ConfigGetText(fullPath + " displayName", displayName);
			if (displayName == "")
				displayName = className;

			// Skip items with $STR_ prefix that weren't localized (usually internal)
			if (displayName.IndexOf("$STR_") == 0)
				continue;

			// Get parent class for categorization
			string parentClass;
			GetGame().ConfigGetBaseName(fullPath, parentClass);

			// Determine category based on config type
			string category;
			if (configPath == "CfgWeapons")
				category = "Weapons";
			else if (configPath == "CfgMagazines")
				category = "Magazines";
			else if (configPath == "CfgAmmo")
				category = "Ammunition";
			else
				category = GetItemCategory(className);

			// Create item entry
			ref SST_ServerItemEntry entry = new SST_ServerItemEntry();
			entry.className = className;
			entry.displayName = displayName;
			entry.category = category;
			entry.parentClass = parentClass;

			// Check for quantity/stacking
			float quantityMax = GetGame().ConfigGetFloat(fullPath + " varQuantityMax");
			if (quantityMax > 0)
			{
				entry.canBeStacked = true;
				entry.maxQuantity = (int)quantityMax;
			}
			else
			{
				// Check for magazine capacity
				int ammoMax = GetGame().ConfigGetInt(fullPath + " count");
				if (ammoMax > 0)
				{
					entry.canBeStacked = true;
					entry.maxQuantity = ammoMax;
				}
				else
				{
					entry.canBeStacked = false;
					entry.maxQuantity = 1;
				}
			}

			itemList.items.Insert(entry);
		}
	}

	protected void ExportItemList()
	{
		if (!GetGame() || !GetGame().IsServer())
			return;

		Print("[SST] Starting server item list export...");

		// Create directories
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.API_FOLDER);

		ref SST_ServerItemList itemList = new SST_ServerItemList();
		itemList.generatedAt = GetUTCTimestamp();

		// Add items from CfgVehicles (most items, clothing, containers, etc.)
		AddItemsFromConfig("CfgVehicles", itemList);

		// Add items from CfgWeapons (weapons)
		AddItemsFromConfig("CfgWeapons", itemList);

		// Add items from CfgMagazines (magazines and ammo boxes)
		AddItemsFromConfig("CfgMagazines", itemList);

		itemList.itemCount = itemList.items.Count();

		// Save to file
		string errorMsg;
		if (SST_Persistence<SST_ServerItemList>.SaveJson(ITEM_LIST_FILE, itemList, errorMsg))
		{
			Print("[SST] Server item list exported: " + itemList.itemCount.ToString() + " items to " + ITEM_LIST_FILE);
		}
		else
		{
			Print("[SST] ERROR: Failed to save server item list: " + errorMsg);
		}
	}
}

modded class MissionServer
{
	override void OnInit()
	{
		super.OnInit();

		if (GetGame().IsServer())
		{
			Print("[SST] MissionServer.OnInit - Ensuring runtime folders");
			SST_RuntimePaths.EnsureProfileFolders();

			Print("[SST] MissionServer.OnInit - Starting Inventory Exporter");
			SST_InventoryExporter.Start();

			Print("[SST] MissionServer.OnInit - Starting Item Grant API");
			SST_ItemGrantAPI.Start();

			Print("[SST] MissionServer.OnInit - Starting Item Delete API");
			SST_ItemDeleteAPI.Start();

			// Export server item list on startup
			Print("[SST] MissionServer.OnInit - Exporting Server Item List");
			SST_ServerItemListExporter.Export();

			// Start online player tracker
			Print("[SST] MissionServer.OnInit - Starting Online Player Tracker");
			SST_OnlinePlayerTracker.Start();

			// Start player commands API (heal, teleport)
			Print("[SST] MissionServer.OnInit - Starting Player Commands API");
			SST_PlayerCommands.Start();

			#ifdef EXPANSIONMODVEHICLE
			// Start vehicle tracker
			Print("[SST] MissionServer.OnInit - Starting Vehicle Tracker");
			SST_VehicleTracker.StartTracking();
			#endif
		}
	}

	// Called when player connects/reconnects to server
	override void InvokeOnConnect(PlayerBase player, PlayerIdentity identity)
	{
		super.InvokeOnConnect(player, identity);

		if (GetGame().IsServer() && player)
		{
			SST_PlayerLifeEventLogger.LogConnect(player);
			SST_InventoryDirtyTracker.MarkPlayerDirty(player);
			SST_OnlinePlayerTracker.GetInstance().PlayerConnected(player);
		}
	}

	// Called when player disconnects
	override void InvokeOnDisconnect(PlayerBase player)
	{
		// Log disconnect before super (which may clean up player)
		if (GetGame().IsServer() && player)
		{
			SST_PlayerLifeEventLogger.LogDisconnect(player);
			SST_OnlinePlayerTracker.GetInstance().PlayerDisconnected(player);
		}

		super.InvokeOnDisconnect(player);
	}
}

// ============================================================================
// Online Player Tracker - Tracks online players and their locations
// ============================================================================
class SST_OnlinePlayerTracker
{
	protected static ref SST_OnlinePlayerTracker s_Instance;
	protected bool m_Initialized;
	protected ref map<string, ref SST_OnlinePlayerData> m_OnlinePlayers;

	static const float UPDATE_INTERVAL = 10000.0; // 10 seconds
	static string ONLINE_PLAYERS_FILE = SST_RuntimePaths.ApiFile("online_players.json");

	static SST_OnlinePlayerTracker GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_OnlinePlayerTracker();
		return s_Instance;
	}

	static void Start()
	{
		GetInstance().Init();
	}

	protected void Init()
	{
		if (m_Initialized)
			return;

		m_Initialized = true;
		m_OnlinePlayers = new map<string, ref SST_OnlinePlayerData>();

		Print("[SST] OnlinePlayerTracker initializing...");

		// Create directories
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.API_FOLDER);

		// Start update loop
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(UpdateAndScheduleNext, 2000, false);
		Print("[SST] Online Player Tracker started - updating every 10 seconds");
	}

	void UpdateAndScheduleNext()
	{
		UpdateAllPlayerData();
		ExportOnlinePlayers();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(UpdateAndScheduleNext, UPDATE_INTERVAL, false);
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

	void PlayerConnected(PlayerBase player)
	{
		if (!player)
			return;

		PlayerIdentity identity = player.GetIdentity();
		if (!identity)
			return;

		string playerId = identity.GetPlainId();
		string timestamp = GetUTCTimestamp();

		ref SST_OnlinePlayerData playerData;

		// Check if player already exists (reconnecting)
		if (m_OnlinePlayers.Contains(playerId))
		{
			playerData = m_OnlinePlayers.Get(playerId);
		}
		else
		{
			playerData = new SST_OnlinePlayerData();
			playerData.playerId = playerId;
			m_OnlinePlayers.Insert(playerId, playerData);
		}

		playerData.playerName = identity.GetName();
		playerData.biId = identity.GetId();
		playerData.isOnline = true;
		playerData.connectedAt = timestamp;
		playerData.lastUpdate = timestamp;

		// Initial position and status update
		UpdatePlayerData(player, playerData);

		Print("[SST] Player connected: " + playerData.playerName + " (" + playerId + ")");
	}

	void PlayerDisconnected(PlayerBase player)
	{
		if (!player)
			return;

		PlayerIdentity identity = player.GetIdentity();
		if (!identity)
			return;

		string playerId = identity.GetPlainId();

		if (m_OnlinePlayers.Contains(playerId))
		{
			ref SST_OnlinePlayerData playerData = m_OnlinePlayers.Get(playerId);
			playerData.isOnline = false;
			playerData.lastUpdate = GetUTCTimestamp();

			Print("[SST] Player disconnected: " + playerData.playerName + " (" + playerId + ")");
		}
	}

	protected void UpdatePlayerData(PlayerBase player, SST_OnlinePlayerData playerData)
	{
		if (!player || !playerData)
			return;

		// Get position
		vector pos = player.GetPosition();
		playerData.posX = pos[0];
		playerData.posY = pos[1];
		playerData.posZ = pos[2];

		// Get health and status
		playerData.health = player.GetHealth("GlobalHealth", "Health");
		playerData.blood = player.GetHealth("GlobalHealth", "Blood");
		playerData.isAlive = player.IsAlive();
		playerData.isUnconscious = player.IsUnconscious();

		// Get water and energy levels using modifiers
		float waterVal = 0;
		float energyVal = 0;

		if (player.GetStatWater())
			waterVal = player.GetStatWater().Get();
		if (player.GetStatEnergy())
			energyVal = player.GetStatEnergy().Get();

		// Convert to percentage (max water = 5000, max energy = 20000)
		playerData.water = (waterVal / 5000.0) * 100.0;
		playerData.energy = (energyVal / 20000.0) * 100.0;

		playerData.lastUpdate = GetUTCTimestamp();
	}

	protected void UpdateAllPlayerData()
	{
		if (!GetGame() || !GetGame().IsServer())
			return;

		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		// Update existing online players
		foreach (Man man : players)
		{
			PlayerBase player = PlayerBase.Cast(man);
			if (!player)
				continue;

			PlayerIdentity identity = player.GetIdentity();
			if (!identity)
				continue;

			string playerId = identity.GetPlainId();

			if (m_OnlinePlayers.Contains(playerId))
			{
				ref SST_OnlinePlayerData playerData = m_OnlinePlayers.Get(playerId);
				if (playerData.isOnline)
				{
					UpdatePlayerData(player, playerData);
				}
			}
			else
			{
				// Player exists but not in our map (edge case - add them)
				PlayerConnected(player);
			}
		}
	}

	protected void ExportOnlinePlayers()
	{
		ref SST_OnlinePlayersData exportData = new SST_OnlinePlayersData();
		exportData.generatedAt = GetUTCTimestamp();
		exportData.modVersion = SST_ModInfo.VERSION;
		exportData.protocolVersion = SST_ModInfo.PROTOCOL_VERSION;

		int onlineCount = 0;

		// Export all tracked players
		for (int i = 0; i < m_OnlinePlayers.Count(); i++)
		{
			ref SST_OnlinePlayerData playerData = m_OnlinePlayers.GetElement(i);
			if (playerData)
			{
				exportData.players.Insert(playerData);
				if (playerData.isOnline)
					onlineCount++;
			}
		}

		exportData.onlineCount = onlineCount;

		string errorMsg;
		if (!SST_Persistence<SST_OnlinePlayersData>.SaveJson(ONLINE_PLAYERS_FILE, exportData, errorMsg))
		{
			Print("[SST] ERROR: Failed to save online players: " + errorMsg);
		}
	}

	// Clean up disconnected players after 24 hours (optional maintenance)
	void CleanupOldDisconnectedPlayers()
	{
		// This could be called periodically to remove very old disconnected player entries
		// For now, we keep all players to maintain history
	}
}
