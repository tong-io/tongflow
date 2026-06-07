# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Upgrade Next.js 15.4.7 → 15.5.19 to patch CVE-2025-66478.

## [0.0.1] - 2026-06-07

### Added
- Audio nodes: noise reduction (`denoise_audio`), speaker diarization (`separate_speaker`), voice/timbre replacement (`convert_voice`).
- Video nodes: subtitle removal (`subtitle_remove`), watermark removal (`remove_watermark`).
- Image-to-3D node (`image-gen-model`).
- Additional lip-sync compose variants: audio+image→video, audio+text→video, audio+image+video→video.
- Clone-voice synthesis compose node (text + reference audio → speech).
- Combine text node: merge multiple text nodes into one.
- Batch helper nodes: filter/drop clips (`drop-video`) and arrange & batch groups (`arrange-group`).
- Split video & audio helper node: demux video into separate video and audio tracks.
- TTS expanded to three variants: preset style, voice clone (reference audio), instruction-driven.
- TongFlow ABI JSON with codegen script (`pnpm gen:abi`) producing TypeScript types under `src/generated/abi/`.
- Chinese README (`README_ZH.md`).
- Plugin manager: detects available updates by comparing each installed plugin's local git HEAD against its remote, showing an "Update" / "Up to date" state with a manual "Check for updates" refresh.
- SDK `@deploy` marker for deploy-first (Modal) plugins; the scanner detects it by AST instead of recognizing Modal's `@app.cls`.

### Changed
- The `tongflow` SDK is now **backend-neutral**: it no longer depends on `modal` or recognizes Modal-specific syntax. Modal plugins build their app with `modal.App(Path(__file__).resolve().parent.name)`, mark their handler class `@deploy`, ship a thin `entry.py` bridge (which lazily imports `modal`), and declare `modal` in `requirements.txt`.

### Removed
- SDK `current_app` helper and the bundled `modal_entry` bridge (devolved into each plugin's `entry.py`); the `modal` dependency from the SDK.

### Fixed
- Nothing yet.

## [0.1.0] - TBD

### Added
- Initial public release of TongFlow: multi-modal AIGC studio (Next.js + ReactFlow workspace).
- Web app and local self-host path.
- Modal-based plugin workers, feature registry, and multilingual UI (EN / ZH / JA).

[Unreleased]: https://github.com/tong-io/tongflow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tong-io/tongflow/releases/tag/v0.1.0
