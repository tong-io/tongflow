# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.6] - 2026-06-26

### Added

- Image generation nodes gain a **resolution tier** picker (1K / 2K / 4K)
  alongside the aspect-ratio picker. The chosen width/height is the aspect
  ratio's base (1K) dimensions scaled by the tier, persisted directly to the
  existing `width`/`height` ABI fields (no new contract field).

### Fixed

- Desktop release pipeline no longer fails to publish under GitHub's immutable
  releases. Per-arch installers are uploaded to a draft release and the draft
  is published once after all assets are attached, instead of publishing
  immediately and 422-ing on subsequent asset uploads. (Supersedes 0.1.5,
  which never shipped a usable release.)

## [0.1.4] - 2026-06-25

### Fixed

- Plugins no longer crash on a non-UTF-8 system locale (notably Windows
  Simplified-Chinese, whose ANSI code page is GBK / cp936). A spawned Python's
  stdout/stderr defaulted to the system locale, so a plugin printing a
  non-ASCII character — such as the `✓` emitted while downloading model
  weights — raised `UnicodeEncodeError: 'gbk' codec can't encode character`
  and surfaced as "downloading weights failed (exit 1)". Every Python spawn
  site now forces UTF-8 mode (`PYTHONUTF8=1`).

## [0.1.3] - 2026-06-22

### Added

- Official plugin **Unlimited-OCR** (`tongflow-modal-unlimited-ocr`) — Baidu's
  Unlimited-OCR for long-horizon document / PDF → text on the `parse-document`
  slot, a GPU alternative to Docling and PaddleOCR.

## [0.1.2] - 2026-06-20

### Added

- Official plugins **TripoSplat** (single image → 3D Gaussian Splatting) and
  **SCAIL-2** (controlled character animation) are now in the plugin registry.
- The 3D model node renders Gaussian-splat assets (`.splat`, `.ply`, `.spz`,
  `.ksplat`, `.sog`) in-app via SparkJS, with a free-tumble trackball camera and
  on-demand rendering for smooth performance on large splats.

### Fixed

- Plugin `model` (3D) outputs are now persisted to file references and rendered
  on the canvas; previously such outputs were dropped and the node showed
  nothing.

## [0.1.1] - 2026-06-16

### Fixed

- Installed plugins now appear in node pickers without reloading the app, and
  the plugin manager recovers from a directory left behind by an interrupted or
  failed clone instead of treating it as already installed.
- Packaged desktop app: rebuild `better-sqlite3`'s native binary for the bundled
  Node runtime during packaging, fixing `ERR_DLOPEN_FAILED` errors (e.g. "Failed
  to save workflow") when the build machine's Node differs from the bundled one.
- Exclude `.env` files from the packaged app bundle; the desktop app reads all
  configuration from the in-app settings store.

### Changed

- Bundled Node runtime and CI upgraded to Node 24.

## [0.1.0] - 2026-06-16

First public open-source release of TongFlow.

[Unreleased]: https://github.com/tong-io/tongflow/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/tong-io/tongflow/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/tong-io/tongflow/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tong-io/tongflow/releases/tag/v0.1.0
