# Security Policy

## Supported Versions

TongFlow is under active development. Security fixes are applied to the latest
release on the `main` branch. Please make sure you are running the most recent
version before reporting an issue.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report them privately so we can address the issue before it is disclosed:

- Email **security@tongflow.com** with a description of the vulnerability, and
- (Preferred) Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  via the **Security** tab of this repository.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce (proof of concept if possible).
- Affected version / commit and your environment.

## What to Expect

- We aim to acknowledge your report within **3 business days**.
- We will keep you informed about our progress toward a fix.
- We ask that you give us a reasonable amount of time to release a fix before any
  public disclosure, and we will credit you (if you wish) once the issue is resolved.

## Handling Secrets

TongFlow integrates with several third-party providers (Modal, OpenAI, OpenRouter,
Gemini, PyPI, …). **Never commit real credentials.** Keep them in your local `.env`
(which is gitignored); only `.env.example` with placeholder values is tracked. If you
believe a secret has been exposed, rotate it immediately and notify us at the address
above.
