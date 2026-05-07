# Getting Started

This section gets SST running end-to-end:

- DayZ server + SST mod exporting JSON
- Node API reading those exports and writing command queues
- Web dashboard talking to the Node API

Start here:

- [Requirements](Requirements.md)
- [Installation](Installation.md)
- [Configuration](Configuration.md)
- [Multiple Servers](Multiple%20Servers.md)
- [First Run Checklist](First%20Run%20Checklist.md)

Important: install and run the DayZ server-side mod before testing the dashboard connection. SST writes its data under `$profile:SST/`, where `$profile` is the folder set by your DayZ `-profiles` startup parameter.
