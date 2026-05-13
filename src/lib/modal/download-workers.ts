import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
    modalPluginPythonEnv,
    requireModalTokenEnv,
    resolvePython,
} from "@/lib/modal/deploy-workers";
import {
    getModalPluginConfig,
    getPluginFileAbsolutePath,
    loadPluginsRegistry,
} from "@/lib/plugins/plugins-registry.server";

/**
 * We intentionally do NOT cache download state locally.
 * Download is idempotent: plugins can check their Modal Volume and skip if already present.
 */

export async function runModalDownload(
    opts: { pluginId: string | null },
    onLine: (line: string) => void,
): Promise<void> {
    requireModalTokenEnv();
    const reg = loadPluginsRegistry();

    const targets = opts.pluginId ? [opts.pluginId] : Object.keys(reg.plugins);
    if (targets.length === 0) {
        throw new Error("No plugin ids found to download.");
    }

    const python = await resolvePython();

    for (const pluginId of targets) {
        const cfg = getModalPluginConfig(pluginId);
        if (!cfg) {
            throw new Error(`Unknown plugin: ${pluginId}`);
        }

        const file = getPluginFileAbsolutePath(
            pluginId,
            cfg.downloadFile || "download.py",
        );
        if (!file || !fs.existsSync(file)) {
            throw new Error(
                `Missing ${cfg.downloadFile} for ${pluginId} (expected under ${cfg.localSubdir}/).`,
            );
        }

        onLine(`Downloading: ${pluginId} (${file})`);
        await new Promise<void>((resolve, reject) => {
            const child = spawn(
                python,
                ["-m", "modal", "run", `${file}::download`],
                {
                    cwd: path.dirname(file),
                    env: modalPluginPythonEnv(),
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
                            `modal run download failed (${code}) for ${pluginId}`,
                        ),
                    );
            });
        });
    }
}
