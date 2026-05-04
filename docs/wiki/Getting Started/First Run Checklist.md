# First Run Checklist

Use this checklist after installing the mod, API, and dashboard.

## DayZ Server and Mod

- The server starts with the SST mod loaded.
- `@SST` is loaded as a server-side mod (`-serverMod` or your host's server mod field).
- Normal player/client mods are loaded in `-mod`, and their `.bikey` files are present in the server `keys` folder.
- DayZ script/RPT logs do not show SST script errors.
- `$storage:SST/` exists. Set `-storage=...` if you want a predictable storage root.
- `$storage:SST/api/online_players.json` appears after players join.
- Inventory, event, life event, and trade folders appear when those features are used.
- If using Expansion vehicles, `SST/vehicles/tracked.json` appears after a tracked vehicle purchase/key pairing.

## Node API

- `apps/api/.env` exists and points to the correct SST folder.
- `SST_PATH` stops at the `SST` folder and does not include `/api/online_players.json`.
- `npm start` runs without startup errors.
- `GET /health` returns `{"status":"OK",...}`.
- `API_KEY` and `JWT_SECRET` are present in `.env` after first startup.
- `/config` shows the expected paths when logged in as admin.
- The setup/test connection step can find `SST/api/online_players.json`.

## Dashboard

- `npm run dev` starts the Vite server.
- The dashboard can reach the API URL.
- First admin setup completes.
- Player list, online status, and map views load when the server has data.
- Item/vehicle/player commands create queue files in the SST `api/` folder.
- The support button opens the project Discord.
- Admins see update prompts only when a newer GitHub Release exists.

## Before Going Public

- Change any temporary admin password.
- Confirm `.env`, database files, logs, and `node_modules` are not committed.
- Restrict API access with firewall, VPN, reverse proxy, or HTTPS auth.
- Back up `apps/api/data/` if you care about auth/audit/archive data.
- Back up your DayZ storage `SST/` folder before testing destructive commands on a live server.

## If Something Fails

Start with [Troubleshooting](../Help/Troubleshooting.md), then open a support issue with logs that have secrets removed.
