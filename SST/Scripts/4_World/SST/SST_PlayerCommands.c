/**
 * @file SST_PlayerCommands.c
 * @brief Processes admin-initiated player commands from the SST API queue.
 *
 * Reads queued commands (heal, teleport, direct message, broadcast) from JSON,
 * executes them on the server, and writes results back to the results file.
 *
 * Queue file:   $storage:SST/api/player_commands.json
 * Results file: $storage:SST/api/player_commands_results.json
 */

// ============================================================================
// Data Types for Player Commands
// ============================================================================

// ----------------------------------------------------------------------------
// Command payload format (from API)
// ----------------------------------------------------------------------------
class SST_PlayerCommandRequest
{
	string playerId;
	string commandType;  // "heal", "teleport", "message", or "broadcast"
	float value;         // For heal: health amount (0-100). For teleport: not used
	float posX;          // For teleport: destination X
	float posY;          // For teleport: destination Y (height)
	float posZ;          // For teleport: destination Z
	string message;      // For message/broadcast: the text to display
	string messageType;  // For message: "notification", "chat", or "both"
	bool processed;
	string result;
}

// Simple queue wrapper for JSON load/save.
class SST_PlayerCommandQueue
{
	ref array<ref SST_PlayerCommandRequest> requests = new array<ref SST_PlayerCommandRequest>();
}

// ============================================================================
// Player Commands API - Executes queued admin actions
// ============================================================================
class SST_PlayerCommands
{
	protected static ref SST_PlayerCommands s_Instance;
	static string COMMAND_QUEUE_FILE = SST_RuntimePaths.ApiFile("player_commands.json");
	static string COMMAND_RESULTS_FILE = SST_RuntimePaths.ApiFile("player_commands_results.json");
	static const float CHECK_INTERVAL = 2000.0; // Check every 2 seconds for faster response
	
	void SST_PlayerCommands()
	{
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.API_FOLDER);
	}
	
	static SST_PlayerCommands GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_PlayerCommands();
		return s_Instance;
	}
	
	static void Start()
	{
		GetInstance().Init();
	}
	
	protected void Init()
	{
		Print("[SST] Player Commands API initialized - checking " + COMMAND_QUEUE_FILE + " every 2 seconds");
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessCommandsAndSchedule, 2000, false);
	}
	
	void ProcessCommandsAndSchedule()
	{
		ProcessPendingCommands();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessCommandsAndSchedule, CHECK_INTERVAL, false);
	}
	
	void ProcessPendingCommands()
	{
		if (!GetGame().IsServer())
			return;
		
		if (!SST_PersistenceCore.FileExists(COMMAND_QUEUE_FILE))
			return;
		
		ref SST_PlayerCommandQueue commandQueue;
		string errorMsg;
		
		if (!SST_Persistence<SST_PlayerCommandQueue>.LoadJson(COMMAND_QUEUE_FILE, commandQueue, errorMsg))
		{
			Print("[SST] ERROR: Failed to load command queue: " + errorMsg);
			return;
		}
		
		if (!commandQueue || commandQueue.requests.Count() == 0)
			return;
		
		bool hasChanges = false;
		
		foreach (SST_PlayerCommandRequest request : commandQueue.requests)
		{
			if (request.processed)
				continue;
			
			hasChanges = true;
			ProcessSingleCommand(request);
		}
		
		if (hasChanges)
		{
			// Save updated queue with results
			if (!SST_Persistence<SST_PlayerCommandQueue>.SaveJson(COMMAND_RESULTS_FILE, commandQueue, errorMsg))
			{
				Print("[SST] ERROR: Failed to save command results: " + errorMsg);
			}
			
			// Clear the original queue file
			ref SST_PlayerCommandQueue emptyQueue = new SST_PlayerCommandQueue();
			SST_Persistence<SST_PlayerCommandQueue>.SaveJson(COMMAND_QUEUE_FILE, emptyQueue, errorMsg);
		}
	}
	
	protected void ProcessSingleCommand(SST_PlayerCommandRequest request)
	{
		request.processed = true;
		
		// Broadcast doesn't need a specific player
		if (request.commandType == "broadcast")
		{
			ProcessBroadcastCommand(request);
			return;
		}
		
		// Find the player
		PlayerBase targetPlayer = FindPlayerBySteamId(request.playerId);
		if (!targetPlayer)
		{
			request.result = "PLAYER_NOT_FOUND";
			Print("[SST] Command FAILED: Player " + request.playerId + " not found online");
			return;
		}
		
		string playerName = "Unknown";
		PlayerIdentity identity = targetPlayer.GetIdentity();
		if (identity)
			playerName = identity.GetName();
		
		if (request.commandType == "heal")
		{
			ProcessHealCommand(request, targetPlayer, playerName);
		}
		else if (request.commandType == "teleport")
		{
			ProcessTeleportCommand(request, targetPlayer, playerName);
		}
		else if (request.commandType == "message")
		{
			ProcessMessageCommand(request, targetPlayer, playerName);
		}
		else if (request.commandType == "broadcast")
		{
			ProcessBroadcastCommand(request);
		}
		else
		{
			request.result = "INVALID_COMMAND";
			Print("[SST] Command FAILED: Unknown command type " + request.commandType);
		}
	}
	
	protected void ProcessHealCommand(SST_PlayerCommandRequest request, PlayerBase player, string playerName)
	{
		if (!player.IsAlive())
		{
			request.result = "PLAYER_DEAD";
			Print("[SST] Heal FAILED: Player " + playerName + " is dead");
			return;
		}
		
		// Full heal - restore all stats
		float healthPercent = request.value;
		if (healthPercent <= 0 || healthPercent > 100)
			healthPercent = 100;
		
		float multiplier = healthPercent / 100.0;
		
		// Clear shock first to prevent unconsciousness during heal
		player.SetHealth("", "Shock", 0);
		player.SetHealth("GlobalHealth", "Shock", 0);
		
		// Heal body parts first (before global health)
		player.SetHealth("Head", "Health", player.GetMaxHealth("Head", "Health") * multiplier);
		player.SetHealth("Torso", "Health", player.GetMaxHealth("Torso", "Health") * multiplier);
		player.SetHealth("LeftArm", "Health", player.GetMaxHealth("LeftArm", "Health") * multiplier);
		player.SetHealth("RightArm", "Health", player.GetMaxHealth("RightArm", "Health") * multiplier);
		player.SetHealth("LeftLeg", "Health", player.GetMaxHealth("LeftLeg", "Health") * multiplier);
		player.SetHealth("RightLeg", "Health", player.GetMaxHealth("RightLeg", "Health") * multiplier);
		
		// Set global health
		float maxHealth = player.GetMaxHealth("GlobalHealth", "Health");
		player.SetHealth("GlobalHealth", "Health", maxHealth * multiplier);
		
		// Set blood (max is 5000)
		player.SetHealth("GlobalHealth", "Blood", 5000.0 * multiplier);
		
		// Restore hunger and thirst
		if (player.GetStatWater())
			player.GetStatWater().Set(player.GetStatWater().GetMax() * multiplier);
		if (player.GetStatEnergy())
			player.GetStatEnergy().Set(player.GetStatEnergy().GetMax() * multiplier);
		
		// Remove bleeding and diseases at 100%
		if (healthPercent >= 100)
		{
			player.RemoveAllAgents();
		}
		
		// Clear shock AGAIN at the end to ensure player stays conscious
		player.SetHealth("", "Shock", 0);
		player.SetHealth("GlobalHealth", "Shock", 0);
		
		request.result = "SUCCESS";
		Print("[SST] Heal SUCCESS: " + playerName + " healed to " + healthPercent.ToString() + "% (maxHealth=" + maxHealth.ToString() + ")");
		
		// Send notification to player
		string notificationTitle = "ADMIN MESSAGE";
		string notificationText = "You have been healed to " + healthPercent.ToString() + "%";
		NotificationSystem.SendNotificationToPlayerExtended(player, 5.0, notificationTitle, notificationText, "set:dayz_gui image:icon_health");
	}
	
	protected void ProcessTeleportCommand(SST_PlayerCommandRequest request, PlayerBase player, string playerName)
	{
		if (!player.IsAlive())
		{
			request.result = "PLAYER_DEAD";
			Print("[SST] Teleport FAILED: Player " + playerName + " is dead");
			return;
		}
		
		vector destination = Vector(request.posX, request.posY, request.posZ);
		
		// Validate coordinates (basic sanity check)
		if (request.posX < 0 || request.posX > 20000 || request.posZ < 0 || request.posZ > 20000)
		{
			request.result = "INVALID_COORDINATES";
			Print("[SST] Teleport FAILED: Invalid coordinates " + destination.ToString());
			return;
		}
		
		// Get surface Y if Y is 0 or very low
		if (request.posY <= 0)
		{
			request.posY = GetGame().SurfaceY(request.posX, request.posZ);
			destination = Vector(request.posX, request.posY, request.posZ);
		}
		
		// Get previous position for logging
		vector previousPos = player.GetPosition();
		
		// Teleport the player
		player.SetPosition(destination);
		
		request.result = "SUCCESS";
		Print("[SST] Teleport SUCCESS: " + playerName + " teleported from " + previousPos.ToString() + " to " + destination.ToString());
		
		// Send notification to player
		string notificationTitle = "ADMIN MESSAGE";
		string notificationText = "You have been teleported";
		NotificationSystem.SendNotificationToPlayerExtended(player, 5.0, notificationTitle, notificationText, "set:dayz_gui image:icon_arrow_right");
	}
	
	protected void ProcessMessageCommand(SST_PlayerCommandRequest request, PlayerBase player, string playerName)
	{
		if (request.message == "")
		{
			request.result = "EMPTY_MESSAGE";
			Print("[SST] Message FAILED: Empty message");
			return;
		}
		
		string msgType = request.messageType;
		if (msgType == "" || msgType == "both" || msgType == "notification")
		{
			// Send as notification popup
			NotificationSystem.SendNotificationToPlayerExtended(player, 8.0, "ADMIN MESSAGE", request.message, "set:dayz_gui image:icon_info");
		}
		
		if (msgType == "chat" || msgType == "both")
		{
			// Send as chat message
			SendChatMessageToPlayer(player, "[ADMIN] " + request.message);
		}
		
		request.result = "SUCCESS";
		Print("[SST] Message SUCCESS: Sent to " + playerName + ": " + request.message);
	}
	
	protected void ProcessBroadcastCommand(SST_PlayerCommandRequest request)
	{
		if (request.message == "")
		{
			request.result = "EMPTY_MESSAGE";
			Print("[SST] Broadcast FAILED: Empty message");
			return;
		}
		
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);
		int playerCount = 0;
		
		string msgType = request.messageType;
		
		foreach (Man man : players)
		{
			if (!man)
				continue;
			
			PlayerBase player = PlayerBase.Cast(man);
			if (!player)
				continue;
			
			if (msgType == "" || msgType == "both" || msgType == "notification")
			{
				// Send as notification popup
				NotificationSystem.SendNotificationToPlayerExtended(player, 10.0, "SERVER BROADCAST", request.message, "set:dayz_gui image:icon_info");
			}
			
			if (msgType == "chat" || msgType == "both")
			{
				// Send as chat message
				SendChatMessageToPlayer(player, "[SERVER] " + request.message);
			}
			
			playerCount++;
		}
		
		request.result = "SUCCESS";
		Print("[SST] Broadcast SUCCESS: Sent to " + playerCount.ToString() + " players: " + request.message);
	}
	
	protected void SendChatMessageToPlayer(PlayerBase player, string message)
	{
		// Use the RPC system to send a chat message
		if (!player || !player.GetIdentity())
			return;
		
		// Create params for the chat message
		ref Param1<string> params = new Param1<string>(message);
		GetGame().RPCSingleParam(player, ERPCs.RPC_USER_ACTION_MESSAGE, params, true, player.GetIdentity());
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
