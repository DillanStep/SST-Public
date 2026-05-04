# Changelog

All notable changes to SST Node API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Moved SST runtime bridge files to `$storage:SST`, with legacy `$profile:SST` reads kept in place so existing servers do not lose data after updating.
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
- Economy analysis from types.xml
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

---

## [Unreleased]

### Planned
- WebSocket support for real-time updates
- Rate limiting middleware
- Scheduled tasks (archiving, cleanup)
- Multi-server support from single API
- Plugin system for extensions
