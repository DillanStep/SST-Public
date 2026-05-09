/**
 * @file SST_LeaderboardMissionGameplay.c
 * @brief Client-side keybind that toggles the leaderboard.
 *
 * Cursor / camera lock and game HUD hide/show is handled by the menu itself
 * (UIScriptedMenu.OnShow / OnHide / destructor) so it stays correct even when
 * something else closes the menu (ESC, CloseAll, etc).
 */
modded class MissionGameplay
{
	override void OnUpdate(float timeslice)
	{
		super.OnUpdate(timeslice);

		Input input = GetGame().GetInput();
		if (!input)
			return;

		if (input.LocalPress("UASSTLeaderboardToggle", false))
			ToggleSSTLeaderboard();
	}

	void ToggleSSTLeaderboard()
	{
		UIManager um = GetGame().GetUIManager();
		if (!um)
			return;

		if (um.FindMenu(MENU_SST_LEADERBOARD))
		{
			um.Back();
			return;
		}

		if (um.GetMenu())
			return;

		if (!GetGame().GetPlayer())
			return;

		um.EnterScriptedMenu(MENU_SST_LEADERBOARD, null);
	}
}
