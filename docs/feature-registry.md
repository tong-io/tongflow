# Feature registry（功能注册表）

面向开源部署：模型与能力的**元数据**集中在仓库根目录的 JSON 中，便于 PR 与本地覆盖，无需改 TypeScript 数组。

## 文件

| 文件 | 说明 |
|------|------|
| [`config/features.default.json`](../config/features.default.json) | 默认完整列表，随仓库发布 |
| [`config/features.schema.json`](../config/features.schema.json) | JSON Schema，可在编辑器中启用补全 |
| `config/features.local.json` | **可选**，本地或部署覆盖（已加入 `.gitignore`） |
| 环境变量 `FEATURES_CONFIG_PATH` | **可选**，指向额外 JSON，在 `features.local.json` 之后合并 |

合并顺序：`features.default.json` → `features.local.json`（若存在）→ `FEATURES_CONFIG_PATH`（若存在）。  
同名字段后写覆盖先写；`features` 数组按 `name` 合并。

## JSON 结构

- **`features`**：每条为 `name`, `type`, `function`, `processingTime`（本地运行不设计价与档位）。
- **`aliases.canonical`**：旧画布或别名 → 注册表中的规范 `name`（影响任务解析与查找）。
- **`aliases.labelLookup`**：仅用于节点下拉等 **展示文案** 映射到另一条注册表记录，不改变任务路由。

校验：`pnpm validate-features`（CI 建议运行）。

## 扩展一条 AI 能力时的三步

1. **在 JSON 中增加 `features` 行**（或 `features.local.json`），`function` 必须与后端 handler 注册键一致。
2. **实现或复用任务 handler**：[`src/lib/register-task-handlers.ts`](../src/lib/register-task-handlers.ts) 通过 `(type, function)` 路由到 `registerHandler`；只改 JSON 不注册 handler 会导致任务执行失败。
3. **若要在某节点下拉出现新 `name`**：更新该节点内的 **allowed feature 常量**（如 `GEN_TEXT_FEATURES`）——节点白名单与注册表解耦，避免误暴露未实现能力。

## 客户端与服务器

- 服务器合并 `features.local.json` / `FEATURES_CONFIG_PATH` 后的列表与别名由 [`GET /api/feature/list`](../src/app/api/feature/list/route.ts) 下发（实现见 [`feature-registry.server.ts`](../src/lib/feature-registry.server.ts)，含 `node:fs`，**仅服务端**引用）。
- 浏览器端代码请从 [`feature-registry.ts`](../src/lib/feature-registry.ts) 导入（只含打包进来的默认 JSON，无 `fs`）。若仅在本地 JSON 中新增 feature，**下拉标签**在客户端可能回退为原始 id，直到与服务器列表一致（以产品可接受为准）。
