class CfgPatches
{
	class SST_Leaderboard
	{
		units[] = {};
		weapons[] = {};
		requiredVersion = 0.1;
		requiredAddons[] =
		{
			"DZ_Scripts"
		};
	};
};

class CfgMods
{
	class SST_Leaderboard
	{
		name = "SST Leaderboard";
		dir = "SST_Leaderboard";
		picture = "";
		action = "";
		author = "Sudo Server Tools";
		overview = "Adds an in-game leaderboard window that pulls player stats from the SST server-side mod.";
		type = "mod";

		dependencies[] = { "Game", "World", "Mission" };
		inputs = "SST_Leaderboard/Inputs.xml";

		class defs
		{
			class imageSets
			{
				files[] = {};
			};
			class widgetStyles
			{
				files[] = {};
			};

			class gameScriptModule
			{
				files[] = { "SST_Leaderboard/Scripts/3_Game" };
			};
			class worldScriptModule
			{
				files[] = { "SST_Leaderboard/Scripts/4_World" };
			};
			class missionScriptModule
			{
				files[] = { "SST_Leaderboard/Scripts/5_Mission" };
			};
		};
	};
};
