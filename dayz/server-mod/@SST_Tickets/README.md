# @SST_Tickets Mod Package

In-game ticket system for SST. Like `@SST_Leaderboard`, must be installed on
**both** the server and every connecting client.

## How players use it

Type `!ticket` (or `!tickets`) in chat and press Enter. The chat command is
detected client-side and the ticket window opens. The chat message is NOT
broadcast.

The window has two tabs:
- **MY TICKETS** — list of your existing tickets (newest first).
- **NEW TICKET** — form with subject + description; click SUBMIT.

`ESC` closes the menu.

## Build

```
tools\dayz\Build-Tickets.bat
```

Output lands at `dayz/server-mod/@SST_Tickets/Addons/SST_Tickets.pbo`.

## Runtime files

Per-player ticket file at:

```
$storage:SST/api/tickets/<steam64>.json
```

Same `$storage:SST/api/` folder the SST web dashboard reads. The dashboard
shows these as in-game tickets on the Support Tickets page and can persist
admin replies, claims, and close actions back into the player ticket file.

## Limits

- 50 tickets retained per player (oldest pruned when over)
- Subject capped at 80 chars
- Body capped at 2000 chars
- 5-second per-player throttle on creation
