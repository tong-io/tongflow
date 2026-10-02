import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioApi } from "../src/api.ts";
import { studioConfig } from "../src/config.ts";
import { serveMcp } from "../src/mcp/server.ts";
import { Studio } from "../src/studio.ts";
import { toJsonSchema } from "../src/tools/spec.ts";

/**
 * The MCP server is the studio's whole surface for a host without a plugin
 * API: what it lists must be standard JSON Schema, a call must reach the tool
 * and come back as content, and a failure must come back as a tool error the
 * model can read rather than a protocol error it cannot.
 */

interface Reply {
    id?: number;
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
}

let root: string;
let input: PassThrough;
let served: Promise<void>;
let rpc: (method: string, params?: unknown) => Promise<Reply>;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tongflow-studio-mcp-"));
    const studio = new Studio({
        config: studioConfig({ studioRoot: root, autoInstallOfficial: false }),
    });
    await studio.init();
    input = new PassThrough();
    const output = new PassThrough();
    served = serveMcp({
        env: { studio, api: new StudioApi(studio) },
        name: "tongflow-studio",
        version: "0.0.0",
        instructions: "rules",
        input,
        output,
    });
    const waiting = new Map<number, (reply: Reply) => void>();
    createInterface({ input: output }).on("line", (line) => {
        const reply = JSON.parse(line) as Reply;
        if (reply.id !== undefined) waiting.get(reply.id)?.(reply);
    });
    let next = 0;
    rpc = (method, params) =>
        new Promise((resolve) => {
            const id = ++next;
            waiting.set(id, resolve);
            input.write(
                `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
            );
        });
});

afterEach(async () => {
    input.end();
    await served;
    await rm(root, { recursive: true, force: true });
});

function text(reply: Reply): string {
    const content = reply.result?.content as { type: string; text: string }[];
    return content[0].text;
}

describe("toJsonSchema", () => {
    it("hoists per-property required flags at every depth", () => {
        expect(
            toJsonSchema({
                workflow: { type: "string", required: true },
                add_nodes: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            alias: { type: "string", required: true },
                            data: {
                                type: "object",
                                additionalProperties: true,
                            },
                        },
                    },
                },
            }),
        ).toEqual({
            type: "object",
            required: ["workflow"],
            properties: {
                workflow: { type: "string" },
                add_nodes: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["alias"],
                        properties: {
                            alias: { type: "string" },
                            data: {
                                type: "object",
                                additionalProperties: true,
                            },
                        },
                    },
                },
            },
        });
    });
});

describe("serveMcp", () => {
    it("answers initialize with the client's protocol version and the instructions", async () => {
        const { result } = await rpc("initialize", {
            protocolVersion: "2024-11-05",
        });
        expect(result).toMatchObject({
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            instructions: "rules",
        });
    });

    it("falls back to its newest protocol version for one it does not know", async () => {
        const { result } = await rpc("initialize", {
            protocolVersion: "1999-01-01",
        });
        expect(result?.protocolVersion).toBe("2025-06-18");
    });

    it("lists every tool with a standard input schema", async () => {
        const { result } = await rpc("tools/list");
        const tools = result?.tools as {
            name: string;
            inputSchema: { type: string; required?: string[] };
        }[];
        expect(tools.map((t) => t.name)).toContain("tongflow_workflow_run");
        const create = tools.find((t) => t.name === "tongflow_project_create");
        expect(create?.inputSchema).toMatchObject({
            type: "object",
            required: ["title"],
        });
    });

    it("runs a tool and remembers the session's project across calls", async () => {
        const created = await rpc("tools/call", {
            name: "tongflow_project_create",
            arguments: { title: "First" },
        });
        expect(JSON.parse(text(created))).toMatchObject({ project: "first" });
        await rpc("tools/call", {
            name: "tongflow_project_create",
            arguments: { title: "Second" },
        });
        // Two projects exist; without the session memory this call would have to name one.
        const status = await rpc("tools/call", {
            name: "tongflow_project_status",
            arguments: {},
        });
        expect(JSON.parse(text(status)).project.id).toBe("second");
    });

    it("returns a tool's failure as a tool error, not a protocol error", async () => {
        const reply = await rpc("tools/call", {
            name: "tongflow_project_status",
            arguments: { project: "missing" },
        });
        expect(reply.error).toBeUndefined();
        expect(reply.result?.isError).toBe(true);
        expect(text(reply)).toMatch(/missing/);
    });

    it("rejects an unknown tool and an unknown method", async () => {
        expect(
            (await rpc("tools/call", { name: "nope", arguments: {} })).error
                ?.code,
        ).toBe(-32602);
        expect((await rpc("resources/list")).error?.code).toBe(-32601);
    });
});
