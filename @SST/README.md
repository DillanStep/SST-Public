# @SST Server Mod Package

This folder is the ready-to-install server-side DayZ mod package for SST.

## Install

1. Copy the whole `@SST/` folder to your DayZ server root.
2. Add SST to the server-side mod startup parameter:

```text
-serverMod=@SST
```

3. Start the server once.
4. Confirm the DayZ profile folder now contains an `SST/` runtime data folder.

Players should not need to install this mod client-side when your host supports `-serverMod`.

The source for this package lives in `SST/`.
