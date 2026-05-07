# Project Structure

This repository contains:

- `dayz/mod-source/SST/` – the DayZ mod source
- `dayz/server-mod/@SST/` – the ready-to-install server-side mod package
- `dayz/missions/` – mission templates and server mission files
- `dayz/workbench-template/` – DayZ Workbench template files
- `apps/api/` – Node API (Express)
- `apps/web/` – web dashboard (Vite + React)
- `tools/` – setup, launcher, build, updater, installer, and maintenance scripts
- `docs/` – documentation (this wiki + mod script docs)

## Where to edit

- Mod logic: `dayz/mod-source/SST/Scripts/**`
- API routes: `apps/api/src/routes/*`
- Dashboard UI: `apps/web/src/*`
