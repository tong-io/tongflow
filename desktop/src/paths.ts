import path from "node:path";
import process from "node:process";
import { app } from "electron";

/**
 * All filesystem locations the desktop shell cares about.
 *
 * Read-only bundled runtimes/resources live under `resourcesRoot()`:
 *   resources/app/         — Next.js standalone bundle (server.js, node_modules,
 *                            .next/, public/, and the read-only sdk/ config/
 *                            drizzle/ that the server reads at runtime)
 *   resources/node/        — bundled Node.js binary (runs server.js)
 *   resources/uv/          — bundled uv binary (manages the Python venv)
 *   resources/python/      — bundled python-build-standalone
 *   resources/wheels/      — optional offline wheelhouse for first-run pip install
 *
 * Writable per-user state lives under `app.getPath("userData")`:
 *   data/    — SQLite db + uploads (TONGFLOW_DATA_DIR)
 *   plugins/ — installed plugins (TONGFLOW_PLUGINS_DIR)
 *   venv/    — the Python virtual environment
 */

const isWin = process.platform === "win32";

export function resourcesRoot(): string {
    return app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "..", "resources");
}

/** Next.js standalone bundle root — also the server's TONGFLOW_RESOURCES_DIR and cwd. */
export function appResourcesDir(): string {
    return path.join(resourcesRoot(), "app");
}

export function serverEntry(): string {
    return path.join(appResourcesDir(), "server.js");
}

export function bundledNode(): string {
    return path.join(resourcesRoot(), "node", isWin ? "node.exe" : "node");
}

export function bundledUv(): string {
    return path.join(resourcesRoot(), "uv", isWin ? "uv.exe" : "uv");
}

/** python-build-standalone interpreter path. */
export function bundledPython(): string {
    return isWin
        ? path.join(resourcesRoot(), "python", "python.exe")
        : path.join(resourcesRoot(), "python", "bin", "python3");
}

export function wheelsDir(): string {
    return path.join(resourcesRoot(), "wheels");
}

export function userDataDir(): string {
    return app.getPath("userData");
}

export function dataDir(): string {
    return path.join(userDataDir(), "data");
}

export function pluginsDir(): string {
    return path.join(userDataDir(), "plugins");
}

export function venvDir(): string {
    return path.join(userDataDir(), "venv");
}

export function venvPython(): string {
    return isWin
        ? path.join(venvDir(), "Scripts", "python.exe")
        : path.join(venvDir(), "bin", "python");
}
