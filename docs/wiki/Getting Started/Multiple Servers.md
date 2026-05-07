# Multiple Servers

SST can manage several DayZ servers from one dashboard and one API process. The API keeps shared listener/auth settings in `apps/api/.env`, then loads one per-server env profile from `apps/api/profiles/` for each DayZ server.

The normal layout is:

```text
SST API on port 3001
  -> apps/api/.env
  -> apps/api/profiles/chernarus-main.env
  -> apps/api/profiles/livonia-pve.env
  -> apps/api/profiles/namalsk-hardcore.env
```

The dashboard sends the selected profile name with the `X-SST-Server` header, so the same API can read the correct `SST_PATH`, map settings, Expansion folders, and tracking database for the active DayZ server.

## Before You Start

For each DayZ server, make sure:

- `@SST` is loaded as a server-side mod.
- `-scrAllowFileWrite` is enabled.
- The server has its own `-profiles` folder.
- The server has been started once so SST creates `$profile:SST/api/online_players.json`.

Example DayZ launch arguments:

```text
Server 1:
-profiles=Server1 -serverMod=@SST -scrAllowFileWrite

Server 2:
-profiles=Server2 -serverMod=@SST -scrAllowFileWrite
```

Use the `SST` folder inside each server's profile directory. On hosted panels, that profile directory may be named `profiles`, `Server1`, or by your service slot.

## Adding A Server

1. Open SST.
2. Go to `Settings`.
3. Click `Add Server`.
4. Enter a clear name, such as `Chernarus Main`, `Livonia PVE`, or `Namalsk Hardcore`.
5. Leave the API URL as the existing API unless this server uses a separate SST install.
6. Reuse the current API key.
7. Pick the correct map preset.
8. Click `Save Server`.

SST creates an env profile named from the server name, for example:

```text
apps/api/profiles/chernarus-main.env
```

After saving, switch to that server and use Settings to browse/select its `SST_PATH`, mission folder, profile folder, Expansion folders, and storage backend. Saving runtime settings writes to that server's env profile and restarts the API so the profile is reloaded.

## Example Profile Env

```env
SST_PROFILE_ID=chernarus-main
SST_PROFILE_NAME=Chernarus Main
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/Server1/SST
PROFILES_PATH=C:/DayZServer/Server1
MISSION_PATH=C:/DayZServer/mpmissions/dayzOffline.chernarusplus
MAP_PRESET=chernarusplus
DATABASE_PATH=C:/DayZServer/Server1/SST/data/sst_tracking.db
ARCHIVE_DB_PATH=C:/DayZServer/Server1/SST/data/archive.db
```

For hosted servers, the profile env can use FTP or SFTP:

```env
SST_PROFILE_ID=hosted-livonia
SST_PROFILE_NAME=Hosted Livonia
STORAGE_BACKEND=sftp
SFTP_HOST=example.host.com
SFTP_PORT=22
SFTP_USER=server-user
SFTP_PASSWORD=your-password
SFTP_ROOT=/
SST_PATH=Server2/SST
PROFILES_PATH=Server2
MISSION_PATH=mpmissions/dayzOffline.enoch
MAP_PRESET=enoch
```

Do not put `/api/online_players.json` into `SST_PATH`. Stop at the generated `SST` folder.

## Shared Settings

These stay in `apps/api/.env` because they belong to the API process, not a DayZ server profile:

- `PORT`
- `HOST`
- `API_KEY`
- `JWT_SECRET`
- `AUTH_DB_PATH`
- update settings such as `SST_UPDATE_REPO`

Run separate API processes only when the DayZ servers are on different machines or you intentionally want separate auth databases/API keys.

## Quick Checks

If the dashboard shows data from the wrong server:

- Check that the selected dashboard server has the expected API profile.
- Check that `apps/api/profiles/<server-name>.env` has the right `SST_PATH`.
- Check that the DayZ server is writing fresh files under that same `$profile:SST` folder.

If the dashboard shows `0 players`:

- Confirm `SST/api/online_players.json` exists and updates while players are online.
- Check that the API console shows fresh mod heartbeat activity for the selected profile.
- Confirm the DayZ server is actually running with `@SST` and `-scrAllowFileWrite`.

If saving settings affects the wrong server:

- Switch to the correct server before editing Settings.
- Check the `.env` path displayed in Settings; it should point to `apps/api/profiles/<server-name>.env`.
