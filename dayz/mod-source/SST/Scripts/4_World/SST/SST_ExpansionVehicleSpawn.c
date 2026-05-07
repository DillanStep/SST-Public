/**
 * @file SST_ExpansionVehicleSpawn.c
 * @brief Expansion Vehicles hook to detect trader purchases and log them.
 *
 * Hooks ExpansionCarKey.PairToVehicle() to record vehicle purchases when keys are
 * paired during an Expansion trader transaction.
 */

#ifdef EXPANSIONMODVEHICLE

// Hooks into Expansion's key pairing flow; only compiled with Expansion Vehicles.
modded class ExpansionCarKey
{
	// Override PairToVehicle to track when a key is paired to a vehicle (this happens during purchase)
	override void PairToVehicle(ExpansionVehicle vehicle)
	{
		// Call the original method first
		super.PairToVehicle(vehicle);
		
		// Get the owner player from the key's hierarchy
		PlayerBase player = PlayerBase.Cast(GetHierarchyRootPlayer());
		
		if (vehicle && player)
		{
			// Only log as a purchase if this is from a trader transaction
			// Check if there's an active market reserve (indicates trader purchase)
			ExpansionMarketReserve reserve = player.GetMarketReserve();
			
			// If no reserve or no trader, this is likely a key generated via dashboard - skip logging
			if (!reserve || !reserve.Trader)
			{
				Print("[SST] Key paired but no trader context - skipping purchase log (likely generated key)");
				return;
			}
			
			// Also check if this vehicle is already tracked to avoid duplicates
			int va, vb, vc, vd;
			vehicle.GetMasterKeyPersistentID(va, vb, vc, vd);
			string vehicleId = va.ToString() + "-" + vb.ToString() + "-" + vc.ToString() + "-" + vd.ToString();
			
			if (SST_VehicleTracker.IsVehicleTracked(vehicleId))
			{
				Print("[SST] Vehicle " + vehicleId + " already tracked - skipping duplicate log");
				return;
			}
			
			// Get trader info
			string traderName = reserve.Trader.GetDisplayName();
			string traderZone = "";
			int price = reserve.Price;
			
			ExpansionMarketTraderZone zone = reserve.Trader.GetTraderZone();
			if (zone)
				traderZone = zone.m_DisplayName;
			
			// Log the vehicle purchase
			string keyClassName = GetType();
			SST_VehicleTracker.LogVehiclePurchase(player, vehicle.GetEntity(), this, keyClassName, price, traderName, traderZone);
		}
	}
}

#endif