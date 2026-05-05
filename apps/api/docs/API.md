# SST Node API – API Reference (Dull)

This document lists every HTTP endpoint implemented by the API in `src/server.js` and `src/routes/*`.

## Base URL

By default, the server listens on:

- `http://<HOST>:<PORT>`
- Defaults: `HOST=0.0.0.0`, `PORT=3001`

There is no `/api` prefix in the current Express mounts.

## Authentication

### Session authentication (JWT)

Most endpoints require a valid session token.

Token sources (checked in this order):
1. `Authorization: Bearer <token>`
2. Cookie: `auth_token=<token>`

### API key

Most non-auth endpoints also require an API key.

Provide via:
- Header: `X-API-Key: <key>` (header lookup is case-insensitive)
- Or query string: `?apiKey=<key>`

If `API_KEY` is missing from `.env`, the server will generate one on startup and print it to the console.

### Server profile

When `config/host-providers.json` contains multiple providers, one API process can serve all of them. Select the target provider with:

- Header: `X-SST-Server: <provider-name>`
- Header: `X-SST-Provider: <provider-name>`
- Query string: `?server=<provider-name>`

If omitted, the API uses `HOST_PROVIDER`, then the config file's `active` provider, then `default`.

## Auth requirements by route group

- Public (no auth)
  - `GET /health`

- API key only
  - `GET /servers`

- Session-only (JWT required, no API key)
  - `/auth/*`
  - `/users/*`
  - `GET /config` (also requires admin)

- Session + API key required
  - `/inventory/*`
  - `/events/*`
  - `/life-events/*`
  - `/trades/*`
  - `/economy/*`
  - `/grants/*`
  - `/dashboard/*`
  - `/items/*`
  - `/online/*`
  - `/commands/*`
  - `/expansion/*`
  - `/logs/*`
  - `/positions/*`
  - `/archive/*` (some endpoints also require admin)
  - `/vehicles/*`
  - `/leaderboard/*`

## Conventions

- Most endpoints return JSON.
- File-backed “queue” endpoints write a request into a JSON file under `paths.api`, then the DayZ mod processes it and writes a results file.

---

## Health

### GET /health

No auth.

Response:
```json
{ "status": "OK", "timestamp": "2026-01-17T00:00:00.000Z" }
```

---

## Config

### GET /config

Auth: Session (JWT) + Admin role.

Response:
```json
{
  "paths": {
    "inventories": "...",
    "events": "...",
    "lifeEvents": "...",
    "trades": "...",
    "api": "...",
    "onlinePlayers": "...",
    "expansionTraders": "...",
    "expansionMarket": "...",
    "missionFolder": "...",
    "typesXml": "...",
    "profiles": "...",
    "database": "..."
  },
  "server": { "port": 3001, "host": "0.0.0.0" }
}
```

Notes:
- `typesXml` is an optional base `types.xml` override. When `missionFolder` is configured, the API also loads `<missionFolder>/cfgeconomycore.xml` entries where `<file type="types">`.

---

## Auth

Base path: `/auth`

### POST /auth/login

Auth: None.

Body:
```json
{ "username": "admin", "password": "password" }
```

Response:
```json
{ "success": true, "token": "<jwt>", "user": { "id": 1, "username": "admin", "role": "admin" } }
```

Notes:
- Sets HTTP-only cookie `auth_token`.

### POST /auth/logout

Auth: None (but only affects current cookie/session if present).

Response:
```json
{ "success": true }
```

### GET /auth/me

Auth: Cookie `auth_token` is required for this endpoint (it reads cookie only).

Response:
```json
{ "user": { "id": 1, "username": "admin", "role": "admin" } }
```

### POST /auth/change-password

Auth: Cookie `auth_token` required.

Body:
```json
{ "currentPassword": "old", "newPassword": "new-password" }
```

Response:
```json
{ "success": true, "message": "Password changed successfully" }
```

---

## Users

Base path: `/users`

All `/users/*` endpoints require session auth. Most require admin.

### GET /users

Auth: Session + Admin.

Response:
```json
{ "users": [ { "id": 1, "username": "admin", "role": "admin" } ] }
```

### GET /users/:id

Auth: Session + Admin.

Path params:
- `id` (number)

### POST /users

Auth: Session + Admin.

Body:
```json
{ "username": "newuser", "password": "min-8-chars", "role": "admin|manager|viewer" }
```

Response:
```json
{ "success": true, "user": { "id": 2, "username": "newuser", "role": "viewer" } }
```

### PUT /users/:id

Auth: Session + Admin.

Body (any subset):
```json
{ "username": "newname", "role": "admin|manager|viewer", "is_active": true }
```

### POST /users/:id/reset-password

Auth: Session + Admin.

Body:
```json
{ "newPassword": "min-8-chars" }
```

### DELETE /users/:id

Auth: Session + Admin.

### GET /users/audit/log

Auth: Session + Admin.

Query:
- `limit` (number, default `100`)

---

## Dashboard

Base path: `/dashboard`

### GET /dashboard

Auth: Session + API key.

Returns the in-memory cache:
```json
{
  "players": { "<playerId>": { "inventory": {}, "events": {}, "lifeEvents": {} } },
  "grantResults": [],
  "recentDeaths": [],
  "lastUpdate": "2026-01-17T00:00:00.000Z"
}
```

### GET /dashboard/player/:playerId

Auth: Session + API key.

### GET /dashboard/grants

Auth: Session + API key.

### GET /dashboard/deaths

Auth: Session + API key.

### POST /dashboard/refresh

Auth: Session + API key.

---

## Leaderboard

Base path: `/leaderboard`

### GET /leaderboard

Auth: Session + API key.

Query:
- `limit` (number, default `25`, max `100`)

Returns player totals built from current SST JSON exports and the local position database.

Response:
```json
{
  "generatedAt": "2026-01-17T00:00:00.000Z",
  "playerCount": 1,
  "summary": {
    "onlineCount": 1,
    "totalKills": 0,
    "totalDeaths": 0,
    "totalItemEvents": 21,
    "totalTrades": 0,
    "totalVehicles": 0
  },
  "leaderboards": {
    "overall": [],
    "kills": [],
    "deaths": [],
    "playTime": [],
    "longestLife": [],
    "loot": [],
    "trades": [],
    "wealth": [],
    "vehicles": [],
    "online": []
  }
}
```

Notes:
- Kills are inferred from `DIED` life events where the cause is another player.
- Totals reflect retained SST export data, so older per-player events may roll off when the mod retention limit is reached.

---

## Online Players

Base path: `/online`

Data source: `paths.onlinePlayers` (JSON).

### GET /online

Auth: Session + API key.

### GET /online/active

Auth: Session + API key.

### GET /online/:playerId

Auth: Session + API key.

### GET /online/locations/all

Auth: Session + API key.

---

## Items

Base path: `/items`

Data source: `paths.api/server_items.json`.

### GET /items

Auth: Session + API key.

### GET /items/search

Auth: Session + API key.

Query:
- `q` (string, optional) – matches `className` or `displayName`
- `category` (string, optional) – exact match (case-insensitive)
- `parent` (string, optional)
- `limit` (number, default `100`)

### GET /items/categories

Auth: Session + API key.

### GET /items/:className

Auth: Session + API key.

### POST /items/refresh

Auth: Session + API key.

### GET /items/inventory-counts

Auth: Session + API key.

Returns a map of `className -> count` aggregated across all inventories.

### POST /items/inventory-counts/refresh

Auth: Session + API key.

---

## Inventory

Base path: `/inventory`

### GET /inventory/:playerId

Auth: Session + API key.

Reads: `paths.inventories/<playerId>.json`

### DELETE /inventory/:playerId/item

Auth: Session + API key.

Queues an item deletion request to `paths.api/item_deletes.json`.

Body:
```json
{ "itemClassName": "Ammo_762x39", "itemPath": "root.cargo[0]", "deleteCount": 0 }
```

Notes:
- `deleteCount=0` typically means “delete all matching” (behavior depends on the mod).

### GET /inventory/delete-results/all

Auth: Session + API key.

Reads: `paths.api/item_deletes_results.json`

---

## Events

Base path: `/events`

### GET /events/:playerId

Auth: Session + API key.

Reads: `paths.events/<playerId>_events.json`

---

## Life Events

Base path: `/life-events`

### GET /life-events/:playerId

Auth: Session + API key.

Reads: `paths.lifeEvents/<playerId>_life.json`

### GET /life-events

Auth: Session + API key.

Query:
- `type` (string, optional) – filters `eventType`
- `playerId` (string, optional)
- `limit` (number, default `100`)

### GET /life-events/deaths/recent

Auth: Session + API key.

Query:
- `limit` (number, default `20`)

---

## Trades

Base path: `/trades`

### GET /trades/:playerId

Auth: Session + API key.

Reads: `paths.trades/<playerId>_trades.json`

---

## Economy

Base path: `/economy`

### GET /economy

Auth: Session + API key.

Aggregates trade history plus spawn data from the mission base `types.xml` and any `cfgeconomycore.xml` type-file additions.

### GET /economy/spawn-data

Auth: Session + API key.

Query:
- `search` (string, optional)
- `category` (string, optional)
- `spawnRating` (string, optional)
- `limit` (number, default `100`)

### GET /economy/spawn-data/:className

Auth: Session + API key.

---

## Grants

Base path: `/grants`

Queues item grants to `paths.api/item_grants.json` and reads results from `paths.api/item_grants_results.json`.

### POST /grants

Auth: Session + API key.

Body:
```json
{ "playerId": "7656119...", "itemClassName": "AKM", "quantity": 1, "health": 100 }
```

Response:
```json
{ "status": "QUEUED", "grant": { "playerId": "...", "itemClassName": "AKM", "processed": false } }
```

### GET /grants/results

Auth: Session + API key.

---

## Commands

Base path: `/commands`

Queues commands to `paths.api/player_commands.json` and results to `paths.api/player_commands_results.json`.

### POST /commands/heal

Auth: Session + API key.

Body:
```json
{ "playerId": "7656119...", "health": 100 }
```

### POST /commands/teleport

Auth: Session + API key.

Body:
```json
{ "playerId": "7656119...", "x": 1000, "y": 0, "z": 2000 }
```

Notes:
- If `y` is omitted, the request uses `0` and the mod may compute surface height.

### POST /commands/message

Auth: Session + API key.

Body:
```json
{ "playerId": "7656119...", "message": "Hello", "messageType": "notification|chat|both" }
```

### POST /commands/broadcast

Auth: Session + API key.

Body:
```json
{ "message": "Server restart in 10m", "messageType": "notification|chat|both" }
```

### GET /commands/results

Auth: Session + API key.

### GET /commands/pending

Auth: Session + API key.

---

## Expansion

Base path: `/expansion`

Works by reading/writing Expansion JSON config files under the configured Expansion/Mission directories.

### Trader Zones

- `GET /expansion/zones`
- `GET /expansion/zones/:fileName`
- `PUT /expansion/zones/:fileName`

### Traders

- `GET /expansion/traders`
- `GET /expansion/traders/:fileName`
- `PUT /expansion/traders/:fileName`

### Market

- `GET /expansion/market`
- `GET /expansion/market/:fileName`
- `PUT /expansion/market/:fileName`
- `PUT /expansion/market/:fileName/item/:className`
- `POST /expansion/market/:fileName/item`
- `DELETE /expansion/market/:fileName/item/:className`

### Bulk / Utilities

- `GET /expansion/market-search/:className`
- `POST /expansion/apply-price`
- `POST /expansion/apply-prices-bulk`
- `GET /expansion/all`

---

## Logs

Base path: `/logs`

Reads from `paths.profiles`.

- `GET /logs/types`
- `GET /logs/list/:type` (query: `limit`)
- `GET /logs/read/:type/:fileName` (query: `lines`)
- `GET /logs/latest/script` (query: `lines`)
- `GET /logs/latest/crash`
- `GET /logs/latest/rpt` (query: `lines`)
- `GET /logs/summary`

---

## Positions

Base path: `/positions`

SQLite-backed position storage.

- `GET /positions/stats`
- `GET /positions/players`
- `GET /positions/latest`
- `GET /positions/:playerId` (query: `limit`, default `100`)
- `GET /positions/:playerId/range` (query: `start`, `end` as unix timestamps)
- `POST /positions/record`
- `POST /positions/snapshot`
- `DELETE /positions/cleanup` (query: `days`, default `7`)

---

## Archive

Base path: `/archive`

Some endpoints require admin role.

- `GET /archive/info`
- `GET /archive/runs` (query: `limit`, default `30`)
- `POST /archive/run` (Admin)
  - body: `{ "clearFiles": true|false }` (default `true`)
- `POST /archive/prune` (Admin)
  - body: `{ "daysToKeep": 90 }`
- `GET /archive/trades/stats`
- `GET /archive/trades/top-items`
- `GET /archive/trades/player/:steamId`
- `GET /archive/deaths/stats`
- `GET /archive/life-events/player/:steamId`

---

## Vehicles

Base path: `/vehicles`

Reads from `paths.sst/vehicles/*.json` and uses `paths.api/*.json` for queues/results.

- `GET /vehicles` (query: `ownerId`, `className`, `destroyed`)
- `GET /vehicles/delete-results/all`
- `GET /vehicles/purchases/all` (query: `ownerId`, `className`, `limit`)
- `GET /vehicles/key-results/all`
- `GET /vehicles/by-owner/:ownerId`
- `GET /vehicles/positions/all`
- `GET /vehicles/:vehicleId`
- `DELETE /vehicles/:vehicleId`
- `POST /vehicles/generate-key`
  - body: `{ "playerId": "...", "vehicleId": "A-B-C-D", "keyClassName": "ExpansionCarKey", "isMasterKey": false }`

---

## Common errors

### API key errors

- Missing API key:
  - HTTP `401`
  - `{"error":"Missing API key","hint":"Provide API key via 'x-api-key' header or 'apiKey' query parameter"}`
- Invalid API key:
  - HTTP `403`
  - `{"error":"Invalid API key"}`

### Auth errors

- Missing/invalid/expired token:
  - HTTP `401`
  - `{"error":"Authentication required"}` or `{"error":"Invalid or expired token"}`
