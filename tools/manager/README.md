# SST Manager

SST Manager is a small Windows wrapper for running SST without extra console windows.
It keeps the Node API as-is, launches it hidden, tails logs, opens the dashboard, and
provides one place to restart SST or run the updater.

## Build

Run:

```bat
tools\manager\Build-SST-Manager.bat
```

The executable is written to:

```text
build\SST-Manager\SST Manager.exe
```

## Launch

Start the executable from inside this repository, or pass an explicit project path:

```bat
"build\SST-Manager\SST Manager.exe" --repo-root "C:\Path\To\SST"
```

You can also set `SST_REPO_ROOT` to the project path.

For a non-UI smoke test:

```bat
"build\SST-Manager\SST Manager.exe" --smoke-test --repo-root "C:\Path\To\SST"
```

## What it manages

- Starts `apps/api/src/server.js` with no visible console window.
- Writes manager and API output to `logs/manager-*.log`.
- Installs missing dependencies and rebuilds the dashboard when needed.
- Opens the dashboard using the API port from `apps/api/.env`.
- Runs `tools/updater/Update-SST.bat` from the manager UI.
- Opens the bundled `@SST` server mod folder or copies it into a selected
  DayZ server folder from the `Mod` button.
- Provides a Factory Reset action from the `Reset` button/tray menu. It backs up
  SST runtime config under `backups/factory-reset-*`, recreates a clean API
  `.env`, clears the dashboard browser state on next launch, and leaves DayZ
  server files alone.
- Keeps a tray icon so SST can stay running while the manager window is hidden.
