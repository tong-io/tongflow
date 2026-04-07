# OpenFlow

一个开源的 AI 工作流编辑器：在无限画布上用「节点」拖拽组合，生成并执行多模态（文本 / 图像 / 音频 / 视频 / 文档）工作流。

> English: Open-source AI workflow editor — build multimodal pipelines by dragging nodes on an infinite canvas.

## 你能用它做什么

- **工作流画布**：无限画布 + 节点式编排，适合快速搭原型与可复用的流程模版
- **多模态输入输出**：文本、图片、音频、视频、文件都能作为节点数据流转
- **AI 与媒体处理并存**：LLM、图像生成/编辑、视频生成/增强、ASR/TTS、文档解析、爬虫、FFmpeg 等
- **可插拔后端**：本地 Next.js 负责编排与任务管理；耗时/重计算可交给 **Modal** 的 CPU/GPU worker

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
| Text → Music         | `gen_music`      | `gpu/ace-step`                      | Modal GPU：ACE-Step（`modal/gpu/ace_step.py`）  |
| Generate Music（音乐生成） | `generate_music` | （节点侧 feature；以注册表为准）                | 取决于 feature 映射                               |


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

### 依赖

- Node.js（建议 Node 20+）
- pnpm（建议）或 npm

### 安装

```bash
pnpm install
```

### 配置环境变量

复制 `.env.example` 到 `.env`（不要提交 `.env`）。

```bash
cp .env.example .env
```

常用变量（见 `.env.example`）：

- `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`：Modal worker 调用
- `OPENROUTER_API_KEY` / `OPENROUTER_FREE_MODEL`：OpenRouter LLM
- `GEMINI_API_KEY` / `GOOGLE_API_KEY`：Gemini
- `DEEPSEEK_API_KEY`：DeepSeek
- `OPENAI_API_KEY` / `OPENAI_CHAT_MODEL`：OpenAI
- `NEXT_PUBLIC_TASK_API_URL`：可选，把任务 wait/stop 指向外部任务服务
- `NEXT_PUBLIC_FILE_BASE_URL`：可选，文件存储的 base URL

### 启动开发环境

```bash
pnpm dev
```

打开后会自动跳转到 `/workspace`。

## 开发与扩展（Adding a new node/feature）

（高层流程）

- **新增 feature**：编辑 `src/lib/feature-registry.ts`，添加 `name/type/function`
- **新增节点 UI**：在 `src/components/workspace/nodes/` 新建节点组件，并在节点 `workflowConfig.feature` 里引用 feature name
- **新增后端 handler**：
  - LLM/API：在 `src/handlers/`** 实现并注册
  - Modal：在 `modal/**` 写 Python 并 `modal deploy`，再补齐 `src/handlers/modal/configs.ts` 的映射

## License

This project is licensed under **GNU Affero General Public License v3.0 (AGPL-3.0-only)**.

- If you modify and run it as a network service, you must offer users the Corresponding Source of your modified version (see AGPL section 13).

