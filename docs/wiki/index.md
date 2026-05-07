# SST Public Wiki

SST is a DayZ server tooling stack:

- **In-game mod** exports server state to JSON under `$profile:SST/` and processes JSON “queues” under `$profile:SST/api/`
- **Node API** reads those JSON exports and exposes them as HTTP endpoints, and writes queue requests for the mod to process
- **Web dashboard** consumes the Node API

If you’re new, start here:

- [Getting Started](Getting%20Started/index.md)
- [Multiple Servers](Getting%20Started/Multiple%20Servers.md)
- [First Run Checklist](Getting%20Started/First%20Run%20Checklist.md)
- [API Overview](API/API%20Overview.md)
- [Mod Overview](In-Game%20Integration/Mod%20Overview.md)

If you’re extending SST (adding features):

- [JSON Export](In-Game%20Integration/JSON%20Export.md)
- [Command Queue](In-Game%20Integration/Command%20Queue.md)
- [API Feature Template](SST%20Mod%20Files/SST_ApiFeatureTemplate.md)

Navigation: see [SUMMARY](SUMMARY.md).
