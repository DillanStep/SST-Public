class CfgPatches
{
	class SST_Tickets
	{
		units[] = {};
		weapons[] = {};
		requiredVersion = 0.1;
		requiredAddons[] =
		{
			"DZ_Scripts",
			"SST"
		};
	};
};

class CfgMods
{
	class SST_Tickets
	{
		name = "SST Tickets";
		dir = "SST_Tickets";
		picture = "";
		action = "";
		author = "Sudo Server Tools";
		overview = "In-game ticket system. Type !ticket in chat to open the menu and view or create support tickets.";
		type = "mod";

		dependencies[] = { "Game", "World", "Mission" };
		inputs = "SST_Tickets/Inputs.xml";

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
				files[] = { "SST_Tickets/Scripts/3_Game" };
			};
			class worldScriptModule
			{
				files[] = { "SST_Tickets/Scripts/4_World" };
			};
			class missionScriptModule
			{
				files[] = { "SST_Tickets/Scripts/5_Mission" };
			};
		};
	};
};
