# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in Goodform, please report it responsibly. **Do not open a public issue.**

### How to Report

Send an email to the project maintainer with:

- A description of the vulnerability
- Steps to reproduce
- The potential impact
- Any suggested fix (optional)

### What to Expect

- **Acknowledgment:** Within 48 hours of your report.
- **Assessment:** Within 7 business days, you will receive an initial assessment with the severity classification.
- **Resolution:** Critical and high severity issues will be patched as a priority. Medium and low severity issues will be addressed in the next release cycle.

### Supported Versions

Security patches are provided for the current major version only. Users are encouraged to run the latest release.

## Security Measures

### Authentication

- Passwords are hashed with Argon2id via oslo.
- Sessions are managed by Lucia Auth with the Prisma adapter.
- Previous sessions are invalidated on login.

### Authorization

- Role-based access control (Admin, Employee) is enforced at the API level.
- Organization scoping is applied to all data access. Users cannot access data from other organizations.

### Infrastructure

- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) are applied to all responses.
- Login rate limiting: 5 attempts per email per 15 minutes.
- Submission rate limiting uses an atomic Redis counter.
- The production Docker image runs as a non-root user.

### GDPR

- Data export and deletion endpoints enforce organization scoping.
- Actual deletion is processed asynchronously by a background worker.

## Scope

This security policy covers the Goodform application code only. It does not cover:

- Third-party dependencies (report upstream)
- Infrastructure misconfigurations in your deployment
- Social engineering attacks
