# @SST_Leaderboard Mod Package

In-game leaderboard for SST. Unlike `@SST` (server-only), `@SST_Leaderboard`
adds a UI window so it must be installed on **both** the server and every
connecting client.

## Default keybind

`L` toggles the leaderboard. Action name `UASSTLeaderboardToggle` (rebindable
in DayZ Controls → Persistent).

## Build

```
tools\dayz\Build-Leaderboard.bat
```

Output lands at `dayz/server-mod/@SST_Leaderboard/Addons/SST_Leaderboard.pbo`.

Pass a server path to push it onto the server in one go:

```
tools\dayz\Build-Leaderboard.bat "C:\DayZServer"
```

## Runtime files

The server-side aggregator persists to:

```
$profile:SST/api/leaderboard.json
```

Same folder the SST web dashboard polls — visible there for free.
