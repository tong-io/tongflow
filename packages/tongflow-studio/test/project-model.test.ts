import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderTree, StudioApi } from "../src/api.ts";
import { studioConfig } from "../src/config.ts";
import { ingestOutputs } from "../src/engine/ingest.ts";
import { workflowsInFolder } from "../src/project/compose.ts";
import {
    createProject,
    listProjects,
    loadProject,
} from "../src/project/manifest.ts";
import {
    listOutputs,
    nextOutputNo,
    outputFileName,
    parseOutputFileName,
    readRunsLog,
    runsLogKey,
} from "../src/project/outputs.ts";
import {
    fromProjectKey,
    isProjectId,
    normalizeKey,
    projectIdFor,
} from "../src/project/paths.ts";
import {
    expandTemplate,
    hasTemplateRefs,
    resolveFileRef,
} from "../src/project/refs.ts";
import {
    canvasView,
    listWorkflowKeys,
    normalizeWorkflowKey,
    readWorkflowFile,
    writeWorkflowDocument,
} from "../src/project/workflow-file.ts";
import { Studio } from "../src/studio.ts";

let studio: string;
let projectId: string;
let root: string;

beforeEach(async () => {
    studio = await mkdtemp(join(tmpdir(), "dsh-tongflow-"));
    const created = await createProject(studio, {
        title: "Rooftop Rain",
        brief: "a 3-episode manga drama about a rooftop",
    });
    projectId = created.id;
    root = created.root;
});

afterEach(async () => {
    await rm(studio, { recursive: true, force: true });
});

async function put(key: string, content = "x"): Promise<string> {
    const abs = fromProjectKey(root, key);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, content);
    return abs;
}

describe("projects", () => {
    it("creates an empty project with only project.json", async () => {
        expect(projectId).toBe("rooftop-rain");
        const ref = await loadProject(studio, projectId);
        expect(ref.manifest.title).toBe("Rooftop Rain");
        expect(ref.manifest.brief).toContain("manga drama");
        const summary = (await listProjects(studio))[0];
        expect(summary.workflowCount).toBe(0);
        expect(summary.fileCount).toBe(1);
    });

    it("derives ids and validates them", async () => {
        expect(projectIdFor("Héllo, World!")).toBe("hello-world");
        expect(projectIdFor("我的短片")).toBe("project");
        expect(isProjectId("a-b1")).toBe(true);
        expect(isProjectId("A_B")).toBe(false);
        const second = await createProject(studio, { title: "Rooftop Rain" });
        expect(second.id).toBe("rooftop-rain-2");
    });

    it("normalizes keys and refuses escapes", () => {
        expect(normalizeKey("./a//b/")).toBe("a/b");
        expect(normalizeKey("a\\b\\c.png")).toBe("a/b/c.png");
        expect(() => normalizeKey("a/../b")).toThrow();
        expect(normalizeWorkflowKey("characters/mei/mei_ref")).toBe(
            "characters/mei/mei_ref.tongflow.json",
        );
        expect(normalizeWorkflowKey("x.json")).toBe("x.tongflow.json");
        expect(normalizeWorkflowKey("x.tongflow.json")).toBe("x.tongflow.json");
    });
});

describe("file references", () => {
    it("resolves ./ against the workflow dir and bare keys against the root (with a dir fallback)", async () => {
        await put("characters/mei/mei_ref.01.png");
        await put("style/palette.png");
        const base = join(root, "characters/mei");
        expect(await resolveFileRef(root, base, "./mei_ref.01.png")).toBe(
            join(root, "characters/mei/mei_ref.01.png"),
        );
        expect(
            await resolveFileRef(root, base, "../../style/palette.png"),
        ).toBe(join(root, "style/palette.png"));
        expect(await resolveFileRef(root, base, "style/palette.png")).toBe(
            join(root, "style/palette.png"),
        );
        // bare name that only exists next to the workflow
        expect(await resolveFileRef(root, base, "mei_ref.01.png")).toBe(
            join(root, "characters/mei/mei_ref.01.png"),
        );
        expect(await resolveFileRef(root, base, "https://x/y.png")).toBe(
            "https://x/y.png",
        );
        await expect(
            resolveFileRef(root, base, "../../../outside.png"),
        ).rejects.toThrow(/escapes/);
        await expect(
            resolveFileRef(root, base, "tf://CHR_MEI/REF"),
        ).rejects.toThrow(/no longer exist/);
    });

    it("expands {{path}} includes with the text file content", async () => {
        await put("style.md", "  cinematic, soft light  \n");
        await put("characters/mei/mei.md", "Mei, 17, short black hair");
        const base = join(root, "characters/mei");
        const text = "{{../../style.md}} {{./mei.md}} full-body sheet";
        expect(hasTemplateRefs(text)).toBe(true);
        expect(hasTemplateRefs("plain")).toBe(false);
        expect(await expandTemplate(root, base, text)).toBe(
            "cinematic, soft light Mei, 17, short black hair full-body sheet",
        );
        await expect(
            expandTemplate(root, base, "{{./missing.md}}"),
        ).rejects.toThrow(/no such text file/);
    });
});

describe("outputs next to the workflow", () => {
    it("names and parses numbered output files", () => {
        expect(outputFileName("mei_ref", 3, "png")).toBe("mei_ref.03.png");
        expect(outputFileName("mei_ref", 12, ".mp4", "video")).toBe(
            "mei_ref.12.video.mp4",
        );
        expect(parseOutputFileName("mei_ref", "mei_ref.03.png")).toEqual({
            no: 3,
            ext: "png",
        });
        expect(parseOutputFileName("mei_ref", "mei_ref.03.video.mp4")).toEqual({
            no: 3,
            output: "video",
            ext: "mp4",
        });
        expect(parseOutputFileName("mei_ref", "mei_ref.tongflow.json")).toBe(
            undefined,
        );
        expect(parseOutputFileName("mei", "mei_ref.03.png")).toBe(undefined);
        expect(runsLogKey("characters/mei/mei_ref.tongflow.json")).toBe(
            "characters/mei/mei_ref.runs.json",
        );
    });

    it("ingests engine outputs as the next number, several outputs keep their names, texts become .txt", async () => {
        const wf = "characters/mei/mei_ref.tongflow.json";
        await put(wf, "{}");
        await put("characters/mei/mei_ref.01.png");
        const record = {
            runId: "run-1",
            workflowHash: "h",
            inputs: {},
            pluginIds: ["p"],
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:00:01.000Z",
            durationMs: 1000,
        };
        // Single output → plain number.
        await put(".runs/run-1/a.png", "A");
        let outcome = await ingestOutputs({
            projectRoot: root,
            workflowKey: wf,
            result: {
                status: "success",
                outputs: {},
                outputs_by_name: { image: [".runs/run-1/a.png"] },
                errors: [],
                failures: [],
            },
            record,
        });
        expect(outcome.no).toBe(2);
        expect(outcome.files.map((f) => f.fileName)).toEqual([
            "mei_ref.02.png",
        ]);
        // Two outputs + a text → tagged names and a .txt.
        await put(".runs/run-2/b.png", "B");
        await put(".runs/run-2/c.mp4", "C");
        outcome = await ingestOutputs({
            projectRoot: root,
            workflowKey: wf,
            result: {
                status: "success",
                outputs: {},
                outputs_by_name: {
                    image: [".runs/run-2/b.png"],
                    video: [".runs/run-2/c.mp4"],
                    caption: ["a caption"],
                },
                errors: [],
                failures: [],
            },
            record: { ...record, runId: "run-2", note: "two outputs" },
        });
        expect(outcome.no).toBe(3);
        expect(outcome.files.map((f) => f.fileName).sort()).toEqual([
            "mei_ref.03.caption.txt",
            "mei_ref.03.image.png",
            "mei_ref.03.video.mp4",
        ]);
        expect(
            await readFile(
                join(root, "characters/mei/mei_ref.03.caption.txt"),
                "utf8",
            ),
        ).toBe("a caption");
        const all = await listOutputs(root, wf);
        expect(all.map((o) => o.no)).toEqual([1, 2, 3, 3, 3]);
        expect(all[0].record).toBeUndefined();
        expect(all[1].record?.runId).toBe("run-1");
        expect(all[2].record?.note).toBe("two outputs");
        const log = await readRunsLog(root, wf);
        expect(log.map((r) => r.no)).toEqual([2, 3]);
        expect(await nextOutputNo(root, wf)).toBe(4);
    });
});

describe("workflow files", () => {
    it("lists workflows anywhere in the project and hands the canvas root-relative refs", async () => {
        const wf = "ep01/sh010/keyframe.tongflow.json";
        await writeWorkflowDocument(root, wf, {
            name: "keyframe",
            flow: {
                nodes: [
                    {
                        id: "img",
                        type: "imageNode",
                        position: { x: 0, y: 0 },
                        data: {
                            fileKeys: [
                                "../../characters/mei/mei_ref.02.png",
                                "./plate.png",
                                "style/palette.png",
                                "https://x/y.png",
                            ],
                        },
                    },
                ] as never,
                edges: [],
            },
            meta: {},
        });
        await writeWorkflowDocument(root, "loose.tongflow.json", {
            name: "loose",
            flow: { nodes: [], edges: [] },
            meta: {},
        });
        expect(await listWorkflowKeys(root)).toEqual([
            "ep01/sh010/keyframe.tongflow.json",
            "loose.tongflow.json",
        ]);
        const doc = await readWorkflowFile(root, wf);
        const view = canvasView(doc, wf);
        expect(
            (view.flow.nodes[0].data as { fileKeys: string[] }).fileKeys,
        ).toEqual([
            "characters/mei/mei_ref.02.png",
            "ep01/sh010/plate.png",
            "style/palette.png",
            "https://x/y.png",
        ]);
        // The file itself is untouched.
        expect(
            (doc.flow.nodes[0].data as { fileKeys: string[] }).fileKeys[0],
        ).toBe("../../characters/mei/mei_ref.02.png");
    });
});

describe("studio tree", () => {
    it("nests generated files under their workflow and shows everything else as-is", async () => {
        const api = new StudioApi(
            new Studio({ config: studioConfig({ studioRoot: studio }) }),
        );
        await put("README.md", "# plan");
        await put("characters/mei/mei.md", "Mei");
        await writeWorkflowDocument(
            root,
            "characters/mei/mei_ref.tongflow.json",
            { name: "mei_ref", flow: { nodes: [], edges: [] }, meta: {} },
        );
        await put("characters/mei/mei_ref.01.png");
        await put("characters/mei/mei_ref.02.png");
        await put("characters/mei/mei_ref.runs.json", "[]");
        await put("characters/mei/other.png");
        const tree = await api.tree(projectId);
        const text = renderTree(tree);
        expect(text).toBe(
            [
                "characters/",
                "  mei/",
                "    mei_ref.tongflow.json  [workflow, 2 output files]",
                "      mei_ref.01.png",
                "      mei_ref.02.png",
                "    mei.md",
                "    other.png",
                "project.json",
                "README.md",
            ].join("\n"),
        );
        const mei = tree[0].children![0];
        const wf = mei.children!.find((n) => n.kind === "workflow")!;
        expect(wf.meta?.outputCount).toBe(2);
        expect(wf.children!.map((n) => n.label)).toEqual(["01.png", "02.png"]);
        expect(mei.children!.map((n) => n.label)).not.toContain(
            "mei_ref.runs.json",
        );
        const status = await api.status(projectId);
        expect(status.workflows[0]).toMatchObject({
            key: "characters/mei/mei_ref.tongflow.json",
            outputs: 2,
            lastNo: 2,
        });
    });
});

describe("billing checkpoint", () => {
    it("lists the paid plugins a run would use, with billing, keys, models and alternatives; local plugins are free", async () => {
        const api = new StudioApi(
            new Studio({ config: studioConfig({ studioRoot: studio }) }),
        );
        (api.studio.registry as unknown as { cache: unknown }).cache = {
            registry: {
                plugins: {
                    "tongflow-api-gemini": {
                        name: "Gemini",
                        needsDeploy: false,
                        methodsByNodeSlot: {
                            "image-gen": {
                                methodName: "image_gen",
                                models: ["gemini-3-pro-image", "imagen-4"],
                            },
                        },
                    },
                    "tongflow-modal-flux": {
                        needsDeploy: true,
                        methodsByNodeSlot: {
                            "image-gen": { methodName: "image_gen" },
                        },
                    },
                    "tongflow-local-ffmpeg": {
                        needsDeploy: false,
                        methodsByNodeSlot: {
                            "video-concat": { methodName: "concat" },
                        },
                    },
                },
                nodePluginMap: {
                    "image-gen": ["tongflow-api-gemini", "tongflow-modal-flux"],
                    "video-concat": ["tongflow-local-ffmpeg"],
                },
            },
            meta: {
                "tongflow-api-gemini": {
                    env: [{ key: "GEMINI_API_KEY", required: true }],
                },
                "tongflow-modal-flux": { env: [] },
                "tongflow-local-ffmpeg": { env: [] },
            },
            scannedAt: "now",
        };
        const node = (
            id: string,
            feature: string,
            pluginId: string,
            model?: string,
        ) => ({
            id,
            feature,
            pluginId,
            ...(model ? { model } : {}),
            bindings: {},
            outputs: [],
        });
        const wf = "hero/hero_shot.tongflow.json";
        await writeWorkflowDocument(root, wf, {
            name: "hero_shot",
            flow: { nodes: [], edges: [] },
            executable: {
                inputs: [],
                outputs: [],
                dataNodes: [],
                executableNodes: [
                    node("g", "image-gen", "tongflow-api-gemini", "imagen-4"),
                    node("c", "video-concat", "tongflow-local-ffmpeg"),
                ],
            } as never,
            meta: {},
        });
        const paid = await api.paidPlugins(projectId, wf);
        expect(paid).toHaveLength(1);
        expect(paid[0]).toMatchObject({
            pluginId: "tongflow-api-gemini",
            name: "Gemini",
            billing: "api",
            models: ["imagen-4"],
            availableModels: ["gemini-3-pro-image", "imagen-4"],
            slots: ["image-gen"],
            env: [{ key: "GEMINI_API_KEY", required: true, set: false }],
            alternatives: [
                {
                    pluginId: "tongflow-modal-flux",
                    billing: "modal",
                    slots: ["image-gen"],
                },
            ],
        });
        // A workflow of only local plugins is free.
        const free = "cut/final.tongflow.json";
        await writeWorkflowDocument(root, free, {
            name: "final",
            flow: { nodes: [], edges: [] },
            executable: {
                inputs: [],
                outputs: [],
                dataNodes: [],
                executableNodes: [
                    node("c", "video-concat", "tongflow-local-ffmpeg"),
                ],
            } as never,
            meta: {},
        });
        expect(await api.paidPlugins(projectId, free)).toEqual([]);
        // Modal plugins are paid too.
        const modal = "hero/hero_flux.tongflow.json";
        await writeWorkflowDocument(root, modal, {
            name: "hero_flux",
            flow: { nodes: [], edges: [] },
            executable: {
                inputs: [],
                outputs: [],
                dataNodes: [],
                executableNodes: [
                    node("g", "image-gen", "tongflow-modal-flux"),
                ],
            } as never,
            meta: {},
        });
        expect(
            (await api.paidPlugins(projectId, modal)).map((p) => p.billing),
        ).toEqual(["modal"]);
    });
});

describe("compose", () => {
    /** The plugin catalog the composition tests resolve node types against. */
    function fakeRegistry(api: StudioApi): void {
        (api.studio.registry as unknown as { cache: unknown }).cache = {
            registry: {
                plugins: {
                    fake: {
                        needsDeploy: false,
                        methodsByNodeSlot: {
                            "image-gen": { methodName: "a" },
                            "image-edit": { methodName: "b" },
                            "image-gen-video": { methodName: "c" },
                            "audio-video-lip-sync": { methodName: "d" },
                        },
                    },
                },
                nodePluginMap: {
                    "image-gen": ["fake"],
                    "image-edit": ["fake"],
                    "image-gen-video": ["fake"],
                    "audio-video-lip-sync": ["fake"],
                },
            },
            meta: { fake: { env: [] } },
            scannedAt: "now",
        };
    }

    /**
     * A parent folder composes everything beneath it, and a part links to a
     * producer that lives in a different folder. Both matter for a tree of
     * one-node workflows: the leaves sit several levels down, and a shot's
     * first step reads the previous shot's last output.
     */
    it("gathers leaves at any depth and links a reference across folders", async () => {
        const api = new StudioApi(
            new Studio({ config: studioConfig({ studioRoot: studio }) }),
        );
        fakeRegistry(api);

        // ep01/sh010/ref: text → image
        await api.newWorkflow(projectId, "ep01/sh010/ref");
        await api.patchWorkflow(projectId, "ep01/sh010/ref", {
            add_nodes: [
                { alias: "t", type: "textNode", data: { texts: ["a girl"] } },
                { alias: "g", type: "textGenImageNode" },
            ],
            add_edges: [{ from: "t", to: "g" }],
        } as never);
        await put("ep01/sh010/ref.01.png");

        // ep01/sh010/i2v: ./ref.01.png → video (same folder)
        await api.newWorkflow(projectId, "ep01/sh010/i2v");
        await api.patchWorkflow(projectId, "ep01/sh010/i2v", {
            add_nodes: [
                {
                    alias: "img",
                    type: "imageNode",
                    data: { fileKeys: ["./ref.01.png"] },
                },
                {
                    alias: "v",
                    type: "imageGenVideoNode",
                    data: { text: "slow push in", duration: 5 },
                },
            ],
            add_edges: [{ from: "img", to: "v" }],
        } as never);
        await put("ep01/sh010/i2v.01.mp4");

        // ep01/sh020/open: ../sh010/ref.01.png → image (ANOTHER folder)
        await api.newWorkflow(projectId, "ep01/sh020/open");
        await api.patchWorkflow(projectId, "ep01/sh020/open", {
            add_nodes: [
                {
                    alias: "img",
                    type: "imageNode",
                    data: { fileKeys: ["../sh010/ref.01.png"] },
                },
                {
                    alias: "e",
                    type: "imageEditNode",
                    data: { text: "wider crop" },
                },
            ],
            add_edges: [{ from: "img", to: "e" }],
        } as never);

        // The parent sees every leaf beneath it, not just its own directory.
        expect(await workflowsInFolder(root, "ep01")).toEqual([
            "ep01/sh010/i2v.tongflow.json",
            "ep01/sh010/ref.tongflow.json",
            "ep01/sh020/open.tongflow.json",
        ]);

        const result = await api.composeWorkflows(projectId, {
            folder: "ep01",
        });
        expect(result.key).toBe("ep01/ep01_all.tongflow.json");
        // ref produces what both of the others read, so it is ordered first.
        expect(result.parts[0]).toBe("ep01/sh010/ref.tongflow.json");
        expect(result.parts).toHaveLength(3);
        // Two real edges: the same-folder one AND the cross-folder one.
        expect(result.links).toBe(2);
        expect(result.unlinked).toEqual([]);

        // Composing the parent again skips the _all it just wrote.
        expect(await workflowsInFolder(root, "ep01")).not.toContain(
            "ep01/ep01_all.tongflow.json",
        );
    });

    it("links parts by their output files, keeps every stage an output, names outputs after the parts, leaves the parts untouched", async () => {
        const api = new StudioApi(
            new Studio({ config: studioConfig({ studioRoot: studio }) }),
        );
        (api.studio.registry as unknown as { cache: unknown }).cache = {
            registry: {
                plugins: {
                    fake: {
                        needsDeploy: false,
                        methodsByNodeSlot: {
                            "image-gen": { methodName: "a" },
                            "image-edit": { methodName: "b" },
                            "image-gen-video": { methodName: "c" },
                            "audio-video-lip-sync": { methodName: "d" },
                        },
                    },
                },
                nodePluginMap: {
                    "image-gen": ["fake"],
                    "image-edit": ["fake"],
                    "image-gen-video": ["fake"],
                    "audio-video-lip-sync": ["fake"],
                },
            },
            meta: { fake: { env: [] } },
            scannedAt: "now",
        };
        // ref: text → image
        await api.newWorkflow(projectId, "shot/ref");
        await api.patchWorkflow(projectId, "shot/ref", {
            add_nodes: [
                { alias: "t", type: "textNode", data: { texts: ["a girl"] } },
                { alias: "g", type: "textGenImageNode" },
            ],
            add_edges: [{ from: "t", to: "g" }],
        } as never);
        await put("shot/ref.01.png");
        // i2v: ./ref.01.png → video (references ref's output by path)
        await api.newWorkflow(projectId, "shot/i2v");
        await api.patchWorkflow(projectId, "shot/i2v", {
            add_nodes: [
                {
                    alias: "img",
                    type: "imageNode",
                    data: { fileKeys: ["./ref.01.png"] },
                },
                {
                    alias: "v",
                    type: "imageGenVideoNode",
                    data: { text: "slow push in", duration: 5 },
                },
            ],
            add_edges: [{ from: "img", to: "v" }],
        } as never);
        await put("shot/i2v.01.mp4");
        await put("shot/line.wav");
        // lipsync: ./i2v.01.mp4 + ./line.wav (a user file, no producer) → video
        await api.newWorkflow(projectId, "shot/lipsync");
        await api.patchWorkflow(projectId, "shot/lipsync", {
            add_nodes: [
                {
                    alias: "vid",
                    type: "videoNode",
                    data: { fileKeys: ["./i2v.01.mp4"] },
                },
                {
                    alias: "aud",
                    type: "audioNode",
                    data: { fileKeys: ["./line.wav"] },
                },
                { alias: "ls", type: "audioVideoLipSyncNode" },
            ],
            add_edges: [
                { from: "vid", to: "ls" },
                { from: "aud", to: "ls" },
            ],
        } as never);
        const before = await readFile(
            join(root, "shot/i2v.tongflow.json"),
            "utf8",
        );

        const result = await api.composeWorkflows(projectId, {
            folder: "shot",
        });
        expect(result.key).toBe("shot/shot_all.tongflow.json");
        // Folder listing is alphabetical; parts are re-ordered by their file dependencies.
        expect(result.parts).toEqual([
            "shot/ref.tongflow.json",
            "shot/i2v.tongflow.json",
            "shot/lipsync.tongflow.json",
        ]);
        expect(result.links).toBe(2);
        // Same result when the order is given explicitly (and wrong).
        const ordered = await api.composeWorkflows(projectId, {
            workflows: ["shot/lipsync", "shot/i2v", "shot/ref"],
            path: "shot/shot_all",
        });
        expect(ordered.links).toBe(2);
        expect(ordered.unlinked).toEqual([]);
        const doc = await api.readWorkflow(projectId, "shot/shot_all");
        // 2 + 2 + 3 part nodes + 2 taps (ref's image, i2v's video)
        expect(doc.flow.nodes).toHaveLength(9);
        expect(doc.executable?.executableNodes).toHaveLength(3);
        // Linked data nodes lost their static file; the user's audio stayed a file.
        const dataFiles = doc.flow.nodes
            .filter(
                (n) =>
                    ![
                        "textGenImageNode",
                        "imageGenVideoNode",
                        "audioVideoLipSyncNode",
                    ].includes(n.type ?? ""),
            )
            .flatMap((n) => (n.data as { fileKeys?: string[] }).fileKeys ?? []);
        expect(dataFiles).toEqual(["./line.wav"]);
        // Every stage is an output, labelled after its part (the same label is
        // keyed under every id the engine may report the output as).
        const labels = [
            ...new Set(Object.values(doc.meta.outputLabels ?? {})),
        ].sort();
        expect(labels).toEqual(["i2v", "lipsync", "ref"]);
        expect(
            doc.executable?.outputs
                .map((o) => doc.meta.outputLabels?.[o.name])
                .sort(),
        ).toEqual(["i2v", "lipsync", "ref"]);
        expect(doc.meta.composed?.parts).toEqual([
            "shot/ref.tongflow.json",
            "shot/i2v.tongflow.json",
            "shot/lipsync.tongflow.json",
        ]);
        // Parts untouched; a later folder compose skips the _all file.
        expect(
            await readFile(join(root, "shot/i2v.tongflow.json"), "utf8"),
        ).toBe(before);
        expect(await workflowsInFolder(root, "shot")).toEqual([
            "shot/i2v.tongflow.json",
            "shot/lipsync.tongflow.json",
            "shot/ref.tongflow.json",
        ]);
        // Ingest of a composed run names files after the labels.
        await put(".runs/r/a.png", "A");
        await put(".runs/r/b.mp4", "B");
        await put(".runs/r/c.mp4", "C");
        const outs = doc.executable!.outputs;
        const byLabel = (l: string) =>
            outs.find((o) => doc.meta.outputLabels?.[o.name] === l)!.name;
        const outcome = await ingestOutputs({
            projectRoot: root,
            workflowKey: "shot/shot_all.tongflow.json",
            outputLabels: doc.meta.outputLabels,
            result: {
                status: "success",
                outputs: {},
                outputs_by_name: {
                    [byLabel("ref")]: [".runs/r/a.png"],
                    [byLabel("i2v")]: [".runs/r/b.mp4"],
                    [byLabel("lipsync")]: [".runs/r/c.mp4"],
                },
                errors: [],
                failures: [],
            },
            record: {
                runId: "r",
                workflowHash: "h",
                inputs: {},
                pluginIds: ["fake"],
                startedAt: "2026-01-01T00:00:00.000Z",
                finishedAt: "2026-01-01T00:00:01.000Z",
                durationMs: 1000,
            },
        });
        expect(outcome.files.map((f) => f.fileName).sort()).toEqual([
            "shot_all.01.i2v.mp4",
            "shot_all.01.lipsync.mp4",
            "shot_all.01.ref.png",
        ]);
    });
});
