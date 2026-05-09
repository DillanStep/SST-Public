/**
 * @file SST_LeaderboardMissionServer.c
 * @brief Server-side MissionServer hooks for the leaderboard.
 *
 * - OnInit boots SST_LeaderboardServer (loads persisted state, hydrates from
 *   SST life events).
 * - InvokeOnConnect increments the player's session counter.
 */
modded class MissionServer
{
	override void OnInit()
	{
		super.OnInit();

		if (GetGame().IsServer())
		{
			Print("[SST_LB] MissionServer.OnInit - starting LeaderboardServer");
			SST_LeaderboardServer.Start();
		}
	}

	override void InvokeOnConnect(PlayerBase player, PlayerIdentity identity)
	{
		super.InvokeOnConnect(player, identity);

		if (GetGame().IsServer() && player && identity)
		{
			SST_LeaderboardServer.GetInstance().RecordConnect(identity.GetPlainId(), identity.GetName());
		}
	}
}
