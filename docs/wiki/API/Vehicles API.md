# Vehicles API

Vehicles are tracked when Expansion Vehicles is enabled.

Common endpoints:

- `GET /vehicles`
- `GET /vehicles/:vehicleId`
- `GET /vehicles/by-owner/:ownerId`
- `POST /vehicles/generate-key`
- `DELETE /vehicles/:vehicleId`

Backing files:

- `$profile:SST/vehicles/tracked.json`
- `$profile:SST/api/key_grants.json` + `_results.json`
- `$profile:SST/api/vehicle_delete.json` + `_results.json`
