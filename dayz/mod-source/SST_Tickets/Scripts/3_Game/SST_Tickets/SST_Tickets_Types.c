/**
 * @file SST_Tickets_Types.c
 * @brief Shared JSON DTOs + client-side dispatcher.
 *
 * Same shape on disk ($storage:SST/api/tickets/<steam64>.json) and over RPC.
 * Field names must stay matched on both ends.
 */

class SST_TicketComment
{
	string author;          // "player" or "admin:<steam64>" or "system"
	string content;
	string timestamp;       // ISO-8601 UTC
}

class SST_TicketEntry
{
	string ticketId;        // unique within a player file
	string playerId;        // Steam64
	string playerName;      // last known
	string subject;
	string body;
	string status;          // SST_TicketStatus.*
	string createdAt;
	string updatedAt;
	ref array<ref SST_TicketComment> comments = new array<ref SST_TicketComment>();
}

// Per-player file. One file per player at $storage:SST/api/tickets/<steam64>.json.
class SST_TicketsFile
{
	string playerId;
	string playerName;
	int    nextSequence;    // monotonic id allocator within this file
	ref array<ref SST_TicketEntry> tickets = new array<ref SST_TicketEntry>();
}

// Wire payload sent in RPC LIST_RESPONSE.
class SST_TicketsListSnapshot
{
	string generatedAt;
	string playerId;
	int    openCount;
	int    totalCount;
	ref array<ref SST_TicketEntry> tickets = new array<ref SST_TicketEntry>();
}

// Wire payload sent in RPC CREATE_REQUEST.
class SST_TicketsCreatePayload
{
	string subject;
	string body;
}

// Wire payload sent in RPC CREATE_RESULT.
class SST_TicketsCreateResult
{
	bool   ok;
	string ticketId;
	string message;     // user-facing error text, only when ok==false
}

// ---------------------------------------------------------------------------
// Client-side dispatcher
// ---------------------------------------------------------------------------

class SST_TicketsClientReceiver
{
	void OnTicketsList(SST_TicketsListSnapshot snap) { }
	void OnTicketsCreateResult(SST_TicketsCreateResult result) { }
}

class SST_TicketsClientBus
{
	protected static SST_TicketsClientReceiver s_Active;

	static void SetActive(SST_TicketsClientReceiver r)
	{
		s_Active = r;
	}

	static void ClearActive(SST_TicketsClientReceiver r)
	{
		if (s_Active == r)
			s_Active = null;
	}

	static void FireList(SST_TicketsListSnapshot snap)
	{
		if (s_Active && snap)
			s_Active.OnTicketsList(snap);
	}

	static void FireCreateResult(SST_TicketsCreateResult result)
	{
		if (s_Active && result)
			s_Active.OnTicketsCreateResult(result);
	}
}
