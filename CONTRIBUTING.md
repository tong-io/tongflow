# Contributing to TongFlow

Thanks for your interest in contributing to TongFlow! This guide covers the essentials.

## Code of Conduct

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be respectful and constructive; we welcome contributors from all backgrounds.

## Prerequisites

- Node.js 20+
- pnpm
- Python 3.10+ (only needed for Modal plugin development)
- Modal account (free tier at [modal.com](https://modal.com)) — for GPU/CPU inference

## Development Setup

```bash
git clone https://github.com/tong-io/tongflow.git
cd tongflow
pnpm install

cp .env.example .env       # fill in your API keys / tokens

# Optional, for running Modal plugins locally:
pip install modal && modal setup

pnpm dev                   # http://localhost:3000
```

Project conventions (directory layout, the ABI contract, plugin authoring rules) live
in [CLAUDE.md](CLAUDE.md). Plugin development is documented in [docs/plugins.md](docs/plugins.md).

## Submitting a Pull Request

1. Fork and branch from `main`: `git checkout -b feat/your-feature`.
2. Make your changes, following existing patterns and keeping PRs narrowly scoped.
3. Verify before pushing:

   ```bash
   pnpm typecheck
   pnpm lint:check
   pnpm build
   ```

4. Use [Conventional Commits](https://www.conventionalcommits.org/) for messages
   (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:` …) and open a PR against `main`.

Comments in code must be in English. File names use kebab-case; React components use PascalCase.

## Reporting Bugs & Requesting Features

Use [GitHub Issues](https://github.com/tong-io/tongflow/issues) with the provided
templates. For questions, join our [Discord](https://discord.gg/K7V8az94Zf).

## License & Contributor License Agreement (CLA)

TongFlow uses a **dual-licensing** model: [AGPL-3.0](LICENSE) for the community and a
separate [commercial license](COMMERCIAL-LICENSE.md) for organizations that cannot
comply with the AGPL.

To make this possible, **all contributions are covered by our
[Contributor License Agreement (CLA)](CLA.md)**. By submitting a pull request you agree
to the CLA: you keep full copyright of your contribution, and you grant tong-io the
right to relicense it (including under AGPL-3.0 and commercial terms). This applies to
the whole repository, including the `sdk/` directory (the `tongflow` PyPI package).
