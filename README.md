# SST Public

SST is a source-available, non-commercial DayZ server management suite. It combines a server-side DayZ mod, a Node/Express API, and a React dashboard so server owners can inspect player data, manage items and vehicles, review logs, and work with common DayZ Expansion economy files.

## Big Early-Release Warning

> **SST has been released early because people were asking whether the project was still active. It is active, and the current build does work, but this is an early MVP.**

Expect some rough edges. Setup is still more manual than it should be, some workflows may feel messy, and the project needs more testing across real hosted DayZ environments. The current goal is to get the basics right first:

- server-side mod loads correctly
- mod writes useful JSON exports
- API reads the server files through local disk, FTP, or SFTP
- dashboard connects to the API
- admins can test the core management tools

Future releases will streamline installation, configuration, packaging, and documentation. For now, treat SST as a working early release for testers and server owners who are comfortable following detailed setup steps.

## How SST Works

SST has three parts:

1. **SST DayZ mod** - Runs on the DayZ server. It exports server state to JSON files and reads command queues written by the API.
2. **SST API** - Runs beside your server or on another machine. It reads the SST JSON files from local disk, FTP, or SFTP, then exposes them to the dashboard.
3. **SST Dashboard** - Runs in a browser. It connects to the API so admins can view players, vehicles, inventories, logs, economy files, and queue supported actions.

The mod is intended to be installed as a **server-side mod**. Players should not need to install SST on their client when your server host supports server-side mods through `-serverMod`.

```text
DayZ server + SST mod  ->  profile/SST JSON files  ->  SST API  ->  Web dashboard
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
- `tools/setup-wizard/` - Windows setup wizard for first-time API configuration.
- `docs/wiki/` - community-facing setup and reference documentation.

## Requirements

- DayZ server with permission to install server-side mods.
- Node.js 18 or newer for the API and dashboard.
- Windows for DayZ server tooling and the setup wizard.
- SFTP/FTP credentials if the DayZ server is hosted by a provider.
- Access to the DayZ server profile folder, usually the folder that will contain `SST/` after the mod starts.

## Quick Start

### 1. Install the Server-Side DayZ Mod

This repository includes a ready-to-install server-side mod package in `@SST/`. It also includes the mod source in `SST/` if you want to rebuild the PBOs yourself.

Copy the whole `@SST/` folder to your DayZ server root and load it as a server-side mod. A typical startup parameter looks like:

```text
-serverMod=@SST -scrAllowFileWrite
```

If your host does not expose `-serverMod`, use the server-side mod field or startup parameter field your host provides. Avoid putting SST in the public client mod list unless your host specifically requires that.

If you rebuild from source, build the PBOs from `SST/` using your normal DayZ tools workflow and place the output in `@SST/Addons/`.

Start the DayZ server once, then check the server profile folder. SST should create:

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

The API needs to read the `SST/` folder created by the mod.

First, find where the mod created its files.

1. Start the DayZ server with `@SST` loaded.
2. Open your DayZ server profile folder.
3. Look for a folder named `SST`.
4. Inside it you should see folders such as `api`, `inventories`, `events`, `life_events`, `trades`, and `vehicles`.
5. That folder is your `SST_PATH`.

If you cannot find the folder, the mod is probably not loaded correctly yet. Fix that before configuring the API.

#### Option A: Local Storage

Use `local` when the API runs on the same machine as the DayZ server.

Example:

```env
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/profiles/SST
```

Use forward slashes `/` in the path, even on Windows. Do not use backslashes.

Good:

```env
SST_PATH=C:/DayZServer/profiles/SST
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
SST_PATH=C:/DayZServer/profiles/SST
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

- `Install-SST.bat` - installs API/web dependencies and builds the dashboard.
- `Start-SST.bat` - starts the API and dashboard locally.
- `Reset-Factory.bat` / `Reset-Factory.ps1` - reset local generated setup state.
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
- `SST_PATH`: path to the DayZ profile `SST` folder.
- `API_KEY`: generated on first API startup if left blank.
- `JWT_SECRET`: generated on first API startup if left blank.
- `CORS_ORIGIN`: set this when the dashboard runs on a separate origin.

Do not commit `.env`, database files, logs, `node_modules`, or build output. The repo includes `.gitignore` rules for these files.

## Troubleshooting

If the dashboard is empty or cannot connect:

1. Confirm the DayZ server loaded the SST server-side mod.
2. Confirm the DayZ profile folder contains `SST/`.
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

- Report bugs, feature requests, support questions, and documentation issues with the GitHub issue templates.
- Open pull requests from forks; maintainers review and merge accepted changes.
- Security reports should follow [SECURITY.md](SECURITY.md), not public issues.
- License: source-available non-commercial. See [LICENSE.md](LICENSE.md).
