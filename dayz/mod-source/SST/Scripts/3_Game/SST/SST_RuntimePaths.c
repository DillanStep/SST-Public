/**
 * @file SST_RuntimePaths.c
 * @brief Shared runtime path helper for SST server-side scripts.
 *
 * SST stores runtime bridge files under $profile:SST so the server can write
 * API bridge files without requiring a custom storage mount.
 */

class SST_RuntimePaths
{
	static const string PROFILE_ROOT = "$profile:SST";
	static const string STORAGE_ROOT = "$profile:SST";
	static const string LEGACY_STORAGE_ROOT = "$storage:SST";

	static const string API_FOLDER = "$profile:SST/api";
	static const string INVENTORIES_FOLDER = "$profile:SST/inventories";
	static const string EVENTS_FOLDER = "$profile:SST/events";
	static const string LIFE_EVENTS_FOLDER = "$profile:SST/life_events";
	static const string TRADES_FOLDER = "$profile:SST/trades";
	static const string VEHICLES_FOLDER = "$profile:SST/vehicles";

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

	static string ToLegacyRuntimePath(string runtimePath)
	{
		string legacyPath = runtimePath;
		if (legacyPath.IndexOf(PROFILE_ROOT) == 0)
		{
			legacyPath.Replace(PROFILE_ROOT, LEGACY_STORAGE_ROOT);
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
		Print("[SST] Ensuring runtime folders under $profile:SST");

		EnsureDirectory(STORAGE_ROOT, "root");
		EnsureDirectory(API_FOLDER, "api");
		EnsureDirectory(INVENTORIES_FOLDER, "inventories");
		EnsureDirectory(EVENTS_FOLDER, "events");
		EnsureDirectory(LIFE_EVENTS_FOLDER, "life_events");
		EnsureDirectory(TRADES_FOLDER, "trades");
		EnsureDirectory(VEHICLES_FOLDER, "vehicles");
	}
}
