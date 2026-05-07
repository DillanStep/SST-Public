# Contributing to SST

Thanks for helping improve SST. This project includes a DayZ server mod, mission templates, a Node/Express API, a React dashboard, setup tooling, and documentation. Good contributions are focused, testable, and clear about the part of the stack they touch.

## How Contributions Work

SST accepts community contributions through GitHub issues and pull requests:

1. Open an issue for bugs, larger features, or unclear behavior.
2. Fork the repository and create a branch for your change.
3. Keep the change focused on one problem.
4. Run the relevant checks before opening a pull request.
5. Link the issue from the pull request when one exists.

Public contributors do not need write access to the repository. Pull requests from forks are the normal contribution path. Maintainers review and merge accepted changes.

## Repository Map

- `dayz/mod-source/SST/` - DayZ mod source in Enforce Script.
- `dayz/server-mod/@SST/` - ready-to-install server-side mod package.
- `dayz/missions/` - supported mission configuration bundles.
- `apps/api/` - Node/Express API and server-side data access.
- `apps/web/` - React dashboard.
- `tools/launchers/` - Windows launcher implementations used by root wrappers.
- `tools/setup-wizard/` - Windows setup wizard.
- `tools/dayz/` - DayZ build and Workbench helper scripts.
- `docs/wiki/` - user-facing documentation.
- `.github/` - issue templates, pull request template, CI, and repository automation.

## Local Setup

API:

```bash
cd apps/api
npm ci
npm start
```

Dashboard:

```bash
cd apps/web
npm ci
npm run dev
```

Setup wizard:

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File tools/setup-wizard/SetupWizard.ps1
```

## Checks

Run the checks that match your change.

API:

```bash
cd apps/api
find src -name "*.js" -print0 | xargs -0 -n1 node --check
npm audit --omit=dev --audit-level=high
```

Dashboard:

```bash
cd apps/web
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

Windows users can run the same checks from Git Bash, WSL, or PowerShell with equivalent commands.

## Pull Request Guidelines

- Explain what changed and why.
- Keep unrelated refactors out of the pull request.
- Include screenshots for dashboard UI changes.
- Include the map, mission, or DayZ server setup you tested against when relevant.
- Update documentation when setup, configuration, or user-visible behavior changes.
- Mention any migration steps or new environment variables.

## What Not To Commit

Do not commit:

- `.env` files or real credentials.
- API keys, JWT secrets, SFTP/FTP passwords, Steam tokens, or hosting provider secrets.
- Player IP addresses, private player data, or unredacted server logs.
- `node_modules`, build output, local databases, DayZ profile output, crash dumps, or generated runtime files.
- Private signing keys such as `.biprivatekey`.

The `.gitignore` file covers common cases, but review your changes before opening a pull request.

## Issue Triage

Maintainers may add labels, ask for reproduction details, close duplicates, or move support questions to discussions. Issues without enough information may be closed after follow-up.

Good bug reports include:

- What happened.
- What you expected.
- Steps to reproduce.
- Relevant logs with secrets removed.
- Your OS, Node.js version, hosting type, DayZ map, and whether Expansion is installed.

## Becoming a Maintainer

Regular contributors may be invited to help maintain a part of the project. Maintainers are expected to review respectfully, keep changes scoped, protect user security, and avoid merging their own risky changes without a second look.

## License

By contributing, you agree that your contribution is licensed under the SST Source-Available Non-Commercial License used by this repository.
