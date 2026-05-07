# Inventories

Inventories are exported by the mod to JSON and read by the Node API.

## Backing data

- `$profile:SST/inventories/<steam64>.json`

## Backing API endpoints

- `GET /inventory/:playerId`
- `DELETE /inventory/:playerId/item` (queues a delete request)

## Notes

Inventories can be large. If you see performance issues, increase the export interval and/or reduce recursion depth or exported metadata.
