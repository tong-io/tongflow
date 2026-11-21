import "server-only";

import { nanoid } from "nanoid";
import {
    getAbiNodeBySlot,
    isBrowserPlugin,
    logger,
    type NodeSlot,
    TaskStatus,
} from "tongflow";
import {
    EDGE_PLUGIN_PREFIX,
    parseRemoteInvokeRequest,
    type RemoteInvokeErrorBody,
    type RemoteInvokeFrame,
} from "tongflow/engine";
import { jsonStringifyForSse } from "@/lib/json-sse";
import { executePlugin } from "@/lib/plugin-executor/execute";
import { prepareAssetInput } from "@/lib/plugin-executor/prepare-asset-input.server";
import { findMissingRequiredKey } from "@/lib/plugins/missing-env-key";
import { loadPluginEnvDecls } from "@/lib/plugins/plugin-env-manifests.server";
import { getPluginConfig } from "@/lib/plugins/plugins-registry.server";
import { getScope, runWithScope } from "@/lib/runtime/scope.server";
import { loadEnvStore } from "@/lib/settings/env-store.server";
import {
    abortTask,
    onTaskEvent,
    registerTask,
    removeTask,
} from "@/lib/task/emitter";

/**
 * Remote-executor endpoint (`POST /api/engine/invoke`): one `runtime: python`
 * node of a workflow the browser engine (`tongflow/engine`) is running. The
 * prompt arrives materialized (assets as `bytesBase64`); the plugin runs
 * through the same `executePlugin` path as a single-node task, but its output
 * goes back raw (assets still `bytesBase64`) on an SSE stream, so the browser
 * store keeps the files. Nothing is written to the tasks table.
 *
 * Refused before it starts: bad requests, browser plugins, plugins that are
 * not installed, and plugins whose required API key is unset (the same
 * `missing_api_key` preflight as `executeTask`). The self-host access gate
 * (middleware) authenticates the caller; the Next app has no per-run billing
 * confirmation, so `confirmed` is accepted and ignored.
 */

const SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
};

function refuse(status: number, body: RemoteInvokeErrorBody): Response {
    return Response.json(body, { status });
}

export async function remoteInvokeResponse(
    request: Request,
): Promise<Response> {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return refuse(400, {
            error: "invalid JSON body",
            code: "invalid_request",
        });
    }
    const parsed = parseRemoteInvokeRequest(raw);
    if ("error" in parsed) {
        return refuse(400, { error: parsed.error, code: "invalid_request" });
    }
    const { pluginId, nodeSlot, prompt, model, _params } = parsed.request;

    const abiNode = getAbiNodeBySlot(nodeSlot);
    if (!abiNode) {
        return refuse(400, {
            error: `Invalid nodeSlot=${nodeSlot}: not in the ABI.`,
            code: "invalid_request",
        });
    }
    const slot = abiNode.nodeSlot as NodeSlot;
    const cfg = getPluginConfig(pluginId);
    if (
        isBrowserPlugin(cfg) ||
        (!cfg && pluginId.startsWith(EDGE_PLUGIN_PREFIX))
    ) {
        return refuse(400, {
            error: `Plugin ${pluginId} (nodeSlot=${slot}) is a browser plugin and requires the browser edge runtime; the server cannot run it.`,
            code: "browser_plugin",
        });
    }
    if (!cfg) {
        return refuse(400, {
            error: `Plugin not installed: ${pluginId}. Install it from the plugin manager before running this node on the server.`,
            code: "plugin_not_installed",
        });
    }
    if (!cfg.methodsByNodeSlot[slot]) {
        return refuse(400, {
            error: `Plugin ${pluginId} does not implement nodeSlot=${slot}.`,
            code: "invalid_request",
        });
    }
    const stored = await loadEnvStore();
    const missing = findMissingRequiredKey(
        loadPluginEnvDecls(),
        pluginId,
        (key) => Boolean(stored[key]?.trim() || process.env[key]?.trim()),
    );
    if (missing) {
        return refuse(400, {
            error: `${missing.key} is not set — add it in TongFlow Settings.`,
            code: "missing_api_key",
            key: missing.key,
            ...(missing.url ? { url: missing.url } : {}),
        });
    }

    // The run outlives the request context: pin the tenant scope now.
    const scope = await getScope();
    const invocationId = `inv-${nanoid()}`;
    const controller = registerTask(invocationId);
    const encoder = new TextEncoder();
    let closed = false;
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
        start(sink) {
            const send = (frame: RemoteInvokeFrame) => {
                if (closed) return;
                sink.enqueue(
                    encoder.encode(`data: ${jsonStringifyForSse(frame)}\n\n`),
                );
            };
            const heartbeat = setInterval(() => {
                if (!closed) sink.enqueue(encoder.encode(": ping\n\n"));
            }, 10_000);
            // The plugin runner reports progress as task events on this id.
            const off = onTaskEvent(invocationId, (event) => {
                const data = event.data ?? {};
                if (
                    event.status !== TaskStatus.RUNNING ||
                    typeof data.message !== "string" ||
                    data.thinking
                ) {
                    return;
                }
                send({
                    type: "progress",
                    message: data.message,
                    ...(typeof data.percent === "number"
                        ? { percent: data.percent }
                        : {}),
                });
            });
            cleanup = () => {
                clearInterval(heartbeat);
                off();
            };
            const onDisconnect = () => abortTask(invocationId);
            request.signal.addEventListener("abort", onDisconnect, {
                once: true,
            });

            send({ type: "started", invocationId });
            logger.info(
                `[RemoteInvoke] ${invocationId} nodeSlot=${slot} plugin=${pluginId}`,
            );
            runWithScope(scope, async () => {
                const input = await prepareAssetInput(slot, prompt);
                return executePlugin(
                    {
                        pluginId,
                        nodeSlot: slot,
                        ...(model ? { model } : {}),
                        ...(_params ? { params: _params } : {}),
                        input: input as never,
                        taskId: invocationId,
                        signal: controller.signal,
                    },
                    { inlineOutputs: true },
                );
            })
                .then((output) => {
                    send({
                        type: "result",
                        output: output as Record<string, unknown>,
                    });
                })
                .catch((error: unknown) => {
                    if (controller.signal.aborted) {
                        send({
                            type: "error",
                            error: "cancelled",
                            code: "cancelled",
                        });
                        return;
                    }
                    const message =
                        error instanceof Error ? error.message : String(error);
                    logger.error(
                        `[RemoteInvoke] ${invocationId} failed: ${message}`,
                    );
                    send({ type: "error", error: message, code: "failed" });
                })
                .finally(() => {
                    request.signal.removeEventListener("abort", onDisconnect);
                    removeTask(invocationId);
                    cleanup();
                    if (!closed) {
                        closed = true;
                        sink.close();
                    }
                });
        },
        cancel() {
            // The client went away: stop the plugin.
            closed = true;
            cleanup();
            abortTask(invocationId);
        },
    });

    return new Response(stream, { headers: SSE_HEADERS });
}

/** `POST /api/engine/invoke/stop`: abort a running invocation. Idempotent. */
export function stopRemoteInvoke(invocationId: string): {
    status: "cancelled";
    wasRunning: boolean;
} {
    return { status: "cancelled", wasRunning: abortTask(invocationId) };
}
