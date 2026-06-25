import "server-only";

import { spawnSync } from "node:child_process";

/**
 * Force UTF-8 I/O in spawned Python processes.
 *
 * On a non-UTF-8 system locale (e.g. Windows Simplified-Chinese, whose ANSI
 * code page is GBK / cp936) a child Python's stdout/stderr default to that
 * locale encoding. A plugin that prints a non-ASCII character — such as the
 * "✓" (U+2713) many libraries emit while downloading model weights — then
 * crashes with `UnicodeEncodeError: 'gbk' codec can't encode character`.
 *
 * `PYTHONUTF8=1` enables Python's UTF-8 Mode (3.7+), which makes the standard
 * streams and the default text encoding UTF-8 regardless of locale;
 * `PYTHONIOENCODING` is a belt-and-suspenders fallback for older interpreters.
 * Merge this into the env of every spawned Python process.
 */
export const PYTHON_UTF8_ENV: Record<string, string> = {
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
};

function canRunPython(cmd: string): boolean {
    try {
        const r = spawnSync(cmd, ["-c", "print('ok')"], {
            encoding: "utf8",
            windowsHide: true,
        });
        return r.status === 0;
    } catch {
        return false;
    }
}

/**
 * Minimal python resolver for plugins (does NOT require `modal`).
 */
export async function resolvePythonLite(): Promise<string> {
    const explicit = [process.env.PYTHON?.trim()].filter((x): x is string =>
        Boolean(x),
    );
    for (const cmd of explicit) {
        if (canRunPython(cmd)) return cmd;
    }
    for (const cmd of ["python3", "python"]) {
        if (canRunPython(cmd)) return cmd;
    }
    throw new Error("Could not run python. Set PYTHON or install python3.");
}
