# SST Node API - Architecture

> Technical overview of the API architecture and design decisions

## Overview

The SST Node API is an Express.js REST API that bridges the SST DayZ mod with the web dashboard. It reads JSON files written by the mod and provides a structured API for the dashboard to consume.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   DayZ Server   │────▶│   SST Node API  │◀────│  SST Dashboard  │
│   (SST Mod)     │     │   (Express.js)  │     │   (React)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   JSON Files              SQLite DB              localStorage
```

## Project Structure

```
apps/api/
├── src/
│   ├── server.js           # Entry point, Express setup
│   ├── config.js           # Path configuration
│   ├── auth/               # Authentication system
│   │   ├── authDb.js       # User/session database
│   │   ├── authMiddleware.js # JWT verification
│   │   ├── authRoutes.js   # Login/logout endpoints
│   │   └── userRoutes.js   # User management
│   ├── db/                 # Database modules
│   │   ├── database.js     # Position tracking DB
│   │   └── archiveDb.js    # Historical data archive
│   ├── routes/             # API route handlers
│   │   ├── dashboard.js    # Aggregated stats
│   │   ├── online.js       # Online players
│   │   ├── vehicles.js     # Vehicle tracking
│   │   ├── items.js        # Item database
│   │   ├── grants.js       # Item granting
│   │   ├── commands.js     # Player commands
│   │   ├── expansion.js    # Expansion mod
│   │   ├── economy.js      # Economy analysis
│   │   ├── positions.js    # Position history
│   │   ├── logs.js         # Server logs
│   │   └── ...
│   ├── middleware/         # Express middleware
│   │   └── auth.js         # API key auth
│   └── utils/              # Utilities
│       └── typesParser.js  # types.xml parser
├── data/                   # SQLite databases
├── docs/                   # Documentation
└── package.json
```

## Data Flow

### Read Operations (Dashboard → Mod Data)

```
Dashboard                API                    Mod Files
    │                     │                        │
    │  GET /api/online    │                        │
    │────────────────────▶│                        │
    │                     │  Read player_tracker.json
    │                     │───────────────────────▶│
    │                     │◀───────────────────────│
    │     JSON Response   │                        │
    │◀────────────────────│                        │
```

### Write Operations (Dashboard → Mod Commands)

```
Dashboard                API                    Mod Files
    │                     │                        │
    │  POST /api/grants   │                        │
    │────────────────────▶│                        │
    │                     │  Write to item_grants.json
    │                     │───────────────────────▶│
    │     { queued }      │                        │
    │◀────────────────────│                        │
    │                     │                        │
    │                     │   Mod reads and executes
    │                     │                        │
    │  GET /grants/results│                        │
    │────────────────────▶│  Read grant_results.json
    │                     │───────────────────────▶│
    │     { success }     │                        │
    │◀────────────────────│                        │
```

## Authentication

### Dual Authentication System

1. **JWT Tokens** - For dashboard users
   - Created on login
   - Stored in HTTP-only cookie or Authorization header
   - Contains user ID, role, session ID
   - 24-hour expiration

2. **API Keys** - For external integrations
   - Static key in environment variable
   - Passed via `x-api-key` header
   - No user context

### Authentication Flow

```
┌─────────┐      ┌─────────┐      ┌─────────┐
│ Request │─────▶│ Extract │─────▶│ Verify  │
│         │      │ Token   │      │ JWT     │
└─────────┘      └─────────┘      └─────────┘
                                       │
                                       ▼
                               ┌─────────────┐
                               │ Check       │
                               │ Session DB  │
                               └─────────────┘
                                       │
                                       ▼
                               ┌─────────────┐
                               │ Attach      │
                               │ req.user    │
                               └─────────────┘
```

## Database Schema

### positions.db

```sql
CREATE TABLE positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  timestamp TEXT NOT NULL,
  map TEXT
);

CREATE INDEX idx_player_id ON positions(player_id);
CREATE INDEX idx_timestamp ON positions(timestamp);
```

### auth.db

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'viewer',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  token_hash TEXT,
  expires_at TEXT,
  created_at TEXT,
  ip_address TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,
  details TEXT,
  ip_address TEXT,
  timestamp TEXT
);
```

## Caching Strategy

### In-Memory Caching

Used for expensive operations:

```javascript
// Dashboard cache (30 seconds)
let dashboardCache = null;
let dashboardCacheTime = 0;
const CACHE_DURATION = 30 * 1000;

// Types.xml cache (5 minutes)
let typesCache = null;
let typesCacheTime = 0;
const TYPES_CACHE_DURATION = 5 * 60 * 1000;
```

### File Read Optimization

- Files read only when cache expired
- `safeReadJson()` helper handles missing files gracefully
- File stats checked before full read when possible

## Error Handling

### Consistent Error Format

```javascript
res.status(500).json({
  error: 'Failed to load data',
  code: 'DATA_LOAD_ERROR',
  details: { path: filePath }
});
```

### Error Categories

| Code Range | Category |
|------------|----------|
| 400-499 | Client errors (validation, auth) |
| 500-599 | Server errors (file, database) |

## Security Considerations

1. **Input Validation** - All inputs validated before use
2. **Path Traversal** - Paths constructed from config, not user input
3. **SQL Injection** - Using prepared statements only
4. **XSS** - JSON responses only, no HTML rendering
5. **CORS** - Configurable origin restrictions

## Performance Considerations

1. **SQLite WAL Mode** - Better concurrent read performance
2. **Prepared Statements** - Compiled once, reused
3. **Streaming** - Large log files streamed, not buffered
4. **Caching** - Expensive operations cached in memory

## Extension Points

### Adding a New Route

1. Create file in `src/routes/`
2. Export Express router
3. Mount in `server.js`

### Adding a New Database

1. Create file in `src/db/`
2. Initialize schema on load
3. Export query functions

### Adding Middleware

1. Create file in `src/middleware/`
2. Export middleware function
3. Use in server.js or specific routes
