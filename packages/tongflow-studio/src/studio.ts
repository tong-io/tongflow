/**
 * The Studio: one object holding resolved config, paths, the python
 * bootstrap, the plugin registry and the run manager. Tools, HTTP routes and
 * skills all talk to this instead of to each other.
 */

import { chmod, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { StudioConfig } from "./config.ts";
import { ensureVenv } from "./engine/bootstrap.ts";
import { RegistryManager } from "./engine/registry.ts";
import { RunManager } from "./engine/runs.ts";
import { loadProject, type ProjectRef } from "./project/manifest.ts";
import {
    resolveStudioRoot,
    type StudioPaths,
    studioPaths,
} from "./project/paths.ts";
import { readJsonOr, writeJson } from "./util/fsx.ts";

export type Logger = (line: string) => void;

export interface StudioOptions {
    config: StudioConfig;
    log?: Logger;
    /** Extra env resolved at run time (e.g. credentials); merged over config.env. */
    resolveEnv?: () => Promise<Record<string, string>>;
}

export class Studio {
    readonly config: StudioConfig;
    readonly paths: StudioPaths;
    readonly abiPath: string | undefined;
    readonly registry: RegistryManager;
    readonly runs: RunManager;
    readonly log: Logger;
    private readonly resolveEnv:
        | (() => Promise<Record<string, string>>)
        | undefined;
    private pythonPromise: Promise<string> | undefined;

    constructor(options: StudioOptions) {
        this.config = options.config;
        this.log = options.log ?? (() => undefined);
        this.resolveEnv = options.resolveEnv;
        this.paths = studioPaths(resolveStudioRoot(options.config.studioRoot));
        this.abiPath = resolveAbiPath();
        this.registry = new RegistryManager({
            pluginsDir: this.paths.plugins,
            abiPath: this.abiPath,
            python: () => this.python(),
            org: options.config.pluginOrg,
            pluginGitUrls: options.config.pluginGitUrls,
            log: this.log,
        });
        this.runs = new RunManager(this);
    }

    async init(): Promise<void> {
        await mkdir(this.paths.projects, { recursive: true });
        await mkdir(this.paths.plugins, { recursive: true });
        await mkdir(this.paths.data, { recursive: true });
        await mkdir(this.paths.tmp, { recursive: true });
        if (this.config.autoInstallOfficial) {
            // Background: the studio is usable meanwhile; the registry re-scans when clones land.
            void this.registry.ensureOfficialInstalled().catch((error) => {
                this.log(
                    `tongflow-studio: official plugin install failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            });
        }
    }

    /** The studio venv python (bootstrapped on first use). */
    python(log: Logger = this.log): Promise<string> {
        if (!this.pythonPromise) {
            this.pythonPromise = ensureVenv({
                venvDir: this.paths.venv,
                pythonPath: this.config.pythonPath,
                sdkSpec: this.config.sdkSpec,
                log,
            }).catch((error) => {
                this.pythonPromise = undefined;
                throw error;
            });
        }
        return this.pythonPromise;
    }

    /** Environment handed to the engine (inherited by plugin subprocesses): config.env < env.json < resolver. */
    async pluginEnv(): Promise<Record<string, string>> {
        const stored = await this.readEnvFile();
        const extra = this.resolveEnv ? await this.resolveEnv() : {};
        return { ...this.config.env, ...stored, ...extra };
    }

    private get envFile(): string {
        return join(this.paths.root, "env.json");
    }

    /** Secrets the user entered in the studio UI (plugin API keys, Modal tokens). */
    readEnvFile(): Promise<Record<string, string>> {
        return readJsonOr<Record<string, string>>(this.envFile, {});
    }

    /** Merge updates into env.json (`null` deletes); file is created 0600. */
    async updateEnvFile(
        patch: Record<string, string | null>,
    ): Promise<Record<string, string>> {
        const current = await this.readEnvFile();
        for (const [k, v] of Object.entries(patch)) {
            if (!/^[A-Z][A-Z0-9_]*$/.test(k))
                throw new Error(`invalid env key "${k}"`);
            if (v === null || v === "") delete current[k];
            else current[k] = v;
        }
        await writeJson(this.envFile, current);
        await chmod(this.envFile, 0o600).catch(() => undefined);
        return current;
    }

    project(projectId: string): Promise<ProjectRef> {
        return loadProject(this.paths.root, projectId);
    }
}

function resolveAbiPath(): string | undefined {
    try {
        const require = createRequire(import.meta.url);
        return require.resolve("tongflow/abi");
    } catch {
        // Fall back to the SDK-bundled ABI.
        return undefined;
    }
}
