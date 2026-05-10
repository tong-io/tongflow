<div align="center">
  <img src="docs/assets/logo.png" alt="TongFlow" width="320" />

  <h1>A Multi-Modal AIGC Studio</h1>
  <p>
    <a href="https://github.com/tong-io/tongflow/stargazers"><img src="https://img.shields.io/github/stars/tong-io/tongflow?style=flat&logo=github" alt="GitHub stars" /></a>
    <a href="https://github.com/tong-io/tongflow/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License" /></a>
    <a href="https://github.com/tong-io/tongflow/actions/workflows/ci.yml"><img src="https://github.com/tong-io/tongflow/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://discord.gg/K7V8az94Zf"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
    <a href="https://github.com/tong-io/tongflow/releases"><img src="https://img.shields.io/github/v/release/tong-io/tongflow?logo=github" alt="Latest Release" /></a>
  </p>
</div>

**TongFlow** is an all-in-one AIGC studio for building AIGC workflows end to end with ease.

<div align="center">
  <img src="docs/assets/cover.png" alt="TongFlow" />
</div>

## Core ideas

- **All models**: AI models can be thought of as a **modality transform** (e.g. LLMs are text→text, image models are text→image, music models are text→audio, and so on). TongFlow wraps each capability as a node.

- **All modalities**: support all the modalities and formats people actually ship over the web.

- **Simple to use**: no complex parameter panels and no manual node connecting; just **add**, **transform**, and **combine**. Arrange ideas freely.

## Demo Use Case

- **Text → image → video**: generate images, then turn them into video.

- **Talking-head avatar**: script + digital human visuals.

- **E-commerce visuals**: blend multiple images or retouch product shots.

- **AI music**: music from a text prompt.

- **AI shorts / comics**: stories or episodes from descriptions.

With TongFlow, you can expand your imagination and stretch your ideas with generative AI, just have a try now!

## How To Use

## Run locally (quickstart)

This is a **local-first** app: workflows and materials live in SQLite (`data/openflow.db`) and uploads on disk (`data/uploads/`). There is no hosted TongFlow account, login, or central file CDN.

AI inference uses **external APIs you configure**: [Modal](https://modal.com) for most transform plugins (Modal offers a **$30/month FREE** quota for cloud GPU/CPU such as **H100**), plus LLM vendors (OpenRouter, Gemini, OpenAI, etc.) where nodes need them. Set tokens in `.env` and run `pnpm modal:setup` when using Modal (see **Environment variables** below).

### Two ways to run

#### 1) Docker Compose (good for self-hosting)

`compose.yaml` lives at the repo root:

```bash
docker compose up --build
```

Open `http://localhost:3000` (lands on `/workspace`).

> Data persists in Docker volumes (SQLite at `data/openflow.db` plus uploads).

**Pre-built image (GHCR):** CI publishes [`ghcr.io/tong-io/tongflow`](https://github.com/tong-io/tongflow/pkgs/container/tongflow) on pushes to `main` (tags `latest` and `main`) and on version tags `v*` (e.g. `v0.1.0` → `0.1.0`). Pull and run:

```bash
docker pull ghcr.io/tong-io/tongflow:latest
docker run --rm -p 3000:3000 --env-file .env -v openflow_data:/app/data ghcr.io/tong-io/tongflow:latest
```

For private repositories you may need `docker login ghcr.io` with a token that has the `read:packages` scope.

#### 2) Local development (`pnpm dev`)

Requires Node.js (20+ recommended) and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` (lands on `/workspace`).

### Environment variables (Modal & providers)

The app calls **Modal** (worker execution) and optional **LLM/API** services. Copy [`.env.example`](.env.example) to `.env` and fill in keys. No TongFlow-hosted services are required for core editing, saving, or import/export.

Common variables:

- `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`: Modal workers
- `OPENROUTER_API_KEY` (optional `OPENROUTER_FREE_MODEL`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE`): default **Generate text** node (`gen_text`) uses the OpenRouter free router
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`: **Generate text** when the model slot is Gemini, and other Gemini text/multimodal handlers
- `OPENAI_API_KEY` (optional `OPENAI_CHAT_MODEL`): **Generate text** when the model slot is OpenAI; default chat model is `gpt-4o-mini` if unset
- `DEEPSEEK_API_KEY`: only needed for features that still call the DeepSeek API directly (for example batch arrange / grouping text), not for the main text-generation dropdown
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
- ✅ **Subtitle removal**: clean subtitles from a video.
- ✅ **Watermark removal**: remove watermarks from a video.

#### Audio

- ✅ **Music generation**: music from text.
- ✅ **Speech synthesis**: text-to-speech — preset style, voice clone (reference audio), or instruction-driven.
- ✅ **Speech recognition**: transcribe speech from audio or video.
- ✅ **Noise reduction**: denoise audio.
- ✅ **Speaker diarization**: separate audio by speaker.
- ✅ **Voice / timbre replacement**: replace or clone a voice with a reference sample.
- ⬜ **Multi-track / vocal-accompaniment separation**

### Combine

- ✅ **Image fusion**: blend or edit multiple references into one image.
- ✅ **Lip sync**: audio + video → video (lip-sync); also audio + image → video, audio + text → video, and audio + image + video → video variants.
- ✅ **Clone voice**: text + reference audio → speech with a cloned voice.
- ✅ **Character swap**: video + reference (scene blend / character replacement), Animate Mix-style generation.
- ✅ **Motion transfer**: video + reference (motion / retarget), Animate Move-style generation.
- ✅ **Combine text**: merge multiple text nodes into one.

### Other

- ✅ **Image → 3D**: single-view 3D model from an image.
- ✅ **Document → text**: extract plain text from documents.
- ✅ **Link → text**: turn page content into text.

### Helpers

- ✅ **Concatenate clips**: join multiple videos end to end.
- ✅ **Mux audio + video**: merge into one file.
- ✅ **Split by shots**: cut a long video into segments by scene.
- ✅ **Split video & audio**: demux a video into separate video and audio tracks.
- ✅ **Extract audio track**: pull audio into its own asset.
- ✅ **Split long text**: break a long passage into chunks.
- ✅ **Merge / tidy text blocks**: combine segments (use the auto-merge option).
- ✅ **Filter or drop clips**: drop unwanted clips by rule or selection.
- ✅ **Arrange & batch groups**: group and arrange text/clip batches for downstream processing.

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
- **OpenRouter (LLM routing)**: default free route/model for `gen_text` (`OPENROUTER_API_KEY`; optional `OPENROUTER_FREE_MODEL` in `.env`)
- **Google Gemini (API)**: `gen_text_gemini` and related handlers (set `GEMINI_API_KEY` or `GOOGLE_API_KEY`); the node UI can pick the Gemini model id
- **OpenAI (API)**: `gen_text_openai` (`OPENAI_API_KEY`; optional default `OPENAI_CHAT_MODEL`; the node UI can pick the OpenAI model)
- **DeepSeek (API)**: only for code paths that call DeepSeek directly (for example batch text grouping), not the main **Generate text** model list

## Contact

**For Community:** Join the community on **[Discord](https://discord.gg/K7V8az94Zf)** or scan the **WeChat group** QR code below.

<div>
  <img src="docs/assets/qr.png" alt="WeChat group QR code" width="180" />
</div>


**For Business:** Please contact business@tongflow.com. I’ll get back to you.

- **Open-source model publishers**: I can integrate your models so users can try them out smoothly.
- **Enterprise**: I can help you deploy on your local GPU, build custom nodes, and more.
- **API provider / router**: I can integrate your APIs.
- **Investor**: I’m interested in partnering on tongflow.com, a cloud-hosted AI studio.

## Open-Source

If you like this project, a Star on GitHub helps a lot. Thank you.

<div align="center">
  <img src="docs/assets/star.gif" alt="Star on GitHub" />
</div>

This project is licensed under **AGPL-3.0**.

## Extending AI capabilities

Feature metadata (model slots, handler routing keys, processing time hints) lives in [`config/features.default.json`](config/features.default.json). See [docs/feature-registry.md](docs/feature-registry.md) for overrides, validation (`pnpm validate-features`), and how this relates to task handlers and node allowlists.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tong-io/tongflow&type=Date)](https://star-history.com/#tong-io/tongflow&Date)
