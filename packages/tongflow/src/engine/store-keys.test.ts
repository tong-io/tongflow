import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ExecutableWorkflow } from "../core/workflow/executable-workflow";
import { STORE_KEY_NAME_MAX_BYTES, storeKeyName } from "./assets";
import { base64ToUtf8, utf8ToBase64 } from "./base64";
import { OpfsAssetStore } from "./browser/opfs-store";
import { MemoryAssetStore } from "./memory-store";
import { runWorkflow } from "./run-workflow";
import { fakeOpfsDir } from "./testing/fake-opfs";
import type { AssetStore, NodeExecutor } from "./types";

/**
 * Store keys keep the producer's filename (`mem://<id>/<name>`,
 * `opfs://<id>/<name>`), so a downstream Asset input, whose filename is the
 * key's last path segment, receives the producer's own name. The Python
 * stores key the same way (`sdk/tests/test_engine.py`).
 */

describe("storeKeyName", () => {
    it("keeps ordinary names as they are", () => {
        expect(storeKeyName("page1-r03-table.png", "png")).toBe(
            "page1-r03-table.png",
        );
        expect(storeKeyName("第1页-表格.png", "png")).toBe("第1页-表格.png");
        expect(storeKeyName("again.bin", "bin")).toBe("again.bin");
    });

    it("has no name to keep without a filename", () => {
        expect(storeKeyName(undefined, "png")).toBeUndefined();
        expect(storeKeyName("", "png")).toBeUndefined();
        expect(storeKeyName("...", "png")).toBeUndefined();
    });

    it("replaces separators, controls, spaces and URL/Windows specials", () => {
        expect(storeKeyName("a/b\\c.png", "png")).toBe("a_b_c.png");
        expect(storeKeyName("../../etc/passwd", "bin")).toBe("_.._etc_passwd");
        expect(storeKeyName("x\u0000y\n z.png", "png")).toBe("x_y__z.png");
        expect(storeKeyName('q?a#b%c:d*e"f<g>h|i.png', "png")).toBe(
            "q_a_b_c_d_e_f_g_h_i.png",
        );
        expect(storeKeyName(".hidden.png", "png")).toBe("hidden.png");
        expect(storeKeyName("trailing.png..", "png")).toBe("trailing.png");
    });

    it("adds the extension a name lacks", () => {
        expect(storeKeyName("region-3", "jpg")).toBe("region-3.jpg");
        expect(storeKeyName("README", "")).toBe("README");
    });

    it("caps the length in UTF-8 bytes and keeps the extension", () => {
        const long = storeKeyName(`${"a".repeat(300)}.png`, "png");
        expect(long).toBe(`${"a".repeat(STORE_KEY_NAME_MAX_BYTES - 4)}.png`);
        const wide = storeKeyName(`${"表".repeat(100)}.png`, "png") ?? "";
        expect(wide.endsWith(".png")).toBe(true);
        expect(new TextEncoder().encode(wide).length).toBeLessThanOrEqual(
            STORE_KEY_NAME_MAX_BYTES,
        );
        // Whole characters only.
        expect(wide).toBe(`${"表".repeat(38)}.png`);
    });
});

// The shared fixture's render-pages → ocr-image graph: a producer emitting an
// x-expand-each array of ImageRefs and a consumer fanned out over them, the
// shape of layout-detect → table-recognize.
const fixture = JSON.parse(
    readFileSync(
        fileURLToPath(
            new URL(
                "../../conformance/expand-each-assets.json",
                import.meta.url,
            ),
        ),
        "utf-8",
    ),
) as { workflow: ExecutableWorkflow };

const REGIONS = [
    { filename: "page1-r01-text.png", mime: "image/png" },
    { filename: "page1-r03-table.png", mime: "image/png" },
    { filename: "page1-r04-figure.jpg", mime: "image/jpeg" },
    { filename: "crops/page2 r01.png", mime: "image/png" },
];

async function runLayout(store: AssetStore, documentKey: string) {
    const workflow = structuredClone(fixture.workflow);
    const doc = workflow.dataNodes.find((n) => n.id === "doc");
    if (!doc?.staticData) throw new Error("fixture changed: no doc node");
    doc.staticData.fileKeys = [documentKey];
    const seen: unknown[] = [];
    const executor: NodeExecutor = {
        async invoke({ nodeSlot, prompt }) {
            if (nodeSlot === "render-pages") {
                seen.push(prompt.document);
                return {
                    success: true,
                    pages: REGIONS.map((r) => ({
                        ...r,
                        bytesBase64: utf8ToBase64(r.filename),
                    })),
                };
            }
            const image = prompt.image as {
                bytesBase64: string;
                filename: string;
                mime?: string;
            };
            seen.push(image);
            return {
                success: true,
                text: image.filename.includes("-table")
                    ? `table:${base64ToUtf8(image.bytesBase64)}`
                    : "skip",
            };
        },
    };
    const result = await runWorkflow(workflow, { executor, store });
    return { result, seen };
}

function expectNamesKept(seen: unknown[], documentName: string) {
    const [document, ...regions] = seen as {
        bytesBase64: string;
        filename: string;
        mime?: string;
    }[];
    expect(document).toMatchObject({
        filename: documentName,
        mime: "application/pdf",
    });
    expect(regions.map((r) => [r.filename, r.mime])).toEqual([
        ["page1-r01-text.png", "image/png"],
        ["page1-r03-table.png", "image/png"],
        ["page1-r04-figure.jpg", "image/jpeg"],
        ["crops_page2_r01.png", "image/png"],
    ]);
    for (const r of regions) {
        expect(base64ToUtf8(r.bytesBase64)).toBe(
            REGIONS.find((x) => storeKeyName(x.filename, "png") === r.filename)
                ?.filename,
        );
    }
}

describe("store keys keep the producer's filename", () => {
    it("MemoryAssetStore: a consumer receives the layout's region names", async () => {
        const store = new MemoryAssetStore({
            "uploads/report.pdf": new TextEncoder().encode("%PDF"),
        });
        const { result, seen } = await runLayout(store, "uploads/report.pdf");
        expect(result.status).toBe("success");
        expectNamesKept(seen, "report.pdf");
        const pages = result.outputs.r.pages as { file_key: string }[];
        expect(pages[1].file_key).toMatch(
            /^mem:\/\/[0-9a-f]{32}\/page1-r03-table\.png$/,
        );
        expect(result.outputs.o.text).toEqual([
            "skip",
            "table:page1-r03-table.png",
            "skip",
            "skip",
        ]);
    });

    it("OpfsAssetStore: a consumer receives the layout's region names", async () => {
        const store = new OpfsAssetStore({ root: async () => fakeOpfsDir() });
        const upload = await store.put(new TextEncoder().encode("%PDF"), {
            ext: "pdf",
            mime: "application/pdf",
            filename: "扫描件 2026.pdf",
        });
        expect(upload.file_key).toMatch(
            /^opfs:\/\/[0-9a-f]{32}\/扫描件_2026\.pdf$/,
        );
        const { result, seen } = await runLayout(store, upload.file_key);
        expect(result.status).toBe("success");
        expectNamesKept(seen, "扫描件_2026.pdf");
        const pages = result.outputs.r.pages as { file_key: string }[];
        expect(pages.map((p) => p.file_key.split("/").at(-1))).toEqual([
            "page1-r01-text.png",
            "page1-r03-table.png",
            "page1-r04-figure.jpg",
            "crops_page2_r01.png",
        ]);
        expect(await store.get(pages[1].file_key)).toEqual(
            new TextEncoder().encode("page1-r03-table.png"),
        );
    });

    it("OpfsAssetStore: keys of the flat `<id>.<ext>` form still resolve", async () => {
        const root = fakeOpfsDir();
        const legacy = "0123456789abcdef0123456789abcdef.png";
        const dir = await root.getDirectoryHandle("tongflow-assets", {
            create: true,
        });
        const w = await (
            await dir.getFileHandle(legacy, { create: true })
        ).createWritable();
        await w.write(new TextEncoder().encode("old"));
        await w.close();
        const store = new OpfsAssetStore({ root: async () => root });
        expect(await store.get(`opfs://${legacy}`)).toEqual(
            new TextEncoder().encode("old"),
        );
        expect(await store.delete(`opfs://${legacy}`)).toBe(true);
    });

    it("MemoryAssetStore: nameless outputs keep the `mem://<id>` form", async () => {
        const store = new MemoryAssetStore();
        const ref = await store.put(new Uint8Array([1]), { ext: "bin" });
        expect(ref.file_key).toMatch(/^mem:\/\/[0-9a-f]{32}$/);
        expect(await store.get(ref.file_key)).toEqual(new Uint8Array([1]));
    });
});
