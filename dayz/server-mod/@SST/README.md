# @SST Server Mod Package

This folder is the ready-to-install server-side DayZ mod package for SST.

## Install

1. Copy the whole `@SST/` folder to your DayZ server root.
2. Add SST to the server-side mod startup parameter:

```text
-serverMod=@SST -scrAllowFileWrite
```

3. Start the server once.
4. Confirm the DayZ profile folder now contains an `SST/` runtime data folder.

The dashboard should point at the generated profile data folder, not the
`@SST` mod package. If possible, launch DayZ with a stable profile root:

```text
-profiles=Server1 -serverMod=@SST -scrAllowFileWrite
```

Then point the API at `Server1/SST`.

Expected runtime paths include `SST/api/online_players.json`,
`SST/api/server_items.json`, `SST/inventories/`, `SST/events/`,
`SST/life_events/`, `SST/trades/`, and `SST/vehicles/`.

REST event posting is configured at `SST/api/rest_config.json`. The default
targets the local SST API:

```json
{
  "restEnabled": true,
  "baseUrl": "http://127.0.0.1:3001",
  "eventsPath": "/api/events",
  "apiKey": "",
  "apiProfile": ""
}
```

Change `baseUrl` if the API runs on another port or machine. If the API is
not on the same machine, set `apiKey` to the SST API key. If one API manages
multiple server profiles, set `apiProfile` to the matching profile id from the
dashboard server dropdown.

Players should not need to install this mod client-side when your host supports `-serverMod`.

The source for this package lives in `dayz/mod-source/SST/`.
