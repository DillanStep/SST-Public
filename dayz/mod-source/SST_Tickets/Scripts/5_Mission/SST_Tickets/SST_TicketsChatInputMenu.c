/**
 * @file SST_TicketsChatInputMenu.c
 * @brief Intercepts the `!ticket` chat command and opens the ticket menu.
 *
 * Pattern verified against DayZ ChatInputMenu source (dayzexplorer.zeroy.com):
 *   override bool OnChange(Widget w, int x, int y, bool finished)
 *   {
 *     super.OnChange(w, x, y, finished);
 *     if (!finished) return false;
 *     string text = m_edit_box.GetText();
 *     ...
 *     GetGame().ChatPlayer(text);
 *   }
 *
 * `m_edit_box` is a protected EditBoxWidget on ChatInputMenu, and its
 * GetText() returns a string directly (verified by the same source).
 *
 * IMPORTANT: we cannot CallLater bound to `this` because Close() destroys
 * the chat menu in the same tick, invalidating any deferred delegate. We
 * route the open through MissionGameplay (which persists for the session).
 */
modded class ChatInputMenu
{
	override bool OnChange(Widget w, int x, int y, bool finished)
	{
		Print("[SST_TK] ChatInputMenu.OnChange finished=" + finished.ToString());

		if (finished && m_edit_box)
		{
			string text = m_edit_box.GetText();
			text.TrimInPlace();
			Print("[SST_TK] Chat text on submit: \"" + text + "\"");

			if (IsTicketCommand(text))
			{
				Print("[SST_TK] !ticket command detected - opening menu");
				m_edit_box.SetText(""); // suppress chat send

				MissionGameplay mg = MissionGameplay.Cast(GetGame().GetMission());
				if (mg)
				{
					mg.SST_TK_RequestOpenTicketMenu();
				}
				else
				{
					Print("[SST_TK] ERROR: Mission is not MissionGameplay - cannot defer open");
				}

				Close();
				return true;
			}
		}

		return super.OnChange(w, x, y, finished);
	}

	protected bool IsTicketCommand(string text)
	{
		string lower = text;
		lower.ToLower();
		return lower == "!ticket" || lower == "!tickets";
	}
}
