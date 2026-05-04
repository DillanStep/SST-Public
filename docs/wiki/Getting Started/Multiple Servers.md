# Multiple Servers

SST can manage several DayZ servers from one dashboard, but each DayZ server still needs its own SST API process.

The simple model is:

```text
DayZ Server 1 -> $storage:SST -> SST API on port 3001 -> Dashboard saved server
DayZ Server 2 -> $storage:SST -> SST API on port 3002 -> Dashboard saved server
DayZ Server 3 -> $storage:SST -> SST API on port 3003 -> Dashboard saved server
```

The web dashboard is the switcher. The API is not a combined hub yet; one API instance represents one DayZ server.

## Before You Start

For each DayZ server, make sure:

- `@SST` is loaded as a server-side mod.
- `-scrAllowFileWrite` is enabled.
- The server has its own `-profiles` folder.
- The server has its own `-storage` folder where possible.
- The server has been started once so SST creates `$storage:SST/api/online_players.json`.

Example DayZ launch arguments:

```text
Server 1:
-profiles=Server1 -storage=Server1Storage -serverMod=@SST -scrAllowFileWrite

Server 2:
-profiles=Server2 -storage=Server2Storage -serverMod=@SST -scrAllowFileWrite
```

If your host does not expose `-storage`, use the storage folder shown in the host file manager. SST writes runtime data under `$storage:SST`, not the old `$profile:SST` location.

## Recommended Layout

Keep one SST install, then create one API env file per DayZ server:

```text
C:/SST/
  apps/api/.env.server1
  apps/api/.env.server2
  apps/api/.env.server3
  apps/api/.env.server4
  apps/api/.env.server5
  apps/api/data/server1/
  apps/api/data/server2/
  apps/api/data/server3/
  apps/api/data/server4/
  apps/api/data/server5/
```

Copy `apps/api/.env.example` once per server and edit each file.

## Example Env Files

Server 1:

```env
PORT=3001
HOST=0.0.0.0
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/Server1Storage/SST
PROFILES_PATH=C:/DayZServer/Server1
MISSION_PATH=C:/DayZServer/mpmissions/dayzOffline.chernarusplus
MAP_PRESET=chernarusplus
AUTH_DB_PATH=./data/server1/auth.db
DATABASE_PATH=./data/server1/sst_tracking.db
ARCHIVE_DB_PATH=./data/server1/archive.db
API_KEY=
JWT_SECRET=
```

Server 2:

```env
PORT=3002
HOST=0.0.0.0
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/Server2Storage/SST
PROFILES_PATH=C:/DayZServer/Server2
MISSION_PATH=C:/DayZServer/mpmissions/dayzOffline.enoch
MAP_PRESET=enoch
AUTH_DB_PATH=./data/server2/auth.db
DATABASE_PATH=./data/server2/sst_tracking.db
ARCHIVE_DB_PATH=./data/server2/archive.db
API_KEY=
JWT_SECRET=
```

Use a different port and data folder for every API instance. Leaving `API_KEY` and `JWT_SECRET` blank is fine; SST will generate and save them on first startup.

## Starting Each API

Open one terminal per server.

`Start-SST.bat` starts the normal dashboard and default API. For extra servers, start the additional API processes manually with `SST_API_ENV_PATH`.

PowerShell example for Server 1:

```powershell
cd C:\SST\apps\api
$env:SST_API_ENV_PATH = "C:\SST\apps\api\.env.server1"
npm start
```

PowerShell example for Server 2:

```powershell
cd C:\SST\apps\api
$env:SST_API_ENV_PATH = "C:\SST\apps\api\.env.server2"
npm start
```

If you prefer batch files, create one per server in the SST root.

`Start-API-Server1.bat`:

```bat
@echo off
set "ROOT=%~dp0"
cd /d "%ROOT%apps\api"
set "SST_API_ENV_PATH=%ROOT%apps\api\.env.server1"
npm start
pause
```

`Start-API-Server2.bat`:

```bat
@echo off
set "ROOT=%~dp0"
cd /d "%ROOT%apps\api"
set "SST_API_ENV_PATH=%ROOT%apps\api\.env.server2"
npm start
pause
```

Repeat the same pattern for ports `3003`, `3004`, and `3005`.

## Adding Servers In The Dashboard

Start the web dashboard once, then add every API connection:

1. Open SST.
2. Go to `Settings`.
3. Click `Add Server`.
4. Enter a clear name, such as `Chernarus Main`, `Livonia PVE`, or `Namalsk Hardcore`.
5. Enter that server's API URL, for example `http://localhost:3002`.
6. Enter the `API_KEY` from that server's env file.
7. Pick the correct map preset.
8. Click `Test Connection`.
9. Click `Save Server`.

Use the server picker in the top-right of the dashboard to switch between servers.

## Hosted Servers

For hosted servers, the idea is the same. Each DayZ server still needs its own API env file and port. The difference is that each env file uses FTP or SFTP:

```env
PORT=3003
STORAGE_BACKEND=sftp
SFTP_HOST=example.host.com
SFTP_PORT=22
SFTP_USER=server3-user
SFTP_PASSWORD=your-password
SFTP_ROOT=/
SST_PATH=Server3Storage/SST
PROFILES_PATH=Server3
MISSION_PATH=mpmissions/dayzOffline.sakhal
MAP_PRESET=sakhal
AUTH_DB_PATH=./data/server3/auth.db
DATABASE_PATH=./data/server3/sst_tracking.db
ARCHIVE_DB_PATH=./data/server3/archive.db
```

Do not put `/api/online_players.json` into `SST_PATH`. Stop at the `SST` folder.

## Updating One Server

The Settings page edits the currently selected API. Switch to the server first, then edit its runtime settings.

After saving `.env` changes, restart that API instance only. The other servers can keep running.

## Quick Checks

If the dashboard shows `0 players`:

- Check that the selected dashboard server is the right one.
- Check that the API URL points to the right port.
- Check `SST_PATH`; it should point at `$storage:SST`, not `$profile:SST`.
- Confirm `SST/api/online_players.json` exists and updates while players are online.

If two servers show the same data:

- They are probably using the same `SST_PATH`.
- They may also be sharing `AUTH_DB_PATH`, `DATABASE_PATH`, or `ARCHIVE_DB_PATH`.

If an API will not start:

- Check that no other API is already using the same `PORT`.
- Check the env file path passed through `SST_API_ENV_PATH`.
- Check that local paths use forward slashes, for example `C:/DayZServer/Server1Storage/SST`.

## Five Server Example

```text
Chernarus Main   -> http://localhost:3001 -> .env.server1 -> C:/DayZServer/Server1Storage/SST
Livonia PVE      -> http://localhost:3002 -> .env.server2 -> C:/DayZServer/Server2Storage/SST
Sakhal PVP       -> http://localhost:3003 -> .env.server3 -> C:/DayZServer/Server3Storage/SST
Namalsk Hardcore -> http://localhost:3004 -> .env.server4 -> C:/DayZServer/Server4Storage/SST
Deer Isle RP     -> http://localhost:3005 -> .env.server5 -> C:/DayZServer/Server5Storage/SST
```

Keep the names, ports, env files, database paths, and SST storage paths matched up. That is the bit that prevents most multi-server confusion.
