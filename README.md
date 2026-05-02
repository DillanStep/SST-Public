# SST Public

SST is an open-source DayZ server management suite. It combines a server-side DayZ mod, a Node/Express API, and a React dashboard so server owners can inspect player data, manage items and vehicles, review logs, and work with common DayZ Expansion economy files.

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
-serverMod=@SST
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

### 2. Choose Local, FTP, or SFTP Storage

The API needs to read the `SST/` folder created by the mod.

Use `local` when the API runs on the same machine as the DayZ server:

```env
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/profiles/SST
```

Use `sftp` or `ftp` when the DayZ server is hosted by a provider:

```env
STORAGE_BACKEND=sftp
SST_PATH=HostHavocDayZServer/SST
SFTP_HOST=example.host
SFTP_PORT=22
SFTP_USER=your-user
SFTP_PASSWORD=your-password
SFTP_ROOT=/remote/root
```

Keep credentials private. Do not commit `.env`.

### 3. Start the API

From the repository root:

```bash
cd apps/api
npm ci
cp .env.example .env
npm start
```

Edit `apps/api/.env` with your storage settings, or run the Windows setup wizard from the repository root:

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File tools/setup-wizard/SetupWizard.ps1
```

The API listens on `http://localhost:3001` by default. Check it with:

```bash
curl http://localhost:3001/health
```

### 4. Start the Dashboard

From the repository root:

```bash
cd apps/web
npm ci
npm run dev
```

Open the URL shown by Vite, usually:

```text
http://localhost:5173
```

On first run, the dashboard will ask you to connect to the API and create the first admin account.

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

SST welcomes community testing, bug reports, documentation fixes, and pull requests. The normal open-source workflow is:

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
- License: MIT. See [LICENSE.md](LICENSE.md).
