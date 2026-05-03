# Tongflow 动态插件机制：现状梳理与全方位改进计划

## Context

Tongflow 当前的插件体系由三个仓库协作：

- `openflow`（Node/TS 编排器）—— 持有 ABI、注册表加载、task 调度、runner 实现；
- `tongflow-sdk`（Python 包）—— 提供 `@node_slot` 装饰器、ABI 派生常量与类型、扫描器；
- `tongflow-plugins`（Python 实现集合）—— 每个插件一个目录，遵循 Modal 或 LLM 两种约定。

随着插件数量增加（25 个仓内插件，44 个 nodeSlot），现有设计的几个早期决策逐渐显现成本：ABI 字段过载且部分不参与运行时；`plugins.registry.json` 作为生成物入库带来双重事实来源；TS 端缺少从 ABI 派生的强类型，ReactFlow 节点的 handler 输入输出实际上是 `any`；插件元数据散落在多个位置（**Modal `deploy.py` 里短 `APP_NAME` 与 `pluginId` 不一致导致多目录撞同一个 Modal app**、**已计划移除的** `tongflow.plugin.json` 等）。**约定**：`pluginId` = 插件目录名（即 repo 名）；Modal app name 由目录名自动派生，则从源头消灭「同 app 多目录」与扫描器 dedupe；**runner** 继续由 `pluginId` 的**严格前缀**推导（`tongflow-modal-*` → modal，`tongflow-llm-*` → llm），并禁止 `gpu/cpu` 硬件前缀；LLM provider 不再作为 registry `engine` 透传。**目标**：Python 实现 + AST 扫描为行为真相；**不再维护 per-plugin JSON manifest**，**不引入** `PLUGIN_REGISTRY_PRIORITY` / `SUPERSEDES` 等额外常量负担。

本文档：
- **Part 1** 先把现有机制梳理清楚（含代码引用）；
- **Part 2** 列出梳理过程中确认的问题；
- **Part 3** 给出分阶段的全方位改进计划。

---

# Part 1 · 现状梳理

## 1.1 三层结构总览

```
┌─────────────────────────────────────────────────────────────┐
│  契约层：ABI                                                 │
│  config/tongflow.abi.json  ←派生→  tongflow/node_slots.py    │
│                            ←派生→  (TS 端目前无生成类型)     │
└─────────────────────────────────────────────────────────────┘
                             │
                 ┌───────────┴───────────┐
                 ▼                       ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  插件实现层（Python）     │  │  编排层（Openflow / TS）   │
│  tongflow-plugins/*/      │  │  src/lib/tongflow-abi.ts │
│  - tongflow-modal-*/      │  │  src/lib/feature-registry│
│    deploy.py + download.py│  │                          │
│  - tongflow-llm-*/entry.py│  │                          │
│  依赖 SDK：@node_slot      │  │                          │
└──────────────────────────┘  └──────────────────────────┘
                 │                       │
                 ▼                       ▼
       ┌───────────────────────────────────────────┐
       │  扫描器（构建期，跨语言）                  │
       │  tongflow-sdk/tongflow/scan.py            │
       │  → .tongflow/plugins.registry.json (入库) │
       └───────────────────────────────────────────┘
                             │
                             ▼
       ┌───────────────────────────────────────────┐
       │  执行层（运行期）                          │
       │  src/lib/plugin-executor/execute.ts       │
       │  ├─ runners/modal.ts  → modal CLI + RPC   │
       │  └─ runners/llm.ts    → 子进程 + NDJSON   │
       └───────────────────────────────────────────┘
```

## 1.2 ABI 契约层

### 文件：[config/tongflow.abi.json](/Users/tongcao/startup/openflow/config/tongflow.abi.json)

每个节点条目的字段（[行 18-38 示例](/Users/tongcao/startup/openflow/config/tongflow.abi.json#L18-L38)）：

| 字段 | 实际作用 |
|---|---|
| `nodeSlot` | 槽位 id —— **真正的主键** |
| `featureName` | 几乎所有节点 == `nodeSlot`，仅 UI 拿来当 label |
| `defaultHandler.{type, function}` | 仅 [feature-registry.ts:23-24](/Users/tongcao/startup/openflow/src/lib/feature-registry.ts#L23-L24) 用作 UI 元数据；**不参与调度**（调度走 `nodePluginMap`） |
| `processingTime` | 在任何 runner 都没有被用作超时/调度参数 |
| `taskPromptSchema` | 绝大多数 `additionalProperties: true` 的空 schema |
| `resultSchema` | 同上 |
| `inputs` / `outputs` | **只**有 `transcribe` / `transcribe_timestamp` 真正定义（[行 158-241](/Users/tongcao/startup/openflow/config/tongflow.abi.json#L151-L241)） |
| `$defs.Asset` | 全文件只被引用一次 |

### TS 端加载：[src/lib/tongflow-abi.ts](/Users/tongcao/startup/openflow/src/lib/tongflow-abi.ts)

- [行 25-32](/Users/tongcao/startup/openflow/src/lib/tongflow-abi.ts#L25-L32) zod 校验 + 构建 `bySlot` / `byFeature` 哈希；
- 暴露 `getAbiNodeBySlot()` / `getAbiNodeByFeatureName()`；
- ABI 在 TS 这边只做 shape 校验和元数据查询，**不参与调度**。

### Python 端镜像：[tongflow-sdk/tongflow/node_slots.py](/Users/tongcao/startup/tongflow-sdk/tongflow/node_slots.py)

- ABI 派生常量类（[行 19-65](/Users/tongcao/startup/tongflow-sdk/tongflow/node_slots.py#L19-L65)）：`NodeSlots.GEN_TEXT = 'gen_text'`；
- `_slot_to_ident()`：把 `'speech-text-gen-video'` ↔ `SPEECH_TEXT_GEN_VIDEO`，给扫描器做反查。

## 1.3 Python SDK

| 文件 | 作用 |
|---|---|
| [tongflow/slots.py](/Users/tongcao/startup/tongflow-sdk/tongflow/slots.py) | `@node_slot(*slots)` —— **运行时 no-op**，仅供 AST 静态识别 |
| [tongflow/node_slots.py](/Users/tongcao/startup/tongflow-sdk/tongflow/node_slots.py) | ABI 派生常量 |
| `tongflow/models/*` | 每 slot 一对 `*Input` / `*Output` TypedDict（生成自 ABI） |
| [tongflow/protocol.py](/Users/tongcao/startup/tongflow-sdk/tongflow/protocol.py) | `TaskPayload`、`HandlerResult`、`InferenceProtocol` |
| [tongflow/scan.py](/Users/tongcao/startup/tongflow-sdk/tongflow/scan.py) | 扫描器入口（CLI 输出 JSON 到 stdout） |
| [tongflow/parse_deploy.py](/Users/tongcao/startup/tongflow-sdk/tongflow/parse_deploy.py) | Modal `deploy.py` 的 AST 解析器 |

### Modal 插件模板（[tongflow-modal-docling/deploy.py](/Users/tongcao/startup/tongflow-plugins/tongflow-modal-docling/deploy.py)）

```python
import modal
from tongflow import current_app

app = current_app(__file__)

@app.cls(image=...)
class Inference:
    @modal.method()
    @node_slot(NodeSlots.PARSE_DOCUMENT)
    def parse_document(self, input: ParseDocumentInput) -> ParseDocumentOutput: ...
```

扫描器要求三件事：
1. 目录名使用 `tongflow-modal-*` 前缀，且根目录有 `deploy.py`；
2. `deploy.py` 内存在 `@app.cls` 类的 `@node_slot(NodeSlots.XXX)` 方法；
3. **形似** `*Input`/`*Output` 后缀的注解（**只看名字后缀**，[parse_deploy.py:102-110](/Users/tongcao/startup/tongflow-sdk/tongflow/parse_deploy.py#L102-L110)）。

### LLM 插件模板（[tongflow-llm-openai-text/entry.py](/Users/tongcao/startup/tongflow-plugins/tongflow-llm-openai-text/entry.py)）

- 直接是 CLI 入口；约定 stdin 收 JSON、stdout 写 NDJSON 事件流（`reasoning`/`answer`/`completed`/`error`），由 [runners/llm.ts:11-15](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/llm.ts#L11-L15) 解析。
- runner 由 `tongflow-llm-*` 前缀判定；provider 不再作为 registry `engine` 字段透传。

## 1.4 扫描机制

`scan(plugins_root, abi_path)`（[scan.py:166-367](/Users/tongcao/startup/tongflow-sdk/tongflow/scan.py#L166-L367)）：

1. 遍历 `plugins/*`，严格按 `tongflow-modal-*` / `tongflow-llm-*` 前缀决定 runner 类型，并校验 `deploy.py` / `entry.py` 文件结构；
2. **Modal 分支**：解析 `deploy.py` AST → 抽 `@app.cls` 类 + `@node_slot` 方法；`appName` 直接等于目录名（即 pluginId），不再解析 `APP_NAME`，也不做同 app dedupe；
3. **LLM 分支**：递归扫描 `*.py` 找 `@node_slot` 函数；不再推断或透传 `engine`；
4. 输出 `{nodePluginMap, plugins[pluginId], errors}` JSON 到 stdout。

## 1.5 注册表（落盘）

- 位置：[.tongflow/plugins.registry.json](/Users/tongcao/startup/openflow/.tongflow/plugins.registry.json)（**入库 git**）
- Schema：[plugins-registry-schema.ts](/Users/tongcao/startup/openflow/src/lib/plugins-registry-schema.ts)
- 加载：[plugins-registry.server.ts:33-56](/Users/tongcao/startup/openflow/src/lib/plugins-registry.server.ts#L33-L56)（仅 prod 内存缓存，dev 每次 IO，无 file watcher）

`nodePluginMap[slot]` 是数组（一槽多插件），UI 选择某 pluginId 注入到 `task.prompt.pluginId`。

## 1.6 执行链路

[execute.ts:6-24](/Users/tongcao/startup/openflow/src/lib/plugin-executor/execute.ts#L6-L24) 按 `cfg.runner` 分发：

- **modal** → [runners/modal.ts:execModalPlugin](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts#L366-L448)：
  1. `embedLocalUploadsForModal` 内联本地上传；
  2. `runModalDownloadPlugin`（每次都跑）；
  3. dev 期 `runModalDeployPlugin`（每次都跑）；
  4. `ModalClient.cls.fromName(appName, clsName).instance().method(methodName).spawn([input])`；
  5. `persistBase64AssetIfPresent` 字段名嗅探落盘。
- **llm** → [runners/llm.ts:execLlmPlugin](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/llm.ts#L64)：
  1. `spawn(python, [entry.py])` + PYTHONPATH 注入 SDK；
  2. stdin 投 payload；
  3. stdout 按 NDJSON 解析事件，转 SSE 通过 `notifyTask` 推送。

## 1.7 端到端示例：`transcribe` → `tongflow-modal-qwen3asr`

```
[ABI]      tongflow.abi.json:151
           nodeSlot=transcribe  defaultHandler={type:gpu, function:qwen3-asr}（仅元数据）

[Python]   plugins/tongflow-modal-qwen3asr/deploy.py
           app = current_app(__file__)  # Modal app name 由目录名 / pluginId 派生
           class Inference:
               @modal.method() @node_slot(NodeSlots.TRANSCRIBE)
               def transcribe(self, input: TranscribeInput) -> TranscribeOutput: ...

[Scan]     tongflow.scan plugins/ → plugins.registry.json
           nodePluginMap.transcribe = ["tongflow-modal-whisper", "tongflow-modal-qwen3asr"]
           plugins["tongflow-modal-qwen3asr"].runners.modal = {
               appName: "tongflow-modal-qwen3asr", clsName: "Inference",
               methodsByNodeSlot.transcribe.methodName:"transcribe"
           }

[UI→API]   useNodePluginIds("transcribe") → 列表；用户/默认选 → POST /api/task/create

[Run]      task-runner → executePlugin → execModalPlugin
           → ModalClient.cls.fromName(...).instance().method("transcribe").spawn([input])
           → 持久化资产 → notifyTask SSE → UI
```

---

# Part 2 · 现存问题清单

## A. 设计层问题（影响契约清晰度）

### A1. ABI 字段过载

| 字段 | 评估 | 处理 |
|---|---|---|
| `featureName` | 与 `nodeSlot` 99% 重复，仅 UI 偶用 | **删** |
| `defaultHandler.{type,function}` | 不参与调度，仅给 UI 元数据 | **删**（用注册表派生即可） |
| `processingTime` | 无人使用 | **删** |
| `taskPromptSchema` / `resultSchema` | 绝大多数空 | **删**，统一用 `inputs`/`outputs` |
| `inputs` / `outputs` | 只有 2/44 节点有真定义 | **强制全部填写** |
| `$defs.Asset` | 仅 1 处引用 | 保留，但所有 binary IO 都用它 |

**目标形态**：

```jsonc
{
  "nodeSlot": "transcribe",
  "inputs":  { "type":"object", "required":["audio"], "properties":{...} },
  "outputs": { "type":"object", "required":["text"],  "properties":{...} }
}
```

### A2. `plugins.registry.json` 落盘冗余

- **双重事实来源**：`plugins/*` 源码是事实，注册表是其缓存还入库 git；
- `pnpm plugins:sync` 是手动步骤，dev 易忘；
- schema 自身就重复（[行 48 + 50](/Users/tongcao/startup/openflow/src/lib/plugins-registry-schema.ts#L46-L60) `methodsByNodeSlot` 顶层和 `runners.modal` 各一份）；
- `generatedAt` 时间戳每次扫描都变，污染 diff。

### A3. `tongflow.plugin.json` 冗余且误导

每个插件目录可能有一份（历史/文档用途），但 [scan.py](/Users/tongcao/startup/tongflow-sdk/tongflow/scan.py) **不读取**；真相已在目录名（`pluginId` / Modal app name / runner 前缀）、`deploy.py` / `entry.py` 的 AST（`@node_slot(NodeSlots.*)` + `*Input`/`*Output`）。保留 JSON 容易造成「以谁为准」的二次维护。**Phase 1.2 决策：删除该文件，以代码 + 扫描为唯一契约面。**

### A4. Modal `APP_NAME` 与 `pluginId` 不一致导致假「去重」

- **runner**：由 `pluginId` 的严格前缀解析（`tongflow-modal-*` / `tongflow-llm-*`），并与 `deploy.py` / `entry.py` 文件结构交叉校验；LLM provider 不再作为 `engine` 透传。
- **同 `APP_NAME` 多目录**：多个目录曾写 **同一短 `APP_NAME`**（例：旧 ASR 目录都曾用 `"qwen3-asr"`），扫描器只得按排序丢掉其一；排序键还曾依赖 pluginId 里 `gpu`/`cpu` 等片段，易误判。
- **收口（无额外常量）**：**Modal app name 由 `pluginId`（目录名）自动派生** → 每插件唯一 Modal app → **无需** dedupe、**不需要** `PLUGIN_REGISTRY_PRIORITY` / `SUPERSEDES`。**代价**：Modal app 名变长；需迁移 `modal deploy` 与编排侧仍按旧短名引用 Modal 的代码/配置。

### A5. TS 端类型断层

- Python 侧：`tongflow.models.*Input/Output` TypedDict 强类型；
- TS 侧：`taskPromptSchema/resultSchema` 是 `z.unknown()`（[tongflow-abi.ts:12-13](/Users/tongcao/startup/openflow/src/lib/tongflow-abi.ts#L12-L13)）；
- ReactFlow 节点 `data` 等价于 `any`，连线无类型校验；
- `executePlugin(req)` 的 `req.input` 是 `Record<string, unknown>`。

→ 用户已经感知的问题。**前提是 A1 让 inputs/outputs 全填**。

### A6. `runner: "batch"` 是死路

ABI 里 `drop_video`、`arrange_group` 声明 `type:"batch"`（[abi.json:1100-1124](/Users/tongcao/startup/openflow/config/tongflow.abi.json#L1100-L1124)），但 `plugin-executor/runners/` 只有 `modal.ts` 和 `llm.ts`，**没有 batch runner**。命中即抛 "Unsupported runner"。

### A7. `pluginId` 注入 `task.prompt`

编排选择（用哪个插件）和业务输入（参数）混在同一个 dict 里。schema 校验无法严格拒绝陌生字段。

## B. 鲁棒性 / 性能

### B1. Python 强类型只是字符串后缀匹配

`_looks_like_sdk_model_type` 只看 `Input`/`Output` 名字后缀（[parse_deploy.py:102-110](/Users/tongcao/startup/tongflow-sdk/tongflow/parse_deploy.py#L102-L110)）。本地随便 `class FakeInput: pass` 也通过。

### B2. `@node_slot` 是 no-op

[slots.py:11-17](/Users/tongcao/startup/tongflow-sdk/tongflow/slots.py#L11-L17) 不做记录、不做校验。运行时 0 信号。

### B3. dev 每次请求都 redeploy

[modal.ts:395-398](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts#L395-L398)：`if NODE_ENV !== "production"` 每次都 `runModalDeployPlugin`。`modal deploy` 是分钟级。

### B4. `download` 在每次任务执行前都跑

[modal.ts:391](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts#L391-L398)：插件生命周期混进了任务执行链路。

### B5. 取消任务即销毁容器

[modal.ts:70-71](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts#L70-L71) `cancel({terminateContainers:true})`。下个用户冷启动再付一次模型加载成本。

### B6. Asset 落盘靠字段名嗅探

[modal.ts:280-364](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts#L280-L364) 顺序猜 `output_bytes` → `outputs[]` → `*_base64`。每个插件作者要记 ad-hoc 字段名。

### B7. LLM NDJSON 协议没有 SDK 化

每个 `tongflow-llm-*/entry.py` 都自己写 stdin 读 + stdout NDJSON 循环。

### B8. dev 注册表无 watcher

[plugins-registry.server.ts:34](/Users/tongcao/startup/openflow/src/lib/plugins-registry.server.ts#L34)：仅 prod 缓存，dev 每次 IO 但无 watcher，写完插件必须 `pnpm plugins:sync` 才生效。

## C. 卫生 / 一致性

### C1. 大量 `@deprecated` 别名

`getNodePluginRepos`、`getModalRepoConfig`、`ModalPluginRepo`（[plugins-registry.server.ts:73,95](/Users/tongcao/startup/openflow/src/lib/plugins-registry.server.ts#L73)）从 "repo" 时代留下。

### C2. nodeSlot 命名风格混乱

下划线和短横线混用：`gen_text` / `image-image-gen-video` / `wan-animate-mix`。

### C3. `version: 1` literal 无兼容性策略

[tongflow-abi.ts:17](/Users/tongcao/startup/openflow/src/lib/tongflow-abi.ts#L17) 死锁 v1，未来加/删字段必崩。

### C4. 没有 plugin-level 能力差异声明

同 nodeSlot 不同插件支持的子集可能不同（如 whisper 100 语言 vs qwen3-asr 10 语言）。UI 不能按选中插件动态裁剪表单。

---

# Part 3 · 全方位改进计划

按"先解锁基础设施 → 再贯通类型 → 再优化运行时 → 最后清理"的顺序分四阶段。每阶段独立可发布、可回滚。

## Phase 1 · 基础重构（解锁后续所有改动）

> **目标**：契约瘦身、单一来源、内存化注册表。

### 1.1 ABI 瘦身

**改动文件**：
- [config/tongflow.abi.json](/Users/tongcao/startup/openflow/config/tongflow.abi.json)
- [src/lib/tongflow-abi.ts](/Users/tongcao/startup/openflow/src/lib/tongflow-abi.ts)
- [src/lib/feature-registry.ts](/Users/tongcao/startup/openflow/src/lib/feature-registry.ts) / `feature-registry.server.ts`

**步骤**：

1. **删除字段**：
   - `featureName` —— 全局 grep 替换为 `nodeSlot`（仅有 `text-gen-text.tsx:155`、`node-header.tsx:398-403` 等 UI 引用）；
   - `defaultHandler` —— 删；`feature-registry.ts:23-24` 改成从注册表派生 `type/function`（取 `nodePluginMap[slot][0]` 的插件元数据）；
   - `processingTime` —— 删；
   - `taskPromptSchema` / `resultSchema` —— 删。

2. **强制 `inputs` / `outputs`**：
   - 为剩余 42 个 nodeSlot 补 schema（先按现有 plugin 实际行为反推；transcribe 系已有可参考）；
   - 顶层 `$defs.Asset` 用于所有 binary IO（音视频/图片/原始字节）。

3. **新 zod schema**：
   ```ts
   const AbiNodeSchema = z.object({
       nodeSlot: z.string().min(1),
       inputs:  z.unknown(),  // JSON Schema, 由 ajv 在边界处校验
       outputs: z.unknown(),
   });
   ```

4. **Python `node_slots.py` 不变**（仍由 ABI 派生）；新增 `models/` 重新生成入口（已存在则更新）。

**验证**：
- `pnpm typecheck` 全绿；
- 任意触发 task → UI 显示 plugin 选项 → 调用成功（说明从注册表派生 type/function 没破）。

### 1.2 代码 + AST 为单一来源（移除 `tongflow.plugin.json`）

**原则**：插件 **Python 源码**（含 `deploy.py` / `entry.py` / 包内 `*.py`）是唯一真相；ABI 派生的 `NodeSlots` 与 `tongflow.models.*Input/*Output` 是槽位与类型的权威集合；**扫描器**据此静态发现「哪个插件实现哪些 slot、如何调度」。**不**再维护 `tongflow.plugin.json`。

**与当前实现对齐**：[`scan.py`](/Users/tongcao/startup/tongflow-sdk/tongflow/scan.py) 已（1）对 **LLM** 插件目录 rglob `*.py`，用 AST 解析 `@node_slot(NodeSlots.*)` 且要求 `*Input`/`*Output` 注解；（2）对 **Modal** 插件用 `parse_deploy_py` 读 `deploy.py` 的 `APP_NAME`、类名、`methods_by_slot`（同样来自装饰器 AST）。JSON manifest 从未参与该链路——删除它主要是去掉冗余与错误的社会契约。

**身份等式（API 表面）**：
> **目录名 == `pluginId` == Modal app name == git 仓库名**。三者运行时同构（Modal app name 由 SDK helper 从目录名自动派生，无需声明）。重命名 = 一次原子操作（改目录 + 改仓库名 + 重新部署 Modal app + 迁移 DB 历史 `pluginId`）。在 SDK README 顶部以醒目方式列出此等式。

**目录命名规范（runner 前缀 + 扁平语义名）**：
- 目录名保留 `tongflow-modal-*` / `tongflow-llm-*` 前缀，用于 scanner 明确判定 runner；前缀之后只承载"语义身份"，**不**编码硬件类型。
- ❌ `tongflow-modal-gpu-qwen3asr` / `tongflow-modal-cpu-docling` / `qwen3asr` / `openai-text`
- ✅ `tongflow-modal-qwen3asr` / `tongflow-modal-docling` / `tongflow-llm-openai-text` / `tongflow-modal-whisper` / `tongflow-modal-flux2-klein9b`
- 理由：runner 类型（modal vs llm）是插件调度契约，保留在目录名前缀中，scanner 可无歧义识别；硬件（gpu/cpu）是**实现细节**，会随实现演进（同一个 ASR 插件可能从 CPU whisper 切到 GPU qwen3asr），不能焊到目录名里。
- runner 类型由**目录前缀 + 文件结构校验**确定：`tongflow-modal-*` 必须有 `deploy.py` 且不能有 `entry.py`；`tongflow-llm-*` 必须有 `entry.py` 且不能有 `deploy.py`；两者都有 / 都没有 / 前缀与文件结构不一致 → scanner error（含明确修复建议）。
- 废弃旧的 `-modal-` 子串启发式；改为严格识别 `tongflow-modal-*` / `tongflow-llm-*` 前缀，并禁止 `tongflow-modal-gpu-*` / `tongflow-modal-cpu-*`。

**scanner / SDK 改造**：
- **删除**各 `tongflow-plugins/*/tongflow.plugin.json` **以及插件代码内对它的引用**：grep `tongflow.plugin.json` / `_cfg_local` / `_cfg_remote` / `add_local_file(.*plugin\.json)`（如 [docling/deploy.py:14-16](/Users/tongcao/startup/tongflow-plugins/docling/deploy.py#L14-L16)），同步清掉 —— 否则 modal deploy 时 `add_local_file` 找不到源文件失败。
- **彻底删除 `engine` 概念**：
    - `runner = llm` 已经告诉编排器"派子进程跑 entry.py"；entry.py 自己 import 自己的 SDK、读自己的密钥、调自己的 API —— 编排器不需要知道是哪个 provider。当前 `engine` 是循环的（plugin 声明 → scanner 抽 → orchestrator 又传回 plugin），属于"manifest 没删干净的最后一缕"。
    - 删除 `LlmEngineSchema` / `LlmMethodSchema.engine` / `_infer_llm_engine`；scanner 输出的 `runners.llm.methodsByNodeSlot[slot]` 与 modal 同形（`{methodName}`，无 engine）；
    - `runners/llm.ts` 的 stdin payload 不再透传 `engine`/`mode`（仅保留 `pluginId/nodeSlot/taskId/input/prompt`）；
    - UI 若需要 provider 标签，从 `pluginId` 字符串直接派生（如 `tongflow-llm-openai-text` → `OpenAI`），不依赖注册表。
    - 未来加新 provider（anthropic / 本地 ollama / 自托管）只需新建目录，不改 schema。
- **Modal app name 自动派生（删除 `APP_NAME` 字面量）**：
    - SDK 提供 helper：`from tongflow.modal_app import current_app; app = current_app(__file__)` —— helper 内部用 `Path(__file__).parent.name` 作为 modal app 名。
    - 各 `deploy.py` 删除 `APP_NAME = "..."` 顶层赋值，改为 `app = current_app(__file__)`。
    - scanner 不再 parse `APP_NAME`：直接用目录名（已经在遍历中拿到）作为 `appName` 字段。
    - 重命名目录 → modal app name 自动跟着变（仍需 `modal deploy` 重新部署）；不可能再出现"目录名与 app name 不一致"。
    - **不需要** `_modal_dedupe_sort_key`、`KNOWN_LEGACY_MISMATCH` 白名单、`PLUGIN_REGISTRY_PRIORITY` 等任何兼容/优先级机制。
- **一次性重构，无渐进迁移**：当前仅 25 个插件，单 PR 完成全部目录重命名（保留 `tongflow-modal-*` / `tongflow-llm-*` runner 前缀，删除 `gpu/cpu` 硬件前缀）+ helper 切换 + 旧 Modal app 清理。不留时间窗、不留白名单。
- **dedupe 路径**：直接删除 `_modal_dedupe_sort_key` 整段。两个不同目录天然不可能同名，dedupe 的前提条件不存在。
- **`parse_deploy.py`**：删除 `APP_NAME` / 正则 fallback / 字面量抽取相关分支；保留 `@app.cls` 类与 `@node_slot` 方法的 AST 解析逻辑（这些仍是 source of truth）。
- **`pluginId`**：默认 `plugins_root` 下**目录名**（与编排侧一致）。
- **scanner 错误诊断**：所有报错统一格式 `<file>:<line>: <reason>; fix: <hint>`，必带文件路径、行号、可执行的修复建议。删 manifest 后所有报错只能来自源码，错误信息就是开发者唯一的诊断面。
- **未来 plugin-level metadata 的扩展通道**：若将来需要 capabilities（如 whisper vs qwen3-asr 支持的语言列表）/ supersedes / processingTimeSeconds 等，**统一通过 `deploy.py`/`entry.py` 顶层 `UPPER_CASE` 字面量声明，scanner AST 抽**。**禁止**再引入 JSON 配置文件。

**验证**：
- `python -m tongflow.scan` 输出对比迁移前后：所有 `appName` 等于目录名、`engine` 字段消失、无 `errors[]` 中的 dedupe 省略；
- 故意破坏 `deploy.py`（缺 `@node_slot` / 同时存在 `deploy.py` 和 `entry.py` / 两者都没有）→ scanner 各报清晰错误，错误信息含文件路径+行号+修复建议；
- `modal app list` 验证旧名 Modal app（如 `qwen3-asr`）已被清理，新名（如 `qwen3asr`）已部署。

### 1.3 注册表 in-memory 化（删 `.tongflow/plugins.registry.json`）

**改动文件**：
- [src/lib/plugins-registry.server.ts](/Users/tongcao/startup/openflow/src/lib/plugins-registry.server.ts)
- 新增 `src/lib/plugins-scanner.server.ts`
- 删除 `.tongflow/plugins.registry.json` 并加进 `.gitignore`
- 移除 `pnpm plugins:sync` 脚本（或改为只是 dump 调试用）

**架构**：

```
loadPluginsRegistry()  ← 唯一入口
        │
        ├── prod: 启动期一次性 spawn `tongflow.scan` → 内存
        │
        └── dev:  启动期 spawn 一次 + chokidar watch
                  plugins/**/{deploy.py, entry.py, *.py}
                  变更时重跑 scanner，原子替换内存
```

**实现要点**：

```ts
// src/lib/plugins-scanner.server.ts
import { spawnSync } from "node:child_process";
import { resolvePython } from "@/lib/modal-deploy-workers";

export async function runPluginsScanner(): Promise<PluginsRegistry> {
    const python = await resolvePython();
    const result = spawnSync(
        python,
        ["-m", "tongflow.scan", "--root", "plugins", "--abi", "config/tongflow.abi.json"],
        { encoding: "utf8", env: { ...process.env, PYTHONPATH: "plugins/tongflow" } },
    );
    if (result.status !== 0) throw new Error(`scanner failed: ${result.stderr}`);
    return PluginsRegistrySchema.parse(JSON.parse(result.stdout));
}

// src/lib/plugins-registry.server.ts
let cached: PluginsRegistry | null = null;

export async function loadPluginsRegistry(): Promise<PluginsRegistry> {
    if (cached) return cached;
    cached = await runPluginsScanner();
    if (process.env.NODE_ENV !== "production") {
        const watcher = chokidar.watch(
            ["plugins/**/deploy.py", "plugins/**/entry.py", "plugins/**/*.py"],
            { ignoreInitial: true },
        );
        watcher.on("all", debounce(async () => {
            try { cached = await runPluginsScanner(); }
            catch (e) { logger.warn("[plugins] rescan failed:", e); }
        }, 300));
    }
    return cached;
}
```

**所有调用方改成 `await loadPluginsRegistry()`**：
- `getNodePluginIds`、`getPluginConfig`、`getModalPluginConfig`、`getLlmPluginConfig` 均改为 async，或在启动时 hydrate 一次后改为同步访问 cache（推荐后者，减少散点 await）。

**验证**：
- 干删 `.tongflow/`，启动 server → 正常工作；
- dev 下编辑 plugin 后 < 1s 内 `getNodePluginIds` 返回更新；
- 故意写坏单个插件的 `deploy.py` / `entry.py`（语法或缺 slot 注解）→ 控制台报错，但其他插件仍可用。

### 1.4 同时清理 schema 重复

[plugins-registry-schema.ts:46-60](/Users/tongcao/startup/openflow/src/lib/plugins-registry-schema.ts#L46-L60)：删掉 `ModalPluginSchema` / `LlmPluginSchema` 顶层的 `methodsByNodeSlot`，只保留 `runners.{modal|llm}.methodsByNodeSlot`。

---

## Phase 2 · 端到端类型贯通

> **目标**：让 ReactFlow 节点的 input/output 在编译期类型化。

依赖 Phase 1.1（inputs/outputs 必填）。

### 2.1 TS 类型生成器

**新增**：`scripts/gen-abi-types.ts`（构建期跑，输出到 `src/generated/abi/`）

输入：`config/tongflow.abi.json`
输出：
```ts
// src/generated/abi/index.ts
export type NodeSlot = "gen_text" | "transcribe" | ...;

export type GenTextInput = { text: string; userPrompt?: string; ... };
export type GenTextOutput = { text: string };
// ... per slot

export type SlotInput<S extends NodeSlot> =
    S extends "gen_text" ? GenTextInput :
    S extends "transcribe" ? TranscribeInput :
    ...;
export type SlotOutput<S extends NodeSlot> = ...;

export const ABI_NODES: Record<NodeSlot, { inputs: JSONSchema; outputs: JSONSchema }> = {...};
```

实现工具：用 [json-schema-to-ts](https://github.com/ThomasAribart/json-schema-to-typescript-lite) 或 `quicktype`。

集成 `pnpm build` / `pnpm dev` 前置。

### 2.2 ReactFlow handle 类型化

**改动**：节点组件 + ReactFlow 配置

```ts
import type { Node } from "@xyflow/react";
import type { NodeSlot, SlotInput, SlotOutput } from "@/generated/abi";

export type TongflowNode<S extends NodeSlot> = Node<{
    nodeSlot: S;
    pluginId?: string;
    input: Partial<SlotInput<S>>;     // 编辑中可缺字段
    output?: SlotOutput<S>;
}>;

// 连线兼容性（新增 src/lib/connection-validator.ts）
export function isCompatibleConnection(
    sourceSlot: NodeSlot, targetSlot: NodeSlot, targetField: string
): boolean {
    const out = ABI_NODES[sourceSlot].outputs;
    const inField = ABI_NODES[targetSlot].inputs.properties?.[targetField];
    return jsonSchemaCompatible(out, inField);  // structural check
}
```

ReactFlow 的 `<ReactFlow isValidConnection={...}>` 接进 `isCompatibleConnection`。

### 2.3 `PluginExecRequest<S>` 泛型

[src/lib/plugin-executor/types.ts](/Users/tongcao/startup/openflow/src/lib/plugin-executor/types.ts) → 增加泛型：

```ts
export type PluginExecRequest<S extends NodeSlot = NodeSlot> = {
    pluginId: string;
    nodeSlot: S;
    input: SlotInput<S>;
    taskId: string;
    signal: AbortSignal;
};
export type PluginExecResult<S extends NodeSlot = NodeSlot> = SlotOutput<S> & {
    success: boolean;
    file_key?: string;
    error?: string;
};
```

`executePlugin`、`execModalPlugin`、`execLlmPlugin` 全部跟随泛型化。

### 2.4 边界 ajv 校验

`task/create/route.ts` 在写库前用 `ABI_NODES[slot].inputs` 跑一次 ajv 校验，把不合法 input 挡在系统外。Modal/LLM runner 返回结果时同样用 `outputs` 校验，发现违规 → 标记任务失败而不是污染下游。

---

## Phase 3 · 运行时鲁棒

### 3.1 Modal 部署缓存

**改动**：[runners/modal.ts:391-411](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts#L391-L411)

按 `sha256(deploy.py + download.py + 插件目录内参与扫描的 *.py + requirements锁定)` 在 `.tongflow/cache/deploys.json`（**这个**可以入库或不入库都行）记录已部署的指纹。

```ts
async function ensureDeployed(pluginId: string, signal: AbortSignal) {
    const fp = await pluginFingerprint(pluginId);
    if (deployCache.get(pluginId) === fp) return;
    await runModalDeployPlugin(pluginId, signal);
    deployCache.set(pluginId, fp);
}
```

dev 期改为指纹缓存命中时跳过 deploy。`download` 同理（按 `download.py` + 模型版本指纹）。

### 3.2 取消任务不销毁容器

[runners/modal.ts:70-71](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts#L70-L71)：取消时 `cancel()` 不带 `terminateContainers: true`，仅在累计超 N 次 timeout/abort 才升级。

### 3.3 Asset 一等返回类型

**改动**：
- [tongflow-sdk/tongflow/protocol.py](/Users/tongcao/startup/tongflow-sdk/tongflow/protocol.py)：新增 `Asset` TypedDict（mirror ABI `$defs/Asset`）和 helper：
  ```python
  def asset(data: bytes, *, mime: str, filename: str | None = None) -> Asset:
      return {"bytesBase64": base64.b64encode(data).decode(), "mime": mime, "filename": filename}
  ```
- 所有 plugin output 改用 `Asset` 替代裸 base64 字段；
- [runners/modal.ts:280-364](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts#L280-L364) `persistBase64AssetIfPresent` 改为递归扫描"任何符合 Asset shape 的对象"并落盘，不再字段名嗅探。

### 3.4 LLM 子进程 SDK 化

**新增 SDK 模块**：`tongflow-sdk/tongflow/llm_runner.py`

```python
def run(handler: Callable[[GenTextInput], GenTextOutput]) -> None:
    """LLM 插件入口：读 stdin，调 handler，写 NDJSON 到 stdout。"""
    payload = json.loads(sys.stdin.read())
    try:
        for event in handler(payload["input"]):
            print(json.dumps(event), flush=True)
    except Exception as e:
        print(json.dumps({"type":"error","message":str(e)}), flush=True)
        sys.exit(1)
```

每个 `tongflow-llm-*/entry.py` 简化为：

```python
from tongflow.llm_runner import run
from tongflow.slots import node_slot
from tongflow.node_slots import NodeSlots
from tongflow.models.gen_text import GenTextInput, GenTextOutput

@node_slot(NodeSlots.GEN_TEXT)
def gen_text(input: GenTextInput) -> Iterator[Event]:
    yield {"type":"reasoning", "content":"..."}
    yield {"type":"answer", "content":"..."}
    yield {"type":"completed", "result": "..."}

if __name__ == "__main__":
    run(gen_text)
```

### 3.5 真强类型校验 + `@node_slot` 元数据

**改动**：[tongflow-sdk/tongflow/slots.py](/Users/tongcao/startup/tongflow-sdk/tongflow/slots.py)

```python
def node_slot(*slots: str) -> Callable[[F], F]:
    def deco(fn: F) -> F:
        existing = getattr(fn, "__tongflow_slots__", ())
        fn.__tongflow_slots__ = existing + slots  # type: ignore[attr-defined]
        return fn
    return deco
```

容器启动时（Modal `@modal.enter()`）反查 `Inference.__dict__` 中所有 `__tongflow_slots__`，与 **构建期 scanner 写入注册的** `methodsByNodeSlot` 校验一致，不一致即拒绝启动。

`parse_deploy.py:_looks_like_sdk_model_type` 增加导入路径校验：必须来自 `tongflow.models.*`。

### 3.6 task 数据结构去耦合

**改动**：task 创建 + runner

把 `pluginId` 从 `task.prompt` 抽出来，独立成 `task.routing.pluginId`。`PluginExecRequest` 接口已经分离了 `pluginId` 和 `input`，只是上游 UI 还塞在 prompt 里 —— 这一步把 UI 端 [use-node-plugin-resolver.ts](/Users/tongcao/startup/openflow/src/hooks/use-node-plugin-resolver.ts) 与 `/api/task/create` route 之间的字段位置统一。

---

## Phase 4 · 收尾

### 4.1 删除 deprecated 别名

- `getNodePluginRepos`、`getModalRepoConfig`、`ModalPluginRepo`（[plugins-registry.server.ts:73,95](/Users/tongcao/startup/openflow/src/lib/plugins-registry.server.ts#L73)）
- 全仓 grep 调用方，改名后删除别名。

### 4.2 batch runner 决策

二选一：
- **下线**：把 `drop_video`、`arrange_group` 改成 `runner: modal`（CPU image），删 ABI 的 `batch` 选项；
- **实现**：新增 `runners/batch.ts`，约定 input 是数组、output 是数组；让插件按批次处理。

短期建议下线，长期再补。

### 4.3 nodeSlot 命名风格统一

把所有短横线 slot（`speech-text-gen-video` 等）改成下划线，一次性迁移。`_slot_to_ident` 可以删。

### 4.4 ABI 兼容性策略

[tongflow-abi.ts:17](/Users/tongcao/startup/openflow/src/lib/tongflow-abi.ts#L17) 的 `version: 1` literal 改成 `version: z.number().min(1)`，引入 `MIN_SUPPORTED_VERSION` 常量。未来加字段就涨小版本，删字段涨大版本。

---

# Part 4 · 关键文件改动清单

| 阶段 | 文件 | 操作 |
|---|---|---|
| 1.1 | [config/tongflow.abi.json](/Users/tongcao/startup/openflow/config/tongflow.abi.json) | 删 `featureName`/`defaultHandler`/`processingTime`/`taskPromptSchema`/`resultSchema`；为所有 nodeSlot 补 `inputs`/`outputs` |
| 1.1 | [src/lib/tongflow-abi.ts](/Users/tongcao/startup/openflow/src/lib/tongflow-abi.ts) | 重写 zod schema；删 `byFeature` 索引和 `getAbiNodeByFeatureName` |
| 1.1 | [src/lib/feature-registry.ts](/Users/tongcao/startup/openflow/src/lib/feature-registry.ts) | type/function 改从注册表派生 |
| 1.2 | `tongflow-plugins/**/tongflow.plugin.json` | 删除；文档/README 去引用 |
| 1.2 | [tongflow-sdk/tongflow/scan.py](/Users/tongcao/startup/tongflow-sdk/tongflow/scan.py) | 删 JSON；`appName==pluginId` 后移除 modal dedupe；保留 `tongflow-modal-*` / `tongflow-llm-*` runner 前缀并禁止 `gpu/cpu` |
| 1.2 | [tongflow-sdk/tongflow/parse_deploy.py](/Users/tongcao/startup/tongflow-sdk/tongflow/parse_deploy.py) | 保留 Modal `deploy.py` 解析；收紧校验（可选） |
| 1.3 | 新增 `src/lib/plugins-scanner.server.ts` | spawn scanner |
| 1.3 | [src/lib/plugins-registry.server.ts](/Users/tongcao/startup/openflow/src/lib/plugins-registry.server.ts) | in-memory + chokidar |
| 1.3 | 删除 `.tongflow/plugins.registry.json`；加 `.gitignore` | |
| 1.4 | [src/lib/plugins-registry-schema.ts](/Users/tongcao/startup/openflow/src/lib/plugins-registry-schema.ts) | 删顶层 `methodsByNodeSlot` 重复 |
| 2.1 | 新增 `scripts/gen-abi-types.ts` + `src/generated/abi/index.ts` | |
| 2.1 | `package.json` | scripts 加生成入口 |
| 2.2 | ReactFlow 节点组件、`src/lib/connection-validator.ts` | 类型化 + isValidConnection |
| 2.3 | [src/lib/plugin-executor/types.ts](/Users/tongcao/startup/openflow/src/lib/plugin-executor/types.ts) | 引入泛型 |
| 2.3 | [src/lib/plugin-executor/execute.ts](/Users/tongcao/startup/openflow/src/lib/plugin-executor/execute.ts) + runners | 跟随泛型 |
| 2.4 | `src/app/api/task/create/route.ts` | ajv 校验 input |
| 3.1 | [runners/modal.ts](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts) | deploy 指纹缓存 |
| 3.2 | [runners/modal.ts](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts) | 取消不销毁容器 |
| 3.3 | [tongflow-sdk/tongflow/protocol.py](/Users/tongcao/startup/tongflow-sdk/tongflow/protocol.py) | Asset + helper |
| 3.3 | [runners/modal.ts](/Users/tongcao/startup/openflow/src/lib/plugin-executor/runners/modal.ts) | 用 Asset shape |
| 3.4 | 新增 `tongflow-sdk/tongflow/llm_runner.py` | |
| 3.4 | 各 `tongflow-llm-*/entry.py` | 改用 `run(handler)` |
| 3.5 | [tongflow-sdk/tongflow/slots.py](/Users/tongcao/startup/tongflow-sdk/tongflow/slots.py) | 装饰器存元数据 |
| 4.1 | [src/lib/plugins-registry.server.ts](/Users/tongcao/startup/openflow/src/lib/plugins-registry.server.ts) | 删 deprecated alias |
| 4.2 | ABI + runners | batch 决策 |
| 4.3 | ABI + Python NodeSlots + 全仓引用 | nodeSlot 命名归一 |
| 4.4 | [src/lib/tongflow-abi.ts](/Users/tongcao/startup/openflow/src/lib/tongflow-abi.ts) | version 兼容性 |

---

# Part 5 · 验证手段

每阶段独立 PR + 独立验证：

**Phase 1 验证**：
- 单元：`pnpm typecheck` / `python -m pytest tongflow-sdk` 全绿；
- 集成：删 `.tongflow/` 启动 server → 任意 task 端到端可跑（gen_text + transcribe + image_gen 各一个）；
- dev 体验：编辑某 plugin 的 `deploy.py` / `entry.py` / 带 `@node_slot` 的模块 → 1 秒内 `/api/plugins/list` 返回更新（新增 debug endpoint 验证）。

**Phase 2 验证**：
- 故意写一个 input 字段类型错误的 task POST → 服务端返回 400 with ajv error；
- ReactFlow 拖一条不兼容的连线 → UI 拒绝；
- `pnpm typecheck` 在 ReactFlow 节点用错 input 字段时报错。

**Phase 3 验证**：
- 同 deploy.py 不变，连续触发任务 → 第 2 次开始 modal CLI 不再被 spawn；
- 取消任务 → 容器仍在 Modal 控制台显示 idle，下个任务无冷启动延迟；
- LLM 插件入口代码量从 ~80 行降到 ~15 行；
- 故意篡改容器内的 `Inference.transcribe` slot → 启动时拒绝。

**Phase 4 验证**：
- `git grep -i "deprecated"` 在 plugins-registry 相关文件零命中；
- batch slot 任务能跑通（如选择下线方案则 ABI 中已无 batch type）。

---

# Part 6 · 风险与回滚

- **Phase 1.1 ABI 瘦身**风险最大：所有 inputs/outputs 必须先填齐才能合并。回滚靠 git revert 即可，但中间状态不可发布。建议先发"补 inputs/outputs 但不删旧字段"的过渡版本，灰度后再删。
- **Phase 1.3 注册表 in-memory** 改成 async 入口：影响所有 `getXxx` 调用方。建议在 Phase 1.3 之前先做"启动期 hydrate + 同步访问 cache"小改造，避免 async 蔓延。
- **Phase 2** 类型生成器跑挂了会阻断 build：CI 里把生成器作为前置步骤，并把生成结果 commit 到 `src/generated/`（而不是 build 时再生），开发者本地 `pnpm gen:abi` 后人工 review diff。
- **Phase 3.4 LLM SDK 化** 兼容性：先在 SDK 加 `run()` helper，**不删旧风格**；逐个迁移 `tongflow-llm-*/entry.py`；全部迁完才考虑删旧契约。
- **Phase 4.3 nodeSlot 命名归一** 是 breaking change：必须协调所有现有 task 数据迁移（DB 表里有历史 `nodeSlot` 字符串）。建议放最后，且加双读期：scanner 同时接受新旧名。

---

# Part 7 · Step Checklist

> 按此清单顺序执行；每项为最小可验证单元。完成后勾选并 commit。  
> 标记说明：🔴 breaking change · 🟡 内部改造 · 🟢 兼容增强

## Phase 1 · 基础重构

### 1.1 ABI 瘦身（先增后删，分两次合并）

**1.1-A · 过渡期：补 inputs/outputs（🟢）**
- [x] 1.1-A-1 整理现有 44 个 nodeSlot，按 plugin 实际行为反推每个的 inputs/outputs schema
- [ ] 1.1-A-2 引入 `$defs/Asset` 复用，所有二进制字段统一指向它  ⏭️ **延期到 Phase 3.3-2**：`$defs/Asset` 已在 ABI 中定义，但所有 binary outputs 仍是裸 `image_base64`/`video_base64`/`audio_base64`；统一收敛为 `{"$ref": "#/$defs/Asset"}` 与 Phase 3.3「Asset 一等返回类型」同期完成
- [x] 1.1-A-3 在 `tongflow.abi.json` 中为所有 nodeSlot 补 `inputs`/`outputs`（保留旧字段不删）
- [x] 1.1-A-4 在 `tongflow-abi.ts` 的 zod schema 把 `inputs`/`outputs` 设为必填，typecheck 通过
- [x] 1.1-A-5 ABI 被 import 处运行 → 所有节点合法
- [x] 1.1-A-6 重新生成 `tongflow/models/*Input/*Output`，跑 `python -m pytest tongflow-sdk`
- [x] 1.1-A-7 提 PR：「ABI: enforce inputs/outputs for every nodeSlot」

**1.1-B · 删冗余字段（🔴）**
- [x] 1.1-B-1 全仓 grep `featureName`，UI 引用统一改为 `nodeSlot`
- [x] 1.1-B-2 删除 ABI 中的 `featureName` / `defaultHandler` / `processingTime` / `taskPromptSchema` / `resultSchema`
- [x] 1.1-B-3 `tongflow-abi.ts`：删 `byFeature` / `getAbiNodeByFeatureName` / `TranscribePluginPromptSchema` 等无用导出
- [x] 1.1-B-4 `feature-registry.ts` / `.server.ts`：type/function 改从注册表派生（取 `nodePluginMap[slot][0]` 的 plugin 元数据）
- [x] 1.1-B-5 typecheck + 整套端到端 task（gen_text / transcribe / image_gen / parse_document）跑通
- [x] 1.1-B-6 提 PR：「ABI: drop featureName/defaultHandler/processingTime/*Schema」

### 1.2 代码 + AST 单一来源（🟡）

> **整段 1.2 单 PR 完成**。25 个插件一次性重构，不留时间窗、不留白名单。

**前置：文档先行**
- [x] 1.2-1 SDK README + 插件模板：写明等式"目录名 == pluginId == Modal app name == git 仓库名"；命名规范"保留 `tongflow-modal-*` / `tongflow-llm-*` runner 前缀，禁带 `gpu/cpu` 硬件前缀"；runner 探测规则（`tongflow-modal-*` + `deploy.py` → modal；`tongflow-llm-*` + `entry.py` → llm；前缀与文件结构不一致 → error）；plugin-level metadata 未来扩展规则（顶层 `UPPER_CASE` 字面量，AST 抽，禁 JSON）

**SDK 提供 modal app helper**
- [x] 1.2-2 SDK 新增 `tongflow/modal_app.py`：导出 `current_app(file_path: str) -> modal.App`，内部用 `Path(file_path).parent.name` 作为 app 名
- [x] 1.2-3 在 `tongflow/__init__.py` re-export，方便 `from tongflow import current_app`

**彻底删除 LLM `engine` 概念**
- [x] 1.2-4 删除 `LlmMethodSchema` / `LlmPluginConfigSchema` 中的 `engine` 字段；删 `LlmEngineSchema`
- [x] 1.2-5 `runners/llm.ts` 移除 `engine`/`mode` 透传（payload 只保留 `pluginId/nodeSlot/taskId/input/prompt`）
- [x] 1.2-6 删除 `scan.py` 的 `_infer_llm_engine` 与旧 `_infer_runner` 子串启发式（runner 改为严格识别 `tongflow-modal-*` / `tongflow-llm-*` 前缀，并校验文件结构）；scanner 输出 `runners.llm.methodsByNodeSlot[slot] = { methodName }`（与 modal 同形）
- [x] 1.2-7 各插件 `entry.py` 移除对 stdin payload 中 `engine`/`mode` 的读取（如果有）
- [x] 1.2-8 UI 若需要 provider 标签，从 pluginId 直接派生（`tongflow-llm-openai-text` → `OpenAI`），不依赖注册表
- [x] 1.2-9 `feature-registry.server.ts` 的 llm 分支：`function` 字段改用 pluginId 替代原来的 engine 值

**Runner 探测改成前缀 + 文件结构校验**
- [x] 1.2-10 `scan.py` 新增 `_detect_runner(plugin_dir)`：`tongflow-modal-*` + `deploy.py` → modal；`tongflow-llm-*` + `entry.py` → llm；两者都有 / 都没有 / 前缀与文件结构不一致 → error
- [x] 1.2-11 删除旧的目录子串启发式（如 `-modal-`）；保留并严格校验 `tongflow-modal-*` / `tongflow-llm-*` 前缀，禁止 `tongflow-modal-gpu-*` / `tongflow-modal-cpu-*`

**目录重命名（保留 runner 前缀，去硬件前缀）**
- [x] 1.2-12 设计新目录名清单：`tongflow-modal-Qwen3-ASR` + `tongflow-modal-gpu-qwen3asr` 合并为 `tongflow-modal-qwen3asr`；`tongflow-modal-cpu-docling` → `tongflow-modal-docling`；`tongflow-llm-openai` → `tongflow-llm-openai-text`；其余照此去掉 `gpu/cpu` 硬件前缀（在 PR description 列出完整 25 项映射表）
- [x] 1.2-13 git mv 各插件目录到新名（每个目录一次 commit，便于 review）
- [x] 1.2-14 删除各 `deploy.py` 的 `APP_NAME = "..."` 顶层赋值；改为 `app = current_app(__file__)`
- [x] 1.2-15 删除 `parse_deploy.py` 中的 `APP_NAME` 字面量抽取 + 正则 fallback 分支；scanner 直接用目录名作为 `appName`
- [x] 1.2-16 删除 `_modal_dedupe_sort_key` 整段（前提条件已不存在，无须保留 defensive）

**清理 tongflow.plugin.json 引用**
- [x] 1.2-17 grep `tongflow.plugin.json` / `_cfg_local` / `_cfg_remote` / `add_local_file\(.*plugin\.json` 在 `tongflow-plugins/**/*.py` 中的所有引用并清掉（参考 [docling/deploy.py:14-16](/Users/tongcao/startup/tongflow-plugins/docling/deploy.py#L14-L16)）
- [x] 1.2-18 删除各插件目录下的 `tongflow.plugin.json` 文件
- [x] 1.2-19 README / 插件模板移除对该 JSON 的所有提及

**Scanner 错误诊断**
- [x] 1.2-20 重写 `scan.py` / `parse_deploy.py` 错误返回：统一格式 `<file>:<line>: <reason>; fix: <hint>`，覆盖所有失败路径

**Modal 旧 app 清理**
- [x] 1.2-21 在 Modal 控制台 / `modal app list` 比对：删除被重命名后的旧 app（如 `qwen3-asr` 旧名）；用新名重新部署
- [x] 1.2-22 重新跑一遍 download（每个新名 `modal run download.py::download`）确认模型权重在新 volume / app 下可用

**DB / 编排侧迁移**
- [x] 1.2-23 调研 `task` / `node` 等表是否存历史 `pluginId`；若存在，写一次性 SQL migration 同步重命名（旧名 → 新名映射表来自 1.2-12）  *(应用层 `src/utils/migrate-workflow-nodes.ts` 兜底转换，免做 DB migration)*
- [x] 1.2-24 openflow / Modal CLI / 其他仍写死旧 `appName` 或旧 pluginId 的代码处全部跟到新名

**破坏性测试**
- [x] 1.2-25 缺 `@node_slot` / 同时存在 `deploy.py` 和 `entry.py` / 两者都没有 / 缺 `*Input`/`*Output` 注解 → scanner 各报清晰错误（含路径+行号+修复建议）
- [x] 1.2-26 端到端验证：`tongflow-modal-docling` / `tongflow-modal-qwen3asr` / `tongflow-llm-openai-text` 各跑一个 task 通过

**收尾**
- [x] 1.2-27 提 PR：「plugins: flatten directory names; auto-derive modal app name; drop engine; drop tongflow.plugin.json; AST as single source of truth」

### 1.3 注册表 in-memory 化（🟡）

- [x] 1.3-1 新增 `src/lib/plugins-scanner.server.ts`：spawn `python -m tongflow.scan` → 解析 stdout
- [x] 1.3-2 改 `loadPluginsRegistry` 为启动期 hydrate + 同步 cache（避免 async 蔓延到全仓）
- [x] 1.3-3 dev 模式接 chokidar watch `plugins/**/{deploy.py,entry.py,*.py}` + debounce 300ms
- [x] 1.3-4 加 watch 失败/scan 失败的容错日志
- [x] 1.3-5 删除 `.tongflow/plugins.registry.json`
- [x] 1.3-6 在 `.gitignore` 加 `.tongflow/`
- [x] 1.3-7 删除 `LEGACY_PATH` (`config/plugins.registry.json`) 兼容代码
- [x] 1.3-8 删除 `pnpm plugins:sync`（或改为 debug 用 dump 子命令）
- [x] 1.3-9 干删 `.tongflow/` 启动 server → 任意 task 端到端可跑
- [x] 1.3-10 dev 编辑 plugin 的 deploy/entry/含 slot 的 py → 1s 内调试端点返回更新
- [x] 1.3-11 提 PR：「plugins-registry: in-memory + dev file watcher」

### 1.4 Schema 重复清理（🟡）

- [x] 1.4-1 `plugins-registry-schema.ts`：从 `ModalPluginSchema` / `LlmPluginSchema` 删除顶层 `methodsByNodeSlot`
- [x] 1.4-2 `scan.py` 输出对应去重
- [x] 1.4-3 调用方改读 `plugin.runners.{modal|llm}.methodsByNodeSlot`
- [x] 1.4-4 提 PR：「registry-schema: dedupe methodsByNodeSlot」

## Phase 2 · 端到端类型贯通

### 2.1 TS 类型生成器（🟢）

- [x] 2.1-1 选型：`json-schema-to-ts` 或 `quicktype`，一致性测试 transcribe schema 输出
- [x] 2.1-2 新增 `scripts/gen-abi-types.ts`：读 ABI → 输出 `src/generated/abi/index.ts`（含 `NodeSlot` / `SlotInput<S>` / `SlotOutput<S>` / `ABI_NODES`）
- [x] 2.1-3 `package.json` 加 `gen:abi` 脚本，加进 `prebuild` / `predev`
- [x] 2.1-4 把 `src/generated/abi/` 加进 git（生成结果入库，diff 可见）
- [x] 2.1-5 提 PR：「build: generate TS types from ABI」

### 2.2 ReactFlow handle 类型化（🟡）

- [ ] 2.2-1 把所有节点组件的 `Node<...>` 改成 `TongflowNode<S>` 泛型
- [ ] 2.2-2 新增 `src/lib/connection-validator.ts`：`isCompatibleConnection(source, target, field)`，按 JSON Schema structural 比较
- [ ] 2.2-3 `<ReactFlow isValidConnection={...}>` 接进
- [ ] 2.2-4 手动测试拖一条不兼容的连线 → UI 拒绝
- [ ] 2.2-5 提 PR：「reactflow: type-safe handles + isValidConnection」

### 2.3 PluginExecRequest 泛型（🟢）

- [ ] 2.3-1 `plugin-executor/types.ts`：引入 `PluginExecRequest<S>` / `PluginExecResult<S>`
- [ ] 2.3-2 `execute.ts` / `runners/*.ts` 跟随泛型化
- [ ] 2.3-3 调用方（task-runner.ts）传入 nodeSlot 字面量类型
- [ ] 2.3-4 typecheck 全绿
- [ ] 2.3-5 提 PR：「plugin-executor: generic over NodeSlot」

### 2.4 边界 ajv 校验（🟢）

- [ ] 2.4-1 在 `task/create/route.ts` 引入 ajv，按 `ABI_NODES[slot].inputs` 校验 input
- [ ] 2.4-2 在 runner 返回处用 outputs 校验，不合法即标记任务失败
- [ ] 2.4-3 故意 POST 字段类型错误 → 400 + ajv 错误信息
- [ ] 2.4-4 提 PR：「task-api: ajv validate input/output at boundary」

## Phase 3 · 运行时鲁棒

### 3.1 Modal 部署指纹缓存（🟢）

- [ ] 3.1-1 写 `pluginFingerprint(pluginId)`：sha256(deploy.py + download.py + 插件目录内 scanner 会读的 *.py + 锁定依赖)
- [ ] 3.1-2 内存 Map 缓存已部署指纹；指纹一致跳过 `runModalDeployPlugin`
- [ ] 3.1-3 download 同理（按 `download.py` + 模型版本指纹）
- [ ] 3.1-4 dev 连续触发同一 task → 第 2 次开始无 modal CLI spawn
- [ ] 3.1-5 修改 deploy.py → 第 1 次重新 deploy，第 2 次跳过
- [ ] 3.1-6 提 PR：「modal: skip deploy/download when fingerprint unchanged」

### 3.2 取消任务不销毁容器（🟢）

- [ ] 3.2-1 改 `getModalCallResult`：默认 `cancel({})`，不带 `terminateContainers: true`
- [ ] 3.2-2 累计 N 次（如 3）超时/abort 才升级到 terminate
- [ ] 3.2-3 取消任务后 Modal 控制台容器仍 idle → 下个任务无冷启动
- [ ] 3.2-4 提 PR：「modal: keep container alive on user cancel」

### 3.3 Asset 一等返回类型（🟡）

- [ ] 3.3-1 SDK：`tongflow/protocol.py` 加 `Asset` TypedDict + `make_asset(bytes, mime, filename?)` helper
- [ ] 3.3-2 ABI：所有 binary outputs schema 统一指向 `$defs/Asset`
- [ ] 3.3-3 各 plugin 改用 `make_asset(...)` 返回，不再裸 base64 字段
- [ ] 3.3-4 `runners/modal.ts` 重写 `persistBase64AssetIfPresent` 为 Asset shape 递归扫描
- [ ] 3.3-5 删除字段名嗅探分支
- [ ] 3.3-6 image / video / audio / 字节流类 task 各跑一遍验证
- [ ] 3.3-7 提 PR：「asset: first-class return shape」

### 3.4 LLM 子进程 SDK 化（🟢）

- [ ] 3.4-1 SDK：新增 `tongflow/llm_runner.py` 暴露 `run(handler)`
- [ ] 3.4-2 单元测试：handler 抛错 → 子进程 exit 非零 + NDJSON error 事件
- [ ] 3.4-3 迁移 `openai-text` 到 `run(handler)`
- [ ] 3.4-4 迁移 `openrouter-free`
- [ ] 3.4-5 迁移 `gemini-text`
- [ ] 3.4-6 entry.py 行数从 ~80 降到 ~15
- [ ] 3.4-7 提 PR：「llm-sdk: tongflow.llm_runner.run helper」

### 3.5 真强类型校验 + 装饰器元数据（🟢）

- [ ] 3.5-1 `slots.py`：`@node_slot` 改为给函数挂 `__tongflow_slots__` tuple
- [ ] 3.5-2 Modal `@modal.enter()` 中校验 `Inference` 类的 slot 元数据与 **scanner 输出**（`methodsByNodeSlot`）一致
- [ ] 3.5-3 `parse_deploy._looks_like_sdk_model_type` 增加导入路径校验：必须来自 `tongflow.models.*`
- [ ] 3.5-4 故意写 `class FakeInput: pass` → scanner 拒绝
- [ ] 3.5-5 提 PR：「sdk: real type validation + slot metadata」

### 3.6 pluginId 出 task.prompt（🟡）

- [ ] 3.6-1 task 数据结构加 `routing.pluginId` 字段
- [ ] 3.6-2 `use-node-plugin-resolver.ts` 不再注入到 `prompt`
- [ ] 3.6-3 `/api/task/create` 从 routing 字段读
- [ ] 3.6-4 数据迁移：现有 task.prompt.pluginId 同步到 routing.pluginId
- [ ] 3.6-5 提 PR：「task: separate routing from prompt」

## Phase 4 · 收尾

### 4.1 删 deprecated 别名（🟢）

- [ ] 4.1-1 grep `getNodePluginRepos` / `getModalRepoConfig` / `ModalPluginRepo` 调用方，逐个改名
- [ ] 4.1-2 删 `plugins-registry.server.ts` 里的 `@deprecated` 导出
- [ ] 4.1-3 提 PR：「cleanup: remove deprecated registry aliases」

### 4.2 batch runner 决策（🟡）

- [ ] 4.2-1 评估 `drop_video` / `arrange_group` 真实需求
- [ ] 4.2-2 选 A: 下线 → ABI 中改成 `runner: modal`，删 `batch` 选项；选 B: 实现 → 新增 `runners/batch.ts`
- [ ] 4.2-3 提 PR

### 4.3 nodeSlot 命名归一（🔴）

- [ ] 4.3-1 决定统一为下划线
- [ ] 4.3-2 ABI 改名（`speech-text-gen-video` → `speech_text_gen_video` 等）
- [ ] 4.3-3 scanner 加双读期：同时接受新旧名 N 周
- [ ] 4.3-4 DB 迁移：历史 task 的 `nodeSlot` 字段批量改名
- [ ] 4.3-5 N 周后下线旧名，删 `_slot_to_ident` 正则
- [ ] 4.3-6 提 PR（分两次合并）

### 4.4 ABI 版本兼容性（🟢）

- [ ] 4.4-1 `tongflow-abi.ts`：`version: z.literal(1)` 改为 `z.number().min(1)`
- [ ] 4.4-2 引入 `MIN_SUPPORTED_VERSION = 1` 常量
- [ ] 4.4-3 写 ABI 演进规范文档（小版本兼容，大版本 breaking）
- [ ] 4.4-4 提 PR：「abi: version compatibility policy」

---

## 进度跟踪建议

每个 Phase 起一个 milestone issue，把对应清单粘进去，每条 PR 关联条目。Phase 1 完成前禁止 Phase 2，Phase 2 完成前禁止 Phase 3 —— 因为 Phase 2 的类型生成依赖 Phase 1 的 ABI 瘦身，Phase 3 的 Asset 改造依赖 Phase 2 的类型校验。Phase 4 各项可与 Phase 3 后期并行。

