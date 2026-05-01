# SST Public

SST is an open-source DayZ server management suite. It combines an in-game DayZ mod, a Node/Express API, and a React dashboard so server owners can inspect player data, manage items and vehicles, review logs, and work with common DayZ Expansion economy files.

## Project Status

SST is ready for community testing and contribution, but it should be treated as server-admin software: review configuration before exposing it to the internet, keep API keys private, and test changes on a staging server before using them on a live community.

## What Is Included

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

## Quick Start

1. Install or build the DayZ mod from `SST/`, then load it in your server startup parameters.
2. Start the API:

```bash
cd apps/api
npm ci
cp .env.example .env
npm start
```

3. Configure `apps/api/.env` manually or run the Windows setup wizard:

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File tools/setup-wizard/SetupWizard.ps1
```

4. Start the dashboard:

```bash
cd apps/web
npm ci
npm run dev
```

5. Open the dashboard, connect it to the API, and create the first admin user when prompted.

For the full walkthrough, start with [Getting Started](docs/wiki/Getting%20Started/index.md).

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

## Contributing

SST welcomes community testing, bug reports, documentation fixes, and pull requests. The normal open-source workflow is:

1. Open or find an issue.
2. Fork the repository.
3. Create a focused branch.
4. Run the relevant checks.
5. Open a pull request against `main`.

Start with [CONTRIBUTING.md](CONTRIBUTING.md). For setup help, read [SUPPORT.md](SUPPORT.md). Project maintenance expectations are in [GOVERNANCE.md](GOVERNANCE.md).

Good first contributions include documentation fixes, setup notes for hosted providers, dashboard bug fixes, issue reproduction steps, and map/mission testing notes.

## Configuration

The API reads configuration from `apps/api/.env`. Important settings:

- `STORAGE_BACKEND`: `local`, `ftp`, or `sftp`.
- `SST_PATH`: path to the DayZ profile `SST` folder.
- `API_KEY`: generated on first API startup if left blank.
- `JWT_SECRET`: generated on first API startup if left blank.
- `CORS_ORIGIN`: set this when the dashboard runs on a separate origin.

Do not commit `.env`, database files, logs, `node_modules`, or build output. The repo includes `.gitignore` rules for these files.

## Security Notes

- Keep the API behind a firewall, VPN, reverse proxy, or trusted network where possible.
- Use HTTPS if the dashboard or API is reachable from the internet.
- Rotate `API_KEY` and admin passwords if they were ever shared.
- Remove credentials and player-sensitive data before posting logs in issues.

## Community

- Report bugs, feature requests, support questions, and documentation issues with the GitHub issue templates.
- Open pull requests from forks; maintainers review and merge accepted changes.
- Security reports should follow [SECURITY.md](SECURITY.md), not public issues.
- License: MIT. See [LICENSE.md](LICENSE.md).
