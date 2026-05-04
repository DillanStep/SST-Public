# Installation

This guide is written for DayZ community server owners. It assumes you can edit your DayZ startup parameters and can run the SST API/dashboard on Windows.

## Install Order

Set SST up in this order:

1. Install and start the DayZ server-side mod.
2. Confirm the mod generated the `$storage:SST` folder.
3. Configure and start the Node API.
4. Start the web dashboard and create the first admin account.

Do not start with the dashboard connection test. It cannot pass until the DayZ mod has run and generated the files the API reads.

## 1. Install The DayZ Server Mod

The repository includes a ready-to-install server-side mod in `@SST/`.

1. Copy the whole `@SST` folder to your DayZ server root.
2. Add SST to the server-side mod startup parameter.
3. Keep normal client-required mods in the public `-mod` list.
4. Start the server once.
5. Check the RPT/script logs for SST errors.

Example local startup parameters:

```text
-profiles=Server1 -storage=Server1Storage -serverMod=@SST -scrAllowFileWrite
```

Example with public client mods plus SST:

```text
-profiles=Server1 -storage=Server1Storage -mod=@CF;@Dabs Framework;@DayZ-Expansion-Core -serverMod=@SST -scrAllowFileWrite
```

SST is intended for `-serverMod`. Do not put `@SST` in the public client mod list unless your host requires that field for server-side mods.

## 2. Find The SST Data Folder

SST writes files to `$storage:SST`. DayZ's `-storage=` launch parameter controls the storage root; setting it makes the API path predictable.

Common examples:

```text
-profiles=Server1
-storage=Server1Storage
<DayZServerRoot>/Server1Storage/SST

-profiles=profiles
-storage=storage
<DayZServerRoot>/storage/SST

-profiles=D:\DayZServer\profiles
-storage=D:\DayZServer\storage
D:\DayZServer\storage\SST
```

After the server has run with SST loaded, the folder should contain:

```text
SST/api/
SST/inventories/
SST/events/
SST/life_events/
SST/trades/
SST/vehicles/
```

The connection test checks for:

```text
SST/api/online_players.json
```

If the `SST` folder does not exist, stop and fix the DayZ mod load first.

## 3. Install The SST App

From the repository root, run:

```text
Install-SST.bat
```

Or run the commands manually:

```bash
cd apps/api
npm ci

cd ../web
npm ci
npm run build
```

## 4. Configure The API

The easiest path is the browser setup flow that opens after `Start-SST.bat`.

You can also configure manually:

```bash
cd apps/api
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Set at least:

```env
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/Server1Storage/SST
PROFILES_PATH=C:/DayZServer/Server1
```

For hosted SFTP/FTP, see [Configuration](Configuration.md).

## 5. Start SST

From the repository root:

```text
Start-SST.bat
```

Manual API start:

```bash
cd apps/api
npm start
```

The API listens on:

```text
http://localhost:3001
```

Check it with:

```bash
curl http://localhost:3001/health
```

Manual dashboard dev start:

```bash
cd apps/web
npm run dev
```

Vite usually opens:

```text
http://localhost:5173
```

## 6. First Admin User

On a fresh install, the dashboard prompts you to create the first admin account. Use a strong password and keep the generated API key private.

## Next

- [Configuration](Configuration.md)
- [First Run Checklist](First%20Run%20Checklist.md)
- [Troubleshooting](../Help/Troubleshooting.md)
