# Security Policy

## Supported Versions

The following versions of the SST ecosystem are currently supported with security updates. Any versions not listed here may contain known or unknown vulnerabilities and should not be used in production environments.

| Component | Version | Supported |
|---------|---------|-----------|
| SST API | 5.1.x | ✅ |
| SST API | 5.0.x | ❌ |
| SST API | 4.0.x | ✅ |
| SST API | < 4.0 | ❌ |
| SST Web Client | Latest main branch | ✅ |
| SST Web Client | Older releases | ❌ |
| SST Mod (DayZ) | Latest release | ✅ |
| SST Mod (DayZ) | Older releases | ❌ |

Security updates are applied only to supported versions. Users are expected to keep their API, web client, and mod versions aligned.

---

## Security Scope

This security policy applies to the following SST components:

### SST API
- REST endpoints
- Authentication and API key handling
- File system access and JSON processing
- Server-to-server communication
- Rate limiting and request validation

### SST Web Client
- Authentication flows
- Secure API communication
- Client-side data handling
- Live map rendering and player location display
- Protection against common web vulnerabilities (XSS, CSRF)

### SST DayZ Mod
- Server-side Enforce Script logic
- JSON export and import files
- Scheduled background tasks
- Integration with other mods (e.g. Expansion)
- File I/O within the DayZ profile directory

The following are **out of scope**:
- Third-party mods or tools
- User-hosted infrastructure misconfiguration
- Reverse engineering or tampering with the DayZ game client
- Issues caused by outdated or unsupported versions

---

## Security Expectations

Users running SST are expected to:
- Keep API keys private and rotated regularly
- Avoid exposing the SST API directly to the public internet without protection
- Use HTTPS where possible
- Restrict file system permissions to the minimum required
- Keep all SST components updated to supported versions

Failure to follow these guidelines may result in increased security risk.

---

## Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public GitHub issue**.

Instead, report it responsibly using one of the following methods:

- **GitHub Security Advisories**
  - Use the “Report a vulnerability” option on the repository

- **Direct contact**
  - Email the project maintainer directly (preferred for critical issues)

When reporting a vulnerability, please include:
- A clear description of the issue
- The affected component (API, Web Client, or Mod)
- Steps to reproduce, if possible
- Potential impact or severity
- Any suggested mitigations (optional)

---

## Disclosure Process

- You can expect an initial response within **72 hours**
- Valid vulnerabilities will be investigated and prioritised
- Fixes will be released for supported versions only
- Coordinated disclosure will be used where appropriate
- Credit may be given to reporters unless anonymity is requested

If a report is declined, an explanation will be provided.

---

## Enforcement

Abuse of vulnerabilities, including exploitation on live servers without consent, may result in:
- Removal from the community
- Revocation of access
- Permanent bans from SST-related services

This policy exists to protect server owners, players, and contributors.

---

Thank you for helping keep SST secure.
