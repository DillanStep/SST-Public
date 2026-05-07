/**
 * @file SST_ExpansionATMCommands.c
 * @brief Applies SST-administered Expansion ATM balance changes to the live server.
 *
 * The web/API edits ExpansionMod/ATM JSON files, then queues commands here so
 * ExpansionMarketModule refreshes its in-memory ATM data without a server restart.
 */

#ifdef EXPANSIONMODMARKET

class SST_ExpansionATMCommands
{
	protected static ref SST_ExpansionATMCommands s_Instance;
	static string COMMAND_QUEUE_FILE = SST_RuntimePaths.ApiFile("expansion_atm_commands.json");
	static string COMMAND_RESULTS_FILE = SST_RuntimePaths.ApiFile("expansion_atm_commands_results.json");
	static const float CHECK_INTERVAL = 2000.0;

	void SST_ExpansionATMCommands()
	{
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.API_FOLDER);
	}

	static SST_ExpansionATMCommands GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_ExpansionATMCommands();

		return s_Instance;
	}

	static void Start()
	{
		GetInstance().Init();
	}

	protected void Init()
	{
		Print("[SST] Expansion ATM Commands initialized - checking " + COMMAND_QUEUE_FILE + " every 2 seconds");
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

		ExpansionMarketModule marketModule = ExpansionMarketModule.GetInstance();
		if (!marketModule)
			return;

		ref SST_ExpansionATMCommandQueue commandQueue;
		string errorMsg;

		if (!SST_Persistence<SST_ExpansionATMCommandQueue>.LoadJson(COMMAND_QUEUE_FILE, commandQueue, errorMsg))
		{
			Print("[SST] ERROR: Failed to load Expansion ATM command queue: " + errorMsg);
			return;
		}

		if (!commandQueue || commandQueue.requests.Count() == 0)
			return;

		bool hasChanges = false;

		foreach (SST_ExpansionATMCommandRequest request : commandQueue.requests)
		{
			if (request.processed)
				continue;

			hasChanges = true;
			ProcessSingleCommand(request, marketModule);
		}

		if (!hasChanges)
			return;

		AppendResults(commandQueue);

		ref SST_ExpansionATMCommandQueue emptyQueue = new SST_ExpansionATMCommandQueue();
		if (!SST_Persistence<SST_ExpansionATMCommandQueue>.SaveJson(COMMAND_QUEUE_FILE, emptyQueue, errorMsg))
			Print("[SST] ERROR: Failed to clear Expansion ATM command queue: " + errorMsg);
	}

	protected void AppendResults(SST_ExpansionATMCommandQueue processedQueue)
	{
		ref SST_ExpansionATMCommandQueue existingResults = new SST_ExpansionATMCommandQueue();
		string errorMsg;

		if (SST_PersistenceCore.FileExists(COMMAND_RESULTS_FILE))
			SST_Persistence<SST_ExpansionATMCommandQueue>.LoadJson(COMMAND_RESULTS_FILE, existingResults, errorMsg);

		foreach (SST_ExpansionATMCommandRequest request : processedQueue.requests)
		{
			if (request.processed)
				existingResults.requests.Insert(request);
		}

		while (existingResults.requests.Count() > 100)
			existingResults.requests.Remove(0);

		if (!SST_Persistence<SST_ExpansionATMCommandQueue>.SaveJson(COMMAND_RESULTS_FILE, existingResults, errorMsg))
			Print("[SST] ERROR: Failed to save Expansion ATM command results: " + errorMsg);
	}

	protected void ProcessSingleCommand(SST_ExpansionATMCommandRequest request, ExpansionMarketModule marketModule)
	{
		request.processed = true;
		request.status = "failed";

		if (!GetExpansionSettings().GetMarket().ATMSystemEnabled)
		{
			request.result = "Expansion ATM system is disabled";
			Print("[SST] Expansion ATM command FAILED: ATM system is disabled");
			return;
		}

		if (request.commandType == "reloadAtmBalances")
		{
			ProcessReloadCommand(request, marketModule);
			return;
		}

		if (request.commandType == "setAtmBalance")
		{
			ProcessSetBalanceCommand(request, marketModule);
			return;
		}

		if (request.commandType == "compensateAtmBalance")
		{
			ProcessSetBalanceCommand(request, marketModule, true);
			return;
		}

		request.result = "Unknown command type: " + request.commandType;
		Print("[SST] Expansion ATM command FAILED: " + request.result);
	}

	protected void ProcessReloadCommand(SST_ExpansionATMCommandRequest request, ExpansionMarketModule marketModule)
	{
		array<ref ExpansionMarketATM_Data> atmData = marketModule.GetATMData();
		if (!atmData)
		{
			request.result = "Expansion ATM data is not initialized";
			Print("[SST] Expansion ATM reload FAILED: " + request.result);
			return;
		}

		atmData.Clear();
		marketModule.LoadATMData();

		request.status = "completed";
		request.result = "ATM balances reloaded from disk";
		Print("[SST] Expansion ATM reload SUCCESS: " + request.result);
	}

	protected void ProcessSetBalanceCommand(SST_ExpansionATMCommandRequest request, ExpansionMarketModule marketModule, bool isCompensation = false)
	{
		if (request.playerId == "")
		{
			request.result = "playerId is required";
			Print("[SST] Expansion ATM balance FAILED: " + request.result);
			return;
		}

		if (request.balance < 0)
		{
			request.result = "balance must be 0 or greater";
			Print("[SST] Expansion ATM balance FAILED: " + request.result);
			return;
		}

		array<ref ExpansionMarketATM_Data> atmData = marketModule.GetATMData();
		if (!atmData)
		{
			request.result = "Expansion ATM data is not initialized";
			Print("[SST] Expansion ATM balance FAILED: " + request.result);
			return;
		}

		ExpansionMarketATM_Data data = marketModule.GetPlayerATMData(request.playerId);
		bool created = false;

		if (!data)
		{
			data = new ExpansionMarketATM_Data;
			data.m_FileName = request.playerId;
			data.PlayerID = request.playerId;
			atmData.Insert(data);
			created = true;
		}

		data.MoneyDeposited = request.balance;
		data.Save();
		NotifyOnlinePlayer(request.playerId, marketModule, request, isCompensation);

		request.status = "completed";
		if (isCompensation)
			request.result = "Compensated ATM balance by " + request.amount.ToString() + " to " + request.balance.ToString();
		else if (created)
			request.result = "Created ATM account with balance " + request.balance.ToString();
		else
			request.result = "Updated ATM balance to " + request.balance.ToString();

		Print("[SST] Expansion ATM balance SUCCESS: " + request.playerId + " -> " + request.balance.ToString());
	}

	protected void NotifyOnlinePlayer(string playerId, ExpansionMarketModule marketModule, SST_ExpansionATMCommandRequest request, bool isCompensation)
	{
		PlayerBase player = PlayerBase.GetPlayerByUID(playerId);
		if (!player || !player.GetIdentity())
			return;

		marketModule.SendPlayerATMData(player.GetIdentity());

		if (!isCompensation)
			return;

		string reason = request.reason;
		if (reason == "")
			reason = "No reason provided";

		string message = "An Admin has compensated you the amount of " + request.amount.ToString() + " for reason: " + reason;
		NotificationSystem.SendNotificationToPlayerExtended(player, 8.0, "ADMIN COMPENSATION", message, "set:dayz_gui image:icon_info");
		SendChatMessageToPlayer(player, message);
	}

	protected void SendChatMessageToPlayer(PlayerBase player, string message)
	{
		if (!player || !player.GetIdentity())
			return;

		ref Param1<string> params = new Param1<string>(message);
		GetGame().RPCSingleParam(player, ERPCs.RPC_USER_ACTION_MESSAGE, params, true, player.GetIdentity());
	}
}

#endif
