/**
 * @file SST_TicketsMissionServer.c
 * @brief Boots the server-side ticket store at mission init.
 */
modded class MissionServer
{
	override void OnInit()
	{
		super.OnInit();

		if (GetGame().IsServer())
		{
			Print("[SST_TK] MissionServer.OnInit - starting TicketsServer");
			SST_TicketsServer.Start();
		}
	}
}
