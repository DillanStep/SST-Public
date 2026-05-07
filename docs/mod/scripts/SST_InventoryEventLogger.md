# SST_InventoryEventLogger.c

Purpose: logs inventory events + life events to JSON, and also contains the server-side processors for item grant and (later in file) other API-driven item actions.

Source file: [dayz/mod-source/SST/Scripts/4_World/SST/SST_InventoryEventLogger.c](../../../dayz/mod-source/SST/Scripts/4_World/SST/SST_InventoryEventLogger.c)

---

## What it covers

This file is large because it groups several related systems:

- Inventory event logging (`SST_InventoryEventLogger`)
- Player life event logging (`SST_PlayerLifeEventLogger`)
- Item grant queue processor (`SST_ItemGrantAPI`)
- (Also includes additional queue processors further down the file)

All of these write JSON for the API/dashboard to consume.

---

## Inventory event logging

### Output

- Folder: `$profile:SST/events/`
- File pattern: `<steam64>_events.json`

The schema types are defined in [SST_ATMExportManager.c](SST_ATMExportManager.md).

### How to log

Call the static helper appropriate to the event:

```c
SST_InventoryEventLogger.LogDropped(player, item, item.GetPosition());
SST_InventoryEventLogger.LogPickedUp(player, item, item.GetPosition());
SST_InventoryEventLogger.LogAdded(player, item, item.GetPosition());
SST_InventoryEventLogger.LogRemoved(player, item, item.GetPosition());
```

The logger keeps only the most recent 100 events per player.

---

## Life event logging

### Output

- Folder: `$profile:SST/life_events/`
- File pattern: `<steam64>_life.json`

### How to log

```c
SST_PlayerLifeEventLogger.LogSpawn(player);
SST_PlayerLifeEventLogger.LogDeath(player, killer);
SST_PlayerLifeEventLogger.LogConnect(player);
SST_PlayerLifeEventLogger.LogDisconnect(player);
```

It keeps the most recent 50 events per player.

---

## Item grants (API → server)

### Files

- Queue: `$profile:SST/api/item_grants.json`
- Results: `$profile:SST/api/item_grants_results.json`

The Node API writes `{ "requests": [...] }` with each request matching `SST_ItemGrantRequest` in [SST_ATMExportManager.c](SST_ATMExportManager.md).

### Starting the processor

This processor is typically started from mission init:

```c
SST_ItemGrantAPI.Start();
```

It polls every 5 seconds by default.

### Adding validation

If you want stricter input handling (allowed items, max quantity, etc.), add checks before spawning/granting and set `request.result` to a stable error code.

---

## How to modify safely

- Prefer extending DTOs (add new fields) rather than renaming
- Keep retention caps low to avoid file bloat
- Ensure all gameplay mutations are guarded with `GetGame().IsServer()`

---

## Related pages

- [Shared JSON DTOs](SST_ATMExportManager.md)
- [Player Commands](SST_PlayerCommands.md)
- [Inventory Exporter + Init](SudoServerTools_Init.md)
