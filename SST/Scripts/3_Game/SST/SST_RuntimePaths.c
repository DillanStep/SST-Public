/**
 * @file SST_RuntimePaths.c
 * @brief Shared runtime path helper for SST server-side scripts.
 *
 * DayZ resolves $profile: to the active server profile folder. SST writes its
 * bridge files under $profile:SST, not inside the @SST mod folder.
 */

class SST_RuntimePaths
{
	static const string PROFILE_ROOT = "$profile:SST";
	static const string API_FOLDER = "$profile:SST/api";
	static const string INVENTORIES_FOLDER = "$profile:SST/inventories";
	static const string EVENTS_FOLDER = "$profile:SST/events";
	static const string LIFE_EVENTS_FOLDER = "$profile:SST/life_events";
	static const string TRADES_FOLDER = "$profile:SST/trades";
	static const string VEHICLES_FOLDER = "$profile:SST/vehicles";
	
	protected static void EnsureDirectory(string folderPath, string label)
	{
		if (!FileExist(folderPath))
		{
			MakeDirectory(folderPath);
		}
		
		if (FileExist(folderPath))
		{
			Print("[SST] Runtime path ready (" + label + "): " + folderPath);
		}
		else
		{
			Print("[SST] ERROR: Failed to create runtime path (" + label + "): " + folderPath);
		}
	}
	
	static void EnsureProfileFolders()
	{
		Print("[SST] Ensuring runtime profile folders under $profile:SST");
		
		EnsureDirectory(PROFILE_ROOT, "root");
		EnsureDirectory(API_FOLDER, "api");
		EnsureDirectory(INVENTORIES_FOLDER, "inventories");
		EnsureDirectory(EVENTS_FOLDER, "events");
		EnsureDirectory(LIFE_EVENTS_FOLDER, "life_events");
		EnsureDirectory(TRADES_FOLDER, "trades");
		EnsureDirectory(VEHICLES_FOLDER, "vehicles");
	}
}
