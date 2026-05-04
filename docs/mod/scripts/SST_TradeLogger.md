# SST_TradeLogger.c

Purpose: logs **Expansion Market** purchases and sales to per-player JSON files under `$storage:SST/trades/`.

Source file: [SST/Scripts/4_World/SST/SST_TradeLogger.c](../../../SST/Scripts/4_World/SST/SST_TradeLogger.c)

---

## What it produces

Per-player trade logs:

- Folder: `$storage:SST/trades/`
- File pattern: `<steam64>_trades.json`

The log structure is:

- `SST_PlayerTradeLog` (root)
  - totals (`totalPurchases`, `totalSales`, `totalSpent`, `totalEarned`)
  - `trades[]` (array of `SST_TradeEventData`)

---

## Where the events come from

This logger does not detect trades by itself.

Events are created by **hooks into Expansion Market** in:

- [SST_ExpansionMarketModule.c](SST_ExpansionMarketModule.md)

Those hooks call:

- `SST_TradeLogger.LogPurchase(...)`
- `SST_TradeLogger.LogSale(...)`

---

## How to modify behavior

### Change retention

Right now it keeps the last **500** trade events per player:

```c
while (playerLog.trades.Count() > 500)
{
	playerLog.trades.Remove(0);
}
```

If you increase this, trade JSON files will grow quickly on busy servers.

### Add new fields

To add more detail (e.g., currency type, trader id, item attachments), you’ll need to:

1. Add fields to `SST_TradeEventData`
2. Populate them in `LogTrade(...)`
3. Update any API readers/UI components that parse these files

---

## Example: logging custom events

You can log non-market trades too (as long as you define an event type):

```c
SST_TradeLogger.GetInstance().LogTrade(
	"PURCHASE",
	player,
	item.GetType(),
	item.GetDisplayName(),
	1,
	500,
	"AdminTrader",
	"AdminZone",
	player.GetPosition()
);
```

---

## Common pitfalls

- `GetIdentity()` can be null very early; the logger guards against that.
- The logger is server-only; don’t call from client logic.

---

## Related pages

- [Expansion Market Hooks](SST_ExpansionMarketModule.md)
