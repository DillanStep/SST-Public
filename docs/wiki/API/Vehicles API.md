# Vehicles API

Vehicles are tracked when Expansion Vehicles is enabled.

Common endpoints:

- `GET /vehicles`
- `GET /vehicles/:vehicleId`
- `GET /vehicles/by-owner/:ownerId`
- `POST /vehicles/generate-key`
- `DELETE /vehicles/:vehicleId`

Backing files:

- `$storage:SST/vehicles/tracked.json`
- `$storage:SST/api/key_grants.json` + `_results.json`
- `$storage:SST/api/vehicle_delete.json` + `_results.json`
