/**
 * An in-memory stand-in for an OPFS directory handle, enough for
 * `OpfsAssetStore` in Node tests: nested directories, files, writable
 * streams and (recursive) `removeEntry`. Test-only: no entry exports it.
 */

export function fakeOpfsDir(): FileSystemDirectoryHandle {
    const files = new Map<string, Uint8Array>();
    const dirs = new Map<string, FileSystemDirectoryHandle>();
    const notFound = () =>
        Object.assign(new Error("not found"), { name: "NotFoundError" });
    const dir = {
        async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
            if (!dirs.has(name)) {
                if (!opts?.create) throw notFound();
                dirs.set(name, fakeOpfsDir());
            }
            return dirs.get(name);
        },
        async getFileHandle(name: string, opts?: { create?: boolean }) {
            if (!files.has(name)) {
                if (!opts?.create) throw notFound();
                files.set(name, new Uint8Array());
            }
            return {
                async getFile() {
                    const bytes = files.get(name) ?? new Uint8Array();
                    return { arrayBuffer: async () => bytes.slice().buffer };
                },
                async createWritable() {
                    return {
                        async write(data: Uint8Array) {
                            files.set(name, new Uint8Array(data));
                        },
                        async close() {},
                    };
                },
            };
        },
        async removeEntry(name: string) {
            if (!files.delete(name) && !dirs.delete(name)) throw notFound();
        },
    };
    return dir as unknown as FileSystemDirectoryHandle;
}
