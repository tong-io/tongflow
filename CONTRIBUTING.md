# Contributing to TongFlow

Thank you for your interest in contributing to TongFlow! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be respectful and constructive; we welcome contributors from all backgrounds.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Python 3.10+ (for Modal plugins)
- Modal account (free tier available at [modal.com](https://modal.com))

### Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/tong-io/tongflow.git
   cd tongflow
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Set up Modal (for GPU inference)**

   ```bash
   pnpm modal:setup
   ```

5. **Start the development server**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to see the app.

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in [GitHub Issues](https://github.com/tong-io/tongflow/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Environment info (OS, browser, Node version)

### Suggesting Features

1. Open a [GitHub Issue](https://github.com/tong-io/tongflow/issues) with the "feature request" label
2. Describe the feature and its use case
3. Explain why it would be valuable

### Submitting Pull Requests

1. **Fork the repository** and create your branch from `main`

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines below

3. **Test your changes**

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm build
   ```

4. **Commit your changes** with a clear message

   ```bash
   git commit -m "feat: add support for XYZ"
   ```

5. **Push to your fork** and open a Pull Request

## Code Style Guidelines

### TypeScript/React

- Use TypeScript for all new code
- Follow existing code patterns
- Use functional components with hooks
- Keep components focused and small

### Formatting

We use [Biome](https://biomejs.dev/) for formatting. Run before committing:

```bash
pnpm lint
```

### File Naming

- Use **kebab-case** for file names: `my-component.tsx`
- Use **PascalCase** for component names: `MyComponent`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `style:` formatting changes
- `refactor:` code refactoring
- `test:` adding tests
- `chore:` maintenance tasks

## Project Structure

```
tongflow/
├── src/
│   ├── app/              # Next.js pages and API routes
│   ├── components/       # React components
│   │   └── workspace/    # Main workspace components
│   │       └── nodes/    # Node implementations
│   │           ├── add/      # Source nodes (text, image, audio, video, …)
│   │           ├── transfer/ # Single-input transform nodes
│   │           ├── compose/  # Multi-input combine nodes
│   │           ├── decompose/# Split nodes (text, video)
│   │           ├── batch/    # Batch helper nodes
│   │           ├── modal/    # Passthrough display nodes
│   │           └── base/     # Shared base components
│   ├── hooks/            # Custom hooks and stores
│   ├── lib/              # Core libraries and plugin executor
│   ├── messages/         # i18n strings (en, zh, ja)
│   ├── generated/        # Auto-generated code (ABI types via pnpm gen:abi)
│   └── services/         # Server-side service layer
├── config/               # Feature registry JSON and ABI definition
├── scripts/              # Build, codegen, and publish scripts
└── docs/                 # Documentation
```

## Adding a New Node

1. Create a new file in `src/components/workspace/nodes/<category>/`
2. Use `BaseNode` as the foundation
3. Define `workflowConfig` with feature, prompts, and handlers
4. Register the node in `src/components/workspace/types.tsx`
5. Add translations in `src/messages/{en,zh,ja}.json`

## Adding a New Plugin

See [docs/feature-registry.md](docs/feature-registry.md) for plugin development guide.

## Questions?

- Join our [Discord](https://discord.gg/K7V8az94Zf)
- Open a [GitHub Discussion](https://github.com/tong-io/tongflow/discussions)

## License & Contributor License Agreement (CLA)

TongFlow is distributed under a **dual-licensing** model: [AGPL-3.0](LICENSE) for
the community and a separate [commercial license](COMMERCIAL-LICENSE.md) for
organizations that cannot comply with the AGPL.

To make this possible, **all contributions are covered by our
[Contributor License Agreement (CLA)](CLA.md)**. By submitting a pull request you
agree to the CLA: you keep full copyright of your contribution, and you grant
tong-io the right to relicense it (including under the AGPL-3.0 and under
commercial terms). Please read [CLA.md](CLA.md) before contributing.

> Note: the `sdk/` directory (the `tongflow` PyPI package) is licensed under
> **Apache-2.0**, not AGPL-3.0. The CLA still applies to contributions there.
