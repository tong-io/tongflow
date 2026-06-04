import fs from "node:fs";
import path from "node:path";
import { dataDir, pluginsDir, seedPluginsDir } from "./paths";

/**
 * Create the writable user directories and seed bundled plugins on first run.
 * Seeding only copies a plugin if its target directory does not yet exist, so
 * user-installed/updated plugins are never clobbered on upgrade.
 */
export function ensureUserDirs(): void {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.mkdirSync(pluginsDir(), { recursive: true });

    const seed = seedPluginsDir();
    if (!fs.existsSync(seed)) return;

    for (const entry of fs.readdirSync(seed, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dest = path.join(pluginsDir(), entry.name);
        if (fs.existsSync(dest)) continue;
        fs.cpSync(path.join(seed, entry.name), dest, { recursive: true });
    }
}
