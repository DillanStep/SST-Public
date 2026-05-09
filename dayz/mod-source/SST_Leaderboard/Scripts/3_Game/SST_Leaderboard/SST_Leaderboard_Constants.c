/**
 * @file SST_Leaderboard_Constants.c
 * @brief Shared constants for the SST_Leaderboard mod.
 *
 * Lives in 3_Game so both client and server compile against the same numbers.
 * RPC IDs are picked in the high decimal range to avoid collisions with
 * vanilla DayZ ERPCs (which sit in the low hundreds).
 */

const int MENU_SST_LEADERBOARD = 4242;

const int SST_LB_RPC_REQUEST  = 21001001; // client -> server: please send the leaderboard
const int SST_LB_RPC_RESPONSE = 21001002; // server -> client: here is the leaderboard JSON

class SST_LeaderboardSort
{
	static const string KILLS         = "kills";
	static const string DEATHS        = "deaths";
	static const string KD            = "kd";
	static const string SESSIONS      = "sessions";
	static const string LONGEST       = "longest";       // longest PvP shot (m)
	static const string ZOMBIE_KILLS  = "zombie_kills";
	static const string DISTANCE      = "distance";      // total meters travelled
	static const string LONGEST_LIFE  = "longest_life";  // longest single life (sec)
}

const int SST_LB_MAX_ROWS      = 25;
const int SST_LB_RATE_LIMIT_MS = 3000;

// Poll interval for distance/life sampling. Every 5 s strikes a balance:
//   - small enough that quitting between samples doesn't lose much progress
//   - large enough that 50 online players is a trivial server-tick cost
const float SST_LB_SAMPLE_POLL_MS = 5000.0;

// Sanity ceiling on per-sample distance. A player legitimately moving in a
// fast vehicle covers maybe ~150m in 5s. Anything past 1000m is a teleport
// (admin TP, expansion teleport, glitch) and shouldn't count.
const float SST_LB_MAX_PER_SAMPLE_METERS = 1000.0;
