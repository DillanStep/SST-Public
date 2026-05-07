# Maintenance Tools

These scripts are for local project housekeeping. They are not part of the SST runtime.

## Clean Workspace

`Clean-Workspace.ps1` removes generated build/runtime output that makes the repo feel messy during local development.

By default it is a dry run:

```powershell
tools\maintenance\Clean-Workspace.bat
```

Delete the listed generated files after reviewing the dry run:

```powershell
tools\maintenance\Clean-Workspace.bat -Force
```

Also remove dependency folders when you want a deeper cleanup:

```powershell
tools\maintenance\Clean-Workspace.bat -Force -IncludeNodeModules
```

The cleaner only targets generated files under the repository root. It does not remove `.env` files or source folders.
