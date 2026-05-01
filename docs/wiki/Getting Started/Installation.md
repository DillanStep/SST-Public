# Installation

This is the standard community install path. Adjust paths for your host or operating system.

## 1. Install the DayZ Mod

1. Build the mod PBOs from `SST/` using your normal DayZ tools workflow.
2. Add the mod to the DayZ server startup parameters.
3. Start the server once and confirm the profile folder contains `SST/`.
4. Check DayZ script/RPT logs before continuing.

## 2. Configure and Start the API

From the repository root:

```bash
cd apps/api
npm ci
cp .env.example .env
npm start
```

Then edit `apps/api/.env` or, from the repository root, run the setup wizard:

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File tools/setup-wizard/SetupWizard.ps1
```

The API listens on `http://localhost:3001` by default. Check it with:

```bash
curl http://localhost:3001/health
```

## 3. Start the Dashboard

From the repository root:

```bash
cd apps/web
npm ci
npm run dev
```

Open the URL shown by Vite, usually `http://localhost:5173`.

## 4. First Admin User

On a fresh install, the dashboard will prompt you to create the first admin account. Use a strong password and keep the generated API key private.

## Next

- [Configuration](Configuration.md)
- [First Run Checklist](First%20Run%20Checklist.md)
