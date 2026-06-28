<div align="center">
  <img src="../public/logo.svg" alt="TongFlow" width="320" />

  <h1>TongFlow：开源多模态 GenAI 工作流工作室</h1>
  <p>
    <a href="https://github.com/tong-io/tongflow/stargazers"><img src="https://img.shields.io/github/stars/tong-io/tongflow?style=flat&logo=github" alt="GitHub Stars" /></a>
    <a href="https://github.com/tong-io/tongflow/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License" /></a>
    <a href="https://github.com/tong-io/tongflow/actions/workflows/ci.yml"><img src="https://github.com/tong-io/tongflow/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://pypi.org/project/tongflow/"><img src="https://img.shields.io/pypi/v/tongflow?logo=pypi&logoColor=white&label=Python%20SDK" alt="PyPI" /></a>
    <a href="https://discord.gg/K7V8az94Zf"><img src="https://img.shields.io/badge/Discord-加入-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
    <a href="https://github.com/tong-io/tongflow/releases"><img src="https://img.shields.io/github/v/release/tong-io/tongflow?logo=github" alt="最新版本" /></a>
  </p>
  <p>
    <video src="https://github.com/user-attachments/assets/407a7e7b-2d44-4c90-8016-33d0a9f5e7d5"></video>
  <p>
  <p>
    <a href="../README.md">English</a> · <strong>简体中文</strong> · <a href="README_JA.md">日本語</a>
  </p>
</div>

## Demo 示例

| 工作流截图 | 输出结果 |
| :--: | :--: |
| **基本** — 输入文本（添加），生成图像（转换），再融合成一张（组合）。<br/><img src="https://file.tongflow.com/public/demos/basic.png" width="620" alt="工作流" /> | <img src="https://file.tongflow.com/public/demos/basic_result.png" width="200" alt="结果" /> |
| **中级** — （添加主题 → 生成文案 → 生成语音） + （人物描述 → 生成图像） → 生成对口型视频 = 数字人口播。<br/><img src="https://file.tongflow.com/public/demos/digitalhuman.png" width="620" alt="工作流" /> | <video src="https://github.com/user-attachments/assets/a803394d-0ccf-4023-9b06-5c1581345758" width="200"></video> |
| **高级** — 生成歌词 + 生成歌曲 + 生成人物 + 生成场景 + 生成分镜 → 生成MV<br/><img src="https://file.tongflow.com/public/demos/mv.png" width="620" alt="工作流" /> | <video src="https://github.com/user-attachments/assets/2bc71e3c-3ed6-48b2-81e7-82ad5976d801" width="200"></video> |

用TongFlow借助生成式AI释放想创意！

## 快速开始

我们提供可直接运行的TongFlow**桌面版**。

### Step 1 — 安装桌面版

下载对应平台的安装包，安装并打开。

- **macOS（Apple Silicon — M1/M2/M3/M4）：** [TongFlow-mac-arm64.dmg](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-mac-arm64.dmg)
- **macOS（Intel）：** [TongFlow-mac-x64.dmg](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-mac-x64.dmg)
- **Windows：** [TongFlow-win-setup.exe](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-win-setup.exe)

全部版本见 [Releases](https://github.com/tong-io/tongflow/releases/latest) 页面。

> **macOS 用户注意：** 安装包暂未经过 Apple 公证，首次打开会被 Gatekeeper 拦截（提示"TongFlow 已损坏，无法打开"）。把 app 拖入「应用程序」后，在终端执行一次以下命令即可正常打开：
>
> ```bash
> xattr -cr /Applications/TongFlow.app
> ```
>
> 请直接从本页面下载安装包——通过微信等聊天工具转发的安装包可能被改名或重新打上隔离标记。

首次打开时，画布已预加载一个示例工作流——接下来几步把它准备到可运行状态。

### Step 2 — 安装插件

app 默认不预装任何插件。打开**插件管理器**（右上角的方块图标），按需安装。新装的插件即时可用，无需重启。

要运行预加载的**示例工作流**（文本 → 图像 → 融合 → 视频），需安装以下三个插件：

- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — 文本生图
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — 图像融合 / 混合
- [tongflow-modal-ltx](https://github.com/tong-io/tongflow-modal-ltx) — 图生视频

这些插件运行在 [Modal](https://modal.com) 上（每月最多 **$30** 免费 GPU 算力）。在**设置**里填入 `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`；可在 [modal.com/settings/tokens](https://modal.com/settings/tokens) 创建 token。任何其他平台都可以用同样方式发布自己的插件。

在插件管理器里可浏览完整目录——官方 API 插件（OpenAI / Gemini / OpenRouter）以及其他 GPU/CPU 插件。

### Step 3 — 配置凭据

打开**设置**（右上角齿轮图标），填入插件需要的环境变量——比如 API 插件用的 `OPENAI_API_KEY`，或 GPU/CPU 插件所需的凭据。

> **插件凭据都在「设置」里。** TongFlow 不绑定任何平台、不硬编码任何 provider：设置对话框是一个通用的环境变量 key/value 编辑器，传给插件使用。各插件需要哪些 key 由它自己的 README 说明。值保存在本地，改动即时生效、无需重启。

### Step 4 — 运行示例工作流

逐个节点执行预加载的示例，也可以切换到执行模式，点击运行按钮即可一键执行。

## 核心概念

- **全模型**: AI 模型可理解为**模态转换**（例如 LLM 是文本→文本，图像模型是文本→图像，语音模型是文本→音频等）。TongFlow 将每种能力封装为节点。

- **全模态**: TongFlow 支持 Web 上实际流通的几乎所有模态与文件格式。

- **低门槛，高可能性**: 无需学习复杂的AI参数，无需手动连接节点；只需**添加**、**转换**和**组合**三种操作，就能自由排列创意。同时，通过对AI模型的自由编排，可以生成独有的创意和作品。

- **开放生态**: TongFlow 基于插件的设计，使得每个平台都可以封装独立的插件，官方将对每个能力节点提供至少一个实现插件。核心精简，生态开放。

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
- ✅ **多图生视频**: 多图参考融合——若干参考图加文本生成全新视频。
- ✅ **视频理解**: 从视频生成摘要或描述。
- ✅ **视频超分**: 输出更高分辨率的视频。
- ✅ **提取首帧 / 尾帧**: 将帧提取为图片。
- ✅ **视频编辑**: 根据文本指令编辑视频。
- ✅ **去字幕**: 从视频中清除字幕。
- ✅ **去水印**: 从视频中去除水印。

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
- ✅ **换角色**: 视频 + 参考（场景融合 / 角色替换），Animate Mix 风格生成。
- ✅ **动作迁移**: 视频 + 参考（动作 / 重定向），Animate Move 风格生成。
- ✅ **文本合并**: 将多个文本节点合并为一个。

### 其他

- ✅ **图像 → 3D**: 从单张图像生成 3D 模型。
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

> 官方 GPU/CPU 插件目前运行在 [Modal](https://modal.com) 上——每月最多 **$30** 免费 GPU 算力（H100/A100 等）。`MODAL_TOKEN_*` 的配置见 [Step 2](#step-2--安装插件)。任何其他平台都可以用同样方式发布自己的插件。

### API 插件

- [tongflow-api-openrouter-free](https://github.com/tong-io/tongflow-api-openrouter-free) — 默认 `gen_text` 路由，使用 OpenRouter 免费模型
- [tongflow-api-gemini](https://github.com/tong-io/tongflow-api-gemini) — 基于 Google Gemini 的 `gen_text` 及多模态处理
- [tongflow-api-openai](https://github.com/tong-io/tongflow-api-openai) — 基于 OpenAI 的 `gen_text` 及图像生成 / 编辑 / 融合（`gpt-image-2`）
- [tongflow-api-bytedance](https://github.com/tong-io/tongflow-api-bytedance) — 基于火山方舟（豆包 Seedance 2.0）的 文 / 图 / 音 → 视频

### GPU/CPU 插件

- [tongflow-modal-ffmpeg](https://github.com/tong-io/tongflow-modal-ffmpeg) — 转码、混流、媒体处理管线
- [tongflow-modal-pyscenedetect](https://github.com/tong-io/tongflow-modal-pyscenedetect) — 镜头边界检测，用于分割片段
- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — Z-Image 文本生图
- [tongflow-modal-ernie-image](https://github.com/tong-io/tongflow-modal-ernie-image) — ERNIE Image 文本生图（备选）
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — FLUX.2 Klein 9B 多参考融合与图像编辑
- [tongflow-modal-ltx](https://github.com/tong-io/tongflow-modal-ltx) — LTX-2.3 文本 / 图像生视频
- [tongflow-modal-fastwan](https://github.com/tong-io/tongflow-modal-fastwan) — FastWan-QAD-FP8 极速文生视频（3 步蒸馏 Wan2.1-1.3B）
- [tongflow-modal-infinitetalk](https://github.com/tong-io/tongflow-modal-infinitetalk) — InfiniteTalk 音频驱动口型同步（音频 + 图片 / 视频 → 数字人视频）
- [tongflow-modal-wan-animate](https://github.com/tong-io/tongflow-modal-wan-animate) — Wan-Animate 换角色与动作迁移（视频 + 参考）
- [tongflow-modal-scail2](https://github.com/tong-io/tongflow-modal-scail2) — SCAIL-2 可控角色动画（角色图 + 驱动视频；与 wan-animate 相同的两个槽位）
- [tongflow-modal-bernini](https://github.com/tong-io/tongflow-modal-bernini) — Bernini-R 1.3B 统一视频渲染器（文/图 → 图/视频、视频编辑、去字幕 / 去水印）
- [tongflow-modal-triposplat](https://github.com/tong-io/tongflow-modal-triposplat) — TripoSplat 单图生成 3D 高斯泼溅
- [tongflow-modal-seedvr2](https://github.com/tong-io/tongflow-modal-seedvr2) — SeedVR2 图像 / 视频超分辨率
- [tongflow-modal-gemma4](https://github.com/tong-io/tongflow-modal-gemma4) — Gemma-4 多模态文本（图像 / 视频理解）
- [tongflow-modal-qwen3asr](https://github.com/tong-io/tongflow-modal-qwen3asr) — Qwen3 语音识别
- [tongflow-modal-qwen3tts](https://github.com/tong-io/tongflow-modal-qwen3tts) — Qwen3 文字转语音
- [tongflow-modal-whisper](https://github.com/tong-io/tongflow-modal-whisper) — Whisper 语音识别（带时间戳，备选）
- [tongflow-modal-ace-step](https://github.com/tong-io/tongflow-modal-ace-step) — ACE-Step 文本生音乐
- [tongflow-modal-docling](https://github.com/tong-io/tongflow-modal-docling) — Docling 文档 → 文本
- [tongflow-modal-paddle](https://github.com/tong-io/tongflow-modal-paddle) — PaddleOCR 文档 → 文本
- [tongflow-modal-unlimited-ocr](https://github.com/tong-io/tongflow-modal-unlimited-ocr) — Unlimited-OCR 长文档 / PDF → 文本
- [tongflow-modal-crawl4ai](https://github.com/tong-io/tongflow-modal-crawl4ai) — Crawl4AI URL / 链接 → 文本
- [tongflow-modal-scrapling](https://github.com/tong-io/tongflow-modal-scrapling) — Scrapling 隐身浏览器 URL / 链接 → 文本

## 从源代码启动

```bash
pnpm install
pnpm plugins:install   # 克隆官方插件到 plugins/
pnpm start:prod        # 先构建一次,再启动于 http://localhost:3000
```

需要 **Node**（含 `pnpm`）以及 `PATH` 上有一个 **Python 3.10+** 解释器（可用 `PYTHON` 指定具体的那个）。插件以本地 Python 进程运行；TongFlow 会自动为它们创建隔离的 venv，并在首次使用时安装各插件的 `requirements.txt`——无需手动配置 Python。

打开 **`http://localhost:3000`**，画布已就绪。插件的安装与配置同上面的 Step 2–4（凭据填在 app 内的**设置**对话框，或用项目 `.env`）。

## 用 Docker 启动

GHCR 上已发布自托管镜像——无需配置 Node/Python/pnpm：

```bash
docker run -d -p 3000:3000 \
  -v tongflow-data:/data -v tongflow-plugins:/plugins \
  ghcr.io/tong-io/tongflow:latest
```

然后打开 **`http://localhost:3000`**。或者用 Compose（会克隆本仓库的 [`docker-compose.yml`](../docker-compose.yml)）：

```bash
docker compose up -d
```

想自己构建镜像而不是拉取：`docker build -t tongflow .`

**数据与凭据。** 所有可写内容都存放在 `/data` 卷（SQLite 数据库、上传文件、设置）。API key 是可选的——在 app 内的**设置**对话框里填写，或在启动时传入（`-e OPENROUTER_API_KEY=…`）；支持的 key：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`、`OPENAI_API_KEY`、`MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`。

**插件。** 镜像不自带任何插件——请从 app 内的插件管理器安装（首次安装需要访问 GitHub 的网络）。首次运行时，插件会在 `/data/.tongflow/plugin-venv` 下创建一个共享的 Python venv（从 PyPI 安装 SDK 以及该插件的 `requirements.txt`），因此首次运行较慢且需要网络。基于 Modal 的插件还需要一个 Modal token。

## 自定义插件

画布上每一个能跑的节点，背后都是一份**契约**——ABI（[`config/tongflow.abi.json`](../config/tongflow.abi.json)），它定义「有哪些能力」以及「每个能力的输入输出长什么样」，而与「由谁实现」无关。一个插件就是一个小小的 Python 包，挑 ABI 里一个或多个槽，借助 tongflow Python SDK，用 ABI 生成的类型给出**怎么做**的那部分。

完整的开发流程——ABI、`@node_slot` 装饰器、SDK、目录结构以及如何发布，请见 **[docs/plugins.md](plugins.md)**。

## 社区

加入 **[Discord](https://discord.gg/K7V8az94Zf)** 或扫描下方**微信群**二维码。

<div>
  <img src="assets/qr.png" alt="微信群二维码" width="180" />
</div>

## 商务合作

商务合作请联系 business@tongflow.com。

- **开源模型 owner**：我可以集成你的模型，让用户流畅体验。
- **企业用户**：我可以协助在本地 GPU 上部署、构建定制节点和插件等。
- **平台 / 路由**：我可以接入你的 API。
- **VCs**：欢迎探讨在 [tongflow.com](https://tongflow.com) 云端 AI 工作室上的合作。

## 开源

如果你喜欢这个项目，在 GitHub 上 Star 一下非常有帮助，感谢！

<img src="assets/star.gif" alt="Star on GitHub" width="480" />

## 授权协议

TongFlow 采用 **双授权(dual-licensing)** 模式:

- **[AGPL-3.0](../LICENSE)** —— 对个人、研究、开源项目,以及愿意遵守 AGPL(含第 13 条
  网络/源码公开义务)的使用者**免费**。
- **[商业授权](../COMMERCIAL-LICENSE.md)** —— 面向希望在**闭源 / SaaS** 产品中使用
  TongFlow 且**不愿公开源码**,或需要保证条款与平台技术支持的组织。
  价格面议,联系 **business@tongflow.com**。

以上授权覆盖整个仓库,包括 `sdk/` 目录(发布到 PyPI 的 `tongflow` 包)。
贡献代码受 [CLA](../CLA.md) 约束。

## Star 历史

<a href="https://www.star-history.com/?repos=tong-io%2Ftongflow&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=tong-io/tongflow&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=tong-io/tongflow&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=tong-io/tongflow&type=date&legend=top-left" />
 </picture>
</a>
