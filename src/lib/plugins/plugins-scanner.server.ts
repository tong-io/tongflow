import "server-only";

import { execFileSync } from "node:child_process";
import { delimiter, join } from "node:path";
import {
    type PluginsRegistry,
    PluginsRegistrySchema,
} from "@/lib/plugins/plugins-registry-schema";

function pickPython(): string {
    const fromEnv = process.env.PYTHON?.trim() || process.env.PYTHON3?.trim();
    if (fromEnv) return fromEnv;
    return "python3";
}

function scannerEnv(): NodeJS.ProcessEnv {
    const sdk = join(process.cwd(), "sdk");
    const pythonPath = [sdk, process.env.PYTHONPATH?.trim()].filter(
        (x): x is string => Boolean(x),
    );
    return {
        ...process.env,
        PYTHONPATH: pythonPath.join(delimiter),
    };
}

export function runPluginsScanner(): PluginsRegistry {
    const stdout = execFileSync(
        pickPython(),
        [
            "-m",
            "tongflow",
            "--root",
            join(process.cwd(), "plugins"),
            "--abi",
            join(process.cwd(), "config", "tongflow.abi.json"),
        ],
        {
            cwd: process.cwd(),
            env: scannerEnv(),
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
        },
    );

    let raw: unknown;
    try {
        raw = JSON.parse(stdout) as unknown;
    } catch {
        throw new Error("Plugin scanner stdout was not valid JSON");
    }

    return PluginsRegistrySchema.parse(raw);
}
