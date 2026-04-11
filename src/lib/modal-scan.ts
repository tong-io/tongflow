/**
 * Scan `modal/cpu` and `modal/gpu` for deployable scripts and light metadata
 * (module title + Modal App name) without executing Python.
 */

import fs from "node:fs";
import path from "node:path";
import type { ModalWorkerEntry } from "@/types/modal-worker";

export type { ModalWorkerEntry };

function pushPyFiles(
    dir: string,
    category: "cpu" | "gpu",
    out: ModalWorkerEntry[],
): void {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".py")) continue;
        const full = path.join(dir, name);
        const rel = path.posix.join(category, name);
        const content = fs.readFileSync(full, "utf8");
        out.push({
            file: rel,
            category,
            appName: extractAppName(content),
            title: extractModuleTitle(content),
        });
    }
}

function extractAppName(content: string): string | null {
    const direct = content.match(/^\s*app\s*=\s*modal\.App\s*\(\s*["']([^"']+)["']/m);
    if (direct?.[1]) return direct[1];

    const usesConst = /^\s*app\s*=\s*modal\.App\s*\(\s*APP_NAME\s*\)/m.test(
        content,
    );
    if (usesConst) {
        const nameMatch = content.match(/^\s*APP_NAME\s*=\s*["']([^"']+)["']/m);
        if (nameMatch?.[1]) return nameMatch[1];
    }
    return null;
}

function extractModuleTitle(content: string): string | null {
    const lines = content.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const raw = lines[i];
        const t = raw.trim();
        if (t === "" || t.startsWith("#")) {
            i++;
            continue;
        }
        if (t.startsWith('"""')) {
            return parseTripleQuotedTitle(lines, i, '"""');
        }
        if (t.startsWith("'''")) {
            return parseTripleQuotedTitle(lines, i, "'''");
        }
        break;
    }
    return null;
}

function parseTripleQuotedTitle(
    lines: string[],
    startLine: number,
    q: '"""' | "'''",
): string | null {
    const first = lines[startLine].trim();
    const restOfOpen = first.slice(q.length).trim();
    const closeIdx = restOfOpen.indexOf(q);
    if (closeIdx !== -1) {
        const one = restOfOpen.slice(0, closeIdx).trim();
        return one || null;
    }
    if (restOfOpen) return restOfOpen;
    let i = startLine + 1;
    while (i < lines.length) {
        const L = lines[i];
        const idx = L.indexOf(q);
        if (idx !== -1) {
            const before = L.slice(0, idx).trim();
            return before || null;
        }
        const trimmed = L.trim();
        if (trimmed) return trimmed;
        i++;
    }
    return null;
}

/**
 * List all `*.py` under `modal/cpu` and `modal/gpu` with parsed metadata.
 */
export function scanModalWorkers(): ModalWorkerEntry[] {
    const modalDir = path.join(process.cwd(), "modal");
    const out: ModalWorkerEntry[] = [];
    pushPyFiles(path.join(modalDir, "cpu"), "cpu", out);
    pushPyFiles(path.join(modalDir, "gpu"), "gpu", out);
    out.sort((a, b) => a.file.localeCompare(b.file));
    return out;
}
