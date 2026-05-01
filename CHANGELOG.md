# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions workflow to build and push the web image to GitHub Container Registry (`ghcr.io/tong-io/tongflow`).

### Removed
- Electron desktop app, electron-builder packaging, and related CI workflows; use Docker or `pnpm dev` for the web app.

### Changed
- Nothing yet.

### Fixed
- Nothing yet.

## [0.1.0] - TBD

### Added
- Initial public release of TongFlow: multi-modal AIGC studio (Next.js + ReactFlow workspace).
- Web app, Docker Compose path, and Electron desktop builds.
- Modal-based plugin workers, feature registry, and multilingual UI (EN / ZH / JA).

[Unreleased]: https://github.com/tong-io/tongflow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tong-io/tongflow/releases/tag/v0.1.0
