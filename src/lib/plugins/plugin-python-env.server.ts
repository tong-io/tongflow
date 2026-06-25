import "server-only";

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { PYTHON_UTF8_ENV, resolvePythonLite } from "@/lib/plugins/python-lite";
import { dataDir, resourcesDir } from "@/lib/runtime/paths.server";

/**
 * Shared Python environment for local plugin entries.
 *
 * In the unified plugin model the platform spawns every plugin's local entry as
 * a subprocess. Those entries are thin adapters (the heavy compute runs in the
 * backend / Modal image), so they share one managed venv: it holds the tongflow
 * SDK (+ its deps: pydantic, modal) and, layered on top, each plugin's optional
 * `requirements.txt`.
 *
 * Installs are cumulative and cached by content hash. Because a shared venv can
 * in principle host conflicting version pins, every install runs `pip check` and
 * surfaces conflicts as warnings (keep local requirements thin; heavy/pinned
 * deps belong in the remote image).
 */

const VENV_DIR = () => join(dataDir(), ".tongflow", "plugin-venv");
const MARKERS_DIR = () => join(VENV_DIR(), ".markers");

function venvPython(): string {
    const dir = VENV_DIR();
    return process.platform === "win32"
        ? join(dir, "Scripts", "python.exe")
        : join(dir, "bin", "python");
}

function pythonIsModern(exe: string): boolean {
    try {
        const r = spawnSync(
            exe,
            [
                "-c",
                "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)",
            ],
            { windowsHide: true },
        );
        return r.status === 0;
    } catch {
        return false;
    }
}

/** First interpreter that runs AND is >= 3.10 (the SDK's minimum). */
export function resolveBasePython(): string | null {
    const candidates = [
        process.env.PYTHON?.trim(),
        "python3.13",
        "python3.12",
        "python3.11",
        "python3.10",
        "python3",
        "python",
    ].filter((x): x is string => Boolean(x));
    for (const cmd of candidates) {
        if (pythonIsModern(cmd)) return cmd;
    }
    return null;
}

function runCmd(
    exe: string,
    args: string[],
    cwd: string,
): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
        const child = spawn(exe, args, {
            cwd,
            windowsHide: true,
            env: { ...process.env, ...PYTHON_UTF8_ENV },
        });
        let out = "";
        child.stdout?.on("data", (b: Buffer) => {
            out += String(b);
        });
        child.stderr?.on("data", (b: Buffer) => {
            out += String(b);
        });
        child.on("error", (e) => resolve({ code: 1, out: String(e) }));
        child.on("exit", (code) => resolve({ code: code ?? 1, out }));
    });
}

function hashFile(path: string): string | null {
    try {
        return createHash("sha256").update(readFileSync(path)).digest("hex");
    } catch {
        return null;
    }
}

function readMarker(name: string): string | null {
    try {
        return readFileSync(join(MARKERS_DIR(), name), "utf8").trim();
    } catch {
        return null;
    }
}

function writeMarker(name: string, value: string): void {
    mkdirSync(MARKERS_DIR(), { recursive: true });
    writeFileSync(join(MARKERS_DIR(), name), value);
}

// Serialize all venv mutations: pip is not safe to run concurrently against the
// same environment, and parallel tasks share this one venv.
let venvChain: Promise<void> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = venvChain.then(fn, fn);
    venvChain = next.then(
        () => undefined,
        () => undefined,
    );
    return next;
}

async function pipCheck(py: string): Promise<void> {
    const { code, out } = await runCmd(py, ["-m", "pip", "check"], VENV_DIR());
    if (code !== 0) {
        logger.warn(
            `[plugin-env] pip dependency conflicts in the shared plugin venv ` +
                `(keep local requirements thin; pin heavy deps in the remote ` +
                `image instead):\n${out.trim()}`,
        );
    }
}

async function ensureSharedVenv(): Promise<string> {
    const py = venvPython();
    const sdkDir = join(resourcesDir(), "sdk");
    const sdkPyproject = join(sdkDir, "pyproject.toml");
    const sdkHash = hashFile(sdkPyproject) ?? "none";

    // Venv + SDK install are cached against the SDK's pyproject (its declared
    // deps). Live SDK *code* still comes via PYTHONPATH in the runner.
    if (existsSync(py) && readMarker("sdk.hash") === sdkHash) {
        return py;
    }

    const base = resolveBasePython();
    if (!base) {
        throw new Error(
            "No Python >= 3.10 found for the plugin venv. Install python3.12 " +
                "(or set PYTHON to a 3.10+ interpreter).",
        );
    }

    if (!existsSync(py)) {
        logger.info(`[plugin-env] creating shared plugin venv with ${base}`);
        const mk = await runCmd(base, ["-m", "venv", VENV_DIR()], dataDir());
        if (mk.code !== 0) {
            throw new Error(`failed to create plugin venv: ${mk.out.trim()}`);
        }
    }

    logger.info("[plugin-env] installing tongflow SDK into the plugin venv");
    const ins = await runCmd(
        py,
        ["-m", "pip", "install", "--upgrade", sdkDir],
        VENV_DIR(),
    );
    if (ins.code !== 0) {
        throw new Error(
            `failed to install SDK into plugin venv: ${ins.out.trim()}`,
        );
    }

    writeMarker("sdk.hash", sdkHash);
    return py;
}

async function ensurePluginRequirements(
    pluginId: string,
    pluginDir: string,
    py: string,
): Promise<void> {
    const reqPath = join(pluginDir, "requirements.txt");
    if (!existsSync(reqPath)) return;

    const hash = hashFile(reqPath) ?? "none";
    const markerName = `req-${pluginId}.hash`;
    if (readMarker(markerName) === hash) return;

    logger.info(`[plugin-env] installing requirements.txt for ${pluginId}`);
    const ins = await runCmd(
        py,
        ["-m", "pip", "install", "-r", reqPath],
        pluginDir,
    );
    if (ins.code !== 0) {
        throw new Error(
            `failed to install requirements for ${pluginId}: ${ins.out.trim()}`,
        );
    }
    await pipCheck(py);
    writeMarker(markerName, hash);
}

/**
 * Ensure the shared plugin venv exists with the SDK + this plugin's
 * requirements installed, and return the interpreter to run the entry with.
 *
 * On any provisioning failure, falls back to the lightweight resolver so an
 * environment without venv/pip still runs plugins that need no extra deps.
 */
export async function ensurePluginPython(
    pluginId: string,
    pluginDir: string,
): Promise<string> {
    try {
        return await serialize(async () => {
            const py = await ensureSharedVenv();
            await ensurePluginRequirements(pluginId, pluginDir, py);
            return py;
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(
            `[plugin-env] provisioning failed (${msg}); falling back to plain python`,
        );
        return resolvePythonLite();
    }
}
