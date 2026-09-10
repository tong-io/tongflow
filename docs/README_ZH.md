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

TongFlow **桌面版**是一个轻量（约 10 MB）的壳应用，直接加载云端工作室 **[app.tongflow.com](https://app.tongflow.com)** ——安装、登录，即可开始创作。云端工作室也可以直接在浏览器里打开。

### Step 1 — 安装桌面版

下载对应平台的安装包，安装并打开。

- **macOS（Universal — Apple Silicon 和 Intel 通用）：** [TongFlow-mac-universal.dmg](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-mac-universal.dmg)
- **Windows：** [TongFlow-win-x64.msi](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-win-x64.msi)

全部版本见 [Releases](https://github.com/tong-io/tongflow/releases/latest) 页面。

> **macOS 用户注意：** 安装包暂未经过 Apple 公证，首次打开会被 Gatekeeper 拦截（提示"TongFlow 已损坏，无法打开"）。把 app 拖入「应用程序」后，在终端执行一次以下命令即可正常打开：
>
> ```bash
> xattr -cr /Applications/TongFlow.app
> ```
>
> 请直接从本页面下载安装包——通过微信等聊天工具转发的安装包可能被改名或重新打上隔离标记。

### Step 2 — 登录并开始创作

用 Google 或微信登录即可开始创作——插件与执行都由云端托管。

> **想要完全本地、无需账号的 TongFlow？** 请使用自托管——参见[从源代码启动](#从源代码启动)或[用 Docker 启动](#用-docker-启动)，然后按照[自托管配置](#自托管配置插件与凭据)完成设置。（v0.1.13 及之前的桌面版内置了完整本地运行时，安装包仍保留在 [Releases](https://github.com/tong-io/tongflow/releases) 页面。）

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
- ✅ **姿态检测**: 308 关键点全身骨架叠加（身体、双手、脸部）。
- ✅ **人体部位分割**: 29 类人体解析叠加图。
- ✅ **表面法线**: 逐像素法线图——人物特写或整幅场景均可。
- ✅ **前景抠图**: 将人物或显著主体抠为透明 PNG。

#### 视频

- ✅ **视频生成**: 从文本生成视频。
- ✅ **图生视频**: 将静态图像动态化。
- ✅ **首尾帧视频**: 用两张关键帧插值生成片段。
- ✅ **多图生视频**: 多图参考融合——若干参考图加文本生成全新视频。
- ✅ **全模态参考生视频**: 图、视频、音频参考混搭（加文本），一次生成自带立体声的视频。
- ✅ **视频理解**: 从视频生成摘要或描述。
- ✅ **视频超分**: 输出更高分辨率的视频。
- ✅ **提取首帧 / 尾帧**: 将帧提取为图片。
- ✅ **视频编辑**: 根据文本指令编辑视频。
- ✅ **去字幕**: 从视频中清除字幕。
- ✅ **去水印**: 从视频中去除水印。

#### 音频

- ✅ **音乐生成**: 从文本生成音乐，可选参考音频引导。
- ✅ **音频理解**: 用文字描述一段音频（音乐 / 语音 / 环境音）。
- ✅ **音乐重绘**: 重新生成歌曲中指定的时间段。
- ✅ **音乐翻唱**: 按描述或参考曲目改编歌曲风格。
- ✅ **加轨 / 补全编曲**: 在现有音乐上生成新乐轨，或补全缺失的声部。
- ✅ **音乐企划**: 一句话灵感 → 歌词、风格标签、BPM、调式、时长。
- ✅ **语音合成**: 文字转语音——预设风格、声音克隆（参考音频）或指令驱动。
- ✅ **语音识别**: 转录音频或视频中的语音。
- ✅ **降噪**: 对音频降噪处理。
- ✅ **说话人分离**: 按说话人分离音频。
- ⬜ **音色转换**: 使用参考样本替换或克隆音色。
- ✅ **多轨 / 人声伴奏分离**: 分离人声、鼓、贝斯、吉他等 12 种乐轨。
- ✅ **开放词汇声音分离**: 用一句话描述任意声音（“狗叫”），把它和其余声音拆成两轨。

### 组合

- ✅ **图像融合**: 将多张参考图融合或编辑为一张图。
- ✅ **口型同步**: 音频 + 视频 → 视频（口型同步）；也支持音频 + 图片 → 视频、音频 + 文本 → 视频等变体。
- ✅ **情感语音**: 文本 + 参考音色 → 用该音色朗读，支持情感控制。
- ✅ **换角色**: 视频 + 参考（场景融合 / 角色替换），Animate Mix 风格生成。
- ✅ **动作迁移**: 视频 + 参考（动作 / 重定向），Animate Move 风格生成。
- ✅ **文本合并**: 将多个文本节点合并为一个。

### 其他

- ✅ **图像 → 3D**: 从单张图像生成 3D 模型。
- ✅ **视频 → 动作捕捉**: 单目视频转骨骼动画（身体 + 手指 + 表情通道，GLB）。
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

> 官方 GPU/CPU 插件目前运行在 [Modal](https://modal.com) 上——每月最多 **$30** 免费 GPU 算力（H100/A100 等）。`MODAL_TOKEN_*` 的配置见[自托管配置](#自托管配置插件与凭据)。任何其他平台都可以用同样方式发布自己的插件。

### API 插件

一线厂商（各自发布自研模型）：

- [tongflow-api-gemini](https://github.com/tong-io/tongflow-api-gemini) — Google Gemini，按节点**模型选择**：文本、视觉、图像（Nano Banana / Imagen 4）、Veo 视频、TTS 与转写
- [tongflow-api-openai](https://github.com/tong-io/tongflow-api-openai) — OpenAI，按节点**模型选择**：`gen_text`、图像生成/编辑/融合（`gpt-image-2`）、视觉、文档 OCR、Whisper 转写与 TTS
- [tongflow-api-deepseek](https://github.com/tong-io/tongflow-api-deepseek) — 基于 DeepSeek V4（`flash` / `pro`，带流式**思考**气泡）的 `gen_text` 及文本工具
- [tongflow-api-bytedance](https://github.com/tong-io/tongflow-api-bytedance) — 火山方舟，按节点**模型选择**：豆包文本与视觉、Seedream 图像生成/编辑/融合、Seedance 文 / 图 / 音 → 视频
- [tongflow-api-xai](https://github.com/tong-io/tongflow-api-xai) — xAI Grok，按节点**模型选择**：`gen_text`（Grok 4.x）、图像理解、Grok Imagine 文生图
- [tongflow-api-runway](https://github.com/tong-io/tongflow-api-runway) — Runway Dev 统一 API，按节点**模型选择**：视频（Gen-4.5、Gen-4 Turbo、Aleph 编辑、Act-Two、Seedance、Veo）、图像（GPT Image 2、Seedream 5、Gemini image 3）与 ElevenLabs TTS

### 中转 / 聚合插件

一个 key 转发多家厂商模型：

- [tongflow-router-openrouter](https://github.com/tong-io/tongflow-router-openrouter) — OpenRouter，按节点**模型选择**：`gen_text`（默认免费，另可选 GPT-5.5 / Claude / Gemini / Grok / DeepSeek）、视觉 / 音频理解、图像生成/编辑与转写
- [tongflow-router-cometapi](https://github.com/tong-io/tongflow-router-cometapi) — CometAPI 聚合网关，按节点**模型选择**并**实时拉取 CometAPI 模型目录**：`gen_text` / 文本工具（GPT-5.5、Claude、Gemini、DeepSeek、Grok、Qwen、Kimi）、图像 / 视频 / 音频理解、图像生成/编辑/融合（GPT Image 2、Seedream）、文 / 图 → 视频（Sora 2、Veo 3.1、Seedance、Wan、MiniMax、HappyHorse、Vidu）、视频编辑（Omni）、TTS 与 Whisper 转写
- [tongflow-router-toapis](https://github.com/tong-io/tongflow-router-toapis) — ToAPIs 聚合网关，按节点**模型选择**：`gen_text` / 文本工具（GPT-5.6、Claude、Gemini、DeepSeek、Qwen、GLM、Kimi、MiniMax）、图像理解、图像生成/编辑/融合（GPT Image 2、Seedream 5、Gemini Image、Flux 2、Grok）、文 / 图 / 首尾帧 / 多模态参考 → 视频（Sora 2、Veo 3.1、Seedance 2、Kling、MiniMax H3、Wan、HappyHorse、Vidu）、视频编辑（HappyHorse），并**实时拉取当前 key 的模型列表**
- [tongflow-router-apimart](https://github.com/tong-io/tongflow-router-apimart) — APIMart 聚合网关，支持节点上**按模型选择**：图像生成 / 编辑（Z-Image、Seedream、Nano Banana、GPT-Image）、文 / 图 → 视频（可灵、VEO3、Sora2、Seedance）、`gen_text`（GPT-5、Claude、Gemini）、Whisper 转录与 TTS
- [tongflow-router-replicate](https://github.com/tong-io/tongflow-router-replicate) — Replicate，按节点**模型选择**覆盖全目录：文本、视觉、图像 生成/编辑/融合/放大/抠图、文 / 图 → 视频、转写、TTS / 声音克隆、音乐、图 → 3D（FLUX、Seedream、Veo、Kling、Whisper、Hunyuan3D…）
- [tongflow-router-fal](https://github.com/tong-io/tongflow-router-fal) — fal.ai，按节点**模型选择**：图像（生成/编辑/融合/放大/抠图/姿态/法线/分割）、视频（文 / 图 → 视频、首尾帧、说话头、唇同步、放大）、音频（转写、TTS、声音克隆、音乐、声源分离）与 图 → 3D

### GPU/CPU 插件

- [tongflow-modal-ffmpeg](https://github.com/tong-io/tongflow-modal-ffmpeg) — 转码、混流、媒体处理管线
- [tongflow-modal-pyscenedetect](https://github.com/tong-io/tongflow-modal-pyscenedetect) — 镜头边界检测，用于分割片段
- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — Z-Image 文本生图
- [tongflow-modal-ernie-image](https://github.com/tong-io/tongflow-modal-ernie-image) — ERNIE Image 文本生图（备选）
- [tongflow-modal-krea2](https://github.com/tong-io/tongflow-modal-krea2) — Krea 2 Turbo 文本生图（开源 12B，8 步蒸馏，最高 2K）
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — FLUX.2 Klein 9B 多参考融合与图像编辑
- [tongflow-modal-qwen-image-edit](https://github.com/tong-io/tongflow-modal-qwen-image-edit) — Qwen-Image-Edit-2511 指令式图像编辑与多图融合（无头 ComfyUI，fp8 + 8 步）
- [tongflow-modal-boogu](https://github.com/tong-io/tongflow-modal-boogu) — Boogu-Image-0.1（fp8）文本生图（密集中英文字）与单图编辑
- [tongflow-modal-infinitetalk](https://github.com/tong-io/tongflow-modal-infinitetalk) — InfiniteTalk 音频驱动口型同步（音频 + 图片 / 视频 → 数字人视频）
- [tongflow-modal-wan-animate](https://github.com/tong-io/tongflow-modal-wan-animate) — Wan-Animate 换角色与动作迁移（视频 + 参考）
- [tongflow-modal-scail2](https://github.com/tong-io/tongflow-modal-scail2) — SCAIL-2 可控角色动画（角色图 + 驱动视频；与 wan-animate 相同的两个槽位）
- [tongflow-modal-minimax-h3](https://github.com/tong-io/tongflow-modal-minimax-h3) — MiniMax-H3 33B 视频生成，原生立体声（文生 / 首尾帧 / 多图 / 全模态参考）
- [tongflow-modal-bernini](https://github.com/tong-io/tongflow-modal-bernini) — Bernini-R 1.3B 统一视频渲染器（文/图 → 图/视频、视频编辑、去字幕 / 去水印）
- [tongflow-modal-sam3](https://github.com/tong-io/tongflow-modal-sam3) — SAM 3 / SAM 3.1 文本引导抠像：按描述抠出图像中某概念的全部实例（透明 PNG），或在视频中全程跟踪（绿幕输出）
- [tongflow-modal-triposplat](https://github.com/tong-io/tongflow-modal-triposplat) — TripoSplat 单图生成 3D 高斯泼溅
- [tongflow-modal-sam-3d-objects](https://github.com/tong-io/tongflow-modal-sam-3d-objects) — SAM 3D Objects 单图重建前景物体 3D 高斯泼溅（自动抠前景，抗遮挡；备选）
- [tongflow-modal-sam-3d-body](https://github.com/tong-io/tongflow-modal-sam-3d-body) — SAM 3D Body 单图重建全身人体 3D 网格 GLB（多人、MHR 骨骼；备选），以及**视频动作捕捉**（逐帧回归 MHR → 角色动画 GLB；备选）
- [tongflow-modal-sapiens2](https://github.com/tong-io/tongflow-modal-sapiens2) — Sapiens2（Meta）人体套件：姿态检测、人体部位分割、表面法线、人像抠图、图像 → 3D 点云，以及**视频动作捕捉**（几何引擎：关键点 + pointmap → MHR 角色动画 GLB）
- [tongflow-modal-sensenova-vision](https://github.com/tong-io/tongflow-modal-sensenova-vision) — SenseNova-Vision（商汤）统一视觉模型：图像理解 / 看图问答、检测与 OCR 结构化文本、全场景表面法线、显著主体抠图、人体姿态叠加（备选）
- [tongflow-modal-seedvr2](https://github.com/tong-io/tongflow-modal-seedvr2) — SeedVR2 图像 / 视频超分辨率
- [tongflow-modal-gemma4](https://github.com/tong-io/tongflow-modal-gemma4) — Gemma-4 多模态文本（图像 / 视频理解）
- [tongflow-modal-qwen38](https://github.com/tong-io/tongflow-modal-qwen38) — Qwen3.8-27B 多模态文本（文本生成、图像 / 视频理解；备选）
- [tongflow-modal-spark-x25](https://github.com/tong-io/tongflow-modal-spark-x25) — 星火 Spark-X2.5-4B（讯飞）端侧模型，原生 1M 上下文：文本生成 / 合并文本（纯文本；备选）
- [tongflow-modal-qwen3asr](https://github.com/tong-io/tongflow-modal-qwen3asr) — Qwen3 语音识别
- [tongflow-modal-qwen3tts](https://github.com/tong-io/tongflow-modal-qwen3tts) — Qwen3 文字转语音
- [tongflow-modal-indextts2](https://github.com/tong-io/tongflow-modal-indextts2) — IndexTTS-2.5 情感文字转语音：零样本声音克隆（备选）+ 参考音色的情感语音合成
- [tongflow-modal-whisper](https://github.com/tong-io/tongflow-modal-whisper) — Whisper 语音识别（带时间戳，备选）
- [tongflow-modal-moss-transcribe-diarize](https://github.com/tong-io/tongflow-modal-moss-transcribe-diarize) — MOSS-Transcribe-Diarize 0.9B：长音频多人转写，一次出时间戳与说话人标签，并按说话人切出独立音轨（50+ 语言，最长约 90 分钟）
- [tongflow-modal-ace-step](https://github.com/tong-io/tongflow-modal-ace-step) — ACE-Step 1.5 音乐全家桶：文本生音乐（sft / base / turbo 可选）、重绘、翻唱、分轨提取、加轨、补全编曲、音乐企划与音乐理解
- [tongflow-modal-levo](https://github.com/tong-io/tongflow-modal-levo) — LeVo 2 / SongGeneration 文本生音乐（多语言、商用级）
- [tongflow-modal-minimax-music3](https://github.com/tong-io/tongflow-modal-minimax-music3) — MiniMax-Music3 11B 歌曲生成：歌词 + 描述 → 带人声完整歌曲（最长约 5 分钟，32 kHz 立体声）
- [tongflow-modal-sam-audio](https://github.com/tong-io/tongflow-modal-sam-audio) — SAM-Audio 文本提示声音分离：降噪、人声分离、按自由描述提取任意声音（“背景里的钢琴”）
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

打开 **`http://localhost:3000`**，画布已就绪。然后按照[自托管配置](#自托管配置插件与凭据)完成设置（凭据填在 app 内的**设置**对话框，或用项目 `.env`）。

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

## 自托管配置（插件与凭据）

自托管的 TongFlow 默认不预装任何插件，画布已预加载一个示例工作流。三步即可跑起来：

### 1 — 安装插件

打开**插件管理器**（右上角的方块图标），按需安装。新装的插件即时可用，无需重启。

要运行预加载的**示例工作流**（文本 → 图像 → 融合 → 视频），需安装以下三个插件：

- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — 文本生图
- [tongflow-modal-qwen-image-edit](https://github.com/tong-io/tongflow-modal-qwen-image-edit) — 图像融合 / 混合
- [tongflow-modal-minimax-h3](https://github.com/tong-io/tongflow-modal-minimax-h3) — 图生视频

这些插件运行在 [Modal](https://modal.com) 上（每月最多 **$30** 免费 GPU 算力）。在**设置**里填入 `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`；可在 [modal.com/settings/tokens](https://modal.com/settings/tokens) 创建 token。任何其他平台都可以用同样方式发布自己的插件。

在插件管理器里可浏览完整目录——官方 API 插件（OpenAI / Gemini / OpenRouter）以及其他 GPU/CPU 插件。

### 2 — 配置凭据

打开**设置**（右上角齿轮图标），填入插件需要的环境变量——比如 API 插件用的 `OPENAI_API_KEY`，或 GPU/CPU 插件所需的凭据。

> **插件凭据都在「设置」里。** TongFlow 不绑定任何平台、不硬编码任何 provider：设置对话框是一个通用的环境变量 key/value 编辑器，传给插件使用。各插件需要哪些 key 由它自己的 README 说明。值保存在本地，改动即时生效、无需重启。

### 3 — 运行示例工作流

逐个节点执行预加载的示例，也可以切换到执行模式，点击运行按钮即可一键执行。

## 装进你自己的 agent（dsh 插件）

TongFlow 也可以**跑在你自己的 agent 里**，作为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件——不用装桌面 app，也不用自己起服务：

```sh
npx @deepseek-ai/dsh@next plugin --profile web add dsh-tongflow
npx @deepseek-ai/dsh@next web
```

然后开一个会话，**第一条消息以 `@tongflow` 开头**。这个会话就变成 Studio——聊天、项目的文件树、预览 / 编辑器 / 画布，加一个运行记录抽屉——agent 也就拿到了 TongFlow 的那套工具。其他会话还是原来的 dsh，不受影响。

分工是这么设计的：agent 负责搭项目、把计划、设定和提示词写成普通文件；TongFlow 负责生成，而每一个生成出来的东西都来自一个存好的 `.tongflow.json` 工作流，就放在它的产物旁边——所以你随时可以在画布上打开它、改一改、再跑一遍。这里没有「生成一张图」这种工具，也没有项目模板。插件首次使用时会自己建 Python venv 并克隆官方插件，画布上的节点和插件目录跟线上版一样全。

环境要求和配置项见 **[packages/dsh-tongflow/README.md](../packages/dsh-tongflow/README.md)**。

## 自定义插件

画布上每一个能跑的节点，背后都是一份**契约**——ABI（[`packages/tongflow/abi/tongflow.abi.json`](../packages/tongflow/abi/tongflow.abi.json)），它定义「有哪些能力」以及「每个能力的输入输出长什么样」，而与「由谁实现」无关。一个插件就是一个小小的 Python 包，挑 ABI 里一个或多个槽，借助 tongflow Python SDK，用 ABI 生成的类型给出**怎么做**的那部分。

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
