# Mod Scripts (Enforce Script)

This section documents each `.c` script file in `SST/Scripts/**`.

The SST mod uses a file-based bridge for most “API features”:

- Server → API: the server exports JSON snapshots/logs under `$storage:SST/`
- API → Server: the API writes JSON queues under `$storage:SST/api/`, the server processes them and writes `*_results.json`

## Key folders written at runtime

- `$storage:SST/inventories/` – per-player inventory exports
- `$storage:SST/events/` – per-player inventory event logs
- `$storage:SST/life_events/` – per-player life event logs
- `$storage:SST/trades/` – per-player trade logs
- `$storage:SST/vehicles/` – vehicle tracker state + purchase history (Expansion Vehicles)
- `$storage:SST/api/` – API queues + results (commands, grants, deletes, keys)

## Pages

- [API Feature Template](SST_ApiFeatureTemplate.md)
- [Player Commands](SST_PlayerCommands.md)
- [Inventory + Life Event Logger (+ Grant/Delete API)](SST_InventoryEventLogger.md)
- [Inventory Exporter + Init](SudoServerTools_Init.md)
- [Shared JSON DTOs](SST_ATMExportManager.md)
- [Expansion Market Hooks](SST_ExpansionMarketModule.md)
- [Expansion Vehicle Purchase Hook](SST_ExpansionVehicleSpawn.md)
- [Vehicle Tracker (keys/deletes/positions)](SST_VehicleTracker.md)
- [Trade Logger](SST_TradeLogger.md)
