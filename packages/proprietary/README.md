# @openflow/proprietary

Placeholder package for **optional closed-source logic** (OEM UI, licensing, analytics) consumed by the main Next app.

- In the **public** repo this folder ships a **no-op** implementation so `pnpm install` / CI work out of the box.
- In a **private** build, replace this directory, use a **git submodule**, or point `package.json` at a private registry package with the same export surface.

See [docs/proprietary-package.md](../../docs/proprietary-package.md).
