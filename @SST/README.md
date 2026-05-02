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
`@SST` mod package. For example, if the server is launched with
`-profiles=Server1` from the DayZ server root, SST data is created under
`Server1/SST`.

Expected runtime paths include `SST/api/online_players.json`,
`SST/api/server_items.json`, `SST/inventories/`, `SST/events/`,
`SST/life_events/`, `SST/trades/`, and `SST/vehicles/`.

Players should not need to install this mod client-side when your host supports `-serverMod`.

The source for this package lives in `SST/`.
