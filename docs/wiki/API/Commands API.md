# Commands API

Commands are executed in-game via a JSON queue.

Endpoints:

- `POST /commands/heal`
- `POST /commands/teleport`
- `POST /commands/message`
- `POST /commands/broadcast`
- `GET /commands/results`
- `GET /commands/pending`

Backing files:

- `$profile:SST/api/player_commands.json`
- `$profile:SST/api/player_commands_results.json`

Implementation:

- [docs/mod/scripts/SST_PlayerCommands.md](../../mod/scripts/SST_PlayerCommands.md)
