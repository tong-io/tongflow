<div align="center">
  <img src="public/logo.svg" alt="TongFlow" width="320" />

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

- **Open plugin ecosystem**: every model and capability is an independently versioned plugin (`tongflow-modal-*` for GPU/CPU workers, `tongflow-llm-*` for LLM adapters), installed at runtime. The core stays small while the ecosystem grows — anyone can publish a plugin and have it appear in the in-app market.

## Demo Use Case

- **Text → image → video**: generate images, then turn them into video.

- **Talking-head avatar**: script + digital human visuals.

- **E-commerce visuals**: blend multiple images or retouch product shots.

- **AI music**: music from a text prompt.

- **AI shorts / comics**: stories or episodes from descriptions.

With TongFlow, you can expand your imagination and stretch your ideas with generative AI, just have a try now!

## How To Use

This is a **local-first** app: workflows and materials live in SQLite (`data/tongflow.db`) and uploads on disk (`data/uploads/`). There is no hosted TongFlow account, login, or central file CDN. AI inference goes through **external APIs you configure**: [Modal](https://modal.com) for GPU/CPU plugins (Modal offers a **$30/month FREE** quota for cloud GPU/CPU such as **H100**), plus LLM vendors (OpenRouter, Gemini, OpenAI, …) for text plugins.

### Step 1 — Prerequisites

- **Node.js 20+** and **pnpm**
- **Git** (plugins are installed by cloning their repos)
- **Python 3 + Modal CLI** (`pip install modal`) — the server spawns `modal deploy` / `modal run download` as subprocesses when GPU/CPU plugins are first invoked

### Step 2 — Get the code and start the app

#### Option A) Local development

```bash
pnpm install
pnpm dev
```

#### Option B) Docker Compose

```bash
docker compose up --build
```

> ⚠️ The current Docker image does **not** bundle Python + Modal CLI, so Modal-backed plugins cannot auto-deploy from inside the container. Use Option A if you need GPU/CPU plugins, or pre-deploy them from a host that has `modal` installed.

Either option lands on `http://localhost:3000/workspace`. Data persists in `data/` (SQLite + uploads); Docker stores it in the `tongflow_data` volume.

**Pre-built image (GHCR):** CI publishes [`ghcr.io/tong-io/tongflow`](https://github.com/tong-io/tongflow/pkgs/container/tongflow) on pushes to `main` (tags `latest` and `main`) and on version tags `v*`:

```bash
docker pull ghcr.io/tong-io/tongflow:latest
docker run --rm -p 3000:3000 --env-file .env -v tongflow_data:/app/data ghcr.io/tong-io/tongflow:latest
```

### Step 3 — Configure `.env`

Copy [`.env.example`](.env.example) to `.env` and fill in the keys you need. The UI works without any keys, but no execution node will run until at least one provider is configured.

- `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` — required for any `tongflow-modal-*` plugin
- `OPENROUTER_API_KEY` (optional `OPENROUTER_FREE_MODEL`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE`) — default **Generate text** node uses the OpenRouter free router
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` — Gemini-backed `gen_text` and other Gemini multimodal handlers
- `OPENAI_API_KEY` (optional `OPENAI_CHAT_MODEL`, defaults to `gpt-4o-mini`) — OpenAI-backed `gen_text`
- `NEXT_PUBLIC_FILE_BASE_URL` — optional; override the file base URL

For an interactive Modal login (writes tokens to `~/.modal.toml`):

```bash
pnpm modal:setup
```

### Step 4 — Install plugins

The `plugins/` directory is **gitignored and empty on first start** — the UI loads, but every transform / compose / decompose node is unusable until at least one plugin is installed. See [docs/plugins.md](docs/plugins.md).

Two ways to install:

**a) In-app market** — open `http://localhost:3000/plugins`, pick the plugins you need, and click install. The server will `git clone` each into `plugins/<plugin-id>/`.

**b) Manual clone** — for the official plugins (see [Official plugins](#official-plugins) below):

```bash
git clone https://github.com/tong-io/tongflow-modal-z-image.git plugins/tongflow-modal-z-image
git clone https://github.com/tong-io/tongflow-llm-openrouter-free.git plugins/tongflow-llm-openrouter-free
# …repeat for the plugins you want
```

The scanner picks up new plugins on next page load.

### Step 5 — Run a node

When you first execute a Modal-backed node, the server automatically runs `modal deploy plugins/<id>/deploy.py` (and `modal run plugins/<id>/download.py::download` if that plugin ships model weights). Results are cached, so subsequent runs go straight to the deployed worker. LLM plugins (`tongflow-llm-*`) don't need deploy — they call the provider API directly with your keys.

## What’s Defined

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

## Official plugins

TongFlow runs on a **plugin ecosystem**. Every model / capability is an independently versioned package — Modal GPU/CPU workers as `tongflow-modal-*`, LLM API adapters as `tongflow-llm-*`. They live under [tong-io](https://github.com/tong-io) on GitHub and on PyPI, are installed at runtime into the gitignored `plugins/` directory (via the in-app market at `/plugins` or `git clone`), and are picked up by the scanner on next start. See [docs/plugins.md](docs/plugins.md). Third parties can publish their own plugins the same way.

The plugins below are the official ones maintained alongside this repo.

### LLM (text-generation) plugins

- [tongflow-llm-openrouter-free](https://github.com/tong-io/tongflow-llm-openrouter-free) — default `gen_text` route via OpenRouter's free models
- [tongflow-llm-gemini](https://github.com/tong-io/tongflow-llm-gemini) — Google Gemini for `gen_text` and other Gemini multimodal handlers
- [tongflow-llm-openai](https://github.com/tong-io/tongflow-llm-openai) — OpenAI for `gen_text`

### Modal (GPU/CPU) plugins

- [tongflow-modal-ffmpeg](https://github.com/tong-io/tongflow-modal-ffmpeg) — transcoding, muxing, media pipelines
- [tongflow-modal-pyscenedetect](https://github.com/tong-io/tongflow-modal-pyscenedetect) — shot-boundary detection for splitting clips
- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — Z-Image text-to-image
- [tongflow-modal-ernie-image](https://github.com/tong-io/tongflow-modal-ernie-image) — ERNIE Image text-to-image (alternative)
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — FLUX.2 Klein 9B multi-reference fusion / image editing
- [tongflow-modal-ltx](https://github.com/tong-io/tongflow-modal-ltx) — LTX-2.3 text / image-to-video
- [tongflow-modal-seedvr2](https://github.com/tong-io/tongflow-modal-seedvr2) — SeedVR2 image / video super-resolution
- [tongflow-modal-color-fix-lab](https://github.com/tong-io/tongflow-modal-color-fix-lab) — image / video upscaling (alternative)
- [tongflow-modal-gemma4](https://github.com/tong-io/tongflow-modal-gemma4) — Gemma-4 multimodal text (image / video understanding)
- [tongflow-modal-qwen3asr](https://github.com/tong-io/tongflow-modal-qwen3asr) — Qwen3 speech recognition
- [tongflow-modal-qwen3tts](https://github.com/tong-io/tongflow-modal-qwen3tts) — Qwen3 text-to-speech
- [tongflow-modal-whisper](https://github.com/tong-io/tongflow-modal-whisper) — Whisper speech recognition with timestamps (alternative)
- [tongflow-modal-ace-step](https://github.com/tong-io/tongflow-modal-ace-step) — ACE-Step text-to-music
- [tongflow-modal-docling](https://github.com/tong-io/tongflow-modal-docling) — Docling document → text
- [tongflow-modal-paddle](https://github.com/tong-io/tongflow-modal-paddle) — PaddleOCR document → text
- [tongflow-modal-crawl4ai](https://github.com/tong-io/tongflow-modal-crawl4ai) — Crawl4AI URL / link → text

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

## Sponsors

TongFlow is built in the open. If your team relies on it or you want to support
ongoing development, **[sponsorship](SPONSORS.md)** funds maintenance and gets your
logo here, with recognition and priority feedback.

> Sponsorship is goodwill, not a license — it does **not** remove AGPL obligations.
> To use TongFlow in a closed-source / SaaS product, see the [License](#license)
> section below. Inquiries: **business@tongflow.com**.

## License

TongFlow is **dual-licensed**:

- **[AGPL-3.0](LICENSE)** — free for individuals, research, open-source projects,
  and anyone willing to comply with the AGPL (including its Section 13
  network/source-disclosure obligation).
- **[Commercial License](COMMERCIAL-LICENSE.md)** — for organizations that want to
  use TongFlow in closed-source or SaaS products **without** AGPL's
  source-disclosure obligation, or that need warranties and platform support.
  Contact **business@tongflow.com**.

The `sdk/` directory (the `tongflow` PyPI package) is separately licensed under
**[Apache-2.0](sdk/LICENSE)** so that third-party plugins are not subject to
copyleft. Contributions are covered by our [CLA](CLA.md).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tong-io/tongflow&type=Date)](https://star-history.com/#tong-io/tongflow&Date)
