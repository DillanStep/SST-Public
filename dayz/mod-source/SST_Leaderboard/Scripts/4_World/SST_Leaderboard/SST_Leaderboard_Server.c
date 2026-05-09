/**
 * @file SST_Leaderboard_Server.c
 * @brief Server-side aggregator for the SST leaderboard.
 *
 * Self-contained: does not reference any SST script symbol because mod load
 * order between @SST and @SST_Leaderboard isn't guaranteed. Compile-time
 * references like SST_PersistenceCore would fail when @SST_Leaderboard
 * compiles before @SST in the same script module.
 *
 * Interop with SST is purely runtime/file-based:
 *   - reads $profile:SST/life_events/<steam64>_life.json (matching JSON shape)
 *   - writes $profile:SST/api/leaderboard.json (the dashboard already polls this)
 */

class SST_LB_LifeEventEntry
{
	string timestamp;
	string eventType;
	string playerName;
	string playerId;
	vector position;
	string causeOfDeath;
	float  healthAtDeath;
}

class SST_LB_LifeEventsLog
{
	string playerName;
	string playerId;
	ref array<ref SST_LB_LifeEventEntry> events = new array<ref SST_LB_LifeEventEntry>();
}

// Local DTOs that mirror SST's inventory export JSON shape - we only need
// the playerName + playerId fields, so we leave the rest of the payload
// undefined and the JSON loader will silently ignore unknown fields.
class SST_LB_InventoryPlayerStub
{
	string playerName;
	string playerId;
}

class SST_LB_InventoryFile
{
	string generatedAt;
	int    playerCount;
	ref array<ref SST_LB_InventoryPlayerStub> players = new array<ref SST_LB_InventoryPlayerStub>();
}

class SST_LeaderboardStats
{
	string playerId;
	string playerName;
	int    kills;
	int    deaths;
	int    sessions;
	float  longestShotMeters;
	int    zombieKills;
	float  totalDistanceMeters;
	int    longestLifeSeconds;
	int    currentLifeSeconds;
}

class SST_LeaderboardPersisted
{
	string generatedAt;
	ref array<ref SST_LeaderboardStats> stats = new array<ref SST_LeaderboardStats>();
}

class SST_LeaderboardServer
{
	protected static ref SST_LeaderboardServer s_Instance;

	static const string STORAGE_ROOT       = "$profile:SST";
	static const string API_FOLDER         = "$profile:SST/api";
	static const string LIFE_EVENTS_FOLDER = "$profile:SST/life_events";
	static const string INVENTORIES_FOLDER = "$profile:SST/inventories";
	static const string STATE_FILE         = "$profile:SST/api/leaderboard.json";

	static const float PERSIST_INTERVAL = 60000.0;

	protected ref map<string, ref SST_LeaderboardStats> m_Stats;
	protected bool m_Initialized;

	// Sampling state (in-memory only) - last known position per player so we
	// can compute deltas in the periodic poll.
	protected ref map<string, vector> m_LastPositions;

	// Throttle the "failed to persist" log so it doesn't spam every minute
	// for the lifetime of the server when something external (web dashboard,
	// antivirus, etc.) is holding the file open.
	protected bool m_PersistErrorLogged;

	static SST_LeaderboardServer GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_LeaderboardServer();
		return s_Instance;
	}

	static void Start()
	{
		if (!GetGame() || !GetGame().IsServer())
			return;
		GetInstance().Init();
	}

	void SST_LeaderboardServer()
	{
		m_Stats = new map<string, ref SST_LeaderboardStats>();
		m_LastPositions = new map<string, vector>();
	}

	protected void Init()
	{
		if (m_Initialized)
			return;
		m_Initialized = true;

		Print("[SST_LB] LeaderboardServer initializing...");

		EnsureDir(STORAGE_ROOT);
		EnsureDir(API_FOLDER);

		LoadPersistedState();
		HydrateFromLifeEvents();
		HydrateFromInventories();
		Persist();

		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(PersistAndReschedule, PERSIST_INTERVAL, false);
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(SampleAndReschedule, SST_LB_SAMPLE_POLL_MS, false);

		Print("[SST_LB] LeaderboardServer ready - " + m_Stats.Count().ToString() + " players tracked");
		Print("[SST_LB] Persisting leaderboard to " + STATE_FILE);
	}

	void PersistAndReschedule()
	{
		Persist();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(PersistAndReschedule, PERSIST_INTERVAL, false);
	}

	// Periodic sampler: walks every online player, accumulates distance moved
	// since the previous sample (capped at SST_LB_MAX_PER_SAMPLE_METERS to
	// reject teleports), and adds SST_LB_SAMPLE_POLL_MS to the alive-time
	// counter for live characters.
	void SampleAndReschedule()
	{
		SampleOnce();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(SampleAndReschedule, SST_LB_SAMPLE_POLL_MS, false);
	}

	protected void SampleOnce()
	{
		if (!GetGame() || !GetGame().IsServer())
			return;

		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		int sampleSeconds = (int)(SST_LB_SAMPLE_POLL_MS / 1000.0);

		foreach (Man man : players)
		{
			PlayerBase pb = PlayerBase.Cast(man);
			if (!pb || !pb.GetIdentity())
				continue;

			PlayerIdentity ident = pb.GetIdentity();
			string steamId = ident.GetPlainId();
			string playerName = ident.GetName();

			SST_LeaderboardStats stats = GetOrCreate(steamId, playerName);
			if (!stats)
				continue;

			vector pos = pb.GetPosition();

			// Distance delta - skip if no previous sample (just connected).
			if (m_LastPositions.Contains(steamId))
			{
				vector prev = m_LastPositions.Get(steamId);
				float delta = vector.Distance(prev, pos);
				if (delta > 0 && delta < SST_LB_MAX_PER_SAMPLE_METERS)
				{
					stats.totalDistanceMeters = stats.totalDistanceMeters + delta;
				}
			}
			m_LastPositions.Set(steamId, pos);

			// Life seconds - only count if alive.
			if (pb.IsAlive())
				stats.currentLifeSeconds = stats.currentLifeSeconds + sampleSeconds;
		}
	}

	// Called by PlayerBase.EEKilled when the local player died. Finalises the
	// life record and clears the in-progress timer.
	void FinaliseLifeOnDeath(string steamId, string playerName)
	{
		SST_LeaderboardStats stats = GetOrCreate(steamId, playerName);
		if (!stats)
			return;

		if (stats.currentLifeSeconds > stats.longestLifeSeconds)
			stats.longestLifeSeconds = stats.currentLifeSeconds;
		stats.currentLifeSeconds = 0;
	}

	// Called by ZombieBase.EEKilled when a player killed an infected.
	void RecordZombieKill(string playerId, string playerName)
	{
		SST_LeaderboardStats stats = GetOrCreate(playerId, playerName);
		if (stats)
		{
			stats.zombieKills = stats.zombieKills + 1;
			Print("[SST_LB] zombieKills for " + playerName + " is now " + stats.zombieKills.ToString());
		}
	}

	protected SST_LeaderboardStats GetOrCreate(string playerId, string playerName)
	{
		if (playerId == "")
			return null;

		if (m_Stats.Contains(playerId))
		{
			SST_LeaderboardStats existing = m_Stats.Get(playerId);
			if (playerName != "")
				existing.playerName = playerName;
			return existing;
		}

		ref SST_LeaderboardStats stats = new SST_LeaderboardStats();
		stats.playerId = playerId;
		stats.playerName = playerName;
		m_Stats.Insert(playerId, stats);
		return stats;
	}

	void RecordPvPKill(string killerId, string killerName, string victimId, string victimName, float distanceMeters)
	{
		SST_LeaderboardStats killer = GetOrCreate(killerId, killerName);
		SST_LeaderboardStats victim = GetOrCreate(victimId, victimName);

		if (killer)
		{
			killer.kills = killer.kills + 1;
			if (distanceMeters > killer.longestShotMeters)
				killer.longestShotMeters = distanceMeters;
		}
		if (victim)
			victim.deaths = victim.deaths + 1;

		Print("[SST_LB] PvP kill: " + killerName + " (" + killerId + ") -> " + victimName + " (" + victimId + ") @ " + distanceMeters.ToString() + "m");
	}

	void RecordDeath(string playerId, string playerName)
	{
		SST_LeaderboardStats stats = GetOrCreate(playerId, playerName);
		if (stats)
			stats.deaths = stats.deaths + 1;
	}

	void RecordConnect(string playerId, string playerName)
	{
		SST_LeaderboardStats stats = GetOrCreate(playerId, playerName);
		if (stats)
			stats.sessions = stats.sessions + 1;
	}

	ref SST_LeaderboardSnapshot BuildSnapshot(string sortMode)
	{
		ref SST_LeaderboardSnapshot snap = new SST_LeaderboardSnapshot();
		snap.generatedAt = GetUTCTimestamp();
		snap.sortMode = sortMode;
		snap.totalPlayersTracked = m_Stats.Count();

		array<ref SST_LeaderboardStats> flat = new array<ref SST_LeaderboardStats>();
		for (int i = 0; i < m_Stats.Count(); i++)
		{
			flat.Insert(m_Stats.GetElement(i));
		}

		SortFlat(flat, sortMode);

		int rowCount = flat.Count();
		if (rowCount > SST_LB_MAX_ROWS)
			rowCount = SST_LB_MAX_ROWS;

		for (int j = 0; j < rowCount; j++)
		{
			SST_LeaderboardStats s = flat.Get(j);

			ref SST_LeaderboardEntry e = new SST_LeaderboardEntry();
			e.playerName = s.playerName;
			e.playerHash = ShortHash(s.playerId);
			e.kills = s.kills;
			e.deaths = s.deaths;
			e.sessions = s.sessions;
			e.longestShotMeters = s.longestShotMeters;
			e.zombieKills = s.zombieKills;
			e.totalDistanceMeters = s.totalDistanceMeters;
			e.longestLifeSeconds = s.longestLifeSeconds;
			e.currentLifeSeconds = s.currentLifeSeconds;
			snap.entries.Insert(e);
		}

		return snap;
	}

	protected void SortFlat(array<ref SST_LeaderboardStats> arr, string sortMode)
	{
		int n = arr.Count();
		for (int i = 1; i < n; i++)
		{
			ref SST_LeaderboardStats key = arr.Get(i);
			float keyScore = ScoreFor(key, sortMode);
			int j = i - 1;
			while (j >= 0 && ScoreFor(arr.Get(j), sortMode) < keyScore)
			{
				arr.Set(j + 1, arr.Get(j));
				j = j - 1;
			}
			arr.Set(j + 1, key);
		}
	}

	protected float ScoreFor(SST_LeaderboardStats s, string sortMode)
	{
		if (sortMode == SST_LeaderboardSort.DEATHS)
			return s.deaths;
		if (sortMode == SST_LeaderboardSort.KD)
		{
			if (s.deaths == 0)
				return s.kills * 1.0;
			return s.kills / (float)s.deaths;
		}
		if (sortMode == SST_LeaderboardSort.SESSIONS)
			return s.sessions;
		if (sortMode == SST_LeaderboardSort.LONGEST)
			return s.longestShotMeters;
		if (sortMode == SST_LeaderboardSort.ZOMBIE_KILLS)
			return s.zombieKills;
		if (sortMode == SST_LeaderboardSort.DISTANCE)
			return s.totalDistanceMeters;
		if (sortMode == SST_LeaderboardSort.LONGEST_LIFE)
		{
			// Sort by max(longestLife, currentLife) so a player on a record-
			// breaking ongoing life ranks correctly even before they die.
			int v = s.longestLifeSeconds;
			if (s.currentLifeSeconds > v)
				v = s.currentLifeSeconds;
			return v;
		}
		return s.kills;
	}

	protected void Persist()
	{
		// Defensive: re-ensure the dir tree (cheap, idempotent) so a deleted
		// folder mid-life doesn't permanently break us.
		EnsureDir(STORAGE_ROOT);
		EnsureDir(API_FOLDER);

		ref SST_LeaderboardPersisted file = new SST_LeaderboardPersisted();
		file.generatedAt = GetUTCTimestamp();

		for (int i = 0; i < m_Stats.Count(); i++)
		{
			file.stats.Insert(m_Stats.GetElement(i));
		}

		string errorMsg;
		if (JsonFileLoader<SST_LeaderboardPersisted>.SaveFile(STATE_FILE, file, errorMsg))
		{
			// First successful write after a failure - clear the gate so a
			// future failure logs again (helps surface intermittent locks).
			if (m_PersistErrorLogged)
			{
				Print("[SST_LB] persist recovered - leaderboard is being written again");
				m_PersistErrorLogged = false;
			}
			return;
		}

		// First attempt failed. Often this is because something external
		// (antivirus, web dashboard polling, OneDrive sync, prior abandoned
		// open) is holding a handle on the file. Try deleting the file and
		// writing fresh.
		if (FileExist(STATE_FILE) && DeleteFile(STATE_FILE))
		{
			if (JsonFileLoader<SST_LeaderboardPersisted>.SaveFile(STATE_FILE, file, errorMsg))
			{
				if (m_PersistErrorLogged)
				{
					Print("[SST_LB] persist recovered after delete+rewrite");
					m_PersistErrorLogged = false;
				}
				return;
			}
		}

		// Both attempts failed. Log once, then go silent. The data lives in
		// memory and the leaderboard window keeps working - we just can't
		// survive a restart until whatever is locking the file lets go.
		if (!m_PersistErrorLogged)
		{
			Print("[SST_LB] ERROR: failed to persist leaderboard to " + STATE_FILE + ": " + errorMsg);
			Print("[SST_LB] (further persist errors suppressed; in-memory leaderboard still works)");
			Print("[SST_LB] possible causes: missing -scrAllowFileWrite, web dashboard / antivirus / OneDrive sync holding the file open");
			m_PersistErrorLogged = true;
		}
	}

	protected void LoadPersistedState()
	{
		if (!FileExist(STATE_FILE))
			return;

		ref SST_LeaderboardPersisted file = new SST_LeaderboardPersisted();
		string errorMsg;
		if (!JsonFileLoader<SST_LeaderboardPersisted>.LoadFile(STATE_FILE, file, errorMsg))
		{
			Print("[SST_LB] WARNING: failed to load persisted leaderboard, starting fresh: " + errorMsg);
			return;
		}

		for (int i = 0; i < file.stats.Count(); i++)
		{
			ref SST_LeaderboardStats s = file.stats.Get(i);
			if (!s || s.playerId == "")
				continue;
			m_Stats.Insert(s.playerId, s);
		}

		Print("[SST_LB] Loaded persisted leaderboard with " + m_Stats.Count().ToString() + " entries");
	}

	protected void HydrateFromLifeEvents()
	{
		string folder = LIFE_EVENTS_FOLDER + "/";
		if (!FileExist(folder))
			return;

		string fileName;
		FileAttr fileAttr;
		FindFileHandle handle = FindFile(folder + "*.json", fileName, fileAttr, FindFileFlags.ALL);
		if (handle == 0)
			return;

		int filesProcessed = 0;
		bool more = true;
		while (more)
		{
			if (fileName != "" && fileName != "." && fileName != "..")
			{
				ProcessLifeEventFile(folder + fileName);
				filesProcessed++;
			}
			more = FindNextFile(handle, fileName, fileAttr);
		}
		CloseFindFile(handle);

		Print("[SST_LB] Hydrated from " + filesProcessed.ToString() + " life event files");
	}

	// Inventory files exist for every player who has connected and had their
	// inventory exported by SST. We use them to seed leaderboard entries with
	// just (playerName, playerId) so even players who never died/killed
	// appear in the list with zero stats.
	protected void HydrateFromInventories()
	{
		string folder = INVENTORIES_FOLDER + "/";
		if (!FileExist(folder))
			return;

		string fileName;
		FileAttr fileAttr;
		FindFileHandle handle = FindFile(folder + "*.json", fileName, fileAttr, FindFileFlags.ALL);
		if (handle == 0)
			return;

		int filesProcessed = 0;
		int playersSeeded = 0;
		bool more = true;
		while (more)
		{
			if (fileName != "" && fileName != "." && fileName != "..")
			{
				int seeded = ProcessInventoryFile(folder + fileName);
				playersSeeded = playersSeeded + seeded;
				filesProcessed++;
			}
			more = FindNextFile(handle, fileName, fileAttr);
		}
		CloseFindFile(handle);

		Print("[SST_LB] Hydrated from " + filesProcessed.ToString() + " inventory files - " + playersSeeded.ToString() + " players seeded");
	}

	// Returns how many entries were added/refreshed.
	protected int ProcessInventoryFile(string filePath)
	{
		ref SST_LB_InventoryFile file = new SST_LB_InventoryFile();
		string err;
		if (!JsonFileLoader<SST_LB_InventoryFile>.LoadFile(filePath, file, err))
			return 0;

		int seeded = 0;
		for (int i = 0; i < file.players.Count(); i++)
		{
			SST_LB_InventoryPlayerStub p = file.players.Get(i);
			if (!p || p.playerId == "")
				continue;
			if (GetOrCreate(p.playerId, p.playerName))
				seeded++;
		}
		return seeded;
	}

	protected void ProcessLifeEventFile(string filePath)
	{
		ref SST_LB_LifeEventsLog log = new SST_LB_LifeEventsLog();
		string errorMsg;
		if (!JsonFileLoader<SST_LB_LifeEventsLog>.LoadFile(filePath, log, errorMsg))
			return;

		if (log.playerId == "")
			return;

		SST_LeaderboardStats stats = GetOrCreate(log.playerId, log.playerName);
		if (!stats)
			return;

		int connectsInFile = 0;
		int deathsInFile = 0;

		for (int i = 0; i < log.events.Count(); i++)
		{
			SST_LB_LifeEventEntry evt = log.events.Get(i);
			if (!evt)
				continue;

			if (evt.eventType == "CONNECTED")
			{
				connectsInFile++;
			}
			else if (evt.eventType == "DIED")
			{
				deathsInFile++;
				string killerSteamId = ParseKillerSteamId(evt.causeOfDeath);
				if (killerSteamId != "" && killerSteamId != log.playerId)
				{
					string killerName = ParseKillerName(evt.causeOfDeath);
					SST_LeaderboardStats killer = GetOrCreate(killerSteamId, killerName);
					if (killer)
						killer.kills = killer.kills + 1;
				}
			}
		}

		if (stats.sessions < connectsInFile)
			stats.sessions = connectsInFile;
		if (stats.deaths < deathsInFile)
			stats.deaths = deathsInFile;
	}

	static string ParseKillerSteamId(string cause)
	{
		if (cause == "")
			return "";
		if (cause.IndexOf("Player:") != 0)
			return "";

		int openParen = cause.IndexOf("(");
		int closeParen = cause.LastIndexOf(")");
		if (openParen == -1 || closeParen == -1 || closeParen <= openParen + 1)
			return "";

		return cause.Substring(openParen + 1, closeParen - openParen - 1);
	}

	static string ParseKillerName(string cause)
	{
		if (cause == "" || cause.IndexOf("Player:") != 0)
			return "Unknown";

		int openParen = cause.IndexOf("(");
		if (openParen == -1)
			return "Unknown";

		int prefixLen = 7;
		string name = cause.Substring(prefixLen, openParen - prefixLen);
		name.TrimInPlace();
		if (name == "")
			return "Unknown";
		return name;
	}

	static void EnsureDir(string folderPath)
	{
		if (!FileExist(folderPath))
			MakeDirectory(folderPath);
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

	static string ShortHash(string steamId)
	{
		if (steamId == "" || steamId.Length() < 4)
			return "????";
		return "*" + steamId.Substring(steamId.Length() - 4, 4);
	}
}
