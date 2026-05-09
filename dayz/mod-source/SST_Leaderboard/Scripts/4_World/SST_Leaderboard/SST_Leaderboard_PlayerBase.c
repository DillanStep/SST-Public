/**
 * @file SST_Leaderboard_PlayerBase.c
 * @brief PlayerBase chains for the leaderboard mod.
 *
 * Lives in 4_World because Enfusion only allows `modded class X` in the
 * script module where X is originally declared, and PlayerBase is a
 * 4_World class.
 *
 * - Server-side: EEKilled records PvP kills with killer-victim distance,
 *   OnRPC handles the leaderboard request and sends back a JSON-encoded
 *   snapshot.
 * - Client-side: OnRPC routes the decoded snapshot through
 *   SST_LeaderboardClientBus (3_Game) so the 5_Mission menu can pick it up.
 */

modded class PlayerBase
{
	protected int m_SST_LB_LastRpcMs = 0;

	override void EEKilled(Object killer)
	{
		if (GetGame() && GetGame().IsServer())
		{
			RecordKillForLeaderboard(killer);
		}

		super.EEKilled(killer);
	}

	protected void RecordKillForLeaderboard(Object killer)
	{
		PlayerIdentity victimId = GetIdentity();
		if (!victimId)
			return;

		string victimSteam = victimId.GetPlainId();
		string victimName = victimId.GetName();

		PlayerBase killerPlayer = PlayerBase.Cast(killer);
		bool wasPvP = false;
		if (killerPlayer && killerPlayer != this)
		{
			PlayerIdentity killerIdent = killerPlayer.GetIdentity();
			if (killerIdent)
			{
				vector killerPos = killerPlayer.GetPosition();
				vector victimPos = GetPosition();
				float distance = vector.Distance(killerPos, victimPos);

				SST_LeaderboardServer.GetInstance().RecordPvPKill(
					killerIdent.GetPlainId(), killerIdent.GetName(),
					victimSteam, victimName,
					distance);
				wasPvP = true;
			}
		}

		if (!wasPvP)
		{
			SST_LeaderboardServer.GetInstance().RecordDeath(victimSteam, victimName);
		}

		// Always finalise the victim's life timer (longest-life record + reset
		// the in-progress counter) regardless of the cause of death.
		SST_LeaderboardServer.GetInstance().FinaliseLifeOnDeath(victimSteam, victimName);
	}

	override void OnRPC(PlayerIdentity sender, int rpc_type, ParamsReadContext ctx)
	{
		super.OnRPC(sender, rpc_type, ctx);

		if (rpc_type == SST_LB_RPC_REQUEST)
		{
			HandleLeaderboardRequest(sender, ctx);
			return;
		}

		if (rpc_type == SST_LB_RPC_RESPONSE)
		{
			HandleLeaderboardResponse(ctx);
			return;
		}
	}

	protected void HandleLeaderboardRequest(PlayerIdentity sender, ParamsReadContext ctx)
	{
		if (!GetGame() || !GetGame().IsServer())
			return;

		Param1<string> param = new Param1<string>("");
		if (!ctx.Read(param))
			return;

		string sortMode = param.param1;
		if (sortMode == "")
			sortMode = SST_LeaderboardSort.KILLS;

		int nowMs = GetGame().GetTime();
		if (m_SST_LB_LastRpcMs != 0 && (nowMs - m_SST_LB_LastRpcMs) < SST_LB_RATE_LIMIT_MS)
			return;
		m_SST_LB_LastRpcMs = nowMs;

		ref SST_LeaderboardSnapshot snap = SST_LeaderboardServer.GetInstance().BuildSnapshot(sortMode);

		string json;
		JsonSerializer js = new JsonSerializer();
		js.WriteToString(snap, false, json);

		Param1<string> reply = new Param1<string>(json);
		GetGame().RPCSingleParam(this, SST_LB_RPC_RESPONSE, reply, true, sender);
	}

	protected void HandleLeaderboardResponse(ParamsReadContext ctx)
	{
		if (!GetGame() || GetGame().IsServer())
			return;

		Param1<string> param = new Param1<string>("");
		if (!ctx.Read(param))
			return;

		string json = param.param1;
		if (json == "")
			return;

		ref SST_LeaderboardSnapshot snap = new SST_LeaderboardSnapshot();
		string err;
		JsonSerializer js = new JsonSerializer();
		if (!js.ReadFromString(snap, json, err))
		{
			Print("[SST_LB] Client: failed to parse leaderboard response: " + err);
			return;
		}

		SST_LeaderboardClientBus.Fire(snap);
	}
}
