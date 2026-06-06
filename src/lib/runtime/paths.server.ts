import "server-only";

import path from "node:path";

/**
 * Centralized runtime path resolution.
 *
 * In dev / self-hosted runs everything lives under the repo working directory
 * (the historical `process.cwd()` behavior). When packaged as a desktop app
 * (Electron) the cwd is read-only, so the Electron main process points these
 * at writable user directories and the read-only resources bundle via env vars.
 */

/** Writable data root: SQLite db + uploaded files. */
export function dataDir(): string {
    const fromEnv = process.env.TONGFLOW_DATA_DIR?.trim();
    return fromEnv
        ? path.resolve(fromEnv)
        : path.resolve(process.cwd(), "data");
}

/** Writable plugins root: plugins installed at runtime. */
export function pluginsDir(): string {
    const fromEnv = process.env.TONGFLOW_PLUGINS_DIR?.trim();
    return fromEnv
        ? path.resolve(fromEnv)
        : path.resolve(process.cwd(), "plugins");
}

/**
 * Read-only resources root: drizzle migrations, config/, sdk/.
 * Defaults to the working directory for dev; the desktop build points it at
 * the bundled app resources directory.
 */
export function resourcesDir(): string {
    const fromEnv = process.env.TONGFLOW_RESOURCES_DIR?.trim();
    return fromEnv ? path.resolve(fromEnv) : process.cwd();
}
