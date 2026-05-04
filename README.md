# SST Public

[Join the SUDO Gaming Discord](https://discord.gg/jv52WVbFdj) for community support, setup help, and release discussion.

SST is a source-available, non-commercial DayZ server management suite. It combines a server-side DayZ mod, a Node/Express API, and a React dashboard so server owners can inspect player data, manage items and vehicles, review logs, and work with common DayZ Expansion economy files.

**Works best with DayZ Expansion.** SST can still run core player, inventory, vehicle, log, and command features without Expansion, but the market, trader, pricing, and economy tools are designed around DayZ Expansion server files.

## Release Status

> **SST is a public early release for DayZ server owners who are comfortable testing server-admin tools.**

The current build is usable, but setup still requires care. Test it on a development or staging server before using it on a live community. The current release focuses on the core server-admin loop:

- server-side mod loads correctly
- mod writes useful JSON exports
- API reads the server files through local disk, FTP, or SFTP
- dashboard connects to the API
- admins can test the core management tools

Future releases will continue to streamline installation, packaging, hosted-provider setup, and documentation.

## How SST Works

SST has three parts:

1. **SST DayZ mod** - Runs on the DayZ server. It exports server state to JSON files and reads command queues written by the API.
2. **SST API** - Runs beside your server or on another machine. It reads the SST JSON files from local disk, FTP, or SFTP, then exposes them to the dashboard.
3. **SST Dashboard** - Runs in a browser. It connects to the API so admins can view players, vehicles, inventories, logs, economy files, and queue supported actions.

The mod is intended to be installed as a **server-side mod**. Players should not need to install SST on their client when your server host supports server-side mods through `-serverMod`.

```text
DayZ server + SST mod  ->  $storage:SST JSON files  ->  SST API  ->  Web dashboard
Dashboard actions      ->  SST API command queue   ->  SST mod  ->  DayZ server
```

## Project Status

SST is ready for community testing and contribution, but it should be treated as server-admin software. Review configuration before exposing it to the internet, keep API keys private, and test changes on a staging server before using them on a live community.

## What Is Included

- `@SST/` - ready-to-install server-side DayZ mod package.
- `SST/` - DayZ mod source in Enforce Script.
- `Missions/` - mission configuration bundles for supported maps.
- `apps/api/` - Node/Express API that reads SST export files and queues commands.
- `apps/web/` - Vite/React dashboard.
- `apps/web/public/maps/` - bundled map images for Chernarus+, Livonia, Sakhal, Namalsk, Deer Isle, Esseker, and Hasima.
- `tools/setup-wizard/` - Windows setup wizard for first-time API configuration.
- `docs/wiki/` - community-facing setup and reference documentation.

## Requirements

- DayZ server with permission to install server-side mods.
- Node.js 18 or newer for the API and dashboard.
- Windows for DayZ server tooling and the setup wizard.
- SFTP/FTP credentials if the DayZ server is hosted by a provider.
- Access to the DayZ server storage folder. SST writes runtime JSON under `$storage:SST`; if your host lets you set DayZ launch parameters, use `-storage=...` to put that folder somewhere easy for the API to reach.
- Recommended: DayZ Expansion for the best economy, market, trader, and pricing-management experience.

## Download And First Setup

If you downloaded SST as a ZIP or release package, start here.

### 1. Extract SST

Extract the full folder somewhere you can write to, such as:

```text
C:\SST-Public-main
```

Keep the folder structure intact. The root folder should contain files such as:

```text
SST-Setup.bat
Install-SST.bat
Start-SST.bat
@SST/
apps/
docs/
```

Use `@SST/` for the ready-to-install DayZ server mod. The `SST/` folder is the mod source for developers and people rebuilding the PBO.

### 2. Install Node.js

Install Node.js 18 or newer from:

```text
https://nodejs.org/
```

After installing Node.js, reopen any terminal windows so `node` and `npm` are available.

### 3. Install The SST App

From the extracted SST root folder, double-click the all-in-one setup menu:

```text
SST-Setup.bat
```

Choose `Install or repair SST`. This installs the API and dashboard dependencies, builds the dashboard, and creates `apps/api/.env` if it does not already exist.

You can still run `Install-SST.bat` directly if you prefer the older one-task installer.

### 4. Install The DayZ Server Mod

Copy the included `@SST/` folder to your DayZ server root and load it as a server-side mod:

```text
-profiles=Server1 -serverMod=@SST -scrAllowFileWrite
```

Start the DayZ server once. SST must run on the DayZ server before the dashboard can connect, because the mod creates the `$storage:SST` folder that the API reads.

### 5. Start SST

Double-click:

```text
Start-SST.bat
```

This starts the API and opens the dashboard. In the browser setup, choose Local, SFTP, or FTP storage, then point SST at the `SST/` folder created by the DayZ server mod.

### Reset Or Install As New

To wipe local SST setup and go through the browser setup again, double-click:

```text
SST-Setup.bat
```

Choose `Reset to defaults, then install as new`. This removes local API users, local API databases, generated API config, web build cache, and clears the dashboard's saved browser state on the next start.

For the shortest standalone checklist, see [apps/QUICK-START.md](apps/QUICK-START.md).

## Quick Start

### 1. Install the Server-Side DayZ Mod

This repository includes a ready-to-install server-side mod package in `@SST/`. It also includes the mod source in `SST/` if you want to rebuild the PBOs yourself.

Copy the whole `@SST/` folder to your DayZ server root and load it as a server-side mod. A typical startup parameter looks like:

```text
-profiles=Server1 -serverMod=@SST -scrAllowFileWrite
```

If your host does not expose `-serverMod`, use the server-side mod field or startup parameter field your host provides. Avoid putting SST in the public client mod list unless your host specifically requires that.

Keep your normal client-required mods in `-mod`, and keep SST in `-serverMod`. If players are kicked for missing or extra PBOs, make sure every client-required mod is also loaded by the server through `-mod` and that those mods' `.bikey` files are in the server `keys` folder.

If you rebuild from source, build the PBOs from `SST/` using your normal DayZ tools workflow and place the output in `@SST/Addons/`.

Start the DayZ server once, then check the DayZ storage root. SST writes to `$storage:SST`, so the easiest setup is to add a stable `-storage=` launch parameter:

```text
-profiles=Server1 -storage=Server1Storage -serverMod=@SST -scrAllowFileWrite
```

Then point the API at:

```text
<DayZServerRoot>/Server1Storage/SST
```

If you do not set `-storage=`, the storage root is controlled by DayZ/your host and is commonly exposed near the mission persistence storage. In hosted panels, look for the folder where `storage_*` or server storage files live, then find the generated `SST/` folder inside it.

Older SST builds wrote under `$profile:SST`. Leave the old profile `SST/` folder in place for the first boot after updating: the mod will read legacy files and migrate them into `$storage:SST` as they are loaded. After updating, set the API `SST_PATH` to the new storage `SST/` folder.

SST should create:

```text
SST/
SST/api/
SST/inventories/
SST/events/
SST/life_events/
SST/trades/
SST/vehicles/
```

If the `SST/` folder does not appear, check the DayZ RPT/script logs and confirm the mod is loaded by the server.

The API setup and dashboard connection test will not work until the mod has run at least once and generated the `SST/` folder.

### Application Updates

When an admin logs into the dashboard, SST checks GitHub Releases for a newer version. If one is available, the dashboard shows an update prompt with release notes.

The install button is intentionally local-only by default because it changes files on the machine running SST. It starts `tools/updater/Update-SST.ps1`, backs up local API config/data, downloads the release archive, installs dependencies, rebuilds the web dashboard, and then asks you to restart SST so the API can load the new code.

Update settings live in `apps/api/.env`:

```env
SST_DISABLE_UPDATE_CHECK=0
SST_UPDATE_REPO=DillanStep/SST-Public
SST_ALLOW_REMOTE_UPDATE=0
```

### 2. Choose Local, FTP, or SFTP Storage

The API needs to read the `$storage:SST` folder created by the mod.

First, find where the mod created its files.

1. Start the DayZ server with `@SST` loaded.
2. Open your DayZ server storage folder. If possible, set `-storage=Server1Storage` so this location is obvious.
3. Look for a folder named `SST`.
4. Inside it you should see folders such as `api`, `inventories`, `events`, `life_events`, `trades`, and `vehicles`.
5. That folder is your `SST_PATH`.

If you cannot find the folder, the mod is probably not loaded correctly yet. Fix that before configuring the API.

#### Option A: Local Storage

Use `local` when the API runs on the same machine as the DayZ server.

Example:

```env
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/Server1Storage/SST
```

Use forward slashes `/` in the path, even on Windows. Do not use backslashes.

Good:

```env
SST_PATH=C:/DayZServer/Server1Storage/SST
```

Avoid:

```env
SST_PATH=C:\DayZServer\profiles\SST
```

#### Option B: SFTP Storage

Use `sftp` when your DayZ server is hosted by a provider and you have SFTP details.

You need these details from your host panel:

- SFTP host
- SFTP port
- SFTP username
- SFTP password
- The remote path to the `SST` folder

Example:

```env
STORAGE_BACKEND=sftp
SFTP_HOST=example.host
SFTP_PORT=22
SFTP_USER=your-user
SFTP_PASSWORD=your-password
SFTP_ROOT=/remote/root
SST_PATH=HostHavocDayZServer/SST
```

Host panels often show a long path. For example, if FileZilla shows:

```text
/104.234.251.153_2332/HostHavocDayZServer/SST/api/online_players.json
```

Then use:

```env
STORAGE_BACKEND=sftp
SFTP_ROOT=/104.234.251.153_2332
SST_PATH=HostHavocDayZServer/SST
```

In plain English:

- `SFTP_ROOT` is the top folder your host drops you into.
- `SST_PATH` is the path from that root to the `SST` folder.
- Do not include `/api/online_players.json` in `SST_PATH`; stop at the `SST` folder.

#### Option C: FTP / FTPS Storage

Use `ftp` if your host provides FTP or FTPS instead of SFTP.

Example:

```env
STORAGE_BACKEND=ftp
FTP_HOST=example.host
FTP_PORT=21
FTP_USER=your-user
FTP_PASSWORD=your-password
FTP_SECURE=true
FTP_ROOT=/remote/root
SST_PATH=HostHavocDayZServer/SST
```

If your provider does not support FTPS, set:

```env
FTP_SECURE=false
```

Keep credentials private. Do not commit `.env`.

### 3. Start the API

The API is the backend server. The dashboard talks to it, and it talks to the DayZ server files.

#### Step 3.1: Open a Terminal

Open PowerShell, Command Prompt, Windows Terminal, or Git Bash.

Go to the repository folder:

```powershell
cd C:\path\to\SST-Public-main
```

If your folder is somewhere else, use your real path.

#### Step 3.2: Go Into the API Folder

```bash
cd apps/api
```

#### Step 3.3: Install API Dependencies

Run this once:

```bash
npm ci
```

If `npm ci` fails, check that Node.js 18 or newer is installed:

```bash
node --version
npm --version
```

#### Step 3.4: Create the API `.env` File

If you are using Git Bash, WSL, or Linux:

```bash
cp .env.example .env
```

If you are using PowerShell:

```powershell
Copy-Item .env.example .env
```

If you are using Command Prompt:

```cmd
copy .env.example .env
```

#### Step 3.5: Edit `.env`

Open this file:

```text
apps/api/.env
```

At minimum, set:

```env
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/Server1Storage/SST
```

Or, for hosted SFTP:

```env
STORAGE_BACKEND=sftp
SFTP_HOST=your-host
SFTP_PORT=22
SFTP_USER=your-user
SFTP_PASSWORD=your-password
SFTP_ROOT=/your/root
SST_PATH=path/to/SST
```

Leave `API_KEY` and `JWT_SECRET` blank if you want SST to generate them on first startup.

#### Step 3.6: Start the API

From inside `apps/api`, run:

```bash
npm start
```

Leave this terminal window open. If you close it, the API stops.

The API listens on:

```text
http://localhost:3001
```

#### Step 3.7: Check the API Is Alive

Open a second terminal and run:

```bash
curl http://localhost:3001/health
```

If `curl` is not available, open this in your browser:

```text
http://localhost:3001/health
```

You should get a small health response. If the browser cannot connect, the API is not running or the port is blocked.

#### Optional: Use the Windows Setup Wizard

From the repository root, you can run:

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File tools/setup-wizard/SetupWizard.ps1
```

The setup wizard helps write the API configuration, but you still need the DayZ mod loaded and the `SST/` folder created first.

### 4. Start the Dashboard

The dashboard is the web interface you open in your browser.

Open a new terminal. Do not close the API terminal.

Go back to the repository root:

```powershell
cd C:\path\to\SST-Public-main
```

Then go into the dashboard folder:

```bash
cd apps/web
```

Install dashboard dependencies:

```bash
npm ci
```

Start the dashboard:

```bash
npm run dev
```

Leave this terminal window open. If you close it, the dashboard dev server stops.

Vite will show a local URL. It is usually:

```text
http://localhost:5173
```

On first run, the dashboard will ask you to connect to the API and create the first admin account.

Use this API URL when the dashboard asks:

```text
http://localhost:3001
```

If the dashboard asks for an API key, use the `API_KEY` from `apps/api/.env`. If you left it blank, restart the API once and check `.env`; SST should write the generated key there.

### Multiple DayZ Servers

The dashboard can save and switch between multiple SST API connections. Run one SST API instance per DayZ server, give each instance its own `.env` file, and use a different port for each one:

```text
Server 1 -> http://localhost:3001
Server 2 -> http://localhost:3002
Server 3 -> http://localhost:3003
Server 4 -> http://localhost:3004
Server 5 -> http://localhost:3005
```

Each env file should have its own `SST_PATH`, `AUTH_DB_PATH`, `DATABASE_PATH`, `ARCHIVE_DB_PATH`, `API_KEY`, and `JWT_SECRET`.

Full walkthrough: [Multiple Servers](docs/wiki/Getting%20Started/Multiple%20Servers.md).

### 5. Use SST

After the mod, API, and dashboard are connected, admins can:

- View server/player dashboard data.
- Search players and inspect inventories.
- Track vehicles and player history.
- View live map data when exports are available.
- Review logs and event data.
- Work with Expansion market/economy files.
- Queue supported actions through JSON command queues that the server-side mod processes.

For the full walkthrough, start with [Getting Started](docs/wiki/Getting%20Started/index.md).

## Windows Helper Scripts

The repository includes Windows helper scripts:

- `SST-Setup.bat` - all-in-one menu for install/repair, start, factory reset, and install-as-new.
- `Install-SST.bat` - installs API/web dependencies and builds the dashboard.
- `Start-SST.bat` - starts the API and dashboard locally.
- `Reset-Factory.bat` / `Reset-Factory.ps1` - resets local generated setup state, API databases, API config, web build cache, and browser SST state on next start.
- `tools/setup-wizard/SetupWizard.ps1` - guided API storage configuration.

These scripts do not install the DayZ server mod for you. The DayZ mod still needs to be built/installed on your DayZ server.

## Common Commands

API:

```bash
cd apps/api
npm ci
npm start
```

Dashboard:

```bash
cd apps/web
npm ci
npm run lint
npm run build
npm run dev
```

## Configuration

The API reads configuration from `apps/api/.env`. Important settings:

- `STORAGE_BACKEND`: `local`, `ftp`, or `sftp`.
- `SST_PATH`: path to the DayZ storage `SST` folder.
- `API_KEY`: generated on first API startup if left blank.
- `JWT_SECRET`: generated on first API startup if left blank.
- `CORS_ORIGIN`: set this when the dashboard runs on a separate origin.

Do not commit `.env`, database files, logs, `node_modules`, or build output. The repo includes `.gitignore` rules for these files.

## Troubleshooting

If the dashboard is empty or cannot connect:

1. Confirm the DayZ server loaded the SST server-side mod.
2. Confirm the DayZ storage folder contains `SST/`.
3. Confirm the API can reach that folder through local disk, FTP, or SFTP.
4. Check `http://localhost:3001/health`.
5. Check the browser console and API logs.
6. Remove credentials, player IPs, and private data before posting logs in issues.

More help is available in [SUPPORT.md](SUPPORT.md) and [Troubleshooting](docs/wiki/Help/Troubleshooting.md).

## Security Notes

- Keep the API behind a firewall, VPN, reverse proxy, or trusted network where possible.
- Use HTTPS if the dashboard or API is reachable from the internet.
- Rotate `API_KEY` and admin passwords if they were ever shared.
- Remove credentials and player-sensitive data before posting logs in issues.
- Do not expose FTP/SFTP credentials in screenshots, issues, or pull requests.

## Contributing

SST welcomes community testing, bug reports, documentation fixes, and pull requests. The normal contribution workflow is:

1. Open or find an issue.
2. Fork the repository.
3. Create a focused branch.
4. Run the relevant checks.
5. Open a pull request against `main`.

Start with [CONTRIBUTING.md](CONTRIBUTING.md). For setup help, read [SUPPORT.md](SUPPORT.md). Project maintenance expectations are in [GOVERNANCE.md](GOVERNANCE.md).

Good first contributions include documentation fixes, setup notes for hosted providers, dashboard bug fixes, issue reproduction steps, and map/mission testing notes.

## Community

- Discord support: [SUDO Gaming Discord](https://discord.gg/jv52WVbFdj)
- Report bugs, feature requests, support questions, and documentation issues with the GitHub issue templates.
- Open pull requests from forks; maintainers review and merge accepted changes.
- Security reports should follow [SECURITY.md](SECURITY.md), not public issues.
- License: source-available non-commercial. See [LICENSE.md](LICENSE.md).
