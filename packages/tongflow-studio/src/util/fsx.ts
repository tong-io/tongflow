/** Small filesystem helpers: JSON read/write, atomic writes, existence probes. */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

export async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

export async function readJson<T>(path: string): Promise<T> {
    return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
    try {
        return await readJson<T>(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
        throw error;
    }
}

/** Write via a temp file + rename so readers never observe a partial file. */
export async function writeFileAtomic(
    path: string,
    data: string | Uint8Array,
): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = join(dirname(path), `.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tmp, data);
    await rename(tmp, path);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
    await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function nowIso(): string {
    return new Date().toISOString();
}
