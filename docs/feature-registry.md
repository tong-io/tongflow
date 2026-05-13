# Feature registry（功能注册表）

面向开源部署：功能（feature）的元数据由 **ABI + 插件扫描器** 派生，无需手写 JSON 列表。如需在本地或部署侧覆盖，可放一份可选的 JSON。

## 默认列表如何产生

服务器端默认 bundle 由 [`feature-registry.server.ts`](../src/lib/plugins/feature-registry.server.ts) 在启动时根据：

- ABI 中的 `nodeSlot` 列表（[`config/tongflow.abi.json`](../config/tongflow.abi.json) → [`TONGFLOW_ABI_NODES`](../src/lib/schema/tongflow-abi.ts)）
- 插件扫描器结果（[`plugins-registry.server.ts`](../src/lib/plugins/plugins-registry.server.ts)，含 `runner` 与 `nodePluginMap`）

派生而成。每个 `nodeSlot` 取其在 `nodePluginMap` 中的首个插件，按 `runner` 决定 `type`/`function`：

| runner | type | function |
|--------|------|----------|
| `llm` | `llm` | 插件 id |
| `modal` | `modal` | `runners.modal.appName ?? 插件 id` |

客户端导入的 [`feature-registry.ts`](../src/lib/plugins/feature-registry.ts) 只持有一个 `type=function=unregistered` 的占位 fallback，真正的列表通过 [`GET /api/feature/list`](../src/app/api/feature/list/route.ts) 下发后水合到客户端 store。

## 可选覆盖

| 来源 | 说明 |
|------|------|
| `.tongflow/features.local.json` | **可选**，本地或部署覆盖（已在 [`.gitignore`](../.gitignore) 中忽略） |
| 环境变量 `FEATURES_CONFIG_PATH` | **可选**，指向额外 JSON，在 `features.local.json` 之后合并 |

合并顺序：**ABI/插件派生默认 bundle → `.tongflow/features.local.json`（若存在）→ `FEATURES_CONFIG_PATH`（若存在）**。  
`features` 数组按 `name` 合并（后写覆盖先写）；`aliases.canonical` / `aliases.labelLookup` 同名键后写覆盖先写。

文件 schema 由 [`feature-registry-schema.ts`](../src/lib/plugins/feature-registry-schema.ts) 中的 zod schema 校验，无独立的 JSON Schema 文件。

## JSON 结构（覆盖文件）

- **`features`**：每条为 `name`, `type`, `function`。
- **`aliases.canonical`**：旧画布或别名 → 注册表中的规范 `name`（影响任务解析与查找）。
- **`aliases.labelLookup`**：仅用于节点下拉等 **展示文案** 映射到另一条注册表记录，不改变任务路由。

## 扩展一条 AI 能力时的三步

1. **在 ABI 中加 `nodeSlot`**（[`config/tongflow.abi.json`](../config/tongflow.abi.json)）并跑 `pnpm gen:abi`。
2. **实现对应插件**：在 `plugins/` 下放 Modal / LLM 插件并由 scanner 注册（见 [`docs/plugins.md`](plugins.md)）；任务执行走 [`executePlugin`](../src/lib/plugin-executor/execute.ts)。
3. **若要在某节点下拉出现新 `name`**：更新该节点内的 **allowed feature 常量**（如 `GEN_TEXT_FEATURES`）——节点白名单与注册表解耦，避免误暴露未实现能力。

## 客户端与服务器

- 服务器合并后的列表与别名由 [`GET /api/feature/list`](../src/app/api/feature/list/route.ts) 下发（实现见 [`feature-registry.server.ts`](../src/lib/plugins/feature-registry.server.ts)，含 `node:fs`，**仅服务端**引用）。
- 浏览器端代码请从 [`feature-registry.ts`](../src/lib/plugins/feature-registry.ts) 导入（只含 `unregistered` 占位 fallback，无 `fs`）。在 `/api/feature/list` 水合之前，**下拉标签** 可能回退为原始 id。
