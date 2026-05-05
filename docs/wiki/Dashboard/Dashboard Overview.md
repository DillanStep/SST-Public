# Dashboard Overview

The SST dashboard is a web UI that talks to the Node API.

Typical responsibilities:

- Authentication and session management
- Displaying online players + last known state
- Comparing leaderboard stats for player activity, kills, deaths, playtime, loot, trades, and vehicles
- Viewing inventories/events/life events
- Running admin commands (heal/teleport/message)
- Editing Expansion market/traders (when enabled)

## Data sources

Most dashboard pages ultimately come from JSON files exported by the mod and exposed by the Node API.

- See [Mod Overview](../In-Game%20Integration/Mod%20Overview.md)
- See [API Overview](../API/API%20Overview.md)
