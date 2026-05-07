/**
 * @file SST_ExpansionMarketModule.c
 * @brief Expansion Market hooks to log purchases and sales.
 *
 * Hooks ExpansionMarketModule confirmation calls to record successful purchases
 * and sales into the SST trade log.
 */

#ifdef EXPANSIONMODMARKET

// Hooks into Expansion Market module lifecycle; only compiled with Expansion Market.
modded class ExpansionMarketModule
{
	// Override Exec_ConfirmPurchase to log purchases after they succeed
	override private void Exec_ConfirmPurchase(notnull PlayerBase player, string itemClassName, bool includeAttachments = true, int skinIndex = -1)
	{
		// Get reserve data BEFORE calling super (which clears it)
		ExpansionMarketReserve reserve = player.GetMarketReserve();
		
		string traderName = "";
		string traderZone = "";
		vector traderPosition = vector.Zero;
		int totalAmount = 0;
		int price = 0;
		string itemDisplayName = itemClassName;
		
		if (reserve)
		{
			totalAmount = reserve.TotalAmount;
			price = reserve.Price;
			
			if (reserve.RootItem)
			{
				// Use ClassName since DisplayName isn't available on ExpansionMarketItem
				itemDisplayName = reserve.RootItem.ClassName;
			}
			
			if (reserve.Trader)
			{
				traderName = reserve.Trader.GetDisplayName();
				
				ExpansionTraderObjectBase traderObj = reserve.Trader;
				if (traderObj && traderObj.GetTraderEntity())
				{
					traderPosition = traderObj.GetTraderEntity().GetPosition();
				}
				
				ExpansionMarketTraderZone zone = reserve.Trader.GetTraderZone();
				if (zone)
				{
					traderZone = zone.m_DisplayName;
					if (traderPosition == vector.Zero)
						traderPosition = zone.Position;
				}
			}
		}
		
		// Call the original method
		super.Exec_ConfirmPurchase(player, itemClassName, includeAttachments, skinIndex);
		
		// Log the purchase if it was successful
		// The original method will have cleared the reserve if successful
		// We check if the player's reserve was cleared (meaning success)
		ExpansionMarketReserve afterReserve = player.GetMarketReserve();
		if (!afterReserve || !afterReserve.Valid)
		{
			// Trade was successful (reserve was cleared)
			if (totalAmount > 0 && price > 0)
			{
				SST_TradeLogger.LogPurchase(player, itemClassName, itemDisplayName, totalAmount, price, traderName, traderZone, traderPosition);
			}
		}
	}
	
	// Override Exec_ConfirmSell to log sales after they succeed
	override private void Exec_ConfirmSell(notnull PlayerBase player, string itemClassName)
	{
		// Get sell data BEFORE calling super (which clears it)
		ExpansionMarketSell sell = player.GetMarketSell();
		
		string traderName = "";
		string traderZone = "";
		vector traderPosition = vector.Zero;
		int totalAmount = 0;
		int price = 0;
		string itemDisplayName = itemClassName;
		
		if (sell)
		{
			totalAmount = sell.TotalAmount;
			price = sell.Price;
			
			if (sell.Item)
			{
				// Use ClassName since DisplayName isn't available on ExpansionMarketItem
				itemDisplayName = sell.Item.ClassName;
			}
			
			if (sell.Trader)
			{
				traderName = sell.Trader.GetDisplayName();
				
				ExpansionTraderObjectBase traderObj = sell.Trader;
				if (traderObj && traderObj.GetTraderEntity())
				{
					traderPosition = traderObj.GetTraderEntity().GetPosition();
				}
				
				ExpansionMarketTraderZone zone = sell.Trader.GetTraderZone();
				if (zone)
				{
					traderZone = zone.m_DisplayName;
					if (traderPosition == vector.Zero)
						traderPosition = zone.Position;
				}
			}
		}
		
		// Call the original method
		super.Exec_ConfirmSell(player, itemClassName);
		
		// Log the sale if it was successful
		// The original method will have cleared the sell data if successful
		ExpansionMarketSell afterSell = player.GetMarketSell();
		if (!afterSell || afterSell.Sell.Count() == 0)
		{
			// Trade was successful (sell data was cleared)
			if (totalAmount > 0 && price > 0)
			{
				SST_TradeLogger.LogSale(player, itemClassName, itemDisplayName, totalAmount, price, traderName, traderZone, traderPosition);
			}
		}
	}
}

#endif
