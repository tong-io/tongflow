import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
    PluginsRegistrySchema,
    type ModalPluginConfig,
    type LlmPluginConfig,
    type PluginsRegistry,
    type PluginConfig,
} from "@/lib/plugins-registry-schema";

const DEFAULT_PATH = join(process.cwd(), ".tongflow", "plugins.registry.json");
const LEGACY_PATH = join(process.cwd(), "config", "plugins.registry.json");

function readJsonFile(path: string): unknown {
    const text = readFileSync(path, "utf8");
    return JSON.parse(text) as unknown;
}

let cached: PluginsRegistry | null = null;

function emptyRegistry(): PluginsRegistry {
    return {
        version: 1,
        generatedAt: new Date(0).toISOString(),
        nodePluginMap: {},
        plugins: {},
    };
}

export function loadPluginsRegistry(): PluginsRegistry {
    if (cached && process.env.NODE_ENV === "production") return cached;
    const pathToRead = existsSync(DEFAULT_PATH)
        ? DEFAULT_PATH
        : existsSync(LEGACY_PATH)
          ? LEGACY_PATH
          : null;
    if (!pathToRead) {
        cached = emptyRegistry();
        return cached;
    }
    const raw = readJsonFile(pathToRead);
    const parsed = PluginsRegistrySchema.safeParse(raw);
    if (parsed.success) {
        cached = parsed.data;
        return cached;
    }
    // eslint-disable-next-line no-console
    console.warn(
        "[plugins] Invalid plugins.registry.json, using empty:",
        parsed.error.message,
    );
    cached = emptyRegistry();
    return cached;
}

export function getNodePluginIds(nodeSlot: string): string[] {
    const reg = loadPluginsRegistry();
    const list = reg.nodePluginMap[nodeSlot] ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of list) {
        const x = id.trim();
        if (!x || seen.has(x)) continue;
        seen.add(x);
        out.push(x);
    }
    return out;
}

/** @deprecated */
export const getNodePluginRepos = getNodePluginIds;

export function getModalPluginConfig(pluginId: string): ModalPluginConfig | null {
    const reg = loadPluginsRegistry();
    const p = reg.plugins[pluginId];
    if (!p || p.runner !== "modal") return null;
    return p.runners.modal ?? null;
}

export function getLlmPluginConfig(pluginId: string): LlmPluginConfig | null {
    const reg = loadPluginsRegistry();
    const p = reg.plugins[pluginId];
    if (!p || p.runner !== "llm") return null;
    return p.runners.llm ?? null;
}

export function getPluginConfig(pluginId: string): PluginConfig | null {
    const reg = loadPluginsRegistry();
    return reg.plugins[pluginId] ?? null;
}

/** @deprecated */
export const getModalRepoConfig = (repo: string) =>
    getModalPluginConfig(repo);

/**
 * On-disk path to a file inside a plugin, e.g. `plugins/x/download.py`
 */
export function getPluginFileAbsolutePath(
    pluginId: string,
    fileRelative: string,
): string | null {
    const c = getModalPluginConfig(pluginId);
    if (!c) return null;
    return join(process.cwd(), c.localSubdir, fileRelative);
}
