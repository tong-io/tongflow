# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-15

First public open-source release of TongFlow — a multi-modal GenAI workflow studio.

### Added
- Multi-modal canvas: compose text, image, video, audio, document, and 3D nodes with three operations — add, transform, combine.
- Open plugin ecosystem: every runnable node is backed by the ABI contract ([`config/tongflow.abi.json`](config/tongflow.abi.json)); plugins supply the implementation via the `tongflow` Python SDK.
- Desktop app (macOS arm64/x64, Windows), run-from-source, and a self-host Docker image.
- Python SDK published to PyPI as `tongflow`, with `run_workflow` to execute exported workflows as an embedded engine.

### Notes
- Unified all artifact versions — the desktop app and the PyPI `tongflow` SDK — to a single `0.1.0` baseline.

[Unreleased]: https://github.com/tong-io/tongflow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tong-io/tongflow/releases/tag/v0.1.0
