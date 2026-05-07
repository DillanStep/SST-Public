# Troubleshooting

## Dashboard shows "Unauthorized" / API calls return 401

- Confirm you are logged in (cookie-based session) or using an API key.
- If using an API key, send it as `X-API-Key` (or `?apiKey=...`).
- Check the API server logs for auth messages.

## API returns "Missing API key"

- Some endpoints require an API key even if the server is reachable.
- Send `X-API-Key: <your key>`.
- Confirm your config points the dashboard at the correct API URL.

## Nothing updates / data looks stale

- Check the DayZ server `$profile:SST` folder for SST output.
- Confirm the API is pointed at the same profile `SST/` path the mod is writing to.
- Verify file permissions allow the API process to read/write those folders.

## Dashboard shows players online after the server stopped

- SST treats `SST/api/online_players.json` as stale when it has not updated for `ONLINE_PLAYERS_STALE_AFTER_MS`.
- The default timeout is `120000` ms.
- If a hosted panel delays file updates, raise this value slightly.
- If stale players still show online, check the file modified time and confirm the dashboard is connected to the right API/server.

## No `SST` folder was created

- Confirm `@SST` is actually loaded by the DayZ server.
- If your startup has `-profiles=Server1`, check `<DayZServerRoot>/Server1/SST`.
- If your startup has `-profiles=D:\DayZServer\profiles`, check `D:\DayZServer\profiles\SST`.
- Read the latest `.RPT` and `script_*.log` for SST script errors.
- Make sure the server has permission to write to the profile folder.

## Setup test cannot find `online_players.json`

- Start the DayZ server once with `@SST` loaded before testing the API connection.
- Point `SST_PATH` at the runtime `SST` folder, not the repository `dayz/mod-source/SST/Scripts` folder and not the `dayz/server-mod/@SST` mod package.
- Stop the path at `SST`; do not include `/api/online_players.json`.
- For hosted SFTP/FTP, split the path correctly between `SFTP_ROOT` or `FTP_ROOT` and `SST_PATH`.

Example:

```text
Remote file: /104.234.251.153_2332/HostHavocDayZServer/SST/api/online_players.json
SFTP_ROOT:  /104.234.251.153_2332
SST_PATH:   HostHavocDayZServer/SST
```

## Command queue not executing

- Confirm the mod is running server-side.
- Check `$profile:SST/api/` (or your configured queue dir) for queued JSON.
- Ensure the mod is polling and writing results back.

## Players are kicked for missing or extra mods

- Put client-required mods in the DayZ `-mod` parameter.
- Put SST in `-serverMod`.
- Copy every public client mod `.bikey` into the server `keys` folder.
- Make sure the server's public mod list exactly matches what players load.
- SST should not normally be required on the client.

## Vehicle map is empty

- The Chernarus map image can load even with no vehicles; markers require vehicle tracking data.
- Vehicle tracking is tied to Expansion vehicle/key purchase events.
- After a vehicle purchase, wait for the server to write `SST/vehicles/tracked.json`.
- Destroyed vehicles and vehicles without valid positions are not shown on the map.
- Check the API route `/vehicles/positions/all` while logged in if the dashboard still shows no markers.

## GitHub update prompt does not appear

- The update checker compares `apps/api/package.json` against the latest GitHub Release tag.
- Make sure `SST_DISABLE_UPDATE_CHECK=0`.
- The API machine needs outbound access to `api.github.com`.
- The install button is local-only unless `SST_ALLOW_REMOTE_UPDATE=1`.
- The installer writes progress to `logs/update-*.log` and `apps/api/data/update-state.json`.
- If the prompt stays on "Starting", run `tools/updater/Update-SST.bat --dry-run` from the API machine to test the launcher, or run `tools/updater/Update-SST.bat` to install the latest release manually.

## JSON performance is poor

- Large inventories and frequent polling can be expensive.
- See [JSON Performance Concerns](../JSON%20Performance%20Concerns.md) for mitigation ideas (batching, sampling, reduced frequency).

## Common environment issues

- Node version mismatch: use Node 18+ for API and dashboard tooling.
- Port blocked: allow the API/dashboard ports through firewall.
- CORS: make sure the API allows the dashboard origin.
