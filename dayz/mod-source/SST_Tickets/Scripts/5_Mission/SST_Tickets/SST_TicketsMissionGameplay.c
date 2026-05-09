/**
 * @file SST_TicketsMissionGameplay.c
 * @brief Hosts the deferred "open ticket menu" callback + the keybind poll.
 *
 * Two ways for the user to open the ticket menu:
 *   1. Default keybind T (action UASSTTicketsToggle in Inputs.xml). Always
 *      works regardless of which chat mod is active. Rebindable in Controls
 *      > Persistent.
 *   2. Typing !ticket in chat (only works with vanilla chat - Expansion's
 *      chat replaces ChatInputMenu so the chat hook never fires there).
 *
 * The chat hook calls SST_TK_RequestOpenTicketMenu so it can defer the open
 * past the chat menu's destructor (CallLater bound to a doomed object would
 * be silently dropped).
 */
modded class MissionGameplay
{
	override void OnUpdate(float timeslice)
	{
		super.OnUpdate(timeslice);

		Input input = GetGame().GetInput();
		if (!input)
			return;

		if (input.LocalPress("UASSTTicketsToggle", false))
			SST_TK_ToggleTicketMenu();
	}

	void SST_TK_ToggleTicketMenu()
	{
		UIManager um = GetGame().GetUIManager();
		if (!um)
			return;

		if (um.FindMenu(MENU_SST_TICKETS))
		{
			um.Back();
			return;
		}

		if (um.GetMenu())
			return;

		if (!GetGame().GetPlayer())
			return;

		Print("[SST_TK] Opening ticket menu (keybind)");
		um.EnterScriptedMenu(MENU_SST_TICKETS, null);
	}

	// Called from the chat hook (SST_TicketsChatInputMenu.OnChange).
	void SST_TK_RequestOpenTicketMenu()
	{
		GetGame().GetCallQueue(CALL_CATEGORY_GUI).CallLater(SST_TK_OpenTicketMenuNow, 1, false);
	}

	void SST_TK_OpenTicketMenuNow()
	{
		UIManager um = GetGame().GetUIManager();
		if (!um)
			return;

		if (um.GetMenu())
			return;

		if (!GetGame().GetPlayer())
			return;

		Print("[SST_TK] Opening ticket menu (chat command)");
		um.EnterScriptedMenu(MENU_SST_TICKETS, null);
	}
}
