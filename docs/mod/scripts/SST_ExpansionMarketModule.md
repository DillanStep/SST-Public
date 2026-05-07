# SST_ExpansionMarketModule.c

Purpose: hooks Expansion Market purchase/sell confirmation to log trades into SST.

Source file: [dayz/mod-source/SST/Scripts/4_World/SST/SST_ExpansionMarketModule.c](../../../dayz/mod-source/SST/Scripts/4_World/SST/SST_ExpansionMarketModule.c)

---

## Build/compile conditions

This script is only compiled when Expansion Market is present:

```c
#ifdef EXPANSIONMODMARKET
...
#endif
```

If Expansion Market is not enabled, this file has no effect.

---

## What it hooks

It overrides private confirmation flows:

- `Exec_ConfirmPurchase(PlayerBase player, string itemClassName, ...)`
- `Exec_ConfirmSell(PlayerBase player, string itemClassName)`

The key idea is:

- capture `reserve/sell` info **before** `super.*` (because the base method clears it)
- call `super.*`
- detect success by verifying the reserve/sell data was cleared
- if successful, write a trade event via `SST_TradeLogger`

---

## Data captured

For purchases/sales it tries to capture:

- item class name
- quantity and price
- trader name
- trader zone name
- trader position (entity position or zone position)

See the fields being passed to:

- `SST_TradeLogger.LogPurchase(...)`
- `SST_TradeLogger.LogSale(...)`

---

## How to modify

### Add more context

If you want attachments, currency, or skin data:

- Capture the relevant fields from `reserve` or `sell` before calling `super.*`
- Extend `SST_TradeEventData` in [SST_TradeLogger.c](SST_TradeLogger.md)

### Ensure you don’t log failed trades

The file intentionally logs **only after successful confirmation**.

If you change the success detection, verify you still skip failed/cancelled transactions.

---

## Related pages

- [Trade Logger](SST_TradeLogger.md)
