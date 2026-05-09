/**
 * @file SST_TicketsMissionBase.c
 * @brief Registers SST_TicketsMenu with DayZ's menu factory.
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
				case MENU_SST_TICKETS:
					menu = new SST_TicketsMenu();
					break;
			}

			if (menu)
				menu.SetID(id);
		}

		return menu;
	}
}
