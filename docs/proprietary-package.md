# `@openflow/proprietary`（闭源逻辑独立包）

主应用通过 **`@openflow/proprietary`** 引用可选的 OEM / 闭源能力（品牌壳、授权、埋点等）。公开仓库里该包是 **占位实现**（透传子节点），保证任何人能直接安装并运行。

## 目录与依赖

| 路径 | 说明 |
|------|------|
| [`packages/proprietary/`](../packages/proprietary/) | 工作区包源码；`pnpm` 通过 [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) 链接 |
| 主应用 [`package.json`](../package.json) | `"@openflow/proprietary": "workspace:*"` |
| [`next.config.ts`](../next.config.ts) | `transpilePackages: ["@openflow/proprietary"]`，让 Next 编译该包中的 TS/TSX |

入口示例：根布局 [`src/app/layout.tsx`](../src/app/layout.tsx) 使用 `ProprietaryAppShell` 包裹内容。

## 私有构建时怎么替换

任选其一（团队约定一种即可）：

1. **直接改目录**：在私有分支里把 `packages/proprietary/src` 换成真实实现（保持导出名一致，如 `ProprietaryAppShell`）。
2. **Submodule**：用私有仓库替换 `packages/proprietary`，`git submodule update` 后照常 `pnpm install`。
3. **私有 npm**：发布 `@openflow/proprietary` 到私有 registry，在根 `package.json` 把 `workspace:*` 改成 semver 或 `npm:` 协议（并视情况从 workspace 中移除此包目录）。

## 与混淆 / 体积

- 把闭源 UI 与逻辑 **集中在本包** 后，构建产物里对应 chunk 更易与通用 vendor 分离；仍建议在私有流水线里对 **本包相关 chunk** 或 **预构建的 dist** 做混淆，而不是混淆整个 `.next/static`。
- **不把 `node_modules` 提交进 git** 时，由用户在目标环境执行 `pnpm install` + `pnpm build`，体积问题主要落在构建机或镜像，而不是主仓历史。
