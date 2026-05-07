# SST_ATMExportManager.c

Purpose: shared JSON DTOs (data-only classes) used by multiple SST exporters and API queues.

Source file: [dayz/mod-source/SST/Scripts/3_Game/SST/SST_ATMExportManager.c](../../../dayz/mod-source/SST/Scripts/3_Game/SST/SST_ATMExportManager.c)

---

## What this file is

This file intentionally contains **no runtime logic**. It is a collection of "plain old data" classes designed to be safe with `JsonFileLoader`.

These types are consumed by other systems:

- Inventory exporting (mission-side)
- Inventory event logging + life event logging
- Item grant queue + results
- Item delete queue + results
- Online player tracking exports

If you’re adding a new exporter/queue feature, you typically add/extend DTOs here (or create a new DTO file) so the rest of the code can reuse the same schema.

---

## How to modify safely

Rules of thumb:

- Only use JSON-friendly field types:
  - `string`, `int`, `float`, `bool`, `vector`
  - arrays/maps of other DTOs (when you control them)
- Prefer **additive** changes (add a new field) over renaming/removing fields.
  - Removing/renaming breaks existing JSON files and any API readers.
- If you must rename a field, consider:
  - supporting both names in the API reader for one release
  - bumping a schema version in the file format

---

## Key DTOs and what writes them

### Inventory export DTOs

- `SST_InventoryItemData`
- `SST_PlayerInventoryData`
- `SST_InventoryExportData`

Written by: mission exporter in [SudoServerTools_Init.c](SudoServerTools_Init.md)

### Inventory event logging DTOs

- `SST_InventoryEventType`
- `SST_InventoryEventData`
- `SST_PlayerInventoryEventsLog`

Written by: [SST_InventoryEventLogger.c](SST_InventoryEventLogger.md)

### Life event logging DTOs

- `SST_PlayerLifeEventType`
- `SST_PlayerLifeEventData`
- `SST_PlayerLifeEventsLog`

Written by: [SST_InventoryEventLogger.c](SST_InventoryEventLogger.md)

### Item grant / delete DTOs

- `SST_ItemGrantRequest`, `SST_ItemGrantQueue`
- `SST_ItemDeleteRequest`, `SST_ItemDeleteQueue`

Used by: grant/delete processors (implemented in [SST_InventoryEventLogger.c](SST_InventoryEventLogger.md)) and queued by the Node API.

### Server item list DTOs

- `SST_ServerItemEntry`, `SST_ServerItemList`

Used by: item list generation (API-side reads the resulting JSON).

### Online tracking DTOs

- `SST_OnlinePlayerData`, `SST_OnlinePlayersData`

Used by: online exporter (mission-side init exports these periodically).

---

## Example: adding a field

Say you want to track an item’s rarity in the item list:

```c
class SST_ServerItemEntry
{
	string className;
	string displayName;
	string category;
	string parentClass;
	bool canBeStacked;
	int maxQuantity;

	string rarity; // NEW FIELD
}
```

Then update the code that constructs `SST_ServerItemEntry` instances to populate `rarity`, and update the Node API reader to tolerate missing `rarity` for older JSON.

---

## Related pages

- [Inventory Exporter + Init](SudoServerTools_Init.md)
- [Inventory + Life Event Logger (+ Grant/Delete API)](SST_InventoryEventLogger.md)
