/**
 * @file SST_ZRestEventClient.c
 * @brief Shared REST API client for posting SST server events from server-side hooks.
 */

class SST_TradeEventType
{
	static const string PURCHASE = "PURCHASE";
	static const string SALE = "SALE";
};

class SST_TradeEventData
{
	string timestamp;
	string eventType;
	string playerName;
	string playerId;
	string itemClassName;
	string itemDisplayName;
	int quantity;
	int price;
	string traderName;
	string traderZone;
	vector traderPosition;
	vector playerPosition;
};

class SST_RestEventConfiguration
{
	bool restEnabled = true;
	string baseUrl = "http://127.0.0.1:5106";
	string eventsPath = "/api/events";
	string contentType = "application/json";
	bool debugEnabled = false;
	bool logSuccess = false;
	bool sendLifeEvents = true;
	bool sendInventoryEvents = true;
	bool sendTradeEvents = true;
	int readTimeoutSeconds = 10;
	int connectionTimeoutSeconds = 10;

	void Validate()
	{
		if (baseUrl == "")
			baseUrl = "http://127.0.0.1:5106";

		if (eventsPath == "")
			eventsPath = "/api/events";

		while (baseUrl.Length() > 0 && baseUrl.Get(baseUrl.Length() - 1) == "/")
		{
			baseUrl = baseUrl.Substring(0, baseUrl.Length() - 1);
		}

		if (eventsPath.Length() > 0 && eventsPath.Get(0) != "/")
			eventsPath = "/" + eventsPath;

		if (contentType == "")
			contentType = "application/json";

		if (readTimeoutSeconds < 3)
			readTimeoutSeconds = 3;

		if (readTimeoutSeconds > 120)
			readTimeoutSeconds = 120;

		if (connectionTimeoutSeconds < 3)
			connectionTimeoutSeconds = 3;

		if (connectionTimeoutSeconds > 120)
			connectionTimeoutSeconds = 120;
	}
};

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
};

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
};

class SST_RestEventCallback : RestCallback
{
	string eventType;
	string summary;

	void Init(string eventTypeValue, string summaryValue)
	{
		eventType = eventTypeValue;
		summary = summaryValue;
	}

	override void OnError(int errorCode)
	{
		Print("[SST] REST event failed (" + eventType + ") error=" + errorCode.ToString() + " summary=" + summary);
		SST_RestEventClient.GetInstance().ReleaseCallback(this);
	}

	override void OnTimeout()
	{
		Print("[SST] REST event timed out (" + eventType + ") summary=" + summary);
		SST_RestEventClient.GetInstance().ReleaseCallback(this);
	}

	override void OnSuccess(string data, int dataSize)
	{
		if (SST_RestEventClient.GetInstance().ShouldLogSuccess())
			Print("[SST] REST event posted (" + eventType + ") responseBytes=" + dataSize.ToString());

		SST_RestEventClient.GetInstance().ReleaseCallback(this);
	}
};

class SST_RestEventClient
{
	protected static ref SST_RestEventClient s_Instance;

	private const string CONFIG_FILE = "$profile:SST/api/rest_config.json";
	private ref SST_RestEventConfiguration m_Config;
	private ref JsonSerializer m_Serializer = new JsonSerializer();
	private ref array<ref SST_RestEventCallback> m_PendingCallbacks = new array<ref SST_RestEventCallback>();
	private RestApi m_RestApi;
	private RestContext m_RestContext;
	private bool m_Initialized = false;

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
		LoadOrCreateConfig();

		if (!m_Config || !m_Config.restEnabled)
		{
			Print("[SST] REST event client disabled. Enable it in " + CONFIG_FILE);
			return;
		}

		m_RestApi = CreateRestApi();
		if (!m_RestApi)
		{
			Print("[SST] ERROR: REST event client could not create RestApi");
			return;
		}

		m_RestApi.EnableDebug(m_Config.debugEnabled);

		m_RestContext = m_RestApi.GetRestContext(m_Config.baseUrl);
		if (!m_RestContext)
		{
			Print("[SST] ERROR: REST event client could not create RestContext for " + m_Config.baseUrl);
			return;
		}

		m_RestContext.SetHeader(m_Config.contentType);
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

		return m_Config && m_Config.restEnabled && m_Config.sendLifeEvents;
	}

	bool ShouldSendInventoryEvents()
	{
		if (!m_Initialized)
			Init();

		return m_Config && m_Config.restEnabled && m_Config.sendInventoryEvents;
	}

	bool ShouldSendTradeEvents()
	{
		if (!m_Initialized)
			Init();

		return m_Config && m_Config.restEnabled && m_Config.sendTradeEvents;
	}

	void ReleaseCallback(SST_RestEventCallback callback)
	{
		if (!m_PendingCallbacks || !callback)
			return;

		int index = m_PendingCallbacks.Find(callback);
		if (index != -1)
			m_PendingCallbacks.Remove(index);
	}

	private void LoadOrCreateConfig()
	{
		m_Config = new SST_RestEventConfiguration();
		string errorMsg;

		if (SST_PersistenceCore.FileExists(CONFIG_FILE))
		{
			if (!SST_Persistence<SST_RestEventConfiguration>.LoadJson(CONFIG_FILE, m_Config, errorMsg))
				Print("[SST] WARNING: Failed to load REST config, creating default: " + errorMsg);
		}

		m_Config.Validate();
		if (!SST_Persistence<SST_RestEventConfiguration>.SaveJson(CONFIG_FILE, m_Config, errorMsg))
			Print("[SST] WARNING: Failed to save REST config: " + errorMsg);
	}

	private void SendEvent(SST_ServerEventRequest serverEvent)
	{
		if (!GetGame().IsServer())
			return;

		if (!m_Initialized)
			Init();

		if (!m_Config || !m_Config.restEnabled || !m_RestContext)
			return;

		ref SST_RestEventCallback callback = new SST_RestEventCallback();
		callback.Init(serverEvent.eventType, serverEvent.summary);
		m_PendingCallbacks.Insert(callback);

		string payload;
		if (!m_Serializer.WriteToString(serverEvent, false, payload))
		{
			Print("[SST] ERROR: Failed to serialize REST event " + serverEvent.eventType);
			ReleaseCallback(callback);
			return;
		}

		m_RestContext.POST(callback, m_Config.eventsPath, payload);
	}

	private static ref SST_ServerEventRequest CreateBaseEvent(string eventType, string steamId, string playerName, vector position, string createdAt)
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

	private static string MapLifeEventType(string eventType)
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
};
