/**
 * Runs `modal deploy` on plugin deploy scripts listed by the in-memory registry.
 * Platform-specific Modal code lives in each plugin under `plugins/`, not in this repo root.
 *
 * Used by POST /api/modal/deploy when running the Next.js server (pnpm dev / self-hosted).
 */

import { spawn } from "node:child_process";
import path, { delimiter } from "node:path";
import { listModalRunnerDeployScriptsFromRegistry } from "@/lib/plugin-registry-deploy-scripts";

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

/** Deploy targets from the plugins registry (`runner: modal`). */
export function listModalEntryFiles(): string[] {
    return listModalRunnerDeployScriptsFromRegistry(process.cwd());
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

    for (const cmd of ["python3", "python"]) {
        if (await canRunModal(cmd)) return cmd;
    }

    throw new Error(
        "Could not run `python -m modal`. Set MODAL_PYTHON or PYTHON to a Python that has " +
            "the Modal SDK (`pip install modal`), or install `modal` on your default python3/python.",
    );
}

export function modalPluginPythonEnv(): NodeJS.ProcessEnv {
    const sdk = path.join(process.cwd(), "sdk");
    const pythonPath = [sdk, process.env.PYTHONPATH?.trim()].filter(Boolean);
    return {
        ...process.env,
        PYTHONPATH: pythonPath.join(delimiter),
    };
}

/**
 * Deploy each plugin Modal entry script (`deploy.py`) from the plugins registry.
 */
export async function runModalDeploy(
    onLine: (line: string) => void,
): Promise<void> {
    requireModalTokenEnv();
    const files = listModalEntryFiles();
    if (files.length === 0) {
        throw new Error(
            "No Modal deploy scripts found from the plugin scanner. Ensure `plugins/` is present and contains modal plugins.",
        );
    }

    const python = await resolvePython();

    for (const file of files) {
        onLine(`Deploying: ${file}`);
        await new Promise<void>((resolve, reject) => {
            const child = spawn(python, ["-m", "modal", "deploy", file], {
                cwd: path.dirname(file),
                env: modalPluginPythonEnv(),
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
            });

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
                        new Error(`modal deploy failed (${code}) for ${file}`),
                    );
            });
        });
    }
}
