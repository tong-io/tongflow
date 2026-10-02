/**
 * Python bootstrap: find an interpreter (≥ 3.10), create the studio venv and
 * install the `tongflow` SDK into it. That venv's python is what launches
 * `python -m tongflow engine` / `scan`; the engine then provisions its own
 * shared plugin venv under the studio data dir.
 */
import { execFile as execFileCb, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { exists, writeFileAtomic } from "../util/fsx.ts";

const execFile = promisify(execFileCb);

/** SDK version installed into the studio venv when `sdkSpec` is not configured. */
export const DEFAULT_TONGFLOW_SDK_VERSION = "0.3.0";

export const MIN_PYTHON: [number, number] = [3, 10];

const CANDIDATES = [
    "python3.13",
    "python3.12",
    "python3.11",
    "python3.10",
    "python3",
    "python",
];

export interface PythonInfo {
    path: string;
    version: [number, number, number];
}

async function probe(path: string): Promise<PythonInfo | undefined> {
    try {
        const { stdout } = await execFile(path, [
            "-c",
            "import sys; print('%d.%d.%d' % sys.version_info[:3])",
        ]);
        const [a, b, c] = stdout.trim().split(".").map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
        return { path, version: [a, b, c ?? 0] };
    } catch {
        return undefined;
    }
}

function meetsMin(v: [number, number, number]): boolean {
    return (
        v[0] > MIN_PYTHON[0] ||
        (v[0] === MIN_PYTHON[0] && v[1] >= MIN_PYTHON[1])
    );
}

/** Locate a usable interpreter: explicit path first, then PATH candidates, then `uv python find`. */
export async function findPython(explicit?: string): Promise<PythonInfo> {
    const tried: string[] = [];
    if (explicit?.trim()) {
        const info = await probe(explicit.trim());
        if (info && meetsMin(info.version)) return info;
        tried.push(explicit);
        throw new Error(
            `configured pythonPath "${explicit}" is ${info ? `Python ${info.version.join(".")}` : "not runnable"}; ` +
                `tongflow-studio needs Python >= ${MIN_PYTHON.join(".")}`,
        );
    }
    for (const c of CANDIDATES) {
        const info = await probe(c);
        if (info && meetsMin(info.version)) return info;
        tried.push(c);
    }
    try {
        const { stdout } = await execFile("uv", [
            "python",
            "find",
            `>=${MIN_PYTHON.join(".")}`,
        ]);
        const info = await probe(stdout.trim());
        if (info && meetsMin(info.version)) return info;
    } catch {
        // uv missing
    }
    throw new Error(
        `no Python >= ${MIN_PYTHON.join(".")} found (tried ${tried.join(", ")}); ` +
            "install one (e.g. `brew install python@3.12` or `uv python install 3.12`) or set pythonPath in the tongflow settings",
    );
}

export interface EnsureVenvOptions {
    venvDir: string;
    pythonPath?: string;
    /** pip requirement spec, default `tongflow==<DEFAULT_TONGFLOW_SDK_VERSION>`. */
    sdkSpec?: string;
    log?: (line: string) => void;
    signal?: AbortSignal;
}

export function venvPython(venvDir: string): string {
    return process.platform === "win32"
        ? join(venvDir, "Scripts", "python.exe")
        : join(venvDir, "bin", "python");
}

/** Create the studio venv if needed and make sure the requested SDK spec is installed. Returns the venv python. */
export async function ensureVenv(options: EnsureVenvOptions): Promise<string> {
    const { venvDir, log = () => undefined } = options;
    const spec =
        options.sdkSpec?.trim() || `tongflow==${DEFAULT_TONGFLOW_SDK_VERSION}`;
    const py = venvPython(venvDir);
    const marker = join(venvDir, ".tongflow-sdk-spec");
    if (await exists(py)) {
        const installed = (
            await readFile(marker, "utf8").catch(() => "")
        ).trim();
        if (installed === spec) return py;
    } else {
        const base = await findPython(options.pythonPath);
        log(
            `creating studio venv with ${base.path} (Python ${base.version.join(".")})`,
        );
        await run(base.path, ["-m", "venv", venvDir], log, options.signal);
    }
    log(`installing ${spec} into the studio venv`);
    await run(
        py,
        [
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--upgrade",
            ...specArgs(spec),
        ],
        log,
        options.signal,
    );
    await writeFileAtomic(marker, `${spec}\n`);
    return py;
}

function specArgs(spec: string): string[] {
    // Allow "-e /path/to/sdk" for local development.
    return spec.split(/\s+/).filter(Boolean);
}

function run(
    cmd: string,
    args: string[],
    log: (line: string) => void,
    signal?: AbortSignal,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            stdio: ["ignore", "pipe", "pipe"],
            signal,
        });
        let tail = "";
        const onData = (chunk: Buffer) => {
            const text = chunk.toString();
            tail = (tail + text).slice(-4000);
            for (const line of text.split(/\r?\n/))
                if (line.trim()) log(line.trim());
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) resolve();
            else
                reject(
                    new Error(
                        `${cmd} ${args.join(" ")} exited with ${code}\n${tail}`,
                    ),
                );
        });
    });
}
