class CfgPatches
{
	class SST
	{
		requiredAddons[] = 
		{
			"DZ_Scripts"
		};
	};
};

class CfgMods
{
	class SST
	{
		name = "SST - SUDO Server Tools";
		dir = "SST";
		type = "mod";

		dependencies[] = { "Game", "World", "Mission" };
		
		class defs
		{
			class gameScriptModule
			{
				files[] = { "SST/Scripts/3_Game" };
			};
			
			class worldScriptModule
			{
				files[] = { "SST/Scripts/4_World" };
			};
			
			class missionScriptModule
			{
				files[] = { "SST/Scripts/5_Mission" };
			};
		};
	};
};
