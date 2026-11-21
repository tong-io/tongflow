import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storeKeyName } from "tongflow/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root: string;
vi.mock("@/lib/runtime/scope.server", () => ({
    scopedDataDir: async () => root,
}));

const { storageDriver } = await import("./storage-driver");

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tongflow-storage-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("default storage driver: store keys keep the producer's filename", () => {
    it("keys a named file `<id>/<name>`", async () => {
        const name = storeKeyName("page1 r03:table.png", "png");
        expect(name).toBe("page1_r03_table.png");
        const key = await storageDriver.saveFile(
            new TextEncoder().encode("png"),
            "png",
            undefined,
            { name },
        );
        expect(key).toMatch(/^[\w-]{21}\/page1_r03_table\.png$/);
        expect(key.split("/").at(-1)).toBe(name);
        expect(await readFile(join(root, "uploads", key), "utf8")).toBe("png");
        expect((await storageDriver.readFile(key)).toString()).toBe("png");
    });

    it("keys a task file `tasks/<task>/<id>/<name>` and an unnamed one `<id>.<ext>`", async () => {
        const named = await storageDriver.saveFile(
            new Uint8Array([1]),
            "wav",
            "t1",
            { name: "voice.wav" },
        );
        expect(named).toMatch(/^tasks\/t1\/[\w-]{21}\/voice\.wav$/);
        const bare = await storageDriver.saveFile(new Uint8Array([1]), "bin");
        expect(bare).toMatch(/^[\w-]{21}\.bin$/);
    });

    it("never lets a name leave its directory", async () => {
        const key = await storageDriver.saveFile(
            new Uint8Array([1]),
            "png",
            undefined,
            { name: "../escape.png" },
        );
        expect(key).toMatch(/^[\w-]{21}\.png$/);
    });
});
