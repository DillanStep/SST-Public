/**
 * @file SST_TicketsMenu.c
 * @brief Client-side ticket window for SST.
 *
 * Two views toggled by tab buttons:
 *   - LIST: scrollable rows of the player's existing tickets.
 *   - NEW:  form with subject + body + submit button.
 *
 * Cursor / camera lock pattern matches the leaderboard mod and the BI
 * NoteMenu pattern.
 */

class SST_TicketsMenuReceiver : SST_TicketsClientReceiver
{
	protected SST_TicketsMenu m_Owner;

	void SST_TicketsMenuReceiver(SST_TicketsMenu owner)
	{
		m_Owner = owner;
	}

	override void OnTicketsList(SST_TicketsListSnapshot snap)
	{
		if (m_Owner)
			m_Owner.OnListReceived(snap);
	}

	override void OnTicketsCreateResult(SST_TicketsCreateResult result)
	{
		if (m_Owner)
			m_Owner.OnCreateResult(result);
	}
}

class SST_TicketsMenu extends UIScriptedMenu
{
	protected ref SST_TicketsMenuReceiver m_Receiver;

	// Tabs / chrome
	protected ButtonWidget m_BtnTabList;
	protected ButtonWidget m_BtnTabNew;
	protected ButtonWidget m_BtnRefresh;
	protected ButtonWidget m_BtnClose;
	protected TextWidget   m_Status;

	// LIST view
	protected Widget       m_ListPanel;
	protected Widget       m_RowsParent;

	// NEW view
	protected Widget                 m_FormPanel;
	protected EditBoxWidget          m_SubjectInput;
	protected MultilineEditBoxWidget m_BodyInput;
	protected ButtonWidget           m_BtnSubmit;

	void SST_TicketsMenu()
	{
		MissionGameplay mg = MissionGameplay.Cast(GetGame().GetMission());
		if (mg)
		{
			IngameHud hud = IngameHud.Cast(mg.GetHud());
			if (hud)
				hud.ShowHudUI(false);
		}
	}

	void ~SST_TicketsMenu()
	{
		if (m_Receiver)
			SST_TicketsClientBus.ClearActive(m_Receiver);

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
		layoutRoot = GetGame().GetWorkspace().CreateWidgets("SST_Tickets/GUI/layouts/tickets.layout");
		if (!layoutRoot)
		{
			Print("[SST_TK] ERROR: Failed to load tickets.layout");
			return null;
		}

		m_BtnTabList   = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabList"));
		m_BtnTabNew    = ButtonWidget.Cast(layoutRoot.FindAnyWidget("TabNew"));
		m_BtnRefresh   = ButtonWidget.Cast(layoutRoot.FindAnyWidget("RefreshButton"));
		m_BtnClose     = ButtonWidget.Cast(layoutRoot.FindAnyWidget("CloseButton"));
		m_Status       = TextWidget.Cast(layoutRoot.FindAnyWidget("Status"));

		m_ListPanel    = layoutRoot.FindAnyWidget("ListPanel");
		m_RowsParent   = layoutRoot.FindAnyWidget("RowsParent");

		m_FormPanel    = layoutRoot.FindAnyWidget("FormPanel");
		m_SubjectInput = EditBoxWidget.Cast(layoutRoot.FindAnyWidget("SubjectInput"));
		m_BodyInput    = MultilineEditBoxWidget.Cast(layoutRoot.FindAnyWidget("BodyInput"));
		m_BtnSubmit    = ButtonWidget.Cast(layoutRoot.FindAnyWidget("SubmitButton"));

		m_Receiver = new SST_TicketsMenuReceiver(this);
		SST_TicketsClientBus.SetActive(m_Receiver);

		ShowListView();
		SetStatus("Loading your tickets...");
		RequestList();

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
		if (w == m_BtnTabList)
		{
			ShowListView();
			return true;
		}
		if (w == m_BtnTabNew)
		{
			ShowNewView();
			return true;
		}
		if (w == m_BtnRefresh)
		{
			SetStatus("Refreshing...");
			RequestList();
			return true;
		}
		if (w == m_BtnSubmit)
		{
			SubmitForm();
			return true;
		}
		return super.OnClick(w, x, y, button);
	}

	override void Update(float timeslice)
	{
		super.Update(timeslice);

		if (GetGame() && GetUApi().GetInputByID(UAUIBack).LocalPress())
			Close();
	}

	// ------------------------------------------------------------------
	// View switching
	// ------------------------------------------------------------------

	protected void ShowListView()
	{
		if (m_ListPanel) m_ListPanel.Show(true);
		if (m_FormPanel) m_FormPanel.Show(false);
	}

	protected void ShowNewView()
	{
		if (m_ListPanel) m_ListPanel.Show(false);
		if (m_FormPanel) m_FormPanel.Show(true);
	}

	// ------------------------------------------------------------------
	// LIST flow
	// ------------------------------------------------------------------

	protected void RequestList()
	{
		PlayerBase me = PlayerBase.Cast(GetGame().GetPlayer());
		if (!me)
		{
			SetStatus("No local player.");
			return;
		}

		// LIST_REQUEST takes no payload - send a placeholder string so the
		// generic Param-read on the server doesn't fail.
		Param1<string> param = new Param1<string>("");
		GetGame().RPCSingleParam(me, SST_TK_RPC_LIST_REQUEST, param, true, null);
	}

	void OnListReceived(SST_TicketsListSnapshot snap)
	{
		if (!snap || !m_RowsParent)
			return;

		ClearRows();

		int rendered = snap.tickets.Count();
		for (int i = 0; i < rendered; i++)
		{
			SST_TicketEntry t = snap.tickets.Get(i);
			BuildRow(t);
		}

		string status;
		if (rendered == 0)
		{
			status = "You have no tickets yet. Click NEW TICKET to create one.";
		}
		else
		{
			status = snap.openCount.ToString() + " open / " + snap.totalCount.ToString() + " total - last refreshed " + snap.generatedAt;
		}
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

	protected void BuildRow(SST_TicketEntry t)
	{
		if (!t || !m_RowsParent)
			return;

		Widget rowRoot = GetGame().GetWorkspace().CreateWidgets("SST_Tickets/GUI/layouts/tickets_row.layout", m_RowsParent);
		if (!rowRoot)
			return;

		TextWidget tId      = TextWidget.Cast(rowRoot.FindAnyWidget("TicketId"));
		TextWidget tSubject = TextWidget.Cast(rowRoot.FindAnyWidget("Subject"));
		TextWidget tStatus  = TextWidget.Cast(rowRoot.FindAnyWidget("Status"));
		TextWidget tCreated = TextWidget.Cast(rowRoot.FindAnyWidget("CreatedAt"));

		if (tId)      tId.SetText(t.ticketId);
		if (tSubject) tSubject.SetText(t.subject);
		if (tStatus)  tStatus.SetText(t.status);
		if (tCreated) tCreated.SetText(ShortDate(t.createdAt));
	}

	// "2026-05-09T15:46:21Z" -> "2026-05-09 15:46"
	protected string ShortDate(string iso)
	{
		if (iso.Length() < 16)
			return iso;
		string date = iso.Substring(0, 10);
		string time = iso.Substring(11, 5);
		return date + " " + time;
	}

	// ------------------------------------------------------------------
	// NEW flow
	// ------------------------------------------------------------------

	protected void SubmitForm()
	{
		if (!m_SubjectInput || !m_BodyInput)
			return;

		string subject = m_SubjectInput.GetText();
		// MultilineEditBoxWidget.GetText takes an out parameter, unlike
		// EditBoxWidget.GetText which returns a string directly. Verified
		// from the vanilla NoteMenu source.
		string body;
		m_BodyInput.GetText(body);

		string trimmedSubject = subject;
		trimmedSubject.TrimInPlace();
		if (trimmedSubject == "")
		{
			SetStatus("Subject cannot be empty.");
			return;
		}

		PlayerBase me = PlayerBase.Cast(GetGame().GetPlayer());
		if (!me)
		{
			SetStatus("No local player.");
			return;
		}

		ref SST_TicketsCreatePayload payload = new SST_TicketsCreatePayload();
		payload.subject = subject;
		payload.body = body;

		string json;
		JsonSerializer js = new JsonSerializer();
		js.WriteToString(payload, false, json);

		Param1<string> param = new Param1<string>(json);
		GetGame().RPCSingleParam(me, SST_TK_RPC_CREATE_REQUEST, param, true, null);

		SetStatus("Submitting ticket...");
		if (m_BtnSubmit)
			m_BtnSubmit.Enable(false);
	}

	void OnCreateResult(SST_TicketsCreateResult result)
	{
		if (m_BtnSubmit)
			m_BtnSubmit.Enable(true);

		if (!result)
			return;

		if (!result.ok)
		{
			SetStatus("Failed: " + result.message);
			return;
		}

		// Success: clear form, switch to list, refresh.
		if (m_SubjectInput) m_SubjectInput.SetText("");
		if (m_BodyInput)    m_BodyInput.SetText("");

		ShowListView();
		SetStatus("Ticket " + result.ticketId + " created. Refreshing...");
		RequestList();
	}

	protected void SetStatus(string s)
	{
		if (m_Status)
			m_Status.SetText(s);
	}
}
