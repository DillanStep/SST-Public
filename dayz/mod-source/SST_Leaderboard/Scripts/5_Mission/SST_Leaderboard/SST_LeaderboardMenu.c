/**
 * @file SST_LeaderboardMenu.c
 * @brief Client-side leaderboard menu for SST.
 *
 * Lifecycle:
 *  - constructor: hide vanilla HUD (matches NoteMenu pattern).
 *  - Init():      load layout, register with the snapshot bus, request data.
 *  - OnShow():    lock player input + show cursor (camera stops moving with mouse).
 *  - OnHide():    reverse those.
 *  - destructor:  belt-and-suspenders unlock + show HUD.
 *
 * Locking pattern verified from Thurston00/DayZ-CommunitySamples/UISample
 * (LockControls/UnlockControls in missionGameplay.c).
 */

class SST_LeaderboardMenuReceiver : SST_LeaderboardClientReceiver
{
	protected SST_LeaderboardMenu m_Owner;

	void SST_LeaderboardMenuReceiver(SST_LeaderboardMenu owner)
	{
		m_Owner = owner;
	}

	override void OnLeaderboardSnapshot(SST_LeaderboardSnapshot snap)
	{
		if (m_Owner)
			m_Owner.OnSnapshotReceived(snap);
	}
}

class SST_LeaderboardMenu extends UIScriptedMenu
{
	protected ref SST_LeaderboardMenuReceiver m_Receiver;

	protected ButtonWidget m_BtnKills;
	protected ButtonWidget m_BtnZombies;
	protected ButtonWidget m_BtnDeaths;
	protected ButtonWidget m_BtnKD;
	protected ButtonWidget m_BtnDistance;
	protected ButtonWidget m_BtnLife;
	protected ButtonWidget m_BtnSessions;
	protected ButtonWidget m_BtnLongest;
	protected ButtonWidget m_BtnClose;

	protected Widget       m_RowsParent;
	protected TextWidget   m_Status;

	protected string m_CurrentSort = SST_LeaderboardSort.KILLS;

	void SST_LeaderboardMenu()
	{
		// Hide the vanilla HUD while the menu is up (vanilla NoteMenu pattern).
		MissionGameplay mg = MissionGameplay.Cast(GetGame().GetMission());
		if (mg)
		{
			IngameHud hud = IngameHud.Cast(mg.GetHud());
			if (hud)
				hud.ShowHudUI(false);
		}
	}

	void ~SST_LeaderboardMenu()
	{
		if (m_Receiver)
			SST_LeaderboardClientBus.ClearActive(m_Receiver);

		// Belt-and-suspenders: ensure HUD + controls are restored even if OnHide
		// didn't fire (e.g. UIManager.CloseAll on round end).
		UnlockPlayerControls();

		MissionGameplay mg = MissionGameplay.Cast(GetGame().GetMission());
		if (mg)
		{
			IngameHud hud = IngameHud.Cast(mg.GetHud());
			if (hud)
				hud.ShowHudUI(true);
		}
	}

	override Widget Init()
	{
		layoutRoot = GetGame().GetWorkspace().CreateWidgets("SST_Leaderboard/GUI/layouts/leaderboard.layout");
		if (!layoutRoot)
		{
			Print("[SST_LB] ERROR: Failed to load leaderboard.layout");
			return null;
		}

		m_BtnKills    = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabKills"));
		m_BtnZombies  = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabZombies"));
		m_BtnDeaths   = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabDeaths"));
		m_BtnKD       = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabKD"));
		m_BtnDistance = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabDistance"));
		m_BtnLife     = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabLife"));
		m_BtnSessions = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabSessions"));
		m_BtnLongest  = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabLongest"));
		m_BtnClose    = ButtonWidget.Cast(layoutRoot.FindAnyWidget("CloseButton"));
		m_RowsParent  = layoutRoot.FindAnyWidget("RowsParent");
		m_Status      = TextWidget.Cast(layoutRoot.FindAnyWidget("Status"));

		m_Receiver = new SST_LeaderboardMenuReceiver(this);
		SST_LeaderboardClientBus.SetActive(m_Receiver);

		SetStatus("Requesting data from server...");
		RequestSnapshot(m_CurrentSort);

		return layoutRoot;
	}

	override void OnShow()
	{
		super.OnShow();
		LockPlayerControls();
	}

	override void OnHide()
	{
		super.OnHide();
		UnlockPlayerControls();
	}

	protected void LockPlayerControls()
	{
		Mission mission = GetGame().GetMission();
		if (mission)
			mission.PlayerControlDisable(INPUT_EXCLUDE_ALL);

		UIManager um = GetGame().GetUIManager();
		if (um)
			um.ShowUICursor(true);
	}

	protected void UnlockPlayerControls()
	{
		Mission mission = GetGame().GetMission();
		if (mission)
			mission.PlayerControlEnable(false);

		Input input = GetGame().GetInput();
		if (input)
			input.ResetGameFocus();

		UIManager um = GetGame().GetUIManager();
		if (um)
			um.ShowUICursor(false);
	}

	override bool OnClick(Widget w, int x, int y, int button)
	{
		if (w == m_BtnClose)
		{
			Close();
			return true;
		}
		if (w == m_BtnKills)    { SwitchSort(SST_LeaderboardSort.KILLS);        return true; }
		if (w == m_BtnZombies)  { SwitchSort(SST_LeaderboardSort.ZOMBIE_KILLS); return true; }
		if (w == m_BtnDeaths)   { SwitchSort(SST_LeaderboardSort.DEATHS);       return true; }
		if (w == m_BtnKD)       { SwitchSort(SST_LeaderboardSort.KD);           return true; }
		if (w == m_BtnDistance) { SwitchSort(SST_LeaderboardSort.DISTANCE);     return true; }
		if (w == m_BtnLife)     { SwitchSort(SST_LeaderboardSort.LONGEST_LIFE); return true; }
		if (w == m_BtnSessions) { SwitchSort(SST_LeaderboardSort.SESSIONS);     return true; }
		if (w == m_BtnLongest)  { SwitchSort(SST_LeaderboardSort.LONGEST);      return true; }
		return super.OnClick(w, x, y, button);
	}

	// ESC closes the menu (NoteMenu pattern - poll UAUIBack inside Update).
	override void Update(float timeslice)
	{
		super.Update(timeslice);

		if (GetGame() && GetUApi().GetInputByID(UAUIBack).LocalPress())
			Close();
	}

	void SwitchSort(string sortMode)
	{
		if (m_CurrentSort == sortMode)
			return;
		m_CurrentSort = sortMode;
		SetStatus("Requesting " + sortMode + " leaderboard...");
		RequestSnapshot(sortMode);
	}

	protected void RequestSnapshot(string sortMode)
	{
		PlayerBase me = PlayerBase.Cast(GetGame().GetPlayer());
		if (!me)
		{
			SetStatus("No local player - cannot request leaderboard");
			return;
		}

		Param1<string> param = new Param1<string>(sortMode);
		GetGame().RPCSingleParam(me, SST_LB_RPC_REQUEST, param, true, null);
	}

	void OnSnapshotReceived(SST_LeaderboardSnapshot snap)
	{
		if (!snap || !m_RowsParent)
			return;

		ClearRows();

		int rendered = snap.entries.Count();
		for (int i = 0; i < rendered; i++)
		{
			SST_LeaderboardEntry entry = snap.entries.Get(i);
			BuildRow(i + 1, entry, snap.sortMode);
		}

		string status = "Showing " + rendered.ToString() + " of " + snap.totalPlayersTracked.ToString() + " players - sorted by " + snap.sortMode + " - " + snap.generatedAt;
		SetStatus(status);
	}

	protected void ClearRows()
	{
		if (!m_RowsParent)
			return;

		Widget child = m_RowsParent.GetChildren();
		while (child)
		{
			Widget next = child.GetSibling();
			m_RowsParent.RemoveChild(child);
			delete child;
			child = next;
		}
	}

	protected void BuildRow(int rank, SST_LeaderboardEntry entry, string sortMode)
	{
		if (!entry || !m_RowsParent)
			return;

		Widget rowRoot = GetGame().GetWorkspace().CreateWidgets("SST_Leaderboard/GUI/layouts/leaderboard_row.layout", m_RowsParent);
		if (!rowRoot)
			return;

		TextWidget tRank   = TextWidget.Cast(rowRoot.FindAnyWidget("Rank"));
		TextWidget tName   = TextWidget.Cast(rowRoot.FindAnyWidget("Name"));
		TextWidget tKills  = TextWidget.Cast(rowRoot.FindAnyWidget("Kills"));
		TextWidget tDeaths = TextWidget.Cast(rowRoot.FindAnyWidget("Deaths"));
		TextWidget tKD     = TextWidget.Cast(rowRoot.FindAnyWidget("KD"));
		TextWidget tValue  = TextWidget.Cast(rowRoot.FindAnyWidget("Value"));

		if (tRank)   tRank.SetText(rank.ToString());
		if (tName)   tName.SetText(entry.playerName + " " + entry.playerHash);
		if (tKills)  tKills.SetText(entry.kills.ToString());
		if (tDeaths) tDeaths.SetText(entry.deaths.ToString());
		if (tKD)     tKD.SetText(FormatKD(entry.kills, entry.deaths));
		if (tValue)  tValue.SetText(FormatValueForSort(entry, sortMode));
	}

	protected string FormatKD(int kills, int deaths)
	{
		if (deaths == 0)
		{
			if (kills == 0)
				return "0.00";
			return kills.ToString() + ".00";
		}
		float kd = kills / (float)deaths;
		float scaled = Math.Floor(kd * 100.0);
		float lo = scaled / 100.0;
		return lo.ToString();
	}

	protected string FormatValueForSort(SST_LeaderboardEntry entry, string sortMode)
	{
		if (sortMode == SST_LeaderboardSort.LONGEST)
			return Math.Floor(entry.longestShotMeters).ToString() + " m";
		if (sortMode == SST_LeaderboardSort.SESSIONS)
			return entry.sessions.ToString();
		if (sortMode == SST_LeaderboardSort.DEATHS)
			return entry.deaths.ToString();
		if (sortMode == SST_LeaderboardSort.KD)
			return FormatKD(entry.kills, entry.deaths);
		if (sortMode == SST_LeaderboardSort.ZOMBIE_KILLS)
			return entry.zombieKills.ToString();
		if (sortMode == SST_LeaderboardSort.DISTANCE)
			return FormatDistance(entry.totalDistanceMeters);
		if (sortMode == SST_LeaderboardSort.LONGEST_LIFE)
		{
			int best = entry.longestLifeSeconds;
			if (entry.currentLifeSeconds > best)
				best = entry.currentLifeSeconds;
			return FormatDuration(best);
		}
		return entry.kills.ToString();
	}

	// 12345 -> "12.35 km"; 850 -> "850 m"
	protected string FormatDistance(float meters)
	{
		if (meters < 1000.0)
			return Math.Floor(meters).ToString() + " m";
		float km = meters / 1000.0;
		float scaled = Math.Floor(km * 100.0);
		float trimmed = scaled / 100.0;
		return trimmed.ToString() + " km";
	}

	// 90061 -> "1d 1h"; 4023 -> "1h 7m"; 95 -> "1m 35s"
	protected string FormatDuration(int seconds)
	{
		if (seconds <= 0)
			return "-";
		int days = seconds / 86400;
		int hours = (seconds % 86400) / 3600;
		int mins  = (seconds % 3600) / 60;
		int secs  = seconds % 60;
		if (days > 0)
			return days.ToString() + "d " + hours.ToString() + "h";
		if (hours > 0)
			return hours.ToString() + "h " + mins.ToString() + "m";
		return mins.ToString() + "m " + secs.ToString() + "s";
	}

	protected void SetStatus(string s)
	{
		if (m_Status)
			m_Status.SetText(s);
	}
}
