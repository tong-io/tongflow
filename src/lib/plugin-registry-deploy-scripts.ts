/**
 * Resolves Modal `deploy.py` paths from `.tongflow/plugins.registry.json` (or legacy
 * `config/plugins.registry.json`). That file is produced by `pnpm plugins:sync`,
 * which runs the TongFlow Python scanner (`tongflow` CLI) over `plugins/` — annotations
 * and `deploy.py` structure live in plugins; OpenFlow does not scan the filesystem here.
 */

import fs from "node:fs";
import path from "node:path";
import { PluginsRegistrySchema } from "./plugins-registry-schema";

export function resolvePluginsRegistryJsonPath(repoRoot: string): string | null {
    const primary = path.join(repoRoot, ".tongflow", "plugins.registry.json");
    const legacy = path.join(repoRoot, "config", "plugins.registry.json");
    if (fs.existsSync(primary)) return primary;
    if (fs.existsSync(legacy)) return legacy;
    return null;
}

/**
 * Paths to plugin deploy entry scripts for plugins registered with runner `modal`
 * (`runners.modal` in the registry JSON). Suitable for `modal deploy <path>` when
 * the plugin targets Modal.com.
 */
export function listModalRunnerDeployScriptsFromRegistry(
    repoRoot: string,
): string[] {
    const registryPath = resolvePluginsRegistryJsonPath(repoRoot);
    if (!registryPath) return [];

    let raw: unknown;
    try {
        raw = JSON.parse(fs.readFileSync(registryPath, "utf8")) as unknown;
    } catch {
        return [];
    }

    const parsed = PluginsRegistrySchema.safeParse(raw);
    if (!parsed.success) return [];

    const files: string[] = [];
    for (const pluginId of Object.keys(parsed.data.plugins)) {
        const p = parsed.data.plugins[pluginId];
        if (!p || p.runner !== "modal") continue;
        const modal = p.runners.modal;
        const entry = modal.deployFile;
        const file = path.join(repoRoot, modal.localSubdir, entry);
        if (fs.existsSync(file)) files.push(file);
    }
    return files.sort();
}
