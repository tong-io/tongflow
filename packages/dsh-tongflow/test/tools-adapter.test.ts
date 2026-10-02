import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ToolEnv } from "tongflow-studio";
import { describe, expect, it } from "vitest";
import { registerTools } from "../src/tools.ts";

/**
 * The tools are written host-neutral in tongflow-studio; this adapter is the
 * only place they meet dsh. Every spec must compile into a dsh tool, and a
 * call must reach the studio with the agent's session and what the mounted
 * services offer — no more: an absent service stays absent so the tool
 * degrades instead of calling into nothing.
 */

function register(services: Record<string, unknown>, api: unknown) {
    const tools = new Map<string, ToolDefinition>();
    const ctx = {
        get: (key: string) => services[key],
        effect: (run: () => void) => run(),
        tools: {
            register: (tool: ToolDefinition) => tools.set(tool.name, tool),
        },
    } as unknown as Context;
    const studio = { paths: { projects: "/studio/projects" } };
    registerTools(ctx, { studio, api } as unknown as ToolEnv);
    return tools;
}

function exec(agentId?: string) {
    return {
        signal: new AbortController().signal,
        agent: agentId
            ? { id: agentId, session: { header: { cwd: "/elsewhere" } } }
            : undefined,
    } as never;
}

describe("registerTools", () => {
    it("registers every studio tool on dsh's registry", () => {
        const tools = register({}, {});
        expect(tools.size).toBe(19);
        expect(tools.get("tongflow_node_catalog")?.output.schema).toEqual({
            type: "string",
        });
        expect(tools.get("tongflow_workflow_run")?.output.schema).toEqual({});
    });

    it("runs a call against the studio and renders its value as text", async () => {
        const tools = register(
            {},
            {
                listProjects: async () => [
                    { id: "one", title: "One", root: "/r/one" },
                ],
            },
        );
        const list = tools.get("tongflow_project_list");
        const value = await list?.execute({}, exec("agent-1"));
        expect(value).toMatchObject({ projects: [{ id: "one" }] });
        expect(list?.output.render({}, value as never)).toEqual([
            { type: "text", text: JSON.stringify(value, null, 2) },
        ]);
    });

    it("starts a background run as a dsh job when the job registry is mounted", async () => {
        const started: unknown[] = [];
        const record = {
            summary: { runId: "run-1", status: "running", files: [] },
            events: [],
            done: new Promise(() => {}),
        };
        const api = {
            listProjects: async () => [{ id: "one" }],
            project: async () => ({}),
            paidPlugins: async () => [],
            startRun: async () => record,
        };
        const jobs = {
            events: {},
            start: (spec: unknown) => {
                started.push(spec);
                return "job-7";
            },
        };
        const withJobs = register({ jobs }, api).get("tongflow_workflow_run");
        expect(
            await withJobs?.execute(
                { workflow: "a/b", run_in_background: true },
                exec("agent-1"),
            ),
        ).toMatchObject({ kind: "background", jobId: "job-7", runId: "run-1" });
        expect(started).toHaveLength(1);

        const without = register({}, api).get("tongflow_workflow_run");
        const polled = (await without?.execute(
            { workflow: "a/b", run_in_background: true },
            exec("agent-1"),
        )) as { jobId?: string; hint: string };
        expect(polled.jobId).toBeUndefined();
        expect(polled.hint).toMatch(/tongflow_run_status/);
    });
});
