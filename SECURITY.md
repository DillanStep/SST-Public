# Security Policy

SST is server-admin software. Treat API keys, dashboard accounts, FTP/SFTP credentials, server logs, and player data as sensitive.

## Supported Versions

Security fixes are provided for:

| Component | Supported version |
|-----------|-------------------|
| SST API | Latest `main` branch and latest public release |
| SST Dashboard | Latest `main` branch and latest public release |
| SST DayZ Mod | Latest `main` branch and latest public release |
| Mission templates | Latest `main` branch |

Older branches and private forks are not guaranteed to receive security fixes.

## Scope

This policy covers:

- Authentication and session handling.
- API key handling.
- File access through local, FTP, or SFTP storage backends.
- Command queues written for the DayZ mod.
- JSON export/import behavior.
- Dashboard handling of server, player, and admin data.
- Setup scripts and generated configuration.

Out of scope:

- Third-party DayZ mods.
- Hosting-provider control panels.
- User-hosted firewall, VPN, reverse proxy, or operating system misconfiguration.
- Reports that require attacking a live server without permission.
- Publicly posting secrets or private player data.

## Reporting a Vulnerability

Do not open a public GitHub issue for security problems.

Use GitHub private vulnerability reporting if available on the repository, or contact the maintainer privately. Include:

- A clear description of the issue.
- Affected component: API, dashboard, mod, setup tooling, or mission config.
- Steps to reproduce, if safe to share.
- Potential impact.
- Suggested mitigation, if known.

Please redact credentials, IP addresses, private player data, and server-owner details.

## Expected Response

- Initial response target: 72 hours.
- Valid reports will be investigated and prioritized.
- Fixes may be released as commits, tagged releases, or security advisories depending on severity.
- Coordinated disclosure is preferred for issues that could affect live servers.

## Security Expectations For Operators

Server owners should:

- Keep API keys and dashboard passwords private.
- Rotate secrets after accidental exposure.
- Avoid exposing the SST API directly to the public internet without HTTPS and access controls.
- Restrict filesystem permissions to the minimum required.
- Test updates on a staging server before using them on a live community.
- Remove credentials and player-sensitive data before sharing logs.

Thank you for helping keep SST safe for server owners and players.
