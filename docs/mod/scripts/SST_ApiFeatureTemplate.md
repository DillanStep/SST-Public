# SST_ApiFeatureTemplate.c

Purpose: a copy/paste template for adding a new SST feature that is backed by the Node API using the **standard JSON queue → processing → results** pattern.

Source file: [SST/Scripts/4_World/SST/SST_ApiFeatureTemplate.c](../../../SST/Scripts/4_World/SST/SST_ApiFeatureTemplate.c)

---

## When to use this pattern

Use this template when you want:

- A dashboard/API endpoint that triggers server work (spawn, modify, purge, repair, etc.)
- A **durable** transport (JSON files) instead of RPC
- Requests that can be audited and retried

This is the exact same “bridge” pattern used by existing SST features like player commands, item grants, and vehicle key generation.

---

## Files created at runtime

The template uses these paths (all relative to DayZ `$storage`):

- Queue (API → server): `$storage:SST/api/template_queue.json`
- Results (server → API): `$storage:SST/api/template_results.json`
- Optional export (server → API snapshot): `$storage:SST/template_export.json`

You should rename these filenames for your feature.

---

## What to edit (the fast checklist)

1. Copy the script file and rename it, for example:
   - `SST_ApiFeatureTemplate.c` → `SST_MyFeature.c`
2. Rename DTOs and service class:
   - `SST_TemplateRequest`, `SST_TemplateQueue`, `SST_TemplateService`, etc.
3. Choose unique queue/results/export file names.
4. Decide the request schema:
   - required fields
   - validation rules
   - statuses (`pending`, `completed`, `failed`)
5. Start the service (usually from mission init).
6. Add matching Node API endpoints:
   - one that **writes** the queue JSON
   - one that **reads** the results JSON
   - optionally one that **reads** the export snapshot

---

## Request/queue schema

### Request DTO

The request DTO is designed to be JSON-serializable with `JsonFileLoader`:

```c
class SST_TemplateRequest
{
	string requestId;
	string playerId;
	string action;

	string payloadText;
	float payloadValue;
	float posX;
	float posY;
	float posZ;

	bool processed;
	string status;
	string result;
	string processedAt;
}
```

Guidelines:

- Keep fields **public** and **simple** (strings, numbers, bools, vectors)
- Avoid nested complex types unless you control detailing (arrays of DTOs are fine)
- Don’t put secrets in JSON

### Queue wrapper

Use a single root object that contains `requests`:

```c
class SST_TemplateQueue
{
	ref array<ref SST_TemplateRequest> requests = new array<ref SST_TemplateRequest>();
}
```

This matches the existing queues used by SST.

---

## Service lifecycle (how it runs)

The service is inert until you call:

```c
SST_TemplateService.Start();
```

Internally it:

- Ensures `$storage:SST` and `$storage:SST/api` exist
- Guards server-only execution with `GetGame().IsServer()`
- Uses `CallLater` to poll the queue periodically

Polling loop (simplified):

```c
GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM)
	.CallLater(ProcessQueueAndSchedule, QUEUE_POLL_INTERVAL_MS, false);
```

---

## Processing flow

### 1) Load queue JSON

```c
if (!SST_Persistence<SST_TemplateQueue>.LoadJson(QUEUE_FILE, queue, errorMsg))
	return;
```

### 2) Process unprocessed requests

```c
foreach (SST_TemplateRequest req : queue.requests)
{
	if (!req || req.processed)
		continue;

	HandleRequest(req);
}
```

### 3) Save results + clear queue

The template writes the annotated queue to `RESULT_FILE`, then clears `QUEUE_FILE`.

This is important because:

- results remain stable for the API/UI to read
- the API can write new commands without merging conflicts

---

## Implementing your feature logic

Your main extension point is:

```c
protected void HandleRequest(SST_TemplateRequest req)
```

Recommended conventions:

- Always set `req.processed = true` and `req.processedAt`
- Use `req.status` one of:
  - `pending` (initial)
  - `completed` (success)
  - `failed` (failure)
- Use `req.result` as a compact code (`SUCCESS`, `PLAYER_NOT_FOUND`, etc.)

Example action routing:

```c
if (req.action == "repair_vehicle")
{
	// do work
	req.status = "completed";
	req.result = "SUCCESS";
	return;
}

req.status = "failed";
req.result = "UNKNOWN_ACTION";
```

---

## Player lookups (Steam64)

The template includes a standard helper:

```c
static PlayerBase FindPlayerBySteamId(string steamId)
```

Notes:

- `ident.GetPlainId()` is the Steam64 id (string)
- Most API requests should use Steam64

---

## Optional: export snapshots (server → API)

If your feature produces data periodically (not request-driven), you can write a snapshot JSON file.

Example:

```c
ref SST_TemplateExport snapshot = new SST_TemplateExport();
snapshot.generatedAt = GetUTCTimestamp();

ref SST_TemplateExportEntry entry = new SST_TemplateExportEntry();
entry.timestamp = snapshot.generatedAt;
entry.message = "Template export is running";

snapshot.entries.Insert(entry);
snapshot.entryCount = snapshot.entries.Count();

SST_Persistence<SST_TemplateExport>.SaveJson(EXPORT_FILE, snapshot, errorMsg);
```

---

## Node API integration (what endpoints to add)

A typical pairing in the Node API is:

- `POST /myfeature/do-thing` → append to `template_queue.json`
- `GET /myfeature/results` → return `template_results.json`

Keep the JSON structure consistent (`{ "requests": [...] }`).

---

## Common pitfalls

- Forgetting to call `Start()` (service never runs)
- Running on client: always guard with `GetGame().IsServer()` for file I/O and gameplay mutations
- Queue never clears: ensure you clear the queue after writing results
- Non-unique `requestId`: include a timestamp + random suffix on the API side
- JSON fields renamed without updating the API and UI

---

## Related pages

- [Player Commands](SST_PlayerCommands.md)
- [Inventory + Life Event Logger (+ Grant/Delete API)](SST_InventoryEventLogger.md)
- [Vehicle Tracker](SST_VehicleTracker.md)
