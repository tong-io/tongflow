/**
 * Local Next.js server: run `modal setup` (writes ~/.modal.toml).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolvePython } from "@/lib/modal/deploy-workers";

export function modalTomlPath(): string {
    return path.join(os.homedir(), ".modal.toml");
}

function parseTokenFlowUrl(text: string): string | null {
    const m = text.match(/https:\/\/modal\.com\/token-flow\/[A-Za-z0-9-_]+/);
    return m?.[0] ?? null;
}

export type ModalSetupStreamEvent =
    | { type: "starting" }
    | { type: "already_configured"; path: string }
    | { type: "log"; line: string }
    | { type: "auth_url"; url: string }
    | { type: "done"; path: string };

let setupRunning = false;

export async function runModalSetup(
    opts: { profile?: string | null },
    emit: (
        e: ModalSetupStreamEvent | { type: "error"; message: string },
    ) => void,
): Promise<void> {
    if (setupRunning) {
        emit({ type: "error", message: "Modal setup is already running" });
        return;
    }

    setupRunning = true;
    try {
        emit({ type: "starting" });

        const toml = modalTomlPath();
        if (fs.existsSync(toml)) {
            emit({ type: "already_configured", path: toml });
            return;
        }

        const python = await resolvePython();
        const args = ["-m", "modal", "setup"];
        const profile = opts.profile?.trim();
        if (profile) args.push("--profile", profile);

        let acc = "";
        let authSent = false;

        await new Promise<void>((resolve, reject) => {
            const child = spawn(python, args, {
                env: process.env,
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
            });

            const forward = (prefix: string, chunk: Buffer) => {
                const text = String(chunk);
                acc += text;
                if (!authSent) {
                    const url = parseTokenFlowUrl(acc);
                    if (url) {
                        authSent = true;
                        emit({ type: "auth_url", url });
                    }
                }
                for (const line of text.split(/\r?\n/)) {
                    if (!line.trim()) continue;
                    emit({ type: "log", line: `${prefix}${line}` });
                }
            };

            child.stdout?.on("data", (b: Buffer) => forward("", b));
            child.stderr?.on("data", (b: Buffer) => forward("[err] ", b));

            child.on("error", (e) => reject(e));
            child.on("exit", (code) => {
                if (code === 0) resolve();
                else
                    reject(
                        new Error(`modal setup failed (${code ?? "unknown"})`),
                    );
            });
        });

        if (!fs.existsSync(toml)) {
            throw new Error(
                `Modal setup completed but config not found at ${toml}`,
            );
        }

        emit({ type: "done", path: toml });
    } catch (e) {
        emit({
            type: "error",
            message: e instanceof Error ? e.message : String(e),
        });
    } finally {
        setupRunning = false;
    }
}
