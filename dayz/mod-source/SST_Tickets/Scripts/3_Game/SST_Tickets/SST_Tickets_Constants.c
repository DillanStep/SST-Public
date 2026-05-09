/**
 * @file SST_Tickets_Constants.c
 * @brief Shared constants for the SST_Tickets mod.
 */

const int MENU_SST_TICKETS = 4243;

const int SST_TK_RPC_LIST_REQUEST   = 21002001; // client -> server: send my tickets
const int SST_TK_RPC_LIST_RESPONSE  = 21002002; // server -> client: ticket list JSON
const int SST_TK_RPC_CREATE_REQUEST = 21002003; // client -> server: create ticket
const int SST_TK_RPC_CREATE_RESULT  = 21002004; // server -> client: ticket id + status

class SST_TicketStatus
{
	static const string OPEN        = "open";
	static const string IN_PROGRESS = "in_progress";
	static const string RESOLVED    = "resolved";
	static const string CLOSED      = "closed";
}

const int SST_TK_MAX_PER_PLAYER  = 50;     // hard cap before old tickets get pruned
const int SST_TK_MAX_SUBJECT_LEN = 80;
const int SST_TK_MAX_BODY_LEN    = 2000;
const int SST_TK_RATE_LIMIT_MS   = 5000;   // per-player throttle for create
