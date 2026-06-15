import "server-only";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/runtime/paths.server";

/**
 * Generic, platform-agnostic environment store.
 *
 * TongFlow itself declares no specific keys: this is a flat `key -> value` map
 * that the user fills in (workspace settings dialog). Each plugin documents the
 * keys it needs in its own README. The stored values are merged into the
 * environment of spawned plugin processes at execution time, so edits take
 * effect without restarting the server.
 */

export type EnvStore = Record<string, string>;

function storeFile(): string {
    return path.join(dataDir(), "settings.json");
}

/** Read the stored env map. Returns `{}` when absent or unreadable. */
export function loadEnvStore(): EnvStore {
    try {
        const raw = readFileSync(storeFile(), "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }
        const out: EnvStore = {};
        for (const [k, v] of Object.entries(
            parsed as Record<string, unknown>,
        )) {
            if (typeof k === "string" && k.trim() && typeof v === "string") {
                out[k] = v;
            }
        }
        return out;
    } catch {
        return {};
    }
}

/** Persist the env map, overwriting the previous contents. */
export function saveEnvStore(env: EnvStore): void {
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    const clean: EnvStore = {};
    for (const [k, v] of Object.entries(env)) {
        const key = k.trim();
        if (key && typeof v === "string") clean[key] = v;
    }
    writeFileSync(storeFile(), JSON.stringify(clean, null, 2), "utf8");
}

/**
 * Build a spawn environment: the stored values override the process env so the
 * UI is the source of truth, while still inheriting PATH and other essentials.
 */
export function withStoredEnv(
    extra?: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
    return {
        ...process.env,
        ...loadEnvStore(),
        ...extra,
    };
}
