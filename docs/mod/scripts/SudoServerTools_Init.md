# SudoServerTools_Init.c

Purpose: mission-side initialization and scheduled exporters that write server state JSON under `$storage:SST/`.

Source file: [SST/Scripts/5_Mission/SST/SudoServerTools_Init.c](../../../SST/Scripts/5_Mission/SST/SudoServerTools_Init.c)

---

## What this file does

This is the “engine room” for SST exports.

It contains:

- the inventory exporter (`SST_InventoryExporter`)
- scheduled jobs that periodically write JSON snapshots for the API/dashboard
- (and additional init/exporters further down the file)

---

## Inventory exporting

### Output

- Folder: `$storage:SST/inventories/`
- Per-player file: `<steam64>.json`

This is the file the Node API reads for:

- `GET /inventory/:playerId`

### Start the exporter

Typically from mission init (or within the init class in this file):

```c
SST_InventoryExporter.Start();
```

### Export interval

The exporter runs every 10 seconds:

```c
static const float EXPORT_INTERVAL = 10000.0;
```

You can increase this interval to reduce disk I/O.

---

## How inventory is represented

Inventory serialization uses DTOs from:

- [SST_ATMExportManager.c](SST_ATMExportManager.md)

The exporter:

- enumerates full inventory (`EnumerateInventory`)
- filters to top-level items
- recursively captures attachments and cargo

Key converter:

- `ConvertItemToData(EntityAI item, int slotId = -1)`

---

## How to extend

Common improvements:

- Add more inventory metadata (temperature, wetness, quantity type)
- Add file versioning (schema version field) for safer evolution
- Add throttling per-player for very populated servers

When changing the JSON schema, update:

- the Node API JSON readers
- the dashboard UI parsers

---

## Related pages

- [Shared JSON DTOs](SST_ATMExportManager.md)
- [Inventory + Life Event Logger (+ Grant/Delete API)](SST_InventoryEventLogger.md)
