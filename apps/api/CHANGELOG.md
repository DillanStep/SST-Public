# Changelog

All notable changes to SST Node API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.9] - 2026-05-07

### Fixed
- Fixed future dashboard updates to run the target release updater script when available, so older local updater scripts cannot block copying in newer updater fixes.
- Backed up per-server API profile env files from `apps/api/profiles` during updates.

## [1.0.8] - 2026-05-07

### Fixed
- Fixed switching between saved servers so each server keeps its own auth state and transient auth-check failures no longer log out the current session.
- Fixed newly created server switching so servers on the same API can reuse the current admin session instead of forcing another login.
- Fixed the Windows updater on PowerShell 5.1 by correcting update archive path handling and improving updater log/state reporting.
- Fixed updater logs so the PowerShell updater writes the real failure step instead of the launcher overwriting it with a generic exit-code message.
- Fixed multi-server settings so each added server gets its own `servername.env` profile file instead of sharing one runtime `.env`.

### Changed
- Split the dashboard/API release version from the bundled DayZ mod version so dashboard-only updates do not force a mod heartbeat version bump.
- Added a bottom-right version badge showing the web client version and the running or expected SST mod version.

## [1.0.7] - 2026-05-07

### Added
- Added Expansion ATM account management in Player Manager, including balance lookup, compensation messages, manual overrides, hot reload support, and balance history charts.
- Added optional DayZ Expansion AI positions on the live map when AI position exports are available.
- Added a clearer Settings experience with grouped navigation, path browsing helpers, and local folder selection support.
- Added mod activity monitoring so the API console reports heartbeat, player, grant, command, key grant, item, and AI bridge file updates as they arrive.
- Added an optional Windows SST Manager wrapper that starts the API hidden, opens the dashboard, tails logs, and can run the updater from one tray app.
- Added a self-contained Windows setup builder that produces `SST Setup.exe` with the SST payload and manager embedded.
- Bundled the `@SST` server mod in the setup payload and added admin helpers for copying it to a local DayZ server folder.
- Added a GitHub Release workflow that builds and uploads the Windows setup EXE plus a SHA256 checksum for version tags.
- Added a strict non-commercial Terms and Conditions gate to the Windows setup installer.

### Fixed
- Fixed the heal command so admin healing restores player condition without knocking the player out or killing them.
- Fixed dashboard static asset handling and launcher port checks so stale hashed web chunks and duplicate API instances do not break startup.
- Added a Windows batch launcher for dashboard updates so installer startup, logging, and failures are reported reliably.
- Wrote updater status JSON as UTF-8 without a BOM and made the API tolerate older BOM-written status files.
- Fixed multi-server dashboard map selection by letting the active API profile map config override stale local map metadata.
- Added automatic API profile matching for saved dashboard servers so numbered SUDO servers do not silently connect to the default profile.

## [1.0.6] - 2026-05-05

### Added
- Added single-API multi-server profile support for hosted and local server setups.
- Added mission economy type-file discovery through `cfgeconomycore.xml` `<file type="types">` entries.
- Added leaderboard and richer online player/version status data.
- Added dashboard support for generating and saving API keys from the add-server flow.

### Changed
- Improved setup, server management, and update status flows for multi-server operators.
- Improved economy pricing recommendations by using all loaded mission type files.
- Updated documentation for hosted provider profiles, mission economy files, and troubleshooting.

## [1.0.5] - 2026-05-04

### Changed
- Bumped the API package version so the dashboard updater can pick up the web status badge release.

## [1.0.4] - 2026-05-04

### Added
- Added editable runtime settings in the dashboard, including storage, mission, Expansion, log, auth, and update options.
- Added path auto-fill for local servers so SST can work out the mission folder, profile folder, Expansion folders, and runtime JSON paths from `SST_PATH`.
- Added a small mod-side persistence layer so runtime JSON reads and writes go through one place.
- Added multi-server dashboard connection support for admins running several DayZ servers.

### Changed
- Standardized SST runtime bridge files under `$profile:SST` and centralized path handling so the API and mod use the same folder.
- Reduced repeat disk writes from inventories, online players, trade logs, event logs, and vehicle tracking.
- Reworked vehicle tracking to keep live references where possible and avoid routine whole-map scans.
- Cleaned up the startup batch files and rebuilt the packed `@SST` mod as `SST.pbo`.

### Fixed
- Fixed dashboard player data disappearing after the API restarts by loading the current bridge files back into the API cache.
- Fixed server logs showing empty lists when `PROFILES_PATH` is not set; local installs now derive the profile folder from the mission path.
- Fixed live log view getting stuck on an empty newest log file when the previous log has content.

## [1.0.3] - 2026-05-03

### Changed
- Bumped package metadata so the GitHub updater can advertise the latest dashboard patch release.

## [1.0.0] - 2025-01-17

### Added
- Initial open source release
- Player tracking and real-time position monitoring
- Vehicle tracking with key generation
- Item database with search functionality
- Item granting system
- Player commands (heal, teleport, kill, message)
- DayZ Expansion mod integration (market, traders, banking)
- Economy analysis from mission economy type files
- Server log viewer with live tailing
- Position history with SQLite storage
- User authentication with JWT tokens
- Role-based access control (admin, manager, viewer)
- API key authentication for external access
- Automatic database archiving
- Comprehensive API documentation

### Security
- Source-available non-commercial license metadata
- Passwords hashed with bcrypt
- JWT tokens with session validation
- Audit logging for all auth events
- Prepared statements for all database queries
