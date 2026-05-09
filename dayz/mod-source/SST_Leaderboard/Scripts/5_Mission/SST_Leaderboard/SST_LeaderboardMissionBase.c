/**
 * @file SST_LeaderboardMissionBase.c
 * @brief Registers SST_LeaderboardMenu with DayZ's menu factory.
 *
 * Pattern verified against the official DayZ Community Sample
 * (Thurston00/DayZ-CommunitySamples - missionBase.c).
 */
modded class MissionBase
{
	override UIScriptedMenu CreateScriptedMenu(int id)
	{
		UIScriptedMenu menu = super.CreateScriptedMenu(id);

		if (!menu)
		{
			switch (id)
			{
				case MENU_SST_LEADERBOARD:
					menu = new SST_LeaderboardMenu();
					break;
			}

			if (menu)
				menu.SetID(id);
		}

		return menu;
	}
}
