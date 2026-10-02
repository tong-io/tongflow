import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutableWorkflow } from "tongflow";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { studioConfig } from "../src/config.ts";
import { runEngine } from "../src/engine/runner.ts";
import { createProject } from "../src/project/manifest.ts";
import { listOutputs, readRunsLog } from "../src/project/outputs.ts";
import { writeWorkflowDocument } from "../src/project/workflow-file.ts";
import { Studio } from "../src/studio.ts";

/**
 * A stand-in for `python -m tongflow engine`: reads the request, echoes a few
 * events, writes one output file into out_dir and reports it (relative to
 * file_key_base) — the exact contract of the real NDJSON bridge.
 */
const FAKE_ENGINE = `#!/bin/sh
node -e '
let raw = "";
process.stdin.on("data", d => raw += d);
process.stdin.on("end", () => {
  const req = JSON.parse(raw);
  const fs = require("fs"), path = require("path");
  const emit = o => process.stdout.write(JSON.stringify(o) + "\\n");
  emit({ ready: { version: "test" } });
  emit({ event: { type: "workflow_started", totalNodes: 1, levels: 1 } });
  const node = req.workflow.executableNodes[0];
  emit({ event: { type: "node_started", nodeId: node.id, level: 1, feature: node.feature, label: node.label } });
  emit({ event: { type: "plugin_progress", pluginId: node.pluginId, message: "rendering", percent: 50 } });
  if ((req.inputs.prompt||{}).texts && req.inputs.prompt.texts[0] === "FAIL") { emit({ event: { type: "node_failed", nodeId: node.id, error: "boom", label: node.label } }); emit({ result: { status: "failed", outputs: {}, outputs_by_name: {}, errors: ["boom"], failures: [{nodeId: node.id, summary: "boom"}] } }); return; }
  fs.mkdirSync(req.options.out_dir, { recursive: true });
  const file = path.join(req.options.out_dir, "abc123.png");
  fs.writeFileSync(file, "PNG:" + JSON.stringify(req.inputs));
  const key = path.relative(req.options.file_key_base, file);
  emit({ event: { type: "node_completed", nodeId: node.id, output: { image: { file_key: key } }, label: node.label } });
  emit({ event: { type: "workflow_completed", status: "success", outputs: {}, errors: [] } });
  emit({ result: { status: "success", outputs: { [node.id]: { image: { file_key: key } } }, outputs_by_name: { image: [key] }, errors: [], failures: [] } });
});
'
`;

let studioRoot: string;
let fakePython: string;

class TestStudio extends Studio {
    override python(): Promise<string> {
        return Promise.resolve(fakePython);
    }
}

function workflow(): ExecutableWorkflow {
    return {
        name: "kf",
        version: "1.0",
        exportedAt: "2026-01-01T00:00:00.000Z",
        inputs: [
            { name: "prompt", type: "text", required: true, nodeId: "n-in" },
            { name: "ref", type: "image", required: false, nodeId: "n-ref" },
        ],
        outputs: [
            { name: "image", type: "image", nodeId: "n1", field: "image" },
        ],
        dataNodes: [],
        executableNodes: [
            {
                id: "n1",
                type: "textGenImageNode",
                feature: "image-gen",
                pluginId: "tongflow-modal-fake",
                label: "keyframe",
                bindings: { text: { kind: "input", inputName: "prompt" } },
                outputs: [
                    {
                        sourceField: "image",
                        nodeType: "imageNode",
                        dataField: "fileKeys",
                        expandEach: false,
                        itemValuePath: "file_key",
                    },
                ],
                dependencies: [],
                level: 0,
            },
        ],
        executionLevels: [["n1"]],
        dataNodeEdges: [],
        originalFlow: { nodes: [], edges: [] },
    } as unknown as ExecutableWorkflow;
}

beforeEach(async () => {
    studioRoot = await mkdtemp(join(tmpdir(), "dsh-tongflow-studio-"));
    fakePython = join(studioRoot, "fake-python");
    // The fake ignores argv (-m tongflow engine); it only speaks the stdin/stdout protocol.
    await writeFile(fakePython, FAKE_ENGINE);
    await chmod(fakePython, 0o755);
});

afterEach(async () => {
    await rm(studioRoot, { recursive: true, force: true });
});

describe("engine bridge", () => {
    it("parses NDJSON events and the final result", async () => {
        const events: string[] = [];
        const outDir = join(studioRoot, "out");
        const result = await runEngine({
            python: fakePython,
            request: {
                workflow: workflow(),
                inputs: { prompt: { texts: ["hi"] } },
                options: {
                    plugins_dir: studioRoot,
                    data_dir: studioRoot,
                    out_dir: outDir,
                    file_key_base: studioRoot,
                    inline_outputs: false,
                    auto_install: false,
                    org: "https://example.invalid",
                    task_id: "t",
                },
            },
            onEvent: (e) => events.push(e.type),
        });
        expect(result.status).toBe("success");
        expect(result.outputs_by_name.image).toEqual(["out/abc123.png"]);
        expect(events).toEqual([
            "workflow_started",
            "node_started",
            "plugin_progress",
            "node_completed",
            "workflow_completed",
        ]);
    });

    it("runs a workflow end to end: resolves file refs, places numbered outputs next to the workflow, logs provenance", async () => {
        const config = studioConfig({
            studioRoot,
            maxConcurrentRuns: 1,
            autoInstallOfficial: false,
        });
        const studio = new TestStudio({ config });
        await studio.init();
        const { id, root } = await createProject(studioRoot, { title: "Demo" });
        await mkdir(join(root, "characters", "mei"), { recursive: true });
        await writeFile(
            join(root, "characters", "mei", "mei_ref.01.png"),
            "ref",
        );
        const wfKey = "characters/mei/mei_sheet.tongflow.json";
        await writeWorkflowDocument(root, wfKey, {
            name: "mei_sheet",
            flow: { nodes: [], edges: [] },
            executable: workflow(),
            meta: {},
        });
        const project = await studio.project(id);
        const record = studio.runs.start(project, {
            projectId: id,
            workflowKey: wfKey,
            inputs: { prompt: "a girl on a rooftop", ref: "./mei_ref.01.png" },
            note: "smoke",
        });
        await record.done;
        expect(record.summary.status).toBe("completed");
        expect(record.summary.files.map((f) => f.fileName)).toEqual([
            "mei_sheet.01.png",
        ]);
        const outputs = await listOutputs(root, wfKey);
        expect(outputs).toHaveLength(1);
        expect(outputs[0].key).toBe("characters/mei/mei_sheet.01.png");
        const log = await readRunsLog(root, wfKey);
        expect(log).toHaveLength(1);
        expect(log[0].no).toBe(1);
        expect(log[0].inputs).toEqual({
            prompt: "a girl on a rooftop",
            ref: "./mei_ref.01.png",
        });
        expect(log[0].note).toBe("smoke");
        expect(log[0].pluginIds).toEqual(["tongflow-modal-fake"]);
        const body = await readFile(join(root, outputs[0].key), "utf8");
        expect(body).toContain('"texts":["a girl on a rooftop"]');
        // The dir-relative ref was resolved to the absolute file next to the workflow.
        expect(body).toContain(join(root, "characters/mei/mei_ref.01.png"));
        expect(record.readOutput()).toContain(
            "★ outputs: characters/mei/mei_sheet.01.png",
        );
        expect(record.summary.nodes.n1.status).toBe("completed");

        // A second run gets the next number and never overwrites.
        const again = studio.runs.start(project, {
            projectId: id,
            workflowKey: wfKey,
            inputs: { prompt: "again" },
        });
        await again.done;
        expect(again.summary.files.map((f) => f.fileName)).toEqual([
            "mei_sheet.02.png",
        ]);
        expect((await listOutputs(root, wfKey)).map((o) => o.no)).toEqual([
            1, 2,
        ]);
    });

    it("reports failures and unbound inputs", async () => {
        const config = studioConfig({ studioRoot, autoInstallOfficial: false });
        const studio = new TestStudio({ config });
        await studio.init();
        const { id, root } = await createProject(studioRoot, { title: "Demo" });
        await writeWorkflowDocument(root, "workflows/kf.tongflow.json", {
            name: "kf",
            flow: { nodes: [], edges: [] },
            executable: workflow(),
            meta: {},
        });
        const project = await studio.project(id);
        const unbound = studio.runs.start(project, {
            projectId: id,
            workflowKey: "workflows/kf.tongflow.json",
        });
        await unbound.done;
        expect(unbound.summary.status).toBe("failed");
        expect(unbound.error).toMatch(/unbound required inputs: prompt/);

        const failing = studio.runs.start(project, {
            projectId: id,
            workflowKey: "workflows/kf.tongflow.json",
            inputs: { prompt: "FAIL" },
        });
        await failing.done;
        expect(failing.summary.status).toBe("failed");
        expect(failing.error).toContain("boom");
        expect(failing.summary.nodes.n1.status).toBe("failed");
    });
});
