# SST_ExpansionVehicleSpawn.c

Purpose: hooks Expansion Vehicles key pairing to detect **trader vehicle purchases** and pass them into the SST vehicle tracker.

Source file: [dayz/mod-source/SST/Scripts/4_World/SST/SST_ExpansionVehicleSpawn.c](../../../dayz/mod-source/SST/Scripts/4_World/SST/SST_ExpansionVehicleSpawn.c)

---

## Build/compile conditions

Only compiled when Expansion Vehicles are present:

```c
#ifdef EXPANSIONMODVEHICLE
...
#endif
```

---

## What it hooks

This file modded-overrides:

- `ExpansionCarKey.PairToVehicle(ExpansionVehicle vehicle)`

That method is called when a key is paired to a vehicle — which happens during an Expansion trader purchase.

---

## How it detects “real purchases”

To avoid false positives (e.g., keys generated via SST dashboard), it checks:

1. There is a MarketReserve on the player
2. The reserve has a Trader context

If no trader context is found, it prints a message and returns.

It also avoids duplicates by checking:

- `SST_VehicleTracker.IsVehicleTracked(vehicleId)`

---

## Where the data goes

On success it calls:

- `SST_VehicleTracker.LogVehiclePurchase(...)`

Which records a purchase entry and begins tracking the vehicle.

---

## How to modify

### Change “purchase detection” rules

If your server has other vehicle flows that should count as purchases, adjust the reserve/trader checks.

### Capture additional metadata

You can capture more details (currency, skin, trader object id) here, but you’ll also need to:

- extend purchase DTOs in [SST_VehicleTracker.c](SST_VehicleTracker.md)
- update any API readers/UI components

---

## Related pages

- [Vehicle Tracker (keys/deletes/positions)](SST_VehicleTracker.md)
