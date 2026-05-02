# SST Dashboard

React dashboard for SST DayZ server management.

## Features

- 🎮 **Player Dashboard** - Real-time player stats and management
- 🗺️ **Interactive Map** - Live player positions on DayZ map
- 🚗 **Vehicle Tracker** - Locate and manage all vehicles
- 🔍 **Item Search** - Browse and grant items to players
- 🏪 **Market Editor** - Edit Expansion mod market prices
- 📊 **Economy Analysis** - Spawn rate and pricing insights
- 📜 **Log Viewer** - Real-time server log monitoring
- 👥 **User Management** - Role-based access control
- 🌐 **Multi-Server** - Connect to multiple DayZ servers
- 🌙 **Dark Theme** - Easy on the eyes

## Quick Start

```bash
# From the repository root
cd apps/web

# Install dependencies
npm install

# Start development server
npm run dev
```

Dashboard opens at `http://localhost:5173`

## Requirements

- Node.js 18+
- [SST Node API](../api) running

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/SETUP.md) | Installation walkthrough |
| [Components](docs/COMPONENTS.md) | Component architecture |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Changelog](CHANGELOG.md) | Version history |

## Project Structure

```
apps/web/
├── src/
│   ├── App.tsx          # Main application
│   ├── main.tsx         # Entry point
│   ├── components/      # React components
│   │   ├── features/    # Dashboard views
│   │   └── ui/          # UI primitives
│   ├── services/        # API & utilities
│   └── types/           # TypeScript types
├── public/
│   └── maps/            # DayZ map tiles
├── docs/                # Documentation
└── package.json
```

## Deployment

### Build for Production

```bash
npm run build
```

Output is in the `dist/` folder.

### Docker

```bash
docker build -t sst-dashboard .
docker run -p 80:80 sst-dashboard
```

Or with Docker Compose:

```bash
docker-compose up -d
```

See [Setup Guide](docs/SETUP.md) for more deployment options.

## Screenshots

### Player Dashboard
Real-time server overview with online players and stats.

### Interactive Map
Live player positions with trader zones and teleport support.

### Vehicle Tracker
Track all vehicles with key generation and management.

### Market Editor
Edit Expansion mod market prices with inventory counts.

## Related Projects

- **[SST Node API](../api)** - Backend API (required)
- **SST DayZ Mod** - EnforceScript mod (required)

## Support

- 📖 [Documentation](docs/)
- [Report a bug](../../.github/ISSUE_TEMPLATE/bug_report.md)
- [Request a feature](../../.github/ISSUE_TEMPLATE/feature_request.md)

## License

This project is licensed under the SST Source-Available Non-Commercial License. See [LICENSE](LICENSE) for details.
