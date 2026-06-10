import fs from "node:fs";
import path from "node:path";
import { userDataDir } from "./paths";

/**
 * Main-process logging for the desktop shell. Every line is mirrored to:
 *  - the console (visible when launched from a terminal),
 *  - a log file under userData (survives crashes; the path is shown in every
 *    error surface so users can attach it to bug reports),
 *  - an in-memory ring buffer (embedded into error dialogs / error pages).
 */

const MAX_BUFFER_LINES = 300;
const MAX_LOG_BYTES = 1024 * 1024;

const buffer: string[] = [];
let stream: fs.WriteStream | null = null;

export function logFilePath(): string {
    return path.join(userDataDir(), "logs", "tongflow.log");
}

/** Open the log file (rotating the previous one past 1 MB). Call once at boot. */
export function initLogFile(): void {
    const file = logFilePath();
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) {
            fs.renameSync(file, `${file}.old`);
        }
        stream = fs.createWriteStream(file, { flags: "a" });
    } catch (e) {
        // Logging must never take the app down.
        console.warn("[logging] file logging disabled:", e);
    }
    logLine(`--- TongFlow launch ${new Date().toISOString()} ---`);
}

export function logLine(line: string): void {
    console.log(line);
    buffer.push(line);
    if (buffer.length > MAX_BUFFER_LINES) buffer.shift();
    stream?.write(`${line}\n`);
}

/** Tail of the ring buffer, for embedding into error dialogs / pages. */
export function recentLogs(maxLines = 40): string {
    return buffer.slice(-maxLines).join("\n");
}
