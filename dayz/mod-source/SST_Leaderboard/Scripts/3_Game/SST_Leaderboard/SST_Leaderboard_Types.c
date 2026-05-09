/**
 * @file SST_Leaderboard_Types.c
 * @brief Shared JSON DTOs + client-side dispatcher.
 *
 * The DTOs are used on both ends of the wire:
 * - Server-side aggregator builds SST_LeaderboardSnapshot and JSON-encodes it.
 * - Client-side menu decodes the same struct after receiving the RPC.
 *
 * The dispatcher (SST_LeaderboardClientBus) lets the 4_World RPC handler hand
 * snapshots to the 5_Mission menu without referencing it directly.
 */

class SST_LeaderboardEntry
{
	string playerName;
	string playerHash;
	int    kills;
	int    deaths;
	int    sessions;
	float  longestShotMeters;
	int    zombieKills;
	float  totalDistanceMeters;
	int    longestLifeSeconds;   // longest single life ever (record)
	int    currentLifeSeconds;   // current life duration (0 if dead)
}

class SST_LeaderboardSnapshot
{
	string generatedAt;
	string sortMode;
	int    totalPlayersTracked;
	ref array<ref SST_LeaderboardEntry> entries = new array<ref SST_LeaderboardEntry>();
}

class SST_LeaderboardClientReceiver
{
	void OnLeaderboardSnapshot(SST_LeaderboardSnapshot snap) { }
}

class SST_LeaderboardClientBus
{
	protected static SST_LeaderboardClientReceiver s_Active;

	static void SetActive(SST_LeaderboardClientReceiver r)
	{
		s_Active = r;
	}

	static void ClearActive(SST_LeaderboardClientReceiver r)
	{
		if (s_Active == r)
			s_Active = null;
	}

	static void Fire(SST_LeaderboardSnapshot snap)
	{
		if (s_Active && snap)
			s_Active.OnLeaderboardSnapshot(snap);
	}
}
