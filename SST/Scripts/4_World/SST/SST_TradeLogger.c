/**
 * @file SST_TradeLogger.c
 * @brief Logs Expansion Market trades to per-player JSON files.
 *
 * Records purchases and sales (from Expansion Market hooks) to $storage:SST/trades/.
 * Intended for consumption by external tooling/dashboards.
 */

class SST_TradeEventType
{
	static const string PURCHASE = "PURCHASE";
	static const string SALE = "SALE";
}

class SST_TradeEventData
{
	string timestamp;
	string eventType;           // PURCHASE or SALE
	string playerName;
	string playerId;
	string itemClassName;
	string itemDisplayName;
	int quantity;
	int price;
	string traderName;          // Display name of trader
	string traderZone;          // Market zone name
	vector traderPosition;      // Position of the trader
	vector playerPosition;      // Position of the player
}

class SST_PlayerTradeLog
{
	string playerName;
	string playerId;
	int totalPurchases;
	int totalSales;
	int totalSpent;
	int totalEarned;
	ref array<ref SST_TradeEventData> trades = new array<ref SST_TradeEventData>();
}

// Aggregates and persists trade events.
class SST_TradeLogger
{
	protected static ref SST_TradeLogger s_Instance;
	static string TRADES_FOLDER = SST_RuntimePaths.TRADES_FOLDER + "/";
	static const float FLUSH_DELAY = 5000.0;

	// Cache of loaded trade logs per player
	protected ref map<string, ref SST_PlayerTradeLog> m_TradeLogs;
	protected ref array<string> m_DirtyTradeLogIds;
	protected bool m_FlushScheduled;

	void SST_TradeLogger()
	{
		m_TradeLogs = new map<string, ref SST_PlayerTradeLog>();
		m_DirtyTradeLogIds = new array<string>();

		// Create trades folder
		SST_PersistenceCore.EnsureDirectory(SST_RuntimePaths.STORAGE_ROOT);
		SST_PersistenceCore.EnsureDirectory(TRADES_FOLDER);
	}

	static SST_TradeLogger GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_TradeLogger();
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

	// Log a trade event
	void LogTrade(string eventType, PlayerBase player, string itemClassName, string itemDisplayName, int quantity, int price, string traderName, string traderZone, vector traderPosition)
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
		vector playerPosition = player.GetPosition();

		// Create trade event data
		ref SST_TradeEventData tradeData = new SST_TradeEventData();
		tradeData.timestamp = GetUTCTimestamp();
		tradeData.eventType = eventType;
		tradeData.playerName = playerName;
		tradeData.playerId = playerId;
		tradeData.itemClassName = itemClassName;
		tradeData.itemDisplayName = itemDisplayName;
		tradeData.quantity = quantity;
		tradeData.price = price;
		tradeData.traderName = traderName;
		tradeData.traderZone = traderZone;
		tradeData.traderPosition = traderPosition;
		tradeData.playerPosition = playerPosition;

		// Load or create player's trade log
		ref SST_PlayerTradeLog playerLog = GetOrCreatePlayerLog(playerId, playerName);
		playerLog.trades.Insert(tradeData);

		// Update totals
		if (eventType == SST_TradeEventType.PURCHASE)
		{
			playerLog.totalPurchases += quantity;
			playerLog.totalSpent += price;
		}
		else if (eventType == SST_TradeEventType.SALE)
		{
			playerLog.totalSales += quantity;
			playerLog.totalEarned += price;
		}

		// Keep only last 500 trades per player to prevent file bloat
		while (playerLog.trades.Count() > 500)
		{
			playerLog.trades.Remove(0);
		}

		MarkPlayerLogDirty(playerId);

		// Console log for debugging
		Print("[SST] TRADE " + eventType + ": " + playerName + " - " + itemDisplayName + " x" + quantity + " for " + price);
	}

	protected void MarkPlayerLogDirty(string playerId)
	{
		if (m_DirtyTradeLogIds.Find(playerId) == -1)
			m_DirtyTradeLogIds.Insert(playerId);

		if (!m_FlushScheduled)
		{
			m_FlushScheduled = true;
			GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(FlushDirtyLogs, FLUSH_DELAY, false);
		}
	}

	protected void FlushDirtyLogs()
	{
		for (int i = 0; i < m_DirtyTradeLogIds.Count(); i++)
		{
			string playerId = m_DirtyTradeLogIds.Get(i);
			if (m_TradeLogs.Contains(playerId))
			{
				SavePlayerLog(playerId, m_TradeLogs.Get(playerId));
			}
		}

		m_DirtyTradeLogIds = new array<string>();
		m_FlushScheduled = false;
	}

	protected ref SST_PlayerTradeLog GetOrCreatePlayerLog(string playerId, string playerName)
	{
		// Check cache first
		if (m_TradeLogs.Contains(playerId))
			return m_TradeLogs.Get(playerId);

		// Try to load from file
		string filePath = TRADES_FOLDER + playerId + "_trades.json";
		ref SST_PlayerTradeLog playerLog;

		if (SST_PersistenceCore.FileExists(filePath))
		{
			string errorMsg;
			if (SST_Persistence<SST_PlayerTradeLog>.LoadJson(filePath, playerLog, errorMsg))
			{
				m_TradeLogs.Set(playerId, playerLog);
				return playerLog;
			}
		}

		// Create new log
		playerLog = new SST_PlayerTradeLog();
		playerLog.playerName = playerName;
		playerLog.playerId = playerId;
		playerLog.totalPurchases = 0;
		playerLog.totalSales = 0;
		playerLog.totalSpent = 0;
		playerLog.totalEarned = 0;
		m_TradeLogs.Set(playerId, playerLog);

		return playerLog;
	}

	protected void SavePlayerLog(string playerId, SST_PlayerTradeLog playerLog)
	{
		string filePath = TRADES_FOLDER + playerId + "_trades.json";
		string errorMsg;

		if (!SST_Persistence<SST_PlayerTradeLog>.SaveJson(filePath, playerLog, errorMsg))
		{
			Print("[SST] ERROR: Failed to save trade log for " + playerId + ": " + errorMsg);
		}
	}

	// Static helper methods for easy calling
	static void LogPurchase(PlayerBase player, string itemClassName, string itemDisplayName, int quantity, int price, string traderName, string traderZone, vector traderPosition)
	{
		GetInstance().LogTrade(SST_TradeEventType.PURCHASE, player, itemClassName, itemDisplayName, quantity, price, traderName, traderZone, traderPosition);
	}

	static void LogSale(PlayerBase player, string itemClassName, string itemDisplayName, int quantity, int price, string traderName, string traderZone, vector traderPosition)
	{
		GetInstance().LogTrade(SST_TradeEventType.SALE, player, itemClassName, itemDisplayName, quantity, price, traderName, traderZone, traderPosition);
	}
}
