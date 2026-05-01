# First Run Checklist

Use this checklist after installing the mod, API, and dashboard.

## DayZ Server and Mod

- The server starts with the SST mod loaded.
- DayZ script/RPT logs do not show SST script errors.
- `$profile:SST/` exists.
- `$profile:SST/api/online_players.json` appears after players join.
- Inventory, event, life event, and trade folders appear when those features are used.

## Node API

- `apps/api/.env` exists and points to the correct SST folder.
- `npm start` runs without startup errors.
- `GET /health` returns `{"status":"OK",...}`.
- `API_KEY` and `JWT_SECRET` are present in `.env` after first startup.
- `/config` shows the expected paths when logged in as admin.

## Dashboard

- `npm run dev` starts the Vite server.
- The dashboard can reach the API URL.
- First admin setup completes.
- Player list, online status, and map views load when the server has data.
- Item/vehicle/player commands create queue files in the SST `api/` folder.

## Before Going Public

- Change any temporary admin password.
- Confirm `.env`, database files, logs, and `node_modules` are not committed.
- Restrict API access with firewall, VPN, reverse proxy, or HTTPS auth.
- Back up `apps/api/data/` if you care about auth/audit/archive data.

## If Something Fails

Start with [Troubleshooting](../Help/Troubleshooting.md), then open a support issue with logs that have secrets removed.
