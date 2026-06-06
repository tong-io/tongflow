import "server-only";

import fs, { existsSync } from "node:fs";
import { join } from "node:path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { logger } from "@/lib/logger";
import {
    isPluginInstalled,
    loadOfficialPluginManifest,
    officialGitUrl,
} from "@/lib/plugins/official-plugins.server";
import { invalidatePluginsRegistry } from "@/lib/plugins/plugins-registry.server";
import { pluginsDir } from "@/lib/runtime/paths.server";

// We clone with isomorphic-git (pure JS) so the host does not need a system git
// binary. Trade-off: isomorphic-git speaks HTTP(S) only — SSH remotes are not
// supported, which is why assertSafeGitUrl restricts custom URLs to http(s).
const PLUGIN_GIT_AUTHOR = { name: "tongflow", email: "tongflow@local" };

// The scanner only detects directories that follow the naming convention; a
// plugin cloned under any other name is silently ignored. We enforce the prefix
// up front so a custom git URL either yields a usable plugin or a clear error.
const PLUGIN_ID_RE = /^tongflow-(modal|api)-[a-z0-9][a-z0-9-]*$/;

export interface InstallResult {
    id: string;
    /** "cloned" for a fresh checkout, "updated" for a fast-forward pull. */
    action: "cloned" | "updated";
    /** Whether the scanner recognized the plugin after the rescan. */
    recognized: boolean;
}

export class PluginInstallError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "PluginInstallError";
    }
}

/**
 * Derive the plugin id (and on-disk directory name) from a git remote URL.
 * Handles https / ssh / scp-style forms and strips an optional `.git` suffix.
 */
export function derivePluginIdFromGitUrl(gitUrl: string): string {
    const trimmed = gitUrl.trim().replace(/\/+$/, "");
    // Basename after the last "/" or ":" (scp-style git@host:org/repo.git).
    const base = trimmed.split(/[/:]/).pop() ?? "";
    return base.replace(/\.git$/i, "");
}

function assertSafeGitUrl(gitUrl: string): void {
    // isomorphic-git only supports the HTTP(S) smart protocol — no SSH/git://.
    if (!/^https?:\/\//i.test(gitUrl.trim())) {
        throw new PluginInstallError(
            "Git URL must be an http(s) URL — SSH remotes (git@…) are not supported.",
        );
    }
}

function assertValidPluginId(id: string): void {
    if (!PLUGIN_ID_RE.test(id)) {
        throw new PluginInstallError(
            `Plugin directory "${id}" must match the tongflow-modal-* or tongflow-api-* convention, otherwise the scanner cannot detect it.`,
        );
    }
}

// Clone the plugin if missing, otherwise fast-forward it to the latest commit.
// Uses isomorphic-git (pure JS) so no system git binary is required.
async function cloneOrPull(
    id: string,
    gitUrl: string,
): Promise<"cloned" | "updated"> {
    const dir = join(pluginsDir(), id);
    try {
        if (existsSync(dir)) {
            await git.pull({
                fs,
                http,
                dir,
                singleBranch: true,
                fastForward: true,
                author: PLUGIN_GIT_AUTHOR,
            });
            return "updated";
        }
        await git.clone({
            fs,
            http,
            dir,
            url: gitUrl,
            singleBranch: true,
        });
        return "cloned";
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new PluginInstallError(`git failed: ${msg}`, 500);
    }
}

/**
 * Install an official plugin (by id) or a custom one (by git URL), then rescan
 * the registry. Exactly one of `id` / `gitUrl` must be provided.
 */
export async function installPlugin(params: {
    id?: string;
    gitUrl?: string;
}): Promise<InstallResult> {
    let id: string;
    let gitUrl: string;

    if (params.id) {
        const manifest = loadOfficialPluginManifest();
        if (!manifest.plugins.includes(params.id)) {
            throw new PluginInstallError(
                `Unknown official plugin: ${params.id}`,
            );
        }
        id = params.id;
        gitUrl = officialGitUrl(manifest.org, id);
    } else if (params.gitUrl) {
        assertSafeGitUrl(params.gitUrl);
        gitUrl = params.gitUrl.trim();
        id = derivePluginIdFromGitUrl(gitUrl);
        assertValidPluginId(id);
    } else {
        throw new PluginInstallError("Provide either an id or a git URL");
    }

    const action = await cloneOrPull(id, gitUrl);
    logger.info(`[plugins] ${action}: ${id}`);

    // Rescan so the new plugin shows up in the registry without a restart.
    const registry = invalidatePluginsRegistry();
    const recognized = Boolean(registry.plugins[id]);

    return { id, action, recognized };
}

export { isPluginInstalled };
