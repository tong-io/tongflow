import "server-only";

import { spawnSync } from "node:child_process";

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
