# Releasing SST

Use GitHub Releases as the public download page. Fresh installs download the
Windows setup EXE. Existing installs still use the dashboard updater, which reads
the latest GitHub release tag and applies the release source archive.

## Release Steps

1. Update version numbers in:
   - `apps/api/package.json`
   - `apps/web/package.json`
   - release notes/changelog

2. Commit and push the release changes.

3. Create and push a version tag:

   ```bat
   git tag v1.0.7
   git push origin v1.0.7
   ```

4. Wait for the `Release Installer` GitHub Action to finish.

5. Confirm the GitHub Release has these downloadable assets:
   - `SST-Setup-v1.0.7.exe`
   - `SST-Setup-v1.0.7.exe.sha256`

## Manual Rebuild

If the release exists but the installer needs rebuilding, run the
`Release Installer` workflow manually and provide the existing tag.

## What Ships In The Installer

The installer embeds:

- SST API and dashboard source.
- Built dashboard files from `apps/web/dist`.
- Prebuilt `SST Manager.exe`.
- The bundled DayZ server mod at `dayz/server-mod/@SST/Addons/SST.pbo`.
- Non-commercial Terms and Conditions. The setup EXE requires users to accept
  them before installation can begin.

The installer payload must not include:

- `apps/api/.env`
- `node_modules`
- `.git`
- local logs, backups, API data, or API profiles
