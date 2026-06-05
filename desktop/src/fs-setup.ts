import fs from "node:fs";
import { dataDir, pluginsDir } from "./paths";

/**
 * Create the writable user directories. No plugins are pre-installed — the user
 * installs them on demand via the in-app plugin manager.
 */
export function ensureUserDirs(): void {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.mkdirSync(pluginsDir(), { recursive: true });
}
