# Closed-source Next build（闭源 / 私有部署）

面向 **不开放 Next 源码** 的部署：在正常使用 [`docs/feature-registry.md`](feature-registry.md) 中的 JSON 与 `FEATURES_CONFIG_PATH` 的同时，可对 **构建后的客户端 chunk** 做额外混淆，提高静态资源被阅读的难度。

## 何时用哪个命令

| 命令 | 说明 |
|------|------|
| `pnpm build` | 默认生产构建，无混淆。 |
| `pnpm build:obfuscated` | `next build` 后对 `.next/static/chunks/**/*.js` 运行 [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)，选项偏保守以降低破坏 Next 运行时的风险。 |
| `pnpm dist:build` | 生成 **可提交** 的 `dist/next-standalone/`（包含混淆后的 standalone 产物）。 |

混淆 **不** 替代许可协议或法律上的「闭源」；它只是工程上的障碍之一。

把闭源业务逻辑集中到 **`@openflow/proprietary`** 工作区包，便于私有构建替换或 submodule；见 [docs/proprietary-package.md](proprietary-package.md)。

## 提交 dist/（你选择的策略）

如果你选择把混淆后的 standalone 产物放在主仓并 `git commit`，建议遵循以下约定，避免 repo 失控：

- **固定路径**：只提交 `dist/next-standalone/`（由 `pnpm dist:build` 生成）。
- **不要提交运行时机密**：`.env*` 不要进 git；运行时通过部署环境变量注入。
- **接受代价**：构建产物通常体积大、diff 不可读、会显著增加仓库体积与 clone 时间；这更像“制品发布”，不是源码协作。

运行方式（在有 Node 环境的机器上）：

```bash
node dist/next-standalone/server.js
```

说明：

- `dist/next-standalone/` **不会包含** `.env*`（脚本会自动剔除），运行时请通过部署环境变量注入。

## 与功能注册表的关系

模型与能力元数据仍来自 `config/features.default.json` 及可选的 `config/features.local.json`、`FEATURES_CONFIG_PATH`。部署时 **挂载或替换 JSON** 可在 **不重建 Next** 的情况下调整列表（详见 feature-registry 文档）。混淆只影响已打包的前端脚本，不改变该合并逻辑。

## 私有 CI 建议

1. 与本地一致：在 `next build` **成功之后** 运行 `node scripts/obfuscate-next-client.mjs`（或等价调用同一配置）。
2. 调试构建问题时设置 `NEXT_OBFUSCATE_SKIP=1` 跳过混淆，确认是否为混淆导致。
3. 每次升级 Next 或大改前端依赖后，对混淆产物做一次冒烟测试（核心页面、任务流）。

## Future: Next 独立仓库 + submodule（规划）

若将 Next 前后端迁到 **单独仓库**，并以 **submodule** 挂回本仓库：

- 克隆后需 `git submodule update --init --recursive`（按实际路径调整）。
- 建议在子仓 README 中说明 `pnpm build` / `pnpm build:obfuscated` 与镜像环境变量；根仓文档只保留「契约」：JSON 与 Python 扩展面仍在主仓或约定路径，Next 通过环境变量或挂载读取同一套配置。

具体目录名（例如 `apps/web`）与由哪一侧 CI 执行混淆，在拆仓时再定稿。
