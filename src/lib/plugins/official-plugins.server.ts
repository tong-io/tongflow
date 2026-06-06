import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginsDir, resourcesDir } from "@/lib/runtime/paths.server";

/**
 * The canonical official-plugin manifest lives in config/official-plugins.json
 * and is shared with scripts/install-official-plugins.mjs — a single source of
 * truth for both the CLI installer and the in-app plugin manager.
 */
export interface OfficialPluginManifest {
    org: string;
    plugins: string[];
}

export type PluginRunner = "modal" | "api";

export interface OfficialPluginInfo {
    id: string;
    runner: PluginRunner;
    installed: boolean;
}

function manifestPath(): string {
    return join(resourcesDir(), "config", "official-plugins.json");
}

export function loadOfficialPluginManifest(): OfficialPluginManifest {
    const raw = readFileSync(manifestPath(), "utf8");
    return JSON.parse(raw) as OfficialPluginManifest;
}

/** Git remote URL for an official plugin id under the configured org. */
export function officialGitUrl(org: string, id: string): string {
    return `${org}/${id}.git`;
}

/** A plugin is "installed" once its directory exists under the plugins dir. */
export function isPluginInstalled(id: string): boolean {
    return existsSync(join(pluginsDir(), id));
}

/** Derive the runner from the naming convention (tongflow-modal-* / tongflow-api-*). */
export function runnerFromId(id: string): PluginRunner {
    return id.startsWith("tongflow-api-") ? "api" : "modal";
}

export function listOfficialPlugins(): {
    org: string;
    plugins: OfficialPluginInfo[];
} {
    const manifest = loadOfficialPluginManifest();
    return {
        org: manifest.org,
        plugins: manifest.plugins.map((id) => ({
            id,
            runner: runnerFromId(id),
            installed: isPluginInstalled(id),
        })),
    };
}
