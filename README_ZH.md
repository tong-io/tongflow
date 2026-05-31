<div align="center">
  <img src="public/logo.svg" alt="TongFlow" width="320" />

  <h1>开源的多模态 AIGC 无限画布</h1>
  <p>
    <a href="https://github.com/tong-io/tongflow/stargazers"><img src="https://img.shields.io/github/stars/tong-io/tongflow?style=flat&logo=github" alt="GitHub Stars" /></a>
    <a href="https://github.com/tong-io/tongflow/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License" /></a>
    <a href="https://github.com/tong-io/tongflow/actions/workflows/ci.yml"><img src="https://github.com/tong-io/tongflow/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://discord.gg/K7V8az94Zf"><img src="https://img.shields.io/badge/Discord-加入-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
    <a href="https://github.com/tong-io/tongflow/releases"><img src="https://img.shields.io/github/v/release/tong-io/tongflow?logo=github" alt="最新版本" /></a>
  </p>
</div>

**TongFlow** 是一款一站式 AIGC 创作工作室，帮助你端到端构建多模态生成式 AI 工作流。

<div align="center">
  <img src="docs/assets/cover.png" alt="TongFlow" />
</div>

## 核心理念

- **全模型**: AI 模型可理解为**模态转换**（例如 LLM 是文本→文本，图像模型是文本→图像，音乐模型是文本→音频等）。TongFlow 将每种能力封装为节点。

- **全模态**: 支持 Web 上实际流通的所有模态与格式。

- **简单易用**: 无复杂参数面板，无需手动连接节点；只需**添加**、**转换**和**组合**，自由排列创意。

- **开放插件生态**: 每个模型和能力都是独立版本的插件（`tongflow-modal-*` 为 GPU/CPU Worker，`tongflow-llm-*` 为 LLM 适配器），运行时按需安装。核心保持精简，生态持续扩张——任何人都可发布插件并出现在应用内市场。

## 应用场景

- **文本 → 图像 → 视频**: 生成图像，再将其转化为视频。
- **数字人**: 台词脚本 + 数字人形象。
- **电商图片**: 多图融合或产品图修图。
- **AI 音乐**: 从文本提示生成音乐。
- **AI 短剧 / 漫画**: 从描述生成故事或剧集。

用 TongFlow 释放想象力，借助生成式 AI 拓展你的创意边界！

## 快速开始

这是一款**本地优先**的应用：工作流与素材存储在 SQLite（`data/tongflow.db`），上传文件保存在磁盘（`data/uploads/`）。无需 TongFlow 账号、登录或中心化文件 CDN。AI 推理走**你配置的外部 API**：GPU/CPU 插件用 [Modal](https://modal.com)（**每月 $30 免费额度**，可用 H100 等云端 GPU/CPU），文本插件用 OpenRouter / Gemini / OpenAI 等供应商。

### Step 1 — 前置依赖

- **Node.js 20+** 与 **pnpm**
- **Git**（插件通过 clone 仓库安装）
- **Python 3 + Modal CLI**（`pip install modal`）—— GPU/CPU 插件首次调用时，服务端会子进程执行 `modal deploy` / `modal run download`

### Step 2 — 拉取代码并启动

#### 方式 A）本地开发

```bash
pnpm install
pnpm dev
```

#### 方式 B）Docker

运行发布到 [GHCR](https://github.com/tong-io/tongflow/pkgs/container/tongflow) 的预构建镜像（CI 在 `main` 分支推送时发布标签 `latest` / `main`，版本标签 `v*` 同步发布）：

```bash
docker pull ghcr.io/tong-io/tongflow:latest
docker run --rm -p 3000:3000 --env-file .env -v tongflow_data:/app/data ghcr.io/tong-io/tongflow:latest
```

或基于仓库内的 `Dockerfile` 自行构建：

```bash
docker build -t tongflow .
docker run --rm -p 3000:3000 --env-file .env -v tongflow_data:/app/data tongflow
```

> ⚠️ Docker 镜像**未**内置 Python + Modal CLI，因此容器内无法自动部署 Modal 插件。若需用 GPU/CPU 插件，请走方式 A，或先在装有 `modal` 的主机上预部署。

两种方式启动后都落到 `http://localhost:3000/workspace`。数据持久化在 `data/`（SQLite + 上传文件），Docker 镜像则存于 `tongflow_data` Volume 内。

### Step 3 — 配置 `.env`

将 [`.env.example`](.env.example) 复制为 `.env`，按需填 Key。UI 不依赖 Key 即可加载，但任何执行类节点都需要至少一个供应商配置好。

- `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` —— 任何 `tongflow-modal-*` 插件必需
- `OPENROUTER_API_KEY`（可选 `OPENROUTER_FREE_MODEL`、`OPENROUTER_HTTP_REFERER`、`OPENROUTER_APP_TITLE`）—— 默认**生成文本**节点走 OpenRouter 免费路由
- `GEMINI_API_KEY` 或 `GOOGLE_API_KEY` —— 基于 Gemini 的 `gen_text` 及其他 Gemini 多模态处理
- `OPENAI_API_KEY`（可选 `OPENAI_CHAT_MODEL`，默认 `gpt-4o-mini`）—— 基于 OpenAI 的 `gen_text`
- `DEEPSEEK_API_KEY` —— 可选；批量**排列 / 分组**逻辑的备选 LLM
- `NEXT_PUBLIC_FILE_BASE_URL` —— 可选；文件 Base URL

Modal 交互式登录（Token 写入 `~/.modal.toml`）：

```bash
pnpm modal:setup
```

### Step 4 — 安装插件

`plugins/` 目录是 **gitignored 且首次启动为空** —— UI 能加载，但任何 transform / compose / decompose 节点在装好插件前都跑不了。详见 [docs/plugins.md](docs/plugins.md)。

两种安装方式：

**a）应用内市场** —— 打开 `http://localhost:3000/plugins`，挑选要用的插件并点击安装。服务端会把每个插件 `git clone` 到 `plugins/<plugin-id>/`。

**b）手动 clone** —— 官方插件清单见下方 [官方插件](#官方插件)：

```bash
git clone https://github.com/tong-io/tongflow-modal-z-image.git plugins/tongflow-modal-z-image
git clone https://github.com/tong-io/tongflow-llm-openrouter-free.git plugins/tongflow-llm-openrouter-free
# …按需重复
```

下次页面加载时扫描器会自动识别新插件。

### Step 5 — 跑节点

首次执行某个 Modal 插件节点时，服务端会自动执行 `modal deploy plugins/<id>/deploy.py`（若插件带模型权重，还会 `modal run plugins/<id>/download.py::download`）。结果有缓存，后续直接调用已部署的 Worker。LLM 插件（`tongflow-llm-*`）无需部署，按你配置的 Key 直接调供应商 API。

## 已实现功能

> ✅ = 开箱即用（已有官方插件）· ⬜ = 画布中已有节点，但暂无官方插件（规划中）。

### 添加

- ✅ **文本输入**: 输入文字并添加文本节点。
- ✅ **添加图片**: 选择本地文件并添加图片节点。
- ✅ **拍照**: 用设备摄像头拍摄并添加图片节点。
- ✅ **添加草图**: 在画布上绘制并添加图片节点。
- ✅ **添加音频**: 选择本地音频文件并添加音频节点。
- ✅ **录音**: 用麦克风录音并添加音频节点。
- ✅ **添加视频**: 选择本地视频文件并添加视频节点。
- ✅ **录制视频**: 用摄像头录制并添加视频节点。
- ✅ **添加文档**: 选择本地文件并添加文档节点。
- ✅ **添加链接**: 从链接抓取页面，添加文本、图片、音频或视频节点。
- ✅ **添加 3D 模型**: 选择本地模型文件并添加 3D 模型节点。

### 转换

#### 文本

- ✅ **生成 / 改写**: 根据提示创建或编辑文案。

#### 图像

- ✅ **图像生成**: 从文本生成图像。
- ✅ **图像编辑**: 局部重绘、编辑或按指令重画。
- ✅ **图像理解**: 从图像生成描述、问答或说明。
- ✅ **图像超分**: 放大以获得更清晰的细节。

#### 视频

- ✅ **视频生成**: 从文本生成视频。
- ✅ **图生视频**: 将静态图像动态化。
- ✅ **首尾帧视频**: 用两张关键帧插值生成片段。
- ✅ **视频理解**: 从视频生成摘要或描述。
- ✅ **视频超分**: 输出更高分辨率的视频。
- ✅ **提取首帧 / 尾帧**: 将帧提取为图片。
- ⬜ **去字幕**: 从视频中清除字幕。
- ⬜ **去水印**: 从视频中去除水印。

#### 音频

- ✅ **音乐生成**: 从文本生成音乐。
- ✅ **语音合成**: 文字转语音——预设风格、声音克隆（参考音频）或指令驱动。
- ✅ **语音识别**: 转录音频或视频中的语音。
- ⬜ **降噪**: 对音频降噪处理。
- ⬜ **说话人分离**: 按说话人分离音频。
- ⬜ **音色转换**: 使用参考样本替换或克隆音色。
- ⬜ **多轨 / 人声伴奏分离**

### 组合

- ✅ **图像融合**: 将多张参考图融合或编辑为一张图。
- ✅ **口型同步**: 音频 + 视频 → 视频（口型同步）；也支持音频 + 图片 → 视频、音频 + 文本 → 视频等变体。
- ⬜ **声音克隆合成**: 文本 + 参考音频 → 克隆指定音色的语音（上方**语音合成 → 声音克隆**节点已覆盖该能力）。
- ✅ **换角色**: 视频 + 参考（场景融合 / 角色替换），Animate Mix 风格生成。
- ✅ **动作迁移**: 视频 + 参考（动作 / 重定向），Animate Move 风格生成。
- ✅ **文本合并**: 将多个文本节点合并为一个。

### 其他

- ⬜ **图像 → 3D**: 从单张图像生成 3D 模型。
- ✅ **文档 → 文本**: 从文档中提取纯文本。
- ✅ **链接 → 文本**: 将页面内容转换为文本。

### 辅助工具

- ✅ **拼接片段**: 将多个视频首尾相接。
- ✅ **音视频合并**: 合并为单个文件。
- ✅ **按镜头分割**: 按场景将长视频切分。
- ✅ **拆分音视频**: 将视频解封装为独立的视频轨和音频轨。
- ✅ **提取音轨**: 将音频单独导出为资源。
- ✅ **分割长文本**: 将长段落拆分为块。
- ✅ **合并 / 整理文本块**: 合并片段（可使用自动合并选项）。
- ✅ **过滤 / 丢弃片段**: 按规则或手动选择丢弃不需要的片段。
- ✅ **排列与批量分组**: 对文本或片段批次进行分组排列，供下游处理使用。

## 官方插件

TongFlow 采用**插件生态**：所有模型 / 能力都是独立版本的包——Modal GPU/CPU Worker 为 `tongflow-modal-*`，LLM API 适配器为 `tongflow-llm-*`。它们托管在 GitHub 的 [tong-io](https://github.com/tong-io) 组织及 PyPI 上，运行时安装到 gitignored 的 `plugins/` 目录（通过应用内 `/plugins` 市场或直接 `git clone`），扫描器在下次启动时自动识别。详见 [docs/plugins.md](docs/plugins.md)。第三方可以同样的方式发布自己的插件。

下方列出的是随本仓库一同维护的官方插件。

### LLM（文本生成）插件

- [tongflow-llm-openrouter-free](https://github.com/tong-io/tongflow-llm-openrouter-free) — 默认 `gen_text` 路由，使用 OpenRouter 免费模型
- [tongflow-llm-gemini](https://github.com/tong-io/tongflow-llm-gemini) — 基于 Google Gemini 的 `gen_text` 及多模态处理
- [tongflow-llm-openai](https://github.com/tong-io/tongflow-llm-openai) — 基于 OpenAI 的 `gen_text`

### Modal（GPU/CPU）插件

- [tongflow-modal-ffmpeg](https://github.com/tong-io/tongflow-modal-ffmpeg) — 转码、混流、媒体处理管线
- [tongflow-modal-pyscenedetect](https://github.com/tong-io/tongflow-modal-pyscenedetect) — 镜头边界检测，用于分割片段
- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — Z-Image 文本生图
- [tongflow-modal-ernie-image](https://github.com/tong-io/tongflow-modal-ernie-image) — ERNIE Image 文本生图（备选）
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — FLUX.2 Klein 9B 多参考融合与图像编辑
- [tongflow-modal-ltx](https://github.com/tong-io/tongflow-modal-ltx) — LTX-2.3 文本 / 图像生视频
- [tongflow-modal-infinitetalk](https://github.com/tong-io/tongflow-modal-infinitetalk) — InfiniteTalk 音频驱动口型同步（音频 + 视频 → 数字人视频）
- [tongflow-modal-wan-animate](https://github.com/tong-io/tongflow-modal-wan-animate) — Wan-Animate 换角色与动作迁移（视频 + 参考）
- [tongflow-modal-seedvr2](https://github.com/tong-io/tongflow-modal-seedvr2) — SeedVR2 图像 / 视频超分辨率
- [tongflow-modal-color-fix-lab](https://github.com/tong-io/tongflow-modal-color-fix-lab) — 图像 / 视频超分辨率（备选）
- [tongflow-modal-gemma4](https://github.com/tong-io/tongflow-modal-gemma4) — Gemma-4 多模态文本（图像 / 视频理解）
- [tongflow-modal-qwen3asr](https://github.com/tong-io/tongflow-modal-qwen3asr) — Qwen3 语音识别
- [tongflow-modal-qwen3tts](https://github.com/tong-io/tongflow-modal-qwen3tts) — Qwen3 文字转语音
- [tongflow-modal-whisper](https://github.com/tong-io/tongflow-modal-whisper) — Whisper 语音识别（带时间戳，备选）
- [tongflow-modal-ace-step](https://github.com/tong-io/tongflow-modal-ace-step) — ACE-Step 文本生音乐
- [tongflow-modal-docling](https://github.com/tong-io/tongflow-modal-docling) — Docling 文档 → 文本
- [tongflow-modal-paddle](https://github.com/tong-io/tongflow-modal-paddle) — PaddleOCR 文档 → 文本
- [tongflow-modal-crawl4ai](https://github.com/tong-io/tongflow-modal-crawl4ai) — Crawl4AI URL / 链接 → 文本

## 联系我们

**社区：** 加入 **[Discord](https://discord.gg/K7V8az94Zf)** 或扫描下方**微信群**二维码。

<div>
  <img src="docs/assets/qr.png" alt="微信群二维码" width="180" />
</div>

**商务合作：** 请联系 business@tongflow.com，我会尽快回复。

- **开源模型发布者**：我可以集成你的模型，让用户流畅体验。
- **企业用户**：我可以协助在本地 GPU 上部署、构建定制节点等。
- **API 供应商 / 路由**：我可以接入你的 API。
- **投资方**：欢迎探讨在 tongflow.com 云端 AI 工作室上的合作。

## 开源

如果你喜欢这个项目，在 GitHub 上 Star 一下非常有帮助，感谢！

<div align="center">
  <img src="docs/assets/star.gif" alt="Star on GitHub" />
</div>

## 赞助

TongFlow 在开放环境中开发。如果你的团队依赖它,或愿意支持项目持续迭代,
欢迎**[赞助](SPONSORS.md)** —— 赞助资助维护工作,并可在此展示你的 logo、获得鸣谢
与优先反馈。

> 赞助是支持与合作,**不是授权** —— 它**不会**免除 AGPL 义务。若要在闭源 / SaaS
> 产品中使用 TongFlow,请见下方[授权协议](#授权协议)。洽询:**business@tongflow.com**。

## 授权协议

TongFlow 采用 **双授权(dual-licensing)** 模式:

- **[AGPL-3.0](LICENSE)** —— 对个人、研究、开源项目,以及愿意遵守 AGPL(含第 13 条
  网络/源码公开义务)的使用者**免费**。
- **[商业授权](COMMERCIAL-LICENSE.md)** —— 面向希望在**闭源 / SaaS** 产品中使用
  TongFlow 且**不愿公开源码**,或需要保证条款与平台技术支持的组织。
  价格面议,联系 **business@tongflow.com**。

`sdk/` 目录(发布到 PyPI 的 `tongflow` 包)单独以 **[Apache-2.0](sdk/LICENSE)**
授权,使第三方插件不受 copyleft 约束。贡献代码受 [CLA](CLA.md) 约束。

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=tong-io/tongflow&type=Date)](https://star-history.com/#tong-io/tongflow&Date)
