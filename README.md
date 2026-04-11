# OpenFlow

一个开源的 AI 工作流编辑器：在无限画布上用「节点」拖拽组合，生成并执行多模态（文本 / 图像 / 音频 / 视频 / 文档）工作流。

> English: Open-source AI workflow editor — build multimodal pipelines by dragging nodes on an infinite canvas.

## 你能用它做什么

- **工作流画布**：无限画布 + 节点式编排，适合快速搭原型与可复用的流程模版
- **多模态输入输出**：文本、图片、音频、视频、文件都能作为节点数据流转
- **AI 与媒体处理并存**：LLM、图像生成/编辑、视频生成/增强、ASR/TTS、文档解析、爬虫、FFmpeg 等
- **可插拔后端**：本地 Next.js 负责编排与任务管理；耗时/重计算可交给 **Modal** 的 CPU/GPU worker

## 节点源码实现状态

路径均相对于 `src/components/workspace/nodes/`（不含 `base/` 下的公共组件，如 `base-node.tsx`）。

**判定说明**：节点通过 `workflowConfig.feature` 对应 `src/lib/feature-registry.ts` 中的功能名；任务执行需 `src/lib/register-task-handlers.ts` 中已 `registerHandler`（含 LLM 与已接线的 Modal CPU/GPU）。`type: "api"` 的 feature 当前无统一 handler，选 Pro 走 API 的路径视为未跑通。

### 已实现

#### 全路径可跑通（注册表 + handler 齐全）

- `transfer/text-gen-text.tsx`
- `decompose/split_text.tsx`
- `transfer/file-gen-text.tsx`
- `add/add-link-node.tsx`
- `compose/concat-video.tsx`（同时用于 `concatVideoNode` / `concatVideoComposeNode`）
- `compose/merge-video-audio.tsx`
- `transfer/get-first-frame.tsx`
- `transfer/get-last-frame.tsx`
- `decompose/split_video.tsx`
- `transfer/separate_video_audio.tsx`
- `transfer/text-gen-video.tsx`
- `transfer/image-gen-text.tsx`
- `transfer/video-gen-text.tsx`
- `transfer/image-gen-image-upscale.tsx`
- `transfer/video-upscale.tsx`
- `transfer/text-gen-music.tsx`
- `transfer/text-gen-speech.tsx`
- `compose/image-image-gen-video.tsx`
- `transfer/audio-gen-text-speech-recognize.tsx`
- `transfer/video-gen-text-speech-recognize.tsx`

#### 部分路径可跑通（其余选项会失败、`api`/未接线或 feature 拼写不在注册表）

- `transfer/image-gen-image.tsx`：仅 **eco**（`image_edit`）；**pro**（`image_edit_pro`）为 `api`，无 handler。
- `transfer/text-gen-image.tsx`：仅 **eco**（`image_gen`）；**pro**（`image_gen_pro`）为 `api`，无 handler。
- `compose/image-fusion.tsx`：仅 **eco**（`image_fusion`）；**pro**（`image_fusion_pro`）为 `api`，无 handler。
- `transfer/image-gen-video.tsx`：仅 **eco**（`image_gen_video`）；**pro**（`image_gen_video_pro`）为 `api`，无 handler。
- `compose/texts-gen-text.tsx`：仅 **`model === "auto"`**（`combine_text`）；其它模型选项会生成未在注册表的 `combine_text_*`。
- `compose/text-audio-gen-speech.tsx`：仅 **无情感且无风格**（`text_gen_speech_clone`）；填情感/风格走未接线的 GPU function。

#### 仅画布数据 / 输入（不发起带 `feature` 的后端任务）

- `modal/image-node.tsx`
- `modal/text-node.tsx`
- `modal/video-node.tsx`
- `modal/audio-node.tsx`
- `modal/file-node.tsx`
- `modal/model-node.tsx`
- `add/add-text-node.tsx`
- `add/add-image-node.tsx`
- `add/add-audio-node.tsx`
- `add/add-video-node.tsx`
- `add/add-file-node.tsx`
- `add/add-model-node.tsx`

### 未实现

以下文件对应节点**尚未**在默认路径上同时满足「注册表可解析 + 已有 handler」；部分为 feature 名与注册表不一致、部分为后端能力未接线。

- `transfer/text2voice.tsx`
- `transfer/voice2text.tsx`
- `transfer/image-gen-model.tsx`
- `transfer/speech-gen-video.tsx`
- `transfer/video2clip.tsx`
- `transfer/music-gen.tsx`
- `transfer/remove-subtitle.tsx`
- `transfer/remove-watermark.tsx`
- `transfer/denoise-audio.tsx`
- `transfer/separate_audio_track.tsx`
- `transfer/separate_speaker.tsx`
- `transfer/convert-voice.tsx`
- `batch/drop_video.tsx`
- `batch/arrrange_text.tsx`
- `compose/avatarvideo.tsx`
- `compose/move-video.tsx`
- `compose/mix-video.tsx`
- `compose/speech-image-gen-video.tsx`
- `compose/speech-text-gen-video.tsx`
- `compose/speech-image-video-gen-video.tsx`
- `compose/speech-video-gen-video.tsx`
- `compose/video-image-gen-video-mix.tsx`
- `compose/video-image-gen-video-move.tsx`
- `compose/text-video-gen-video-subtitle-video.tsx`

## 节点一览（Node Catalog）

下面的表格按「节点」维度列出：**节点功能 → 对应 feature key → 后端实现（type/function）→ 使用的模型/提供商**。  
（feature 定义来自 `src/lib/feature-registry.ts`；节点定义来自 `src/components/workspace/nodes/`。）

### 输入/素材节点（Add）


| 节点        | 作用                  | 输出               |
| --------- | ------------------- | ---------------- |
| Add Text  | 手动输入文本              | `textNode`       |
| Add Image | 上传/选择图片             | `imageNode`      |
| Add Audio | 上传/选择音频             | `audioNode`      |
| Add Video | 上传/选择视频             | `videoNode`      |
| Add File  | 上传/选择文件（文档等）        | `fileNode`       |
| Add Link  | 输入链接并抓取内容           | `textNode`（抓取结果） |
| Add Model | 选择/注入模型资源（如 3D 模型等） | `modelNode`      |


> 注：以上为数据源/素材节点，本身不一定调用 AI 模型。

### 文本（LLM）


| 节点                    | Feature         | 后端 (type/function)                        | 提供商/模型                                                  |
| --------------------- | --------------- | ----------------------------------------- | ------------------------------------------------------- |
| Text → Text（生成/改写）    | `gen_text`      | `llm/openrouter_free`                     | OpenRouter（默认 `OPENROUTER_FREE_MODEL`，见 `.env.example`） |
| Split Text（拆分）        | `split_text`    | `llm/openrouter_t2mt`                     | OpenRouter（面向“文本→多段文本”）                                 |
| Combine Text（合并/整理）   | `combine_text`  | `llm/gemini_mt2t`                         | Google Gemini（需要 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`）   |
| Arrange Group（批量编排文本） | `arrange_group` | （实现见 `src/handlers/llm/arrange-texts.ts`） | DeepSeek（需要 `DEEPSEEK_API_KEY`）                         |


### 图像（生成/编辑/理解）


| 节点                      | Feature          | 后端 (type/function)          | 提供商/模型                                                       |
| ----------------------- | ---------------- | --------------------------- | ------------------------------------------------------------ |
| Text → Image（文生图）       | `image_gen`      | `gpu/zimage-t2i`            | Modal GPU：Z-Image-Turbo（`modal/gpu/z_image.py`）              |
| Image → Image（图片编辑）     | `image_edit`     | `gpu/flux2-klein9b-edit`    | Modal GPU：FLUX.2 Klein 9B（`modal/gpu/flux2_klein9b.py`）      |
| Image Fusion（多图融合/参考编辑） | `image_fusion`   | `gpu/flux2-klein9b-fusion`  | Modal GPU：FLUX.2 Klein 9B 多图参考（`modal/gpu/flux2_klein9b.py`） |
| Image Upscale（图片超分）     | `image_upscale`  | `gpu/seedvr2-image-upscale` | Modal GPU：SeedVR2（`modal/gpu/seedvr2.py`）                    |
| Image → Text（图片识别/描述）   | `image_gen_text` | `gpu/gemma4-i2t`            | Modal GPU：Gemma 4 视觉理解（`modal/gpu/gemma4.py`）                |


### 视频（生成/增强/理解）与媒体处理


| 节点                         | Feature                 | 后端 (type/function)          | 提供商/模型                                        |
| -------------------------- | ----------------------- | --------------------------- | --------------------------------------------- |
| Text → Video（文生视频）         | `text_gen_video`        | `gpu/ltx2-t2v`              | Modal GPU：LTX-2（`modal/gpu/ltx.py`）           |
| Image → Video（图生视频）        | `image_gen_video`       | `gpu/ltx2-i2v`              | Modal GPU：LTX-2（`modal/gpu/ltx.py`）           |
| Image + Image → Video（首尾帧） | `image-image-gen-video` | `gpu/ltx2-ii2v-first-last`  | Modal GPU：LTX-2（首尾帧）                          |
| Video Upscale（视频超分）        | `video_upscale`         | `gpu/seedvr2-video-upscale` | Modal GPU：SeedVR2                             |
| Video → Text（视频理解/描述）      | `video_gen_text`        | `gpu/gemma4-v2t`            | Modal GPU：Gemma 4 视频理解（`modal/gpu/gemma4.py`） |
| Concat Videos（拼接视频）        | `concat_videos`         | `cpu/ffmpeg`                | Modal CPU：FFmpeg（拼接）                          |
| Separate Video Audio（分离音轨） | `extract_audio`         | `cpu/ffmpeg-extract-audio`  | Modal CPU：FFmpeg（抽音频）                         |
| Merge Video Audio（合成音画）    | `merge_video_audio`     | `cpu/ffmpeg-merge`          | Modal CPU：FFmpeg（合成）                          |
| Get First Frame            | `get_first_frame`       | `cpu/ffmpeg-first-frame`    | Modal CPU：FFmpeg（抽首帧）                         |
| Get Last Frame             | `get_last_frame`        | `cpu/ffmpeg-last-frame`     | Modal CPU：FFmpeg（抽尾帧）                         |
| Split Video（按镜头切分）         | `split_video`           | `cpu/scenedetect`           | Modal CPU：PySceneDetect（切分）                   |


### 音频（ASR/TTS/音乐）


| 节点                   | Feature          | 后端 (type/function)                  | 提供商/模型                                       |
| -------------------- | ---------------- | ----------------------------------- | -------------------------------------------- |
| Text → Speech（TTS）   | `text_to_speech` | （见 Modal handlers：`qwen3tts-t2s` 等） | Modal GPU：Qwen3 TTS（`modal/gpu/qwen3tts.py`） |
| Speech → Text（ASR）   | `speech_reco`    | （见 `transcribe` / 相关 handlers）      | Modal GPU：Qwen3 ASR（`modal/gpu/qwen3asr.py`） |
| Text → Music         | `gen_music`      | `gpu/ace-step`                      | Modal GPU：ACE-Step（默认 DiT：`acestep-v15-xl-base`；见 `modal/gpu/ace_step.py`）  |
| Generate Music（音乐生成） | `generate_music` | （节点侧 feature；以注册表为准）                | 取决于 feature 映射                               |


### 组合节点（Compose）

**组合节点**面向「多路输入」：通常需要同时连接多个上游节点（如文本 + 音频、图片 + 视频、双图首尾帧等），把多模态素材合成下一步结果。实现位于 `src/components/workspace/nodes/compose/`；分类列表见 `src/components/workspace/types.tsx` 中的 `NODE_CATEGORIES.COMPOSE`。

> English: **Compose** nodes take multiple upstream inputs and merge multimodal data into the next step. Implemented under `src/components/workspace/nodes/compose/`; the compose node type list is `NODE_CATEGORIES.COMPOSE` in `src/components/workspace/types.tsx`.

「Combine Text（合并文本）」的说明见上文「文本」一节（`combine_text`）。下表列出其余组合类节点（feature 可能随节点内选项变化，以 `src/lib/feature-registry.ts` 与节点内 `workflowConfig` 为准）。

| 节点 | 作用 | Feature（主键 / 常见别名） |
| --- | --- | --- |
| Avatar / 数字人视频 | 数字人 / 口型驱动类视频 | `avatar_video` |
| Move Video / 动作迁移 | 动作或姿态迁移到目标视频 | `video_image_move` 等（随模式变化） |
| Merge Video Audio / 音视频合并 | 视频轨与音频轨合成 | `merge_video_audio` |
| Mix Video / 人物替换 | 画面中人物替换类生成 | `wan22-i2v-allinone-repid` 等 |
| Image Fusion / 图片融合 | 多图参考融合（含 Pro 模式） | `image_fusion` / `image_fusion_pro` |
| Speech + Image → Video | 语音 + 图片 → 视频 | `audio_image_gen_video` |
| Speech + Text → Video | 语音 + 文本 → 视频 | `speech_text_gen_video` |
| Speech + Image + Video → Video | 语音 + 图 + 视频 → 视频 | `speech_image_video_gen_video` |
| Speech + Video → Video | 语音 + 视频 → 视频 | `speech_video_gen_video` 等 |
| Video + Image Mix / 视频图片混合 | 参考图与视频混合生成 | `wan-animate-mix` |
| Video + Image Move / 视频图片迁移 | 视频 + 图 的动作或迁移类生成 | `video_image_move`、`wan-animate-move` 等 |
| Image + Image → Video / 双图生成视频 | 双图（如首尾帧）生成视频 | `image-image-gen-video` |
| Text + Audio → Speech / 文本音频生成语音 | 文本 + 参考音频：克隆 / 情感 / 风格 TTS | `text_gen_speech_clone`、`text_gen_speech_emotion`、`text_gen_speech_style` |
| Text + Video → Subtitle Video / 字幕视频 | 字幕文本与视频等合成管线 | `text_video_gen_video_subtitle_video` |
| Concat Videos（组合侧多路拼接） | 多段视频顺序拼接（组合节点实现） | `concat_videos` |

> 说明：侧栏「合为一组 / 组合模式」用于多选节点成组的画布编排，与上表「组合类」节点（多输入合成）是不同概念。


### 其他（文档/网页/工具）


| 节点                | Feature          | 后端 (type/function) | 说明                        |
| ----------------- | ---------------- | ------------------ | ------------------------- |
| File → Text（文档解析） | `parse_document` | `cpu/docling`      | Modal CPU：Docling 解析文档    |
| Link（网页抓取）        | `link`           | `cpu/crawl4ai`     | Modal CPU：Crawl4AI 抓取网页内容 |


> 如果你发现某些节点的 `feature` 名称与注册表不一致（例如历史兼容），可以在 `src/lib/feature-registry.ts` 的 `FEATURE_NAME_ALIASES` 中统一别名。

## 后端与模型提供商（Providers）

- **Modal（CPU/GPU workers）**：用于 FFmpeg、场景切分、GPU 推理（Z-Image / FLUX / LTX-2 / SeedVR2 / Gemma4 / Qwen3 等）
- **OpenRouter（LLM 路由）**：默认文本生成 `gen_text` 的免费路由/模型（可用 `.env` 覆盖）
- **Google Gemini（API）**：用于部分文本/多模态 API 任务（需要 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`）
- **DeepSeek（API）**：用于部分文本编排/推理（需要 `DEEPSEEK_API_KEY`）
- **OpenAI（API）**：提供 `openai-text` handler（默认 `OPENAI_CHAT_MODEL=gpt-4o-mini`）

## 本地运行（Quickstart）

### 三种启动方式

#### 1) 直接下载 Release 桌面版（推荐给普通用户）

- 到 GitHub 的 Releases 页面下载对应系统的安装包（macOS / Windows）。
- 首次使用仍需要你在应用内/环境变量里配置 Modal/OpenRouter/Gemini 等 API key/token（见下方“环境变量”）。

#### 2) Docker Compose 一键启动（推荐给自托管/部署）

仓库根目录已提供 `compose.yaml`：

```bash
docker compose up --build
```

启动后访问 `http://localhost:3000`（会进入 `/workspace`）。

> 数据会持久化在 Docker volume（包含 SQLite：`data/openflow.db` 与上传文件）。

#### 3) 本地开发启动（pnpm dev）

依赖：Node.js（建议 Node 20+）与 pnpm。

```bash
pnpm install
pnpm dev
```

启动后访问 `http://localhost:3000`（会进入 `/workspace`）。

### 环境变量（Modal / 各类模型提供商）

本项目会调用外部服务（例如 Modal / OpenRouter / Gemini / DeepSeek / OpenAI）。你可以用 `.env` 来配置。

常用变量（以 `.env` 为准）：

- `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`：Modal worker 调用
- `OPENROUTER_API_KEY` / `OPENROUTER_FREE_MODEL`：OpenRouter LLM
- `GEMINI_API_KEY` / `GOOGLE_API_KEY`：Gemini
- `DEEPSEEK_API_KEY`：DeepSeek
- `OPENAI_API_KEY` / `OPENAI_CHAT_MODEL`：OpenAI
- `NEXT_PUBLIC_TASK_API_URL`：可选，把任务 wait/stop 指向外部任务服务
- `NEXT_PUBLIC_FILE_BASE_URL`：可选，文件存储的 base URL

如果你要做 Modal 授权（会把 token 写入 `~/.modal.toml`）：

```bash
pnpm modal:setup
```

## 桌面版（Electron：macOS + Windows）

> 目标：用户无需安装 Node，下载应用即可运行（Electron 会把运行时打包进去）。  
> 注意：Modal/OpenRouter/Gemini 等外部服务仍需要你在 `.env` 里配置 API key/token。

### 开发模式（Desktop Dev）

同时启动 Next dev server 与 Electron：

```bash
pnpm desktop:dev
```

### 打包（Desktop Build）

构建 Next standalone + 准备资源 + 打包 Electron（本地目录产物）：

```bash
pnpm desktop:build
```

产物默认在 `release/`（或 `desktop:pack` 的临时目录）中。

### 发布版安装包（Desktop Dist）

生成最终安装包（macOS dmg/zip、Windows nsis/zip）：

```bash
pnpm desktop:dist
```

### 签名与系统提示

- **未签名**的 macOS app 可能触发 Gatekeeper 提示
- **未签名**的 Windows 安装包可能触发 SmartScreen
- 正式发行建议配置代码签名（macOS notarization / Windows 证书）

## 开发与扩展（Adding a new node/feature）

（高层流程）

- **新增 feature**：编辑 `src/lib/feature-registry.ts`，添加 `name/type/function`
- **新增节点 UI**：在 `src/components/workspace/nodes/` 新建节点组件，并在节点 `workflowConfig.feature` 里引用 feature name
- **新增后端 handler**：
  - LLM/API：在 `src/handlers/`** 实现并注册
  - Modal：在 `modal/`** 写 Python 并 `modal deploy`，再补齐 `src/handlers/modal/configs.ts` 的映射

## License

This project is licensed under **GNU Affero General Public License v3.0 (AGPL-3.0-only)**.

- If you modify and run it as a network service, you must offer users the Corresponding Source of your modified version (see AGPL section 13).

