/**
 * CI helper: run bundled tongflow scanner; fail if it reports plugin scan errors.
 * Requires Python deps (`pip install -e ./sdk` or equivalent).
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import { PluginsRegistrySchema } from "../src/lib/plugins/plugins-registry-schema";

const pluginsRoot = join(process.cwd(), "plugins");

function pickPython(): string {
    const fromEnv = process.env.PYTHON?.trim() || process.env.PYTHON3?.trim();
    return fromEnv && fromEnv.length > 0 ? fromEnv : "python3";
}

function main(): void {
    if (!existsSync(pluginsRoot)) {
        console.log("[verify-plugins-scan] No plugins/ directory — skipping.");
        return;
    }

    const sdk = join(process.cwd(), "sdk");
    const sdkMain = join(sdk, "tongflow", "__main__.py");
    if (!existsSync(sdkMain)) {
        console.log(
            "[verify-plugins-scan] No vendored tongflow SDK under sdk/ — skipping.",
        );
        return;
    }

    const pythonPath = [sdk, process.env.PYTHONPATH?.trim()].filter(
        (x): x is string => Boolean(x),
    );

    const stdout = execFileSync(
        pickPython(),
        [
            "-m",
            "tongflow",
            "--root",
            pluginsRoot,
            "--abi",
            join(process.cwd(), "config", "tongflow.abi.json"),
        ],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
            env: {
                ...process.env,
                PYTHONPATH: pythonPath.join(delimiter),
            },
        },
    );

    const raw = JSON.parse(stdout) as unknown;
    const reg = PluginsRegistrySchema.parse(raw);
    const errs = reg.errors ?? [];
    if (errs.length > 0) {
        console.error("[verify-plugins-scan] Scanner reported errors:");
        for (const e of errs) {
            console.error(`  ${e.pluginId}: ${e.message}`);
        }
        process.exit(1);
    }
    console.log("[verify-plugins-scan] OK");
}

main();
