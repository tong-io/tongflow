<div align="center">
  <img src="public/logo.svg" alt="TongFlow" width="320" />

  <h1>TongFlow: The Open-Source Modality-First GenAI Platform</h1>
  <p>
    <a href="https://github.com/tong-io/tongflow/stargazers"><img src="https://img.shields.io/github/stars/tong-io/tongflow?style=flat&logo=github" alt="GitHub stars" /></a>
    <a href="https://github.com/tong-io/tongflow/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License" /></a>
    <a href="https://github.com/tong-io/tongflow/actions/workflows/ci.yml"><img src="https://github.com/tong-io/tongflow/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://pypi.org/project/tongflow/"><img src="https://img.shields.io/pypi/v/tongflow?logo=pypi&logoColor=white&label=Python%20SDK" alt="PyPI" /></a>
    <a href="https://discord.gg/K7V8az94Zf"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
    <a href="https://github.com/tong-io/tongflow/releases"><img src="https://img.shields.io/github/v/release/tong-io/tongflow?logo=github" alt="Latest Release" /></a>
  </p>
  <p>
    <video src="https://github.com/user-attachments/assets/407a7e7b-2d44-4c90-8016-33d0a9f5e7d5"></video>
  <p>
  <p>
    <strong>English</strong> · <a href="docs/README_ZH.md">简体中文</a> · <a href="docs/README_JA.md">日本語</a>
  </p>
</div>

**Different modalities. One workflow.**

Text, images, audio, video and 3D are your materials. Decide how they transform and combine, then choose the model behind each step. Every result is material you can use again.

Open-source core · Your models · Self-hostable · [tongflow.com](https://www.tongflow.com) · [Open the canvas](https://app.tongflow.com)

## Demo Examples

| Workflow | Result |
| :--: | :--: |
| **Basic** — Type text (Add), generate images (Transform), then blend them into one (Combine).<br/><img src="https://file.tongflow.com/public/demos/basic.png" width="620" alt="workflow" /> | <img src="https://file.tongflow.com/public/demos/basic_result.png" width="200" alt="result" /> |
| **Intermediate** — (Add topic → write script → generate speech) + (character description → generate image) → lip-synced video = talking-head avatar.<br/><img src="https://file.tongflow.com/public/demos/digitalhuman.png" width="620" alt="workflow" /> | <video src="https://github.com/user-attachments/assets/a803394d-0ccf-4023-9b06-5c1581345758" width="200"></video> |
| **Advanced** — Generate lyrics + song + characters + scenes + storyboard → produce a music video.<br/><img src="https://file.tongflow.com/public/demos/mv.png" width="620" alt="workflow" /> | <video src="https://github.com/user-attachments/assets/2bc71e3c-3ed6-48b2-81e7-82ad5976d801" width="200"></video> |

Every output stays on the canvas as a material: branch from a generated image, feed a transcript into the next step, or swap the model behind one node and keep the rest of the workflow.

## How To Start

There are three ways to use TongFlow, all sharing the same open-source core: **TongFlow Cloud** (the desktop app or [app.tongflow.com](https://app.tongflow.com) in a browser), **self-host** ([from source](#run-from-source) or [with Docker](#run-with-docker)), or **build with an agent** (the [`tongflow` npm package](packages/tongflow/README.md) or the [dsh plugin](#use-it-inside-an-agent-dsh-plugin)).

The TongFlow **desktop app** is a lightweight (~10 MB) shell around the cloud studio at **[app.tongflow.com](https://app.tongflow.com)** — install it, sign in, and start creating. The cloud studio also runs in any modern browser.

### Step 1 — Install the desktop app

Download the installer for your platform, install it, and open it.

- **macOS (Universal — Apple Silicon & Intel):** [TongFlow-mac-universal.dmg](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-mac-universal.dmg)
- **Windows:** [TongFlow-win-x64.msi](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-win-x64.msi)

All builds are on the [Releases](https://github.com/tong-io/tongflow/releases/latest) page.

> **macOS:** the builds are not yet notarized with Apple, so Gatekeeper will block the first launch ("TongFlow is damaged and can't be opened"). After moving the app to Applications, clear the quarantine flag once and it opens normally:
>
> ```bash
> xattr -cr /Applications/TongFlow.app
> ```
>
> Download from this page directly — installers passed through chat apps (e.g. WeChat) may be renamed or re-flagged.

### Step 2 — Sign in and create

Sign in with Google or WeChat and start creating — the cloud studio manages plugins and execution for you.

> **Prefer a fully local, account-free TongFlow?** That's what self-hosting is for — see [Run from source](#run-from-source) or [Run with Docker](#run-with-docker), then follow [Self-host setup](#self-host-setup-plugins--credentials). (The desktop app up to v0.1.13 bundled this local runtime; those installers remain on the [Releases](https://github.com/tong-io/tongflow/releases) page.)

## Modality-First

A modality is a form of information: text, image, audio, video, 3D, document, URL. TongFlow makes these the building blocks of a workflow. Decide what you want to do with them, then choose the model for the job. Every step is three separate decisions:

| | Question | Examples |
| :-- | :-- | :-- |
| **Material** | What do you have? | A document, a photo, a recording, an idea. |
| **Capability** | What could it become? | Understand, generate, transform, combine or split. |
| **Implementation** | What should run it? | A compatible plugin and the model it provides. |

- **Every result is a new beginning.** Materials have their own nodes. An uploaded image and a generated image can both feed the next compatible operation. Branch out from a result instead of starting over.
- **Choose a capability, then a model.** A workflow records what a step does separately from the plugin that runs it. Switch compatible implementations while keeping the surrounding structure.
- **Four operations.** Add, transform, combine, split & batch. Understanding, generating and processing fit into the same system; generation is one kind of operation.
- **A shared structure for people and agents.** The canvas, exporter and agent tools use the same node registry. Build visually or through the `tongflow` package; the DSH integration lets an agent create workflows you can open, edit and run again.
- **Open ecosystem.** The ABI defines each capability's input/output contract independent of who implements it. Any platform can publish plugins the same way, and the official plugins below cover nearly every node in the matrix.

Read more: [Why TongFlow starts with modalities](https://www.tongflow.com/en/blog/tongflow-why-modality-first).

## Capabilities

Every node below is a capability from the ABI, grouped by the four operations. Materials (text, image, audio, video, 3D, document, URL) are the nodes that connect them.

> ✅ = available out of the box with an official plugin · ⬜ = node exists in the canvas but has no official plugin yet (planned).

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
- ✅ **Pose detection**: 308-keypoint whole-body skeleton overlay (body, hands, face).
- ✅ **Body-part segmentation**: 29-class human parsing overlay.
- ✅ **Surface normals**: per-pixel normal map — human-centric or full scene.
- ✅ **Matting**: cut the human or salient foreground out as a transparent PNG.

#### Video

- ✅ **Video generation**: video from text.
- ✅ **Image-to-video**: animate a still into motion.
- ✅ **First/last-frame video**: two key images to interpolate a clip.
- ✅ **Images → video**: multi-image reference fusion — several reference images plus text into a new video.
- ✅ **Omni-reference video**: mix image, video, and audio references (plus text) into one video with native stereo audio.
- ✅ **Video understanding**: summaries or descriptions from video.
- ✅ **Video upscaling**: higher-resolution output.
- ✅ **Extract first / last frame**: grab a frame as an image.
- ✅ **Video editing**: edit a video from a text instruction.
- ✅ **Subtitle removal**: clean subtitles from a video.
- ✅ **Watermark removal**: remove watermarks from a video.

#### Audio

- ✅ **Music generation**: music from text, with optional reference-audio conditioning.
- ✅ **Audio understanding**: describe a clip (music, speech, or ambient sound) in text.
- ✅ **Music repaint**: regenerate a chosen time range of a song.
- ✅ **Music cover**: restyle a song via a caption and/or a reference track.
- ✅ **Add track / complete arrangement**: generate one new stem over a mix, or fill in missing tracks.
- ✅ **Music brief**: one-sentence idea → lyrics, style tags, BPM, key, and duration.
- ✅ **Speech synthesis**: text-to-speech — preset style, voice clone (reference audio), or instruction-driven.
- ✅ **Speech recognition**: transcribe speech from audio or video.
- ✅ **Noise reduction**: denoise audio.
- ✅ **Speaker diarization**: separate audio by speaker.
- ⬜ **Voice / timbre replacement**: replace or clone a voice with a reference sample.
- ✅ **Multi-track / vocal-accompaniment separation**: isolate vocals, drums, bass, guitar, and 8 more stems.
- ✅ **Open-vocabulary sound separation**: describe any sound in words ("dog barking") and split the audio into that sound and everything else.

#### 3D, documents & links

- ✅ **Image → 3D**: single-view 3D model from an image.
- ✅ **Video → motion capture**: monocular video to skeletal animation (body + fingers + face channels, GLB).
- ✅ **Document → text**: extract plain text from documents.
- ✅ **Link → text**: turn page content into text.

### Combine

- ✅ **Image fusion**: blend or edit multiple references into one image.
- ✅ **Lip sync**: audio + video → video (lip-sync); also audio + image → video and audio + text → video variants.
- ✅ **Emotive speech**: text + voice reference → speech in that voice, with emotion control.
- ✅ **Character swap**: video + reference (scene blend / character replacement), Animate Mix-style generation.
- ✅ **Motion transfer**: video + reference (motion / retarget), Animate Move-style generation.
- ✅ **Combine text**: merge multiple text nodes into one.
- ✅ **Concatenate clips**: join multiple videos end to end.
- ✅ **Mux audio + video**: merge into one file.

### Split & batch

- ✅ **Split by shots**: cut a long video into segments by scene.
- ✅ **Split video & audio**: demux a video into separate video and audio tracks.
- ✅ **Extract audio track**: pull audio into its own asset.
- ✅ **Split long text**: break a long passage into chunks.
- ✅ **Merge / tidy text blocks**: combine segments (use the auto-merge option).
- ✅ **Filter or drop clips**: drop unwanted clips by rule or selection.
- ✅ **Arrange & batch groups**: group and arrange text/clip batches for downstream processing.

## Official plugins

> The official GPU/CPU plugins currently run on [Modal](https://modal.com) — up to **$30/month** of free GPU compute (H100/A100, etc.). See [Self-host setup](#self-host-setup-plugins--credentials) for the `MODAL_TOKEN_*` setup. Any other platform can publish its own plugins the same way.

### API plugins

First-party providers (a lab's own models):

- [tongflow-api-gemini](https://github.com/tong-io/tongflow-api-gemini) — Google Gemini with a per-node **model picker**: text, vision, image (Nano Banana / Imagen 4), Veo video, TTS and transcription
- [tongflow-api-openai](https://github.com/tong-io/tongflow-api-openai) — OpenAI with a per-node **model picker**: `gen_text`, image gen/edit/fusion (`gpt-image-2`), vision, document OCR, Whisper transcription and TTS
- [tongflow-api-deepseek](https://github.com/tong-io/tongflow-api-deepseek) — DeepSeek V4 (`flash` / `pro`, with a streaming **thinking** bubble) for `gen_text` / text tools
- [tongflow-api-bytedance](https://github.com/tong-io/tongflow-api-bytedance) — ByteDance Volcengine Ark with a per-node **model picker**: Doubao text & vision, Seedream image gen/edit/fusion, Seedance text/image/audio → video
- [tongflow-api-xai](https://github.com/tong-io/tongflow-api-xai) — xAI Grok with a per-node **model picker**: `gen_text` (Grok 4.x), image understanding, and Grok Imagine text-to-image
- [tongflow-api-runway](https://github.com/tong-io/tongflow-api-runway) — Runway Dev unified API with a per-node **model picker**: video (Gen-4.5, Gen-4 Turbo, Aleph edit, Act-Two, Seedance, Veo), image (GPT Image 2, Seedream 5, Gemini image 3) and ElevenLabs TTS

### Router plugins

Aggregators — one key, many third-party models across labs:

- [tongflow-router-openrouter](https://github.com/tong-io/tongflow-router-openrouter) — OpenRouter with a per-node **model picker**: `gen_text` (free by default, plus GPT-5.5 / Claude / Gemini / Grok / DeepSeek), vision / audio understanding, image gen/edit and transcription
- [tongflow-router-cometapi](https://github.com/tong-io/tongflow-router-cometapi) — CometAPI gateway with a per-node **model picker** that also lists CometAPI's **live catalog**: `gen_text` / text tools (GPT-5.5, Claude, Gemini, DeepSeek, Grok, Qwen, Kimi), image / video / audio understanding, image gen/edit/fusion (GPT Image 2, Seedream), text / image(s) → video (Sora 2, Veo 3.1, Seedance, Wan, MiniMax, HappyHorse, Vidu), video edit (Omni), TTS and Whisper transcription
- [tongflow-router-toapis](https://github.com/tong-io/tongflow-router-toapis) — ToAPIs gateway with a per-node **model picker**: `gen_text` / text tools (GPT-5.6, Claude, Gemini, DeepSeek, Qwen, GLM, Kimi, MiniMax), image understanding, image gen/edit/fusion (GPT Image 2, Seedream 5, Gemini Image, Flux 2, Grok), text / image(s) / first-last-frame / multimodal refs → video (Sora 2, Veo 3.1, Seedance 2, Kling, MiniMax H3, Wan, HappyHorse, Vidu), video edit (HappyHorse); the picker also lists the **live per-key model list**
- [tongflow-router-apimart](https://github.com/tong-io/tongflow-router-apimart) — APIMart gateway with a per-node **model picker**: image gen/edit (Z-Image, Seedream, Nano Banana, GPT-Image), text/image → video (Kling, VEO3, Sora2, Seedance), `gen_text` (GPT-5, Claude, Gemini), Whisper transcription and TTS
- [tongflow-router-replicate](https://github.com/tong-io/tongflow-router-replicate) — Replicate with a per-node **model picker** across the catalog: text, vision, image gen/edit/fusion/upscale/matting, text/image → video, transcription, TTS / voice clone, music, and image → 3D (FLUX, Seedream, Veo, Kling, Whisper, Hunyuan3D…)
- [tongflow-router-fal](https://github.com/tong-io/tongflow-router-fal) — fal.ai with a per-node **model picker**: image (gen/edit/fusion/upscale/matting/pose/normal/seg), video (text/image → video, first-last frame, talking-head, lip-sync, upscale), audio (transcription, TTS, voice clone, music, source separation) and image → 3D

### GPU/CPU plugins

- [tongflow-modal-ffmpeg](https://github.com/tong-io/tongflow-modal-ffmpeg) — transcoding, muxing, media pipelines
- [tongflow-modal-pyscenedetect](https://github.com/tong-io/tongflow-modal-pyscenedetect) — shot-boundary detection for splitting clips
- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — Z-Image text-to-image
- [tongflow-modal-ernie-image](https://github.com/tong-io/tongflow-modal-ernie-image) — ERNIE Image text-to-image (alternative)
- [tongflow-modal-krea2](https://github.com/tong-io/tongflow-modal-krea2) — Krea 2 Turbo text-to-image (open-weights 12B, 8-step, up to 2K)
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — FLUX.2 Klein 9B multi-reference fusion / image editing
- [tongflow-modal-qwen-image-edit](https://github.com/tong-io/tongflow-modal-qwen-image-edit) — Qwen-Image-Edit-2511 instruction editing / multi-image fusion (headless ComfyUI, fp8 + 8-step)
- [tongflow-modal-boogu](https://github.com/tong-io/tongflow-modal-boogu) — Boogu-Image-0.1 (fp8) text-to-image (dense bilingual text) & single-reference image editing
- [tongflow-modal-infinitetalk](https://github.com/tong-io/tongflow-modal-infinitetalk) — InfiniteTalk audio-driven lip-sync (audio + image / video → talking-head video)
- [tongflow-modal-wan-animate](https://github.com/tong-io/tongflow-modal-wan-animate) — Wan-Animate character swap & motion transfer (video + reference)
- [tongflow-modal-scail2](https://github.com/tong-io/tongflow-modal-scail2) — SCAIL-2 controlled character animation (image + driving video; same two slots as wan-animate)
- [tongflow-modal-minimax-h3](https://github.com/tong-io/tongflow-modal-minimax-h3) — MiniMax-H3 33B video generation with native stereo audio (text / first- & last-frame / multi-image / omni-reference)
- [tongflow-modal-bernini](https://github.com/tong-io/tongflow-modal-bernini) — Bernini-R 1.3B unified video renderer (text/image → image/video, video editing, subtitle / watermark removal)
- [tongflow-modal-sam3](https://github.com/tong-io/tongflow-modal-sam3) — SAM 3 / SAM 3.1 text-guided matting: cut every instance of a described concept out of an image (transparent PNG) or track it through a video (green-screen matte)
- [tongflow-modal-triposplat](https://github.com/tong-io/tongflow-modal-triposplat) — TripoSplat single image → 3D Gaussian splat
- [tongflow-modal-sam-3d-objects](https://github.com/tong-io/tongflow-modal-sam-3d-objects) — SAM 3D Objects single image → 3D Gaussian splat of the foreground object (auto mask, robust to occlusion/clutter; alternative)
- [tongflow-modal-sam-3d-body](https://github.com/tong-io/tongflow-modal-sam-3d-body) — SAM 3D Body single image → full-body 3D human mesh GLB (multi-person, MHR rig; alternative), and **video motion capture** (per-frame MHR regression → animated character GLB; alternative)
- [tongflow-modal-sapiens2](https://github.com/tong-io/tongflow-modal-sapiens2) — Sapiens2 (Meta) human suite: pose detection, body-part segmentation, surface normals, human matting, image → 3D point cloud, and **video motion capture** (geometric engine: keypoints + pointmap → animated MHR character GLB)
- [tongflow-modal-sensenova-vision](https://github.com/tong-io/tongflow-modal-sensenova-vision) — SenseNova-Vision (SenseTime) unified vision model: image understanding / visual QA, detection & OCR structured text, full-scene surface normals, salient-object matting, and human pose overlay (alternative)
- [tongflow-modal-seedvr2](https://github.com/tong-io/tongflow-modal-seedvr2) — SeedVR2 image / video super-resolution
- [tongflow-modal-gemma4](https://github.com/tong-io/tongflow-modal-gemma4) — Gemma-4 multimodal text (image / video understanding)
- [tongflow-modal-qwen38](https://github.com/tong-io/tongflow-modal-qwen38) — Qwen3.8-27B multimodal text (text generation, image / video understanding; alternative)
- [tongflow-modal-qwen3asr](https://github.com/tong-io/tongflow-modal-qwen3asr) — Qwen3 speech recognition
- [tongflow-modal-qwen3tts](https://github.com/tong-io/tongflow-modal-qwen3tts) — Qwen3 text-to-speech
- [tongflow-modal-indextts2](https://github.com/tong-io/tongflow-modal-indextts2) — IndexTTS-2.5 emotive text-to-speech: zero-shot voice cloning (alternative) and emotion-controlled speech from a voice reference
- [tongflow-modal-whisper](https://github.com/tong-io/tongflow-modal-whisper) — Whisper speech recognition with timestamps (alternative)
- [tongflow-modal-moss-transcribe-diarize](https://github.com/tong-io/tongflow-modal-moss-transcribe-diarize) — MOSS-Transcribe-Diarize 0.9B: long-form multi-speaker transcription with timestamps and speaker labels in one pass, plus per-speaker audio tracks (50+ languages, up to ~90 min)
- [tongflow-modal-ace-step](https://github.com/tong-io/tongflow-modal-ace-step) — ACE-Step 1.5 music suite: text-to-music (sft / base / turbo selectable), repaint, cover, stem extraction, add-track, arrangement completion, music brief, and music understanding
- [tongflow-modal-levo](https://github.com/tong-io/tongflow-modal-levo) — LeVo 2 / SongGeneration text-to-music (multilingual, commercial-grade)
- [tongflow-modal-minimax-music3](https://github.com/tong-io/tongflow-modal-minimax-music3) — MiniMax-Music3 11B song generation: lyrics + description → complete song with vocals (up to ~5 min, 32 kHz stereo)
- [tongflow-modal-yue2](https://github.com/tong-io/tongflow-modal-yue2) — YuE2 song generation: style + lyrics → editable score → full song with vocals (48 kHz stereo), plus covers via SheetSage2 transcription (weights CC BY-NC 4.0, non-commercial)
- [tongflow-modal-sam-audio](https://github.com/tong-io/tongflow-modal-sam-audio) — SAM-Audio text-prompted sound separation: noise reduction, vocal isolation, and free-text stem extraction ("the piano in the background")
- [tongflow-modal-docling](https://github.com/tong-io/tongflow-modal-docling) — Docling document → text
- [tongflow-modal-paddle](https://github.com/tong-io/tongflow-modal-paddle) — PaddleOCR document → text
- [tongflow-modal-unlimited-ocr](https://github.com/tong-io/tongflow-modal-unlimited-ocr) — Unlimited-OCR long-horizon document / PDF → text
- [tongflow-modal-crawl4ai](https://github.com/tong-io/tongflow-modal-crawl4ai) — Crawl4AI URL / link → text
- [tongflow-modal-scrapling](https://github.com/tong-io/tongflow-modal-scrapling) — Scrapling stealth-browser URL / link → text

## Run from source

```bash
pnpm install
pnpm plugins:install   # clone official plugins into plugins/
pnpm start:prod        # builds once, then serves at http://localhost:3000
```

Requires **Node** (with `pnpm`) and a **Python 3.10+** interpreter on your `PATH` (set `PYTHON` to point at a specific one). Plugins run as local Python processes; TongFlow provisions an isolated venv for them automatically and installs each plugin's `requirements.txt` on first use — no manual Python setup.

Open **`http://localhost:3000`** and the canvas is live. Then follow [Self-host setup](#self-host-setup-plugins--credentials) (credentials go in the in-app **Settings** dialog, or a project `.env`).

## Run with Docker

A self-host image is published to GHCR — no Node/Python/pnpm setup required:

```bash
docker run -d -p 3000:3000 \
  -v tongflow-data:/data -v tongflow-plugins:/plugins \
  ghcr.io/tong-io/tongflow:latest
```

Then open **`http://localhost:3000`**. Or with Compose (clones this repo's [`docker-compose.yml`](docker-compose.yml)):

```bash
docker compose up -d
```

To build the image yourself instead of pulling: `docker build -t tongflow .`

**Data & credentials.** Everything writable lives in the `/data` volume (SQLite db, uploads, settings). API keys are optional — set them in the in-app **Settings** dialog, or pass them at launch (`-e OPENROUTER_API_KEY=…`); supported keys: `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`.

**Plugins.** The image ships no plugins — install them from the in-app plugin manager (first install needs network access to GitHub). On first run, a plugin provisions a shared Python venv under `/data/.tongflow/plugin-venv` (installs the SDK + the plugin's `requirements.txt` from PyPI), so the first run is slower and needs network. Modal-backed plugins additionally need a Modal token.

## Self-host setup (plugins & credentials)

A self-hosted TongFlow ships with no plugins pre-installed, and the canvas is preloaded with an example workflow. Three steps get it running:

### 1 — Install plugins

Open the **plugin manager** (the blocks icon, top-right) and install what you need. Newly installed plugins are usable immediately, no restart.

To run the preloaded **example workflow** (text → image → fusion → video), install these three plugins:

- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — text-to-image
- [tongflow-modal-qwen-image-edit](https://github.com/tong-io/tongflow-modal-qwen-image-edit) — image fusion / blending
- [tongflow-modal-minimax-h3](https://github.com/tong-io/tongflow-modal-minimax-h3) — image-to-video

These run on [Modal](https://modal.com) (up to **$30/month** of free GPU compute). Add `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` in **Settings**; create a token at [modal.com/settings/tokens](https://modal.com/settings/tokens). Any other platform can publish its own plugins the same way.

Browse the full catalog — the official API plugins (OpenAI / Gemini / OpenRouter) and other GPU/CPU plugins — in the plugin manager.

### 2 — Configure credentials

Open **Settings** (the gear icon, top-right) and add the environment variables your plugins need — e.g. `OPENAI_API_KEY` for the API plugins, or the credentials your GPU/CPU plugins require.

> **Plugin credentials live in Settings.** TongFlow is platform-agnostic and hardcodes no provider: the Settings dialog is a generic key/value editor for environment variables passed to plugins. Each plugin's README documents the keys it needs. Values are stored locally and take effect without a restart.

### 3 — Run the example workflow

Run the preloaded example node by node, or switch to Execute Mode and hit the run button to run the whole thing in one click.

## Use it inside an agent (dsh plugin)

TongFlow also runs **inside your own agent**, as a plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — no desktop app, no server of your own:

```sh
npx @deepseek-ai/dsh@next plugin --profile web add dsh-tongflow
npx @deepseek-ai/dsh@next web
```

Then start a session whose **first message begins with `@tongflow`**. That session turns into the Studio — chat, the project's folder tree, preview / editor / the canvas, and a runs drawer — and the agent gets TongFlow's tools. Any other session stays plain dsh.

The split is the point: the agent designs the project and writes the plan, briefs and prompts as ordinary files; TongFlow generates, and every generated asset comes from a saved `.tongflow.json` workflow sitting next to its outputs — so you can open it on the canvas, change it and run it again. There is no "generate an image" tool and no project template. The plugin provisions its own Python venv and clones the official plugins on first use, so the canvas offers the same catalog as the hosted app.

Requirements and configuration: **[packages/dsh-tongflow/README.md](packages/dsh-tongflow/README.md)**.

## Custom plugins

Every runnable node is a **capability** backed by a contract — the ABI ([`packages/tongflow/abi/tongflow.abi.json`](packages/tongflow/abi/tongflow.abi.json)) — that defines *what capabilities exist* and *what each one's input/output looks like*, independent of *who* implements it. A plugin is the **implementation**: a small Python package that picks one or more ABI slots and supplies the **how**, annotated against the ABI-generated types via the tongflow Python SDK. Swapping the plugin behind a node leaves the workflow around it unchanged.

The full development flow — the ABI, the `@node_slot` decorator, the SDK, directory layout, and how to publish — lives in **[docs/plugins.md](docs/plugins.md)**.

## Community

Join the community on **[Discord](https://discord.gg/K7V8az94Zf)** or scan the **WeChat group** QR code below.

<div>
  <img src="docs/assets/qr.png" alt="WeChat group QR code" width="180" />
</div>

## Business

For business inquiries, please contact business@tongflow.com.

- **Open-source model owners**: I can integrate your models so users can try them out smoothly.
- **Enterprise**: I can help you deploy on your local GPU, build custom nodes and plugins, and more.
- **Platform / router**: I can integrate your APIs.
- **VCs**: I’m interested in partnering on [TongFlow Cloud](https://www.tongflow.com), the hosted workspace.

## Open-Source

If you like this project, a Star on GitHub helps a lot. Thank you.

<img src="docs/assets/star.gif" alt="Star on GitHub" width="480" />

## License

TongFlow is **dual-licensed**:

- **[AGPL-3.0](LICENSE)** — free for individuals, research, open-source projects,
  and anyone willing to comply with the AGPL (including its Section 13
  network/source-disclosure obligation).
- **[Commercial License](COMMERCIAL-LICENSE.md)** — for organizations that want to
  use TongFlow in closed-source or SaaS products **without** AGPL's
  source-disclosure obligation, or that need warranties and platform support.
  Contact **business@tongflow.com**.

This covers the entire repository, including the `sdk/` directory (the `tongflow`
PyPI package). Contributions are covered by our [CLA](CLA.md).