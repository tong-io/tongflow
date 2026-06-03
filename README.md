<div align="center">
  <img src="public/logo.svg" alt="TongFlow" width="320" />

  <h1>A OpenSource Multi-Modal AIGC Canvas</h1>
  <p>
    <a href="https://github.com/tong-io/tongflow/stargazers"><img src="https://img.shields.io/github/stars/tong-io/tongflow?style=flat&logo=github" alt="GitHub stars" /></a>
    <a href="https://github.com/tong-io/tongflow/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License" /></a>
    <a href="https://github.com/tong-io/tongflow/actions/workflows/ci.yml"><img src="https://github.com/tong-io/tongflow/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://discord.gg/K7V8az94Zf"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
    <a href="https://github.com/tong-io/tongflow/releases"><img src="https://img.shields.io/github/v/release/tong-io/tongflow?logo=github" alt="Latest Release" /></a>
  </p>
</div>

**TongFlow** is an all-in-one AIGC studio for building AIGC workflows end to end with ease.

With TongFlow, you can expand your imagination and stretch your ideas with generative AI, just have a try now!

## Demo Examples

| Scenario<img width="160" height="1" /> | Workflow | Result |
| :-- | :--: | :--: |
| **Basic**<br/>Type text (Add), generate images (Transform), then blend them into one (Compose). | <img src="https://file.tongflow.com/public/demos/basic.png" width="420" alt="workflow" /> | <img src="https://file.tongflow.com/public/demos/basic_result.png" width="240" alt="result" /> |
| **Intermediate**<br/>(Add topic → write script → generate speech) + (character description → generate image) → lip-synced video = talking-head avatar. | <img src="https://file.tongflow.com/public/demos/digitalhuman.png" width="420" alt="workflow" /> | <video src="https://file.tongflow.com/public/demos/digitalhuman.mp4" width="240"></video> |
| **Advanced**<br/>Generate lyrics + song + characters + scenes + storyboard → produce a music video. | <img src="https://file.tongflow.com/public/demos/mv.png" width="420" alt="workflow" /> | <video src="https://file.tongflow.com/public/demos/mv.mp4" width="240"></video> |

## How To Start

### Step 1 — Start the app

You need **Node.js 20+**, **pnpm**, **Git**, and **Python 3.10+**.

```bash
pnpm install
pnpm plugins:install   # clone all official plugins into plugins/
pnpm start:prod        # builds once, then serves at http://localhost:3000
```

Open **`http://localhost:3000`** and the canvas is live.

> Use a different port with `pnpm start:prod -- -p 4000`. After pulling updates,
> just re-run `pnpm start:prod` to rebuild.

### Step 2 — Set up Modal

The official GPU/CPU plugins run on [Modal](https://modal.com) (free — it includes **$30/month** of GPU):

```bash
pip install modal
modal setup   # opens your browser to authorize; writes the token to ~/.modal.toml
```

### Step 3 — Run the example workflow

On first open, the canvas is preloaded with an example — a cat and a mouse generated from text (Z-Image), fused into one photo (FLUX.2-klein), then animated into a short video (LTX), all on Modal. Just flip the toggle to **Execute Mode** and hit the run button.

> To reload it later, use the workflow-name menu at the top → **Import JSON** → [`public/example.json`](public/example.json).

## Core Concept

- **All models**: AI models can be thought of as a **modality transform** (e.g. LLMs are text→text, image models are text→image, speech models are text→audio, and so on). TongFlow wraps each capability as a node.

- **All modalities**: TongFlow supports almost every modality and file format that people actually ship over the web.

- **Low barrier, high ceiling**: no complex AI parameters to learn, no manual node connecting; just three operations — **add**, **transform**, and **combine** — to arrange ideas freely. And by orchestrating AI models freely, you can generate unique creations and works of your own.

- **Open ecosystem**: TongFlow's plugin-based design lets every platform package its own independent plugins, and we provide at least one official implementation plugin for each capability node (today's official plugins for open-source models run on [Modal](https://modal.com), since it offers users up to $30/month of free compute with cloud GPUs such as H100/A100). The core stays small, the ecosystem stays open — any platform can publish its own plugins.

## What’s Defined

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

#### Video

- ✅ **Video generation**: video from text.
- ✅ **Image-to-video**: animate a still into motion.
- ✅ **First/last-frame video**: two key images to interpolate a clip.
- ✅ **Video understanding**: summaries or descriptions from video.
- ✅ **Video upscaling**: higher-resolution output.
- ✅ **Extract first / last frame**: grab a frame as an image.
- ⬜ **Subtitle removal**: clean subtitles from a video.
- ⬜ **Watermark removal**: remove watermarks from a video.

#### Audio

- ✅ **Music generation**: music from text.
- ✅ **Speech synthesis**: text-to-speech — preset style, voice clone (reference audio), or instruction-driven.
- ✅ **Speech recognition**: transcribe speech from audio or video.
- ⬜ **Noise reduction**: denoise audio.
- ⬜ **Speaker diarization**: separate audio by speaker.
- ⬜ **Voice / timbre replacement**: replace or clone a voice with a reference sample.
- ⬜ **Multi-track / vocal-accompaniment separation**

### Combine

- ✅ **Image fusion**: blend or edit multiple references into one image.
- ✅ **Lip sync**: audio + video → video (lip-sync); also audio + image → video and audio + text → video variants.
- ⬜ **Clone voice**: text + reference audio → speech with a cloned voice (the **Speech synthesis → voice clone** node above already covers this).
- ✅ **Character swap**: video + reference (scene blend / character replacement), Animate Mix-style generation.
- ✅ **Motion transfer**: video + reference (motion / retarget), Animate Move-style generation.
- ✅ **Combine text**: merge multiple text nodes into one.

### Other

- ⬜ **Image → 3D**: single-view 3D model from an image.
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

TongFlow runs on a **plugin ecosystem**. Every model / capability is an independently versioned package — Modal GPU/CPU workers as `tongflow-modal-*`, LLM API adapters as `tongflow-llm-*`. They live under [tong-io](https://github.com/tong-io) on GitHub and on PyPI, are cloned at runtime into the gitignored `plugins/` directory (via `pnpm plugins:install` or a plain `git clone`), and are picked up by the scanner on next start. See [docs/plugins.md](docs/plugins.md). Third parties can publish their own plugins the same way.

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
- [tongflow-modal-infinitetalk](https://github.com/tong-io/tongflow-modal-infinitetalk) — InfiniteTalk audio-driven lip-sync (audio + video → talking-head video)
- [tongflow-modal-wan-animate](https://github.com/tong-io/tongflow-modal-wan-animate) — Wan-Animate character swap & motion transfer (video + reference)
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

## Custom plugins

A plugin is a small Python package that implements one or more **node slots** — the typed capabilities the canvas exposes (`gen-text`, `image-gen`, `gen-video`, … the full list lives in [`config/tongflow.abi.json`](config/tongflow.abi.json) and the generated [`NodeSlots`](sdk/tongflow/node_slots.py)). Two kinds:

- **`tongflow-llm-*`** — an API adapter (text / multimodal). A single `entry.py` with module-level functions.
- **`tongflow-modal-*`** — a GPU/CPU worker that runs on [Modal](https://modal.com). A `deploy.py` defining a Modal app, plus an optional `download.py` for model weights.

The contract is the same for both: annotate a function/method with `@node_slot(...)` and type it with the generated input/output models. The [`@node_slot`](sdk/tongflow/slots.py) decorator marshals the incoming dict into a typed model and your returned model back to JSON — your code only ever sees typed objects, never raw dicts.

**LLM plugin** — `plugins/tongflow-llm-myname/entry.py`:

```python
from tongflow.node_slots import NodeSlots
from tongflow.slots import node_slot
from tongflow.models.gen_text import GenTextInput, GenTextOutput

@node_slot(NodeSlots.GEN_TEXT)
def gen_text(input: GenTextInput) -> GenTextOutput:
    answer = call_your_provider(input.text, input.userPrompt)
    return GenTextOutput(success=True, text=answer)
```

**Modal plugin** — `plugins/tongflow-modal-myname/deploy.py`:

```python
import modal
from tongflow import current_app
from tongflow.node_slots import NodeSlots
from tongflow.protocol import asset
from tongflow.slots import node_slot
from tongflow.models.image_gen import ImageGenInput, ImageGenOutput

app = current_app(__file__)  # app name derived from the directory
image = modal.Image.debian_slim().pip_install("tongflow==0.0.20", ...)  # pin must match the SDK

@app.cls(image=image, gpu="L40S")
class Inference:
    @modal.method()
    @node_slot(NodeSlots.IMAGE_GEN)
    def image_gen(self, input: ImageGenInput) -> ImageGenOutput:
        png = render(input.text)                       # your model
        return ImageGenOutput(success=True, image=asset(png, mime="image/png"))
```

Binary outputs are wrapped with `asset(bytes, mime=...)`; the server turns them into downstream file refs automatically.

**Steps:**

1. `pip install tongflow==0.0.20` (the SDK ships the `NodeSlots` enum and every `*Input` / `*Output` model).
2. Create `plugins/tongflow-{llm,modal}-<name>/` with `entry.py` / `deploy.py` as above.
3. Restart — the scanner (`pnpm dev`) picks it up; your node now lists the new plugin. Modal plugins auto-deploy on first run.
4. To share it, push the repo under any GitHub org and others install it with `git clone` into their `plugins/`.

See [docs/plugins.md](docs/plugins.md) for the directory contract and [sdk/README.md](sdk/README.md) for publishing the package to PyPI.

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

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tong-io/tongflow&type=Date)](https://star-history.com/#tong-io/tongflow&Date)
