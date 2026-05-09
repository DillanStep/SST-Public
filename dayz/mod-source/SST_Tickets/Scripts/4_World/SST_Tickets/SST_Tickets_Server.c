/**
 * @file SST_Tickets_Server.c
 * @brief Server-side ticket store.
 *
 * Self-contained: does not reference any SST script symbol because mod load
 * order between @SST and @SST_Tickets isn't guaranteed.
 *
 * Storage layout (one file per player so the dashboard / API can paginate
 * cheaply and so a single corrupt file can't take down everyone's tickets):
 *   $storage:SST/api/tickets/<steam64>.json
 *
 * Tickets are appended to the per-player file. The file also tracks
 * nextSequence so ticket ids stay monotonic across server restarts.
 */

class SST_TicketsServer
{
	protected static ref SST_TicketsServer s_Instance;

	static const string STORAGE_ROOT   = "$storage:SST";
	static const string API_FOLDER     = "$storage:SST/api";
	static const string TICKETS_FOLDER = "$storage:SST/api/tickets";

	static SST_TicketsServer GetInstance()
	{
		if (!s_Instance)
			s_Instance = new SST_TicketsServer();
		return s_Instance;
	}

	static void Start()
	{
		if (!GetGame() || !GetGame().IsServer())
			return;
		GetInstance().Init();
	}

	protected void Init()
	{
		Print("[SST_TK] TicketsServer initializing...");
		EnsureDir(STORAGE_ROOT);
		EnsureDir(API_FOLDER);
		EnsureDir(TICKETS_FOLDER);
		Print("[SST_TK] TicketsServer ready");
	}

	// ------------------------------------------------------------------
	// Per-player file IO
	// ------------------------------------------------------------------

	static string FileForPlayer(string steamId)
	{
		return TICKETS_FOLDER + "/" + steamId + ".json";
	}

	ref SST_TicketsFile LoadOrCreate(string steamId, string playerName)
	{
		ref SST_TicketsFile file = new SST_TicketsFile();
		file.playerId = steamId;
		file.playerName = playerName;
		file.nextSequence = 1;

		string path = FileForPlayer(steamId);
		if (!FileExist(path))
			return file;

		string err;
		if (!JsonFileLoader<SST_TicketsFile>.LoadFile(path, file, err))
		{
			Print("[SST_TK] WARNING: failed to load tickets file for " + steamId + ": " + err + " - starting fresh");
			file = new SST_TicketsFile();
			file.playerId = steamId;
			file.playerName = playerName;
			file.nextSequence = 1;
			return file;
		}

		// Refresh display name in case the player changed it.
		if (playerName != "" && file.playerName != playerName)
			file.playerName = playerName;

		// Defensive: nextSequence must be at least max(existing) + 1.
		int maxSeq = file.nextSequence;
		for (int i = 0; i < file.tickets.Count(); i++)
		{
			SST_TicketEntry t = file.tickets.Get(i);
			if (!t)
				continue;
			int seqFromId = ParseSequenceFromTicketId(t.ticketId);
			if (seqFromId >= maxSeq)
				maxSeq = seqFromId + 1;
		}
		if (maxSeq > file.nextSequence)
			file.nextSequence = maxSeq;

		return file;
	}

	bool Save(SST_TicketsFile file)
	{
		if (!file || file.playerId == "")
			return false;

		string path = FileForPlayer(file.playerId);
		string err;
		if (!JsonFileLoader<SST_TicketsFile>.SaveFile(path, file, err))
		{
			Print("[SST_TK] ERROR: failed to save tickets for " + file.playerId + ": " + err);
			return false;
		}
		return true;
	}

	// ------------------------------------------------------------------
	// Mutations
	// ------------------------------------------------------------------

	// Returns ticketId of the new ticket on success, "" on failure (with
	// reason populated).
	string CreateTicket(string steamId, string playerName, string subject, string body, out string reason)
	{
		string subjTrimmed = subject;
		subjTrimmed.TrimInPlace();
		string bodyTrimmed = body;
		bodyTrimmed.TrimInPlace();

		if (subjTrimmed == "")
		{
			reason = "Subject is required.";
			return "";
		}
		if (subjTrimmed.Length() > SST_TK_MAX_SUBJECT_LEN)
		{
			subjTrimmed = subjTrimmed.Substring(0, SST_TK_MAX_SUBJECT_LEN);
		}
		if (bodyTrimmed.Length() > SST_TK_MAX_BODY_LEN)
		{
			bodyTrimmed = bodyTrimmed.Substring(0, SST_TK_MAX_BODY_LEN);
		}

		ref SST_TicketsFile file = LoadOrCreate(steamId, playerName);

		string nowTs = GetUTCTimestamp();
		ref SST_TicketEntry t = new SST_TicketEntry();
		t.ticketId = string.Format("T-%1-%2", steamId.Substring(steamId.Length() - 4, 4), file.nextSequence.ToString());
		t.playerId = steamId;
		t.playerName = playerName;
		t.subject = subjTrimmed;
		t.body = bodyTrimmed;
		t.status = SST_TicketStatus.OPEN;
		t.createdAt = nowTs;
		t.updatedAt = nowTs;
		file.tickets.Insert(t);
		file.nextSequence = file.nextSequence + 1;

		// Cap retained tickets per player.
		while (file.tickets.Count() > SST_TK_MAX_PER_PLAYER)
			file.tickets.Remove(0);

		if (!Save(file))
		{
			reason = "Server failed to persist the ticket.";
			return "";
		}

		Print("[SST_TK] Ticket created: " + t.ticketId + " for " + playerName + " (" + steamId + ")");
		return t.ticketId;
	}

	ref SST_TicketsListSnapshot BuildListSnapshot(string steamId, string playerName)
	{
		ref SST_TicketsListSnapshot snap = new SST_TicketsListSnapshot();
		snap.generatedAt = GetUTCTimestamp();
		snap.playerId = steamId;
		snap.openCount = 0;
		snap.totalCount = 0;

		if (steamId == "")
			return snap;

		ref SST_TicketsFile file = LoadOrCreate(steamId, playerName);
		snap.totalCount = file.tickets.Count();

		// Newest first.
		for (int i = file.tickets.Count() - 1; i >= 0; i--)
		{
			SST_TicketEntry t = file.tickets.Get(i);
			if (!t)
				continue;
			snap.tickets.Insert(t);
			if (t.status == SST_TicketStatus.OPEN || t.status == SST_TicketStatus.IN_PROGRESS)
				snap.openCount = snap.openCount + 1;
		}
		return snap;
	}

	// ------------------------------------------------------------------
	// Helpers
	// ------------------------------------------------------------------

	// Tickets ids are like "T-1234-7" - returns 7. Returns 0 on parse failure.
	static int ParseSequenceFromTicketId(string ticketId)
	{
		int lastDash = ticketId.LastIndexOf("-");
		if (lastDash == -1 || lastDash >= ticketId.Length() - 1)
			return 0;
		string tail = ticketId.Substring(lastDash + 1, ticketId.Length() - lastDash - 1);
		return tail.ToInt();
	}

	static void EnsureDir(string folderPath)
	{
		if (!FileExist(folderPath))
			MakeDirectory(folderPath);
	}

	static string GetUTCTimestamp()
	{
		int year, month, day, hour, minute, second;
		GetYearMonthDayUTC(year, month, day);
		GetHourMinuteSecondUTC(hour, minute, second);
		return string.Format("%1-%2-%3T%4:%5:%6Z",
			year.ToStringLen(4),
			month.ToStringLen(2),
			day.ToStringLen(2),
			hour.ToStringLen(2),
			minute.ToStringLen(2),
			second.ToStringLen(2));
	}
}
