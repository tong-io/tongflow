import fs from "node:fs";
import {
    bundledPython,
    bundledUv,
    venvDir,
    venvPython,
    wheelsDir,
} from "./paths";
import { type LogLine, run } from "./proc";

/**
 * Plugin runtime dependencies installed into the venv. The heavy ML libraries
 * run on Modal's cloud GPUs, so locally we only need the lightweight pieces:
 *   - tongflow: the SDK (pulls pydantic, which LLM plugin entry.py imports)
 *   - openai / google-genai / requests: LLM plugin HTTP clients
 *   - modal: deploy/run the official Modal plugins
 */
const INSTALL = ["tongflow", "openai", "google-genai", "modal", "requests"];

function hasOfflineWheels(): boolean {
    const dir = wheelsDir();
    try {
        return (
            fs.existsSync(dir) &&
            fs.readdirSync(dir).some((f) => f.endsWith(".whl"))
        );
    } catch {
        return false;
    }
}

/**
 * Ensure a Python virtual environment exists in userData with the plugin
 * dependencies installed. Idempotent: returns immediately if already built.
 * Uses the bundled uv + python-build-standalone, so it never touches a
 * system Python. Returns the venv interpreter path.
 */
export async function ensurePythonEnv(onLine: LogLine): Promise<string> {
    const py = venvPython();
    if (fs.existsSync(py)) return py;

    onLine("Creating Python environment…");
    await run(
        bundledUv(),
        ["venv", "--python", bundledPython(), venvDir()],
        {},
        onLine,
    );

    onLine("Installing plugin dependencies…");
    const args = ["pip", "install", "--python", py];
    if (hasOfflineWheels()) {
        // Fully offline: install only from the bundled wheelhouse.
        args.push("--no-index", "--find-links", wheelsDir());
    }
    args.push(...INSTALL);
    await run(bundledUv(), args, {}, onLine);

    onLine("Python environment ready.");
    return py;
}
