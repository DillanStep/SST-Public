/**
 * @file SST_RuntimePaths.c
 * @brief Shared runtime path helper for SST server-side scripts.
 *
 * SST stores runtime bridge files under $storage:SST. Older builds used
 * $profile:SST, so the legacy root remains available for read/migration.
 */

class SST_RuntimePaths
{
	static const string STORAGE_ROOT = "$storage:SST";
	static const string LEGACY_PROFILE_ROOT = "$profile:SST";

	// Kept for compatibility with older SST scripts that referenced PROFILE_ROOT.
	static const string PROFILE_ROOT = STORAGE_ROOT;

	static const string API_FOLDER = "$storage:SST/api";
	static const string INVENTORIES_FOLDER = "$storage:SST/inventories";
	static const string EVENTS_FOLDER = "$storage:SST/events";
	static const string LIFE_EVENTS_FOLDER = "$storage:SST/life_events";
	static const string TRADES_FOLDER = "$storage:SST/trades";
	static const string VEHICLES_FOLDER = "$storage:SST/vehicles";

	static string ApiFile(string fileName)
	{
		return API_FOLDER + "/" + fileName;
	}

	static string InventoryFile(string fileName)
	{
		return INVENTORIES_FOLDER + "/" + fileName;
	}

	static string EventFile(string fileName)
	{
		return EVENTS_FOLDER + "/" + fileName;
	}

	static string LifeEventFile(string fileName)
	{
		return LIFE_EVENTS_FOLDER + "/" + fileName;
	}

	static string TradeFile(string fileName)
	{
		return TRADES_FOLDER + "/" + fileName;
	}

	static string VehicleFile(string fileName)
	{
		return VEHICLES_FOLDER + "/" + fileName;
	}

	static string ToLegacyProfilePath(string storagePath)
	{
		string legacyPath = storagePath;
		if (legacyPath.IndexOf(STORAGE_ROOT) == 0)
		{
			legacyPath.Replace(STORAGE_ROOT, LEGACY_PROFILE_ROOT);
		}
		return legacyPath;
	}

	protected static void EnsureDirectory(string folderPath, string label)
	{
		bool created = true;

		if (!FileExist(folderPath))
		{
			created = MakeDirectory(folderPath);
		}

		if (FileExist(folderPath) || created)
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
		Print("[SST] Ensuring runtime storage folders under $storage:SST");

		EnsureDirectory(STORAGE_ROOT, "root");
		EnsureDirectory(API_FOLDER, "api");
		EnsureDirectory(INVENTORIES_FOLDER, "inventories");
		EnsureDirectory(EVENTS_FOLDER, "events");
		EnsureDirectory(LIFE_EVENTS_FOLDER, "life_events");
		EnsureDirectory(TRADES_FOLDER, "trades");
		EnsureDirectory(VEHICLES_FOLDER, "vehicles");
	}
}
