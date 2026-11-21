/**
 * The edge-plugin worker protocol (version 1): the messages a host (the edge
 * executor) and a plugin's dedicated Web Worker exchange with `postMessage`.
 *
 * ```
 * worker → host  { type: "ready", protocol: 1, methods }            once, on load
 * host → worker  { type: "invoke", id, method, nodeSlot, input, model?, params? }
 * worker → host  { type: "progress", id, message, percent? }        any number
 * worker → host  { type: "model-download", id, loaded, total?, model?, file? }
 * worker → host  { type: "result", id, output }                     exactly one of
 * worker → host  { type: "error", id, message, name? }              these two
 * host → worker  { type: "cancel", id }                             optional
 * ```
 *
 * `id` correlates one invocation; several can be in flight on one worker.
 * `input` is the materialized ABI input (assets are `{bytesBase64, …}`,
 * advanced params already split out into `params`); `output` is the raw ABI
 * output, where ref fields may carry `bytesBase64` for the engine to store.
 * Every payload is plain structured-clone data.
 */

export const EDGE_PROTOCOL_VERSION = 1;

export interface EdgeInvokeMessage {
    type: "invoke";
    id: number;
    method: string;
    nodeSlot: string;
    input: Record<string, unknown>;
    model?: string;
    params?: Record<string, unknown>;
}

export interface EdgeCancelMessage {
    type: "cancel";
    id: number;
}

export type HostToWorkerMessage = EdgeInvokeMessage | EdgeCancelMessage;

export interface EdgeReadyMessage {
    type: "ready";
    protocol: number;
    methods: string[];
}

export interface EdgeProgressMessage {
    type: "progress";
    id: number;
    message: string;
    percent?: number;
}

export interface EdgeModelDownloadMessage {
    type: "model-download";
    id: number;
    loaded: number;
    total?: number;
    model?: string;
    file?: string;
}

export interface EdgeResultMessage {
    type: "result";
    id: number;
    output: unknown;
}

export interface EdgeErrorMessage {
    type: "error";
    id: number;
    message: string;
    name?: string;
}

export type WorkerToHostMessage =
    | EdgeReadyMessage
    | EdgeProgressMessage
    | EdgeModelDownloadMessage
    | EdgeResultMessage
    | EdgeErrorMessage;

/**
 * The slice of `Worker` / `DedicatedWorkerGlobalScope` / `MessagePort` the
 * protocol needs, so tests can run it over a `MessageChannel`.
 */
export interface MessageEndpoint {
    postMessage(message: unknown): void;
    addEventListener(
        type: "message",
        listener: (event: { data: unknown }) => void,
    ): void;
    start?(): void;
}
