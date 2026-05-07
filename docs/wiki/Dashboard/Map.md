# Map

The Map view renders player and/or vehicle locations.

## Backing data

- Online players location export (`$profile:SST/online_players.json` or similar)
- Position history (SQLite via Node API) if enabled

## Backing API endpoints

- `GET /online/locations/all`
- `GET /vehicles/positions/all`
- `GET /positions/latest`
