# SST Quick Start For DayZ Server Owners

This is the shortest path to get SST running on a Windows DayZ server or admin PC.

## Before You Start

- Install Node.js 18 or newer from https://nodejs.org/.
- Copy the included `dayz/server-mod/@SST` folder to your DayZ server root as `@SST`.
- Load SST as a server-side mod, for example:

```text
-profiles=Server1 -serverMod=@SST -scrAllowFileWrite
```

Keep normal player/client mods in `-mod`. Keep `@SST` in `-serverMod` unless your host specifically requires a different field.

Start the DayZ server once before configuring the app. SST creates its files under the active DayZ profile folder:

```text
<DayZServerRoot>/Server1/SST
```

The exact path depends on `-profiles=`. If your host hides the profile path, look for the generated `SST/` folder in the server file manager.

Inside the folder you should see:

```text
SST/api/
SST/inventories/
SST/events/
SST/life_events/
SST/trades/
SST/vehicles/
```

The dashboard connection test expects `SST/api/online_players.json`. That file appears after the server has run with SST loaded.

## 1. Install The App

From the repository root, double-click:

```text
Install-SST.bat
```

This installs API dependencies, installs dashboard dependencies, builds the web dashboard, and creates `apps/api/.env` if it does not exist.

## 2. Start SST

Double-click:

```text
Start-SST.bat
```

This starts the API on:

```text
http://localhost:3001
```

It also opens the dashboard in your browser.

## 3. Complete Browser Setup

In the dashboard:

1. Choose `Local Files`, `SFTP`, or `FTP`.
2. Enter the path to the `SST` folder created by the mod.
3. Test the connection.
4. Create the first admin account.

For local files, use forward slashes:

```text
C:/DayZServer/Server1/SST
```

For hosted servers, stop the path at the `SST` folder. Do not include `/api/online_players.json`.

## Common Hosted SFTP Example

If FileZilla shows:

```text
/104.234.251.153_2332/HostHavocDayZServer/SST/api/online_players.json
```

Use:

```text
SFTP root: /104.234.251.153_2332
SST path:  HostHavocDayZServer/SST
```

## Troubleshooting Fast Checks

- No `SST` folder: the server has not loaded the mod, or you are checking the wrong `-profiles` folder.
- Connection test cannot find `online_players.json`: run the DayZ server with SST loaded first.
- Players kicked for mods: client-required mods belong in `-mod`; SST belongs in `-serverMod`.
- API will not open: check port `3001` and Windows Firewall.
- Dashboard blank: run `npm run build` in `apps/web`, then restart `Start-SST.bat`.

## Support

- Discord: https://discord.gg/jv52WVbFdj
- GitHub Issues: use the bug/support templates
- Full docs: `README.md` and `docs/wiki/Getting Started/`
