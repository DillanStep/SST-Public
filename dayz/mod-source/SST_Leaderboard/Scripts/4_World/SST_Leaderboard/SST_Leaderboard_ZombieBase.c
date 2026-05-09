/**
 * @file SST_Leaderboard_ZombieBase.c
 * @brief Credits zombie kills to the player who killed them.
 *
 * The `killer` argument to EEKilled is whatever entity delivered the killing
 * blow. For melee that's usually the PlayerBase directly, but for any ranged
 * weapon it's the weapon entity (held by the player) - or for projectiles,
 * sometimes an intermediate ammo/projectile entity. We have to walk up the
 * hierarchy via GetHierarchyRootPlayer() to find the actual player.
 *
 * Lives in 4_World because ZombieBase is declared in the world script module
 * (Enfusion only allows modded class X in the same module as X).
 */
modded class ZombieBase
{
	override void EEKilled(Object killer)
	{
		if (GetGame() && GetGame().IsServer())
		{
			RecordZombieKillForLeaderboard(killer);
		}

		super.EEKilled(killer);
	}

	protected void RecordZombieKillForLeaderboard(Object killer)
	{
		// Try multiple strategies to identify the player who killed this
		// infected. Order matters - cheapest first.
		PlayerBase killerPlayer = ResolveKillerPlayer(killer);

		if (!killerPlayer)
		{
			// Useful diagnostic when zombie kills aren't crediting - tells
			// us exactly what the engine handed us.
			string killerType = "<null>";
			if (killer)
				killerType = killer.GetType();
			Print("[SST_LB] Zombie killed but couldn't resolve player from killer type=" + killerType);
			return;
		}

		PlayerIdentity ident = killerPlayer.GetIdentity();
		if (!ident)
			return;

		string steamId = ident.GetPlainId();
		string playerName = ident.GetName();
		Print("[SST_LB] Zombie kill credited to " + playerName + " (" + steamId + ")");

		SST_LeaderboardServer.GetInstance().RecordZombieKill(steamId, playerName);
	}

	// Best-effort resolution of "who actually killed this thing":
	//   1. killer IS a PlayerBase (melee with bare hands, or knife)
	//   2. killer is a weapon/item held by a player - GetHierarchyRootPlayer()
	//   3. killer's hierarchy parent is a player (rarely needed but free)
	protected PlayerBase ResolveKillerPlayer(Object killer)
	{
		if (!killer)
			return null;

		PlayerBase direct = PlayerBase.Cast(killer);
		if (direct)
			return direct;

		EntityAI ai = EntityAI.Cast(killer);
		if (ai)
		{
			Man hr = ai.GetHierarchyRootPlayer();
			if (hr)
			{
				PlayerBase asPlayer = PlayerBase.Cast(hr);
				if (asPlayer)
					return asPlayer;
			}

			EntityAI hp = ai.GetHierarchyParent();
			if (hp)
			{
				PlayerBase parentPlayer = PlayerBase.Cast(hp);
				if (parentPlayer)
					return parentPlayer;
			}
		}

		return null;
	}
}
