/**
 * Manual end-to-end check of compose: builds two real workflows, runs the
 * first, composes them, then runs the composition through the real engine and
 * the installed plugins, asserting that stage b consumes stage a's freshly
 * generated image (the composed edge) and that both stages land as
 * `chain_all.01.a.*` / `chain_all.01.b.*`.
 *
 * Excluded from the suite (see vitest.config.ts): it needs the studio venv at
 * `~/.dsh/tongflow`, an installed image plugin and its API key, and it SPENDS
 * MONEY — three paid image calls per run. Run it deliberately:
 *
 *   KEEP_E2E=1 pnpm exec vitest run test/compose-e2e.manual.test.ts
 */
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { StudioApi } from "../src/api.ts";
import { studioConfig } from "../src/config.ts";
import { Studio } from "../src/studio.ts";

const STUDIO_ROOT = join(homedir(), ".dsh", "tongflow");

it("runs a composed workflow end to end", { timeout: 900_000 }, async () => {
    const studio = new Studio({
        config: studioConfig({
            studioRoot: STUDIO_ROOT,
            autoInstallOfficial: false,
        }),
        log: (l) => console.log("[studio]", l.slice(0, 200)),
    });
    await studio.init();
    const api = new StudioApi(studio);

    const { id: pid, root } = await api
        .createProject({ title: "Compose E2E" })
        .then((s) => ({ id: s.id, root: s.root }));
    console.log("project", pid, root);

    // Stage a: text → image
    await api.newWorkflow(pid, "chain/a");
    const pa = await api.patchWorkflow(pid, "chain/a", {
        add_nodes: [
            {
                alias: "t",
                type: "textNode",
                data: {
                    texts: [
                        "a single red maple leaf on a white background, studio light, centered",
                    ],
                },
            },
            { alias: "g", type: "textGenImageNode" },
        ],
        add_edges: [{ from: "t", to: "g" }],
    } as never);
    expect(pa.ok).toBe(true);

    // Run stage a on its own so its output file exists for stage b to reference.
    const runA = await api.startRun({
        projectId: pid,
        workflowKey: "chain/a",
        note: "e2e stage a",
    });
    await runA.done;
    console.log("run a:", runA.summary.status, runA.error ?? "");
    expect(runA.summary.status).toBe("completed");
    const aFile = runA.summary.files[0]?.fileName;
    console.log("a produced", aFile);
    expect(aFile).toMatch(/^a\.01\./);

    // Stage b: a's output + a prompt → edited image
    await api.newWorkflow(pid, "chain/b");
    const pb = await api.patchWorkflow(pid, "chain/b", {
        add_nodes: [
            {
                alias: "img",
                type: "imageNode",
                data: { fileKeys: [`./${aFile}`] },
            },
            {
                alias: "t2",
                type: "textNode",
                data: {
                    texts: ["make the leaf bright blue, keep everything else"],
                },
            },
            { alias: "e", type: "imageGenImageNode" },
        ],
        add_edges: [
            { from: "img", to: "e" },
            { from: "t2", to: "e" },
        ],
    } as never);
    expect(pb.ok).toBe(true);

    // Compose the folder.
    const composed = await api.composeWorkflows(pid, { folder: "chain" });
    console.log("composed:", JSON.stringify(composed));
    expect(composed.key).toBe("chain/chain_all.tongflow.json");
    expect(composed.parts).toEqual([
        "chain/a.tongflow.json",
        "chain/b.tongflow.json",
    ]);
    expect(composed.links).toBe(1);
    expect(composed.unlinked).toEqual([]);

    const doc = await api.readWorkflow(pid, "chain/chain_all");
    expect(doc.exportError).toBeUndefined();
    expect(doc.executable?.executableNodes).toHaveLength(2);
    console.log(
        "composed outputs:",
        doc.executable?.outputs.map(
            (o) => `${o.name}=${doc.meta.outputLabels?.[o.name]}`,
        ),
    );

    // Run the composition: both stages execute, b consuming a's fresh output.
    const runAll = await api.startRun({
        projectId: pid,
        workflowKey: "chain/chain_all",
        note: "e2e composed",
    });
    await runAll.done;
    console.log("run all:", runAll.summary.status, runAll.error ?? "");
    for (const line of runAll.events
        .map((e) => `${e.type} ${e.label ?? e.nodeId ?? ""} ${e.error ?? ""}`)
        .slice(-12))
        console.log("  ", line);
    expect(runAll.summary.status).toBe("completed");

    const names = runAll.summary.files.map((f) => f.fileName).sort();
    console.log("composed run produced:", names);
    expect(names).toHaveLength(2);
    expect(names.some((n) => /^chain_all\.01\.a\./.test(n))).toBe(true);
    expect(names.some((n) => /^chain_all\.01\.b\./.test(n))).toBe(true);

    console.log("dir:", (await readdir(join(root, "chain"))).sort());
    if (!process.env.KEEP_E2E) await rm(root, { recursive: true, force: true });
});
