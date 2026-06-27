<div align="center">
  <img src="../public/logo.svg" alt="TongFlow" width="320" />

  <h1>TongFlow：オープンソースのマルチモーダル GenAI ワークフロースタジオ</h1>
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

## Demo デモ

| ワークフローのスクリーンショット | 出力結果 |
| :--: | :--: |
| **基本** — テキストを入力（追加）し、画像を生成（変換）、さらに1枚に融合（結合）。<br/><img src="https://file.tongflow.com/public/demos/basic.png" width="620" alt="ワークフロー" /> | <img src="https://file.tongflow.com/public/demos/basic_result.png" width="200" alt="結果" /> |
| **中級** — （テーマ追加 → 台本生成 → 音声生成） + （人物の説明 → 画像生成） → リップシンク動画を生成 = デジタルヒューマンのナレーション。<br/><img src="https://file.tongflow.com/public/demos/digitalhuman.png" width="620" alt="ワークフロー" /> | <video src="https://github.com/user-attachments/assets/a803394d-0ccf-4023-9b06-5c1581345758" width="200"></video> |
| **上級** — 歌詞生成 + 楽曲生成 + 人物生成 + シーン生成 + 絵コンテ生成 → MV生成<br/><img src="https://file.tongflow.com/public/demos/mv.png" width="620" alt="ワークフロー" /> | <video src="https://github.com/user-attachments/assets/2bc71e3c-3ed6-48b2-81e7-82ad5976d801" width="200"></video> |

TongFlowで生成AIを活用し、創造力を解き放とう！

## クイックスタート

すぐに動かせるTongFlow**デスクトップ版**を提供しています。

### Step 1 — デスクトップ版をインストール

対応プラットフォームのインストーラーをダウンロードし、インストールして起動します。

- **macOS（Apple Silicon — M1/M2/M3/M4）：** [TongFlow-mac-arm64.dmg](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-mac-arm64.dmg)
- **macOS（Intel）：** [TongFlow-mac-x64.dmg](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-mac-x64.dmg)
- **Windows：** [TongFlow-win-setup.exe](https://github.com/tong-io/tongflow/releases/latest/download/TongFlow-win-setup.exe)

すべてのバージョンは [Releases](https://github.com/tong-io/tongflow/releases/latest) ページを参照してください。

> **macOS をお使いの方へ：** インストーラーはまだ Apple の公証（notarization）を受けていないため、初回起動時に Gatekeeper にブロックされます（「"TongFlow"は壊れているため開けません」と表示されます）。アプリを「アプリケーション」フォルダに移動した後、ターミナルで以下のコマンドを一度実行すると正常に開けます：
>
> ```bash
> xattr -cr /Applications/TongFlow.app
> ```
>
> インストーラーは必ずこのページから直接ダウンロードしてください——WeChat などのチャットアプリ経由で転送されたファイルは、リネームや隔離フラグの再付与が行われる場合があります。

初回起動時、キャンバスにはサンプルワークフローがあらかじめ読み込まれています——次のステップで実行可能な状態に整えます。

### Step 2 — プラグインをインストール

アプリはデフォルトではプラグインを一切同梱していません。**プラグインマネージャー**（右上の四角いアイコン）を開き、必要に応じてインストールしてください。新しくインストールしたプラグインは再起動不要で即座に利用できます。

あらかじめ読み込まれた**サンプルワークフロー**（テキスト → 画像 → 融合 → 動画）を実行するには、以下の3つのプラグインが必要です：

- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — テキストから画像生成
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — 画像の融合 / ミックス
- [tongflow-modal-ltx](https://github.com/tong-io/tongflow-modal-ltx) — 画像から動画生成

これらのプラグインは [Modal](https://modal.com) 上で動作します（毎月最大 **$30** 分の無料GPU演算）。**設定**で `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` を入力してください。トークンは [modal.com/settings/tokens](https://modal.com/settings/tokens) で作成できます。他のどのプラットフォームでも同じ方法で自分のプラグインを公開できます。

プラグインマネージャーでは完全なカタログを閲覧できます——公式API プラグイン（OpenAI / Gemini / OpenRouter）やその他のGPU/CPUプラグインなど。

### Step 3 — 認証情報を設定

**設定**（右上の歯車アイコン）を開き、プラグインが必要とする環境変数を入力します——たとえばAPIプラグイン用の `OPENAI_API_KEY` や、GPU/CPUプラグインに必要な認証情報など。

> **プラグインの認証情報はすべて「設定」にあります。** TongFlow は特定のプラットフォームに縛られず、どのプロバイダーもハードコードしていません。設定ダイアログは汎用的な環境変数の key/value エディタで、その値がプラグインに渡されます。各プラグインがどのキーを必要とするかは、それぞれの README に記載されています。値はローカルに保存され、変更は即座に反映され、再起動は不要です。

### Step 4 — サンプルワークフローを実行

あらかじめ読み込まれたサンプルをノードごとに実行することも、実行モードに切り替えて実行ボタンをクリックし、一括で実行することもできます。

## コアコンセプト

- **全モデル対応**: AIモデルは**モダリティ変換**として捉えることができます（例：LLMはテキスト→テキスト、画像モデルはテキスト→画像、音声モデルはテキスト→音声など）。TongFlow は各能力をノードとしてカプセル化します。

- **全モダリティ対応**: TongFlow は、Web上で実際に流通しているほぼすべてのモダリティとファイル形式をサポートします。

- **低い参入障壁、高い可能性**: 複雑なAIパラメータを学ぶ必要も、手動でノードを接続する必要もありません。**追加**、**変換**、**結合**の3つの操作だけで、自由に創意を組み立てられます。さらに、AIモデルを自由に編成することで、独自の創作物を生み出せます。

- **オープンなエコシステム**: TongFlow のプラグインベースの設計により、各プラットフォームが独立したプラグインをカプセル化でき、公式は各能力ノードに対して少なくとも1つの実装プラグインを提供します。コアは軽量に、エコシステムはオープンに。

## 実装済み機能

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

#### 動画

- ✅ **動画生成**: テキストから動画を生成。
- ✅ **画像から動画**: 静止画を動かす。
- ✅ **最初/最後のフレームから動画**: 2枚のキーフレームを補間してクリップを生成。
- ✅ **動画理解**: 動画から要約や説明を生成。
- ✅ **動画超解像**: より高解像度の動画を出力。
- ✅ **最初/最後のフレームを抽出**: フレームを画像として抽出。
- ⬜ **字幕除去**: 動画から字幕を消去。
- ⬜ **ウォーターマーク除去**: 動画からウォーターマークを除去。

#### 音声

- ✅ **音楽生成**: テキストから音楽を生成。
- ✅ **音声合成**: テキストから音声へ——プリセットスタイル、声のクローン（参照音声）、または指示駆動。
- ✅ **音声認識**: 音声または動画中の発話を文字起こし。
- ⬜ **ノイズ除去**: 音声のノイズを除去。
- ⬜ **話者分離**: 話者ごとに音声を分離。
- ⬜ **音色変換**: 参照サンプルを使って音色を置き換えまたはクローン。
- ⬜ **マルチトラック / ボーカル・伴奏分離**

### 結合

- ✅ **画像融合**: 複数の参照画像を1枚に融合または編集。
- ✅ **リップシンク**: 音声 + 動画 → 動画（リップシンク）。音声 + 画像 → 動画、音声 + テキスト → 動画などのバリエーションにも対応。
- ✅ **キャラクター置換**: 動画 + 参照（シーン融合 / キャラクター置換）、Animate Mix スタイルの生成。
- ✅ **モーション転送**: 動画 + 参照（モーション / リターゲット）、Animate Move スタイルの生成。
- ✅ **テキスト結合**: 複数のテキストノードを1つに結合。

### その他

- ✅ **画像 → 3D**: 1枚の画像から3Dモデルを生成。
- ✅ **ドキュメント → テキスト**: ドキュメントからプレーンテキストを抽出。
- ✅ **リンク → テキスト**: ページの内容をテキストに変換。

### 補助ツール

- ✅ **クリップ連結**: 複数の動画を前後につなげる。
- ✅ **音声・映像の結合**: 1つのファイルに統合。
- ✅ **ショット単位で分割**: 長い動画をシーンごとに分割。
- ✅ **音声・映像の分離**: 動画を独立した映像トラックと音声トラックに分離。
- ✅ **音声トラックを抽出**: 音声を独立したアセットとして書き出す。
- ✅ **長文を分割**: 長い段落をブロックに分割。
- ✅ **テキストブロックの結合 / 整理**: 断片を結合（自動結合オプション利用可）。
- ✅ **クリップのフィルタ / 破棄**: ルールまたは手動選択で不要なクリップを破棄。
- ✅ **整列とバッチグループ化**: テキストやクリップのバッチをグループ化して整列し、下流処理に渡す。

## 公式プラグイン

> 公式のGPU/CPUプラグインは現在 [Modal](https://modal.com) 上で動作しています——毎月最大 **$30** 分の無料GPU演算（H100/A100など）。`MODAL_TOKEN_*` の設定は [Step 2](#step-2--プラグインをインストール) を参照してください。他のどのプラットフォームでも同じ方法で自分のプラグインを公開できます。

### API プラグイン

- [tongflow-api-openrouter-free](https://github.com/tong-io/tongflow-api-openrouter-free) — デフォルトの `gen_text` ルート、OpenRouter の無料モデルを使用
- [tongflow-api-gemini](https://github.com/tong-io/tongflow-api-gemini) — Google Gemini ベースの `gen_text` およびマルチモーダル処理
- [tongflow-api-openai](https://github.com/tong-io/tongflow-api-openai) — OpenAI ベースの `gen_text` および画像生成 / 編集 / 融合（`gpt-image-2`）

### GPU/CPU プラグイン

- [tongflow-modal-ffmpeg](https://github.com/tong-io/tongflow-modal-ffmpeg) — トランスコード、ミキシング、メディア処理パイプライン
- [tongflow-modal-pyscenedetect](https://github.com/tong-io/tongflow-modal-pyscenedetect) — ショット境界の検出、クリップ分割用
- [tongflow-modal-z-image](https://github.com/tong-io/tongflow-modal-z-image) — Z-Image テキストから画像生成
- [tongflow-modal-ernie-image](https://github.com/tong-io/tongflow-modal-ernie-image) — ERNIE Image テキストから画像生成（代替）
- [tongflow-modal-flux2-klein9b](https://github.com/tong-io/tongflow-modal-flux2-klein9b) — FLUX.2 Klein 9B マルチ参照融合と画像編集
- [tongflow-modal-ltx](https://github.com/tong-io/tongflow-modal-ltx) — LTX-2.3 テキスト / 画像から動画生成
- [tongflow-modal-infinitetalk](https://github.com/tong-io/tongflow-modal-infinitetalk) — InfiniteTalk 音声駆動リップシンク（音声 + 画像 / 動画 → デジタルヒューマン動画）
- [tongflow-modal-wan-animate](https://github.com/tong-io/tongflow-modal-wan-animate) — Wan-Animate キャラクター置換とモーション転送（動画 + 参照）
- [tongflow-modal-scail2](https://github.com/tong-io/tongflow-modal-scail2) — SCAIL-2 制御可能なキャラクターアニメーション（画像 + 駆動動画；wan-animate と同じ 2 スロット）
- [tongflow-modal-triposplat](https://github.com/tong-io/tongflow-modal-triposplat) — TripoSplat 1 枚の画像から 3D ガウシアンスプラット
- [tongflow-modal-seedvr2](https://github.com/tong-io/tongflow-modal-seedvr2) — SeedVR2 画像 / 動画の超解像
- [tongflow-modal-gemma4](https://github.com/tong-io/tongflow-modal-gemma4) — Gemma-4 マルチモーダルテキスト（画像 / 動画理解）
- [tongflow-modal-qwen3asr](https://github.com/tong-io/tongflow-modal-qwen3asr) — Qwen3 音声認識
- [tongflow-modal-qwen3tts](https://github.com/tong-io/tongflow-modal-qwen3tts) — Qwen3 テキストから音声
- [tongflow-modal-whisper](https://github.com/tong-io/tongflow-modal-whisper) — Whisper 音声認識（タイムスタンプ付き、代替）
- [tongflow-modal-ace-step](https://github.com/tong-io/tongflow-modal-ace-step) — ACE-Step テキストから音楽生成
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

**`http://localhost:3000`** を開けば、キャンバスがすぐに使えます。プラグインのインストールと設定は上記の Step 2–4 と同じです（認証情報はアプリ内の**設定**ダイアログ、またはプロジェクトの `.env` に入力）。

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

## カスタムプラグイン

キャンバス上で動作するすべてのノードの背後には、**契約**——ABI（[`config/tongflow.abi.json`](../config/tongflow.abi.json)）があります。これは「どんな能力があるか」と「各能力の入出力がどんな形か」を定義し、「誰が実装するか」とは無関係です。プラグインとは小さなPythonパッケージで、ABI の中の1つまたは複数のスロットを選び、tongflow Python SDK を使って、ABI から生成された型で**どう実装するか**の部分を提供します。

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
- **VC**：[tongflow.com](https://tongflow.com) のクラウドAIスタジオでの協業をぜひご相談ください。

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

## Star 履歴

<a href="https://www.star-history.com/?repos=tong-io%2Ftongflow&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=tong-io/tongflow&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=tong-io/tongflow&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=tong-io/tongflow&type=date&legend=top-left" />
 </picture>
</a>
