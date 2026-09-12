<div align="center">
  <img src="../public/logo.svg" alt="TongFlow" width="320" />

  <h1>TongFlow — オープンソースの Modality-First GenAI プラットフォーム</h1>
  <p>
    <a href="https://github.com/tong-io/tongflow/stargazers"><img src="https://img.shields.io/github/stars/tong-io/tongflow?style=flat&logo=github" alt="GitHub Stars" /></a>
    <a href="https://github.com/tong-io/tongflow/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License" /></a>
    <a href="https://github.com/tong-io/tongflow/actions/workflows/ci.yml"><img src="https://github.com/tong-io/tongflow/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://pypi.org/project/tongflow/"><img src="https://img.shields.io/pypi/v/tongflow?logo=pypi&logoColor=white&label=Python%20SDK" alt="PyPI" /></a>
    <a href="https://discord.gg/K7V8az94Zf"><img src="https://img.shields.io/badge/Discord-参加-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
    <a href="https://github.com/tong-io/tongflow/releases"><img src="https://img.shields.io/github/v/release/tong-io/tongflow?logo=github" alt="最新リリース" /></a>
  </p>
  <p>
    <video src="https://github.com/user-attachments/assets/407a7e7b-2d44-4c90-8016-33d0a9f5e7d5"></video>
  <p>
  <p>
    <a href="../README.md">English</a> · <a href="README_ZH.md">简体中文</a> · <strong>日本語</strong>
  </p>
</div>

**テキストも、音声も、その先も。ひとつのワークフローに。**

テキスト、画像、音声、動画、3D。どんな処理をつなぎ、何を作るかは、あなた次第。各ステップで使うモデルも選べます。得られた結果は、そのまま次のデータになります。

オープンソース · モデルを選べる · セルフホスト対応 · [tongflow.com](https://www.tongflow.com/ja) · [キャンバスを開く](https://app.tongflow.com)

## Demo デモ

| ワークフローのスクリーンショット | 出力結果 |
| :--: | :--: |
| **基本** — テキストを入力（追加）し、画像を生成（変換）、さらに1枚に融合（結合）。<br/><img src="https://file.tongflow.com/public/demos/basic.png" width="620" alt="ワークフロー" /> | <img src="https://file.tongflow.com/public/demos/basic_result.png" width="200" alt="結果" /> |
| **中級** — （テーマ追加 → 台本生成 → 音声生成） + （人物の説明 → 画像生成） → リップシンク動画を生成 = デジタルヒューマンのナレーション。<br/><img src="https://file.tongflow.com/public/demos/digitalhuman.png" width="620" alt="ワークフロー" /> | <video src="https://github.com/user-attachments/assets/a803394d-0ccf-4023-9b06-5c1581345758" width="200"></video> |
| **上級** — 歌詞生成 + 楽曲生成 + 人物生成 + シーン生成 + 絵コンテ生成 → MV生成<br/><img src="https://file.tongflow.com/public/demos/mv.png" width="620" alt="ワークフロー" /> | <video src="https://github.com/user-attachments/assets/2bc71e3c-3ed6-48b2-81e7-82ad5976d801" width="200"></video> |

各ステップの出力はキャンバスに残り、次のデータになります。生成した画像から分岐する、文字起こしを次の処理に渡す、あるノードのモデルだけ差し替える——まわりのワークフローはそのままです。

## クイックスタート

TongFlow の使い方は3つ。どれも同じオープンソースのコアを共有します。**TongFlow クラウド**（デスクトップ版、またはブラウザで [app.tongflow.com](https://app.tongflow.com)）、**セルフホスト**（[ソースコードから](#ソースコードから起動)または [Docker で](#docker-で起動)）、**エージェントと組み立てる**（[`tongflow` npm パッケージ](../packages/tongflow/README.md)または [dsh プラグイン](#自分のエージェントに組み込むdsh-プラグイン)）。

TongFlow **デスクトップ版**は、クラウドスタジオ **[app.tongflow.com](https://app.tongflow.com)** を直接読み込む軽量（約 10 MB）のシェルアプリです——インストールしてサインインすれば、すぐに創作を始められます。クラウドスタジオはブラウザから直接開くこともできます。

### Step 1 — デスクトップ版をインストール

対応プラットフォームのインストーラーをダウンロードし、インストールして起動します。

- **macOS（Universal — Apple Silicon / Intel 共通）：** [TongFlow-mac-universal.dmg](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-mac-universal.dmg)
- **Windows：** [TongFlow-win-x64.msi](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-win-x64.msi)

すべてのバージョンは [Releases](https://github.com/tong-io/tongflow/releases/latest) ページを参照してください。

> **macOS をお使いの方へ：** インストーラーはまだ Apple の公証（notarization）を受けていないため、初回起動時に Gatekeeper にブロックされます（「"TongFlow"は壊れているため開けません」と表示されます）。アプリを「アプリケーション」フォルダに移動した後、ターミナルで以下のコマンドを一度実行すると正常に開けます：
>
> ```bash
> xattr -cr /Applications/TongFlow.app
> ```
>
> インストーラーは必ずこのページから直接ダウンロードしてください——WeChat などのチャットアプリ経由で転送されたファイルは、リネームや隔離フラグの再付与が行われる場合があります。

### Step 2 — サインインして創作を開始

Google または WeChat でサインインすれば、すぐに創作を始められます——プラグインと実行はクラウド側で管理されます。

> **完全ローカル・アカウント不要の TongFlow をお望みですか？** セルフホストをご利用ください——[ソースコードから起動](#ソースコードから起動)または [Docker で起動](#docker-で起動)を参照し、[セルフホストのセットアップ](#セルフホストのセットアッププラグインと認証情報)に従って設定してください。（v0.1.13 以前のデスクトップ版は完全なローカルランタイムを同梱していました。それらのインストーラーは [Releases](https://github.com/tong-io/tongflow/releases) ページに残っています。）

## Modality-First：モダリティから考える

モダリティとは、テキスト、画像、音声、動画、3D、ドキュメント、URL といった情報の形態のこと。TongFlow では、それらをワークフローの基本単位にしています。まず何ができるかを考え、モデル選びはその次に。ひとつのステップは、3つの別々の判断でできています。

| | 問い | 例 |
| :-- | :-- | :-- |
| **データ** | 手元には何がある？ | ドキュメント、写真、録音、アイデア。 |
| **機能** | 次に何ができる？ | 理解、生成、変換、組み合わせ、分割。 |
| **実行** | どのモデルに任せる？ | そのステップに対応するプラグインとモデルを選ぶ。 |

- **結果が、次の起点になる。** データは独立したノードとして存在します。アップロードした画像も、生成した画像も、対応する次の処理へ。得られた結果から新しい方向に進めます。
- **機能とモデルを分けて考える。** ステップの役割と、それを実行するプラグインを別々に記録します。対応する実装に切り替えても、周囲のワークフロー構造はそのままです。
- **基本操作は4つ。** 追加、変換、組み合わせ、分割・一括処理。理解も生成も加工も、同じノードと接続ルールで扱います。生成は、その中のひとつの操作です。
- **人もエージェントも、同じ構造で。** キャンバス、エクスポーター、エージェント用ツールは共通のノード定義を使います。画面でも `tongflow` パッケージでも構築でき、DSH 連携ではエージェントが作ったワークフローを開いて編集し、もう一度実行できます。
- **オープンなエコシステム。** ABI は各機能の入出力の契約だけを定め、誰が実装するかは問いません。どのプラットフォームも同じ方法でプラグインを公開でき、下記の公式プラグインは機能一覧のほぼすべてのノードをカバーしています。

続きを読む：[TongFlow がモダリティから考える理由](https://www.tongflow.com/ja/blog/tongflow-why-modality-first)

## 実装済み機能

以下の各ノードは ABI の機能に対応し、4つの基本操作ごとにまとめています。データ（テキスト、画像、音声、動画、3D、ドキュメント、URL）が、それらをつなぐノードです。

> ✅ = すぐに使える（公式プラグインあり）· ⬜ = キャンバスにノードはあるが、公式プラグインは未提供（計画中）。

### 追加

- ✅ **テキスト入力**: 文字を入力してテキストノードを追加。
- ✅ **画像を追加**: ローカルファイルを選択して画像ノードを追加。
- ✅ **写真を撮影**: デバイスのカメラで撮影して画像ノードを追加。
- ✅ **スケッチを追加**: キャンバス上に描画して画像ノードを追加。
- ✅ **音声を追加**: ローカルの音声ファイルを選択して音声ノードを追加。
- ✅ **録音**: マイクで録音して音声ノードを追加。
- ✅ **動画を追加**: ローカルの動画ファイルを選択して動画ノードを追加。
- ✅ **動画を録画**: カメラで録画して動画ノードを追加。
- ✅ **ドキュメントを追加**: ローカルファイルを選択してドキュメントノードを追加。
- ✅ **リンクを追加**: リンクからページを取得し、テキスト・画像・音声・動画ノードを追加。
- ✅ **3Dモデルを追加**: ローカルのモデルファイルを選択して3Dモデルノードを追加。

### 変換

#### テキスト

- ✅ **生成 / 書き換え**: プロンプトに基づいて文章を作成または編集。

#### 画像

- ✅ **画像生成**: テキストから画像を生成。
- ✅ **画像編集**: 部分的な再描画、編集、または指示に基づく描き直し。
- ✅ **画像理解**: 画像から説明・質問応答・キャプションを生成。
- ✅ **画像超解像**: 拡大してより鮮明なディテールを得る。
- ✅ **ポーズ検出**: 308 キーポイントの全身スケルトンオーバーレイ（身体・両手・顔）。
- ✅ **身体部位セグメンテーション**: 29 クラスの人体パーシング。
- ✅ **表面法線**: ピクセル単位の法線マップ——人物にもシーン全体にも対応。
- ✅ **前景マッティング**: 人物や顕著な被写体を透過 PNG として切り抜き。

#### 動画

- ✅ **動画生成**: テキストから動画を生成。
- ✅ **画像から動画**: 静止画を動かす。
- ✅ **最初/最後のフレームから動画**: 2枚のキーフレームを補間してクリップを生成。
- ✅ **複数画像から動画**: 複数の参照画像とテキストを融合して新しい動画を生成。
- ✅ **マルチ参照から動画**: 画像・動画・音声の参照を組み合わせ（テキスト付き）、ステレオ音声入りの動画を一度に生成。
- ✅ **動画理解**: 動画から要約や説明を生成。
- ✅ **動画超解像**: より高解像度の動画を出力。
- ✅ **最初/最後のフレームを抽出**: フレームを画像として抽出。
- ✅ **動画編集**: テキスト指示で動画を編集。
- ✅ **字幕除去**: 動画から字幕を消去。
- ✅ **ウォーターマーク除去**: 動画からウォーターマークを除去。

#### 音声

- ✅ **音楽生成**: テキストから音楽を生成。参照音声による誘導にも対応。
- ✅ **音声理解**: 音声クリップ（音楽・スピーチ・環境音）をテキストで説明。
- ✅ **音楽リペイント**: 曲の指定区間を再生成。
- ✅ **音楽カバー**: 説明文や参照曲でスタイルを変えて再構成。
- ✅ **トラック追加 / 編曲補完**: 既存ミックスに新しいトラックを生成、または不足パートを補完。
- ✅ **音楽ブリーフ**: 一文のアイデア → 歌詞・スタイルタグ・BPM・キー・長さ。
- ✅ **音声合成**: テキストから音声へ——プリセットスタイル、声のクローン（参照音声）、または指示駆動。
- ✅ **音声認識**: 音声または動画中の発話を文字起こし。
- ✅ **ノイズ除去**: 音声のノイズを除去。
- ✅ **話者分離**: 話者ごとに音声を分離。
- ⬜ **音色変換**: 参照サンプルを使って音色を置き換えまたはクローン。
- ✅ **マルチトラック / ボーカル・伴奏分離**: ボーカル・ドラム・ベース・ギターなど 12 種のステムを分離。
- ✅ **オープン語彙の音源分離**: 任意の音を言葉で指定（「犬の鳴き声」）し、その音とそれ以外の 2 トラックに分割。

#### 3D・ドキュメント・リンク

- ✅ **画像 → 3D**: 1枚の画像から3Dモデルを生成。
- ✅ **動画 → モーションキャプチャ**: 単眼動画からスケルタルアニメーション（身体 + 指 + 表情チャンネル、GLB）。
- ✅ **ドキュメント → テキスト**: ドキュメントからプレーンテキストを抽出。
- ✅ **リンク → テキスト**: ページの内容をテキストに変換。

### 結合

- ✅ **画像融合**: 複数の参照画像を1枚に融合または編集。
- ✅ **リップシンク**: 音声 + 動画 → 動画（リップシンク）。音声 + 画像 → 動画、音声 + テキスト → 動画などのバリエーションにも対応。
- ✅ **感情音声**: テキスト + 参照音声 → その声で読み上げ、感情制御に対応。
- ✅ **キャラクター置換**: 動画 + 参照（シーン融合 / キャラクター置換）、Animate Mix スタイルの生成。
- ✅ **モーション転送**: 動画 + 参照（モーション / リターゲット）、Animate Move スタイルの生成。
- ✅ **テキスト結合**: 複数のテキストノードを1つに結合。
- ✅ **クリップ連結**: 複数の動画を前後につなげる。
- ✅ **音声・映像の結合**: 1つのファイルに統合。

### 分割・一括処理

- ✅ **ショット単位で分割**: 長い動画をシーンごとに分割。
- ✅ **音声・映像の分離**: 動画を独立した映像トラックと音声トラックに分離。
- ✅ **音声トラックを抽出**: 音声を独立したアセットとして書き出す。
- ✅ **長文を分割**: 長い段落をブロックに分割。
- ✅ **テキストブロックの結合 / 整理**: 断片を結合（自動結合オプション利用可）。
- ✅ **クリップのフィルタ / 破棄**: ルールまたは手動選択で不要なクリップを破棄。
- ✅ **整列とバッチグループ化**: テキストやクリップのバッチをグループ化して整列し、下流処理に渡す。

## 公式プラグイン

> 公式のGPU/CPUプラグインは現在 [Modal](https://modal.com) 上で動作しています——毎月最大 **$30** 分の無料GPU演算（H100/A100など）。`MODAL_TOKEN_*` の設定は[セルフホストのセットアップ](#セルフホストのセットアッププラグインと認証情報)を参照してください。他のどのプラットフォームでも同じ方法で自分のプラグインを公開できます。

### API プラグイン

ファーストパーティ（各ラボ自身のモデル）：

- [tongflow-api-gemini](https://github.com/tong-io/tongflow-api-gemini) — Google Gemini、ノードごとの**モデルピッカー**：テキスト、視覚、画像（Nano Banana / Imagen 4）、Veo 動画、TTS、文字起こし
- [tongflow-api-openai](https://github.com/tong-io/tongflow-api-openai) — OpenAI、ノードごとの**モデルピッカー**：`gen_text`、画像生成/編集/融合（`gpt-image-2`）、視覚、ドキュメント OCR、Whisper 文字起こし、TTS
- [tongflow-api-deepseek](https://github.com/tong-io/tongflow-api-deepseek) — DeepSeek V4（`flash` / `pro`、ストリーミング**思考**バブル付き）ベースの `gen_text` およびテキストツール
- [tongflow-api-bytedance](https://github.com/tong-io/tongflow-api-bytedance) — ByteDance Volcengine Ark、ノードごとの**モデルピッカー**：Doubao テキスト・視覚、Seedream 画像生成/編集/融合、Seedance テキスト / 画像 / 音声 → 動画
- [tongflow-api-xai](https://github.com/tong-io/tongflow-api-xai) — xAI Grok、ノードごとの**モデルピッカー**：`gen_text`（Grok 4.x）、画像理解、Grok Imagine テキスト→画像
- [tongflow-api-runway](https://github.com/tong-io/tongflow-api-runway) — Runway Dev 統合 API、ノードごとの**モデルピッカー**：動画（Gen-4.5、Gen-4 Turbo、Aleph 編集、Act-Two、Seedance、Veo）、画像（GPT Image 2、Seedream 5、Gemini image 3）、ElevenLabs TTS

### ルーター / 集約プラグイン

1 つの key で複数ラボのモデルを転送：

- [tongflow-router-openrouter](https://github.com/tong-io/tongflow-router-openrouter) — OpenRouter、ノードごとの**モデルピッカー**：`gen_text`（デフォルト無料、GPT-5.5 / Claude / Gemini / Grok / DeepSeek も選択可）、視覚 / 音声理解、画像生成/編集、文字起こし
- [tongflow-router-cometapi](https://github.com/tong-io/tongflow-router-cometapi) — CometAPI 集約ゲートウェイ、ノードごとの**モデルピッカー**に加えて **CometAPI のモデルカタログをライブ取得**：`gen_text` / テキストツール（GPT-5.5、Claude、Gemini、DeepSeek、Grok、Qwen、Kimi）、画像 / 動画 / 音声理解、画像生成/編集/融合（GPT Image 2、Seedream）、テキスト / 画像 → 動画（Sora 2、Veo 3.1、Seedance、Wan、MiniMax、HappyHorse、Vidu）、動画編集（Omni）、TTS と Whisper 文字起こし
- [tongflow-router-toapis](https://github.com/tong-io/tongflow-router-toapis) — ToAPIs 集約ゲートウェイ、ノードごとの**モデルピッカー**付き：`gen_text` / テキストツール（GPT-5.6、Claude、Gemini、DeepSeek、Qwen、GLM、Kimi、MiniMax）、画像理解、画像生成/編集/融合（GPT Image 2、Seedream 5、Gemini Image、Flux 2、Grok）、テキスト / 画像 / 最初・最後フレーム / マルチモーダル参照 → 動画（Sora 2、Veo 3.1、Seedance 2、Kling、MiniMax H3、Wan、HappyHorse、Vidu）、動画編集（HappyHorse）、**キーごとのモデル一覧をライブ取得**
- [tongflow-router-apimart](https://github.com/tong-io/tongflow-router-apimart) — APIMart ゲートウェイ。ノード上で**モデルを選択**可能：画像生成 / 編集（Z-Image、Seedream、Nano Banana、GPT-Image）、テキスト / 画像 → 動画（Kling、VEO3、Sora2、Seedance）、`gen_text`（GPT-5、Claude、Gemini）、Whisper 文字起こしと TTS
- [tongflow-router-replicate](https://github.com/tong-io/tongflow-router-replicate) — Replicate、ノードごとの**モデルピッカー**でカタログ全体をカバー：テキスト、視覚、画像 生成/編集/融合/アップスケール/切り抜き、テキスト / 画像 → 動画、文字起こし、TTS / ボイスクローン、音楽、画像 → 3D（FLUX、Seedream、Veo、Kling、Whisper、Hunyuan3D…）
- [tongflow-router-fal](https://github.com/tong-io/tongflow-router-fal) — fal.ai、ノードごとの**モデルピッカー**：画像（生成/編集/融合/アップスケール/切り抜き/ポーズ/法線/セグメンテーション）、動画（テキスト / 画像 → 動画、最初・最後フレーム、トーキングヘッド、リップシンク、アップスケール）、音声（文字起こし、TTS、ボイスクローン、音楽、音源分離）、画像 → 3D

### GPU/CPU プラグイン

- [tongflow-modal-ffmpeg](https://github.com/tong-io/tongflow-modal-ffmpeg) — トランスコード、ミキシング、メディア処理パイプライン
- [tongflow-modal-pyscenedetect](https://github.com/tong-io/tongflow-modal-pyscenedetect) — ショット境界の検出、クリップ分割用
- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — Z-Image テキストから画像生成
- [tongflow-modal-ernie-image](https://github.com/tong-io/tongflow-modal-ernie-image) — ERNIE Image テキストから画像生成（代替）
- [tongflow-modal-krea2](https://github.com/tong-io/tongflow-modal-krea2) — Krea 2 Turbo テキストから画像生成（オープンウェイト 12B、8 ステップ、最大 2K）
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — FLUX.2 Klein 9B マルチ参照融合と画像編集
- [tongflow-modal-qwen-image-edit](https://github.com/tong-io/tongflow-modal-qwen-image-edit) — Qwen-Image-Edit-2511 指示ベースの画像編集とマルチ画像融合（ヘッドレス ComfyUI、fp8 + 8ステップ）
- [tongflow-modal-boogu](https://github.com/tong-io/tongflow-modal-boogu) — Boogu-Image-0.1（fp8）テキストから画像生成（高密度な多言語テキスト）と単一参照画像編集
- [tongflow-modal-infinitetalk](https://github.com/tong-io/tongflow-modal-infinitetalk) — InfiniteTalk 音声駆動リップシンク（音声 + 画像 / 動画 → デジタルヒューマン動画）
- [tongflow-modal-wan-animate](https://github.com/tong-io/tongflow-modal-wan-animate) — Wan-Animate キャラクター置換とモーション転送（動画 + 参照）
- [tongflow-modal-scail2](https://github.com/tong-io/tongflow-modal-scail2) — SCAIL-2 制御可能なキャラクターアニメーション（画像 + 駆動動画；wan-animate と同じ 2 スロット）
- [tongflow-modal-minimax-h3](https://github.com/tong-io/tongflow-modal-minimax-h3) — MiniMax-H3 33B 動画生成、ネイティブステレオ音声（テキスト / 最初と最後のフレーム / 複数画像 / マルチ参照）
- [tongflow-modal-bernini](https://github.com/tong-io/tongflow-modal-bernini) — Bernini-R 1.3B 統合動画レンダラー（テキスト/画像 → 画像/動画、動画編集、字幕 / ウォーターマーク除去）
- [tongflow-modal-sam3](https://github.com/tong-io/tongflow-modal-sam3) — SAM 3 / SAM 3.1 テキスト誘導マッティング：記述した概念の全インスタンスを画像から切り抜き（透過 PNG）、動画では全編トラッキング（グリーンバック出力）
- [tongflow-modal-triposplat](https://github.com/tong-io/tongflow-modal-triposplat) — TripoSplat 1 枚の画像から 3D ガウシアンスプラット
- [tongflow-modal-sam-3d-objects](https://github.com/tong-io/tongflow-modal-sam-3d-objects) — SAM 3D Objects 1 枚の画像から前景オブジェクトの 3D ガウシアンスプラットを再構築（自動マスク、オクルージョンに強い；代替）
- [tongflow-modal-sam-3d-body](https://github.com/tong-io/tongflow-modal-sam-3d-body) — SAM 3D Body 1 枚の画像から全身 3D 人体メッシュ GLB（複数人、MHR リグ；代替）、および**動画モーションキャプチャ**（フレーム毎 MHR 回帰 → キャラクターアニメーション GLB；代替）
- [tongflow-modal-sapiens2](https://github.com/tong-io/tongflow-modal-sapiens2) — Sapiens2（Meta）人体スイート：ポーズ検出、身体部位セグメンテーション、表面法線、人物マッティング、画像 → 3D 点群、**動画モーションキャプチャ**（幾何エンジン：キーポイント + pointmap → MHR キャラクターアニメーション GLB）
- [tongflow-modal-sensenova-vision](https://github.com/tong-io/tongflow-modal-sensenova-vision) — SenseNova-Vision（SenseTime）統一ビジョンモデル：画像理解 / ビジュアル QA、検出・OCR の構造化テキスト、シーン全体の表面法線、顕著オブジェクトのマッティング、人体ポーズオーバーレイ（代替）
- [tongflow-modal-seedvr2](https://github.com/tong-io/tongflow-modal-seedvr2) — SeedVR2 画像 / 動画の超解像
- [tongflow-modal-gemma4](https://github.com/tong-io/tongflow-modal-gemma4) — Gemma-4 マルチモーダルテキスト（画像 / 動画理解）
- [tongflow-modal-qwen38](https://github.com/tong-io/tongflow-modal-qwen38) — Qwen3.8-27B マルチモーダルテキスト（テキスト生成、画像 / 動画理解；代替）
- [tongflow-modal-spark-x25](https://github.com/tong-io/tongflow-modal-spark-x25) — Spark-X2.5-4B（iFlytek）オンデバイス LLM、ネイティブ 1M トークンコンテキスト：テキスト生成 / テキスト結合（テキストのみ；代替）
- [tongflow-modal-qwen3asr](https://github.com/tong-io/tongflow-modal-qwen3asr) — Qwen3 音声認識
- [tongflow-modal-qwen3tts](https://github.com/tong-io/tongflow-modal-qwen3tts) — Qwen3 テキストから音声
- [tongflow-modal-indextts2](https://github.com/tong-io/tongflow-modal-indextts2) — IndexTTS-2.5 感情表現テキスト読み上げ：ゼロショット音声クローン（代替）+ 参照音声による感情制御音声合成
- [tongflow-modal-whisper](https://github.com/tong-io/tongflow-modal-whisper) — Whisper 音声認識（タイムスタンプ付き、代替）
- [tongflow-modal-moss-transcribe-diarize](https://github.com/tong-io/tongflow-modal-moss-transcribe-diarize) — MOSS-Transcribe-Diarize 0.9B：長時間・複数話者の音声を一度の推論でタイムスタンプ＋話者ラベル付き文字起こしにし、話者ごとの音声トラックも出力（50+ 言語、最長約 90 分）
- [tongflow-modal-ace-step](https://github.com/tong-io/tongflow-modal-ace-step) — ACE-Step 1.5 音楽スイート：テキストから音楽（sft / base / turbo 選択可）、リペイント、カバー、ステム抽出、トラック追加、編曲補完、音楽ブリーフ、音楽理解
- [tongflow-modal-levo](https://github.com/tong-io/tongflow-modal-levo) — LeVo 2 / SongGeneration テキストから音楽生成（多言語・商用グレード）
- [tongflow-modal-minimax-music3](https://github.com/tong-io/tongflow-modal-minimax-music3) — MiniMax-Music3 11B 楽曲生成：歌詞 + 説明 → ボーカル入り完全楽曲（最長約 5 分、32 kHz ステレオ）
- [tongflow-modal-sam-audio](https://github.com/tong-io/tongflow-modal-sam-audio) — SAM-Audio テキスト指示による音源分離：ノイズ除去、ボーカル分離、自由記述での任意サウンド抽出（「背景のピアノ」）
- [tongflow-modal-docling](https://github.com/tong-io/tongflow-modal-docling) — Docling ドキュメント → テキスト
- [tongflow-modal-paddle](https://github.com/tong-io/tongflow-modal-paddle) — PaddleOCR ドキュメント → テキスト
- [tongflow-modal-unlimited-ocr](https://github.com/tong-io/tongflow-modal-unlimited-ocr) — Unlimited-OCR 長文ドキュメント / PDF → テキスト
- [tongflow-modal-crawl4ai](https://github.com/tong-io/tongflow-modal-crawl4ai) — Crawl4AI URL / リンク → テキスト
- [tongflow-modal-scrapling](https://github.com/tong-io/tongflow-modal-scrapling) — Scrapling ステルスブラウザ URL / リンク → テキスト

## ソースコードから起動

```bash
pnpm install
pnpm plugins:install   # 公式プラグインを plugins/ にクローン
pnpm start:prod        # 一度ビルドしてから http://localhost:3000 で起動
```

**Node**（`pnpm` を含む）と、`PATH` 上に **Python 3.10+** インタープリタが必要です（`PYTHON` で特定のものを指定可能）。プラグインはローカルのPythonプロセスとして実行されます。TongFlow は自動的に各プラグイン用の隔離された venv を作成し、初回利用時に各プラグインの `requirements.txt` をインストールします——Pythonの手動設定は不要です。

**`http://localhost:3000`** を開けば、キャンバスがすぐに使えます。その後は[セルフホストのセットアップ](#セルフホストのセットアッププラグインと認証情報)に従って設定してください（認証情報はアプリ内の**設定**ダイアログ、またはプロジェクトの `.env` に入力）。

## Docker で起動

セルフホスト用イメージが GHCR に公開されています——Node/Python/pnpm のセットアップは不要です：

```bash
docker run -d -p 3000:3000 \
  -v tongflow-data:/data -v tongflow-plugins:/plugins \
  ghcr.io/tong-io/tongflow:latest
```

その後 **`http://localhost:3000`** を開きます。または Compose で（本リポジトリの [`docker-compose.yml`](../docker-compose.yml) をクローンします）：

```bash
docker compose up -d
```

プルする代わりに自分でイメージをビルドするには：`docker build -t tongflow .`

**データと認証情報。** 書き込み可能なものはすべて `/data` ボリュームに保存されます（SQLite DB、アップロード、設定）。API キーは任意です——アプリ内の**設定**ダイアログで設定するか、起動時に渡します（`-e OPENROUTER_API_KEY=…`）。対応キー：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`、`OPENAI_API_KEY`、`MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`。

**プラグイン。** イメージにはプラグインが含まれていません——アプリ内のプラグインマネージャーからインストールしてください（初回インストールには GitHub へのネットワークアクセスが必要）。初回実行時、プラグインは `/data/.tongflow/plugin-venv` の下に共有 Python venv を作成します（PyPI から SDK とそのプラグインの `requirements.txt` をインストール）。そのため初回実行は遅く、ネットワークが必要です。Modal ベースのプラグインにはさらに Modal トークンが必要です。

## セルフホストのセットアップ（プラグインと認証情報）

セルフホストの TongFlow はプラグインを一切同梱しておらず、キャンバスにはサンプルワークフローがあらかじめ読み込まれています。以下の3ステップで動かせます：

### 1 — プラグインをインストール

**プラグインマネージャー**（右上の四角いアイコン）を開き、必要に応じてインストールしてください。新しくインストールしたプラグインは再起動不要で即座に利用できます。

あらかじめ読み込まれた**サンプルワークフロー**（テキスト → 画像 → 融合 → 動画）を実行するには、以下の3つのプラグインが必要です：

- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — テキストから画像生成
- [tongflow-modal-qwen-image-edit](https://github.com/tong-io/tongflow-modal-qwen-image-edit) — 画像の融合 / ミックス
- [tongflow-modal-minimax-h3](https://github.com/tong-io/tongflow-modal-minimax-h3) — 画像から動画生成

これらのプラグインは [Modal](https://modal.com) 上で動作します（毎月最大 **$30** 分の無料GPU演算）。**設定**で `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` を入力してください。トークンは [modal.com/settings/tokens](https://modal.com/settings/tokens) で作成できます。他のどのプラットフォームでも同じ方法で自分のプラグインを公開できます。

プラグインマネージャーでは完全なカタログを閲覧できます——公式API プラグイン（OpenAI / Gemini / OpenRouter）やその他のGPU/CPUプラグインなど。

### 2 — 認証情報を設定

**設定**（右上の歯車アイコン）を開き、プラグインが必要とする環境変数を入力します——たとえばAPIプラグイン用の `OPENAI_API_KEY` や、GPU/CPUプラグインに必要な認証情報など。

> **プラグインの認証情報はすべて「設定」にあります。** TongFlow は特定のプラットフォームに縛られず、どのプロバイダーもハードコードしていません。設定ダイアログは汎用的な環境変数の key/value エディタで、その値がプラグインに渡されます。各プラグインがどのキーを必要とするかは、それぞれの README に記載されています。値はローカルに保存され、変更は即座に反映され、再起動は不要です。

### 3 — サンプルワークフローを実行

あらかじめ読み込まれたサンプルをノードごとに実行することも、実行モードに切り替えて実行ボタンをクリックし、一括で実行することもできます。

## 自分のエージェントに組み込む（dsh プラグイン）

TongFlow は [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) のプラグインとして、**自分のエージェントの中で動かす**こともできます。デスクトップアプリも、自前のサーバーも要りません：

```sh
npx @deepseek-ai/dsh@next plugin --profile web add dsh-tongflow
npx @deepseek-ai/dsh@next web
```

あとは、**最初のメッセージを `@tongflow` で始めて**セッションを開くだけです。そのセッションが Studio に変わり——チャット、プロジェクトのフォルダツリー、プレビュー / エディタ / キャンバス、実行履歴のドロワー——エージェントは TongFlow のツール一式を使えるようになります。ほかのセッションはこれまでどおりの dsh のままです。

役割がはっきり分かれているのがポイントです。エージェントはプロジェクトを設計し、計画・設定・プロンプトをふつうのファイルとして書きます。生成を担うのは TongFlow で、生成物はすべて、その隣に置かれた `.tongflow.json` ワークフローから生まれます——だからキャンバスで開いて、手を入れて、もう一度実行できます。「画像を生成する」ようなツールも、プロジェクトのテンプレートもありません。プラグインは初回利用時に自前の Python venv を用意し、公式プラグインをクローンするので、キャンバスで選べるノードとプラグインはホスト版と同じです。

動作要件と設定項目は **[packages/dsh-tongflow/README.md](../packages/dsh-tongflow/README.md)** を参照してください。

## カスタムプラグイン

キャンバス上で動作するすべてのノードは**機能**であり、その背後には**契約**——ABI（[`packages/tongflow/abi/tongflow.abi.json`](../packages/tongflow/abi/tongflow.abi.json)）があります。これは「どんな機能があるか」と「各機能の入出力がどんな形か」を定義し、「誰が実装するか」とは無関係です。プラグインはその**実装**です。小さなPythonパッケージで、ABI の中の1つまたは複数のスロットを選び、tongflow Python SDK を使って、ABI から生成された型で**どう実装するか**の部分を提供します。ノードの背後のプラグインを差し替えても、まわりのワークフローは変わりません。

完全な開発フロー——ABI、`@node_slot` デコレータ、SDK、ディレクトリ構造、公開方法については **[docs/plugins.md](plugins.md)** を参照してください。

## コミュニティ

**[Discord](https://discord.gg/K7V8az94Zf)** に参加するか、下記の**WeChatグループ**のQRコードをスキャンしてください。

<div>
  <img src="assets/qr.png" alt="WeChatグループQRコード" width="180" />
</div>

## ビジネス協業

ビジネス協業については business@tongflow.com までお問い合わせください。

- **オープンソースモデルのオーナー**：あなたのモデルを統合し、ユーザーにスムーズな体験を提供できます。
- **エンタープライズユーザー**：ローカルGPUへのデプロイ、カスタムノードやプラグインの構築などを支援できます。
- **プラットフォーム / ルーター**：あなたのAPIを接続できます。
- **VC**：[TongFlow クラウド](https://www.tongflow.com/ja)（ホスト型ワークスペース）を軸にした協業をぜひご相談ください。

## オープンソース

このプロジェクトが気に入ったら、GitHub で Star をいただけると大変助かります。ありがとうございます！

<img src="assets/star.gif" alt="Star on GitHub" width="480" />

## ライセンス

TongFlow は **デュアルライセンス（dual-licensing）** モデルを採用しています：

- **[AGPL-3.0](../LICENSE)** —— 個人、研究、オープンソースプロジェクト、および AGPL（第13条の
  ネットワーク/ソース公開義務を含む）を遵守する利用者には**無料**。
- **[商用ライセンス](../COMMERCIAL-LICENSE.md)** —— **クローズドソース / SaaS** 製品で TongFlow を
  使用し、**ソースを公開したくない**組織、あるいは保証条項やプラットフォームの技術サポートを
  必要とする組織向け。価格は応相談、**business@tongflow.com** までご連絡ください。

上記のライセンスはリポジトリ全体（PyPI に公開される `tongflow` パッケージを含む `sdk/` ディレクトリ）をカバーします。
コードの貢献は [CLA](../CLA.md) に従います。
