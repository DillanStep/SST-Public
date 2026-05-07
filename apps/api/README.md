# SST Node API

REST API for DayZ server management. The API bridges the SST dashboard with files written by the server-side SST DayZ mod.

## Features

- 🎮 **Player Management** - View online players, inventory, commands
- 🚗 **Vehicle Tracking** - Track, locate, and manage vehicles
- 🎁 **Item Granting** - Grant items to players in-game
- 📊 **Economy Analysis** - Parse mission economy type files and market data
- 🗺️ **Position Tracking** - Historical player position data
- 🏪 **Expansion Integration** - Full market and trader editing
- 📜 **Log Viewing** - Real-time server log access
- 🔐 **Authentication** - JWT + API key dual auth system

## Quick Start

```bash
# From the repository root
cd apps/api

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your paths (see Configuration below)

# Start the server
npm start
```

API runs at `http://localhost:3001`

## Configuration

`apps/api/.env` stores shared API settings. The dashboard creates per-server env files in `apps/api/profiles/` when you add more DayZ servers from Settings.

Edit `.env` for the shared API listener and auth settings:

```env
# Server
PORT=3001
HOST=0.0.0.0

# Security (REQUIRED for production)
JWT_SECRET=your-secure-random-secret
API_KEY=your-api-key
```

Each server profile env stores that server's paths:

```env
SST_PROFILE_ID=chernarus-main
SST_PROFILE_NAME=Chernarus Main
STORAGE_BACKEND=local
SST_PATH=C:/DayZServer/Server1/SST
PROFILES_PATH=C:/DayZServer/Server1
MISSION_PATH=C:/DayZServer/mpmissions/dayzOffline.chernarusplus
MAP_PRESET=chernarusplus
```

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/SETUP.md) | Full installation walkthrough |
| [API Reference](docs/API.md) | Complete endpoint documentation |
| [Architecture](docs/ARCHITECTURE.md) | Technical design overview |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Changelog](CHANGELOG.md) | Version history |

## Project Structure

```
apps/api/
├── src/
│   ├── server.js        # Express entry point
│   ├── config.js        # Path configuration
│   ├── auth/            # Authentication system
│   ├── db/              # SQLite databases
│   ├── routes/          # API endpoints
│   ├── middleware/      # Express middleware
│   └── utils/           # Utilities
├── data/                # Database files
├── profiles/            # Per-server env profiles, not committed
├── docs/                # Documentation
└── .env                 # Shared API configuration
```

## API Overview

```bash
# Health check
GET /health

# Player data
GET /api/dashboard
GET /api/online
GET /api/online/:playerId

# Items
GET /api/items/search?query=M4
POST /api/grants

# Vehicles
GET /api/vehicles
POST /api/vehicles/:id/generate-key

# Commands
POST /api/commands/heal
POST /api/commands/teleport

# Authentication
POST /api/auth/login
```

See [API Reference](docs/API.md) for complete documentation.

## Related Projects

- **[SST Dashboard](../web)** - React web dashboard
- **SST DayZ Mod** - EnforceScript mod (required)

## Support

- 📖 [Documentation](docs/)
- [Report a bug](../../.github/ISSUE_TEMPLATE/bug_report.md)
- [Request a feature](../../.github/ISSUE_TEMPLATE/feature_request.md)

## License

This project is licensed under the SST Source-Available Non-Commercial License. See [LICENSE](LICENSE) for details.
