# DayZ Files

This folder contains the DayZ-facing parts of SST.

- `server-mod/@SST/` - ready-to-copy server-side mod package.
- `mod-source/SST/` - Enforce Script source used to build `SST.pbo`.
- `missions/` - mission configuration bundles and templates.
- `workbench-template/` - DayZ Workbench project template files.

Most server owners only need `server-mod/@SST/`. Developers rebuilding the PBO work in `mod-source/SST/` and can use `tools/dayz/Build-Mod.bat`.
