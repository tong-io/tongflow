import "server-only";

import fs, { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { logger } from "tongflow";
import { loadPluginMetaMap } from "@/lib/plugins/plugin-env-manifests.server";
import { pluginsDir, resourcesDir } from "@/lib/runtime/paths.server";

/**
 * The canonical official-plugin manifest lives in config/official-plugins.json
 * and is shared with scripts/install-official-plugins.mjs — a single source of
 * truth for both the CLI installer and the in-app plugin manager.
 */
export interface OfficialPluginManifest {
    org: string;
    plugins: string[];
    /**
     * Plugin id → runtime, for the plugins that do not run in Python
     * (absent = `python`). `browser` plugins are run by the browser edge
     * runtime; they install like any other plugin.
     */
    runtimes?: Record<string, "browser">;
}

export interface OfficialPluginInfo {
    id: string;
    installed: boolean;
    /** Presentation metadata (from an installed plugin's manifest). */
    name?: string;
    description?: string;
    /** App-root path or URL to the plugin icon (manifest, else public convention). */
    icon?: string;
    /** Set for plugins the browser edge runtime runs (`tongflow-edge-*`). */
    runtime?: "browser";
}

function manifestPath(): string {
    return join(resourcesDir(), "config", "official-plugins.json");
}

/**
 * Icon served from the app bundle by convention: `public/plugins/<id>.(svg|png)`.
 * Available even for not-yet-installed plugins (unlike the per-plugin manifest).
 * Returns the web path (e.g. `/plugins/<id>.svg`) or null when no file exists.
 */
function publicIconPath(id: string): string | null {
    const dir = join(resourcesDir(), "public", "plugins");
    for (const ext of ["svg", "png", "webp"]) {
        if (existsSync(join(dir, `${id}.${ext}`))) {
            return `/plugins/${id}.${ext}`;
        }
    }
    return null;
}

export function loadOfficialPluginManifest(): OfficialPluginManifest {
    const raw = readFileSync(manifestPath(), "utf8");
    return JSON.parse(raw) as OfficialPluginManifest;
}

/** Git remote URL for an official plugin id under the configured org. */
export function officialGitUrl(org: string, id: string): string {
    return `${org}/${id}.git`;
}

/**
 * A plugin is "installed" once it has a real git checkout under the plugins dir.
 * We check for `.git` rather than the directory alone: an interrupted/failed
 * clone leaves an empty (or partial) directory behind, and treating that as
 * "installed" would hide the install button forever while the scanner ignores
 * the empty dir — the node then reports "no implementation" with no way to fix.
 */
export function isPluginInstalled(id: string): boolean {
    return existsSync(join(pluginsDir(), id, ".git"));
}

export function listOfficialPlugins(): {
    org: string;
    plugins: OfficialPluginInfo[];
} {
    const manifest = loadOfficialPluginManifest();
    const metaMap = loadPluginMetaMap();
    return {
        org: manifest.org,
        plugins: manifest.plugins.map((id) => {
            const meta = metaMap[id];
            // Manifest icon wins; otherwise fall back to the public convention
            // so even not-yet-installed plugins can show an icon.
            const icon = meta?.icon ?? publicIconPath(id) ?? undefined;
            const browser =
                manifest.runtimes?.[id] === "browser" ||
                id.startsWith("tongflow-edge-");
            return {
                id,
                installed: isPluginInstalled(id),
                name: meta?.name,
                description: meta?.description,
                icon,
                ...(browser ? { runtime: "browser" as const } : {}),
            };
        }),
    };
}

/**
 * Installed plugins under the plugins dir that are not in the official
 * manifest — i.e. community plugins cloned from a custom git URL.
 */
export function listInstalledCommunityPlugins(): string[] {
    const official = new Set(loadOfficialPluginManifest().plugins);
    let entries: string[];
    try {
        entries = fs.readdirSync(pluginsDir());
    } catch {
        // Plugins dir not created yet — nothing installed.
        return [];
    }
    return entries
        .filter((id) => !official.has(id) && isPluginInstalled(id))
        .sort();
}

/** Update status for one installed plugin, from comparing local vs remote HEAD. */
export interface PluginUpdateInfo {
    id: string;
    localCommit: string | null;
    remoteCommit: string | null;
    /** True only when both commits are known and differ. */
    hasUpdate: boolean;
}

/** Local HEAD commit of an installed plugin (read from its .git, no network). */
async function localHeadCommit(id: string): Promise<string | null> {
    try {
        return await git.resolveRef({
            fs,
            dir: join(pluginsDir(), id),
            ref: "HEAD",
        });
    } catch {
        return null;
    }
}

/** Remote default-branch HEAD commit (a single ls-remote, no clone). */
async function remoteHeadCommit(
    org: string,
    id: string,
): Promise<string | null> {
    try {
        const refs = await git.listServerRefs({
            http,
            url: officialGitUrl(org, id),
            prefix: "HEAD",
            symrefs: true,
        });
        return refs.find((r) => r.ref === "HEAD")?.oid ?? null;
    } catch (e) {
        // Network/auth failure: treat as "unknown" rather than surfacing an error
        // — the user can still pull manually.
        logger.warn(`[plugins] update check failed for ${id}: ${String(e)}`);
        return null;
    }
}

/** Compare local vs remote HEAD for one plugin. Not-installed -> no update. */
export async function checkPluginUpdate(
    org: string,
    id: string,
): Promise<PluginUpdateInfo> {
    if (!isPluginInstalled(id)) {
        return { id, localCommit: null, remoteCommit: null, hasUpdate: false };
    }
    const [localCommit, remoteCommit] = await Promise.all([
        localHeadCommit(id),
        remoteHeadCommit(org, id),
    ]);
    return {
        id,
        localCommit,
        remoteCommit,
        hasUpdate: Boolean(
            localCommit && remoteCommit && localCommit !== remoteCommit,
        ),
    };
}

/** Check every installed official plugin in parallel (one ls-remote each). */
export async function checkOfficialPluginUpdates(): Promise<
    PluginUpdateInfo[]
> {
    const manifest = loadOfficialPluginManifest();
    const installed = manifest.plugins.filter((id) => isPluginInstalled(id));
    return Promise.all(
        installed.map((id) => checkPluginUpdate(manifest.org, id)),
    );
}
