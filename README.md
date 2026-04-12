<div align="center">
  <img src="docs/assets/logo.png" alt="TongFlow" width="320" />

  <h1>TongFlow: A Multimodal Generative AI Studio</h1>

  <!-- CI / Discord / Releases are placeholders; replace links when wired up -->
  <p>
    <a href="https://github.com/tong-io/openflow/stargazers"><img src="https://img.shields.io/github/stars/tong-io/openflow?style=flat&logo=github" alt="GitHub stars" /></a>
    <a href="https://github.com/tong-io/openflow/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License" /></a>
    <a href="#"><img src="https://img.shields.io/badge/CI-TBD-lightgrey" alt="CI TBD" /></a>
    <a href="#"><img src="https://img.shields.io/badge/Discord-TBD-lightgrey?logo=discord&logoColor=white" alt="Discord TBD" /></a>
    <a href="#"><img src="https://img.shields.io/badge/Releases-TBD-lightgrey?logo=github" alt="Releases TBD" /></a>
  </p>
</div>

TongFlow is a **local-first** AI creative studio: on an infinite canvas, **add**, **transform**, and **combine** to build AIGC workflows end to end.

We integrate [Modal](https://modal.com) by default; you get **$30/month FREE** for **GPU/CPU inference and computing** on hardware such as **H100**, **A100**, and **L40S**, so you can experiment with AI creation and content generation at no cost.

## If you like this project, a star on GitHub helps a lot. Thank you.

## Core ideas

- **Any generative model fits the same abstraction**: every model can be thought of as a **modality transform** (e.g. LLMs are text→text, image models are text→image, music models are text→audio, and so on). TongFlow wraps each capability as a node.

- **All modalities**: we support the modalities and formats people actually ship over the web.

- **Simple mechanics**: no cryptic parameter panels and no manual node wiring; just **add**, **transform**, and **combine**. Arrange ideas freely.

## Demo ideas (this is only a slice; stretch it with generative AI)

- **Text → image → video**: generate images, then turn them into video.

- **Talking-head avatar**: script + digital human visuals.

- **E-commerce visuals**: blend multiple images or retouch product shots.

- **AI music**: music from a text prompt.

- **AI shorts / comics**: stories or episodes from descriptions.

## How To Use

- Tutorial (Bilibili): [link placeholder](https://www.bilibili.com/video/BV1xxxxxxxxxx). Replace with the real video URL when published.

## Run locally (quickstart)

### Three ways to run

#### 1) Download a desktop release (easiest for end users)

- Get the installer for your OS from GitHub **Releases** (macOS / Windows).
- On first launch, configure Modal / OpenRouter / Gemini API keys or tokens in the app or environment (see **Environment variables** below).

#### 2) Docker Compose (good for self-hosting)

`compose.yaml` lives at the repo root:

```bash
docker compose up --build
```

Open `http://localhost:3000` (lands on `/workspace`).

> Data persists in Docker volumes (SQLite at `data/openflow.db` plus uploads).

#### 3) Local development (`pnpm dev`)

Requires Node.js (20+ recommended) and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` (lands on `/workspace`).

### Environment variables (Modal & providers)

The app calls external services (Modal, OpenRouter, Gemini, DeepSeek, OpenAI, etc.). Configure them in `.env`.

Common variables (see `.env` for the source of truth):

- `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`: Modal workers
- `OPENROUTER_API_KEY` / `OPENROUTER_FREE_MODEL`: OpenRouter LLM
- `GEMINI_API_KEY` / `GOOGLE_API_KEY`: Gemini
- `DEEPSEEK_API_KEY`: DeepSeek
- `OPENAI_API_KEY` / `OPENAI_CHAT_MODEL`: OpenAI
- `NEXT_PUBLIC_TASK_API_URL`: optional; point task wait/stop at an external task service
- `NEXT_PUBLIC_FILE_BASE_URL`: optional; base URL for file storage

To authorize Modal (writes tokens to `~/.modal.toml`):

```bash
pnpm modal:setup
```

## What’s implemented

### Add

- ✅ **Text input**: type text and add a text node.
- ✅ **Add image**: pick a local file and add an image node.
- ✅ **Add photo**: capture with the device camera and add an image node.
- ✅ **Add sketch**: draw on the canvas and add an image node.
- ✅ **Add audio**: pick a local audio file and add an audio node.
- ✅ **Record audio**: record with the mic and add an audio node.
- ✅ **Add video**: pick a local video file and add a video node.
- ✅ **Record video**: record with the camera and add a video node.
- ✅ **Add document**: pick a local file and add a document node.
- ✅ **Add URL**: fetch a page from a link and add text, image, audio, or video nodes.
- ✅ **Add 3D model**: choose a local model file and add a 3D model node.

### Transform

#### Text

- ✅ **Generate / rewrite**: create or edit copy from a prompt.

#### Image

- ✅ **Image generation**: images from text.
- ✅ **Image editing**: inpaint, edit, or redraw with instructions.
- ✅ **Image understanding**: captions, Q&A, or descriptions from an image.
- ✅ **Image upscaling**: enlarge for sharper detail.

#### Video

- ✅ **Video generation**: video from text.
- ✅ **Image-to-video**: animate a still into motion.
- ✅ **First/last-frame video**: two key images to interpolate a clip.
- ✅ **Video understanding**: summaries or descriptions from video.
- ✅ **Video upscaling**: higher-resolution output.
- ✅ **Extract first / last frame**: grab a frame as an image.
- ⬜ **Subtitle removal**
- ⬜ **Watermark removal**

#### Audio

- ✅ **Music generation**: music from text.
- ✅ **Speech synthesis**: text-to-speech, with optional reference voice.
- ✅ **Speech recognition**: transcribe speech from audio or video.
- ⬜ **Noise reduction**
- ⬜ **Multi-track / vocal-accompaniment separation**
- ⬜ **Speaker diarization**
- ⬜ **Voice / timbre replacement** (reference-driven)

### Combine

- ✅ **Image fusion**: blend or edit multiple references into one image.
- ✅ **Lip sync**: audio + video → video (lip-sync and related variants).
- ✅ **Character swap**: video + reference (scene blend / character replacement), Animate Mix-style generation.
- ✅ **Motion transfer**: video + reference (motion / retarget), Animate Move-style generation.

### Other

- ⬜ **Image → 3D** (single-view 3D)
- ✅ **Document → text**: extract plain text from documents.
- ✅ **Link → text**: turn page content into text.

### Helpers

- ✅ **Concatenate clips**: join multiple videos end to end.
- ✅ **Mux audio + video**: merge into one file.
- ✅ **Split by shots**: cut a long video into segments by scene.
- ✅ **Extract audio track**: pull audio into its own asset.
- ✅ **Split long text**: break a long passage into chunks.
- ✅ **Merge / tidy text blocks**: combine segments (use the auto-merge option).
- ⬜ **Filter or drop clips** (by natural language or rules)
- ⬜ **Arrange & batch groups** of clips (grouped batch output)

## Backend & model providers

- **FFmpeg**: transcoding, muxing, and media pipelines
- **Scene detection**: shot boundaries for splitting clips
- **Z-Image**: text-to-image
- **FLUX.2 Klein 9B**: multi-reference fusion and image editing
- **LTX-2**: text/image-to-video
- **SeedVR2**: image and video super-resolution
- **Gemma 4**: multimodal text (image/video understanding)
- **Qwen3**: speech recognition and text-to-speech
- **ACE-Step**: text-to-music
- **OpenRouter (LLM routing)**: default free route/model for `gen_text` (override via `.env`)
- **Google Gemini (API)**: some text / multimodal API calls (requires `GEMINI_API_KEY` or `GOOGLE_API_KEY`)
- **DeepSeek (API)**: some text orchestration / reasoning (requires `DEEPSEEK_API_KEY`)
- **OpenAI (API)**: `openai-text` handler (default `OPENAI_CHAT_MODEL=gpt-4o-mini`)

## Open-source roadmap

We plan to open-source the full community edition once the project reaches a meaningful level of community interest (stars).

## Contact

Join the community on **Discord** or **WeChat**.

**Business:** business@tongflow.com. We’ll get back to you quickly.

- **Enterprise**: we can help deploy a private instance.
- **Investors**: we’re happy to discuss a cloud offering.
- **Model API providers / aggregators**: we can integrate your APIs.
- **Open-model publishers**: we can prioritize integration so users can try your models sooner.

## License

This project is licensed under **GNU Affero General Public License v3.0 (AGPL-3.0-only)**.

- If you modify it and run it as a network service, you must offer users the corresponding source of your modified version (see AGPL section 13).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tong-io/openflow&type=Date)](https://star-history.com/#tong-io/openflow&Date)
