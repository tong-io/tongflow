# Contributing

Thanks for your interest in contributing to OpenFlow.

## Development

### Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

### Quality checks

```bash
pnpm lint
pnpm typecheck
```

## Pull requests

- Keep PRs focused and small when possible
- Include a short test plan in the PR description
- Do not commit secrets (`.env`, API keys, tokens). Use `.env.example` for documenting variables.

