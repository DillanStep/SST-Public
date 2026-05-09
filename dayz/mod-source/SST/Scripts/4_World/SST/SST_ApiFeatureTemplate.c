/**
 * @file SST_ApiFeatureTemplate.c
 * @brief Template for extending SST with a new API-backed feature (JSON queue + results + optional export).
 *
 * SST uses a simple file-based bridge between the DayZ server runtime and the external API:
 *
 *   1) API -> Server (commands)
 *      - The API writes a JSON "queue" file under: $profile:SST/api/
 *      - The server periodically reads the queue, executes requests, then writes a results file.
 *
 *   2) Server -> API (exports)
 *      - The server writes JSON snapshots/logs under: $profile:SST/
 *      - The API reads those JSON files and exposes them via HTTP endpoints.
 *
 * This template shows both directions, with a consistent request schema and processing loop.
 *
 * --------------------------------------------------------------------------------------------
 * HOW TO USE THIS TEMPLATE
 * --------------------------------------------------------------------------------------------
 * 1) Copy this file and rename it to your feature, e.g. `SST_MyFeature.c`.
 * 2) Rename the DTO classes and the service class (search/replace `SST_Template*`).
 * 3) Choose unique filenames for your queue/results/export.
 * 4) Call `SST_TemplateService.Start()` from your init entrypoint (usually 5_Mission init)
 *    or wherever your mod currently starts services.
 * 5) Update the Node API:
 *    - Create an endpoint that WRITES queue JSON to QUEUE_FILE.
 *    - Create an endpoint that READS RESULT_FILE (and/or EXPORT_FILE).
 *
 * Notes:
 * - Do not put secrets in JSON files.
 * - Always guard server-only logic with `GetGame().IsServer()`.
 * - Keep DTOs JSON-serializable: public fields, no complex types that JsonFileLoader can't handle.
 */

// -------------------------------------------------------------------------------------------------
// JSON DTOs (Data Transfer Objects)
// -------------------------------------------------------------------------------------------------

/**
 * @brief A single request written by the API for the server to process.
 *
 * Recommended fields:
 * - requestId: unique string from API for tracing
 * - playerId: Steam64 (plain id) of player (optional if command isn't player-targeted)
 * - action: short command name (e.g. "grant_item", "teleport", "spawn_vehicle")
 * - processed/status/result: set by the server after handling
 */
class SST_TemplateRequest
{
	string requestId;
	string playerId;
	string action;

	// Payload fields for your feature (add/rename as needed)
	string payloadText;
	float payloadValue;
	float posX;
	float posY;
	float posZ;

	// Server writes these
	bool processed;
	string status; // "pending", "completed", "failed"
	string result; // Human-readable result or error code
	string processedAt;
}

/**
 * @brief Root queue file structure (array wrapper).
 *
 * Queue JSON should look like:
 * {
 *   "requests": [
 *     { "requestId":"...", "playerId":"...", "action":"...", "payloadText":"...", "processed":false }
 *   ]
 * }
 */
class SST_TemplateQueue
{
	ref array<ref SST_TemplateRequest> requests = new array<ref SST_TemplateRequest>();
}

/**
 * @brief Optional export snapshot the API can read (Server -> API).
 */
class SST_TemplateExportEntry
{
	string timestamp;
	string message;
}

class SST_TemplateExport
{
	string generatedAt;
	int entryCount;
	ref array<ref SST_TemplateExportEntry> entries = new array<ref SST_TemplateExportEntry>();
}

// -------------------------------------------------------------------------------------------------
// Helper API ("API calls" from scripts)
// -------------------------------------------------------------------------------------------------

/**
 * @brief Convenience helpers to create/enqueue requests and write JSON.
 *
 * Important:
 * - In production, the external Node API is typically responsible for writing queue files.
 * - These helpers exist so contributors can quickly test features from in-game scripts,
 *   admin tools, or debug commands without re-implementing JSON plumbing.
 */
class SST_TemplateApi
{
	// Uses the same paths as SST_TemplateService.
	static string PROFILE_ROOT = SST_RuntimePaths.STORAGE_ROOT;
	static string API_FOLDER = SST_RuntimePaths.API_FOLDER;
	static string QUEUE_FILE = SST_RuntimePaths.ApiFile("template_queue.json");

	static void EnsureFolders()
	{
		SST_PersistenceCore.EnsureDirectory(PROFILE_ROOT);
		SST_PersistenceCore.EnsureDirectory(API_FOLDER);
	}

	/**
	 * @brief Create a new request object with common defaults.
	 */
	static ref SST_TemplateRequest NewRequest(string action, string playerId = "", string payloadText = "", float payloadValue = 0, vector position = vector.Zero)
	{
		ref SST_TemplateRequest req = new SST_TemplateRequest();
		req.action = action;
		req.playerId = playerId;
		req.payloadText = payloadText;
		req.payloadValue = payloadValue;
		req.posX = position[0];
		req.posY = position[1];
		req.posZ = position[2];
		req.processed = false;
		req.status = "pending";
		req.result = "";
		req.requestId = SST_TemplateService.GetUTCTimestamp();
		return req;
	}

	/**
	 * @brief Append a request to the queue JSON file.
	 *
	 * Queue file schema:
	 * { "requests": [ { ... }, { ... } ] }
	 */
	static bool EnqueueRequest(SST_TemplateRequest req)
	{
		EnsureFolders();

		ref SST_TemplateQueue queue;
		string errorMsg;

		if (SST_PersistenceCore.FileExists(QUEUE_FILE))
		{
			SST_Persistence<SST_TemplateQueue>.LoadJson(QUEUE_FILE, queue, errorMsg);
		}

		if (!queue)
			queue = new SST_TemplateQueue();
		if (!queue.requests)
			queue.requests = new array<ref SST_TemplateRequest>();

		queue.requests.Insert(req);

		if (!SST_Persistence<SST_TemplateQueue>.SaveJson(QUEUE_FILE, queue, errorMsg))
		{
			Print("[SST] TemplateApi: failed to write queue: " + errorMsg);
			return false;
		}

		return true;
	}

	/**
	 * @brief "API-like" one-liner: build a request from params and enqueue it.
	 */
	static bool EnqueueAction(string action, string playerId, string payloadText = "", float payloadValue = 0, vector position = vector.Zero)
	{
		ref SST_TemplateRequest req = NewRequest(action, playerId, payloadText, payloadValue, position);
		return EnqueueRequest(req);
	}

	/**
	 * @brief Write a JSON file for this template queue type.
	 *
	 * This is useful for quickly creating fixtures/examples.
	 */
	static bool GenerateJSONFile(string filePath, SST_TemplateQueue data)
	{
		EnsureFolders();
		string errorMsg;
		if (!SST_Persistence<SST_TemplateQueue>.SaveJson(filePath, data, errorMsg))
		{
			Print("[SST] TemplateApi: failed to save JSON: " + errorMsg);
			return false;
		}
		return true;
	}
}

// -------------------------------------------------------------------------------------------------
// Service implementation
// -------------------------------------------------------------------------------------------------

/**
 * @brief Example service that processes an API queue and writes results.
 *
 * This class does nothing unless `Start()` is called.
 */
class SST_TemplateService
{
	protected static ref SST_TemplateService s_Instance;

	// File paths (API reads/writes these)
	static string PROFILE_ROOT = SST_RuntimePaths.STORAGE_ROOT;
	static string API_FOLDER = SST_RuntimePaths.API_FOLDER;

	static string QUEUE_FILE = SST_RuntimePaths.ApiFile("template_queue.json");
	static string RESULT_FILE = SST_RuntimePaths.ApiFile("template_results.json");

	// Optional export (Server -> API)
	static string EXPORT_FILE = SST_RuntimePaths.STORAGE_ROOT + "/template_export.json";

	// Poll intervals (milliseconds)
	static const float QUEUE_POLL_INTERVAL_MS = 2000.0;
	static const float EXPORT_INTERVAL_MS = 15000.0;

	protected bool m_Initialized;

	void SST_TemplateService() {}

	static SST_TemplateService GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_TemplateService();
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

		// Ensure folders exist
		SST_PersistenceCore.EnsureDirectory(PROFILE_ROOT);
		SST_PersistenceCore.EnsureDirectory(API_FOLDER);

		if (!GetGame().IsServer())
			return;

		Print("[SST] TemplateService started (queue poll=" + QUEUE_POLL_INTERVAL_MS.ToString() + "ms)");

		// Start loops
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessQueueAndSchedule, QUEUE_POLL_INTERVAL_MS, false);
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ExportSnapshotAndSchedule, EXPORT_INTERVAL_MS, false);
	}

	// --------------------------------------------------------------------------------------------
	// Queue processing (API -> Server)
	// --------------------------------------------------------------------------------------------

	void ProcessQueueAndSchedule()
	{
		ProcessQueueOnce();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ProcessQueueAndSchedule, QUEUE_POLL_INTERVAL_MS, false);
	}

	protected void ProcessQueueOnce()
	{
		if (!GetGame().IsServer())
			return;

		if (!SST_PersistenceCore.FileExists(QUEUE_FILE))
			return;

		ref SST_TemplateQueue queue;
		string errorMsg;

		if (!SST_Persistence<SST_TemplateQueue>.LoadJson(QUEUE_FILE, queue, errorMsg))
		{
			Print("[SST] TemplateService: failed to load queue: " + errorMsg);
			return;
		}

		if (!queue || !queue.requests || queue.requests.Count() == 0)
			return;

		bool didWork;

		foreach (SST_TemplateRequest req : queue.requests)
		{
			if (!req || req.processed)
				continue;

			didWork = true;
			HandleRequest(req);
		}

		if (!didWork)
			return;

		// Write results (same structure; requests are now annotated with status/result)
		if (!SST_Persistence<SST_TemplateQueue>.SaveJson(RESULT_FILE, queue, errorMsg))
		{
			Print("[SST] TemplateService: failed to save results: " + errorMsg);
		}

		// Clear queue (so API can write new commands cleanly)
		ref SST_TemplateQueue emptyQueue = new SST_TemplateQueue();
		SST_Persistence<SST_TemplateQueue>.SaveJson(QUEUE_FILE, emptyQueue, errorMsg);
	}

	/**
	 * @brief Implement your feature logic here.
	 *
	 * Suggested conventions:
	 * - Always set processed=true
	 * - Use status: completed/failed
	 * - Use result for a short code or helpful message
	 */
	protected void HandleRequest(SST_TemplateRequest req)
	{
		req.processed = true;
		req.processedAt = GetUTCTimestamp();

		// Example: validate required fields
		if (!req.action || req.action == "")
		{
			req.status = "failed";
			req.result = "MISSING_ACTION";
			return;
		}

		// Example: player-targeted action
		if (req.playerId && req.playerId != "")
		{
			PlayerBase player = FindPlayerBySteamId(req.playerId);
			if (!player)
			{
				req.status = "failed";
				req.result = "PLAYER_NOT_FOUND";
				return;
			}
		}

		// Implement action routing for your feature.
		// Example:
		// if (req.action == "my_action") { ... }

		req.status = "completed";
		req.result = "SUCCESS";
	}

	// --------------------------------------------------------------------------------------------
	// Optional snapshot export (Server -> API)
	// --------------------------------------------------------------------------------------------

	void ExportSnapshotAndSchedule()
	{
		ExportSnapshotOnce();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(ExportSnapshotAndSchedule, EXPORT_INTERVAL_MS, false);
	}

	protected void ExportSnapshotOnce()
	{
		if (!GetGame().IsServer())
			return;

		ref SST_TemplateExport snapshot = new SST_TemplateExport();
		snapshot.generatedAt = GetUTCTimestamp();

		// Example: write a heartbeat entry
		ref SST_TemplateExportEntry entry = new SST_TemplateExportEntry();
		entry.timestamp = snapshot.generatedAt;
		entry.message = "Template export is running";
		snapshot.entries.Insert(entry);
		snapshot.entryCount = snapshot.entries.Count();

		string errorMsg;
		if (!SST_Persistence<SST_TemplateExport>.SaveJson(EXPORT_FILE, snapshot, errorMsg))
		{
			Print("[SST] TemplateService: failed to save export: " + errorMsg);
		}
	}

	// --------------------------------------------------------------------------------------------
	// Helpers
	// --------------------------------------------------------------------------------------------

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

	/**
	 * @brief Utility: find a PlayerBase by identity plain id (Steam64).
	 *
	 * This is a common pattern used in SST command handlers.
	 */
	static PlayerBase FindPlayerBySteamId(string steamId)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		foreach (Man man : players)
		{
			PlayerBase pb = PlayerBase.Cast(man);
			if (!pb)
				continue;

			PlayerIdentity ident = pb.GetIdentity();
			if (ident && ident.GetPlainId() == steamId)
				return pb;
		}

		return null;
	}
}
