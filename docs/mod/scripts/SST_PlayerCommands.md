# SST_PlayerCommands.c

Purpose: processes admin/player commands queued by the Node API (heal, teleport, message, broadcast) and writes results.

Source file: [SST/Scripts/4_World/SST/SST_PlayerCommands.c](../../../SST/Scripts/4_World/SST/SST_PlayerCommands.c)

---

## Files used

- Queue (API → server): `$storage:SST/api/player_commands.json`
- Results (server → API): `$storage:SST/api/player_commands_results.json`

Queue schema:

```c
class SST_PlayerCommandQueue
{
	ref array<ref SST_PlayerCommandRequest> requests;
}
```

Each request is:

```c
class SST_PlayerCommandRequest
{
	string playerId;
	string commandType;
	float value;
	float posX;
	float posY;
	float posZ;
	string message;
	string messageType;
	bool processed;
	string result;
}
```

---

## How it runs

You must start the service (usually from mission init):

```c
SST_PlayerCommands.Start();
```

It polls every 2 seconds:

```c
static const float CHECK_INTERVAL = 2000.0;
```

Flow:

1. Load queue JSON
2. Process all unprocessed requests
3. Save results JSON
4. Clear the queue JSON

---

## Supported commands

### heal

- Requires player online
- `value` is health percentage (0–100; defaults to 100)
- Restores health, blood, food/water; removes agents at 100%

### teleport

- Requires player online
- Requires `posX` and `posZ`
- If `posY <= 0`, it uses `GetGame().SurfaceY(x, z)`

### message

- Requires player online
- Supports:
  - notification popup (`messageType=notification`)
  - chat message (`messageType=chat`)
  - both (`messageType=both`)

### broadcast

- No player id required; sends to all current players

---

## How to add a new command

1. Extend the Node API endpoint to write `commandType` and any extra fields.
2. Add a new branch in `ProcessSingleCommand(...)`:

```c
else if (request.commandType == "my_command")
{
	ProcessMyCommand(request, targetPlayer, playerName);
}
```

3. Implement `ProcessMyCommand(...)`.
4. Set `request.result` to a stable code (`SUCCESS`, `INVALID_*`, etc.).

---

## Common pitfalls

- Make sure your Node API writes JSON with the right root shape: `{ "requests": [...] }`.
- Don’t forget to clear the queue after writing results (this file already does).
- Teleport bounds are hardcoded (`0..20000`); adjust if you support larger maps.

---

## Related pages

- [API Feature Template](SST_ApiFeatureTemplate.md)
- [Inventory + Life Event Logger (+ Grant/Delete API)](SST_InventoryEventLogger.md)
