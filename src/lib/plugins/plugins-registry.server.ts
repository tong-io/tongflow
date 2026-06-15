import "server-only";

import { join } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { logger } from "@/lib/logger";
import type {
    PluginConfig,
    PluginsRegistry,
} from "@/lib/plugins/plugins-registry-schema";
import { runPluginsScanner } from "@/lib/plugins/plugins-scanner.server";
import { pluginsDir, resourcesDir } from "@/lib/runtime/paths.server";

let cached: PluginsRegistry | null = null;
let watcher: FSWatcher | null = null;
let rescanTimer: NodeJS.Timeout | null = null;

function emptyRegistry(message?: string): PluginsRegistry {
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        nodePluginMap: {},
        plugins: {},
        errors: message
            ? [
                  {
                      pluginId: "<scan>",
                      message,
                  },
              ]
            : undefined,
    };
}

function scanAndCache(): PluginsRegistry {
    ensureDevWatcher();
    try {
        cached = runPluginsScanner();
        return cached;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn("[plugins] Scanner failed, using empty registry:", message);
        return emptyRegistry(message);
    }
}

function scheduleRescan(): void {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
        try {
            cached = runPluginsScanner();
            logger.debug("[plugins] Registry refreshed from scanner");
        } catch (e) {
            logger.warn(
                "[plugins] Registry rescan failed; keeping previous cache:",
                e instanceof Error ? e.message : String(e),
            );
        }
    }, 300);
}

// The dev watcher starts on the first explicit registry load/refresh, not via
// feature-registry module initialization, so lifecycle APIs can refresh safely.
function ensureDevWatcher(): void {
    if (process.env.NODE_ENV === "production" || watcher) return;
    watcher = chokidar.watch(
        [
            join(pluginsDir(), "**", "*.py"),
            join(resourcesDir(), "config", "tongflow.abi.json"),
        ],
        {
            ignoreInitial: true,
            ignored: ["**/__pycache__/**", "**/.venv/**", "**/node_modules/**"],
        },
    );
    watcher.on("all", scheduleRescan);
    watcher.on("error", (e) => {
        logger.warn(
            "[plugins] Registry watcher error:",
            e instanceof Error ? e.message : String(e),
        );
    });
}

export function loadPluginsRegistry(): PluginsRegistry {
    if (cached) return cached;
    return scanAndCache();
}

export function invalidatePluginsRegistry(): PluginsRegistry {
    cached = null;
    if (rescanTimer) {
        clearTimeout(rescanTimer);
        rescanTimer = null;
    }
    return scanAndCache();
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

export function getPluginConfig(pluginId: string): PluginConfig | null {
    const reg = loadPluginsRegistry();
    return reg.plugins[pluginId] ?? null;
}
