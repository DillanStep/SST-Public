# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in SST Node API, please report it responsibly.

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email security concerns to: [your-email@example.com]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

### What to Expect

- Acknowledgment within 48 hours
- Assessment within 7 days
- Fix timeline based on severity

### Scope

Security issues we're interested in:

- Authentication bypass
- SQL injection
- Path traversal
- Unauthorized data access
- JWT vulnerabilities
- Secrets exposure

### Out of Scope

- Denial of service (DoS)
- Social engineering
- Physical security
- Issues in dependencies (report to them directly)

## Security Best Practices

When deploying SST Node API:

1. **Use strong admin credentials** - Create a unique first admin account and do not share it
2. **Use strong JWT_SECRET** - Generate a random 64+ character secret
3. **Firewall properly** - Only expose required ports
4. **Use HTTPS** - Deploy behind a reverse proxy with SSL
5. **Keep updated** - Apply security updates promptly
6. **Limit access** - Only give admin access to trusted users

## Known Security Considerations

- API key is transmitted in headers (use HTTPS)
- SQLite databases are file-based (secure file permissions)
- Server paths are configurable (validate in production)
