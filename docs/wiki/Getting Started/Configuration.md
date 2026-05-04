# Configuration

SST has three configuration surfaces:

1. The DayZ mod writes data under the DayZ storage root.
2. The Node API reads those files and writes command queues.
3. The web dashboard connects to the API.

## API Environment

Copy `apps/api/.env.example` to `apps/api/.env`, then set the values for your server.

Important settings:

- `STORAGE_BACKEND`: `local`, `ftp`, or `sftp`.
- `SST_PATH`: the DayZ storage `SST` folder that contains `api/`, `inventories/`, `events/`, and related SST exports.
- `PROFILES_PATH`: the active DayZ profile folder, useful for reading server logs.
- `API_KEY`: leave blank to generate on first startup, or set your own 32+ byte secret.
- `JWT_SECRET`: leave blank to generate on first startup, or set your own 32+ byte secret.
- `CORS_ORIGIN`: set to your dashboard origin for production.
- `EXPANSION_ENABLED`: set to `1` only if you use DayZ Expansion features.

## Finding `SST_PATH`

SST writes to `$storage:SST`. DayZ 1.20 added a `-storage=` launch parameter that defines the storage root exposed to scripts as `$storage:`. If your host allows it, set `-storage=Server1Storage` so the API path is predictable.

Examples:

```text
-profiles=Server1
-storage=Server1Storage
SST_PATH=<DayZServerRoot>/Server1Storage/SST
PROFILES_PATH=<DayZServerRoot>/Server1

-profiles=profiles
-storage=storage
SST_PATH=<DayZServerRoot>/storage/SST
PROFILES_PATH=<DayZServerRoot>/profiles

-profiles=D:\DayZServer\profiles
-storage=D:\DayZServer\storage
SST_PATH=D:/DayZServer/storage/SST
PROFILES_PATH=D:/DayZServer/profiles
```

Older SST builds wrote under `$profile:SST`. The mod keeps a legacy read/migration fallback, but the API should be pointed at the new `$storage:SST` folder after updating.

Run the DayZ server once with `@SST` loaded before testing the API connection. The setup test expects the mod to have generated `SST/api/online_players.json`.

## Local Server Example

```env
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/Server1Storage/SST
PROFILES_PATH=C:/DayZServer/Server1
MISSION_PATH=C:/DayZServer/mpmissions/dayzOffline.chernarusplus
EXPANSION_ENABLED=0
```

## Hosted Provider Example

```env
STORAGE_BACKEND=sftp
SFTP_HOST=example.hosting-provider.com
SFTP_PORT=22
SFTP_USER=your-username
SFTP_PASSWORD=your-password
SFTP_ROOT=/
SST_PATH=Server1Storage/SST
```

If your provider shows a prefixed path such as `/123456/MyServer/SST/api/online_players.json`, set:

```env
SFTP_ROOT=/123456
SST_PATH=MyServer/SST
```

Do not include `/api/online_players.json` in `SST_PATH`. Stop at the `SST` folder.

## FTP / FTPS Example

```env
STORAGE_BACKEND=ftp
FTP_HOST=example.hosting-provider.com
FTP_PORT=21
FTP_USER=your-username
FTP_PASSWORD=your-password
FTP_SECURE=true
FTP_ROOT=/
SST_PATH=Server1Storage/SST
```

If your provider does not support FTPS, set `FTP_SECURE=false`.

## Expansion Paths

If you use DayZ Expansion economy features:

```env
EXPANSION_ENABLED=1
EXPANSION_TRADERS_PATH=C:/DayZServer/Server1/ExpansionMod/Traders
EXPANSION_MARKET_PATH=C:/DayZServer/Server1/ExpansionMod/Market
MISSION_PATH=C:/DayZServer/mpmissions/dayzOffline.chernarusplus
```

Vehicle tracking requires Expansion vehicle purchases with keys. The vehicle map will stay empty until SST has tracked at least one vehicle purchase and the server has written a valid `SST/vehicles/tracked.json`.

## Dashboard Environment

For local development, `apps/web/.env.example` points at `http://localhost:3001`.

If the API runs elsewhere, set:

```env
VITE_API_URL=http://your-api-host:3001
```

## Security

- Do not commit `.env` or `host-providers.json`.
- Prefer SFTP over FTP when your host supports it.
- Put the API behind HTTPS or a trusted private network before exposing it publicly.

## Next

- [First Run Checklist](First%20Run%20Checklist.md)
