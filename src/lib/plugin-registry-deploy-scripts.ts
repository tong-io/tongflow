/**
 * Resolves Modal `deploy.py` paths from the in-memory plugin registry.
 * The registry is produced by the TongFlow Python scanner over local plugins.
 */

import fs from "node:fs";
import path from "node:path";
import { loadPluginsRegistry } from "@/lib/plugins-registry.server";

/**
 * Paths to plugin deploy entry scripts for plugins registered with runner `modal`
 * (`runners.modal` in the registry). Suitable for `modal deploy <path>`.
 */
export function listModalRunnerDeployScriptsFromRegistry(
    repoRoot: string,
): string[] {
    const files: string[] = [];
    const registry = loadPluginsRegistry();
    for (const pluginId of Object.keys(registry.plugins)) {
        const p = registry.plugins[pluginId];
        if (!p || p.runner !== "modal") continue;
        const modal = p.runners.modal;
        const entry = modal.deployFile;
        const file = path.join(repoRoot, modal.localSubdir, entry);
        if (fs.existsSync(file)) files.push(file);
    }
    return files.sort();
}
