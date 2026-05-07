# SST Setup

This builds a self-contained Windows installer executable for SST.

Run:

```bat
tools\installer\Build-SST-Installer.bat
```

Output:

```text
build\SST-Installer\publish\SST Setup.exe
```

The installer embeds the SST source package plus the prebuilt `SST Manager.exe`.
At install time it requires agreement to the non-commercial Terms and Conditions,
extracts SST, preserves local `.env` files, optionally runs `npm install` /
`npm run build`, and creates desktop/start-menu shortcuts.
