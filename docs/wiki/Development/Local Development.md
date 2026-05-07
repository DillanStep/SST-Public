# Local Development

## Node API

- `cd apps/api`
- `npm install`
- `npm run dev` or `npm start`

## Web dashboard

- `cd apps/web`
- `npm install`
- `npm run dev`

## Mod

Use your normal DayZ mod workflow:

- Workbench project under `SST/Workbench/` (if present)
- Build PBOs, mount workdrive, launch server

## Common gotchas

- The API needs filesystem access to the DayZ profile `SST/` folder.
- CORS must allow the dashboard origin if cross-origin.
