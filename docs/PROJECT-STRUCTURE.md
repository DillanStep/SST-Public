# Project Structure

SST is split by responsibility:

```text
apps/
  api/                 Node/Express API
  web/                 React dashboard
dayz/
  mod-source/SST/      DayZ Enforce Script source
  server-mod/@SST/     Ready-to-copy server-side mod package
  missions/            Mission config bundles
  workbench-template/  DayZ Workbench template project
docs/
  wiki/                User and contributor documentation
tools/
  dayz/                DayZ build and Workbench helpers
  installer/           All-in-one Windows setup builder
  launchers/           Implementations behind root launcher wrappers
  maintenance/         Cleanup and reset scripts
  manager/             SST Manager Windows wrapper
  setup-wizard/        Legacy first-run setup wizard
  updater/             Local update launcher/scripts
```

The repository root is kept for project metadata, legal/community documents, and the small double-click launcher wrappers.
