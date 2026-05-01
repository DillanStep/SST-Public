# Changelog

All notable changes to SST Node API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- MIT license metadata
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
