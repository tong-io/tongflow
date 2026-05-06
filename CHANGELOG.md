# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions workflow to build and push the web image to GitHub Container Registry (`ghcr.io/tong-io/tongflow`).
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
