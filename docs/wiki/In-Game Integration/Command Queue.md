# Command Queue

Command queues are the API → server direction.

The Node API writes requests into `$storage:SST/api/*.json` files.
The mod polls these queues, performs game actions, and writes results files.

## Existing queues

- Player commands:
  - queue: `$storage:SST/api/player_commands.json`
  - results: `$storage:SST/api/player_commands_results.json`

- Item grants:
  - queue: `$storage:SST/api/item_grants.json`
  - results: `$storage:SST/api/item_grants_results.json`

- Inventory deletes:
  - queue: `$storage:SST/api/item_deletes.json`
  - results: `$storage:SST/api/item_deletes_results.json`

- Vehicle keys/deletes (Expansion Vehicles):
  - `$storage:SST/api/key_grants*.json`
  - `$storage:SST/api/vehicle_delete*.json`

## Implementation pattern

Use the template:

- [docs/mod/scripts/SST_ApiFeatureTemplate.md](../../mod/scripts/SST_ApiFeatureTemplate.md)
