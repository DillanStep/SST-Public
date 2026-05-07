# Coding Standards

This page defines the “house style” used across SST.

## General

- Prefer **readable names** over cleverness.
- Avoid hardcoded absolute paths; use config + defaults.
- Any new file format or JSON schema should be documented.
- Keep compatibility in mind: changing JSON shapes is a breaking change for the dashboard.

## Node API (apps/api)

- Use `async/await` for async code.
- Validate inputs at the route boundary and return consistent `{ error: ... }` payloads.
- Prefer small route handlers; push heavy logic into `src/utils` helpers.
- Keep filesystem reads/writes safe (create directories, handle missing files).

Suggested conventions:

- Errors: `{ error: "message", hint?: "how to fix" }`
- Logging: prefix categories like `[auth]`, `[db]`, `[files]`.

## Web dashboard (apps/web)

- TypeScript first: avoid `any` unless necessary.
- Keep data fetching in `src/services/` and UI in `src/components/`.
- Prefer small, composable components.
- Run `npm run lint` before PRs.

## DayZ mod scripts (`dayz/mod-source/SST/Scripts`)

- Keep server-only work guarded with `GetGame().IsServer()`.
- Avoid tight loops: use scheduled work (`CallLater`) with reasonable intervals.
- File IO should be resilient: handle missing/invalid JSON without crashing.
- Treat JSON output as an API contract; version or extend carefully.

## Docs

- Use relative links that work from GitHub Pages.
- When documenting a file path under `$profile`, call out whether it’s **server** or **client**.
- Prefer examples that users can paste (sample config blocks, curl requests).
