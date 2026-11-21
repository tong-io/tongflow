/**
 * The helper an edge plugin's ESM entry uses inside its Web Worker:
 *
 * ```ts
 * import { defineEdgePlugin, edgeMethod } from "tongflow/engine/worker";
 *
 * export default defineEdgePlugin({
 *     methods: {
 *         ocrImage: edgeMethod("ocr-image", async (input, ctx) => {
 *             ctx.progress("recognizing");
 *             return { success: true, text: await ocr(input.image.bytesBase64) };
 *         }),
 *     },
 * });
 * ```
 *
 * Inside a dedicated worker, `defineEdgePlugin` answers the host's protocol
 * messages ({@link serveEdgePlugin}); anywhere else it only returns the
 * definition, which the in-process executor calls directly. Method names are
 * the `method` values of the plugin's `tongflow.plugin.json` slots.
 */

import type {
    Asset,
    NodeSlot,
    SlotInput,
    SlotOutput,
} from "../../core/generated/abi/index";
import {
    EDGE_PROTOCOL_VERSION,
    type EdgeInvokeMessage,
    type MessageEndpoint,
    type WorkerToHostMessage,
} from "./protocol";

/** A ref-typed output value may also be returned as an `Asset`; the engine stores it. */
export type EdgeOutputValue<T> = T extends { file_key: string }
    ? T | Asset
    : T extends readonly (infer U)[]
      ? EdgeOutputValue<U>[]
      : T;

/** What an edge method returns for slot `S`: `SlotOutput<S>` with `bytesBase64` allowed in ref fields. */
export type EdgeSlotOutput<S extends NodeSlot> = {
    [K in keyof SlotOutput<S>]: EdgeOutputValue<SlotOutput<S>[K]>;
};

export interface EdgeModelDownload {
    loaded: number;
    total?: number;
    model?: string;
    file?: string;
}

export interface EdgeMethodContext {
    nodeSlot: string;
    /** The node's chosen model, when set. */
    model?: string;
    /** Advanced params (`TONGFLOW_SLOT_PARAMS`-style); `{}` when none. */
    params: Record<string, unknown>;
    /** Aborted when the run is cancelled; long work should stop. */
    signal: AbortSignal;
    progress(message: string, percent?: number): void;
    /** Report model weights being fetched; hosts show it apart from progress. */
    modelDownload(progress: EdgeModelDownload): void;
}

export type EdgeMethod<S extends NodeSlot = NodeSlot> = (
    input: SlotInput<S>,
    ctx: EdgeMethodContext,
) => EdgeSlotOutput<S> | Promise<EdgeSlotOutput<S>>;

/** Any slot's method, as stored in a definition. */
export type AnyEdgeMethod = (
    input: any,
    ctx: EdgeMethodContext,
) => unknown | Promise<unknown>;

export interface EdgePluginDefinition {
    methods: Record<string, AnyEdgeMethod>;
}

/** Type a method against its slot's generated `SlotInput` / `SlotOutput`. */
export function edgeMethod<S extends NodeSlot>(
    _slot: S,
    fn: EdgeMethod<S>,
): EdgeMethod<S> {
    return fn;
}

export interface EdgeCall {
    method: string;
    nodeSlot: string;
    input: Record<string, unknown>;
    model?: string;
    params?: Record<string, unknown>;
}

/** Call one method of a definition. Shared by the worker and the in-process executor. */
export async function callEdgeMethod(
    definition: EdgePluginDefinition,
    call: EdgeCall,
    ctx: Omit<EdgeMethodContext, "nodeSlot" | "model" | "params">,
): Promise<unknown> {
    const fn = Object.hasOwn(definition.methods, call.method)
        ? definition.methods[call.method]
        : undefined;
    if (typeof fn !== "function") {
        throw new Error(
            `Edge plugin has no method '${call.method}' (nodeSlot=${call.nodeSlot})`,
        );
    }
    return fn(call.input, {
        ...ctx,
        nodeSlot: call.nodeSlot,
        ...(call.model ? { model: call.model } : {}),
        params: call.params ?? {},
    });
}

/** Answer the worker protocol for `definition` on `endpoint` (the worker scope, or a port in tests). */
export function serveEdgePlugin(
    definition: EdgePluginDefinition,
    endpoint: MessageEndpoint,
): void {
    const inflight = new Map<number, AbortController>();
    const post = (msg: WorkerToHostMessage) => endpoint.postMessage(msg);

    const handleInvoke = async (msg: EdgeInvokeMessage) => {
        const ctl = new AbortController();
        inflight.set(msg.id, ctl);
        try {
            const output = await callEdgeMethod(definition, msg, {
                signal: ctl.signal,
                progress: (message, percent) =>
                    post({
                        type: "progress",
                        id: msg.id,
                        message,
                        ...(percent !== undefined ? { percent } : {}),
                    }),
                modelDownload: (p) =>
                    post({ type: "model-download", id: msg.id, ...p }),
            });
            post({ type: "result", id: msg.id, output });
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            post({
                type: "error",
                id: msg.id,
                message: err.message,
                name: err.name,
            });
        } finally {
            inflight.delete(msg.id);
        }
    };

    endpoint.addEventListener("message", (event) => {
        const msg = event.data as { type?: unknown; id?: unknown };
        if (msg?.type === "invoke") {
            void handleInvoke(msg as EdgeInvokeMessage);
        } else if (msg?.type === "cancel" && typeof msg.id === "number") {
            inflight.get(msg.id)?.abort();
        }
    });
    endpoint.start?.();
    post({
        type: "ready",
        protocol: EDGE_PROTOCOL_VERSION,
        methods: Object.keys(definition.methods),
    });
}

/** True inside a dedicated Web Worker. */
function inDedicatedWorker(): boolean {
    const scope = (globalThis as { DedicatedWorkerGlobalScope?: unknown })
        .DedicatedWorkerGlobalScope;
    return typeof scope === "function" && globalThis instanceof scope;
}

/** Declare an edge plugin; serves the worker protocol when loaded in a dedicated worker. */
export function defineEdgePlugin<D extends EdgePluginDefinition>(
    definition: D,
): D {
    if (inDedicatedWorker()) {
        serveEdgePlugin(definition, globalThis as unknown as MessageEndpoint);
    }
    return definition;
}
