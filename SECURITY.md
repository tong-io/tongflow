# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email us at: **security@tongflow.com**

Include the following information:

1. **Description** of the vulnerability
2. **Steps to reproduce** the issue
3. **Potential impact** of the vulnerability
4. **Suggested fix** (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Assessment**: We will assess the vulnerability and determine its severity
- **Updates**: We will keep you informed of our progress
- **Resolution**: We aim to resolve critical issues within 7 days
- **Credit**: We will credit you in the release notes (unless you prefer anonymity)

### Scope

The following are in scope:

- TongFlow web application (`src/`)
- API endpoints (`src/app/api/`)
- Official Modal plugins (`plugins/tongflow-modal-*`)

The following are out of scope:

- Third-party services (Modal, OpenRouter, etc.)
- Issues already reported or known
- Social engineering attacks
- Denial of service attacks

## Security Best Practices for Users

### API Keys

- Never commit API keys to version control
- Use `.env` files (already in `.gitignore`)
- Rotate keys if you suspect they've been exposed

### Desktop Application

- Download releases only from official GitHub Releases
- Verify checksums when available
- Keep the application updated

### Self-Hosting

- Use HTTPS in production
- Keep dependencies updated
- Follow the principle of least privilege for database access
- Secure your Modal tokens

## Security Features

- All API keys are stored in environment variables, not in code
- `.gitignore` excludes sensitive files (`.env`, `data/`, etc.)
- No telemetry or analytics that collect user data
- AGPL-3.0 license ensures transparency

## Acknowledgments

We thank the following individuals for responsibly disclosing security issues:

*No reports yet - be the first!*
