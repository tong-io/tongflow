import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { getModalPluginConfig, getPluginFileAbsolutePath } from "@/lib/plugins-registry.server";

const execFileAsync = promisify(execFile);

/** One JSON file per plugin — avoids concurrent writers corrupting a shared file. */
const CACHE_DIR = path.join(
    process.cwd(),
    ".openflow",
    "cache",
    "modal-deploy-cache",
);

const GIT_TIMEOUT_MS = 8000;

export type ModalDeployFingerprint = {
    headSha: string;
    dirty: boolean;
};

type PluginDeployCacheEntry = {
    headSha: string;
    dirty: boolean;
    recordedAt: string;
};

function cacheFilePath(pluginId: string): string {
    const safe = pluginId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(CACHE_DIR, `${safe}.json`);
}

function parseEnvInt(raw: string | undefined, fallback: number): number {
    if (raw == null || raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function readPluginCache(pluginId: string): PluginDeployCacheEntry | null {
    try {
        const raw = fs.readFileSync(cacheFilePath(pluginId), "utf8");
        const j = JSON.parse(raw) as Partial<PluginDeployCacheEntry>;
        if (
            typeof j.headSha !== "string" ||
            typeof j.dirty !== "boolean" ||
            typeof j.recordedAt !== "string"
        ) {
            return null;
        }
        return {
            headSha: j.headSha,
            dirty: j.dirty,
            recordedAt: j.recordedAt,
        };
    } catch {
        return null;
    }
}

function writePluginCacheBestEffort(
    pluginId: string,
    entry: PluginDeployCacheEntry,
): void {
    const p = cacheFilePath(pluginId);
    try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(entry, null, 2), "utf8");
    } catch {
        /* deploy already succeeded; cache is best-effort */
    }
}

function findGitRoot(startDir: string): string | null {
    let dir = path.resolve(startDir);
    for (;;) {
        if (fs.existsSync(path.join(dir, ".git"))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

async function gitRevParseHead(cwd: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
            cwd,
            timeout: GIT_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
        });
        const s = String(stdout).trim();
        return s.length > 0 ? s : null;
    } catch {
        return null;
    }
}

/** Empty string = clean tree; `null` = git failed */
async function gitStatusPorcelain(cwd: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
            cwd,
            timeout: GIT_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
        });
        return String(stdout);
    } catch {
        return null;
    }
}

/**
 * HEAD SHA + dirty flag for deploy skip (Phase 3): download is never skipped here.
 */
export async function readModalDeployFingerprint(
    pluginId: string,
): Promise<ModalDeployFingerprint | null> {
    const cfg = getModalPluginConfig(pluginId);
    if (!cfg) return null;
    const deployFile = getPluginFileAbsolutePath(pluginId, cfg.deployFile);
    if (!deployFile) return null;

    const pluginRoot =
        findGitRoot(path.dirname(deployFile)) ??
        findGitRoot(process.cwd());
    if (!pluginRoot) return null;

    const headSha = await gitRevParseHead(pluginRoot);
    if (!headSha) return null;

    const porcelainRaw = await gitStatusPorcelain(pluginRoot);
    if (porcelainRaw === null) return null;

    const dirty = porcelainRaw.trim().length > 0;
    return { headSha, dirty };
}

export async function shouldSkipModalDeploy(pluginId: string): Promise<boolean> {
    if (process.env.MODAL_FORCE_REDEPLOY === "1") return false;

    const fp = await readModalDeployFingerprint(pluginId);
    if (!fp || fp.dirty) return false;

    const cached = readPluginCache(pluginId);
    if (!cached) return false;

    return cached.headSha === fp.headSha && !cached.dirty;
}

export async function recordModalDeployCache(pluginId: string): Promise<void> {
    const fp = await readModalDeployFingerprint(pluginId);
    if (!fp) return;

    writePluginCacheBestEffort(pluginId, {
        headSha: fp.headSha,
        dirty: fp.dirty,
        recordedAt: new Date().toISOString(),
    });
}

/** Escalate Modal cancel strictness after repeated SDK timeouts (see MODAL_TERMINATE_AFTER_TIMEOUTS). */
export function modalTerminateAfterTimeouts(): number {
    return parseEnvInt(process.env.MODAL_TERMINATE_AFTER_TIMEOUTS, 3);
}
