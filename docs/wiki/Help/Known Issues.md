# Known Issues

## High-volume JSON export cost

Very frequent inventory/position export can cause CPU and IO spikes.

- Reduce export frequency
- Export less data (sampling / diffs)
- Prefer server-side aggregation when possible

See [JSON Performance Concerns](../JSON%20Performance%20Concerns.md).

## Mixed template mission files

If you have both template missions and SST missions present, ensure your server is actually loading the intended mission folder.
