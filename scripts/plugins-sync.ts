import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { logger } from "../src/lib/logger";
import {
    type PluginsRegistry,
    PluginsRegistrySchema,
} from "../src/lib/plugins-registry-schema";

function readJson(p: string): unknown {
    return JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
}

function writeJson(p: string, data: unknown): void {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

const PythonScanOutSchema = z
    .object({
        version: z.literal(1),
        generatedAt: z.string().min(1).optional(),
        scannerVersion: z.number().int().optional(),
        nodePluginMap: z.record(z.string(), z.array(z.string())).optional(),
        plugins: z.record(z.string(), z.unknown()).optional(),
        errors: z
            .array(z.object({ pluginId: z.string(), message: z.string() }))
            .optional(),
    })
    .passthrough();

function pickPython(): string {
    const fromEnv = process.env.PYTHON?.trim() || process.env.PYTHON3?.trim();
    if (fromEnv) return fromEnv;
    // Prefer 3.10+ when available; scan is tested with 3.9+ without dataclass slots.
    return "python3";
}

async function runScan(repoRoot: string): Promise<PluginsRegistry> {
    const sdk = path.join(repoRoot, "plugins", "tongflow");
    const abi = path.join(repoRoot, "config", "tongflow.abi.json");

    if (!fs.existsSync(abi)) {
        logger.error(
            "[plugins:sync] Missing config/tongflow.abi.json. Run: node scripts/generate-tongflow-abi.mjs",
        );
        const empty: PluginsRegistry = {
            version: 1,
            generatedAt: new Date().toISOString(),
            nodePluginMap: {},
            plugins: {},
            errors: [
                {
                    pluginId: "<sync>",
                    message: "Missing config/tongflow.abi.json",
                },
            ],
        };
        return empty;
    }

    // Keep Python SDK constants in sync with ABI (plugins use NodeSlots.*).
    try {
        execFileSync(
            pickPython(),
            [
                "-m",
                "tongflow.gen_node_slots",
                "--abi",
                abi,
                "--out",
                path.join(sdk, "tongflow", "node_slots.py"),
            ],
            {
                cwd: repoRoot,
                env: { ...process.env, PYTHONPATH: `${sdk}` },
                stdio: "inherit",
            },
        );
    } catch {
        // best-effort; scan will fail plugins if constants missing
    }

    // Generate per-slot Input/Output models (plugins import these types).
    try {
        execFileSync(
            pickPython(),
            [
                "-m",
                "tongflow.gen_models",
                "--abi",
                abi,
                "--out-dir",
                path.join(sdk, "tongflow", "models"),
            ],
            {
                cwd: repoRoot,
                env: { ...process.env, PYTHONPATH: `${sdk}` },
                stdio: "inherit",
            },
        );
    } catch {
        // best-effort; scan will fail plugins if types are missing
    }

    const args = [
        "-m",
        "tongflow",
        "--root",
        path.join(repoRoot, "plugins"),
        "--abi",
        abi,
    ];

    const out = await new Promise<string>((resolve, reject) => {
        const child = execFile(
            pickPython(),
            args,
            {
                cwd: repoRoot,
                env: { ...process.env, PYTHONPATH: `${sdk}` },
                maxBuffer: 32 * 1024 * 1024,
            },
            (err, stdout) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(String(stdout));
            },
        );
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!child) {
            reject(new Error("Failed to start python"));
        }
    });

    const raw = (() => {
        try {
            return JSON.parse(out) as unknown;
        } catch {
            return null;
        }
    })();
    if (!raw) {
        logger.error("[plugins:sync] scan stdout was not valid JSON", out);
        return {
            version: 1,
            generatedAt: new Date().toISOString(),
            nodePluginMap: {},
            plugins: {},
            errors: [
                {
                    pluginId: "<sync>",
                    message: "Python scan did not return JSON",
                },
            ],
        };
    }

    const s = PythonScanOutSchema.safeParse(raw);
    if (!s.success) {
        logger.error("[plugins:sync] parse scan JSON:", s.error.message);
        return {
            version: 1,
            generatedAt: new Date().toISOString(),
            nodePluginMap: {},
            plugins: {},
            errors: [{ pluginId: "<sync>", message: s.error.message }],
        };
    }
    const j = s.data;
    if (!j.plugins || Object.keys(j.plugins).length === 0) {
        logger.warn(
            "[plugins:sync] scan reported no plugins (see errors in registry)",
        );
    }

    const reg = PluginsRegistrySchema.parse({
        version: 1,
        generatedAt: j.generatedAt || new Date().toISOString(),
        scannerVersion: j.scannerVersion,
        nodePluginMap: j.nodePluginMap || {},
        plugins: (j.plugins ?? {}) as PluginsRegistry["plugins"],
        errors: j.errors,
    } satisfies z.input<typeof PluginsRegistrySchema>);

    return reg;
}

async function main(): Promise<void> {
    const repoRoot = process.cwd();
    const outPath = path.join(repoRoot, ".tongflow", "plugins.registry.json");

    try {
        const reg = await runScan(repoRoot);
        writeJson(outPath, reg);
        if (reg.errors?.length) {
            logger.warn(
                `[plugins:sync] ${reg.errors.length} plugin(s) skipped; see "errors" in ${path.relative(
                    repoRoot,
                    outPath,
                )}`,
            );
        }
    } catch (e) {
        logger.error("[plugins:sync] scan failed, writing empty registry", e);
        const fallback: PluginsRegistry = {
            version: 1,
            generatedAt: new Date().toISOString(),
            nodePluginMap: {},
            plugins: {},
            errors: [
                {
                    pluginId: "<sync>",
                    message: e instanceof Error ? e.message : String(e),
                },
            ],
        };
        writeJson(outPath, fallback);
    }

    logger.info(
        `[plugins:sync] Wrote ${path.relative(process.cwd(), outPath)}`,
    );
}

void main();
