# Requirements

## DayZ Server

- A working DayZ dedicated server.
- Permission to install and load server-side mods.
- Write access to the server profile directory. SST writes data under `$profile:SST/`.
- A test/staging server is strongly recommended before enabling SST on a live community.

## Node API

- Node.js 18 or newer.
- Network access from the API process to the SST data folder:
  - `local` backend for same-machine installs.
  - `sftp` or `ftp` backend for hosted providers.
- A private API key. SST can generate one on first startup.

## Web Dashboard

- Node.js 18 or newer for local development.
- A browser supported by current Chromium, Firefox, or Edge releases.
- Optional: Docker if you want to serve the dashboard as a container.

## Production Hosting

- HTTPS for any public dashboard/API endpoint.
- Firewall rules that only expose the ports you intend to expose.
- Backups for API SQLite data if you rely on history/archive features.
