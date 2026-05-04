# SST_VehicleTracker.c

Purpose: tracks Expansion vehicle purchases and state, writes JSON for the API/dashboard, and processes API-driven vehicle key generation + vehicle deletion.

Source file: [SST/Scripts/4_World/SST/SST_VehicleTracker.c](../../../SST/Scripts/4_World/SST/SST_VehicleTracker.c)

---

## Build/compile conditions

Only compiled when Expansion Vehicles is present:

```c
#ifdef EXPANSIONMODVEHICLE
...
#endif
```

---

## What it writes

### Tracked vehicles

- Folder: `$storage:SST/vehicles/`
- Tracked state: `$storage:SST/vehicles/tracked.json`
- Purchase history: `$storage:SST/vehicles/purchases.json`

### API queues/results

- Key queue: `$storage:SST/api/key_grants.json`
- Key results: `$storage:SST/api/key_grants_results.json`

- Delete queue: `$storage:SST/api/vehicle_delete.json`
- Delete results: `$storage:SST/api/vehicle_delete_results.json`

---

## How purchases are detected

Vehicle purchases are detected via the hook in:

- [SST_ExpansionVehicleSpawn.c](SST_ExpansionVehicleSpawn.md)

That file calls into this tracker to:

- record purchase metadata (`SST_VehiclePurchaseData`)
- start tracking the vehicle (`SST_TrackedVehicle`)

---

## Position tracking

The tracker periodically scans entities and updates `lastPosition` for vehicles it knows about.

Key concepts:

- Vehicle id is the Expansion persistent id: `A-B-C-D`
- It updates timestamps using `GetUTCTimestamp()`

If you want a tighter/looser update cadence, adjust:

```c
static const float POSITION_UPDATE_INTERVAL = 60.0;
```

---

## API-driven key generation

The API writes `SST_KeyGenerationQueue` requests.

Important behavioral notes:

- The target player must be online to receive the key.
- Requests are processed, then the queue is cleared and results written.

If you want offline delivery, you’ll need persistence (e.g., store pending grants per SteamId and deliver on connect).

---

## API-driven vehicle deletion

The API writes `SST_VehicleDeleteQueue` requests.

Deletion typically requires:

- resolving the vehicle entity by persistent id
- deleting it safely server-side
- recording a result code for the dashboard

---

## How to extend

Common extensions:

- Add more metadata to tracked vehicles (garage id, insurance, last driver)
- Add additional queue actions (lock/unlock, repair, refuel)
- Improve entity searching (smaller world scan or cached lookup)

When you extend DTOs, keep the Node API readers tolerant to missing fields.

---

## Related pages

- [Expansion Vehicle Purchase Hook](SST_ExpansionVehicleSpawn.md)
- [API Feature Template](SST_ApiFeatureTemplate.md)
