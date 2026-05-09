/**
 * @file SST_Tickets_PlayerBase.c
 * @brief PlayerBase RPC chain for tickets.
 *
 * Lives in 4_World - Enfusion only allows `modded class X` in the script
 * module where X is originally declared (PlayerBase is 4_World).
 *
 * Wire protocol:
 *   - SST_TK_RPC_LIST_REQUEST   (client -> server, no payload)
 *   - SST_TK_RPC_LIST_RESPONSE  (server -> client, JSON of SST_TicketsListSnapshot)
 *   - SST_TK_RPC_CREATE_REQUEST (client -> server, JSON of SST_TicketsCreatePayload)
 *   - SST_TK_RPC_CREATE_RESULT  (server -> client, JSON of SST_TicketsCreateResult)
 *
 * The server uses the RPC sender's PlayerIdentity to attribute the ticket -
 * the client never sends its own steamId, preventing impersonation.
 */

modded class PlayerBase
{
	protected int m_SST_TK_LastCreateMs = 0;

	override void OnRPC(PlayerIdentity sender, int rpc_type, ParamsReadContext ctx)
	{
		super.OnRPC(sender, rpc_type, ctx);

		if (rpc_type == SST_TK_RPC_LIST_REQUEST)
		{
			HandleListRequest(sender, ctx);
			return;
		}
		if (rpc_type == SST_TK_RPC_LIST_RESPONSE)
		{
			HandleListResponse(ctx);
			return;
		}
		if (rpc_type == SST_TK_RPC_CREATE_REQUEST)
		{
			HandleCreateRequest(sender, ctx);
			return;
		}
		if (rpc_type == SST_TK_RPC_CREATE_RESULT)
		{
			HandleCreateResult(ctx);
			return;
		}
	}

	// ------------------------------------------------------------------
	// Server-side handlers
	// ------------------------------------------------------------------

	protected void HandleListRequest(PlayerIdentity sender, ParamsReadContext ctx)
	{
		if (!GetGame() || !GetGame().IsServer() || !sender)
			return;

		string steamId = sender.GetPlainId();
		string playerName = sender.GetName();

		ref SST_TicketsListSnapshot snap = SST_TicketsServer.GetInstance().BuildListSnapshot(steamId, playerName);

		string json;
		JsonSerializer js = new JsonSerializer();
		js.WriteToString(snap, false, json);

		Param1<string> reply = new Param1<string>(json);
		GetGame().RPCSingleParam(this, SST_TK_RPC_LIST_RESPONSE, reply, true, sender);
	}

	protected void HandleCreateRequest(PlayerIdentity sender, ParamsReadContext ctx)
	{
		if (!GetGame() || !GetGame().IsServer() || !sender)
			return;

		Param1<string> param = new Param1<string>("");
		if (!ctx.Read(param))
			return;

		// Per-player throttle - prevents spam from a stuck/abusive client.
		int nowMs = GetGame().GetTime();
		if (m_SST_TK_LastCreateMs != 0 && (nowMs - m_SST_TK_LastCreateMs) < SST_TK_RATE_LIMIT_MS)
		{
			SendCreateResult(sender, false, "", "Please wait a few seconds before creating another ticket.");
			return;
		}

		ref SST_TicketsCreatePayload payload = new SST_TicketsCreatePayload();
		string err;
		JsonSerializer js = new JsonSerializer();
		if (!js.ReadFromString(payload, param.param1, err))
		{
			SendCreateResult(sender, false, "", "Server could not parse ticket payload.");
			return;
		}

		string steamId = sender.GetPlainId();
		string playerName = sender.GetName();

		string reason;
		string ticketId = SST_TicketsServer.GetInstance().CreateTicket(steamId, playerName, payload.subject, payload.body, reason);
		if (ticketId == "")
		{
			SendCreateResult(sender, false, "", reason);
			return;
		}

		m_SST_TK_LastCreateMs = nowMs;
		SendCreateResult(sender, true, ticketId, "");
	}

	protected void SendCreateResult(PlayerIdentity to, bool ok, string ticketId, string message)
	{
		ref SST_TicketsCreateResult res = new SST_TicketsCreateResult();
		res.ok = ok;
		res.ticketId = ticketId;
		res.message = message;

		string json;
		JsonSerializer js = new JsonSerializer();
		js.WriteToString(res, false, json);

		Param1<string> reply = new Param1<string>(json);
		GetGame().RPCSingleParam(this, SST_TK_RPC_CREATE_RESULT, reply, true, to);
	}

	// ------------------------------------------------------------------
	// Client-side handlers
	// ------------------------------------------------------------------

	protected void HandleListResponse(ParamsReadContext ctx)
	{
		if (!GetGame() || GetGame().IsServer())
			return;

		Param1<string> param = new Param1<string>("");
		if (!ctx.Read(param))
			return;

		ref SST_TicketsListSnapshot snap = new SST_TicketsListSnapshot();
		string err;
		JsonSerializer js = new JsonSerializer();
		if (!js.ReadFromString(snap, param.param1, err))
		{
			Print("[SST_TK] Client: failed to parse list response: " + err);
			return;
		}

		SST_TicketsClientBus.FireList(snap);
	}

	protected void HandleCreateResult(ParamsReadContext ctx)
	{
		if (!GetGame() || GetGame().IsServer())
			return;

		Param1<string> param = new Param1<string>("");
		if (!ctx.Read(param))
			return;

		ref SST_TicketsCreateResult res = new SST_TicketsCreateResult();
		string err;
		JsonSerializer js = new JsonSerializer();
		if (!js.ReadFromString(res, param.param1, err))
		{
			Print("[SST_TK] Client: failed to parse create result: " + err);
			return;
		}

		SST_TicketsClientBus.FireCreateResult(res);
	}
}
