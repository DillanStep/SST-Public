/**
 * @file SST_VehicleTracker.c
 * @brief Vehicle purchase tracking and key management (Expansion Vehicles).
 *
 * Tracks Expansion vehicle purchases, periodically records last known positions,
 * and processes API-driven requests for key generation and vehicle deletion.
 *
 * This file is only compiled when Expansion Vehicles are present.
 */

#ifdef EXPANSIONMODVEHICLE

// ----------------------------------------------------------------------------
// JSON-serializable data models (written under $profile:SST)
// ----------------------------------------------------------------------------

class SST_VehicleKeyData
{
	int persistentIdA;
	int persistentIdB;
	int persistentIdC;
	int persistentIdD;
	
	string GetPersistentIdString()
	{
		return string.Format("%1-%2-%3-%4", persistentIdA, persistentIdB, persistentIdC, persistentIdD);
	}
}

class SST_VehiclePurchaseData
{
	string timestamp;
	string vehicleClassName;
	string vehicleDisplayName;
	string ownerId;           // Steam64 ID of purchaser
	string ownerName;         // Name of purchaser
	string keyClassName;      // Type of key given
	ref SST_VehicleKeyData keyData;  // Key pairing info
	int purchasePrice;
	string traderName;
	string traderZone;
	vector purchasePosition;  // Where vehicle was spawned
}

class SST_TrackedVehicle
{
	string vehicleId;         // Unique identifier (persistent ID string)
	string vehicleClassName;
	string vehicleDisplayName;
	string ownerId;
	string ownerName;
	string keyClassName;      // Key type used for this vehicle
	vector lastPosition;
	string lastUpdateTime;
	bool isDestroyed;
	ref SST_VehicleKeyData keyData;
	ref array<ref SST_VehicleKeyData> additionalKeys;  // If extra keys were made
	string purchaseTimestamp;
	int purchasePrice;
	string traderName;
	string traderZone;
}

class SST_KeyGenerationRequest
{
	string requestId;
	string playerId;          // Steam64 ID to give key to
	string vehicleId;         // Vehicle persistent ID string
	string keyClassName;      // Type of key to create (e.g., "ExpansionCarKey")
	bool isMasterKey;         // Create as master key?
	string status;            // pending, completed, failed
	string result;            // Result message
}

class SST_KeyGenerationQueue
{
	ref array<ref SST_KeyGenerationRequest> requests = new array<ref SST_KeyGenerationRequest>();
}

class SST_VehicleDeleteRequest
{
	string requestId;
	string vehicleId;         // Vehicle persistent ID string
	string vehicleClassName;
	string vehicleDisplayName;
	string status;            // pending, completed, failed
	string result;            // Result message
	string requestedAt;
}

class SST_VehicleDeleteQueue
{
	ref array<ref SST_VehicleDeleteRequest> requests = new array<ref SST_VehicleDeleteRequest>();
}

// ----------------------------------------------------------------------------
// Runtime service: keeps in-memory state, writes JSON, and executes requests
// ----------------------------------------------------------------------------
class SST_VehicleTracker
{
	protected static ref SST_VehicleTracker s_Instance;
	
	static string VEHICLES_FOLDER = SST_RuntimePaths.VEHICLES_FOLDER + "/";
	static string PURCHASES_FILE = SST_RuntimePaths.VehicleFile("purchases.json");
	static string TRACKED_FILE = SST_RuntimePaths.VehicleFile("tracked.json");
	static string KEY_QUEUE_FILE = SST_RuntimePaths.ApiFile("key_grants.json");
	static string KEY_RESULTS_FILE = SST_RuntimePaths.ApiFile("key_grants_results.json");
	static string DELETE_QUEUE_FILE = SST_RuntimePaths.ApiFile("vehicle_delete.json");
	static string DELETE_RESULTS_FILE = SST_RuntimePaths.ApiFile("vehicle_delete_results.json");
	
	protected ref map<string, ref SST_TrackedVehicle> m_TrackedVehicles;
	protected ref map<string, EntityAI> m_TrackedVehicleEntities;
	protected ref array<ref SST_VehiclePurchaseData> m_Purchases;
	protected bool m_Scheduled;
	
	static const float POSITION_UPDATE_INTERVAL_MS = 60000.0;  // Update positions every 60 seconds
	static const float KEY_CHECK_INTERVAL_MS = 5000.0;         // Check for key/delete requests every 5 seconds
	static const float WORLD_SCAN_MAX_XZ = 20000.0;            // Covers bundled map presets, including Deer Isle.
	
	void SST_VehicleTracker()
	{
		m_TrackedVehicles = new map<string, ref SST_TrackedVehicle>();
		m_TrackedVehicleEntities = new map<string, EntityAI>();
		m_Purchases = new array<ref SST_VehiclePurchaseData>();
		m_Scheduled = false;
		
		// Create folders
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(VEHICLES_FOLDER);
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.API_FOLDER);
			
		// Load existing data
		LoadTrackedVehicles();
	}
	
	static SST_VehicleTracker GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_VehicleTracker();
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

	void Start()
	{
		if (m_Scheduled)
			return;

		m_Scheduled = true;
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(UpdateVehiclePositionsAndSchedule, POSITION_UPDATE_INTERVAL_MS, false);
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessRequestsAndSchedule, KEY_CHECK_INTERVAL_MS, false);
	}

	protected void UpdateVehiclePositionsAndSchedule()
	{
		UpdateVehiclePositions();

		if (m_Scheduled)
			GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(UpdateVehiclePositionsAndSchedule, POSITION_UPDATE_INTERVAL_MS, false);
	}

	protected void ProcessRequestsAndSchedule()
	{
		ProcessKeyRequests();
		ProcessDeleteRequests();

		if (m_Scheduled)
			GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessRequestsAndSchedule, KEY_CHECK_INTERVAL_MS, false);
	}

	protected string GetVehicleIdFromEntity(EntityAI entity)
	{
		if (!entity)
			return "";

		ExpansionVehicle vehicle = ExpansionVehicle.Get(entity);
		if (!vehicle || !vehicle.HasKey())
			return "";

		int a, b, c, d;
		vehicle.GetMasterKeyPersistentID(a, b, c, d);
		return string.Format("%1-%2-%3-%4", a, b, c, d);
	}

	protected void CacheVehicleEntity(string vehicleId, EntityAI entity)
	{
		if (vehicleId == "" || !entity)
			return;

		m_TrackedVehicleEntities.Set(vehicleId, entity);
	}

	protected EntityAI GetCachedVehicleEntity(string vehicleId)
	{
		if (!m_TrackedVehicleEntities.Contains(vehicleId))
			return null;

		EntityAI entity = m_TrackedVehicleEntities.Get(vehicleId);
		if (!entity)
		{
			m_TrackedVehicleEntities.Remove(vehicleId);
			return null;
		}

		ExpansionVehicle vehicle = ExpansionVehicle.Get(entity);
		if (!vehicle || !vehicle.HasKey())
		{
			m_TrackedVehicleEntities.Remove(vehicleId);
			return null;
		}

		return entity;
	}

	protected bool ApplyVehicleSnapshot(string vehicleId, EntityAI entity)
	{
		if (!entity)
			return false;

		SST_TrackedVehicle tracked = m_TrackedVehicles.Get(vehicleId);
		if (!tracked)
			return false;

		CacheVehicleEntity(vehicleId, entity);

		vector position = entity.GetPosition();
		bool isDestroyed = entity.IsRuined();
		if (tracked.lastPosition == position && tracked.isDestroyed == isDestroyed)
			return false;

		tracked.lastPosition = position;
		tracked.lastUpdateTime = GetUTCTimestamp();
		tracked.isDestroyed = isDestroyed;
		return true;
	}
	
	// Called when a vehicle is purchased with a key
	void OnVehiclePurchased(PlayerBase player, EntityAI vehicleEntity, ExpansionCarKey key, string keyClassName, int price, string traderName, string traderZone)
	{
		if (!GetGame().IsServer() || !player || !vehicleEntity || !key)
			return;
			
		PlayerIdentity identity = player.GetIdentity();
		if (!identity)
			return;
		
		ExpansionVehicle vehicle = ExpansionVehicle.Get(vehicleEntity);
		if (!vehicle)
			return;
		
		// Get key pairing data
		ref SST_VehicleKeyData keyData = new SST_VehicleKeyData();
		key.GetMasterKeyPersistentID(keyData.persistentIdA, keyData.persistentIdB, keyData.persistentIdC, keyData.persistentIdD);
		
		string vehicleId = keyData.GetPersistentIdString();
		
		// Create purchase record
		ref SST_VehiclePurchaseData purchase = new SST_VehiclePurchaseData();
		purchase.timestamp = GetUTCTimestamp();
		purchase.vehicleClassName = vehicleEntity.GetType();
		purchase.vehicleDisplayName = vehicleEntity.GetDisplayName();
		purchase.ownerId = identity.GetPlainId();
		purchase.ownerName = identity.GetName();
		purchase.keyClassName = keyClassName;
		purchase.keyData = keyData;
		purchase.purchasePrice = price;
		purchase.traderName = traderName;
		purchase.traderZone = traderZone;
		purchase.purchasePosition = vehicleEntity.GetPosition();
		
		m_Purchases.Insert(purchase);
		SavePurchases();
		
		// Track the vehicle
		ref SST_TrackedVehicle tracked = new SST_TrackedVehicle();
		tracked.vehicleId = vehicleId;
		tracked.vehicleClassName = vehicleEntity.GetType();
		tracked.vehicleDisplayName = vehicleEntity.GetDisplayName();
		tracked.ownerId = identity.GetPlainId();
		tracked.ownerName = identity.GetName();
		tracked.keyClassName = keyClassName;
		tracked.lastPosition = vehicleEntity.GetPosition();
		tracked.lastUpdateTime = GetUTCTimestamp();
		tracked.isDestroyed = false;
		tracked.keyData = keyData;
		tracked.additionalKeys = new array<ref SST_VehicleKeyData>();
		tracked.purchaseTimestamp = purchase.timestamp;
		tracked.purchasePrice = price;
		tracked.traderName = traderName;
		tracked.traderZone = traderZone;
		
		m_TrackedVehicles.Set(vehicleId, tracked);
		CacheVehicleEntity(vehicleId, vehicleEntity);
		SaveTrackedVehicles();
		
		Print("[SST] Vehicle purchased and tracked: " + vehicleEntity.GetType() + " by " + identity.GetName() + " (ID: " + vehicleId + ")");
	}
	
	// Update positions of all tracked vehicles
	void UpdateVehiclePositions()
	{
		if (!GetGame().IsServer())
			return;
		
		if (m_TrackedVehicles.Count() == 0)
			return;
			
		bool needsSave = false;
		bool needsWorldScan = false;

		for (int i = 0; i < m_TrackedVehicles.Count(); i++)
		{
			string trackedVehicleId = m_TrackedVehicles.GetKey(i);
			EntityAI cachedEntity = GetCachedVehicleEntity(trackedVehicleId);
			if (cachedEntity)
			{
				if (ApplyVehicleSnapshot(trackedVehicleId, cachedEntity))
					needsSave = true;
			}
			else
			{
				needsWorldScan = true;
			}
		}

		if (!needsWorldScan)
		{
			if (needsSave)
				SaveTrackedVehicles();
			return;
		}

		// Fallback scan only runs for uncached tracked vehicles, mostly after a restart.
		vector minPos = "-100 -100 -100";
		vector maxPos = Vector(WORLD_SCAN_MAX_XZ, 1000, WORLD_SCAN_MAX_XZ);
		
		array<EntityAI> entities = new array<EntityAI>();
		DayZPlayerUtils.SceneGetEntitiesInBox(minPos, maxPos, entities, QueryFlags.DYNAMIC);
		
		foreach (EntityAI entity : entities)
		{
			if (!entity)
				continue;
			
			string vehicleId = GetVehicleIdFromEntity(entity);
			if (vehicleId == "")
				continue;
			
			if (m_TrackedVehicles.Contains(vehicleId) && ApplyVehicleSnapshot(vehicleId, entity))
				needsSave = true;
		}
		
		if (needsSave)
			SaveTrackedVehicles();
	}
	
	// Check for key generation requests from API
	void ProcessKeyRequests()
	{
		if (!GetGame().IsServer())
			return;
			
		if (!SST_PersistenceCore.FileExists(KEY_QUEUE_FILE))
			return;
			
		// Load queue
		string errorMsg;
		ref SST_KeyGenerationQueue queue = new SST_KeyGenerationQueue();
		if (!SST_Persistence<SST_KeyGenerationQueue>.LoadJson(KEY_QUEUE_FILE, queue, errorMsg))
			return;
			
		if (queue.requests.Count() == 0)
			return;
			
		// Process each request
		foreach (SST_KeyGenerationRequest request : queue.requests)
		{
			if (request.status != "pending")
				continue;
				
			ProcessSingleKeyRequest(request);
		}
		
		// Save results and clear queue
		SaveKeyResults(queue);
		
		// Clear the queue
		ref SST_KeyGenerationQueue emptyQueue = new SST_KeyGenerationQueue();
		SST_Persistence<SST_KeyGenerationQueue>.SaveJson(KEY_QUEUE_FILE, emptyQueue, errorMsg);
	}
	
	protected void ProcessSingleKeyRequest(SST_KeyGenerationRequest request)
	{
		Print("[SST] Processing key request: " + request.requestId + " for vehicle " + request.vehicleId);
		
		// Find the target player
		PlayerBase targetPlayer = FindPlayerById(request.playerId);
		if (!targetPlayer)
		{
			request.status = "failed";
			request.result = "Player not online";
			Print("[SST] Key request FAILED: Player " + request.playerId + " not online");
			return;
		}
		
		// Find the vehicle
		ExpansionVehicle vehicle = FindVehicleById(request.vehicleId);
		if (!vehicle)
		{
			request.status = "failed";
			request.result = "Vehicle not found in world";
			Print("[SST] Key request FAILED: Vehicle " + request.vehicleId + " not found");
			return;
		}
		
		// Create the key
		string keyClass = request.keyClassName;
		if (keyClass == "")
			keyClass = "ExpansionCarKey";  // Default key type
			
		ItemBase keyItem = ItemBase.Cast(targetPlayer.GetInventory().CreateInInventory(keyClass));
		if (!keyItem)
		{
			// Try spawning on ground near player
			vector pos = targetPlayer.GetPosition();
			keyItem = ItemBase.Cast(GetGame().CreateObjectEx(keyClass, pos, ECE_PLACE_ON_SURFACE));
		}
		
		if (!keyItem)
		{
			request.status = "failed";
			request.result = "Could not create key item";
			Print("[SST] Key request FAILED: Could not spawn key " + keyClass);
			return;
		}
		
		ExpansionCarKey key = ExpansionCarKey.Cast(keyItem);
		if (!key)
		{
			keyItem.Delete();
			request.status = "failed";
			request.result = "Item is not a valid car key";
			Print("[SST] Key request FAILED: " + keyClass + " is not a car key");
			return;
		}
		
		// Pair the key to the vehicle
		vehicle.PairKey(key);
		
		if (request.isMasterKey)
		{
			key.SetMaster(true);
			key.SetMasterUses(GetExpansionSettings().GetVehicle().MasterKeyUses);
		}
		
		request.status = "completed";
		request.result = "Key created and paired to vehicle";
		
		// Track the additional key
		SST_TrackedVehicle tracked = m_TrackedVehicles.Get(request.vehicleId);
		if (tracked)
		{
			ref SST_VehicleKeyData newKeyData = new SST_VehicleKeyData();
			key.GetMasterKeyPersistentID(newKeyData.persistentIdA, newKeyData.persistentIdB, newKeyData.persistentIdC, newKeyData.persistentIdD);
			tracked.additionalKeys.Insert(newKeyData);
			SaveTrackedVehicles();
		}
		
		Print("[SST] Key request SUCCESS: " + keyClass + " given to " + targetPlayer.GetIdentity().GetName());
	}
	
	// Parse a vehicle ID string that may contain negative numbers
	// Format: "A-B-C-D" where any value can be negative (e.g., "123-456-789--123" where last is -123)
	protected bool ParseVehicleId(string vehicleId, out int a, out int b, out int c, out int d)
	{
		a = 0; b = 0; c = 0; d = 0;
		
		// Find positions of separators by tracking sign and digits
		int len = vehicleId.Length();
		int partIndex = 0;
		string currentPart = "";
		array<int> values = new array<int>();
		
		for (int i = 0; i <= len; i++)
		{
			string ch = "";
			if (i < len)
				ch = vehicleId.Get(i);
			
			// Check if this is a separator (dash followed by digit or end of string)
			bool isSeparator = false;
			if (ch == "-" && i > 0)
			{
				// It's a separator if the previous char was a digit and next is also a digit
				string prevCh = vehicleId.Get(i - 1);
				string nextCh = "";
				if (i + 1 < len)
					nextCh = vehicleId.Get(i + 1);
				
				// Separator if previous is digit and (next is digit or next is minus for negative)
				if (prevCh >= "0" && prevCh <= "9")
				{
					if ((nextCh >= "0" && nextCh <= "9") || nextCh == "-")
						isSeparator = true;
				}
			}
			
			if (isSeparator || i == len)
			{
				if (currentPart != "")
				{
					values.Insert(currentPart.ToInt());
					currentPart = "";
				}
			}
			else
			{
				currentPart += ch;
			}
		}
		
		if (values.Count() != 4)
			return false;
		
		a = values[0];
		b = values[1];
		c = values[2];
		d = values[3];
		return true;
	}
	
	protected PlayerBase FindPlayerById(string playerId)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);
		
		foreach (Man man : players)
		{
			PlayerBase pb = PlayerBase.Cast(man);
			if (pb && pb.GetIdentity() && pb.GetIdentity().GetPlainId() == playerId)
				return pb;
		}
		
		return null;
	}
	
	protected ExpansionVehicle FindVehicleById(string vehicleId)
	{
		EntityAI cachedEntity = GetCachedVehicleEntity(vehicleId);
		if (cachedEntity)
		{
			ExpansionVehicle cachedVehicle = ExpansionVehicle.Get(cachedEntity);
			if (cachedVehicle)
				return cachedVehicle;
		}

		// Parse the vehicle ID - handles negative numbers
		// Format: A-B-C-D where any value can be negative (e.g., "123-456-789--123" means D=-123)
		int a, b, c, d;
		if (!ParseVehicleId(vehicleId, a, b, c, d))
			return null;
		
		// Use DayZPlayerUtils to get entities in a large box covering the map
		vector minPos = "-100 -100 -100";
		vector maxPos = Vector(WORLD_SCAN_MAX_XZ, 1000, WORLD_SCAN_MAX_XZ);
		
		array<EntityAI> entities = new array<EntityAI>();
		DayZPlayerUtils.SceneGetEntitiesInBox(minPos, maxPos, entities, QueryFlags.DYNAMIC);
		
		foreach (EntityAI entity : entities)
		{
			if (!entity)
				continue;
			
			ExpansionVehicle vehicle = ExpansionVehicle.Get(entity);
			if (!vehicle || !vehicle.HasKey())
				continue;
			
			int va, vb, vc, vd;
			vehicle.GetMasterKeyPersistentID(va, vb, vc, vd);
			
			if (va == a && vb == b && vc == c && vd == d)
			{
				CacheVehicleEntity(vehicleId, entity);
				return vehicle;
			}
		}
		
		return null;
	}
	
	protected void SaveKeyResults(SST_KeyGenerationQueue queue)
	{
		string errorMsg;
		// Append results to results file
		ref SST_KeyGenerationQueue existingResults = new SST_KeyGenerationQueue();
		if (SST_PersistenceCore.FileExists(KEY_RESULTS_FILE))
			SST_Persistence<SST_KeyGenerationQueue>.LoadJson(KEY_RESULTS_FILE, existingResults, errorMsg);
		
		foreach (SST_KeyGenerationRequest request : queue.requests)
		{
			existingResults.requests.Insert(request);
		}
		
		// Keep only last 100 results
		while (existingResults.requests.Count() > 100)
			existingResults.requests.Remove(0);
			
		SST_Persistence<SST_KeyGenerationQueue>.SaveJson(KEY_RESULTS_FILE, existingResults, errorMsg);
	}
	
	// ============================================================================
	// Vehicle Deletion System
	// ============================================================================
	
	void ProcessDeleteRequests()
	{
		if (!SST_PersistenceCore.FileExists(DELETE_QUEUE_FILE))
			return;
			
		string errorMsg;
		ref SST_VehicleDeleteQueue queue = new SST_VehicleDeleteQueue();
		if (!SST_Persistence<SST_VehicleDeleteQueue>.LoadJson(DELETE_QUEUE_FILE, queue, errorMsg))
			return;
			
		if (queue.requests.Count() == 0)
			return;
			
		// Process each request
		foreach (SST_VehicleDeleteRequest request : queue.requests)
		{
			if (request.status != "pending")
				continue;
				
			ProcessSingleDeleteRequest(request);
		}
		
		// Save results and clear queue
		SaveDeleteResults(queue);
		
		// Clear the queue
		ref SST_VehicleDeleteQueue emptyQueue = new SST_VehicleDeleteQueue();
		SST_Persistence<SST_VehicleDeleteQueue>.SaveJson(DELETE_QUEUE_FILE, emptyQueue, errorMsg);
	}
	
	protected void ProcessSingleDeleteRequest(SST_VehicleDeleteRequest request)
	{
		Print("[SST] Processing delete request: " + request.requestId + " for vehicle " + request.vehicleId);
		
		bool wasTracked = m_TrackedVehicles.Contains(request.vehicleId);
		bool vehicleDestroyed = false;
		string vehicleName = request.vehicleClassName;
		vector vehiclePos = "0 0 0";
		
		// Try to find and destroy the vehicle in the world
		ExpansionVehicle vehicle = FindVehicleById(request.vehicleId);
		if (vehicle)
		{
			EntityAI vehicleEntity = vehicle.GetEntity();
			if (vehicleEntity)
			{
				vehicleName = vehicleEntity.GetDisplayName();
				vehiclePos = vehicleEntity.GetPosition();
				
				// Delete the vehicle from the game world
				GetGame().ObjectDelete(vehicleEntity);
				vehicleDestroyed = true;
				Print("[SST] Vehicle destroyed in world: " + vehicleName + " at " + vehiclePos.ToString());
			}
		}
		
		// Always remove from tracked vehicles (whether or not vehicle was found in world) I plan on changing this to scan the entire world. I cant find a safe way of doing it without the server throwing a fit.
		if (wasTracked)
		{
			m_TrackedVehicles.Remove(request.vehicleId);
			if (m_TrackedVehicleEntities.Contains(request.vehicleId))
				m_TrackedVehicleEntities.Remove(request.vehicleId);
			SaveTrackedVehicles();
			Print("[SST] Removed from tracking: " + request.vehicleId);
		}
		
		// Set result status
		if (vehicleDestroyed && wasTracked)
		{
			request.status = "completed";
			request.result = "Vehicle destroyed and removed from tracking";
		}
		else if (vehicleDestroyed && !wasTracked)
		{
			request.status = "completed";
			request.result = "Vehicle destroyed (was not tracked)";
		}
		else if (!vehicleDestroyed && wasTracked)
		{
			request.status = "completed";
			request.result = "Vehicle not found in world (already despawned) - removed from tracking";
		}
		else
		{
			request.status = "failed";
			request.result = "Vehicle not found in world or tracking";
		}
		
		Print("[SST] Delete request " + request.status + ": " + request.result);
	}
	
	protected void SaveDeleteResults(SST_VehicleDeleteQueue queue)
	{
		string errorMsg;
		// Append results to results file
		ref SST_VehicleDeleteQueue existingResults = new SST_VehicleDeleteQueue();
		if (SST_PersistenceCore.FileExists(DELETE_RESULTS_FILE))
			SST_Persistence<SST_VehicleDeleteQueue>.LoadJson(DELETE_RESULTS_FILE, existingResults, errorMsg);
		
		foreach (SST_VehicleDeleteRequest request : queue.requests)
		{
			existingResults.requests.Insert(request);
		}
		
		// Keep only last 100 results - Page pagination needs to be fixed on the web client before i change this
		while (existingResults.requests.Count() > 100)
			existingResults.requests.Remove(0);
			
		SST_Persistence<SST_VehicleDeleteQueue>.SaveJson(DELETE_RESULTS_FILE, existingResults, errorMsg);
	}
	
	void SavePurchases()
	{
		string errorMsg;
		// Create wrapper object
		ref array<ref SST_VehiclePurchaseData> purchases = m_Purchases;
		SST_Persistence<array<ref SST_VehiclePurchaseData>>.SaveJson(PURCHASES_FILE, purchases, errorMsg);
	}
	
	void SaveTrackedVehicles()
	{
		string errorMsg;
		// Convert map to array for JSON
		ref array<ref SST_TrackedVehicle> vehicles = new array<ref SST_TrackedVehicle>();
		
		for (int i = 0; i < m_TrackedVehicles.Count(); i++)
		{
			vehicles.Insert(m_TrackedVehicles.GetElement(i));
		}
		
		SST_Persistence<array<ref SST_TrackedVehicle>>.SaveJson(TRACKED_FILE, vehicles, errorMsg);
	}
	
	void LoadTrackedVehicles()
	{
		if (!SST_PersistenceCore.FileExists(TRACKED_FILE))
			return;
		
		string errorMsg;
		ref array<ref SST_TrackedVehicle> vehicles = new array<ref SST_TrackedVehicle>();
		if (SST_Persistence<array<ref SST_TrackedVehicle>>.LoadJson(TRACKED_FILE, vehicles, errorMsg))
		{
			foreach (SST_TrackedVehicle vehicle : vehicles)
			{
				m_TrackedVehicles.Set(vehicle.vehicleId, vehicle);
			}
			Print("[SST] Loaded " + vehicles.Count() + " tracked vehicles");
		}
	}
	
	// Static helper to log purchase
	static void LogVehiclePurchase(PlayerBase player, EntityAI vehicleEntity, ExpansionCarKey key, string keyClassName, int price, string traderName, string traderZone)
	{
		GetInstance().OnVehiclePurchased(player, vehicleEntity, key, keyClassName, price, traderName, traderZone);
	}

	static void StartTracking()
	{
		GetInstance().Start();
	}
	
	// Static helper to check if a vehicle is already tracked
	static bool IsVehicleTracked(string vehicleId)
	{
		SST_VehicleTracker tracker = GetInstance();
		if (!tracker)
			return false;
		
		return tracker.m_TrackedVehicles.Contains(vehicleId);
	}
}

#endif
