/**
 * The studio as an MCP server over stdio: the tongflow_* tools, nothing else.
 *
 * The protocol surface a tools-only server needs is small (initialize, ping,
 * tools/list, tools/call, cancellation, progress), so it is spoken directly:
 * newline-delimited JSON-RPC 2.0, one message per line. stdout carries the
 * protocol and only the protocol; logs go to stderr.
 */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { Logger } from "../studio.ts";
import { allTools } from "../tools/index.ts";
import {
    type Json,
    type ToolCall,
    type ToolSpec,
    toJsonSchema,
} from "../tools/spec.ts";
import { errorMessage, type ToolEnv } from "../tools/support.ts";
import { inlineImage } from "./images.ts";

/** Newest first; a client asking for one of these gets it back, any other gets the newest. */
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type RequestId = string | number;

interface Message {
    jsonrpc?: string;
    id?: RequestId;
    method?: string;
    params?: Record<string, unknown>;
}

type Content =
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string };

export interface McpServerOptions {
    env: ToolEnv;
    /** Server name and version reported at initialize. */
    name: string;
    version: string;
    /** Standing instructions the client puts in front of its model. */
    instructions: string;
    input?: Readable;
    output?: Writable;
    log?: Logger;
}

/** Serve until the input closes. */
export function serveMcp(options: McpServerOptions): Promise<void> {
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    const log = options.log ?? (() => undefined);
    const tools = new Map<string, ToolSpec>(
        allTools(options.env).map((t) => [t.name, t]),
    );
    // One connection is one session: the working project is remembered across its calls.
    const sessionId = `mcp-${randomUUID().slice(0, 8)}`;
    const running = new Map<RequestId, AbortController>();

    const send = (message: Record<string, unknown>) => {
        output.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
    };

    const callTool = async (
        id: RequestId,
        params: Record<string, unknown>,
    ): Promise<{ content: Content[]; isError?: true }> => {
        const spec = tools.get(String(params.name));
        if (!spec) throw new RpcError(INVALID_PARAMS, `unknown tool`);
        const controller = new AbortController();
        running.set(id, controller);
        const images: Content[] = [];
        const meta = params._meta as { progressToken?: RequestId } | undefined;
        const token = meta?.progressToken;
        let progress = 0;
        const call: ToolCall = {
            signal: controller.signal,
            sessionId,
            cwd: process.cwd(),
            showImage: async (image) => {
                images.push(
                    await inlineImage(image, options.env.studio.paths.tmp),
                );
                return {};
            },
            ...(token !== undefined
                ? {
                      progress: (message: string) =>
                          send({
                              method: "notifications/progress",
                              params: {
                                  progressToken: token,
                                  progress: ++progress,
                                  message,
                              },
                          }),
                  }
                : {}),
        };
        try {
            const value = await spec.execute(
                (params.arguments ?? {}) as never,
                call,
            );
            return {
                content: [{ type: "text", text: render(value) }, ...images],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: errorMessage(error) }],
                isError: true,
            };
        } finally {
            running.delete(id);
        }
    };

    const handle = async (message: Message): Promise<void> => {
        const { id, method, params = {} } = message;
        if (method === undefined) return; // a response to something we never asked
        if (id === undefined) {
            if (method === "notifications/cancelled")
                running.get(params.requestId as RequestId)?.abort();
            return;
        }
        try {
            send({ id, result: await answer(id, method, params) });
        } catch (error) {
            send({
                id,
                error: {
                    code: error instanceof RpcError ? error.code : -32603,
                    message: errorMessage(error),
                },
            });
        }
    };

    const answer = async (
        id: RequestId,
        method: string,
        params: Record<string, unknown>,
    ): Promise<unknown> => {
        switch (method) {
            case "initialize": {
                const asked = String(params.protocolVersion);
                return {
                    protocolVersion: PROTOCOL_VERSIONS.includes(asked)
                        ? asked
                        : PROTOCOL_VERSIONS[0],
                    capabilities: { tools: {} },
                    serverInfo: {
                        name: options.name,
                        version: options.version,
                    },
                    instructions: options.instructions,
                };
            }
            case "ping":
                return {};
            case "tools/list":
                return {
                    tools: [...tools.values()].map((t) => ({
                        name: t.name,
                        description: t.description,
                        inputSchema: toJsonSchema(t.parameters),
                    })),
                };
            case "tools/call":
                return callTool(id, params);
            default:
                throw new RpcError(
                    METHOD_NOT_FOUND,
                    `unknown method ${method}`,
                );
        }
    };

    return new Promise((resolve) => {
        const lines = createInterface({ input, crlfDelay: Infinity });
        lines.on("line", (line) => {
            if (!line.trim()) return;
            let message: Message;
            try {
                message = JSON.parse(line) as Message;
            } catch {
                log(`tongflow-studio: dropped a line that is not JSON`);
                return;
            }
            void handle(message);
        });
        lines.on("close", () => {
            for (const controller of running.values()) controller.abort();
            resolve();
        });
    });
}

class RpcError extends Error {
    constructor(
        readonly code: number,
        message: string,
    ) {
        super(message);
    }
}

function render(value: Json): string {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
