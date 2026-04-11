/**
 * Server-side Modal worker deploy (same behavior as electron/main deployModalWorkers).
 * Used by POST /api/modal/deploy when running the Next.js server (pnpm dev / self-hosted).
 *
 * When `dist-electron/python` + `dist-electron/wheelhouse` exist (from
 * `pnpm desktop:python:prepare` / `pnpm desktop:wheelhouse:prepare`), we create
 * `.openflow-modal-venv` with offline `pip install modal` — same idea as Electron's
 * userData pyenv, but pinned under the repo for Next.js.
 */

import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";

function platformKey(): "darwin" | "win32" | null {
    if (process.platform === "darwin") return "darwin";
    if (process.platform === "win32") return "win32";
    return null;
}

/** Same layout as `electron/main.ts` getEmbeddedPythonExecutable (dev cwd). */
function getEmbeddedPythonExecutable(): string | null {
    const pk = platformKey();
    if (!pk) return null;

    const base = path.join(process.cwd(), "dist-electron", "python", pk);
    const candidates =
        process.platform === "win32"
            ? [
                  path.join(base, "python", "python.exe"),
                  path.join(base, "python.exe"),
              ]
            : [
                  path.join(base, "python", "bin", "python3"),
                  path.join(base, "python", "bin", "python"),
              ];

    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

function getWheelhouseDir(): string | null {
    const pk = platformKey();
    if (!pk) return null;
    const p = path.join(process.cwd(), "dist-electron", "wheelhouse", pk);
    return fs.existsSync(p) ? p : null;
}

function execFileP(
    file: string,
    args: string[],
    opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
    return new Promise((resolve, reject) => {
        execFile(
            file,
            args,
            { ...opts, windowsHide: true },
            (err) => {
                if (err) reject(err);
                else resolve();
            },
        );
    });
}

async function canRunModal(exe: string): Promise<boolean> {
    try {
        await new Promise<void>((resolve, reject) => {
            const child = spawn(exe, ["-m", "modal", "--version"], {
                env: process.env,
                stdio: "ignore",
                windowsHide: true,
            });
            child.on("error", reject);
            child.on("exit", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`exit ${code}`));
            });
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Offline venv at repo root, using embedded Python + wheelhouse (mirrors Electron ensureModalInstalledOffline).
 */
async function ensureBundledModalVenv(): Promise<string | null> {
    const embedded = getEmbeddedPythonExecutable();
    const wheelhouse = getWheelhouseDir();
    if (!embedded || !wheelhouse) return null;

    const venvRoot = path.join(process.cwd(), ".openflow-modal-venv");
    const marker = path.join(venvRoot, ".openflow_modal_ok");
    const venvPython =
        process.platform === "win32"
            ? path.join(venvRoot, "Scripts", "python.exe")
            : path.join(venvRoot, "bin", "python3");

    if (fs.existsSync(venvRoot) && fs.existsSync(venvPython)) {
        if (fs.existsSync(marker) && (await canRunModal(venvPython))) {
            return venvPython;
        }
        fs.rmSync(venvRoot, { recursive: true, force: true });
    }

    await execFileP(embedded, ["-m", "venv", venvRoot]);
    await execFileP(venvPython, [
        "-m",
        "pip",
        "install",
        "--no-index",
        "--find-links",
        wheelhouse,
        "modal",
    ]);
    fs.writeFileSync(marker, "ok\n");

    if (!(await canRunModal(venvPython))) return null;
    return venvPython;
}

export function requireModalTokenEnv(): void {
    const id = process.env.MODAL_TOKEN_ID?.trim();
    const secret = process.env.MODAL_TOKEN_SECRET?.trim();
    if (!id || !secret) {
        throw new Error(
            "Missing Modal credentials. Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET " +
                "(e.g. in project .env for the process running `next dev` / `next start`).",
        );
    }
}

export function listModalEntryFiles(): string[] {
    const modalDir = path.join(process.cwd(), "modal");
    const cpuDir = path.join(modalDir, "cpu");
    const gpuDir = path.join(modalDir, "gpu");
    const files: string[] = [];

    const pushPyFiles = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            if (name.endsWith(".py")) files.push(path.join(dir, name));
        }
    };
    pushPyFiles(cpuDir);
    pushPyFiles(gpuDir);
    return files.sort();
}

/** Python that can run `python -m modal` (used by deploy and setup APIs). */
export async function resolvePython(): Promise<string> {
    const explicit = [
        process.env.MODAL_PYTHON?.trim(),
        process.env.PYTHON?.trim(),
    ].filter((x): x is string => Boolean(x));

    for (const cmd of explicit) {
        if (await canRunModal(cmd)) return cmd;
    }

    const fromBundledVenv = await ensureBundledModalVenv();
    if (fromBundledVenv) return fromBundledVenv;

    const embedded = getEmbeddedPythonExecutable();
    if (embedded && (await canRunModal(embedded))) return embedded;

    for (const cmd of ["python3", "python"]) {
        if (await canRunModal(cmd)) return cmd;
    }

    throw new Error(
        "Could not run `python -m modal`. Options: (1) set MODAL_PYTHON or PYTHON; " +
            "(2) run `pnpm desktop:python:prepare` and `pnpm desktop:wheelhouse:prepare`, " +
            "then restart `next dev` to create `.openflow-modal-venv` from the bundled wheelhouse; " +
            "(3) install Modal: pip install modal.",
    );
}

/**
 * Deploy every `modal/cpu/*.py` and `modal/gpu/*.py` entry, sequentially.
 */
export async function runModalDeploy(
    onLine: (line: string) => void,
): Promise<void> {
    requireModalTokenEnv();
    const files = listModalEntryFiles();
    if (files.length === 0) {
        throw new Error("No Modal python entry files found to deploy.");
    }

    const python = await resolvePython();

    for (const file of files) {
        onLine(`Deploying: ${file}`);
        await new Promise<void>((resolve, reject) => {
            const child = spawn(
                python,
                ["-m", "modal", "deploy", file],
                {
                    cwd: path.dirname(file),
                    env: process.env,
                    windowsHide: true,
                    stdio: ["ignore", "pipe", "pipe"],
                },
            );

            const forward = (prefix: string, buf: Buffer) => {
                const text = String(buf);
                for (const line of text.split(/\r?\n/)) {
                    if (!line.trim()) continue;
                    onLine(`${prefix}${line}`);
                }
            };
            child.stdout?.on("data", (b: Buffer) => forward("", b));
            child.stderr?.on("data", (b: Buffer) => forward("[err] ", b));

            child.on("error", (e) => reject(e));
            child.on("exit", (code) => {
                if (code === 0) resolve();
                else
                    reject(
                        new Error(
                            `modal deploy failed (${code}) for ${file}`,
                        ),
                    );
            });
        });
    }
}
