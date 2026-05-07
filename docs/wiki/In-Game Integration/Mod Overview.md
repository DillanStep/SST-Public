# Mod Overview

The SST mod runs inside the DayZ server and is responsible for:

- exporting server state to JSON (server → API)
- processing JSON queues written by the Node API (API → server)

This avoids needing custom network protocols and makes debugging easy (you can open the JSON files and see exactly what happened).

## Runtime folders

SST writes under `$profile:SST/`.

Key folders:

- `inventories/` – player inventory snapshots
- `events/` – inventory event logs
- `life_events/` – life event logs
- `trades/` – trade logs
- `vehicles/` – vehicle tracking state
- `api/` – command queues + results

## Where to start

- [JSON Export](JSON%20Export.md)
- [Command Queue](Command%20Queue.md)
