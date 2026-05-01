# Configuration

SST has three configuration surfaces:

1. The DayZ mod writes data under the server profile folder.
2. The Node API reads those files and writes command queues.
3. The web dashboard connects to the API.

## API Environment

Copy `apps/api/.env.example` to `apps/api/.env`, then set the values for your server.

Important settings:

- `STORAGE_BACKEND`: `local`, `ftp`, or `sftp`.
- `SST_PATH`: the folder that contains `api/`, `inventories/`, `events/`, and related SST exports.
- `API_KEY`: leave blank to generate on first startup, or set your own 32+ byte secret.
- `JWT_SECRET`: leave blank to generate on first startup, or set your own 32+ byte secret.
- `CORS_ORIGIN`: set to your dashboard origin for production.
- `EXPANSION_ENABLED`: set to `1` only if you use DayZ Expansion features.

## Local Server Example

```env
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/profiles/SST
PROFILES_PATH=C:/DayZServer/profiles
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
SST_PATH=profiles/SST
```

If your provider shows a prefixed path such as `/123456/MyServer/SST/api/online_players.json`, set:

```env
SFTP_ROOT=/123456
SST_PATH=MyServer/SST
```

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
