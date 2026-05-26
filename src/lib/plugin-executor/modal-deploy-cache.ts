import "server-only";

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
    getModalPluginConfig,
    getPluginFileAbsolutePath,
} from "@/lib/plugins/plugins-registry.server";

const execFileAsync = promisify(execFile);

const CACHE_DIR = path.join(process.cwd(), ".tongflow", "cache");
const DEPLOY_FILE = path.join(CACHE_DIR, "modal-deploy.json");
const DOWNLOAD_FILE = path.join(CACHE_DIR, "modal-download.json");

const GIT_TIMEOUT_MS = 8000;

export type ModalDeployFingerprint = {
    headSha: string;
    dirty: boolean;
    /** Content hash of deploy.py (plugins/ is gitignored — pin bumps must redeploy). */
    deployFileSha256: string;
};

function cacheKey(fp: ModalDeployFingerprint): string {
    return `${fp.headSha}:${fp.deployFileSha256}`;
}

function hashDeployFile(deployFile: string): string | null {
    try {
        const buf = fs.readFileSync(deployFile);
        return createHash("sha256").update(buf).digest("hex");
    } catch {
        return null;
    }
}

type CacheMap = Record<string, string>;

function parseEnvInt(raw: string | undefined, fallback: number): number {
    if (raw == null || raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function loadMap(filePath: string): CacheMap {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const j = JSON.parse(raw) as unknown;
        if (j && typeof j === "object" && !Array.isArray(j)) {
            const out: CacheMap = {};
            for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
                if (typeof v === "string") out[k] = v;
            }
            return out;
        }
        return {};
    } catch {
        return {};
    }
}

function saveMap(filePath: string, map: CacheMap): void {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(map, null, 2), "utf8");
        fs.renameSync(tmp, filePath);
    } catch {
        /* best-effort: a failed cache write only causes one extra run next time */
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

async function gitStatusPorcelain(cwd: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync(
            "git",
            ["status", "--porcelain"],
            {
                cwd,
                timeout: GIT_TIMEOUT_MS,
                maxBuffer: 1024 * 1024,
            },
        );
        return String(stdout);
    } catch {
        return null;
    }
}

export async function readModalDeployFingerprint(
    pluginId: string,
): Promise<ModalDeployFingerprint | null> {
    const cfg = getModalPluginConfig(pluginId);
    if (!cfg) return null;
    const deployFile = getPluginFileAbsolutePath(pluginId, cfg.deployFile);
    if (!deployFile) return null;

    const pluginRoot =
        findGitRoot(path.dirname(deployFile)) ?? findGitRoot(process.cwd());
    if (!pluginRoot) return null;

    const headSha = await gitRevParseHead(pluginRoot);
    if (!headSha) return null;

    const deployFileSha256 = hashDeployFile(deployFile);
    if (!deployFileSha256) return null;

    const porcelainRaw = await gitStatusPorcelain(pluginRoot);
    if (porcelainRaw === null) return null;

    const dirty = porcelainRaw.trim().length > 0;
    return { headSha, dirty, deployFileSha256 };
}

async function shouldSkip(
    pluginId: string,
    filePath: string,
    forceEnv: string,
): Promise<boolean> {
    if (process.env[forceEnv] === "1") return false;
    const fp = await readModalDeployFingerprint(pluginId);
    if (!fp || fp.dirty) return false;
    return loadMap(filePath)[pluginId] === cacheKey(fp);
}

async function record(pluginId: string, filePath: string): Promise<void> {
    const fp = await readModalDeployFingerprint(pluginId);
    if (!fp || fp.dirty) return;
    const map = loadMap(filePath);
    map[pluginId] = cacheKey(fp);
    saveMap(filePath, map);
}

export function shouldSkipModalDeploy(pluginId: string): Promise<boolean> {
    return shouldSkip(pluginId, DEPLOY_FILE, "MODAL_FORCE_REDEPLOY");
}

export function recordModalDeployCache(pluginId: string): Promise<void> {
    return record(pluginId, DEPLOY_FILE);
}

export function shouldSkipModalDownload(pluginId: string): Promise<boolean> {
    return shouldSkip(pluginId, DOWNLOAD_FILE, "MODAL_FORCE_REDOWNLOAD");
}

export function recordModalDownloadCache(pluginId: string): Promise<void> {
    return record(pluginId, DOWNLOAD_FILE);
}

/** Escalate Modal cancel strictness after repeated SDK timeouts (see MODAL_TERMINATE_AFTER_TIMEOUTS). */
export function modalTerminateAfterTimeouts(): number {
    return parseEnvInt(process.env.MODAL_TERMINATE_AFTER_TIMEOUTS, 3);
}
