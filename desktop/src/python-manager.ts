import fs from "node:fs";
import path from "node:path";
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
 * run on Modal's cloud GPUs, so locally we only need the lightweight pieces.
 * The `tongflow` SDK itself is imported from source via PYTHONPATH (set by the
 * server), so we install its deps rather than the package:
 *   - modal / pydantic / typing_extensions: tongflow SDK dependencies
 *   - openai / google-genai / requests: LLM plugin HTTP clients
 */
const INSTALL = [
    "modal",
    // modal pulls in cbor2 unconstrained; cbor2 >5.6.5 ships no macOS x64
    // wheel and its sdist needs a build toolchain (6.x even needs Rust) —
    // unsatisfiable on a user's Intel Mac. 5.6.5 is the last release with
    // wheels (incl. a pure-python fallback) for every platform we target.
    "cbor2==5.6.5",
    "pydantic>=2.0",
    "typing_extensions>=4.12",
    "openai",
    "google-genai",
    "requests",
];

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

// Written only after a fully successful dependency install. Guards against a
// partial venv (created, but the install crashed/was killed) being treated as
// ready on the next launch.
function readyMarker(): string {
    return path.join(venvDir(), ".tongflow-ready");
}

/**
 * Ensure a Python virtual environment exists in userData with the plugin
 * dependencies installed. Idempotent: returns immediately when a completed
 * setup is detected (ready marker), otherwise (re)builds from scratch to
 * recover from a partial/failed previous run. Uses the bundled uv +
 * python-build-standalone, so it never touches a system Python.
 */
export async function ensurePythonEnv(onLine: LogLine): Promise<string> {
    const py = venvPython();
    if (fs.existsSync(readyMarker()) && fs.existsSync(py)) return py;

    // Recreate from scratch — a leftover partial venv has no deps installed.
    fs.rmSync(venvDir(), { recursive: true, force: true });

    onLine("Creating Python environment…");
    await run(
        bundledUv(),
        ["venv", "--python", bundledPython(), venvDir()],
        {},
        onLine,
    );

    onLine("Installing plugin dependencies…");
    const install = (offline: boolean) => {
        const args = ["pip", "install", "--python", py];
        if (offline) {
            // Fully offline: install only from the bundled wheelhouse.
            args.push("--no-index", "--find-links", wheelsDir());
        }
        args.push(...INSTALL);
        return run(bundledUv(), args, {}, onLine);
    };
    if (hasOfflineWheels()) {
        try {
            await install(true);
        } catch {
            // Incomplete/unusable wheelhouse must not brick first launch.
            onLine("Offline wheel install failed; retrying online…");
            await install(false);
        }
    } else {
        await install(false);
    }

    fs.writeFileSync(readyMarker(), "ok");
    onLine("Python environment ready.");
    return py;
}
