# Contributing

This project is split into three main parts:

- **DayZ Mod (Enforce Script):** the in-game exporter + command runner
- **Node API:** reads/writes JSON files and serves REST endpoints
- **Web Dashboard:** React UI that talks to the API

If you’re not sure where a change belongs, open an issue/discussion first with:

- What you’re trying to change
- Which server/map you’re on
- Your DayZ `$profile` layout (what SST folders you see)

## Ground rules

- Keep changes **small and focused** (one feature/fix per PR).
- Don’t include secrets (API keys, JWT secrets, server paths, database files).
- Prefer documenting behavior changes in the wiki and in the relevant app docs.

## Where to look

- **Wiki:** start at [Home](../index.md)
- **API docs:** see [API Overview](../API/API%20Overview.md) and the reference in `apps/api/docs/API.md`
- **Mod scripts docs:** see [Mod Scripts](../SST%20Mod%20Files/Mod%20Scripts.md)

## Local dev quickstart

### API

- Install deps: `cd apps/api ; npm install`
- Run dev server: `npm run dev`

### Web dashboard

- Install deps: `cd apps/web ; npm install`
- Run dev server: `npm run dev`

### Mod scripts

Mod scripts are built/packed via the DayZ mod toolchain; most code changes can be validated by:

- Running a local server with the mod enabled
- Watching `$profile:SST/` for expected JSON output
- Confirming the API ingests/serves the new output

## Pull requests

- Use clear titles (examples: `fix: …`, `feat: …`, `docs: …`).
- Include:
  - What changed
  - Why it changed
  - How to test
  - Any breaking changes

## Code of conduct

Community expectations are defined in `CODE_OF_CONDUCT.md` at the repository root.

## License note

Contributions are expected to be compatible with this repository’s source-available non-commercial license terms. See [License](../Legal/License.md).
