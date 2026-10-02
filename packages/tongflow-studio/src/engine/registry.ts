/**
 * Plugin registry: what TongFlow plugins are installed under the studio
 * plugins dir and which ABI slots they implement. Produced headlessly by
 * `python -m tongflow scan`, cached in memory, invalidated on install /
 * uninstall. Presentation metadata (name / description / icon / env) is merged
 * from each plugin's `tongflow.plugin.json`, as the TongFlow app does.
 */
import { execFile as execFileCb } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { type PluginsRegistry, PluginsRegistrySchema } from "tongflow";
import { exists, isDir, readJsonOr } from "../util/fsx.ts";

const execFile = promisify(execFileCb);

export interface PluginEnvSpec {
    key: string;
    required?: boolean;
    description?: string;
    url?: string;
    default?: string;
}

export interface PluginMeta {
    name?: string;
    description?: string;
    icon?: string;
    env: PluginEnvSpec[];
}

/** Registry as served to the canvas plus per-plugin metadata for tools/settings. */
export interface StudioRegistry {
    registry: PluginsRegistry;
    meta: Record<string, PluginMeta>;
    scannedAt: string;
}

export const OFFICIAL_ORG = "https://github.com/tong-io";

/**
 * Official plugin ids — fallback snapshot of `config/official-plugins.json`
 * in the TongFlow repo; `RegistryManager.officialIds()` fetches the live list
 * and falls back to this one offline.
 */
export const OFFICIAL_PLUGINS: readonly string[] = [
    "tongflow-router-openrouter",
    "tongflow-router-cometapi",
    "tongflow-router-toapis",
    "tongflow-api-gemini",
    "tongflow-api-openai",
    "tongflow-api-deepseek",
    "tongflow-api-bytedance",
    "tongflow-router-apimart",
    "tongflow-api-xai",
    "tongflow-router-replicate",
    "tongflow-router-fal",
    "tongflow-api-runway",
    "tongflow-modal-ffmpeg",
    "tongflow-modal-pyscenedetect",
    "tongflow-modal-z-image",
    "tongflow-modal-ernie-image",
    "tongflow-modal-krea2",
    "tongflow-modal-flux2-klein9b",
    "tongflow-modal-boogu",
    "tongflow-modal-infinitetalk",
    "tongflow-modal-wan-animate",
    "tongflow-modal-scail2",
    "tongflow-modal-minimax-h3",
    "tongflow-modal-bernini",
    "tongflow-modal-sam3",
    "tongflow-modal-triposplat",
    "tongflow-modal-sam-3d-objects",
    "tongflow-modal-sam-3d-body",
    "tongflow-modal-sapiens2",
    "tongflow-modal-sensenova-vision",
    "tongflow-modal-seedvr2",
    "tongflow-modal-gemma4",
    "tongflow-modal-qwen38",
    "tongflow-modal-qwen3asr",
    "tongflow-modal-qwen3tts",
    "tongflow-modal-indextts2",
    "tongflow-modal-whisper",
    "tongflow-modal-ace-step",
    "tongflow-modal-levo",
    "tongflow-modal-minimax-music3",
    "tongflow-modal-sam-audio",
    "tongflow-modal-docling",
    "tongflow-modal-paddle",
    "tongflow-modal-unlimited-ocr",
    "tongflow-modal-crawl4ai",
    "tongflow-modal-scrapling",
];

/** Where the live official list is fetched from. */
export const OFFICIAL_PLUGINS_URL =
    "https://raw.githubusercontent.com/tong-io/tongflow/main/config/official-plugins.json";

const PLUGIN_ID_RE = /^tongflow-(modal|api|router|local)-[a-z0-9-]+$/;

export function isPluginId(id: string): boolean {
    return PLUGIN_ID_RE.test(id);
}

export class RegistryManager {
    private cache: StudioRegistry | undefined;
    private inflight: Promise<StudioRegistry> | undefined;
    private officialCache: { ids: string[]; at: number } | undefined;

    constructor(
        private readonly opts: {
            pluginsDir: string;
            abiPath: string | undefined;
            python: () => Promise<string>;
            org: string;
            pluginGitUrls: Record<string, string>;
            log: (line: string) => void;
        },
    ) {}

    invalidate(): void {
        this.cache = undefined;
    }

    async get(): Promise<StudioRegistry> {
        if (this.cache) return this.cache;
        if (!this.inflight) {
            this.inflight = this.scan().finally(() => {
                this.inflight = undefined;
            });
        }
        return this.inflight;
    }

    private async scan(): Promise<StudioRegistry> {
        await mkdir(this.opts.pluginsDir, { recursive: true });
        const python = await this.opts.python();
        const args = ["-m", "tongflow", "scan", "--root", this.opts.pluginsDir];
        if (this.opts.abiPath) args.push("--abi", this.opts.abiPath);
        const { stdout } = await execFile(python, args, {
            maxBuffer: 32 * 1024 * 1024,
        });
        const registry = PluginsRegistrySchema.parse(JSON.parse(stdout));
        const meta: Record<string, PluginMeta> = {};
        for (const id of Object.keys(registry.plugins)) {
            const m = await readJsonOr<{
                plugin?: Omit<PluginMeta, "env">;
                env?: PluginEnvSpec[];
            }>(join(this.opts.pluginsDir, id, "tongflow.plugin.json"), {});
            meta[id] = { ...(m.plugin ?? {}), env: m.env ?? [] };
            const p = registry.plugins[id] as Record<string, unknown>;
            if (m.plugin?.name) p.name = m.plugin.name;
            if (m.plugin?.description) p.description = m.plugin.description;
        }
        this.cache = { registry, meta, scannedAt: new Date().toISOString() };
        return this.cache;
    }

    /** The official plugin list: live from GitHub (cached 1 h), else the built-in snapshot. */
    async officialIds(): Promise<string[]> {
        const now = Date.now();
        if (this.officialCache && now - this.officialCache.at < 3_600_000)
            return this.officialCache.ids;
        let ids: string[] = [...OFFICIAL_PLUGINS];
        try {
            const res = await fetch(OFFICIAL_PLUGINS_URL, {
                signal: AbortSignal.timeout(8000),
            });
            if (res.ok) {
                const body = (await res.json()) as { plugins?: unknown };
                if (
                    Array.isArray(body.plugins) &&
                    body.plugins.every(
                        (p) => typeof p === "string" && isPluginId(p),
                    )
                )
                    ids = body.plugins as string[];
            }
        } catch {
            // offline: keep the snapshot
        }
        this.officialCache = { ids, at: now };
        return ids;
    }

    /**
     * Clone every official plugin that is not installed yet (shallow, a few
     * hundred KB each) so the canvas offers the full catalog like the hosted
     * app. Runs in the background at studio start; failures are logged, not
     * thrown. Returns the ids that were newly installed.
     */
    async ensureOfficialInstalled(concurrency = 4): Promise<string[]> {
        const [official, installed] = await Promise.all([
            this.officialIds(),
            this.installedIds(),
        ]);
        const have = new Set(installed);
        const missing = official.filter((id) => !have.has(id));
        if (missing.length === 0) return [];
        this.opts.log(
            `tongflow-studio: installing ${missing.length} official plugin(s)…`,
        );
        const done: string[] = [];
        let next = 0;
        const worker = async () => {
            while (next < missing.length) {
                const id = missing[next++];
                try {
                    const r = await this.install(id);
                    if (!r.alreadyInstalled) done.push(id);
                } catch (error) {
                    this.opts.log(
                        `tongflow-studio: install ${id} failed: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
        };
        await Promise.all(
            Array.from(
                { length: Math.min(concurrency, missing.length) },
                worker,
            ),
        );
        if (done.length > 0) this.invalidate();
        this.opts.log(
            `tongflow-studio: installed ${done.length} official plugin(s)`,
        );
        return done;
    }

    /** Installed plugin ids (directories under pluginsDir). */
    async installedIds(): Promise<string[]> {
        if (!(await isDir(this.opts.pluginsDir))) return [];
        const entries = await readdir(this.opts.pluginsDir, {
            withFileTypes: true,
        });
        return entries
            .filter((e) => e.isDirectory() && isPluginId(e.name))
            .map((e) => e.name)
            .sort();
    }

    gitUrlFor(pluginId: string): string {
        return (
            this.opts.pluginGitUrls[pluginId] ??
            `${this.opts.org.replace(/\/$/, "")}/${pluginId}.git`
        );
    }

    /** `git clone --depth 1` a plugin (id → official org, or a full git URL). */
    async install(
        idOrUrl: string,
        signal?: AbortSignal,
    ): Promise<{ id: string; url: string; alreadyInstalled: boolean }> {
        let id: string;
        let url: string;
        if (/^(https?:\/\/|git@|ssh:\/\/)/.test(idOrUrl)) {
            url = idOrUrl;
            id = idOrUrl
                .replace(/\/+$/, "")
                .split("/")
                .pop()!
                .replace(/\.git$/, "");
        } else {
            id = idOrUrl;
            url = this.gitUrlFor(id);
        }
        if (!isPluginId(id)) {
            throw new Error(
                `"${id}" is not a TongFlow plugin id (tongflow-modal-*/api-*/router-*/local-*)`,
            );
        }
        const dest = join(this.opts.pluginsDir, id);
        if (await exists(dest)) return { id, url, alreadyInstalled: true };
        await mkdir(this.opts.pluginsDir, { recursive: true });
        this.opts.log(`cloning ${url}`);
        await execFile(
            "git",
            ["clone", "--depth", "1", "--recursive", url, dest],
            { signal },
        );
        this.invalidate();
        return { id, url, alreadyInstalled: false };
    }

    async uninstall(id: string): Promise<void> {
        if (!isPluginId(id)) throw new Error(`invalid plugin id "${id}"`);
        await rm(join(this.opts.pluginsDir, id), {
            recursive: true,
            force: true,
        });
        this.invalidate();
    }

    /** `git pull` every installed plugin; returns ids that changed. */
    async update(ids?: string[]): Promise<string[]> {
        const targets = ids ?? (await this.installedIds());
        const changed: string[] = [];
        for (const id of targets) {
            const dir = join(this.opts.pluginsDir, id);
            if (!(await isDir(join(dir, ".git")))) continue;
            try {
                const before = (
                    await execFile("git", ["-C", dir, "rev-parse", "HEAD"])
                ).stdout.trim();
                await execFile("git", [
                    "-C",
                    dir,
                    "pull",
                    "--ff-only",
                    "--recurse-submodules",
                ]);
                const after = (
                    await execFile("git", ["-C", dir, "rev-parse", "HEAD"])
                ).stdout.trim();
                if (before !== after) changed.push(id);
            } catch (error) {
                this.opts.log(
                    `update ${id} failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
        if (changed.length > 0) this.invalidate();
        return changed;
    }
}
