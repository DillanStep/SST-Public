/**
 * @file SST_Persistence.c
 * @brief File-backed persistence facade for SST runtime JSON.
 *
 * Features should route runtime reads/writes through this layer so the storage
 * backend can later switch from FILE to REST without touching every feature.
 */

class SST_PersistenceBackend
{
	bool EnsureDirectory(string folderPath, string label = "")
	{
		return false;
	}

	bool FileExists(string filePath)
	{
		return false;
	}

	string ResolveReadPath(string filePath)
	{
		return filePath;
	}

	bool ShouldWrite(string filePath, string signature = "")
	{
		return true;
	}

	void MarkWritten(string filePath, string signature = "")
	{
	}
}

class SST_FilePersistenceBackend : SST_PersistenceBackend
{
	protected ref map<string, string> m_LastWriteSignatures;

	void SST_FilePersistenceBackend()
	{
		m_LastWriteSignatures = new map<string, string>();
	}

	override bool EnsureDirectory(string folderPath, string label = "")
	{
		bool created = true;

		if (!FileExist(folderPath))
		{
			created = MakeDirectory(folderPath);
		}

		if (FileExist(folderPath) || created)
		{
			if (label != "")
				Print("[SST] Runtime path ready (" + label + "): " + folderPath);
			return true;
		}

		Print("[SST] ERROR: Failed to create runtime path (" + label + "): " + folderPath);
		return false;
	}

	override bool FileExists(string filePath)
	{
		if (FileExist(filePath))
			return true;

		string legacyPath = SST_RuntimePaths.ToLegacyRuntimePath(filePath);
		return legacyPath != filePath && FileExist(legacyPath);
	}

	override string ResolveReadPath(string filePath)
	{
		if (FileExist(filePath))
			return filePath;

		string legacyPath = SST_RuntimePaths.ToLegacyRuntimePath(filePath);
		if (legacyPath != filePath && FileExist(legacyPath))
		{
			Print("[SST] Reading legacy runtime file for migration: " + legacyPath);
			return legacyPath;
		}

		return filePath;
	}

	override bool ShouldWrite(string filePath, string signature = "")
	{
		if (signature == "")
			return true;

		if (m_LastWriteSignatures.Contains(filePath) && m_LastWriteSignatures.Get(filePath) == signature)
			return false;

		return true;
	}

	override void MarkWritten(string filePath, string signature = "")
	{
		if (signature == "")
			return;

		m_LastWriteSignatures.Set(filePath, signature);
	}
}

class SST_PersistenceCore
{
	protected static ref SST_PersistenceBackend s_Backend;

	static SST_PersistenceBackend GetBackend()
	{
		if (!s_Backend)
			s_Backend = new SST_FilePersistenceBackend();

		return s_Backend;
	}

	static void UseFileBackend()
	{
		s_Backend = new SST_FilePersistenceBackend();
	}

	static bool EnsureDirectory(string folderPath, string label = "")
	{
		return GetBackend().EnsureDirectory(folderPath, label);
	}

	static bool FileExists(string filePath)
	{
		return GetBackend().FileExists(filePath);
	}

	static string ResolveReadPath(string filePath)
	{
		return GetBackend().ResolveReadPath(filePath);
	}

	static bool ShouldWrite(string filePath, string signature = "")
	{
		return GetBackend().ShouldWrite(filePath, signature);
	}

	static void MarkWritten(string filePath, string signature = "")
	{
		GetBackend().MarkWritten(filePath, signature);
	}

	static void EnsureParentDirectory(string filePath)
	{
		int separator = filePath.LastIndexOf("/");
		if (separator == -1)
			separator = filePath.LastIndexOf("\\");

		if (separator <= 0)
			return;

		string folderPath = filePath.Substring(0, separator);
		EnsureDirectory(folderPath);
	}
}

class SST_Persistence<Class T>
{
	static bool LoadJson(string filePath, out T data, out string errorMsg)
	{
		string resolvedPath = SST_PersistenceCore.ResolveReadPath(filePath);
		bool loaded = JsonFileLoader<T>.LoadFile(resolvedPath, data, errorMsg);

		if (loaded && resolvedPath != filePath)
		{
			string migrateError;
			SST_PersistenceCore.EnsureParentDirectory(filePath);
			if (JsonFileLoader<T>.SaveFile(filePath, data, migrateError))
			{
				Print("[SST] Migrated runtime file to storage: " + filePath);
			}
			else
			{
				Print("[SST] WARNING: Could not migrate runtime file to storage: " + migrateError);
			}
		}

		return loaded;
	}

	static bool SaveJson(string filePath, T data, out string errorMsg)
	{
		SST_PersistenceCore.EnsureParentDirectory(filePath);
		bool saved = JsonFileLoader<T>.SaveFile(filePath, data, errorMsg);
		if (saved)
			SST_PersistenceCore.MarkWritten(filePath);
		return saved;
	}

	static bool SaveJsonIfChanged(string filePath, T data, string signature, out string errorMsg)
	{
		if (!SST_PersistenceCore.ShouldWrite(filePath, signature))
		{
			errorMsg = "";
			return true;
		}

		SST_PersistenceCore.EnsureParentDirectory(filePath);
		bool saved = JsonFileLoader<T>.SaveFile(filePath, data, errorMsg);
		if (saved)
			SST_PersistenceCore.MarkWritten(filePath, signature);
		return saved;
	}
}
