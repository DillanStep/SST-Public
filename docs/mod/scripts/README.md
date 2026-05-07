# Mod Scripts (Enforce Script)

This section documents each `.c` script file in `dayz/mod-source/SST/Scripts/**`.

The SST mod uses a file-based bridge for most “API features”:

- Server → API: the server exports JSON snapshots/logs under `$profile:SST/`
- API → Server: the API writes JSON queues under `$profile:SST/api/`, the server processes them and writes `*_results.json`

## Key folders written at runtime

- `$profile:SST/inventories/` – per-player inventory exports
- `$profile:SST/events/` – per-player inventory event logs
- `$profile:SST/life_events/` – per-player life event logs
- `$profile:SST/trades/` – per-player trade logs
- `$profile:SST/vehicles/` – vehicle tracker state + purchase history (Expansion Vehicles)
- `$profile:SST/api/` – API queues + results (commands, grants, deletes, keys)

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
