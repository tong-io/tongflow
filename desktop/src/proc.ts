import { spawn } from "node:child_process";

export type LogLine = (line: string) => void;

/**
 * Spawn a child process, forward its stdout/stderr line-by-line to `onLine`,
 * and resolve on exit 0 (reject otherwise). Used for uv / pip steps.
 */
export function run(
    cmd: string,
    args: string[],
    opts: { cwd?: string; env?: NodeJS.ProcessEnv },
    onLine: LogLine,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: opts.cwd,
            env: opts.env ?? process.env,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });

        const forward = (buf: Buffer) => {
            for (const line of String(buf).split(/\r?\n/)) {
                if (line.trim()) onLine(line);
            }
        };
        child.stdout?.on("data", forward);
        child.stderr?.on("data", forward);

        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} exited with code ${code}`));
        });
    });
}
