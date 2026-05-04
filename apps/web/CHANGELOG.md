# Changelog

All notable changes to SST Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-05-04

### Added
- Added a visible version badge for admins showing the installed version and whether SST is up-to-date.

### Fixed
- Made update checks retry after server changes and refresh in the background, so a missed first check does not hide the update state.

## [1.0.4] - 2026-05-04

### Added
- Added multi-server management so one dashboard can switch between separate SST API instances.
- Added an admin settings page for editing the active server `.env` without digging through files.
- Added auto-fill for common server paths, including storage, mission files, profile logs, Expansion traders, and Expansion market files.
- Added first-run setup screens for creating the first admin account and entering the server paths SST needs.

### Changed
- Cleaned up the SST logo and dashboard branding.
- Tightened the connection, login, setup, update, and settings screens so the setup flow is easier to follow.
- Updated the docs and quick-start wording for fresh downloads, multi-server installs, Discord support, and DayZ Expansion.

### Fixed
- Fixed the dashboard showing no cached players after the API had been restarted.
- Fixed server log tabs staying at zero when the API can derive the real DayZ profile folder.
- Fixed live script logs waiting on an empty newest file when a recent non-empty log is available.

## [1.0.3] - 2026-05-03

### Changed
- Improved player item and life event logs with themed survival icons, clearer badges, and matching map marker colors.
- Bumped package metadata so the GitHub updater can advertise this patch release.

## [1.0.0] - 2025-01-17

### Added
- Initial open source release
- Multi-server connection management
- Real-time player dashboard with stats
- Interactive DayZ map with player positions
- Vehicle tracking dashboard with map view
- Item search with category filtering
- Item granting interface
- Player management with inventory view
- Expansion market editor
- Economy analysis dashboard
- Server log viewer with live tailing
- Position history with playback
- User management for admins
- Dark theme UI
- Docker deployment support
- Responsive design for mobile

### Security
- JWT-based authentication
- Per-server credential storage
- Role-based feature visibility
- Secure logout with session cleanup

---

## [Unreleased]

### Planned
- Real-time updates via WebSocket
- Push notifications for events
- Custom dashboard layouts
- Mobile app version
- Offline mode with sync
- Theme customization
